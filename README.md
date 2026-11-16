# BREAKPOINT

A desktop browser FPS built milestone by milestone. **Milestones 1–8** provide
a momentum-based, pixel-rendered FPS arena, local weapon training and eight-player
private rooms with server-authoritative FFA and TDM matches, a retro tactical
interface, persistent settings and procedural audio. The original project brief
is preserved in [prompt.md](prompt.md).

**Milestone 9 deployment preparation is implemented:** Vercel frontend settings,
a Render multiplayer Blueprint, HTTPS endpoint/origin checks, direct room invites,
GitHub CI, an eight-client smoke test and a browser profiling tool. Cloud publishing
and real eight-human/target-device checks require the hosting accounts and live URLs.
See [DEPLOYMENT.md](DEPLOYMENT.md) for the exact launch steps and friends playtest.

## Run locally

Use Node.js **24 LTS** for deployment (`.node-version` pins 24.21.0) and npm.
Local development also supports Node 22.13+. Development was initialized with Node
24.21.0 and npm 11.19.0. From the repository root:

```sh
npm ci
npm run dev
```

Open the Local URL printed by Vite (normally `http://127.0.0.1:5173`). On Windows,
if PowerShell blocks `npm.ps1`, run `npm.cmd` in place of `npm` in every command.
Do not change your machine's execution policy just to run this project.

Click **Enter training** to capture the mouse. Use **WASD** to walk, the **mouse**
to look, and **Esc** to pause/release the mouse. Click **Resume training** to
continue. Losing focus or hiding the tab clears held keys and pauses offline movement.
Offline training pauses on mouse release. Private rooms stay live; releasing the
mouse clears held inputs. Online rooms use server-owned health, ammunition and damage.

## Tactical interface and settings (milestone 8)

The command menu offers **Play**, **Create room**, **Join room**, **Settings** and
**Credits**. Play opens a choice of solo training or private multiplayer. Esc
releases the mouse and returns to command; native dialogs support keyboard focus,
Esc and focus restoration. Smaller layouts keep settings in scrollable panels.

Settings apply immediately and save in this browser when storage is available:

- **Controls:** mouse sensitivity (0.25–3×), hip FOV (65–110°), invert Y and all
  keyboard actions. Click a binding and press a key; conflicting bindings swap.
  Esc cancels rebinding. Mouse buttons and Esc remain fixed. ADS retains each
  weapon's aimed FOV and scales sensitivity to the visible FOV.
- **Display:** resolution preset, adaptive resolution, reduced motion and detailed
  diagnostics. FPS remains visible by default; enable diagnostics for movement,
  networking and rendering details. The HUD stays at native resolution.
- **Audio:** mute, master, combat/movement, interface and ambient levels, plus a
  test tone. The header also offers a mute toggle.
- **Crosshair:** live preview, color, length, thickness, gap, center dot and a
  dynamic spread indicator. Disabling dynamic spread holds the selected gap.

**Restore defaults** resets preferences and graphics. Bindings update the menu
and HUD hints. Preferences use `breakpoint.settings.v1`; graphics retain their
separate `breakpoint.graphics.v2` key (existing v1 preferences migrate). Callsigns
are remembered locally. Blocked
storage does not prevent play. Each browser/device has independent preferences.

Room creation/joining use separate tabs. The lobby shows the code, a **Copy code**
action (with manual-selection fallback), player count, roster, readiness, host
rules, team choices and start controls. A pending connection can be cancelled by
closing its dialog. **Copy invite** shares a website link that opens Join with
the room code filled; friends still enter a callsign and choose Join. A sleeping
host is checked for readiness before matchmaking. Server-confirmed health, ammo, hits, kill feed, timer,
scoreboard and final standings retain the existing match authority.

Audio is generated with Web Audio after a user gesture; no sound downloads or new
dependencies are required. Rifle/SMG/shotgun reports, equipment, movement, confirmed
hit/damage/death/respawn cues and subtle ambient tones use one context, a reusable
noise buffer and at most 16 transient voices plus two ambient oscillators. Remote
gunshots use distance attenuation and stereo panning; walls do not occlude audio.
Hidden tabs stop effects and suspend audio. Unavailable audio leaves play usable.

