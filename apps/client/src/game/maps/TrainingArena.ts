import {
  BoxGeometry,
  CanvasTexture,
  type DataTexture,
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  MeshBasicMaterial,
  NearestFilter,
  NearestMipmapNearestFilter,
  type Scene,
  SRGBColorSpace,
} from 'three';
import { arenaBoxes } from './arenaLayout';
import { createAtlasMaterial, createPixelAtlas } from '../rendering/PixelAtlas';
import {
  defaultGraphics,
  type GraphicsSettings,
} from '../rendering/graphicsConfig';

const fogColor = 0x869389;
const surfaceColors = [
  0x7c8272, 0x7c897b, 0x6d7b70, 0x788673, 0x718178, 0x78945a, 0xb67949,
  0x969570, 0x5c7478, 0x96937a, 0x9b8766, 0xa5a075, 0x667b71, 0x667b71,
  0x6b8182, 0x6b8182,
];

/** Shared collision layout, brighter materials, batched edge trim and optional cached static shadows. */
export class TrainingArena {
  private readonly root = new Group();
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly solidGeometry = this.geometry.clone();
  private readonly atlas = createPixelAtlas();
  private readonly lowAtlas = createPixelAtlas(16);
  readonly keyLight = new DirectionalLight(0xfff0d9, 1.6);
  private shadowQuality: GraphicsSettings['shadowQuality'] = 'off';
  private readonly solidMaterial = createAtlasMaterial(
    this.atlas,
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
  );
  private readonly trimMaterial = new MeshLambertMaterial({
    color: 0xffffff,
    flatShading: true,
  });
  private readonly orangeMaterial = new MeshBasicMaterial({ color: 0xeaa157 });
  private readonly blueMaterial = new MeshBasicMaterial({ color: 0x7bb8c1 });
  private readonly stripeMaterial = new MeshBasicMaterial({ color: 0xada269 });
  private readonly signTexture: CanvasTexture;
  private readonly signMaterial: MeshBasicMaterial;
  private readonly decorations = new Map<
    MeshLambertMaterial | MeshBasicMaterial,
    { matrix: Matrix4; tint: number }[]
  >();
  private readonly instances: InstancedMesh[] = [];

  get textureTileSize(): number {
    return (this.solidMaterial.map as DataTexture).image.width / 4;
  }

  constructor(private readonly scene: Scene) {
    scene.background = new Color(fogColor);
    scene.fog = new Fog(fogColor, 39, 57);
    scene.add(this.root);
    this.root.add(new HemisphereLight(0xe4e9db, 0x879482, 2.0));
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
    this.root.add(this.keyLight, this.keyLight.target);
    const solids = new InstancedMesh(
      this.solidGeometry,
      this.solidMaterial,
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
    this.root.add(solids);
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
    }
    for (let index = 5; index <= 11; index++) this.frameBox(index);

    for (const z of [-14, -5, 5, 14]) {
      this.box([-19.55, 3.3, z], [0.2, 5.8, 0.5], this.trimMaterial);
      this.box([19.55, 3.3, z], [0.2, 5.8, 0.5], this.trimMaterial);
      this.box([0, 6.2, z], [40, 0.35, 0.35], this.trimMaterial);
      this.box([-19.42, 3.8, z], [0.08, 0.12, 1.8], this.orangeMaterial);
      this.box([19.42, 3.8, z], [0.08, 0.12, 1.8], this.blueMaterial);
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

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable.');
    context.fillStyle = '#252e29';
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
    this.signTexture.minFilter = NearestMipmapNearestFilter;
    this.signTexture.magFilter = NearestFilter;
    this.signTexture.generateMipmaps = true;
    this.signMaterial = new MeshBasicMaterial({ map: this.signTexture });
    this.box([0, 4, -15.32], [7, 1.75, 0.02], this.signMaterial);
    for (const [material, matrices] of this.decorations) {
      const batch = new InstancedMesh(this.geometry, material, matrices.length);
      matrices.forEach(({ matrix, tint }, index) => {
        batch.setMatrixAt(index, matrix);
        batch.setColorAt(index, color.setHex(tint));
      });
      batch.computeBoundingSphere();
      this.root.add(batch);
      this.instances.push(batch);
    }
    this.decorations.clear();
    this.configure(defaultGraphics);
  }

  configure(settings: GraphicsSettings): void {
    const atlas =
      settings.textureQuality === 'low' ? this.lowAtlas : this.atlas;
    this.solidMaterial.map = atlas;
    this.solidMaterial.userData.tilePixels.value = atlas.image.width / 4;
    const fog = this.scene.fog as Fog;
    fog.near = settings.viewDistance * 0.65;
    fog.far = settings.viewDistance * 0.95;
    if (settings.shadowQuality !== this.shadowQuality) {
      this.keyLight.shadow.map?.dispose();
      this.keyLight.shadow.map = null;
      this.keyLight.castShadow = settings.shadowQuality !== 'off';
      this.keyLight.shadow.mapSize.setScalar(
        settings.shadowQuality === 'high' ? 1024 : 512,
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
    material: MeshLambertMaterial | MeshBasicMaterial,
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
    this.atlas.dispose();
    this.lowAtlas.dispose();
    this.keyLight.shadow.dispose();
    this.solidMaterial.dispose();
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
