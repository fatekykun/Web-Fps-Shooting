import { Scene } from 'three';
import { FirstPersonCamera } from '../camera/FirstPersonCamera';
import type { MovementState, Vector3Like, WeaponId } from '@breakpoint/shared';
import { standingAnchor } from '@breakpoint/shared/avatar';
import {
  eliminationEffectWeapons,
  type EliminationEffect,
} from '@breakpoint/shared/combat';
import { InputController } from '../input/InputController';
import { isTouchAimOpponent, TouchAimAssist } from '../input/TouchAimAssist';
import { readDevice, requestLandscape } from '../input/deviceCapabilities';
import { TrainingArena } from '../maps/TrainingArena';
import { ShipmentArena } from '../maps/ShipmentArena';
import { KillhouseArena } from '../maps/KillhouseArena';
import { arenas, spawn, type ArenaId } from '../maps/arenaLayout';
import { MovementController } from '../movement/MovementController';
import { initializePhysics, PhysicsWorld } from '../physics/PhysicsWorld';
import { GameRenderer } from '../rendering/GameRenderer';
import type { AntiAliasingState } from '../rendering/antiAliasing';
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
import { weaponAsset } from '../weapons/WeaponAssets';
import { isMoltenLavaRifle, normalizeRifleSkin } from '../weapons/RifleSkins';
import { normalizeSniperSkin } from '../weapons/SniperSkins';
import { normalizeShotgunSkin } from '../weapons/ShotgunSkins';
import { normalizeSmgSkin } from '../weapons/SmgSkins';
import {
  isLoadoutSlot,
  type LoadoutSlot,
  type WeaponSkin,
} from '@breakpoint/shared/weapons/loadouts';
import {
  sniperZoom,
  sniperScopeBlend,
  SniperSlideAim,
} from '../weapons/SniperScope';
import type { OpticView } from '../rendering/OpticScope';
import {
  networkConfig,
  type LoadoutSelection,
  type RoomView,
} from '@breakpoint/shared/network';
import { ShotTrails, type MuzzleResolver } from '../effects/ShotTrails';
import { MoltenLavaEliminations } from '../effects/MoltenLavaEliminations';
import {
  AnimatedEliminations,
  blazeElimination,
  lotusElimination,
  neonElimination,
} from '../effects/AnimatedEliminations';
import { SoulRequiem } from '../effects/SoulRequiem';
import type { NetworkSession } from '../networking/NetworkSession';
import { RemotePlayers } from '../networking/RemotePlayers';
import { NetworkCombat } from '../combat/NetworkCombat';
import type {
  MatchSettings,
  PrivateRoomSettings,
  Team,
} from '@breakpoint/shared/match';
import { movementConfig, weaponOrder } from '@breakpoint/shared';
import { isMatchActive } from '@breakpoint/shared/match';
import {
  defaultUserSettings,
  type UserSettings,
} from '../settings/userSettings';
import { AudioEngine, spatialAudio } from '../audio/AudioEngine';
import { projectConeRadius, ShotgunReticle } from '../weapons/ShotgunReticle';
import type { ShotgunRange } from '../weapons/ShotgunRange';

const arenaRenderers = {
  depot: TrainingArena,
  shipment: ShipmentArena,
  killhouse: KillhouseArena,
} satisfies Record<
  ArenaId,
  typeof TrainingArena | typeof ShipmentArena | typeof KillhouseArena
>;

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
  antiAliasing: AntiAliasingState;
  graphics: GraphicsSettings;
  shadowMapSize: number;
  textureTileSize: number;
  cameraFar: number;
  combat: CombatSnapshot;
  network: { peers: number; ack: number; tick: number } | null;
  trails: {
    active: number;
    emitted: number;
    opacity: number;
    thickness: number;
    length: number;
  };
}

interface GameCallbacks {
  onLockChange: (locked: boolean) => void;
  onTelemetry: (stats: GameTelemetry) => void;
  onMinimap: (map: ArenaId, x: number, z: number, yaw: number) => void;
  onError: (message: string) => void;
  onCombat: (snapshot: CombatSnapshot) => void;
  onReticle: (
    gap: number,
    ads: number,
    scope: number,
    opticReticle: boolean,
    scopeDiameter: number,
    shotgunRadius?: number,
  ) => void;
  onRoom: (view: RoomView | null) => void;
  onScoreboard: (open: boolean) => void;
}

