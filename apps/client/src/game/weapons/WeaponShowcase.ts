import {
  AnimationMixer,
  Box3,
  CircleGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  NeutralToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  ShadowMaterial,
  Sphere,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
  type Object3D,
} from 'three';
import type { Equipment } from '@breakpoint/shared/weapons/loadouts';
import { WeaponViewmodel } from './WeaponViewmodel';
import { weaponAsset } from './WeaponAssets';
import type { ImportedOperator } from '@breakpoint/shared/operators';
import { operatorAsset } from '../characters/OperatorAssets';
import { disposeOperatorSkeleton } from '../characters/OperatorRig';
import { clone as cloneRig } from 'three/addons/utils/SkeletonUtils.js';

const defaultYaw = 1.04;
const defaultPitch = 0.14;
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export class WeaponShowcase {
  private readonly renderer = new WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: 'low-power',
  });
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(38, 1, 0.05, 25);
  private readonly pivot = new Group();
  private readonly stage = new Group();
  private readonly floor = new Mesh(
    new CircleGeometry(4, 32),
    new ShadowMaterial({ opacity: 0.46 }),
  );
  private readonly key = new DirectionalLight(0xffe3bd, 3.4);
  private readonly pointers = new Map<number, Vector2>();
  private readonly resizeObserver: ResizeObserver;
  private model?: Object3D;
  private procedural?: WeaponViewmodel;
  private mixer?: AnimationMixer;
  private generation = 0;
  private frame = 0;
  private lastFrame = 0;
  private yaw = defaultYaw;
  private pitch = defaultPitch;
  private zoom = 1;
  private targetZoom = 1;
  private targetYaw = defaultYaw;
  private targetPitch = defaultPitch;
  private spin = 0;
  private reveal = 1;
  private reducedMotion = false;
  private character = false;

  constructor(private readonly host: HTMLElement) {
    this.renderer.setPixelRatio(Math.min(1.5, devicePixelRatio));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.domElement.dataset.testid = 'weapon-showcase-canvas';
    this.renderer.domElement.setAttribute(
      'aria-label',
      'Interactive 3D weapon preview',
    );
    host.append(this.renderer.domElement);
    const key = this.key;
    key.position.set(-3, 5, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(512, 512);
    key.shadow.normalBias = 0.025;
    const rim = new DirectionalLight(0xb4d9ff, 2.2);
    rim.position.set(2, 1.8, -3);
    this.scene.add(
      new HemisphereLight(new Color('#ffedd0'), new Color('#78818b'), 2.05),
      key,
      rim,
      this.pivot,
      this.floor,
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.pivot.add(this.stage);
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(host);
    host.addEventListener('pointerdown', this.pointerDown);
    host.addEventListener('pointermove', this.pointerMove);
    host.addEventListener('pointerup', this.pointerUp);
    host.addEventListener('pointercancel', this.pointerUp);
    host.addEventListener('lostpointercapture', this.pointerUp);
    host.addEventListener('wheel', this.wheel, { passive: false });
    document.addEventListener('visibilitychange', this.visibility);
    this.resize();
  }

  async show(
    equipment: Equipment,
    operator?: ImportedOperator,
  ): Promise<'ready' | 'fallback' | undefined> {
    const generation = ++this.generation;
    let asset;
    let fallback = false;
    try {
      asset = operator
        ? await operatorAsset(operator)
        : await weaponAsset(equipment.skin);
    } catch {
      fallback = true;
    }
    if (generation !== this.generation) return;
    const wasCharacter = this.character;
    this.releaseModel();
    this.character = !!operator && !!asset;
    if ((operator || equipment.weapon === 'melee') && !asset) {
      this.wake();
      return 'fallback';
    }
    if (asset)
      this.model = this.character
        ? cloneRig(asset.scene)
        : asset.scene.clone(true);
    else if (equipment.weapon !== 'melee') {
      this.procedural = new WeaponViewmodel();
      this.model = this.procedural.showcaseModel(
        equipment.weapon,
        equipment.skin === 'cinder-wyrm',
      );
    }
    this.stage.position.set(0, 0, 0);
    this.stage.scale.setScalar(1);
    const model = this.model!;
    model.removeFromParent();
    if (equipment.weapon === 'melee') model.rotation.z -= 0.8;
    model.updateMatrixWorld(true);
    // Disable the baked Neon text only in this preview so it cannot be mistaken for live ammo.
    const placeholder = model.getObjectByName('Ammo_Display_Static_33');
    if (placeholder) placeholder.visible = false;
    model.traverse((part) => {
      part.castShadow = true;
      part.receiveShadow = true;
    });
    const bounds = new Box3().setFromObject(model);
    const sphere = bounds.getBoundingSphere(new Sphere());
    const scale = 1 / Math.max(0.001, sphere.radius);
    const center = sphere.center;
    model.position.addScaledVector(center, -1);
    this.stage.add(model);
    this.stage.scale.setScalar(scale);
    this.floor.position.y = this.character
      ? (bounds.min.y - center.y) * scale - 0.025
      : -0.68;
    if (wasCharacter !== this.character) this.reset();
    if (asset?.animations.length) {
      this.mixer = new AnimationMixer(model);
      for (const clip of asset.animations) this.mixer.clipAction(clip).play();
    }
    this.reveal = this.reducedMotion ? 1 : 0;
    this.wake();
    return fallback ? 'fallback' : 'ready';
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    this.wake();
  }

  reset(): void {
    const yaw = this.character ? 0.22 : defaultYaw;
    this.targetYaw =
      this.yaw + Math.atan2(Math.sin(yaw - this.yaw), Math.cos(yaw - this.yaw));
    this.targetPitch = this.character ? 0 : defaultPitch;
    this.targetZoom = 1;
    this.spin = 0;
    this.wake();
  }

  private readonly resize = () => {
    const width = Math.max(1, this.host.clientWidth),
      height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.wake();
  };

  private readonly pointerDown = (event: PointerEvent) => {
    this.host.setPointerCapture(event.pointerId);
    this.pointers.set(
      event.pointerId,
      new Vector2(event.clientX, event.clientY),
    );
    this.spin = 0;
  };
  private readonly pointerMove = (event: PointerEvent) => {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return;
    if (this.pointers.size === 1) {
      const yaw = (event.clientX - pointer.x) * 0.009;
      this.targetYaw += yaw;
      this.targetPitch = clamp(
        this.targetPitch + (event.clientY - pointer.y) * 0.006,
        -0.68,
        0.72,
      );
      this.spin = clamp(yaw * 18, -2.3, 2.3);
    } else {
      const other = [...this.pointers.values()].find(
        (point) => point !== pointer,
      );
      if (other) {
        const previous = pointer.distanceTo(other);
        const distance = Math.hypot(
          event.clientX - other.x,
          event.clientY - other.y,
        );
        if (previous > 1 && distance > 1)
          this.targetZoom = clamp(
            this.targetZoom * (previous / distance),
            0.63,
            1.65,
          );
      }
      this.spin = 0;
    }
    pointer.set(event.clientX, event.clientY);
    this.wake();
  };
  private readonly pointerUp = (event: PointerEvent) => {
    this.pointers.delete(event.pointerId);
    this.wake();
  };
  private readonly wheel = (event: WheelEvent) => {
    event.preventDefault();
    this.targetZoom = clamp(
      this.targetZoom * Math.exp(clamp(event.deltaY, -100, 100) * 0.003),
      0.63,
      1.65,
    );
    this.wake();
  };
  private readonly visibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(this.frame);
      this.frame = this.lastFrame = 0;
    } else this.wake();
  };

  private wake(): void {
    if (!this.frame && !document.hidden)
      this.frame = requestAnimationFrame(this.draw);
  }

  private readonly draw = (time: number) => {
    this.frame = 0;
    const dt = this.lastFrame
      ? clamp((time - this.lastFrame) / 1000, 0, 0.05)
      : 1 / 60;
    this.lastFrame = time;
    if (
      !this.pointers.size &&
      !this.reducedMotion &&
      Math.abs(this.spin) > 0.005
    ) {
      this.targetYaw += this.spin * dt;
      this.spin *= Math.exp(-7 * dt);
    }
    const smoothing = this.reducedMotion ? 1 : 1 - Math.exp(-16 * dt);
    this.yaw += (this.targetYaw - this.yaw) * smoothing;
    this.pitch += (this.targetPitch - this.pitch) * smoothing;
    this.zoom += (this.targetZoom - this.zoom) * smoothing;
    this.reveal = Math.min(1, this.reveal + dt * 5);
    this.pivot.rotation.set(this.pitch, this.yaw, 0);
    this.pivot.scale.setScalar(0.91 + 0.09 * this.reveal);
    this.mixer?.update(this.reducedMotion ? 0 : dt);
    const fit =
      (this.character
        ? 1.15 * Math.max(1, 0.6 / this.camera.aspect)
        : 1.05 * Math.max(0.8, 1 / this.camera.aspect)) /
      Math.tan((this.camera.fov * Math.PI) / 360);
    this.camera.position.set(0, fit * this.zoom * 0.1, fit * this.zoom);
    this.camera.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
    if (
      Math.abs(this.targetYaw - this.yaw) +
        Math.abs(this.targetPitch - this.pitch) +
        Math.abs(this.targetZoom - this.zoom) >
        0.001 ||
      (!this.pointers.size &&
        !this.reducedMotion &&
        Math.abs(this.spin) > 0.005) ||
      this.reveal < 1 ||
      (this.mixer && !this.reducedMotion)
    )
      this.wake();
    else this.lastFrame = 0;
  };

  private releaseModel(): void {
    this.mixer?.stopAllAction();
    if (this.model) this.mixer?.uncacheRoot(this.model);
    this.mixer = undefined;
    this.model?.removeFromParent();
    if (this.model && this.character) disposeOperatorSkeleton(this.model);
    this.model = undefined;
    this.procedural?.dispose();
    this.procedural = undefined;
  }

  dispose(): void {
    ++this.generation;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.host.removeEventListener('pointerdown', this.pointerDown);
    this.host.removeEventListener('pointermove', this.pointerMove);
    this.host.removeEventListener('pointerup', this.pointerUp);
    this.host.removeEventListener('pointercancel', this.pointerUp);
    this.host.removeEventListener('lostpointercapture', this.pointerUp);
    this.host.removeEventListener('wheel', this.wheel);
    document.removeEventListener('visibilitychange', this.visibility);
    this.releaseModel();
    this.floor.geometry.dispose();
    this.floor.material.dispose();
    this.key.shadow.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
