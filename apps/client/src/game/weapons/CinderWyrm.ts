import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  ShaderMaterial,
  type Texture,
} from 'three';
import { createReadableMaterial } from '../rendering/ReadableMaterial';
import { CinderBatch, cinderCore, cinderGeometry } from './CinderGeometry';
import { cinderTuning } from './RifleSkins';
import { weaponMuzzles } from './WeaponMuzzles';

export const cinderReticle = {
  center: [0, 0.146, 0.035],
  radius: 0.029,
  halfWindow: [0.058, 0.059],
} as const;

const placements = [
  [-0.031, 0.117, -0.397, 0.45],
  [0.024, 0.12, -0.314, 0.59],
  [-0.048, 0.13, -0.232, 0.67],
  [0.032, 0.137, -0.155, 0.76],
  [-0.025, 0.111, -0.073, 0.5],
  [-0.069, 0.118, -0.263, 0.23],
  [0.062, 0.125, -0.097, 0.27],
] as const;

function reticleGeometry() {
  const batch = new CinderBatch();
  const piece = (
    x: number,
    y: number,
    width: number,
    height: number,
    angle: number,
    tint: number,
  ) =>
    batch.add(
      new BoxGeometry(width, height, 0.0004).rotateZ(angle).translate(x, y, 0),
      tint,
    );
  piece(0, 0, 0.003, 0.003, 0, 0xffffff);
  for (let index = 0; index < 14; index++) {
    const angle = ((index + 0.5) * Math.PI * 2) / 14;
    piece(
      Math.cos(angle) * 0.017,
      Math.sin(angle) * 0.017,
      0.00145,
      0.0043,
      angle,
      0xffd393,
    );
  }
  for (const side of [-1, 1]) {
    piece(side * 0.027, 0, 0.0025, 0.005, 0, 0xffeec0);
    for (const y of [-1, 1]) {
      piece(side * 0.0254, y * 0.0046, 0.002, 0.006, side * y * 0.49, 0xffd082);
      piece(
        side * 0.022,
        y * 0.0081,
        0.0015,
        0.0052,
        side * y * 0.86,
        0xffa150,
      );
    }
  }
  return batch.build();
}

