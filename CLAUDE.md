# Tether, Project Spec

This file is the full product/technical spec for Tether, a hackathon prototype. Refer back to this
in future sessions instead of asking the user to repeat context. Work is organized into phases
(see bottom); do one phase at a time and stop for testing between phases unless told otherwise.

## PRODUCT
A mobile app named Tether. Location sharing that lasts one night and WATCHES FOR the group, pushing
alerts instead of requiring anyone to check a map. Users may be tipsy, panicking, or distracted:
every screen must be understandable in one second, and every critical action must take one tap.

## TARGET USER
Young adults (especially women) on nights out who may be impaired or in a stressful situation, plus
a sober "guardian" at home who receives escalations.

## STACK
- Vite + React + TypeScript + Tailwind
- Supabase: Postgres, Auth, Realtime, Edge Functions, pg_cron
- Deploy frontend to Vercel
- PWA: manifest with display standalone, service worker, installable
- Design system: Google Material 3 (see UI RULES). The Figma screenshots in /designs predate the
  Material 3 redesign; use them for content and flow, not for styling.

## UI RULES
Material 3 / Google Maps feel: information-dense but calm, layered and detailed. Treat the user as
smart: no oversized text, no giant "simple mode" buttons (the HELP button is the one exception).
- **Tokens**: Material You tonal palette as CSS variables in `src/index.css`, mapped to Tailwind
  colors in `tailwind.config.js` (surface / surface-low..highest, primary, secondary, outline,
  status). Primary pink #FF4F8B, secondary orange #FF8A3D. Light mode by default, matching dark mode
  via `data-theme="dark"` (Settings → Appearance: Light / Dark / System, see `src/lib/theme.ts`).
  Never hard-code white/black for surfaces or text; use the tokens.
- **Type**: "Google Sans" (Google Sans Flex), falling back to Roboto / Inter. 12px medium-gray labels,
  14px body, 16-22px titles, occasional large stat numbers. Plenty of small secondary detail
  (timestamps, distances, battery, last seen).
- **Shape and layout**: 4/8px spacing grid, 12-16px card radius, 28px sheets, pill buttons, 48px
  minimum touch targets, phone-width container (max 430px centered).
- **Components** (`src/components/ui.tsx`): tonal cards with subtle elevation, chips, status chips,
  segmented buttons, steppers, bottom sheets, icon buttons, Google Contacts-style list rows (leading
  avatar/icon, trailing metadata) and Google Settings-style grouped sections with a description under
  each item.
- **Map-first session**: full-screen map with friends as small avatar pins and you as a blue dot, a
  floating search-bar card (party name, status chip, venue), and a draggable bottom sheet (peek:
  group summary; expanded: friend list with distance, direction, battery, last update, call /
  navigate).
- **HELP stays giant**: a full-width red HELP button is always visible in the session sheet's peek
  state, one tap from the map.
- **Alerts**: separation / left-alone pings show first as a snackbar with the friend's pin pulsing on
  the map, and become a full-screen takeover if nobody acts on them. Help requests and guardian alerts
  are full-screen right away.
- **Motion**: smooth sheet drags, shared-element transitions (list avatar → detail sheet), touch
  ripples (`src/lib/ripple.ts`).
- Never label users as intoxicated or drunk in the UI. Names only.
- Calm colors normally, amber for check-ins, red only for real alerts.

## DATA MODEL
- **profiles**: id (auth user), name, phone, home_lat, home_lng, home_address (optional),
  emergency_contact_name, emergency_contact_phone, medical_info (optional)
- **sessions**: id, creator_id, join_code (6 chars, unique), end_time, status (active/ended),
  created_at
- **session_members**: session_id, user_id, guardian_name, guardian_phone, lat, lng, battery_level,
  status (together / separated / left_alone / heading_home / home / needs_help), status_note,
  leaving_with (array of user ids or 'solo'), eta, last_updated, is_simulated (legacy column, always
  false: there are no simulated members)
- **pins**: id, session_id, name, lat, lng, radius_m
- **alerts**: id, session_id, member_id, level (ping / alert / emergency), type (manual /
  separation / left_alone / battery / not_home / fake_call), message, target_user_ids, claimed_by,
  resolved, created_at, escalated_at
- **check_ins**: id, session_id, member_id, reason, created_at, responded_at, response
- Row-level security: users only read/write sessions they belong to. Guardian view uses a signed
  token, no login.
- When a session ends, delete all location fields, pins, alerts and check-ins. History keeps only date,
  venue names, members, guardian and home-arrival times.

## SCREENS
1. **Sign-up**: phone + SMS code (that actually works), name, home address (optional, stored for
   "Get me home"), emergency contact. Permission explainer screens before each browser prompt
   (location, notifications). A 20-second practice alert.
2. **Home (no session)**: my location + home card, big "Start a night out", "Join with code",
   settings.
3. **Start/Join**: creator sets end time (default 9 AM next day), drops venue pins on a map, gets
   join code + link + QR or rfid (like phone to phone sensor connection). Joiner sees preview "Join
   Maya's night out: 3 people", confirms, picks their own guardian (defaults to emergency contact).
