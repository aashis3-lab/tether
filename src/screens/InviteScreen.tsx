import { useNavigate } from 'react-router-dom'
import { InviteCard } from '@/components/InviteCard'
import { Header, Eyebrow, Screen, Title } from '@/components/ui'
import { buttonClass } from '@/components/buttons'
import { useSessionCtx } from './session/context'

/** "Make a plan", share the code right after starting a party. */
export function InviteScreen() {
  const navigate = useNavigate()
  const { session, members } = useSessionCtx()
  const creator = members.find((m) => m.user_id === session.creator_id)
  const first = creator?.name.trim().split(/\s+/)[0]

  return (
    <Screen>
      <Header title="Invite friends" back={`/session/${session.id}`} />
      <Eyebrow tone="orange">{first ? `${first}'s party` : 'Party'}</Eyebrow>
      <Title className="mb-5 mt-1">{session.name || 'Invite your friends'}</Title>
      <InviteCard code={session.join_code} />
      {members.length > 1 && (
        <p className="mt-3 text-center text-ink-dim">
          {members.length - 1} {members.length === 2 ? 'friend has' : 'friends have'} joined
        </p>
      )}
      <div className="mt-auto pt-8">
        <button
          onClick={() => navigate(`/session/${session.id}`, { replace: true })}
          className={buttonClass('primary')}
        >
          Start this night
        </button>
      </div>
    </Screen>
  )
}
