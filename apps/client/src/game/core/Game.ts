import { FirstPersonCamera } from '../camera/FirstPersonCamera';
import type { MovementState } from '@breakpoint/shared';
import { InputController } from '../input/InputController';
import { TrainingArena } from '../maps/TrainingArena';
import { arenaBoxes, spawn } from '../maps/arenaLayout';
import { MovementController } from '../movement/MovementController';
import { initializePhysics, PhysicsWorld } from '../physics/PhysicsWorld';
import { GameRenderer } from '../rendering/GameRenderer';
import {
  defaultGraphics,
  type GraphicsPreset,
  type GraphicsSettings,
} from '../rendering/graphicsConfig';
import { FixedStepClock } from './FixedStepClock';
import {
  PerformanceMonitor,
  type PerformanceStats,
} from './PerformanceMonitor';
import { PracticeCombat, type CombatSnapshot } from '../combat/PracticeCombat';
import { WeaponViewmodel } from '../weapons/WeaponViewmodel';
import type { RoomView } from '@breakpoint/shared/network';
import type { NetworkSession } from '../networking/NetworkSession';
import { RemotePlayers } from '../networking/RemotePlayers';
import { NetworkCombat } from '../combat/NetworkCombat';
import type { MatchSettings, Team } from '@breakpoint/shared/match';
import {
  defaultUserSettings,
  type UserSettings,
} from '../settings/userSettings';
import { AudioEngine, spatialAudio } from '../audio/AudioEngine';

export interface GameTelemetry extends PerformanceStats {
  x: number;
  y: number;
  z: number;
  speed: number;
  grounded: boolean;
  movementState: MovementState;
  halfHeight: number;
  wallJumps: number;
  renderWidth: number;
  renderHeight: number;
  outputWidth: number;
  outputHeight: number;
  graphicsPreset: GraphicsPreset;
  adaptiveResolution: boolean;
  worldDrawCalls: number;
  combat: CombatSnapshot;
  network: { peers: number; ack: number; tick: number } | null;
}

interface GameCallbacks {
  onLockChange: (locked: boolean) => void;
  onTelemetry: (stats: GameTelemetry) => void;
  onError: (message: string) => void;
  onCombat: (snapshot: CombatSnapshot) => void;
  onReticle: (gap: number, ads: number) => void;
  onRoom: (view: RoomView | null) => void;
  onScoreboard: (open: boolean) => void;
}

/** Composes systems and owns their lifetimes; game rules remain in the systems. */
export class Game {
  private readonly rendering: GameRenderer;
  private readonly arena: TrainingArena;
  private readonly physics: PhysicsWorld;
  private readonly movement: MovementController;
  private readonly input: InputController;
  private readonly camera = new FirstPersonCamera();
  private readonly combat: PracticeCombat;
  private readonly networkCombat: NetworkCombat;
  private readonly viewmodel: WeaponViewmodel;
  private readonly clock = new FixedStepClock();
  private readonly monitor = new PerformanceMonitor();
  private readonly resizeObserver: ResizeObserver;
  private lastTime: number | null = null;
  private disposed = false;
  private graphicsSettings: GraphicsSettings;
  private session: NetworkSession | undefined;
  private networkGeneration = 0;
  private readonly remotes: RemotePlayers;
  private round = 0;
  private userSettings: UserSettings;
  private readonly audio = new AudioEngine();

  static async create(
    host: HTMLElement,
    callbacks: GameCallbacks,
    settings: GraphicsSettings = defaultGraphics,
    preferences: UserSettings = defaultUserSettings(),
  ): Promise<Game> {
    await initializePhysics();
    return new Game(host, callbacks, settings, preferences);
  }

