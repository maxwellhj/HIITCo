# Deploy HIIT Co. Hub to Cloudflare Workers

The existing `hiitco.maxwellhj.workers.dev` site is a **Cloudflare Worker**. The repository now includes `wrangler.jsonc` and `worker/index.ts` so this Worker serves the built app **and** can hold runtime secrets. An assets-only Worker cannot accept runtime variables or secrets.

## Existing GitHub-connected project

In Cloudflare → Workers & Pages → **hiitco** → Settings → Build, use:

- Repository: `maxwellhj/HIITCo`
- Production branch: `main`
- Root directory: repository root (leave blank)
- Build command: `npm run build`
- Deploy command: `npm run deploy`
- Node: 24, as pinned in `.node-version`

The tracked Wrangler configuration sets `name` to `hiitco`, `main` to `worker/index.ts`, and the static assets directory to `dist`. Use a Worker deployment, not `wrangler pages deploy` or an upload-only command. A deploy command of `npx wrangler deploy` also reads the tracked configuration correctly. If Cloudflare retains an old assets-only deployment, check that the newest build uses this commit and the tracked config at the repository root, then retry the deployment. Do not create another project or replace the existing URL merely to add a secret.

Pushing to `main` triggers the configured Cloudflare build. A successful local dry run or Git push does not prove a cloud deployment succeeded. Wait for Cloudflare to report success. Then open `https://hiitco.maxwellhj.workers.dev/api/health`; it should return `{"status":"ok"}`. Use a private browser tab if an older installed app shell intercepts the address. Check that Home and the other hash routes still load.

## Store the GymMaster key after the Worker code is deployed

1. Open the **hiitco** Worker → **Settings → Variables and Secrets** (runtime settings).
2. Add a variable with **Type: Secret** and **Name: `GYMMASTER_API_KEY`**.
3. Enter the replacement **low-permission** API key from GymMaster. Save/deploy the change as prompted.
4. Do not put the key in chat, GitHub, `wrangler.jsonc`, `.env.example`, frontend code, or any `VITE_` variable. Leave the high-permission staff key private and unused.

## Verify a member connection

After deploying, open `https://hiitco.maxwellhj.workers.dev/`. The default flow is member sign-in using their own authorised GymMaster email and password. A valid existing cookie restores their account. Sign-in opens a real Home dashboard with their name and total visits. `#connect` now opens account details; the avatar also links there. Home and Progress use real daily attendance when available, with explicit unavailable/partial states. GymMaster support traced the previous HTTP 400 to required `startdate` and `enddate` query fields missing from the public documentation. The Worker now supplies both in YYYY-MM-DD format using NZ calendar dates. It starts with the current plus previous 51 weeks and fetches earlier, non-overlapping 52-week windows when needed to extend a streak. The user has confirmed that live attendance loads. The fictional demo is separately selected from sign-in.

The backend submits the documented `api_key`, `email`, and `password` fields as a form to the fixed club login URL. It verifies the documented `result.token`, `result.expires`, and `result.memberid` types. Provider error text is never sent back to the browser. The browser receives connected state and expiry only, not a token, member ID, password or API key. No member-ID-only login or arbitrary proxy is exposed.

The temporary provider token and member ID are encrypted using AES-GCM in a `__Host-` cookie with HttpOnly, Secure, SameSite=Lax and Path=/ attributes. The cookie key is derived with a domain-separated SHA-256 digest of the server-held integration key. Replacing that key invalidates existing connection cookies. The lifetime follows GymMaster's documented expiry in seconds, capped at one hour. Disconnect clears the local connection cookie; it does not assume an undocumented GymMaster token-revocation endpoint. Passwords are forwarded for login only and are not persisted by this application or written to application logs. Private values must never be added to Cloudflare request/body logging.

`wrangler.jsonc` configures a `LOGIN_RATE_LIMITER` Cloudflare binding (10 attempts per 60 seconds, applied to IP and hashed normalised email keys). This binding is installed with the Worker deployment; it requires no secret value. Login fails closed if the key, limiter or Cloudflare client-IP header is unavailable. Login/logout require a matching Origin and reject cross-site requests. The app refuses frames, and JSON API responses are uncached.

Routes:

