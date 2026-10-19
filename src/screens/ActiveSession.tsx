import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type L from 'leaflet'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { AddPlaceSheet } from '@/components/AddPlaceSheet'
import { AlertTriangleIcon, CrosshairIcon, GearIcon, HomeIcon, PinIcon, PlusIcon, SendIcon, ShieldIcon, UserCheckIcon, UsersIcon } from '@/components/icons'
import { IncomingAlerts } from '@/components/IncomingAlerts'
import { LocationFix } from '@/components/LocationFix'
import { MapView } from '@/components/MapView'
import { MemberCard } from '@/components/MemberCard'
import { PeoplePanel } from '@/components/PeoplePanel'
import { PinSheet } from '@/components/PinSheet'
import { Button, ErrorText, Field, ListItem, Sheet } from '@/components/ui'
import { buttonClass } from '@/components/buttons'
import { WalletSheet } from '@/components/WalletSheet'
import { claimerName, raiseAlert } from '@/lib/alerts'
import { firstName } from '@/lib/format'
import { placeName, reverseGeocode } from '@/lib/geo'
import { LOCATION_OFF } from '@/lib/status'
import { supabase } from '@/lib/supabase'
import { toast, tryOrToast } from '@/lib/toast'
import { formatClock } from '@/lib/time'
import { withViewTransition } from '@/lib/transition'
import type { LatLng } from '@/lib/types'
import { useSessionCtx } from './session/context'

/**
 * The party screen. Members who are home (or ended their night) watch the
 * party read-only; everyone else gets the full party view.
 */
export function ActiveSession() {
  const { me } = useSessionCtx()
  if (me?.status === 'home') return <ObservingView />
  return <PartyView />
}

/**
 * Active party: people panel on top (faces with status badges, tap for the
 * full list), the map in the middle, and a safety panel at the bottom with
 * only Find me / Status / HELP, plus a slim bar for Settings, Invite and the
 * party menu.
 */
