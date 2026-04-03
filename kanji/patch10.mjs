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

// ── 1. Add areaInput / showOrgDetails / showAltStores state ──
apply(
  'add areaInput, showOrgDetails, showAltStores state',
  `  const [showHeroParticipants, setShowHeroParticipants] = useState(false)
  const [dashboardTab, setDashboardTab] = useState<'best' | 'alt'>('best')`,
  `  const [showHeroParticipants, setShowHeroParticipants] = useState(false)
  const [dashboardTab, setDashboardTab] = useState<'best' | 'alt'>('best')
  const [areaInput, setAreaInput] = useState('')
  const [showOrgDetails, setShowOrgDetails] = useState(false)
  const [showAltStores, setShowAltStores] = useState(false)`
)

// ── 2. Fix selectedStore to use selectedStoreId from storePool ──
apply(
  'selectedStore: use selectedStoreId from storePool',
  `const selectedStore: StoreCandidate | null =
  recommendedStores?.[0] ?? null`,
  `const selectedStore: StoreCandidate | null = (() => {
  const pool = recommendedStores.length > 0 ? recommendedStores : MOCK_STORES
  return pool.find((s: StoreCandidate) => s.id === selectedStoreId) ?? pool[0] ?? null
})()`
)

// ── 3. Add useEffect to reset selectedStoreId when recommendations arrive ──
apply(
  'useEffect: reset selectedStoreId on recommendedStores change',
  `useEffect(() => {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem('kanji_events')
    if (raw) setSavedEvents(JSON.parse(raw))
  } catch {}
}, [])`,
  `useEffect(() => {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem('kanji_events')
    if (raw) setSavedEvents(JSON.parse(raw))
  } catch {}
}, [])

useEffect(() => {
  const pool = recommendedStores.length > 0 ? recommendedStores : MOCK_STORES
  if (pool.length > 0) setSelectedStoreId(pool[0].id)
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [recommendedStores])`
)

