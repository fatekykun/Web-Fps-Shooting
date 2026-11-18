# BREAKPOINT development log

## Scope

The repository initially contained only `prompt.md` and `.git`. The original
brief is unchanged. Milestones 1–8 are implemented locally. Milestone 9 deployment
code and verification tools are implemented; cloud publication and eight-human
play still require live hosting accounts and participants. BP-01 adds local
physical-device training measurements on the target Intel UHD 620 hardware.

## BP-09 — private weapon restrictions and player limits

Private creation now offers a 2/4/6/8-player limit (default 8, host included) and
WEAPON SETTINGS with an explicit Restrict weapons toggle. Unrestricted is the
default. Custom mode permits one or two of Rifle, SMG, Shotgun and Sniper,
disables unselected options at two, shows the selection count and prevents
creation with zero choices. Changing game mode preserves the private options.
The existing dialog stays scrollable at compact viewport sizes; the selection
count remains visible there. Lobby occupancy and the main header use the
configured capacity, and room rules list the allowed categories.

`PrivateRoomSettings` extends the existing base match configuration; its parser
reuses base validation, rejects unsupported limits, empty/duplicate/unknown or
over-two custom categories, copies only accepted fields and canonicalizes weapon
order. Missing fields retain unrestricted/eight-player behavior. The base
`MatchSettings` parser and defaults are unchanged. These settings apply only to
the existing private Depot room creation flow; public matchmaking behavior is
unchanged. The room stores `playerLimit` and `allowedWeapons` in authoritative
Colyseus schema state. Capacity/loadout are fixed at creation and persist through
host migration, game mode changes, respawn and rematch. Join payloads and the
existing host match-rule messages cannot overwrite them.

`DepotRoom` sets both `maxClients` and matchmaking capacity to the selected
limit. Existing Colyseus reservations count connected and reserved seats before
admission, so simultaneous joins cannot overfill the room; existing leave logic
reopens seats. No parallel room manager or custom join counter was introduced.
`ServerCombat` builds its existing ownership sets from the allowed categories,
selects an allowed initial weapon and restores that loadout on respawn. Its
existing switch/fire ownership validation rejects forbidden equipment requests.
The client receives room rules, filters predicted and outgoing switch intent,
initializes cosmetic selection from the authoritative spawn, and displays only
allowed HUD shortcuts. Legacy room snapshots fall back to all weapons/eight
players; offline practice remains unrestricted.

Implementation files: shared `config/match.ts` and `network/protocol.ts`; server
`rooms/RoomState.ts`, `rooms/DepotRoom.ts` and `combat/ServerCombat.ts`; client
`components/PrivateRoomFields.tsx`, `RoomPanel.tsx`, `CombatHud.tsx`,
`app/App.tsx`, `app/interface.css`, `app/styles.css`, `game/networking/NetworkSession.ts`,
`game/core/Game.ts`, `game/combat/NetworkCombat.ts` and `PracticeCombat.ts`.
Tests add shared `config/privateRoom.test.ts`, server `rooms/PrivateRooms.test.ts`
and `tests/browser/private-rooms.spec.ts`; they extend server
`combat/ServerCombat.test.ts`, `game-modes/MatchController.test.ts` and client
`game/combat/NetworkCombat.test.ts`.
README and the server README describe creation-time options and enforcement.

All **329 unit/integration tests across 44 files** pass. New coverage exercises
all four requested loadouts, each supported capacity with concurrent overbooking,
malformed creation requests, guest/host override attempts, authoritative ammo,
late joining, client key filtering, respawn, results/lobby/rematch and live TDM
seat reuse. Existing unrestricted eight-player and server-owned combat tests
also pass. Production build/typecheck and lint pass.
All **12 Chrome browser scenarios** pass on the final build. The five new
private-room cases cover form defaults/validation, keeping choices through a
mode change, and these live configurations:

| Loadout          | Capacity | Mode | Result |
| ---------------- | -------- | ---- | ------ |
| Sniper only      | 2        | FFA  | Passed |
| Shotgun only     | 4        | FFA  | Passed |
| Shotgun + Sniper | 6        | TDM  | Passed |
| Rifle + SMG      | 8        | FFA  | Passed |

Each live case verifies synchronized rules, allowed HUD keys, blocked shortcuts,
allowed switching, ADS, authoritative shots/ammo, manual reload, occupancy after
leave/rejoin and allowed equipment on late entry. The two-player case also
rejects a third connection. Existing unrestricted room creation/joining, FFA/TDM
results/rematch, interface settings and server-confirmed death/respawn checks
pass. Screenshot QA covers the compact create form at
`test-results/bp09-create-640.png` and lobby/game captures for all four loadouts.
The player-limit select shares the existing match-field styling. Input filtering
runs after dead-player controls are cleared, preserving neutral outgoing input.
Validation used isolated preview/server ports 4194/2675. Formatting and whitespace
checks pass. Restart both client and server to load the new room schema/rules.

## BP-08 — weapon-specific iron sights and ADS views

The five generic sight pieces previously shared by every weapon are replaced
by `apps/client/src/game/weapons/WeaponSights.ts`. This configuration owns each
weapon's sight geometry, front/rear aiming references, ADS position and Euler
rotation. `WeaponViewmodel` appends only the selected weapon type's configured
parts to its prebuilt instanced mesh and reads that model's pose during update.
The body/hands, pooled materials, pixel textures and muzzle flash remain shared
through the existing implementation. Every weapon keeps a single model draw;
switching toggles the four prebuilt meshes without rebuilding geometry.

| Weapon  | Sight                                                                      | ADS position (x, y, z), model units | ADS world FOV             |
| ------- | -------------------------------------------------------------------------- | ----------------------------------- | ------------------------- |
| Rifle   | Square rear aperture, eight-sided protective front hood and blade tip      | (0, −0.124, −0.61)                  | 62°                       |
| SMG     | Compact swept V-notch, low shoulders and guarded front blade               | (0, −0.116, −0.56)                  | 67°                       |
| Shotgun | Supported barrel rib and faceted bead; no rear aperture                    | (0, −0.101, −0.62)                  | 60°                       |
| Sniper  | Existing hollow faceted scope and dedicated reticle; generic irons removed | (0, −0.19, about −0.303)            | Existing 4× magnification |

ADS rotations are independently configurable and currently (0, 0, 0), matching
the models' straight sight axes. Subtracting the sight-line height brings the
front and rear reference points onto the viewmodel camera's −Z center line.
The existing 60° viewmodel camera and shared world FOV/timing configuration are
unchanged. Rifle/SMG/shotgun pose interpolation reuses the reversible ADS blend.
Sniper keeps its staged raise/eye approach and scope handoff; `SniperScope.ts`
accepts the configured final eye depth without changing its default behavior.
Existing recoil, equip/reload, sprint carry and traversal offsets still compose
over the weapon-specific pose. Input, sensitivity, ballistics and server rules
are unchanged.

