import {
  Color,
  DataTexture,
  EquirectangularReflectionMapping,
  InstancedMesh,
  LinearFilter,
  Matrix4,
  PlaneGeometry,
  RGBAFormat,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { ArenaBox } from '@breakpoint/shared/maps';

function cloudNoise(u: number, v: number, frequency: number): number {
  const column = Math.floor(u * frequency);
  const row = Math.floor(v * frequency);
  const x = u * frequency - column;
  const y = v * frequency - row;
  const sx = x * x * (3 - 2 * x);
  const sy = y * y * (3 - 2 * y);
  const sample = (i: number, j: number) => {
    let hash =
      Math.imul((i % frequency) + 5, 1597334677) ^ Math.imul(j + 7, 3812015801);
    hash = Math.imul(hash ^ (hash >>> 15), 0x45d9f3b);
    return ((hash ^ (hash >>> 16)) >>> 8) / 0xffffff;
  };
  const upper = sample(column, row) * (1 - sx) + sample(column + 1, row) * sx;
  const lower =
    sample(column, row + 1) * (1 - sx) + sample(column + 1, row + 1) * sx;
  return upper * (1 - sy) + lower * sy;
}

export function createArenaSky(horizonColor: number): DataTexture {
  const width = 512;
  const height = 256;
  const texels = new Uint8Array(width * height * 4);
  const horizon = new Color(horizonColor).convertLinearToSRGB();
  const zenith = new Color(0x488ac7).convertLinearToSRGB();
  const atmosphere = new Color();
  for (let y = 0; y < height; y++) {
    const elevation = y / (height - 1);
    const sky = Math.max(0, (elevation - 0.49) / 0.51);
    atmosphere.copy(horizon).lerp(zenith, Math.pow(sky, 0.65));
    for (let x = 0; x < width; x++) {
      const azimuth = (x / width) * 2 * Math.PI;
      const clouds =
        cloudNoise(x / width, elevation * 1.7, 12) * 0.64 +
        cloudNoise(x / width, elevation * 1.7, 26) * 0.25 +
        cloudNoise(x / width, elevation * 1.7, 58) * 0.11;
      const cloud =
        Math.min(1, Math.max(0, (clouds - 0.55) * 6)) *
        Math.sin(Math.PI * Math.min(1, sky * 1.35)) *
        0.54;
      const sun =
        Math.max(0, Math.cos(azimuth - 0.9)) ** 38 *
        Math.max(0, 1 - Math.abs(elevation - 0.72) * 11) *
        0.37;
      const glow = Math.min(0.9, cloud + sun);
      const i = (y * width + x) * 4;
      texels[i] = (atmosphere.r + (1 - atmosphere.r) * glow) * 255;
      texels[i + 1] = (atmosphere.g + (0.98 - atmosphere.g) * glow) * 255;
      texels[i + 2] = (atmosphere.b + (0.91 - atmosphere.b) * glow) * 255;
      texels[i + 3] = 255;
    }
  }
  const texture = new DataTexture(texels, width, height, RGBAFormat);
  texture.mapping = EquirectangularReflectionMapping;
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Baked floor contact occlusion in one small, camera-independent draw. */
export function createContactOcclusion(solids: readonly ArenaBox[]) {
  const casters = solids.filter(
    ({ position: [, y], size: [width, height, length] }) =>
      height > 0.44 &&
      Math.abs(y - height / 2) < 0.065 &&
      Math.max(width, length) < 18 &&
      Math.min(width, length) > 0.35,
  );
  const geometry = new PlaneGeometry().rotateX(-Math.PI / 2);
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader: `
      varying vec2 vMaskUv;
      void main() {
        vMaskUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec2 vMaskUv;
      void main() {
        vec2 edge = abs(vMaskUv * 2.0 - 1.0);
        float shade = 1.0 - smoothstep(0.52, 1.0, length(max(edge - 0.24, 0.0)) * 1.32);
        gl_FragColor = vec4(vec3(0.028, 0.039, 0.048), shade * 0.26);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new InstancedMesh(geometry, material, casters.length);
  mesh.name = 'floor-contact-occlusion';
  const transform = new Matrix4();
  const scale = new Vector3();
  casters.forEach(
    ({ position: [x, , z], size: [width, , length], yaw }, index) => {
      transform
        .makeRotationY(yaw ?? 0)
        .scale(scale.set(width + 0.52, 1, length + 0.52))
        .setPosition(x, 0.0035, z);
      mesh.setMatrixAt(index, transform);
    },
  );
  mesh.computeBoundingSphere();
  return mesh;
}
