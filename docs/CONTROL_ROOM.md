# HIIT Co. Control Room

The single website at `/control-room` manages app members, digital stickers, strength metrics and personal-best activity. It has no staff login. Member-data APIs require an allowed public network address; the initial configuration denies member-data access until that address is set. Skills Library management is public and does not need this setup.

## Enable the connection

In Cloudflare → Workers & Pages → hiitco → Settings → Variables and Secrets, add a **Text** variable named `CONTROL_ROOM_ALLOWED_IPS` containing the staff connection's public IPv4 or IPv6 address. Deploy the variable change. Multiple addresses can be separated by commas. Narrow CIDRs are supported (IPv4 /24 or narrower; IPv6 /48 or narrower). Missing, malformed or broad ranges fail closed. `keep_vars` preserves dashboard variables during code deployments.

Everyone sharing an allowed public address can use these controls, including guests on the same internet connection. Use a staff-only connection/address if the club WiFi is shared. This is network access, not individual staff authentication. Changes cannot be attributed to individual staff members. A changing public address requires updating the variable. The public page never grants member-data authority on its own; member cookies do not grant access to other members’ records.

The deployment adds a `CONTROL_STORE` SQLite Durable Object and migration automatically. Existing training, attendance and workout-builder bindings remain in place.

## Daily use

- **Members:** search by name or GymMaster ID. Members enter this directory after a successful authenticated app profile refresh. Existing app users should refresh/reopen their profile; this is not a complete club roster or a historic user import.
- **Member detail:** view the member's actual training records, strength charts, CHOW records and total visits. Select a member before toggling their stickers.
- **Stickers:** upload the club's actual PNG, JPEG or WebP artwork (up to 256 KB), plus a name and description. Toggle awards in member detail. The member Trophy Room refreshes while visible and on return to the app. Artwork is served to awarded members only; locked stickers show a placeholder.
- **Activity:** new weight, training-volume and CHOW personal bests, plus sticker grant/revoke events. Mark items read; read state is shared by this Control Room. These are website notifications, not phone push or email. A first session establishes a baseline. Corrected/deleted records reconcile the feed; saves queue a durable retry if feed sync fails. Each member's latest 100 PB events are retained in the snapshot.

The directory is paginated and the website loads up to 10,000 entries. The activity query currently reads up to 4,000 member/kind snapshots plus the latest 100 sticker changes. This release has no catalogue deletion, staff accounts or automatic sticker-unlock rules.

## GymMaster reports

The Reports tab can connect the reports key directly on the website. It checks the provider's available-report list before saving the key encrypted on the server. Never paste integration secrets into chat or source code. An optional `GYMMASTER_REPORTS_KEY` Worker secret is also supported as a fallback.

The backend calls only the fixed GymMaster report endpoint with `X-GM-API-KEY`. Choose an actual report returned by the provider, then supply a date range. The preview requests Member ID and Member Name and strips additional returned columns. No report ID is guessed. Report results may be cached by GymMaster for six hours. Previewing a club roster does not import it as app users. Reports are optional: sticker controls and strength metrics work independently.

## Storage and verification

Profile directory entries, sticker metadata/artwork, report credentials, activity snapshots and training records are encrypted server-side using the existing `GYMMASTER_API_KEY` encryption derivation. Awards and internal lookup identifiers remain in private SQLite tables. Do not rotate that key without a migration/key-retention plan for existing encrypted data. Browsers receive no integration key and private responses use no-store caching.

Training and CHOW saves retain their revision checks. Their PB snapshot is queued atomically with the log, retried after failure, and centrally guarded against older revisions. Repeated award requests do not create duplicate activity. Member trophy and artwork requests use the member's authenticated session identity rather than a client-supplied member ID.

Tests cover network denial, encrypted directory/report storage, artwork validation, cross-member isolation, award idempotence, PB corrections and retries, report response filtering, and persistence across Worker restarts. Production GymMaster credentials and live member data are not used in these checks.

## Skills Library

Open the **Skills Library** tab in the Control Room. Video management has no login or network restriction, as requested by the owner. Anyone with the Control Room URL can upload, preview drafts, publish, unpublish or remove videos. Member information, sticker awards and report access remain network restricted. Unconfigured connections open the Skills Library by default, and that tab has no staff-connection notice. Enter a title, choose Box, Lift or Sweat, add optional coaching notes and upload an MP4 or WebM file up to 100 MB. For reliable phone playback export MP4 with H.264 video and AAC audio; this release does not transcode phone camera originals or accept MOV files.

Uploads are saved as drafts. Preview the video, then select **Publish video** to show it through the member app's Skills Library button. **Unpublish** hides it from members without deleting the file. **Remove** asks for confirmation and removes the catalogue entry and file. Members must have a valid app session to list or stream videos; member-facing video URLs do not bypass draft checks. Control Room preview URLs are public along with video management. The member library refreshes on return and every 30 seconds while visible.

`SKILL_VIDEOS` is a new SQLite Durable Object binding with one object per video, added by the `skills-library-v1` migration. Video bytes are stored in 1 MB chunks and streamed with byte-range and HEAD support for seeking. No external video host, R2 bucket or extra secret is required for this initial short-video library. Video management and preview endpoints are public; they use Cloudflare storage encryption rather than the member-log encryption key. Catalogue titles and notes are encrypted with the existing app key. The initial library limit is 200 videos; use dedicated media storage/transcoding if this grows into a large video collection. Incomplete uploads are cleaned after a day, and failed catalogue registration removes the uploaded file.

