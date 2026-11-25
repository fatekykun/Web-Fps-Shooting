import {
  BoxGeometry,
  CircleGeometry,
  Color,
  DataTexture,
  Group,
  HemisphereLight,
  DirectionalLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  NearestFilter,
  NearestMipmapNearestFilter,
  Object3D,
  PerspectiveCamera,
  RGBAFormat,
  Scene,
  SRGBColorSpace,
  Vector3,
} from 'three';
import {
  degreesToRadians,
  weaponOrder,
  type MovementState,
  type WeaponId,
  type WeaponInput,
} from '@breakpoint/shared';
import type { WeaponController } from './WeaponController';
import { createReadableMaterial } from '../rendering/ReadableMaterial';
import type { GraphicsSettings } from '../rendering/graphicsConfig';
import type { ScopeStyle } from '../settings/userSettings';
import { weaponSights, type WeaponPart } from './WeaponSights';
import {
  sniperRaise,
  sniperEyePosition,
  sniperScopeBlend,
} from './SniperScope';
import { FirstPersonArms } from '../characters/FirstPersonArms';
import { strideRadiansPerMeter } from '@breakpoint/shared/character';
import { slideMomentum } from '@breakpoint/shared/movement/Sliding';
import { weaponMuzzles } from './WeaponMuzzles';
import { RecoilSpring } from './Recoil';

