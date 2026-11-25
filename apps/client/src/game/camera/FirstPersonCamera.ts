import { PerspectiveCamera } from 'three';
import type { InputController } from '../input/InputController';
import type { MovementController } from '../movement/MovementController';
import {
  combatConfig,
  degreesToRadians,
  movementConfig,
  type MovementState,
  type WeaponId,
} from '@breakpoint/shared';
import { slideMomentum } from '@breakpoint/shared/movement/Sliding';

export class FirstPersonCamera {
  readonly camera = new PerspectiveCamera(85, 1, 0.08, 90);
  slideFovOffset = 0;
  private slideRoll = 0;
  private aimFov: number = combatConfig.baseFov;
  private aimFovTransition = 0;
  private aimFovSource?: { weapon: WeaponId; base: number; synced: boolean };

  constructor() {
    this.camera.rotation.order = 'YXZ';
  }

  transitionAimFov(
    target: number,
    dt: number,
    weapon: WeaponId,
    base: number,
    synced: boolean,
  ): number {
    const previous = this.aimFovSource;
    if (
      !previous ||
      previous.weapon !== weapon ||
      previous.base !== base ||
      previous.synced !== synced
    ) {
      if (previous) this.aimFovTransition = this.aimFov - target;
      this.aimFovSource = { weapon, base, synced };
    }
    // ADS itself is already eased. Only carry over the angle across a new weapon or policy.
    if (this.aimFovTransition !== 0) {
      this.aimFovTransition *= Math.exp(-Math.min(dt, 0.1) / 0.055);
      if (Math.abs(this.aimFovTransition) < 0.001) this.aimFovTransition = 0;
    }
    this.aimFov = target + this.aimFovTransition;
    return this.aimFov;
  }

  updateSlide(
    state: MovementState,
    speed: number,
    dt: number,
    scale: number,
  ): void {
    const backwards = state === 'backsliding';
    const amount =
      backwards || state === 'sliding'
        ? slideMomentum(speed, backwards) * scale
        : 0;
    const blend = -Math.expm1(
      -movementConfig.slideCameraTransitionSpeed * Math.min(dt, 0.1),
    );
    const fov = amount * movementConfig.slideFovBoost;
    const roll =
      (backwards ? -1 : 1) *
      amount *
      movementConfig.slideCameraTilt *
      degreesToRadians;
    this.slideFovOffset += (fov - this.slideFovOffset) * blend;
    this.slideRoll += (roll - this.slideRoll) * blend;
  }

  resetSlide(): void {
    this.slideFovOffset = this.slideRoll = 0;
  }

  update(
    player: MovementController,
    input: Pick<InputController, 'pitch' | 'movement'>,
    alpha: number,
    recoilPitch = 0,
    recoilYaw = 0,
    fov: number = combatConfig.baseFov,
  ): void {
    const before = player.previousPosition;
    const after = player.physics.position;
    this.camera.position.set(
      before.x + (after.x - before.x) * alpha,
      before.y +
        (after.y - before.y) * alpha +
        player.previousEyeOffset +
        (player.eyeOffset - player.previousEyeOffset) * alpha,
      before.z + (after.z - before.z) * alpha,
    );
    // Look uses the latest mouse input, independent of the physics frequency.
    this.camera.rotation.set(
      Math.max(-1.55, Math.min(1.55, input.pitch + recoilPitch)),
      input.movement.yaw + recoilYaw,
      this.slideRoll,
    );
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