All sights are procedural `BoxGeometry` instances using the existing nearest-
filtered weapon atlas and readable material. The rifle hood and sniper tube use
faceted segments; crossed small boxes form the shotgun bead. No imported model,
new material/texture, dependency, render target or attachment draw is introduced.
These parts can later be replaced by authored assets. Geometry totals are 27
instances for rifle, 22 for SMG, 22 for shotgun and 55 for sniper, plus the existing
pooled muzzle flash when firing. No geometry is allocated during animation.

Modified/added files: `game/weapons/WeaponSights.ts`, `WeaponViewmodel.ts`,
`SniperScope.ts` and `WeaponSights.test.ts` under `apps/client/src/`;
`tests/browser/sights.spec.ts`, `tests/browser/sniper.spec.ts`, README, this log
and the local BP-08 ticket.
The 15 new unit cases check actual front/rear projection at 4:3, 16:9 and 21:9,
clear sight rays through the actual mesh, connected iron-sight supports, near-
plane clearance throughout ADS, distinct geometry, switching while aiming,
pooled resources and reversible interpolation at 30/60/144 FPS.
All **305 tests across 42 files** pass. Production build/typecheck and lint pass.
All **15 Chrome browser scenarios** are verified on the native GPU: two new sight
cases at fixed Performance 640×360 / low texture and Quality 1280×720 / high
texture, plus combat/network combat, reload, sensitivity, sniper and all-weapon
sprint regressions. Each new sight case checks all four models, ADS entry/exit,
field of view, hits/ammo, scope handoff, switching while aiming and draw counts.
Hip, raise, full ADS and held-ADS switching screenshots were inspected, including
`test-results/bp08-quality-{rifle,smg,shotgun,sniper}-ads.png` and the corresponding
Performance captures. The first native run read a stale sprinting telemetry
sample in the existing sniper slide check. Its simulated wait now allows an
extra frame beyond the 250 ms telemetry interval; that case then passed without
changing movement logic or its assertions. Browser servers used isolated ports
4190/2673. Formatting and whitespace checks also pass.

Native performance on the local Intel UHD 620 / i7-8650U, Chrome 157, Quality
1280×720, high textures, shadows/AA/adaptive resolution off, with approximately
125 Hz look input during walk/fire/ADS/reload: after a five-second warmup, the
20-second rifle run averaged **59.99 rolling FPS** (minimum rolling 1% low
**39.25 FPS**, 74 samples); SMG averaged **60.03 rolling FPS** (minimum rolling
1% low **47.34 FPS**, 75 samples). Full reports are
`test-results/bp08-native-rifle.json` and `bp08-native-smg.json`. Runs were serial
with no other test browser active. These are local hardware measurements, not
a locked-60 guarantee for every scene/device. The models remain procedural;
there is no imported or skeletal sight/weapon asset.

### BP-08 follow-up — rifle red-dot optic

At the user's request, the rifle now uses a red-dot reflex optic instead of
the initial aperture/front-post design. Its rail-mounted housing has chamfered
upper corners, a clear window and a side adjustment block; the front iron sight
is removed. The rifle ADS position is now `(0, -0.146, -0.61)`, with zero rotation
and the existing 62° world FOV. Other weapons retain their BP-08 sight designs.

`WeaponSights.ts` defines the optic window and reticle dimensions. The housing
uses 9 pooled box instances (22 rifle instances total). `WeaponViewmodel` adds
one pooled, eight-sided `CircleGeometry` with an unlit red material, no texture,
bloom or depth writes. It renders only when the camera aim ray falls inside the
optic window. Reused matrices/vectors intersect that ray with the optic plane,
keeping the dot centered during cosmetic recoil and sway. The receiver/housing
still use one instanced draw; the visible dot adds one tiny draw with depth
testing. There are no new render targets or passes. Geometry/material disposal
follows the existing lifecycle.

`Game.ts` passes visible optic-reticle state to `App.tsx`, which hides the normal
crosshair above 95% ADS while the red dot is visible. Other weapons preserve
their normal crosshair/scope behavior. Sight tests verify open-window clearance,
unlit dot color, camera-ray alignment during recoil, pooled geometry and hiding
after switching or pausing. Browser checks sample actual red framebuffer pixels
at the aiming center at 360p and 720p, verify crosshair handoff and inspect the
resulting screenshots. All 306 unit/integration tests and six Chrome browser
scenarios pass (sights, combat/network combat and all-weapon sprint). Build,
typecheck and lint pass. This follow-up also changes README and the BP-08 notes.
The local UHD 620 native-GPU rifle profile at 1280×720 Quality with AA/shadows
off and continuous look input averaged **59.88 rolling FPS**, with minimum
rolling 1% low **23.94 FPS**, across 73 samples over 20 seconds after warmup.
The full report is `test-results/red-dot-native-rifle.json`; results vary with
hardware and system load.

## BP-07 — camera and firing sensitivity

Settings → Sensitivity provides two independent groups, Camera and Firing, each
with Steering, ADS, Sniper Scope and Vertical Turning values. All eight sliders
use integer percentages from 1–300, with 100 as neutral. Reset Sensitivity changes
only these eight values; Restore Defaults retains its existing full reset.
The existing `breakpoint.settings.v1` key stores the nested configuration. Legacy
global multipliers migrate once into all eight percentages; malformed/missing
fields default independently and finite values clamp to the slider bounds.
Other saved preferences and customized bindings remain intact.

`Game` supplies a getter for the active practice/network weapon controller to
the existing `InputController`. Each pointer-locked mouse event reads the current
weapon and held trigger. Held fire selects Firing values during a burst or bolt
cycle; release selects Camera immediately, without waiting for a simulation tick
or a queued fire press. Empty/equipping weapons and blocked reloads use Camera.
A fresh press that can cancel a partial reload selects Firing. Switching weapons,
respawning and changing practice/online mode resolve the current controller via
the same getter, without copying weapon state into another controller.

For the selected group, horizontal percentage is
`steering + (aimed - steering) * adsBlend`, where `aimed` is Sniper Scope for the
sniper and ADS for other weapons. This reuses the existing ADS animation blend;
no additional input smoothing, acceleration or timers are introduced. Vertical
percentage is the group's Vertical Turning value, independent of horizontal
settings. Both deltas apply the existing `0.002 rad/pixel` base and existing
`tan(displayedFov / 2) / tan(hipFov / 2)` zoom scale once, then their respective
percentage divided by 100. Invert Y, yaw wrapping, pitch limits and capture/focus
resets remain in the same handler. Non-finite mouse deltas are ignored.
There is no frame-time multiplier, so equal total mouse distance produces equal
rotation across event/frame partitions. Sensitivity updates preserve held input
and orientation; rebinding still clears held controls to avoid stuck keys.

