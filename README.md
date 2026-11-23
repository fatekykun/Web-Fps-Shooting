# BREAKPOINT

A browser FPS for desktop and touchscreens. **Milestones 1–8** provide
a momentum-based, pixel-rendered FPS arena, local weapon training and eight-player
private rooms with server-authoritative FFA and TDM matches, a retro tactical
interface, persistent settings and procedural audio. The original project brief
is preserved in [prompt.md](prompt.md).

**Milestone 9 deployment preparation is implemented:** Vercel frontend settings,
a Render multiplayer Blueprint, HTTPS endpoint/origin checks, direct room invites,
GitHub CI, an eight-client smoke test and a browser profiling tool. Cloud publishing
and real eight-human/target-device checks require the hosting accounts and live URLs.
See [DEPLOYMENT.md](DEPLOYMENT.md) for the exact launch steps and friends playtest.

## Mobile and tablet controls (BP-13)

Phones and tablets automatically receive a landscape touch HUD. Rotate sideways
to access the lobby or play; portrait shows a blocking rotation instruction.
Landscape locking is attempted, with manual rotation as the browser fallback.
Desktop and touchscreen laptops keep keyboard/mouse by default; tapping a menu
button selects touch controls, while clicking with a mouse selects mouse capture.

Drag the **left joystick** to move and the **right side** to look. **Sprint** and
**ADS** toggle; **Fire** and **Jump** are held. **Crouch** also slides at sprint speed.
**Prone** toggles crawling. **Dive**, **R** (reload),
**Swap**, **Scores**, and **II** (pause) use the existing actions. Independent
touches support moving, looking, aiming and firing together. Tablets have larger,
more widely spaced controls. Settings → Sensitivity → **Touch camera** provides
independent general, ADS and sniper sliders. Rotation, focus loss and pause clear
held controls. Online matches continue while paused, as on desktop.

See [BP-13](docs/BP-13.md) for implementation, validation, browser limitations and
instructions for testing from a phone on the same Wi-Fi network.

## Run locally

BP-12 adds animated barrel-origin bullet trails for all four weapons in training
and private rooms. Hip-fire opacity is 52%, ADS is 14%, and scoped sniper is 8%,
with shorter/thinner trails and reticle-center protection. Visual tuning,
attachment coordinates and verification are in [BP-12](docs/BP-12.md).

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

The command menu offers **Play**, **Create room**, **Join room**, **Settings**,
**Credits** and **Armory**. Play opens a choice of solo training or private multiplayer. Esc
releases the mouse and returns to command; native dialogs support keyboard focus,
Esc and focus restoration. Smaller layouts keep settings in scrollable panels.

Settings apply immediately and save in this browser when storage is available:

- **Controls:** hip FOV (65–110°), invert Y, Auto Reload and all
  keyboard actions. Click a binding and press a key; conflicting bindings swap.
  Esc cancels rebinding. Mouse buttons and Esc remain fixed. ADS retains each
  weapon's aimed FOV and scales sensitivity to the visible FOV.
- **Sensitivity (BP-07):** separate Camera and Firing groups each provide
  Steering, ADS, Sniper Scope and Vertical Turning sliders (1–300%, default 100%).
  Steering/ADS/sniper control horizontal turning; vertical turning is independent.
  ADS blends from steering to the aimed value, with sniper taking priority over
  generic ADS. Hold LMB to use Firing values while the weapon has ammo and is
  equipped; release immediately returns to Camera values. Existing zoom scaling
  applies once to both axes. Empty weapons and blocked reloads use Camera values;
  a fresh press that can cancel a partial reload uses Firing values. Reset Sensitivity
  resets only these eight values; Restore Defaults resets all preferences.
  Older global sensitivity values migrate into all eight percentages without
  multiplying them twice or resetting other preferences.
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
host is checked for readiness before matchmaking. Starting a session automatically
closes the lobby and enters the arena for the host and joined players. If a browser
requires a fresh mouse-capture gesture, use the single **Click to Play** button
over the arena. Esc still releases the mouse without leaving the room.
Before each round, a synchronized **3-2-1** countdown plays three beeps followed
by a **GO** start chime. Movement and firing stay locked until GO; the match timer
then starts at its full duration. Countdown audio uses the interface-volume and
mute settings.
Server-confirmed health, ammo, hits, kill feed, timer,
scoreboard and final standings retain the existing match authority.

