# BREAKPOINT public deployment

The repository is prepared for **Vercel frontend + one Render Node web service**.
The deployable configuration and local checks are implemented. A public game URL
exists only after those services have been created in your accounts, their real
URLs configured, and the live verification below passes. Example URLs in this
document are placeholders.

Current handoff: the tested source is committed locally. The GitHub push was
attempted but could not authenticate; no remote push, cloud deployment or public
game URL is claimed. Connect GitHub, Vercel and Render to finish from this session,
or authenticate Git and follow the dashboard steps below. Do not paste account
passwords or access tokens into chat.

## What friends receive

Share your **frontend HTTPS URL**, not localhost or the room server URL. Desktop
uses keyboard/mouse; phones and tablets use landscape touch controls. Chrome has
automated desktop/mobile emulation coverage; physical mobile checks are described
in [BP-13](docs/BP-13.md).

1. Open the game, choose **Create room**, enter a callsign and choose FFA or TDM.
2. Choose **Copy invite** in the lobby and send that link to your friends yourself.
3. The invite opens **Join room** with the code filled. Each friend enters a
   callsign, joins and selects **Ready up**.
4. The host selects **Start session**. The arena opens automatically for 3-2-1/GO.
   If desktop mouse capture is denied, click **Click to Play** over the arena.
5. Up to eight people can join. TDM supports four per side. Training works solo.

Your computer does not need to stay on once both cloud services are deployed.
Private codes are convenient invitations, not account-based authentication.

## 1. GitHub

