import {
  DataTexture,
  InstancedBufferAttribute,
  MeshLambertMaterial,
  NearestFilter,
  NearestMipmapNearestFilter,
  RGBAFormat,
  SRGBColorSpace,
  type BufferGeometry,
} from 'three';

const columns = 4;
const rows = 2;

/** Deterministic 32px industrial tiles; one 32 KiB RGBA atlas, no downloads or mip seams. */
export function createPixelAtlas(tileSize: 16 | 32 = 32): DataTexture {
  const width = tileSize * columns,
    height = tileSize * rows;
  const pixels = new Uint8Array(width * height * 4);
  for (let tile = 0; tile < columns * rows; tile++) {
    for (let y = 0; y < tileSize; y++) {
      for (let x = 0; x < tileSize; x++) {
        const px = Math.floor((x * 32) / tileSize),
          py = Math.floor((y * 32) / tileSize);
        let value = 238;
        const patch =
          (Math.floor(px / 3) * 17 + Math.floor(py / 3) * 31 + tile * 7) % 29;
        if (patch < 2) value = 229;
        if (tile === 0) {
          // Concrete slabs with sparse, coarse chips.
          if (px % 16 === 0 || py % 16 === 0) value = 208;
          if (patch === 6) value = 246;
        } else if (tile === 1) {
          // Warehouse wall panels.
          if (py % 16 === 0 || px % 16 === 0) value = 184;
          if (px % 16 === 2 && py % 16 === 2) value = 253;
        } else if (tile === 2 || tile === 6) {
          // Corrugated steel.
          value = px % 8 < 2 ? 190 : px % 8 === 2 ? 253 : 234;
          if (py === 0 || py === 31) value = 177;
          if (patch === 5 && py > 22) value = 216;
        } else if (tile === 3 || tile === 7) {
          // Crate reinforcement.
          if (px < 3 || py < 3 || px > 28 || py > 28 || Math.abs(px - py) < 2)
            value = 184;
          if ((px === 4 || px === 27) && (py === 4 || py === 27)) value = 253;
        } else if (tile === 4) {
          // Low-clearance caution paint.
          value = (px + py) % 16 < 8 ? 130 : 247;
        } else if (tile === 5) {
          // Concrete practice wall with painted inset.
          if (px < 2 || px > 29 || py < 2 || py > 29) value = 190;
          if (px > 12 && px < 19 && py > 8 && py < 24) value = 253;
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
  texture.minFilter = NearestMipmapNearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = true;
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
  const tilePixels = { value: texture.image.width / columns };
  material.userData.tilePixels = tilePixels;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.tilePixels = tilePixels;
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
      uniform float tilePixels;
      varying vec2 vPixelUv;
      varying vec2 vTileOrigin;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
      // Sample tile texel centers: repeated UVs can never bleed into adjacent tiles.
      vec2 tileUv = (floor(fract(vPixelUv) * tilePixels) + 0.5) / tilePixels;
      vec2 atlasUv = (vTileOrigin + tileUv) / vec2(4.0, 2.0);
      // Gradients come from continuous world UVs, avoiding false high LOD at tile repeats.
      diffuseColor *= textureGrad(map, atlasUv, dFdx(vPixelUv) / vec2(4.0, 2.0), dFdy(vPixelUv) / vec2(4.0, 2.0));`,
    );
  };
  material.customProgramCacheKey = () => 'breakpoint-pixel-atlas-v2';
  return material;
}