Web Audio starts after a user gesture and loads the bundled weapon reports and
separate body-hit, headshot and elimination confirmations.
If a sample cannot load, the weapon uses a synthesized report. Equipment,
movement, confirmed hit/damage/death/respawn cues and ambient tones use one context, a reusable
noise buffer and at most 16 transient voices plus two ambient oscillators. Remote
gunshots use distance attenuation and stereo panning; walls do not occlude audio.
Hidden tabs stop effects and suspend audio. Unavailable audio leaves play usable.

Menus use brief opacity/position transitions. First-person weapons blend sprint,
slide and dive poses alongside equip/reload/recoil animation. Reduced motion
follows the OS on fresh settings, disables menu transitions and reduces cosmetic
weapon movement while preserving gameplay recoil. Remote avatars keep the exact
shared hitbox geometry and procedural joint poses, including walking/sprinting
gait, head pitch and low movement postures.

**Armory (BP-10)** opens on the equipped weapon and displays Fire Rate, Damage,
Range, Control, Accuracy and ADS. Select another allowed weapon to inspect its
ratings and actual gameplay values. Expand **Body multipliers & range profile**
for all eleven hit regions and distance breakpoints. Training and online damage
use `base damage * body multiplier * interpolated range multiplier`, preserving
fractional health internally. See [BP-10 implementation notes](docs/BP-10.md) for
weapon configurations, balance tables, hitboxes, server validation and testing.

## Private rooms (milestone 5)

Run the room server in a second terminal alongside `npm run dev`:

```sh
npm run dev:server
```

In the browser, choose **Private rooms**, enter a callsign and **Create private
room**. Share the six-character room code. Friends choose **Join room** from the
menu or the room dialog's **Join room** tab, enter their callsign and code, mark
themselves **Ready**, and the host chooses **Start session**. The lobby closes
automatically and the arena opens for the countdown. If mouse capture is denied,
click **Click to Play**. Choose a **Player Limit** of 2, 4, 6
or 8 when creating the room (default 8, including the host). Players can join
until that limit, including after the session starts. Full rooms reject further
joins, and vacated seats reopen. Rooms are hidden
from public matchmaking, and the last player leaving disposes the room. The host
role passes to the next player when the host leaves. A dropped connection leaves
the session; join again using the code if others are still there.

**Weapon Settings (BP-09):** rooms remain unrestricted by default. Enable
**Restrict weapons** and choose one or two categories: Rifle, SMG, Shotgun or
Sniper. The form shows the selection count, requires at least one custom choice
and disables additional choices after two. Weapon rules and capacity are chosen
at creation and apply to everyone for the room's lifetime, including late joins,
respawns and rematches. The lobby shows the allowed categories and live occupancy;
the header uses the same configured capacity. HUD shortcuts show only allowed
weapons. The server enforces these rules, including forged switch requests and
simultaneous joins. Create another room to change its loadout or player limit.
Offline training and unrestricted defaults retain all four weapons. Restart or
rebuild both client and server after updating to BP-09.

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

Online players start with **100 health** and the rifle, SMG, shotgun and sniper. The same
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
and the nearest living player's eleven body regions. These parts share their geometry,
yaw, head pitch, gait and posture scale with remote rendering. Shotgun pellets resolve
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

| Input            | Action                                                                |
| ---------------- | --------------------------------------------------------------------- |
| Left mouse       | Fire; rifle/SMG repeat while held, shotgun/sniper require new presses |
| Hold right mouse | Aim down sights; release to return to hip fire                        |
| R                | Reload; ammo transfers only when the reload finishes                  |
| 1 / 2 / 3 / 4    | Rifle / SMG / shotgun / sniper; independent ammo inventories          |
| Hold Tab online  | Show the live scoreboard                                              |

In offline training, aim at the blue **HOLO-01** in the central lane. Its eleven
body regions have separate hitboxes. Hits flash the target and show a native-resolution marker, damage
readout and target health. At zero health it disappears and resets after two
seconds. It is a holographic sensor, so the movement course can pass through it.
Cover blocks shots before the target. This dummy remains local practice and is
disabled in online rooms.

| Weapon        | Magazine / reserve | Fire                                 | Reload | ADS to 90% |
| ------------- | ------------------ | ------------------------------------ | ------ | ---------- |
| AR-01 rifle   | 30 / 120           | Automatic, 600 RPM                   | 2.0 s  | 140 ms     |
| SM-02 SMG     | 35 / 140           | Automatic, 900 RPM                   | 1.6 s  | 100 ms     |
| SG-03 shotgun | 8 / 40             | Semi-auto, 0.8 s interval, 8 pellets | 2.4 s  | 180 ms     |
| SR-04 sniper  | 5 / 20             | Bolt-action, 45 RPM                  | 2.8 s  | 315 ms     |

