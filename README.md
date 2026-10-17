# HIIT Co. Member App

A mobile-first, installable React + TypeScript prototype for HIIT Co., Christchurch. No booking system. All members, attendance and messages are fictional; no accounts, keys or maintained server are needed.

## Run locally

Use Node.js 22.12+ (validated on 24) and npm.

```sh
npm ci
npm run dev
```

Run these commands from the repository root. Open the address Vite prints. `npm test` runs attendance and demo storage tests. `npm run build` checks TypeScript and builds the production PWA to `dist`. `npm run preview` serves that build. PWA service workers are generated for production builds; use HTTPS when deployed. Upload `dist` to Cloudflare Pages (build command `npm run build`, output directory `dist`). Hash navigation allows static hosting without server routes.

## Try the demo

Home shows Sarah's attendance by default, with a weekly completion ring, attendance days, and compact side-by-side streak and next-milestone cards. The member selector at the bottom switches between 12 fictional members. Progress uses the same event data and calculations. Staff demo (sidebar or mobile navigation) provides search, a member goal editor and a member dashboard shortcut. Save a target from 1–7 visits; the app updates immediately and remembers it in this browser using localStorage. Reload to confirm persistence. Browser storage failures show an error; load failures offer a reset which removes only saved demo targets. No sign-in or access restriction is implemented: staff mode is openly accessible and clearly marked as a demo.

Open **Skills Library** using the Home button. Skills has selectable Box, Lift and Sweat categories for trainer technique and how-to videos. Each category filters the shared video list in `src/data/skills.ts`; the list is empty until trainer-approved videos are added. Video cards support playback and optional English captions. Staff uploads are not implemented yet. Messages contains a fictional club announcement; neither is a live content or messaging system. The header and sidebar use the supplied transparent HIIT Co. logo in `public/hiit-co-logo.png`, framed to its visible artwork without changing the original image. Logo links return to Home. Home-screen installation uses the supported browser prompt, with manual iPhone/Android instructions as a fallback. The app shell is available offline after an initial production visit and successful service-worker installation; offline data is fictional only. Fresh demo histories are generated relative to the current NZ week, so they remain useful over time.

## Club events

The Events calendar replaces Skills in desktop and mobile navigation. It uses Monday-first months in NZ calendar dates. Select a date to see event descriptions, local times, location and what to bring; more than one event can appear on the same day. Month arrows and Today change the view, and the upcoming list jumps to an event date. Home shows the next event from the same data source.

`src/data/events.ts` currently generates four explicitly labelled fictional events relative to the current NZ date. These are not actual club events, and staff event editing/RSVP is not implemented. Replace the mock source with approved club events through a repository when real content management is added. `src/domain/events.ts` contains tested month and upcoming-event calculations.

## Organisation

- `src/domain/models.ts`: internal member, membership, visit and repository contracts.
- `src/domain/attendance.ts`: shared, independently tested attendance, dates, streaks and milestones.
- `src/data/mock.ts`: deterministic fictional histories and browser-persisted target overrides.
- `src/integrations/`: future backend GymMaster contract and Supabase security notes. No API requests or credentials.
- `src/App.tsx`: application state, navigation and install help.
- `src/pages/`: individual member and staff screens. `src/components/`: shared cards, branding and dialog keyboard handling.
- `src/styles.css`: responsive white brand system with black/grey text and blue attendance accents, using Tailwind's Vite integration and custom component styles.
- `public/`: app icons. `vite.config.ts`: public app-shell caching and install manifest.

## Attendance rules

Weeks run Monday–Sunday in Pacific/Auckland, including NZ daylight saving. A workout is a distinct attendance event, not an app login. Duplicate event IDs, invalid dates, future events and other members' visits are excluded. Multiple legitimate visits on one day count individually, with a single calendar indicator. A streak counts consecutive weeks with at least one visit; an empty current week does not break the preceding streak until that week has ended. Longest streak is shown only when history is complete. Milestones are 50, 75, 100, 150, 200, then every 100 visits. Goal percentages can exceed 100%; the circular indicator fills to 100%. The six-week chart's target line represents the current target, not reconstructed historical targets.

## Before using real member data

Implement Supabase authentication, secure session handling, member/staff roles and database row-level security; replace the demo repository with a real persistence adapter. Add authenticated backend functions for GymMaster and verify the vendor documentation before mapping any response fields. Implement sync pagination, stable visit identifiers, deduplication, historical coverage, status updates and error recovery. Never expose GymMaster keys or Supabase service-role keys to the browser. The internal TypeScript contracts do not claim to match vendor fields.

Add NZ privacy/consent and retention controls, account recovery, accessibility and device testing, monitoring, server-side validation and end-to-end authorization tests. Review service-worker storage and logout cleanup before caching any sensitive data. Complete real brand assets and trainer-approved content. Test install/update/offline behaviour on physical iOS and Android devices before release. Push, challenges, nutrition, shop and community remain future features. There is no production security in this demo.
