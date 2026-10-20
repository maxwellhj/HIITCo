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

This only makes a server-side secret available for a future integration. The current backend does not read or return it and does not make GymMaster requests. `/api/health` reports liveness only, never whether a credential exists. `/api/gymmaster` and its child routes return HTTP 501 (not connected); other unknown API paths return JSON 404 rather than the app shell. No member data, login flow, token storage or public proxy has been enabled. Real integration still requires secure member identity/session handling and verified response formats.

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
