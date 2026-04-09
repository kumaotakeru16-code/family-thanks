import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()

const SMALL_AREA_JSON = path.join(ROOT, 'data/hotpepper-small-area.json')
const OUTPUT_JSON = path.join(ROOT, 'data/station-candidate-map.json')

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').trim()
  let parsed = JSON.parse(raw)
  if (typeof parsed === 'string') parsed = JSON.parse(parsed)
  return parsed
}

function extractSmallAreas(json) {
  return json?.results?.small_area || json?.small_area || []
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

function isNoiseName(name) {
  const n = String(name ?? '').trim()
  if (!n) return true

  const ngPatterns = [
    /その他/,
    /中心部/,
    /郊外/,
    /周辺$/,
    /一帯/,
    /通り$/,
    /横丁$/,
    /公園$/,
    /ランド$/,
    /空港$/,
    /温泉$/,
    /ベイサイド/,
    /チャチャタウン/,
    /レインボー/,
  ]

  return ngPatterns.some((re) => re.test(n))
}

/**
 * small_area.name から「代表駅名候補」を複数作る
 */
function extractRepresentativeCandidates(name) {
  const raw = String(name ?? '').trim()
  if (!raw) return []

  const candidates = new Set()

  // 原文そのまま
  candidates.add(normalize(raw))

  // 「〜駅周辺・駅南」→「〜」
  const stationAreaMatch = raw.match(/^(.+?)駅周辺/)
  if (stationAreaMatch) {
    candidates.add(normalize(stationAreaMatch[1]))
  }

  // 「〜駅」→「〜」
  const stationMatch = raw.match(/^(.+?)駅$/)
  if (stationMatch) {
    candidates.add(normalize(stationMatch[1]))
  }

  // 「池袋東口」→「池袋」
  const exitMatch = raw.match(/^(.+?)(東口|西口|南口|北口)$/)
  if (exitMatch) {
    candidates.add(normalize(exitMatch[1]))
  }

  // 「新宿西口」や「東京八重洲」みたいなケースの軽い吸収
  const areaSuffixMatch = raw.match(/^(.+?)(周辺|駅南|駅北|駅前)$/)
  if (areaSuffixMatch) {
    candidates.add(normalize(areaSuffixMatch[1]))
  }

  // 「富士市」→「富士」
  const cityMatch = raw.match(/^(.+?)市$/)
  if (cityMatch) {
    candidates.add(normalize(cityMatch[1]))
  }

  // 「○○・△△」→ 前半も候補化
  if (raw.includes('・')) {
    const first = raw.split('・')[0]
    if (first) candidates.add(normalize(first))
  }

  return [...candidates].filter(Boolean)
}

function buildCandidateMap(smallAreas) {
  /** @type {Record<string, any[]>} */
  const map = {}

  for (const area of smallAreas) {
    const smallAreaName = area?.name ?? ''
    if (!smallAreaName) continue
    if (isNoiseName(smallAreaName)) continue

    const candidates = extractRepresentativeCandidates(smallAreaName)
    if (candidates.length === 0) continue

    const record = {
      smallAreaName,
      smallAreaCode: area?.code ?? '',
      middleAreaCode: area?.middle_area?.code ?? '',
      middleAreaName: area?.middle_area?.name ?? '',
      largeAreaCode: area?.large_area?.code ?? '',
      largeAreaName: area?.large_area?.name ?? '',
      serviceAreaCode: area?.service_area?.code ?? '',
      serviceAreaName: area?.service_area?.name ?? '',
    }

    for (const candidate of candidates) {
      if (!map[candidate]) map[candidate] = []

      const exists = map[candidate].some(
        (x) =>
          x.smallAreaCode === record.smallAreaCode &&
          x.middleAreaCode === record.middleAreaCode
      )

      if (!exists) {
        map[candidate].push(record)
      }
    }
  }

  // 並び順を安定化
  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => {
      const byMiddle = String(a.middleAreaName).localeCompare(String(b.middleAreaName), 'ja')
      if (byMiddle !== 0) return byMiddle
      return String(a.smallAreaName).localeCompare(String(b.smallAreaName), 'ja')
    })
  }

  return map
}

function main() {
  const json = readJson(SMALL_AREA_JSON)
  const smallAreas = extractSmallAreas(json)

  if (!Array.isArray(smallAreas) || smallAreas.length === 0) {
    throw new Error('small_area could not be parsed')
  }

  const map = buildCandidateMap(smallAreas)

  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(map, null, 2), 'utf8')

  console.log(`Generated: ${OUTPUT_JSON}`)
  console.log(`Total representative candidates: ${Object.keys(map).length}`)

  const previewKeys = ['静岡', '富士', '東京', '新宿', '池袋', '博多', '名古屋', '京都']
  for (const key of previewKeys) {
    if (map[key]) {
      console.log(`\n[${key}]`)
      console.table(map[key])
    }
  }
}

main()