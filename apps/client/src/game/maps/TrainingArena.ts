import {
  BoxGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  LOD,
  Matrix4,
  MeshStandardMaterial,
  MeshBasicMaterial,
  LinearFilter,
  LinearMipmapLinearFilter,
  type Scene,
  SRGBColorSpace,
} from 'three';
import { arenaBoxes } from './arenaLayout';
import { createIndexedRoundedBox } from '../rendering/RoundedBox';
import { ArenaSurfaces } from '../rendering/SurfaceAtlas';
import {
  createArenaSky,
  createContactOcclusion,
} from '../rendering/ArenaLighting';
import {
  defaultGraphics,
  shadowMapSizes,
  type GraphicsSettings,
} from '../rendering/graphicsConfig';

const fogColor = 0xa7bac3;
const surfaceColors = [
  0x9d9c8e, 0x879599, 0x919a95, 0x929e9c, 0x8296a1, 0x587e81, 0xb37248,
  0xb3996c, 0x537477, 0x9d876f, 0xad8760, 0xbba16d, 0x718683, 0x718683,
  0x93a39e, 0x93a39e,
];

/** Shared collision layout, brighter materials, batched edge trim and optional cached static shadows. */
export class TrainingArena {
  private readonly root = new Group();
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly trimGeometry = createIndexedRoundedBox(0.045);
  private readonly solidGeometry = this.geometry.clone();
  private readonly sky = createArenaSky(fogColor);
  private readonly contactOcclusion = createContactOcclusion(arenaBoxes);
  readonly keyLight = new DirectionalLight(0xffecd4, 2.3);
  private shadowQuality: GraphicsSettings['shadowQuality'] = 'off';
  private readonly surfaces = new ArenaSurfaces(
    this.solidGeometry,
    arenaBoxes.map((box, index) =>
      index === 0
        ? 0
        : index < 5
          ? 1
          : box.kind === 'container'
            ? 2
            : index === 11
              ? 4
              : index > 13
                ? 5
                : 3,
    ),
    'depot',
  );
  private readonly trimMaterial = new MeshStandardMaterial({
    roughness: 0.58,
    metalness: 0.17,
  });
  private readonly orangeMaterial = new MeshBasicMaterial({ color: 0xeaa157 });
  private readonly blueMaterial = new MeshBasicMaterial({ color: 0x7bb8c1 });
  private readonly stripeMaterial = new MeshBasicMaterial({ color: 0xada269 });
  private readonly signTexture: CanvasTexture;
  private readonly signMaterial: MeshBasicMaterial;
  private readonly decorations = new Map<
    MeshStandardMaterial | MeshBasicMaterial,
    { matrix: Matrix4; tint: number }[]
  >();
  private readonly instances: InstancedMesh[] = [];
  private readonly skyline = new LOD();

  get textureTileSize(): number {
    return this.surfaces.tileSize;
  }