/** Composes systems and owns their lifetimes; game rules remain in the systems. */
export class Game {
  private readonly opticView: OpticView = {
    baseFov: 85,
    blend: 0,
    diameter: 86,
  };
  private readonly rendering: GameRenderer;
  private readonly scene = new Scene();
  private readonly lavaEliminations = new MoltenLavaEliminations(this.scene);
  private readonly groundEliminations = {
    'lotus-lava': new AnimatedEliminations(this.scene, lotusElimination),
    'glorious-blaze': new AnimatedEliminations(this.scene, blazeElimination),
    'neon-blade': new AnimatedEliminations(this.scene, neonElimination),
  } satisfies Record<
    Exclude<EliminationEffect, 'soul-requiem'>,
    AnimatedEliminations
  >;
  private readonly groundAnimations = Object.values(this.groundEliminations);
  private readonly soulRequiem = new SoulRequiem(
    this.scene,
    (x, z, footY) =>
      this.physics.castBullet(
        { x, y: footY + 0.22, z },
        { x: 0, y: -1, z: 0 },
        3,
        true,
      )?.point.y,
  );
  private arena: InstanceType<(typeof arenaRenderers)[ArenaId]>;
  private arenaId: ArenaId = 'depot';
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
  private readonly touchAimAssist = new TouchAimAssist(
    (origin, direction, range) =>
      !!this.physics.castBullet(origin, direction, range, true),
  );
  private readonly touchAimOrigin: Vector3Like = { x: 0, y: 0, z: 0 };
  private readonly touchAimTargets: Vector3Like[] = [];
  private readonly trails: ShotTrails;
  private round = 0;
  private userSettings: UserSettings;
  private trainingSlot: LoadoutSlot = 0;
  private equippedSkin: WeaponSkin = 'standard';
  private showcaseOpen = false;
  private readonly audio = new AudioEngine();
  private readonly shotgunReticle = new ShotgunReticle();
  private readonly sniperSlideAim = new SniperSlideAim();
  private reticleGap = 5;
  private viewportHeight = 1;
  private shotgunRange?: ShotgunRange;