ADS changes camera FOV, sight alignment and sensitivity without smoothing mouse
look. Its reversible exponential blend updates at render frequency. Hip FOV is
85°; ADS uses 62°/67°/60° for rifle/SMG/shotgun. A short trigger tap is retained
until a simulation tick. Empty weapons reload automatically when reserves are
available. **Settings → Controls → Auto Reload** is on by default and saved in
this browser; turn it off to require **R**. Manual R works in either mode.
A fresh shoot press cancels a partial reload and fires the remaining ammunition,
subject to the normal fire interval and bolt cooldown. Empty-magazine reloads
cannot be interrupted by shooting or aiming. A fresh ADS/scope press also cancels
a partial reload, while already-held ADS allows a new reload to proceed.
Ammo transfers only when the reload finishes,
limited by capacity and available reserves; cancellation spends no reserve ammo.
The weapon blends smoothly out of a cancelled reload. These rules also run on
the multiplayer server, which validates the preference and owns the ammo counts.
Switching takes 180 ms and
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

Prototype limits: magazine-style reloads for all four weapons (no per-shell
shotgun loading) and primitive viewmodels. Practice uses eleven stationary sensors;
online avatars use the shared tactical skeleton with articulated limb joints.
Weapon values are prototype balance settings.

### Tactical characters (BP-11)

Multiplayer players use a faceted military model with natural proportions,
helmet/goggles, uniform, vest, pouches, gloves, knee pads, boots and backpack.
A shared 22-joint skeleton drives breathing, walking/running, sprinting, jumping,
landing, sliding, diving, reloading and directional damage reactions. Body hitboxes
follow those joints on the server. Gait follows actual capsule travel and stops
at solid walls. First-person articulated arms keep their hands on the existing
weapon grips and reach toward the magazine during reloads. Existing sights,
scope styles and controls retain their alignment and behavior.

The soldier uses one instanced character draw; first-person arms add one draw.
All assets are generated in the repository. See [BP-11 report](docs/BP-11.md) for
rigging, animation, modified files, asset sources and native-GPU measurements.
Restart the room server and refresh connected browsers after updating the
animation schema. Watch a friend in a private room to inspect the full soldier;
the blue hologram remains the training calibration target.

### Weapon-specific sights (BP-08)

Hold **RMB** to use each weapon's own sight: the rifle has a red-dot reflex optic
with a clear aiming window; the SMG uses a compact swept V-notch and blade; the shotgun
has a raised barrel rib and faceted front bead, with no rear aperture. The sniper
retains its hollow scope and dedicated reticle in both Classic and Optical modes,
without the generic iron-sight pieces.

Each model has its own ADS position and rotation in
`apps/client/src/game/weapons/WeaponSights.ts`. The front aiming point and rear
sight line align with screen center. Existing ADS timing, weapon FOV, sensitivity,
recoil, reloads and traversal animations still apply. Sight housings share their
weapon's instanced geometry draw and nearest-filtered texture. The rifle's red
dot uses one small unlit draw while visible through the optic, staying on the
camera's aim line during recoil. Its normal crosshair hides during full ADS.
No extra render pass is needed. These are procedural low-poly parts, matching
the existing models.

### SR-04 sniper (BP-04)

Press **4**, hold **right mouse** to scope, tap **left mouse** to fire, and use
**R** to reload. Each shot starts a **1.333 s bolt cycle**, with an animated handle,
two mechanical audio cues and a HUD progress bar. Early presses during the cycle
are discarded; holding fire never queues another shot. Switching away preserves
the cooldown. Switching weapons cancels a reload without spending reserve ammo.
Bindings can be changed in Settings; existing customized controls are preserved.

Choose **Settings → Display → Sniper scope style**:

- **Optical / lens-only zoom:** magnifies only the lens; surroundings stay at normal zoom.
- **Classic / whole-view zoom (default):** magnifies the lens and background together, like a traditional CODM-style scope.

The choice is saved on this browser. Older saved settings default to Classic;
Restore Defaults also selects Classic. Both styles keep the raise-to-eye animation
and circular native-resolution reticle.
Actual **4× magnification** uses `2 atan(tan(baseFov / 2) / 4)` and respects your
custom hip FOV. ADS, camera zoom, overlay and sensitivity blend smoothly; release
right mouse to restore your FOV. The rifle rises and centers its hollow eyepiece
at the eye before the optic opens. Zoom follows the raise, and the scope view
takes over through the tube's opening; releasing aim reverses the same path.
The surrounding world stays visible at your normal FOV while only the glass
magnifies the target in Optical mode. An opaque scope rim, subtle glass reflection
and edge shading frame both styles. Optical keeps the rifle visible around the
optic; Classic hands over to the whole zoomed view when the scope reaches the eye.
There is no fullscreen black mask, peripheral blur or temporal history. Optical
uses one pooled lens-sized render target only while scoping, composited before
the selected world AA. Classic uses the existing single world view. Pixel textures
retain nearest filtering and HUD text stays native.

