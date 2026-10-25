# HIIT Co. Control Room — proposed first release

A protected staff website connected to the same member data as HIIT Co. Hub. Routine member, sticker and content management should happen here without code changes or Codex. This document is a build plan; it does not expose an admin page or grant staff access.

## What staff should see

- **Members:** search the people who use the app, open a member profile and see recent app activity. Keep the app-user list distinct from the full GymMaster club roster.
- **Member profile:** visit totals, strength exercises, weight/volume charts, CHOW sets and the member's Trophy Room. Staff view the same records the member sees rather than maintaining a second set of results.
- **Trophy Room management:** upload the actual club sticker artwork, set its name/description, then toggle each sticker on or off for a selected member. Show who changed an award and when. Members see the result when their Trophy Room refreshes, without a deployment or reinstall.
- **Activity feed:** new weight/volume personal bests, new CHOW records and recently awarded stickers, with links to the member's profile. Let staff mark activity as read. Phone notifications can be added later with member opt-in.
- **Owner settings:** invite/remove staff and decide who may view member information, manage stickers or administer staff. Use individual logins rather than a shared password.

## Build order

1. **Staff sign-in and app-user directory.** Select the owner sign-in identity, invite staff and enforce their permissions on every staff API request. Populate the directory from successful authenticated app sign-ins/profile loads. Existing member stores have no central searchable directory, so previous users need to sign in again or be imported from an authorised member-ID list; do not pretend all historic app users can already be enumerated.
2. **Read-only member profiles and Strength Metrics.** Add the member list, search and detail screen, reading actual private account records. Keep member sessions restricted to their own records. The separate openly accessible fictional demo is never a source of staff authority.
3. **Sticker catalogue and award toggles.** Accept the club's actual artwork, store it once and record member awards independently. Add grant/revoke controls and an activity history. Connect the member Trophy Room to its own award endpoint and refresh while open or when the app becomes visible.
4. **Personal-best activity.** Detect improvements during successful server-side training/CHOW saves. Compare the same exercise or challenge and scoring unit, record each event once and handle retries, edits and deleted sessions without duplicate or misleading alerts.
5. **Content management.** Add club events, skill videos and announcements. Link to the existing workout builder initially; its approved publishing flow already feeds the app.

## Practical architecture

Use Cloudflare for the staff site and backend, alongside the existing app and workout builder. A separate staff URL can have a dedicated sign-in while the sites share server-authorised data services. The browser must never receive an integration key or gain authority merely from a hidden staff button.

The app currently stores encrypted training and CHOW logs in member-specific SQLite Durable Objects. Add a searchable server-side directory mapping authorised GymMaster identities to these records. Avoid duplicating their training history. Before production admin access, separate the long-lived data-encryption key from the rotating GymMaster API key, with an explicit migration/key-retention plan so member histories remain readable.

A managed staff sign-in service should issue verified identities; a server-side staff-role registry determines access. Owner: staff permissions and catalogue management. Coach: allowed member views and sticker assignments. Every staff read/write must be checked server-side, including image uploads and grant/revoke requests. Store an audit record for changes.

Store sticker metadata and awards in the backend and artwork in object storage, keeping private member data out of public files and browser caches. Define stable sticker IDs so replacing artwork does not revoke awards. Do not fabricate earned stickers from attendance or create automatic rules unless the owner chooses those rules.

For PB notifications, commit the training update and an event/outbox record together, then deliver the staff feed with idempotent event IDs. First sessions establish baselines rather than automatically generating a flood of personal-best alerts. If a result is corrected or deleted, reconcile the displayed best and its activity entry. In-app activity should be the first notification channel; push requires subscriptions, permission prompts and delivery handling.

## Inputs needed before implementing privileged access

- Owner identity and staff invitation/sign-in method.
- Which permissions coaches receive.
- The club's actual sticker files and names.
- Initial app-user directory strategy: future sign-ins only, or an authorised member-ID import.

No staff IDs have been authorised yet. No staff access, sticker-grant endpoint or public member directory is enabled by this plan.
