import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
  type Material,
  type Scene,
} from 'three';
import { arenas, type ArenaBox } from '@breakpoint/shared/maps';
import { createAtlasMaterial, createPixelAtlas } from '../rendering/PixelAtlas';
import type { GraphicsSettings } from '../rendering/graphicsConfig';

const yard = arenas.shipment;
type Part = ArenaBox & { yaw?: number };
type Surface = Part & { tile: number };

/** The room's physical yard rendered as shared instanced surfaces and trim. */
export class ShipmentArena {
  readonly keyLight = new DirectionalLight(0xffedcf, 1.65);
  private readonly fog = new Fog(0x939d91, 38, 62);
  private readonly root = new Group();
  private readonly box = new BoxGeometry();
  private readonly drum = new CylinderGeometry(0.5, 0.5, 1, 12);
  private readonly atlas = createPixelAtlas();
  private readonly lowAtlas = createPixelAtlas(16);
  private readonly surfaces: MeshLambertMaterial;
  private readonly metal = new MeshLambertMaterial({ flatShading: true });
  private readonly lamp = new MeshBasicMaterial();
  private readonly batches: InstancedMesh[] = [];
  private shadowQuality: GraphicsSettings['shadowQuality'] = 'off';

  get textureTileSize(): number {
    return this.surfaces.userData.tilePixels.value;
  }