Implementation files: `game/settings/userSettings.ts` (types/defaults/migration),
`game/input/InputController.ts` (state selection and independent axes),
`game/core/Game.ts` (live weapon getter), `components/SettingsPanel.tsx` and
`app/interface.css` (dedicated tab using existing controls), all under
`apps/client/src/`. Tests extend `InputController.test.ts`, `userSettings.test.ts`
and `tests/browser/interface.spec.ts`, and add `game/input/Sensitivity.test.ts`
and `tests/browser/sensitivity.spec.ts`. `scripts/profile-browser.ts --look`
exercises the actual mouse handler with 125 Hz look events during the existing
native-GPU walk/fire/ADS/reload performance scenario. README documents the controls.

Validation: all **290 tests across 41 files** pass, including independent axes,
all four weapons, ADS interpolation/sniper priority, immediate trigger release,
blocked/cancellable reloads, input-preserving reconfiguration, inversion/limits,
non-finite deltas, equivalent mouse distance at 30/60/144 event partitions,
legacy migration, malformed values and independent persistence. All **23 Chrome
browser checks** pass for sensitivity, interface, movement, combat/network combat,
reload, sniper and all-weapon sprint. The two sensitivity cases passed again on
the final build after refining blocked-reload selection. A real Colyseus room
verified raw yaw/pitch deltas for camera/firing hip, ADS and sniper input, with no
rotation from button transitions. Settings screenshots were inspected at
1280×720 and 640×640: `test-results/bp07-sensitivity.png` and
`bp07-sensitivity-640.png`; room evidence is `bp07-server-look.png`.
Browser checks used isolated client/server ports 4188/2672. Build/typecheck,
lint, formatting and whitespace checks pass. A test run concurrent with the
software-rendered browser suite exceeded three existing 5-second physics-test
timeouts; the complete suite passed with Chrome closed, without changing those
tests or their limits.

The final native-GPU profile used Chrome 157 on the local i7-8650U / Intel UHD 620,
Quality at 1280×720, high textures, shadows/AA/adaptive resolution off, a five-second
warmup and a 20-second rifle walk/fire/ADS/reload run with approximately 125 Hz
look events. Across 75 samples, average rolling FPS was **60.00**, with minimum
rolling 1% low **39.29 FPS**. `test-results/bp07-native-look.json` stores the full
report. Reproduce while a local preview is running with
`npm run profile:browser -- --url http://127.0.0.1:4189 --preset quality --weapon rifle --seconds 20 --look --output test-results/bp07-native-look.json`.
This is a local hardware measurement, not a locked-60 guarantee for every device
or scene. The feature retains desktop mouse / Pointer Lock requirements. No new
dependencies, camera controller, renderer passes or server protocol changes
were needed.

## BP-06 — automatic reload and reload interruption

Auto Reload defaults to on in the existing persisted user settings, with a
Controls checkbox and Restore Defaults support. `InputController` sends the
preference alongside weapon controls. The input parser accepts only a boolean
when supplied; legacy inputs retain the shared controller's current preference.
The server still owns inventory, timing and hit validation.

The shared `WeaponController` starts one reload after the last shot, or when an
empty weapon finishes equipping / Auto Reload is enabled. Full magazines and
zero reserves cannot start a reload. R remains available with either preference.
Completion runs before new actions, transfers only the capacity/reserve minimum,
and lets a shoot press on that tick use the loaded rounds. A fresh shoot press
cancels a partial reload without transferring ammo; held fire alone does not
cancel. Empty reloads continue. Cancellation preserves fire and sniper bolt
cooldowns; switching retains its existing cancellation behavior.

Network presentation follows confirmed reload progress and completion without
restarting a locally cancelled reload from unchanged older snapshots. HUD ammo
and reload state remain server-owned. A damped scalar blends the existing weapon
pose back after cancellation, without adding geometry, render passes or assets.
Empty weapons with no reserves now show OUT OF AMMO.

Validation includes all four weapons, limited reserves, duplicate requests,
completion-tick firing, toggling, switching, sniper cooldowns, settings storage,
input validation, authoritative server behavior and network reconciliation.
The full unit/integration suite passes 279 tests across 40 files.
All 11 Chrome browser checks pass: the three new reload scenarios plus existing
combat, network combat, sniper and all-weapon sprint cases. The multiplayer
reload check changes the preference in a live private room, verifies manual R
with Auto Reload off, partial cancellation, empty-reload protection and exact
server-owned ammo totals. Screenshots at `test-results/bp06-partial-reload.png`,
`bp06-interrupted.png` and `bp06-server-reload.png` were inspected. Browser checks
used isolated client/server ports 4187/2671. Build/typecheck, lint, formatting and
whitespace checks pass.

## BP-05 — dedicated sprint weapon animation

`WeaponViewmodel` now blends the existing shared weapon/hands group into a
raised diagonal sprint carry, with about 52 degrees of upward pitch, a slight
side turn/cant and a rearward position offset that keeps the longer sniper
barrel inside the view. Existing weapon geometry, textures, materials and pooled
instance counts are unchanged. No skeletal rig, new assets, render pass or
separate animation system was introduced.

Carry enters with exponential damping at 12/s and exits at 18/s. Additional
sway and lift integrate sprint distance at a 1.8 m step cadence; the phase
freezes when stationary/paused rather than jumping with wall-clock time.
Steady walking retains its original bob/hold. Slides, backslides, jumps, dives
and recovery blend out of carry into their existing presentation. A blocked
sprint settles back to a normal hold. The reduced-motion setting reduces the
extra oscillation while retaining a recognizable static carry pose.

The game passes existing aim/fire intent into the viewmodel by reference.
Aim, held fire/recent shots, reload and equip suppress carry. ADS also smoothly
attenuates residual carry so sights align as before, including both sniper
scope styles and ADS during sprinting/sliding/jumping. These are cosmetic
priorities only: no movement, camera, mouse-look, fire interval, spread, damage,
reload inventory, weapon-switch timing or server rule was changed.

Seven new tests cover all four models, smooth entry/exit, 30/60/144 FPS
consistency, shooting/ADS/reload/equip priorities, traversal transitions,
blocked/paused movement, reduced-motion amplitude and transformed geometry
staying clear of the camera's near plane. The full 250-test suite across 39
files passed. The new browser scenario verifies all four guns with walking,
sprint, fire, sprint ADS, stop/idle and reload, with unchanged low draw counts.
Captures are `test-results/bp05-{rifle,smg,shotgun,sniper}-{walking,sprint,sprint-ads,idle}.png`.
The profiler now accepts `--scenario sprint` for sprint carry, walk ADS/fire
and idle/reload phases; the original combat scenario remains the default.

The four-weapon browser scenario passed, as did eight focused movement/ADS
regressions: four facing-directed slide jumps, slide-cancel momentum,
backslide/dive recovery and sniper sprint/slide/jump ADS in Classic and Optical.
These functional runs use SwiftShader and a controlled clock; their HUD FPS is
not a hardware measurement. Production build/typecheck and lint passed.

