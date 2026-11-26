import {
  AnimationMixer,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  PropertyBinding,
  type BufferGeometry,
  type Object3D,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Vector3Like } from '@breakpoint/shared';
import type { EliminationQuality } from '../settings/userSettings';

const poolSize = 4;
const qualityRank = { low: 0, medium: 1, high: 2 };

interface EliminationAsset {
  name: string;
  file: string;
  duration: number;
  quality(name: string): number;
}

export const lotusElimination: EliminationAsset = {
  name: 'lotus-lava',
  file: 'lotus_lava_kill_effect.glb',
  duration: 2.45,
  quality(name) {
    return /^(Rising[_ ]ember|Falling[_ ]petal)/.test(name)
      ? particleQuality(name)
      : name.startsWith('Echo')
        ? 1
        : 0;
  },
};

export const blazeElimination: EliminationAsset = {
  name: 'glorious-blaze',
  file: 'Glorious_Blaze_Kill_Effect.glb',
  duration: 1.8,
  quality(name) {
    return /^(Ascending_ember|Ignited_obsidian_fragment)/.test(name)
      ? particleQuality(name)
      : name === 'Orbiting_Sparks'
        ? 1
        : 0;
  },
};

export const neonElimination: EliminationAsset = {
  name: 'neon-blade',
  file: 'neon_legend_kill_effect.glb',
  duration: 1.5,
  quality(name) {
    return /^(Pixel_Fragment|Glitch_Streak)/.test(name)
      ? particleQuality(name)
      : 0;
  },
};

function particleQuality(name: string): number {
  return Math.floor(Number(name.match(/\d+$/)?.[0] ?? 0) / 3) % 3;
}

interface Batch {
  source: Mesh;
  capacity: number;
  instances?: InstancedMesh;
}

interface AnimatedPose {
  root: Object3D;
  mixer: AnimationMixer;
  parts: {
    node: Object3D;
    quality: number;
    draws: { mesh: Mesh; batch: Batch }[];
  }[];
}

interface Burst {
  age: number;
  position: Vector3Like;
  quality: number;
  clock?: () => number;
  pose?: AnimatedPose;
}

/** Samples the supplied GLB animation on the audio clock and shares instanced draws across kills. */
export class AnimatedEliminations {
  private readonly group = new Group();
  private readonly bursts: Burst[];
  private readonly batches = new Map<string, Batch>();
  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<Mesh['material']>();
  private request?: AbortController;
  private attempted = false;
  private cursor = 0;

  constructor(
    scene: Object3D,
    private readonly asset: EliminationAsset,
  ) {
    this.bursts = Array.from({ length: poolSize }, () => ({
      age: asset.duration,
      position: { x: 0, y: 0, z: 0 },
      quality: 0,
    }));
    this.group.name = `${asset.name}-eliminations`;
    this.group.visible = false;
    scene.add(this.group);
  }

  prepare(): void {
    if (this.attempted) return;
    this.attempted = true;
    this.request = new AbortController();
    void this.load(this.request.signal).catch(() => {
      // An unavailable visual asset leaves combat and the audio cue usable.
    });
  }