function PartyView() {
  const { userId } = useAuth()
  const navigate = useNavigate()
  const { session, members, pins, alerts, checkIns, me, profile, myPos, gpsStatus, retryGps, avatars, phones } = useSessionCtx()
  const [cardId, setCardId] = useState<string | null>(null)
  const cardMember = members.find((m) => m.id === cardId) ?? null
  const [wallet, setWallet] = useState(false)
  const [menu, setMenu] = useState(false)
  const [recenter, setRecenter] = useState(0)
  const [addOpen, setAddOpen] = useState(false)
  const [picking, setPicking] = useState(false)
  const [editPinId, setEditPinId] = useState<string | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const topH = useHeight(topRef, picking)
  const bottomH = useHeight(bottomRef, picking)
  const onReady = useCallback((m: L.Map) => {
    mapRef.current = m
  }, [])

  const myAlert = alerts.find((a) => a.member_id === me?.id && a.type === 'manual')
  const myClaimer = myAlert ? claimerName(myAlert, members) : null
  const home =
    profile?.home_lat != null && profile?.home_lng != null ? { lat: profile.home_lat, lng: profile.home_lng } : null
  const base = `/session/${session.id}`
  const editPin = pins.find((p) => p.id === editPinId) ?? null
  const partyName = session.name ?? pins[0]?.name ?? 'Night out'
  // Friends with an open alert get a pulsing ring on the map.
  const highlightIds = alerts.filter((a) => !a.resolved && a.member_id !== me?.id).map((a) => a.member_id)
  const openMember = (id: string) => withViewTransition(() => setCardId(id))

  function startPicking(at?: LatLng) {
    setAddOpen(false)
    setMenu(false)
    setPicking(true)
    if (at) mapRef.current?.panTo([at.lat, at.lng])
  }

  // Find me sends straight away. With nobody else in the party there's no one
  // to ping, so offer to invite friends or alert the guardian instead.
  const [findBusy, setFindBusy] = useState(false)
  const [soloOpen, setSoloOpen] = useState(false)
  async function findMe() {
    if (!me || findBusy) return
    if (members.length <= 1) {
      setSoloOpen(true)
      return
    }
    if (myAlert) {
      navigate(`${base}/ping`)
      return
    }
    setFindBusy(true)
    const ok = await tryOrToast("Couldn't send Find me", () => raiseAlert(me.id, 'ping'))
    setFindBusy(false)
    if (ok) toast(myPos ? 'Sent to your group with your location.' : `Sent. ${LOCATION_OFF}`, myPos ? 'success' : 'error')
  }
  async function alertGuardianInstead() {
    if (!me) return
    setSoloOpen(false)
    const ok = await tryOrToast("Couldn't alert your guardian", () => raiseAlert(me.id, 'alert'))
    if (ok) navigate(`${base}/ping`)
  }

  return (
    <>
      {/* Map in the middle (full-screen behind the panels). */}
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
            bottomPad={picking ? 0 : bottomH}
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
          {/* Top panel: people. */}
          <div className="pointer-events-none fixed inset-x-0 top-0 z-[800] flex justify-center">
            <div ref={topRef} className="w-full max-w-app px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
              <PeoplePanel
                title={partyName}
                endTime={session.end_time}
                members={members}
                me={me}
                checkIns={checkIns}
                avatars={avatars}
                phones={phones}
                myPos={myPos}
                onInvite={() => navigate(`${base}/invite`)}
                onMember={openMember}
              />
              <div className="pointer-events-auto mt-2">
                <IncomingAlerts alerts={alerts} members={members} me={me} userId={userId} position={myPos} mode="banners" />
              </div>
            </div>
          </div>

          {/* Recenter, floating just above the safety panel. */}
          <div className="pointer-events-none fixed inset-x-0 z-[850] flex justify-center" style={{ bottom: bottomH + 12 }}>
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

          {/* Bottom: the safety panel, then a slim bar. */}
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[900] flex justify-center">
            <div ref={bottomRef} className="pointer-events-auto w-full max-w-app rounded-t-[28px] bg-surface-low shadow-[0_-2px_12px_rgb(0_0_0/0.12)]">
              <div className="px-3 pt-3">
                <div className="-mt-3 mb-2 empty:hidden">
                  <LocationFix status={gpsStatus} onRetry={retryGps} />
                </div>
                {myAlert && (
                  <button
                    onClick={() => navigate(`${base}/ping`)}
                    className="mb-2 flex w-full items-center gap-2 truncate rounded-xl bg-status-alert/10 px-3 py-2 text-left text-sm font-medium text-status-alert"
                  >
                    <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-status-alert" />
                    <span className="min-w-0 flex-1 truncate">
                      {myClaimer
                        ? `${firstName(myClaimer)} is on it`
                        : myAlert.level === 'ping'
                          ? 'Find me sent, waiting for a friend'
                          : 'Help request sent'}
                      {!myPos ? ' · your location is off' : ''}
                    </span>
                    <span className="shrink-0">Open</span>
                  </button>
                )}
                <div className="grid grid-cols-[1fr_1.2fr_1fr] items-end gap-2">
                  <SafetyButton
                    label="Find me"
                    icon={<SendIcon width={28} height={28} strokeWidth={2.25} />}
                    className="bg-findme text-black"
                    disabled={findBusy}
                    onClick={() => void findMe()}
                  />
                  <SafetyButton
                    label="HELP"
                    icon={<AlertTriangleIcon width={30} height={30} strokeWidth={2.25} />}
                    className="bg-danger text-white shadow-e3"
                    big
                    onClick={() => navigate(`${base}/help`)}
                  />
                  <SafetyButton
                    label="Status"
                    icon={<UserCheckIcon width={28} height={28} strokeWidth={2.25} />}
                    className="bg-[#1a73e8] text-white"
                    onClick={() => navigate(`${base}/update`)}
                  />
                </div>
              </div>
              <nav aria-label="Party" className="mt-2 grid grid-cols-3 border-t border-line/70 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-1">
                <BarButton label="Settings" icon={<GearIcon width={22} height={22} />} onClick={() => navigate('/settings')} />
                <BarButton label="Invite" icon={<UsersIcon width={22} height={22} />} onClick={() => navigate(`${base}/invite`)} />
                <BarButton label="Party" icon={<MenuIcon />} onClick={() => setMenu(true)} />
              </nav>
            </div>
          </div>
        </>
      )}

      <Sheet open={menu} onClose={() => setMenu(false)} title={partyName}>
        <div className="-mx-4 divide-y divide-line/70">
          <ListItem leading={<ShieldIcon width={20} height={20} className="text-primary-ink" />} headline="Safety card" onClick={() => { setMenu(false); setWallet(true) }} />
          <ListItem leading={<PlusIcon width={20} height={20} className="text-primary-ink" />} headline="Add a location" onClick={() => { setMenu(false); setAddOpen(true) }} />
          <ListItem leading={<UsersIcon width={20} height={20} className="text-primary-ink" />} headline="Invite friends" onClick={() => navigate(`${base}/invite`)} />
          <ListItem leading={<HomeIcon width={20} height={20} className="text-primary-ink" />} headline="End my night" onClick={() => navigate(`${base}/home`)} />
        </div>
        <p className="mt-3 text-center text-xs text-ink-faint">Party ends {formatClock(session.end_time)}</p>
      </Sheet>

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

      <Sheet open={soloOpen} onClose={() => setSoloOpen(false)} title="No one else is in your party yet">
        <p className="text-base text-ink-dim">Find me goes to your friends in the party. Invite them, or alert your guardian now.</p>
        {!myPos && <p className="mt-3 rounded-xl bg-status-checkin/10 px-4 py-3 text-base font-medium text-status-checkin">{LOCATION_OFF}</p>}
        <button onClick={() => navigate(`${base}/invite`)} className={`mt-4 ${buttonClass('primary')}`}>
          <UsersIcon width={18} height={18} /> Invite friends
        </button>
        <button onClick={() => void alertGuardianInstead()} className={`mt-2 ${buttonClass('secondary')}`}>
          Alert my guardian instead
        </button>
      </Sheet>

      <WalletSheet open={wallet} onClose={() => setWallet(false)} profile={profile} me={me} />
    </>
  )
}