Scoped walking is **45% of normal speed (2.25 m/s)**. Sniper ADS can start and
remain active while sprinting, sliding, backsliding, diving, recovering or jumping,
including jumping with sprint held. ADS time is **315 ms to 90%**, 10% shorter
than the original 350 ms. Traversal keeps its normal speed and momentum; airborne
shooting still adds substantial spread. Ground speed is computed independently by the server and predicted/replayed
locally; network packets cannot choose a speed multiplier. Slide-jump impulses
and other movement tuning are unchanged.

Sniper base damage is **90**. Within 25 m, the nearest hit region determines damage:
**head 135, upper torso 100, lower torso 81, arms/hands/legs/feet 63**, before remaining-health clamping.
The upper-body multiplier is 100/90: upper-body damage drops smoothly from 100
within 25 m to 90 at 50 m (95 at 37.5 m).
BP-10 adds smooth range falloff: 0.9x at 50 m, 0.8x at 75 m, 0.7x at 100 m and
0.6x from 125 m to the 220 m bullet limit. Walls and other bodies block bullets.
TDM team rules and spawn protection still apply. The training dummy uses the same
damage calculation with eleven body sensors. Ammo,
reloads, bolt timing, damage and kills remain server-owned; local handling is
predicted. Peers receive the existing confirmed traces, impacts, weapon selection
and spatial firing audio. Sounds are original procedural synthesis and obey the
existing audio settings.

Balance values live in `apps/shared/src/config/weapons.ts`, including magnification,
ADS time, movement scale, body multipliers, range profile and bolt-cycle duration. Restart/rebuild
both the client and room server after updating to this version.

To check: scope the training dummy, fire once, try firing during cycling, empty
all five rounds and reload to **5 / 15**. Then walk scoped, sprint, slide and jump.
For multiplayer, join a private FFA/TDM room and confirm hit markers and the kill
feed with a friend. Run the repeatable native-GPU scenario with
`npm run profile:browser -- --weapon sniper --preset quality --seconds 20` while
the preview is running; detailed validation is recorded in `DEVELOPMENT.md`.

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

**Sprint weapon carry (BP-05):** hold **Shift + W** without aiming or firing to
raise the weapon into a diagonal carry pose. The rifle, SMG, shotgun and sniper
use the same smooth transition, with their hands moving alongside the weapon.
Sprint sway follows distance traveled, and stopping or returning to walking
smoothly restores the normal hold. Aiming, firing, reloading and switching take
priority, so the carry animation adds no shooting delay and does not block ADS.
Sliding, jumping and diving keep their existing movement and weapon behavior.
Reduced motion retains the raised pose while reducing extra sway/bob.

For repeatable local profiling with the preview running:
`npm run profile:browser -- --scenario sprint --weapon rifle --preset quality --seconds 20`.

| Input                                             | Action                                                                      |
| ------------------------------------------------- | --------------------------------------------------------------------------- |
| Shift + W                                         | Sprint, accelerating toward 8 m/s                                           |
| Space                                             | Jump; hold to bunny hop on landing                                          |
| Space again while airborne near a wall            | Wall jump; two per airtime, no consecutive reuse of the same wall           |
| C while standing or walking                       | Toggle crouch; in prone, rise to crouch if there is clearance               |
| Z                                                 | Toggle prone; crawl while prone and stand where there is clearance          |
| C while carrying sprint speed with Shift held     | Slide; entry speed 10 m/s, duration 0.65 s                                  |
| S + C while carrying sprint speed with Shift held | Backslide at 6 m/s without turning the camera                               |
| Space during a slide                              | Jump cancel, retaining horizontal momentum when there is standing clearance |
| C again during a slide                            | Cancel into a short recovery, then walk/sprint                              |
| X while sprinting                                 | Low-profile dolphin dive, followed by landing and recovery                  |

Slide and dive require sprint momentum. Crouch and prone work from rest and
block standing up if cover is in the way. Repeated keydown events do not retrigger
actions. Jump, slide and dive
presses are buffered for 120 ms. Backslide allows a 120 ms W-to-S grace window;
walking off a ledge allows an 80 ms coyote jump. Slides have a 350 ms
cooldown after exit; dives have an 800 ms cooldown after exit. Dive recovery
cannot be skipped by holding jump. Wall jumps have a 220 ms cooldown and require
a new Space press (or its short buffer); holding Space never climbs walls.