- `GET /api/health`: public liveness only, no credential status.
- `POST /api/gymmaster/login`: same-origin member sign-in.
- `GET /api/gymmaster/session`: connection state/expiry only; invalid and expired cookies are cleared.
- `POST /api/gymmaster/logout`: same-origin disconnect.
- `GET /api/gymmaster/profile`: encrypted-cookie authentication, fixed documented profile endpoint, member-ID match validation, first name/surname/total visits only. No-store responses, bounded body, per-member rate limit and no arbitrary query parameters. Missing total visits is unknown, not zero.
- `GET /api/gymmaster/checkins`: encrypted-session member identity only, current/previous two NZ weeks of received arrival times, no caller-supplied member or date parameters, no-store responses and a per-member rate limit. HMAC-scoped lookup plus member-bound AES-GCM records prevent cross-account disclosure.
- `GET /api/gymmaster/visits`: encrypted-cookie authentication, fixed upstream daily-visits endpoint, three NZ calendar weeks through today plus a current-streak summary from progressively fetched history, documented fields only, no-store responses and per-member rate limits. Query parameters and cross-site requests are refused. Missing dates are not filled with zero; check-in times are not available. Provider failures never fall back to demo records.
- Other `/api/gymmaster` routes: HTTP 501 until the relevant schemas and authorisation are implemented.
- Other unknown `/api` routes: JSON 404, not the app shell.

A real GymMaster sign-in has **not** been tested from the coding workspace. The key is stored in your Cloudflare project, not available here. Local tests use fake credentials and mocked provider responses. The user has confirmed a successful sign-in on the deployed site. The daily-visits schema has been supplied and implemented; verify its attendance preview on the deployment next. The Member schema has now been supplied and implemented for name and total visits. Confirm these against the signed-in account on the deployed preview. Member Home and Progress use authenticated data only. Club content and the separate demo remain labelled as sample data. Exact check-in timestamps and historical coverage still require confirmation. Staff demo remains open and exposes fictional data only; it is not authorised staff access to real GymMaster information.

## Local validation

From the repository root:

```sh
npm ci
npm run build
npm test
npm run deploy:check
npm run dev:worker
```

`deploy:check` packages the Worker with Wrangler's `--dry-run`; it does not publish or require a real GymMaster key. `dev:worker` serves the production build and backend together locally, normally on port 8787. `npm run dev` still serves the frontend through Vite; it does not run Worker API routes. Never rely on a successful Vite preview to verify backend behaviour.

The public app-shell service worker excludes `/api` navigations. API responses use `Cache-Control: no-store`, and static asset headers remain in `public/_headers`. Runtime credentials and authentication must never be added to app-shell caching.

## Static-only alternative

The `dist` directory can still be uploaded to Pages or a static host to review the fictional demo. That upload excludes Worker code, cannot use runtime secrets, and cannot provide the GymMaster backend. Do not use that route for the live integration.

Connection troubleshooting: the login screen now distinguishes GM-NETWORK, GM-TIMEOUT, GM-REDIRECT, GM-HTTP (status only), GM-FORMAT, and GM-SESSION. Redirects are reported without following them; provider bodies, redirect locations, and credentials are never included in diagnostics. These categories identify the failing stage, not a confirmed root cause.

Format diagnostics report only fixed categories (BODY, ENVELOPE, RESULT, TOKEN, EXPIRY, MEMBER), never response values or arbitrary property names. Login integer fields accept positive safe JSON integers or strictly decimal integer strings; provider lifetimes have no undocumented one-day limit, while ordinary sessions remain capped at one hour; opted-in remembered sessions are capped at seven days, always bounded by the provider lifetime. Live response compatibility still requires verification.

## Member interface and session lifecycle

The member shell stores profile and visits in memory only. Sign-out clears displayed state before the cookie-clearing request; failed sign-out reports an error and offers a retry instead of claiming success. Expiry removes the profile and asks for sign-in. Visibility changes and BroadcastChannel notifications revalidate the server session, clear stale state and prevent late requests from restoring previous account data. Cross-tab messages contain only a change notification. No member selector or real staff access is exposed in the member shell. API routes remain the authority for identity.

The suggested goal is three visits per week. Streaks use confirmed consecutive attended weeks and show lower bounds where history is incomplete; missing dates are never assumed zero. Weekly attendance remains unavailable if the GymMaster daily-visits request fails. The support-confirmed startdate/enddate fields are now supplied; local tests cover their presence and the NZ date boundary, but cannot establish live provider success. Real-account training log storage is implemented below; saved targets remain pending; browser-local demo logs are not reused as member records.

