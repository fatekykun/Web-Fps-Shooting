import {
  DataTexture,
  InstancedBufferAttribute,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshStandardMaterial,
  RGBAFormat,
  SRGBColorSpace,
  type BufferGeometry,
} from 'three';
import type { GraphicsSettings } from './graphicsConfig';

const columns = 4;
const rows = 2;
export const surfaceTileSizes = { low: 128, high: 256, hd: 512 } as const;
export type SurfaceTheme = 'depot' | 'warehouse' | 'yard';

function noise(x: number, y: number, seed: number): number {
  let n = Math.imul(x + seed * 31, 0x45d9f3b) ^ Math.imul(y + 11, 0x119de1f3);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 8) / 0xffffff;
}

function seam(value: number, count: number, width: number): number {
  const offset = value * count - Math.floor(value * count);
  return 1 - Math.min(1, Math.min(offset, 1 - offset) / width);
}

/** Original continuous surface patterns. Alpha carries micro-relief for the lit material. */
export function createSurfaceAtlas(
  quality: GraphicsSettings['textureQuality'],
  theme: SurfaceTheme,
): DataTexture {
  const size = surfaceTileSizes[quality];
  const width = size * columns;
  const height = size * rows;
  const data = new Uint8Array(width * height * 4);
  const yard = theme === 'yard';
  for (let tile = 0; tile < columns * rows; tile++) {
    for (let y = 0; y < size; y++) {
      const v = (y + 0.5) / size;
      for (let x = 0; x < size; x++) {
        const u = (x + 0.5) / size;
        const grain = noise(x, y, tile) - 0.5;
        const broad = Math.sin(u * 6.283) * Math.cos(v * 12.566);
        let relief = 0.48 + grain * 0.12;
        let value = 224 + grain * 11 + broad * 5;
        if (tile === 0 || tile === 7) {
          const joint = Math.max(seam(u, 2, 0.009), seam(v, 2, 0.011));
          value -= joint * 54 + (tile === 7 && yard ? 17 - grain * 15 : 0);
          relief -= joint * 0.32;
        } else if (tile === 1) {
          const joint = Math.max(seam(u, 2, 0.018), seam(v, 2, 0.014));
          value -= joint * 51;
          const rivetU = ((u * 2) % 1) - 0.035;
          const rivetV = ((v * 2) % 1) - 0.045;
          if (rivetU * rivetU + rivetV * rivetV < 0.00017) {
            value += 23;
            relief += 0.32;
          }
          relief -= joint * 0.26;
        } else if (tile === 2) {
          const rib = (Math.cos(u * Math.PI * 16) + 1) * 0.5;
          const lip = seam(v, 1, 0.035);
          value += rib * 32 - 20 - lip * 31;
          relief += rib * 0.38 - lip * 0.15;
        } else if (tile === 3 || tile === 5) {
          const boards = seam(v, 6, 0.028);
          const fiber = Math.sin(v * 460 + Math.sin(u * 15) * 2) * 5;
          const frame =
            tile === 3 &&
            (Math.abs(u - v) < 0.035 || Math.min(u, v, 1 - u, 1 - v) < 0.046);
          value += fiber - boards * 34 + (frame ? 15 : 0);
          relief += fiber * 0.014 - boards * 0.22 + (frame ? 0.19 : 0);
        } else if (tile === 4) {
          value = ((u + v) * 4) % 1 < 0.48 ? 88 + grain * 13 : 244 + grain * 10;
        } else {
          const stagger = (Math.floor(v * 6) % 2) * 0.125;
          const joint = Math.max(
            seam(u + stagger, 4, 0.022),
            seam(v, 6, 0.045),
          );
          value +=
            (noise(Math.floor((u + stagger) * 4), Math.floor(v * 6), 6) - 0.5) *
              17 -
            joint * 43;
          relief -= joint * 0.31;
        }
        const offset =
          ((Math.floor(tile / columns) * size + y) * width +
            (tile % columns) * size +
            x) *
          4;
        data[offset] = Math.min(255, value);
        data[offset + 1] = Math.min(
          255,
          value - (tile === 3 || tile === 5 ? 7 : 2),
        );
        data[offset + 2] = Math.min(
          255,
          value - (tile === 3 || tile === 5 ? 17 : 3),
        );
        data[offset + 3] = relief * 255;
      }
    }
  }
  const atlas = new DataTexture(data, width, height, RGBAFormat);
  atlas.name = `surface-${theme}-${width}`;
  atlas.colorSpace = SRGBColorSpace;
  atlas.minFilter = LinearMipmapLinearFilter;
  atlas.magFilter = LinearFilter;
  atlas.generateMipmaps = true;
  atlas.needsUpdate = true;
  return atlas;
}