  constructor(
    private readonly scene: Scene,
    settings = defaultGraphics,
  ) {
    scene.background = this.sky;
    scene.fog = new Fog(fogColor, 39, 57);
    scene.add(this.root);
    this.root.add(new HemisphereLight(0xddefff, 0x918773, 1.8));
    this.keyLight.position.set(-18, 26, 16);
    this.keyLight.target.position.set(0, 0, -2);
    Object.assign(this.keyLight.shadow.camera, {
      left: -30,
      right: 30,
      top: 26,
      bottom: -26,
      near: 1,
      far: 85,
    });
    this.keyLight.shadow.camera.updateProjectionMatrix();
    this.keyLight.shadow.bias = -0.0006;
    this.keyLight.shadow.normalBias = 0.04;
    this.keyLight.shadow.autoUpdate = false;
    this.keyLight.shadow.radius = 2;
    this.root.add(this.keyLight, this.keyLight.target);
    const solids = new InstancedMesh(
      this.solidGeometry,
      this.surfaces.material,
      arenaBoxes.length,
    );
    const matrix = new Matrix4();
    const color = new Color();
    arenaBoxes.forEach((box, index) => {
      matrix.makeScale(...box.size).setPosition(...box.position);
      solids.setMatrixAt(index, matrix);
      solids.setColorAt(index, color.setHex(surfaceColors[index] ?? box.color));
    });
    solids.computeBoundingSphere();
    solids.castShadow = true;
    solids.receiveShadow = true;
    this.root.add(solids, this.contactOcclusion);
    this.instances.push(solids);

    // Corrugations and silhouette trim share the structural decoration draw.
    for (const container of arenaBoxes.filter(
      (box) => box.kind === 'container',
    )) {
      const [cx, cy, cz] = container.position,
        [width, height, length] = container.size;
      const ribs = Math.max(2, Math.round(length / 0.5));
      for (const side of [-1, 1])
        for (let i = 0; i < ribs; i++) {
          this.box(
            [
              cx + side * (width / 2 + 0.02),
              cy,
              cz - length / 2 + 0.3 + (i * (length - 0.6)) / (ribs - 1),
            ],
            [0.05, height - 0.2, 0.07],
            this.trimMaterial,
            cx < 0 ? 0x536d43 : 0x8c5839,
          );
        }
      for (const end of [-1, 1]) {
        const face = cz + end * (length / 2 + 0.026);
        this.box(
          [cx, cy, face],
          [0.055, height - 0.18, 0.06],
          this.trimMaterial,
          0x3a4b4d,
        );
        for (const rail of [-0.41, 0.41]) {
          this.box(
            [cx + rail, cy, face + end * 0.03],
            [0.04, height - 0.24, 0.041],
            this.trimMaterial,
            0xb7b2a2,
          );
          for (const latch of [-0.39, 0.32])
            this.box(
              [cx + rail + 0.075, cy + latch, face + end * 0.038],
              [0.17, 0.047, 0.044],
              this.trimMaterial,
              0x425158,
            );
        }
      }
    }
    for (let index = 5; index <= 11; index++) this.frameBox(index);

    for (const z of [-14, -5, 5, 14]) {
      this.box([-19.55, 3.3, z], [0.2, 5.8, 0.5], this.trimMaterial);
      this.box([19.55, 3.3, z], [0.2, 5.8, 0.5], this.trimMaterial);
      this.box([0, 6.2, z], [40, 0.35, 0.35], this.trimMaterial);
      this.box([-19.42, 3.8, z], [0.08, 0.12, 1.8], this.orangeMaterial);
      this.box([19.42, 3.8, z], [0.08, 0.12, 1.8], this.blueMaterial);
    }
    for (const side of [-1, 1]) {
      this.box(
        [side * 19.45, 0.22, 0],
        [0.13, 0.44, 32],
        this.trimMaterial,
        0x526a72,
      );
      this.box(
        [side * 19.45, 5.82, 0],
        [0.15, 0.14, 32],
        this.trimMaterial,
        0x9ba8a4,
      );
      for (const z of [-11, -2, 7]) {
        this.box(
          [side * 19.44, 4.92, z],
          [0.09, 0.86, 3.15],
          this.trimMaterial,
          0x344953,
        );
        for (let bay = -1; bay <= 1; bay++)
          this.box(
            [side * 19.385, 4.94, z + bay * 0.96],
            [0.02, 0.67, 0.87],
            this.trimMaterial,
            0x7c9eab,
          );
        this.box(
          [side * 19.35, 4.51, z],
          [0.22, 0.09, 3.25],
          this.trimMaterial,
          0xb1b1a1,
        );
      }
    }
    for (let z = -13; z <= 13; z += 3) {
      this.box([-2.7, 0.012, z], [0.08, 0.02, 1.3], this.stripeMaterial);
      this.box([2.7, 0.012, z], [0.08, 0.02, 1.3], this.stripeMaterial);
    }
    this.box([0, 0.015, 13.5], [5.5, 0.025, 0.12], this.blueMaterial);
    this.box([0, 0.015, -14], [5.5, 0.025, 0.12], this.orangeMaterial);
    this.box([0, 3, -15.44], [8, 4.3, 0.1], this.trimMaterial);
    for (const x of [-4.2, 4.2]) {
      this.box([x, 3, -15.35], [0.12, 4.8, 0.12], this.orangeMaterial);
    }
    this.box([0, 5.76, -15.36], [40, 0.24, 0.27], this.trimMaterial, 0xa2b1af);
    for (const side of [-1, 1]) {
      const x = side * 12.1;
      this.box(
        [x, 2.15, -15.41],
        [5.9, 4.25, 0.13],
        this.trimMaterial,
        0x496267,
      );
      this.box(
        [x, 1.9, -15.32],
        [5.35, 3.52, 0.13],
        this.trimMaterial,
        0x758388,
      );
      for (let slat = 0; slat < 10; slat++)
        this.box(
          [x, 0.34 + slat * 0.35, -15.235],
          [5.34, 0.027, 0.042],
          this.trimMaterial,
          0x52656b,
        );
      this.box(
        [x, 4.24, -15.22],
        [6.1, 0.19, 0.47],
        this.trimMaterial,
        0xa4b1b2,
      );
      this.box(
        [x, 3.99, -15.05],
        [1.18, 0.09, 0.055],
        side < 0 ? this.blueMaterial : this.orangeMaterial,
      );
    }

    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable.');
    context.scale(2, 2);
    context.fillStyle = '#263b47';
    context.fillRect(0, 0, 512, 128);
    context.fillStyle = '#d4cdb2';
    context.font = 'bold 52px monospace';
    context.textAlign = 'center';
    context.fillText('THE DEPOT', 256, 62);
    context.fillStyle = '#eaa157';
    context.font = '20px monospace';
    context.fillText('01 / MOVEMENT TRAINING', 256, 100);
    this.signTexture = new CanvasTexture(canvas);
    this.signTexture.colorSpace = SRGBColorSpace;
    this.signTexture.minFilter = LinearMipmapLinearFilter;
    this.signTexture.magFilter = LinearFilter;
    this.signTexture.anisotropy = 8;
    this.signTexture.generateMipmaps = true;
    this.signMaterial = new MeshBasicMaterial({ map: this.signTexture });
    this.box([0, 4, -15.32], [7, 1.75, 0.02], this.signMaterial);
    this.buildSkyline();
    for (const [material, matrices] of this.decorations) {
      const batch = new InstancedMesh(
        material === this.trimMaterial ? this.trimGeometry : this.geometry,
        material,
        matrices.length,
      );
      matrices.forEach(({ matrix, tint }, index) => {
        batch.setMatrixAt(index, matrix);
        batch.setColorAt(index, color.setHex(tint));
      });
      batch.computeBoundingSphere();
      batch.name = material === this.trimMaterial ? 'depot-trim' : '';
      batch.receiveShadow = material === this.trimMaterial;
      batch.castShadow = material === this.trimMaterial;
      this.root.add(batch);
      this.instances.push(batch);
    }
    this.decorations.clear();
    this.configure(settings);
  }

