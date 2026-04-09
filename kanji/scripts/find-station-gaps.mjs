import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()

const SMALL_AREA_JSON = path.join(ROOT, 'data/hotpepper-small-area.json')
const CANDIDATE_MAP_JSON = path.join(ROOT, 'data/station-candidate-map.json')
const OUTPUT_JSON = path.join(ROOT, 'data/station-gap-report.json')

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

function splitMiddleAreaName(name) {
  const raw = String(name ?? '').trim()
  if (!raw) return []

  return raw
    .split('・')
    .map((s) => normalize(s))
    .filter(Boolean)
}

/**
 * small_area.name から、人が入力しそうな候補をざっくり抽出
 */
function extractExpectedCandidatesFromSmallAreaName(name) {
  const raw = String(name ?? '').trim()
  if (!raw) return []

  const out = new Set()

  out.add(normalize(raw))

  const stationAreaMatch = raw.match(/^(.+?)駅周辺/)
  if (stationAreaMatch) out.add(normalize(stationAreaMatch[1]))

  const stationMatch = raw.match(/^(.+?)駅$/)
  if (stationMatch) out.add(normalize(stationMatch[1]))

  const exitMatch = raw.match(/^(.+?)(東口|西口|南口|北口)$/)
  if (exitMatch) out.add(normalize(exitMatch[1]))

  const cityMatch = raw.match(/^(.+?)市$/)
  if (cityMatch) out.add(normalize(cityMatch[1]))

  if (raw.includes('・')) {
    raw.split('・').forEach((s) => out.add(normalize(s)))
  }

  return [...out].filter(Boolean)
}

function buildMiddleAreaGroups(smallAreas) {
  /** @type {Map<string, any[]>} */
  const map = new Map()

  for (const area of smallAreas) {
    const middleAreaCode = area?.middle_area?.code ?? ''
    const middleAreaName = area?.middle_area?.name ?? ''
    if (!middleAreaCode || !middleAreaName) continue

    if (!map.has(middleAreaCode)) map.set(middleAreaCode, [])
    map.get(middleAreaCode).push({
      smallAreaName: area?.name ?? '',
      smallAreaCode: area?.code ?? '',
      middleAreaCode,
      middleAreaName,
      expectedCandidates: extractExpectedCandidatesFromSmallAreaName(area?.name ?? ''),
    })
  }

  return map
}

function main() {
  const smallJson = readJson(SMALL_AREA_JSON)
  const candidateMap = readJson(CANDIDATE_MAP_JSON)

  const smallAreas = extractSmallAreas(smallJson)
  const middleAreaGroups = buildMiddleAreaGroups(smallAreas)

  /** @type {any[]} */
  const report = []

  for (const [middleAreaCode, items] of middleAreaGroups.entries()) {
    const middleAreaName = items[0]?.middleAreaName ?? ''
    const expectedFromMiddleName = splitMiddleAreaName(middleAreaName)

    if (expectedFromMiddleName.length <= 1) continue

    const matched = []
    const missing = []

    for (const candidate of expectedFromMiddleName) {
      if (candidateMap[candidate] && candidateMap[candidate].length > 0) {
        matched.push(candidate)
      } else {
        missing.push(candidate)
      }
    }

    if (missing.length === 0) continue

    report.push({
      middleAreaCode,
      middleAreaName,
      expectedFromMiddleName,
      matched,
      missing,
      smallAreas: items.map((x) => ({
        smallAreaName: x.smallAreaName,
        smallAreaCode: x.smallAreaCode,
        expectedCandidates: x.expectedCandidates,
      })),
    })
  }

  report.sort((a, b) => a.middleAreaName.localeCompare(b.middleAreaName, 'ja'))

  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(report, null, 2), 'utf8')

  console.log(`Generated: ${OUTPUT_JSON}`)
  console.log(`Potential gap groups: ${report.length}`)

  for (const row of report.slice(0, 20)) {
    console.log('\n---')
    console.log(`${row.middleAreaName} (${row.middleAreaCode})`)
    console.log('matched:', row.matched.join(', ') || '-')
    console.log('missing:', row.missing.join(', ') || '-')
    console.table(row.smallAreas)
  }
}

main()