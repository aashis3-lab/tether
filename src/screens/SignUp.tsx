import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import {
  AUTH_MODE,
  RESEND_COOLDOWN_S,
  formatPhone,
  listenForSmsCode,
  normalizePhone,
  sendCode,
  verifyCode,
} from '@/auth/phoneAuth'
import { AlertOverlay } from '@/components/AlertOverlay'
import { BackTapSteps } from '@/components/BackTapSteps'
import { isIOS } from '@/lib/device'
import { parsePhone, phoneError, PHONE_ERROR } from '@/lib/phone'
import { PermissionsFlow } from '@/components/PermissionsPage'
import { ProfileForm } from '@/components/ProfileForm'
import { CodeBoxes } from '@/components/CodeBoxes'
import { CheckIcon } from '@/components/icons'
import { Button, ErrorText, Field, Screen, Title } from '@/components/ui'
import { buttonClass } from '@/components/buttons'
import { unlockAudio } from '@/lib/sound'

type Step = 'verify' | 'profile' | 'permissions' | 'practiceIntro' | 'practice' | 'backtap' | 'done'

const PRACTICE_SECONDS = 20

export function SignUp() {
  const { userId, profile, authSession, refreshProfile, loading } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') || '/'

  const [step, setStep] = useState<Step>(() => (userId ? 'profile' : 'verify'))
  const [phone, setPhone] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [code, setCode] = useState('')
  const [mockCode, setMockCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [resendIn, setResendIn] = useState(0)
  const [sendCount, setSendCount] = useState(0)

  // Resend countdown.
  useEffect(() => {
    if (resendIn <= 0) return
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => window.clearTimeout(t)
  }, [resendIn])

  // Android Chrome: fill the code in straight from the incoming SMS. It is
  // only filled in, the person still taps Verify.
  useEffect(() => {
    if (!codeSent || AUTH_MODE !== 'sms') return
    const ac = new AbortController()
    void listenForSmsCode(ac.signal).then((c) => {
      if (c && !ac.signal.aborted) setCode(c)
    })
    return () => ac.abort()
     
  }, [codeSent, sendCount])

  // Ignore taps right after a step appears, so a double tap can't skip it.
  const stepAt = useRef(0)
  useEffect(() => {
    stepAt.current = performance.now()
  }, [step])
  const settled = () => performance.now() - stepAt.current > 600

  // After the practice: iPhone gets the Back Tap offer, everyone else is done.
  const finish = () => (isIOS ? setStep('backtap') : navigate(next, { replace: true }))

  // Already fully set up and not mid-onboarding -> nothing to do here.
  if (!loading && profile && step === 'verify') return <Navigate to={next} replace />

  async function requestCode() {
    unlockAudio()
    const normalized = parsePhone(phone)
    if (!normalized) {
      setError(PHONE_ERROR)
      return
    }
    setBusy(true)
    setError('')
    setCode('')
    try {
      setPhone(formatPhone(normalized))
      setMockCode(await sendCode(normalized))
      setCodeSent(true)
      setResendIn(RESEND_COOLDOWN_S)
      setSendCount((n) => n + 1)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!codeSent) return requestCode()
    return verify(code)
  }

  async function verify(value: string) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await verifyCode(normalizePhone(phone), value, mockCode)
      const existing = await refreshProfile()
      setStep(existing ? 'done' : 'profile')
      if (existing) navigate(next, { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const sessionPhone =
    (phone && normalizePhone(phone)) ||
    authSession?.user.phone ||
    (authSession?.user.user_metadata?.phone as string | undefined) ||
    ''

  return (
    <Screen className="pt-[max(2rem,env(safe-area-inset-top))]">
      {step === 'verify' && (
        <form onSubmit={submit} className="flex flex-1 flex-col">
          {mockCode && <MockSmsBanner code={mockCode} />}
          <Title className="mb-6">Verify your phone</Title>

          <Field
            label="Phone number"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value)
              if (codeSent) {
                setCodeSent(false)
                setMockCode(null)
              }
            }}
            placeholder="(555) 123-4567"
            required
            autoFocus
            aria-invalid={Boolean(phoneError(phone))}
          />
          {phoneError(phone) && phone.replace(/\D/g, '').length >= 10 && (
            <p className="mt-1.5 px-1 text-xs text-status-alert">{PHONE_ERROR}</p>
          )}

          {codeSent && (
            <div className="mt-5">
              <span className="mb-1.5 block text-xs font-medium text-ink-dim">SMS code</span>
              <CodeBoxes value={code} onChange={setCode} autoFocus />
              <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-primary-ink">
                <CheckIcon width={18} height={18} />
                {mockCode ? 'Code received' : `Code sent to ${phone}`}
              </p>
              <Button type="button" variant="secondary" className="mt-5" disabled={busy || resendIn > 0} onClick={requestCode}>
                {resendIn > 0 ? `Send a new code (${resendIn}s)` : 'Send a new code'}
              </Button>
            </div>
          )}

          <div className="mt-5">
            <ErrorText>{error}</ErrorText>
          </div>

          <div className="mt-auto pt-10">
            <Button
              type="submit"
              disabled={busy || (codeSent ? code.length !== 6 : !parsePhone(phone))}
            >
              {busy ? 'One sec…' : codeSent ? 'Verify' : 'Send code'}
            </Button>
            <p className="mt-4 text-center text-sm leading-relaxed text-ink-dim">
              By continuing, you agree to our Terms and Privacy Policy.
            </p>
          </div>
        </form>
      )}

      {step === 'profile' && userId && (
        <div className="flex flex-1 flex-col">
          <Title className="mb-6">About you</Title>
          <ProfileForm
            userId={userId}
            phone={sessionPhone}
            submitLabel="Save & continue"
            onSaved={async () => {
              await refreshProfile()
              setStep('permissions')
            }}
          />
        </div>
      )}

      {step === 'permissions' && <PermissionsFlow onDone={() => setStep('practiceIntro')} />}

      {step === 'practiceIntro' && (
        <div className="flex flex-1 flex-col">
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-primary-container text-primary-on-container">
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M7 4.5v15l12-7.5-12-7.5Z" strokeLinejoin="round" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Try it first</h1>
            <p className="mt-3 max-w-xs text-base text-ink-dim">
              A 20-second rehearsal shows a ping, a shared location and how you answer.
            </p>
          </div>
          <div className="flex flex-col gap-2 pt-6">
            <Button big onClick={() => setStep('practice')}>
              Start 20-second practice
            </Button>
            <button onClick={() => settled() && finish()} className={buttonClass('text')}>
              Skip the practice
            </button>
          </div>
        </div>
      )}

      {step === 'practice' && (
        <PracticeAlert onDone={finish} onBack={() => setStep('practiceIntro')} />
      )}

      {step === 'backtap' && (
        <div className="flex flex-1 flex-col">
          <h1 className="text-2xl font-semibold tracking-tight">Open Tether with a double tap</h1>
          <p className="mb-5 mt-2 text-base text-ink-dim">
            Set up iPhone Back Tap so two taps on the back of your phone open Tether, no unlocking and searching.
          </p>
          <BackTapSteps />
          <p className="mt-4 text-base text-ink-dim">You can find these steps later in Settings.</p>
          <div className="mt-auto flex flex-col gap-2 pt-6">
            <Button big onClick={() => settled() && navigate(next, { replace: true })}>
              Done
            </Button>
            <button onClick={() => settled() && navigate(next, { replace: true })} className={buttonClass('text')}>
              Skip for now
            </button>
          </div>
        </div>
      )}
    </Screen>
  )
}

