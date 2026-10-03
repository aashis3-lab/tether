import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { XIcon } from './icons'

/**
 * Full-screen camera QR scanner (rear camera). Decodes frames with jsQR so it
 * works on iOS Safari too (no BarcodeDetector there). Calls onCode with the
 * join code found in a Tether invite link, or the raw text.
 */
export function QrScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState('')
  // Latest callback without restarting the camera on every parent render.
  const onCodeRef = useRef(onCode)
  onCodeRef.current = onCode

  useEffect(() => {
    let stream: MediaStream | null = null
    let raf = 0
    let done = false

    const scan = () => {
      const v = video.current
      const c = canvas.current
      if (done || !v || !c) return
      if (v.readyState === v.HAVE_ENOUGH_DATA) {
        c.width = v.videoWidth
        c.height = v.videoHeight
        const ctx = c.getContext('2d', { willReadFrequently: true })
        if (ctx) {
          ctx.drawImage(v, 0, 0)
          const img = ctx.getImageData(0, 0, c.width, c.height)
          const hit = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
          if (hit?.data) {
            done = true
            const m = /\/join\/([A-Za-z0-9]+)/.exec(hit.data)
            onCodeRef.current((m ? m[1] : hit.data).toUpperCase())
            return
          }
        }
      }
      raf = requestAnimationFrame(scan)
    }

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError('The camera needs a secure (https) link.')
      return
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((s) => {
        stream = s
        if (video.current) {
          video.current.srcObject = s
          void video.current.play()
        }
        raf = requestAnimationFrame(scan)
      })
      .catch(() => setError('Camera access was blocked. Type the code instead, or allow the camera in your browser settings.'))

    return () => {
      done = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return (
    <div className="fixed inset-0 z-[2500] flex justify-center bg-black">
      <div className="relative h-full w-full max-w-app">
        <video ref={video} playsInline muted className="h-full w-full object-cover" />
        <canvas ref={canvas} className="hidden" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-64 w-64 rounded-3xl border-4 border-white/80" />
        </div>
        <p className="absolute inset-x-0 bottom-[max(3rem,env(safe-area-inset-bottom))] px-6 text-center text-lg font-semibold">
          {error || 'Point at the QR code on your friend’s phone'}
        </p>
        <button
          aria-label="Close scanner"
          onClick={onClose}
          className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] flex h-12 w-12 items-center justify-center rounded-full bg-black/60"
        >
          <XIcon />
        </button>
      </div>
    </div>
  )
}
