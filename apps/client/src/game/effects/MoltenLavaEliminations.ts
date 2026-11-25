import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  type Scene,
} from 'three';
import { shotRandom, type Vector3Like } from '@breakpoint/shared';

const burstSlots = 4;
const blocksPerBurst = 56;
const lifetime = 1.24;
const turn = 2 * Math.PI;
const coal = 0x76231b;
const scarlet = 0xdf320b;
const orange = 0xff7716;
const amber = 0xffb928;
const cream = 0xffe884;

/** One instanced draw for the ground wave, flame column, and flying embers. */
export class MoltenLavaEliminations {
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly material = new MeshBasicMaterial({ toneMapped: false });
  private readonly mesh = new InstancedMesh(
    this.geometry,
    this.material,
    burstSlots * blocksPerBurst,
  );
  private readonly transform = new Object3D();
  private readonly tint = new Color();
  private readonly bursts = Array.from({ length: burstSlots }, () => ({
    origin: { x: 0, y: 0, z: 0 },
    age: lifetime,
    scale: 1,
    seed: 0,
  }));
  private cursor = 0;
  private sequence = 0;

  constructor(scene: Scene) {
    this.mesh.name = 'molten-lava-eliminations';
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.setColorAt(0, this.tint);
    this.mesh.instanceColor!.setUsage(DynamicDrawUsage);
    scene.add(this.mesh);
  }

  spawn(position: Vector3Like, reducedMotion: boolean): void {
    const burst = this.bursts[this.cursor]!;
    Object.assign(burst.origin, position);
    burst.age = 0;
    burst.scale = reducedMotion ? 0.6 : 1;
    burst.seed = ++this.sequence * 487;
    this.cursor = (this.cursor + 1) % burstSlots;
  }

  step(dt: number): void {
    this.mesh.count = 0;
    for (const burst of this.bursts) {
      if (burst.age >= lifetime) continue;
      burst.age += dt;
      if (burst.age < lifetime) this.drawBurst(burst);
    }
    this.mesh.visible = this.mesh.count > 0;
    if (!this.mesh.visible) return;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
  }

  private drawBurst({
    origin,
    age,
    scale,
    seed,
  }: (typeof this.bursts)[number]): void {
    const rotate = shotRandom(seed) * turn;
    const heat = Math.max(0, 1 - age / lifetime);
    const wave = 1 - Math.exp(-age * 7);
    const radius = (0.12 + wave * 1.03) * scale;

    // A broken ring rolls out along the ground. Shorter inner fragments cool to dark red.
    for (let i = 0; i < 16; i++) {
      const angle = rotate + (i * turn) / 16;
      const ripple = radius * (i % 3 === 0 ? 0.82 : 1);
      const pulse = heat ** 1.5;
      this.block(
        origin,
        Math.cos(angle) * ripple,
        0.035,
        Math.sin(angle) * ripple,
        (0.12 + 0.25 * pulse) * scale,
        (0.024 + 0.06 * pulse) * scale,
        0.22 * pulse * scale,
        -angle,
        0,
        age < 0.21 ? (i % 3 ? orange : cream) : age < 0.53 ? scarlet : coal,
      );
    }
    for (let i = 0; i < 8; i++) {
      const angle = rotate + (i * turn) / 8;
      const fragment = (0.12 + 0.46 * shotRandom(seed + i + 2)) * scale;
      const width = (0.14 + 0.24 * shotRandom(seed + 32 + i)) * heat * scale;
      this.block(
        origin,
        Math.cos(angle) * fragment,
        0.045,
        Math.sin(angle) * fragment,
        width,
        0.045 * heat,
        width * 1.6,
        angle,
        0,
        age < 0.27 ? amber : age < 0.62 ? scarlet : coal,
      );
    }

    // Stack dark petals around a bright core. The plume rises and separates as it cools.
    if (age < 0.79) {
      const shape = Math.min(1, age * 17 + 0.4) * (1 - age / 0.79) ** 1.5;
      const rise = 1 - Math.exp(-age * 11);
      if (age < 0.42) {
        const flare = shape * scale * (1 - age / 0.42);
        this.block(
          origin,
          0,
          (0.79 + 0.72 * rise) * scale,
          0,
          0.82 * flare,
          (1.05 + rise) * flare,
          0.62 * flare,
          rotate + age * 3,
          0.18,
          scarlet,
        );
        this.block(
          origin,
          0,
          (1.15 + 0.58 * rise) * scale,
          0,
          0.47 * flare,
          (1.02 + rise) * flare,
          0.42 * flare,
          rotate - age * 2,
          -0.16,
          cream,
        );
      }
      for (let i = 0; i < 10; i++) {
        const angle = rotate + i * 2.4 + age * 1.6;
        const tier = Math.floor(i / 2);
        const edge = i % 2 === 1;
        const width = (0.47 - tier * 0.04) * shape * scale;
        const sway = (edge ? 0.3 : 0.11) * (0.5 + rise) * scale;
        const elevation =
          ((0.18 + tier * 0.22) * (0.65 + rise) + age * 1.86) * scale;
        const color = edge
          ? age < 0.27
            ? orange
            : scarlet
          : age < 0.18
            ? cream
            : amber;
        this.block(
          origin,
          Math.cos(angle) * sway,
          elevation,
          Math.sin(angle) * sway,
          width,
          (0.42 + 0.18 * rise) * shape * scale,
          width * 0.86,
          angle,
          shape * 0.22,
          color,
        );
      }
    }

    // Glowing fragments trace short arcs away from the defeated target.
    for (let i = 0; i < 20; i++) {
      const speed = 0.72 + shotRandom(seed + 71 + i) * 1.04;
      const start = 0.04 + (i % 5) * 0.062;
      const flight = age - start;
      if (flight < 0) continue;
      const y =
        0.31 +
        (2.55 + shotRandom(seed + 110 + i) * 2.04) * flight -
        3.48 * flight * flight;
      if (y < 0.05) continue;
      const angle = rotate + i * 2.4;
      const distance = (0.1 + flight * speed) * scale;
      const size = ((i % 4 === 0 ? 0.093 : 0.051) * heat + 0.014) * scale;
      this.block(
        origin,
        Math.cos(angle) * distance,
        y * scale,
        Math.sin(angle) * distance,
        size,
        size * (i % 4 ? 1.6 : 2.2),
        size,
        angle,
        flight * 4 + i * 0.4,
        flight < 0.16 ? (i % 4 ? cream : amber) : flight < 0.49 ? orange : coal,
      );
    }
  }

  private block(
    origin: Vector3Like,
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    yaw: number,
    tilt: number,
    color: number,
  ): void {
    this.transform.position.set(origin.x + x, origin.y + y, origin.z + z);
    this.transform.scale.set(width, height, depth);
    this.transform.rotation.set(tilt, yaw, tilt * 0.38);
    this.transform.updateMatrix();
    const slot = this.mesh.count++;
    this.mesh.setMatrixAt(slot, this.transform.matrix);
    this.mesh.setColorAt(slot, this.tint.setHex(color));
  }

  clear(): void {
    for (const burst of this.bursts) burst.age = lifetime;
    this.mesh.count = 0;
    this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}
