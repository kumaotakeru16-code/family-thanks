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

// ── 1. Replace mainGuestId state with mainGuestIds array + add showHeroParticipants + dashboardTab ──
apply(
  'state: mainGuestId → mainGuestIds + add showHeroParticipants + dashboardTab',
  `  const [mainGuestId, setMainGuestId] = useState('p1')`,
  `  const [mainGuestIds, setMainGuestIds] = useState<string[]>([])
  const [showHeroParticipants, setShowHeroParticipants] = useState(false)
  const [dashboardTab, setDashboardTab] = useState<'best' | 'alt'>('best')`
)

// ── 2. Replace selectedTime + showTimeMenu with timeHour + timeMinute ──
apply(
  'state: selectedTime + showTimeMenu → timeHour + timeMinute',
  `  const [selectedTime, setSelectedTime] = useState('19:00')
  const [showTimeMenu, setShowTimeMenu] = useState(false)`,
  `  const [timeHour, setTimeHour] = useState(19)
  const [timeMinute, setTimeMinute] = useState(0)`
)

// ── 3. Add computed selectedTime after timeMinute state ──
apply(
  'add computed selectedTime',
  `  const [heroBestDateId, setHeroBestDateId] = useState<string | null>(null)`,
  `  const [heroBestDateId, setHeroBestDateId] = useState<string | null>(null)
const selectedTime = \`\${timeHour}:\${String(timeMinute).padStart(2, '0')}\``
)

// ── 4. Update recommendedDate useMemo to use mainGuestIds array ──
apply(
  'recommendedDate useMemo: mainGuestIds array bonus',
  `    const mg = activeParticipants.find(p => p.id === mainGuestId)
    const mga = mg?.availability?.[date.id]
    const bonus = mga === 'yes' ? 3 : mga === 'maybe' ? 1 : 0

    return {
      date,
      score: totalScore + bonus,
      availableCount,
      mainGuestAvailability: mga,
    }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored[0] ?? null
}, [activeDates, activeParticipants, mainGuestId])`,
  `    const mgBonuses = mainGuestIds.map(mgId => {
      const mg = activeParticipants.find(p => p.id === mgId)
      const mga = mg?.availability?.[date.id]
      return mga === 'yes' ? 3 : mga === 'maybe' ? 1 : 0
    })
    const bonus = mgBonuses.reduce((s, b) => s + b, 0)

    // summarize main guest availability: 'yes' if all yes, 'maybe' if any maybe, 'no' if any no, undefined if none selected
    const mgAvails = mainGuestIds.map(mgId => {
      const mg = activeParticipants.find(p => p.id === mgId)
      return mg?.availability?.[date.id]
    }).filter(Boolean) as string[]
    const mga: string | undefined = mgAvails.length === 0 ? undefined
      : mgAvails.every(a => a === 'yes') ? 'yes'
      : mgAvails.some(a => a === 'no') ? 'no'
      : 'maybe'

    return {
      date,
      score: totalScore + bonus,
      availableCount,
      mainGuestAvailability: mga,
    }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored[0] ?? null
}, [activeDates, activeParticipants, mainGuestIds])`
)

// ── 5. openSavedEvent: add setMainGuestIds reset ──
apply(
  'openSavedEvent: add setMainGuestIds reset',
  `  setHeroBestDateId(null)
  setRecommendedStores([])
  setFinalDecision(null)`,
  `  setHeroBestDateId(null)
  setRecommendedStores([])
  setFinalDecision(null)
  setMainGuestIds([])
  setShowHeroParticipants(false)
  setDashboardTab('best')`
)