function MockSmsBanner({ code }: { code: string }) {
  // Stands in for the real SMS in mock auth mode, styled like an iOS banner.
  return (
    <div className="fixed inset-x-0 top-[max(0.5rem,env(safe-area-inset-top))] z-[3000] flex justify-center px-3">
      <div className="w-full max-w-[400px] rounded-2xl bg-surface-lowest p-4 text-ink shadow-e3">
        <p className="text-xs font-medium text-ink-dim">Messages · now</p>
        <p className="mt-1 font-medium">Your Tether code is {code}</p>
        {AUTH_MODE === 'mock' && <p className="mt-1 text-xs text-ink-dim">Demo mode, no real SMS sent</p>}
      </div>
    </div>
  )
}

/**
 * 20-second rehearsal, started from the permissions page: a practice ping
 * with a friend's location, then the acknowledgement. Nothing advances on a
 * timer, if time runs out it waits for "Try again" / "Back".
 */
function PracticeAlert({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [phase, setPhase] = useState<'running' | 'ready' | 'timeout'>('running')
  const [left, setLeft] = useState(PRACTICE_SECONDS)

  useEffect(() => {
    if (phase !== 'running') return
    if (left <= 0) {
      setPhase('timeout')
      return
    }
    const id = window.setTimeout(() => setLeft((s) => s - 1), 1000)
    return () => window.clearTimeout(id)
  }, [phase, left])

  if (phase === 'running') {
    return (
      <AlertOverlay
        sound={false}
        title="Practice: Sam needs you"
        body={
          <>
            <p>“Come find me”</p>
            <p className="mt-2">📍 Sam is 200 ft NE of you · shared location</p>
            <p className="mt-6 text-base opacity-70">This is a practice alert. {left}s left, tap “I'm on it”.</p>
          </>
        }
        onAction={() => setPhase('ready')}
      />
    )
  }

  if (phase === 'timeout') {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <h1 className="text-3xl font-semibold">Time's up</h1>
          <p className="mt-3 text-base text-ink-dim">No worries, try the practice again, or go back.</p>
        </div>
        <div className="flex flex-col gap-3">
          <Button
            onClick={() => {
              setLeft(PRACTICE_SECONDS)
              setPhase('running')
            }}
          >
            Try again
          </Button>
          <Button variant="text" onClick={onBack}>
            Back
          </Button>
        </div>
      </div>
    )
  }

  // "You're ready", the whole screen goes green.
  return (
    <div className="fixed inset-0 z-[1500] flex animate-fade-in justify-center bg-safe text-black">
      <div className="flex w-full max-w-app flex-col px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(3rem,env(safe-area-inset-top))]">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-black/15">
            <CheckIcon width={48} height={48} />
          </div>
          <h1 className="text-4xl font-semibold">You're ready.</h1>
          <p className="mt-3 text-lg">
            That's exactly what a real alert looks like. Sam would now see: “You're on it.”
          </p>
        </div>
        <button onClick={onDone} className="min-h-[56px] w-full rounded-full bg-black text-lg font-medium text-white active:scale-[0.98]">
          Done
        </button>
      </div>
    </div>
  )
}
