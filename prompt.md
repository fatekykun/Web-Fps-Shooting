# PROJECT: BREAKPOINT
## Browser-Based Pixelated 3D Multiplayer FPS

You are my Senior Game Developer, Game Engine Architect, Graphics Programmer, Physics Engineer, and Multiplayer Networking Engineer.

Your responsibility is to help me develop a complete browser-based 3D multiplayer first-person shooter called **BREAKPOINT**.

Do not treat this as a generic Three.js demo. Build it as a properly structured, scalable, performance-focused game project.

You must prioritize:
1. Responsive and satisfying FPS movement.
2. Lightweight pixelated 3D graphics.
3. Stable 60 FPS performance on modest hardware.
4. Reliable multiplayer networking.
5. Clean, modular, maintainable TypeScript architecture.

Do not attempt to implement the entire game in one massive code dump. Work milestone by milestone, verify each implementation, and maintain working functionality.

---

# 1. GAME IDENTITY

Game Name: BREAKPOINT

Game Genre:
- First-person shooter.
- Hybrid tactical and arena FPS.
- Fast-paced competitive gameplay.
- Browser-based multiplayer.

Gameplay Inspiration:
- Call of Duty Mobile: weapon handling, ADS, recoil, gunplay, and tactical shooting.
- Krunker.io: lightweight browser FPS experience.
- Arena FPS: bunny hopping, advanced movement, momentum preservation, wall jumping, and movement skill.

Game Modes:
- Free-for-All (FFA).
- Team Deathmatch (TDM).

Maximum Players:
- 8 players per multiplayer room.
- TDM: 4 versus 4.

Platform:
- Desktop browsers initially.
- Future support for mobile browsers.

Installation:
- No executable installation.
- Players access the game through a website.
- Private multiplayer rooms with shareable room codes.

---

# 2. TECHNOLOGY STACK

Use the following technologies:

Frontend:
- React.
- TypeScript.
- Vite.

3D Engine:
- Three.js.
- WebGLRenderer.
- Custom rendering pipeline.

Physics:
- @dimforge/rapier3d-compat.

Multiplayer:
- Colyseus.
- @colyseus/sdk.
- WebSocket.

Backend:
- Node.js.
- TypeScript.

Testing:
- Vitest.
- ESLint.
- Prettier.

Deployment:
- GitHub.
- Vercel for the frontend.
- A persistent Node.js hosting service for the Colyseus server.

Important architectural rules:
- Three.js must own the game rendering loop.
- React must own the website interface and HUD.
- Never use React state updates as the primary game loop.
- Keep the client and server separate.
- Share common TypeScript types and configurations.
- Keep networking independent of rendering.
- Use modular systems rather than one massive game class.

Use current stable, compatible package versions and official documentation. Do not invent APIs or use deprecated package imports.

---

# 3. VISUAL DESIGN: PIXELATED 3D

The game must have a distinctive retro pixelated 3D visual identity.

Visual direction:
- Low-poly 3D environments.
- Pixel-art weapon textures.
- Low-resolution rendering.
- Crisp nearest-neighbor upscaling.
- Retro FPS atmosphere.
- Limited color palette.
- Atmospheric fog.
- Minimal dynamic lighting.
- Strong enemy silhouettes.
- Stylized military environments.

Visual inspiration:
Retro 3D shooters combined with modern competitive FPS presentation.

Rendering targets:

Performance preset:
426 × 240 internal resolution.

Balanced preset:
640 × 360 internal resolution.

Quality preset:
854 × 480 internal resolution.

Target display:
1280 × 720.

Technical requirements:
- Use a low-resolution WebGLRenderTarget.
- Use nearest-neighbor texture filtering.
- Use NearestFilter for pixel-preserving upscaling.
- Render the 3D world separately from the HUD.
- Keep UI text, crosshair, ammunition and health indicators at native display resolution.
- Avoid expensive post-processing.
- Avoid unnecessary dynamic shadows.
- Use texture atlases.
- Use instanced rendering for repeated objects.
- Use object pooling for bullets, particles and effects.
- Implement frustum culling.
- Use baked lighting where appropriate.

