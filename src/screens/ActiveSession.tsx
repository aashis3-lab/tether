import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type L from 'leaflet'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { AddPlaceSheet } from '@/components/AddPlaceSheet'
import { AlertTriangleIcon, CrosshairIcon, GearIcon, MoonIcon, PinIcon, SendIcon, UserCheckIcon, UsersIcon } from '@/components/icons'
import { IncomingAlerts } from '@/components/IncomingAlerts'
import { LocationFix } from '@/components/LocationFix'
import { MapView } from '@/components/MapView'
import { MemberCard } from '@/components/MemberCard'
import { PartyWatch } from '@/components/PartyWatch'
import { PeoplePanel } from '@/components/PeoplePanel'
import { PinSheet } from '@/components/PinSheet'
import { Button, ErrorText, Field, Sheet } from '@/components/ui'
import { buttonClass } from '@/components/buttons'
import { claimerName, raiseAlert } from '@/lib/alerts'
import { firstName } from '@/lib/format'
import { placeName, reverseGeocode } from '@/lib/geo'
import { LOCATION_OFF } from '@/lib/status'
import { supabase } from '@/lib/supabase'
import { toast, tryOrToast } from '@/lib/toast'
import { withViewTransition } from '@/lib/transition'
import type { LatLng } from '@/lib/types'
import { useElementHeight } from '@/hooks/useElementHeight'
import { useSwipe } from '@/hooks/useSwipe'
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
  const [bigPanel, setBigPanel] = useState(false)
  const panelSwipe = useSwipe({ onTap: () => setBigPanel((b) => !b), onUp: () => setBigPanel(true), onDown: () => setBigPanel(false) })
  const [recenter, setRecenter] = useState(0)
  const [addOpen, setAddOpen] = useState(false)
  const [picking, setPicking] = useState(false)
  const [editPinId, setEditPinId] = useState<string | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const topH = useElementHeight(topRef, picking)
  const bottomH = useElementHeight(bottomRef, picking)
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
                footer={
                  <button onClick={() => setAddOpen(true)} className="flex h-10 items-center gap-2 rounded-full px-1 text-sm font-semibold text-primary-ink">
                    <PinIcon width={18} height={18} /> Add a place
                  </button>
                }
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

          {/* Bottom: the safety panel (tap or swipe the handle to make it bigger), then a slim bar. */}
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[900] flex justify-center">
            <div ref={bottomRef} className="pointer-events-auto relative z-10 w-full max-w-app rounded-t-[28px] bg-surface-low shadow-[0_-2px_12px_rgb(0_0_0/0.12)]">
              <button
                {...panelSwipe}
                aria-label={bigPanel ? 'Make the safety buttons smaller' : 'Make the safety buttons bigger'}
                aria-expanded={bigPanel}
                className="flex h-6 w-full items-center justify-center"
              >
                <span className="h-1 w-10 rounded-full bg-outline/50" />
              </button>
              <div className="px-3">
                <div className="mb-2 empty:hidden">
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
                    icon={<SendIcon width={bigPanel ? 34 : 28} height={bigPanel ? 34 : 28} strokeWidth={2.25} />}
                    className="bg-findme text-black"
                    disabled={findBusy}
                    size={bigPanel ? 'xl' : 'md'}
                    onClick={() => void findMe()}
                  />
                  <SafetyButton
                    label="HELP"
                    icon={<AlertTriangleIcon width={bigPanel ? 38 : 30} height={bigPanel ? 38 : 30} strokeWidth={2.25} />}
                    className="bg-danger text-white shadow-e3"
                    size={bigPanel ? 'xxl' : 'lg'}
                    onClick={() => navigate(`${base}/help`)}
                  />
                  <SafetyButton
                    label="Status"
                    icon={<UserCheckIcon width={bigPanel ? 34 : 28} height={bigPanel ? 34 : 28} strokeWidth={2.25} />}
                    className="bg-[#1a73e8] text-white"
                    size={bigPanel ? 'xl' : 'md'}
                    onClick={() => navigate(`${base}/update`)}
                  />
                </div>
                {/* End my night: always here, muted (not red, not pink). */}
                <button
                  onClick={() => navigate(`${base}/home`)}
                  className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-surface-highest text-base font-bold text-ink-dim active:scale-[0.99]"
                >
                  <MoonIcon width={18} height={18} /> End my night
                </button>
              </div>
              <nav aria-label="Party" className="mt-2 grid grid-cols-2 border-t border-line/70 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-1">
                <BarButton label="Profile" icon={<GearIcon width={22} height={22} />} onClick={() => navigate('/profile')} />
                <BarButton label="Invite" icon={<UsersIcon width={22} height={22} />} onClick={() => navigate(`${base}/invite`)} />
              </nav>
            </div>
          </div>
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

    </>
  )
}

/**
 * Read-only party for members who are home (or ended their night): the map,
 * everyone's faces and statuses, live. Only action: call someone.
 */
function ObservingView() {
  const navigate = useNavigate()
  const { session, members, pins, me, avatars, phones } = useSessionCtx()
  const stillOut = members.filter((m) => m.status !== 'home').length
  const leave = () => navigate('/', { replace: true })
  return (
    <PartyWatch
      partyName={session.name ?? pins[0]?.name ?? 'the party'}
      endTime={session.end_time}
      members={members}
      pins={pins}
      avatars={avatars}
      phones={phones}
      meId={me?.id}
      onExit={leave}
      bottom={
        <>
          <p className="text-center text-sm text-ink-dim">
            You're home ✓ · {stillOut ? `${stillOut} still out` : 'everyone is home'}
          </p>
          <button onClick={leave} className={`mt-3 ${buttonClass('secondary')}`}>
            Leave party view
          </button>
        </>
      }
    />
  )
}


/** Big, bright, one-tap safety button: icon + one word. */
function SafetyButton({
  label,
  icon,
  className,
  onClick,
  disabled,
  size,
}: {
  label: string
  icon: ReactNode
  className: string
  onClick: () => void
  disabled?: boolean
  size: 'md' | 'lg' | 'xl' | 'xxl'
}) {
  const h = { md: 'min-h-[92px]', lg: 'min-h-[112px]', xl: 'min-h-[132px]', xxl: 'min-h-[156px]' }[size]
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center justify-center gap-1.5 rounded-[24px] shadow-e1 transition-[min-height] duration-300 active:scale-[0.97] disabled:opacity-60 ${h} ${className}`}
    >
      {icon}
      <span className={`font-bold tracking-wide ${size === 'xl' || size === 'xxl' ? 'text-xl' : 'text-lg'}`}>{label}</span>
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
