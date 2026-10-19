import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { Avatar } from '@/components/Avatar'
import { GuardianSheet } from '@/components/GuardianSheet'
import { ChevronRightIcon, QrIcon } from '@/components/icons'
import { QrScanner } from '@/components/QrScanner'
import { Header, ErrorText, Screen, Title, inputClass } from '@/components/ui'
import { buttonClass } from '@/components/buttons'
import { firstName, formatCode } from '@/lib/format'
import { profileContacts } from '@/lib/profile'
import { supabase } from '@/lib/supabase'
import { formatClock } from '@/lib/time'
import type { Contact } from '@/lib/types'

interface Preview {
  session_id: string
  creator_name: string
  party_name?: string | null
  member_count: number
  member_names: string[] | null
  member_avatars?: (string | null)[] | null
  venue_name: string | null
  end_time: string
  status: string
}

const normalize = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)

/** "Join a party": code or QR, then "Is this your group?" preview, guardian, join. */
export function JoinSession() {
  const { code: codeParam } = useParams()
  const { profile, userId } = useAuth()
  const navigate = useNavigate()

  const contacts = profileContacts(profile)
  const [code, setCode] = useState(normalize(codeParam ?? ''))
  const [preview, setPreview] = useState<Preview | null>(null)
  const [guardian, setGuardian] = useState<Contact | null>(contacts[0] ?? null)
  const [sheet, setSheet] = useState<null | 'guardian' | 'join'>(null)
  const [scanning, setScanning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Already a member of the previewed party -> offer to open it instead.
  const [alreadyIn, setAlreadyIn] = useState(false)

  const lookup = useCallback(async (c: string) => {
    setError('')
    setPreview(null)
    const { data, error: err } = await supabase.rpc('session_preview', { p_join_code: c })
    const row = (data as Preview[] | null)?.[0]
    if (err) setError(err.message)
    else if (!row) setError('No active party with that code.')
    else setPreview(row)
  }, [])

  useEffect(() => {
    setAlreadyIn(false)
    if (!preview || !userId) return
    let live = true
    void supabase
      .from('session_members')
      .select('id')
      .eq('session_id', preview.session_id)
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (live) setAlreadyIn(Boolean(data))
      })
    return () => {
      live = false
    }
  }, [preview, userId])

  // Look it up as soon as the code is complete.
  useEffect(() => {
    if (code.length === 6) void lookup(code)
    else {
      setPreview(null)
      setError('')
    }
  }, [code, lookup])

  async function join(g: Contact) {
    setBusy(true)
    setError('')
    setGuardian(g)
    const { data, error: err } = await supabase.rpc('join_session', {
      p_join_code: code,
      p_guardian_name: g.name,
      p_guardian_phone: g.phone,
    })
    setBusy(false)
    if (err) {
      setError(/no active night out/i.test(err.message) ? 'No active party with that code.' : err.message)
      setSheet(null)
    } else navigate(`/session/${data as string}`, { replace: true })
  }

  const host = preview ? firstName(preview.creator_name) : ''

  return (
    <Screen>
      <Header title="Join" back="/" />
      <Title>Join a party</Title>

      <label className="mt-5 block">
        <span className="mb-1.5 block text-xs font-medium text-ink-dim">Invite code</span>
        <input
          value={formatCode(code)}
          onChange={(e) => setCode(normalize(e.target.value))}
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="K7M 4QX"
          className={`${inputClass} text-xl font-medium tracking-wide`}
          autoFocus={!codeParam}
        />
      </label>

      <button
        onClick={() => setScanning(true)}
        className="mt-3 flex min-h-tap w-full items-center justify-center gap-2 rounded-full border border-outline px-4 text-base font-medium text-primary-ink active:scale-[0.98]"
      >
        <QrIcon width={22} height={22} className="text-secondary-ink" />
        Scan QR
      </button>

      {preview && <h2 className="section-title mt-4 px-0">Is this your group?</h2>}
      {preview && (
        <div className="rounded-[20px] bg-brand-tonal p-5 shadow-e1">
          <p className="text-2xl font-medium text-primary-on-container">{preview.party_name || `${host}'s party`}</p>
          {preview.party_name && <p className="text-base text-ink-dim">Started by {host}</p>}
          {preview.member_names && preview.member_names.length > 0 && (
            <>
              <div className="mt-3 flex -space-x-2">
                {preview.member_names.slice(0, 6).map((n, i) => (
                  <Avatar key={i} name={n} url={preview.member_avatars?.[i]} size={36} ring="ring-2 ring-bg-card" />
                ))}
              </div>
              <p className="mt-2 text-ink">{preview.member_names.join(', ')}</p>
            </>
          )}
          <p className="mt-2 text-ink">
            {preview.venue_name ? `${preview.venue_name} · ` : ''}Ends {formatClock(preview.end_time)}
          </p>
        </div>
      )}

      {preview && alreadyIn && (
        <div className="mt-3 rounded-2xl bg-status-calm/10 p-4">
          <p className="text-lg font-medium">You're already in this party</p>
          <p className="text-xs text-ink-dim">No need to join again.</p>
          <button onClick={() => navigate(`/session/${preview.session_id}`)} className={`mt-3 ${buttonClass('primary')}`}>
            Open party
          </button>
        </div>
      )}

      {preview && !alreadyIn && (
        <button
          onClick={() => setSheet('guardian')}
          className="mt-3 flex min-h-[64px] w-full items-center gap-3 rounded-2xl bg-surface-lowest px-4 py-3 text-left dark:bg-surface-mid"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-lg">{guardian ? `${guardian.name} • Guardian` : 'Choose a guardian'}</span>
            <span className="block text-base text-ink-dim">Your at-home contact</span>
          </span>
          <ChevronRightIcon width={20} height={20} className="text-ink-dim" />
        </button>
      )}

      <div className="mt-4">
        <ErrorText>{error}</ErrorText>
      </div>

      <div className={`mt-auto pt-8 ${alreadyIn ? 'hidden' : ''}`}>
        <button
          disabled={!preview || busy}
          onClick={() => setSheet('join')}
          className={buttonClass('primary')}
        >
          {preview ? `Join ${host}'s party` : 'Join party'}
        </button>
        <p className="mt-3 text-center text-xs text-ink-dim">Location shares after you join.</p>
      </div>

      <GuardianSheet
        open={sheet !== null}
        contacts={contacts}
        initial={guardian}
        confirmLabel={sheet === 'join' ? (busy ? 'Joining…' : `Join ${host}'s party`) : 'Save guardian'}
        onClose={() => setSheet(null)}
        onConfirm={(g) => {
          if (sheet === 'join') void join(g)
          else {
            setGuardian(g)
            setSheet(null)
          }
        }}
      />

      {scanning && (
        <QrScanner
          onCode={(c) => {
            setScanning(false)
            setCode(normalize(c))
          }}
          onClose={() => setScanning(false)}
        />
      )}
    </Screen>
  )
}
