import { Client, type Room } from '@colyseus/sdk';
import {
  movementConfig,
  weaponOrder,
  type WeaponId,
  type MovementInput,
  type WeaponInput,
} from '@breakpoint/shared';
import type {
  OwnerCombat,
  ServerShot,
  KillEvent,
} from '@breakpoint/shared/combat';
import { MovementController } from '@breakpoint/shared/movement/MovementController';
import type { RemoteFootstep } from '@breakpoint/shared/movement/Footsteps';
import {
  isMultiplayerMapId,
  type MultiplayerMapId,
} from '@breakpoint/shared/maps';
import {
  codePattern,
  networkConfig,
  parseName,
  type Correction,
  type LoadoutSelection,
  type PlayerInput,
  type PublicPlayer,
  type RoomView,
} from '@breakpoint/shared/network';
import { Prediction } from './Prediction';
import { RemoteInterpolation } from './RemoteInterpolation';
import { resolveServerEndpoint } from './serverEndpoint';
import { waitForRoomServer } from './serverReadiness';
import type { LoadoutProfile } from '@breakpoint/shared/weapons/loadouts';
import { isOperator } from '@breakpoint/shared/operators';
import type {
  MatchView,
  MatchSettings,
  PrivateRoomSettings,
  ScoreRow,
  Team,
} from '@breakpoint/shared/match';

interface WireState extends Omit<MatchView, 'scores'> {
  mapId?: string;
  playerLimit?: number;
  allowedWeapons?: Iterable<WeaponId>;
  hostId: string;
  phase: string;
  tick: number;
  players: { forEach(callback: (player: PublicPlayer) => void): void };
  scores: { forEach(callback: (row: ScoreRow) => void): void };
}
interface Callbacks {
  isActive(): boolean;
  onArena(id: MultiplayerMapId): void;
  onView(view: RoomView | null): void;
  onError(message: string): void;
  onLeave(): void;
  onCombat(state: OwnerCombat): void;
  onShot(shot: ServerShot): void;
  onFootsteps(footsteps: readonly RemoteFootstep[]): void;
  onKill(kill: KillEvent): void;
  onLookReset(look: { yaw: number; pitch: number }): void;
}

export function serverEndpoint(): string {
  return resolveServerEndpoint(
    import.meta.env.VITE_SERVER_URL,
    location,
    import.meta.env.DEV,
  );
}

/** Transport has no dependency on Three.js or React. Loaded only when opening a room. */
export class NetworkSession {
  readonly remotes = new RemoteInterpolation();
  readonly prediction: Prediction;
  view: RoomView | null = null;
  private initialized = false;
  private leaving = false;
  private readonly outbox: PlayerInput[] = [];
  private life = 0;

  static async connect(
    mode: 'create' | 'join',
    name: string,
    code: string,
    movement: MovementController,
    callbacks: Callbacks,
    profile: LoadoutProfile,
    settings?: PrivateRoomSettings,
  ): Promise<NetworkSession> {
    if (navigator.onLine === false)
      throw new Error('Private rooms require an internet connection.');
    if (!parseName(name)) throw new Error('Choose a name of 1–20 characters.');
    code = code.trim().toUpperCase();
    if (mode === 'join' && !codePattern.test(code))
      throw new Error('Enter a six-character room code.');
    const endpoint = serverEndpoint();
    await waitForRoomServer(endpoint, callbacks.isActive);
    const client = new Client(endpoint);
    const room =
      mode === 'create'
        ? await client.create<WireState>(networkConfig.roomType, {
            name: name.trim(),
            settings,
            profile,
          })
        : await client.joinById<WireState>(code, {
            name: name.trim(),
            profile,
          });
    if (!callbacks.isActive()) {
      await room.leave();
      throw new Error('Room connection cancelled.');
    }
    return new NetworkSession(room, movement, callbacks);
  }

  private constructor(
    private readonly room: Room<unknown, WireState>,
    private readonly movement: MovementController,
    private readonly callbacks: Callbacks,
  ) {
    this.prediction = new Prediction(movement);
    // Deliberately leave a dropped connection: an explicit rejoin gets a fresh prediction history.
    room.onDrop(() => {
      this.fail('Connection lost. Rejoin with the room code.');
    });
    room.onLeave((code, reason) => {
      if (!this.leaving)
        callbacks.onError(
          reason || `Room closed (${code}). Rejoin with the room code.`,
        );
      this.remotes.clear();
      callbacks.onView(null);
      callbacks.onLeave();
    });
    room.onError((_code, message) => {
      callbacks.onError(message ?? 'Room connection failed.');
    });
    room.onMessage('notice', (message: string) => callbacks.onError(message));
    room.onMessage('correction', (correction: Correction) => {
      if (correction.combat && correction.combat.life > this.life) {
        this.life = correction.combat.life;
        if (correction.look) callbacks.onLookReset(correction.look);
      }
      if (this.initialized) this.prediction.reconcile(correction);
      if (correction.combat) callbacks.onCombat(correction.combat);
      if (correction.footsteps?.length)
        callbacks.onFootsteps(correction.footsteps);
    });
    room.onMessage('shot', (shot: ServerShot) => callbacks.onShot(shot));
    room.onMessage('kill', (kill: KillEvent) => callbacks.onKill(kill));
    room.onStateChange((state) => this.receive(state));
    if (room.state?.players) this.receive(room.state);
  }

