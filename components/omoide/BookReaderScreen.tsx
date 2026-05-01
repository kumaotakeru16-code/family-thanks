'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { IconButton } from './ui/Button'
import { ChevLeftIcon, PauseIcon, PlayIcon, PrevIcon, NextIcon, SpeakerIcon, StarIcon } from './ui/Icons'
import WordPopup, { type WordEntry } from './WordPopup'
import { speak, stopSpeaking, isSpeechSupported } from '@/lib/omoide/speech'
import type { StoryBook } from '@/lib/omoide/types'

const C = {
  bg: '#FBF4E8',
  bgSoft: '#FCF7EE',
  paper: '#FFFCF6',
  ink: '#3B2F22',
  inkSoft: '#6E5E4D',
  inkMute: '#A89685',
  peach: '#F4B5B0',
  peachDeep: '#E89B95',
  peachSoft: '#FBDDD7',
  sage: '#A8C9B8',
  line: '#E9DEC8',
  lineSoft: '#F2E9D6',
}

// Simple word dictionary for interactive lookup
const WORD_DICT: Record<string, Omit<WordEntry, 'word'>> = {
  zoo:        { pronunciation: '/zuː/', meaning: '動物園', description: 'いろんな動物が住んでいるところ' },
  giraffe:    { pronunciation: '/dʒɪˈræf/', meaning: 'キリン', description: '首がとても長いアフリカの動物' },
  elephant:   { pronunciation: '/ˈɛlɪfənt/', meaning: 'ゾウ', description: '長い鼻が特徴の大きな動物' },
  happy:      { pronunciation: '/ˈhæpi/', meaning: 'うれしい・しあわせ', description: 'よい気持ちを表す言葉' },
  beautiful:  { pronunciation: '/ˈbjuːtɪfəl/', meaning: 'うつくしい・きれい', description: 'とても見た目が良いさま' },
  fun:        { pronunciation: '/fʌn/', meaning: 'たのしい', description: '楽しい時間や体験を表す言葉' },
  big:        { pronunciation: '/bɪɡ/', meaning: 'おおきい', description: 'サイズが大きいさま' },
  small:      { pronunciation: '/smɔːl/', meaning: 'ちいさい', description: 'サイズが小さいさま' },
  smile:      { pronunciation: '/smaɪl/', meaning: 'わらう・ほほえむ', description: '口を少し上げて笑顔を作ること' },
  family:     { pronunciation: '/ˈfæmɪli/', meaning: 'かぞく', description: '親や兄弟など、血のつながった人たち' },
  love:       { pronunciation: '/lʌv/', meaning: 'あい・だいすき', description: 'とても大切に思う気持ち' },
  day:        { pronunciation: '/deɪ/', meaning: 'ひ・にち', description: '1日、または昼間の時間' },
  wonderful:  { pronunciation: '/ˈwʌndərfəl/', meaning: 'すばらしい', description: 'とても良くて感動するさま' },
  water:      { pronunciation: '/ˈwɔːtər/', meaning: 'みず', description: '飲んだり泳いだりする透明な液体' },
  beach:      { pronunciation: '/biːtʃ/', meaning: 'うみべ・ビーチ', description: '海の砂浜のこと' },
  park:       { pronunciation: '/pɑːrk/', meaning: 'こうえん', description: '遊んだりできる広い場所' },
  flower:     { pronunciation: '/ˈflaʊər/', meaning: 'はな', description: '植物に咲く、色とりどりのもの' },
  food:       { pronunciation: '/fuːd/', meaning: 'たべもの', description: '食べるためのもの全般' },
  eat:        { pronunciation: '/iːt/', meaning: 'たべる', description: '食べ物を口に入れて飲み込むこと' },
  play:       { pronunciation: '/pleɪ/', meaning: 'あそぶ', description: '楽しみのためにすること' },
  run:        { pronunciation: '/rʌn/', meaning: 'はしる', description: '速く足を動かして移動すること' },
  jumped:     { pronunciation: '/dʒʌmpt/', meaning: 'とんだ', description: 'jumpの過去形。ジャンプした' },
  saw:        { pronunciation: '/sɔː/', meaning: 'みた', description: 'seeの過去形。目に見えた' },
  went:       { pronunciation: '/wɛnt/', meaning: 'いった', description: 'goの過去形。移動した' },
  got:        { pronunciation: '/ɡɒt/', meaning: 'もらった・〜になった', description: 'getの過去形' },
  great:      { pronunciation: '/ɡreɪt/', meaning: 'すばらしい', description: 'とても良いさま' },
  amazing:    { pronunciation: '/əˈmeɪzɪŋ/', meaning: 'すごい！おどろき', description: '感心して驚くさま' },
  together:   { pronunciation: '/təˈɡɛðər/', meaning: 'いっしょに', description: '2人以上が同じ場所でいること' },
  memory:     { pronunciation: '/ˈmɛməri/', meaning: 'おもいで・きおく', description: '心に残っている出来事' },
  yummy:      { pronunciation: '/ˈjʌmi/', meaning: 'おいしい', description: '子どもが使う「おいしい」の言葉' },
  delicious:  { pronunciation: '/dɪˈlɪʃəs/', meaning: 'おいしい', description: '食べ物がとても美味しいさま' },
  tired:      { pronunciation: '/taɪərd/', meaning: 'つかれた', description: '体や心がくたびれたさま' },
  excited:    { pronunciation: '/ɪkˈsaɪtɪd/', meaning: 'わくわくした', description: '楽しみや期待で胸がいっぱいのさま' },
  sparkled:   { pronunciation: '/ˈspɑːrkəld/', meaning: 'きらきらした', description: '光ってキラキラしている' },
  petals:     { pronunciation: '/ˈpɛtəlz/', meaning: 'はなびら', description: '花を構成している薄い色のある部分' },
  trunk:      { pronunciation: '/trʌŋk/', meaning: '（ゾウの）はな', description: 'ゾウの長い鼻のこと' },
  sprayed:    { pronunciation: '/spreɪd/', meaning: 'ふきかけた', description: '水などを霧状に吹きかけた' },
  stretched:  { pronunciation: '/strɛtʃt/', meaning: 'のばした', description: '伸ばした・長くした' },
  surprised:  { pronunciation: '/sərˈpraɪzd/', meaning: 'びっくりした', description: '予想外のことに驚いたさま' },
}

