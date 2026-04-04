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

// ── 1. Dashboard hero toggle bug fix: setShowFinalParticipants → setShowHeroParticipants ──
apply(
  'dashboard hero toggle bug fix',
  `<button
  type="button"
  onClick={() => setShowFinalParticipants((v) => !v)}
  className="mt-3 text-xs font-bold text-white/70 underline"
>
  {showFinalParticipants ? '参加者を閉じる' : '参加者を見る'}
</button>

            {showHeroParticipants && (`,
  `<button
  type="button"
  onClick={() => setShowHeroParticipants((v) => !v)}
  className="mt-3 text-xs font-bold text-white/70 underline"
>
  {showHeroParticipants ? '参加者を閉じる' : '参加者を見る'}
</button>

            {showHeroParticipants && (`
)

// ── 2. Delete redundant mainGuestIds display card ─────────────────────────────
apply(
  'delete mainGuestIds display card',
  `
        {mainGuestIds.length > 0 && (
          <div className="rounded-3xl bg-white px-5 py-5 shadow-sm ring-1 ring-stone-100">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-stone-400">
              主賓
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {mainGuestIds.map((id) => {
                const guest = activeParticipants.find((p) => p.id === id)
                if (!guest) return null

                const status = heroDate ? guest.availability?.[heroDate.id] : undefined
                const tone =
                  status === 'yes'
                    ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
                    : status === 'maybe'
                    ? 'bg-amber-50 text-amber-700 ring-amber-100'
                    : 'bg-stone-100 text-stone-500 ring-stone-200'

                return (
                  <span
                    key={id}
                    className={\`rounded-full px-3 py-1 text-xs font-bold ring-1 \${tone}\`}
                  >
                    {guest.name}
                  </span>
                )
              })}
            </div>
          </div>
        )}`,
  ``
)

// ── 3. Insert 優先したい人 block BEFORE the dark hero card ────────────────────
apply(
  'insert 優先したい人 before hero card',
  `      <>
        <div className="overflow-hidden rounded-3xl bg-stone-900">`,
  `      <>
        <div className="rounded-3xl bg-white px-5 py-5 shadow-sm ring-1 ring-stone-100">
  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-stone-400">
    優先したい人（任意）
  </p>

  <div className="mt-3 flex flex-wrap gap-2">
    {activeParticipants.map((participant) => {
      const selected = mainGuestIds.includes(participant.id)

      return (
        <button
          key={participant.id}
          type="button"
          onClick={() =>
            setMainGuestIds((prev) =>
              prev.includes(participant.id)
                ? prev.filter((id) => id !== participant.id)
                : [...prev, participant.id]
            )
          }
          className={\`rounded-full px-4 py-2 text-sm font-bold ring-1 transition \${
            selected
              ? 'bg-stone-900 text-white ring-stone-900'
              : 'bg-white text-stone-600 ring-stone-200 hover:bg-stone-50'
          }\`}
        >
          {participant.name}
        </button>
      )
    })}
  </div>

  {mainGuestIds.length > 0 && (
    <p className="mt-4 text-xs font-bold text-stone-500">
      選択中：
      <span className="ml-1 text-stone-800">
        {activeParticipants
          .filter((participant) => mainGuestIds.includes(participant.id))
          .map((participant) => participant.name)
          .join('、')}
      </span>
    </p>
  )}
</div>

        <div className="overflow-hidden rounded-3xl bg-stone-900">`
)

