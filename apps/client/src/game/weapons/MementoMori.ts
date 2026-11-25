import {
  AnimationMixer,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  NearestMipmapNearestFilter,
  Vector3,
  type BufferGeometry,
  type Object3D,
  type Texture,
} from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createReadableMaterial } from '../rendering/ReadableMaterial';
import type { WeaponSight } from './WeaponSights';
import { weaponMuzzles } from './WeaponMuzzles';

// The authored file points along +Z and spans roughly 5.57 units.
const viewmodelScale = 0.17;
const yaw = Math.PI;
const vertical = new Vector3(0, 1, 0);

/** Preserve the GLB's pose nodes while replacing its material primitives with one batch per moving part. */
export class MementoMori {
  readonly model = new Group();
  readonly reticle = new Group();
  readonly sight: NonNullable<WeaponSight['reticle']>;
  readonly adsPose: WeaponSight['ads'];
  private readonly batches: Mesh[] = [];
  private readonly material = createReadableMaterial(
    {
      vertexColors: true,
      emissive: 0x22232b,
      emissiveIntensity: 0.22,
    },
    0.23,
  );
  private readonly textures = new Set<Texture>();
  private readonly shards: Mesh[] = [];
  private readonly mixer: AnimationMixer;
  private readonly magazine: Object3D;
  private readonly magazineRest: Vector3;