  static async create(
    host: HTMLElement,
    callbacks: GameCallbacks,
    settings: GraphicsSettings = defaultGraphics,
    preferences: UserSettings = defaultUserSettings(),
  ): Promise<Game> {
    await initializePhysics();
    const range =
      import.meta.env.DEV &&
      new URLSearchParams(location.search).has('shotgun-debug')
        ? await import('../weapons/ShotgunRange')
        : undefined;
    const game = new Game(host, callbacks, settings, preferences);
    if (range) {
      const distance = range.shotgunDebugDistance(location.search);
      if (distance !== null) {
        game.shotgunRange = new range.ShotgunRange(game.scene, host, distance);
        game.setShotgunRangeActive(true);
      }
    }
    return game;
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
    this.soulRequiem.configure(preferences.eliminationQuality);
    this.rendering = new GameRenderer(host, settings);
    this.arena = new TrainingArena(this.scene);
    this.remotes = new RemotePlayers(this.scene);
    this.trails = new ShotTrails(this.scene);
    this.physics = new PhysicsWorld(arenas.depot.colliders, spawn);
    this.movement = new MovementController(this.physics);
    this.combat = new PracticeCombat(
      this.physics,
      this.scene,
      () => this.publishCombat(),
      (shot, origin, end, yaw, pitch) => {
        this.trails.spawn(shot.config.id, origin, end);
        this.shotgunRange?.record(shot, origin, end, yaw, pitch);
      },
      (weapon, position) => {
        if (isMoltenLavaRifle(weapon, normalizeRifleSkin(this.equippedSkin)))
          this.lavaEliminations.spawn(
            position,
            this.userSettings.reducedMotion,
          );
        else if (weapon === 'rifle' && this.soulRequiemEquipped)
          this.soulRequiem.spawn(
            position,
            this.userSettings.eliminationQuality,
            this.userSettings.reducedMotion,
            this.audio.playMythicElimination('soul-requiem'),
            (write) => this.combat.dummy.captureEliminationPose(write),
          );
        else {
          const effect = this.groundEffectFor(weapon);
          if (!effect) return;
          const clock = this.audio.playMythicElimination(effect);
          if (!clock) this.audio.cue('kill');
          this.spawnGroundElimination(effect, position, clock);
        }
      },
    );
    this.networkCombat = new NetworkCombat(
      this.scene,
      () => {
        if (this.session) this.publishCombat();
      },
      () => {
        this.input.clear();
        this.audio.resetMotion();
        this.viewmodel.resetRecoil();
      },
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
      () => (this.session ? this.networkCombat : this.combat).weapons,
      () => this.session?.view?.allowedWeapons ?? weaponOrder,
      this.touchAimScale,
      () => {
        if (!this.session)
          this.input.weapon.switchTo =
            weaponOrder[(this.trainingSlot + 1) % 4]!;
      },
    );
    this.input.configure(preferences);
    this.equipTraining(preferences.loadouts.defaultSlot);
    this.setGraphicsSettings(settings);
    this.viewportHeight = Math.max(1, host.clientHeight);
    this.resizeObserver = new ResizeObserver(() => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      this.viewportHeight = height;
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

  enter(automatic = false): void {
    const device = readDevice();
    if (device.handheld && !device.landscape) return;
    if (this.session && !isMatchActive(this.session.view?.phase)) return;
    if (!automatic && device.handheld) void requestLandscape(true);
    this.input.requestLock(automatic);
    void this.audio.unlock().then((ready) => {
      if (ready && this.session?.view?.phase !== 'countdown')
        this.audio.cue('enter');
    });
  }

  unlockAudio(): void {
    void this.audio.unlock();
  }
  useTouchControls(enabled: boolean): void {
    this.input.useTouchControls(enabled);
  }
  attachTouchControls(root: HTMLElement): () => void {
    return this.input.attachTouchControls(root);
  }
  pause(): void {
    this.input.release();
  }
  uiClick(): void {
    void this.audio.uiClick();
  }
  previewAudio(): Promise<boolean> {
    return this.audio.preview();
  }
  setUserSettings(settings: UserSettings): void {
    const before = this.userSettings.loadouts;
    this.userSettings = settings;
    this.input.configure(settings);
    this.audio.configure(settings);
    this.soulRequiem.configure(settings.eliminationQuality);
    if (this.session) {
      if (JSON.stringify(before) !== JSON.stringify(settings.loadouts))
        this.session.setLoadoutProfile(settings.loadouts);
    } else
      this.equipTraining(
        before.defaultSlot !== settings.loadouts.defaultSlot
          ? settings.loadouts.defaultSlot
          : this.trainingSlot,
      );
  }

  setShowcaseOpen(open: boolean): void {
    if (this.showcaseOpen === open) return;
    this.showcaseOpen = open;
    this.resetTiming();
  }

  private applySkin(weapon: WeaponId, skin: WeaponSkin): void {
    this.equippedSkin = skin;
    if (weapon === 'rifle')
      this.viewmodel.setRifleSkin(normalizeRifleSkin(skin));
    if (weapon === 'smg') this.viewmodel.setSmgSkin(normalizeSmgSkin(skin));
    if (weapon === 'shotgun')
      this.viewmodel.setShotgunSkin(normalizeShotgunSkin(skin));
    if (weapon === 'sniper')
      this.viewmodel.setSniperSkin(normalizeSniperSkin(skin));
    if (
      skin === 'glorious-blaze' ||
      skin === 'neon-blade' ||
      skin === 'lotus-lava'
    )
      this.groundEliminations[skin].prepare();
  }

  private equipTraining(slot: LoadoutSlot): void {
    const { weapon, skin } = this.userSettings.loadouts.slots[slot];
    this.trainingSlot = slot;
    this.applySkin(weapon, skin);
    this.combat.weapons.switchWeapon(weapon);
  }

  private get soulRequiemEquipped(): boolean {
    return (
      this.equippedSkin === 'memento-mori' &&
      this.viewmodel.rifleSkinStatus === 'ready'
    );
  }
  private get lotusLavaEquipped(): boolean {
    return (
      this.equippedSkin === 'lotus-lava' &&
      this.viewmodel.sniperSkinStatus === 'ready'
    );
  }

  private get gloriousBlazeEquipped(): boolean {
    return (
      this.equippedSkin === 'glorious-blaze' &&
      this.viewmodel.shotgunSkinStatus === 'ready'
    );
  }

  private get neonBladeEquipped(): boolean {
    return (
      this.equippedSkin === 'neon-blade' &&
      this.viewmodel.smgSkinStatus === 'ready'
    );
  }

  private groundEffectFor(weapon: WeaponId) {
    if (weapon === 'sniper' && this.lotusLavaEquipped) return 'lotus-lava';
    if (weapon === 'shotgun' && this.gloriousBlazeEquipped)
      return 'glorious-blaze';
    if (weapon === 'smg' && this.neonBladeEquipped) return 'neon-blade';
    return undefined;
  }

  private spawnGroundElimination(
    effect: keyof Game['groundEliminations'],
    position: Vector3Like,
    clock?: () => number,
  ): void {
    const ground = this.physics.castBullet(
      { x: position.x, y: position.y + 0.22, z: position.z },
      { x: 0, y: -1, z: 0 },
      6,
      true,
    );
    this.groundEliminations[effect].spawn(
      { x: position.x, y: ground?.point.y ?? position.y, z: position.z },
      this.userSettings.eliminationQuality,
      this.userSettings.reducedMotion,
      clock,
    );
  }
  cancelRoomConnection(): void {
    if (!this.session) ++this.networkGeneration;
  }
  private combatSnapshot(): CombatSnapshot {
    const combat = this.session ? this.networkCombat : this.combat;
    return {
      ...combat.snapshot(),
      fov: this.camera.camera.fov,
      rifleSkin:
        combat.weapons.selected === 'rifle'
          ? normalizeRifleSkin(this.equippedSkin)
          : undefined,
      rifleSkinStatus:
        combat.weapons.selected === 'rifle'
          ? this.viewmodel.rifleSkinStatus
          : undefined,
      sniperSkin:
        combat.weapons.selected === 'sniper'
          ? normalizeSniperSkin(this.equippedSkin)
          : undefined,
      sniperSkinStatus:
        combat.weapons.selected === 'sniper'
          ? this.viewmodel.sniperSkinStatus
          : undefined,
      shotgunSkin:
        combat.weapons.selected === 'shotgun'
          ? normalizeShotgunSkin(this.equippedSkin)
          : undefined,
      shotgunSkinStatus:
        combat.weapons.selected === 'shotgun'
          ? this.viewmodel.shotgunSkinStatus
          : undefined,
      smgSkin:
        combat.weapons.selected === 'smg'
          ? normalizeSmgSkin(this.equippedSkin)
          : undefined,
      smgSkinStatus:
        combat.weapons.selected === 'smg'
          ? this.viewmodel.smgSkinStatus
          : undefined,
      inspecting: this.viewmodel.inspecting,
      scopeMagnification: combat.weapons.scopeMagnification(
        this.userSettings.syncAdsFov,
      ),
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
    settings?: PrivateRoomSettings,
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
        onArena: (id) => {
          if (!this.disposed && generation === this.networkGeneration) {
            this.setShotgunRangeActive(false);
            this.switchArena(id);
          }
        },
        onView: (view) => {
          if (!this.disposed && generation === this.networkGeneration) {
            if (view && view.match.round !== this.round) {
              this.round = view.match.round;
              this.networkCombat.reset();
              this.clearEliminationEffects();
            }
            this.networkCombat.setAllowedWeapons(
              view?.allowedWeapons ?? weaponOrder,
            );
            this.audio.observeMatch(view);
            if (!isMatchActive(view?.phase)) {
              this.input.release();
              this.movement.stop();
            }
            this.callbacks.onRoom(view);
          }
        },
        onLookReset: (look) => {
          if (!this.disposed && generation === this.networkGeneration) {
            this.input.setLook(look.yaw, look.pitch);
          }
        },
        onError: this.callbacks.onError,
        onCombat: (state) => {
          if (!this.disposed && generation === this.networkGeneration) {
            const previous = this.networkCombat.owner;
            if (previous && state.life < previous.life) return;
            const skin = state.skin ?? 'standard';
            if (
              skin !== this.equippedSkin ||
              state.selected !== previous?.selected
            )
              this.applySkin(state.selected, skin);
            this.networkCombat.receive(state);
          }
        },
        onShot: (shot) => {
          if (!this.disposed && generation === this.networkGeneration) {
            if (!this.networkCombat.shot(shot)) return;
            const remote = shot.shooter !== this.session?.view?.selfId;
            for (const trace of shot.traces)
              this.trails.spawn(
                shot.weapon,
                shot.origin,
                trace.end,
                remote ? shot.shooter : undefined,
                remote
                  ? networkConfig.interpolationDelay / networkConfig.tickRate
                  : 0,
              );
            if (remote) {
              const spatial = spatialAudio(
                shot.origin,
                this.physics.position,
                this.input.movement.yaw,
              );
              this.audio.shot(
                shot.weapon,
                spatial.gain,
                spatial.pan,
                shot.skin ??
                  shot.smgSkin ??
                  shot.shotgunSkin ??
                  shot.sniperSkin,
              );
            }
          }
        },
        onFootsteps: (footsteps) => {
          const view = this.session?.view;
          if (
            this.disposed ||
            generation !== this.networkGeneration ||
            !this.input.locked ||
            view?.phase !== 'playing' ||
            !this.networkCombat.owner?.alive
          )
            return;
          const team = view.players.find(({ id }) => id === view.selfId)?.team;
          for (const step of footsteps) {
            const peer = view.players.find(({ id }) => id === step.player);
            if (
              !peer?.alive ||
              peer.id === view.selfId ||
              peer.life !== step.life
            )
              continue;
            this.audio.remoteFootstep(
              step,
              this.camera.camera.position,
              this.input.movement.yaw,
              team !== 'none' && team === peer.team,
              this.footstepOccluded,
            );
          }
        },
        onKill: (kill) => {
          if (!this.disposed && generation === this.networkGeneration) {
            if (!this.networkCombat.kill(kill)) return;
            const view = this.session?.view;
            if (!view) return;
            const mine = kill.killerId === view.selfId;
            const effect = kill.effect;
            if (effect && eliminationEffectWeapons[effect] === kill.weapon) {
              const victim = view.players.find(
                ({ id }) => id === kill.victimId,
              );
              const position =
                kill.position ??
                (victim && {
                  x: victim.x,
                  y: victim.y - standingAnchor,
                  z: victim.z,
                });
              if (position) {
                const spatial = spatialAudio(
                  position,
                  this.camera.camera.position,
                  this.input.movement.yaw,
                );
                const clock = mine
                  ? this.audio.playMythicElimination(effect)
                  : this.audio.playMythicElimination(
                      effect,
                      spatial.gain,
                      spatial.pan,
                    );
                if (effect !== 'soul-requiem') {
                  if (!clock && mine) this.audio.cue('kill');
                  this.spawnGroundElimination(effect, position, clock);
                  return;
                }
                this.soulRequiem.spawn(
                  position,
                  this.userSettings.eliminationQuality,
                  this.userSettings.reducedMotion,
                  clock,
                  (write) => {
                    if (victim && victim.id !== view.selfId)
                      this.remotes.captureEliminationPose(
                        victim,
                        position,
                        write,
                      );
                  },
                  victim?.yaw,
                );
              } else if (mine) this.audio.playMythicElimination(effect);
              return;
            }
            const molten = isMoltenLavaRifle(
              kill.weapon,
              normalizeRifleSkin(
                kill.skin ?? (mine ? this.equippedSkin : 'standard'),
              ),
            );
            if (mine) this.audio.cue(molten ? 'molten-lava-kill' : 'kill');
            if (molten) {
              let position = kill.position;
              if (!position) {
                const victim = view.players.find(
                  ({ id }) => id === kill.victimId,
                );
                if (victim)
                  position = {
                    x: victim.x,
                    y: victim.y - standingAnchor,
                    z: victim.z,
                  };
              }
              if (position) {
                if (!mine) {
                  const spatial = spatialAudio(
                    position,
                    this.camera.camera.position,
                    this.input.movement.yaw,
                  );
                  this.audio.playRemoteMoltenElimination(
                    spatial.gain,
                    spatial.pan,
                  );
                }
                this.lavaEliminations.spawn(
                  position,
                  this.userSettings.reducedMotion,
                );
              }
            }
          }
        },
        onLeave: () => {
          if (!this.disposed && generation === this.networkGeneration)
            this.leaveRoom();
        },
      },
      this.userSettings.loadouts,
      settings,
    );
    if (this.disposed || generation !== this.networkGeneration) {
      session.leave();
      return;
    }
    this.session = session;
    for (const animation of this.groundAnimations) animation.prepare();
    this.clearEliminationEffects();
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
  selectLoadout(selection: LoadoutSelection): void {
    this.session?.selectLoadout(selection);
    const skin = this.userSettings.loadouts.slots[selection.slot].skin;
    void weaponAsset(skin)?.catch(() => {
      // WeaponViewmodel retains its standard fallback if the model is unavailable.
    });
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
    this.clearEliminationEffects();
    ++this.networkGeneration;
    this.session?.leave();
    this.session = undefined;
    this.round = 0;
    if (this.arenaId !== 'depot') {
      this.switchArena('depot');
      this.input.movement.yaw = this.input.pitch = 0;
    }
    this.setShotgunRangeActive(true);
    this.networkCombat.reset();
    this.combat.setOnline(false);
    this.equipTraining(this.userSettings.loadouts.defaultSlot);
    this.audio.resetFeedback(this.combat.snapshot());
    this.audio.observeMatch(null);
    const fresh = new MovementController(this.physics).capture();
    this.movement.restore({
      ...fresh,
      position: { ...spawn },
      halfHeight: 0.55,
      grounded: false,
    });
    this.input.release();
    this.resetTiming();
    this.callbacks.onRoom(null);
  }

  setGraphicsSettings(settings: GraphicsSettings): void {
    this.graphicsSettings = { ...settings };
    this.rendering.configure(settings);
    this.arena.configure(settings);
    this.viewmodel.configureTexture(settings.textureQuality);
    this.camera.camera.far = settings.viewDistance;
    this.camera.camera.updateProjectionMatrix();
  }

  private switchArena(id: ArenaId): void {
    if (id === this.arenaId) return;
    this.clearEliminationEffects();
    this.physics.setArena(arenas[id].colliders);
    this.arena.dispose();
    const Arena = arenaRenderers[id];
    this.arena = new Arena(this.scene);
    this.arena.configure(this.graphicsSettings);
    this.rendering.renderer.domElement.setAttribute(
      'aria-label',
      `${arenas[id].name} ${arenas[id].venue}`,
    );
    this.arenaId = id;
  }

  private setShotgunRangeActive(active: boolean): void {
    if (!this.shotgunRange) return;
    this.shotgunRange.setActive(active);
    const colliders = arenas.depot.colliders;
    this.physics.setArena(
      active ? [...colliders, this.shotgunRange.collider] : colliders,
    );
  }

  private readonly touchAimScale = (ads: number): number => {
    const targets = this.touchAimTargets;
    targets.length = 0;
    if (this.session) {
      const view = this.session.view;
      if (view?.phase !== 'playing') return 1;
      const owner = view.players.find((player) => player.id === view.selfId);
      if (!owner?.alive) return 1;
      for (const player of view.players) {
        if (!isTouchAimOpponent(owner, player)) continue;
        const point = this.remotes.aimPoint(player.id);
        if (point) targets.push(point);
      }
    } else if (!this.combat.dummy.resetting) {
      targets.push(this.combat.dummy.aimPoint);
    }
    const origin = this.touchAimOrigin;
    Object.assign(origin, this.physics.position);
    origin.y += this.movement.eyeOffset;
    const weapons = (this.session ? this.networkCombat : this.combat).weapons;
    const recoil = this.input.previewRecoil(weapons.recoil, 0);
    return this.touchAimAssist.scale(
      origin,
      this.input.movement.yaw + recoil.yaw,
      this.input.pitch + recoil.pitch,
      ads,
      targets,
    );
  };

  private readonly simulate = (dt: number): void => {
    if (!this.session && this.input.weapon.switchTo) {
      const slot = weaponOrder.indexOf(this.input.weapon.switchTo);
      if (isLoadoutSlot(slot)) this.equipTraining(slot);
      this.input.weapon.switchTo = null;
    }
    const priorVerticalSpeed = this.movement.velocity.y;
    const weapons = (this.session ? this.networkCombat : this.combat).weapons;
    const previousShots = weapons.shotsFired;
    const scale = weapons.movementScale(
      this.input.weapon.aim,
      this.input.movement,
      this.movement.state,
    );
    if (this.session) {
      if (this.session.view?.phase === 'countdown') {
        this.movement.stop();
        weapons.updateAds(dt, false);
        this.networkCombat.step(
          dt,
          {
            fire: false,
            aim: false,
            firePressed: false,
            reloadPressed: false,
            switchTo: null,
            autoReload: false,
          },
          this.movement,
        );
        this.input.consumeActions();
        return;
      }
      if (this.session.view?.phase !== 'playing') {
        this.input.clear();
        return;
      }
      if (!this.networkCombat.owner?.alive) this.input.clearGameplay();
      this.input.recoverRecoil(weapons.recoil, dt);
      const weaponInput = this.networkCombat.filterInput(this.input.weapon);
      weapons.updateAds(
        dt,
        !!this.networkCombat.owner?.alive && weaponInput.aim,
      );
      this.session.step(
        this.input.movement,
        this.input.pitch,
        weaponInput,
        scale,
      );
      this.networkCombat.step(dt, weaponInput, this.movement);
    } else {
      if (this.input.locked) {
        this.input.recoverRecoil(weapons.recoil, dt);
        weapons.updateAds(dt, this.input.weapon.aim);
      }
      this.movement.step(this.input.movement, dt, scale);
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
    this.viewmodel.simulateRecoil(
      weapons,
      dt,
      weapons.shotsFired > previousShots,
    );
    const active = this.session ? this.networkCombat : this.combat;
    this.audio.observe(
      dt,
      active.weapons,
      this.movement,
      this.input.locked && (!this.session || !!this.networkCombat.owner?.alive),
      priorVerticalSpeed,
      this.groundEffectFor(active.weapons.selected) ??
        (this.viewmodel.rifleSkinStatus === 'ready'
          ? normalizeRifleSkin(this.equippedSkin)
          : 'standard'),
    );
  };

  private readonly frame = (time: number): void => {
    if (
      this.disposed ||
      document.hidden ||
      (this.showcaseOpen && !isMatchActive(this.session?.view?.phase))
    )
      return;
    const start = performance.now();
    const delta = this.lastTime === null ? 0 : (time - this.lastTime) / 1000;
    this.lastTime = time;
    const activeCombat = this.session ? this.networkCombat : this.combat;
    const weapons = activeCombat.weapons;
    const armed =
      !this.session ||
      (isMatchActive(this.session.view?.phase) &&
        !!this.networkCombat.owner?.alive);
    const aiming =
      armed &&
      (!this.session || this.session.view?.phase === 'playing') &&
      this.input.weapon.aim;
    const alpha =
      this.input.locked || this.session?.view?.phase === 'playing'
        ? this.clock.advance(delta, this.simulate)
        : 1;
    const scopedWeapon = !!weapons.config.scopeMagnification;
    const recoilTime = this.input.locked ? alpha * movementConfig.fixedStep : 0;
    const interpolatedAds = weapons.sampleAds(recoilTime, aiming);
    const { state } = this.movement;
    if (scopedWeapon && this.input.locked && armed) {
      this.sniperSlideAim.update(
        interpolatedAds,
        aiming && !weapons.reloading && !weapons.equipping,
        state === 'sliding' || state === 'backsliding',
        delta,
      );
    } else this.sniperSlideAim.reset();
    const ads = scopedWeapon ? this.sniperSlideAim.progress : interpolatedAds;
    const speed = Math.hypot(
      this.movement.velocity.x,
      this.movement.velocity.z,
    );
    this.camera.updateSlide(
      state,
      speed,
      delta,
      this.input.locked && armed && !this.userSettings.reducedMotion
        ? (1 - Math.max(ads, interpolatedAds)) ** 2
        : 0,
    );
    const baseFov = this.userSettings.fov;
    const zoom = scopedWeapon ? sniperZoom(ads) : ads;
    const inputFov = weapons.fieldOfView(baseFov, zoom);
    const synced = this.userSettings.syncAdsFov;
    const aimFov = this.camera.transitionAimFov(
      synced ? weapons.fieldOfView(baseFov, zoom, true) : inputFov,
      delta,
      weapons.selected,
      baseFov,
      synced,
    );
    const fov = aimFov + this.camera.slideFovOffset;
    const recoil = this.input.previewRecoil(weapons.recoil, recoilTime);
    // A presentation preference must preserve the angular turn rate for mouse and touch.
    this.input.lookScale =
      Math.tan((inputFov * Math.PI) / 360) /
      Math.tan((baseFov * Math.PI) / 360);
    this.camera.update(
      this.movement,
      this.input,
      alpha,
      recoil.pitch,
      recoil.yaw,
      fov,
    );
    if (this.session) {
      this.session.prediction.smooth(delta);
      const offset = this.session.prediction.offset;
      this.camera.camera.position.x += offset.x;
      this.camera.camera.position.y += offset.y;
      this.camera.camera.position.z += offset.z;
    }
    this.remotes.update(this.session?.remotes, performance.now());
    if (this.session?.view?.phase === 'playing')
      this.audio.followFootsteps(
        this.camera.camera.position,
        this.input.movement.yaw,
        this.session.view.players,
      );
    if (this.input.inspectPressed) {
      this.input.inspectPressed = false;
      if (!this.session || this.session.view?.phase === 'playing')
        this.viewmodel.requestInspect();
    }
    this.viewmodel.update(
      weapons,
      speed,
      delta,
      this.input.locked && armed,
      this.userSettings.reducedMotion ? 0.2 : 1,
      state,
      this.userSettings.scopeStyle,
      this.input.weapon,
      ads,
      recoilTime,
    );
    this.trails.step(delta, ads, scopedWeapon, this.resolveMuzzle);
    let shotgunRadius: number | undefined;
    if (this.input.locked && armed && weapons.selected === 'shotgun') {
      const angle = weapons.spreadFor({
        speed,
        grounded: this.physics.grounded,
        verticalSpeed: this.movement.velocity.y,
      });
      const height = this.viewportHeight;
      const scaleY = this.camera.camera.projectionMatrix.elements[5]!;
      shotgunRadius = projectConeRadius(
        this.shotgunReticle.update(
          angle,
          delta,
          this.userSettings.reducedMotion,
        ),
        height,
        scaleY,
      );
      this.shotgunRange?.update({
        angle,
        radius: projectConeRadius(angle, height, scaleY),
        height,
        scaleY,
      });
    } else {
      this.shotgunReticle.reset();
      this.shotgunRange?.update();
    }
    if (this.input.locked && armed) {
      const camera = this.camera.camera;
      this.callbacks.onMinimap(
        this.arenaId,
        camera.position.x,
        camera.position.z,
        camera.rotation.y,
      );
    }
    const scopeDiameter = scopedWeapon ? this.viewmodel.scopeDiameter(ads) : 0;
    if (this.input.locked) {
      const gap = Math.max(
        5,
        Math.min(
          50,
          (Math.tan(weapons.spread) *
            this.rendering.renderer.domElement.height) /
            (2 * Math.tan((fov * Math.PI) / 360)),
        ),
      );
      this.reticleGap = this.sniperSlideAim.easing
        ? gap + (this.reticleGap - gap) * Math.exp(-Math.min(delta, 0.1) / 0.06)
        : gap;
      this.callbacks.onReticle(
        this.reticleGap,
        ads,
        scopedWeapon ? ads : 0,
        this.viewmodel.hasAimDot,
        scopeDiameter,
        shotgunRadius,
      );
    }
    const hasScope =
      this.input.locked &&
      armed &&
      scopedWeapon &&
      this.userSettings.scopeStyle === 'optic';
    if (hasScope) {
      this.opticView.baseFov =
        this.userSettings.fov + this.camera.slideFovOffset;
      this.opticView.blend = sniperScopeBlend(ads);
      this.opticView.diameter = scopeDiameter;
    }
    this.lavaEliminations.step(delta);
    this.soulRequiem.step(delta, this.camera.camera);
    for (const animation of this.groundAnimations) animation.step(delta);
    this.rendering.render(
      this.scene,
      this.camera.camera,
      delta * 1000,
      this.input.locked && armed ? this.viewmodel : null,
      hasScope ? this.opticView : null,
    );
    this.monitor.record(delta * 1000, performance.now() - start);
    const info = this.rendering.renderer.info.render;
    const stats = this.monitor.sample(time, info.calls, info.triangles);
    if (stats) {
      this.callbacks.onTelemetry({
        ...stats,
        ...this.physics.position,
        speed: this.input.locked ? speed : 0,
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
        antiAliasing: this.rendering.antiAliasing,
        graphics: this.graphicsSettings,
        shadowMapSize: this.arena.keyLight.shadow.map?.width ?? 0,
        textureTileSize: this.arena.textureTileSize,
        cameraFar: this.camera.camera.far,
        combat: this.combatSnapshot(),
        trails: {
          active: this.trails.activeCount,
          emitted: this.trails.emitted,
          opacity: this.trails.style.opacity,
          thickness: this.trails.style.thickness,
          length: this.trails.style.length,
        },
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
    this.viewmodel.resetInspect();
    this.trails.clear();
    this.audio.resetMotion();
    this.shotgunReticle.reset();
    this.sniperSlideAim.reset();
    this.camera.resetSlide();
    this.viewmodel.resetRecoil();
    this.reticleGap = 5;
    this.lastTime = null;
    this.clock.reset();
    this.monitor.reset();
    if (!this.session) this.movement.synchronize();
    this.rendering.resetTiming();
    this.combat.weapons.clearTriggerBuffer();
    this.networkCombat.weapons.clearTriggerBuffer();
  }

  private readonly resolveMuzzle: MuzzleResolver = (weapon, source, out) => {
    if (source !== undefined)
      return this.remotes.muzzleWorldPosition(source, weapon, out);
    const weapons = (this.session ? this.networkCombat : this.combat).weapons;
    // A delayed confirmation for a stowed weapon must not emerge from the new gun.
    if (!this.input.locked || weapons.selected !== weapon) return false;
    const worldFov =
      weapons.config.scopeMagnification &&
      this.userSettings.scopeStyle === 'optic'
        ? this.userSettings.fov + this.camera.slideFovOffset
        : this.camera.camera.fov;
    this.viewmodel.muzzleWorldPosition(
      weapon,
      this.camera.camera,
      out,
      worldFov,
    );
    return true;
  };

  private readonly footstepOccluded = (
    from: Vector3Like,
    to: Vector3Like,
  ): boolean => {
    const x = to.x - from.x,
      y = to.y + 0.18 - from.y,
      z = to.z - from.z;
    const distance = Math.hypot(x, y, z);
    return (
      distance > 0.2 &&
      !!this.physics.castBullet(
        from,
        { x: x / distance, y: y / distance, z: z / distance },
        distance - 0.12,
        true,
      )
    );
  };

  private clearEliminationEffects(): void {
    this.lavaEliminations.clear();
    this.soulRequiem.clear();
    for (const animation of this.groundAnimations) animation.clear();
    this.remotes.clearEliminations();
  }

  private readonly onVisibilityChange = (): void => {
    this.audio.setActive(!document.hidden);
    if (document.hidden) this.clearEliminationEffects();
    this.input.clear();
    this.resetTiming();
    if (document.hidden) this.input.release();
  };

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    this.rendering.renderer.setAnimationLoop(null);
    this.input.release();
    this.callbacks.onError(
      'The graphics context was lost. Reload this page to restart training.',
    );
  };

  dispose(): void {
    this.trails.dispose();
    this.lavaEliminations.dispose();
    this.soulRequiem.dispose();
    for (const animation of this.groundAnimations) animation.dispose();
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
    this.shotgunRange?.dispose();
    this.networkCombat.dispose();
    this.viewmodel.dispose();
    this.remotes.dispose();
    this.arena.dispose();
    this.physics.dispose();
    this.rendering.dispose();
    this.audio.dispose();
  }
}
