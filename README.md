# HIIT Co. Hub

A mobile-first, installable React + TypeScript member app for HIIT Co., Christchurch. Members sign in with GymMaster to see their own name, total visits and attendance when available. A separate, explicitly selected fictional demo retains staff previews and browser-local training logs. Club workouts, events and messages are still sample content.

## Run locally

Use Node.js 22.12+ (validated on 24) and npm.

```sh
npm ci
npm run dev
```

Run these commands from the repository root. Vite serves the frontend only; choose the explicit fictional demo from the unavailable-account screen. For member sign-in and API development, run `npm run build` followed by `npm run dev:worker` to serve the app and Worker together. The local Worker has no live GymMaster secret by default. `npm test` runs attendance and demo storage tests. `npm run build` checks TypeScript and builds the production PWA to `dist`. `npm run preview` serves that build. PWA service workers are generated for production builds; use HTTPS when deployed. The existing Cloudflare Worker deploys the `dist` assets and `worker/index.ts` using `wrangler.jsonc`; see `DEPLOYMENT.md` for build/deploy commands and runtime secret setup. A static-only upload to Pages can preview the demo but does not include the backend. Hash navigation allows static hosting without server routes.

## Member accounts

The default experience checks the encrypted GymMaster session and shows member sign-in when needed. Successful login opens a personal Home dashboard; account details and sign-out are available through the avatar. Home and Progress use only the authenticated profile and daily visits, never the demo repository. A failed attendance request leaves real profile totals visible and weekly counts/streaks unavailable. GymMaster support confirmed the prior HTTP 400 was caused by undocumented required `startdate` and `enddate` query fields. Requests include NZ ISO calendar dates, starting with the current and previous 51 weeks. If the confirmed streak reaches that boundary, the server fetches earlier consecutive 52-week windows until the streak ends or history cannot be confirmed. The user has confirmed live attendance now loads; failures never produce fabricated results.

Attendance uses Monday weeks in Pacific/Auckland. The weekly goal is a suggested three visits, not a saved club-assigned target. Missing dates remain unknown; partial counts show a lower bound. Streaks count consecutive weeks with a confirmed visit, allowing an unfinished current week to preserve the previous week’s streak. The day view shows the current and previous two weeks. The server calculates the current streak using the progressively fetched history without sending extra daily records to the browser; a plus sign marks a lower bound when missing dates or limited history prevent an exact count. Longest/all-time streaks are unavailable. Daily counts cannot supply check-in times.

Profile and attendance stay in React memory, with no browser storage persistence. Session expiry, sign-out, account changes and refresh failures remove private state. Visibility changes and cross-tab notifications trigger server session revalidation; notification messages contain no identity or credentials. Reload restores only through a valid server cookie. Sessions last at most one hour. Member training-log persistence is not connected yet; real accounts do not read demo exercise records.

## Try the demo

Choose **Explore the fictional demo** from sign-in. Use **Back to member sign-in** to leave it. Home shows Sarah's attendance by default, with a smaller greeting and a single compact row containing the weekly completion ring, streak and next-milestone cards. Club sign-ins sit below that row. Select This week, Last week or 2 weeks ago, then tap a day to see every recorded check-in time and its reference in Pacific/Auckland time. This currently uses labelled demo attendance records; These demo check-in times are unrelated to the live member account. Check-in detail and summary totals share the same filtering and deduplication rules. The member selector at the bottom switches between 12 fictional members. Progress uses the same event data and calculations. Staff demo (sidebar, or the top-right dashboard icon on mobile) provides search, a member goal editor and a member dashboard shortcut. Save a target from 1–7 visits; the app updates immediately and remembers it in this browser using localStorage. Reload to confirm persistence. Browser storage failures show an error; load failures offer a reset which removes only saved demo targets. No sign-in or access restriction is implemented: staff mode is openly accessible and clearly marked as a demo.

