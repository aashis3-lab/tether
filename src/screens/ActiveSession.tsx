import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type L from 'leaflet'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { AddPlaceSheet } from '@/components/AddPlaceSheet'
import { Avatar } from '@/components/Avatar'
import { BottomSheet, type SheetSnap } from '@/components/BottomSheet'
import { AvatarStack, FriendList } from '@/components/GroupWidget'
import { AlertTriangleIcon, CrosshairIcon, GearIcon, HomeIcon, PinIcon, PlusIcon, SendIcon, ShieldIcon, UserCheckIcon, UsersIcon, XIcon } from '@/components/icons'
import { IncomingAlerts } from '@/components/IncomingAlerts'
import { LocationFix } from '@/components/LocationFix'
import { MapView } from '@/components/MapView'
import { MemberCard } from '@/components/MemberCard'
import { PinSheet } from '@/components/PinSheet'
import { Button, ErrorText, Field, IconButton, ListItem, ListSection, StatusChip } from '@/components/ui'
import { buttonClass } from '@/components/buttons'
import { WalletSheet } from '@/components/WalletSheet'
import { claimerName } from '@/lib/alerts'
import { firstName } from '@/lib/format'
import { placeName, reverseGeocode } from '@/lib/geo'
import { groupMeta, groupState, TONE_TEXT } from '@/lib/status'
import { supabase } from '@/lib/supabase'
import { formatClock } from '@/lib/time'
import { withViewTransition } from '@/lib/transition'
import type { LatLng } from '@/lib/types'
import { useSessionCtx } from './session/context'

/**
 * Active party, Google Maps-style: full-screen map, a floating search-bar
 * card with the group status, and a draggable sheet. The peek shows the group
 * summary, Find me / Status and the always-visible HELP button; expanded, it
 * lists everyone.
 */