// ── 4. organizerConditions: full section replacement ──
apply(
  'organizerConditions: full section replacement',
  `        {step === 'organizerConditions' && (
          <div className="space-y-4">
            <div className="px-1">
              <p className="text-[10px] font-black tracking-[0.25em] text-stone-400 uppercase">Step 7</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-stone-900">店の条件</h2>
              <p className="mt-1 text-sm text-stone-400">参加者の希望をもとに条件を調整してください。すべて任意です。</p>
            </div>

            {participantMajority && (
              <div className="rounded-3xl bg-stone-50 px-5 py-4 ring-1 ring-stone-100">
                <p className="mb-3 text-[10px] font-black tracking-[0.2em] text-stone-400 uppercase">参加者の多数派</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    ...participantMajority.genres,
                    ...participantMajority.atmosphere,
                    ...(participantMajority.privateRoom === '必要' ? ['個室希望'] : []),
                    ...(participantMajority.allYouCanDrink === '希望' ? ['飲み放題希望'] : []),
                    ...participantMajority.drinks,
                    ...participantMajority.areas,
                  ].map(tag => (
                    <span key={tag} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-stone-700 ring-1 ring-stone-200">{tag}</span>
                  ))}
                  {participantMajority.genres.length === 0 && participantMajority.atmosphere.length === 0 && (
                    <p className="text-sm text-stone-400">まだ希望が集まっていません</p>
                  )}
                </div>
              </div>
            )}

            <div className="rounded-3xl bg-white px-5 py-5 shadow-sm ring-1 ring-stone-100">
              <p className="mb-5 text-[10px] font-black tracking-[0.2em] text-stone-400 uppercase">幹事条件（修正可）</p>
              <div className="space-y-5">

                <div>
                  <p className="mb-2 text-xs font-bold text-stone-700">価格帯 <span className="ml-1 text-[10px] font-normal text-stone-300">強</span></p>
                  <div className="flex flex-wrap gap-2">
                    {['〜3,000円', '〜5,000円', '〜8,000円', '制限なし'].map(v => (
                      <Chip key={v} active={orgPrefs.priceRange === v}
                        onClick={() => setOrgPrefs(p => ({ ...p, priceRange: p.priceRange === v ? '' : v }))}>
                        {v}
                      </Chip>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-bold text-stone-700">個室 <span className="ml-1 text-[10px] font-normal text-stone-300">強</span></p>
                  <div className="flex flex-wrap gap-2">
                    {['必要', 'どちらでも', '不要'].map(v => (
                      <Chip key={v} active={orgPrefs.privateRoom === v}
                        onClick={() => setOrgPrefs(p => ({ ...p, privateRoom: p.privateRoom === v ? '' : v }))}>
                        {v}
                      </Chip>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-bold text-stone-700">エリア（駅）<span className="ml-1 text-[10px] font-normal text-stone-300">強</span></p>
                  <div className="flex flex-wrap gap-2">
                    {AREA_OPTIONS.map(v => (
                      <Chip key={v} active={orgPrefs.areas.includes(v)}
                        onClick={() => setOrgPrefs(p => ({ ...p, areas: p.areas.includes(v) ? p.areas.filter(x => x !== v) : [...p.areas, v] }))}>
                        {v}
                      </Chip>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-bold text-stone-700">ジャンル <span className="ml-1 text-[10px] font-normal text-stone-300">中</span></p>
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
                  <p className="mb-2 text-xs font-bold text-stone-700">雰囲気 <span className="ml-1 text-[10px] font-normal text-stone-300">中</span></p>
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
                  <p className="mb-2 text-xs font-bold text-stone-700">飲み放題 <span className="ml-1 text-[10px] font-normal text-stone-300">中</span></p>
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
                  <p className="mb-2 text-xs font-bold text-stone-700">ドリンク <span className="ml-1 text-[10px] font-normal text-stone-300">弱</span></p>
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
                  <p className="mb-2 text-xs font-bold text-stone-700">喫煙 <span className="ml-1 text-[10px] font-normal text-stone-300">弱</span></p>
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
            </div>

            <PrimaryBtn size="large" onClick={fetchRecommendedStores}>
              {isLoadingStores ? '店を提案中…' : 'おすすめの店を見る'}
            </PrimaryBtn>
            <GhostBtn onClick={() => setStep('dateConfirmed')}>← 戻る</GhostBtn>
          </div>
        )}`,
  `        {step === 'organizerConditions' && (
          <div className="space-y-4">
            <div className="px-1">
              <p className="text-[10px] font-black tracking-[0.25em] text-stone-400 uppercase">Step 7</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-stone-900">条件を整える</h2>
            </div>

            {participantMajority && (
              <div className="rounded-3xl bg-stone-50 px-5 py-4 ring-1 ring-stone-100">
                <p className="mb-3 text-[10px] font-black tracking-[0.2em] text-stone-400 uppercase">参加者の多数派</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    ...participantMajority.genres,
                    ...participantMajority.atmosphere,
                    ...(participantMajority.privateRoom === '必要' ? ['個室希望'] : []),
                    ...(participantMajority.allYouCanDrink === '希望' ? ['飲み放題希望'] : []),
                    ...participantMajority.drinks,
                    ...participantMajority.areas,
                  ].map(tag => (
                    <span key={tag} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-stone-700 ring-1 ring-stone-200">{tag}</span>
                  ))}
                  {participantMajority.genres.length === 0 && participantMajority.atmosphere.length === 0 && (
                    <p className="text-sm text-stone-400">まだ希望が集まっていません</p>
                  )}
                </div>
              </div>
            )}

            <div className="rounded-3xl bg-white px-5 py-5 shadow-sm ring-1 ring-stone-100">
              <p className="mb-5 text-[10px] font-black tracking-[0.2em] text-stone-400 uppercase">幹事条件（修正可）</p>
              <div className="space-y-5">

                {/* 価格帯: チップ（主） + プルダウン（副） */}
                <div>
                  <p className="mb-2 text-xs font-bold text-stone-700">価格帯</p>
                  <div className="flex flex-wrap gap-2">
                    {['〜3,000円', '〜5,000円', '〜8,000円', '制限なし'].map(v => (
                      <Chip key={v} active={orgPrefs.priceRange === v}
                        onClick={() => setOrgPrefs(p => ({ ...p, priceRange: p.priceRange === v ? '' : v }))}>
                        {v}
                      </Chip>
                    ))}
                  </div>
                  <select
                    value={orgPrefs.priceRange}
                    onChange={e => setOrgPrefs(p => ({ ...p, priceRange: e.target.value }))}
                    className="mt-2 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-500 outline-none focus:border-stone-300 focus:bg-white"
                  >
                    <option value="">金額を細かく指定…</option>
                    {[1000,2000,3000,4000,5000,6000,7000,8000,9000,10000].map(v => (
                      <option key={v} value={\`〜\${v.toLocaleString()}円\`}>〜{v.toLocaleString()}円</option>
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
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {AREA_OPTIONS.filter(v => !orgPrefs.areas.includes(v)).map(v => (
                      <button
                        type="button"
                        key={v}
                        onClick={() => setOrgPrefs(p => ({ ...p, areas: [...p.areas, v] }))}
                        className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-stone-500 transition hover:bg-stone-200 active:scale-95"
                      >
                        + {v}
                      </button>
                    ))}
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
                  <button
                    type="button"
                    onClick={() => setShowOrgDetails(v => !v)}
                    className="text-xs font-bold text-stone-400 underline underline-offset-2 transition hover:text-stone-600"
                  >
                    {showOrgDetails ? 'こだわり条件を閉じる' : 'こだわり条件を追加する（任意）'}
                  </button>
                  {showOrgDetails && (
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
                  )}
                </div>

              </div>
            </div>

            <PrimaryBtn size="large" onClick={fetchRecommendedStores}>
              {isLoadingStores ? '店を提案中…' : 'おすすめの店を見る'}
            </PrimaryBtn>
            <GhostBtn onClick={() => setStep('dateConfirmed')}>← 戻る</GhostBtn>
          </div>
        )}`
)

