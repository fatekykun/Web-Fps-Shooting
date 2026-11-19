import {
  movementConfig,
  type MovementInput,
  type WeaponInput,
} from '@breakpoint/shared';
import {
  defaultUserSettings,
  bindingActions,
  type UserSettings,
} from '../settings/userSettings';
import type { WeaponController } from '../weapons/WeaponController';

export class InputController {
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
  private readonly keys = new Set<string>();
  private scoreboard = false;
  private automaticLock = false;
  private settings = defaultUserSettings();

  configure(settings: UserSettings): void {
    const bindingsChanged = bindingActions.some(
      (action) => this.settings.bindings[action] !== settings.bindings[action],
    );
    this.settings = settings;
    this.weapon.autoReload = settings.autoReload;
    if (bindingsChanged) this.clear();
  }

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onLockChange: (locked: boolean) => void,
    private readonly onError: (message: string) => void,
    private readonly onScoreboard: (open: boolean) => void = () => {},
    private readonly getWeapon: () => WeaponController | null = () => null,
  ) {
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('pointerlockerror', this.onPointerLockError);
    window.addEventListener('blur', this.onBlur);
    canvas.addEventListener('contextmenu', this.onContextMenu);
  }

  requestLock(automatic = false): void {
    this.automaticLock = automatic;
    if (!this.canvas.requestPointerLock) {
      if (!automatic)
        this.onError(
          'Pointer lock is unavailable. Open BREAKPOINT in a desktop browser.',
        );
      return;
    }
    try {
      const result = this.canvas.requestPointerLock();
      // Older browsers return void; newer ones return a Promise.
      if (result) void result.catch(this.onPointerLockError);
    } catch {
      this.onPointerLockError();
    }
  }

  private readonly onPointerLockChange = (): void => {
    this.locked = document.pointerLockElement === this.canvas;
    if (this.locked) this.automaticLock = false;
    this.clear();
    this.onLockChange(this.locked);
  };

  private readonly onPointerLockError = (): void => {
    if (this.automaticLock) return;
    this.onError('Mouse capture was denied. Click Play or Enter to try again.');
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.locked || event.metaKey || event.altKey) return;
    const bindings = this.settings.bindings;
    if (event.code === bindings.scoreboard) {
      event.preventDefault();
      if (!this.scoreboard) {
        this.scoreboard = true;
        this.onScoreboard(true);
      }
      return;
    }
    if (event.code === 'Escape') {
      document.exitPointerLock();
      return;
    }
    if (
      Object.values(bindings).includes(event.code) ||
      (event.code === 'ShiftRight' &&
        bindings.sprint === 'ShiftLeft' &&
        !Object.values(bindings).includes('ShiftRight'))
    ) {
      event.preventDefault();
      if (!this.keys.has(event.code) && !event.repeat) {
        if (event.code === bindings.jump) this.movement.jumpPressed = true;
        if (event.code === bindings.slide) this.movement.slidePressed = true;
        if (event.code === bindings.dive) this.movement.divePressed = true;
        if (event.code === bindings.reload) this.weapon.reloadPressed = true;
        if (event.code === bindings.rifle) this.weapon.switchTo = 'rifle';
        if (event.code === bindings.smg) this.weapon.switchTo = 'smg';
        if (event.code === bindings.shotgun) this.weapon.switchTo = 'shotgun';
        if (event.code === bindings.sniper) this.weapon.switchTo = 'sniper';
      }
      this.keys.add(event.code);
      this.updateAxes();
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === this.settings.bindings.scoreboard) {
      if (this.locked) event.preventDefault();
      this.scoreboard = false;
      this.onScoreboard(false);
    }
    this.keys.delete(event.code);
    this.updateAxes();
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (
      !this.locked ||
      !Number.isFinite(event.movementX) ||
      !Number.isFinite(event.movementY)
    )
      return;
    const weapon = this.getWeapon();
    // Held trigger includes gaps between shots. A fresh press can cancel a
    // partial reload; blocked reloads/empty/equipping use camera values.
    const firing =
      this.weapon.fire &&
      (!weapon ||
        (!weapon.equipping &&
          weapon.current.magazine > 0 &&
          (!weapon.reloading || this.weapon.firePressed)));
    const group = this.settings.sensitivity[firing ? 'firing' : 'camera'];
    const ads = weapon ? weapon.ads : Number(this.weapon.aim);
    const aimed = weapon?.config.scopeMagnification ? group.sniper : group.ads;
    // Reuse the existing ADS animation blend, with no new input smoothing.
    const horizontal = (group.steering + (aimed - group.steering) * ads) / 100;
    const vertical = group.vertical / 100;
    const base = movementConfig.sensitivity * this.lookScale;
    this.movement.yaw -= event.movementX * base * horizontal;
    this.movement.yaw =
      ((((this.movement.yaw + Math.PI) % (Math.PI * 2)) + Math.PI * 2) %
        (Math.PI * 2)) -
      Math.PI;
    const limit = Math.PI / 2 - 0.02;
    this.pitch = Math.max(
      -limit,
      Math.min(
        limit,
        this.pitch -
          event.movementY * base * vertical * (this.settings.invertY ? -1 : 1),
      ),
    );
  };

  private readonly onBlur = (): void => {
    this.clear();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  };

  private readonly onMouseDown = (event: MouseEvent): void => {
    if (!this.locked) return;
    if (event.button === 0) {
      this.weapon.fire = true;
      this.weapon.firePressed = true;
    }
    if (event.button === 2) {
      if (!this.weapon.aim) this.weapon.aimPressed = true;
      this.weapon.aim = true;
    }
  };

  private readonly onMouseUp = (event: MouseEvent): void => {
    if (event.button === 0) this.weapon.fire = false;
    if (event.button === 2) this.weapon.aim = false;
  };

  private readonly onContextMenu = (event: MouseEvent): void =>
    event.preventDefault();

  private updateAxes(): void {
    const b = this.settings.bindings;
    this.movement.forward =
      Number(this.keys.has(b.forward)) - Number(this.keys.has(b.backward));
    this.movement.right =
      Number(this.keys.has(b.right)) - Number(this.keys.has(b.left));
    this.movement.sprint =
      this.keys.has(b.sprint) ||
      (b.sprint === 'ShiftLeft' &&
        !Object.values(b).includes('ShiftRight') &&
        this.keys.has('ShiftRight'));
    this.movement.jump = this.keys.has(b.jump);
  }

  /** One-shot actions survive a short tap until the next simulation tick. */
  consumeActions(): void {
    this.movement.jumpPressed = false;
    this.movement.slidePressed = false;
    this.movement.divePressed = false;
    this.weapon.firePressed = false;
    this.weapon.aimPressed = false;
    this.weapon.reloadPressed = false;
    this.weapon.switchTo = null;
  }

  clear(): void {
    if (this.scoreboard) {
      this.scoreboard = false;
      this.onScoreboard(false);
    }
    this.clearGameplay();
  }

  /** Dead players keep scoreboard access while gameplay buttons remain neutral. */
  clearGameplay(): void {
    this.keys.clear();
    this.movement.forward = 0;
    this.movement.right = 0;
    this.movement.sprint = false;
    this.movement.jump = false;
    this.weapon.fire = false;
    this.weapon.aim = false;
    this.consumeActions();
  }

  dispose(): void {
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('pointerlockerror', this.onPointerLockError);
    window.removeEventListener('blur', this.onBlur);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.clear();
  }
}