function findWordAt(text: string, offset: number): string | null {
  const wordStart = text.lastIndexOf(' ', offset - 1) + 1
  const wordEnd = text.indexOf(' ', offset)
  const word = text.slice(wordStart, wordEnd === -1 ? text.length : wordEnd)
    .replace(/[^a-zA-Z]/g, '').toLowerCase()
  return word in WORD_DICT ? word : null
}

// Renders English text with tappable words
function HighlightedText({
  text,
  onWordClick,
}: {
  text: string
  onWordClick: (word: string, rect: DOMRect) => void
}) {
  const words = text.split(/\b/)

  return (
    <span>
      {words.map((segment, i) => {
        const clean = segment.replace(/[^a-zA-Z]/g, '').toLowerCase()
        const isKnown = clean in WORD_DICT

        if (isKnown) {
          return (
            <span
              key={i}
              onClick={e => {
                const rect = (e.target as HTMLElement).getBoundingClientRect()
                onWordClick(clean, rect)
              }}
              style={{
                color: C.peachDeep,
                background: C.peachSoft,
                borderRadius: 5,
                padding: '0 3px',
                cursor: 'pointer',
                fontWeight: 600,
                textDecoration: 'underline dotted rgba(0,0,0,0.15)',
                textUnderlineOffset: 3,
              }}
            >
              {segment}
            </span>
          )
        }
        return <span key={i}>{segment}</span>
      })}
    </span>
  )
}

interface Props {
  book: StoryBook
  onBack: () => void
  initialPage?: number
  initialLang?: 'jp' | 'en'
}

