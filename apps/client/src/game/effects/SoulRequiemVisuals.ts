import {
  AdditiveBlending,
  InstancedBufferAttribute,
  ShaderMaterial,
  type BufferGeometry,
} from 'three';
import { armorPlate, CinderBatch } from '../weapons/CinderGeometry';
import { createReadableMaterial } from '../rendering/ReadableMaterial';

export function requiemBlade(): BufferGeometry {
  const batch = new CinderBatch();
  batch.add(
    armorPlate(
      [
        [0, -0.46],
        [-0.12, -0.27],
        [-0.11, 0.05],
        [-0.18, 0.22],
        [-0.17, 0.51],
        [-0.032, 0.33],
        [0.05, 0.11],
        [0.061, -0.14],
        [0.03, -0.32],
      ],
      0.08,
    ),
    0x22202d,
  );
  batch.add(
    armorPlate(
      [
        [-0.14, 0.45],
        [-0.105, 0.25],
        [-0.044, 0.11],
        [-0.05, -0.17],
        [-0.014, -0.31],
        [0.025, -0.06],
        [0.015, 0.125],
        [-0.038, 0.28],
      ],
      0.038,
    ),
    0x706879,
  );
  batch.add(
    armorPlate(
      [
        [-0.1, 0.16],
        [-0.21, 0.27],
        [-0.16, 0.04],
        [-0.065, -0.11],
        [-0.085, -0.025],
      ],
      0.055,
    ),
    0x343043,
  );
  for (const side of [-1, 1]) {
    batch.add(
      armorPlate(
        [
          [-0.114, 0.19],
          [-0.08, 0.097],
          [-0.053, 0.08],
          [-0.069, -0.019],
          [-0.039, -0.19],
          [-0.055, -0.17],
          [-0.082, -0.019],
          [-0.068, 0.072],
          [-0.094, 0.09],
        ],
        0.003,
        side * 0.041,
        0,
      ),
      0xff6b12,
    );
  }
  return batch.build();
}

/** Snap crack patterns to each object's local voxel grid before the world downsample. */
export function requiemSurface(
  geometry: BufferGeometry,
  capacity: number,
  blade = false,
) {
  const heat = new InstancedBufferAttribute(new Float32Array(capacity), 1);
  geometry.setAttribute('requiemHeat', heat);
  const material = createReadableMaterial(
    { vertexColors: blade, emissive: 0x211a22, emissiveIntensity: 0.25 },
    0.18,
  );
  const readable = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    readable.call(material, shader, renderer);
    shader.vertexShader =
      `attribute float requiemHeat; varying float fracture; varying vec3 vRequiemCell;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n vRequiemCell = position; fracture = requiemHeat;',
      );
    shader.fragmentShader =
      `varying float fracture; varying vec3 vRequiemCell;\n${shader.fragmentShader}`.replace(
        '#include <opaque_fragment>',
        `vec3 cell = floor(vRequiemCell * ${blade ? '39.0' : '15.0'});
       float grain = fract(dot(cell, vec3(0.371, 0.439, 0.593)));
       float fault = abs(fract(dot(cell, vec3(0.162, 0.144, 0.127)) + step(0.65, grain) * 0.10) - 0.5);
       float seam = (1.0 - step(0.042 + fracture * 0.105, fault)) * step(0.15, fracture);
       outgoingLight *= 0.80 + 0.22 * step(0.27, grain);
       ${blade ? 'seam = max(seam * 0.14, step(diffuseColor.g * 2.5 + 0.15, diffuseColor.r));' : ''}
       outgoingLight += vec3(1.0, 0.40, 0.028) * seam * fracture * (0.68 + 0.88 * step(0.53, grain));
       #include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () =>
    `breakpoint-requiem-${blade ? 'blade' : 'body'}`;
  return { material, heat };
}

/** Local, pixel-stepped bloom around the core. Uses the world depth buffer. */
export function requiemHalo(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    vertexShader: `
      attribute float haloHeat;
      varying float vHeat;
      varying vec2 vUv;
      void main() {
        vHeat = haloHeat;
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying float vHeat;
      varying vec2 vUv;
      void main() {
        vec2 cells = (floor(vUv * 22.0) + 0.5) / 22.0 - 0.5;
        float d = length(cells) * 2.0;
        float fade = pow(max(0.0, 1.0 - d), 3.5) * vHeat;
        gl_FragColor = vec4(1.0, 0.35 + fade * 0.24, 0.045, fade);
        #include <colorspace_fragment>
      }
    `,
  });
}
