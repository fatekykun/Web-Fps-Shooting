import { movementConfig, type Vector3Like } from '@breakpoint/shared';
import { arenas, type ArenaDefinition } from '@breakpoint/shared/maps';
import { MovementController } from '@breakpoint/shared/movement/MovementController';
import { PhysicsWorld } from '@breakpoint/shared/physics';
import {
  networkConfig,
  parseInput,
  type PlayerInput,
} from '@breakpoint/shared/network';
import type { PlayerState } from '../rooms/RoomState';
import { playerCombatConfig } from '@breakpoint/shared/combat';
import { CharacterAnimation } from '@breakpoint/shared/animation';
import {
  FootstepTracker,
  type RemoteFootstep,
} from '@breakpoint/shared/movement/Footsteps';

/** Each capsule collides with the shared static map. Player collisions belong to a later pass. */
export class ServerPlayer {
  soulRequiem = false;
  readonly animation = new CharacterAnimation();
  readonly movement: MovementController;
  private readonly footsteps = new FootstepTracker();
  private readonly queue: PlayerInput[] = [];
  private received = 0;
  private idleTicks = 0;
  rejectionReason = '';
  resynchronizations = 0;
  inputThisTick: PlayerInput | null = null;
  private pendingCombat: PlayerInput | null = null;
  /** Server-installed weapon policy; packet fields cannot choose a speed scale. */
  movementScale: (input: PlayerInput) => number = () => 1;

  constructor(
    readonly state: PlayerState,
    readonly arena: ArenaDefinition = arenas.depot,
  ) {
    const { x, y, z, yaw } = arena.spawns.none[state.slot]!;
    const physics = new PhysicsWorld(arena.colliders, { x, y, z });
    state.yaw = yaw;
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
          aimPressed: input.weapon.aimPressed || !!previous?.aimPressed,
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

  step(): RemoteFootstep | undefined {
    this.inputThisTick = null;
    const verticalSpeed = this.movement.velocity.y;
    let simulated = false;
    const input = this.queue.shift();
    if (input) {
      this.idleTicks = 0;
      this.state.ack = input.seq;
      if (this.state.alive && (input.life ?? 1) === this.state.life) {
        this.inputThisTick = input;
        this.movement.step(
          input,
          movementConfig.fixedStep,
          this.movementScale(input),
        );
        simulated = true;
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
      simulated = true;
    }
    this.publish(simulated);
    if (!simulated) return;
    const step = this.footsteps.step(
      this.movement,
      movementConfig.fixedStep,
      verticalSpeed,
    );
    return step && { ...step, player: this.state.id, life: this.state.life };
  }

  freeze(): void {
    this.footsteps.reset();
    this.queue.length = 0;
    this.state.ack = this.received;
    this.inputThisTick = null;
    this.movement.stop();
    this.pendingCombat = null;
  }

  respawn({ x, y, z, yaw = 0 }: Vector3Like & { yaw?: number }): void {
    this.freeze();
    this.animation.reset();
    this.state.gaitPhase = this.state.gaitAmount = 0;
    this.state.life++;
    this.state.health = playerCombatConfig.health;
    this.state.alive = true;
    this.state.yaw = yaw;
    this.state.pitch = 0;
    const fresh = new MovementController(this.movement.physics).capture();
    this.movement.restore({
      ...fresh,
      position: { x, y, z },
      halfHeight: movementConfig.capsuleHalfHeight,
      grounded: false,
    });
    this.publish();
  }

  private publish(simulated = false): void {
    const position = this.movement.physics.position;
    const speed = simulated
      ? Math.hypot(
          position.x - this.movement.previousPosition.x,
          position.z - this.movement.previousPosition.z,
        ) / movementConfig.fixedStep
      : 0;
    this.animation.step(
      movementConfig.fixedStep,
      speed,
      this.movement.physics.grounded,
      this.movement.state,
    );
    Object.assign(this.state, this.animation.values);
    const { halfHeight } = this.movement.physics;
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
