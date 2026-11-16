import {
  DataTexture,
  InstancedBufferAttribute,
  MeshLambertMaterial,
  NearestFilter,
  RGBAFormat,
  SRGBColorSpace,
  type BufferGeometry,
} from 'three';

const tileSize = 32;
const columns = 4;
const rows = 2;
const width = tileSize * columns;
const height = tileSize * rows;

/** Deterministic 32px industrial tiles; one 32 KiB RGBA atlas, no downloads or mip seams. */
export function createPixelAtlas(): DataTexture {
  const pixels = new Uint8Array(width * height * 4);
  for (let tile = 0; tile < columns * rows; tile++) {
    for (let y = 0; y < tileSize; y++) {
      for (let x = 0; x < tileSize; x++) {
        let value = 225;
        const patch =
          (Math.floor(x / 3) * 17 + Math.floor(y / 3) * 31 + tile * 7) % 29;
        if (patch < 3) value = 198;
        if (tile === 0) {
          // Concrete slabs with sparse, coarse chips.
          if (x === 0 || y === 0) value = 166;
          if (patch === 6) value = 239;
        } else if (tile === 1) {
          // Warehouse wall panels.
          if (y % 16 === 0 || x % 16 === 0) value = 145;
          if (x % 16 === 2 && y % 16 === 2) value = 250;
        } else if (tile === 2 || tile === 6) {
          // Corrugated steel.
          value = x % 8 < 2 ? 145 : x % 8 === 2 ? 245 : 211;
          if (y === 0 || y === 31) value = 130;
          if (patch === 5 && y > 22) value = 168;
        } else if (tile === 3 || tile === 7) {
          // Crate reinforcement.
          if (x < 3 || y < 3 || x > 28 || y > 28 || Math.abs(x - y) < 2)
            value = 143;
          if ((x === 4 || x === 27) && (y === 4 || y === 27)) value = 250;
        } else if (tile === 4) {
          // Low-clearance caution paint.
          value = (x + y) % 16 < 8 ? 108 : 242;
        } else if (tile === 5) {
          // Concrete practice wall with painted inset.
          if (x < 2 || x > 29 || y < 2 || y > 29) value = 162;
          if (x > 12 && x < 19 && y > 8 && y < 24) value = 250;
        }
        const offset =
          ((Math.floor(tile / columns) * tileSize + y) * width +
            (tile % columns) * tileSize +
            x) *
          4;
        pixels[offset] = value;
        pixels[offset + 1] = value;
        pixels[offset + 2] = Math.max(0, value - 10);
        pixels[offset + 3] = 255;
      }
    }
  }
  const texture = new DataTexture(pixels, width, height, RGBAFormat);
  texture.name = 'depot-pixel-atlas';
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** One instanced solid batch keeps its per-object tint and atlas tile, with world-sized texels. */
export function createAtlasMaterial(
  texture: DataTexture,
  geometry: BufferGeometry,
  tiles: number[],
): MeshLambertMaterial {
  geometry.setAttribute(
    'atlasTile',
    new InstancedBufferAttribute(new Float32Array(tiles), 1),
  );
  const material = new MeshLambertMaterial({ map: texture, flatShading: true });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
      attribute float atlasTile;
      varying vec2 vPixelUv;
      varying vec2 vTileOrigin;`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
      vec3 boxSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
      vec2 faceSize = abs(normal.y) > 0.5 ? boxSize.xz : (abs(normal.x) > 0.5 ? boxSize.zy : boxSize.xy);
      vPixelUv = uv * max(faceSize / 4.0, vec2(0.25));
      vTileOrigin = vec2(mod(atlasTile, 4.0), floor(atlasTile / 4.0));`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      varying vec2 vPixelUv;
      varying vec2 vTileOrigin;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
      // Sample tile texel centers: repeated UVs can never bleed into adjacent tiles.
      vec2 tileUv = (floor(fract(vPixelUv) * 32.0) + 0.5) / 32.0;
      vec2 atlasUv = (vTileOrigin + tileUv) / vec2(4.0, 2.0);
      diffuseColor *= texture2D(map, atlasUv);`,
    );
  };
  material.customProgramCacheKey = () => 'breakpoint-pixel-atlas-v1';
  return material;
}