  constructor(scene: Scene) {
    scene.background = new Color(this.fog.color);
    scene.fog = this.fog;
    scene.add(this.root);
    this.root.add(new HemisphereLight(0xe1e8dd, 0x7d8475, 1.9));
    this.keyLight.position.set(-20, 29, -12);
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
    this.keyLight.shadow.normalBias = 0.035;
    this.keyLight.shadow.autoUpdate = false;
    this.root.add(this.keyLight);

    const solids: Surface[] = [{ ...yard.floor, tile: 7 }];
    const trim: Part[] = [];
    const barrels: Part[] = [];
    const paint: Part[] = [];
    const [width, height, length] = yard.containerSize;
    for (const { x, z, level, yaw, color } of yard.containers) {
      const y = (level + 0.5) * height;
      const sine = Math.sin(yaw),
        cosine = Math.cos(yaw);
      const surface = (
        position: Part['position'],
        size: Part['size'],
        tint: number,
      ): Part => ({
        position: [
          x + position[0] * cosine + position[2] * sine,
          y + position[1],
          z - position[0] * sine + position[2] * cosine,
        ],
        size,
        color: tint,
        yaw,
      });
      solids.push({
        ...surface(
          [0, 0, 0],
          [width - 0.08, height - 0.08, length - 0.08],
          color,
        ),
        tile: 2,
      });
      const frame = new Color(color).multiplyScalar(0.68).getHex();
      for (const side of [-1, 1]) {
        for (const end of [-1, 1]) {
          trim.push(
            surface([side * 1.14, 0, end * 2.94], [0.12, height, 0.12], frame),
          );
          trim.push(
            surface([side * 1.14, end * 1.235, 0], [0.12, 0.13, length], frame),
          );
          trim.push(
            surface([0, end * 1.235, side * 2.94], [width, 0.13, 0.12], frame),
          );
        }
        for (let rib = -6; rib <= 6; rib++)
          trim.push(
            surface([side * 1.18, 0, rib * 0.41], [0.04, 2.3, 0.074], frame),
          );
        // A pair of inset doors with metal locking bars and contrasting latches.
        trim.push(surface([side * 0.54, 0, 2.963], [1.05, 2.28, 0.035], color));
        trim.push(
          surface([side * 0.42, 0, 2.987], [0.04, 2.18, 0.025], 0x9a9e8f),
        );
        trim.push(
          surface([side * 0.33, -0.26, 2.986], [0.24, 0.07, 0.026], 0x515851),
        );
        trim.push(
          surface(
            [side * 1.165, -0.95, side * 2.49],
            [0.016, 0.25, 0.38],
            0x795c48,
          ),
        );
        trim.push(
          surface(
            [side * 1.165, -0.8, -side * 1.48],
            [0.016, 0.12, 0.21],
            0x81644e,
          ),
        );
      }
    }

    for (const wall of yard.perimeter) {
      const [x, , z] = wall.position;
      const [sx, sy, sz] = wall.size;
      solids.push({
        ...wall,
        position: [x, (0.72 + sy - 0.24) / 2, z],
        size: [sx, sy - 0.96, sz],
        tile: 6,
      });
      trim.push({
        position: [x, 0.36, z],
        size: [sx, 0.72, sz],
        color: 0x71766b,
      });
      trim.push({
        position: [x, sy - 0.12, z],
        size: [sx, 0.24, sz],
        color: 0x828a7e,
      });
      for (let along = -16; along <= 16; along += 4) {
        trim.push({
          position: [x || along, sy / 2, z || along],
          size: [x ? sx + 0.025 : 0.16, sy, z ? sz + 0.025 : 0.16],
          color: 0x7d877b,
        });
      }
    }

    for (const prop of yard.props) {
      if (prop.kind === 'barrel') {
        barrels.push(prop);
        const [x, y, z] = prop.position;
        for (const dy of [-0.3, 0.28])
          barrels.push({
            position: [x, y + dy, z],
            size: [0.568, 0.065, 0.568],
            color: 0x9b9c83,
          });
      } else solids.push({ ...prop, tile: 3 });
    }

    for (const [x, z] of yard.floodlights) {
      trim.push({
        position: [x, 4.8, z],
        size: [0.18, 1.8, 0.18],
        color: 0x343d37,
      });
      trim.push({
        position: [x, 5.65, z],
        size: [1.03, 0.16, 0.27],
        color: 0x434a43,
      });
      for (const offset of [-0.31, 0.31])
        paint.push({
          position: [x + offset, 5.64, z - Math.sign(z) * 0.154],
          size: [0.32, 0.12, 0.035],
          color: 0xe7d5a0,
        });
    }
    for (const side of [-1, 1]) {
      for (const z of [-11, -7, -3, 1, 5, 9, 13])
        paint.push({
          position: [side * 11.2, 0.007, z],
          size: [0.075, 0.012, 1.2],
          color: 0xb2995a,
        });
      const color = side < 0 ? 0x638fa2 : 0xb66c4c;
      for (const point of yard.spawns[side < 0 ? 'blue' : 'orange']) {
        paint.push({
          position: [point.x, 0.009, point.z + side * 0.85],
          size: [2.25, 0.012, 0.1],
          color,
        });
        for (const direction of [-1, 1])
          paint.push({
            position: [point.x + direction * 0.25, 0.01, point.z],
            size: [0.08, 0.012, 0.64],
            yaw: (side * direction * Math.PI) / 3,
            color,
          });
      }
    }
    this.surfaces = createAtlasMaterial(
      this.atlas,
      this.box,
      solids.map(({ tile }) => tile),
    );
    this.batch(this.box, this.surfaces, solids, true);
    this.batch(this.box, this.metal, trim, true);
    this.batch(this.drum, this.metal, barrels, true);
    this.batch(this.box, this.lamp, paint, false);
  }

  private batch(
    geometry: BufferGeometry,
    material: Material,
    parts: Part[],
    shadow: boolean,
  ): void {
    const mesh = new InstancedMesh(geometry, material, parts.length);
    const matrix = new Matrix4(),
      position = new Vector3(),
      scale = new Vector3();
    const rotation = new Quaternion(),
      up = new Vector3(0, 1, 0);
    const color = new Color();
    parts.forEach((part, index) => {
      matrix.compose(
        position.set(...part.position),
        rotation.setFromAxisAngle(up, part.yaw ?? 0),
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