// ── 5. storeSuggestion: full section replacement ──
apply(
  'storeSuggestion: full section replacement',
  `{step === 'storeSuggestion' && heroDate && storePool.length > 0 && (
  <div className="space-y-4">
    <div className="px-1">
      <p className="text-[10px] font-black tracking-[0.25em] text-stone-400 uppercase">Step 9</p>
      <h2 className="mt-1 text-2xl font-black tracking-tight text-stone-900">今回の最適解</h2>
      <p className="mt-1 text-sm text-stone-400">比較して悩むより、まずはこの候補から見ればOKです。</p>
    </div>

    {(() => {
      const primaryStore = recommendedStores[0]
      const secondaryStores = recommendedStores.slice(1)
      const participantCount = dbResponses.length
      return (
        <div className="space-y-4">
          {/* 第一候補 — dark hero */}
          <div className="overflow-hidden rounded-3xl bg-stone-900">
            <div className="px-6 py-6">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">Best Choice</p>
              <h3 className="mt-2 text-2xl font-black tracking-tight text-white">{primaryStore.name}</h3>
              {primaryStore.area && (
                <p className="mt-1 text-sm text-white/50">
                  {primaryStore.area}{primaryStore.access ? \` · \${primaryStore.access}\` : ''}
                </p>
              )}
            </div>

            {primaryStore.image && (
              <div className="overflow-hidden">
                <img src={primaryStore.image} alt={primaryStore.name} className="h-52 w-full object-cover opacity-80" />
              </div>
            )}

            <div className="bg-white/[0.06] px-6 py-5">
              <p className="text-sm leading-6 text-white/70">{primaryStore.reason ?? storeReason}</p>
            </div>

            <div className="px-6 py-5">
              <a
                href={primaryStore.link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center rounded-2xl bg-white px-4 py-4 text-base font-black text-stone-900 transition hover:opacity-90 active:scale-[0.98]"
              >
                予約ページを見る
              </a>
 <p className="mt-2 text-center text-xs font-semibold text-white/40">
    まずはこの候補を見ればOKです
  </p>

            </div>
          </div>

          {/* 他候補 — 小さく、比較させない */}
          {secondaryStores.length > 0 && (
            <div className="space-y-1.5">
              <p className="px-1 text-[10px] font-black tracking-[0.2em] text-stone-400 uppercase">別の選択肢</p>
              {secondaryStores.map((store: any) => (
                <a
                  key={store.id}
                  href={store.link}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 ring-1 ring-stone-100 transition hover:bg-stone-50 active:scale-[0.99]"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-stone-700">{store.name}</p>
                    {store.area && (
                      <p className="mt-0.5 text-xs text-stone-400">
                        {store.area}{store.access ? \` · \${store.access}\` : ''}
                      </p>
                    )}
                  </div>
                  <span className="ml-3 shrink-0 text-xs text-stone-300">→</span>
                </a>
              ))}
            </div>
          )}

          <PrimaryBtn size="large" onClick={() => setStep('finalConfirm')}>
            この候補で進む
          </PrimaryBtn>
          <GhostBtn onClick={() => setStep('organizerConditions')}>条件を調整する</GhostBtn>
        </div>
      )
    })()}
  </div>
)}`,
  `{step === 'storeSuggestion' && heroDate && storePool.length > 0 && (
  <div className="space-y-4">
    <div className="px-1">
      <p className="text-[10px] font-black tracking-[0.25em] text-stone-400 uppercase">Step 9</p>
      <h2 className="mt-1 text-2xl font-black tracking-tight text-stone-900">お店を選ぶ</h2>
    </div>

    {/* 第一候補 — dark hero */}
    {primaryStore && (
      <div className="overflow-hidden rounded-3xl bg-stone-900">
        <div className="px-6 py-6">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">Best Choice</p>
          <h3 className="mt-2 text-2xl font-black tracking-tight text-white">{primaryStore.name}</h3>
          {primaryStore.area && (
            <p className="mt-1 text-sm text-white/50">
              {primaryStore.area}{primaryStore.access ? \` · \${primaryStore.access}\` : ''}
            </p>
          )}
        </div>

        {primaryStore.image && (
          <div className="overflow-hidden">
            <img src={primaryStore.image} alt={primaryStore.name} className="h-52 w-full object-cover opacity-80" />
          </div>
        )}

        <div className="bg-white/[0.06] px-6 py-5">
          <p className="text-sm leading-6 text-white/70">{primaryStore.reason ?? storeReason}</p>
        </div>

        <div className="px-6 py-5">
          <a
            href={primaryStore.link}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-full items-center justify-center rounded-2xl bg-white px-4 py-4 text-base font-black text-stone-900 transition hover:opacity-90 active:scale-[0.98]"
          >
            予約ページを見る
          </a>
        </div>
      </div>
    )}

    {/* 他候補: 折りたたみ + 選択可能 */}
    {secondaryStores.length > 0 && (
      <div>
        <button
          type="button"
          onClick={() => setShowAltStores(v => !v)}
          className="w-full text-center text-xs font-bold text-stone-400 underline underline-offset-2 transition hover:text-stone-600"
        >
          {showAltStores ? 'ほかの候補を閉じる' : \`ほかの候補を見る（\${secondaryStores.length}件）\`}
        </button>
        {showAltStores && (
          <div className="mt-3 space-y-1.5">
            {secondaryStores.map((store: StoreCandidate) => (
              <button
                type="button"
                key={store.id}
                onClick={() => { setSelectedStoreId(store.id); setShowAltStores(false) }}
                className={cx(
                  'flex w-full items-center justify-between rounded-2xl px-4 py-3 ring-1 transition hover:bg-stone-50 active:scale-[0.99]',
                  selectedStoreId === store.id
                    ? 'bg-stone-900 text-white ring-stone-900'
                    : 'bg-white text-stone-700 ring-stone-100'
                )}
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold">{store.name}</p>
                  {store.area && (
                    <p className={cx('mt-0.5 text-xs', selectedStoreId === store.id ? 'text-white/60' : 'text-stone-400')}>
                      {store.area}{store.access ? \` · \${store.access}\` : ''}
                    </p>
                  )}
                </div>
                <span className={cx('ml-3 shrink-0 text-xs', selectedStoreId === store.id ? 'text-white/60' : 'text-stone-300')}>→</span>
              </button>
            ))}
          </div>
        )}
      </div>
    )}

    <PrimaryBtn size="large" onClick={() => setStep('finalConfirm')}>
      この候補で進む
    </PrimaryBtn>
    <GhostBtn onClick={() => setStep('organizerConditions')}>条件を調整する</GhostBtn>
  </div>
)}`
)

writeFileSync(filePath, src, 'utf8')
console.log('\n🎉 patch10 complete')
