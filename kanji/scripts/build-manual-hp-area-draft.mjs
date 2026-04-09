import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()

const GAP_REPORT_JSON = path.join(ROOT, 'data/station-gap-report.json')
const OUTPUT_JSON = path.join(ROOT, 'data/manual-hp-area-draft.json')
const OUTPUT_TS = path.join(ROOT, 'data/manual-hp-area-draft.ts')

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').trim()
  let parsed = JSON.parse(raw)
  if (typeof parsed === 'string') parsed = JSON.parse(parsed)
  return parsed
}

function normalize(text) {
  return String(text ?? '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/駅$/, '')
}

function uniq(arr) {
  return [...new Set(arr)]
}

function isNoiseCandidate(name) {
  const n = String(name ?? '').trim()
  if (!n) return true

  const ngPatterns = [
    /その他/,
    /県その他/,
    /市その他/,
    /区その他/,
    /エリア/,
    /市役所/,
    /県南部/,
    /県北部/,
    /周辺$/,
    /一帯/,
    /中心部/,
  ]

  return ngPatterns.some((re) => re.test(n))
}

/**
 * 「missing 候補」と smallArea の距離感から、
 * いちばん近そうな smallArea を1つ選ぶ。
 *
 * かなり保守的にする:
 * - 完全一致っぽい
 * - 先頭一致
 * - 駅を落とした一致
 * のときだけ採用
 */
function pickBestSmallAreaForMissing(missingName, smallAreas) {
  const target = normalize(missingName)

  const scored = smallAreas.map((area) => {
    const smallName = normalize(area.smallAreaName)
    let score = 0

    if (smallName === target) score = 100
    else if (smallName.startsWith(target)) score = 80
    else if (target.startsWith(smallName)) score = 70
    else if (smallName.includes(target)) score = 50
    else score = 0

    // 「京都」←「京都駅」はかなり有力
    if (smallName === `${target}駅`) score = 95

    // 「横須賀中央」←「横須賀」は弱めだが候補にはなる
    if (target.endsWith('中央') && smallName === target.replace(/中央$/, '')) {
      score = Math.max(score, 60)
    }

    // 「武蔵浦和」←「浦和駅」は弱いので自動採用しすぎない
    // ただし review draft には残したい
    if (target.endsWith('浦和') && smallName.includes('浦和')) {
      score = Math.max(score, 40)
    }

    return { area, score }
  })

  scored.sort((a, b) => b.score - a.score)

  if (scored.length === 0) return null
  if (scored[0].score < 50) return null

  return {
    picked: scored[0].area,
    score: scored[0].score,
    alternatives: scored.filter((x) => x.score >= 40).slice(0, 3),
  }
}

function buildDraft(report) {
  const draft = {}
  const review = []

  for (const group of report) {
    const middleAreaCode = group.middleAreaCode
    const middleAreaName = group.middleAreaName
    const smallAreas = Array.isArray(group.smallAreas) ? group.smallAreas : []
    const missing = Array.isArray(group.missing) ? group.missing : []

    for (const missingName of missing) {
      if (isNoiseCandidate(missingName)) continue

      const picked = pickBestSmallAreaForMissing(missingName, smallAreas)

      if (!picked) {
        review.push({
          station: missingName,
          middleAreaCode,
          middleAreaName,
          reason: 'no_confident_match',
          smallAreas,
        })
        continue
      }

      const chosen = picked.picked

      draft[missingName] = {
        middleArea: middleAreaCode,
        smallArea: chosen.smallAreaCode,
        _meta: {
          middleAreaName,
          pickedFrom: chosen.smallAreaName,
          confidenceScore: picked.score,
        },
      }

      review.push({
        station: missingName,
        middleAreaCode,
        middleAreaName,
        pickedSmallAreaName: chosen.smallAreaName,
        pickedSmallAreaCode: chosen.smallAreaCode,
        confidenceScore: picked.score,
        alternatives: picked.alternatives.map((x) => ({
          smallAreaName: x.area.smallAreaName,
          smallAreaCode: x.area.smallAreaCode,
          score: x.score,
        })),
      })
    }
  }

  return { draft, review }
}

function toTsObject(draft) {
  const lines = []
  lines.push(`// AUTO-GENERATED DRAFT. REVIEW BEFORE USE.`)
  lines.push(`const MANUAL_HP_AREA_DRAFT = {`)

  for (const [station, value] of Object.entries(draft).sort((a, b) =>
    a[0].localeCompare(b[0], 'ja')
  )) {
    lines.push(`  ${JSON.stringify(station)}: { middleArea: ${JSON.stringify(value.middleArea)}, smallArea: ${JSON.stringify(value.smallArea)} },`)
  }

  lines.push(`}`)
  lines.push(``)
  lines.push(`export default MANUAL_HP_AREA_DRAFT`)
  lines.push(``)

  return lines.join('\n')
}

function main() {
  const report = readJson(GAP_REPORT_JSON)

  if (!Array.isArray(report)) {
    throw new Error('station-gap-report.json must be an array')
  }

  const { draft, review } = buildDraft(report)

  fs.writeFileSync(OUTPUT_JSON, JSON.stringify({ draft, review }, null, 2), 'utf8')
  fs.writeFileSync(OUTPUT_TS, toTsObject(draft), 'utf8')

  console.log(`Generated: ${OUTPUT_JSON}`)
  console.log(`Generated: ${OUTPUT_TS}`)
  console.log(`Draft count: ${Object.keys(draft).length}`)

  console.table(
    review.slice(0, 30).map((x) => ({
      station: x.station,
      middleAreaName: x.middleAreaName,
      picked: x.pickedSmallAreaName ?? '-',
      score: x.confidenceScore ?? '-',
    }))
  )
}

main()