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

// ── 1. weekdayLabel: add time parameter ──────────────────────────────────────
apply(
  'weekdayLabel time param',
  `function weekdayLabel(d: Date): string {
  const m = d.getMonth() + 1
  const day = d.getDate()
  const dow = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()]
  return \`\${m}/\${day}（\${dow}）\`
}`,
  `function weekdayLabel(d: Date, time = '19:00'): string {
  const m = d.getMonth() + 1
  const day = d.getDate()
  const dow = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()]
  return \`\${m}/\${day}（\${dow}）\${time}\`
}

function getNextWeekMonday(): Date {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dow = today.getDay()
  const daysUntilMonday = dow === 0 ? 1 : 8 - dow
  const monday = new Date(today)
  monday.setDate(today.getDate() + daysUntilMonday)
  return monday
}`
)

// ── 2. Remove calStart / calEnd state declarations ───────────────────────────
apply(
  'remove calStart calEnd states',
  `  const [calStart, setCalStart] = useState<string | null>(null)
  const [calEnd, setCalEnd] = useState<string | null>(null)
  const [calViewMonth, setCalViewMonth] = useState<Date>(new Date())`,
  `  const [calViewMonth, setCalViewMonth] = useState<Date>(new Date())`
)

// ── 3. Add selectedTime / showTimeMenu / heroBestDateId states ───────────────
apply(
  'add selectedTime / showTimeMenu / heroBestDateId states',
  `  const [dateCopied, setDateCopied] = useState(false)
  const [maybeCopied, setMaybeCopied] = useState(false)`,
  `  const [dateCopied, setDateCopied] = useState(false)
  const [maybeCopied, setMaybeCopied] = useState(false)
  const [selectedTime, setSelectedTime] = useState('19:00')
  const [showTimeMenu, setShowTimeMenu] = useState(false)
  const [heroBestDateId, setHeroBestDateId] = useState<string | null>(null)`
)

// ── 4. Update dates useEffect: next week Monday + cutoff ─────────────────────
apply(
  'dates useEffect next-week-monday',
  `useEffect(() => {
  if (step === 'dates' && generatedDates.length === 0) {
    const today = new Date()
    const twoWeeksLater = new Date(today)
    twoWeeksLater.setDate(today.getDate() + 14)
    const weekdays = generateWeekdays(today, twoWeeksLater)
    setGeneratedDates(weekdays)
    setSelectedDateIds(weekdays.map(d => d.id))
  }
}, [step, generatedDates.length])`,
  `useEffect(() => {
  if (step === 'dates' && generatedDates.length === 0) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const cutoff = new Date(today)
    cutoff.setDate(today.getDate() + 3)
    const monday = getNextWeekMonday()
    const twoWeeksEnd = new Date(monday)
    twoWeeksEnd.setDate(monday.getDate() + 13)
    const weekdays = generateWeekdays(monday, twoWeeksEnd).filter(d => {
      const key = d.id.replace('wd-', '')
      return key >= dateKey(cutoff)
    })
    setGeneratedDates(weekdays)
    setSelectedDateIds(weekdays.map(d => d.id))
  }
}, [step, generatedDates.length])

// Update date labels when selectedTime changes
useEffect(() => {
  if (generatedDates.length === 0) return
  setGeneratedDates(prev => prev.map(d => ({
    ...d,
    label: d.label.replace(/\\s*\\d{1,2}:\\d{2}$/, '') + ' ' + selectedTime,
  })))
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [selectedTime])`
)

