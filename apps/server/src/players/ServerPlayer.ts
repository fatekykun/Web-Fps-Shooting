import { movementConfig } from '@breakpoint/shared';
import { arenaBoxes } from '@breakpoint/shared/maps';
import { MovementController } from '@breakpoint/shared/movement/MovementController';
import { PhysicsWorld } from '@breakpoint/shared/physics';
import {
  networkConfig,
  parseInput,
  type PlayerInput,
} from '@breakpoint/shared/network';
import type { PlayerState } from '../rooms/RoomState';
import { playerCombatConfig } from '@breakpoint/shared/combat';

/** Each capsule collides with the shared static map. Player collisions belong to a later pass. */
export class ServerPlayer {
  readonly movement: MovementController;
  private readonly queue: PlayerInput[] = [];
  private received = 0;
  private idleTicks = 0;
  rejectionReason = '';
  resynchronizations = 0;
  inputThisTick: PlayerInput | null = null;
  private pendingCombat: PlayerInput | null = null;

  constructor(readonly state: PlayerState) {
    const physics = new PhysicsWorld(arenaBoxes, {
      x: -14 + state.slot * 4,
      y: 0.91,
      z: 12,
    });
    this.movement = new MovementController(physics);
    this.publish();
  }

  enqueue(payload: unknown): boolean {
    this.rejectionReason = '';
    if (
      !Array.isArray(payload) ||
      payload.length < 1 ||
      payload.length > networkConfig.maxBatch
    ) {
      this.rejectionReason = 'Invalid movement batch.';
      return false;
    }
    const inputs: PlayerInput[] = [];
    let sequence = this.received;
    for (const raw of payload) {
      const input = parseInput(raw);
      // Consecutive ordered sequence numbers prevent replay and sequence jumps.
      if (!input || input.seq !== sequence + 1) {
        this.rejectionReason = input
          ? `Movement sequence ${input.seq}; expected ${sequence + 1}.`
          : 'Invalid movement fields.';
        return false;
      }
      inputs.push(input);
      sequence = input.seq;
    }
    if (this.queue.length + inputs.length > networkConfig.maxQueuedInputs) {
      // A stalled server may have dropped catch-up ticks. Finalize old inputs without
      // simulating them: the next owner correction drops that prediction history.
      // Keeping only the new batch bounds memory and never grants extra movement time.
      this.queue.length = 0;
      this.state.ack = this.received;
      this.resynchronizations++;
    }
    this.received = sequence;
    this.queue.push(...inputs);
    // Gun controls use the freshest validated look/buttons, independently of movement replay.
    // Coalesce taps until the next server tick without replaying old fire/reload requests.
    for (const input of inputs) {
      if (!input.weapon || !this.state.alive || input.life !== this.state.life)
        continue;
      const previous = this.pendingCombat?.weapon;
      this.pendingCombat = {
        ...input,
        weapon: {
          ...input.weapon,
          firePressed: input.weapon.firePressed || !!previous?.firePressed,
          reloadPressed:
            input.weapon.reloadPressed || !!previous?.reloadPressed,
          switchTo: input.weapon.switchTo ?? previous?.switchTo ?? null,
        },
      };
    }
    return true;
  }

  takeCombatInput(): PlayerInput | null {
    const input = this.pendingCombat;
    this.pendingCombat = null;
    return input;
  }

  step(): void {
    this.inputThisTick = null;
    const input = this.queue.shift();
    if (input) {
      this.idleTicks = 0;
      this.state.ack = input.seq;
      if (this.state.alive && (input.life ?? 1) === this.state.life) {
        this.inputThisTick = input;
        this.movement.step(input, movementConfig.fixedStep);
        this.state.yaw = input.yaw;
        this.state.pitch = input.pitch;
      }
    } else if (
      ++this.idleTicks > networkConfig.staleInputTicks &&
      this.state.alive
    ) {
      // A background tab or lost connection must never keep walking from the last keypress.
      this.movement.step(
        { forward: 0, right: 0, yaw: this.state.yaw },
        movementConfig.fixedStep,
      );
    }
    this.publish();
  }

  freeze(): void {
    this.queue.length = 0;
    this.state.ack = this.received;
    this.inputThisTick = null;
    this.movement.stop();
    this.pendingCombat = null;
  }

  respawn(position: { x: number; y: number; z: number }): void {
    this.freeze();
    this.state.life++;
    this.state.health = playerCombatConfig.health;
    this.state.alive = true;
    this.state.yaw = this.state.pitch = 0;
    const fresh = new MovementController(this.movement.physics).capture();
    this.movement.restore({
      ...fresh,
      position,
      halfHeight: movementConfig.capsuleHalfHeight,
      grounded: false,
    });
    this.publish();
  }

  private publish(): void {
    const { position, halfHeight } = this.movement.physics;
    this.state.x = position.x;
    this.state.y = position.y;
    this.state.z = position.z;
    this.state.halfHeight = halfHeight;
    this.state.movement = this.movement.state;
  }

  dispose(): void {
    this.movement.physics.dispose();
  }
}