4. **Active session**: full-screen map; floating card at top (party name, status chip like "All
   together" / "1 separated", venue, end time) with a chip row (Safety card, Invite, Add place, Get
   home); draggable bottom sheet whose peek shows the group summary ("4 people · all within 50 ft ·
   updated now"), Find me / Status, and the giant HELP button, and whose expanded state lists
   everyone (distance, direction, battery, last update, call / navigate) plus Tonight actions (add a
   place, safety card, settings, End my night) and "Party ends 9:00 AM".
5. **Lock screen**: dropped. No simulated screens; the real app runs on real phones.
6. **Wallet card**: name, emergency contact, guardian, home address, medical info.
7. **Guardian view** at /guardian/:token, no login: shows the SMS text that would be sent, then ONE
   clear instruction with one call button, e.g. "Call Jake, he's 200 ft from Maya."
8. **Morning summary**: "Everyone made it home. Your location data has been deleted." with
   checkmarks.

## ESCALATION LADDER (user-triggered)
- **ping**: "Come find me" + location. If group <= 5, send to everyone. If > 5, send to members
  within 200 ft first; if none within 200 ft or nobody claims in 2 min, send to whole group.
- **alert**: to the user's guardian, with an instruction naming the nearest friend.
- **emergency**: MOCK EMS screen ("DEMO: would call 911") with location + medical info.
- Status updates (bathroom, leaving with, heading home) are NOT escalation levels; they only update
  the status card.
- Every received ping/alert has a big "I'm on it" button. Claiming stops repeats and shows "Jake is
  on it." If unresolved after 10 min, re-escalate.

## AUTOMATIC RULES
Run server-side in an Edge Function `evaluate-session`, triggered on location updates and every
minute via pg_cron.

**A. Separation**: member > 150 m from group centroid for > 10 min while near a venue -> check-in
"Are you okay?" No response in 3 min -> ping.

**B. Left alone**: member exits a pin radius, no group member within 50 m, for > 2 min, and
leaving_with is empty -> check-in with options "Heading home" / "Going somewhere else" / "I need
help".
- Heading home: quiet FYI to group, start arrival tracking with ETA. Home = checkmark. Not home by
  ETA + 15 min -> new check-in.
- No response 3 min: louder check-in + ping nearest friend with distance/direction.
- No response 5 min: whole group alerted, repeating every 2 min until claimed.
- Unclaimed 10 min: guardian alert.

**C. Battery**: at 10%, nearest friend gets "Maya's phone is dying. Stay with her." Guardian
notified. Last location kept visible.

**D. Arrival chain**: member marked home when within 75 m of home_lat/lng. Left venue 30+ min ago
and not home -> check-in, then escalation. Session ends when all are home or at end_time.

- All timers must be multiplied by a DEMO_SPEED factor (config/env), so 10 min can become 10
  seconds during the pitch.
- Prevent duplicate alerts: one open alert per member per type at a time.

## KEYCHAIN BUTTON
Real Web Bluetooth pairing only, shown only on browsers that support it (Chrome on Android or
desktop) and hidden elsewhere (iPhone Safari has no Web Bluetooth). No simulated keychain. iPhone
Back Tap instructions stay in Settings.

## NOTIFICATIONS
- In-app: Supabase Realtime subscriptions; full-screen alert overlay with sound (no vibration
  reliance; iOS web can't vibrate).
- Web push via service worker (works on Android; on iOS only after Add to Home Screen) for pings
  and check-ins. Optional phase.
- SMS via Twilio from the evaluate-session Edge Function (secrets TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER). Texts only on: HELP pressed, alert escalated to the
  guardian, everyone home. Under 160 characters, no emojis, no em dashes, guardian link included.
  One text per event via the sms_outbox table (unique event_key). Failures are logged, shown in
  Settings, and never stop the alert flow.

## NO SIMULATION
Everything works with real people, real phones and the real Supabase project. There is no demo
panel, no simulated friends, no simulated lock screen and no fake keychain. The only demo aids are
DEMO_SPEED (shortens real timers) and DEMO_SAFE_911 (the 911 button dials a test number).

## PHASES
1. Scaffold the project (Vite, React, TS, Tailwind, PWA setup, Supabase client), environment
   variable template (.env.example), and the full database schema as a Supabase migration SQL file
   with RLS policies. Include setup instructions in README.md for creating the Supabase project and
   running the migration.
2. Auth (real SMS codes), profiles, start/join session, active session screen with live group status
   via Realtime.
3. Manual escalation ladder, "I'm on it", guardian view.
4. `evaluate-session` Edge Function with automatic rules A–D, pg_cron schedule, DEMO_SPEED.
5. (Dropped: no demo panel or simulated friends.)
6. Wallet card and morning summary. (Lock screen, fake call and keychain simulator dropped.)
7. Twilio SMS (done). Web push optional.
8. Deploy to Vercel and write deployment steps.

## WORKING AGREEMENT
- Ask the user before making any assumption that changes the data model above.
- Stop after each phase for testing before moving to the next.
- Designs live in `/designs`, check there before inventing a layout for a screen that has a design.
