import {
  BoxGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  type Scene,
} from 'three';
import type { Vector3Like } from '@breakpoint/shared';

export class PooledImpacts {
  private readonly capacity = 32;
  private readonly life = new Float32Array(this.capacity);
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly material = new MeshBasicMaterial({ color: 0xefc798 });
  private readonly mesh = new InstancedMesh(
    this.geometry,
    this.material,
    this.capacity,
  );
  private readonly matrix = new Matrix4();
  private cursor = 0;

  constructor(scene: Scene) {
    this.mesh.frustumCulled = false;
    this.matrix.makeScale(0, 0, 0);
    for (let i = 0; i < this.capacity; i++)
      this.mesh.setMatrixAt(i, this.matrix);
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  spawn(point: Vector3Like, normal: Vector3Like): void {
    this.life[this.cursor] = 0.65;
    this.matrix
      .makeScale(0.045, 0.045, 0.045)
      .setPosition(
        point.x + normal.x * 0.018,
        point.y + normal.y * 0.018,
        point.z + normal.z * 0.018,
      );
    this.mesh.setMatrixAt(this.cursor, this.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.visible = true;
    this.cursor = (this.cursor + 1) % this.capacity;
  }

  step(dt: number): void {
    let active = false;
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i]! <= 0) continue;
      this.life[i] = Math.max(0, this.life[i]! - dt);
      if (this.life[i] === 0) {
        this.matrix.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, this.matrix);
        this.mesh.instanceMatrix.needsUpdate = true;
      } else active = true;
    }
    this.mesh.visible = active;
  }

  clear(): void {
    this.life.fill(0);
    this.matrix.makeScale(0, 0, 0);
    for (let i = 0; i < this.capacity; i++)
      this.mesh.setMatrixAt(i, this.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}
