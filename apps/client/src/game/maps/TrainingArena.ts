import {
  BoxGeometry,
  CanvasTexture,
  Color,
  Fog,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  MeshBasicMaterial,
  NearestFilter,
  Scene,
  SRGBColorSpace,
} from 'three';
import { arenaBoxes } from './arenaLayout';
import { createAtlasMaterial, createPixelAtlas } from '../rendering/PixelAtlas';

/** Shared unit geometry, instanced architecture, no shadows or external assets. */
export class TrainingArena {
  readonly scene = new Scene();
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly solidGeometry = this.geometry.clone();
  private readonly atlas = createPixelAtlas();
  private readonly solidMaterial = createAtlasMaterial(
    this.atlas,
    this.solidGeometry,
    arenaBoxes.map((_, index) =>
      index === 0
        ? 0
        : index < 5
          ? 1
          : index < 7
            ? 2
            : index === 11
              ? 4
              : index > 13
                ? 5
                : 3,
    ),
  );
  private readonly trimMaterial = new MeshLambertMaterial({ color: 0x252e29 });
  private readonly orangeMaterial = new MeshBasicMaterial({ color: 0xeaa157 });
  private readonly blueMaterial = new MeshBasicMaterial({ color: 0x7bb8c1 });
  private readonly stripeMaterial = new MeshBasicMaterial({ color: 0xada269 });
  private readonly signTexture: CanvasTexture;
  private readonly signMaterial: MeshBasicMaterial;
  private readonly decorations = new Map<
    MeshLambertMaterial | MeshBasicMaterial,
    Matrix4[]
  >();
  private readonly instances: InstancedMesh[] = [];

  constructor() {
    this.scene.background = new Color(0x48524b);
    this.scene.fog = new Fog(0x48524b, 18, 60);
    this.scene.add(new HemisphereLight(0xdbe0cd, 0x293429, 2.4));
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
      solids.setColorAt(index, color.setHex(box.color));
    });
    solids.computeBoundingSphere();
    this.scene.add(solids);
    this.instances.push(solids);

    // Thin decorative ribs share one instance batch.
    const ribs = new InstancedMesh(this.geometry, this.trimMaterial, 64);
    let rib = 0;
    for (const x of [-9.02, -4.98, 4.98, 9.02]) {
      const centerZ = x < 0 ? -4 : -7;
      for (let i = 0; i < 16; i++) {
        matrix
          .makeScale(0.05, 2.8, 0.07)
          .setPosition(x, 1.5, centerZ - 3.7 + i * 0.49);
        ribs.setMatrixAt(rib++, matrix);
      }
    }
    ribs.computeBoundingSphere();
    this.scene.add(ribs);
    this.instances.push(ribs);

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
    this.signTexture.minFilter = NearestFilter;
    this.signTexture.magFilter = NearestFilter;
    this.signTexture.generateMipmaps = false;
    this.signMaterial = new MeshBasicMaterial({ map: this.signTexture });
    this.box([0, 4, -15.32], [7, 1.75, 0.02], this.signMaterial);
    for (const [material, matrices] of this.decorations) {
      const batch = new InstancedMesh(this.geometry, material, matrices.length);
      matrices.forEach((transform, index) =>
        batch.setMatrixAt(index, transform),
      );
      batch.computeBoundingSphere();
      this.scene.add(batch);
      this.instances.push(batch);
    }
    this.decorations.clear();
  }

  private box(
    position: [number, number, number],
    size: [number, number, number],
    material: MeshLambertMaterial | MeshBasicMaterial,
  ): void {
    const transforms = this.decorations.get(material) ?? [];
    transforms.push(new Matrix4().makeScale(...size).setPosition(...position));
    this.decorations.set(material, transforms);
  }

  dispose(): void {
    for (const mesh of this.instances) mesh.dispose();
    this.geometry.dispose();
    this.solidGeometry.dispose();
    this.atlas.dispose();
    this.solidMaterial.dispose();
    this.trimMaterial.dispose();
    this.orangeMaterial.dispose();
    this.blueMaterial.dispose();
    this.stripeMaterial.dispose();
    this.signMaterial.dispose();
    this.signTexture.dispose();
    this.scene.clear();
  }
}
