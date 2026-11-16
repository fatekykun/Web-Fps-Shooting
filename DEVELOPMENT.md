# BREAKPOINT development log

## Scope

The repository initially contained only `prompt.md` and `.git`. The original
brief is unchanged. Milestones 1–8 are implemented locally. Milestone 9 deployment
code and verification tools are implemented; cloud publication, eight-human play
and physical-device performance checks require the live hosting accounts/devices.

## Milestone 9 — public deployment preparation

Added root Vercel/Render deployment contracts, a pinned production Node version,
frontend/server build commands, ignored environment/hosting state, and GitHub CI.
Both hosts build from the repository root to preserve shared workspace resolution.
Vercel builds the static client with an explicit public HTTPS server URL. Missing,
local and insecure public endpoints are refused. Runtime endpoint normalization
maps WSS/HTTPS correctly and never probes a public frontend on local port 2567.
Vercel cache headers retain hashed assets while revalidating the entry page.

The production server binds the platform network/port, initializes physics before
readiness, requires exact frontend origins and checks both HTTP matchmaking and
WebSocket upgrades. It uses standard HTTP error statuses behind hosting proxies.
A synchronous room reservation bounds concurrent initialization; failed/disposed
rooms release their reservation. Draining returns health 503 and rejects new
connections while SIGINT/SIGTERM run bounded shutdown. Single-process, in-memory
rooms remain intentional; no Redis, database or new runtime dependencies.

Friends can copy a direct website invite. Valid codes open Join with the code
filled, while names and the actual join still require user input. Invalid query
values are ignored and invite copying removes unrelated query/fragment data.
The connection flow waits for a cold-starting host's readiness for up to 75 seconds
and honors cancellation before creating a room. The Render Blueprint chooses a
free service in Singapore with auto-deploy off; free services can sleep/reset
rooms, while always-on paid compute requires an explicit account/plan choice.

Added a two-mode/eight-SDK-client smoke tool with readiness/CORS, 4v4, capacity,
input acknowledgements, server shot reports, host migration and cleanup checks.
The browser profiler records a fixed-preset training scenario with renderer/CPU
identity and rolling telemetry; software results are marked explicitly. Remote
avatar colors now upload only when appearance changes, with the same geometry,
one instance pool and exact hitboxes. Existing nearest rendering and effect pools
are preserved. `DEPLOYMENT.md` covers the real URL setup, sharing, updates,
rollback, cold starts, diagnostics and physical/eight-human release checks.

Verified: **146 unit/integration tests across 29 files** pass, plus strict
TypeScript, lint, formatting and both production builds. Real Vercel-mode builds
refuse missing/local server URLs and accept a secure configuration fixture. All
**15 Chrome acceptance cases** pass across the regression/focused runs, including
the direct invite/callsign/join/ready/leave flow. The networking test now waits for
the visible crosshair before pressing movement, avoiding a pointer-lock race.

The final five-second-per-mode socket smoke used eight clients, sent 298 inputs
per client in FFA and 299 in TDM, observed 298/303 server ticks, 201/198 confirmed
shots, rejected ninth joins and verified host migration/cleanup. Measured p95
acknowledgement latency was 79.10/73.70 ms on local loopback; this includes batching
and server handling and is not geographic RTT or a hosting capacity guarantee.
Reports are generated under ignored `test-results/`.

The profiler was exercised for ten seconds at Balanced/1280×720 after warmup,
recorded 33 telemetry samples and identified ANGLE SwiftShader/software rendering.
It verifies the tool, not target-device GPU FPS. No new dependencies were added.
The initial source is prepared for the configured GitHub remote. Vercel/Render
account access and actual service URLs are still needed; no public frontend or
multiplayer service has been deployed or live-tested. GitHub CI is configured;
remote Actions execution requires the source push and is not claimed as verified.

## Milestone 8 — tactical interface and polish

Added the command menu (Play/Create/Join/Settings/Credits), operation chooser,
native settings/credits dialogs and a consistent charcoal/olive/amber interface.
Room tabs separate creation and joining; the lobby adds remembered callsigns,
code copying with manual-selection fallback and cancellable connection attempts.
Closing dialogs restores focus. Tabs support arrow/Home/End navigation, binding
capture reserves Esc for cancellation, and controls retain visible focus states.
HUD timer/scores/health/ammo/weapon/hits/kill feed and results keep server authority.
The pixel world and native-resolution interface remain separate.