Open **Skills Library** using the Home button. Skills has selectable Box, Lift and Sweat categories for trainer technique and how-to videos. Each category filters the shared video list in `src/data/skills.ts`; the list is empty until trainer-approved videos are added. Video cards support playback and optional English captions. Staff uploads are not implemented yet. Messages contains a fictional club announcement; neither is a live content or messaging system. The header and sidebar use the supplied transparent HIIT Co. logo in `public/hiit-co-logo.png`, framed to its visible artwork without changing the original image. Logo links return to Home. The saved app name is **HIIT Co. Hub** on Android and iPhone. The supplied app logo is retained unchanged in `src/assets/hiit-co-app-logo.png` and rendered onto white square icons for Android (192/512), iPhone (180), and a separately padded Android maskable icon. Existing home-screen installations may retain their previous name/icon until removed and added again after deployment. Home-screen installation uses the supported browser prompt, with manual iPhone/Android instructions as a fallback. The app shell is available offline after an initial production visit and successful service-worker installation; offline data is fictional only. Fresh demo histories are generated relative to the current NZ week, so they remain useful over time.

## Home workout slate

The paired-day **This week’s workout** slate uses `src/data/workoutPlan.ts`. The three day buttons are Mon/Thurs, Tues/Fri and Wed/Sat, each showing both dates in the current NZ Monday–Sunday week. Each pair uses a single shared station plan so repeated workouts stay identical. Opening a pair shows three stations side by side in a horizontal scroll-snap carousel: 1–3, then 4–6, then 7–9. Each station is a three-minute round. Members can swipe, use previous/next arrows, choose a group, or focus the carousel and use keyboard left/right arrows. Switching pairs resets to Stations 1–3. Each station has its own exercises and instructions. Trackable exercise names link to the matching Log detail through routes such as `#log/back-squat`; these links also survive reloads. Non-trackable movements remain plain text. These are explicitly labelled sample station workouts, not the gym’s published programme. A staff publishing workflow and real weekly programme storage remain to be implemented. Upcoming club events appear above the Skills Library button.

## Training log

The **Log** pencil tab opens an exercise list. Choose a preset such as Back squat, or add a custom exercise. Record a workout date and up to 50 sets, each with reps and total weight in kilograms (including the bar). Dates cannot be in the future. Zero kilograms represents bodyweight-only work: the volume metric counts added load only. Entries begin empty; no training results are invented.

Opening an exercise shows its heaviest recorded set, latest session volume, weight and volume charts, and dated session history. Chart **Weight** means the heaviest set in each session; **Volume** means the sum of reps × kg across all that session's sets. Charts show the latest 12 sessions, ordered by workout date and then creation time, with points spaced by session. Multiple sessions on the same day are retained separately. Changes compare the earliest and latest saved session, not personal bests. Full recorded sets remain in history. Sessions can be edited and deleted with confirmation; the charts recalculate immediately.

`src/domain/training.ts` defines and tests validation and calculation rules. `src/data/training.ts` handles versioned browser localStorage per demo member. Custom exercises, sessions and corrections survive reloads on the same browser; they do not sync to other devices. Demo member separation is not authentication or secure access control. Storage errors leave existing history untouched and retain unsaved form input. Unreadable data is not silently reset. A real backend, login and data migration are required before multi-device use with real members.

## Club events

The Events calendar replaces Skills in desktop and mobile navigation. It uses Monday-first months in NZ calendar dates. Select a date to see event descriptions, local times, location and what to bring; more than one event can appear on the same day. Month arrows and Today change the view, and the upcoming list jumps to an event date. Home shows the next event from the same data source.

`src/data/events.ts` currently generates four explicitly labelled fictional events relative to the current NZ date. These are not actual club events, and staff event editing/RSVP is not implemented. Replace the mock source with approved club events through a repository when real content management is added. `src/domain/events.ts` contains tested month and upcoming-event calculations.

## Organisation