// ── 6. Dashboard: replace entire hero + alt dates section ──
apply(
  'dashboard: hero + alt dates full replacement',
  `    {/* ヒーロー: おすすめ日程 + 参加予定/調整中 + この日で決定 */}
    {heroDate ? (
      <div className="overflow-hidden rounded-3xl bg-stone-900">
        <div className="px-6 py-5">
          <p className="mb-1 text-[10px] font-black uppercase tracking-[0.25em] text-white/40">
            おすすめ日程
          </p>
          <p className="mt-2 text-3xl font-black leading-tight tracking-tight text-white">
            {heroDate.label}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300">
              参加予定 {heroYesCount}人
            </span>
            {heroMaybeCount > 0 && (
              <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-300">
                調整中 {heroMaybeCount}人
              </span>
            )}
          </div>
        </div>
        <div className="px-6 pb-5">
          <button
            type="button"
            onClick={decideRecommendedDate}
            className="w-full rounded-2xl bg-white px-4 py-3.5 text-base font-black text-stone-900 transition hover:bg-stone-100 active:scale-[0.98]"
          >
            この日で決定
          </button>
        </div>
      </div>
    ) : (
      <div className="rounded-2xl bg-stone-50 px-4 py-4 text-sm text-stone-400 ring-1 ring-stone-100">
        まだ回答がありません
      </div>
    )}

    {/* 他の候補: タップでヒーロー切替 */}
    {altDates.length > 0 && (
      <div className="rounded-3xl bg-white px-5 py-5 shadow-sm ring-1 ring-stone-100">
        <p className="mb-3 text-[10px] font-black tracking-[0.2em] text-stone-400 uppercase">他の候補</p>
        <div className="space-y-2">
          {altDates.map(d => {
            const dYes = activeParticipants.filter(p => p.availability?.[d.id] === 'yes').length
            const dMaybe = activeParticipants.filter(p => p.availability?.[d.id] === 'maybe').length
            return (
              <button
                type="button"
                key={d.id}
                onClick={() => setHeroBestDateId(d.id)}
                className="flex w-full items-center justify-between rounded-2xl bg-stone-50 px-4 py-3 ring-1 ring-stone-100 transition hover:bg-stone-100 active:scale-[0.99]"
              >
                <p className="text-sm font-bold text-stone-700">{d.label}</p>
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-bold text-emerald-600">{dYes}人</span>
                  {dMaybe > 0 && <span className="text-amber-500">調整{dMaybe}人</span>}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    )}`,
  `    {/* 空状態 */}
    {totalCount === 0 && (
      <div className="rounded-3xl bg-stone-50 px-5 py-8 text-center ring-1 ring-stone-100">
        <p className="text-base font-black text-stone-400">まだ回答がありません</p>
        <p className="mt-1 text-xs text-stone-400">リンクを送って回答を集めましょう</p>
      </div>
    )}

    {/* ヒーロー: おすすめ日程 */}
    {totalCount > 0 && heroDate && (
      <>
        {/* タブ */}
        {altDates.length > 0 && (
          <div className="flex gap-1 rounded-2xl bg-stone-100 p-1">
            <button
              type="button"
              onClick={() => setDashboardTab('best')}
              className={\`flex-1 rounded-xl py-2 text-xs font-bold transition \${dashboardTab === 'best' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'}\`}
            >
              ベスト
            </button>
            <button
              type="button"
              onClick={() => setDashboardTab('alt')}
              className={\`flex-1 rounded-xl py-2 text-xs font-bold transition \${dashboardTab === 'alt' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'}\`}
            >
              ほかの日程
            </button>
          </div>
        )}

        {dashboardTab === 'best' && (
          <div className="overflow-hidden rounded-3xl bg-stone-900">
            <div className="px-6 py-5">
              <p className="mb-1 text-[10px] font-black uppercase tracking-[0.25em] text-white/40">
                おすすめ日程
              </p>
              <p className="mt-2 text-3xl font-black leading-tight tracking-tight text-white">
                {heroDate.label}
              </p>
              <button
                type="button"
                onClick={() => setShowHeroParticipants(p => !p)}
                className="mt-3 text-xs font-bold text-white/50 underline underline-offset-2 transition hover:text-white/70"
              >
                参加者を見る
              </button>
              {showHeroParticipants && (
                <div className="mt-3 space-y-1">
                  {activeParticipants.filter(p => p.availability?.[heroDate.id] === 'yes').map(p => (
                    <p key={p.id} className="text-xs text-emerald-300">○ {p.name}</p>
                  ))}
                  {activeParticipants.filter(p => p.availability?.[heroDate.id] === 'maybe').map(p => (
                    <p key={p.id} className="text-xs text-amber-300">△ {p.name}</p>
                  ))}
                  {activeParticipants.filter(p => p.availability?.[heroDate.id] === 'no').map(p => (
                    <p key={p.id} className="text-xs text-white/30">× {p.name}</p>
                  ))}
                </div>
              )}
            </div>
            <div className="px-6 pb-5">
              <button
                type="button"
                onClick={decideRecommendedDate}
                className="w-full rounded-2xl bg-white px-4 py-3.5 text-base font-black text-stone-900 transition hover:bg-stone-100 active:scale-[0.98]"
              >
                この日で決定
              </button>
            </div>
          </div>
        )}

        {/* ほかの日程タブ: 最大3件 */}
        {dashboardTab === 'alt' && altDates.length > 0 && (
          <div className="rounded-3xl bg-white px-5 py-5 shadow-sm ring-1 ring-stone-100">
            <div className="space-y-2">
              {altDates.slice(0, 3).map(d => {
                const dYes = activeParticipants.filter(p => p.availability?.[d.id] === 'yes').length
                const dMaybe = activeParticipants.filter(p => p.availability?.[d.id] === 'maybe').length
                return (
                  <button
                    type="button"
                    key={d.id}
                    onClick={() => { setHeroBestDateId(d.id); setDashboardTab('best'); setShowHeroParticipants(false) }}
                    className="flex w-full items-center justify-between rounded-2xl bg-stone-50 px-4 py-3 ring-1 ring-stone-100 transition hover:bg-stone-100 active:scale-[0.99]"
                  >
                    <p className="text-sm font-bold text-stone-700">{d.label}</p>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-bold text-emerald-600">{dYes}人</span>
                      {dMaybe > 0 && <span className="text-amber-500">調整{dMaybe}人</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </>
    )}`
)

