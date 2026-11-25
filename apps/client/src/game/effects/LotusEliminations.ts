import {
  AnimationMixer,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Mesh,
  type Object3D,
} from 'three';
import type { Vector3Like } from '@breakpoint/shared';
import type { EliminationQuality } from '../settings/userSettings';

const duration = 2.45;
const poolSize = 4;
const qualityRank = { low: 0, medium: 1, high: 2 };

interface Batch {
  source: Mesh;
  capacity: number;
  instances?: InstancedMesh;
}

interface AnimatedLotus {
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
  pose?: AnimatedLotus;
}

/** Samples the supplied GLB animation on the audio clock and shares instanced draws across kills. */
export class LotusEliminations {
  private readonly group = new Group();
  private readonly bursts = Array.from({ length: poolSize }, (): Burst => ({
    age: duration,
    position: { x: 0, y: 0, z: 0 },
    quality: 0,
  }));
  private readonly batches = new Map<string, Batch>();
  private request?: AbortController;
  private attempted = false;
  private cursor = 0;

  constructor(scene: Object3D) {
    this.group.name = 'lotus-lava-eliminations';
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
      `${import.meta.env.BASE_URL}models/lotus_lava_kill_effect.glb`,
      { signal },
    );
    if (!response.ok) return;
    const bytes = await response.arrayBuffer();
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    signal.throwIfAborted();
    const { scene, animations } = await new GLTFLoader().parseAsync(bytes, '');
    const clip = animations[0];
    if (signal.aborted || !clip || !scene.children[0]) {
      const geometries = new Set<Mesh['geometry']>();
      const materials = new Set<Mesh['material']>();
      scene.traverse((node) => {
        if (node instanceof Mesh) {
          geometries.add(node.geometry);
          materials.add(node.material);
        }
      });
      for (const geometry of geometries) geometry.dispose();
      for (const entry of materials)
        for (const material of Array.isArray(entry) ? entry : [entry])
          material.dispose();
      return;
    }
    for (const burst of this.bursts) {
      const root = scene.clone(true);
      const mixer = new AnimationMixer(root);
      mixer.clipAction(clip).play();
      const parts = root.children[0]!.children.map((node) => {
        const particle = /^(Rising[_ ]ember|Falling[_ ]petal)/.test(node.name);
        const index = Number(node.name.match(/\d+$/)?.[0] ?? 0);
        const quality = particle
          ? Math.floor(index / 3) % 3
          : node.name.startsWith('Echo')
            ? 1
            : 0;
        const draws: AnimatedLotus['parts'][number]['draws'] = [];
        node.traverse((mesh) => {
          if (!(mesh instanceof Mesh)) return;
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
          draws.push({ mesh, batch });
        });
        return { node, quality, draws };
      });
      burst.pose = { root, mixer, parts };
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
      burst.age = duration;
      burst.clock = undefined;
    }
    this.group.visible = false;
  }

  dispose(): void {
    this.request?.abort();
    this.clear();
    this.group.removeFromParent();
    const geometries = new Set<Mesh['geometry']>();
    const materials = new Set<Mesh['material']>();
    for (const { source, instances } of this.batches.values()) {
      instances?.dispose();
      geometries.add(source.geometry);
      materials.add(source.material);
    }
    for (const geometry of geometries) geometry.dispose();
    for (const entry of materials)
      for (const material of Array.isArray(entry) ? entry : [entry])
        material.dispose();
    for (const { pose } of this.bursts) {
      pose?.mixer.stopAllAction();
      if (pose) pose.mixer.uncacheRoot(pose.root);
    }
    this.batches.clear();
    this.group.clear();
  }
}