The configured repository is
[`Rayyjcray/Web-Fps-Shooting`](https://github.com/Rayyjcray/Web-Fps-Shooting).
The project uses the repository root for both deployments so npm can resolve the
shared workspace. Keep `apps/client`, `apps/server`, `apps/shared` and the root
lockfile together.

Push the validated source to `main` using your authenticated GitHub account.
`.github/workflows/ci.yml` runs lint, formatting, unit/integration tests, production
builds, public-build configuration checks, browser acceptance and an eight-client
FFA/TDM smoke check. Generated output, local environment files and hosting CLI
credentials are ignored. No access token belongs in a `VITE_` variable.

## 2. Render multiplayer server

Create a Blueprint from this repository's root **render.yaml**. Its configuration:

| Setting           | Value                                                                   |
| ----------------- | ----------------------------------------------------------------------- |
| Runtime           | Node 24.21.0                                                            |
| Root directory    | Repository root; leave blank                                            |
| Region            | Singapore; change before creation if most friends are elsewhere         |
| Instances         | **One**                                                                 |
| Build             | `npm ci --include=dev && npm run build:server`                          |
| Start             | `npm run start:server`                                                  |
| Health check      | `/health`                                                               |
| `NODE_ENV`        | `production`                                                            |
| `HOST`            | `0.0.0.0`                                                               |
| `PORT`            | Let Render supply it                                                    |
| `ALLOWED_ORIGINS` | Exact Vercel website origin, for example `https://your-game.vercel.app` |
| `MAX_ROOMS`       | `16`; a resource ceiling, not a tested capacity guarantee               |

If the frontend URL is not assigned yet, initially use the reserved, non-working
origin **https://setup.invalid**. This keeps browser matchmaking closed while
you create the frontend. Replace it with the actual frontend origin in step 4.

After the deploy succeeds, copy Render's **actual HTTPS service URL**. Opening
`https://YOUR-ACTUAL-SERVICE.onrender.com/health` should return:

```json
{ "status": "ok", "maxPlayers": 8 }
```

The health check becomes ready after physics initialization. Browser matchmaking
and WebSocket upgrades enforce the origin allowlist. Headless SDK clients have no
Origin and remain usable for diagnostics. Room slots are reserved before async
initialization to bound concurrent room creation. HTTP and WebSocket share one
listener behind Render's managed TLS proxy; no public `:2567` URL is needed.

**Cost choice:** the Blueprint explicitly selects **Free**, so importing it does
not select paid compute. Render's free service sleeps after 15 minutes without
inbound traffic and can take about a minute to wake. The game waits up to 75
seconds for readiness before matchmaking; closing its dialog cancels the attempt.
For an always-on production service, review current pricing and select a paid
compute plan yourself. Do not treat the free tier as an uptime commitment.
[Render's free-service limits](https://render.com/docs/free)

Keep one instance/process: room codes, presence and matches currently live in
memory. Do not enable autoscaling, PM2 clusters or multiple replicas without a
shared driver/presence and process routing. A restart, free-service sleep or
deployment ends current rooms. This release does not restore matches or store
historical scores. No database is required for friends testing.

## 3. Vercel frontend

Import the GitHub repository in [Vercel](https://vercel.com/new). Use:

| Setting           | Value                                             |
| ----------------- | ------------------------------------------------- |
| Root directory    | Repository root; leave blank                      |
| Framework         | Vite                                              |
| Node              | 24.x                                              |
| Install           | `npm ci --include=dev`                            |
| Build             | `npm run build:client`                            |
| Output            | `apps/client/dist`                                |
| `VITE_SERVER_URL` | The real **HTTPS Render service URL** from step 2 |

Root **vercel.json** supplies the install/build/output settings and cache/security
headers. Hashed assets receive a year of immutable caching; the entry page must
revalidate. No Vercel function is used for room simulation.

Set `VITE_SERVER_URL` for **Production** before deploying. Public builds reject a
missing, insecure or localhost endpoint. HTTPS and WSS values both normalize to
an HTTPS matchmaking endpoint; the SDK uses WSS for room traffic. The variable is
compiled into the frontend and is public. Changing it requires a new build.

Copy Vercel's **actual production origin**, without a trailing slash or path.
Do not substitute a guessed project URL. Use that stable production domain in
room invitations. If deployment protection restricts the production site, make
the production audience public so friends can access it without your account.

## 4. Connect and verify the real URLs

1. In Render, replace `ALLOWED_ORIGINS` with the actual frontend origin and
   redeploy. For multiple trusted frontend origins, use a comma-separated list.
   Wildcards, paths and trailing slashes are refused. Preview deployments and
   custom domains need their own exact origin in this list.
2. Confirm Vercel's production `VITE_SERVER_URL` matches the actual Render URL.
3. Open the frontend in a signed-out/incognito browser. Training should load;
   create a room and join its invite from a second browser/device.
4. Run the eight-client live smoke check below with those same two URLs.
5. Complete the eight-human/target-device check before claiming production
   capacity or a hardware FPS target.

The server defaults to local origins only in development. Production startup
refuses an empty origin allowlist. Neither a placeholder domain nor a successful
local build verifies public access.

## Automated checks

Run from the repository root. PowerShell can use `npm.cmd` in every command.

```sh
npm ci
npm run lint
npm run format:check
npm test -- --maxWorkers=2
npm run build
npm run check:deployment
npx playwright install chromium
npm run test:browser
```

On a machine with Chrome installed, set `PLAYWRIGHT_CHANNEL=chrome` instead of
installing Chromium. Run CPU-heavy checks separately from software-WebGL tests.

`check:deployment` executes real Vercel-mode builds: missing and localhost server
URLs must fail; a secure example origin must build. Its generated `.deploy/`
output is a configuration fixture and must not be published as the real website.

For a deployed server (replace **both** examples):

```sh
npm run smoke:multiplayer -- --server https://YOUR-ACTUAL-SERVICE.onrender.com --origin https://YOUR-ACTUAL-GAME.vercel.app --seconds 15 --output test-results/live-smoke.json
```

This creates isolated private test rooms, connects eight SDK clients in FFA then
TDM, rejects a ninth, readies/starts each match, targets 60 input updates per
second per client, fires/reloads weapons, checks acknowledgements and confirmed
shots, verifies 4v4 assignment and host migration, and leaves the rooms. It first
checks readiness and the frontend's CORS origin. The JSON report records observed
acknowledgement latency, sent inputs and server ticks. Run it only against your
own server; it intentionally generates game traffic. A local run omits the URL
flags and uses `http://127.0.0.1:2567` with `npm run start:server` running.

This proves SDK/socket behavior at that endpoint; it does **not** represent eight
human browsers, geographic latency, GPU performance or endurance testing.

## Target-device performance and friends playtest

For a repeatable single-browser baseline, serve a production build using
`npm run preview`, or use the live frontend URL:

```sh
npm run profile:browser -- --url https://YOUR-ACTUAL-GAME.vercel.app --headed --preset performance --seconds 30 --output test-results/thinkpad-performance.json
```

The profiler runs training at 1280×720 with adaptive resolution disabled, warms up
for five seconds, then records walking, fire, ADS and reload with renderer/CPU
identity, rolling FPS/1% lows, CPU submission and draw/triangle counts. Repeat for
Balanced and Quality. `--preset ultra` uses a 1920×1080 viewport to measure the
optional Ultra (1080p) preset at its actual target size. Run on the actual target machine and confirm the reported
renderer is its hardware GPU. `--software` explicitly uses SwiftShader for tool
verification; those numbers are never hardware benchmarks. Headless/headed mode
and the scenario are included in reports. This tool uses the default bindings.

BP-01 adds actual world resolution, texture detail, shadow map size, view distance
and render scale to profile reports. `--shadows off|low|high` selects the static
shadow setting (default Off). Presets now use 640×360, 960×540, 1280×720 and
1920×1080. The existing BP-01 hardware measurements cover the first three presets;
1080p performance depends on the device and needs its own profile.

To compare edge smoothing, repeat a fixed preset with
`--aa off|fxaa|smaa|msaa2|msaa4`. Reports include the effective method, sample
count and post-pass count. The profiler refuses unavailable choices so a fallback
is not mistaken for a successful benchmark. Run each mode separately with no
other browser tests in progress, and compare frame-time lows as well as averages.
`--screenshot` saves an initial comparison capture beside the JSON (`.json.png`)
before warmup; the capture's startup FPS is not the recorded profile average.

For the real friends test:

- Connect eight **people/devices** using the public invite. Confirm a ninth is
  refused and TDM has four players on each team.
- Play FFA and TDM, including simultaneous movement/fire, ADS, reloads, slides,
  dives, health/death/respawn, timer/results and a rematch.
- Release the mouse/hide a tab, reconnect after a disconnect, and have the host
  leave. Confirm another player becomes host.
- Listen to the audio mix on speakers/headphones. Adjust levels and reduced
  motion to taste.
- On the target ThinkPad X1 Carbon, enable detailed diagnostics. Record the
  preset, resolution, adaptive setting, FPS/1% low, browser/GPU, network region
  and any stalls during a full eight-player match. A training profile alone does
  not verify eight-player FPS.

Remote avatars retain one shared instance pool. Appearance colors now upload
only when membership/team/protection changes affect their slots, preserving the
same visible hitbox geometry and avoiding repeated color conversions/uploads.
Nearest-neighbor world rendering, fixed effect pools and lazy engine/SDK loading
remain intact. Rapier's embedded WebAssembly chunk is still about 1.67 MB gzip;
its expected build warning is not an FPS measurement.

## Updates and rollback

Server auto-deploy is off in the Blueprint. Deploy after checks pass and friends
finish a round: replacing the single server disconnects active rooms. Keep the
frontend and server protocol compatible. Roll back to a matching earlier commit
in both hosts if needed. After changing either URL/origin, rerun the live smoke
check and an incognito invite join. Health 200 alone does not test WebSockets.

## Troubleshooting

| Symptom                                 | Check                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------- |
| Public build refuses the endpoint       | Set the real HTTPS `VITE_SERVER_URL` in Vercel Production and rebuild.                      |
| Long first connection                   | A free Render service may be waking. Leave the dialog open or cancel and retry.             |
| Training works, joining fails           | Check `/health`, the exact `ALLOWED_ORIGINS`, HTTPS/WSS, and whether the room still exists. |
| Preview fails while production works    | Add that exact preview origin on the server, or test from the stable production URL.        |
| Friends see a login screen              | Check Vercel's production deployment protection/audience.                                   |
| An old code stops working               | Restarts/sleep/deploys discard in-memory rooms. The host creates a new room/invite.         |
| SDK smoke passes but real play stutters | Profile the actual GPU/network/device and a real eight-browser match.                       |

References: [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite),
[Render WebSockets](https://render.com/docs/websocket),
[Render Blueprint configuration](https://render.com/docs/blueprint-spec),
[Render health checks](https://render.com/docs/health-checks),
[Colyseus deployment](https://docs.colyseus.io/deployment),
[Playwright CI](https://playwright.dev/docs/ci-intro).
