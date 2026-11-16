import { PerspectiveCamera } from 'three';
import type { InputController } from '../input/InputController';
import type { MovementController } from '../movement/MovementController';
import { combatConfig } from '@breakpoint/shared';

export class FirstPersonCamera {
  readonly camera = new PerspectiveCamera(85, 1, 0.08, 90);

  constructor() {
    this.camera.rotation.order = 'YXZ';
  }

  update(
    player: MovementController,
    input: InputController,
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
      0,
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
