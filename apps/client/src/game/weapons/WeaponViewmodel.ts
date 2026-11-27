import {
  BoxGeometry,
  CircleGeometry,
  Color,
  DataTexture,
  Euler,
  Group,
  HemisphereLight,
  DirectionalLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  InstancedBufferAttribute,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Vector3,
} from 'three';
import {
  degreesToRadians,
  weaponOrder,
  type GunId,
  type MovementState,
  type WeaponId,
  type WeaponInput,
} from '@breakpoint/shared';
import {
  defaultMeleeSkin,
  type MeleeSkin,
} from '@breakpoint/shared/weapons/loadouts';
import { weaponAsset } from './WeaponAssets';
import type { WeaponController } from './WeaponController';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createEquipmentTexture } from '../rendering/EquipmentSurface';
import { createReadableMaterial } from '../rendering/ReadableMaterial';
import type { GraphicsSettings } from '../rendering/graphicsConfig';
import type { ScopeStyle } from '../settings/userSettings';
import { weaponSights, type WeaponPart } from './WeaponSights';
import {
  sniperRaise,
  sniperEyePosition,
  sniperScopeBlend,
  sniperScopeDiameter,
} from './SniperScope';
import {
  FirstPersonArms,
  type MeleeHands,
} from '../characters/FirstPersonArms';
import { meleeGloveAsset, meleeGrip } from '../characters/MeleeGlove';
import type { OperatorId } from '@breakpoint/shared/operators';
import { strideRadiansPerMeter } from '@breakpoint/shared/character';
import { slideMomentum } from '@breakpoint/shared/movement/Sliding';
import { weaponMuzzles } from './WeaponMuzzles';
import { RecoilSpring } from './Recoil';
import { CinderWyrm, cinderReticle } from './CinderWyrm';
import type { RifleSkin, WeaponSkinStatus } from './RifleSkins';
import type { MementoMori } from './MementoMori';
import type { LotusLava } from './LotusLava';
import type { SniperSkin } from './SniperSkins';
import type { ShotgunSkin } from './ShotgunSkins';
import type { GloriousBlaze } from './GloriousBlaze';
import type { NeonBlade } from './NeonBlade';
import type { SmgSkin } from './SmgSkins';

const easeUnit = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

const inspectSeconds = 2.2;

const knifeGrip = new Quaternion().setFromAxisAngle(
  new Vector3(0, 0, 1),
  Math.PI,
);
const karambitGrip = new Quaternion().setFromAxisAngle(
  new Vector3(0, 1, 0),
  3.6,
);
const katanaGrip = new Quaternion().setFromAxisAngle(
  new Vector3(1, 0, 0),
  Math.PI,
);

const meleeStances = {
  'glacier-fang': {
    grip: [0.285, -0.195, -0.57],
    tilt: [-0.17, -0.4, 1.55],
    hand: knifeGrip,
    swing: { x: 0.36, depth: 0.08, roll: 0.92 },
  },
  'ember-talon': {
    grip: [0.295, -0.13, -0.55],
    tilt: [0.15, -0.37, 2.79],
    hand: karambitGrip,
    swing: { x: 0.25, depth: 0.06, roll: -0.6 },
  },
  'void-ronin': {
    grip: [0.288, -0.231, -0.64],
    tilt: [-0.54, -0.28, -0.1],
    hand: katanaGrip,
    swing: { x: 0.27, depth: 0.035, roll: 0.62 },
  },
} as const satisfies Record<
  MeleeSkin,
  {
    grip: readonly [number, number, number];
    tilt: readonly [number, number, number];
    hand: Quaternion;
    swing: { x: number; depth: number; roll: number };
  }