// ── 5. heroDate / heroYesCount / heroMaybeCount + fix confirmedYes/maybe ─────
apply(
  'add heroDate and fix confirmedYes/maybe',
  `const confirmedYesParticipants = recommendedDate
  ? activeParticipants.filter((p) => p.availability?.[recommendedDate.date.id] === 'yes')
  : []

const maybeParticipants = recommendedDate
  ? activeParticipants.filter((p) => p.availability?.[recommendedDate.date.id] === 'maybe')
  : []

const yesCount = confirmedYesParticipants.length
const maybeCount = maybeParticipants.length
const maybeNames = maybeParticipants.map((p) => p.name)

const altDates = useMemo(
  () => activeDates.filter(d => d.id !== recommendedDate?.date.id).slice(0, 2),
  [activeDates, recommendedDate]
)`,
  `const heroDate = useMemo(() => {
  if (heroBestDateId) {
    const d = activeDates.find(d => d.id === heroBestDateId)
    if (d) return d
  }
  return recommendedDate?.date ?? null
}, [heroBestDateId, activeDates, recommendedDate])

const heroYesCount = heroDate
  ? activeParticipants.filter(p => p.availability?.[heroDate.id] === 'yes').length
  : 0

const heroMaybeCount = heroDate
  ? activeParticipants.filter(p => p.availability?.[heroDate.id] === 'maybe').length
  : 0

const confirmedYesParticipants = heroDate
  ? activeParticipants.filter((p) => p.availability?.[heroDate.id] === 'yes')
  : []

const maybeParticipants = heroDate
  ? activeParticipants.filter((p) => p.availability?.[heroDate.id] === 'maybe')
  : []

const yesCount = confirmedYesParticipants.length
const maybeCount = maybeParticipants.length
const maybeNames = maybeParticipants.map((p) => p.name)

const altDates = useMemo(
  () => activeDates.filter(d => d.id !== heroDate?.id),
  [activeDates, heroDate]
)`
)

// ── 6. Fix dateConfirmedShareText and maybeConfirmText to use heroDate ────────
apply(
  'dateConfirmedShareText use heroDate',
  `const dateConfirmedShareText =
  recommendedDate
    ? \`日程はこちらに決まりました！\\nお店の詳細は追って連絡します。\\n\\n日程：\${recommendedDate.date.label}\``,
  `const dateConfirmedShareText =
  heroDate
    ? \`日程はこちらに決まりました！\\nお店の詳細は追って連絡します。\\n\\n日程：\${heroDate.label}\``
)

apply(
  'maybeConfirmText use heroDate',
  `const maybeConfirmText =
  recommendedDate && maybeNames.length > 0
    ? \`\${maybeNames.join('、')} さん\\n\\nこの日で進めようと思っています！\\nまだ未確定でしたら参加可否を教えてください🙏\\n\\n日程：\${recommendedDate.date.label}\`
    : ''`,
  `const maybeConfirmText =
  heroDate && maybeNames.length > 0
    ? \`\${maybeNames.join('、')} さん\\n\\nこの日で進めようと思っています！\\nまだ未確定でしたら参加可否を教えてください🙏\\n\\n日程：\${heroDate.label}\`
    : ''`
)

// ── 7. decideRecommendedDate: use heroDate ────────────────────────────────────
apply(
  'decideRecommendedDate use heroDate',
  `async function decideRecommendedDate() {
  if (!recommendedDate) return

  const currentEventId = createdEventId || finalEvent?.id
  if (!currentEventId) {
    alert('event_id が見つかりません')
    return
  }

  if (totalCount === 0) {
    alert('まだ回答がありません。参加者の回答を待ってから日程を決めてください。')
    return
  }

  if (recommendedDate.availableCount === 0) {
    alert('参加できる人がいないため、この状態では日程を確定できません。')
    return
  }

  try {
const data = await saveDecision({
  eventId: currentEventId,
  selectedDateId: recommendedDate.date.id,`,
  `async function decideRecommendedDate() {
  if (!heroDate) return

  const currentEventId = createdEventId || finalEvent?.id
  if (!currentEventId) {
    alert('event_id が見つかりません')
    return
  }

  if (totalCount === 0) {
    alert('まだ回答がありません。参加者の回答を待ってから日程を決めてください。')
    return
  }

  if (heroYesCount === 0) {
    alert('参加できる人がいないため、この状態では日程を確定できません。')
    return
  }

  try {
const data = await saveDecision({
  eventId: currentEventId,
  selectedDateId: heroDate.id,`
)

// ── 8. Dates step: add time picker UI (inside chip panel, after count line) ───
apply(
  'add time picker UI in dates step',
  `                    {generatedDates.length > 0 && (
                      <p className="mt-4 text-[11px] text-stone-400">
                        {selectedDateIds.length}件 選択中
                        <button
                          type="button"
                          onClick={() =>
                            selectedDateIds.length === generatedDates.length
                              ? setSelectedDateIds([])
                              : setSelectedDateIds(generatedDates.map(d => d.id))
                          }
                          className="ml-3 font-bold text-stone-500 underline underline-offset-2"
                        >
                          {selectedDateIds.length === generatedDates.length ? 'すべて外す' : 'すべて選ぶ'}
                        </button>
                      </p>
                    )}`,
  `                    {generatedDates.length > 0 && (
                      <p className="mt-4 text-[11px] text-stone-400">
                        {selectedDateIds.length}件 選択中
                        <button
                          type="button"
                          onClick={() =>
                            selectedDateIds.length === generatedDates.length
                              ? setSelectedDateIds([])
                              : setSelectedDateIds(generatedDates.map(d => d.id))
                          }
                          className="ml-3 font-bold text-stone-500 underline underline-offset-2"
                        >
                          {selectedDateIds.length === generatedDates.length ? 'すべて外す' : 'すべて選ぶ'}
                        </button>
                      </p>
                    )}

                    {/* Time picker */}
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
                    )}`
)