Streak history is no longer capped at 52 weeks. Older windows are requested only when the confirmed streak reaches the earliest fetched week, including when the current week has not yet been attended. Paging is bounded by 40 provider requests, a shared 15-second timeout and 10,000 retained date records. A failed older-history request preserves confirmed recent attendance and the lower-bound marker; a rejected session still returns 401 and clears the cookie. Missing weeks never become assumed zero. Regression tests cover 53-, 54-, 55- and 105-week streaks, contiguous date boundaries, earlier-week continuation and partial-history failure.

## GymMaster check-in webhook staging

The HTTPS receiver is `POST https://hiitco.maxwellhj.workers.dev/api/gymmaster/webhooks/checkin`. Select **Member Checkin** and **HIIT Co.** in GymMaster. The webhook settings screenshot confirms GymMaster sends its configured Secret Token in `X-Gymmaster-Token` over HTTPS. Use a new private random 32–256 character printable ASCII token (letters/numbers are simplest), save it in a password manager, and enter the same value in GymMaster **Secret Token** and the Cloudflare runtime **Secret** named `GYMMASTER_WEBHOOK_TOKEN`. This is separate from `GYMMASTER_API_KEY`. Never put either value in chat, URLs, source, frontend variables or logs. The receiver remains fail-closed until the secret and inbox binding exist.

`wrangler.jsonc` adds the SQLite Durable Object binding `GYMMASTER_CHECKIN_INBOX`, class `GymMasterCheckinInbox`, with migration `gymmaster-checkin-inbox-v1`. Normal Worker deployment provisions this storage. It is a private staging inbox: the bounded envelope is AES-GCM encrypted with a domain-separated key derived from the webhook token, deduplicated by event ID (test/live namespaces separated), and retained for 30 days with hourly cleanup alarms. Rotating the token changes the encryption key; process or migrate pending events before rotation if their contents must be retained. There is no public read endpoint. Durable write failure returns 503 to request a GymMaster retry; success is acknowledged only after persistence. Metadata-only logs show event type, test/duplicate flags and payload field names/types, never field values or credentials.

The initial receiver release captured authenticated deliveries only. The latest update additionally maps the observed `member_checkin` shape to encrypted member arrival records when `payload.access` is `granted`, IDs and `payload.timestamp` are valid, and the event is not a test. The UI label **Member Checkin** does not establish the machine event type, member/company mapping or success/denial semantics. The user has confirmed successful test delivery, supplied the actual Member Checkin schema and confirmed its naive timestamp is NZ time. The authenticated record mapping now uses those fields; retained raw staging events are automatically reprocessed as described below. Test sends never create attendance. Daily counts remain sourced from the existing API, and neither historical webhook replay nor historical check-in times are assumed available. The documented envelope uses `event_id`, `event_type`, `event_timestamp`, `processed_at` and `payload`; the documented +12 timezone suffix is accepted without substituting delivery time for occurrence time.

After deployment and both token settings are saved, use GymMaster **Test Send → Member Checkin → Send**. Check its delivery status and Cloudflare Worker logs for `GymMaster webhook received`. Share only the result/schema metadata, not request headers, token values or member payload values. The code has automated authentication/encryption/validation tests and a real local Worker/SQLite smoke check for duplicate deliveries, test isolation, rejection of invalid tokens, no public reads, and persistence across restart. The user has confirmed HTTP 200 delivery; member-visible times still need live verification.

The observed Member Checkin test payload differs from the help example: `processed_at` can be null, `event_timestamp` can be timezone-less with microseconds, and `payload.timestamp` is a separate timezone-less value with a space separator. The receiver now accepts these timestamp shapes and preserves the original strings; no timezone is inferred and event/delivery time is not substituted for the actual check-in time. The later user confirmation establishes NZ local time for `payload.timestamp`; only `access: granted` events are mapped as arrival details, without changing visit totals. Test events remain staging-only.

Webhook 503 responses and Worker console logs now contain fixed `GM-WEBHOOK-*` diagnostic codes: TOKEN-MISSING, TOKEN-FORMAT, INBOX-MISSING, ENCRYPTION, STORAGE, ACK, or INBOX-BODY/WRITE/ALARM. Invalid envelope format is HTTP 400 with GM-WEBHOOK-FORMAT. None of these diagnostics include token length/value, exception text, request headers, payload values, IDs or names. Wrangler enables Worker console observability with invocation logs disabled so a failed test can be diagnosed under Cloudflare Observability → Logs. A format mismatch alone does not explain an observed 503; inspect its diagnostic code after deploying.

