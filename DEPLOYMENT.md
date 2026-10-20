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

After deploying, open `https://hiitco.maxwellhj.workers.dev/#connect` (also linked from Home as **Connect GymMaster**). Enter your own authorised GymMaster member email and password directly into that screen. Do not send those credentials through chat. A successful test displays **GymMaster sign-in verified**. The connection screen additionally previews real daily visit counts for the signed-in account. The homepage and other tabs continue to use fictional profiles and demo attendance.

The backend submits the documented `api_key`, `email`, and `password` fields as a form to the fixed club login URL. It verifies the documented `result.token`, `result.expires`, and `result.memberid` types. Provider error text is never sent back to the browser. The browser receives connected state and expiry only, not a token, member ID, password or API key. No member-ID-only login or arbitrary proxy is exposed.

The temporary provider token and member ID are encrypted using AES-GCM in a `__Host-` cookie with HttpOnly, Secure, SameSite=Lax and Path=/ attributes. The cookie key is derived with a domain-separated SHA-256 digest of the server-held integration key. Replacing that key invalidates existing connection cookies. The lifetime follows GymMaster's documented expiry in seconds, capped at one hour. Disconnect clears the local connection cookie; it does not assume an undocumented GymMaster token-revocation endpoint. Passwords are forwarded for login only and are not persisted by this application or written to application logs. Private values must never be added to Cloudflare request/body logging.

`wrangler.jsonc` configures a `LOGIN_RATE_LIMITER` Cloudflare binding (10 attempts per 60 seconds, applied to IP and hashed normalised email keys). This binding is installed with the Worker deployment; it requires no secret value. Login fails closed if the key, limiter or Cloudflare client-IP header is unavailable. Login/logout require a matching Origin and reject cross-site requests. The app refuses frames, and JSON API responses are uncached.

Routes:

- `GET /api/health`: public liveness only, no credential status.
- `POST /api/gymmaster/login`: same-origin member connection test.
- `GET /api/gymmaster/session`: connection state/expiry only; invalid and expired cookies are cleared.
- `POST /api/gymmaster/logout`: same-origin disconnect.
- `GET /api/gymmaster/visits`: encrypted-cookie authentication, fixed upstream daily-visits endpoint, three NZ calendar weeks through today, documented fields only, no-store responses and per-member rate limits. Query parameters and cross-site requests are refused. Missing dates are not filled with zero; check-in times are not available. Provider failures never fall back to demo records.
- Other `/api/gymmaster` routes: HTTP 501 until the relevant schemas and authorisation are implemented.
- Other unknown `/api` routes: JSON 404, not the app shell.

A real GymMaster sign-in has **not** been tested from the coding workspace. The key is stored in your Cloudflare project, not available here. Local tests use fake credentials and mocked provider responses. The user has confirmed a successful sign-in on the deployed site. The daily-visits schema has been supplied and implemented; verify its attendance preview on the deployment next. The profile Member schema is still required. Exact check-in timestamps and historical coverage still require confirmation. Staff demo remains open and exposes fictional data only; it is not authorised staff access to real GymMaster information.

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

Format diagnostics report only fixed categories (BODY, ENVELOPE, RESULT, TOKEN, EXPIRY, MEMBER), never response values or arbitrary property names. Login integer fields accept positive safe JSON integers or strictly decimal integer strings; provider lifetimes have no undocumented one-day limit, while local sessions remain capped at one hour (or the shorter provider lifetime). Live response compatibility still requires verification.