/**
 * Read-only party for members who are home (or ended their night): the map,
 * everyone's faces and statuses, live. Only action: call someone.
 */
function ObservingView() {
  const navigate = useNavigate()
  const { session, members, pins, checkIns, me, avatars, phones } = useSessionCtx()
  const [cardId, setCardId] = useState<string | null>(null)
  const cardMember = members.find((m) => m.id === cardId) ?? null
  const topRef = useRef<HTMLDivElement>(null)
  const topH = useHeight(topRef, false)
  const partyName = session.name ?? pins[0]?.name ?? 'the party'
  const stillOut = members.filter((m) => m.status !== 'home').length

  return (
    <>
      <div className="fixed inset-0 z-0 flex justify-center bg-surface">
        <div className="relative isolate h-full w-full max-w-app">
          <MapView members={members} pins={pins} myMemberId={me?.id} fitMode="auto" topPad={topH} bottomPad={96} onMemberClick={setCardId} avatars={avatars} />
        </div>
      </div>

      <div className="pointer-events-none fixed inset-x-0 top-0 z-[800] flex justify-center">
        <div ref={topRef} className="w-full max-w-app px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <PeoplePanel
            title={<>Watching {partyName}</>}
            endTime={session.end_time}
            members={members}
            me={me}
            checkIns={checkIns}
            avatars={avatars}
            phones={phones}
            myPos={null}
            onMember={setCardId}
          />
        </div>
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[900] flex justify-center">
        <div className="pointer-events-auto w-full max-w-app rounded-t-[28px] bg-surface-low px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-2px_12px_rgb(0_0_0/0.12)]">
          <p className="text-center text-sm text-ink-dim">
            You're home ✓ · {stillOut ? `${stillOut} still out` : 'everyone is home'}
          </p>
          <button onClick={() => navigate('/', { replace: true })} className={`mt-3 ${buttonClass('secondary')}`}>
            Leave party view
          </button>
        </div>
      </div>

      {cardMember && (
        <MemberCard
          member={cardMember}
          avatar={avatars[cardMember.id] ?? null}
          phone={phones[cardMember.id] ?? null}
          myPos={null}
          isMe={cardMember.id === me?.id}
          onClose={() => setCardId(null)}
        />
      )}
    </>
  )
}

/** Live height of an element (0 when hidden), for map padding. */
function useHeight(ref: React.RefObject<HTMLElement>, dep: unknown) {
  const [h, setH] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setH(el.offsetHeight)
    const ro = new ResizeObserver(() => setH(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, dep])
  return h
}

/** Big, bright, one-tap safety button: icon + one word. */
function SafetyButton({
  label,
  icon,
  className,
  onClick,
  disabled,
  big,
}: {
  label: string
  icon: ReactNode
  className: string
  onClick: () => void
  disabled?: boolean
  /** HELP: taller, in the middle. */
  big?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center justify-center gap-1.5 rounded-[24px] shadow-e1 active:scale-[0.97] disabled:opacity-60 ${big ? 'min-h-[112px]' : 'min-h-[92px]'} ${className}`}
    >
      {icon}
      <span className="text-lg font-bold tracking-wide">{label}</span>
    </button>
  )
}

/** Slim bottom-bar item, same style as the home tab bar. */
function BarButton({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex min-h-[48px] flex-col items-center justify-center gap-0.5 text-ink-faint active:text-primary-ink">
      {icon}
      <span className="text-xs font-semibold">{label}</span>
    </button>
  )
}

function MenuIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </svg>
  )
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