>;

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
  private readonly sightRotation = new Quaternion();
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly texture: DataTexture;
  private readonly lowTexture: DataTexture;
  private readonly material: MeshStandardMaterial;
  private readonly fabric = createEquipmentTexture(256, true);
  private readonly fabricMaterial = createReadableMaterial(
    { map: this.fabric, roughness: 0.87, metalness: 0.025 },
    0.13,
  );
  private hdTexture?: DataTexture;
  private readonly arms: FirstPersonArms;
  private readonly meleeModel = new Group();
  private readonly freeHandTilt = new Euler(0, 0, 0, 'ZYX');
  private readonly gripCenter = new Vector3();
  private readonly meleeHands: MeleeHands = {
    left: { wrist: new Vector3(), rotation: new Quaternion() },
    right: { wrist: new Vector3(), rotation: new Quaternion() },
  };
  private meleeSkin?: MeleeSkin;
  private meleeGeneration = 0;
  meleeSkinStatus: WeaponSkinStatus = 'loading';
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
  private cinder?: CinderWyrm;
  private memento?: MementoMori;
  private mementoRequest?: AbortController;
  private mementoUnavailable = false;
  private mountedSightAimed = false;
  private rifleSkin: RifleSkin = 'standard';
  private sniperSkin: SniperSkin = 'standard';
  private lotus?: LotusLava;
  private lotusRequest?: AbortController;
  private lotusUnavailable = false;
  private shotgunSkin: ShotgunSkin = 'standard';
  private blaze?: GloriousBlaze;
  private blazeRequest?: AbortController;
  private blazeUnavailable = false;
  private smgSkin: SmgSkin = 'standard';
  private neon?: NeonBlade;
  private neonRequest?: AbortController;
  private neonUnavailable = false;
  private inspectRequested = false;
  private inspectTime: number | null = null;

  constructor() {
    this.texture = createEquipmentTexture(512);
    this.lowTexture = createEquipmentTexture(128);
    this.material = createReadableMaterial({ map: this.texture }, 0.15);
    const readable = this.material.onBeforeCompile;
    this.material.onBeforeCompile = (shader, renderer) => {
      readable.call(this.material, shader, renderer);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute float equipmentFinish;\nvarying float vEquipmentFinish;',
        )
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvEquipmentFinish = equipmentFinish;',
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying float vEquipmentFinish;',
        )
        .replace(
          '#include <metalnessmap_fragment>',
          '#include <metalnessmap_fragment>\nmetalnessFactor = vEquipmentFinish;',
        )
        .replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\nroughnessFactor = clamp(0.83 - 0.66 * vEquipmentFinish + (diffuseColor.g - 0.23) * 0.08, 0.27, 0.91);',
        );
    };
    this.material.customProgramCacheKey = () => 'breakpoint-equipment-finish';
    this.arms = new FirstPersonArms(this.fabricMaterial);
    this.root.add(this.arms.root);
    this.meleeModel.name = 'melee-model';
    this.meleeModel.visible = false;
    this.root.add(this.meleeModel);
    const key = new DirectionalLight(0xffe8d0, 2.25);
    key.position.set(-2, 4, 3);
    const rim = new DirectionalLight(0x9ac7ef, 0.8);
    rim.position.set(3, 1, -2);
    this.scene.add(new HemisphereLight(0xe6eff8, 0x889488, 1.65), key, rim);
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

  private build(id: GunId): void {
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
    const finishes = [0.23, 0.68, 0.08, 0.03, 0.31, 0.51, 0.66, 0.29, 0.55];
    const detail = (part: WeaponPart, finish: number) => {
      parts.push(part);
      finishes.push(finish);
    };
    for (const side of [-1, 1]) {
      detail([side * 0.064, -0.025, 0.015, 0.01, 0.045, 0.25, 0x41494a], 0.12);
      for (const z of [-0.15, 0.12])
        detail([side * 0.073, 0.014, z, 0.014, 0.019, 0.019, 0x9ca69d], 0.65);
      for (let notch = 0; notch < 5; notch++)
        detail(
          [
            side * 0.038,
            -0.096 - notch * 0.022,
            0.116,
            0.012,
            0.011,
            0.068,
            0x3c4440,
          ],
          0.045,
        );
    }
    for (let lug = 0; lug < 6; lug++)
      detail(
        [0, 0.069, -0.15 + lug * 0.043, 0.09, 0.013, 0.018, 0x596562],
        0.55,
      );
    detail(
      [
        0,
        0.025,
        barrelZ - barrelLength / 2 + 0.028,
        0.061,
        0.059,
        0.05,
        0x343e44,
      ],
      0.66,
    );
    detail(
      [
        0,
        0.025,
        barrelZ + barrelLength / 2 - 0.017,
        0.055,
        0.055,
        0.028,
        0x515c60,
      ],
      0.62,
    );
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
    const geometry = new RoundedBoxGeometry(1, 1, 1, 1, 0.065);
    geometry.setAttribute(
      'equipmentFinish',
      new InstancedBufferAttribute(
        Float32Array.from(parts, (_, index) => finishes[index] ?? 0.35),
        1,
      ),
    );
    const mesh = new InstancedMesh(geometry, this.material, parts.length);
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

  setOperator(id: OperatorId): void {
    this.arms.setOperator(id);
  }

  /** For an independent showcase instance containing the original procedural geometry. */
  showcaseModel(weapon: GunId, molten = false): Group | InstancedMesh {
    if (molten) this.setRifleSkin('cinder-wyrm');
    const model = molten ? this.cinder!.model : this.models.get(weapon)!;
    model.visible = true;
    return model;
  }

  configureTexture(quality: GraphicsSettings['textureQuality']): void {
    if (quality === 'hd') this.hdTexture ??= createEquipmentTexture(1024);
    this.material.map =
      quality === 'low'
        ? this.lowTexture
        : quality === 'hd'
          ? this.hdTexture!
          : this.texture;
    this.cinder?.configureTexture(this.material.map);
  }

  get hasAimDot(): boolean {
    return (
      this.aimDot.visible ||
      !!this.cinder?.reticle.visible ||
      this.mountedSightAimed
    );
  }

  get rifleSkinStatus(): WeaponSkinStatus {
    if (this.rifleSkin !== 'memento-mori' || this.memento) return 'ready';
    return this.mementoUnavailable ? 'unavailable' : 'loading';
  }

  get sniperSkinStatus(): WeaponSkinStatus {
    if (this.sniperSkin !== 'lotus-lava' || this.lotus) return 'ready';
    return this.lotusUnavailable ? 'unavailable' : 'loading';
  }

  get shotgunSkinStatus(): WeaponSkinStatus {
    if (this.shotgunSkin !== 'glorious-blaze' || this.blaze) return 'ready';
    return this.blazeUnavailable ? 'unavailable' : 'loading';
  }

  get smgSkinStatus(): WeaponSkinStatus {
    if (this.smgSkin !== 'neon-blade' || this.neon) return 'ready';
    return this.neonUnavailable ? 'unavailable' : 'loading';
  }

  scopeDiameter(ads: number): number {
    return sniperScopeDiameter(
      ads,
      this.sniperSkin === 'lotus-lava' ? this.lotus?.aperture : undefined,
    );
  }

  get inspecting(): boolean {
    return this.inspectTime !== null;
  }

  setRifleSkin(skin: RifleSkin): void {
    if (this.rifleSkin === skin) return;
    this.rifleSkin = skin;
    this.resetInspect();
    if (skin === 'cinder-wyrm' && !this.cinder) {
      this.cinder = new CinderWyrm(this.material.map ?? this.texture);
      this.root.add(this.cinder.model, this.cinder.reticle);
    }
    if (skin === 'memento-mori' && !this.memento && !this.mementoRequest)
      void this.loadMemento();
  }

  private async loadMemento(): Promise<void> {
    const request = new AbortController();
    this.mementoRequest = request;
    this.mementoUnavailable = false;
    try {
      const { MementoMori } = await import('./MementoMori');
      if (request.signal.aborted) return;
      const skin = await MementoMori.load(request.signal);
      if (request.signal.aborted) skin.dispose();
      else {
        this.memento = skin;
        this.root.add(skin.model, skin.reticle);
      }
    } catch {
      if (!request.signal.aborted) this.mementoUnavailable = true;
    } finally {
      this.mementoRequest = undefined;
    }
  }

  setSniperSkin(skin: SniperSkin): void {
    if (this.sniperSkin === skin) return;
    this.sniperSkin = skin;
    if (this.selected === 'sniper') this.resetInspect();
    if (skin === 'lotus-lava' && !this.lotus && !this.lotusRequest)
      void this.loadLotus();
  }

  private async loadLotus(): Promise<void> {
    const request = new AbortController();
    this.lotusRequest = request;
    this.lotusUnavailable = false;
    try {
      const { LotusLava } = await import('./LotusLava');
      if (request.signal.aborted) return;
      const skin = await LotusLava.load(request.signal);
      if (request.signal.aborted) skin.dispose();
      else {
        this.lotus = skin;
        this.root.add(skin.model);
      }
    } catch {
      if (!request.signal.aborted) this.lotusUnavailable = true;
    } finally {
      this.lotusRequest = undefined;
    }
  }

  setShotgunSkin(skin: ShotgunSkin): void {
    if (this.shotgunSkin === skin) return;
    this.shotgunSkin = skin;
    if (this.selected === 'shotgun') this.resetInspect();
    if (skin === 'glorious-blaze' && !this.blaze && !this.blazeRequest)
      void this.loadBlaze();
  }

  private async loadBlaze(): Promise<void> {
    const request = new AbortController();
    this.blazeRequest = request;
    this.blazeUnavailable = false;
    try {
      const { GloriousBlaze } = await import('./GloriousBlaze');
      if (request.signal.aborted) return;
      const skin = await GloriousBlaze.load(request.signal);
      if (request.signal.aborted) skin.dispose();
      else {
        this.blaze = skin;
        this.root.add(skin.model);
      }
    } catch {
      if (!request.signal.aborted) this.blazeUnavailable = true;
    } finally {
      this.blazeRequest = undefined;
    }
  }

  setSmgSkin(skin: SmgSkin): void {
    if (this.smgSkin === skin) return;
    this.smgSkin = skin;
    if (this.selected === 'smg') this.resetInspect();
    if (skin === 'neon-blade' && !this.neon && !this.neonRequest)
      void this.loadNeon();
  }

  private async loadNeon(): Promise<void> {
    const request = new AbortController();
    this.neonRequest = request;
    this.neonUnavailable = false;
    try {
      const { NeonBlade } = await import('./NeonBlade');
      if (request.signal.aborted) return;
      const skin = await NeonBlade.load(request.signal);
      if (request.signal.aborted) skin.dispose();
      else {
        this.neon = skin;
        this.root.add(skin.model, skin.reticle);
      }
    } catch {
      if (!request.signal.aborted) this.neonUnavailable = true;
    } finally {
      this.neonRequest = undefined;
    }
  }

  setMeleeSkin(skin: MeleeSkin): void {
    if (this.meleeSkin === skin) return;
    this.meleeSkin = skin;
    this.meleeSkinStatus = 'loading';
    const generation = ++this.meleeGeneration;
    this.meleeModel.clear();
    void Promise.all([weaponAsset(skin), meleeGloveAsset()]).then(
      ([asset, gloves]) => {
        if (generation !== this.meleeGeneration) return;
        this.arms.setMeleeGloves(gloves);
        this.meleeModel.add(asset.scene.clone(true));
        this.meleeSkinStatus = 'ready';
      },
      () => {
        if (generation !== this.meleeGeneration) return;
        this.meleeSkinStatus = 'unavailable';
      },
    );
  }

  requestInspect(): void {
    this.inspectRequested = true;
  }

  resetInspect(): void {
    this.inspectRequested = false;
    this.inspectTime = null;
  }

  private updateInspect(dt: number, allowed: boolean): void {
    if (!allowed) {
      this.resetInspect();
      return;
    }
    if (this.inspectRequested && this.inspectTime === null)
      this.inspectTime = 0;
    this.inspectRequested = false;
    if (this.inspectTime === null) return;
    this.inspectTime += dt;
    if (this.inspectTime >= inspectSeconds) this.resetInspect();
  }

  /** Match the barrel's screen position across the separate viewmodel/world FOVs. */
  muzzleWorldPosition(
    id: GunId,
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

  private updateAimDot(
    weapons: WeaponController,
    active: boolean,
    ads: number,
    cinder?: CinderWyrm,
    mounted?: Pick<MementoMori, 'sight' | 'reticle'>,
  ): void {
    const optic = mounted?.reticle ?? cinder?.reticle;
    const reticle =
      mounted?.sight ??
      (cinder
        ? cinderReticle
        : weapons.selected === 'melee'
          ? undefined
          : weaponSights[weapons.selected].reticle);
    const mark = optic ?? this.aimDot;
    this.aimDot.visible = false;
    if (this.cinder) this.cinder.reticle.visible = false;
    if (this.memento) this.memento.reticle.visible = false;
    if (this.neon) this.neon.reticle.visible = false;
    this.mountedSightAimed = false;
    if (!active || !reticle) return;
    if (mounted) {
      // Match the authored mount in hip-fire and inspect. The same mesh can
      // drift onto the aim ray as the rifle is raised to the eye.
      mark.position.set(...reticle.center);
      mark.quaternion.identity();
      mark.visible = true;
    }
    if (optic && ads < 0.74) return;
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
    const aimPoint = this.sightOrigin.addScaledVector(
      this.sightDirection,
      distance,
    );
    const insideWindow =
      Math.abs(aimPoint.x - reticle.center[0]) + reticle.radius <
        reticle.halfWindow[0] &&
      Math.abs(aimPoint.y - reticle.center[1]) + reticle.radius <
        reticle.halfWindow[1];
    if (mounted) {
      if (!insideWindow) return;
      const blend = easeUnit((ads - 0.74) / 0.21);
      mark.position.lerp(aimPoint, blend);
      mark.quaternion.slerp(
        this.sightRotation.copy(this.root.quaternion).invert(),
        blend,
      );
      this.mountedSightAimed = ads >= 0.95;
    } else {
      mark.position.copy(aimPoint);
      mark.visible = insideWindow;
      if (optic) mark.quaternion.copy(this.root.quaternion).invert();
    }
  }

  simulateRecoil(weapons: WeaponController, dt: number, fired: boolean): void {
    if (this.recoilWeapon !== weapons.selected) {
      this.resetRecoil();
      this.recoilWeapon = weapons.selected;
    }
    this.recoil.step(dt);
    if (!fired || weapons.selected === 'melee') return;
    this.resetInspect();
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
      this.resetInspect();
      this.selected = weapons.selected;
      if (this.recoilWeapon !== this.selected) this.resetRecoil();
      for (const [id, mesh] of this.models) mesh.visible = id === this.selected;
    }
    const cinder =
      this.selected === 'rifle' && this.rifleSkin === 'cinder-wyrm'
        ? this.cinder
        : undefined;
    const memento =
      this.selected === 'rifle' && this.rifleSkin === 'memento-mori'
        ? this.memento
        : undefined;
    const customRifle = cinder ?? memento;
    const lotus =
      this.selected === 'sniper' && this.sniperSkin === 'lotus-lava'
        ? this.lotus
        : undefined;
    const blaze =
      this.selected === 'shotgun' && this.shotgunSkin === 'glorious-blaze'
        ? this.blaze
        : undefined;
    const neon =
      this.selected === 'smg' && this.smgSkin === 'neon-blade'
        ? this.neon
        : undefined;
    this.models.get('rifle')!.visible =
      this.selected === 'rifle' && !customRifle;
    if (this.cinder) this.cinder.model.visible = !!cinder;
    if (this.memento) this.memento.model.visible = !!memento;
    if (this.lotus) this.lotus.model.visible = !!lotus;
    this.models.get('sniper')!.visible = this.selected === 'sniper' && !lotus;
    this.models.get('shotgun')!.visible = this.selected === 'shotgun' && !blaze;
    if (this.blaze) this.blaze.model.visible = !!blaze;
    this.models.get('smg')!.visible = this.selected === 'smg' && !neon;
    if (this.neon) this.neon.model.visible = !!neon;
    this.meleeModel.visible = weapons.selected === 'melee';
    this.arms.root.visible =
      weapons.selected !== 'melee' || this.meleeSkinStatus === 'ready';
    if (weapons.selected === 'melee') {
      this.resetInspect();
      this.root.visible = active;
      this.flash.visible = false;
      this.updateAimDot(weapons, false, 0);
      if (active) this.updateMelee(weapons, speed, dt, motion, movement);
      return;
    }
    const recoil = this.recoil.sample(recoilTime, this.recoilSample);
    const kick = recoil.pitch * motion;
    const lateral = recoil.yaw * motion;
    const profile = weapons.config.recoil;
    const scoped = !!weapons.config.scopeMagnification;
    const pose =
      lotus?.adsPose ??
      memento?.adsPose ??
      blaze?.adsPose ??
      neon?.adsPose ??
      weaponSights[weapons.selected].ads;
    const raise = scoped ? sniperRaise(ads) : ads;
    this.root.visible =
      active &&
      (!scoped || scopeStyle === 'optic' || sniperScopeBlend(ads) < 1);
    if (weapons.selected === 'sniper' && !lotus) {
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
    const recentlyFired =
      weapons.time - weapons.current.lastShot <
      Math.min(0.25, weapons.config.fireInterval + 0.08);
    const busy =
      !!input?.aim ||
      !!input?.fire ||
      ads > 0.02 ||
      recentlyFired ||
      weapons.cycling ||
      weapons.reloading ||
      weapons.equipping;
    this.updateInspect(dt, active && !busy);
    const inspectProgress = (this.inspectTime ?? 0) / inspectSeconds;
    const inspectBlend =
      easeUnit(inspectProgress / 0.21) * easeUnit((1 - inspectProgress) / 0.23);
    const inspect = inspectBlend * motion;
    // Lift to show the receiver, roll across the top, and turn toward the
    // other side before settling into the current movement pose.
    const turn = easeUnit((inspectProgress - 0.28) / 0.42);
    const roll = Math.sin(turn * Math.PI);
    const inspectDepth =
      0.15 + Math.abs(weaponMuzzles[weapons.selected].firstPerson[2]) * 0.17;
    const brace = this.slide * (1 - ads) ** 3 * (1 - inspectBlend);
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
    const carry = this.sprint * (1 - ads) ** 3 * (1 - inspectBlend);
    const sway = Math.sin(this.stridePhase);
    const step = Math.sin(this.stridePhase * 2);
    const reloadTarget = Math.sin(Math.PI * weapons.reloadProgress);
    const reloadBlend = active
      ? 1 - Math.exp(-(weapons.reloading ? 12 : 18) * Math.min(dt, 0.1))
      : 0;
    this.reloadPose += (reloadTarget - this.reloadPose) * reloadBlend;
    const reload = this.reloadPose;
    const riflePresentation = customRifle
      ? (1 - ads) ** 2 * (1 - carry) * (1 - reload) * (1 - inspectBlend)
      : 0;
    const bob =
      Math.min(1, speed / 8) * (1 - ads * 0.9) * 0.008 * motion * (1 - carry);
    this.root.position.set(
      0.27 +
        (pose.position[0] - 0.27) * raise +
        lateral * profile.weaponSway +
        Math.cos(weapons.time * 9) * bob +
        carry * (0.02 + sway * 0.012 * motion) +
        brace * 0.025 * motion -
        inspect * (0.19 + 0.08 * (1 - turn)) -
        riflePresentation * 0.028,
      -0.25 +
        (pose.position[1] + 0.25) * raise -
        reload * 0.16 -
        weapons.equipLowering * 0.22 +
        Math.sin(weapons.time * 18) * bob -
        this.stance * (1 - ads) * motion +
        carry * (-0.03 + step * 0.01 * motion) -
        brace * 0.055 * motion +
        inspect * (0.115 + roll * 0.045),
      (scoped
        ? sniperEyePosition(ads, pose.position[2])
        : -0.65 + (pose.position[2] + 0.65) * raise) +
        kick * profile.weaponKickback -
        carry * 0.22 +
        brace * 0.035 * motion -
        inspect * inspectDepth -
        riflePresentation * 0.035,
    );
    this.root.rotation.set(
      pose.rotation[0] * raise +
        kick * profile.weaponPitch * degreesToRadians +
        carry * (0.9 + step * 0.018 * motion) +
        inspect * (0.1 + roll * 0.23),
      pose.rotation[1] * raise +
        lateral * profile.weaponYaw * degreesToRadians +
        carry * (0.22 + Math.cos(this.stridePhase) * 0.012 * motion) +
        inspect * (1.06 - turn * 1.55) +
        riflePresentation * 0.11,
      pose.rotation[2] * raise -
        reload * 0.65 +
        lateral * profile.weaponRoll * degreesToRadians +
        this.cant * (1 - ads) * motion +
        carry * (-0.25 + sway * 0.018 * motion) -
        inspect * (0.28 - turn * 0.86),
    );
    const shotAge = weapons.time - weapons.current.lastShot;
    if (active) {
      blaze?.update(shotAge, motion);
      this.arms.update(
        reload,
        brace * motion,
        carry * (1 - reload),
        this.stridePhase,
        motion,
        lotus?.grips ?? blaze?.grips ?? neon?.grips,
      );
    }
    this.flash.position.set(...weaponMuzzles[weapons.selected].firstPerson);
    this.flash.visible = active && !cinder && shotAge < 0.045;
    if (active) {
      cinder?.update(dt, reload, ads, shotAge, inspect, motion);
      memento?.update(dt, reload, ads, inspect, motion);
      lotus?.update(reload);
      neon?.update(
        reload,
        weapons.current.magazine,
        weapons.config.magazine,
        weapons.time,
        motion < 1,
      );
    }
    this.updateAimDot(weapons, active, ads, cinder, memento ?? neon);
  }

  private updateMelee(
    weapons: WeaponController,
    speed: number,
    dt: number,
    motion: number,
    movement: MovementState,
  ): void {
    const skin = this.meleeSkin ?? defaultMeleeSkin;
    const twoHanded = skin === 'void-ronin';
    const { grip, tilt, hand, swing } = meleeStances[skin];
    const step = Math.min(dt, 0.1);
    this.stridePhase =
      (this.stridePhase + speed * step * strideRadiansPerMeter) % (Math.PI * 2);
    const sprinting = Number(movement === 'sprinting');
    this.sprint += (sprinting - this.sprint) * (1 - Math.exp(-12 * step));
    const bob = Math.min(1, speed / 8) * motion;
    const sway = Math.sin(this.stridePhase) * bob;
    const bounce = Math.cos(this.stridePhase * 2) * bob;
    const age = weapons.time - weapons.current.lastShot;
    const windup = easeUnit(age / 0.065) * (1 - easeUnit((age - 0.065) / 0.09));
    const slash =
      easeUnit((age - 0.065) / 0.13) * (1 - easeUnit((age - 0.195) / 0.23));
    const width = Math.min(1, this.camera.aspect / 1.6);
    const lower = weapons.equipLowering * 0.16 + this.sprint * 0.035;
    const { left, right } = this.meleeHands;

    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.meleeModel.position.set(
      (grip[0] + 0.05 * windup - swing.x * slash) * width + sway * 0.012,
      grip[1] - lower + bounce * 0.012 + 0.045 * slash,
      grip[2] + windup * 0.04 - swing.depth * slash + this.sprint * 0.025,
    );
    this.meleeModel.rotation.set(
      tilt[0] - 0.14 * this.sprint - 0.37 * slash,
      tilt[1] + 0.24 * windup + 0.41 * slash,
      tilt[2] - 0.42 * windup + swing.roll * slash + sway * 0.038,
      'ZYX',
    );

    this.placeMeleeGrip(right, hand, false, twoHanded ? 0.066 : 0);
    left.open = !twoHanded;
    if (twoHanded) {
      this.placeMeleeGrip(left, katanaGrip, true, -0.039);
    } else {
      left.wrist.set(
        -0.36 * width + 0.031 * sway - 0.056 * slash,
        -0.254 - lower - 0.024 * bounce - 0.035 * slash,
        -0.5 - 0.028 * sway - 0.035 * this.sprint,
      );
      left.rotation.setFromEuler(
        this.freeHandTilt.set(0.5, 0.31, 0.4 - this.sprint * 0.11),
      );
    }
    this.arms.update(0, 0, 0, 0, motion, undefined, this.meleeHands);
  }

  private placeMeleeGrip(
    hand: MeleeHands['right'],
    gripRotation: Quaternion,
    left: boolean,
    along: number,
  ): void {
    const blade = this.meleeModel;
    hand.rotation.copy(blade.quaternion).multiply(gripRotation);
    // Rotate the wrist around the hilt contact, which stays fixed in blade space.
    const center = this.gripCenter
      .set(0, along, 0)
      .applyQuaternion(blade.quaternion)
      .add(blade.position);
    hand.wrist
      .set(
        left ? -meleeGrip.across : meleeGrip.across,
        meleeGrip.rise,
        meleeGrip.depth,
      )
      .applyQuaternion(hand.rotation)
      .add(center);
  }

  dispose(): void {
    ++this.meleeGeneration;
    this.meleeModel.clear();
    this.arms.dispose();
    this.cinder?.dispose();
    this.mementoRequest?.abort();
    this.memento?.dispose();
    this.lotusRequest?.abort();
    this.lotus?.dispose();
    this.blazeRequest?.abort();
    this.blaze?.dispose();
    this.neonRequest?.abort();
    this.neon?.dispose();
    for (const mesh of this.models.values()) {
      mesh.geometry.dispose();
      mesh.dispose();
    }
    this.flash.dispose();
    this.dotGeometry.dispose();
    this.dotMaterial.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.flashMaterial.dispose();
    this.texture.dispose();
    this.lowTexture.dispose();
    this.hdTexture?.dispose();
    this.fabricMaterial.dispose();
    this.fabric.dispose();
    this.scene.clear();
  }
}
