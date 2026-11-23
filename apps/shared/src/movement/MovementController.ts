import {
  capHorizontalSpeed,
  movementConfig,
  updateGroundVelocity,
  type MovementInput,
  type MovementState,
  type Vector3Like,
} from '../index';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { walk } from './Walking';
import { sprint, wantsSprint } from './Sprinting';
import { slide, startSlide } from './Sliding';
import { startBackslide } from './Backsliding';
import { wantsSlideCancel } from './SlideCancel';
import { airMove, bunnyHop } from './BunnyHop';
import { dive, startDive } from './DolphinDive';
import { wallJump } from './WallJump';
import { redirectSlideMomentum } from './SlideJump';

/** One velocity owner. States apply forces; the controller integrates vertical motion. */
export class MovementController {
  readonly velocity: Vector3Like = { x: 0, y: 0, z: 0 };
  readonly previousPosition: Vector3Like;
  state: MovementState = 'walking';
  stateTime = 0;
  eyeOffset: number = movementConfig.eyeOffset;
  previousEyeOffset: number = movementConfig.eyeOffset;
  wallJumps = 0;
  private readonly displacement: Vector3Like = { x: 0, y: 0, z: 0 };
  private readonly wish: Vector3Like = { x: 0, y: 0, z: 0 };
  private slideCooldown = 0;
  private diveCooldown = 0;
  private wallCooldown = 0;
  private coyote = 0;
  private jumpBuffer = 0;
  private jumpYaw = 0;
  private slideJumpGrace = 0;
  private slideJumpSpeed = 0;
  private slideBuffer = 0;
  private diveBuffer = 0;
  private sprintGrace = 0;
  private lastWall: number | null = null;
  private wasGrounded = false;
  private recoveryDuration: number = movementConfig.slideRecovery;
  private recoveryHalfHeight: number = movementConfig.slideHalfHeight;
  private recoveringFromDive = false;

  constructor(readonly physics: PhysicsWorld) {
    this.previousPosition = { ...physics.position };
  }

  private transition(state: MovementState): void {
    if (state === this.state) return;
    if (this.state === 'sliding' || this.state === 'backsliding') {
      this.slideCooldown = movementConfig.slideCooldown;
      if (state === 'recovering') {
        this.slideJumpGrace = movementConfig.slideJumpTransitionWindow;
        this.slideJumpSpeed = Math.hypot(this.velocity.x, this.velocity.z);
      }
    }
    if (
      state === 'airborne' ||
      state === 'diving' ||
      state === 'sliding' ||
      state === 'backsliding' ||
      state === 'crouching' ||
      state === 'prone'
    )
      this.clearSlideJump();
    if (this.state === 'diving')
      this.diveCooldown = movementConfig.diveCooldown;
    this.state = state;
    this.stateTime = 0;
  }

  private recover(fromDive = false): void {
    this.recoveringFromDive = fromDive;
    this.recoveryDuration = fromDive
      ? movementConfig.diveRecovery
      : movementConfig.slideRecovery;
    this.recoveryHalfHeight = this.physics.halfHeight;
    this.transition('recovering');
  }

  private clearSlideJump(): void {
    this.slideJumpGrace = 0;
    this.slideJumpSpeed = 0;
  }

