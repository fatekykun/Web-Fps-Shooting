import {
  BoxGeometry,
  DynamicDrawUsage,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  Vector3,
  type Scene,
} from 'three';
import type { Vector3Like } from '@breakpoint/shared';

/** Fixed pool, one draw, no lights. Only server-confirmed traces enter this pool. */
export class ShotTrails {
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly material = new MeshBasicMaterial({ color: 0xeec789 });
  private readonly mesh = new InstancedMesh(this.geometry, this.material, 64);
  private readonly slots = Array.from({ length: 64 }, () => ({
    life: 0,
    from: new Vector3(),
    to: new Vector3(),
  }));
  private readonly transform = new Object3D();
  private readonly direction = new Vector3();
  private readonly up = new Vector3(0, 0, 1);
  private cursor = 0;
  constructor(scene: Scene) {
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    scene.add(this.mesh);
  }
  spawn(from: Vector3Like, to: Vector3Like): void {
    const slot = this.slots[this.cursor++ % this.slots.length]!;
    slot.from.set(from.x, from.y, from.z);
    slot.to.set(to.x, to.y, to.z);
    slot.life = 0.09;
  }
  step(dt: number): void {
    let count = 0;
    for (const slot of this.slots) {
      slot.life = Math.max(0, slot.life - dt);
      if (slot.life <= 0) continue;
      this.direction.subVectors(slot.to, slot.from);
      const length = this.direction.length();
      if (length < 0.001) continue;
      this.transform.position.copy(slot.from).add(slot.to).multiplyScalar(0.5);
      this.transform.quaternion.setFromUnitVectors(
        this.up,
        this.direction.multiplyScalar(1 / length),
      );
      this.transform.scale.set(0.012, 0.012, length);
      this.transform.updateMatrix();
      this.mesh.setMatrixAt(count++, this.transform.matrix);
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
  clear(): void {
    for (const slot of this.slots) slot.life = 0;
    this.mesh.count = 0;
  }
}