`game/settings/userSettings.ts` owns validated, versioned browser preferences:
sensitivity, FOV, invert Y, unique/swappable keyboard bindings, reduced motion,
diagnostics, four audio levels/mute and crosshair presentation. Settings apply
immediately and tolerate blocked/corrupt storage. Binding hints reflect changes.
FOV drives the actual camera, reticle projection and ADS sensitivity scaling;
weapon-specific aimed FOV and server accuracy rules remain unchanged. Existing
graphics persistence remains separate. Restore defaults resets both sets.

`game/audio/AudioEngine.ts` synthesizes weapon, movement, equipment, interface,
confirmed hit/hurt/death/respawn and ambient cues after gesture unlock. One context,
one reusable noise buffer, 16 transient voices and two ambient oscillators bound
the graph; ended effects disconnect. Remote reports use distance/pan, without
occlusion. Hidden tabs stop effects/suspend the context; disposal closes it.
Audio failure does not block gameplay. No dependencies or sound assets were added.

CSS provides brief menu/dialog transitions; the existing pooled viewmodels add
exponentially damped sprint lowering and slide/dive cant, while preserving reload,
equip and recoil animation. Reduced motion follows fresh OS preferences, disables
menu transitions and reduces cosmetic weapon movement. First-person body height
still follows physics. Remote geometry is unchanged to preserve server hitboxes;
skeletal locomotion/body animation remains a later enhancement.

Validation: **134 unit/integration tests across 23 files** pass. Added coverage for
settings sanitation/storage/swap behavior, remapped input and mouse scaling,
gesture-only audio initialization, the voice cap, mute, hidden-tab teardown,
unavailable audio and spatial attenuation/pan. Strict TypeScript, lint and both
production builds and formatting pass. Run CPU-heavy checks separately: an
additional concurrent Vitest/software-Chrome run exceeded five tests' five-second
budgets; `npm test -- --maxWorkers=2` passes all 134 in 12.7 seconds on its own.

All **14 Chrome acceptance cases** passed across the full regression and focused
reruns. The final four-case interface/private-room run passes together in 1.3
minutes, including pending-connection cancellation, dialog focus restoration,
real remapped movement, saved FOV/ADS/reticle/graphics, gesture-unlocked audio/mute,
code copying and create/join/start/synchronize/leave. The private-room selector
now scopes Leave Room to the active dialog because navigation also offers that
action. Prior movement, local/online combat, framebuffer pixel checks, FFA winner,
rematch, TDM timer/draw and scoreboard cases also pass.

Visually reviewed the menu/settings at 1280×720, 960×640 and 640×640, plus credits,
private lobbies, live HUD, team scoreboard and results. Verification uses software
WebGL and SDK peers; physical-device FPS and human audio-mix quality are unverified.
The expected embedded Rapier large-chunk warning remains. No deployment changes.

New implementation files: `app/interface.css`, `components/CommandMenu.tsx`,
`CommandPanels.tsx`, `SettingsPanel.tsx`, `TacticalDialog.tsx`,
`game/settings/userSettings.ts`, `game/audio/AudioEngine.ts`, their unit tests and
`tests/browser/interface.spec.ts`. Updated App/Game composition, input, weapon
viewmodel, graphics/room/HUD components, browser room coverage and documentation.

## Milestone 7 — FFA and TDM

Added a server match controller for lobby → playing → results → lobby. Defaults
are FFA: 20 kills/five minutes, TDM: 40 team kills/seven minutes. Validated host
settings allow 1–100 kills and 30–1800 seconds, only in the lobby. Settings/team
changes reset readiness. TDM auto-balances joins, caps each side at four, permits
lobby team requests, and requires both sides to be balanced within one player.
Smaller balanced matches and eight-player 4v4 rooms are supported.

Only server-generated kills with known participant IDs update personal kills,
deaths or team scores. Teammates stop rays without receiving damage. Public team
colors match opposite-side spawn areas and respawns. Orange spawns face inward.
Late joins fill the smaller team and avoid occupied spawn candidates. Player
scores survive disconnects for that round; score rows are bounded to 64 total
participants while the active room capacity stays eight.

The match clock uses monotonic server time independently of dropped simulation
catch-up. Deadlines stop combat before the next tick; score limits settle after
the current combat tick so simultaneous equal finishes can draw. Timeout selects
the FFA leader or higher-scoring team; ties (including no-kill FFA) draw. Ending
freezes movement, weapons, respawns, scores and results. Host-only return to lobby
resets loadouts/readiness/scores and advances life generations before rematching.
Host migration remains supported; teams are not reshuffled or forfeited mid-match.