  static async load(signal: AbortSignal): Promise<MementoMori> {
    const response = await fetch(
      `${import.meta.env.BASE_URL}models/memento.glb`,
      { signal },
    );
    if (!response.ok)
      throw new Error(`Memento Mori model returned HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    signal.throwIfAborted();
    return new MementoMori(await new GLTFLoader().parseAsync(bytes, ''));
  }

  private constructor({ scene, animations }: GLTF) {
    scene.updateMatrixWorld(true);
    const required = (name: string): Object3D => {
      const part = scene.getObjectByName(name);
      if (!part) throw new Error(`Memento Mori is missing ${name}`);
      return part;
    };
    const muzzle = required('FX_Muzzle_Anchor');
    const alignment = required('ADS_Alignment_Anchor');
    const optic = required('ADS_Reticle');
    this.magazine = required('Magazine');
    this.magazineRest = this.magazine.position.clone();
    const normalizedMuzzle = muzzle
      .getWorldPosition(new Vector3())
      .applyAxisAngle(vertical, yaw)
      .multiplyScalar(viewmodelScale);
    this.model.position
      .set(...weaponMuzzles.rifle.firstPerson)
      .sub(normalizedMuzzle);
    const center = alignment
      .getWorldPosition(new Vector3())
      .applyAxisAngle(vertical, yaw)
      .multiplyScalar(viewmodelScale)
      .add(this.model.position);
    this.sight = {
      center: [center.x, center.y, center.z],
      radius: 0.043,
      halfWindow: [0.091, 0.091],
    };
    this.adsPose = {
      position: [-center.x, -center.y, -0.61],
      rotation: [0, 0, 0],
    };

    this.model.name = 'memento-mori';
    this.model.rotation.y = yaw;
    this.model.scale.setScalar(viewmodelScale);
    this.model.visible = false;
    this.reticle.name = 'memento-mori-reticle';
    this.reticle.visible = false;
    this.mixer = new AnimationMixer(scene);

    const animated = new Set([this.magazine, optic]);
    const shardNodes = new Set<Object3D>();
    scene.traverse((node) => {
      if (
        node.name.startsWith('Float_Shard_') &&
        node.parent?.name === 'Molten_Relic_V2'
      ) {
        animated.add(node);
        shardNodes.add(node);
      }
    });
    const parts = new Map<Object3D, BufferGeometry[]>();
    const originals: Mesh[] = [];
    const materials = new Set<MeshStandardMaterial>();
    const relative = new Matrix4();
    try {
      scene.traverse((node) => {
        if (
          !(node instanceof Mesh) ||
          !(node.material instanceof MeshStandardMaterial)
        )
          return;
        let owner: Object3D = node;
        while (owner.parent && !animated.has(owner)) owner = owner.parent;
        materials.add(node.material);
        originals.push(node);
        const { color, emissive, emissiveIntensity, map } = node.material;
        if (map) this.textures.add(map);
        relative.copy(owner.matrixWorld).invert().multiply(node.matrixWorld);
        const geometry = node.geometry.clone().applyMatrix4(relative);
        const count = geometry.getAttribute('position').count;
        const tints = new Float32Array(count * 3);
        const glow = new Float32Array(count * 3);
        const strength = emissiveIntensity * 0.52;
        for (let i = 0; i < tints.length; i += 3) {
          color.toArray(tints, i);
          glow[i] = emissive.r * strength;
          glow[i + 1] = emissive.g * strength;
          glow[i + 2] = emissive.b * strength;
        }
        geometry.setAttribute('color', new Float32BufferAttribute(tints, 3));
        geometry.setAttribute(
          'mementoGlow',
          new Float32BufferAttribute(glow, 3),
        );
        const group = parts.get(owner);
        if (group) group.push(geometry);
        else parts.set(owner, [geometry]);
      });
      if (!parts.has(scene) || !parts.has(optic) || !parts.has(this.magazine))
        throw new Error(
          'Memento Mori is missing renderable body, sight, or magazine meshes',
        );

      for (const mesh of originals) mesh.removeFromParent();
      for (const [owner, geometries] of parts) {
        const geometry = mergeGeometries(geometries);
        if (!geometry)
          throw new Error(`Memento Mori could not batch ${owner.name}`);
        const mesh = new Mesh(geometry, this.material);
        this.batches.push(mesh);
        if (owner === optic) {
          mesh.rotation.y = yaw;
          mesh.scale.setScalar(viewmodelScale);
          mesh.renderOrder = 1;
          this.reticle.add(mesh);
        } else owner.add(mesh);
        if (shardNodes.has(owner)) this.shards.push(mesh);
      }
      for (const texture of this.textures) {
        texture.magFilter = NearestFilter;
        texture.minFilter = NearestMipmapNearestFilter;
        texture.generateMipmaps = true;
        texture.needsUpdate = true;
      }
      this.material.map = this.textures.values().next().value ?? null;
      const readable = this.material.onBeforeCompile;
      this.material.onBeforeCompile = (shader, renderer) => {
        readable.call(this.material, shader, renderer);
        shader.vertexShader =
          `attribute vec3 mementoGlow;\nvarying vec3 assetGlow;\n${shader.vertexShader}`.replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\nassetGlow = mementoGlow;',
          );
        shader.fragmentShader =
          `varying vec3 assetGlow;\n${shader.fragmentShader}`.replace(
            '#include <opaque_fragment>',
            'outgoingLight += assetGlow;\n#include <opaque_fragment>',
          );
      };
      this.material.customProgramCacheKey = () => 'breakpoint-memento-mori';
      if (animations[0]) this.mixer.clipAction(animations[0]).play();
      this.model.add(scene);
    } catch (error) {
      this.dispose();
      throw error;
    } finally {
      for (const mesh of originals) mesh.geometry.dispose();
      for (const material of materials) material.dispose();
      for (const geometries of parts.values())
        for (const geometry of geometries) geometry.dispose();
    }
  }

  update(
    dt: number,
    reload: number,
    ads: number,
    inspect: number,
    motion: number,
  ): void {
    this.mixer.update(Math.min(dt, 0.075) * motion);
    this.magazine.position.copy(this.magazineRest);
    this.magazine.position.x -= 0.24 * reload;
    this.magazine.position.y -= 0.59 * reload;
    this.magazine.position.z -= 0.2 * reload;
    this.magazine.rotation.x = -0.36 * reload;
    for (const [i, shard] of this.shards.entries()) {
      const side = i % 2 ? 1 : -1;
      shard.position.x = side * (0.22 * ads + 0.16 * inspect);
      shard.position.y = 0.13 * inspect - 0.16 * ads;
    }
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
    this.model.removeFromParent();
    this.reticle.removeFromParent();
    for (const mesh of this.batches) mesh.geometry.dispose();
    this.material.dispose();
    for (const texture of this.textures) {
      const image = texture.source.data as unknown;
      if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap)
        image.close();
      texture.dispose();
    }
  }
}
