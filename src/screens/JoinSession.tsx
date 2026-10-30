import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { TabScreen } from '@/components/BottomNav'
import { Avatar } from '@/components/Avatar'
import { GuardianSheet } from '@/components/GuardianSheet'
import { ChevronRightIcon, QrIcon } from '@/components/icons'
import { QrScanner } from '@/components/QrScanner'
import { Header, ErrorText, Title, inputClass } from '@/components/ui'
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
  const { profile } = useAuth()
  const navigate = useNavigate()

  const contacts = profileContacts(profile)
  const [code, setCode] = useState(normalize(codeParam ?? ''))
  const [preview, setPreview] = useState<Preview | null>(null)
  const [guardian, setGuardian] = useState<Contact | null>(contacts[0] ?? null)
  const [sheet, setSheet] = useState<null | 'guardian' | 'join'>(null)
  const [scanning, setScanning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const lookup = useCallback(async (c: string) => {
    setError('')
    setPreview(null)
    const { data, error: err } = await supabase.rpc('session_preview', { p_join_code: c })
    const row = (data as Preview[] | null)?.[0]
    if (err) setError(err.message)
    else if (!row) setError('No active party with that code.')
    else setPreview(row)
  }, [])

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
    <TabScreen>
      <Header title="Join" />
      <Title>Join a party</Title>

      <label className="mt-5 block">
        <span className="mb-2 block text-sm font-semibold">Invite code</span>
        <input
          value={formatCode(code)}
          onChange={(e) => setCode(normalize(e.target.value))}
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="K7M 4QX"
          className={`${inputClass} text-xl font-semibold tracking-wide`}
          autoFocus={!codeParam}
        />
      </label>

      <button
        onClick={() => setScanning(true)}
        className="mt-3 flex min-h-tap w-full items-center gap-3 rounded-xl2 border border-white/10 bg-bg-card px-4 text-lg font-semibold active:scale-[0.98]"
      >
        <QrIcon width={22} height={22} className="text-accent-orange" />
        Scan QR
      </button>

      {preview && <h2 className="mt-6 text-2xl font-bold">Is this your group?</h2>}
      {preview && (
        <div className="mt-3 rounded-xl2 bg-bg-card p-5">
          <p className="text-2xl font-bold">{preview.party_name || `${host}'s party`}</p>
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
            {preview.venue_name ? `${preview.venue_name} • ` : 'Until '}
            {formatClock(preview.end_time)}
          </p>
          <p className="mt-2 text-base text-ink-dim">Stays open until everyone gets home.</p>
        </div>
      )}

      {preview && (
        <button
          onClick={() => setSheet('guardian')}
          className="mt-3 flex min-h-tap w-full items-center gap-3 rounded-xl2 bg-bg-card px-4 py-3 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{guardian ? `${guardian.name} • Guardian` : 'Choose a guardian'}</span>
            <span className="block text-base text-ink-dim">Your at-home contact</span>
          </span>
          <ChevronRightIcon width={20} height={20} className="text-ink-dim" />
        </button>
      )}

      <div className="mt-4">
        <ErrorText>{error}</ErrorText>
      </div>

      <div className="mt-auto pt-8">
        <button
          disabled={!preview || busy}
          onClick={() => setSheet('join')}
          className={buttonClass('primary')}
        >
          {preview ? `Join ${host}'s party` : 'Join party'}
        </button>
        <p className="mt-3 text-center text-base text-ink-dim">Location shares after you join.</p>
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
    </TabScreen>
  )
}
