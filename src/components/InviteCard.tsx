import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { formatCode, inviteLinkIsLocalOnly, joinLink } from '@/lib/format'

/** "INVITE FRIENDS" card: code, link, share, QR, per the party code design. */
export function InviteCard({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const link = joinLink(code)
  const canShare = typeof navigator.share === 'function'

  async function share() {
    if (canShare) {
      await navigator.share({ title: 'Join my party on Tether', text: `Join code: ${formatCode(code)}`, url: link }).catch(() => undefined)
      return
    }
    await navigator.clipboard.writeText(link)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="overflow-hidden rounded-xl2 bg-bg-card">
      <div className="h-1 bg-brand" />
      <div className="p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-dim">Invite friends</p>
        <p className="mt-2 text-4xl font-extrabold tracking-wide">{formatCode(code)}</p>
        <p className="mt-2 break-all text-base text-ink-dim">{link.replace(/^https?:\/\//, '')}</p>
        {import.meta.env.DEV && inviteLinkIsLocalOnly() && (
          <p className="mt-2 rounded-lg bg-status-checkin/15 p-2 text-sm text-status-checkin">
            This link points at localhost, so it only works on this computer. Friends can still type the code if they open
            Tether from a shared address, run <span className="font-mono">npm run dev:phone</span> or set{' '}
            <span className="font-mono">VITE_PUBLIC_APP_URL</span>.
          </p>
        )}
        <button
          onClick={share}
          className="mt-4 min-h-[52px] w-full rounded-xl2 bg-white/10 font-semibold active:scale-[0.98]"
        >
          {copied ? '✓ Link copied' : canShare ? 'Share link' : 'Copy link'}
        </button>
        <div className="mt-4 flex justify-center">
          <div className="rounded-xl bg-white p-3">
            <QRCodeSVG value={link} size={180} />
          </div>
        </div>
      </div>
    </div>
  )
}