// ── 9. Replace CalendarPicker usage in dates step (old range → single-tap) ───
apply(
  'replace CalendarPicker usage single-tap',
  `            {/* Calendar range picker */}
            {showCalendar && (
              <CalendarPicker
                viewMonth={calViewMonth}
                onChangeMonth={setCalViewMonth}
                calStart={calStart}
                calEnd={calEnd}
                onDayClick={(key) => {
                  if (!calStart || (calStart && calEnd)) {
                    setCalStart(key)
                    setCalEnd(null)
                  } else {
                    if (key < calStart) {
                      setCalEnd(calStart)
                      setCalStart(key)
                    } else {
                      setCalEnd(key)
                    }
                  }
                }}
                onExtract={() => {
                  if (!calStart || !calEnd) return
                  const weekdays = generateWeekdays(new Date(calStart), new Date(calEnd))
                  setGeneratedDates(weekdays)
                  setSelectedDateIds(weekdays.map(d => d.id))
                  setShowCalendar(false)
                  setCalStart(null)
                  setCalEnd(null)
                }}
                onCancel={() => {
                  setShowCalendar(false)
                  setCalStart(null)
                  setCalEnd(null)
                }}
              />
            )}`,
  `            {/* Calendar single-tap picker */}
            {showCalendar && (
              <CalendarPicker
                viewMonth={calViewMonth}
                onChangeMonth={setCalViewMonth}
                selectedIds={selectedDateIds}
                disabledBefore={(() => {
                  const t = new Date(); t.setHours(0,0,0,0)
                  const c = new Date(t); c.setDate(t.getDate() + 3)
                  return dateKey(c)
                })()}
                onDayClick={(key) => {
                  const id = \`wd-\${key}\`
                  const existing = generatedDates.find(d => d.id === id)
                  if (existing) {
                    setSelectedDateIds(prev =>
                      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
                    )
                  } else {
                    const [y, mo, dy] = key.split('-').map(Number)
                    const d = new Date(y, mo - 1, dy)
                    const newDate = { id, label: weekdayLabel(d, selectedTime) }
                    setGeneratedDates(prev =>
                      [...prev, newDate].sort((a, b) => a.id < b.id ? -1 : 1)
                    )
                    setSelectedDateIds(prev => [...prev, id])
                  }
                }}
                onClose={() => setShowCalendar(false)}
              />
            )}`
)

// ── 10. Update "別の日程を選ぶ" button (remove calViewMonth reset) ─────────────
apply(
  'calendar open button',
  `              onClick={() => {
                  setShowCalendar(true)
                  setCalViewMonth(new Date())
                }}`,
  `              onClick={() => {
                  setShowCalendar(true)
                  const monday = getNextWeekMonday()
                  setCalViewMonth(monday)
                }}`
)

// ── 11. Dashboard: replace old hero/stats with new hero + alt dates ───────────
apply(
  'dashboard step new hero UI',
  `    <button
      type="button"
      onClick={() => setStep('dateSuggestion')}
      className="w-full rounded-3xl bg-stone-900 px-6 py-5 text-center transition hover:bg-stone-800 active:scale-[0.98]"
    >
      <p className="text-base font-black text-white">日程の提案を見る</p>
      <p className="mt-0.5 text-sm font-normal text-white/50">今の回答で最善の日程を表示します</p>
    </button>

<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
  <StatBox label="回答済み" value={\`\${answerCount}人\`} />
  <StatBox label="参加予定" value={\`\${yesCount}人\`} />
  <StatBox label="調整中" value={\`\${maybeCount}人\`} soft />
</div>

{recommendedDate && (
  <div className="mt-3 rounded-2xl bg-emerald-50 px-4 py-4 ring-1 ring-emerald-100">
    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">
      BEST DATE
    </p>
    <p className="mt-2 text-lg font-black text-stone-900">
      {recommendedDate.date.label}
    </p>
    <div className="mt-2 flex flex-wrap gap-2">
      <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-emerald-700">
        参加予定 {yesCount}人
      </span>
      {maybeCount > 0 && (
        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-amber-700">
          調整中 {maybeCount}人
        </span>
      )}
    </div>
  </div>
)}`,
  `    {/* 外側表示: 回答済み〇人 のみ */}
    <p className="px-1 text-sm text-stone-500">
      回答済み <span className="font-black text-stone-900">{answerCount}人</span>
    </p>

    {/* ヒーロー: おすすめ日程 + 参加予定/調整中 + この日で決定 */}
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
    )}`
)