  private buildSkyline(): void {
    // Structures behind the compound remain outside the shared playable bounds.
    const near = new InstancedMesh(this.trimGeometry, this.trimMaterial, 12);
    const far = new InstancedMesh(this.geometry, this.trimMaterial, 4);
    near.name = 'depot-skyline-detail';
    const transform = new Matrix4();
    const color = new Color();
    const buildings = [
      [-18, 8.5, -25, 7, 0x74939e],
      [-8.5, 10.5, -33, 9, 0xa0a8a6],
      [8, 7.6, -26, 8, 0x8f9f9c],
      [19, 11.2, -34, 7, 0x729099],
    ] as const;
    buildings.forEach(([x, height, z, width, tint], i) => {
      transform
        .makeScale(width, height, 5.4)
        .setPosition(x, height / 2 - 6, z + 26);
      far.setMatrixAt(i, transform);
      far.setColorAt(i, color.setHex(tint));
      near.setMatrixAt(i * 3, transform);
      near.setColorAt(i * 3, color);
      near.setMatrixAt(
        i * 3 + 1,
        transform
          .makeScale(width + 0.24, 0.28, 5.6)
          .setPosition(x, height - 6, z + 26),
      );
      near.setColorAt(i * 3 + 1, color.setHex(0xb5c1bd));
      near.setMatrixAt(
        i * 3 + 2,
        transform
          .makeScale(width * 0.54, 0.9, 2.4)
          .setPosition(x, height - 5.4, z + 26),
      );
      near.setColorAt(i * 3 + 2, color.setHex(0x657f88));
    });
    near.computeBoundingSphere();
    far.computeBoundingSphere();
    this.skyline.position.set(0, 6, -26);
    this.skyline.addLevel(near, 0);
    this.skyline.addLevel(far, 30, 0.15);
    this.root.add(this.skyline);
    this.instances.push(near, far);
  }

