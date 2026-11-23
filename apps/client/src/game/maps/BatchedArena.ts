import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Euler,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Material,
  type Scene,
} from 'three';
import type { ArenaBox } from '@breakpoint/shared/maps';
import { createAtlasMaterial, createPixelAtlas } from '../rendering/PixelAtlas';
import type { GraphicsSettings } from '../rendering/graphicsConfig';

export type ArenaPart = ArenaBox;
export type ArenaSurface = ArenaPart & { tile: number };

interface ArenaBatches {
  solids: ArenaSurface[];
  trim: ArenaPart[];
  barrels: ArenaPart[];
  paint: ArenaPart[];
  overhead?: ArenaPart[];
}
interface ArenaLight {
  sky: number;
  fill: readonly [number, number, number];
  key: readonly [number, number];
  keyPosition: readonly [number, number, number];
  normalBias: number;
  textureTheme?: 'warehouse';
}

/** Shared instanced rendering and resource lifetime for the modular multiplayer maps. */
export class BatchedArena {
  readonly keyLight: DirectionalLight;
  private readonly fog: Fog;
  private readonly root = new Group();
  private readonly box = new BoxGeometry();
  private readonly drum = new CylinderGeometry(0.5, 0.5, 1, 12);
  private readonly atlas;
  private readonly lowAtlas;
  private readonly surfaces: MeshLambertMaterial;
  private readonly metal = new MeshLambertMaterial({ flatShading: true });
  private readonly lamp = new MeshBasicMaterial();
  private readonly batches: InstancedMesh[] = [];
  private shadowQuality: GraphicsSettings['shadowQuality'] = 'off';

  get textureTileSize(): number {
    return this.surfaces.userData.tilePixels.value;
  }

  constructor(scene: Scene, parts: ArenaBatches, light: ArenaLight) {
    scene.background = new Color(light.sky);
    this.fog = scene.fog = new Fog(light.sky, 38, 62);
    scene.add(this.root);
    this.root.add(new HemisphereLight(...light.fill));
    this.keyLight = new DirectionalLight(...light.key);
    this.keyLight.position.set(...light.keyPosition);
    Object.assign(this.keyLight.shadow.camera, {
      left: -28,
      right: 28,
      top: 26,
      bottom: -26,
      near: 1,
      far: 80,
    });
    this.keyLight.shadow.camera.updateProjectionMatrix();
    this.keyLight.shadow.bias = -0.0006;
    this.keyLight.shadow.normalBias = light.normalBias;
    this.keyLight.shadow.autoUpdate = false;
    this.root.add(this.keyLight);

    this.atlas = createPixelAtlas(32, light.textureTheme);
    this.lowAtlas = createPixelAtlas(16, light.textureTheme);
    this.surfaces = createAtlasMaterial(
      this.atlas,
      this.box,
      parts.solids.map(({ tile }) => tile),
    );
    this.batch(this.box, this.surfaces, parts.solids, true);
    this.batch(this.box, this.metal, parts.trim, true);
    this.batch(this.drum, this.metal, parts.barrels, true);
    this.batch(this.box, this.lamp, parts.paint, false);
    if (parts.overhead) this.batch(this.box, this.metal, parts.overhead, false);
  }

  private batch(
    geometry: BufferGeometry,
    material: Material,
    parts: ArenaPart[],
    shadow: boolean,
  ): void {
    const mesh = new InstancedMesh(geometry, material, parts.length);
    const matrix = new Matrix4(),
      position = new Vector3(),
      scale = new Vector3();
    const rotation = new Quaternion(),
      angles = new Euler(),
      color = new Color();
    parts.forEach((part, index) => {
      matrix.compose(
        position.set(...part.position),
        rotation.setFromEuler(
          angles.set(part.pitch ?? 0, part.yaw ?? 0, part.roll ?? 0),
        ),
        scale.set(...part.size),
      );
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, color.setHex(part.color));
    });
    mesh.computeBoundingSphere();
    mesh.castShadow = mesh.receiveShadow = shadow;
    this.batches.push(mesh);
    this.root.add(mesh);
  }

  configure(settings: GraphicsSettings): void {
    const atlas =
      settings.textureQuality === 'low' ? this.lowAtlas : this.atlas;
    this.surfaces.map = atlas;
    this.surfaces.userData.tilePixels.value = atlas.image.width / 4;
    this.fog.near = settings.viewDistance * 0.65;
    this.fog.far = settings.viewDistance * 0.95;
    if (settings.shadowQuality === this.shadowQuality) return;
    this.keyLight.shadow.map?.dispose();
    this.keyLight.shadow.map = null;
    this.keyLight.castShadow = settings.shadowQuality !== 'off';
    this.keyLight.shadow.mapSize.setScalar(
      settings.shadowQuality === 'high' ? 1024 : 512,
    );
    this.keyLight.shadow.needsUpdate = this.keyLight.castShadow;
    this.shadowQuality = settings.shadowQuality;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.root.clear();
    for (const mesh of this.batches) mesh.dispose();
    this.box.dispose();
    this.drum.dispose();
    this.atlas.dispose();
    this.lowAtlas.dispose();
    this.keyLight.shadow.dispose();
    this.surfaces.dispose();
    this.metal.dispose();
    this.lamp.dispose();
  }
}