Menus use brief opacity/position transitions. First-person weapons blend sprint,
slide and dive poses alongside equip/reload/recoil animation. Reduced motion
follows the OS on fresh settings, disables menu transitions and reduces cosmetic
weapon movement while preserving gameplay recoil. Remote avatars keep the exact
shared hitbox geometry; skeletal character animation is not implemented.

## Private rooms (milestone 5)

Run the room server in a second terminal alongside `npm run dev`:

```sh
npm run dev:server
```

In the browser, choose **Private rooms**, enter a callsign and **Create private
room**. Share the six-character room code. Friends choose **Join room** from the
menu or the room dialog's **Join room** tab, enter their callsign and code, mark
themselves **Ready**, and the host chooses **Start session**. Close the lobby and
click **Enter room** to capture the mouse. Up to **eight** players can join,
including after the session starts. A ninth join is rejected. Rooms are hidden
from public matchmaking, and the last player leaving disposes the room. The host
role passes to the next player when the host leaves. A dropped connection leaves
the session; join again using the code if others are still there.

Local development defaults to the page's hostname on port **2567**. For another endpoint,
copy `apps/client/.env.example` to `apps/client/.env.local`, set `VITE_SERVER_URL`,
then restart Vite/rebuild. The server accepts `PORT` (default 2567) and `HOST`
(development default `127.0.0.1`, production default `0.0.0.0`). Production also
requires exact HTTPS `ALLOWED_ORIGINS`. Use `HOST=0.0.0.0` to accept connections from other machines;
the frontend also needs a reachable host and secure origin for pointer lock.
An HTTPS frontend needs an HTTPS/WSS server endpoint. Milestone 9 adds the Vercel
and Render configuration; follow [DEPLOYMENT.md](DEPLOYMENT.md) to provision and
verify the real services. Public builds refuse missing or local server endpoints.

For the production bundles locally:

```sh
npm run build
npm run start:server   # Node server; keep this terminal running
# In another terminal:
npm run preview
```

Movement runs at a **60 Hz** server target with **20 Hz** delta state patches.
Clients predict their own movement, batch sequenced inputs at 30 Hz, and restore
server snapshots before replaying unacknowledged inputs. Small visual corrections
decay smoothly; large corrections snap. Other players render about 100 ms behind
the server with bounded interpolation and one shared instance batch. A stalled
stream stops extrapolation. The diagnostic HUD shows peers and acknowledged input
sequence numbers.

The server uses the same Rapier adapter, arena collision layout and complete
movement state machine as the client. It accepts inputs rather than reported
positions, validates packets, limits queued inputs, and consumes at most one input
per player per tick. If an overloaded server's input queue fills, it discards old
queued inputs and corrects the client without granting extra movement ticks.
Missing inputs have a short jitter grace; after 250 ms,
neutral input settles gravity/friction rather than holding the last direction.
Player bodies do not collide with one another in this milestone. Room codes are
allocated in one server process; distributed matchmaking/persistence is not yet
configured. Codes disappear when the room closes or the process restarts.

## FFA and TDM matches (milestone 7)

| Mode            | Default win target       | Time limit | Teams                           |
| --------------- | ------------------------ | ---------- | ------------------------------- |
| Free-for-All    | First player to 20 kills | 5 minutes  | Everyone competes independently |
| Team Deathmatch | First team to 40 kills   | 7 minutes  | Blue vs Orange, up to four each |

Choose a mode when creating a private room. The host can change **Host rules** in
the lobby and choose **Apply rules**. Kill limits accept 1–100; time limits accept
30–1800 seconds. Defaults live in `apps/shared/src/config/match.ts`. Changing rules
or teams clears other players' readiness, so everyone confirms the new setup.

TDM assigns new players to the smaller team, with a maximum of four per side.
**Join Blue / Join Orange** allows lobby team selection when a seat is available.
Starting requires both teams to have players, balanced within one player, and
everyone ready. Smaller balanced private matches are supported; a full room is
four versus four. Teams stay fixed during play. Late joins fill the smaller side.
Blue and Orange spawn at opposite ends of the Depot and use matching avatar
colors. Friendly fire is disabled; teammates block bullets without taking damage.