Native profiling on 2026-11-17 used Intel UHD 620 / i7-8650U, Chrome
157.0.8103.79 ANGLE D3D11, headless **without SwiftShader**, Quality 1280x720,
high textures, AA/shadows/adaptive off. The 20-second sprint-carry / backward
walk-ADS-fire / idle-reload scenario after warmup averaged **60.00 FPS** across
75 samples; minimum rolling 1% low was **39.49 FPS**. Functional tests were
finished before profiling. Raw report: `test-results/bp05-sprint-native.json`.
This meets the average 60 FPS target in a short local training sample; transient
lows, other devices and full human matches remain separate measurements.
Test services used isolated ports 4186/2670 and were cleaned up; the user's
existing room server on 2567 was preserved.

## BP-04 — bolt-action sniper

SR-04 extends the existing shared weapon controller and validated weapon ID list;
no new runtime dependency, asset download, room message or rendering pass is
required. It is available in training and the existing private FFA/TDM loadouts.
All balance values are centralized in `apps/shared/src/config/weapons.ts`:
5/20 rounds, 45 RPM, 1.333 s per-weapon bolt lockout, 2.8 s magazine reload,
315 ms ADS to 90%, 4× magnification, high recoil/hip spread and long range.
Early cycling taps are discarded, held fire cannot repeat, and switching cannot
reset a bolt cooldown. Reload transfer and cancellation reuse existing rules.

Camera zoom uses tangent-based magnification relative to the user's configured
hip FOV. Render-frequency ADS also drives zoom-scaled sensitivity and the circular
native-resolution scope overlay through a DOM ref; React still receives normal
4 Hz telemetry/event updates. The opaque viewmodel rises and centers its hollow
eyepiece before the native scope takes over. Classic is the default presentation,
zooming the whole view and hiding the model at handoff. Optional Optical keeps the
rifle visible around the optic. A lens-sized world render supplies magnification
inside the glass; its peripheral camera keeps the player's hip FOV. Composition precedes the
existing world AA, with no new AA mode, blur or temporal history. Sniper geometry
shares the box primitive, nearest-filtered textures and
material with the other pooled models: 60 instances, 720 triangles, one draw when
visible. Only the bolt handle's instance matrix changes during cycling.

The shared controller exposes a scoped movement policy. Ground walking can use
the configured 0.45 speed scale; ordinary movement defaults to its original speed.
The server installs its own policy from the authoritative loadout and validated
input. Prediction keeps a local scale alongside pending inputs for replay, while
the network packet contains no client-selected multiplier. Sprint, slide,
backslide, dive, recovery and airborne movement all permit sniper ADS, matching
other weapons' aim eligibility. Airborne aiming retains an accuracy penalty.
Slide-jump, wall-jump, hopping, collision and ground-response tuning are untouched.

Shared avatar intersection now identifies head, upper/lower torso, arms and legs
from the same rendered part boxes, including yaw/head pitch/posture scale. Sniper
damage is 150/100/90/70/70 respectively; other weapons retain their damage and
head multiplier. The nearest part/body/world obstruction still stops the ray.
A side-on arm can therefore take 70 even when the reticle points toward the torso.
Damage readouts clamp to the victim's remaining health. Server loadout, magazine,
equip, reload, cadence, cycle, protection and team checks remain authoritative.
Corrections include bolt progress; peers receive existing confirmed shot/kill
events, trails, impacts, weapon IDs and spatial firing audio. The dummy retains
its original head/body sensors. Procedural sniper report, bolt, ADS and reload
cues use the existing bounded audio engine and volume controls, with server-only
online hit/kill confirmation. No recordings or external assets are used.

Validation includes 234 passing unit/integration tests across 37 files. New checks
cover cadence boundaries, early presses/held fire, switching during cycling,
five-round depletion, reload completion/cancellation and reserves, custom-FOV 4×
math and reversible ADS at 30/60/144 Hz, movement eligibility/air spread, prediction
replay without transmitted speed scales, actual bolt matrix motion without new
geometry, nearest texture filtering, audio voice/volume bounds, existing-control
migration and server-resolved damage in every region. Server tests also check
ownership, cover and sniper reload inventory. Type checking, production builds
and lint pass. The existing Rapier build-size warning remains.

Browser verification covered all 26 scenarios: the 24 existing graphics, interface,
movement, networking, combat, FFA/TDM and deployment checks, plus two sniper
acceptance tests. Both sniper tests passed twice in the final targeted run (4/4):
scope/camera zoom, sharp overlay, dummy hit, recoil, bolt lockout, five-round
depletion/reload, scoped speed, sprint/slide cancellation and slide-jump; and one
browser plus seven SDK peers confirming a server headshot kill, ammo, trace and
kill feed in a full private room. The kill test explicitly aims at the shared
head box, avoiding a side-on arm occluding the torso. Chrome functional tests use
SwiftShader; their FPS is not a hardware benchmark. Final screenshots are
`test-results/bp04-sniper-model.png`, `bp04-sniper-scope.png` and
`bp04-server-sniper.png`. Tests used isolated client/server ports 4185/2669;
the existing server on 2567 was preserved.

Native profiling on 2026-11-16 used Chrome 157.0.8103.79, Intel UHD 620 / i7-8650U,
ANGLE D3D11, headless with **no SwiftShader**, fixed Quality 1280×720, high textures,
shadows/AA/adaptive resolution off. Sequential 20-second training samples followed
5-second warmups, alternating walking, firing, ADS and reload, with fresh trigger
presses for the bolt-action sniper. No functional suite ran concurrently.

| Weapon         | Mean rolling FPS | Minimum rolling 1% low FPS | Last rolling 1% low FPS |
| -------------- | ---------------: | -------------------------: | ----------------------: |
| Rifle baseline |            59.99 |                      39.49 |                   57.20 |
| SR-04 sniper   |            59.72 |                      27.41 |                   58.48 |

Mean FPS differs by about 0.46%, with no sustained frame-rate drop in this run.
These initial BP-04 measurements predate the ADS animation follow-up below.
The sniper's lower transient 1% low remains visible in the measurements; short
samples do not establish equal tail latency or full-match performance. Sampled
main-thread CPU ranges overlap (rifle 0.51–1.96 ms, sniper 0.56–1.84 ms). The sniper
initially added 132 model triangles versus the rifle, used the same one active model draw,
and removed that draw while fully scoped. No added render targets/passes or GPU
texture assets are allocated. Raw reports: `test-results/bp04-rifle-native.json`
(75 samples) and `test-results/bp04-sniper-native.json` (74 samples). The profiler
now accepts `--weapon rifle|smg|shotgun|sniper`. These local training results do not
replace eight-human network play, audio mix/balance tuning or longer profiling.

### BP-04 ADS animation follow-up — 2026-11-17 (before lens-only rendering)

Right-click now raises the rifle from the hip, centers the eyepiece, then brings
it toward the eye. Camera magnification starts after the raise begins, rather
than zooming immediately while lowering the weapon. A shared, reversible visual
curve stages the viewmodel, camera and native overlay from the existing ADS
progress; releasing aim or interrupting it with movement follows the same path
back. Weapon timing, spread, recoil, movement policy and server hit rules remain
unchanged. Custom FOV and zoom-scaled mouse sensitivity still use the displayed
camera FOV.

