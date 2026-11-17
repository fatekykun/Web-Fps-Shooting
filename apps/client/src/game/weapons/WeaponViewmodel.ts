import {
  BoxGeometry,
  Color,
  DataTexture,
  Group,
  HemisphereLight,
  DirectionalLight,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  NearestFilter,
  NearestMipmapNearestFilter,
  PerspectiveCamera,
  RGBAFormat,
  Scene,
  SRGBColorSpace,
  Vector3,
} from 'three';
import {
  weaponOrder,
  type MovementState,
  type WeaponId,
  type WeaponInput,
} from '@breakpoint/shared';
import type { WeaponController } from './WeaponController';
import { createReadableMaterial } from '../rendering/ReadableMaterial';
import type { GraphicsSettings } from '../rendering/graphicsConfig';
import type { ScopeStyle } from '../settings/userSettings';
import {
  sniperRaise,
  sniperEyePosition,
  sniperScopeBlend,
} from './SniperScope';

/** Low-poly models are pooled; the active model is one instanced draw. */
export class WeaponViewmodel {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(60, 1, 0.02, 4);
  private readonly root = new Group();
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly texture: DataTexture;
  private readonly lowTexture: DataTexture;
  private readonly material: MeshLambertMaterial;
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
  private sprint = 0;
  private stridePhase = 0;
  private reloadPose = 0;
  private readonly boltMatrix = new Matrix4();
  private readonly boltScale = new Vector3(0.1, 0.035, 0.035);
  private boltIndex = 0;