The HUD displays the server's remaining time and personal/team score. Hold **Tab**
while playing for kills/deaths and team standings, or use **Scoreboard** with the
mouse released. Every score comes from a validated server elimination. Departed
players remain in that round's standings, so leaving cannot erase their kills or
deaths. Their team contribution remains in TDM's score.

At the score limit or deadline, gameplay freezes, mouse capture releases, and
everyone sees the final standings and winner. At timeout, FFA's highest kill count
or TDM's higher team score wins. Equal leaders/scores produce a draw; a zero-kill
FFA round is also a draw. Equal score-limit finishes in the same server tick draw.
The match timer uses monotonic server time and continues during mouse release,
tab hiding or simulation catch-up. Teams with departures are not automatically
rebalanced or forfeited; available seats can be filled while the timer runs.

Only the host can choose **Return to lobby**. This clears scores, restores health
and inventory, resets readiness and permits a new round or a different mode. The
room code remains unchanged. Results remain frozen until then, even if players
leave or join. Host migration continues to work during play and on the results
screen. Rooms retain at most 64 participants' score rows per round, including
departures, while the connected-player limit remains eight.

## Server-authoritative combat (milestone 6)

Online players start with **100 health** and the rifle, SMG and shotgun. The same
controls below work in training and rooms. Online hit markers and damage numbers
appear only after server confirmation. Health, magazines/reserves, reload status
and kills come from the server. Releasing the mouse leaves the room live: reloads,
damage and respawn timers continue. The local practice dummy is hidden online.

Clients send sequenced movement, finite look angles and weapon buttons. They never
choose authoritative shot origins, random seeds, targets, hit regions, damage or
ammunition. The server checks the loadout, equip/reload state, fire interval and
ammo before accepting a shot. Weapon timers advance once per server tick, even
if inputs arrive in a burst. Fresh look and weapon controls are consumed separately
from the movement backlog, so a fire release does not wait behind old movement.
Missing weapon input expires after 100 ms instead of holding fire indefinitely.

The server creates each ray at the current authoritative eye position, applies
server recoil and secret-seeded accuracy spread, and tests range, map obstruction
and the nearest living player's body/head parts. These parts share their geometry,
yaw, head pitch and posture scale with remote rendering. Shotgun pellets resolve
individually, while a shot spends one shell. Player bodies stop rays; protected
players block them without taking damage. Confirmed traces and impacts use fixed
instance pools, with no extra dynamic lights. Local muzzle/recoil/ADS presentation
remains predicted, while damage and ammo readouts are authoritative.

At zero health, the server emits one kill-feed event and disables movement and
firing. After **three seconds**, it chooses a spawn farthest from living players
among the eight spawn slots and restores health and the loadout. Respawn grants
**one second of damage protection**, shown by brighter avatars and a HUD label. A new
life number invalidates old queued controls; movement prediction snaps to the
new spawn instead of interpolating across the map. Press movement/fire controls
again after respawning. Dead remote bodies disappear. The kill feed keeps up to
five recent server-confirmed eliminations.

Hit validation uses **current server poses**; it does not rewind targets to the
shooter's rendered view. Remote interpolation/network latency can therefore affect
shots at moving targets. Lag compensation is a later improvement. Combat remains
server-owned in both match modes; only enemies take damage in TDM.

## Combat controls and tuning

| Input            | Action                                                             |
| ---------------- | ------------------------------------------------------------------ |
| Left mouse       | Fire; rifle/SMG repeat while held, shotgun requires each new press |
| Hold right mouse | Aim down sights; release to return to hip fire                     |
| R                | Reload; ammo transfers only when the reload finishes               |
| 1 / 2 / 3        | Rifle / SMG / shotgun; each keeps its own magazine and reserve     |
| Hold Tab online  | Show the live scoreboard                                           |

