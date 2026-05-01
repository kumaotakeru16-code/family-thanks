'use client'

import { useRef, useState } from 'react'
import { Button, IconButton } from './ui/Button'
import { ChevLeftIcon, PlusIcon, XIcon, CameraIcon } from './ui/Icons'
import type { StoryPhoto } from '@/lib/omoide/types'

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
  line: '#E9DEC8',
  lineSoft: '#F2E9D6',
}

function resizeImage(file: File, maxSize = 1200): Promise<string> {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = e => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let { width, height } = img
        if (width > maxSize || height > maxSize) {
          if (width > height) { height = (height / width) * maxSize; width = maxSize }
          else { width = (width / height) * maxSize; height = maxSize }
        }
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }
      img.src = e.target!.result as string
    }
    reader.readAsDataURL(file)
  })
}

interface Props {
  onBack: () => void
  onNext: (photos: StoryPhoto[]) => void
  initialPhotos?: StoryPhoto[]
}

export default function PhotoPickerScreen({ onBack, onNext, initialPhotos = [] }: Props) {
  const [photos, setPhotos] = useState<StoryPhoto[]>(initialPhotos)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const addFiles = async (files: FileList | File[]) => {
    const newPhotos: StoryPhoto[] = []
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue
      const dataUrl = await resizeImage(file)
      newPhotos.push({ id: `p-${Date.now()}-${Math.random()}`, dataUrl })
    }
    setPhotos(prev => [...prev, ...newPhotos])
  }

  const removePhoto = (id: string) => setPhotos(prev => prev.filter(p => p.id !== id))

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }

  return (
    <div style={{ minHeight: '100dvh', background: C.bg }}>
      <div style={{ padding: '56px 20px 120px' }}>

        {/* header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 24,
        }}>
          <IconButton onClick={onBack} size={36}>
            <ChevLeftIcon size={18}/>
          </IconButton>
          <h1 style={{ fontSize: 17, fontWeight: 700, color: C.ink, margin: 0 }}>写真をえらぶ</h1>
          <button
            onClick={onBack}
            style={{
              fontSize: 13, color: C.inkSoft, background: 'none',
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            キャンセル
          </button>
        </div>

        {/* step indicator */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 6, marginBottom: 24,
        }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{
              width: i === 0 ? 20 : 6,
              height: 6,
              borderRadius: 999,
              background: i === 0 ? C.peach : C.line,
            }}/>
          ))}
        </div>

        {/* upload zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? C.peach : C.line}`,
            borderRadius: 22,
            padding: 28,
            textAlign: 'center',
            cursor: 'pointer',
            background: dragging ? C.peachSoft : C.paper,
            transition: 'all 0.2s',
            marginBottom: 20,
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={e => e.target.files && addFiles(e.target.files)}
          />
          <CameraIcon size={36} color={C.peachDeep}/>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.ink, marginTop: 10 }}>
            写真を追加する
          </div>
          <div style={{ fontSize: 13, color: C.inkMute, marginTop: 6 }}>
            タップして選択 または ドラッグ＆ドロップ
          </div>
          {photos.length > 0 && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              marginTop: 10,
              padding: '6px 14px',
              background: C.peachSoft,
              borderRadius: 999,
              fontSize: 13, color: C.peachDeep, fontWeight: 600,
            }}>
              <PlusIcon size={14} color={C.peachDeep}/>
              さらに追加
            </div>
          )}
        </div>

        {/* selected photos grid */}
        {photos.length > 0 && (
          <>
            <div style={{
              fontSize: 13, color: C.inkSoft, marginBottom: 10,
              display: 'flex', justifyContent: 'space-between',
            }}>
              <span>{photos.length}枚 えらんでいます</span>
              <button
                onClick={() => setPhotos([])}
                style={{
                  fontSize: 12, color: C.peachDeep, background: 'none',
                  border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                すべて削除
              </button>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 6,
            }}>
              {photos.map((photo, i) => (
                <div key={photo.id} style={{ position: 'relative', aspectRatio: '1/1' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.dataUrl}
                    alt={`photo ${i + 1}`}
                    style={{
                      width: '100%', height: '100%',
                      objectFit: 'cover',
                      borderRadius: 10,
                      display: 'block',
                    }}
                  />
                  {/* order badge */}
                  <div style={{
                    position: 'absolute', top: 5, left: 5,
                    width: 22, height: 22, borderRadius: '50%',
                    background: C.peach,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, color: '#fff', fontWeight: 700,
                  }}>
                    {i + 1}
                  </div>
                  {/* remove button */}
                  <button
                    onClick={() => removePhoto(photo.id)}
                    style={{
                      position: 'absolute', top: 5, right: 5,
                      width: 22, height: 22, borderRadius: '50%',
                      background: 'rgba(30,20,10,0.55)',
                      border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <XIcon size={12} color="#fff"/>
                  </button>
                </div>
              ))}

              {/* add more cell */}
              <div
                onClick={() => inputRef.current?.click()}
                style={{
                  aspectRatio: '1/1',
                  borderRadius: 10,
                  border: `1.5px dashed ${C.line}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: C.inkMute,
                  background: C.bgSoft,
                }}
              >
                <PlusIcon size={24} color={C.inkMute}/>
              </div>
            </div>
          </>
        )}
      </div>

      {/* bottom bar */}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0,
        background: C.paper,
        borderTop: `1px solid ${C.lineSoft}`,
        padding: '16px 20px 28px',
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <div style={{ flex: 1 }}>
          {photos.length === 0 ? (
            <div style={{ fontSize: 13, color: C.inkMute }}>
              写真をえらんでください
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11, color: C.inkMute }}>えらんだ写真</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: C.ink }}>
                {photos.length}枚
                <span style={{ fontSize: 11, color: C.inkMute, fontWeight: 400, marginLeft: 6 }}>
                  / 最大 10枚
                </span>
              </div>
            </>
          )}
        </div>
        <Button
          variant="primary"
          onClick={() => photos.length > 0 && onNext(photos)}
          disabled={photos.length === 0}
          style={{ padding: '13px 28px' }}
        >
          つぎへ ›
        </Button>
      </div>
    </div>
  )
}