// ── 7. Dashboard: main guest selector — multi-select ──
apply(
  'dashboard: main guest multi-select',
  `      <button
              type="button"
              key={p.id}
              onClick={() => setMainGuestId(p.id)}
              className={cx(
                'rounded-full px-4 py-2 text-sm font-bold transition',
                mainGuestId === p.id
                  ? 'bg-stone-900 text-white'
                  : 'bg-white text-stone-500 ring-1 ring-stone-200 hover:bg-stone-50'
              )}
            >
              {p.name}
            </button>`,
  `      <button
              type="button"
              key={p.id}
              onClick={() => setMainGuestIds(prev => prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id])}
              className={cx(
                'rounded-full px-4 py-2 text-sm font-bold transition',
                mainGuestIds.includes(p.id)
                  ? 'bg-stone-900 text-white'
                  : 'bg-white text-stone-500 ring-1 ring-stone-200 hover:bg-stone-50'
              )}
            >
              {p.name}
            </button>`
)

// ── 8. Time picker: replace button list with slider UI ──
apply(
  'time picker: slider UI',
  `                    {/* Time picker */}
                    {!showTimeMenu ? (
                      <button
                        type="button"
                        onClick={() => setShowTimeMenu(true)}
                        className="mt-3 text-xs text-stone-400 underline underline-offset-2"
                      >
                        時間を変更する（任意）· 現在: {selectedTime}
                      </button>
                    ) : (
                      <div className="mt-3 rounded-2xl bg-stone-50 px-4 py-4 ring-1 ring-stone-100">
                        <p className="mb-3 text-xs font-bold text-stone-600">開始時間</p>
                        <div className="flex flex-wrap gap-2">
                          {['18:00', '18:30', '19:00', '19:30', '20:00'].map(t => (
                            <button
                              type="button"
                              key={t}
                              onClick={() => { setSelectedTime(t); setShowTimeMenu(false) }}
                              className={cx(
                                'rounded-xl px-4 py-2 text-sm font-bold ring-1 transition active:scale-95',
                                selectedTime === t
                                  ? 'bg-stone-900 text-white ring-stone-900'
                                  : 'bg-white text-stone-600 ring-stone-200 hover:bg-stone-50'
                              )}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}`,
  `                    {/* Time picker */}
                    <div className="mt-4 rounded-2xl bg-stone-50 px-4 py-4 ring-1 ring-stone-100">
                      <p className="mb-3 text-xs font-bold text-stone-600">開始時間：{selectedTime}</p>
                      <div className="space-y-3">
                        <div>
                          <p className="mb-1.5 text-[11px] text-stone-400">時（17〜23時）</p>
                          <input
                            type="range"
                            min={17}
                            max={23}
                            step={1}
                            value={timeHour}
                            onChange={e => setTimeHour(Number(e.target.value))}
                            className="w-full accent-stone-900"
                          />
                          <div className="mt-1 flex justify-between text-[10px] text-stone-400">
                            {[17,18,19,20,21,22,23].map(h => <span key={h}>{h}</span>)}
                          </div>
                        </div>
                        <div>
                          <p className="mb-1.5 text-[11px] text-stone-400">分</p>
                          <div className="flex gap-2">
                            {[0, 15, 30, 45].map(m => (
                              <button
                                type="button"
                                key={m}
                                onClick={() => setTimeMinute(m)}
                                className={cx(
                                  'flex-1 rounded-xl py-2 text-xs font-bold ring-1 transition active:scale-95',
                                  timeMinute === m
                                    ? 'bg-stone-900 text-white ring-stone-900'
                                    : 'bg-white text-stone-600 ring-stone-200 hover:bg-stone-50'
                                )}
                              >
                                :{String(m).padStart(2, '0')}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>`
)