// ── 4. Remove 優先したい人 from its OLD position (end of <> block) ────────────
apply(
  'remove 優先したい人 from old position',
  `<div className="rounded-3xl bg-white px-5 py-5 shadow-sm ring-1 ring-stone-100">
  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-stone-400">
    優先したい人（任意）
  </p>

  <div className="mt-3 flex flex-wrap gap-2">
    {activeParticipants.map((participant) => {
      const selected = mainGuestIds.includes(participant.id)

      return (
        <button
          key={participant.id}
          type="button"
          onClick={() =>
            setMainGuestIds((prev) =>
              prev.includes(participant.id)
                ? prev.filter((id) => id !== participant.id)
                : [...prev, participant.id]
            )
          }
          className={\`rounded-full px-4 py-2 text-sm font-bold ring-1 transition \${
            selected
              ? 'bg-stone-900 text-white ring-stone-900'
              : 'bg-white text-stone-600 ring-stone-200 hover:bg-stone-50'
          }\`}
        >
          {participant.name}
        </button>
      )
    })}
  </div>

  {mainGuestIds.length > 0 && (
    <p className="mt-4 text-xs font-bold text-stone-500">
      選択中：
      <span className="ml-1 text-stone-800">
        {activeParticipants
          .filter((participant) => mainGuestIds.includes(participant.id))
          .map((participant) => participant.name)
          .join('、')}
      </span>
    </p>
  )}
</div>
</>
)}`,
  `</>
)}`
)

// ── 5. dateConfirmed: fix chip-green/chip-amber + use heroYesParticipants ─────
apply(
  'dateConfirmed chip-green fix',
  `        {finalYesParticipants.map(p => (
          <span key={p.id} className="chip-green">{p.name}</span>
        ))}`,
  `        {heroYesParticipants.map(p => (
          <span key={p.id} className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-300 ring-1 ring-emerald-400/20">{p.name}</span>
        ))}`
)

apply(
  'dateConfirmed chip-amber fix',
  `        {finalMaybeParticipants.map(p => (
          <span key={p.id} className="chip-amber">{p.name}</span>
        ))}`,
  `        {heroMaybeParticipants.map(p => (
          <span key={p.id} className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-300 ring-1 ring-amber-400/20">{p.name}</span>
        ))}`
)

// ── 6. organizerConditions: title fix ────────────────────────────────────────
apply(
  'organizerConditions title fix',
  `      <h2 className="mt-1 text-2xl font-black tracking-tight text-stone-900">条件を設定</h2>`,
  `      <h2 className="mt-1 text-2xl font-black tracking-tight text-stone-900">条件を設定する</h2>`
)

// ── 7. organizerConditions: participantMajority empty state text ──────────────
apply(
  'organizerConditions empty majority text',
  `                    <p className="text-sm text-stone-400">まだ希望が集まっていません</p>`,
  `                    <p className="text-sm text-stone-400">参加者の希望が特にありません</p>`
)

