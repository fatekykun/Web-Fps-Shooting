# BREAKPOINT room server

Colyseus 0.18 server for milestones 5–9. Run `npm run dev:server` from the repository
root. Build both workspaces with `npm run build`, then run `npm run start:server`.
The production entry is `apps/server/dist/index.js`; its external packages are
installed by the root workspace lockfile. It is a persistent Node service, separate
from the static frontend.

Development defaults: `PORT=2567`, `HOST=127.0.0.1`. Production defaults to
`HOST=0.0.0.0`, honors the platform `PORT`, and requires `ALLOWED_ORIGINS` with exact
HTTPS website origins (comma-separated, without trailing slashes or wildcards).
`MAX_ROOMS` defaults to 16 and bounds concurrent room allocation, including rooms
still initializing. It is an admission ceiling, not a measured hosting capacity.
The server does not automatically load `.env`; use platform environment variables
or Node's `--env-file` option for local production checks.

`/health` returns the service
status and room capacity. Rooms are private, have six-character IDs, and cap at
eight connected players. Ready/start and host migration are included. Disconnects
release the player's seat; the last departure disposes the room and physics worlds.
Codes are unique within this process and are not persisted across restarts.

Physics initializes before readiness. Draining rejects new matchmaking/upgrades
and returns health 503; SIGINT/SIGTERM initiate a bounded graceful shutdown.
Browser HTTP matchmaking and WebSocket upgrades enforce the origin allowlist.
SDK clients without Origin can run diagnostics. Matchmaking uses standard HTTP
error statuses; bodies keep Colyseus error codes. One Node process/instance is
required with the current in-memory driver/presence. Render's proxy terminates
TLS, so one listener serves both HTTP and WebSocket traffic. No per-message socket
compression is enabled.

Use root `render.yaml` and [DEPLOYMENT.md](../../DEPLOYMENT.md) for cloud setup,
free-tier cold-start limitations, exact frontend/server URLs, live eight-client
verification and the manual friends playtest. `npm run smoke:multiplayer` at root
checks a running local server; URL/origin flags target your real hosted service.

`rooms/DepotRoom.ts` owns membership and tick scheduling. `RoomState.ts` declares
delta-synchronized public fields with schema 5's `schema()`/`t` API. Each
`players/ServerPlayer.ts` owns a bounded queue and a shared movement controller.
It accepts consecutive sequenced input, never client positions or elapsed time.
The room targets 60 fixed ticks/second and patches state at 20 Hz. Full correction
snapshots are sent only to their owner for movement replay; remote clients get
public transforms, roster, health/alive/life, protection and selected weapon.
Private correction messages also carry the owner's authoritative inventory,
reload/accuracy status and confirmed damage/hit counters.

`combat/ServerCombat.ts` owns weapon clocks, accepted shots, server-seeded spread,
nearest hitscan against shared avatar parts and Rapier map obstruction, health,
one-time kill events and respawn. All three default weapons are granted by the
server. It uses validated look/buttons from the newest input rather than replaying
weapon actions from the movement queue. A burst cannot advance weapon time. No
client hit, damage, ammo, origin, random-seed or timestamp claims are trusted.

Dead players cannot move or fire. Respawning after three seconds resets inventory
and movement and increments the life number; old-life inputs are ignored. Spawn
selection maximizes distance from living players across eight slots, with one
second of spawn protection. Current-pose raycasts have no historical rewind; lag
compensation remains future work. TDM respawns use that player's team side.

`game-modes/MatchController.ts` owns mode/settings, lobby readiness, four-player
team limits, server-only kill/death/team scoring, a monotonic match clock, frozen
results and rematching. FFA defaults to 20 kills/five minutes; TDM defaults to
40 team kills/seven minutes with friendly damage disabled. Shared settings and
spawn candidates live in `apps/shared/src/config/match.ts`. Only the host can
configure rules, start a match or return from results to the lobby. Team changes
are lobby-only; score/time fields sent by clients have no authority.

The scoreboard retains disconnected participants until the next lobby, bounded
to 64 participants per round. Only eight may be connected. Results cannot mutate
after the finish. Inputs arriving outside play are finalized without simulation
so returning to the lobby/rematching preserves sequence continuity.

`DepotRoom.test.ts` starts an actual HTTP/WebSocket server on an ephemeral port
and connects eight SDK clients. Other tests cover malformed inputs, bounded queues,
fixed input consumption, stale input, shared collision, cover/body/head raycasts,
ammo/rate/ownership/reloads, shotgun pellets, dead-state restrictions and respawn.
A socket test forges damage/ammo/origin claims and verifies server-owned results.
Run `npm test` at root.

API references used: [rooms](https://docs.colyseus.io/room),
[schema](https://docs.colyseus.io/state/schema),
[visibility](https://docs.colyseus.io/matchmaker/visibility),
[SDK](https://docs.colyseus.io/sdk). The project uses `@colyseus/core`,
`@colyseus/ws-transport`, `@colyseus/schema` and `@colyseus/sdk` directly rather
than the larger server starter bundle.