Late in-flight inputs are validated/finalized without simulation outside active
play, preserving sequence continuity through results/rematches. Client prediction
suspends at match end, capture releases, and new-life look/position resets face the
new spawn. The kill feed/effect pools reset for a new round. React updates match
UI on score, roster, phase, settings or one-second timer changes, independently
of rendering and movement patches.

Added mode/settings controls, team roster/actions, personal/team score and timer,
hold-Tab/clickable scoreboard, final results and return-to-lobby controls. No new
runtime dependencies or external services were introduced. Scored state stays in
memory for the current room; persistent statistics and historical match storage
are not implemented. Full audio/animation/settings polish and deployment remain
later milestones. Current-pose hit validation still has no lag compensation.

Verified: **126 unit/integration tests across 21 files** pass. Strict TypeScript,
zero-warning lint, formatting and both production builds pass. All **11 Chrome
acceptance checks pass together** (3.0 minutes, exit code 0), including FFA's
server-scored winner, frozen results, capture release and clean rematch; TDM's
team roster, opposite spawns, score/timer, Tab scoreboard and a real timed draw;
and every previous movement, room, local/online combat and pixel/color check.

A live Colyseus test scores a real validated elimination, ignores forged score
messages, freezes gameplay through results, returns to the lobby, then starts
eight actual SDK clients as four per side. It also verifies host migration,
retained departed scores and a balanced replacement join. Unit coverage includes
20/40-kill defaults, five/seven-minute limits, timeout winners/draws, equal-tick
finishes, readiness/team limits, friendly bullet obstruction without damage,
team respawns and score/life reset. Input coverage verifies that dead gameplay
controls stay neutral while the held scoreboard remains available.

FFA results and TDM lobby/scoreboard/results captures were visually inspected at
1280×720. Verification uses software WebGL and SDK peers; no physical-device or
eight-human performance benchmark is claimed. No dependencies were added. The
embedded Rapier chunk retains its expected large-chunk warning.

## Milestone 6 — authoritative combat

Added server-owned weapon inventory, clocks, ADS, recoil, accuracy, hitscan, health,
death/respawn and kill events to private rooms. The existing pure weapon controller
and recoil implementation moved into shared modules, with client compatibility
exports. No dependencies were added or upgraded. Offline training is preserved.

The protocol accepts normalized movement/look plus typed weapon controls and a
life number. It strips origin/seed/ammo/damage/target claims. Unknown damage/shot
messages cannot mutate gameplay. Server loadouts grant rifle/SMG/shotgun; ownership,
fire intervals, equip/reload state and finite ammo gate each shot. Weapon time
advances once per fixed server tick, independently of input arrival counts.
Fresh validated weapon controls and look are coalesced separately from queued
movement: release/aim/reload/switch do not replay behind an old movement backlog.
Held weapon input expires after six ticks. A regression covers release under load.

The server casts from its current eye position with server recoil and a private
random spread seed. Rapier supplies world obstruction; shared rendered part boxes
supply yaw/head-pitch/posture-aware body/head hits. Each pellet selects the nearest
living player before the wall/range limit. Self hits are excluded. Protected bodies
block bullets without taking damage. A lethal shot emits one kill event. All
living shooters generate their tick's shots before damage is applied.

Death disables movement and firing. Three seconds later, the server restores the
loadout and movement at a distant spawn, grants one second of protection and
increments the life number. Stale life inputs cannot move/fire after respawn.
Prediction clears old history on death/respawn while preserving sequence continuity;
remote histories snap on life transitions and hide dead bodies.

The online resolver predicts only presentation. Authoritative snapshots own ammo,
health, reload indicators and hit markers; local firing cannot create a confirmed
hit. Server shot events feed pooled traces/impacts and kills feed a bounded HUD
list. Health/death/respawn/protection and incoming-damage feedback are visible.
React receives combat events on meaningful changes plus the existing 4 Hz telemetry.
Effects clear when leaving a room, and the local dummy is hidden/disabled online.

Limits: validation uses current server poses, without lag compensation or rewind.
Rendered remote movement remains delayed for interpolation. No teams, scored match,
timers/results, skeletal animations or audio are added. Spawn protection and weapon
values remain prototype tuning; physical-device and eight-human profiling remain
unverified.

