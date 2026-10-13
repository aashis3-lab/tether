import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Avatar } from './Avatar'
import { Button, ErrorText } from './ui'

const OUT_PX = 512
const VIEW_PX = 280

/**
 * Optional profile picture: take a photo or pick one, crop it to a circle,
 * upload to Storage (avatars/<uid>/avatar.jpg), and report the public URL.
 */
export function AvatarPicker({
  userId,
  name,
  url,
  onChange,
}: {
  userId: string
  name: string
  url: string | null
  /** New public URL (or null when removed). Caller saves it on the profile. */
  onChange: (url: string | null) => void | Promise<void>
}) {
  const camera = useRef<HTMLInputElement>(null)
  const library = useRef<HTMLInputElement>(null)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function load(file: File | undefined) {
    if (!file) return
    setError('')
    const img = new Image()
    img.onload = () => setImage(img)
    img.onerror = () => setError("Couldn't open that image. Try another one.")
    img.src = URL.createObjectURL(file)
  }

  async function upload(blob: Blob) {
    setBusy(true)
    setError('')
    const path = `${userId}/avatar.jpg`
    const { error: err } = await supabase.storage
      .from('avatars')
      .upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' })
    if (err) {
      setBusy(false)
      setError(!import.meta.env.DEV ? "Couldn't save your picture. Try again." : err.message.includes('Bucket not found') ? 'Picture storage isn’t set up yet (run the avatars migration).' : err.message)
      return
    }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    // Cache-bust so a replaced picture shows right away.
    await commit(`${data.publicUrl}?v=${Date.now()}`)
    setBusy(false)
    setImage(null)
  }

  async function commit(next: string | null) {
    try {
      await onChange(next)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar name={name || '?'} url={url} size={84} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => camera.current?.click()}
            className="min-h-[48px] rounded-xl2 border border-white/15 bg-bg-card px-2 text-sm font-semibold"
          >
            Take photo
          </button>
          <button
            type="button"
            onClick={() => library.current?.click()}
            className="min-h-[48px] rounded-xl2 border border-white/15 bg-bg-card px-2 text-sm font-semibold"
          >
            Choose photo
          </button>
        </div>
        {url ? (
          <button type="button" onClick={() => void commit(null)} className="self-start text-sm text-ink-faint underline">
            Remove picture
          </button>
        ) : (
          <p className="text-sm text-ink-dim">Optional, friends see your initials otherwise.</p>
        )}
        <ErrorText>{error}</ErrorText>
      </div>

      {/* capture="user" opens the front camera on phones; the other opens the library. */}
      <input ref={camera} type="file" accept="image/*" capture="user" hidden onChange={(e) => load(e.target.files?.[0])} />
      <input ref={library} type="file" accept="image/*" hidden onChange={(e) => load(e.target.files?.[0])} />

      {image && <CircleCropper image={image} busy={busy} onCancel={() => setImage(null)} onDone={upload} />}
    </div>
  )
}

/** Drag to position, slide to zoom; exports a square JPEG of the circle area. */
function CircleCropper({
  image,
  busy,
  onCancel,
  onDone,
}: {
  image: HTMLImageElement
  busy: boolean
  onCancel: () => void
  onDone: (blob: Blob) => void
}) {
  // Base scale makes the image just cover the circle.
  const base = VIEW_PX / Math.min(image.naturalWidth, image.naturalHeight)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const scale = base * zoom
  const w = image.naturalWidth * scale
  const h = image.naturalHeight * scale

  // Keep the circle fully covered by the image.
  const clamp = (o: { x: number; y: number }) => ({
    x: Math.min((w - VIEW_PX) / 2, Math.max(-(w - VIEW_PX) / 2, o.x)),
    y: Math.min((h - VIEW_PX) / 2, Math.max(-(h - VIEW_PX) / 2, o.y)),
  })
  useEffect(() => setOffset((o) => clamp(o)), [zoom]) // eslint-disable-line react-hooks/exhaustive-deps

  function exportBlob() {
    const canvas = document.createElement('canvas')
    canvas.width = OUT_PX
    canvas.height = OUT_PX
    const ctx = canvas.getContext('2d')!
    // Visible square (in image px) centred on the circle.
    const side = VIEW_PX / scale
    const cx = image.naturalWidth / 2 - offset.x / scale
    const cy = image.naturalHeight / 2 - offset.y / scale
    ctx.drawImage(image, cx - side / 2, cy - side / 2, side, side, 0, 0, OUT_PX, OUT_PX)
    canvas.toBlob((b) => b && onDone(b), 'image/jpeg', 0.88)
  }

  return (
    <div className="fixed inset-0 z-[2600] flex justify-center bg-black/90">
      <div className="flex w-full max-w-app flex-col items-center px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]">
        <p className="text-xl font-bold">Move and zoom</p>
        <div className="flex flex-1 items-center">
          <div
            className="relative overflow-hidden rounded-full ring-4 ring-white/80"
            style={{ width: VIEW_PX, height: VIEW_PX, touchAction: 'none' }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
            }}
            onPointerMove={(e) => {
              const d = drag.current
              if (d) setOffset(clamp({ x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y }))
            }}
            onPointerUp={() => (drag.current = null)}
          >
            <img
              src={image.src}
              alt=""
              draggable={false}
              className="pointer-events-none absolute max-w-none select-none"
              style={{ width: w, height: h, left: (VIEW_PX - w) / 2 + offset.x, top: (VIEW_PX - h) / 2 + offset.y }}
            />
          </div>
        </div>
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          aria-label="Zoom"
          className="mb-6 w-full accent-accent-pink"
        />
        <div className="grid w-full grid-cols-2 gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={exportBlob} disabled={busy}>
            {busy ? 'Saving…' : 'Use photo'}
          </Button>
        </div>
      </div>
    </div>
  )
}