  step(input: MovementInput, dt: number, groundSpeedScale = 1): void {
    Object.assign(this.previousPosition, this.physics.position);
    this.previousEyeOffset = this.eyeOffset;
    this.stateTime += dt;
    this.slideCooldown = Math.max(0, this.slideCooldown - dt);
    this.diveCooldown = Math.max(0, this.diveCooldown - dt);
    this.wallCooldown = Math.max(0, this.wallCooldown - dt);
    this.slideJumpGrace = Math.max(0, this.slideJumpGrace - dt);
    if (this.slideJumpGrace > 0)
      this.slideJumpSpeed *= Math.exp(-movementConfig.slideFriction * dt);
    else this.slideJumpSpeed = 0;
    if (input.jumpPressed) this.jumpYaw = input.yaw;
    this.jumpBuffer = input.jumpPressed
      ? movementConfig.jumpBuffer
      : Math.max(0, this.jumpBuffer - dt);
    // Buffer eligible taps across contact/cooldown boundaries, not a boost
    // pressed at rest that becomes eligible only during the faster sprint ramp.
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    const isSlide = this.state === 'sliding' || this.state === 'backsliding';
    const backslide =
      !!input.sprint && input.forward < 0 && this.sprintGrace > 0;
    const sprintSpeed = speed >= movementConfig.slideMinimumSpeed;
    const canStartSlide =
      (wantsSprint(input) &&
        sprintSpeed &&
        (this.state === 'sprinting' || this.sprintGrace > 0)) ||
      backslide;
    this.slideBuffer = input.slidePressed
      ? isSlide || canStartSlide
        ? movementConfig.actionBuffer
        : 0
      : Math.max(0, this.slideBuffer - dt);
    this.diveBuffer = input.divePressed
      ? isSlide || sprintSpeed || backslide
        ? movementConfig.actionBuffer
        : 0
      : Math.max(0, this.diveBuffer - dt);
    this.sprintGrace = Math.max(0, this.sprintGrace - dt);
    const grounded = this.physics.grounded;
    this.coyote = grounded
      ? movementConfig.coyoteTime
      : Math.max(0, this.coyote - dt);
    if (grounded && !this.wasGrounded) {
      this.wallJumps = 0;
      this.lastWall = null;
    }
    if (grounded && wantsSprint(input) && sprintSpeed) {
      this.sprintGrace = movementConfig.backslideGrace;
    }
    if (
      isSlide &&
      (this.stateTime >= movementConfig.slideDuration ||
        wantsSlideCancel(this.slideBuffer > 0, this.stateTime))
    ) {
      this.slideBuffer = 0;
      this.recover();
    }
    if (
      this.state === 'diving' &&
      this.stateTime >= movementConfig.diveDuration &&
      grounded
    )
      this.recover(true);

    // Jump precedes ground friction, preserving takeoff and slide-cancel momentum.
    let launched = false;
    let slideLaunched = false;
    const jumpWanted = input.jump || this.jumpBuffer > 0;
    const jumpAllowed =
      this.state !== 'diving' &&
      !(
        this.state === 'recovering' &&
        this.recoveringFromDive &&
        this.stateTime < this.recoveryDuration
      );
    if (
      jumpWanted &&
      this.coyote > 0 &&
      jumpAllowed &&
      this.physics.canStand()
    ) {
      const activeSlide =
        this.state === 'sliding' || this.state === 'backsliding';
      const recentSlide = this.slideJumpGrace > 0 && this.slideJumpSpeed > 0;
      const momentum = Math.max(
        Math.hypot(this.velocity.x, this.velocity.z),
        recentSlide ? this.slideJumpSpeed : 0,
      );
      slideLaunched =
        (activeSlide || recentSlide) &&
        redirectSlideMomentum(
          this.velocity,
          this.jumpBuffer > 0 ? this.jumpYaw : input.yaw,
          momentum,
        );
      if (slideLaunched)
        this.velocity.y = movementConfig.slideJumpVerticalImpulse;
      else bunnyHop(this.velocity);
      this.clearSlideJump();
      this.transition('airborne');
      this.coyote = 0;
      this.jumpBuffer = 0;
      launched = true;
    } else if (
      this.jumpBuffer > 0 &&
      !grounded &&
      jumpAllowed &&
      this.wallCooldown === 0 &&
      this.wallJumps < movementConfig.maxWallJumps
    ) {
      const wall = this.physics.findWall();
      if (wall && wall.colliderHandle !== this.lastWall) {
        wallJump(this.velocity, wall);
        this.wallJumps++;
        this.lastWall = wall.colliderHandle;
        this.wallCooldown = movementConfig.wallJumpCooldown;
        this.jumpBuffer = 0;
        this.coyote = 0;
        this.transition('airborne');
        launched = true;
      }
    }

    const normalState = this.state === 'walking' || this.state === 'sprinting';
    if (!launched && grounded) {
      if (input.pronePressed) {
        if (normalState || this.state === 'crouching') {
          this.slideBuffer = this.diveBuffer = 0;
          this.transition('prone');
        } else if (this.state === 'prone' && this.physics.canStand()) {
          this.transition('walking');
        }
      } else if (input.slidePressed && !isSlide) {
        if (
          this.state === 'prone' &&
          this.physics.canOccupy(movementConfig.crouchHalfHeight)
        ) {
          this.transition('crouching');
        } else if (this.state === 'crouching' && this.physics.canStand()) {
          this.transition('walking');
        } else if (normalState && !wantsSprint(input) && !canStartSlide) {
          this.slideBuffer = 0;
          this.transition('crouching');
        }
      }
    }
    if (
      !launched &&
      grounded &&
      normalState &&
      (this.state === 'walking' || this.state === 'sprinting') &&
      input.sprint &&
      (sprintSpeed || backslide)
    ) {
      if (this.diveBuffer > 0 && this.diveCooldown === 0 && input.forward > 0) {
        this.slideBuffer = 0;
        this.diveBuffer = 0;
        startDive(this.velocity);
        this.transition('diving');
        this.coyote = 0;
        launched = true;
      } else if (
        canStartSlide &&
        this.slideBuffer > 0 &&
        this.slideCooldown === 0
      ) {
        this.slideBuffer = 0;
        this.diveBuffer = 0;
        if (input.forward < 0) {
          startBackslide(this.velocity, input.yaw);
          this.transition('backsliding');
        } else {
          startSlide(this.velocity);
          this.transition('sliding');
        }
      }
    }

    if (
      this.state === 'recovering' &&
      this.stateTime >= this.recoveryDuration &&
      this.physics.canStand() &&
      this.physics.halfHeight >= movementConfig.capsuleHalfHeight - 0.0001
    ) {
      this.transition(
        grounded ? (wantsSprint(input) ? 'sprinting' : 'walking') : 'airborne',
      );
    }
    if (
      this.state === 'walking' ||
      this.state === 'sprinting' ||
      this.state === 'airborne'
    ) {
      this.transition(
        !grounded || launched
          ? 'airborne'
          : wantsSprint(input)
            ? 'sprinting'
            : 'walking',
      );
    }
    switch (this.state) {
      case 'walking':
        if (groundSpeedScale < 1)
          updateGroundVelocity(
            this.velocity,
            input,
            dt,
            movementConfig.walkSpeed * Math.max(0.2, groundSpeedScale),
          );
        else walk(this.velocity, input, dt);
        break;
      case 'sprinting':
        sprint(this.velocity, input, dt);
        break;
      case 'crouching':
      case 'prone':
        if (grounded)
          updateGroundVelocity(
            this.velocity,
            input,
            dt,
            (this.state === 'prone'
              ? movementConfig.proneSpeed
              : movementConfig.crouchSpeed) * Math.max(0.2, groundSpeedScale),
          );
        else airMove(this.velocity, input, dt, this.wish);
        break;
      case 'sliding':
      case 'backsliding':
        slide(this.velocity, input, dt, this.wish);
        break;
      case 'diving':
        dive(this.velocity, grounded && !launched, dt);
        break;
      case 'recovering':
        if (grounded)
          updateGroundVelocity(
            this.velocity,
            input,
            dt,
            movementConfig.recoverySpeed,
            movementConfig.groundAcceleration,
            true,
          );
        else airMove(this.velocity, input, dt, this.wish);
        break;
      case 'airborne':
        // Honor the captured launch vector for this tick. Ordinary air steering
        // resumes next tick; strafing input cannot overwrite the facing launch.
        if (!slideLaunched) airMove(this.velocity, input, dt, this.wish);
        break;
    }
    capHorizontalSpeed(this.velocity);

    let targetHalfHeight: number = movementConfig.capsuleHalfHeight;
    if (this.state === 'sliding' || this.state === 'backsliding')
      targetHalfHeight = movementConfig.slideHalfHeight;
    if (this.state === 'diving')
      targetHalfHeight = movementConfig.diveHalfHeight;
    if (this.state === 'crouching')
      targetHalfHeight = movementConfig.crouchHalfHeight;
    if (this.state === 'prone')
      targetHalfHeight = movementConfig.proneHalfHeight;
    if (this.state === 'recovering' && this.stateTime < this.recoveryDuration)
      targetHalfHeight = this.recoveryHalfHeight;
    const heightDelta = Math.max(
      -movementConfig.postureSpeed * dt,
      Math.min(
        movementConfig.postureSpeed * dt,
        targetHalfHeight - this.physics.halfHeight,
      ),
    );
    if (Math.abs(heightDelta) > 0.00001)
      this.physics.resize(this.physics.halfHeight + heightDelta);
    this.eyeOffset =
      movementConfig.eyeOffset -
      2 * (movementConfig.capsuleHalfHeight - this.physics.halfHeight);

    if (grounded && !launched) this.velocity.y = 0;
    this.velocity.y -= movementConfig.gravity * dt;
    this.displacement.x = this.velocity.x * dt;
    this.displacement.y = this.velocity.y * dt;
    this.displacement.z = this.velocity.z * dt;
    const requestedSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    this.physics.move(this.displacement);
    this.velocity.x = (this.physics.position.x - this.previousPosition.x) / dt;
    this.velocity.z = (this.physics.position.z - this.previousPosition.z) / dt;
    // Collision separation may add tiny tangential corrections; it must not
    // become extra movement energy on the following tick.
    capHorizontalSpeed(this.velocity, requestedSpeed);
    if (this.slideJumpGrace > 0 && requestedSpeed > 0.00001) {
      // Keep the bank independent of BP-02's input braking, but honor momentum
      // lost to an actual obstacle during the short transition window.
      this.slideJumpSpeed *= Math.min(
        1,
        Math.hypot(this.velocity.x, this.velocity.z) / requestedSpeed,
      );
      if (this.slideJumpSpeed < 0.00001) this.clearSlideJump();
    }
    if (this.physics.grounded || this.physics.hitCeiling) this.velocity.y = 0;
    this.wasGrounded = grounded;
  }