Practice low-clearance recovery in the **left-lane tunnel** and wall jumping
between the **right-lane walls**. Recovery remains low if an overhang blocks
standing; keep moving out, and the capsule and camera rise when space permits.
The HUD shows movement state, speed, grounding and wall-jump usage.

A browser with WebGL 2 is required. Desktop play also uses Pointer Lock; phone and
tablet play uses Pointer Events and the touch HUD. Serve through localhost or
HTTPS; do not open `index.html` directly from disk. On a remote host, use a secure
origin. See the BP-13 report for mobile orientation fallbacks and hardware checks.

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
| `apps/client/src/components/SettingsPanel.tsx`    | Controls/sensitivity/display/audio/crosshair settings and live preview                |
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
strong finite braking when keys are released. Sprinting targets 8 m/s. Ground,
sprint, strafe and backward acceleration/braking rates are independent; turns
and opposite inputs use stronger directional acceleration. Horizontal movement never overwrites
vertical velocity. The movement controller applies gravity and passes desired
displacement to Rapier's kinematic character controller. Collision-resolved
horizontal movement feeds back into velocity. There is no custom collision solver
to replace between movement states.

`MovementController` owns a typed state machine: walking, sprinting, sliding,
backsliding, airborne, diving and recovering. `Walking.ts`, `Sprinting.ts`,
`Sliding.ts`, `Backsliding.ts`, `SlideCancel.ts`, `SlideJump.ts`, `BunnyHop.ts`, `DolphinDive.ts`
and `WallJump.ts` implement the individual mechanics. Input, rendering and React
remain independent of these rules. All prototype values live in
`apps/shared/src/config/movement.ts`.

Ordinary walking promptly sheds excess sprint/slide speed instead of inheriting
a long glide. Sliding and the short posture-recovery state retain their intended
momentum; a queued jump launches before ground braking. Air motion has light drag,
separate neutral air braking and moderate directional acceleration. Jumps retain 98% of horizontal velocity before
air steering; all mechanics share a 12 m/s horizontal cap. A slide redirects
gently without adding speed through steering. Backslide is an intentional retreat
impulse that reverses the forward component while keeping bounded lateral motion.
Wall-jump impulses act along the wall normal, preserving tangent velocity.

**Slide + Jump (BP-03):** turn toward the direction you want to travel, then
press Jump during a slide/backslide or within 150 ms of its completion/cancel.
The launch redirects toward horizontal facing and retains 98% of available
momentum, bounded by the existing 12 m/s cap. A short-lived momentum reserve
prevents recovery braking from making a turned jump fall short; it decays and
honors collision losses. A buffered press keeps its facing until it can launch.
Normal jumping outside that window keeps its original behavior. No minimum-speed
boost is created from rest: below the 3 m/s eligibility threshold, Jump follows
the normal jump path. These values live alongside the existing movement tuning.

The capsule shrinks/expands at a bounded rate around fixed feet. Camera height is
derived from that actual capsule height and interpolated at render frequency.
Standing uses a Rapier shape-clearance query excluding the player's own collider;
blocked recovery never expands through a ceiling. Upward movement disables ground
snapping; ceiling contact normals stop ascent without deleting horizontal speed.
First-person height changes follow the capsule; weapon stance, equip, reload and
recoil animation remain cosmetic. Remote avatars use the shared tactical bone
hierarchy; their movement capsule remains the existing Rapier controller.

Rapier 0.21 can discard horizontal motion when it misclassifies flat-floor
rounding as slope slipping ([upstream report](https://github.com/dimforge/rapier/pull/1058)).
While moving, the adapter disables that non-slip branch using a negative minimum
slide-angle threshold. At rest it restores floor traction to suppress numerical
creep. Collision correction cannot add horizontal speed beyond the requested
motion; the maximum climb angle still prevents climbing walls. Sustained sprint and input-phase regressions
cover the workaround. Recheck slope behavior before adding a ramp course, and
remove this compatibility setting once a stable upstream fix is verified.

BP-02's real-Rapier flat-ground measurements at 60 Hz reverse walking direction
in 33 ms and sprint-to-backward in 50 ms; full opposite speed takes 67–83 ms.
Sprint release stops in about 83 ms / 0.196 m, versus the previous 567 ms / 0.59 m.
These are simulation measurements, rather than end-to-end input/display latency.
See `DEVELOPMENT.md` for tuning, browser checks and reproduction commands.

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