// ── 8. organizerConditions: reorder sections エリア→価格帯→個室→こだわり ────────
// Replace the entire space-y-5 content block
apply(
  'organizerConditions reorder + fix orphan + remove AREA_OPTIONS',
  `              <div className="space-y-5">

                {/* 価格帯: チップ（主） + プルダウン（副） */}
               <div>
  <p className="mb-2 text-xs font-bold text-stone-700">価格帯</p>
  <select
    value={orgPrefs.priceRange}
    onChange={(e) =>
      setOrgPrefs((p) => ({
        ...p,
        priceRange: e.target.value,
      }))
    }
    className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-bold text-stone-700 outline-none transition focus:border-stone-400"
  >
    {[
  '〜3,000円',
  '〜4,000円',
  '〜5,000円',
  '〜6,000円',
  '〜7,000円',
  '〜8,000円',
  '指定なし',
].map((price) => (
      <option key={price} value={price}>
        {price}
      </option>
    ))}
  </select>
</div>

                {/* 個室 */}
                <div>
                  <p className="mb-2 text-xs font-bold text-stone-700">個室</p>
                  <div className="flex flex-wrap gap-2">
                    {['必要', 'どちらでも', '不要'].map(v => (
                      <Chip key={v} active={orgPrefs.privateRoom === v}
                        onClick={() => setOrgPrefs(p => ({ ...p, privateRoom: p.privateRoom === v ? '' : v }))}>
                        {v}
                      </Chip>
                    ))}
                  </div>
                </div>

                {/* エリア: テキスト入力 + サジェスト */}
                <div>
                  <p className="mb-2 text-xs font-bold text-stone-700">エリア（駅・地名）</p>
                  <input
                    type="text"
                    value={areaInput}
                    onChange={e => setAreaInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && areaInput.trim()) {
                        const v = areaInput.trim()
                        setOrgPrefs(p => ({ ...p, areas: p.areas.includes(v) ? p.areas : [...p.areas, v] }))
                        setAreaInput('')
                      }
                    }}
                    placeholder="駅名・地名を入力 → Enter"
                    className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-300 focus:bg-white"
                  />
<div className="mt-2 flex flex-wrap gap-2">
  {AREA_OPTIONS.map((area) => {
    const selected = orgPrefs.areas.includes(area)

    return (
      <button
        key={area}
        type="button"
        onClick={() =>
          setOrgPrefs((p) => ({
            ...p,
            areas: p.areas.includes(area)
              ? p.areas.filter((a) => a !== area)
              : [...p.areas, area],
          }))
        }
        className={\`rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition \${
          selected
            ? 'bg-stone-900 text-white ring-stone-900'
            : 'bg-stone-50 text-stone-600 ring-stone-200 hover:bg-stone-100'
        }\`}
      >
        {area}
      </button>
    )
  })}
</div>
                  {orgPrefs.areas.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {orgPrefs.areas.map(v => (
                        <button
                          type="button"
                          key={v}
                          onClick={() => setOrgPrefs(p => ({ ...p, areas: p.areas.filter(x => x !== v) }))}
                          className="rounded-full bg-stone-900 px-3 py-1 text-xs font-bold text-white transition hover:bg-stone-700 active:scale-95"
                        >
                          {v} ×
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* こだわり条件: 折りたたみ */}
                <div>

                    <div className="mt-4 space-y-4">
                      <div>
                        <p className="mb-2 text-xs font-bold text-stone-700">ジャンル</p>
                        <div className="flex flex-wrap gap-2">
                          {GENRE_OPTIONS.map(v => (
                            <Chip key={v} active={orgPrefs.genres.includes(v)}
                              onClick={() => setOrgPrefs(p => ({ ...p, genres: p.genres.includes(v) ? p.genres.filter(x => x !== v) : [...p.genres, v] }))}>
                              {v}
                            </Chip>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="mb-2 text-xs font-bold text-stone-700">雰囲気</p>
                        <div className="flex flex-wrap gap-2">
                          {['落ち着き', 'にぎやか', 'おしゃれ', 'アットホーム'].map(v => (
                            <Chip key={v} active={orgPrefs.atmosphere.includes(v)}
                              onClick={() => setOrgPrefs(p => ({ ...p, atmosphere: p.atmosphere.includes(v) ? p.atmosphere.filter(x => x !== v) : [...p.atmosphere, v] }))}>
                              {v}
                            </Chip>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="mb-2 text-xs font-bold text-stone-700">飲み放題</p>
                        <div className="flex flex-wrap gap-2">
                          {['希望', 'どちらでも'].map(v => (
                            <Chip key={v} active={orgPrefs.allYouCanDrink === v}
                              onClick={() => setOrgPrefs(p => ({ ...p, allYouCanDrink: p.allYouCanDrink === v ? '' : v }))}>
                              {v}
                            </Chip>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="mb-2 text-xs font-bold text-stone-700">ドリンク</p>
                        <div className="flex flex-wrap gap-2">
                          {['ワイン', '日本酒', '焼酎'].map(v => (
                            <Chip key={v} active={orgPrefs.drinks.includes(v)}
                              onClick={() => setOrgPrefs(p => ({ ...p, drinks: p.drinks.includes(v) ? p.drinks.filter(x => x !== v) : [...p.drinks, v] }))}>
                              {v}
                            </Chip>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="mb-2 text-xs font-bold text-stone-700">喫煙</p>
                        <div className="flex flex-wrap gap-2">
                          {['禁煙希望', 'どちらでも', '喫煙可'].map(v => (
                            <Chip key={v} active={orgPrefs.smoking === v}
                              onClick={() => setOrgPrefs(p => ({ ...p, smoking: p.smoking === v ? '' : v }))}>
                              {v}
                            </Chip>
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                </div>

              </div>`,
  `              <div className="space-y-5">

                {/* エリア */}
                <div>
                  <p className="mb-2 text-xs font-bold text-stone-700">エリア（駅・地名）</p>
                  <input
                    type="text"
                    value={areaInput}
                    onChange={e => setAreaInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && areaInput.trim()) {
                        const v = areaInput.trim()
                        setOrgPrefs(p => ({ ...p, areas: p.areas.includes(v) ? p.areas : [...p.areas, v] }))
                        setAreaInput('')
                      }
                    }}
                    placeholder="駅名・地名を入力 → Enter"
                    className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-300 focus:bg-white"
                  />
                  {orgPrefs.areas.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {orgPrefs.areas.map(v => (
                        <button
                          type="button"
                          key={v}
                          onClick={() => setOrgPrefs(p => ({ ...p, areas: p.areas.filter(x => x !== v) }))}
                          className="rounded-full bg-stone-900 px-3 py-1 text-xs font-bold text-white transition hover:bg-stone-700 active:scale-95"
                        >
                          {v} ×
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 価格帯 */}
                <div>
                  <p className="mb-2 text-xs font-bold text-stone-700">価格帯</p>
                  <select
                    value={orgPrefs.priceRange}
                    onChange={(e) => setOrgPrefs((p) => ({ ...p, priceRange: e.target.value }))}
                    className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-bold text-stone-700 outline-none transition focus:border-stone-400"
                  >
                    {['〜3,000円', '〜4,000円', '〜5,000円', '〜6,000円', '〜7,000円', '〜8,000円', '指定なし'].map((price) => (
                      <option key={price} value={price}>{price}</option>
                    ))}
                  </select>
                </div>

                {/* 個室 */}
                <div>
                  <p className="mb-2 text-xs font-bold text-stone-700">個室</p>
                  <div className="flex flex-wrap gap-2">
                    {['必要', 'どちらでも', '不要'].map(v => (
                      <Chip key={v} active={orgPrefs.privateRoom === v}
                        onClick={() => setOrgPrefs(p => ({ ...p, privateRoom: p.privateRoom === v ? '' : v }))}>
                        {v}
                      </Chip>
                    ))}
                  </div>
                </div>

                {/* こだわり条件 */}
                <div className="space-y-4">
                  <div>
                    <p className="mb-2 text-xs font-bold text-stone-700">ジャンル</p>
                    <div className="flex flex-wrap gap-2">
                      {GENRE_OPTIONS.map(v => (
                        <Chip key={v} active={orgPrefs.genres.includes(v)}
                          onClick={() => setOrgPrefs(p => ({ ...p, genres: p.genres.includes(v) ? p.genres.filter(x => x !== v) : [...p.genres, v] }))}>
                          {v}
                        </Chip>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-bold text-stone-700">雰囲気</p>
                    <div className="flex flex-wrap gap-2">
                      {['落ち着き', 'にぎやか', 'おしゃれ', 'アットホーム'].map(v => (
                        <Chip key={v} active={orgPrefs.atmosphere.includes(v)}
                          onClick={() => setOrgPrefs(p => ({ ...p, atmosphere: p.atmosphere.includes(v) ? p.atmosphere.filter(x => x !== v) : [...p.atmosphere, v] }))}>
                          {v}
                        </Chip>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-bold text-stone-700">飲み放題</p>
                    <div className="flex flex-wrap gap-2">
                      {['希望', 'どちらでも'].map(v => (
                        <Chip key={v} active={orgPrefs.allYouCanDrink === v}
                          onClick={() => setOrgPrefs(p => ({ ...p, allYouCanDrink: p.allYouCanDrink === v ? '' : v }))}>
                          {v}
                        </Chip>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-bold text-stone-700">ドリンク</p>
                    <div className="flex flex-wrap gap-2">
                      {['ワイン', '日本酒', '焼酎'].map(v => (
                        <Chip key={v} active={orgPrefs.drinks.includes(v)}
                          onClick={() => setOrgPrefs(p => ({ ...p, drinks: p.drinks.includes(v) ? p.drinks.filter(x => x !== v) : [...p.drinks, v] }))}>
                          {v}
                        </Chip>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-bold text-stone-700">喫煙</p>
                    <div className="flex flex-wrap gap-2">
                      {['禁煙希望', 'どちらでも', '喫煙可'].map(v => (
                        <Chip key={v} active={orgPrefs.smoking === v}
                          onClick={() => setOrgPrefs(p => ({ ...p, smoking: p.smoking === v ? '' : v }))}>
                          {v}
                        </Chip>
                      ))}
                    </div>
                  </div>
                </div>

              </div>`
)