/** Low-poly models are pooled; the active model is one instanced draw. */
export class WeaponViewmodel {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(60, 1, 0.02, 4);
  private readonly root = new Group();
  private readonly dotGeometry = new CircleGeometry(
    weaponSights.rifle.reticle!.radius,
    8,
  );
  private readonly dotMaterial = new MeshBasicMaterial({
    color: 0xff3b30,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly aimDot = new Mesh(this.dotGeometry, this.dotMaterial);
  private readonly sightInverse = new Matrix4();
  private readonly sightOrigin = new Vector3();
  private readonly sightDirection = new Vector3();
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly texture: DataTexture;
  private readonly lowTexture: DataTexture;
  private readonly material: MeshLambertMaterial;
  private readonly arms: FirstPersonArms;
  private readonly flashMaterial = new MeshBasicMaterial({ color: 0xffc26b });
  private readonly flash = new InstancedMesh(
    this.geometry,
    this.flashMaterial,
    2,
  );
  private readonly models = new Map<WeaponId, InstancedMesh>();
  private readonly muzzles = new Map<WeaponId, Object3D>();
  private selected: WeaponId | null = null;
  private readonly recoil = new RecoilSpring();
  private readonly recoilSample = { pitch: 0, yaw: 0 };
  private recoilWeapon: WeaponId | null = null;
  private stance = 0;
  private cant = 0;
  private sprint = 0;
  private slide = 0;
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
    this.arms = new FirstPersonArms(this.material);
    this.root.add(this.arms.root);
    const key = new DirectionalLight(0xfff0d9, 1.5);
    key.position.set(-2, 4, 3);
    this.scene.add(new HemisphereLight(0xf1f0dc, 0x8b9e8e, 2.1), key);
    for (const id of weaponOrder) this.build(id);
    const transform = new Matrix4();
    this.flash.setMatrixAt(0, transform.makeScale(0.12, 0.035, 0.02));
    this.flash.setMatrixAt(1, transform.makeScale(0.035, 0.12, 0.02));
    this.flash.visible = false;
    this.root.add(this.flash);
    this.aimDot.name = 'rifle-red-dot';
    this.aimDot.visible = false;
    this.aimDot.renderOrder = 1;
    this.root.add(this.aimDot);
    this.scene.add(this.root);
  }

  private build(id: WeaponId): void {
    const barrelLength = weaponMuzzles[id].barrelLength;
    const barrelZ = -0.18 - barrelLength / 2;
    const parts: WeaponPart[] = [
      [0, 0, 0, 0.12, 0.14, 0.4, 0x8c9d83],
      [0, 0.025, barrelZ, 0.04, 0.04, barrelLength, 0x505f65],
      [0, -0.025, 0.29, 0.1, 0.1, id === 'smg' ? 0.13 : 0.22, 0x677b68],
      [0, -0.13, 0.11, 0.065, 0.2, 0.08, 0x4f6054],
      [0, -0.18, -0.035, 0.085, id === 'shotgun' ? 0.06 : 0.22, 0.13, 0x4b5f67],
      [0.062, 0.02, -0.04, 0.005, 0.045, 0.08, 0xe2b77a],
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
      [0, -0.08, 0.025, 0.018, 0.035, 0.07, 0xc8c8ab],
    ];
    if (id === 'shotgun')
      parts.push([0, -0.02, -0.33, 0.085, 0.075, 0.2, 0x6c7850]);
    if (id === 'sniper') {
      parts.push(
        [0, 0.05, 0.3, 0.11, 0.09, 0.25, 0x8e9974],
        [0, -0.025, 0.43, 0.13, 0.22, 0.055, 0x35453b],
        [0, 0.025, -1.03, 0.07, 0.07, 0.06, 0x29353b],
        [0.065, 0.045, 0.04, 0.02, 0.03, 0.17, 0xb5bcb4],
      );
    }
    parts.push(...weaponSights[id].parts);
    if (id === 'sniper') {
      this.boltIndex = parts.length;
      parts.push([0.115, 0.045, 0.095, 0.1, 0.035, 0.035, 0x9ca89c]);
    }
    const mesh = new InstancedMesh(this.geometry, this.material, parts.length);
    mesh.name = `weapon-${id}`;
    const matrix = new Matrix4();
    const color = new Color();
    const scale = new Vector3();
    parts.forEach((part, index) => {
      const [x, y, z, sx, sy, sz, tint, rotation] = part;
      matrix
        .makeRotationZ(rotation ?? 0)
        .scale(scale.set(sx, sy, sz))
        .setPosition(x, y, z);
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, color.setHex(tint));
    });
    mesh.frustumCulled = false;
    mesh.visible = false;
    const muzzle = new Object3D();
    muzzle.name = `muzzle-${id}`;
    muzzle.position.set(...weaponMuzzles[id].firstPerson);
    mesh.add(muzzle);
    this.muzzles.set(id, muzzle);
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

  get hasAimDot(): boolean {
    return this.aimDot.visible;
  }

  /** Match the barrel's screen position across the separate viewmodel/world FOVs. */
  muzzleWorldPosition(
    id: WeaponId,
    camera: PerspectiveCamera,
    out: Vector3,
    worldFov = camera.fov,
  ): Vector3 {
    this.camera.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    this.muzzles.get(id)!.getWorldPosition(out);
    out.applyMatrix4(this.camera.matrixWorldInverse);
    const scale =
      Math.tan((worldFov * Math.PI) / 360) /
      Math.tan((this.camera.fov * Math.PI) / 360);
    out.x *= (scale * camera.aspect) / this.camera.aspect;
    out.y *= scale;
    return out.applyMatrix4(camera.matrixWorld);
  }

  private updateAimDot(weapons: WeaponController, active: boolean): void {
    const reticle = weaponSights[weapons.selected].reticle;
    this.aimDot.visible = false;
    if (!active || !reticle) return;
    // Collimate onto the actual camera aim ray, constrained to the optic window.
    // This keeps recoil/sway from moving the dot away from the bullet's aim line.
    this.root.updateMatrix();
    this.sightInverse.copy(this.root.matrix).invert();
    this.sightOrigin.set(0, 0, 0).applyMatrix4(this.sightInverse);
    this.sightDirection.set(0, 0, -1).transformDirection(this.sightInverse);
    if (this.sightDirection.z >= -0.001) return;
    const distance =
      (reticle.center[2] - this.sightOrigin.z) / this.sightDirection.z;
    if (distance <= this.camera.near) return;
    this.aimDot.position
      .copy(this.sightOrigin)
      .addScaledVector(this.sightDirection, distance);
    this.aimDot.visible =
      Math.abs(this.aimDot.position.x - reticle.center[0]) + reticle.radius <
        reticle.halfWindow[0] &&
      Math.abs(this.aimDot.position.y - reticle.center[1]) + reticle.radius <
        reticle.halfWindow[1];
  }

  simulateRecoil(weapons: WeaponController, dt: number, fired: boolean): void {
    if (this.recoilWeapon !== weapons.selected) {
      this.resetRecoil();
      this.recoilWeapon = weapons.selected;
    }
    this.recoil.step(dt);
    if (!fired) return;
    const { springStiffness, springDamping, weaponAdsMultiplier } =
      weapons.config.recoil;
    const frequency = Math.sqrt(springStiffness);
    const damping = Math.max(1, springDamping);
    const ratio = damping + Math.sqrt(damping ** 2 - 1);
    this.recoil.rates(frequency * ratio, frequency / ratio);
    const aim = 1 + (weaponAdsMultiplier - 1) * weapons.ads;
    this.recoil.impulse(
      weapons.recoil.shot.pitch * aim,
      weapons.recoil.shot.yaw * aim,
      1.85,
      1.35,
    );
  }

  resetRecoil(): void {
    this.recoil.reset();
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
    ads = weapons.ads,
    recoilTime = 0,
  ): void {
    if (this.selected !== weapons.selected) {
      this.selected = weapons.selected;
      if (this.recoilWeapon !== this.selected) this.resetRecoil();
      for (const [id, mesh] of this.models) mesh.visible = id === this.selected;
    }
    const recoil = this.recoil.sample(recoilTime, this.recoilSample);
    const kick = recoil.pitch * motion;
    const lateral = recoil.yaw * motion;
    const profile = weapons.config.recoil;
    const scoped = !!weapons.config.scopeMagnification;
    const pose = weaponSights[weapons.selected].ads;
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
    const targetStance =
      movement === 'diving'
        ? 0.11
        : movement === 'prone'
          ? 0.04
          : movement === 'crouching'
            ? 0.015
            : 0;
    const slideTarget =
      movement === 'sliding' || movement === 'backsliding'
        ? 0.75 + 0.25 * slideMomentum(speed, movement === 'backsliding')
        : 0;
    const targetCant =
      slideTarget > 0 ? -0.055 * slideTarget : movement === 'diving' ? 0.22 : 0;
    this.stance += (targetStance - this.stance) * blend;
    this.cant += (targetCant - this.cant) * blend;
    this.slide += (slideTarget - this.slide) * blend;
    const brace = this.slide * (1 - ads) ** 3;
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
    if (
      active &&
      (movement === 'sprinting' ||
        movement === 'walking' ||
        movement === 'crouching' ||
        movement === 'prone') &&
      speed > 0.5
    )
      this.stridePhase =
        (this.stridePhase + speed * Math.min(dt, 0.1) * strideRadiansPerMeter) %
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
      0.27 +
        (pose.position[0] - 0.27) * raise +
        lateral * profile.weaponSway +
        Math.cos(weapons.time * 9) * bob +
        carry * (0.02 + sway * 0.012 * motion) +
        brace * 0.025 * motion,
      -0.25 +
        (pose.position[1] + 0.25) * raise -
        reload * 0.16 -
        weapons.equipLowering * 0.22 +
        Math.sin(weapons.time * 18) * bob -
        this.stance * (1 - ads) * motion +
        carry * (-0.03 + step * 0.01 * motion) -
        brace * 0.055 * motion,
      (scoped
        ? sniperEyePosition(ads, pose.position[2])
        : -0.65 + (pose.position[2] + 0.65) * raise) +
        kick * profile.weaponKickback -
        carry * 0.22 +
        brace * 0.035 * motion,
    );
    this.root.rotation.set(
      pose.rotation[0] * raise +
        kick * profile.weaponPitch * degreesToRadians +
        carry * (0.9 + step * 0.018 * motion),
      pose.rotation[1] * raise +
        lateral * profile.weaponYaw * degreesToRadians +
        carry * (0.22 + Math.cos(this.stridePhase) * 0.012 * motion),
      pose.rotation[2] * raise -
        reload * 0.65 +
        lateral * profile.weaponRoll * degreesToRadians +
        this.cant * (1 - ads) * motion +
        carry * (-0.25 + sway * 0.018 * motion),
    );
    if (active)
      this.arms.update(
        reload,
        brace * motion,
        carry * (1 - reload),
        this.stridePhase,
        motion,
      );
    this.flash.position.set(...weaponMuzzles[weapons.selected].firstPerson);
    this.flash.visible =
      active && weapons.time - weapons.current.lastShot < 0.045;
    this.updateAimDot(weapons, active);
  }

  dispose(): void {
    this.arms.dispose();
    for (const mesh of this.models.values()) mesh.dispose();
    this.flash.dispose();
    this.dotGeometry.dispose();
    this.dotMaterial.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.flashMaterial.dispose();
    this.texture.dispose();
    this.lowTexture.dispose();
    this.scene.clear();
  }
}