## Arrival-time rollout

The existing Durable Object creates the `member_checkins` table and index on startup; no new binding/migration tag or secret is needed. Inbox and derived arrival writes commit together in a SQLite transaction. Raw webhook IDs and normalized visit IDs are deduplicated independently; test events cannot write member records. Record indexes are HMACs of member identity, ciphertext uses the member index as associated data, and API queries use only the server session identity. Both raw staging and normalized records have 30-day expiry with alarm cleanup; API queries also filter expired rows.

Member screens read arrival details separately from daily totals. A failed timestamp lookup never replaces working totals, and a webhook never increments the daily API counts. Successful new arrivals may show a tick while the daily count is pending. Tapping the date displays NZ local time, door and visit reference; empty history is labelled as no time received rather than no visit. Offset-less timestamps are displayed as already-NZ wall times, with no second timezone conversion. Current and previous two weeks are available; not all historical visits have webhooks. Retained staging-only records are automatically backfilled. Explicit UTC and offset timestamps are converted to Pacific/Auckland before storage; timezone-less timestamps remain NZ wall times.

Verify live by making an authorised **genuine** club check-in after deployment (not Test Send), then refreshing the matching signed-in member's Home and tapping that date. Test sends remain excluded. Automated checks cover NZ standard/daylight saving wall-time formatting, member-bound encryption, ID injection, authentication and missing storage. A local real Worker/SQLite test covers webhook-to-member lookup, deduplication, test/denial exclusion, cross-account isolation and persistence. Browser checks cover times/references, missing times, separate failure states, daily-API delay, account changes and sign-out.


Arrival recovery processes up to 50 unexpired live staging envelopes per batch when a member queries times, then continues through Durable Object alarms. Versioned `checkin_imports` markers prevent repeated work; original 30-day expiry is preserved. Tests, denied attempts and invalid records remain excluded. The existing namespace creates this table automatically, without a new binding, migration tag or secret. Envelopes encrypted with a previously rotated token cannot be recovered using the current token. The UI reports when earlier received check-ins are still being prepared.

Receipt metadata now includes a fixed mapping status (`mapped`, `test-excluded`, `event-excluded`, `access-excluded`, or `record-format-excluded`). Own-member lookup logs only whether any records matched and whether recovery is pending. Failed lookups return fixed `GM-CHECKINS-CONFIG`, `LIMITER`, `LOOKUP`, `DECRYPT`, or `FORMAT` codes, without exception text or member values. Browser errors accept only these approved codes.

Verification: 97 automated tests, production build and Worker deployment dry-run pass. A persistent local SQLite upgrade regression reproduced a received explicit-offset check-in that the previous code did not map, then recovered it after upgrading. Test/denial exclusion, member isolation and deduplication passed. Browser checks cover NZ times, missing/error states, account changes, sign-out, no private browser persistence and phone/desktop layouts. This establishes the reproduced compatibility fix, not the cause of the user's live missing record.


Member home now places the unboxed total visit count beside the greeting. Its button reveals weekly goal, streak and milestone cards; the default view leads with the expanded workout plan for today's NZ weekday. Mon/Thurs, Tues/Fri and Wed/Sat repeat; Sunday opens the latest Wed/Sat plan. Workout selectors are compact and the three-station carousel remains available.

The login form offers an unchecked “Keep me logged in” checkbox. Without opt-in, the encrypted HttpOnly cookie has no Max-Age and the server session lasts at most one hour. With opt-in, the cookie persists for the shorter of GymMaster's returned token lifetime and seven days. This cannot extend an expired GymMaster token or silently renew it: typical one-hour provider tokens still require sign-in after an hour. No passwords or tokens are stored in browser storage. Existing cookies remain readable; sign-out clears the cookie in both modes. Validation covers opt-in type checking, provider expiry, retention bounds and cookie restoration. Mocked browser checks cover checkbox submission, dropdown toggling, workout priority and NZ day defaults at phone and desktop widths.


## Workout Builder connection and member training storage

The member Worker reads the fixed published feed at `https://hiit-co-workout-builder.maxwellhj.workers.dev/api/workouts/current?date=YYYY-MM-DD`. Only Accept is sent upstream; no member token, password or integration key is forwarded. Feed bodies, dates, metadata and nine-station shape are validated, responses remain no-store, redirects are not followed and a timeout/body bound applies. Drafts (404), overlapping schedules (409) and unavailable feeds show explicit UI states. Do not use the builder's editable `/api/plan` endpoint in the member app. This workspace cannot contact the deployed builder hostname under its current network policy; source-contract, fake-provider and local integration checks do not establish live connectivity.