  constructor() {
    const pixels = new Uint8Array(32 * 32 * 4);
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) {
        const value =
          (Math.floor(x / 4) * 7 + Math.floor(y / 4) * 11) % 13 < 2 ? 225 : 248;
        const offset = (y * 32 + x) * 4;
        pixels[offset] = value;
        pixels[offset + 1] = value;
        pixels[offset + 2] = value - 8;
        pixels[offset + 3] = 255;
      }
    this.texture = new DataTexture(pixels, 32, 32, RGBAFormat);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.minFilter = NearestMipmapNearestFilter;
    this.texture.magFilter = NearestFilter;
    this.texture.generateMipmaps = true;
    this.texture.needsUpdate = true;
    const lowPixels = new Uint8Array(16 * 16 * 4);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++)
        for (let c = 0; c < 4; c++)
          lowPixels[(y * 16 + x) * 4 + c] =
            pixels[(y * 2 * 32 + x * 2) * 4 + c]!;
    this.lowTexture = new DataTexture(lowPixels, 16, 16, RGBAFormat);
    this.lowTexture.colorSpace = SRGBColorSpace;
    this.lowTexture.minFilter = NearestMipmapNearestFilter;
    this.lowTexture.magFilter = NearestFilter;
    this.lowTexture.generateMipmaps = true;
    this.lowTexture.needsUpdate = true;
    this.material = createReadableMaterial({ map: this.texture }, 0.12);
    const key = new DirectionalLight(0xfff0d9, 1.5);
    key.position.set(-2, 4, 3);
    this.scene.add(new HemisphereLight(0xf1f0dc, 0x8b9e8e, 2.1), key);
    for (const id of weaponOrder) this.build(id);
    const transform = new Matrix4();
    this.flash.setMatrixAt(0, transform.makeScale(0.12, 0.035, 0.02));
    this.flash.setMatrixAt(1, transform.makeScale(0.035, 0.12, 0.02));
    this.flash.visible = false;
    this.root.add(this.flash);
    this.scene.add(this.root);
  }

  private build(id: WeaponId): void {
    const barrelLength =
      id === 'sniper'
        ? 0.83
        : id === 'smg'
          ? 0.2
          : id === 'shotgun'
            ? 0.52
            : 0.35;
    const barrelZ = -0.18 - barrelLength / 2;
    const parts = [
      [0, 0, 0, 0.12, 0.14, 0.4, 0x8c9d83],
      [0, 0.025, barrelZ, 0.04, 0.04, barrelLength, 0x505f65],
      [0, -0.025, 0.29, 0.1, 0.1, id === 'smg' ? 0.13 : 0.22, 0x677b68],
      [0, -0.13, 0.11, 0.065, 0.2, 0.08, 0x4f6054],
      [0, -0.18, -0.035, 0.085, id === 'shotgun' ? 0.06 : 0.22, 0.13, 0x4b5f67],
      [-0.027, 0.1, 0.14, 0.013, 0.055, 0.03, 0x222a26],
      [0.027, 0.1, 0.14, 0.013, 0.055, 0.03, 0x222a26],
      [0, 0.074, 0.14, 0.065, 0.014, 0.03, 0x222a26],
      [0, 0.095, barrelZ, 0.013, 0.03, 0.02, 0xe5b272],
      [0, 0.065, barrelZ, 0.018, 0.04, 0.025, 0x536568],
      [0.062, 0.02, -0.04, 0.005, 0.045, 0.08, 0xe2b77a],
      [0.045, -0.1, 0.12, 0.075, 0.1, 0.14, 0xc59b77],
      [-0.045, -0.075, -0.17, 0.075, 0.08, 0.14, 0xc59b77],
      [0, 0.065, -0.03, 0.125, 0.012, 0.28, 0xb4bdab],
      [
        0,
        id === 'shotgun' ? -0.222 : -0.302,
        -0.035,
        0.1,
        0.024,
        0.15,
        0x899ba1,
      ],
      [0.045, -0.125, 0.19, 0.083, 0.11, 0.06, 0x758869],
      [-0.045, -0.085, -0.1, 0.083, 0.09, 0.05, 0x758869],
      [0, -0.08, 0.025, 0.018, 0.035, 0.07, 0xc8c8ab],
    ];
    if (id === 'shotgun')
      parts.push([0, -0.02, -0.33, 0.085, 0.075, 0.2, 0x6c7850]);
    if (id === 'sniper') {
      parts.push(
        [0, 0.125, 0, 0.05, 0.1, 0.065, 0x3c4941],
        [0, 0.05, 0.3, 0.11, 0.09, 0.25, 0x8e9974],
        [0, -0.025, 0.43, 0.13, 0.22, 0.055, 0x35453b],
        [0, 0.025, -1.03, 0.07, 0.07, 0.06, 0x29353b],
        [0.065, 0.045, 0.04, 0.02, 0.03, 0.17, 0xb5bcb4],
      );
      // Faceted, hollow tube and eyepiece stay in the same instanced model draw.
      for (const [radius, z, length, color] of [
        [0.039, -0.055, 0.39, 0x364b4e],
        [0.054, -0.265, 0.08, 0x202f34],
        [0.049, 0.16, 0.064, 0x172a31],
      ]) {
        for (let segment = 0; segment < 12; segment++) {
          const angle = (segment * Math.PI * 2) / 12;
          parts.push([
            Math.cos(angle) * radius!,
            0.19 + Math.sin(angle) * radius!,
            z!,
            0.012,
            2 * radius! * Math.tan(Math.PI / 12),
            length!,
            color!,
            angle,
          ]);
        }
      }
      this.boltIndex = parts.length;
      parts.push([0.115, 0.045, 0.095, 0.1, 0.035, 0.035, 0x9ca89c]);
    }
    const mesh = new InstancedMesh(this.geometry, this.material, parts.length);
    mesh.name = `weapon-${id}`;
    const matrix = new Matrix4();
    const color = new Color();
    const scale = new Vector3();
    parts.forEach((part, index) => {
      const [x, y, z, sx, sy, sz, tint, rotation] = part as [
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number?,
      ];
      matrix
        .makeRotationZ(rotation ?? 0)
        .scale(scale.set(sx, sy, sz))
        .setPosition(x, y, z);
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

  configureTexture(quality: GraphicsSettings['textureQuality']): void {
    this.material.map = quality === 'low' ? this.lowTexture : this.texture;
  }

  update(
    weapons: WeaponController,
    speed: number,
    dt: number,
    active: boolean,
    motion = 1,
    movement: MovementState = 'walking',
    scopeStyle: ScopeStyle = 'classic',
    input?: Pick<WeaponInput, 'aim' | 'fire'>,
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
    const scoped = !!weapons.config.scopeMagnification;
    const raise = scoped ? sniperRaise(ads) : ads;
    this.root.visible =
      active &&
      (!scoped || scopeStyle === 'optic' || sniperScopeBlend(ads) < 1);
    if (weapons.selected === 'sniper') {
      const progress = weapons.cycleProgress;
      const pull = weapons.cycling ? Math.sin(Math.PI * progress) : 0;
      const lift = weapons.cycling
        ? Math.sin(Math.PI * Math.min(1, progress * 3))
        : 0;
      this.boltMatrix
        .makeRotationZ(lift * 0.8)
        .scale(this.boltScale)
        .setPosition(0.115, 0.045 + lift * 0.035, 0.095 + pull * 0.16);
      const sniper = this.models.get('sniper')!;
      sniper.setMatrixAt(this.boltIndex, this.boltMatrix);
      sniper.instanceMatrix.needsUpdate = true;
    }
    // Cosmetic stance transitions use frame-rate-independent damping; camera and shots stay authoritative.
    const blend = active ? 1 - Math.exp(-12 * Math.min(dt, 0.1)) : 0;
    const targetStance = movement === 'diving' ? 0.11 : 0;
    const targetCant =
      movement === 'sliding' || movement === 'backsliding'
        ? -0.18
        : movement === 'diving'
          ? 0.22
          : 0;
    this.stance += (targetStance - this.stance) * blend;
    this.cant += (targetCant - this.cant) * blend;
    const recentlyFired =
      weapons.time - weapons.current.lastShot <
      Math.min(0.25, weapons.config.fireInterval + 0.08);
    const carrying =
      movement === 'sprinting' &&
      speed > 0.5 &&
      ads < 0.01 &&
      !input?.aim &&
      !input?.fire &&
      !recentlyFired &&
      !weapons.reloading &&
      !weapons.equipping;
    const sprintBlend = active
      ? 1 - Math.exp(-(carrying ? 12 : 18) * Math.min(dt, 0.1))
      : 0;
    this.sprint += ((carrying ? 1 : 0) - this.sprint) * sprintBlend;
    // Integrate traveled distance rather than wall-clock time, matching sprint cadence.
    if (active && movement === 'sprinting' && speed > 0.5)
      this.stridePhase =
        (this.stridePhase + (speed * Math.min(dt, 0.1) * Math.PI) / 1.8) %
        (Math.PI * 2);
    const carry = this.sprint * (1 - ads) ** 3;
    const sway = Math.sin(this.stridePhase);
    const step = Math.sin(this.stridePhase * 2);
    const reloadTarget = Math.sin(Math.PI * weapons.reloadProgress);
    const reloadBlend = active
      ? 1 - Math.exp(-(weapons.reloading ? 12 : 18) * Math.min(dt, 0.1))
      : 0;
    this.reloadPose += (reloadTarget - this.reloadPose) * reloadBlend;
    const reload = this.reloadPose;
    const bob =
      Math.min(1, speed / 8) * (1 - ads * 0.9) * 0.008 * motion * (1 - carry);
    this.root.position.set(
      0.27 * (1 - raise) +
        Math.cos(weapons.time * 9) * bob +
        carry * (0.02 + sway * 0.012 * motion),
      -0.25 +
        (scoped ? raise * 0.06 : ads * 0.138) -
        reload * 0.16 -
        weapons.equipLowering * 0.22 +
        Math.sin(weapons.time * 18) * bob -
        this.stance * (1 - ads) * motion +
        carry * (-0.03 + step * 0.01 * motion),
      (scoped ? sniperEyePosition(ads) : -0.65 + ads * 0.05) +
        this.kick * 0.065 * motion -
        carry * 0.22,
    );
    this.root.rotation.set(
      this.kick * 0.035 * motion + carry * (0.9 + step * 0.018 * motion),
      carry * (0.22 + Math.cos(this.stridePhase) * 0.012 * motion),
      -reload * 0.65 +
        this.kick * 0.01 * motion +
        this.cant * (1 - ads) * motion +
        carry * (-0.25 + sway * 0.018 * motion),
    );
    this.flash.position.set(
      0,
      0.025,
      weapons.selected === 'sniper'
        ? -1.08
        : weapons.selected === 'smg'
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
    this.lowTexture.dispose();
    this.scene.clear();
  }
}
