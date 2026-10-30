import { useCallback, useEffect, useRef, useState } from 'react'
import type L from 'leaflet'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { AddPlaceSheet } from '@/components/AddPlaceSheet'
import { Avatar } from '@/components/Avatar'
import { BottomSheet, type SheetSnap } from '@/components/BottomSheet'
import { GroupWidget } from '@/components/GroupWidget'
import { AlertTriangleIcon, CrosshairIcon, GearIcon, PinIcon, PlusIcon, SendIcon, ShieldIcon, UserCheckIcon, XIcon } from '@/components/icons'
import { IncomingAlerts } from '@/components/IncomingAlerts'
import { LocationFix } from '@/components/LocationFix'
import { MapView } from '@/components/MapView'
import { MemberCard } from '@/components/MemberCard'
import { PinSheet } from '@/components/PinSheet'
import { Button, ErrorText, Field } from '@/components/ui'
import { buttonClass } from '@/components/buttons'
import { WalletSheet } from '@/components/WalletSheet'
import { claimerName } from '@/lib/alerts'
import { firstName } from '@/lib/format'
import { placeName, reverseGeocode } from '@/lib/geo'
import { groupState } from '@/lib/status'
import { supabase } from '@/lib/supabase'
import { formatClock } from '@/lib/time'
import type { LatLng } from '@/lib/types'
import { useSessionCtx } from './session/context'

