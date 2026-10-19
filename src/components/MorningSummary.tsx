import { useNavigate } from 'react-router-dom'
import { firstName } from '@/lib/format'
import { formatClock } from '@/lib/time'
import type { Member } from '@/lib/types'
import { Avatar } from './Avatar'

const homeAt = (m: Member) => (m.rule_state?.home_at as string | undefined) ?? null

/** End of the party: soft green, one warm line, a quiet arrival log, Close. */
export function MorningSummary({
  members,
  avatars,
  partyName,
}: {
  members: Member[]
  avatars: Record<string, string | null>
  partyName?: string | null
}) {
  const navigate = useNavigate()
  const real = [...members].sort((a, b) => (homeAt(a) ?? '9').localeCompare(homeAt(b) ?? '9'))
  const everyone = real.length > 0 && real.every((m) => m.status === 'home')

  return (
    <div className="fixed inset-0 z-[1500] flex animate-enter justify-center bg-[#cdeedd] text-[#103a26]">
      <div className="flex w-full max-w-app flex-col px-7 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(4rem,env(safe-area-inset-top))]">
        <div className="flex flex-1 flex-col justify-center">
          {partyName && <p className="mb-2 text-xs font-medium uppercase tracking-wider opacity-60">{partyName}</p>}
          <p className="text-3xl font-normal leading-tight tracking-tight">
            {everyone ? 'Everyone made it home.' : 'The party’s over.'}
          </p>
          <p className="mt-2 text-xl opacity-80">Hope tonight was a good one.</p>

          <ul className="mt-10 flex flex-col gap-3">
            {real.map((m) => (
              <li key={m.id} className="flex items-center gap-3 text-[15px]">
                <Avatar name={m.name} url={avatars[m.id]} size={30} />
                <span className="flex-1 font-semibold">{firstName(m.name)}</span>
                <span className="tabular-nums opacity-70">
                  {m.status === 'home' ? (homeAt(m) ? formatClock(homeAt(m)!) : 'Home') : 'Not home'}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <button
          onClick={() => navigate('/', { replace: true })}
          className="min-h-[52px] w-full rounded-full bg-[#103a26] text-lg font-medium text-[#cdeedd] transition active:scale-[0.98]"
        >
          Close
        </button>
      </div>
    </div>
  )
}