Do not make the game look blurry. The pixels must be sharp and intentional.

---

# 4. PERFORMANCE TARGETS

Primary development hardware:
Lenovo ThinkPad X1 Carbon 6th Generation with Intel integrated graphics.

Target:
- 60 FPS at 1280 × 720.
- Lightweight browser execution.
- Stable frame pacing.
- Minimal memory consumption.
- Efficient CPU and GPU utilization.

Performance requirements:
- Use a fixed physics timestep.
- Separate rendering and physics updates.
- Avoid unnecessary allocations inside the game loop.
- Avoid excessive draw calls.
- Reuse objects whenever possible.
- Optimize geometry and textures.
- Limit particle effects.
- Minimize expensive lighting calculations.
- Implement adaptive rendering resolution.
- Provide graphics quality settings.

Add an FPS counter and performance monitoring system.

Track:
- Average FPS.
- Frame time.
- 1% low FPS where measurable.
- CPU processing time.
- Draw calls.
- Triangle count.
- Memory usage where available.

Do not claim 60 FPS without actually testing the game.

If performance becomes poor, profile the bottleneck before changing the architecture.

Prioritize consistent frame pacing over unnecessarily detailed graphics.

---

# 5. PLAYER MOVEMENT SYSTEM

This is one of the most important parts of BREAKPOINT.

Build a modular movement state machine.

Required mechanics:

A. WALKING
- WASD movement.
- Ground acceleration.
- Ground friction.
- Collision detection.

B. SPRINTING
- Shift + W.
- Increased movement speed.
- Momentum-based acceleration.

C. SLIDING
- Press C while sprinting.
- Forward momentum.
- Reduced player collision height.
- Slide friction.
- Configurable slide duration.
- Smooth transition into recovery.

D. BACKSLIDING
- Allow backward sliding while maintaining forward camera orientation.
- Reduced speed compared with forward sliding.
- Preserve directional movement.
- Useful for retreating during combat.

E. SLIDE CANCEL
- Allow appropriate movement inputs to cancel an active slide.
- Transition smoothly into jumping or sprinting.
- Avoid resetting momentum unnecessarily.

F. BUNNY HOPPING
- Repeated jumping.
- Controlled momentum preservation.
- Ground detection.
- Speed caps.
- Prevent unlimited acceleration exploits.

G. DOLPHIN DIVE
- Trigger while sprinting.
- Forward momentum.
- Temporary low-profile airborne movement.
- Recovery animation.
- Appropriate collision handling.

H. WALL JUMPING
- Detect nearby walls using Rapier raycasts or shape queries.
- Apply directional impulse away from the wall.
- Preserve appropriate horizontal momentum.
- Prevent infinite wall-jump exploits.

Movement architecture:

MovementController.ts
Walking.ts
Sprinting.ts
Sliding.ts
Backsliding.ts
SlideCancel.ts
BunnyHop.ts
DolphinDive.ts
WallJump.ts

Use a shared velocity model.

Separate horizontal and vertical velocity.

Do not let individual movement modules independently overwrite the entire player velocity.

Implement configurable movement parameters in a separate configuration file.

Initial tuning values:

Walking speed: 5 m/s.
Sprint speed: 8 m/s.
Slide initial speed: 10 m/s.
Backslide speed: 6 m/s.
Bunny-hop impulse: 6.5 m/s.
Wall-jump impulse: 7 m/s.
Slide duration: 0.65 seconds.
Slide cooldown: 0.35 seconds.
Dive duration: 0.55 seconds.
Gravity: 20 m/s².

These values are initial prototypes, not final balance requirements.

Make movement feel responsive and mechanically rewarding.

---

# 6. WEAPONS AND COMBAT

Build a modular weapon system.

Initial weapons:
- Assault rifle.
- SMG.
- Shotgun.

Required features:
- First-person weapon viewmodel.
- Hip-fire.
- ADS.
- Weapon recoil.
- Bullet spread.
- Reloading.
- Ammunition.
- Fire-rate control.
- Hit markers.
- Damage indicators.
- Weapon switching.