// ── 9. finalConfirm: rewrite hero card + merge participants card ──────────────
apply(
  'finalConfirm hero card rewrite',
  `          {/* 決定内容 */}
          <div className="overflow-hidden rounded-3xl bg-stone-900">
            <div className="px-6 py-6">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">Final Summary</p>
              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-xs font-bold text-white/40">日程</p>
                  <p className="mt-1 text-xl font-black text-white">
                    {finalSelectedDate?.label ?? recommendedDate?.date.label ?? '未設定'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold text-white/40">お店候補</p>
                  <p className="mt-1 text-xl font-black text-white">{finalStore?.name ?? '未設定'}</p>
                  {finalStore?.area && (
                    <p className="mt-0.5 text-sm text-white/50">{finalStore.area}</p>
                  )}
                </div>
              </div>
            </div>
<p className="mt-2 text-sm font-bold text-white/70">
  最大参加人数 {yesCount + maybeCount}人
</p>

<div className="mt-3 flex flex-wrap gap-2 bg-white/[0.06] px-6 py-4">
  <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300 ring-1 ring-emerald-400/20">
    参加予定 {yesCount}人
  </span>

  <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-300 ring-1 ring-amber-400/20">
    調整中 {maybeCount}人
  </span>

  {eventType && (
    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/60">
      {eventType}
    </span>
  )}
  {effectiveTags.map((tag) => (
    <span key={tag} className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/60">
      {tag}
    </span>
  ))}
</div>
          </div>

          {/* 理由 */}
          {finalStore?.reason && (
            <div className="rounded-2xl bg-amber-50 px-4 py-3 ring-1 ring-amber-100">
              <p className="text-sm font-bold text-amber-900">この候補にした理由</p>
              <p className="mt-1 text-sm leading-6 text-amber-800">{finalStore.reason}</p>
            </div>


          )}

<div className="rounded-3xl bg-white px-5 py-5 shadow-sm ring-1 ring-stone-100">
  <button
    type="button"
    onClick={() => setShowFinalParticipants((v) => !v)}
    className="w-full text-left"
  >
    <p className="text-[10px] font-black uppercase tracking-[0.25em] text-stone-400">
      参加者
    </p>
    <p className="mt-2 text-sm font-bold text-stone-700">
      {showFinalParticipants ? '参加者を閉じる' : '参加者を見る'}
    </p>
  </button>

  {showFinalParticipants && (
    <div className="mt-4 space-y-3">
      <div className="rounded-2xl bg-stone-50 px-4 py-3 ring-1 ring-stone-100">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">
          参加予定
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {finalYesParticipants.length > 0 ? (
            finalYesParticipants.map((p) => (
              <span
                key={p.id}
                className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-100"
              >
                {p.name}
              </span>
            ))
          ) : (
            <span className="text-xs text-stone-400">まだいません</span>
          )}
        </div>
      </div>

      <div className="rounded-2xl bg-stone-50 px-4 py-3 ring-1 ring-stone-100">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-600">
          調整中
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {finalMaybeParticipants.length > 0 ? (
            finalMaybeParticipants.map((p) => (
              <span
                key={p.id}
                className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 ring-1 ring-amber-100"
              >
                {p.name}
              </span>
            ))
          ) : (
            <span className="text-xs text-stone-400">いません</span>
          )}
        </div>
      </div>
    </div>
  )}
</div>`,
  `          {/* 決定内容 */}
          <div className="overflow-hidden rounded-3xl bg-stone-900">
            <div className="px-6 py-6">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">Final Summary</p>
              <div className="mt-4 space-y-3">
                <div>
                  <p className="text-xs font-bold text-white/40">日程</p>
                  <p className="mt-1 text-2xl font-black text-white">
                    {finalSelectedDate?.label ?? heroDate?.label ?? '未設定'}
                  </p>
                  <p className="mt-1 text-sm font-bold text-white/60">
                    最大参加人数 {finalYesParticipants.length + finalMaybeParticipants.length}人
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold text-white/40">お店候補</p>
                  <p className="mt-1 text-xl font-black text-white">{finalStore?.name ?? '未設定'}</p>
                  {finalStore?.area && (
                    <p className="mt-0.5 text-sm text-white/50">{finalStore.area}</p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowFinalParticipants((v) => !v)}
                className="mt-4 text-xs font-bold text-white/60 underline underline-offset-2"
              >
                {showFinalParticipants ? '参加者を閉じる' : '参加者を見る'}
              </button>
              {showFinalParticipants && (
                <div className="mt-3 space-y-2">
                  <div>
                    <p className="text-xs font-bold text-emerald-400">参加予定</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {finalYesParticipants.length > 0 ? (
                        finalYesParticipants.map((p) => (
                          <span key={p.id} className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300">{p.name}</span>
                        ))
                      ) : (
                        <span className="text-xs text-white/40">まだいません</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-amber-400">調整中</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {finalMaybeParticipants.length > 0 ? (
                        finalMaybeParticipants.map((p) => (
                          <span key={p.id} className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-300">{p.name}</span>
                        ))
                      ) : (
                        <span className="text-xs text-white/40">いません</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2 bg-white/[0.06] px-6 py-4">
              <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300 ring-1 ring-emerald-400/20">
                参加予定 {finalYesParticipants.length}人
              </span>
              <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-300 ring-1 ring-amber-400/20">
                調整中 {finalMaybeParticipants.length}人
              </span>
              {eventType && (
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/60">
                  {eventType}
                </span>
              )}
              {effectiveTags.map((tag) => (
                <span key={tag} className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/60">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* 理由 */}
          {finalStore?.reason && (
            <div className="rounded-2xl bg-amber-50 px-4 py-3 ring-1 ring-amber-100">
              <p className="text-sm font-bold text-amber-900">この候補にした理由</p>
              <p className="mt-1 text-sm leading-6 text-amber-800">{finalStore.reason}</p>
            </div>
          )}`
)

// ── 10. finalShareText: use eventName ─────────────────────────────────────────
apply(
  'finalShareText use eventName',
  `const finalShareText =
  shareText ||
  \`日程は \${finalSelectedDate?.label ?? '未設定'} で進めたいです！
候補はこちら：\${finalStore?.name ?? 'お店未設定'}
\${finalStore?.link ?? ''}\``,
  `const finalShareText =
  shareText ||
  \`\${eventName}の日程と場所が決まりました！

日程：\${finalSelectedDate?.label ?? heroDate?.label ?? '未定'}
お店：\${finalStore?.name ?? '未定'}
\${finalStore?.link ?? ''}\``
)

writeFileSync(filePath, src, 'utf8')
console.log('\n🎉 patch11 complete')