  private receive(state: WireState): void {
    const { mapId } = state;
    if (this.leaving || mapId === undefined) return;
    if (!isMultiplayerMapId(mapId)) {
      this.fail(
        'This room uses a map unavailable in multiplayer. Create a new room.',
      );
      return;
    }
    const players: PublicPlayer[] = [];
    state.players.forEach((player) =>
      players.push({
        id: player.id,
        name: player.name,
        slot: player.slot,
        ready: player.ready,
        x: player.x,
        y: player.y,
        z: player.z,
        yaw: player.yaw,
        pitch: player.pitch,
        halfHeight: player.halfHeight,
        gaitPhase: player.gaitPhase,
        gaitAmount: player.gaitAmount,
        animationTime: player.animationTime,
        sprintBlend: player.sprintBlend,
        carryBlend: player.carryBlend,
        fireBlend: player.fireBlend,
        airBlend: player.airBlend,
        slideBlend: player.slideBlend,
        diveBlend: player.diveBlend,
        crouchBlend: player.crouchBlend,
        proneBlend: player.proneBlend,
        landingBlend: player.landingBlend,
        reloadBlend: player.reloadBlend,
        reloadProgress: player.reloadProgress,
        aimBlend: player.aimBlend,
        hitBlend: player.hitBlend,
        hitYaw: player.hitYaw,
        movement: player.movement,
        ack: player.ack,
        health: player.health,
        alive: player.alive,
        life: player.life,
        weapon: player.weapon,
        skin: player.skin,
        operator: isOperator(player.operator) ? player.operator : 'standard',
        protected: player.protected,
        team: player.team,
      }),
    );
    const self = players.find((player) => player.id === this.room.sessionId);
    if (!this.initialized && self) {
      this.callbacks.onArena(mapId);
      const fresh = new MovementController(this.movement.physics).capture();
      this.movement.restore({
        ...fresh,
        position: { x: self.x, y: self.y, z: self.z },
        halfHeight: movementConfig.capsuleHalfHeight,
        grounded: false,
      });
      this.initialized = true;
      this.callbacks.onLookReset({ yaw: self.yaw, pitch: self.pitch });
    }
    const phase =
      state.phase === 'playing'
        ? 'playing'
        : state.phase === 'countdown'
          ? 'countdown'
          : state.phase === 'results'
            ? 'results'
            : 'lobby';
    if (this.view?.phase === 'playing' && phase !== 'playing') {
      this.flushInput();
      this.prediction.suspend();
    }
    const scores: ScoreRow[] = [];
    state.scores.forEach((row) =>
      scores.push({
        id: row.id,
        name: row.name,
        team: row.team,
        kills: row.kills,
        deaths: row.deaths,
        connected: row.connected,
      }),
    );
    this.view = {
      mapId,
      code: this.room.roomId,
      selfId: this.room.sessionId,
      hostId: state.hostId,
      phase,
      tick: state.tick,
      players,
      playerLimit: state.playerLimit ?? networkConfig.maxPlayers,
      allowedWeapons: state.allowedWeapons
        ? Array.from(state.allowedWeapons)
        : [...weaponOrder],
      match: {
        mode: state.mode,
        scoreLimit: state.scoreLimit,
        durationSeconds: state.durationSeconds,
        remainingSeconds: state.remainingSeconds,
        round: state.round,
        countdownSeconds: state.countdownSeconds ?? 0,
        blueScore: state.blueScore,
        orangeScore: state.orangeScore,
        winnerId: state.winnerId,
        winnerName: state.winnerName,
        winningTeam: state.winningTeam,
        endReason: state.endReason,
        scores,
      },
    };
    this.remotes.push(this.view, performance.now());
    this.callbacks.onView(this.view);
  }

  step(
    input: MovementInput,
    pitch: number,
    weapon?: WeaponInput,
    groundSpeedScale = 1,
  ): void {
    if (!this.initialized || this.view?.phase !== 'playing' || this.leaving)
      return;
    try {
      this.outbox.push(
        this.prediction.step(input, pitch, weapon, groundSpeedScale),
      );
      if (this.outbox.length >= networkConfig.maxBatch) this.flushInput();
    } catch (error) {
      this.fail(error instanceof Error ? error.message : 'Room input failed.');
    }
  }

  /** Send all inputs generated in this frame, including a single ordinary tick. */
  flushInput(): void {
    if (this.leaving || !this.outbox.length) return;
    try {
      this.room.send('input', this.outbox);
    } catch (error) {
      this.fail(error instanceof Error ? error.message : 'Room input failed.');
    } finally {
      this.outbox.length = 0;
    }
  }

  setReady(ready: boolean): void {
    this.room.send('ready', ready);
  }

  setLoadoutProfile(profile: LoadoutProfile): void {
    if (!this.leaving) this.room.send('loadout-profile', profile);
  }
  start(): void {
    this.room.send('start');
  }
  selectLoadout(selection: LoadoutSelection): void {
    if (!this.leaving) this.room.send('loadout', selection);
  }
  configure(settings: MatchSettings): void {
    this.room.send('configure', settings);
  }
  setTeam(team: Team): void {
    this.room.send('team', team);
  }
  returnToLobby(): void {
    this.room.send('lobby');
  }
  private fail(message: string): void {
    if (this.leaving) return;
    this.callbacks.onError(message);
    this.leave();
  }
  leave(): void {
    if (this.leaving) return;
    this.leaving = true;
    void this.room.leave();
  }
}
