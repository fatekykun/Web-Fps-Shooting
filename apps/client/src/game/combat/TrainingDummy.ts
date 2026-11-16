import {
  BoxGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  type Scene,
} from 'three';
import { combatConfig } from '@breakpoint/shared';
import type { PhysicsWorld } from '../physics/PhysicsWorld';

/** Holographic local target: sensors allow movement training to pass through it. */
export class TrainingDummy {
  health: number = combatConfig.dummyHealth;
  private resetTimer = 0;
  private flash = 0;
  private readonly head: number;
  private readonly body: number;
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly material = new MeshBasicMaterial();
  private readonly mesh: InstancedMesh;

  constructor(
    private readonly physics: PhysicsWorld,
    scene: Scene,
  ) {
    this.body = physics.addSensorBox(
      { x: 0, y: 1.23, z: -6 },
      { x: 0.72, y: 0.9, z: 0.34 },
    );
    this.head = physics.addSensorBox(
      { x: 0, y: 1.9, z: -6 },
      { x: 0.4, y: 0.4, z: 0.4 },
    );
    const parts = [
      [0, 1.23, 0, 0.72, 0.9, 0.34, 0x5b91a7],
      [0, 1.9, 0, 0.4, 0.4, 0.4, 0xe3aa6c],
      [-0.24, 0.38, 0, 0.22, 0.76, 0.26, 0x385e70],
      [0.24, 0.38, 0, 0.22, 0.76, 0.26, 0x385e70],
      [-0.48, 1.22, 0, 0.18, 0.8, 0.24, 0x385e70],
      [0.48, 1.22, 0, 0.18, 0.8, 0.24, 0x385e70],
      [0, 1.3, 0.18, 0.28, 0.28, 0.02, 0xb1d2d1],
      [0, 0.02, 0, 1.4, 0.04, 1.2, 0x335261],
    ] as const;
    this.mesh = new InstancedMesh(this.geometry, this.material, parts.length);
    const matrix = new Matrix4();
    const color = new Color();
    parts.forEach(([x, y, z, sx, sy, sz, tint], index) => {
      matrix.makeScale(sx, sy, sz).setPosition(x, y, z - 6);
      this.mesh.setMatrixAt(index, matrix);
      this.mesh.setColorAt(index, color.setHex(tint));
    });
    this.mesh.computeBoundingSphere();
    scene.add(this.mesh);
  }

  get resetting(): boolean {
    return this.resetTimer > 0;
  }
  setVisible(visible: boolean): void {
    this.mesh.visible = visible && !this.resetting;
    this.physics.setColliderEnabled(this.head, visible && !this.resetting);
    this.physics.setColliderEnabled(this.body, visible && !this.resetting);
  }
  region(handle: number): 'head' | 'body' | null {
    return handle === this.head ? 'head' : handle === this.body ? 'body' : null;
  }

  damage(amount: number): void {
    if (this.resetting || amount <= 0) return;
    this.health = Math.max(0, this.health - amount);
    this.flash = 0.1;
    if (this.health === 0) {
      this.resetTimer = combatConfig.dummyResetTime;
      this.mesh.visible = false;
      this.physics.setColliderEnabled(this.head, false);
      this.physics.setColliderEnabled(this.body, false);
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
      this.physics.setColliderEnabled(this.head, true);
      this.physics.setColliderEnabled(this.body, true);
    }
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}