The box-shaped optic has been replaced with a faceted hollow scope body and rims
using the same primitive, opaque material and nearest-filtered texture. The
solid rifle stays visible during the raise. The native aperture first matches
the visible tube opening, masks the model handoff, then opens to the full sight.
There is no transparent weapon fade, ghosted housing, second camera render or
new render target. The 60 pooled box instances remain one model draw and share
the original geometry/material/texture resources. Scope markings appear once
the opening is readable. The handoff also reverses during interrupted ADS.

Regression coverage checks upward/inward movement, centered aim, solid material,
reversible visibility, staged zoom/aperture and other weapons' opaque rendering.
Frame-stepped browser captures cover the raise, alignment, handoff, eye approach
and full scope: `test-results/bp04-sniper-raise.png`, `bp04-sniper-align.png`,
`bp04-sniper-handoff.png`, `bp04-sniper-eye.png`, and `bp04-sniper-scope.png`.

All 234 unit/integration tests passed, with the final optic changes also passing
the 25 focused weapon tests. The five browser checks passed for rifle/SMG ADS,
shotgun handling, confirmed network combat and both sniper scenarios; the final
opaque handoff passed both sniper checks again. Typecheck, production build and
lint passed. A repeat native UHD 620 profile with the same Quality 1280×720,
AA/shadows/adaptive-off setup averaged **59.75 FPS**, with a minimum rolling 1%
low of **32.26 FPS** over 74 samples / 20 seconds, including walk/fire/ADS/reload.
Raw report: `test-results/bp04-ads-sniper-native.json`. This remains a short local
training measurement, with the same hardware/multiplayer limits as above.

### BP-04 optical scope and visible peripheral vision — 2026-11-17

The latest scope replaces the fullscreen dark surround with a local metal rim,
restrained lens reflection and edge shading. Peripheral scenery stays visible at
the configured hip FOV; magnification is confined to the circular glass. The
existing raise-to-eye animation, custom FOV, recoil and sensitivity remain aligned
with the central aim ray. The opaque weapon remains visible around the optic.

`OpticScope.ts` copies the player's pose into a normal-FOV peripheral camera and
a zoomed lens camera. The square lens projection compensates for aperture size,
preserving true apparent 4x magnification even as the opening animates or the
viewport changes shape. A single pooled nearest-filtered linear-color target is
sized to 86% of the smaller world dimension (620x620 at Quality 1280x720). It is
reused across ADS and resized only for world-resolution changes. Its MSAA sample
count follows the existing renderer target; unsupported modes retain the existing
fallback. The normal world render updates shadows once; the lens reuses those
shadow maps. The circular composite is scissored to the aperture and inserted
before the existing FXAA/SMAA chain, so AA remains exclusive and covers both views.
Native HUD/reticle rendering is unchanged.

The additional world render and composite run only while the lens is visible.
Inactive optics add no draws. Scope attachments/materials are disposed with the
renderer. The extra target and world pass are a deliberate visual-quality cost;
earlier single-view profile numbers above describe the prior implementation.
Weapon ownership, ammo, hit validation, movement and match rules are unchanged.

New unit tests cover magnification at 65/85/110 base FOV across lens sizes,
peripheral pose preservation, inactive cost, stable allocations during ADS,
MSAA attachment changes and restored rendering state. Browser checks compare
actual peripheral pixels before/after ADS and require them to stay unchanged,
while pixels inside the optic must change. Captures retain the raise-to-eye
sequence and full scope at `test-results/bp04-sniper-scope.png`.

Validation: 239 unit/integration tests across 38 files passed. The optical pixel
and movement scenario, AA/preset/resize scenario and eight-player server combat
scenario passed across the focused browser runs. All five modes (OFF, FXAA, SMAA,
MSAA 2X, MSAA 4X) rendered valid lens pixels without WebGL errors; settings switches
and resizing were checked while using the optic. The room test waits for pointer
capture and independently delivered shot/kill events, and uses the Performance
preset so SwiftShader does not starve the client's real-time control packets.
Build/typecheck, lint, formatting and whitespace checks passed.

A fresh native UHD 620 / i7-8650U, Chrome 157.0.8103.79 ANGLE D3D11 profile at
Quality 1280x720, high textures, AA/shadows/adaptive off averaged **59.65 FPS**.
The minimum rolling 1% low was **23.79 FPS** in the 20-second walk/fire/ADS/reload
sample (74 readings, after warmup). This measures the new additional lens render;
the older single-view results are historical. Mean FPS stayed close to the prior
59.75 run, while transient lows remain in the data. It is a short offline sample,
not a full-match or universal device guarantee. Raw report:
`test-results/bp04-optic-native.json`. Native profiling ran after functional tests
completed; SwiftShader browser-test FPS is excluded from this measurement.

### BP-04 selectable scope styles — 2026-11-17

Settings → Display → Sniper scope style now offers Optical (lens-only zoom) and
Classic (whole-view zoom). Classic is the default, including existing preferences
without this new field and Restore Defaults. The `scopeStyle` preference is
validated and persisted with other user settings; invalid values fall back to
Classic without changing unrelated preferences or bindings.

Both modes share ADS, magnification, sensitivity, raise-to-eye motion and the
native rim/reticle. Optical uses the existing peripheral/lens renderer and keeps
the weapon visible around the optic. Classic renders the already-zoomed gameplay
camera over the entire screen and hides the model when the sight takes over,
avoiding a solid tube obstructing the target. Classic skips the additional lens
world/composite draws. Switching back to Optical reuses its pooled resources.
There is no fullscreen black mask in either mode. Graphics presets and server
combat rules are unchanged.

Unit coverage checks safe defaults/migration, both persisted values and model
visibility for both styles. Browser coverage compares actual peripheral pixels
in both modes, verifies lower Classic draw counts and switching back without
extra lens draws, checks persistence after reload and Restore Defaults, and
retains Optical AA/resize coverage. Screenshots are
`test-results/bp04-scope-style-classic.png` and `bp04-scope-style-optic.png`.

Verification: 242 unit/integration tests across 38 files passed, plus the two
browser scenarios for AA/resize and scope-style rendering/persistence/reset.
Production build, typecheck and lint passed. No native performance benchmark was
repeated for this preference-only change: Optical retains the measured renderer
above; Classic's lower draw count is checked in the browser.

### BP-04 ADS during movement and faster aim — 2026-11-17

Removed the sniper-only movement eligibility gate from both render-frequency
client ADS and the fixed-tick authoritative server ADS. Holding RMB can now start
or maintain aim during running/sprinting, sliding/backsliding, dive/recovery,
ordinary jumps and running/slide jumps. Reload/equip restrictions remain shared
with other guns. The walking slowdown policy is separate from ADS eligibility:
only eligible ordinary walking receives the 0.45 speed scale; traversal uses its
existing movement targets and impulses. Airborne spread and server hit rules
remain unchanged. Both Classic and Optical scope styles share this behavior.