export function createSurfaceMaterial(
  geometry: BufferGeometry,
  tiles: readonly number[],
) {
  geometry.setAttribute(
    'atlasTile',
    new InstancedBufferAttribute(new Float32Array(tiles), 1),
  );
  const material = new MeshStandardMaterial({
    roughness: 0.86,
    metalness: 0.06,
  });
  const tilePixels = { value: 128 };
  const detail = { value: 0.0 };
  material.userData.tilePixels = tilePixels;
  material.userData.surfaceDetail = detail;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.tilePixels = tilePixels;
    shader.uniforms.surfaceDetail = detail;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float atlasTile;
        varying vec2 vSurfaceUv;
        varying vec2 vTileOrigin;
        varying float vSurfaceHeight;
        varying float vVerticalSurface;`,
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        vec3 boxSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vec2 faceSize = abs(normal.y) > 0.5 ? boxSize.xz : (abs(normal.x) > 0.5 ? boxSize.zy : boxSize.xy);
        vSurfaceUv = uv * max(faceSize / 4.0, vec2(0.25));
        vTileOrigin = vec2(mod(atlasTile, 4.0), floor(atlasTile / 4.0));
        vSurfaceHeight = (position.y + 0.5) * boxSize.y;
        vVerticalSurface = 1.0 - abs(normal.y);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float tilePixels;
        uniform float surfaceDetail;
        varying vec2 vSurfaceUv;
        varying vec2 vTileOrigin;
        varying float vSurfaceHeight;
        varying float vVerticalSurface;`,
      )
      .replace(
        '#include <map_fragment>',
        `
        vec2 atlasScale = vec2(4.0, 2.0);
        vec2 dxAtlas = dFdx(vSurfaceUv) / atlasScale;
        vec2 dyAtlas = dFdy(vSurfaceUv) / atlasScale;
        float footprint = max(length(dFdx(vSurfaceUv)), length(dFdy(vSurfaceUv)));
        float inset = clamp(footprint * 0.6, 1.0 / tilePixels, 0.12);
        vec2 tileUv = mix(vec2(inset), vec2(1.0 - inset), fract(vSurfaceUv));
        vec4 surfaceSample = textureGrad(map, (vTileOrigin + tileUv) / atlasScale, dxAtlas, dyAtlas);
        diffuseColor.rgb *= surfaceSample.rgb;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        bool sheetMetal = vTileOrigin.y < 0.5 && (vTileOrigin.x > 0.5 && vTileOrigin.x < 2.5);
        roughnessFactor = sheetMetal ? 0.48 + surfaceSample.a * 0.23 : 0.84 + surfaceSample.a * 0.1;`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
        metalnessFactor = sheetMetal ? 0.28 : 0.035;`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        if (surfaceDetail > 0.0) {
        vec3 positionDx = dFdx(-vViewPosition);
        vec3 positionDy = dFdy(-vViewPosition);
        vec3 acrossX = cross(positionDy, normal);
        vec3 acrossY = cross(normal, positionDx);
        float determinant = dot(positionDx, acrossX);
        vec3 relief = dFdx(surfaceSample.a) * acrossX + dFdy(surfaceSample.a) * acrossY;
        normal = normalize(max(abs(determinant), 0.0000001) * normal - sign(determinant) * relief * surfaceDetail);
        }`,
      )
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
        float wallOcclusion = 1.0 - 0.22 * vVerticalSurface * exp(-3.6 * max(0.0, vSurfaceHeight));
        reflectedLight.indirectDiffuse *= wallOcclusion;`,
      );
  };
  material.customProgramCacheKey = () => 'breakpoint-industrial-surface';
  return material;
}

/** Keep only the active atlas resident for each arena. */
export class ArenaSurfaces {
  readonly material: MeshStandardMaterial;
  private quality: GraphicsSettings['textureQuality'] | undefined;

  constructor(
    geometry: BufferGeometry,
    tiles: readonly number[],
    private readonly theme: SurfaceTheme,
  ) {
    this.material = createSurfaceMaterial(geometry, tiles);
  }

  get tileSize(): number {
    return this.material.userData.tilePixels.value;
  }

  configure(quality: GraphicsSettings['textureQuality']): void {
    if (quality === this.quality) return;
    const previous = this.material.map;
    this.material.map = createSurfaceAtlas(quality, this.theme);
    this.material.map.anisotropy =
      quality === 'low' ? 2 : quality === 'high' ? 8 : 16;
    this.material.userData.tilePixels.value = surfaceTileSizes[quality];
    this.material.userData.surfaceDetail.value = quality === 'low' ? 0 : 0.012;
    this.material.needsUpdate = !previous;
    this.quality = quality;
    previous?.dispose();
  }

  dispose(): void {
    this.material.map?.dispose();
    this.material.dispose();
  }
}
