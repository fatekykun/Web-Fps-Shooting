import {
  movementConfig,
  type MovementInput,
  type WeaponInput,
} from '@breakpoint/shared';
import type { MovementController } from '@breakpoint/shared/movement/MovementController';
import {
  networkConfig,
  type Correction,
  type PlayerInput,
} from '@breakpoint/shared/network';

/** Replays movement only. Combat and visual effects are never replayed. */
export class Prediction {
  private sequence = 0;
  private acknowledged = 0;
  // Local replay metadata is deliberately absent from the transmitted packet.
  private pending: (PlayerInput & { groundSpeedScale: number })[] = [];
  private life = 1;
  private alive = true;
  readonly offset = { x: 0, y: 0, z: 0 };

  constructor(private readonly movement: MovementController) {}

  step(
    input: MovementInput,
    pitch: number,
    weapon?: WeaponInput,
    groundSpeedScale = 1,
  ): PlayerInput {
    if (this.pending.length >= networkConfig.maxPrediction)
      throw new Error('The server stopped responding. Rejoin the room.');
    const packet: PlayerInput = {
      seq: ++this.sequence,
      forward: input.forward,
      right: input.right,
      yaw: input.yaw,
      pitch,
      sprint: !!input.sprint,
      jump: !!input.jump,
      jumpPressed: !!input.jumpPressed,
      slidePressed: !!input.slidePressed,
      divePressed: !!input.divePressed,
      life: this.life,
      ...(weapon ? { weapon: { ...weapon } } : {}),
    };
    this.pending.push({ ...packet, groundSpeedScale });
    if (this.alive)
      this.movement.step(packet, movementConfig.fixedStep, groundSpeedScale);
    return packet;
  }

  reconcile({ ack, snapshot, combat }: Correction): void {
    if (combat && combat.life < this.life) return;
    if (ack < this.acknowledged || ack > this.sequence) return;
    this.acknowledged = ack;
    if (combat && (combat.life !== this.life || combat.alive !== this.alive)) {
      this.life = combat.life;
      this.alive = combat.alive;
      this.pending.length = 0;
      this.movement.restore(snapshot);
      this.offset.x = this.offset.y = this.offset.z = 0;
      return;
    }
    const before = { ...this.movement.physics.position };
    this.pending = this.pending.filter((input) => input.seq > ack);
    this.movement.restore(snapshot);
    if (this.alive)
      for (const input of this.pending)
        this.movement.step(
          input,
          movementConfig.fixedStep,
          input.groundSpeedScale,
        );
    const after = this.movement.physics.position;
    const dx = before.x - after.x,
      dy = before.y - after.y,
      dz = before.z - after.z;
    if (Math.hypot(dx, dy, dz) < 2) {
      this.offset.x += dx;
      this.offset.y += dy;
      this.offset.z += dz;
    } else this.offset.x = this.offset.y = this.offset.z = 0;
  }

  smooth(dt: number): void {
    const decay = Math.exp(-Math.max(0, dt) * 18);
    this.offset.x *= decay;
    this.offset.y *= decay;
    this.offset.z *= decay;
  }
  suspend(): void {
    this.pending.length = 0;
    this.movement.stop();
    this.offset.x = this.offset.y = this.offset.z = 0;
  }
}
