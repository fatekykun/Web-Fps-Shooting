import type { InputManager } from './InputManager';
import { TouchCamera } from './TouchCamera';
import { VirtualJoystick } from './VirtualJoystick';

interface TouchOwner {
  control: string;
  element: HTMLElement;
}

/** Independent ownership allows movement, camera and weapon buttons together. */
export class TouchInput {
  private readonly pointers = new Map<number, TouchOwner>();
  private readonly joystick = new VirtualJoystick();
  private readonly camera = new TouchCamera();
  private forward = 0;
  private right = 0;
  private aim = false;
  private readonly buttons: HTMLElement[];
  private readonly sprintMarker: HTMLElement | null;
  constructor(
    private readonly root: HTMLElement,
    private readonly input: InputManager,
  ) {
    this.buttons = [
      ...root.querySelectorAll<HTMLElement>('[data-touch-control]'),
    ];
    this.sprintMarker = root.querySelector('[data-sprint-indicator]');
    root.addEventListener('pointerdown', this.down, { passive: false });
    root.addEventListener('pointermove', this.move, { passive: false });
    root.addEventListener('pointerup', this.up);
    root.addEventListener('pointercancel', this.cancel);
    root.addEventListener('lostpointercapture', this.cancel);
    root.addEventListener('contextmenu', this.contextMenu);
  }
  private has(control: string): boolean {
    for (const owner of this.pointers.values())
      if (owner.control === control) return true;
    return false;
  }
  private readonly contextMenu = (event: Event): void => event.preventDefault();
  private readonly down = (event: PointerEvent): void => {
    if (
      event.pointerType !== 'touch' ||
      !this.input.locked ||
      !this.input.touchMode
    )
      return;
    const element = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-touch-control]',
    );
    if (!element || !this.root.contains(element)) return;
    event.preventDefault();
    this.input.suppressControlClick(event.pointerId);
    const control = element.dataset.touchControl!;
    if ((control === 'joystick' || control === 'look') && this.has(control))
      return;
    this.pointers.set(event.pointerId, { control, element });
    element.setPointerCapture(event.pointerId);
    if (control === 'joystick') {
      this.joystick.begin(element);
      this.moveJoystick(event);
    }
    if (control === 'look') this.camera.begin(event.clientX, event.clientY);
    if (control === 'aim') this.aim = !this.aim;
    if (control === 'jump') this.input.movement.jumpPressed = true;
    if (control === 'slide') this.input.movement.slidePressed = true;
    if (control === 'prone') this.input.movement.pronePressed = true;
    if (control === 'dive') this.input.movement.divePressed = true;
    if (control === 'reload') this.input.weapon.reloadPressed = true;
    if (control === 'inspect') this.input.inspectPressed = true;
    if (control === 'swap') this.input.cycleWeapon();
    if (control === 'scores') this.input.toggleScoreboard();
    if (control === 'pause') {
      this.input.release();
      return;
    }
    this.sync();
  };
  private moveJoystick(event: PointerEvent): void {
    const axes = this.joystick.move(event.clientX, event.clientY);
    this.forward = axes.forward;
    this.right = axes.right;
  }
  private readonly move = (event: PointerEvent): void => {
    const owner = this.pointers.get(event.pointerId);
    if (!owner) return;
    event.preventDefault();
    if (owner.control === 'joystick') {
      this.moveJoystick(event);
      this.syncMovement();
    }
    if (owner.control === 'look') {
      const delta = this.camera.move(event.clientX, event.clientY);
      this.input.touchLook(delta.x, delta.y);
    }
  };
  private readonly up = (event: PointerEvent): void => this.end(event, false);
  private readonly cancel = (event: PointerEvent): void =>
    this.end(event, true);
  private end(event: PointerEvent, cancelled: boolean): void {
    const owner = this.pointers.get(event.pointerId);
    if (!owner) return;
    this.pointers.delete(event.pointerId);
    if (owner.control === 'joystick') {
      this.forward = 0;
      this.right = 0;
      this.joystick.clear();
    }
    if (cancelled && owner.control === 'aim') this.aim = false;
    if (owner.element.hasPointerCapture(event.pointerId))
      owner.element.releasePointerCapture(event.pointerId);
    this.sync();
  }
  private syncMovement(): void {
    const sprint = this.joystick.sprintActive;
    this.input.setTouchAxes(this.forward, this.right, sprint, this.has('jump'));
    if (this.sprintMarker) this.sprintMarker.dataset.active = String(sprint);
  }
  private sync(): void {
    this.syncMovement();
    this.input.setTouchWeapons(this.has('fire'), this.aim);
    for (const button of this.buttons) {
      const control = button.dataset.touchControl!;
      const active = control === 'aim' ? this.aim : this.has(control);
      button.dataset.active = String(active);
      if (control === 'aim')
        button.setAttribute('aria-pressed', String(active));
    }
  }
  clear(): void {
    const owners = [...this.pointers];
    this.pointers.clear();
    for (const [id, owner] of owners)
      if (owner.element.hasPointerCapture(id))
        owner.element.releasePointerCapture(id);
    this.forward = this.right = 0;
    this.aim = false;
    this.joystick.clear();
    this.sync();
  }
  dispose(): void {
    this.clear();
    this.root.removeEventListener('pointerdown', this.down);
    this.root.removeEventListener('pointermove', this.move);
    this.root.removeEventListener('pointerup', this.up);
    this.root.removeEventListener('pointercancel', this.cancel);
    this.root.removeEventListener('lostpointercapture', this.cancel);
    this.root.removeEventListener('contextmenu', this.contextMenu);
  }
}