In offline training, aim at the blue **HOLO-01** in the central lane. Its body and head have separate
hitboxes. Hits flash the target and show a native-resolution marker, damage
readout and target health. At zero health it disappears and resets after two
seconds. It is a holographic sensor, so the movement course can pass through it.
Cover blocks shots before the target. This dummy remains local practice and is
disabled in online rooms.

| Weapon        | Magazine / reserve | Fire                                 | Reload | ADS to 90% |
| ------------- | ------------------ | ------------------------------------ | ------ | ---------- |
| AR-01 rifle   | 30 / 120           | Automatic, 600 RPM                   | 2.0 s  | 140 ms     |
| SM-02 SMG     | 35 / 140           | Automatic, 900 RPM                   | 1.6 s  | 100 ms     |
| SG-03 shotgun | 8 / 40             | Semi-auto, 0.8 s interval, 8 pellets | 2.4 s  | 180 ms     |

ADS changes camera FOV, sight alignment and sensitivity without smoothing mouse
look. Its reversible exponential blend updates at render frequency. Hip FOV is
85°; ADS uses 62°/67°/60° for rifle/SMG/shotgun. A short trigger tap is retained
until a simulation tick; empty weapons require R. Switching takes 180 ms and
cancels reload without spending reserve ammo. Offline pause freezes reload/cooldown
timers and clears held/queued firing, so resume never causes a stale shot.

Recoil and spread are separate systems. Camera recoil changes actual subsequent
aim, has bounded pitch/yaw impulses and recovers over time; mouse movement can
counter it. Spread samples an independent accuracy cone. ADS reduces the cone;
movement, jumping, falling and sustained-fire bloom enlarge it. Bloom has its
own cap, delay and weapon-specific recovery. The dynamic crosshair reflects the
cone. Weapon tuning (angles in degrees) lives in `apps/shared/src/config/weapons.ts`;
spread sampling is browser-independent in `apps/shared/src/combat/spread.ts`.

The weapon rules do not depend on Three.js or Rapier. `PracticeCombat` supplies
local raycasts, hitbox/damage resolution and feedback. The initial viewmodels use
pooled low-poly parts and a 4 KiB nearest-filtered pixel texture, with procedural
ADS/reload/kick motion. A depth clear draws the viewmodel over the world in the
same low-resolution target before presentation, preserving sharp pixels without
clipping the gun through nearby walls. Impacts use a fixed 32-slot instance pool;
muzzle flashes add no lights. Combat HUD snapshots update on events plus telemetry,
and crosshair presentation uses DOM properties rather than a React game loop.

Prototype limits: magazine-style reloads for all three weapons (no per-shell
shotgun loading), primitive viewmodels without a skeletal body rig, and static head/body
practice hitboxes. Online avatars use the shared rendered body-part boxes rather
than a skeletal animation rig. Weapon values are prototype balance settings.

## Pixel graphics

Press **Esc** to access the graphics controls beside the training overlay.
Settings persist locally when browser storage is available.

| Preset             | World resolution at 16:9 | World pixels versus 1280×720 |
| ------------------ | ------------------------ | ---------------------------- |
| Performance        | 640×360                  | 25%                          |
| Balanced (default) | 960×540                  | 56.25%                       |
| Quality            | 1280×720                 | 100%                         |
| Ultra (1080p)      | 1920×1080                | 225%                         |

The world renders into a `WebGLRenderTarget` without mipmaps or stencil. With AA
Off (the default), it uses no multisampling or additional filtering passes. One
fullscreen triangle presents the result with nearest-neighbor sampling to a
native-size canvas. Optional AA operates at the actual world resolution, before
this upscale. There is no bloom, temporal history or full-screen blur. CSS
`image-rendering: pixelated` also prevents compositor smoothing. The output pixel ratio is capped
at 1 to avoid extra high-DPI world-rendering cost; the HTML HUD, controls and
crosshair retain the browser's native text/display resolution.