  private constructor(
    host: HTMLElement,
    private readonly callbacks: GameCallbacks,
    settings: GraphicsSettings,
    preferences: UserSettings,
  ) {
    this.graphicsSettings = { ...settings };
    this.userSettings = preferences;
    this.audio.configure(preferences);
    this.rendering = new GameRenderer(host, settings);
    this.arena = new TrainingArena();
    this.remotes = new RemotePlayers(this.arena.scene);
    this.physics = new PhysicsWorld(arenaBoxes, spawn);
    this.movement = new MovementController(this.physics);
    this.combat = new PracticeCombat(this.physics, this.arena.scene, () =>
      this.publishCombat(),
    );
    this.networkCombat = new NetworkCombat(
      this.arena.scene,
      () => {
        if (this.session) this.publishCombat();
      },
      () => this.input.clear(),
    );
    this.viewmodel = new WeaponViewmodel();
    this.input = new InputController(
      this.rendering.renderer.domElement,
      (locked) => {
        this.resetTiming();
        callbacks.onLockChange(locked);
      },
      callbacks.onError,
      callbacks.onScoreboard,
    );
    this.input.configure(preferences);
    this.resizeObserver = new ResizeObserver(() => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      this.rendering.resize(width, height);
      this.camera.resize(width, height);
      this.viewmodel.resize(width, height);
    });
    this.resizeObserver.observe(host);
    this.camera.update(this.movement, this.input, 1);
    this.rendering.renderer.domElement.addEventListener(
      'webglcontextlost',
      this.onContextLost,
    );
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.rendering.renderer.setAnimationLoop(this.frame);
    this.publishCombat();
  }

  enter(): void {
    if (this.session && this.session.view?.phase !== 'playing') return;
    this.input.requestLock();
    void this.audio.unlock().then((ready) => {
      if (ready) this.audio.cue('enter');
    });
  }

  unlockAudio(): void {
    void this.audio.unlock();
  }
  uiClick(): void {
    void this.audio.uiClick();
  }
  previewAudio(): Promise<boolean> {
    return this.audio.preview();
  }
  setUserSettings(settings: UserSettings): void {
    this.userSettings = settings;
    this.input.configure(settings);
    this.audio.configure(settings);
  }
  cancelRoomConnection(): void {
    if (!this.session) ++this.networkGeneration;
  }
  private get displayedFov(): number {
    const weapon = (this.session ? this.networkCombat : this.combat).weapons;
    return (
      this.userSettings.fov +
      (weapon.config.adsFov - this.userSettings.fov) * weapon.ads
    );
  }
  private combatSnapshot(): CombatSnapshot {
    return {
      ...(this.session ? this.networkCombat : this.combat).snapshot(),
      fov: this.displayedFov,
    };
  }
  private publishCombat(): void {
    const snapshot = this.combatSnapshot();
    this.audio.feedback(snapshot);
    this.callbacks.onCombat(snapshot);
  }

  async connectRoom(
    mode: 'create' | 'join',
    name: string,
    code: string,
    settings?: MatchSettings,
  ): Promise<void> {
    if (this.session) return;
    const generation = ++this.networkGeneration;
    const { NetworkSession } = await import('../networking/NetworkSession');
    if (this.disposed || generation !== this.networkGeneration) return;
    const session = await NetworkSession.connect(
      mode,
      name,
      code,
      this.movement,
      {
        isActive: () => !this.disposed && generation === this.networkGeneration,
        onView: (view) => {
          if (!this.disposed && generation === this.networkGeneration) {
            if (view && view.match.round !== this.round) {
              this.round = view.match.round;
              this.networkCombat.reset();
            }
            if (view?.phase !== 'playing') {
              this.input.clear();
              this.movement.stop();
              if (
                document.pointerLockElement ===
                this.rendering.renderer.domElement
              )
                document.exitPointerLock();
            }
            this.callbacks.onRoom(view);
          }
        },
        onLookReset: (look) => {
          if (!this.disposed && generation === this.networkGeneration) {
            this.input.movement.yaw = look.yaw;
            this.input.pitch = look.pitch;
          }
        },
        onError: this.callbacks.onError,
        onCombat: (state) => {
          if (!this.disposed && generation === this.networkGeneration)
            this.networkCombat.receive(state);
        },
        onShot: (shot) => {
          if (!this.disposed && generation === this.networkGeneration) {
            this.networkCombat.shot(shot);
            if (shot.shooter !== this.session?.view?.selfId) {
              const spatial = spatialAudio(
                shot.origin,
                this.physics.position,
                this.input.movement.yaw,
              );
              this.audio.shot(shot.weapon, spatial.gain, spatial.pan);
            }
          }
        },
        onKill: (kill) => {
          if (!this.disposed && generation === this.networkGeneration)
            this.networkCombat.kill(kill);
        },
        onLeave: () => {
          if (!this.disposed && generation === this.networkGeneration)
            this.leaveRoom();
        },
      },
      settings,
    );
    if (this.disposed || generation !== this.networkGeneration) {
      session.leave();
      return;
    }
    this.session = session;
    this.combat.setOnline(true);
    this.input.clear();
    this.resetTiming();
  }

  setRoomReady(ready: boolean): void {
    this.session?.setReady(ready);
  }
  startRoom(): void {
    this.session?.start();
  }
  configureRoom(settings: MatchSettings): void {
    this.session?.configure(settings);
  }
  setTeam(team: Team): void {
    this.session?.setTeam(team);
  }
  returnToLobby(): void {
    this.session?.returnToLobby();
  }

  leaveRoom(): void {
    ++this.networkGeneration;
    this.session?.leave();
    this.session = undefined;
    this.round = 0;
    this.networkCombat.reset();
    this.combat.setOnline(false);
    this.audio.resetFeedback(this.combat.snapshot());
    const fresh = new MovementController(this.physics).capture();
    this.movement.restore({
      ...fresh,
      position: { ...spawn },
      halfHeight: 0.55,
      grounded: false,
    });
    this.input.clear();
    if (document.pointerLockElement) document.exitPointerLock();
    this.resetTiming();
    this.callbacks.onRoom(null);
  }

  setGraphicsSettings(settings: GraphicsSettings): void {
    this.graphicsSettings = { ...settings };
    this.rendering.configure(settings);
  }

  private readonly simulate = (dt: number): void => {
    if (this.session) {
      if (this.session.view?.phase !== 'playing') {
        this.input.clear();
        return;
      }
      if (!this.networkCombat.owner?.alive) this.input.clearGameplay();
      this.session.step(this.input.movement, this.input.pitch, {
        ...this.input.weapon,
        // Desired selection survives an old input being discarded during overload recovery.
        switchTo:
          this.input.weapon.switchTo ?? this.networkCombat.weapons.selected,
      });
      this.networkCombat.step(dt, this.input.weapon, this.movement);
    } else {
      this.movement.step(this.input.movement, dt);
      if (this.input.locked)
        this.combat.step(
          dt,
          this.input.weapon,
          this.movement,
          this.input.movement.yaw,
          this.input.pitch,
        );
    }
    this.input.consumeActions();
    const active = this.session ? this.networkCombat : this.combat;
    this.audio.observe(
      dt,
      active.weapons,
      this.movement,
      this.input.locked && (!this.session || !!this.networkCombat.owner?.alive),
    );
  };

  private readonly frame = (time: number): void => {
    if (this.disposed || document.hidden) return;
    const start = performance.now();
    const delta = this.lastTime === null ? 0 : (time - this.lastTime) / 1000;
    this.lastTime = time;
    const activeCombat = this.session ? this.networkCombat : this.combat;
    const weapons = activeCombat.weapons;
    const armed =
      !this.session ||
      (this.session.view?.phase === 'playing' &&
        !!this.networkCombat.owner?.alive);
    if (this.input.locked || this.session)
      weapons.updateAds(delta, armed && this.input.weapon.aim);
    this.input.lookScale =
      Math.tan((this.displayedFov * Math.PI) / 360) /
      Math.tan((this.userSettings.fov * Math.PI) / 360);
    const alpha =
      this.input.locked || this.session?.view?.phase === 'playing'
        ? this.clock.advance(delta, this.simulate)
        : 1;
    this.camera.update(
      this.movement,
      this.input,
      alpha,
      weapons.recoil.pitch,
      weapons.recoil.yaw,
      this.displayedFov,
    );
    if (this.session) {
      this.session.prediction.smooth(delta);
      const offset = this.session.prediction.offset;
      this.camera.camera.position.x += offset.x;
      this.camera.camera.position.y += offset.y;
      this.camera.camera.position.z += offset.z;
    }
    this.remotes.update(this.session?.remotes, performance.now());
    this.viewmodel.update(
      weapons,
      Math.hypot(this.movement.velocity.x, this.movement.velocity.z),
      delta,
      this.input.locked && armed,
      this.userSettings.reducedMotion ? 0.2 : 1,
      this.movement.state,
    );
    if (this.input.locked)
      this.callbacks.onReticle(
        Math.max(
          5,
          Math.min(
            50,
            (Math.tan(weapons.spread) *
              this.rendering.renderer.domElement.height) /
              (2 * Math.tan((this.displayedFov * Math.PI) / 360)),
          ),
        ),
        weapons.ads,
      );
    this.rendering.render(
      this.arena.scene,
      this.camera.camera,
      delta * 1000,
      this.input.locked && armed ? this.viewmodel : null,
    );
    this.monitor.record(delta * 1000, performance.now() - start);
    const info = this.rendering.renderer.info.render;
    const stats = this.monitor.sample(time, info.calls, info.triangles);
    if (stats) {
      this.callbacks.onTelemetry({
        ...stats,
        ...this.physics.position,
        speed: this.input.locked
          ? Math.hypot(this.movement.velocity.x, this.movement.velocity.z)
          : 0,
        grounded: this.physics.grounded,
        movementState: this.movement.state,
        halfHeight: this.physics.halfHeight,
        wallJumps: this.movement.wallJumps,
        renderWidth: this.rendering.renderWidth,
        renderHeight: this.rendering.renderHeight,
        outputWidth: this.rendering.renderer.domElement.width,
        outputHeight: this.rendering.renderer.domElement.height,
        graphicsPreset: this.rendering.preset,
        adaptiveResolution: this.graphicsSettings.adaptive,
        worldDrawCalls: this.rendering.worldDrawCalls,
        combat: this.combatSnapshot(),
        network: this.session?.view
          ? {
              peers: this.remotes.playerCount,
              ack:
                this.session.view.players.find(
                  (player) => player.id === this.session!.view!.selfId,
                )?.ack ?? 0,
              tick: this.session.view.tick,
            }
          : null,
      });
    }
  };

  private resetTiming(): void {
    this.audio.resetMotion();
    this.lastTime = null;
    this.clock.reset();
    this.monitor.reset();
    if (!this.session) this.movement.synchronize();
    this.rendering.resetTiming();
    this.combat.weapons.clearTriggerBuffer();
    this.networkCombat.weapons.clearTriggerBuffer();
  }

  private readonly onVisibilityChange = (): void => {
    this.audio.setActive(!document.hidden);
    this.input.clear();
    this.resetTiming();
    if (
      document.hidden &&
      document.pointerLockElement === this.rendering.renderer.domElement
    ) {
      document.exitPointerLock();
    }
  };

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    this.rendering.renderer.setAnimationLoop(null);
    this.input.clear();
    if (document.pointerLockElement === this.rendering.renderer.domElement)
      document.exitPointerLock();
    this.callbacks.onError(
      'The graphics context was lost. Reload this page to restart training.',
    );
  };

  dispose(): void {
    this.disposed = true;
    ++this.networkGeneration;
    this.session?.leave();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.resizeObserver.disconnect();
    this.rendering.renderer.domElement.removeEventListener(
      'webglcontextlost',
      this.onContextLost,
    );
    this.input.dispose();
    this.combat.dispose();
    this.networkCombat.dispose();
    this.viewmodel.dispose();
    this.remotes.dispose();
    this.arena.dispose();
    this.physics.dispose();
    this.rendering.dispose();
    this.audio.dispose();
  }
}