// ── 12. dateConfirmed step: use heroDate ──────────────────────────────────────
apply(
  'dateConfirmed condition + label use heroDate',
  `{step === 'dateConfirmed' && recommendedDate && (`,
  `{step === 'dateConfirmed' && heroDate && (`
)

apply(
  'dateConfirmed hero label',
  `        <p className="text-3xl font-black leading-tight tracking-tight text-white">
          {recommendedDate.date.label}
        </p>`,
  `        <p className="text-3xl font-black leading-tight tracking-tight text-white">
          {heroDate.label}
        </p>`
)

// ── 13. dateSuggestion altDates (they now come from altDates based on heroDate)
// -- altDates in dateSuggestion was already using altDates variable, which is fine.
// Just make the altDates in dateSuggestion show stats too.
apply(
  'dateSuggestion altDates rows with stats',
  `    {altDates.length > 0 && (
      <div className="rounded-2xl bg-white px-5 py-4 ring-1 ring-stone-100 shadow-sm">
        <p className="mb-3 text-[10px] font-black tracking-[0.2em] text-stone-400 uppercase">他の候補</p>
        <div className="space-y-2">
          {altDates.map((d) => (
            <div key={d.id} className="rounded-2xl bg-stone-50 px-4 py-3 text-sm text-stone-500 ring-1 ring-stone-100">
              {d.label}
            </div>
          ))}
        </div>
      </div>
    )}`,
  `    {altDates.length > 0 && (
      <div className="rounded-2xl bg-white px-5 py-4 ring-1 ring-stone-100 shadow-sm">
        <p className="mb-3 text-[10px] font-black tracking-[0.2em] text-stone-400 uppercase">他の候補</p>
        <div className="space-y-2">
          {altDates.map((d) => {
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
    )}`
)

