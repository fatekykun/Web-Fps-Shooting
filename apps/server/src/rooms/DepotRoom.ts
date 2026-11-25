import { randomInt } from 'node:crypto';
import { Room, ServerError, type Client } from '@colyseus/core';
import { initializePhysics } from '@breakpoint/shared/physics';
import {
  footstepProfiles,
  type RemoteFootstep,
} from '@breakpoint/shared/movement/Footsteps';
import {
  arenas,
  defaultMultiplayerMapId,
  type ArenaDefinition,
} from '@breakpoint/shared/maps';
import { networkConfig, parseName } from '@breakpoint/shared/network';
import { RoomState, PlayerState } from './RoomState';
import { ServerPlayer } from '../players/ServerPlayer';
import { ServerCombat } from '../combat/ServerCombat';
import { MatchController } from '../game-modes/MatchController';
import { RoomCapacity } from './RoomCapacity';
import { validateSpawnLayout } from '../spawns/SpawnDirector';
import { weaponOrder } from '@breakpoint/shared';
import {
  matchDefaults,
  parsePrivateRoomSettings,
} from '@breakpoint/shared/match';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const codes = new Set<string>();
function reserveCode(): string {
  let code: string;
  do {
    code = Array.from(
      { length: 6 },
      () => alphabet[randomInt(alphabet.length)],
    ).join('');
  } while (codes.has(code));
  codes.add(code);
  return code;
}

export class DepotRoom extends Room<{ state: RoomState }> {
  static capacity = new RoomCapacity(16);
  private releaseCapacity?: () => void;
  state = new RoomState();
  maxClients: number = networkConfig.maxPlayers;
  patchRate = networkConfig.patchRate;
  maxMessagesPerSecond = 120;
  private arena: ArenaDefinition = arenas[defaultMultiplayerMapId];
  private readonly simulations = new Map<string, ServerPlayer>();
  private readonly footsteps: RemoteFootstep[] = [];
  private readonly combat = new ServerCombat(
    this.simulations,
    (shot) => this.broadcast('shot', shot),
    (kill) => {
      this.match.recordKill(kill);
      this.broadcast('kill', kill);
    },
    undefined,
    process.env.NODE_ENV !== 'production' && process.env.SPAWN_DEBUG === '1'
      ? {
          spawnDebug: ({ player, selected, fallback, candidates }) => {
            console.info('Spawn safety', {
              room: this.roomId,
              player,
              selected,
              fallback,
            });
            console.table(candidates);
          },
        }
      : undefined,
  );
  private readonly match = new MatchController(
    this.state,
    this.simulations,
    this.combat,
  );

  async onCreate(options?: { settings?: unknown }): Promise<void> {
    this.releaseCapacity = DepotRoom.capacity.reserve();
    try {
      await this.initialize(options);
    } catch (error) {
      this.releaseCapacity();
      throw error;
    }
  }