Sniper `adsTime` changed from 0.350 to 0.315 seconds, a 10% duration reduction.
The shared exponential ADS curve drives the same reversible raise-to-eye motion,
zoom, sensitivity and reticle transitions; no new timers or delays were added.
Timing tests check the 90% boundary at 30/60/144 Hz. Server tests simulate sprint,
slide and slide-jump inputs and verify ADS remains active, sprint speed is kept,
air spread persists and aiming can start after takeoff. Browser regressions cover
entering and maintaining ADS through sprint, slide and running jumps in both
scope styles. Restart both client and server to load the shared rules and timing.

Verification: all 243 unit/integration tests across 38 files passed on the final
run. All four sniper browser scenarios passed: training combat/reload/movement,
eight-player server-confirmed combat, and starting ADS during traversal in each
scope style. Production build/typecheck, lint, formatting and whitespace checks
passed. The existing room server on port 2567 was left running; isolated test
services on 2669/4185 were cleaned up.

## BP-03 — camera-facing slide jumps

Slide/backslide takeoff now redirects horizontal momentum toward the view yaw
sampled with the jump input. `SlideJump.ts` changes only horizontal velocity;
the controller applies the dedicated vertical impulse and normal gravity, then
enters the existing airborne state. The launch tick bypasses air steering so
WASD cannot immediately override that vector; ordinary air control resumes on
the next fixed tick. Normal jumps outside slide eligibility still use `bunnyHop`.
No positions, general BP-02 ground rates or collision rules were changed.

| Configuration                  | Default | Meaning                                                             |
| ------------------------------ | ------- | ------------------------------------------------------------------- |
| `slideJumpMomentumRetention`   | 0.98    | Fraction of available horizontal momentum                           |
| `slideJumpRedirectionStrength` | 1       | Full facing direction; lower values blend the shortest angular turn |
| `slideJumpVerticalImpulse`     | 6.5 m/s | Same initial vertical impulse as the normal jump                    |
| `slideJumpTransitionWindow`    | 0.15 s  | Eligibility after slide completion or cancellation                  |
| `slideJumpMinimumSpeed`        | 3 m/s   | Eligibility threshold; never a boost from rest                      |
| `slideJumpMaximumSpeed`        | 12 m/s  | Launch ceiling, also bounded by the existing global cap             |

Completion/cancellation stores the last actual slide speed in a short-lived
reserve. It decays with slide friction, independently of recovery input braking,
and uses the higher of current legitimate speed and that remaining reserve.
Actual collision losses reduce the reserve; it cannot restore speed from a wall
impact. A successful jump consumes it once. Stop, another slide/dive or an
airborne transition clears it. Ground/coyote eligibility, head clearance,
posture recovery, slide cooldowns and wall-jump limits remain in force.

Jump presses cache their yaw for the existing jump buffer, so turning again under
low cover cannot change the queued launch direction. `jumpYaw`, `slideJumpGrace`
and `slideJumpSpeed` are part of the existing movement snapshot, allowing server
correction and prediction replay to restore exactly the same pending transition.
No new input fields, transport messages, network architecture or movement state
enum were introduced. Restart client and room server together to load these rules.

209 unit/integration cases across 34 files pass in the full suite, plus strict TypeScript, lint and
production builds. Real Rapier coverage includes all four headings, completion
and cancellation, buffered facing under cover, window expiry, normal jumping,
one-shot/cooldown behavior, wall blocking/lost momentum, backslides and no speed
amplification. Horizontal travel across headings stays within 5% both during a
slide and after completion. The new sequence is identical at 30/60/144 rendering
FPS, and prediction replay matches across active/completed/buffered transitions.
Eight legal turn/slide/jump cycles also pass without speed growth or stale
momentum launches. BP-02's reversal/braking and the other existing mechanics
still pass unchanged. The runtime adds no per-step vector allocations.

All 24 browser cases pass against a fresh isolated build/server on ports
4184/2668, preserving existing local services. They use keyboard input and the
same mouse event path as the existing look-input tests. Since HUD telemetry is
published at 4 Hz, trajectory checks compare two airborne samples rather than
mixing a stale slide position with an early jump sample. Generated test copies
under `.deploy/bp03-browser/` change only loopback endpoint ports.

Rendering, AA, weapons and physics geometry were not modified. No dependencies
were added. Formatting checks accept the repository's existing Windows line
endings; unrelated formatting normalization remains outside this ticket.

## BP-02 — responsive movement and directional control

The delay came from ground acceleration (45 m/s², sprint 30 m/s²), exponential
release friction and normal-ground overspeed decay. Keyboard axes already update
on key events; input smoothing, fixed 60 Hz physics and multiplayer architecture
were not changed. The client and server continue to run the same shared controller.

Normal ground movement now approaches a normalized 5 m/s walk or 8 m/s sprint
target with independent rates. Opposite input uses strong counter-acceleration;
sideways changes use a separate turning rate. Release braking reaches zero in a
finite time without overshooting into the opposite direction. All values live in
`apps/shared/src/config/movement.ts`:

| Parameter                                 | Value       | Units |
| ----------------------------------------- | ----------- | ----- |
| Ground / sprint acceleration              | 70 / 90     | m/s²  |
| Strafing / backward acceleration          | 85 / 70     | m/s²  |
| Direction change / reversal acceleration  | 140 / 220   | m/s²  |
| Ground / sprint braking                   | 100 / 130   | m/s²  |
| Strafing / backward braking               | 110 / 100   | m/s²  |
| Air acceleration                          | 8           | m/s²  |
| Air drag / neutral braking                | 0.08 / 0.12 | 1/s   |
| Slide friction / recovery overspeed decay | 1 / 3       | 1/s   |
| Ability horizontal speed cap              | 12          | m/s   |

Ordinary walking sheds overspeed promptly. Sliding, backsliding and the short
posture-recovery interval keep their separate momentum rules. Jump handling still
precedes ground braking, retaining slide-cancel and bunny-hop takeoff momentum;
air, dive and wall-jump motion remain separate. Faster acceleration exposed taps
pressed at rest becoming eligible before the action buffer expired; slide/dive
buffers now require eligibility when pressed, while slide cancels, contact/cooldown
buffering and the existing W-to-S backslide grace remain functional.

Rapier's existing moving-floor workaround remains enabled while moving. At zero
horizontal displacement, the adapter restores non-slip floor traction to suppress
tiny idle creep. It changes that setting only when entering/leaving rest. The
controller bounds collision-resolved velocity by the requested horizontal speed,
so contact corrections cannot accumulate movement energy. No positions are
teleported, and gravity, vertical integration, colliders and collision queries
remain intact. The tests allow less than 1 mm of contact settling over two idle
seconds; residual horizontal movement velocity is exactly zero.

Real Rapier measurements on a flat unobstructed floor, fixed 60 Hz simulation:

| Scenario                  | Before: reversal / full opposite speed | After: reversal / full opposite speed |
| ------------------------- | -------------------------------------- | ------------------------------------- |
| Walk forward ↔ backward   | 117 / 233 ms                           | 33 / 83 ms                            |
| Strafe left ↔ right       | 117 / 233 ms                           | 33 / 67 ms                            |
| Sprint forward → backward | 183 / 300 ms                           | 50 / 83 ms                            |