Verified on Windows/Node 24.21.0: **112 unit/integration tests across 18 files**
pass, along with strict TypeScript, zero-warning lint, formatting and both
production builds. All **nine Chrome acceptance checks pass together** (2.0
minutes, exit code 0). The combat browser check confirms server-owned ammo/hits,
kill feed, player death and full-health/full-ammo respawn, using one browser
player and two actual SDK peers. Existing room capacity/host migration, movement,
offline weapon and GPU pixel/color checks continue to pass. The foundation test
now explicitly waits for mouse capture before sending a movement key on resume.

Tests cover body/head/range geometry, cover obstruction, closest targets, self
exclusion, shotgun pellets, ownership/fire-rate/ammo limits, atomic reload and
switch cancellation, protection, one kill per death, stale/dead-life input,
respawn prediction/interpolation, fresh release through a movement backlog, and
presentation/authority separation. Real socket tests submit forged damage,
origin, ammunition and seed claims and verify that the server retains authority.
Leaving a room also clears online effect pools. Combat and death screenshots
were visually inspected at 1280×720. Software WebGL is functional verification,
not a target-hardware performance benchmark. The Rapier bundle retains its
expected large-chunk warning.

## Milestone 5 — private multiplayer

Implemented a separate Colyseus Node workspace with private six-character room
codes and eight-player capacity. The React room dialog provides callsigns,
create/join, roster, ready status, host start and leave. The host transfers on
departure, late joins use free spawn slots, and the last departure disposes the
room. Disconnects end the session explicitly so a new join gets fresh history.

Moved the existing movement FSM/helpers, Rapier adapter and static collision map
to shared modules, retaining client re-exports for compatibility. Client and
server use the same fixed-step code and configuration. Full snapshots include
posture, velocity, grounding, action buffers, recovery/cooldown timers and wall
jump state. Only the owner receives those correction snapshots. Reconciliation
restores the snapshot and replays pending movement without replaying weapons.
Small camera corrections decay; large corrections snap.

The server targets 60 fixed ticks/second and 20 state patches/second. Client input
is batched at 30 Hz with consecutive sequence numbers. Validation strips reported
positions/time/damage, rejects malformed axes/look/actions, caps batch and queue
sizes, limits messages/payload size, and consumes at most one input per player
per tick. Brief input gaps wait for jitter; after 250 ms, neutral simulation
settles movement. Public state carries only roster and avatar transforms/posture.
Queue overflow finalizes/discards old queued inputs and restores the client from
the next authoritative correction, preserving the fixed server movement budget
instead of disconnecting a valid client after a server catch-up stall.
Remote avatars use bounded 100 ms interpolation, shortest-angle yaw blending,
no extrapolation after stalls, shared box geometry/material and one instance draw.
React roster updates occur only when membership/readiness/phase changes; game
telemetry remains 4 Hz. Colyseus SDK loads only when connecting to a room.

Production build now includes the static client and a bundled Node server entry.
The server externalizes runtime packages; shared TypeScript is bundled. Setup,
endpoint configuration and local production commands are in README. Browser
acceptance starts both production services. No hosting was configured.

Limits: player capsules collide only with the static map; weapons and dummy hits
remain local practice. No network damage/ammo/health claims are accepted. Combat
authority, respawns and kill feed belong to milestone 6. This uses one process
with transient codes, no reconnection grace or distributed persistence. LAN/TLS
hosting and physical-device/eight-human performance testing remain later work.

Verified on Windows/Node 24.21.0: **93 unit/integration tests across 15 files**,
strict TypeScript, zero-warning lint, formatting and both production builds pass.
All **eight Chrome acceptance checks pass together** (1.7 minutes, exit code 0),
including private create/join/readiness/start, a third SDK observer confirming
movement, remote avatar pool count, advancing acknowledgements while mouse capture
is released, leave/host transfer, and the seven earlier gameplay/pixel checks.
The room integration test independently connects eight actual SDK clients and
rejects a ninth. These are software-WebGL/SDK checks, not an eight-human or physical
target-device performance benchmark. Development server startup and `/health`
were also smoke-tested.

Browser verification exposed queue overflow when valid input got ahead of a server
that dropped catch-up time. Overflow now finalizes old input without simulation,
retains the newest batch and corrects the client. A regression verifies that this
does not move the capsule or grant extra simulation steps. Replay tests cover
slide, dive, jump, wall contact/jump budget and client-only practice sensors.