/** Batched armor, GPU-animated lava, and a fixed-size particle pool. */
export class CinderWyrm {
  readonly model = new Group();
  readonly reticle: Mesh;
  private readonly geometries = cinderGeometry();
  private readonly armor = createReadableMaterial(
    {
      vertexColors: true,
      emissive: 0x333841,
      emissiveIntensity: 0.38,
    },
    0.24,
  );
  private readonly lava = new ShaderMaterial({
    vertexColors: true,
    uniforms: {
      time: { value: 0 },
      heat: { value: 0 },
      brightness: { value: cinderTuning.coreBrightness },
    },
    vertexShader: `
      varying vec3 tint;
      varying vec3 modelPosition;
      void main() {
        tint = color;
        modelPosition = position;
        vec4 placed = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          placed = instanceMatrix * placed;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * placed;
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform float heat;
      uniform float brightness;
      varying vec3 tint;
      varying vec3 modelPosition;
      void main() {
        vec3 cell = floor(modelPosition * 142.0);
        float phase = fract(-cell.z * 0.034 + time * 0.78 + cell.y * 0.013);
        float pulse = step(0.65, phase);
        float grit = fract(dot(cell, vec3(0.23, 0.13, 0.39)));
        vec2 rotor = modelPosition.yz - vec2(${cinderCore.y}, ${cinderCore.z});
        float core = step(0.075, abs(modelPosition.x)) * (1.0 - smoothstep(0.046, 0.054, length(rotor)));
        float sector = floor(atan(rotor.x, rotor.y + 0.00001) * 3.82);
        float orbit = step(0.57, fract(sector * 0.125 - time * 0.63));
        float flow = mix(pulse, orbit, core);
        float vein = step(0.56, phase) * step(0.33, grit);
        float molten = 0.67 + flow * 0.39 + step(0.67, grit) * 0.20 + core * sin(time * 3.8) * 0.10;
        float hotFace = step(0.20, tint.g) * step(0.48, tint.r);
        vec3 hot = mix(tint, vec3(1.0, 0.55, 0.12), (0.12 + 0.21 * flow) * heat + hotFace * vein * 0.27);
        gl_FragColor = vec4(hot * (brightness * molten + heat * (0.23 + flow * 0.40)), 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  private readonly optic = new ShaderMaterial({
    vertexColors: true,
    depthWrite: false,
    uniforms: {
      tint: { value: new Color(cinderTuning.reticleColor) },
      time: { value: 0 },
    },
    vertexShader: `
      varying vec3 mark;
      varying vec2 local;
      void main() {
        mark = color;
        local = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 tint;
      uniform float time;
      varying vec3 mark;
      varying vec2 local;
      void main() {
        float center = 1.0 - step(0.003, length(local));
        float sector = floor(atan(local.y, local.x + 0.000001) * 3.0);
        float wave = step(0.62, fract(sector * 0.12 - time * 0.85));
        gl_FragColor = vec4(mix(tint * mark * (0.83 + wave * 0.62), mix(tint, vec3(1.0), 0.36), center), 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  private readonly magazine = new Group();
  private readonly fragments = new InstancedMesh(
    this.geometries.shard,
    this.armor,
    placements.length,
  );
  private readonly sparkGeometry = new BoxGeometry(1, 1, 1);
  private readonly sparkMaterial = new MeshBasicMaterial({ toneMapped: false });
  private readonly sparks = new InstancedMesh(
    this.sparkGeometry,
    this.sparkMaterial,
    16,
  );
  private readonly transform = new Object3D();
  private time = 0;

  constructor(texture: Texture) {
    this.armor.map = texture;
    const readable = this.armor.onBeforeCompile;
    this.armor.onBeforeCompile = (shader, renderer) => {
      readable.call(this.armor, shader, renderer);
      shader.uniforms.cinderHeat = this.lava.uniforms.heat!;
      shader.vertexShader =
        `varying vec3 cinderPosition;\n${shader.vertexShader}`.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\ncinderPosition = position;',
        );
      shader.fragmentShader =
        `varying vec3 cinderPosition;\nuniform float cinderHeat;\n${shader.fragmentShader}`.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
        vec3 fleck = floor(cinderPosition * 181.0);
        vec3 strata = floor(cinderPosition * vec3(56.0, 86.0, 66.0));
        float chip = fract(dot(fleck, vec3(0.317, 0.557, 0.755)));
        float layer = fract(dot(strata, vec3(0.138, 0.386, 0.714)));
        diffuseColor.rgb *= 0.69 + step(0.30, layer) * 0.24 + step(0.89, chip) * 0.40;
        float nearCore = 1.0 - smoothstep(0.048, 0.125, length(cinderPosition.yz - vec2(${cinderCore.y}, ${cinderCore.z})));
        float barrel = smoothstep(-0.52, -0.40, cinderPosition.z) * (1.0 - smoothstep(-0.16, -0.07, cinderPosition.z));
        float nearRail = barrel * (1.0 - smoothstep(0.008, 0.039, abs(cinderPosition.y + 0.009)));
        float warmEdge = smoothstep(0.04, 0.077, abs(cinderPosition.x));
        float reflectedHeat = max(nearCore, nearRail * 0.64) * warmEdge;
        diffuseColor.rgb += vec3(0.23, 0.043, 0.006) * reflectedHeat * (0.28 + 0.48 * cinderHeat) * (0.57 + chip * 0.43);`,
        );
    };
    this.armor.customProgramCacheKey = () => 'breakpoint-cinder-armor';
    this.model.name = 'cinder-wyrm';
    this.model.visible = false;
    this.magazine.name = 'cinder-magazine';
    this.model.add(
      new Mesh(this.geometries.frame, this.armor),
      new Mesh(this.geometries.lava, this.lava),
      this.magazine,
      this.fragments,
      this.sparks,
    );
    this.magazine.add(
      new Mesh(this.geometries.magazine, this.armor),
      new Mesh(this.geometries.magazineLava, this.lava),
    );
    this.fragments.name = 'cinder-fragments';
    this.sparks.name = 'cinder-embers';
    for (const mesh of [this.fragments, this.sparks]) {
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    }
    const tint = new Color();
    for (let i = 0; i < 16; i++)
      this.sparks.setColorAt(
        i,
        tint.setHex(i % 3 === 0 ? 0xffe595 : i % 2 ? 0xffa124 : 0xec5418),
      );
    this.reticle = new Mesh(reticleGeometry(), this.optic);
    this.reticle.name = 'cinder-reticle';
    this.reticle.visible = false;
    this.reticle.renderOrder = 1;
    // Initialize the idle pose before the showcase or remote renderer measures the model.
    this.update(0, 0, 0, Infinity, 0, 0);
  }

  configureTexture(texture: Texture): void {
    this.armor.map = texture;
  }

  update(
    dt: number,
    reload: number,
    ads: number,
    shotAge: number,
    inspect: number,
    motion: number,
  ): void {
    this.time += Math.min(dt, 0.075) * cinderTuning.animationSpeed * motion;
    const time = this.time;
    const heat =
      Math.exp(-Math.max(0, shotAge) * 14) * (1 - ads * 0.46) + inspect * 0.54;
    this.lava.uniforms.time!.value = this.optic.uniforms.time!.value = time;
    this.lava.uniforms.heat!.value = heat;
    this.magazine.position.set(0.047 * reload, -0.103 * reload, 0.039 * reload);
    this.magazine.rotation.x = 0.38 * reload;
    placements.forEach(([x, y, z, scale], i) => {
      const wave = time * cinderTuning.fragmentSpeed + i * 1.07;
      const drift = inspect * (0.02 + 0.006 * i);
      this.transform.position.set(
        x * (1 + inspect * 0.7) + Math.sign(x) * ads * 0.042,
        y + Math.sin(wave) * 0.007 + drift + heat * 0.007 - ads * 0.043,
        z - inspect * 0.017,
      );
      this.transform.rotation.set(
        0.12 * Math.sin(wave * 0.83),
        0.16 * Math.cos(wave),
        (i % 2 ? 0.23 : -0.19) + Math.sin(wave) * 0.12,
      );
      this.transform.scale.setScalar(scale);
      this.transform.updateMatrix();
      this.fragments.setMatrixAt(i, this.transform.matrix);
    });
    this.fragments.instanceMatrix.needsUpdate = true;

    const flash = Math.max(0, 1 - shotAge / 0.086);
    const intensity = Math.max(0, Math.min(1, cinderTuning.particleIntensity));
    const burst = flash > 0 ? Math.round(8 * intensity) : 0;
    const slots = 8 + Math.round(inspect * 3);
    const idle = Math.min(
      16 - burst,
      Math.round(slots * intensity * motion * (1 - ads * 0.91)),
    );
    this.sparks.count = burst + idle;
    this.sparks.visible = this.sparks.count > 0;
    const muzzle = weaponMuzzles.rifle.firstPerson;
    for (let i = 0; i < this.sparks.count; i++) {
      if (i < burst) {
        const direction = i * 2.39;
        const radius = i * 0.004 + shotAge * 0.4;
        const size = (i < 2 ? 0.031 : 0.009) * flash * (1 - ads * 0.58);
        this.transform.position.set(
          muzzle[0] + Math.cos(direction) * radius,
          muzzle[1] + Math.sin(direction) * radius,
          muzzle[2] - 0.011 - shotAge * (1.1 + i * 0.18),
        );
        this.transform.scale.set(
          size,
          size * (i === 1 ? 1.25 : 0.46),
          size * (i < 2 ? 2.1 : 1),
        );
      } else {
        const index = i - burst;
        const age = (time * (0.34 + index * 0.012) + index * 0.381) % 1;
        const side = index % 2 ? -1 : 1;
        const size = (1 - age) * (0.0046 + inspect * 0.001);
        this.transform.position.set(
          side * (0.084 + age * 0.055),
          0.025 + age * 0.16,
          0.12 - (index % 5) * 0.11 - age * 0.038,
        );
        this.transform.scale.set(
          size,
          size * (index % 3 === 0 ? 1.9 : 1),
          size,
        );
      }
      this.transform.rotation.set(0, i * 0.4, i * 1.2);
      this.transform.updateMatrix();
      this.sparks.setMatrixAt(i, this.transform.matrix);
    }
    this.sparks.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.fragments.dispose();
    this.sparks.dispose();
    this.sparkGeometry.dispose();
    this.reticle.geometry.dispose();
    this.optic.dispose();
    this.lava.dispose();
    this.armor.dispose();
    this.sparkMaterial.dispose();
    for (const geometry of Object.values(this.geometries)) geometry.dispose();
  }
}