  /** Pausing freezes state timers and velocity, while clearing interpolation and buffered actions. */
  synchronize(): void {
    Object.assign(this.previousPosition, this.physics.position);
    this.previousEyeOffset = this.eyeOffset;
    this.jumpBuffer = 0;
    this.jumpYaw = 0;
    this.slideBuffer = 0;
    this.diveBuffer = 0;
  }

  stop(): void {
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.velocity.z = 0;
    this.clearSlideJump();
    this.synchronize();
  }

  capture() {
    return {
      position: { ...this.physics.position },
      halfHeight: this.physics.halfHeight,
      grounded: this.physics.grounded,
      velocity: { ...this.velocity },
      state: this.state,
      stateTime: this.stateTime,
      eyeOffset: this.eyeOffset,
      wallJumps: this.wallJumps,
      slideCooldown: this.slideCooldown,
      diveCooldown: this.diveCooldown,
      wallCooldown: this.wallCooldown,
      coyote: this.coyote,
      jumpBuffer: this.jumpBuffer,
      jumpYaw: this.jumpYaw,
      slideJumpGrace: this.slideJumpGrace,
      slideJumpSpeed: this.slideJumpSpeed,
      slideBuffer: this.slideBuffer,
      diveBuffer: this.diveBuffer,
      sprintGrace: this.sprintGrace,
      lastWall: this.lastWall,
      wasGrounded: this.wasGrounded,
      recoveryDuration: this.recoveryDuration,
      recoveryHalfHeight: this.recoveryHalfHeight,
      recoveringFromDive: this.recoveringFromDive,
    };
  }

  restore(snapshot: MovementSnapshot): void {
    const { position, halfHeight, grounded, velocity, ...rules } = snapshot;
    this.physics.restore(position, halfHeight, grounded);
    Object.assign(this.velocity, velocity);
    Object.assign(this, rules);
    Object.assign(this.previousPosition, position);
    this.previousEyeOffset = this.eyeOffset;
  }
}

export type MovementSnapshot = ReturnType<MovementController['capture']>;