  private async load(signal: AbortSignal): Promise<void> {
    const response = await fetch(
      `${import.meta.env.BASE_URL}models/${this.asset.file}`,
      { signal },
    );
    if (!response.ok) return;
    const bytes = await response.arrayBuffer();
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    signal.throwIfAborted();
    const { scene, animations } = await new GLTFLoader().parseAsync(bytes, '');
    const clip = animations[0];
    scene.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      this.geometries.add(node.geometry);
      this.materials.add(node.material);
    });
    if (signal.aborted || !clip || !scene.children[0]) {
      this.disposeAssets();
      return;
    }
    const animated = new Set(
      clip.tracks.map(
        (track) => PropertyBinding.parseTrackName(track.name).nodeName,
      ),
    );
    this.mergeRigidPieces(scene, animated);
    for (const burst of this.bursts) {
      const root = scene.clone(true);
      const mixer = new AnimationMixer(root);
      mixer.clipAction(clip).play();
      const parts = new Map<Object3D, AnimatedPose['parts'][number]>();
      root.traverse((mesh) => {
        if (!(mesh instanceof Mesh)) return;
        const node = animationOwner(mesh, animated);
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        const key = `${mesh.geometry.id}:${materials.map((material) => material.id).join(',')}`;
        let batch = this.batches.get(key);
        if (!batch) {
          batch = { source: mesh, capacity: 0 };
          this.batches.set(key, batch);
        }
        batch.capacity++;
        let part = parts.get(node);
        if (!part) {
          part = { node, quality: this.asset.quality(node.name), draws: [] };
          parts.set(node, part);
        }
        part.draws.push({ mesh, batch });
      });
      burst.pose = { root, mixer, parts: [...parts.values()] };
    }
    for (const batch of this.batches.values()) {
      const { geometry, material } = batch.source;
      const instances = new InstancedMesh(geometry, material, batch.capacity);
      instances.count = 0;
      instances.frustumCulled = false;
      instances.instanceMatrix.setUsage(DynamicDrawUsage);
      batch.instances = instances;
      this.group.add(instances);
    }
  }

  private mergeRigidPieces(
    root: Object3D,
    animated: ReadonlySet<string>,
  ): void {
    const owners = new Map<Object3D, Map<Mesh['material'], Mesh[]>>();
    root.updateMatrixWorld(true);
    root.traverse((mesh) => {
      if (!(mesh instanceof Mesh) || Array.isArray(mesh.material)) return;
      const owner = animationOwner(mesh, animated);
      if (mesh === owner || mesh.children.length) return;
      let groups = owners.get(owner);
      if (!groups) owners.set(owner, (groups = new Map()));
      const pieces = groups.get(mesh.material);
      if (pieces) pieces.push(mesh);
      else groups.set(mesh.material, [mesh]);
    });
    const inverse = new Matrix4();
    const relative = new Matrix4();
    for (const [owner, groups] of owners) {
      inverse.copy(owner.matrixWorld).invert();
      for (const [material, pieces] of groups) {
        if (pieces.length < 2) continue;
        const parts = pieces.map((mesh) =>
          (mesh.geometry.index
            ? mesh.geometry.toNonIndexed()
            : mesh.geometry.clone()
          ).applyMatrix4(relative.multiplyMatrices(inverse, mesh.matrixWorld)),
        );
        const geometry = mergeGeometries(parts);
        for (const part of parts) part.dispose();
        if (!geometry) continue;
        for (const mesh of pieces) mesh.removeFromParent();
        this.geometries.add(geometry);
        owner.add(new Mesh(geometry, material));
      }
    }
  }

  spawn(
    position: Vector3Like,
    quality: EliminationQuality,
    reducedMotion: boolean,
    clock?: () => number,
  ): void {
    this.prepare();
    const burst = this.bursts[this.cursor]!;
    this.cursor = (this.cursor + 1) % poolSize;
    Object.assign(burst.position, position);
    burst.age = 0;
    burst.clock = clock;
    burst.quality = reducedMotion ? 0 : qualityRank[quality];
  }

  step(dt: number): void {
    const { duration } = this.asset;
    if (!this.group.visible && this.bursts.every(({ age }) => age >= duration))
      return;
    for (const { instances } of this.batches.values()) instances!.count = 0;
    this.group.visible = false;
    for (const burst of this.bursts) {
      if (burst.age >= duration) continue;
      burst.age = burst.clock?.() ?? burst.age + dt;
      if (burst.age >= duration) {
        burst.clock = undefined;
        continue;
      }
      const { pose, position } = burst;
      if (!pose) continue;
      pose.mixer.setTime(burst.age);
      pose.root.position.set(position.x, position.y, position.z);
      pose.root.updateMatrixWorld(true);
      for (const part of pose.parts) {
        if (part.quality > burst.quality || part.node.scale.x < 0.006) continue;
        for (const { mesh, batch } of part.draws) {
          const instances = batch.instances!;
          instances.setMatrixAt(instances.count++, mesh.matrixWorld);
        }
      }
      this.group.visible = true;
    }
    for (const { instances } of this.batches.values()) {
      if (instances!.count > 0) instances!.instanceMatrix.needsUpdate = true;
    }
  }

  clear(): void {
    for (const burst of this.bursts) {
      burst.age = this.asset.duration;
      burst.clock = undefined;
    }
    this.group.visible = false;
  }

  dispose(): void {
    this.request?.abort();
    this.clear();
    this.group.removeFromParent();
    for (const { instances } of this.batches.values()) instances?.dispose();
    this.disposeAssets();
    for (const { pose } of this.bursts) {
      pose?.mixer.stopAllAction();
      if (pose) pose.mixer.uncacheRoot(pose.root);
    }
    this.batches.clear();
    this.group.clear();
  }

  private disposeAssets(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const entry of this.materials)
      for (const material of Array.isArray(entry) ? entry : [entry])
        material.dispose();
    this.geometries.clear();
    this.materials.clear();
  }
}

function animationOwner(mesh: Mesh, animated: ReadonlySet<string>): Object3D {
  let node: Object3D = mesh;
  while (node.parent && !animated.has(node.name)) node = node.parent;
  return node;
}
