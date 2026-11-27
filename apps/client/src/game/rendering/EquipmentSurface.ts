import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RGBAFormat,
  SRGBColorSpace,
  type Material,
  type MeshStandardMaterial,
  CompressedTexture,
  VideoTexture,
} from 'three';

/** A small repeating material finish, independent of painted equipment colors. */
export function createEquipmentTexture(
  size: number,
  fabric = false,
): DataTexture {
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const h = Math.imul(x + 17, 0x45d9f3b) ^ Math.imul(y + 11, 0x119de1f3);
      const grit = ((h ^ (h >>> 16)) & 255) / 255 - 0.5;
      const u = (x / size) * 2 * Math.PI;
      const v = (y / size) * 2 * Math.PI;
      const pattern = fabric
        ? Math.cos(64 * u) * Math.cos(64 * v) * 6
        : Math.sin(v * 128 + Math.sin(u) * 0.8) * 4;
      const value =
        238 + pattern + grit * 10 + Math.sin(u * 3) * Math.cos(v * 2) * 4;
      const index = (y * size + x) * 4;
      pixels[index] = value;
      pixels[index + 1] = value - 1;
      pixels[index + 2] = value - 3;
      pixels[index + 3] = 255;
    }
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat);
  texture.name = fabric ? 'operator-fabric' : 'equipment-finish';
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = 8;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** Filter existing authored textures without replacing their color or material channels. */
export function filterEquipmentMaps(material: Material): void {
  for (const key of [
    'map',
    'normalMap',
    'roughnessMap',
    'metalnessMap',
    'aoMap',
    'emissiveMap',
  ] as const) {
    const texture = (material as MeshStandardMaterial)[key];
    if (!texture) continue;
    texture.magFilter = LinearFilter;
    if (
      !(texture instanceof CompressedTexture) &&
      !(texture instanceof VideoTexture)
    ) {
      texture.generateMipmaps = true;
      texture.minFilter = LinearMipmapLinearFilter;
      texture.anisotropy = 8;
    }
    texture.needsUpdate = true;
  }
}
