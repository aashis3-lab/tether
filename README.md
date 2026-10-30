# Tether

Location sharing that lasts one night and watches for your group, so no one has to stare at a map.
Hackathon prototype, full product spec lives in [CLAUDE.md](./CLAUDE.md).

**Status:** Phase 4, automatic rules A–D in the `evaluate-session` Edge Function (separation,
left alone, low battery, arrival chain), run every 10 s by pg_cron and after location updates.
Phase 3, manual escalation ladder (ping → guardian alert → call 911), "I'm on
it" claiming, and the no-login guardian view. (Phase 2: sign-up, profiles, start/join, live
active-session screen.)

## Stack

- Vite + React + TypeScript + Tailwind
- Supabase (Postgres, Auth, Realtime, Edge Functions, pg_cron)
- PWA (installable, standalone display)
- Deploys to Vercel

## Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) account (free tier is fine)
- Optional: [Supabase CLI](https://supabase.com/docs/guides/cli) if you want to run migrations
  locally instead of pasting SQL into the dashboard

## 1. Install dependencies

```bash
npm install
```

## 2. Create a Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
2. Pick any name/region/password (save the DB password somewhere, you likely won't need it for
   this project, but the dashboard asks for one).
3. Wait for provisioning to finish (~2 min).

## 3. Run the database migration

Migrations live in [supabase/migrations/](./supabase/migrations/) and must run **in filename
order**:

1. `20260101000000_init.sql`, tables + RLS policies
2. `20260102000000_sessions_rpc.sql`, `create_session` / `join_session` RPCs, RLS tweaks, realtime
3. `20260103000000_escalation.sql`, escalation ladder RPCs, guardian view, Vault signing secret
4. `20260104000000_extra_emergency_contacts.sql`, `profiles.additional_emergency_contacts` (jsonb)
5. `20260105000000_automatic_rules.sql`, `session_members.rule_state`, check-in answers, pg_cron job
   (then follow **Phase 4 setup** below)
6. `20260106000000_design_refresh.sql`, `TG 4826`-style join codes, richer join preview, arrival
   times kept for the morning summary (then redeploy `evaluate-session`)
7. `20260107000000_avatars.sql`, `profiles.avatar_url`, public-read `avatars` Storage bucket
   (owners-only upload/replace/delete), member pictures in the join preview
8. `20260108000000_history_and_activities.sql`, `sessions.venue_names` (party history),
   `session_members.activity` / `activity_until` (Update statuses); `end_session` now deletes
   pins, alerts and check-ins, keeping only date, venue names, members and arrival times
   (then redeploy `evaluate-session`)
9. `20260109000000_sms_names_cleanup.sql`: party names, venue types on pins, the SMS outbox and
   short guardian links (`/g/<code>`), `help_pressed` and `queue_test_sms`; removes the simulated
   member insert policy (then redeploy `evaluate-session`)
10. `20260110000000_security_hardening.sql`: unguessable join codes (6 random characters),
    peers see only name, avatar and (during a party) phone via `peer_profiles`, members write
    only their own row, alerts and check-ins change only through RPCs, raise/answer only for
    yourself, server-side guardian link base URL, test-text rate limit
    (then follow **Security settings** below)
11. `20260112000000_real_timers.sql`: escalation timers always run at real-world speed (removes
    the old `tether_demo_speed` Vault secret)
12. `20260113000000_push.sql`: web push subscriptions, push de-duplication log, guardian
    reachability check (then redeploy `evaluate-session`)

### Security settings

Add this in **SQL editor** after migration 10 (optional but recommended):

```sql
-- The only address used in guardian text links. Without it the app's own address is
-- trusted, which lets a modified client put any link in a text to a guardian.
select vault.create_secret('https://<your-app>.vercel.app', 'tether_app_url');
```

The app checks this on startup: if a migration is missing it shows exactly which file to run.

**Option A, SQL editor (fastest, no CLI needed):**

1. In the Supabase dashboard, open **SQL Editor**.
2. Paste the entire contents of each migration file (in order) and run it.
3. After the first one, you should see `profiles`, `sessions`, `session_members`, `pins`, `alerts`, and
   `check_ins` appear under **Table Editor**.

**Option B, Supabase CLI:**

```bash
supabase login
supabase link --project-ref <your-project-ref>   # found in Project Settings -> General
supabase db push
```

## 4. Enable sign-in

Sign-up is name + phone number, no SMS code. Under the hood each device gets a Supabase anonymous
session with the phone stored on the profile. **Required:** dashboard → **Authentication → Sign
In / Providers → "Allow anonymous sign-ins"** → on.

Trade-offs: nobody verifies the number (anyone could type someone else's), and signing in on a
new device creates a new account. The phone number is how a guardian's alerts find their Tether
account, so people should use their real number.

## 5. Configure environment variables

```bash
cp .env.example .env
```

Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from **Project Settings → API** in the
Supabase dashboard.

Set `VITE_VAPID_PUBLIC_KEY` for push notifications (see **Push notifications** below).

## 6. Run the dev server

> **Path gotcha:** `npm run build` fails at the service-worker step if the project folder path
> contains an apostrophe (e.g. `'26 Projects`), a workbox bug. `npm run dev` is unaffected. Build
> from a path without an apostrophe, or let Vercel build it.

```bash
npm run dev
```

Open the printed localhost URL, you'll land on sign-up.

**Testing with friends on one machine:** each browser profile / incognito window is a separate
user.

### Testing on a real phone

Phones block location, notifications, and SMS autofill on plain `http://` (anything except
`localhost`). Use:

```bash
npm run dev:phone
```

This serves the dev build over HTTPS on your network and prints a `Network: https://…` address.
Put your phone on the same Wi-Fi and open that address. The certificate is self-signed, so
tap through the warning once ("Show details → visit this website" on iPhone, "Advanced →
Proceed" on Android).

- **iPhone notifications** only work after **Share → Add to Home Screen**, opening Tether from
  the Home Screen icon (iOS 16.4+). The sign-up screen and Settings → Permissions explain this on
  the device. In a Safari tab, alerts still appear in the app with sound.
- **Location keeps working** while Tether is open. If you lock the phone or switch apps, iOS and
  Android pause web location; Tether resumes and sends a fresh position the moment it's back on
  screen. While you stand still it still checks in every 30s, so friends don't see you as stale.
- If a permission was blocked, **Settings → Permissions** shows its status and the exact steps
  for that device.

## Phase 2 test checklist

1. Sign up: phone → code from the banner → name/home/emergency contact → location + notification
   explainers → 20-second practice alert (sound + "I'm on it").
2. Home shows your location + home card, "Start a night out", "Join with code", settings ⚙︎.
3. Start: tap the map to drop venue pins, keep the default 9 AM end, guardian defaults to your
   emergency contact → get a join code, link, and QR.
4. In an incognito window, sign up as a second user and open the join link (or enter the code) →
   preview "Join Maya's night out: 1 person" → pick guardian → join.
5. Both windows show the active session; the member list and "2/2 together" update live.
6. "Leaving with…" in one window updates the other's status card within a second or two.
7. "Get me home" pre-fills pickup + home and opens Uber/Lyft; status becomes "Heading home".
8. "End my night" (confirm) marks you home; when the last real member ends, the session ends.

## Project structure

```
src/
  lib/                  Supabase client, row types, geo math, status summary, alert sound
  auth/                 Auth context + phone sign-in (real SMS)
  hooks/                Live session (Realtime) + location/battery reporter
  components/           UI primitives, Leaflet map, alert overlay, invite card, profile form
  screens/              SignUp, Home, StartSession, JoinSession, ActiveSession, GetMeHome, Settings
  App.tsx, main.tsx      Router + route guards, PWA service worker registration
  index.css              Tailwind + base styles (dark theme, pink/orange accents)
supabase/
  migrations/            SQL schema + RLS policies
  functions/              Edge Functions (evaluate-session etc., added in Phase 4)
  config.toml            Local Supabase CLI config
designs/                 Figma screenshots (match these when present; see CLAUDE.md UI rules)
```

## Push notifications

Everything that used to be a text is now a web push notification, so alerts arrive even with
Tether closed:

- **Group:** pings, alerts and "Are you okay?" check-ins, once per alert, level and person.
- **Guardian:** HELP pressed, an alert escalated to the guardian, everyone home. The guardian must
  be on Tether: the message goes to the account whose phone matches the guardian's number. The
  guardian picker says whether they're on Tether with notifications on.

Where it works: Android Chrome, desktop Chrome / Edge / Firefox, and iPhone **only after Add to
Home Screen** (iOS 16.4+), opened from the Home Screen icon.

1. Generate a key pair: `npx web-push generate-vapid-keys`.
2. Supabase dashboard, **Edge Functions, Secrets**, add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`
   and `VAPID_SUBJECT` (`mailto:` + your email). Make sure `APP_BASE_URL` is your public app
   address so guardian links open.
3. Vercel (and `.env`): `VITE_VAPID_PUBLIC_KEY` = the same public key. Redeploy.
4. Redeploy `evaluate-session`.
5. In the app: allow notifications, then **Settings, Guardian alerts, Send test alert**. It
   notifies tonight's guardian (or your emergency contact) and shows "Sent" or why it couldn't
   ("isn't on Tether yet", "has notifications off").

Push only works in a production build (the service worker is off in `npm run dev`).

## Testing with 3 people

Each person needs **their own login**, and every device must be able to **reach the same address**.

- **One login per browser.** The Supabase login lives in the browser's storage, so every tab of a
  browser, and *all* incognito windows of that browser together, are the same person. Use
  separate devices, or e.g. Chrome + Firefox + Edge (or separate Chrome profiles) on one computer.
- **A shared address.** Invite links and QR codes use `VITE_PUBLIC_APP_URL` if set, otherwise the
  creator's current address. `http://localhost:…` only works on that one computer (the invite card
  warns you). For phones, run `npm run dev:phone` and either open the printed `Network: https://…`
  address on every device or put it in `VITE_PUBLIC_APP_URL`. A deployed Vercel URL works too.

Steps:

1. `npm run dev:phone` on your computer. Phones on the same Wi-Fi open the `Network: https://…`
   address (tap through the self-signed certificate warning once).
2. **Person A** signs up (phone + code → About you → Permissions → practice or skip), sets a
   destination on Home, taps **Start a night out**, confirms a guardian → sees the `TG ####` code + QR.
3. **Person B** scans the QR with their phone camera (or opens the link). Signed out, they go
   through sign-up first and land back on the join screen with the code filled in → **Join**.
4. **Person C** opens Tether, taps **Join with code**, types the code (or **Scan QR** in-app) → Join.
5. All three see each other on the map and in the sheet ("3/3 together") within a few seconds.
   Try PING on B, HELP → Find me on C, and drop a pin on A, everyone sees it live.



1. **Run migration 5** (above). If it errors on `pg_cron` or `pg_net`, enable both under
   Dashboard → **Database → Extensions**, then run it again.
2. **Tell cron where your project is** (SQL editor, once):

   ```sql
   select vault.create_secret('https://<your-project-ref>.supabase.co', 'tether_project_url');
   ```

3. **Copy the cron secret** the migration generated:

   ```sql
   select decrypted_secret from vault.decrypted_secrets where name = 'tether_cron_secret';
   ```

4. **Deploy the function**, either:
   - Dashboard → **Edge Functions → Deploy a new function → Via editor**, name it
     `evaluate-session`, paste [supabase/functions/evaluate-session/index.ts](./supabase/functions/evaluate-session/index.ts),
     and turn **off** "Verify JWT" / "Enforce JWT verification" (it checks callers itself); or
   - CLI: `npx supabase login`, `npx supabase link --project-ref <ref>`, then
     `npx supabase functions deploy evaluate-session --no-verify-jwt`.
5. **Set function secrets** (Dashboard → Edge Functions → Secrets):
   `CRON_SECRET` = the value from step 3,
   `APP_BASE_URL` = where the app runs (e.g. `http://localhost:5173`).
6. **Check it's running:** Edge Functions → evaluate-session → **Logs** should show a call every
   10 s while a night out is active (the cron tick is a no-op when none is). In SQL:
   `select * from cron.job_run_details order by start_time desc limit 5;`

Open apps also call the function after each location update (and every 5–15 s while visible),
so rules still run during development even before cron is wired up. If the function isn't
deployed at all, apps fall back to the Phase 3 manual-ladder timers.

### What the rules do

| Rule | Trigger | Then |
| --- | --- | --- |
| **A. Separation** | > 150 m from the rest of the group for 10 min while at a venue (anywhere if no pins) | Amber "Are you okay?" check-in. No answer in 3 min → ping friends. |
| **B. Left alone** | Left every venue pin, nobody within 50 m, not "leaving with" anyone, for 2 min | "You left on your own. All good?" → Heading home / Going somewhere else / I need help. 3 min: check-in gets loud + nearest friend pinged with distance/direction. 5 min: whole group (repeats every 2 min until claimed). 10 min unclaimed: guardian alert. |
| **C. Battery** | Battery ≤ 10% (Chrome/Android report battery) | Nearest friend: "Maya's phone is dying (8%). Stay with Maya." Guardian text logged. Last location stays on the map. |
| **D. Arrival** | Within 75 m of home, after having been 200+ m away (so starting at home doesn't count) | Marked Home ✓, open check-ins/alerts closed. Heading home gets an ETA; not home by ETA + 15 min, or left a venue 30+ min ago and not home → "Did you make it home?", then ping, then guardian. Night ends when every real member is home or at the end time. |

Only one open check-in per member per reason and one open alert per member per type exist at a
time. `rule_state` (the timers) is wiped with location data when the night ends.

## Phase 4 test checklist

Timers run at real-world speed. Move people by editing `lat`/`lng` on `session_members` in the
Table Editor (or a second phone).

1. **A:** with a pinned venue and two members inside it, move one ~200 m away (still inside a
   large pin, or with no pins). ~10 min later they get an amber "Are you okay?". Ignore it 3 min →
   the other member gets "Jake isn't answering". "I'm okay" turns them calm again.
2. **B:** move a member outside every pin and > 50 m from everyone. ~2 min → "You left on your
   own" check-in. Ignore: 3 min louder + nearest friend pinged with distance/direction, 5 min whole
   group, 10 min guardian alert (guardian link appears in the alert's message).
   "Heading home" instead → status card shows "heading home, ETA …".
3. **C:** set `battery_level` to 8 → nearest friend gets "…phone is dying"; set it back above 20
   to reset.
4. **D:** set a member's `lat`/`lng` to their profile's home → "Home ✓". When every real member is
   home the night ends for everyone.

## Phase 3 test checklist

Use two windows (A = Maya, B = Jake) in the same night out.

1. A taps **I need help** once → A sees "Help request sent"; B gets a full-screen red alert with
   sound, distance + direction, and **I'm on it**.
2. B taps **Not right now** → the overlay comes back after 2 min until someone claims.
3. B taps **I'm on it** → A sees "Jake is on it"; B gets a card with Directions + **Found them ✓**.
4. A taps **Alert Mom** → "Mom has been notified". The guardian page (link in Mom's notification)
   shows the SMS text, then one instruction ("Call Jake, they're 200 ft from Maya.") and one call
   button. It updates every 5 s (claims, resolution).
5. A holds **Call 911** for 2 s and confirms → the phone dials real 911 (don't complete the call
   when testing). B sees an EMERGENCY overlay.
6. **I'm OK now** (A) or **Found them** (B) resolves it; A's status returns to "With the group" and
   the guardian page says "Maya is OK now."
7. Leave a ping unresolved for 10 min → it auto-escalates to a guardian alert.

## Data model notes

- `session_members.name` is filled in at insert time for every member:
  there's no join to `profiles` needed just to render a name on the active-session screen.
- Guardian view (`/guardian/:token`) is unauthenticated by design. The token is
  `<alert_id>.<HMAC>` signed with a secret stored in Supabase Vault
  (`tether_guardian_token_secret`, created by the Phase 3 migration). The page calls the
  `guardian_view(token)` SECURITY DEFINER function, which verifies the signature and returns only
  what the guardian needs, no RLS policy opens alerts to anonymous users.
- Escalation timing lives in `escalate_alerts(session_id, base_url)`: narrow pings
  widen to the whole group after 2 min unclaimed; anything unresolved for 10 min re-escalates
  (ping → guardian alert; guardian alert → re-notify, never auto-EMS). Open clients call it as a
  heartbeat in Phase 3; pg_cron calls it from Phase 4.
- `end_session(session_id)` (a Postgres function) wipes live location fields, per spec. The frontend should call this via `supabase.rpc('end_session', { p_session_id
  })` instead of hand-rolling the update/delete.

## Roadmap

See [CLAUDE.md](./CLAUDE.md) for the full phase breakdown (auth, sessions, escalation ladder,
automatic rules, wallet card, SMS/push, Vercel deploy).