export default function BookReaderScreen({ book, onBack, initialPage = 0, initialLang = 'en' }: Props) {
  const [page, setPage] = useState(initialPage)
  const [lang, setLang] = useState<'jp' | 'en'>(initialLang)
  const [turning, setTurning] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [popup, setPopup] = useState<{ entry: WordEntry; rect: DOMRect } | null>(null)
  const speechSupported = isSpeechSupported()

  const total = book.photos.length
  const currentPhoto = book.photos[page]
  const currentText = lang === 'jp'
    ? book.japaneseStory[page] ?? ''
    : book.englishStory[page] ?? ''

  const goTo = useCallback((nextPage: number, dir: 1 | -1) => {
    if (nextPage < 0 || nextPage >= total) return
    stopSpeaking()
    setPlaying(false)
    setTurning(true)
    setTimeout(() => {
      setPage(nextPage)
      setTurning(false)
    }, 350)
  }, [total])

  const goNext = () => goTo(page + 1, 1)
  const goPrev = () => goTo(page - 1, -1)

  const speechLang = (l: 'en' | 'jp'): 'en' | 'ja' => l === 'jp' ? 'ja' : 'en'

  const togglePlay = () => {
    if (playing) {
      stopSpeaking()
      setPlaying(false)
    } else {
      speak(currentText, speechLang(lang))
      setPlaying(true)
    }
  }

  // Stop speech on page change
  useEffect(() => {
    stopSpeaking()
    setPlaying(false)
  }, [page, lang])

  // Keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goNext()
      if (e.key === 'ArrowLeft') goPrev()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [page, total]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleWordClick = (word: string, rect: DOMRect) => {
    const dictEntry = WORD_DICT[word]
    if (!dictEntry) return
    setPopup({ entry: { word, ...dictEntry }, rect })
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: C.bg,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '56px 18px 12px',
        flexShrink: 0,
      }}>
        <IconButton onClick={onBack} size={34}>
          <ChevLeftIcon size={16}/>
        </IconButton>
        <div style={{
          fontFamily: 'Georgia, serif',
          fontSize: 11,
          color: C.inkMute,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          maxWidth: 200,
          textAlign: 'center',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {book.title}
        </div>
        <div style={{
          width: 34, height: 34,
          borderRadius: '50%',
          background: C.paper,
          border: `1px solid ${C.line}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, color: C.inkSoft, cursor: 'pointer',
        }}>
          ⋯
        </div>
      </div>

      {/* book page */}
      <div style={{
        flex: 1,
        padding: '0 16px',
        perspective: 1800,
        overflow: 'hidden',
      }}>
        <div style={{
          background: C.paper,
          borderRadius: '18px 22px 22px 18px',
          border: `1px solid ${C.lineSoft}`,
          boxShadow: '0 14px 40px rgba(120,80,40,0.12), inset 0 0 0 1px rgba(255,255,255,0.6)',
          padding: 16,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          position: 'relative',
          transformOrigin: 'left center',
          transition: turning ? 'transform 0.35s cubic-bezier(0.6,0.05,0.3,1)' : 'none',
          transform: turning ? 'rotateY(-12deg)' : 'rotateY(0)',
        }}>
          {/* page number */}
          <div style={{
            position: 'absolute', top: 10, left: 12,
            background: 'rgba(255,252,246,0.92)',
            borderRadius: 999,
            padding: '3px 10px',
            fontSize: 11,
            color: C.inkSoft,
            letterSpacing: '0.06em',
            fontFamily: 'Georgia, serif',
            border: `1px solid ${C.lineSoft}`,
          }}>
            {page + 1} / {total}
          </div>

          {/* star */}
          <div style={{ position: 'absolute', top: 8, right: 10 }}>
            <StarIcon size={22}/>
          </div>

          {/* photo */}
          <div style={{
            flex: '0 0 auto',
            marginTop: 8,
            height: 200,
            borderRadius: 14,
            overflow: 'hidden',
            background: C.peachSoft,
          }}>
            {currentPhoto?.dataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentPhoto.dataUrl}
                alt={`page ${page + 1}`}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div style={{
                width: '100%', height: '100%',
                background: `repeating-linear-gradient(135deg, ${C.peachSoft} 0 10px, ${C.bgSoft} 10px 20px)`,
              }}/>
            )}
          </div>

          {/* story text */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <div style={{
              fontSize: 14,
              lineHeight: 1.9,
              color: C.ink,
              fontFamily: lang === 'en' ? 'Georgia, serif' : 'inherit',
              letterSpacing: lang === 'jp' ? '0.03em' : 0,
            }}>
              {lang === 'en'
                ? currentText.split('\n').map((line, i) => (
                    <div key={i}>
                      <HighlightedText text={line} onWordClick={handleWordClick}/>
                    </div>
                  ))
                : currentText.split('\n').map((line, i) => (
                    <div key={i}>{line}</div>
                  ))
              }
            </div>
          </div>

          {/* speaker button */}
          {speechSupported && (
            <button
              onClick={() => speak(currentText, speechLang(lang))}
              style={{
                position: 'absolute',
                right: 14, bottom: 80,
                width: 40, height: 40,
                borderRadius: '50%',
                background: C.peach,
                border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(244,181,176,0.36)',
              }}
            >
              <SpeakerIcon size={18} color="#fff"/>
            </button>
          )}

          {/* page edge peek */}
          <div style={{
            position: 'absolute', right: 0, top: 0, bottom: 0,
            width: 14,
            background: 'linear-gradient(90deg, transparent, rgba(120,80,40,0.04))',
            borderRadius: '0 22px 22px 0',
            pointerEvents: 'none',
          }}/>
        </div>
      </div>

      {/* controls */}
      <div style={{
        padding: '14px 22px 28px',
        flexShrink: 0,
        background: C.bg,
      }}>
        {/* progress bar */}
        <div style={{
          height: 5, borderRadius: 999, background: C.lineSoft,
          overflow: 'hidden', marginBottom: 14,
        }}>
          <div style={{
            height: '100%',
            width: `${((page + 1) / total) * 100}%`,
            background: C.peach,
            borderRadius: 999,
            transition: 'width 0.4s ease',
          }}/>
        </div>

        {/* nav row */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 14,
        }}>
          <IconButton onClick={goPrev} size={44} style={{ opacity: page === 0 ? 0.4 : 1 }}>
            <PrevIcon size={20}/>
          </IconButton>
          <IconButton onClick={togglePlay} accent size={56}>
            {playing ? <PauseIcon size={24} color="#fff"/> : <PlayIcon size={24} color="#fff"/>}
          </IconButton>
          <IconButton onClick={goNext} size={44} style={{ opacity: page === total - 1 ? 0.4 : 1 }}>
            <NextIcon size={20}/>
          </IconButton>
        </div>

        {/* lang toggle */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          fontSize: 13, color: C.inkSoft,
        }}>
          <span style={{ color: lang === 'en' ? C.peachDeep : C.inkSoft, fontWeight: lang === 'en' ? 700 : 400 }}>EN</span>
          <div
            onClick={() => setLang(l => l === 'en' ? 'jp' : 'en')}
            style={{
              width: 38, height: 20, borderRadius: 999,
              background: lang === 'jp' ? C.sage : C.peachSoft,
              padding: 2, position: 'relative', cursor: 'pointer',
              transition: 'background 0.2s',
            }}
          >
            <div style={{
              width: 16, height: 16, borderRadius: '50%',
              background: lang === 'jp' ? '#A8C9B8' : C.peach,
              position: 'absolute',
              top: 2,
              left: lang === 'jp' ? 18 : 2,
              transition: 'left 0.2s, background 0.2s',
            }}/>
          </div>
          <span style={{ color: lang === 'jp' ? C.peachDeep : C.inkSoft, fontWeight: lang === 'jp' ? 700 : 400 }}>JP</span>
          <span style={{ marginLeft: 8, color: C.line }}>·</span>
          <span style={{ fontSize: 11 }}>英語をタップで辞書</span>
        </div>
      </div>

      {/* word popup */}
      {popup && (
        <WordPopup
          entry={popup.entry}
          anchorRect={popup.rect}
          onClose={() => setPopup(null)}
        />
      )}
    </div>
  )
}
