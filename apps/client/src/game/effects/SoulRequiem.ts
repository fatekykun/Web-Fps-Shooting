import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  Vector3,
  type Camera,
  type Scene,
} from 'three';
import { shotRandom, type Vector3Like } from '@breakpoint/shared';
import { avatarParts } from '@breakpoint/shared/avatar';
import { createTacticalGeometry } from '../characters/TacticalGeometry';
import type { EliminationQuality } from '../settings/userSettings';
import {
  requiemBlade,
  requiemHalo,
  requiemSurface,
} from './SoulRequiemVisuals';

// Seconds into the supplied 1.79 s WAV. The sharp attack peaks near 0.10 s,
// the low-end reaches its maximum at 0.17 s, and a smaller accent lands at 0.42 s.
export const requiemTimeline = {
  fracture: 0.075,
  rupture: 0.17,
  echo: 0.42,
  collapse: 0.79,
  finalPulse: 1.07,
  ash: 1.3,
  end: 1.79,
} as const;
export type CaptureRequiemPose = (
  write: (matrix: Matrix4, tint: number) => void,
) => void;
type GroundHeight = (x: number, z: number, footY: number) => number | undefined;
const density = {
  low: { voxels: 36, sparks: 14, ring: 12, trail: 2 },
  medium: { voxels: 66, sparks: 26, ring: 20, trail: 4 },
  high: { voxels: 100, sparks: 42, ring: 28, trail: 6 },
} as const;
const slots = 4;
const maxBodyParts = 64;
const bladeCount = 6;
const ashPerBlade = 2;
const innerMarks = 14;
const turn = Math.PI * 2;
const cream = 0xffecae;
const gold = 0xffa32d;
const ember = 0xf2450d;
const coal = 0x4d3240;
const smooth = (x: number) => {
  const n = Math.max(0, Math.min(1, x));
  return n * n * (3 - 2 * n);
};

function slot() {
  return {
    age: requiemTimeline.end as number,
    clock: undefined as (() => number) | undefined,
    origin: new Vector3(),
    yaw: 0,
    seed: 0,
    motion: 1,
    height: 0,
    coreY: 1.12,
    lift: 0.16,
    partCount: 0,
    voxelCount: 0,
    sigilCount: 0,
    detail: density.medium as (typeof density)[EliminationQuality],
    body: Array.from({ length: maxBodyParts }, () => ({
      matrix: new Matrix4(),
      tint: 0x67726d,
    })),
    voxels: Array.from({ length: density.high.voxels }, () => ({
      point: new Vector3(),
      size: 0,
      tint: coal,
      angle: 0,
      speed: 0,
      up: 0,
    })),
    sigil: Array.from(
      { length: density.high.ring + innerMarks * 1.5 + 12 },
      () => ({
        x: 0,
        y: 0,
        z: 0,
        yaw: 0,
        width: 0,
        length: 0,
        tint: gold,
      }),
    ),
  };
}
type Burst = ReturnType<typeof slot>;