New runtime versions: Colyseus core 0.18.28, WebSocket transport 0.18.5, schema
5.0.48, SDK 0.18.10; development runtime tsx 4.23.15. Exact transitive versions are
locked. Installation audited 293 packages with zero reported vulnerabilities.
The embedded Rapier chunk still produces its expected large-chunk warning.
Room dialog and in-session screenshots were visually inspected at 1280×720.
The focused Chrome check also passes with the camera turned toward two remote
avatars, confirming their silhouettes render in the pixel target.

## Milestone 4 — local combat

Implemented:

- Shared typed rifle/SMG/shotgun configuration, with separate magazines/reserves,
  fire intervals, equip timing, reloads, pellet counts, damage/range and accuracy.
- LMB fire, RMB ADS, R reload, 1–3 switching and retained short trigger taps.
- Render-frequency ADS with reversible camera FOV/sight alignment and proportional
  sensitivity; raw mouse look remains immediate.
- Separate recovering camera recoil and seeded accuracy-cone spread. Speed,
  rising/falling and sustained-fire bloom affect accuracy; ADS reduces it.
- First-person low-poly viewmodels, pixel texture, reload/kick motion and muzzle
  flashes in the existing low-resolution target after a depth clear.
- Rapier hitscan with player exclusion, range limits, world-cover occlusion and
  holographic dummy head/body sensors. Damage/health are local practice only.
- Dummy hit flash, health/damage/headshot readouts, native hit marker and a two-second reset.
- Native ammo/status HUD and dynamic crosshair. Combat events notify React;
  rendering and simulation remain outside React state updates.
- Fixed-capacity pooled impacts, prebuilt weapon models and no dynamic shot lights.
- Pause-safe reload/cooldown timers; focus/capture changes clear fire/aim actions.
- No new dependencies and no multiplayer or authoritative player combat.

Verified: 71 unit/integration tests pass across 10 files. Strict TypeScript, lint,
formatting and production build pass. All seven Chrome checks pass (53.0 seconds,
exit code 0), including combat, movement/foundation and GPU pixel/color regressions.
The initial HUD accuracy value now comes from rifle tuning instead of zero.

New tests verify ADS at 30/60/144 render FPS, cadence, short taps/semi-auto firing,
finite magazines/reserves, atomic reloads, reload cancellation, per-weapon ammo,
switch/cooldown protection, recoil bounds, bloom recovery, spread distribution and
movement/air/ADS penalties. Real Rapier tests cover target regions, self exclusion,
range, cover occlusion, head multipliers, dummy reset and movement through sensors.

New files:

- Shared: `types/weapons.ts`, `config/weapons.ts`, `combat/spread.ts` and its test
  under `apps/shared/src/`.
- Weapon rules/presentation: `Recoil.ts`, `WeaponController.ts`, its test and
  `WeaponViewmodel.ts` under `apps/client/src/game/weapons/`.
- Local resolver: `PracticeCombat.ts`, its test and `TrainingDummy.ts` under
  `apps/client/src/game/combat/`.
- Effects/UI: `game/effects/PooledImpacts.ts`, `components/CombatHud.tsx` under
  `apps/client/src/`, and `tests/browser/combat.spec.ts`.

Modified: shared exports, input, camera, game composition, renderer, React app/CSS,
README and this log. Physics now offers local bullet queries and target sensors;
movement queries explicitly exclude sensors. Movement rules/tuning, map layout,
package manifests, lockfile and original prompt are preserved.

Known prototype limits: local practice damage only; static torso/head hitboxes;
box-based viewmodels and procedural first-person motion; magazine-style shotgun
reload; no audio or full body/viewmodel rig. Server validation and real player
health/damage remain milestone 6. Human tuning and target-device profiling are
still required.

ADS and shotgun hip-fire captures were visually inspected at 1280×720. The rifle
capture shows local damage and ammo feedback with an aligned sight picture.
Idle rifle rendering reports 10 draws / 1,729 triangles; shotgun reports 10 draws /
1,741 triangles in the captured view. Live impacts and flash add at most one draw
each. All game/weapon rendering retains nearest-neighbor low-resolution sampling.
The controlled-clock screenshots are functional tests, not target-hardware FPS
benchmarks. No 60 FPS claim is made.

## Milestone 3 — pixel graphics

Implemented:

- Low-resolution `WebGLRenderTarget` for the 3D world, with nearest min/mag filters,
  no mipmaps/MSAA/stencil, and a depth buffer only for the world pass.
- One fullscreen triangle for native-size presentation; the HUD/crosshair stay in HTML.
- Performance 426×240, Balanced 640×360 and Quality 854×480 at 16:9.
- Aspect-aware pixel budgets, small-window clamping and a pixel-ratio cap of 1.
- Persistent preset/adaptive controls available while training is paused.
- Adaptive resolution with warm-up, slow/stable frame windows, selected-preset
  ceiling and a 10-second change cooldown; target storage changes only when needed.
- A deterministic 32 KiB industrial texture atlas, instanced per-object tile/tint
  selection, tile-center sampling, charcoal fog and existing orange/blue accents.
- Linear world rendering and one sRGB presentation conversion.
- Aggregated draw/triangle metrics for both passes and current world-resolution readout.
- Disposal of render target, presentation geometry/material and atlas resources.
- No new dependencies, combat, networking or changes to movement/physics rules.

Verified: 48 unit/integration tests pass across seven files. Strict TypeScript,
lint, formatting and production build pass. All five Chrome browser checks pass
(45.8 seconds, exit code 0), covering foundation/movement regression, all presets,
persistence, aspect-aware resize, exact pixel blocks and display color output.

The GPU test reads the real framebuffer and found zero neighboring-color
mismatches across 192,000 sampled 2×2 blocks at Balanced/1280×720. It also checks
nonblank output, nearest CSS scaling, MSAA disabled and exactly one draw beyond
the world pass. The sky color survives the linear target and one sRGB display
conversion within 8-bit quantization tolerance. Pixel budget/settings and adaptive hysteresis have dedicated
tests, including manual mode, recovery ceilings, suspension and isolated stalls.
Entry screenshots were visually inspected. The captured scene reports eight
total draws and 1,489 triangles. Software Chrome results do not establish target
ThinkPad performance; 60 FPS is still unverified.

New files:

- `apps/client/src/game/rendering/graphicsConfig.ts`: presets, persistence,
  resolution calculation and adaptive tuning.
- `apps/client/src/game/rendering/AdaptiveResolution.ts`: allocation-free sampling
  and discrete quality changes independent of rendering/React.
- `apps/client/src/game/rendering/PixelAtlas.ts`: generated industrial pixels and
  instanced atlas material for the existing WebGL renderer.
- `apps/client/src/components/GraphicsControls.tsx`: focused graphics controls.
- `graphicsConfig.test.ts`, `AdaptiveResolution.test.ts` beside those modules,
  and `tests/browser/graphics.spec.ts`.

Modified: `GameRenderer.ts`, game composition/telemetry, `TrainingArena.ts`, React
app/styles/HUD and README/development documentation. The prompt, package manifests,
lockfile, input, movement and physics remain unchanged in this milestone.

## Milestone 2 — movement system

Implemented:

- Typed movement states with a single shared velocity owner and configurable tuning.
- Shift+W sprint, accelerating to 8 m/s; gradual overspeed decay on returning to walk.
- C slide, backward S+C slide, C cancel and Space jump cancel with momentum retention.
- Held-Space bunny hopping, buffered presses, coyote time, limited air steering and a 12 m/s cap.
- X dolphin dive with low-profile airborne motion, landing and mandatory recovery.
- Wall-normal jump impulses, tangent momentum, cooldown, same-wall lockout and two jumps per airtime.
- Foot-anchored capsule resizing, shape-query headroom checks and ceiling-normal collision handling.
- Camera height interpolation tied to actual capsule height; blocked recovery stays low.
- Pause freezes momentum, posture and state timers; queued input clears on focus/capture changes.
- State/speed/posture diagnostics, control hints, a low tunnel and paired training walls.
- No new dependencies; no weapons, networking or milestone 3 rendering work.

Current validation: 33 tests pass across five files; strict TypeScript, lint,
formatting and production build pass. All three Chrome browser checks pass,
including the foundation regression and advanced movement input checks.

Movement tests use real Rapier simulation. They verify sprint transitions,
slide/jump-cancel retention, cooldowns, backward movement, repeated-hop caps,
jump buffering/coyote time, dive landing/recovery, capsule feet and headroom,
recovery beneath/after an overhang, ceiling collision, wall-normal/tangent impulses,
same-wall rejection, airtime limits and paused momentum.