| Release            | Before: stopping time / distance | After: stopping time / distance |
| ------------------ | -------------------------------- | ------------------------------- |
| Walk               | 533 ms / 0.375 m                 | 50 ms / 0.083 m                 |
| Sprint, Shift held | 567 ms / 0.590 m                 | 83 ms / 0.196 m                 |
| Strafe             | 517 ms / 0.361 m                 | 50 ms / 0.075 m                 |
| Backward           | 517 ms / 0.361 m                 | 50 ms / 0.083 m                 |

The baseline was recorded by running the new response assertions before changing
the controller. Reproduce current measurements with:

```powershell
$env:BP_MOVEMENT_REPORT = '1'
npm run test -- apps/client/src/game/movement/MovementResponsiveness.test.ts --disableConsoleIntercept
Remove-Item Env:BP_MOVEMENT_REPORT
```

These measure fixed simulation ticks, not keyboard/monitor/network latency.
178 unit/integration cases across 32 files pass, including identical motion at
30/60/144 rendering FPS, diagonal speed limits, braking/reversal, no ground speed
accumulation, prediction replay, slide/cancel/backslide/bunny-hop/dive/wall-jump,
clearance/ceilings, pause and collision behavior. The roof approach fixture now
starts lowering before the faster ramp reaches the overhang. Strict TypeScript,
lint and production builds pass. All 20 browser cases passed together, including
real-keyboard reversal/braking, existing slide/dive flows, graphics/AA, rooms,
server-confirmed combat, FFA/TDM and cover occlusion. The full suite used fresh isolated preview/server ports 4183/2667
because an existing server is running on 2567. Generated test copies under
`.deploy/bp02-browser/` differ only in loopback endpoint ports; the normal build
output and existing local rooms were left untouched by the isolated run.

Changed files pass normal formatting. The full `npm run format:check` reports
pre-existing CRLF warnings in 27 untouched files (including graphics). The full
check passes with `npm exec -- prettier --check . --end-of-line auto`; those
files were left unchanged to preserve ticket scope.

Native Intel UHD 620 / i7-8650U profiling in Chrome 157.0.8103.79 (ANGLE D3D11,
headless, not SwiftShader) averaged **59.83 FPS**, with a minimum rolling 1% low
of **26.49 FPS**. This was a 20-second offline walking/fire/ADS/reload profile
after a five-second warmup at Quality/1280×720, adaptive Off, AA Off, High textures,
shadows Off, view 60 m and Crisp scale. The average remains near the 60 FPS target;
transient dips remain. This is not a sustained thermal or eight-player benchmark.
The raw report is `.deploy/bp02-native-quality.json`; run the existing browser
profiler against a production preview to reproduce the scenario.

Restart both the client and room server when trying BP-02 so prediction and
authority load the same updated movement rules.

Rendering, AA, textures, lighting, weapon
rules/damage and multiplayer architecture were not modified. No dependencies added.

## Configurable anti-aliasing

Added a mutually exclusive OFF / FXAA / SMAA / MSAA 2X / MSAA 4X selector under
Settings → Display. Existing v1/v2 graphics preferences normalize to OFF, keeping
the default retro presentation and render cost. Preset changes retain the chosen
method; viewport/adaptive changes resize all active buffers and texel uniforms.

The WebGL canvas remains `antialias: false`: all geometry renders into a custom
world target. MSAA changes that target's actual sample count and rebuilds its
attachments on mode changes. Exact RGBA8 and DEPTH_COMPONENT24 sample support is
intersected; unsupported 2X is never silently represented by 4X. SMAA requires
renderable half-float targets and waits for its lookup images to decode. Missing
capabilities or failed SMAA loading fall back to OFF, preserving the stored choice
and explaining the fallback in Settings.

FXAA is one world-resolution pass using Three's shader with reduced subpixel
blending (0.25) and a higher relative contrast threshold (0.125). Sampling converts
linear input to perceptual sRGB, then decodes the filtered output to retain one
final display conversion. SMAA is Three's three-pass linear-space implementation,
lazily imported with its embedded lookup textures. Intermediate buffers are
allocated only for the active post method and disposed when switching or exiting.
Source linear sampling exists only within the post method; atlas/weapon maps and
the final low-resolution upscale retain nearest sampling. AA uses only the current
frame; no history buffers, full-resolution composer chain or HUD smoothing were introduced.