- `src/domain/models.ts`: internal member, membership, visit and repository contracts.
- `src/domain/attendance.ts`: shared, independently tested attendance, dates, streaks, milestones and check-in records. Internal attendance events may carry a source and reference; future verified GymMaster records can use these fields without exposing vendor credentials.
- `src/data/mock.ts`: deterministic fictional histories and browser-persisted target overrides.
- `src/integrations/`: future backend GymMaster contract and Supabase security notes. No API requests or credentials.
- `src/App.tsx`: application state, navigation and install help.
- `src/pages/`: individual member and staff screens. `src/components/`: shared cards, branding and dialog keyboard handling.
- `src/styles.css`: responsive white brand system with black/grey text and blue attendance accents, using Tailwind's Vite integration and custom component styles.
- `public/`: app icons. `vite.config.ts`: public app-shell caching and install manifest.

## Attendance rules

Weeks run Monday–Sunday in Pacific/Auckland, including NZ daylight saving. A workout is a distinct attendance event, not an app login. Duplicate event IDs, invalid dates, future events and other members' visits are excluded. Multiple legitimate visits on one day count individually, with a single calendar indicator. A streak counts consecutive weeks with at least one visit; an empty current week does not break the preceding streak until that week has ended. Longest streak is shown only when history is complete. Milestones are 50, 75, 100, 150, 200, then every 100 visits. Goal percentages can exceed 100%; the circular indicator fills to 100%. The six-week chart's target line represents the current target, not reconstructed historical targets.

## Backend and GymMaster member connection

`worker/index.ts` serves the static app and uncached JSON routes under `/api`. `GET /api/health` returns only `{"status":"ok"}`. The default sign-in screen accepts an authorised member’s GymMaster email/password using the runtime `GYMMASTER_API_KEY` **Secret**. Worker code validates the documented login response and stores only an encrypted, HttpOnly/Secure session cookie. Passwords are not persisted or logged; the raw token and key are not returned to browser JavaScript. Same-origin checks, bounded request/response bodies and a Cloudflare rate-limit binding protect the login route. The connection expires according to the provider's expiry, capped at one hour, and can be disconnected.

The member Home and Progress screens use `GET /api/gymmaster/profile` and `GET /api/gymmaster/visits`. Profile returns first name, surname and total visits only after matching the provider member ID to the encrypted session. Attendance returns documented daily counts for three weeks, without inferring timestamps or filling missing days with zero. The user has confirmed deployed sign-in and profile totals; the missing date parameters behind the daily-attendance HTTP 400 are now supplied, pending live verification. Automated backend and browser checks use fake credentials and mocked responses. Other unimplemented GymMaster routes remain 501; unknown API routes return 404. Staff previews expose fictional data only. Never supply credentials or keys in chat. See `DEPLOYMENT.md`.

## Remaining production work

The authenticated GymMaster session and read-only member profile are implemented. Cloud-saved training logs, saved member targets and staff authorisation still require a persistent backend with member access controls. Do not migrate local demo records into a real account automatically. Verify historical attendance coverage and confirm deployed daily attendance after adding the support-confirmed date parameters before relying on weekly statistics. Add approved club content, recovery/support flows and operational monitoring, and test install/update/offline behaviour on physical iOS and Android devices. Do not cache private API responses or expose provider keys in the browser.

## Check-in webhook preparation

A token-authenticated webhook receiver and private encrypted SQLite Durable Object inbox are implemented at `/api/gymmaster/webhooks/checkin`. Configure the same private Secret Token in GymMaster and the runtime `GYMMASTER_WEBHOOK_TOKEN` secret; the deployment creates the inbox binding. Authentication, duplicate protection, test/live separation and 30-day staging retention are implemented. The specific Member Checkin payload and success semantics still need verification before timestamps can be shown to members. Webhooks do not change daily counts or fabricate historical visit times. See `DEPLOYMENT.md` for setup and testing.