Performance gives exact 2×2 output blocks at 1280×720. Balanced uses smaller,
sharply sampled pixels, and Quality renders at the full 1280×720 target.
**Ultra (1080p)** adds a 1920×1080 budget for stronger devices, with 2.25 times the
world pixels of Quality. Balanced remains the default. World targets never exceed
the browser viewport, so Ultra reaches 1920×1080 in a viewport at least that large.
Other scale factors use sharp nearest-neighbor sampling with occasionally unequal
block widths; they do not blend neighboring world pixels. Other display aspect ratios keep a comparable
preset pixel budget while the camera uses the actual viewport aspect. Small
windows never require a world target larger than their output.

**Adaptive resolution** is enabled by default. The selected preset is its ceiling.
After a 2-second warm-up, two consecutive slow 1-second windows (>20 ms average
frame duration) allow a step down. Recovery needs eight stable windows (<17.5 ms),
with at least 10 seconds between changes. Resizing, visibility and mouse capture
changes reset sampling; a single stall does not immediately change resolution.
Disable adaptive resolution to hold your chosen preset exactly.

**Settings → Display** also provides real rendering controls:

- **Texture detail:** Low uses 16 px atlas tiles; High uses 32 px tiles. Weapon
  textures switch too. Both retain nearest magnification and nearest mip selection.
- **Anti-aliasing:** choose one of OFF, FXAA, SMAA, MSAA 2X or MSAA 4X.
  OFF retains the sharpest pixels and lowest cost. FXAA is a single lightweight
  edge pass with reduced subpixel blending, but can soften fine detail. SMAA
  uses three edge/weight/blend passes and loads only when selected. MSAA smooths
  geometric coverage using actual multisampled world-target attachments, without
  filtering texture detail. Higher MSAA uses more GPU memory/bandwidth. Unsupported
  choices are disabled; saved unsupported selections use OFF with a visible notice.
  Resolution presets retain your AA choice; adaptive resolution can lower its
  pixel budget. None of these modes filters the native HTML HUD or crosshair.
- **Shadow quality:** Off by default; Low/High use one cached 512/1024 directional
  shadow map for static architecture. Moving avatars do not regenerate shadows.
- **View distance:** 40/60/80 m sets the camera far plane and corresponding fog.
- **Pixel effect:** Crisp uses the full preset budget; Retro/Classic use 75%/50%
  dimensions for an explicit coarser look. HUD resolution is unaffected.

The new clarity defaults use `breakpoint.graphics.v2`; older v1 preset/adaptive
preferences migrate automatically. Adaptive scaling stops at the new Performance
budget instead of the previous 426×240. Lower pixel-effect scales are opt-in.

The Depot uses a generated 128×64 texture atlas containing eight 32px industrial
tiles: concrete, panels, corrugated steel, crate reinforcement and caution paint.
Both atlas qualities together occupy 40 KiB before mip levels and require no
asset requests. Continuous world-UV gradients select mip levels without false LOD
jumps at repeats; magnification and mip selection stay nearest. Brighter concrete,
separate container colors, panel divisions and batched edge trim improve reading.
Hemisphere fill and one directional light define surfaces without crushed blacks.
Optional shadows are static and cached. The world target itself has no mipmaps,
stays linear and converts to sRGB once on display.

Remote avatars keep the shared body/head geometry, brighter team/part colors and
subtle opaque rim shading in the same instance draw. Normal depth testing hides
them behind cover; there is no through-wall outline or extra silhouette pass.
Weapons add clearer magazines, cuffs, receiver trim and sight supports, plus
matte directional lighting. Their aiming, recoil, equip and reload logic is unchanged.

Graphics tuning lives in `apps/client/src/game/rendering/graphicsConfig.ts`.

## Movement controls

| Input                                             | Action                                                                      |
| ------------------------------------------------- | --------------------------------------------------------------------------- |
| Shift + W                                         | Sprint, accelerating toward 8 m/s                                           |
| Space                                             | Jump; hold to bunny hop on landing                                          |
| Space again while airborne near a wall            | Wall jump; two per airtime, no consecutive reuse of the same wall           |
| C while carrying sprint speed with Shift held     | Slide; entry speed 10 m/s, duration 0.65 s                                  |
| S + C while carrying sprint speed with Shift held | Backslide at 6 m/s without turning the camera                               |
| Space during a slide                              | Jump cancel, retaining horizontal momentum when there is standing clearance |
| C again during a slide                            | Cancel into a short recovery, then walk/sprint                              |
| X while sprinting                                 | Low-profile dolphin dive, followed by landing and recovery                  |

