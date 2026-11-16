import {
  BoxGeometry,
  Color,
  DataTexture,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  NearestFilter,
  PerspectiveCamera,
  RGBAFormat,
  Scene,
  SRGBColorSpace,
} from 'three';
import {
  weaponOrder,
  type MovementState,
  type WeaponId,
} from '@breakpoint/shared';
import type { WeaponController } from './WeaponController';

/** All three low-poly models are pooled; the active model is one instanced draw. */
export class WeaponViewmodel {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(60, 1, 0.02, 4);
  private readonly root = new Group();
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly texture: DataTexture;
  private readonly material: MeshBasicMaterial;
  private readonly flashMaterial = new MeshBasicMaterial({ color: 0xffc26b });
  private readonly flash = new InstancedMesh(
    this.geometry,
    this.flashMaterial,
    2,
  );
  private readonly models = new Map<WeaponId, InstancedMesh>();
  private selected: WeaponId | null = null;
  private lastShot = 0;
  private kick = 0;
  private stance = 0;
  private cant = 0;

  constructor() {
    const pixels = new Uint8Array(32 * 32 * 4);
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) {
        const value =
          (Math.floor(x / 4) * 7 + Math.floor(y / 4) * 11) % 9 < 2 ? 170 : 230;
        const offset = (y * 32 + x) * 4;
        pixels[offset] = value;
        pixels[offset + 1] = value;
        pixels[offset + 2] = value - 8;
        pixels[offset + 3] = 255;
      }
    this.texture = new DataTexture(pixels, 32, 32, RGBAFormat);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.minFilter = NearestFilter;
    this.texture.magFilter = NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;
    this.material = new MeshBasicMaterial({ map: this.texture });
    for (const id of weaponOrder) this.build(id);
    const transform = new Matrix4();
    this.flash.setMatrixAt(0, transform.makeScale(0.12, 0.035, 0.02));
    this.flash.setMatrixAt(1, transform.makeScale(0.035, 0.12, 0.02));
    this.flash.visible = false;
    this.root.add(this.flash);
    this.scene.add(this.root);
  }

  private build(id: WeaponId): void {
    const barrelLength = id === 'smg' ? 0.2 : id === 'shotgun' ? 0.52 : 0.35;
    const barrelZ = -0.18 - barrelLength / 2;
    const parts = [
      [0, 0, 0, 0.12, 0.14, 0.4, 0x59664f],
      [0, 0.025, barrelZ, 0.04, 0.04, barrelLength, 0x343d37],
      [0, -0.025, 0.29, 0.1, 0.1, id === 'smg' ? 0.13 : 0.22, 0x404b3c],
      [0, -0.13, 0.11, 0.065, 0.2, 0.08, 0x303a32],
      [0, -0.18, -0.035, 0.075, id === 'shotgun' ? 0.06 : 0.2, 0.11, 0x343e35],
      [-0.027, 0.1, 0.14, 0.013, 0.055, 0.03, 0x222a26],
      [0.027, 0.1, 0.14, 0.013, 0.055, 0.03, 0x222a26],
      [0, 0.074, 0.14, 0.065, 0.014, 0.03, 0x222a26],
      [0, 0.095, barrelZ, 0.013, 0.03, 0.02, 0xe5b272],
      [0.062, 0.02, -0.04, 0.005, 0.045, 0.08, 0xc79b60],
      [0.045, -0.1, 0.12, 0.075, 0.1, 0.14, 0x927151],
      [-0.045, -0.075, -0.17, 0.075, 0.08, 0.14, 0x927151],
    ];
    if (id === 'shotgun')
      parts.push([0, -0.02, -0.33, 0.085, 0.075, 0.2, 0x6c7850]);
    const mesh = new InstancedMesh(this.geometry, this.material, parts.length);
    const matrix = new Matrix4();
    const color = new Color();
    parts.forEach((part, index) => {
      const [x, y, z, sx, sy, sz, tint] = part as [
        number,
        number,
        number,
        number,
        number,
        number,
        number,
      ];
      matrix.makeScale(sx, sy, sz).setPosition(x, y, z);
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, color.setHex(tint));
    });
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.models.set(id, mesh);
    this.root.add(mesh);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  update(
    weapons: WeaponController,
    speed: number,
    dt: number,
    active: boolean,
    motion = 1,
    movement: MovementState = 'walking',
  ): void {
    if (this.selected !== weapons.selected) {
      this.selected = weapons.selected;
      for (const [id, mesh] of this.models) mesh.visible = id === this.selected;
    }
    if (weapons.shotsFired !== this.lastShot) {
      this.lastShot = weapons.shotsFired;
      this.kick = 1;
    }
    if (active) this.kick *= Math.exp(-22 * Math.min(dt, 0.1));
    const ads = weapons.ads;
    // Cosmetic stance transitions use frame-rate-independent damping; camera and shots stay authoritative.
    const blend = active ? 1 - Math.exp(-12 * Math.min(dt, 0.1)) : 0;
    const targetStance =
      movement === 'sprinting' ? 0.075 : movement === 'diving' ? 0.11 : 0;
    const targetCant =
      movement === 'sliding' || movement === 'backsliding'
        ? -0.18
        : movement === 'diving'
          ? 0.22
          : 0;
    this.stance += (targetStance - this.stance) * blend;
    this.cant += (targetCant - this.cant) * blend;
    const reload = Math.sin(Math.PI * weapons.reloadProgress);
    const bob = Math.min(1, speed / 8) * (1 - ads * 0.9) * 0.008 * motion;
    this.root.position.set(
      0.27 * (1 - ads) + Math.cos(weapons.time * 9) * bob,
      -0.25 +
        ads * 0.138 -
        reload * 0.16 -
        weapons.equipLowering * 0.22 +
        Math.sin(weapons.time * 18) * bob -
        this.stance * (1 - ads) * motion,
      -0.65 + ads * 0.05 + this.kick * 0.065 * motion,
    );
    this.root.rotation.set(
      this.kick * 0.035 * motion,
      0,
      -reload * 0.65 +
        this.kick * 0.01 * motion +
        this.cant * (1 - ads) * motion,
    );
    this.flash.position.set(
      0,
      0.025,
      weapons.selected === 'smg'
        ? -0.4
        : weapons.selected === 'shotgun'
          ? -0.73
          : -0.56,
    );
    this.flash.visible =
      active && weapons.time - weapons.current.lastShot < 0.045;
  }

  dispose(): void {
    for (const mesh of this.models.values()) mesh.dispose();
    this.flash.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.flashMaterial.dispose();
    this.texture.dispose();
    this.scene.clear();
  }
}