Normal `wrangler deploy` adds SQLite class `MemberTrainingStore`, namespace binding `MEMBER_TRAINING_LOGS` and migration `member-training-v1`. Existing webhook migration/bindings are preserved. No additional secret is needed. This is a per-member encrypted log, not a copy of GymMaster workouts or demo data. Server-derived HMAC identity, member-bound AES-GCM and session authorization protect GET/POST; origin checks protect writes. Revision compare-and-save occurs atomically in SQLite; 409 keeps unsaved form values and asks the member to reopen Log. Changing `GYMMASTER_API_KEY` requires a planned migration for retained training logs because that key derives their namespace names and encryption keys. Missing bindings fail closed with a clear unavailable state.

Validation uses 109 automated tests, a real local Worker/SQLite test (feed contract, encrypted save/read/delete, conflict rejection, member isolation and persistence across restart), and mocked browser checks (actual builder-generated station fixtures, exercise selection/custom creation, reps/weights/charts, failure retention, reload/edit/delete, responsive layouts, draft/overlap states, deep links and sign-out). The builder fixtures are produced by its actual `currentWorkout` publication/date resolver. Production build and deployment dry-run are checked separately. After deployment, publish a dated week in the builder, sign into a real member account, verify that week's station text, save one session and reopen Log to confirm live storage. Staff/administrative access to account logs is not exposed.


## Direct builder connection

Wrangler now adds service binding `WORKOUT_BUILDER` → `hiit-co-workout-builder`, using the existing Worker in the same Cloudflare account. Deployment provisions the binding; no new secret or manual data migration is required. The member endpoint constructs a fresh GET request to the fixed published-feed URL and sends only Accept, without forwarding cookies or credentials. When the binding is present it is used exclusively; an error does not silently retry through the public edge. HTTPS remains the local-development fallback when no binding exists.

The user supplied a successful live public-feed response for 26 October 2026 (Strength Week 1, nine stations). This proves publication is available, not that the prior Worker-to-Worker request path received the same result. A previous bug classified every upstream 404 as unpublished. The endpoint now requires the builder's exact dated JSON no-publication response before showing that state, distinguishes routing/HTTP/format/connection errors with safe `WORKOUT-*` codes, and logs dates/stages only. The member UI also shows the week beginning and dates involved. Validation: 111 automated tests, production build, deploy dry-run and a real two-Worker local service-binding check against the builder resolver; no live private session or Cloudflare credentials are available here.


Inline exercise logging update: no builder/feed/storage migration is required. Exercise names in stations 2, 3, 7 and 8 link to their own account forms; stations 1, 4, 5, 6 and 9 expose no logging links. Published text and prescriptions remain intact. Shared catalog IDs distinguish equipment/lift variants; new exercise records are prepared in memory and included in the first saved session, with existing equivalent custom names reused. Automated tests cover station restrictions, exact source spans, stable IDs, variant separation, accessory movements and history reuse. Browser checks cover DB box step-ups → direct form → two saved sets → persisted chart/history, separate KB variation, existing custom ID reuse, no generic logging/duration labels and phone/desktop widths. The working direct builder service connection is unchanged.


## CHOW account scores

The new authenticated `/api/gymmaster/chow` GET/POST route uses the same per-member training namespace, with a separate SQLite table (`chow_log`), revision counter and AES-GCM associated-data context. Existing exercise-log ciphertext and revisions stay compatible. The table is created on object initialization; no new namespace, migration tag or secret is needed. Validation checks bounded totals/units, date membership, duplicate IDs and canonical challenge snapshot hashes. A changed workout retains the old history under its original hash; new content cannot overwrite that definition under the same ID. This does not verify a public leaderboard result: these are personal member-entered records.

Validation: 126 automated tests; actual local Worker/SQLite score save/read/delete/restart, independent training revisions and member isolation; browser badge → form → scores/history, per-unit personal bests, edit/delete, failed-save retention, modal keyboard close/focus return, older history from Log, changed-challenge separation and responsive layouts. The unit choice follows the user's requested total-number-plus-unit format. Live member saves require post-deployment confirmation; no real credentials are available in the workspace.