Run `npm run test:skills` for the real Worker/SQLite integration check. It uses synthetic video-container bytes and fake member credentials to check publication, authentication, upload validation, range responses and persistence. Browser playback is additionally checked with a locally generated H.264 MP4, never with member data.

The connection setup notice is hidden on every tab once Control Room access succeeds. Only an explicit `control_access_restricted` response can switch that access state off; unrelated rejected requests show their own error without displaying a staff-connection notice. Video upload validation uses the same 100 MB limit in the browser and backend.

### Video thumbnails and category subtabs

The member app displays each video title above its clip. After uploading a video, use **Choose thumbnail** on its Control Room card to select a JPG, PNG or WebP image (up to 15 MB). Images are resized automatically to fit within 1280 × 720 and compressed before saving. Use **Change thumbnail** or **Remove thumbnail** later without re-uploading the video. A 16:9 image fits the player best. Published thumbnails refresh with the member library; draft thumbnails are available through the public Control Room preview but not the member-facing endpoints. Images persist alongside each video, and removing a video removes its image too.

Use **All**, **Box**, **Lift** and **Sweat** subtabs to filter the Control Room catalogue. Counts include both drafts and published videos. Filtering does not change an existing video's category. After a new upload, the catalogue shows its selected category so the draft is easy to find.

## Club events

Open **Club events** in the Control Room to manage calendar content. The weekly-target panel has been removed from this section; individual goals are edited under Members. Existing saved goals and the club fallback are preserved. Members’ goals still count distinct confirmed NZ training dates, and weekly streak definitions are unchanged.

Create an event with a title, description and NZ calendar date. Time and booking URL are optional. Saved events appear immediately in the backend feed and update in the member calendar and home-screen upcoming-event card on opening/refresh, return to the app, or the 30-second visible refresh. The calendar marks event dates and offers **Book this event** when a URL is provided. Blank times display **No set time**. Edit existing events without duplicating them, or remove them with confirmation. Dates are stored as NZ date-only strings and times as NZ wall times. Booking URLs allow HTTP/HTTPS only, without embedded credentials. The initial event limit is 500; this calendar does not import GymMaster bookings.

Club event management is available without staff network setup, matching public Skills Library management. Anyone with the Control Room link can change this club content. Member records, reports and sticker assignments keep their separate access checks. Events and the target are encrypted in the existing ControlStore; no new binding or secret is needed. Live member calendars use saved content only; sample events remain confined to the explicit fictional demo.

Run `npm run test:club` for the real Worker/SQLite checks covering target validation, event create/edit/remove, optional fields, safe links, session/origin checks and persistence across restarts.

To use the uploaded video itself as the thumbnail, play it in the Control Room, pause or scrub to the desired moment, then select **Use this frame as thumbnail**. The browser captures that exact frame and saves it through the existing thumbnail endpoint; no separate image file is required. **Upload image instead** remains available as an alternative. The saved frame is used in the member library too.

Published workouts refresh when the app becomes visible or regains focus. Members can also select **Refresh workouts** without reloading the page. Calendar dates continue to use the NZ week and validated builder feed; **Program week** is labelled separately from the calendar week beginning. These changes do not alter the builder's schedule or publish a different plan.

## Individual member weekly goals

In **Members**, select a member and click the **Training this week — X out of Y** counter in their summary box. It opens the weekly-goal editor inside the same box. Choose 1–7 training days per week and select **Save member goal**. The editor collapses after saving. The numerator counts distinct dates in the member’s training log this NZ week, not lifetime exercise entries or complete GymMaster attendance; it is labelled **Logged days**. This overrides the club default for that member only. Choose **Use club default** and save to remove the override; future club-default changes then apply automatically. Changing the club-wide default never overwrites an individual goal.

Individual goals use the same protected member-management access as member records and sticker awards. The backend validates the member exists and stores the override encrypted under that member's private identifier. The member app resolves its own goal from the encrypted session, never from a client-supplied member ID. It refreshes while visible, on return, or on reopening Home. Existing training-day counting and streak definitions remain unchanged. No new binding or secret is required.

Run `npm run test:member-goals` for the real Worker/SQLite integration checks covering separate member goals, protected writes, 1–7 validation, default inheritance/reset and persistence across restarts.

### Event responses

Members can choose **Going**, **Maybe** or **Can’t attend** on a calendar event and change their response later. One encrypted response is stored per member/event using the authenticated member session identity. Member app feeds include only that member’s responses; public event-management feeds never include responses or attendee names.

Under **Members**, select a member and open **Event responses** to see upcoming events with **Going**, **Maybe**, **Can’t attend** or **No response**. Past events with a saved response are also shown. The staff view uses the protected member-management API. Responses persist across app/server restarts and refresh with the member app feed and Control Room member details. Editing an event retains its responses; deleting it removes its responses. A Going response does not complete an external booking; members are prompted to follow the booking link when one is supplied.

Run `npm run test:event-responses` for real Worker/SQLite checks covering the three choices, change-without-duplicates, member isolation, protected staff reads, public-feed privacy, input/session/origin checks, restart persistence and deletion cleanup.
