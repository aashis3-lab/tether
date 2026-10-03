import { useEffect, useState, type ReactNode } from 'react'
import { playAlertLoop } from '@/lib/sound'
import { respondCheckIn, ruleMs } from '@/lib/alerts'
import { firstName } from '@/lib/format'
import { tryOrToast } from '@/lib/toast'
import type { CheckIn, CheckInReason, CheckInResponse, Member } from '@/lib/types'
import { ChatIcon, HandIcon, HomeIcon } from './icons'
import { Eyebrow, InfoCard } from './ui'

interface Option {
  label: string
  response: CheckInResponse
  style: 'primary' | 'outline' | 'help'
  icon?: ReactNode
}

const HELP: Option = { label: 'I need help', response: 'help', style: 'help', icon: <HandIcon width={26} height={26} /> }

const PROMPTS: Record<CheckInReason, { eyebrow: string; title: string; body: string; options: Option[] }> = {
  separation: {
    eyebrow: 'Check-in',
    title: 'Are you okay?',
    body: "You've been away from your group for a while.",
    options: [{ label: "I'm okay", response: 'ok', style: 'primary' }, HELP],
  },
  left_alone: {
    eyebrow: 'Left-alone check-in',
    title: 'You left on your own. All good?',
    body: 'Nobody from your group is with you right now.',
    options: [
      { label: 'Heading home', response: 'heading_home', style: 'primary' },
      { label: 'Going somewhere else', response: 'elsewhere', style: 'outline' },
      HELP,
    ],
  },
  not_home: {
    eyebrow: 'Arrival check-in',
    title: 'Are you okay?',
    body: "You left 30+ minutes ago and haven't confirmed you're home.",
    options: [
      { label: "I'm okay • still on my way", response: 'heading_home', style: 'primary' },
      { label: "I'm home", response: 'home', style: 'outline', icon: <HomeIcon width={20} height={20} /> },
      HELP,
    ],
  },
}

/** After this long without an answer the check-in gets loud (rule B: 3 min). */
const LOUD_AFTER_MIN = 3

/**
 * Check-in from the automatic rules, per the "Overdue arrival check-in"
 * design. Quiet at first; after 3 min (×DEMO_SPEED) it starts sounding:
 * the server is pinging friends at the same moment.
 */
export function CheckInOverlay({ checkIn, me }: { checkIn: CheckIn; me: Member }) {
  const [busy, setBusy] = useState(false)
  const [loud, setLoud] = useState(false)
  const prompt = PROMPTS[checkIn.reason] ?? PROMPTS.separation
  const guardian = firstName(me.guardian_name) || 'your guardian'

  useEffect(() => {
    const wait = ruleMs(LOUD_AFTER_MIN) - (Date.now() - new Date(checkIn.created_at).getTime())
    if (wait <= 0) {
      setLoud(true)
      return
    }
    setLoud(false)
    const t = window.setTimeout(() => setLoud(true), wait)
    return () => window.clearTimeout(t)
  }, [checkIn.id, checkIn.created_at])

  useEffect(() => {
    if (!loud) return
    return playAlertLoop()
  }, [loud])

  async function answer(r: CheckInResponse) {
    if (busy) return
    setBusy(true)
    await tryOrToast("Couldn't send your answer", () => respondCheckIn(checkIn.id, r))
    setBusy(false)
  }

  return (
    <div className="fixed inset-0 z-[1900] flex justify-center bg-bg">
      <div className="flex w-full max-w-app flex-col overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
        <p className="mb-5 min-h-tap text-center text-xl font-bold leading-[60px] tracking-tight text-accent-pink">tether</p>

        <Eyebrow tone="orange">{prompt.eyebrow}</Eyebrow>
        <h1 className="mt-1 text-[2rem] font-bold leading-tight tracking-tight">{prompt.title}</h1>
        <p className="mt-2 text-lg text-ink-dim">{prompt.body}</p>

        <div className="mt-5 flex flex-col gap-3">
          <InfoCard
            heading={loud ? 'Please answer, friends are being asked to check on you' : 'Waiting for your reply'}
            headingClass={loud ? 'text-status-alert' : 'text-status-checkin'}
            icon={<ChatIcon width={18} height={18} />}
          >
            If this check-in goes unanswered, your guardian {guardian} gets your status and last known location.
          </InfoCard>
          <InfoCard heading="AUTOMATIC SAFETY STEPS" headingClass="text-status-calm">
            Separation check-in → left-alone alert → unanswered check-in escalates to your guardian.
          </InfoCard>
        </div>

        <div className="mt-auto flex flex-col gap-3 pt-6">
          {prompt.options.map((o) => (
            <button
              key={o.response}
              disabled={busy}
              onClick={() => answer(o.response)}
              className={`flex w-full items-center gap-3 rounded-xl2 px-5 text-left font-bold active:scale-[0.98] disabled:opacity-60 ${
                o.style === 'primary'
                  ? 'min-h-tap justify-center bg-gradient-to-r from-accent-pink to-accent-orange text-xl text-white'
                  : o.style === 'outline'
                    ? 'min-h-tap border border-white/20 bg-bg-card text-xl'
                    : 'min-h-[84px] border border-white/20 bg-bg-card text-2xl text-status-alert'
              }`}
            >
              {o.icon}
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
