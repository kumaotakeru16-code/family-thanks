import { readFileSync, writeFileSync } from 'fs'

const filePath = 'app/page.tsx'
let src = readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n')

function apply(label, oldStr, newStr) {
  if (!src.includes(oldStr)) {
    console.error(`❌ NOT FOUND: ${label}`)
    process.exit(1)
  }
  src = src.replace(oldStr, newStr)
  console.log(`✅ ${label}`)
}

// ── 1. Remove dateSuggestion from FLOW_STEPS (back from dateConfirmed → dashboard) ──
apply(
  'remove dateSuggestion from FLOW_STEPS',
  `const FLOW_STEPS: Step[] = [
  'create',
  'dates',
  'shareLink',
  'dashboard',
  'dateSuggestion',
  'dateConfirmed',
  'organizerConditions',
  'storeSuggestion',
  'finalConfirm',
  'shared',
]`,
  `const FLOW_STEPS: Step[] = [
  'create',
  'dates',
  'shareLink',
  'dashboard',
  'dateConfirmed',
  'organizerConditions',
  'storeSuggestion',
  'finalConfirm',
  'shared',
]`
)

// ── 2. Fix fetchRecommendedStores: use heroDate instead of recommendedDate ─────
apply(
  'fetchRecommendedStores use heroDate',
  `async function fetchRecommendedStores() {
  if (!recommendedDate) {
    alert('先に日程を確定してください')
    return
  }

  setIsLoadingStores(true)
  setStoreFetchError(null)

  try {
    const res = await fetch('/api/store-recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType,
        date: recommendedDate.date.label,`,
  `async function fetchRecommendedStores() {
  if (!heroDate) {
    alert('先に日程を確定してください')
    return
  }

  setIsLoadingStores(true)
  setStoreFetchError(null)

  try {
    const res = await fetch('/api/store-recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType,
        date: heroDate.label,`
)

// ── 3. Fix openSavedEvent: reset decision-related state ───────────────────────
apply(
  'openSavedEvent reset state',
  `async function openSavedEvent(id: string, name: string, type: string) {
  setCreatedEventId(id)
  setEventName(name)
  setEventType(type as EventType)
  try {
    const result = await loadEventData(id)
    setDbDates(result.dates ?? [])
    setDbResponses(result.responses ?? [])
    setStep('dashboard')
  } catch {
    setStep('dashboard')
  }
}`,
  `async function openSavedEvent(id: string, name: string, type: string) {
  setCreatedEventId(id)
  setEventName(name)
  setEventType(type as EventType)
  setHeroBestDateId(null)
  setRecommendedStores([])
  setFinalDecision(null)
  try {
    const result = await loadEventData(id)
    setDbDates(result.dates ?? [])
    setDbResponses(result.responses ?? [])
    setStep('dashboard')
  } catch {
    setStep('dashboard')
  }
}`
)

// ── 4. dateConfirmed: fix back button target (dashboard, not dateSuggestion) ──
apply(
  'dateConfirmed back to dashboard',
  `    <GhostBtn onClick={() => setStep('dateSuggestion')}>← 戻る</GhostBtn>`,
  `    <GhostBtn onClick={() => setStep('dashboard')}>← 戻る</GhostBtn>`
)

// ── 5. dateConfirmed: rename primary CTA to be action-oriented ────────────────
apply(
  'dateConfirmed primary CTA label',
  `    <PrimaryBtn size="large" onClick={() => setStep('organizerConditions')}>
      次へ（店決めへ）
    </PrimaryBtn>`,
  `    <PrimaryBtn size="large" onClick={() => setStep('organizerConditions')}>
      お店を決める
    </PrimaryBtn>`
)

// ── 6. storeSuggestion: fix condition to allow empty recommendedStores (fallback) ──
// The step already works with fallback stores, but the condition gating on
// recommendedStores.length > 0 excludes the case where storePool = MOCK_STORES.
// Allow the step to render as long as storePool has items.
apply(
  'storeSuggestion condition allow fallback',
  `{step === 'storeSuggestion' && recommendedDate && recommendedStores.length > 0 && (`,
  `{step === 'storeSuggestion' && heroDate && storePool.length > 0 && (`
)

// ── 7. dateSuggestion: fix "この日で決定" to use recommendedDate explicitly ────
// (dateSuggestion is now reachable only via setStep call, not FLOW_STEPS back nav)
// Reset heroBestDateId before deciding so heroDate == recommendedDate.date
apply(
  'dateSuggestion decide button reset hero',
  `        <PrimaryBtn size="large" onClick={decideRecommendedDate}>
          この日で決定
        </PrimaryBtn>`,
  `        <PrimaryBtn size="large" onClick={() => {
          setHeroBestDateId(null)
          // after state update, heroDate will equal recommendedDate.date on next render
          // but decideRecommendedDate reads heroDate from closure — use recommendedDate.date.id directly
          const currentEventId = createdEventId || finalEvent?.id
          if (!currentEventId || !recommendedDate) return
          if (totalCount === 0) { alert('まだ回答がありません。参加者の回答を待ってから日程を決めてください。'); return }
          if (recommendedDate.availableCount === 0) { alert('参加できる人がいないため、この状態では日程を確定できません。'); return }
          saveDecision({ eventId: currentEventId, selectedDateId: recommendedDate.date.id, organizerConditions })
            .then(data => { setFinalDecision(data); setStep('dateConfirmed') })
            .catch((e: any) => alert(\`決定保存に失敗しました: \${e?.message ?? 'unknown error'}\`))
        }}>
          この日で決定
        </PrimaryBtn>`
)

// ── 8. Home: polish savedEvents card — add "開く" affordance text ──────────────
apply(
  'savedEvents card open affordance',
  `                      <div className="ml-3 flex shrink-0 items-center gap-2">
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-600 ring-1 ring-amber-200">
                          進行中
                        </span>
                        <span className="text-stone-400">→</span>
                      </div>`,
  `                      <div className="ml-3 flex shrink-0 items-center gap-2">
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-600 ring-1 ring-amber-200">
                          進行中
                        </span>
                        <span className="text-xs font-bold text-stone-400">開く →</span>
                      </div>`
)

writeFileSync(filePath, src, 'utf8')
console.log('\n🎉 patch8 complete')