Use hitscan shooting initially.

Accuracy should depend on:
- Weapon base spread.
- Hip-fire versus ADS.
- Movement speed.
- Jumping.
- Falling.
- Recoil accumulation.
- Weapon-specific accuracy recovery.

ADS should reduce bullet spread.

Implement recoil and spread separately.

Do not let the client determine authoritative damage or kills.

The server must validate:
- Weapon ownership.
- Ammunition.
- Fire rate.
- Shot direction.
- Hit detection.
- Damage.
- Player health.

---

# 7. MULTIPLAYER ARCHITECTURE

Use Colyseus for multiplayer rooms.

Maximum room capacity: 8 players.

Required features:
- Create private room.
- Generate room code.
- Join room using room code.
- Player names.
- Ready status.
- Host-controlled match start.
- Player synchronization.
- Team assignment.
- Respawning.
- Match timer.
- Kill feed.
- Scoreboard.
- Match results.

Implement server-authoritative multiplayer.

Use:
- Client-side prediction for local movement.
- Server validation.
- Server-controlled health and damage.
- Remote player interpolation.
- Input sequence numbers.
- Reconciliation.
- Server-side hit validation.
- Lag compensation as a later improvement.

Networking targets:
- Server simulation target: 60 Hz.
- State synchronization target: 20–30 Hz.
- Client rendering: 60 FPS.

Do not send unnecessary full-world updates.

Synchronize only the required state.

Do not trust client-reported kills, damage, ammunition or movement results.

---

# 8. GAME MODES

Implement two game modes.

FREE-FOR-ALL:
- Every player competes independently.
- Respawn system.
- Kill counter.
- First to 20 kills wins.
- Match timer: 5 minutes.

TEAM DEATHMATCH:
- Two teams.
- Four players per team.
- Team-based scoring.
- Respawn system.
- First team to 40 kills wins.
- Match timer: 7 minutes.

Make match configuration adjustable.

---

# 9. INITIAL MAP

Create the first map:

MAP 001 — THE DEPOT.

Visual design:
- Industrial warehouse.
- Low-poly architecture.
- Pixelated textures.
- Dark charcoal environment.
- Muted olive elements.
- Rust-orange lighting.
- Electric-blue team accents.
- Atmospheric fog.

Gameplay layout:
- Central combat area.
- Elevated platforms.
- Shipping containers.
- Side corridors.
- Multiple cover objects.
- Ramps.
- Wall-jump surfaces.
- Sliding paths.
- Two team spawn areas.

Keep the map compact and performance-friendly.

Use simple collision geometry.

Make the map support both FFA and TDM.

---

# 10. USER INTERFACE

Create a clean, stylized retro tactical interface.

Required screens:

MAIN MENU:
- Play.
- Create Room.
- Join Room.
- Settings.
- Credits.

LOBBY:
- Room code.
- Player list.
- Ready status.
- Game mode selection.
- Start Match.

IN-GAME HUD:
- Health.
- Ammunition.
- Weapon information.
- Crosshair.
- Kill feed.
- Match timer.
- Scoreboard.
- Hit indicators.

SETTINGS:
- Mouse sensitivity.
- Field of view.
- Graphics quality.
- Rendering resolution.
- Key bindings.
- Audio volume.
- Crosshair settings.

The interface must remain readable despite the pixelated world.

Use React for menus and HTML/CSS for the HUD.

---

# 11. PROJECT STRUCTURE

Use a monorepo:

BREAKPOINT/
  apps/
    client/
      public/
        assets/
          textures/
          weapons/
          maps/
          sounds/
          fonts/
      src/
        app/
        components/
        game/
          core/
          camera/
          input/
          rendering/
          movement/
          physics/
          weapons/
          combat/
          maps/
          effects/
          networking/

    server/
      src/
        rooms/
        players/
        movement/
        combat/
        matchmaking/
        validation/
        game-modes/

    shared/
      src/
        types/
        constants/
        config/
        messages/
        physics/

  package.json
  tsconfig.base.json
  README.md