Implementation references: [Three render-target samples](https://threejs.org/docs/pages/RenderTarget.html),
[FXAAPass](https://threejs.org/docs/pages/FXAAPass.html) and
[SMAA's linear-space requirement](https://threejs.org/docs/pages/SMAAPass.html).
The installed Three source also establishes sampler update behavior and lookup
image readiness, which the runtime handles before drawing.

160 unit/integration cases across 31 files pass, along with strict TypeScript,
lint, formatting and production builds. All 19 Chrome acceptance cases pass in
one full regression run, including actual silhouette
coverage changes, exact 2×2 nearest presentation, sky color, mode exclusivity,
resize/reload, cancelling pending SMAA and unsupported-capability fallback. The
full gameplay browser regression covers movement, combat, rooms and modes.
Native-GPU comparison captures
were reviewed: geometry edges soften, while the pixel textures and HTML HUD retain
their intended definition. The optional SMAA chunk is 38.49 KB gzip; the base
Three vendor chunk remains 131.61 KB gzip. No dependencies were added.

Native profiling on 2026-11-16 used the same Lenovo/i7-8650U/Intel UHD 620 hardware
as BP-01, ANGLE D3D11, Chrome 157.0.8103.79, headless and **not SwiftShader**. Each
mode ran alone for 20 seconds after a five-second warmup at Quality/1280×720,
adaptive disabled, High textures, shadows Off, view 60 m and Crisp pixel scale.
The scenario cycles walking, firing, ADS and reload in offline training. All five
modes were available on this driver; reports confirm 0/2/4 world-target samples
and 0/1/3 post passes rather than assuming canvas AA covers the custom target.

| Mode    | Average rolling FPS | Minimum rolling 1% low FPS | Mean CPU submission (ms) |
| ------- | ------------------- | -------------------------- | ------------------------ |
| OFF     | 59.99               | 38.54                      | 1.19                     |
| FXAA    | 59.79               | 23.78                      | 1.11                     |
| SMAA    | 59.85               | 26.44                      | 1.24                     |
| MSAA 2X | 59.89               | 26.49                      | 0.99                     |
| MSAA 4X | 59.85               | 23.65                      | 1.31                     |

These short profiles average about 60 FPS but show transient dips; they are not
evidence of a locked 60 FPS or of eight-player/1080p performance. CPU submission
excludes asynchronous GPU execution, and 60 Hz presentation can conceal remaining
GPU headroom. Lows are the minimum rolling readings, not whole-run percentiles;
their windows can include startup/initial capture even after warmup. The small
average differences should not be treated as a ranking. MSAA allocates additional
multisample color/depth storage proportional to sample count; SMAA keeps two
half-float intermediates plus output and lookups, and FXAA keeps one output. Those
resources exist only for the selected mode. GPU memory usage is not exposed by
this profiler; its JS heap reading must not be presented as VRAM usage.

Raw reports and captures are generated under ignored `.deploy/aa/{mode}.json`
and `.json.png`. Captures are taken before warmup, so their displayed startup FPS
is not the measured average. With a production preview running, reproduce one
mode at a time (replace `fxaa` with `off`, `smaa`, `msaa2` or `msaa4`):

```powershell
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npm run profile:browser -- --preset quality --aa fxaa --seconds 20 --screenshot --output test-results/aa-fxaa.json
```

The profiler refuses unavailable methods and records the effective method, samples
and pass count alongside resolution. Add `--headed` for human testing in a visible
Chrome window; repeat with `--preset ultra` to measure an actual 1080p budget.

## 1080p graphics option

Added **Ultra (1080p), 1920×1080**, above Quality in the shared preset list. Both
graphics selectors expose it; validated preferences persist it with the existing
v2 storage format. Balanced remains the default. Adaptive resolution can step
down to Quality and recover to Ultra; disabling adaptive holds the chosen budget.
Smaller windows clamp to their actual output and other aspects retain the pixel
budget without stretching. The native HUD and other graphics controls are unchanged.

The browser profiler accepts `--preset ultra` and uses a 1920×1080 viewport rather
than measuring a 720p-clamped target. This option has 2.25 times Quality's world
pixels; BP-01's recorded 720p measurements do not imply 1080p performance.

Verified 20 focused resolution/settings/adaptive unit tests and all three graphics
Chrome acceptance cases, including actual 1920×1080 rendering, persistence and
resize behavior. Strict TypeScript, lint, formatting and production builds pass.

## BP-01 — crisp retro graphics

Ticket implementation focuses on client presentation. Presets are now 640×360,
960×540 (default) and 1280×720 at 16:9, with aspect/pixel-budget clamping and the
native HTML HUD preserved. Adaptive resolution retains hysteresis but stops at
the new 640×360 Performance floor. Explicit Retro/Classic pixel-effect settings
scale dimensions to 75%/50%; the default is full-preset Crisp.

Graphics settings v2 migrate v1 preset/adaptive preferences and validate texture
detail, shadow quality, view distance and render scale. High/Low switch actual
32/16 px world and weapon textures. 40/60/80 m changes actual camera clipping and
fog. Optional Low/High shadows use a cached static 512/1024 map; Off remains the
default for integrated graphics. No dynamic avatar shadow updates, bloom, MSAA,
screen-space outlines or additional presentation passes were introduced.

The floor/structure/container palette is brighter and separated by material.
Procedural tiles have restrained noise and readable seams; nearest magnification,
nearest mip selection and continuous sampling gradients preserve pixel art while
reducing distant shimmer. Container/case framing and corrugations share the trim
batch, reducing base arena draws from seven to six despite more edge definition.
Hemisphere fill and a directional key replace the darker single-light balance.

Remote avatars retain exact shared geometry and depth-tested opaque rendering,
with brighter head/body/team colors and subtle rim shading in the existing draw.
Weapons add magazine/baseplate, cuff, receiver and sight detail in their existing
instance batches with inexpensive matte lighting. Movement, weapon rules, server
validation, networking, colliders, HUD layout and match modes are unchanged.

150 unit/integration cases across 30 files pass; strict TypeScript, lint,
formatting and production builds pass. All 17 Chrome acceptance cases pass across
the full regression and focused runs, including two consecutive passes of the
new visibility case. Graphics browser cases verify the three target resolutions,
native HUD/aspect, exact 2×2 Performance output, correct sRGB, settings
persistence, actual texture/map sizes and camera far plane. A moving SDK target
checks medium/distant visibility and solid-cover occlusion. Its input batches are
paced by server acknowledgements to avoid waypoint overshoot under software
rendering. Multiplayer combat/modes, movement and the existing UI also passed.

Native GPU profiles on 2026-11-16 identified Lenovo model **20KGS8GB2T**, Intel
**i7-8650U / UHD 620**, ANGLE D3D11 and Chrome **157.0.8103.79**, rather than
SwiftShader. The viewport was 1280×720, headless, one offline training player,
high textures, shadows Off, view distance 60 m, Crisp scale, adaptive resolution
disabled. Each updated preset ran for 20 seconds after a five-second warmup,
cycling walking, firing, ADS and reload. Other tests were not run concurrently.

| Configuration                     | World resolution | Average rolling FPS | Minimum rolling 1% low FPS |
| --------------------------------- | ---------------- | ------------------- | -------------------------- |
| Before BP-01, old Balanced (10 s) | 640×360          | 60.06               | 57.75                      |
| Performance                       | 640×360          | 59.95               | 33.81                      |
| Balanced                          | 960×540          | 59.98               | 35.76                      |
| Quality                           | 1280×720         | 60.02               | 46.89                      |

All three updated presets met the average 60 FPS target within normal sampling
variation. Occasional frame-time dips remain; these short, separately timed
profiles do not establish better or worse stutter than the shorter baseline,
sustained thermal behavior, or full eight-player performance. The low-FPS column
is the minimum of rolling readings, not a whole-run percentile. Headless native
GPU results also do not replace human playtesting in a normal Chrome window.

Raw reports are generated under ignored `.deploy/bp01/after-{preset}.json`; the
baseline is `before-native-balanced.json`. Reproduce with the production preview
running (`npm run build`, then `npm run preview -- --port 4173`):

```powershell
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npm run profile:browser -- --preset performance --seconds 20 --output test-results/bp01-performance.json
npm run profile:browser -- --preset balanced --seconds 20 --output test-results/bp01-balanced.json
npm run profile:browser -- --preset quality --seconds 20 --output test-results/bp01-quality.json
```

Add `--headed` for a visible Chrome run, or `--shadows low|high` to measure the
optional cached shadow settings. Do not run other browser tests during profiling.
No dependencies were added for this ticket.

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
The initial source is committed locally for the configured GitHub remote. A
non-interactive push was attempted and failed because GitHub credentials are not
available (`could not read Username`; terminal prompts disabled). Authenticate
Git or connect the GitHub integration before pushing. Vercel/Render account
access and actual service URLs are still needed; no public frontend or
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

- Target Intel UHD 620 training profiles are recorded under BP-01 above; full
  eight-human network-match performance remains unverified.
- Non-integer display scales create unequal block widths while retaining nearest sampling.
- Nearest magnification preserves pixel art; mip selection reduces distant
  shimmer, but there is no temporal filter.
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
- Production hosting, TLS and full eight-player device profiling remain release work.

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
network connections, listen/tune the audio mix, and repeat target-device profiling
during full matches before extending BP-01's training results to multiplayer.

## Release gate

Milestone 9 is not fully released until public hosting, real eight-player access
and target-device profiling are verified. Prepared configuration alone is not a
live website.
