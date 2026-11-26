import {
  movementConfig,
  weaponOrder,
  type WeaponId,
  type MovementInput,
  type WeaponInput,
} from '@breakpoint/shared';
import {
  defaultUserSettings,
  bindingActions,
  type UserSettings,
} from '../settings/userSettings';
import type { WeaponController } from '../weapons/WeaponController';
import type { Recoil, RecoilAxes } from '../weapons/Recoil';
import { KeyboardInput } from './KeyboardInput';
import { MouseInput } from './MouseInput';
import { TouchInput } from './TouchInput';
import { GyroInput, requestGyroAccess } from './GyroInput';
import { readDevice } from './deviceCapabilities';

const lookLimit = Math.PI / 2 - 0.02;

function wrapYaw(yaw: number): number {
  return (
    ((((yaw + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) -
    Math.PI
  );
}

function coverReturn(covered: number, recoil: number, input: number): number {
  const sign = Math.sign(recoil);
  return (
    sign * Math.min(Math.abs(recoil), Math.max(0, (covered - input) * sign))
  );
}

function returned(covered: number, before: number, after: number): number {
  const sign = Math.sign(covered);
  const recovered = before * sign - Math.max(0, after * sign);
  return sign * Math.min(Math.abs(covered), Math.max(0, recovered));
}

/** Devices supply intentions to the existing movement and weapon controllers. */
export class InputManager {
  readonly movement: MovementInput = { forward: 0, right: 0, yaw: 0 };
  readonly weapon: WeaponInput = {
    fire: false,
    aim: false,
    firePressed: false,
    aimPressed: false,
    reloadPressed: false,
    switchTo: null,
    autoReload: true,
  };
  lookScale = 1;
  pitch = 0;
  locked = false;
  inspectPressed = false;
  private readonly handheld = readDevice().handheld;
  touchMode = this.handheld;
  private touchActive = false;
  private keyboardAxes = { forward: 0, right: 0, sprint: false, jump: false };
  private touchAxes = { forward: 0, right: 0, sprint: false, jump: false };
  private mouseHeld = { fire: false, aim: false };
  private touchHeld = { fire: false, aim: false };
  private scoreboard = false;
  private automaticLock = false;
  private settings = defaultUserSettings();
  private readonly keyboard: KeyboardInput;
  private readonly mouse: MouseInput;
  private readonly gyro = new GyroInput((x, y) => this.gyroLook(x, y));
  private touch: TouchInput | null = null;
  private readonly controlClicks = new Set<number>();
  private lastControlRelease: { x: number; y: number; time: number } | null =
    null;
  private readonly coveredReturn: RecoilAxes = { pitch: 0, yaw: 0 };
  private readonly recoilPreview: RecoilAxes = { pitch: 0, yaw: 0 };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onLockChange: (locked: boolean) => void,
    private readonly onError: (message: string) => void,
    private readonly onScoreboard: (open: boolean) => void = () => {},
    private readonly getWeapon: () => WeaponController | null = () => null,
    private readonly getAllowedWeapons: () => readonly WeaponId[] = () =>
      weaponOrder,
    private readonly touchAimScale: (ads: number) => number = () => 1,
    private readonly cycleLoadout?: () => void,
  ) {
    this.keyboard = new KeyboardInput(this);
    this.mouse = new MouseInput(this);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('pointerlockerror', this.onPointerLockError);
    document.addEventListener('pointerdown', this.onPointerStart, true);
    document.addEventListener('pointerup', this.onPointerEnd, true);
    document.addEventListener('click', this.onClick, true);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
    canvas.addEventListener('contextmenu', this.onContextMenu);
  }
  get bindings(): UserSettings['bindings'] {
    return this.settings.bindings;
  }
  suppressControlClick(pointerId: number): void {
    // Some browsers dispatch click after a captured touch button unmounts.
    // Keep this guard on the manager so Pause cannot click the menu beneath it.
    if (this.controlClicks.size > 32) this.controlClicks.clear();
    this.controlClicks.add(pointerId);
  }
  private readonly onPointerStart = (event: PointerEvent): void => {
    this.controlClicks.delete(event.pointerId);
    this.lastControlRelease = null;
  };
  private readonly onPointerEnd = (event: PointerEvent): void => {
    if (this.controlClicks.has(event.pointerId))
      this.lastControlRelease = {
        x: event.clientX,
        y: event.clientY,
        time: performance.now(),
      };
  };
  private readonly onClick = (event: MouseEvent): void => {
    const id = (event as PointerEvent).pointerId;
    const release = this.lastControlRelease;
    const legacyTouchClick =
      id === undefined &&
      release &&
      event.detail > 0 &&
      performance.now() - release.time < 1000 &&
      Math.hypot(event.clientX - release.x, event.clientY - release.y) < 4;
    if (!this.controlClicks.delete(id) && !legacyTouchClick) return;
    this.lastControlRelease = null;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  configure(settings: UserSettings): void {
    const changed = bindingActions.some(
      (action) => this.settings.bindings[action] !== settings.bindings[action],
    );
    this.settings = settings;
    this.weapon.autoReload = settings.autoReload;
    if (changed) this.clear();
    this.syncGyro();
  }
  requestSavedGyroAccess(): void {
    if (this.handheld && this.touchMode && this.settings.gyroEnabled)
      void requestGyroAccess();
  }
  private syncGyro(): void {
    this.gyro.setActive(
      this.settings.gyroEnabled &&
        this.handheld &&
        this.touchActive &&
        this.locked,
    );
  }
  useTouchControls(enabled: boolean): void {
    if (this.touchMode === enabled) return;
    this.release();
    this.touchMode = enabled;
  }
  attachTouchControls(root: HTMLElement): () => void {
    this.touch?.dispose();
    const touch = new TouchInput(root, this);
    this.touch = touch;
    return () => {
      touch.dispose();
      if (this.touch === touch) this.touch = null;
    };
  }
  requestLock(automatic = false): void {
    const device = readDevice();
    if (device.handheld && !device.landscape) return;
    if (this.touchMode) {
      this.clear();
      this.touchActive = true;
      this.locked = true;
      this.syncGyro();
      this.onLockChange(true);
      return;
    }
    this.automaticLock = automatic;
    if (!this.canvas.requestPointerLock) {
      if (!automatic)
        this.onError(
          'Mouse capture is unavailable. Use touch controls on a touchscreen device.',
        );
      return;
    }
    try {
      const result = this.canvas.requestPointerLock();
      if (result) void result.catch(this.onPointerLockError);
    } catch {
      this.onPointerLockError();
    }
  }
  release(): void {
    const wasActive = this.locked;
    this.touchActive = false;
    this.locked = false;
    this.syncGyro();
    this.clear();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    if (wasActive) this.onLockChange(false);
  }
  private readonly onPointerLockChange = (): void => {
    const active =
      document.pointerLockElement === this.canvas || this.touchActive;
    if (active === this.locked) return;
    this.locked = active;
    if (active) this.automaticLock = false;
    this.clear();
    this.onLockChange(active);
  };
  private readonly onPointerLockError = (): void => {
    if (!this.automaticLock)
      this.onError(
        'Mouse capture was denied. Click Play or Enter to try again.',
      );
  };
  private readonly onBlur = (): void => this.release();
  private readonly onResize = (): void => {
    this.gyro.reset();
    const device = readDevice();
    if (device.handheld && !device.landscape) this.release();
  };
  private readonly onContextMenu = (event: MouseEvent): void =>
    event.preventDefault();
  setScoreboard(open: boolean): void {
    if (this.scoreboard === open) return;
    this.scoreboard = open;
    this.onScoreboard(open);
  }
  toggleScoreboard(): void {
    this.setScoreboard(!this.scoreboard);
  }
  setKeyboardAxes(
    forward: number,
    right: number,
    sprint: boolean,
    jump: boolean,
  ): void {
    this.keyboardAxes = { forward, right, sprint, jump };
    this.mergeAxes();
  }
  setTouchAxes(
    forward: number,
    right: number,
    sprint: boolean,
    jump: boolean,
  ): void {
    this.touchAxes = { forward, right, sprint, jump };
    this.mergeAxes();
  }
  private mergeAxes(): void {
    this.movement.forward = Math.max(
      -1,
      Math.min(1, this.keyboardAxes.forward + this.touchAxes.forward),
    );
    this.movement.right = Math.max(
      -1,
      Math.min(1, this.keyboardAxes.right + this.touchAxes.right),
    );
    this.movement.sprint = this.keyboardAxes.sprint || this.touchAxes.sprint;
    this.movement.jump = this.keyboardAxes.jump || this.touchAxes.jump;
  }
  setMouseButton(button: number, down: boolean): void {
    if (button === 0) {
      if (down) this.weapon.firePressed = true;
      this.mouseHeld.fire = down;
    }
    if (button === 2) {
      if (down && !this.weapon.aim) this.weapon.aimPressed = true;
      this.mouseHeld.aim = down;
    }
    this.mergeWeapons();
  }
  setTouchWeapons(fire: boolean, aim: boolean): void {
    if (fire && !this.touchHeld.fire) this.weapon.firePressed = true;
    if (aim && !this.touchHeld.aim) this.weapon.aimPressed = true;
    this.touchHeld = { fire, aim };
    this.mergeWeapons();
  }
  private mergeWeapons(): void {
    this.weapon.fire = this.mouseHeld.fire || this.touchHeld.fire;
    this.weapon.aim = this.mouseHeld.aim || this.touchHeld.aim;
  }
  cycleWeapon(): void {
    if (this.cycleLoadout) {
      this.cycleLoadout();
      return;
    }
    const allowed = this.getAllowedWeapons();
    if (!allowed.length) return;
    const current = this.weapon.switchTo ?? this.getWeapon()?.selected;
    const index = allowed.findIndex((id) => id === current);
    this.weapon.switchTo = allowed[(index + 1) % allowed.length] ?? null;
  }
  mouseLook(dx: number, dy: number): void {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const weapon = this.getWeapon();
    const firing =
      this.weapon.fire &&
      (!weapon ||
        (!weapon.equipping &&
          weapon.current.magazine > 0 &&
          (!weapon.reloading || this.weapon.firePressed)));
    const group = this.settings.sensitivity[firing ? 'firing' : 'camera'];
    const ads = weapon ? weapon.ads : Number(this.weapon.aim);
    const aimed = weapon?.config.scopeMagnification ? group.sniper : group.ads;
    const horizontal = (group.steering + (aimed - group.steering) * ads) / 100;
    this.look(
      dx * movementConfig.sensitivity * this.lookScale * horizontal,
      (dy * movementConfig.sensitivity * this.lookScale * group.vertical) / 100,
    );
  }
  touchLook(dx: number, dy: number): void {
    if ((!dx && !dy) || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const weapon = this.getWeapon();
    const ads = weapon ? weapon.ads : Number(this.weapon.aim);
    const s = this.settings.touchSensitivity;
    const aimed = weapon?.config.scopeMagnification ? s.sniper : s.ads;
    const sensitivity = (s.camera + (aimed - s.camera) * ads) / 100;
    const scale =
      (Math.PI /
        (Math.max(1, Math.min(window.innerWidth, window.innerHeight)) * 1.2)) *
      this.lookScale *
      sensitivity;
    const assist =
      this.touchActive && this.handheld && this.settings.touchAimAssist
        ? this.touchAimScale(ads)
        : 1;
    this.look(dx * scale * assist, dy * scale * assist);
  }
  private gyroLook(x: number, y: number): void {
    const weapon = this.getWeapon();
    const ads = weapon ? weapon.ads : Number(this.weapon.aim);
    const sensitivity = this.settings.gyroSensitivity;
    const aimed = weapon?.config.scopeMagnification
      ? sensitivity.sniper
      : sensitivity.ads;
    const horizontal = sensitivity.camera + (aimed - sensitivity.camera) * ads;
    this.look(
      (x * horizontal * this.lookScale) / 100,
      (y * sensitivity.vertical * this.lookScale) / 100,
    );
  }
  private look(x: number, y: number): void {
    const previousPitch = this.pitch;
    this.movement.yaw = wrapYaw(this.movement.yaw - x);
    this.pitch = Math.max(
      -lookLimit,
      Math.min(lookLimit, previousPitch - y * (this.settings.invertY ? -1 : 1)),
    );
    // Apply every input delta immediately. Credit only the part opposing the spring,
    // so its later recovery cannot move the sights down a second time.
    if (this.locked) {
      const recoil = this.getWeapon()?.recoil;
      if (recoil) {
        this.coveredReturn.pitch = coverReturn(
          this.coveredReturn.pitch,
          recoil.pitch,
          this.pitch - previousPitch,
        );
        this.coveredReturn.yaw = coverReturn(
          this.coveredReturn.yaw,
          recoil.yaw,
          wrapYaw(-x),
        );
      }
    }
  }

  recoverRecoil(recoil: Recoil, dt: number): void {
    const covered = this.coveredReturn;
    if (!covered.pitch && !covered.yaw) return;
    const next = recoil.sample(dt, this.recoilPreview);
    const pitch = returned(covered.pitch, recoil.pitch, next.pitch);
    const yaw = returned(covered.yaw, recoil.yaw, next.yaw);
    covered.pitch -= pitch;
    covered.yaw -= yaw;
    // The normal look angles include the covered return before the input packet is sent.
    this.pitch = Math.max(-lookLimit, Math.min(lookLimit, this.pitch + pitch));
    if (yaw) this.movement.yaw = wrapYaw(this.movement.yaw + yaw);
    if (next.pitch * covered.pitch <= 0) covered.pitch = 0;
    if (next.yaw * covered.yaw <= 0) covered.yaw = 0;
  }

  previewRecoil(recoil: Recoil, dt: number): RecoilAxes {
    const view = recoil.sample(dt, this.recoilPreview);
    view.pitch += returned(this.coveredReturn.pitch, recoil.pitch, view.pitch);
    view.yaw += returned(this.coveredReturn.yaw, recoil.yaw, view.yaw);
    return view;
  }

  setLook(yaw: number, pitch: number): void {
    this.gyro.reset();
    this.movement.yaw = yaw;
    this.pitch = pitch;
    this.coveredReturn.pitch = this.coveredReturn.yaw = 0;
  }
  consumeActions(): void {
    this.movement.jumpPressed = false;
    this.movement.slidePressed = false;
    this.movement.pronePressed = false;
    this.movement.divePressed = false;
    this.weapon.firePressed = false;
    this.weapon.aimPressed = false;
    this.weapon.reloadPressed = false;
    this.weapon.switchTo = null;
  }
  clear(): void {
    this.setScoreboard(false);
    this.clearGameplay();
  }
  clearGameplay(): void {
    this.gyro.reset();
    this.inspectPressed = false;
    this.coveredReturn.pitch = this.coveredReturn.yaw = 0;
    this.keyboard.clear();
    this.touch?.clear();
    this.touchAxes = { forward: 0, right: 0, sprint: false, jump: false };
    this.mouseHeld = { fire: false, aim: false };
    this.touchHeld = { fire: false, aim: false };
    this.mergeAxes();
    this.mergeWeapons();
    this.consumeActions();
  }
  dispose(): void {
    this.release();
    this.touch?.dispose();
    this.keyboard.dispose();
    this.mouse.dispose();
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('pointerlockerror', this.onPointerLockError);
    document.removeEventListener('pointerdown', this.onPointerStart, true);
    document.removeEventListener('pointerup', this.onPointerEnd, true);
    document.removeEventListener('click', this.onClick, true);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onResize);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
  }
}