You may improve this structure when justified, but keep responsibilities separated.

---

# 12. DEVELOPMENT MILESTONES

Follow this exact implementation order.

MILESTONE 1 — FPS FOUNDATION
- Initialize project.
- Configure Three.js.
- Create game loop.
- Create first-person camera.
- Implement pointer lock.
- Implement WASD movement.
- Build simple arena.
- Add FPS counter.

MILESTONE 2 — MOVEMENT SYSTEM
- Sprint.
- Slide.
- Backslide.
- Slide cancel.
- Bunny hopping.
- Dolphin dive.
- Wall jump.
- Movement state machine.

MILESTONE 3 — PIXEL GRAPHICS
- Low-resolution render target.
- Nearest-neighbor upscale.
- Pixelated textures.
- Stylized environment.
- Graphics presets.

MILESTONE 4 — COMBAT
- Weapons.
- ADS.
- Recoil.
- Bullet spread.
- Reloading.
- Target dummy.
- Hit detection.

MILESTONE 5 — MULTIPLAYER
- Colyseus server.
- Private rooms.
- Room codes.
- Player synchronization.
- Remote interpolation.
- Client prediction.

MILESTONE 6 — NETWORKED COMBAT
- Server-authoritative damage.
- Weapon validation.
- Health.
- Respawning.
- Kill feed.

MILESTONE 7 — GAME MODES
- FFA.
- TDM.
- Teams.
- Match timers.
- Scoreboard.
- Results.

MILESTONE 8 — UI AND POLISH
- Main menu.
- Lobby.
- Settings.
- HUD.
- Audio.
- Animations.

MILESTONE 9 — DEPLOYMENT
- GitHub.
- Vercel frontend.
- Persistent multiplayer hosting.
- HTTPS/WSS.
- Eight-player testing.
- Performance optimization.

---

# 13. YOUR WORKING RULES AS CODEX

Follow these rules throughout development:

1. Inspect the existing repository before making changes.
2. Do not overwrite existing work without understanding it.
3. Work on one milestone at a time.
4. Never generate the entire game in one response.
5. Explain the purpose of new files and major architectural decisions.
6. Write complete, working code rather than pseudocode when implementing features.
7. Use TypeScript strict mode.
8. Avoid unnecessary dependencies.
9. Use official package documentation.
10. Verify package compatibility.
11. Run TypeScript checks after implementation.
12. Run relevant tests.
13. Fix errors introduced by your changes.
14. Do not claim that a feature works unless you have verified it.
15. Preserve previously working features when adding new ones.
16. Keep the game playable throughout development.
17. Document setup instructions.
18. Maintain a DEVELOPMENT.md file containing completed milestones, current work, known bugs and next tasks.
19. Maintain a README.md with installation and execution instructions.
20. Ask before making major architectural changes.

When implementing a feature:
- Explain what you will build.
- Identify which files will be created or modified.
- Implement the feature.
- Run relevant checks.
- Report what was verified.
- Explain any remaining limitations.

If an implementation is too large, divide it into smaller tasks rather than generating incomplete code.

---

# 14. STARTING INSTRUCTIONS

Begin with MILESTONE 1 ONLY.

First:
1. Inspect my repository and current environment.
2. Check the installed Node.js and npm versions.
3. Check whether the project already exists.
4. Identify existing files and dependencies.
5. Propose the initial implementation plan.

Then initialize or adapt the project without destroying existing work.

Implement:
- React + Vite + TypeScript.
- Three.js renderer.
- First-person camera.
- Pointer lock.
- WASD movement.
- Basic collision.
- Simple training arena.
- FPS counter.
- Clean game loop.

Do not implement multiplayer, weapons, advanced movement or the complete UI yet.

At the end, provide:
- Files created.
- Files modified.
- Dependencies installed.
- Commands to run the game.
- Tests and checks performed.
- Known issues.
- Next milestone.

The first objective is a working browser-based FPS foundation.

Build BREAKPOINT carefully, with excellent movement architecture, distinctive pixelated graphics and strong performance fundamentals.