  configure(settings: GraphicsSettings): void {
    this.surfaces.configure(settings.textureQuality);
    this.contactOcclusion.visible = settings.preset !== 'performance';
    for (const batch of this.instances)
      if (batch.name === 'depot-trim')
        batch.geometry =
          settings.preset === 'performance' ? this.geometry : this.trimGeometry;
    const fog = this.scene.fog as Fog;
    fog.near = settings.viewDistance * 0.65;
    fog.far = settings.viewDistance * 0.95;
    if (settings.shadowQuality !== this.shadowQuality) {
      this.keyLight.shadow.map?.dispose();
      this.keyLight.shadow.map = null;
      this.keyLight.castShadow = settings.shadowQuality !== 'off';
      this.keyLight.shadow.mapSize.setScalar(
        shadowMapSizes[settings.shadowQuality] || 1024,
      );
      this.keyLight.shadow.needsUpdate = this.keyLight.castShadow;
      this.shadowQuality = settings.shadowQuality;
    }
  }

  private frameBox(index: number): void {
    const box = arenaBoxes[index]!;
    const [x, y, z] = box.position,
      [sx, sy, sz] = box.size;
    const tint = index === 6 ? 0xd7a477 : index === 8 ? 0x9eb4b4 : 0xb6c29a;
    const hx = sx / 2 - 0.012,
      hy = sy / 2 - 0.012,
      hz = sz / 2 - 0.012;
    for (const a of [-1, 1])
      for (const b of [-1, 1]) {
        this.box(
          [x, y + a * hy, z + b * hz],
          [sx, 0.028, 0.028],
          this.trimMaterial,
          tint,
        );
        this.box(
          [x + a * hx, y, z + b * hz],
          [0.028, sy, 0.028],
          this.trimMaterial,
          tint,
        );
        this.box(
          [x + a * hx, y + b * hy, z],
          [0.028, 0.028, sz],
          this.trimMaterial,
          tint,
        );
      }
  }

  private box(
    position: [number, number, number],
    size: [number, number, number],
    material: MeshStandardMaterial | MeshBasicMaterial,
    tint = material === this.trimMaterial ? 0x40544a : 0xffffff,
  ): void {
    const transforms = this.decorations.get(material) ?? [];
    transforms.push({
      matrix: new Matrix4().makeScale(...size).setPosition(...position),
      tint,
    });
    this.decorations.set(material, transforms);
  }

  dispose(): void {
    for (const mesh of this.instances) mesh.dispose();
    this.geometry.dispose();
    this.solidGeometry.dispose();
    this.trimGeometry.dispose();
    this.sky.dispose();
    this.contactOcclusion.geometry.dispose();
    this.contactOcclusion.material.dispose();
    this.contactOcclusion.dispose();
    this.keyLight.shadow.dispose();
    this.surfaces.dispose();
    this.trimMaterial.dispose();
    this.orangeMaterial.dispose();
    this.blueMaterial.dispose();
    this.stripeMaterial.dispose();
    this.signMaterial.dispose();
    this.signTexture.dispose();
    this.root.removeFromParent();
    this.root.clear();
  }
}