export function ActiveSession() {
  const { userId } = useAuth()
  const navigate = useNavigate()
  const { session, members, pins, alerts, checkIns, me, profile, myPos, gpsStatus, retryGps, avatars, phones } = useSessionCtx()
  const [cardId, setCardId] = useState<string | null>(null)
  const cardMember = members.find((m) => m.id === cardId) ?? null
  const [snap, setSnap] = useState<SheetSnap>('collapsed')
  const [sheetH, setSheetH] = useState(200)
  const [wallet, setWallet] = useState(false)
  const [recenter, setRecenter] = useState(0)
  const [addOpen, setAddOpen] = useState(false)
  const [picking, setPicking] = useState(false)
  const [editPinId, setEditPinId] = useState<string | null>(null)
  // Right after starting a party (or while you're the only one in it), nudge
  // toward inviting friends instead of a separate "Start this night" step.
  const justStarted = Boolean((useLocation().state as { invitePrompt?: boolean } | null)?.invitePrompt)
  const [inviteDismissed, setInviteDismissed] = useState(false)
  const showInvite = !inviteDismissed && (justStarted || members.length === 1)
  const mapRef = useRef<L.Map | null>(null)
  // Height of the summary bar + banners, so the map fits everyone below it.
  const topRef = useRef<HTMLDivElement>(null)
  const [topH, setTopH] = useState(140)
  useEffect(() => {
    const el = topRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setTopH(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [picking])
  const onReady = useCallback((m: L.Map) => {
    mapRef.current = m
  }, [])

  const summary = groupState(members, alerts, me?.id)
  const myAlert = alerts.find((a) => a.member_id === me?.id && a.type === 'manual')
  const myClaimer = myAlert ? claimerName(myAlert, members) : null
  const home =
    profile?.home_lat != null && profile?.home_lng != null ? { lat: profile.home_lat, lng: profile.home_lng } : null
  const base = `/session/${session.id}`
  const editPin = pins.find((p) => p.id === editPinId) ?? null

  function startPicking(at?: LatLng) {
    setAddOpen(false)
    setPicking(true)
    if (at) mapRef.current?.panTo([at.lat, at.lng])
  }

  const awayCount = members.filter((m) => m.status === 'separated' || m.status === 'left_alone').length
  const chip =
    summary.tone === 'alert'
      ? 'Help needed'
      : summary.tone === 'checkin'
        ? `${awayCount || 1} separated`
        : members.length <= 1
          ? 'Just you'
          : 'All together'
  const venue = pins[0]?.name ?? null
  const partyName = session.name ?? venue ?? 'Night out'
  // Friends with an open alert get a pulsing ring on the map.
  const highlightIds = alerts.filter((a) => !a.resolved && a.member_id !== me?.id).map((a) => a.member_id)
  const openMember = (id: string) => withViewTransition(() => setCardId(id))

  return (
    <>
      {/* Full-screen map background. */}
      <div className="fixed inset-0 z-0 flex justify-center bg-surface">
        <div className="relative isolate h-full w-full max-w-app">
          <MapView
            members={members}
            pins={pins}
            home={home}
            myMemberId={me?.id}
            fitMode="auto"
            fitPaused={picking}
            recenterSignal={recenter}
            bottomPad={picking ? 0 : sheetH}
            topPad={picking ? 0 : topH}
            onMemberClick={openMember}
            onLongPress={(p) => startPicking(p)}
            onPinClick={(id) => setEditPinId(id)}
            onReady={onReady}
            avatars={avatars}
            highlightIds={highlightIds}
          />
          {picking && (
            <div className="pointer-events-none absolute inset-0 z-[600] flex items-center justify-center">
              {/* Fixed pin; its tip marks the spot. */}
              <PinIcon width={48} height={48} strokeWidth={2} className="-translate-y-6 fill-primary/20 text-primary drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]" />
            </div>
          )}
        </div>
      </div>

      {picking ? (
        <PickOnMap
          sessionId={session.id}
          map={mapRef.current}
          onCancel={() => setPicking(false)}
          onDone={() => setPicking(false)}
        />
      ) : (
        <>
          {/* Floating search-bar card: party, status chip, venue. */}
          <div className="pointer-events-none fixed inset-x-0 top-0 z-[800] flex justify-center">
            <div ref={topRef} className="w-full max-w-app px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
              <div className="glass pointer-events-auto flex min-h-[56px] items-center gap-2 rounded-[28px] py-1.5 pl-3 pr-1.5 shadow-e2">
                <img src="/icons/logo-mark.png" alt="" className="h-7 w-auto shrink-0" />
                <button
                  onClick={() => setSnap(snap === 'collapsed' ? 'half' : 'collapsed')}
                  aria-label={`${partyName}. ${summary.line}. Show everyone`}
                  className="min-w-0 flex-1 rounded-xl px-1 text-left"
                >
                  <span className="block truncate text-lg font-medium leading-tight">{partyName}</span>
                  <span className="block truncate text-xs text-ink-dim">
                    {venue && venue !== partyName ? `${venue} · ` : ''}Ends {formatClock(session.end_time)}
                  </span>
                </button>
                <StatusChip tone={summary.tone}>{chip}</StatusChip>
                <button onClick={() => navigate('/settings')} aria-label="Profile and settings" className="ml-0.5 shrink-0 rounded-full p-1">
                  <Avatar name={profile?.name ?? me?.name ?? '?'} url={profile?.avatar_url} size={32} />
                </button>
              </div>

              {/* Google Maps-style chip row. */}
              <div className="pointer-events-auto -mx-3 mt-2 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none]">
                <MapChip icon={<ShieldIcon width={16} height={16} />} onClick={() => setWallet(true)}>
                  Safety card
                </MapChip>
                <MapChip icon={<UsersIcon width={16} height={16} />} onClick={() => navigate(`${base}/invite`)}>
                  Invite
                </MapChip>
                <MapChip icon={<PlusIcon width={16} height={16} />} onClick={() => setAddOpen(true)}>
                  Add place
                </MapChip>
                <MapChip icon={<HomeIcon width={16} height={16} />} onClick={() => navigate(`${base}/home`)}>
                  Get home
                </MapChip>
              </div>

              <div className="pointer-events-auto mt-1">
                <IncomingAlerts alerts={alerts} members={members} me={me} userId={userId} position={myPos} mode="banners" />
              </div>
            </div>
          </div>

          {showInvite && snap === 'collapsed' && (
            <div className="pointer-events-none fixed inset-x-0 z-[860] flex justify-center" style={{ bottom: sheetH + 68 }}>
              <div className="glass pointer-events-auto mx-3 w-full max-w-[calc(430px-1.5rem)] animate-enter rounded-2xl p-4 shadow-e3">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-container text-primary-on-container">
                    <UsersIcon width={20} height={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-medium">{justStarted ? 'Your party is live' : 'Just you so far'}</p>
                    <p className="mt-0.5 text-base text-ink-dim">Invite friends so Tether can watch out for everyone.</p>
                  </div>
                  <IconButton label="Dismiss" onClick={() => setInviteDismissed(true)} className="-mr-2 -mt-2">
                    <XIcon width={18} height={18} />
                  </IconButton>
                </div>
                <div className="mt-2 flex justify-end gap-2">
                  <button onClick={() => navigate(`${base}/invite`)} className={`${buttonClass('primary')} !w-auto`}>
                    Invite friends
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Recenter, floating just above the sheet. */}
          {snap !== 'full' && (
            <div className="pointer-events-none fixed inset-x-0 z-[850] flex justify-center" style={{ bottom: sheetH + 12 }}>
              <div className="flex w-full max-w-app justify-end px-4">
                <button
                  aria-label="Show everyone"
                  title="Show everyone"
                  onClick={() => setRecenter((n) => n + 1)}
                  className="glass pointer-events-auto flex h-12 w-12 items-center justify-center rounded-2xl text-me shadow-e2 active:scale-95"
                >
                  <CrosshairIcon width={22} height={22} />
                </button>
              </div>
            </div>
          )}

          <BottomSheet
            snap={snap}
            onSnap={setSnap}
            onHeight={setSheetH}
            header={
              <div className="pb-3">
                {/* Peek: who's here, how spread out, how fresh. */}
                <div className="flex items-center gap-3 pb-3">
                  <AvatarStack members={members} avatars={avatars} />
                  <div className="min-w-0 flex-1" aria-live="polite">
                    <p className={`truncate text-lg font-medium ${summary.tone === 'calm' ? 'text-ink' : TONE_TEXT[summary.tone]}`}>
                      {summary.line}
                    </p>
                    <p className="truncate text-xs text-ink-dim">
                      {groupMeta(members, me, myPos)}
                      {summary.sub ? ` · ${summary.sub}` : ''}
                    </p>
                  </div>
                </div>

                {myAlert && (
                  <button
                    onClick={() => navigate(`${base}/ping`)}
                    className="mb-2 flex w-full items-center gap-2 truncate rounded-xl bg-status-alert/10 px-3 py-2 text-left text-sm font-medium text-status-alert"
                  >
                    <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-status-alert" />
                    <span className="min-w-0 flex-1 truncate">{myClaimer ? `${firstName(myClaimer)} is on it` : 'Help request sent'}</span>
                    <span className="shrink-0">Open</span>
                  </button>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => navigate(`${base}/ping`)}
                    className="flex min-h-tap items-center justify-center gap-2 rounded-full bg-findme/25 px-4 text-base font-medium text-ink active:scale-[0.98] dark:bg-findme/20"
                  >
                    <SendIcon width={18} height={18} /> Find me
                  </button>
                  <button
                    onClick={() => navigate(`${base}/update`)}
                    className="flex min-h-tap items-center justify-center gap-2 rounded-full bg-secondary-container px-4 text-base font-medium text-secondary-on-container active:scale-[0.98]"
                  >
                    <UserCheckIcon width={18} height={18} /> Status
                  </button>
                </div>

                {/* HELP stays big and always visible. */}
                <button
                  onClick={() => navigate(`${base}/help`)}
                  className="mt-2 flex min-h-[64px] w-full items-center justify-center gap-3 rounded-2xl bg-danger px-4 text-white shadow-e1 active:scale-[0.99]"
                >
                  <AlertTriangleIcon width={26} height={26} strokeWidth={2} />
                  <span className="text-left">
                    <span className="block text-2xl font-semibold leading-tight tracking-wide">HELP</span>
                    <span className="block text-xs text-white/85">Alerts your group and guardian</span>
                  </span>
                </button>
              </div>
            }
          >
            <LocationFix status={gpsStatus} onRetry={retryGps} />

            <div className="mt-2 flex items-center justify-between">
              <h2 className="text-sm font-medium text-primary-ink">In this group · {members.length}</h2>
              <button onClick={() => navigate(`${base}/invite`)} className="flex h-9 items-center gap-1 rounded-full px-3 text-sm font-medium text-primary-ink">
                <PlusIcon width={16} height={16} /> Invite
              </button>
            </div>
            <FriendList
              members={members}
              me={me}
              checkIns={checkIns}
              avatars={avatars}
              phones={phones}
              myPos={myPos}
              activeId={cardId}
              onMemberTap={(m) => openMember(m.id)}
            />

            <ListSection title="Tonight" className="-mx-1">
              <ListItem
                leading={<RowIcon><PlusIcon width={20} height={20} /></RowIcon>}
                headline="Add a place"
                supporting={pins.length ? `${pins.length} on the map · or long-press the map` : 'Or long-press the map to drop a pin'}
                onClick={() => setAddOpen(true)}
              />
              <ListItem
                leading={<RowIcon><ShieldIcon width={20} height={20} /></RowIcon>}
                headline="Safety card"
                supporting="Emergency contact, guardian and medical info"
                onClick={() => setWallet(true)}
              />
              <ListItem
                leading={<RowIcon><GearIcon width={20} height={20} /></RowIcon>}
                headline="Settings"
                supporting="Profile, guardian, keychain, appearance"
                onClick={() => navigate('/settings')}
              />
              <ListItem
                leading={<RowIcon><HomeIcon width={20} height={20} /></RowIcon>}
                headline="End my night"
                supporting={`Get home safely · party ends ${formatClock(session.end_time)}`}
                onClick={() => navigate(`${base}/home`)}
              />
            </ListSection>

            <div className="mt-5 flex items-center justify-center gap-1.5 text-xs text-ink-faint">
              <img src="/icons/logo-mark.png" alt="" className="h-4 w-auto opacity-70" />
              <span className="font-medium">tether</span>
            </div>
          </BottomSheet>
        </>
      )}

      {addOpen && (
        <AddPlaceSheet
          sessionId={session.id}
          pins={pins}
          near={myPos}
          onPickOnMap={() => startPicking()}
          onClose={() => setAddOpen(false)}
        />
      )}

      {editPin && <PinSheet key={editPin.id} sessionId={session.id} pin={editPin} onClose={() => setEditPinId(null)} />}

      {cardMember && (
        <MemberCard
          member={cardMember}
          avatar={avatars[cardMember.id] ?? null}
          phone={phones[cardMember.id] ?? null}
          myPos={myPos}
          isMe={cardMember.id === me?.id}
          onClose={() => withViewTransition(() => setCardId(null))}
        />
      )}

      <WalletSheet open={wallet} onClose={() => setWallet(false)} profile={profile} me={me} />
    </>
  )
}

/** Translucent chip floating over the map. */
function MapChip({ icon, children, onClick }: { icon: ReactNode; children: ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="glass flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium text-ink shadow-e1 active:scale-95"
    >
      <span className="text-ink-dim">{icon}</span>
      {children}
    </button>
  )
}

function RowIcon({ children }: { children: ReactNode }) {
  return <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary-container/70 text-secondary-on-container">{children}</span>
}

/**
 * Uber-style "Pick on map": the pin stays fixed in the middle, you drag the
 * map under it; the address updates as you go.
 */
function PickOnMap({
  sessionId,
  map,
  onCancel,
  onDone,
}: {
  sessionId: string
  map: L.Map | null
  onCancel: () => void
  onDone: () => void
}) {
  const [spot, setSpot] = useState<LatLng | null>(null)
  const [address, setAddress] = useState('')
  const [name, setName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!map) return
    let t: number | undefined
    let seq = 0
    const update = () => {
      const c = map.getCenter()
      const here = { lat: c.lat, lng: c.lng }
      setSpot(here)
      setAddress('Finding address…')
      window.clearTimeout(t)
      const mine = ++seq
      t = window.setTimeout(async () => {
        const [short, full] = await Promise.all([placeName(here), reverseGeocode(here)])
        if (mine !== seq) return
        setAddress(full ? full.split(',').slice(0, 3).join(',') : 'Unknown address')
        if (!nameTouched) setName(short ?? '')
      }, 450)
    }
    const onMove = () => setSpot({ lat: map.getCenter().lat, lng: map.getCenter().lng })
    update()
    map.on('move', onMove)
    map.on('moveend', update)
    return () => {
      window.clearTimeout(t)
      map.off('moveend', update)
      map.off('move', onMove)
    }
  }, [map, nameTouched])

  async function add() {
    if (!spot) return
    setBusy(true)
    const { error: err } = await supabase
      .from('pins')
      .insert({ session_id: sessionId, name: name.trim() || 'Place', lat: spot.lat, lng: spot.lng, radius_m: 150 })
    setBusy(false)
    if (err) setError(err.message)
    else onDone()
  }

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[800] flex justify-center">
        <div className="w-full max-w-app px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <p className="glass rounded-full px-4 py-3 text-center text-base font-medium shadow-e2">
            Drag the map to put the pin on the spot
          </p>
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-[900] flex justify-center">
        <div className="w-full max-w-app rounded-t-[28px] bg-surface-low p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-e3">
          <p className="mb-3 truncate text-xs text-ink-dim">{address}</p>
          <Field
            label="Name"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setNameTouched(true)
            }}
            placeholder="Name this spot"
          />
          <div className="mt-2">
            <ErrorText>{error}</ErrorText>
          </div>
          <Button big className="mt-3" disabled={busy || !spot} onClick={add}>
            {busy ? 'Adding…' : 'Add this spot'}
          </Button>
          <Button variant="text" className="mt-1" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </>
  )
}