/**
 * Active party, Find My-style: full-screen map, the group widget on top (the
 * only place statuses live), and a sheet with PING / HELP / Update.
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

  return (
    <>
      {/* Full-screen map background. */}
      <div className="fixed inset-0 z-0 flex justify-center bg-bg">
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
            onMemberClick={(id) => setCardId(id)}
            onLongPress={(p) => startPicking(p)}
            onPinClick={(id) => setEditPinId(id)}
            onReady={onReady}
            avatars={avatars}
          />
          {picking && (
            <div className="pointer-events-none absolute inset-0 z-[600] flex items-center justify-center">
              {/* Fixed pin; its tip marks the spot. */}
              <PinIcon width={52} height={52} className="-translate-y-6 text-accent-pink drop-shadow-[0_3px_8px_rgba(0,0,0,0.9)]" />
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
          {/* Summary bar: the group's state in one colored line. */}
          <div className="pointer-events-none fixed inset-x-0 top-0 z-[800] flex justify-center">
            <div ref={topRef} className="w-full max-w-app px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
              <div className="pointer-events-auto">
                <GroupWidget members={members} me={me} checkIns={checkIns} avatars={avatars} myPos={myPos} state={summary} partyName={session.name ?? pins[0]?.name ?? null} onMemberTap={(m) => setCardId(m.id)} />
              </div>
              <div className="mt-2 flex justify-end">
                <button
                  onClick={() => setWallet(true)}
                  className="pointer-events-auto flex min-h-[44px] items-center gap-2 rounded-full border border-white/20 bg-bg-card/95 px-4 text-base font-bold shadow-lg backdrop-blur active:scale-95"
                >
                  <ShieldIcon width={18} height={18} /> Safety card
                </button>
              </div>
              <div className="pointer-events-auto mt-2">
                <IncomingAlerts alerts={alerts} members={members} me={me} userId={userId} position={myPos} mode="banners" />
              </div>
            </div>
          </div>

          {showInvite && snap === 'collapsed' && (
            <div className="pointer-events-none fixed inset-x-0 z-[860] flex justify-center" style={{ bottom: sheetH + 72 }}>
              <div className="pointer-events-auto mx-3 w-full max-w-[calc(430px-1.5rem)] animate-enter rounded-2xl bg-bg-raised/95 p-4 shadow-[0_8px_30px_rgba(0,0,0,0.6)] backdrop-blur">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xl font-bold">{justStarted ? 'Your party is live!' : 'Just you so far'}</p>
                    <p className="mt-0.5 text-base text-ink-dim">Invite friends so Tether can watch out for everyone.</p>
                  </div>
                  <button
                    aria-label="Dismiss"
                    onClick={() => setInviteDismissed(true)}
                    className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center text-ink-dim"
                  >
                    <XIcon width={20} height={20} />
                  </button>
                </div>
                <button onClick={() => navigate(`${base}/invite`)} className={`mt-3 ${buttonClass('primary')}`}>
                  Invite friends
                </button>
              </div>
            </div>
          )}

          {/* Map buttons, floating just above the sheet. */}
          {snap !== 'full' && (
            <div className="pointer-events-none fixed inset-x-0 z-[850] flex justify-center" style={{ bottom: sheetH + 12 }}>
              <div className="flex w-full max-w-app justify-end gap-2 px-4">
                <button
                  onClick={() => setAddOpen(true)}
                  className="pointer-events-auto flex min-h-[48px] items-center gap-2 rounded-full bg-bg-card/95 px-5 font-semibold shadow-lg backdrop-blur active:scale-95"
                >
                  <PlusIcon width={18} height={18} /> Add place
                </button>
                <button
                  aria-label="Show everyone"
                  onClick={() => setRecenter((n) => n + 1)}
                  className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-bg-card/95 shadow-lg backdrop-blur active:scale-95"
                >
                  <CrosshairIcon width={20} height={20} />
                </button>
              </div>
            </div>
          )}

          <BottomSheet
            snap={snap}
            onSnap={setSnap}
            onHeight={setSheetH}
            header={
              <div className="pb-1">
                {myAlert && (
                  <button
                    onClick={() => navigate(`${base}/ping`)}
                    className="mb-3 w-full truncate rounded-lg bg-status-alert/15 px-3 py-2 text-left text-sm font-semibold text-status-alert"
                  >
                    {myClaimer ? `${firstName(myClaimer)} is on it` : 'Help request sent'} · Open
                  </button>
                )}
                {/* Find me, HELP, Status: labeled round buttons, HELP biggest. */}
                <div className="flex items-start justify-center gap-7 py-1">
                  <button onClick={() => navigate(`${base}/ping`)} className="flex w-20 flex-col items-center gap-1.5 active:scale-95">
                    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-findme text-black shadow-lg">
                      <SendIcon width={28} height={28} strokeWidth={2.25} />
                    </span>
                    <span className="text-base font-bold">Find me</span>
                  </button>
                  <button onClick={() => navigate(`${base}/help`)} className="flex w-24 flex-col items-center gap-1.5 active:scale-95">
                    <span className="flex h-[84px] w-[84px] items-center justify-center rounded-full bg-danger text-white shadow-[0_0_24px_-4px_rgba(224,30,30,0.8)]">
                      <AlertTriangleIcon width={40} height={40} className="text-white" />
                    </span>
                    <span className="text-lg font-extrabold tracking-wide text-status-alert">HELP</span>
                  </button>
                  <button onClick={() => navigate(`${base}/update`)} className="flex w-20 flex-col items-center gap-1.5 active:scale-95">
                    <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-white/40 bg-bg-card text-ink shadow-lg">
                      <UserCheckIcon width={28} height={28} strokeWidth={2} />
                    </span>
                    <span className="text-base font-bold">Status</span>
                  </button>
                </div>
              </div>
            }
          >
            <LocationFix status={gpsStatus} onRetry={retryGps} />

            <div className="mt-2 grid grid-cols-2 gap-3">
              <button onClick={() => navigate(`${base}/invite`)} className={buttonClass('primary')}>
                Invite friends
              </button>
              <button onClick={() => navigate(`${base}/home`)} className={buttonClass('secondary')}>
                End my night
              </button>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <button onClick={() => navigate('/settings')} className="flex min-h-tap flex-col items-center justify-center gap-1 rounded-xl2 bg-bg-card py-2 text-sm font-semibold">
                <Avatar name={profile?.name ?? me?.name ?? '?'} url={profile?.avatar_url} size={28} />
                Profile
              </button>
              <button onClick={() => navigate('/settings')} className="flex min-h-tap flex-col items-center justify-center gap-1 rounded-xl2 bg-bg-card py-2 text-sm font-semibold">
                <GearIcon width={24} height={24} />
                Settings
              </button>
              <button onClick={() => setWallet(true)} className="flex min-h-tap flex-col items-center justify-center gap-1 rounded-xl2 bg-bg-card py-2 text-sm font-semibold">
                <ShieldIcon width={24} height={24} />
                Safety card
              </button>
            </div>

            <p className="mt-4 text-center text-base text-ink-faint">Party ends {formatClock(session.end_time)}</p>
            <div className="mt-3 flex items-center justify-center gap-2 text-ink-faint">
              <img src="/icons/logo-mark.png" alt="" className="h-6 w-auto" />
              <span className="font-bold tracking-tight">tether</span>
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
          onClose={() => setCardId(null)}
        />
      )}

      <WalletSheet open={wallet} onClose={() => setWallet(false)} profile={profile} me={me} />
    </>
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
          <p className="rounded-2xl bg-bg-card/95 px-4 py-3 text-center font-semibold shadow-lg backdrop-blur">
            Drag the map to put the pin on the spot
          </p>
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-[900] flex justify-center">
        <div className="w-full max-w-app rounded-t-3xl bg-bg-raised/95 p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(0,0,0,0.55)] backdrop-blur">
          <p className="mb-3 truncate text-ink-dim">{address}</p>
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
