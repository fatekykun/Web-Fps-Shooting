import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Object3D,
  ShaderMaterial,
  Vector3,
  type Scene,
} from 'three';
import type { Vector3Like, WeaponId } from '@breakpoint/shared';
import { tracerConfig, tracerStyle, type TracerStyle } from './tracerConfig';

export type MuzzleResolver = (
  weapon: WeaponId,
  source: string | undefined,
  out: Vector3,
) => boolean;

/** One bounded visual pool for training and confirmed multiplayer rays. Never resolves hits. */
export class ShotTrails {
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly material = new ShaderMaterial({
    transparent: true,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      color: { value: new Color(tracerConfig.color) },
      opacity: { value: tracerConfig.hip.opacity },
      protectedRadius: { value: 0 },
      aspect: { value: 1 },
    },
    vertexShader: `
      attribute float trailAlpha;
      varying float vAlpha;
      varying float vAlong;
      varying vec4 vClip;
      void main() {
        vAlpha = trailAlpha;
        vAlong = position.z + 0.5;
        vClip = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        gl_Position = vClip;
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform float opacity;
      uniform float protectedRadius;
      uniform float aspect;
      varying float vAlpha;
      varying float vAlong;
      varying vec4 vClip;
      void main() {
        float protection = 1.0;
        if (protectedRadius > 0.00001) {
          vec2 p = vClip.xy / vClip.w;
          p.x *= aspect;
          protection = smoothstep(protectedRadius * 0.35, protectedRadius, length(p));
        }
        float alpha = opacity * vAlpha * protection * (1.0 - 0.4 * vAlong);
        if (alpha < 0.001) discard;
        gl_FragColor = vec4(color, alpha);
        #include <colorspace_fragment>
      }
    `,
  });
  private readonly mesh = new InstancedMesh(
    this.geometry,
    this.material,
    tracerConfig.capacity * 2,
  );
  private readonly alphas = new InstancedBufferAttribute(
    new Float32Array(tracerConfig.capacity * 2),
    1,
  );
  private readonly slots = Array.from(
    { length: tracerConfig.capacity },
    () => ({
      state: 0,
      life: 0,
      delay: 0,
      weapon: 'rifle' as WeaponId,
      source: undefined as string | undefined,
      origin: new Vector3(),
      from: new Vector3(),
      end: new Vector3(),
      join: new Vector3(),
      direction: new Vector3(),
      distance: 0,
      joinDistance: 0,
    }),
  );
  private readonly transform = new Object3D();
  private readonly direction = new Vector3();
  private readonly tip = new Vector3();
  private readonly axis = new Vector3(0, 0, 1);
  readonly style: TracerStyle = { ...tracerConfig.hip };
  private cursor = 0;
  activeCount = 0;
  emitted = 0;

  constructor(scene: Scene) {
    this.mesh.name = 'bullet-trails';
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.alphas.setUsage(DynamicDrawUsage);
    this.geometry.setAttribute('trailAlpha', this.alphas);
    this.mesh.onBeforeRender = (_renderer, _scene, camera) => {
      const p = camera.projectionMatrix.elements;
      this.material.uniforms.aspect!.value = Math.abs(p[5]! / p[0]!);
    };
    scene.add(this.mesh);
  }

  /** Copy the immutable hit ray now; resolve its animated barrel after this frame's poses update. */
  spawn(
    weapon: WeaponId,
    origin: Vector3Like,
    end: Vector3Like,
    source?: string,
    delay = 0,
  ): void {
    const slot = this.slots[this.cursor++ % this.slots.length]!;
    slot.origin.copy(origin);
    slot.end.copy(end);
    slot.weapon = weapon;
    slot.source = source;
    slot.state = 1;
    slot.delay = delay;
    slot.life = tracerConfig.lifetime;
  }

  step(
    dt: number,
    ads: number,
    scoped: boolean,
    resolveMuzzle: MuzzleResolver,
  ): void {
    tracerStyle(ads, scoped, this.style);
    this.material.uniforms.opacity!.value = this.style.opacity;
    this.material.uniforms.protectedRadius!.value = this.style.protectedRadius;
    let count = 0;
    this.activeCount = 0;
    for (const slot of this.slots) {
      if (slot.state === 0) continue;
      if (slot.state === 1) {
        slot.delay -= Math.max(0, dt);
        if (slot.delay > 0) continue;
        slot.state = 2;
        slot.direction.subVectors(slot.end, slot.origin);
        slot.distance = slot.direction.length();
        if (
          slot.distance < 0.001 ||
          !resolveMuzzle(slot.weapon, slot.source, slot.from)
        ) {
          slot.state = 0;
          continue;
        }
        slot.direction.multiplyScalar(1 / slot.distance);
        const projection = this.direction
          .subVectors(slot.from, slot.origin)
          .dot(slot.direction);
        // If the hit is closer than the barrel, never draw backwards through that surface.
        if (projection >= slot.distance - 0.001) {
          slot.state = 0;
          continue;
        }
        slot.joinDistance = Math.min(
          slot.distance,
          Math.max(0, projection) + tracerConfig.bridgeLength,
        );
        slot.join
          .copy(slot.origin)
          .addScaledVector(slot.direction, slot.joinDistance);
        this.emitted++;
      } else slot.life = Math.max(0, slot.life - Math.max(0, dt));
      if (slot.life <= 0) {
        slot.state = 0;
        continue;
      }
      const bridge = slot.from.distanceTo(slot.join);
      if (bridge > this.style.length) continue;
      const fade = slot.life / tracerConfig.lifetime;
      count = this.segment(slot.from, slot.join, count, fade);
      this.tip
        .copy(slot.join)
        .addScaledVector(
          slot.direction,
          Math.min(
            this.style.length - bridge,
            slot.distance - slot.joinDistance,
          ),
        );
      count = this.segment(slot.join, this.tip, count, fade);
      this.activeCount++;
    }
    this.mesh.count = count;
    if (count) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.alphas.needsUpdate = true;
    }
  }

  private segment(
    from: Vector3,
    to: Vector3,
    index: number,
    alpha: number,
  ): number {
    this.direction.subVectors(to, from);
    const length = this.direction.length();
    if (length < 0.001) return index;
    this.transform.position.copy(from).add(to).multiplyScalar(0.5);
    this.transform.quaternion.setFromUnitVectors(
      this.axis,
      this.direction.multiplyScalar(1 / length),
    );
    this.transform.scale.set(
      this.style.thickness,
      this.style.thickness,
      length,
    );
    this.transform.updateMatrix();
    this.mesh.setMatrixAt(index, this.transform.matrix);
    this.alphas.setX(index, alpha);
    return index + 1;
  }

  clear(): void {
    for (const slot of this.slots) slot.state = 0;
    this.mesh.count = 0;
    this.activeCount = 0;
    this.emitted = 0;
  }
  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}
