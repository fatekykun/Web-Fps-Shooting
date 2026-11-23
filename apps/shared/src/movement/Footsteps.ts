import type { Vector3Like } from '../types/movement';
import { movementConfig } from '../config/movement';
import type { MovementController } from './MovementController';

export const footstepSurfaces = [
  'concrete',
  'metal',
  'wood',
  'dirt',
  'grass',
  'gravel',
] as const;
export type FootstepSurface = (typeof footstepSurfaces)[number];
export type FootstepKind =
  'walk' | 'sprint' | 'crouch' | 'crawl' | 'slide' | 'land';
export const footstepProfiles = {
  walk: { distance: 1.6, range: 12, volume: 0.62 },
  sprint: { distance: 1.8, range: 20, volume: 1 },
  crouch: { distance: 1.35, range: 4, volume: 0.3 },
  crawl: { distance: 0.65, range: 3, volume: 0.43 },
  slide: { range: 14, volume: 0.75 },
  land: { range: 17, volume: 1 },
} as const;

export interface Footstep {
  kind: FootstepKind;
  surface: FootstepSurface;
  position: Vector3Like;
  strength: number;
}

export interface RemoteFootstep extends Footstep {
  player: string;
  life: number;
}

const locomotion = {
  walking: 'walk',
  sprinting: 'sprint',
  crouching: 'crouch',
  prone: 'crawl',
  sliding: 'slide',
  backsliding: 'slide',
} as const;

/** Run only on forward simulation ticks, never during prediction replay. */
export class FootstepTracker {
  private grounded = false;
  private mode?: Exclude<FootstepKind, 'land'>;
  private distance = 0;
  private slideContact = false;

  reset(): void {
    this.grounded = false;
    this.mode = undefined;
    this.distance = 0;
    this.slideContact = false;
  }

  step(
    movement: MovementController,
    dt: number,
    priorVerticalSpeed: number,
  ): Footstep | undefined {
    const { physics, previousPosition, state } = movement;
    const landing =
      !this.grounded && physics.grounded && priorVerticalSpeed < -1.6;
    this.grounded = physics.grounded;
    const mode =
      physics.grounded && state in locomotion
        ? locomotion[state as keyof typeof locomotion]
        : undefined;
    const changed = mode !== this.mode;
    if (changed || landing) this.distance = 0;
    if (mode !== 'slide') this.slideContact = false;
    this.mode = mode;
    if (landing)
      return this.emit(
        movement,
        'land',
        Math.min(1, Math.abs(priorVerticalSpeed) / 10),
      );
    if (!mode) return;

    const travel = Math.hypot(
      physics.position.x - previousPosition.x,
      physics.position.z - previousPosition.z,
    );
    if (travel < 0.15 * dt) return;
    if (mode === 'slide') {
      if (this.slideContact) return;
      this.slideContact = true;
      return this.emit(movement, 'slide', 1);
    }
    const interval = footstepProfiles[mode].distance;
    this.distance += travel;
    if (this.distance < interval) return;
    this.distance %= interval;
    return this.emit(movement, mode, 1);
  }

  private emit(
    movement: MovementController,
    kind: FootstepKind,
    strength: number,
  ): Footstep {
    const { x, y, z } = movement.physics.position;
    return {
      kind,
      strength,
      surface: movement.physics.groundSurface(),
      position: {
        x,
        y: y - movementConfig.capsuleHalfHeight - movementConfig.capsuleRadius,
        z,
      },
    };
  }
}