/** Pools the rendered death pose and every particle. Physics is used only to seat the sigil. */
export class SoulRequiem {
  private readonly box = new BoxGeometry(1, 1, 1);
  private readonly bodyGeometry = createTacticalGeometry();
  private readonly bladeGeometry = requiemBlade();
  private readonly coreGeometry = new IcosahedronGeometry(0.5, 1);
  private readonly haloGeometry = new PlaneGeometry(1, 1);
  private readonly bodySurface = requiemSurface(
    this.bodyGeometry,
    slots * maxBodyParts,
  );
  private readonly bladeSurface = requiemSurface(
    this.bladeGeometry,
    slots * bladeCount,
    true,
  );
  private readonly ashMaterial = new MeshBasicMaterial({ toneMapped: false });
  private readonly energyMaterial = new MeshBasicMaterial({
    blending: AdditiveBlending,
    transparent: true,
    opacity: 0.84,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly haloMaterial = requiemHalo();
  private readonly body = new InstancedMesh(
    this.bodyGeometry,
    this.bodySurface.material,
    slots * maxBodyParts,
  );
  private readonly blades = new InstancedMesh(
    this.bladeGeometry,
    this.bladeSurface.material,
    slots * bladeCount,
  );
  private readonly ash = new InstancedMesh(
    this.box,
    this.ashMaterial,
    slots * (density.high.voxels + bladeCount * ashPerBlade),
  );
  private readonly energy = new InstancedMesh(
    this.box,
    this.energyMaterial,
    slots * 240,
  );
  private readonly core = new InstancedMesh(
    this.coreGeometry,
    this.ashMaterial,
    slots,
  );
  private readonly halo = new InstancedMesh(
    this.haloGeometry,
    this.haloMaterial,
    slots,
  );
  private readonly haloHeat = new InstancedBufferAttribute(
    new Float32Array(slots),
    1,
  );
  private readonly meshes = [
    this.body,
    this.blades,
    this.ash,
    this.energy,
    this.core,
    this.halo,
  ];
  private readonly light = new PointLight(0xff751b, 0, 4.5, 2);
  private readonly bursts = Array.from({ length: slots }, slot);
  private readonly transform = new Object3D();
  private readonly color = new Color();
  private readonly partScale = new Vector3();
  private readonly matrix = new Matrix4();
  private cursor = 0;
  private sequence = 0;

  constructor(
    private readonly scene: Scene,
    private readonly groundHeight: GroundHeight,
  ) {
    this.haloGeometry.setAttribute('haloHeat', this.haloHeat);
    for (const attribute of [
      this.bodySurface.heat,
      this.bladeSurface.heat,
      this.haloHeat,
    ])
      attribute.setUsage(DynamicDrawUsage);
    for (const mesh of this.meshes) {
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.visible = false;
      scene.add(mesh);
    }
    this.body.name = 'soul-requiem-frozen-pose';
    this.blades.name = 'soul-requiem-blades';
    this.ash.name = 'soul-requiem-disintegration';
    this.energy.name = 'soul-requiem-energy';
    this.halo.renderOrder = 2;
    this.energy.renderOrder = 3;
  }

  configure(quality: EliminationQuality): void {
    if (quality === 'high' && !this.light.parent) this.scene.add(this.light);
    else if (quality !== 'high') this.light.removeFromParent();
  }

  spawn(
    position: Vector3Like,
    quality: EliminationQuality,
    reducedMotion: boolean,
    clock?: () => number,
    capture?: CaptureRequiemPose,
    yaw = 0,
  ): void {
    const burst = this.bursts[this.cursor]!;
    this.cursor = (this.cursor + 1) % slots;
    burst.age = 0;
    burst.clock = clock;
    burst.origin.set(position.x, position.y, position.z);
    burst.seed = ++this.sequence * 1031;
    burst.yaw = yaw;
    burst.motion = reducedMotion ? 0.62 : 1;
    burst.detail = density[quality];
    burst.partCount = 0;
    burst.height = 0;
    const write = (matrix: Matrix4, tint: number) => {
      const piece = burst.body[burst.partCount];
      if (!piece) return;
      piece.matrix.copy(matrix);
      piece.tint = tint;
      burst.height = Math.max(burst.height, matrix.elements[13]! - position.y);
      burst.partCount++;
    };
    capture?.(write);
    if (!burst.partCount) {
      for (const part of avatarParts) {
        if (!part.region) continue;
        this.transform.position
          .set(...part.position)
          .applyAxisAngle(Object3D.DEFAULT_UP, yaw)
          .add(burst.origin);
        this.transform.scale.set(...part.size);
        this.transform.rotation.set(0, yaw, 0);
        this.transform.updateMatrix();
        write(this.transform.matrix, 0x576268);
      }
    }
    burst.coreY = Math.max(0.37, Math.min(1.55, burst.height * 0.67));
    burst.lift = 0.22 * burst.motion;
    this.prepareVoxels(burst);
    this.prepareSigil(burst);
  }

  private prepareVoxels(burst: Burst): void {
    burst.voxelCount = burst.detail.voxels;
    for (let i = 0; i < burst.voxelCount; i++) {
      const voxel = burst.voxels[i]!;
      const part = burst.body[i % burst.partCount]!;
      const seed = burst.seed + i * 13;
      const random = shotRandom(seed);
      voxel.point
        .set(
          random - 0.5,
          shotRandom(seed + 1) - 0.5,
          shotRandom(seed + 2) - 0.5,
        )
        .applyMatrix4(part.matrix);
      this.partScale.setFromMatrixScale(part.matrix);
      voxel.size = Math.min(
        0.14,
        Math.max(
          0.035,
          (this.partScale.x + this.partScale.y + this.partScale.z) *
            (0.11 + random * 0.075),
        ),
      );
      voxel.tint = part.tint;
      voxel.angle =
        Math.atan2(
          voxel.point.z - burst.origin.z,
          voxel.point.x - burst.origin.x,
        ) +
        (random - 0.5) * 1.2;
      voxel.speed = 0.42 + shotRandom(seed + 3) * 1.72;
      voxel.up = 0.43 + shotRandom(seed + 4) * 1.22;
    }
  }

  private prepareSigil(burst: Burst): void {
    const { origin, sigil } = burst;
    const floor = this.groundHeight(origin.x, origin.z, origin.y) ?? origin.y;
    burst.sigilCount = 0;
    const mark = (
      angle: number,
      radius: number,
      width: number,
      length: number,
      tangent: boolean,
      tint: number,
    ) => {
      const x = origin.x + Math.cos(angle) * radius;
      const z = origin.z + Math.sin(angle) * radius;
      const y = this.groundHeight(x, z, floor);
      if (y === undefined || Math.abs(y - floor) > 0.55) return;
      const piece = sigil[burst.sigilCount++]!;
      piece.x = x;
      piece.y = y + 0.021;
      piece.z = z;
      piece.yaw = -angle + (tangent ? 0 : Math.PI / 2);
      piece.width = width;
      piece.length = length;
      piece.tint = tint;
    };
    for (let i = 0; i < burst.detail.ring; i++) {
      const angle = (turn * i) / burst.detail.ring + burst.yaw;
      mark(
        angle,
        0.91,
        0.028,
        3.9 / burst.detail.ring,
        true,
        i % 4 === 0 ? cream : gold,
      );
    }
    for (let i = 0; i < innerMarks; i++) {
      const angle = (turn * i) / innerMarks - burst.yaw;
      mark(angle, 0.57, 0.022, i % 2 ? 0.09 : 0.15, true, ember);
      if (i % 2 === 0) mark(angle - 0.08, 0.53, 0.018, 0.088, false, gold);
    }
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2 + burst.yaw;
      mark(angle, 1.08, 0.044, 0.29, false, gold);
      mark(angle - 0.09, 1.05, 0.041, 0.15, false, cream);
      mark(angle + 0.09, 1.05, 0.041, 0.15, false, cream);
    }
  }

  step(dt: number, camera: Camera): void {
    for (const mesh of this.meshes) mesh.count = 0;
    this.light.intensity = 0;
    for (const burst of this.bursts) {
      if (burst.age >= requiemTimeline.end) continue;
      burst.age = burst.clock?.() ?? burst.age + dt;
      if (burst.age >= requiemTimeline.end) {
        burst.clock = undefined;
        continue;
      }
      this.drawBurst(burst, camera);
    }
    for (const mesh of this.meshes) {
      mesh.visible = mesh.count > 0;
      if (!mesh.visible) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    if (this.body.visible) this.bodySurface.heat.needsUpdate = true;
    if (this.blades.visible) this.bladeSurface.heat.needsUpdate = true;
    if (this.halo.visible) this.haloHeat.needsUpdate = true;
  }

  private drawBurst(burst: Burst, camera: Camera): void {
    const { origin, age, motion, detail } = burst;
    const build = smooth(
      (age - requiemTimeline.fracture) /
        (requiemTimeline.rupture - requiemTimeline.fracture),
    );
    const shatter = Math.max(0, age - requiemTimeline.rupture);
    const collapse = smooth((age - requiemTimeline.collapse) / 0.51);
    const fade =
      1 -
      smooth(
        (age - requiemTimeline.ash) /
          (requiemTimeline.end - requiemTimeline.ash),
      );
    const centerY = origin.y + burst.coreY + build * burst.lift;
    const light =
      (0.2 +
        0.42 * build +
        (age >= requiemTimeline.rupture
          ? Math.exp(-shatter * 9) * 0.72
          : Math.exp(-age * 14) * 0.47)) *
      (1 - collapse);
    if (age < requiemTimeline.ash) {
      const scale = light * 0.29 * motion + 0.032 * (1 - collapse);
      this.instance(
        this.core,
        origin.x,
        centerY,
        origin.z,
        scale,
        scale,
        scale,
        age * 6,
        age * 4,
        cream,
        1,
      );
      this.transform.position.set(origin.x, centerY, origin.z);
      this.transform.quaternion.copy(camera.quaternion);
      const bloom = (0.49 + light * 0.73) * motion;
      this.transform.scale.set(bloom, bloom, 1);
      this.haloHeat.setX(this.halo.count, light * 1.05);
      this.write(this.halo);
    }
    const intensity = light * 5.6 * motion;
    if (this.light.parent && intensity > this.light.intensity) {
      this.light.position.set(origin.x, centerY, origin.z);
      this.light.intensity = intensity;
    }

    if (age < requiemTimeline.rupture) {
      for (let i = 0; i < burst.partCount; i++) {
        const piece = burst.body[i]!;
        this.matrix.copy(piece.matrix);
        this.matrix.elements[13]! += build * burst.lift;
        const index = this.body.count++;
        this.body.setMatrixAt(index, this.matrix);
        this.body.setColorAt(index, this.color.setHex(piece.tint));
        this.bodySurface.heat.setX(
          index,
          0.15 + build * 0.95 + Math.exp(-age * 26) * 0.34,
        );
      }
    } else this.drawVoxels(burst, centerY, shatter, collapse);

    this.drawBlades(burst, centerY, build, shatter, collapse);
    this.wave(burst, centerY, requiemTimeline.fracture, 0.19, 0.62, 0.42, true);
    this.wave(burst, centerY, requiemTimeline.rupture, 0.48, 1.72, 0.89, false);
    this.wave(burst, centerY, requiemTimeline.echo, 0.42, 1.17, 0.63, true);
    this.wave(
      burst,
      centerY,
      requiemTimeline.finalPulse,
      0.25,
      0.92,
      0.68,
      false,
    );
    for (let i = 0; i < detail.sparks; i++) {
      const onset = i % 5 === 0 ? 0 : requiemTimeline.rupture + (i % 3) * 0.042;
      const flight = age - onset;
      if (flight < 0) continue;
      const random = shotRandom(burst.seed + i * 17 + 7);
      const angle = i * 2.39996 + age * collapse * 4;
      const radius =
        (0.12 + Math.min(flight, 0.76) * (0.64 + random * 1.68)) *
        (1 - collapse * 0.7) *
        motion;
      const y =
        centerY +
        ((0.54 + random) * flight -
          flight * flight * 0.48 +
          ((i % 4) - 1.5) * 0.12) *
          motion;
      const size =
        (0.033 + random * 0.038) * (1 - smooth((flight - 0.25) / 1.65)) * fade;
      this.instance(
        this.energy,
        origin.x + Math.cos(angle) * radius,
        y,
        origin.z + Math.sin(angle) * radius,
        size,
        size * 1.9,
        size,
        angle,
        angle * 0.6,
        flight < 0.2 ? cream : flight < 0.63 ? gold : ember,
        fade,
      );
    }

    const sigilFade =
      smooth((age - 0.33) / 0.23) * fade * (0.61 + collapse * 0.27);
    if (sigilFade > 0.01) {
      for (let i = 0; i < burst.sigilCount; i++) {
        const mark = burst.sigil[i]!;
        this.instance(
          this.energy,
          mark.x,
          mark.y,
          mark.z,
          mark.width,
          0.011,
          mark.length,
          mark.yaw,
          0,
          mark.tint,
          sigilFade,
        );
      }
    }
  }

  private drawVoxels(
    burst: Burst,
    centerY: number,
    shatter: number,
    collapse: number,
  ): void {
    const launch = 1 - Math.exp(-shatter * 5.1);
    const dissipation = 1 - smooth((shatter - 0.36) / 1.21);
    for (let i = 0; i < burst.voxelCount; i++) {
      const voxel = burst.voxels[i]!;
      const pull = i % 4 === 0 ? collapse * 0.93 : collapse * 0.25;
      const radius = launch * voxel.speed * (1 - pull) * burst.motion;
      const angle = voxel.angle + collapse * (i % 2 ? 2.2 : -2.2);
      const x =
        voxel.point.x +
        (burst.origin.x - voxel.point.x) * pull +
        Math.cos(angle) * radius;
      const z =
        voxel.point.z +
        (burst.origin.z - voxel.point.z) * pull +
        Math.sin(angle) * radius;
      const y =
        voxel.point.y +
        (centerY - voxel.point.y) * pull +
        burst.lift +
        launch * voxel.up * 0.58 -
        shatter * 0.43;
      const size = voxel.size * dissipation;
      if (size < 0.008) continue;
      const tint =
        shatter < 0.16 && i % 3 === 0
          ? gold
          : shatter < 0.28
            ? voxel.tint
            : coal;
      this.instance(
        this.ash,
        x,
        y,
        z,
        size,
        size * (1 + (i % 3) * 0.42),
        size,
        angle * launch,
        i * launch * 0.27,
        tint,
        0.6 + dissipation * 0.4,
      );
    }
  }

  private drawBlades(
    burst: Burst,
    centerY: number,
    build: number,
    shatter: number,
    collapse: number,
  ): void {
    const breakup = (burst.age - requiemTimeline.finalPulse) / 0.4;
    const fade =
      (1 - smooth(breakup * 1.6)) * smooth((burst.age - 0.035) / 0.105);
    if (fade < 0.01 && (breakup <= 0 || breakup >= 1)) return;
    const radius =
      (0.35 + build * 0.38 + (1 - Math.exp(-shatter * 7)) * 0.56) *
      (1 - collapse * 0.72) *
      burst.motion;
    for (let i = 0; i < bladeCount; i++) {
      const angle =
        burst.yaw +
        (i * turn) / bladeCount +
        burst.age * 2.6 +
        shatter * 1.8 +
        collapse * 1.1;
      const y = centerY + Math.sin(angle * 1.42 + i) * 0.32 * burst.motion;
      if (breakup > 0 && breakup < 1) {
        for (let j = 0; j < ashPerBlade; j++) {
          const side = j === 0 ? -1 : 1;
          const drift = angle + side * breakup * 0.72;
          const reach = radius + breakup * 0.2 * burst.motion;
          const fleck = 0.063 * (1 - breakup);
          this.instance(
            this.ash,
            burst.origin.x + Math.cos(drift) * reach,
            y + side * 0.09 + breakup * 0.37 * burst.motion,
            burst.origin.z + Math.sin(drift) * reach,
            fleck,
            fleck * 1.6,
            fleck,
            drift,
            breakup * side,
            j === 0 && breakup < 0.24 ? ember : coal,
          );
        }
      }
      if (fade < 0.01) continue;
      this.bladeSurface.heat.setX(
        this.blades.count,
        fade * (0.58 + 0.52 * Math.exp(-shatter * 7)),
      );
      const size = (0.56 + build * 0.18) * fade * burst.motion;
      this.instance(
        this.blades,
        burst.origin.x + Math.cos(angle) * radius,
        y,
        burst.origin.z + Math.sin(angle) * radius,
        size,
        size,
        size,
        -angle + Math.PI * 0.5,
        0.42 + Math.sin(angle) * 0.38,
      );
      for (let segment = 1; segment <= burst.detail.trail; segment++) {
        const inset = angle - segment * 0.1;
        const bright = (1 - segment / (burst.detail.trail + 1)) * fade;
        const sway = y - segment * 0.036;
        this.instance(
          this.energy,
          burst.origin.x + Math.cos(inset) * radius,
          sway,
          burst.origin.z + Math.sin(inset) * radius,
          0.017,
          0.024,
          0.15 * burst.motion,
          -inset,
          0.35,
          segment === 1 ? cream : gold,
          bright,
        );
      }
    }
  }

  private wave(
    burst: Burst,
    y: number,
    onset: number,
    duration: number,
    reach: number,
    intensity: number,
    tilt: boolean,
  ): void {
    const progress = (burst.age - onset) / duration;
    if (progress < 0 || progress >= 1) return;
    const radius = (0.17 + (1 - (1 - progress) ** 2) * reach) * burst.motion;
    const strength = (1 - progress) ** 1.4 * intensity * burst.motion;
    for (let i = 0; i < burst.detail.ring; i++) {
      const angle =
        (turn * i) / burst.detail.ring + burst.age * (tilt ? -1.84 : 1.1);
      this.instance(
        this.energy,
        burst.origin.x + Math.cos(angle) * radius,
        tilt
          ? y + Math.sin(angle) * radius * 0.56
          : burst.origin.y + 0.25 + progress * 0.16,
        burst.origin.z + Math.sin(angle) * radius * (tilt ? 0.72 : 1),
        0.032,
        0.038,
        (radius * 4.5) / burst.detail.ring,
        -angle,
        tilt ? Math.cos(angle) * 0.48 : 0,
        i % 5 === 0 ? cream : gold,
        strength,
      );
    }
  }

  private instance(
    mesh: InstancedMesh,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    yaw: number,
    tilt: number,
    color?: number,
    strength = 1,
  ): void {
    this.transform.position.set(x, y, z);
    this.transform.scale.set(sx, sy, sz);
    this.transform.rotation.set(tilt, yaw, tilt * 0.43);
    if (color !== undefined)
      mesh.setColorAt(
        mesh.count,
        this.color.setHex(color).multiplyScalar(strength),
      );
    this.write(mesh);
  }

  private write(mesh: InstancedMesh): void {
    this.transform.updateMatrix();
    mesh.setMatrixAt(mesh.count++, this.transform.matrix);
  }

  clear(): void {
    for (const burst of this.bursts) {
      burst.age = requiemTimeline.end;
      burst.clock = undefined;
    }
    for (const mesh of this.meshes) {
      mesh.count = 0;
      mesh.visible = false;
    }
    this.light.intensity = 0;
  }

  dispose(): void {
    this.clear();
    for (const mesh of this.meshes) {
      mesh.removeFromParent();
      mesh.dispose();
    }
    this.light.removeFromParent();
    this.light.dispose();
    for (const geometry of [
      this.box,
      this.bladeGeometry,
      this.bodyGeometry,
      this.coreGeometry,
      this.haloGeometry,
    ])
      geometry.dispose();
    for (const material of [
      this.bodySurface.material,
      this.bladeSurface.material,
      this.ashMaterial,
      this.energyMaterial,
      this.haloMaterial,
    ])
      material.dispose();
  }
}