Low-profile actions require at least 6 m/s of grounded speed. Repeated keydown
events do not retrigger actions; release and press C/X again. Jump, slide and dive
presses are buffered for 120 ms. Backslide allows a 120 ms W-to-S grace window;
walking off a ledge allows an 80 ms coyote jump. Slides have a 350 ms
cooldown after exit; dives have an 800 ms cooldown after exit. Dive recovery
cannot be skipped by holding jump. Wall jumps have a 220 ms cooldown and require
a new Space press (or its short buffer); holding Space never climbs walls.

Practice low-clearance recovery in the **left-lane tunnel** and wall jumping
between the **right-lane walls**. Recovery remains low if an overhang blocks
standing; keep moving out, and the capsule and camera rise when space permits.
The HUD shows movement state, speed, grounding and wall-jump usage.

A desktop browser with WebGL 2 and Pointer Lock support is required. Serve through
localhost or HTTPS; do not open `index.html` directly from disk. On a remote host,
use a secure origin for mouse capture. Touch controls are not implemented.

## Commands

```sh
npm run typecheck       # strict TypeScript for shared, client, server and test tools
npm test               # rules, Rapier, prediction, authoritative combat and live room tests
npm run lint           # ESLint, TypeScript and React hooks rules
npm run format:check   # Prettier
npm run build          # typecheck, then production build
npm run build:client   # frontend-only hosting build, including typecheck
npm run build:server   # server-only hosting build, including typecheck
npm run check:deployment # real public-build guard checks; writes ignored fixtures
npm run preview        # serve apps/client/dist locally
```

Browser verification uses a production build and Playwright's Chromium:

```sh
npx playwright install chromium
npm run build
npm run test:browser
```

The browser suite starts/stops a preview server on port 4173 and the production
room server on port 2567. It exercises private-room create/join/start/leave,
movement synchronization, pointer lock, collision, pause/resume, canvas resize,
offline/online combat, health, kills, death/respawn, FFA/TDM scores/results/rematches,
team spawns, the server timer, Tab scoreboard, pixel rendering, menu/dialog focus,
cancelled connections, shared invite joins and persistent settings applied to gameplay, and rejects
uncaught browser errors. Screenshots are written to `test-results/`.
Software WebGL is used in this automated test for reproducibility; these results
are **not** a performance benchmark for the target ThinkPad.

Advanced browser checks pause Playwright's clock between real key events and use
`clock.runFor` to execute every animation frame over a known interval. This keeps
650 ms action states observable under remote browser latency. The foundation
regression still runs with normal browser time. Neither automated test is a GPU
benchmark.

Graphics checks switch all presets, reload persisted settings, test another
viewport aspect, and read the real WebGL framebuffer. They verify Ultra's actual
1920×1080 target and persistence, exact 2×2 pixel blocks at Performance/1280×720,
nonblank textured output, disabled canvas MSAA,
correct display color conversion and one presentation draw. GPU readback exists
only in the browser test, never in the game loop.

