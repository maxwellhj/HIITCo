# HIIT Co. Control Room

The single website at `/control-room` manages app members, digital stickers, strength metrics and personal-best activity. It has no staff login. Private APIs require an allowed public network address; the initial configuration denies access until that address is set.

## Enable the connection

In Cloudflare → Workers & Pages → hiitco → Settings → Variables and Secrets, add a **Text** variable named `CONTROL_ROOM_ALLOWED_IPS` containing the staff connection's public IPv4 or IPv6 address. Deploy the variable change. Multiple addresses can be separated by commas. Narrow CIDRs are supported (IPv4 /24 or narrower; IPv6 /48 or narrower). Missing, malformed or broad ranges fail closed. `keep_vars` preserves dashboard variables during code deployments.

Everyone sharing an allowed public address can use these controls, including guests on the same internet connection. Use a staff-only connection/address if the club WiFi is shared. This is network access, not individual staff authentication. Changes cannot be attributed to individual staff members. A changing public address requires updating the variable. The public page never grants authority on its own; member cookies do not grant Control Room access.

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
