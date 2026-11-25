import RAPIER from '@dimforge/rapier3d-compat';
import { movementConfig, type Vector3Like } from '../index';
import type { ArenaBox } from '../maps/arenaLayout';
import type { FootstepSurface } from '../movement/Footsteps';

let initialization: Promise<void> | undefined;
export function initializePhysics(): Promise<void> {
  initialization ??= RAPIER.init();
  return initialization;
}

export interface WallContact extends Vector3Like {
  colliderHandle: number;
}
export interface BulletHit {
  colliderHandle: number;
  distance: number;
  point: Vector3Like;
  normal: Vector3Like;
}
const identityRotation = { x: 0, y: 0, z: 0, w: 1 };
const wallDirections = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [Math.SQRT1_2, Math.SQRT1_2],
  [-Math.SQRT1_2, Math.SQRT1_2],
  [Math.SQRT1_2, -Math.SQRT1_2],
  [-Math.SQRT1_2, -Math.SQRT1_2],
] as const;

export class PhysicsWorld {
  private readonly world = new RAPIER.World({
    x: 0,
    y: -movementConfig.gravity,
    z: 0,
  });
  private readonly character: RAPIER.RigidBody;
  private readonly collider: RAPIER.Collider;
  private readonly arenaColliders: RAPIER.Collider[] = [];
  private readonly stairColliders = new Set<number>();
  private readonly groundMaterials = new Map<number, FootstepSurface>();
  private readonly controller: RAPIER.KinematicCharacterController;
  private readonly nextPosition: Vector3Like = { x: 0, y: 0, z: 0 };
  private readonly queryPosition: Vector3Like = { x: 0, y: 0, z: 0 };
  private readonly clearanceShape = new RAPIER.Capsule(
    movementConfig.capsuleHalfHeight,
    movementConfig.capsuleRadius + 0.005,
  );
  private readonly wallRay = new RAPIER.Ray(
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
  );
  private readonly wallContact: WallContact = {
    x: 0,
    y: 0,
    z: 0,
    colliderHandle: 0,
  };
  private readonly contact = new RAPIER.CharacterCollision();
  private readonly bulletRay = new RAPIER.Ray(
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: -1 },
  );
  private readonly bulletHit: BulletHit = {
    colliderHandle: 0,
    distance: 0,
    point: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 0, z: 0 },
  };
  private readonly correctedMovement: Vector3Like = { x: 0, y: 0, z: 0 };
  private readonly stairMovement: Vector3Like = { x: 0, y: 0, z: 0 };
  private currentHalfHeight: number = movementConfig.capsuleHalfHeight;
  private idleTraction = false;
  readonly position: Vector3Like = { x: 0, y: 0, z: 0 };
  grounded = false;
  hitCeiling = false;

  get halfHeight(): number {
    return this.currentHalfHeight;
  }

  /** Trusted server correction. Never accepts a client-reported position on the server. */
  restore(position: Vector3Like, halfHeight: number, grounded: boolean): void {
    Object.assign(this.position, position);
    this.character.setTranslation(position, true);
    this.character.setNextKinematicTranslation(position);
    this.collider.setHalfHeight(halfHeight);
    this.collider.setTranslationWrtParent({
      x: 0,
      y: halfHeight - movementConfig.capsuleHalfHeight,
      z: 0,
    });
    this.currentHalfHeight = halfHeight;
    this.world.step();
    this.grounded = grounded;
    this.hitCeiling = false;
  }

  constructor(boxes: readonly ArenaBox[], spawn: Vector3Like) {
    this.world.timestep = movementConfig.fixedStep;
    this.addArena(boxes);
    this.character = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        spawn.x,
        spawn.y,
        spawn.z,
      ),
    );
    this.collider = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(
        movementConfig.capsuleHalfHeight,
        movementConfig.capsuleRadius,
      ),
      this.character,
    );
    this.controller = this.world.createCharacterController(
      movementConfig.collisionOffset,
    );
    // Keep a small contact nudge; a large one creates bumps rather than fixing floor slip.
    this.controller.setNormalNudgeFactor(movementConfig.collisionNormalNudge);
    this.controller.enableSnapToGround(0.15);
    this.controller.setMaxSlopeClimbAngle(Math.PI / 4);
    // Rapier 0.21's nonslip branch can discard a flat-floor tangent due to rounding
    // (upstream #1058). A negative threshold disables that branch; our velocity model
    // owns traction. Max climb angle still blocks wall climbing. Revisit for ramp maps.
    this.controller.setMinSlopeSlideAngle(-0.0001);
    Object.assign(this.position, spawn);
    this.world.step();
  }

  setArena(boxes: readonly ArenaBox[]): void {
    for (const collider of this.arenaColliders)
      this.world.removeCollider(collider, false);
    this.arenaColliders.length = 0;
    this.stairColliders.clear();
    this.groundMaterials.clear();
    this.addArena(boxes);
    // Rebuild query bounds before the next controller step or hitscan.
    this.world.step();
  }

  private addArena(boxes: readonly ArenaBox[]): void {
    for (const box of boxes) {
      const [x, y, z] = box.size;
      const shape = this.arenaShape(box, x / 2, y / 2, z / 2);
      if (box.yaw || box.pitch || box.roll) {
        const yaw = (box.yaw ?? 0) / 2;
        const pitch = (box.pitch ?? 0) / 2;
        const roll = (box.roll ?? 0) / 2;
        const sx = Math.sin(pitch),
          cx = Math.cos(pitch);
        const sy = Math.sin(yaw),
          cy = Math.cos(yaw);
        const sz = Math.sin(roll),
          cz = Math.cos(roll);
        shape.setRotation({
          x: sx * cy * cz + cx * sy * sz,
          y: cx * sy * cz - sx * cy * sz,
          z: cx * cy * sz + sx * sy * cz,
          w: cx * cy * cz - sx * sy * sz,
        });
      }
      const collider = this.world.createCollider(
        shape.setTranslation(...box.position),
      );
      this.arenaColliders.push(collider);
      if (box.kind === 'stair') this.stairColliders.add(collider.handle);
      const surface =
        box.footstepSurface ??
        (box.kind === 'crate' || box.kind === 'stair'
          ? 'wood'
          : box.kind === 'container' || box.kind === 'barrel'
            ? 'metal'
            : 'concrete');
      this.groundMaterials.set(collider.handle, surface);
    }
  }

  /** Called on an audible contact, so there is no extra ray per movement tick. */
  groundSurface(): FootstepSurface {
    const hit = this.castBullet(
      this.position,
      { x: 0, y: -1, z: 0 },
      1.13,
      true,
    );
    return (hit && this.groundMaterials.get(hit.colliderHandle)) || 'concrete';
  }

  private arenaShape(
    box: ArenaBox,
    x: number,
    y: number,
    z: number,
  ): RAPIER.ColliderDesc {
    if (box.kind === 'barrel') return RAPIER.ColliderDesc.cylinder(y, x);
    if (box.kind !== 'stair') return RAPIER.ColliderDesc.cuboid(x, y, z);
    // Meet each tread at its nosing with a continuous walkable slope.
    const ramp = RAPIER.ColliderDesc.convexHull(
      new Float32Array([
        -x,
        -y,
        z,
        x,
        -y,
        z,
        -x,
        -y,
        -z,
        x,
        -y,
        -z,
        -x,
        y,
        -z,
        x,
        y,
        -z,
      ]),
    );
    if (!ramp) throw new Error('Invalid arena staircase dimensions.');
    return ramp;
  }

  move(displacement: Vector3Like): void {
    // Use floor traction at rest. The flat-floor tangent workaround is needed
    // only while moving; leaving it active at zero input creates numerical creep.
    const idle = displacement.x === 0 && displacement.z === 0;
    if (idle !== this.idleTraction) {
      this.idleTraction = idle;
      this.controller.setMinSlopeSlideAngle(idle ? Math.PI / 4 : -0.0001);
    }
    if (displacement.y > 0) this.controller.disableSnapToGround();
    else this.controller.enableSnapToGround(0.15);
    this.controller.computeColliderMovement(
      this.collider,
      displacement,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
    );
    const movement = this.controller.computedMovement(this.correctedMovement);
    if (
      !idle &&
      this.grounded &&
      displacement.y <= 0 &&
      this.stairColliders.size
    )
      this.preserveStairSpeed(displacement, movement);
    this.hitCeiling = false;
    if (displacement.y > 0) {
      for (let i = 0; i < this.controller.numComputedCollisions(); i++) {
        const collision = this.controller.computedCollision(i, this.contact);
        if (collision && collision.normal1.y < -0.5) this.hitCeiling = true;
      }
    }
    this.nextPosition.x = this.position.x + movement.x;
    this.nextPosition.y = this.position.y + movement.y;
    this.nextPosition.z = this.position.z + movement.z;
    this.character.setNextKinematicTranslation(this.nextPosition);
    this.world.step();
    const position = this.character.translation();
    this.position.x = position.x;
    this.position.y = position.y;
    this.position.z = position.z;
    this.grounded = displacement.y <= 0 && this.controller.computedGrounded();
  }

  /** Reads the contacts from the most recent capsule sweep. */
  blockedForwardMovement(
    displacement: Vector3Like,
    alignment: number,
  ): boolean {
    const missingX = displacement.x - this.correctedMovement.x;
    const missingZ = displacement.z - this.correctedMovement.z;
    const distance = Math.hypot(displacement.x, displacement.z);
    const nudge = movementConfig.collisionNormalNudge;
    if (distance <= nudge || Math.abs(missingX) + Math.abs(missingZ) <= nudge)
      return false;
    const count = this.controller.numComputedCollisions();
    for (let i = 0; i < count; i++) {
      const collision = this.controller.computedCollision(i, this.contact);
      if (!collision) continue;
      const { x, y, z } = collision.normal1;
      if (y >= Math.SQRT1_2 || y < -0.5) continue; // Walkable slopes and head contacts.
      const intoWall = -(displacement.x * x + displacement.z * z);
      const lostToWall = -(missingX * x + missingZ * z);
      if (
        lostToWall > nudge &&
        intoWall >= alignment * distance * Math.hypot(x, z)
      )
        return true;
    }
    return false;
  }

  private preserveStairSpeed(
    displacement: Vector3Like,
    movement: Vector3Like,
  ): void {
    const missingX = displacement.x - movement.x;
    const missingZ = displacement.z - movement.z;
    const nudge = movementConfig.collisionNormalNudge;
    if (Math.abs(missingX) + Math.abs(missingZ) <= nudge) return;
    const collisions = this.controller.numComputedCollisions();
    for (let i = 0; i < collisions; i++) {
      const collision = this.controller.computedCollision(i, this.contact);
      if (
        !collision?.collider ||
        !this.stairColliders.has(collision.collider.handle)
      )
        continue;
      const { x, y, z } = collision.normal1;
      if (y < Math.SQRT1_2) continue;
      const lost = -x * missingX - z * missingZ;
      const before = collision.translationDeltaApplied;
      const rise =
        (-x * (displacement.x - before.x) - z * (displacement.z - before.z)) /
        y;
      if (lost <= nudge || rise <= nudge) continue;

      // Rapier projects a horizontal move onto the ramp, shortening its floor-plane component.
      // Supply the rise for the part of the move on the staircase and resolve collisions again.
      this.stairMovement.x = displacement.x;
      this.stairMovement.y = before.y + rise - nudge;
      this.stairMovement.z = displacement.z;
      this.controller.computeColliderMovement(
        this.collider,
        this.stairMovement,
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      );
      this.controller.computedMovement(movement);
      return;
    }
  }

  canStand(): boolean {
    return this.canOccupy(movementConfig.capsuleHalfHeight);
  }

  canOccupy(halfHeight: number): boolean {
    this.queryPosition.x = this.position.x;
    // Shift the clearance probe slightly upward: floor contact is valid, but head contact is not.
    this.queryPosition.y =
      this.position.y +
      halfHeight -
      movementConfig.capsuleHalfHeight +
      movementConfig.collisionOffset;
    this.queryPosition.z = this.position.z;
    return this.hasClearance(this.queryPosition, halfHeight);
  }

  /** A standing capsule needs empty space and walkable support at its feet. */
  canSpawnAt(position: Vector3Like): boolean {
    const { capsuleHalfHeight, capsuleRadius, collisionOffset } =
      movementConfig;
    if (!this.hasClearance(position, capsuleHalfHeight)) return false;
    const standing = capsuleHalfHeight + capsuleRadius;
    const surface = this.castBullet(
      position,
      { x: 0, y: -1, z: 0 },
      standing + 0.12,
      true,
    );
    return (
      !!surface &&
      surface.normal.y >= Math.SQRT1_2 &&
      surface.distance >= standing + collisionOffset * 0.5
    );
  }

  private hasClearance(position: Vector3Like, halfHeight: number): boolean {
    this.clearanceShape.halfHeight = halfHeight;
    return (
      this.world.intersectionWithShape(
        position,
        identityRotation,
        this.clearanceShape,
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        this.collider,
        this.character,
      ) === null
    );
  }

  /** Resize around fixed feet; the body retains its standing-center anchor. */
  resize(halfHeight: number): boolean {
    halfHeight = Math.max(
      movementConfig.diveHalfHeight,
      Math.min(movementConfig.capsuleHalfHeight, halfHeight),
    );
    if (halfHeight > this.currentHalfHeight && !this.canOccupy(halfHeight))
      return false;
    this.collider.setHalfHeight(halfHeight);
    this.collider.setTranslationWrtParent({
      x: 0,
      y: halfHeight - movementConfig.capsuleHalfHeight,
      z: 0,
    });
    // Rapier updates parent-relative transforms during step(). KCC queries happen before that,
    // so publish the corresponding world transform now to avoid a one-tick downward snap.
    this.queryPosition.x = this.position.x;
    this.queryPosition.y =
      this.position.y + halfHeight - movementConfig.capsuleHalfHeight;
    this.queryPosition.z = this.position.z;
    this.collider.setTranslation(this.queryPosition);
    this.currentHalfHeight = halfHeight;
    return true;
  }

  /** Short horizontal rays, queried only for requested airborne wall jumps. */
  findWall(): WallContact | null {
    this.wallRay.origin.x = this.position.x;
    this.wallRay.origin.y =
      this.position.y +
      this.currentHalfHeight -
      movementConfig.capsuleHalfHeight;
    this.wallRay.origin.z = this.position.z;
    let closest = movementConfig.capsuleRadius + movementConfig.wallReach;
    let found = false;
    for (const [x, z] of wallDirections) {
      this.wallRay.dir.x = x;
      this.wallRay.dir.z = z;
      const hit = this.world.castRayAndGetNormal(
        this.wallRay,
        closest,
        true,
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        this.collider,
        this.character,
      );
      if (!hit || Math.abs(hit.normal.y) > 0.2) continue;
      closest = hit.timeOfImpact;
      this.wallContact.x = hit.normal.x;
      this.wallContact.y = 0;
      this.wallContact.z = hit.normal.z;
      this.wallContact.colliderHandle = hit.collider.handle;
      found = true;
    }
    return found ? this.wallContact : null;
  }

  addSensorBox(position: Vector3Like, size: Vector3Like): number {
    return this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
        .setTranslation(position.x, position.y, position.z)
        .setSensor(true),
    ).handle;
  }

  setColliderEnabled(handle: number, enabled: boolean): void {
    this.world.getCollider(handle)?.setEnabled(enabled);
  }

  /** Local practice hitscan includes target sensors, but excludes the player's own body. */
  castBullet(
    origin: Vector3Like,
    direction: Vector3Like,
    range: number,
    solidsOnly = false,
  ): BulletHit | null {
    Object.assign(this.bulletRay.origin, origin);
    Object.assign(this.bulletRay.dir, direction);
    const hit = this.world.castRayAndGetNormal(
      this.bulletRay,
      range,
      true,
      solidsOnly ? RAPIER.QueryFilterFlags.EXCLUDE_SENSORS : undefined,
      undefined,
      this.collider,
      this.character,
    );
    if (!hit) return null;
    this.bulletHit.colliderHandle = hit.collider.handle;
    this.bulletHit.distance = hit.timeOfImpact;
    this.bulletHit.point.x = origin.x + direction.x * hit.timeOfImpact;
    this.bulletHit.point.y = origin.y + direction.y * hit.timeOfImpact;
    this.bulletHit.point.z = origin.z + direction.z * hit.timeOfImpact;
    Object.assign(this.bulletHit.normal, hit.normal);
    return this.bulletHit;
  }

  dispose(): void {
    this.world.free();
  }
}