// ── 14. Replace CalendarPicker component (new single-tap API) ────────────────
apply(
  'replace CalendarPicker component',
  `function CalendarPicker({
  viewMonth,
  onChangeMonth,
  calStart,
  calEnd,
  onDayClick,
  onExtract,
  onCancel,
}: {
  viewMonth: Date
  onChangeMonth: (d: Date) => void
  calStart: string | null
  calEnd: string | null
  onDayClick: (key: string) => void
  onExtract: () => void
  onCancel: () => void
}) {
  const year = viewMonth.getFullYear()
  const month = viewMonth.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const leadingEmpties = firstDay.getDay()
  const totalDays = lastDay.getDate()

  const cells: (Date | null)[] = [
    ...Array<null>(leadingEmpties).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => new Date(year, month, i + 1)),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  function dk(d: Date): string {
    return \`\${d.getFullYear()}-\${String(d.getMonth() + 1).padStart(2, '0')}-\${String(d.getDate()).padStart(2, '0')}\`
  }

  function isInRange(d: Date) {
    if (!calStart || !calEnd) return false
    const k = dk(d)
    return k > calStart && k < calEnd
  }

  const canExtract = !!calStart && !!calEnd

  return (
    <div className="rounded-3xl bg-white px-5 py-5 shadow-sm ring-1 ring-stone-100">
      {/* Month nav */}
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onChangeMonth(new Date(year, month - 1, 1))}
          className="rounded-xl p-2 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
        >
          ←
        </button>
        <p className="text-sm font-black text-stone-900">
          {year}年{month + 1}月
        </p>
        <button
          type="button"
          onClick={() => onChangeMonth(new Date(year, month + 1, 1))}
          className="rounded-xl p-2 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
        >
          →
        </button>
      </div>

      {/* Day-of-week header */}
      <div className="mb-1 grid grid-cols-7">
        {['日', '月', '火', '水', '木', '金', '土'].map(d => (
          <div key={d} className="py-1 text-center text-[11px] font-bold text-stone-300">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, i) => {
          if (!day) return <div key={\`e-\${i}\`} />
          const isWeekend = day.getDay() === 0 || day.getDay() === 6
          const k = dk(day)
          const isStart = k === calStart
          const isEnd = k === calEnd
          const inRange = isInRange(day)
          return (
            <button
              type="button"
              key={k}
              onClick={() => onDayClick(k)}
              className={cx(
                'h-9 w-full rounded-xl text-sm font-semibold transition',
                isStart || isEnd
                  ? 'bg-stone-900 text-white'
                  : inRange
                  ? 'bg-stone-100 text-stone-700'
                  : isWeekend
                  ? 'text-stone-300'
                  : 'text-stone-600 hover:bg-stone-50'
              )}
            >
              {day.getDate()}
            </button>
          )
        })}
      </div>

      {/* State hint */}
      <p className="mt-4 text-xs text-stone-400">
        {!calStart
          ? '開始日をタップしてください'
          : !calEnd
          ? '終了日をタップしてください'
          : \`\${calStart} 〜 \${calEnd}\`}
      </p>

      {/* Actions */}
      <div className="mt-4 space-y-2">
        <PrimaryBtn disabled={!canExtract} onClick={onExtract}>
          この範囲の平日を抽出する
        </PrimaryBtn>
        <GhostBtn onClick={onCancel}>キャンセル</GhostBtn>
      </div>
    </div>
  )
}`,
  `function CalendarPicker({
  viewMonth,
  onChangeMonth,
  selectedIds,
  disabledBefore,
  onDayClick,
  onClose,
}: {
  viewMonth: Date
  onChangeMonth: (d: Date) => void
  selectedIds: string[]
  disabledBefore: string
  onDayClick: (key: string) => void
  onClose: () => void
}) {
  const year = viewMonth.getFullYear()
  const month = viewMonth.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const leadingEmpties = firstDay.getDay()
  const totalDays = lastDay.getDate()

  const cells: (Date | null)[] = [
    ...Array<null>(leadingEmpties).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => new Date(year, month, i + 1)),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  function dk(d: Date): string {
    return \`\${d.getFullYear()}-\${String(d.getMonth() + 1).padStart(2, '0')}-\${String(d.getDate()).padStart(2, '0')}\`
  }

  return (
    <div className="rounded-3xl bg-white px-5 py-5 shadow-sm ring-1 ring-stone-100">
      {/* Month nav */}
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onChangeMonth(new Date(year, month - 1, 1))}
          className="rounded-xl p-2 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
        >
          ←
        </button>
        <p className="text-sm font-black text-stone-900">
          {year}年{month + 1}月
        </p>
        <button
          type="button"
          onClick={() => onChangeMonth(new Date(year, month + 1, 1))}
          className="rounded-xl p-2 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
        >
          →
        </button>
      </div>

      {/* Day-of-week header */}
      <div className="mb-1 grid grid-cols-7">
        {['日', '月', '火', '水', '木', '金', '土'].map(d => (
          <div key={d} className="py-1 text-center text-[11px] font-bold text-stone-300">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, i) => {
          if (!day) return <div key={\`e-\${i}\`} />
          const k = dk(day)
          const isWeekend = day.getDay() === 0 || day.getDay() === 6
          const isDisabled = isWeekend || k < disabledBefore
          const isSelected = selectedIds.includes(\`wd-\${k}\`)
          return (
            <button
              type="button"
              key={k}
              disabled={isDisabled}
              onClick={() => !isDisabled && onDayClick(k)}
              className={cx(
                'h-9 w-full rounded-xl text-sm font-semibold transition',
                isDisabled
                  ? 'cursor-not-allowed text-stone-200'
                  : isSelected
                  ? 'bg-stone-900 text-white'
                  : 'text-stone-600 hover:bg-stone-50'
              )}
            >
              {day.getDate()}
            </button>
          )
        })}
      </div>

      {/* Hint */}
      <p className="mt-3 text-xs text-stone-400">平日をタップして追加・解除できます</p>

      {/* Close */}
      <div className="mt-4">
        <GhostBtn onClick={onClose}>閉じる</GhostBtn>
      </div>
    </div>
  )
}`
)

writeFileSync(filePath, src, 'utf8')
console.log('\n🎉 patch7 complete')
