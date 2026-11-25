import {
  BoxGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  type Scene,
} from 'three';
import { combatConfig, type HitRegion } from '@breakpoint/shared';
import { avatarParts } from '@breakpoint/shared/avatar';
import type { PhysicsWorld } from '../physics/PhysicsWorld';

/** Holographic local target: sensors allow movement training to pass through it. */
export class TrainingDummy {
  health: number = combatConfig.dummyHealth;
  readonly aimPoint = { x: 0, y: 0, z: 0 };
  readonly position = { x: 0, y: 0, z: -6 };
  private resetTimer = 0;
  private flash = 0;
  private readonly regions = new Map<number, HitRegion>();
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly material = new MeshBasicMaterial();
  private readonly mesh: InstancedMesh;
  private readonly poseMatrix = new Matrix4();
  private readonly poseColor = new Color();

  constructor(
    private readonly physics: PhysicsWorld,
    scene: Scene,
  ) {
    // A larger stationary version of the same eleven-region rig used online.
    const body = avatarParts.filter((part) => part.region !== null);
    const parts = [
      ...body.map((part) => {
        const [x, y, z] = part.position,
          [sx, sy, sz] = part.size;
        return [
          x * 1.25,
          y * 1.25 + 0.05,
          z * 1.25,
          sx * 1.25,
          sy * 1.25,
          sz * 1.25,
          part.region === 'head'
            ? 0xe3aa6c
            : part.region!.includes('Torso')
              ? 0x5b91a7
              : 0x385e70,
        ] as const;
      }),
      [0, 1.49, -0.2, 0.28, 0.28, 0.02, 0xb1d2d1],
      [0, 0.02, 0, 1.4, 0.04, 1.2, 0x335261],
    ] as const;
    this.mesh = new InstancedMesh(this.geometry, this.material, parts.length);
    const matrix = new Matrix4();
    const color = new Color();
    parts.forEach(([x, y, z, sx, sy, sz, tint], index) => {
      const targetZ = z + this.position.z;
      matrix.makeScale(sx, sy, sz).setPosition(x, y, targetZ);
      this.mesh.setMatrixAt(index, matrix);
      this.mesh.setColorAt(index, color.setHex(tint));
      const region = body[index]?.region;
      if (region === 'upperTorso')
        Object.assign(this.aimPoint, { x, y, z: targetZ });
      if (region)
        this.regions.set(
          physics.addSensorBox({ x, y, z: targetZ }, { x: sx, y: sy, z: sz }),
          region,
        );
    });
    this.mesh.computeBoundingSphere();
    scene.add(this.mesh);
  }

  get resetting(): boolean {
    return this.resetTimer > 0;
  }
  setVisible(visible: boolean): void {
    this.mesh.visible = visible && !this.resetting;
    this.enableSensors(visible && !this.resetting);
  }
  region(handle: number): HitRegion | null {
    return this.regions.get(handle) ?? null;
  }

  captureEliminationPose(write: (matrix: Matrix4, tint: number) => void): void {
    for (let i = 0; i < this.regions.size; i++) {
      this.mesh.getMatrixAt(i, this.poseMatrix);
      this.mesh.getColorAt(i, this.poseColor);
      write(this.poseMatrix, this.poseColor.getHex());
    }
  }

  private enableSensors(enabled: boolean): void {
    for (const handle of this.regions.keys())
      this.physics.setColliderEnabled(handle, enabled);
  }

  damage(amount: number): void {
    if (this.resetting || amount <= 0) return;
    this.health = Math.max(0, this.health - amount);
    this.flash = 0.1;
    if (this.health === 0) {
      this.resetTimer = combatConfig.dummyResetTime;
      this.mesh.visible = false;
      this.enableSensors(false);
    }
  }

  step(dt: number): void {
    this.flash = Math.max(0, this.flash - dt);
    this.material.color.setHex(this.flash > 0 ? 0xffc793 : 0xffffff);
    if (this.resetTimer <= 0) return;
    this.resetTimer = Math.max(0, this.resetTimer - dt);
    if (this.resetTimer === 0) {
      this.health = combatConfig.dummyHealth;
      this.mesh.visible = true;
      this.enableSensors(true);
    }
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}