To use an existing local Chrome installation instead of downloading Chromium:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npm.cmd run test:browser
```

## Architecture

| Location                                          | Responsibility                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `apps/client/src/app/`                            | React lifecycle, training entry/pause overlay and CSS                                 |
| `apps/client/src/components/Telemetry.tsx`        | Native-resolution diagnostic HUD                                                      |
| `apps/client/src/components/CommandMenu.tsx`      | Main navigation and training/room entry                                               |
| `apps/client/src/components/SettingsPanel.tsx`    | Controls/display/audio/crosshair settings and live preview                            |
| `apps/client/src/components/TacticalDialog.tsx`   | Modal lifecycle, keyboard close and focus restoration                                 |
| `apps/client/src/game/settings/`                  | Validated browser preferences and unique keyboard bindings                            |
| `apps/client/src/game/audio/`                     | Gesture-unlocked, bounded procedural sound and spatial reports                        |
| `apps/client/src/game/core/Game.ts`               | Compose systems and release their resources                                           |
| `apps/client/src/game/core/FixedStepClock.ts`     | Bounded 60 Hz simulation accumulator                                                  |
| `apps/client/src/game/core/PerformanceMonitor.ts` | Rolling telemetry, reported at 4 Hz                                                   |
| `apps/client/src/game/input/`                     | Pointer lock, key state and mouse look                                                |
| `apps/client/src/game/camera/`                    | First-person camera and position interpolation                                        |
| `apps/client/src/game/movement/`                  | Compatibility exports of the shared movement rules                                    |
| `apps/client/src/game/physics/`                   | Compatibility exports of shared Rapier collision                                      |
| `apps/client/src/game/maps/`                      | Shared visible/collision layout and industrial arena                                  |
| `apps/client/src/game/rendering/`                 | Pixel target/presentation, atlas, presets, adaptive resolution and resource lifecycle |
| `apps/client/src/game/networking/`                | Colyseus transport, prediction/replay, remote interpolation and avatar pool           |
| `apps/client/src/game/combat/NetworkCombat.ts`    | Predicted presentation, server combat readouts, confirmed effects and kill feed       |
| `apps/shared/src/`                                | Movement FSM, Rapier adapter, collision map, protocol validation, combat types/tuning |
| `apps/shared/src/weapons/`                        | Shared weapon cadence, inventory, reload, recoil and accuracy rules                   |
| `apps/server/src/combat/`                         | Server hitscan, health, damage, weapon budgets, kills and respawn lifecycle           |
| `apps/server/`                                    | Node.js Colyseus rooms, schema state and authoritative movement/combat                |
| `tests/browser/`                                  | Production-build browser acceptance test                                              |

Three.js `setAnimationLoop` owns rendering. Simulation runs at a fixed 1/60 s;
render frames interpolate between the previous and current capsule positions.
Mouse look uses the newest input each render frame. Frame gaps are capped at
100 ms and six physics steps to prevent a catch-up spiral. Pause, tab hiding and
mouse capture changes reset timing, interpolation and queued actions. Movement
velocity, posture and action timers freeze in offline training and continue on resume.
Online rooms continue to simulate neutral inputs while the mouse is released.

Walking accelerates toward a normalized camera-relative target at 5 m/s, with
exponential friction when keys are released. Horizontal walking never overwrites
vertical velocity. The movement controller applies gravity and passes desired
displacement to Rapier's kinematic character controller. Collision-resolved
horizontal movement feeds back into velocity. There is no custom collision solver
to replace between movement states.

`MovementController` owns a typed state machine: walking, sprinting, sliding,
backsliding, airborne, diving and recovering. `Walking.ts`, `Sprinting.ts`,
`Sliding.ts`, `Backsliding.ts`, `SlideCancel.ts`, `BunnyHop.ts`, `DolphinDive.ts`
and `WallJump.ts` implement the individual mechanics. Input, rendering and React
remain independent of these rules. All prototype values live in
`apps/shared/src/config/movement.ts`.

Normal transitions carry the same velocity forward. Ground overspeed decays
gradually toward the selected movement speed; air motion has light drag and
limited directional acceleration. Jumps retain 98% of horizontal velocity before
air steering; all mechanics share a 12 m/s horizontal cap. A slide redirects
gently without adding speed through steering. Backslide is an intentional retreat
impulse that reverses the forward component while keeping bounded lateral motion.
Wall-jump impulses act along the wall normal, preserving tangent velocity.

The capsule shrinks/expands at a bounded rate around fixed feet. Camera height is
derived from that actual capsule height and interpolated at render frequency.
Standing uses a Rapier shape-clearance query excluding the player's own collider;
blocked recovery never expands through a ceiling. Upward movement disables ground
snapping; ceiling contact normals stop ascent without deleting horizontal speed.
First-person height changes follow the capsule; weapon stance, equip, reload and
recoil animation remain cosmetic. Remote avatars have no skeletal body rig.

Rapier 0.21 can discard horizontal motion when it misclassifies flat-floor
rounding as slope slipping ([upstream report](https://github.com/dimforge/rapier/pull/1058)).
The adapter disables that non-slip branch using a negative minimum slide-angle
threshold; ground traction remains in our velocity model and the maximum climb
angle still prevents climbing walls. Sustained sprint and input-phase regressions
cover the workaround. Recheck slope behavior before adding a ramp course, and
remove this compatibility setting once a stable upstream fix is verified.

The arena uses simple boxes for collision, shared geometry, instanced solid
architecture and edge/rib trim, hemisphere/directional light, fog and no dynamic
shadows. Scene geometry/materials, physics resources, event handlers, observers,
and the renderer are disposed on unmount, including React Strict Mode remounts.

## Performance and current limits

Enable **Settings → Display → Detailed performance diagnostics** to display
frame duration, 1% low FPS (the inverse of
the average duration of the slowest 1% of up to 600 sampled frames), main-thread
CPU submission time, draw calls, triangles, and JS heap size when the browser
exposes it. The window resets on pause/resume. CPU submission time does not
include asynchronous GPU execution. JS heap reporting is browser-dependent.

The base scene uses six map draws; the dummy adds one. While playing, the active
viewmodel adds one instanced draw, with at most one each for muzzle flash and
pooled impacts. Presentation remains one fullscreen draw. Optional FXAA adds one
world-resolution draw; SMAA adds three. MSAA uses target samples without a post
filtering draw. Renderer statistics
include world, viewmodel and presentation rather than reporting only the final
triangle. Target buffers resize only on
settings, viewport or adaptive-level changes. Physics remains fixed at 60 Hz and
React receives telemetry at 4 Hz. Nearest mip selection and restrained texture
detail reduce distance shimmer without smoothing magnified pixel art.
Adaptive resolution cannot fix CPU, scheduling or network bottlenecks. BP-01's
native Intel UHD 620 training measurements and their limits are recorded in
`DEVELOPMENT.md`; full eight-player performance still needs a live match check.

Rapier's compatibility package embeds WebAssembly, so its compressed startup
download is larger than the other initial dependencies. It is split into its own
build chunk (about 1.67 MB gzip in the verified build). Vite reports its expected
large-chunk warning. The React shell loads first, then imports the engine
asynchronously. The room SDK loads separately on first connection (about 55 KB
gzip). Audio uses browser synthesis without additional network assets.

TypeScript is held to the stable 6.0 series because the selected
`typescript-eslint` supports versions below 6.1; the npm lockfile records the exact
tested dependency graph. Upgrade these tools together.

The milestone 5 dependency installation reports zero audit vulnerabilities.
See the development log for verification details.

## Official references

- [Vite setup and Node requirements](https://vite.dev/guide/)
- [Vite 8 build options](https://vite.dev/config/build-options)
- [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html)
- [Three.js render targets](https://threejs.org/docs/pages/RenderTarget.html)
- [Three.js texture filters](https://threejs.org/docs/pages/Texture.html)
- [Three.js color management](https://threejs.org/manual/pages/color-management.html)
- [Rapier JavaScript character controller](https://rapier.rs/docs/user_guides/javascript/character_controller/)
- [Rapier scene queries and filtering](https://rapier.rs/docs/user_guides/javascript/scene_queries/)
- [Playwright clock and animation-frame control](https://playwright.dev/docs/clock)
- [React effects and cleanup](https://react.dev/reference/react/useEffect)
- [Colyseus rooms and fixed simulation](https://docs.colyseus.io/room)
- [Colyseus private room visibility](https://docs.colyseus.io/matchmaker/visibility)
- [Colyseus schema state](https://docs.colyseus.io/state/schema)
- [Colyseus JavaScript SDK](https://docs.colyseus.io/sdk)
- [Web Audio best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices)
- [Native dialog behavior](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog)

See [DEVELOPMENT.md](DEVELOPMENT.md) for milestone status and validation results.