Additional regressions check slide taps at 25 simulation phases in the actual
Depot, sustained 8 m/s movement on its floor, buffered actions, W-to-S grace and
rejection of idle/airborne slide or dive boosts. Jump/slide/dive taps have 120 ms
buffers; backslide has a 120 ms sprint-transition grace window.

New files: the eight mechanic modules listed in the README plus
`apps/client/src/game/movement/MovementController.test.ts` and
`tests/browser/movement.spec.ts`. Modified: shared types/config/math/exports,
movement controller, Rapier adapter, input, game composition, first-person camera,
HUD, training layout, entry overlay/styles, the explicit-stop test name, README
and this log. The original prompt, package manifests and lockfile are unchanged.

The performance monitor also guards partially available memory APIs rather than
displaying NaN; the HUD reads the wall-jump allowance from shared tuning.

Physics verification caught a one-tick parent/world-transform mismatch during
capsule resizing. Resizing now publishes the corresponding world transform before
the next character-controller query. Headroom probes ignore valid floor contact,
and only downward ceiling normals cancel upward velocity. These cases have
regression coverage.

Browser control tests also exposed Rapier 0.21 dropping entire horizontal steps
on flat-ground rounding. Contact-nudge tuning did not reliably solve it. The
adapter now disables Rapier's non-slip-slope branch with a negative minimum
slide-angle threshold, while the shared velocity model controls ground traction.
This follows the branch behavior described in
[upstream Rapier #1058](https://github.com/dimforge/rapier/pull/1058), without
forking the dependency or changing the locked package version. Sustained sprint
and multi-phase slide tests verify the result. Revisit when adding ramp maps or
updating Rapier.

Advanced browser checks use Playwright's controlled clock so all animation frames
run while short actions remain inspectable between real keyboard events. The
foundation regression uses normal browser time. No synthetic-clock FPS reading
is treated as measured hardware performance.

Entry and dive camera captures were visually inspected at 1280×720. The expanded
training layout still uses seven draw calls (1,488 triangles in the captured
view). Chromium tests run through installed Chrome with explicit process
permission for reliable Windows shutdown. Expected Vite warnings concern the
unchanged embedded Rapier WebAssembly chunk. A Windows npm lifecycle message may
appear when Playwright terminates its owned preview process; the verified suite
exits successfully with zero failed tests.

## Milestone 1 — FPS foundation

Implemented:

- npm client/shared workspaces and a reserved server directory.
- React, Vite and strict TypeScript project configuration.
- Three.js-owned rendering loop, resize handling and resource cleanup.
- Fixed 60 Hz Rapier physics, bounded catch-up and render interpolation.
- Pointer lock, clamped pitch, yaw-relative WASD, acceleration and friction.
- Capsule collision with the floor, cover and perimeter walls.
- Compact industrial training arena with fog and instanced geometry.
- Minimal entry/pause overlay, native HUD/crosshair and measured telemetry.
- Movement, simulation-clock and Rapier integration tests.
- Production browser acceptance test and setup documentation.

## Milestone 1 validation (historical)

Verified on Windows with Node 24.21.0, npm 11.19.0 and TypeScript 6.0.3:

| Check                         | Result                                                    |
| ----------------------------- | --------------------------------------------------------- |
| `npm run typecheck`           | Passed for shared, client and test/tool configs           |
| `npm test`                    | 14 tests passed across 4 files                            |
| `npm run lint`                | Passed with zero lint warnings                            |
| `npm run format:check`        | Passed                                                    |
| `npm run build`               | Passed; expected large Rapier compatibility chunk warning |
| Production browser acceptance | Passed in local Chrome; 1 test, 27.2 seconds, exit code 0 |
| `npm audit --omit=dev --json` | Zero runtime vulnerabilities                              |

Tests cover normalized diagonal movement, camera-relative direction, acceleration,
friction, speed caps, vertical velocity ownership, frame-rate independent simulation,
bounded catch-up, telemetry including long stalls, floor grounding, a measured
5 m/s open-ground speed, cover/boundary collision, collision sliding, tunneling
prevention and pause velocity reset. Browser interactions cover mouse capture,
WASD movement, collision, Escape, pause/resume and drawing-buffer resize at
1280×720 and 960×640, with no uncaught errors or console errors.

Entry and gameplay screenshots were visually inspected. The captured arena uses
7 draw calls and 1,428 triangles. Browser verification uses software WebGL and is
not a target-hardware FPS benchmark. No 60 FPS performance claim is made.

The first browser pass exposed that injected Escape did not trigger Chrome's
native pointer-lock exit; the input system now explicitly exits lock on Escape.
The browser download was stopped after stalling; tests use installed Chrome via
`PLAYWRIGHT_CHANNEL=chrome`. A sandboxed test passed its interactions but stalled
on Chrome shutdown. The final run with process permission completed normally,
including browser and preview-server cleanup.

## Known limitations

- Target ThinkPad X1 Carbon hardware has not been profiled; 60 FPS is unverified.
- Non-integer display scales create unequal block widths while retaining nearest sampling.
- Nearest-only textures can shimmer at distance; there is no smoothing/temporal filter.
- Adaptive resolution reacts to total frame duration and cannot solve CPU/scheduling bottlenecks.
- Desktop keyboard/mouse only. WebGL 2 and pointer lock are required.
- Physics capsules and simple boxes only; no step climbing or ramp course yet.
- Movement values are prototypes requiring human playtesting and balance tuning.
- Recovery uses capsule/camera height and cosmetic weapon poses; no skeletal body rig.
- The Rapier flat-floor compatibility setting permits slope slipping. Ramp/slope
  tuning needs verification before those map features are introduced.
- 1% low readings need a sufficiently populated rolling sample to be useful.
- CPU metric measures main-thread submission work, not GPU frame time.
- JS heap reporting is available only in supporting browsers.
- The embedded Rapier compatibility WebAssembly chunk is ~1.67 MB gzip. Initial
  engine loading is asynchronous; Vite's large-chunk warning is expected.
- Audio has no acoustic occlusion and needs human listening/mix tuning.
- Production hosting, TLS and physical-device profiling remain milestone 9.

## Milestone 1 file inventory (historical)

The first milestone created the files below without modifying the pre-existing
`prompt.md`. `node_modules/`, production output, screenshots and test reports are
generated and ignored.

- Root: `.gitignore`, `.prettierignore`, `.prettierrc.json`, `package.json`,
  `package-lock.json`, `tsconfig.base.json`, `tsconfig.tools.json`,
  `eslint.config.js`, `vitest.config.ts`, `playwright.config.ts`, `README.md`,
  `DEVELOPMENT.md`.
- Client setup: `apps/client/package.json`, `tsconfig.json`, `vite.config.ts`,
  `index.html`, `public/favicon.svg`, `src/main.tsx`.
- React: `apps/client/src/app/App.tsx`, `app/styles.css`,
  `components/Telemetry.tsx`.
- Core: `apps/client/src/game/core/Game.ts`, `FixedStepClock.ts`,
  `FixedStepClock.test.ts`, `PerformanceMonitor.ts`, `PerformanceMonitor.test.ts`.
- Systems under `apps/client/src/game/`: `input/InputController.ts`, `camera/FirstPersonCamera.ts`,
  `movement/MovementController.ts`, `physics/PhysicsWorld.ts`,
  `physics/PhysicsWorld.test.ts`, `rendering/GameRenderer.ts`,
  `maps/TrainingArena.ts`, `maps/arenaLayout.ts`.
- Shared: `apps/shared/package.json`, `tsconfig.json`, `src/index.ts`,
  `src/config/movement.ts`, `src/types/movement.ts`, `src/physics/walking.ts`,
  `src/physics/walking.test.ts`.
- Server reservation: `apps/server/README.md`.
- Browser acceptance: `tests/browser/foundation.spec.ts`.

Runtime dependencies: React/React DOM 19.3.1, Three.js 0.187.0, Rapier compatibility
0.21.0 and the shared workspace. Development tools: Vite 8.3.8, React plugin 6.3.0,
TypeScript 6.0.3, Vitest 5.1.0, ESLint 10.15.0, TypeScript ESLint 8.72.2,
React hooks lint rules, Prettier 3.10.1, Playwright 1.65.1, globals and TypeScript
definitions. Exact versions and transitive dependencies are in `package-lock.json`.

## Remaining release work

Connect the hosting accounts, provision Vercel and the persistent Colyseus service,
configure their actual HTTPS/WSS origins, and run the live socket/incognito invite
checks before sharing a production URL. Verify eight human players across real
network connections, listen/tune the audio mix, and profile the physical target
hardware before making a 60 FPS claim.

## Release gate

Milestone 9 is not fully released until public hosting, real eight-player access
and target-device profiling are verified. Prepared configuration alone is not a
live website.
