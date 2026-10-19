import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { formatCode, inviteLinkIsLocalOnly, joinLink } from '@/lib/format'
import { buttonClass } from './buttons'
import { CheckIcon, SendIcon } from './icons'

/** "INVITE FRIENDS" card: code, link, share, QR, per the party code design. */
export function InviteCard({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const link = joinLink(code)
  const canShare = typeof navigator.share === 'function'

  async function share() {
    await navigator.share({ title: 'Join my party on Tether', text: `Join code: ${formatCode(code)}`, url: link }).catch(() => undefined)
  }

  async function copy() {
    await navigator.clipboard.writeText(link)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="overflow-hidden rounded-[20px] bg-surface-lowest shadow-e1 dark:bg-surface-mid">
      <div className="h-1 bg-brand" />
      <div className="p-5">
        <p className="text-xs font-medium text-ink-dim">Invite code</p>
        <p className="mt-1 text-4xl font-medium tracking-widest text-primary-ink">{formatCode(code)}</p>
        <p className="mt-1 break-all text-xs text-ink-dim">{link.replace(/^https?:\/\//, '')}</p>
        {import.meta.env.DEV && inviteLinkIsLocalOnly() && (
          <p className="mt-2 rounded-lg bg-status-checkin/15 p-2 text-sm text-status-checkin">
            This link points at localhost, so it only works on this computer. Friends can still type the code if they open
            Tether from a shared address, run <span className="font-mono">npm run dev:phone</span> or set{' '}
            <span className="font-mono">VITE_PUBLIC_APP_URL</span>.
          </p>
        )}
        <div className="mt-4 flex gap-2">
          {canShare && (
            <button onClick={share} className={`${buttonClass('primary')} flex-1`}>
              <SendIcon width={18} height={18} /> Share
            </button>
          )}
          <button onClick={copy} className={`${buttonClass('tonal')} flex-1`}>
            {copied ? <CheckIcon width={18} height={18} /> : null}
            {copied ? 'Link copied' : 'Copy link'}
          </button>
        </div>
        <div className="mt-4 flex justify-center">
          <div className="rounded-xl bg-white p-3">
            <QRCodeSVG value={link} size={180} />
          </div>
        </div>
      </div>
    </div>
  )
}