  private async initialize(options?: { settings?: unknown }): Promise<void> {
    const settings = parsePrivateRoomSettings(
      options?.settings === undefined ? matchDefaults.ffa : options.settings,
    );
    if (!settings)
      throw new ServerError(
        400,
        'Choose a supported arena, FFA/TDM, valid match rules, 2/4/6/8 players and one or two custom weapons.',
      );
    this.maxClients = settings.playerLimit!;
    const mapId = settings.mapId ?? defaultMultiplayerMapId;
    this.state.mapId = mapId;
    this.arena = arenas[mapId];
    this.state.playerLimit = this.maxClients;
    this.state.allowedWeapons.push(...(settings.allowedWeapons ?? weaponOrder));
    this.combat.setAllowedWeapons(settings.allowedWeapons ?? weaponOrder);
    await initializePhysics();
    validateSpawnLayout(this.arena);
    if (options?.settings !== undefined) {
      const error = this.match.configure(settings);
      if (error) throw new ServerError(400, error);
    }
    this.roomId = reserveCode();
    await this.setMatchmaking({
      private: true,
      maxClients: this.maxClients,
    });
    this.onMessage('input', (client, payload: unknown) => {
      const player = this.simulations.get(client.sessionId);
      if (!player?.enqueue(payload)) {
        // Continuing after dropping an input breaks sequence history; explicitly end the session.
        client.leave(
          4002,
          player?.rejectionReason ?? 'Player session unavailable.',
        );
      }
      if (this.state.phase !== 'playing') player?.freeze();
    });
    this.onMessage('ready', (client, ready: unknown) => {
      if (this.state.phase !== 'lobby' || typeof ready !== 'boolean') return;
      const player = this.state.players.get(client.sessionId);
      if (player) player.ready = ready;
    });
    this.onMessage('soul-requiem', (client, enabled: unknown) => {
      const player = this.simulations.get(client.sessionId);
      if (player && typeof enabled === 'boolean') player.soulRequiem = enabled;
    });
    this.onMessage('loadout', (client, payload: unknown) => {
      const player = this.simulations.get(client.sessionId);
      if (
        !player ||
        !payload ||
        typeof payload !== 'object' ||
        !('round' in payload) ||
        payload.round !== this.state.round ||
        !('life' in payload) ||
        payload.life !== player.state.life ||
        !('weapon' in payload) ||
        (this.state.phase !== 'countdown' &&
          (this.state.phase !== 'playing' || player.state.alive))
      )
        return;
      this.combat.selectLoadout(player, payload.weapon);
    });
    this.onMessage('*', () => {
      /* Unrecognized hit/damage/ammo claims have no authority. */
    });
    this.onMessage('configure', (client, value: unknown) => {
      if (client.sessionId !== this.state.hostId) return;
      const error = this.match.configure(value);
      if (error) client.send('notice', error);
    });
    this.onMessage('team', (client, value: unknown) => {
      const error = this.match.changeTeam(client.sessionId, value);
      if (error) client.send('notice', error);
    });
    this.onMessage('lobby', (client) => {
      if (client.sessionId !== this.state.hostId) return;
      const error = this.match.returnToLobby();
      if (error) client.send('notice', error);
    });
    this.onMessage('start', (client) => {
      if (
        client.sessionId !== this.state.hostId ||
        this.state.phase !== 'lobby'
      )
        return;
      const error = this.match.start();
      if (error) client.send('notice', error);
    });
    this.setFixedTimestep(() => {
      this.state.tick++;
      if (this.match.beforeTick()) {
        for (const player of this.simulations.values()) {
          const footstep = player.step();
          if (footstep) this.footsteps.push(footstep);
        }
        this.combat.step(this.state.tick);
        this.match.afterCombat();
      }
      if (this.state.phase !== 'playing') this.footsteps.length = 0;
      if (this.state.tick % 3 === 0) {
        for (const client of this.clients) {
          const player = this.simulations.get(client.sessionId);
          if (player) {
            const listener = player.movement.physics.position;
            // Send only nearby authoritative contacts inside the existing correction.
            const footsteps = player.state.alive
              ? this.footsteps.filter((step) => {
                  const source = this.simulations.get(step.player)?.state;
                  return (
                    step.player !== client.sessionId &&
                    source?.alive &&
                    source.life === step.life &&
                    Math.hypot(
                      listener.x - step.position.x,
                      listener.y + player.movement.eyeOffset - step.position.y,
                      listener.z - step.position.z,
                    ) <=
                      footstepProfiles[step.kind].range + 1
                  );
                })
              : [];
            client.send('correction', {
              ack: player.state.ack,
              snapshot: player.movement.capture(),
              combat: this.combat.owner(player),
              look: { yaw: player.state.yaw, pitch: player.state.pitch },
              ...(footsteps.length ? { footsteps } : {}),
            });
          }
        }
        this.footsteps.length = 0;
      }
    }, networkConfig.tickRate);
  }

  onAuth(_client: Client, options: unknown): boolean {
    const name =
      options && typeof options === 'object' && 'name' in options
        ? parseName(options.name)
        : null;
    if (!name)
      throw new ServerError(400, 'Choose a player name of 1–20 characters.');
    if (!this.match.canJoin())
      throw new ServerError(
        409,
        'This round is full. Join again after it ends.',
      );
    return true;
  }

  onJoin(client: Client, options: { name: string }): void {
    const slots = new Set(
      [...this.state.players.values()].map((player) => player.slot),
    );
    let slot = 0;
    while (slots.has(slot)) slot++;
    const player = new PlayerState({
      id: client.sessionId,
      name: parseName(options.name)!,
      slot,
    });
    this.match.assignTeam(player);
    if (!this.state.hostId) {
      this.state.hostId = client.sessionId;
      player.ready = true;
    }
    const simulation = new ServerPlayer(player, this.arena);
    this.simulations.set(client.sessionId, simulation);
    this.combat.add(simulation);
    this.state.players.set(client.sessionId, player);
    this.match.joined(simulation);
  }

  onLeave(client: Client): void {
    this.match.left(client.sessionId);
    this.simulations.get(client.sessionId)?.dispose();
    this.simulations.delete(client.sessionId);
    this.combat.remove(client.sessionId);
    this.state.players.delete(client.sessionId);
    if (this.state.hostId === client.sessionId) {
      this.state.hostId = this.state.players.keys().next().value ?? '';
    }
  }

  onDispose(): void {
    this.releaseCapacity?.();
    for (const player of this.simulations.values()) player.dispose();
    this.simulations.clear();
    codes.delete(this.roomId);
  }
}