// ── 9. dateSuggestion: show mainGuest ReasonItem only when mainGuestIds.length > 0 ──
apply(
  'dateSuggestion: conditional mainGuest ReasonItem',
  `<div className="space-y-3 bg-white/[0.06] px-6 py-5">
  <ReasonItem
    icon="◎"
    text={
      recommendedDate.mainGuestAvailability === 'yes'
        ? '主賓が参加できる'
        : recommendedDate.mainGuestAvailability === 'maybe'
        ? '主賓は調整すれば参加可能'
        : '主賓は参加しにくい日程'
    }
    highlight={recommendedDate.mainGuestAvailability === 'yes'}
  />
  <ReasonItem
    icon="人"
    text={\`参加予定 \${yesCount}人\${maybeCount > 0 ? \` / 調整中 \${maybeCount}人\` : ''}\`}
  />
</div>`,
  `<div className="space-y-3 bg-white/[0.06] px-6 py-5">
  {mainGuestIds.length > 0 && recommendedDate.mainGuestAvailability !== undefined && (
    <ReasonItem
      icon="◎"
      text={
        recommendedDate.mainGuestAvailability === 'yes'
          ? '主賓が参加できる'
          : recommendedDate.mainGuestAvailability === 'maybe'
          ? '主賓は調整すれば参加可能'
          : '主賓は参加しにくい日程'
      }
      highlight={recommendedDate.mainGuestAvailability === 'yes'}
    />
  )}
  <ReasonItem
    icon="人"
    text={\`参加予定 \${yesCount}人\${maybeCount > 0 ? \` / 調整中 \${maybeCount}人\` : ''}\`}
  />
</div>`
)

// ── 10. create step: remove CardSub, update title ──
apply(
  'create step: remove CardSub',
  `            <CardTitle>イベントを作成</CardTitle>
            <CardSub>会の種類を選ぶと、お店提案や共有文が自動で調整されます。</CardSub>`,
  `            <CardTitle>イベントを作成</CardTitle>`
)

// ── 11. shareLink step: remove CardSub ──
apply(
  'shareLink step: remove CardSub',
  `            <CardTitle>参加者に送る</CardTitle>
            <CardSub>リンクを送るだけでOKです。</CardSub>`,
  `            <CardTitle>参加者に送る</CardTitle>`
)

// ── 12. dashboard step: update title to "日程を決める" ──
apply(
  'dashboard: update title',
  `      <h2 className="mt-1 text-2xl font-black tracking-tight text-stone-900">回答状況</h2>
      <p className="mt-1 text-sm text-stone-400">今の回答だけで先に決めてOKです。</p>`,
  `      <h2 className="mt-1 text-2xl font-black tracking-tight text-stone-900">日程を決める</h2>`
)

// ── 13. dates step: update subtitle ──
apply(
  'dates step: remove subtitle',
  `              <h2 className="mt-1 text-2xl font-black tracking-tight text-stone-900">候補日を選ぶ</h2>
              <p className="mt-1 text-sm text-stone-400">良さそうな日をタップして選んでください。</p>`,
  `              <h2 className="mt-1 text-2xl font-black tracking-tight text-stone-900">候補日を選ぶ</h2>`
)

writeFileSync(filePath, src, 'utf8')
console.log('\n🎉 patch9 complete')
