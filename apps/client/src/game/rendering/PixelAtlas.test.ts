import { expect, it } from 'vitest';
import {
  NearestFilter,
  NearestMipmapNearestFilter,
  SRGBColorSpace,
} from 'three';
import { createPixelAtlas } from './PixelAtlas';
import { createReadableMaterial } from './ReadableMaterial';

it('keeps both atlas qualities small, sharp on magnification, mipmapped and deterministic', () => {
  const high = createPixelAtlas(),
    low = createPixelAtlas(16),
    second = createPixelAtlas();
  try {
    expect(high.image.width).toBe(128);
    expect(low.image.width).toBe(64);
    expect(high.image.data!.byteLength + low.image.data!.byteLength).toBe(
      40960,
    );
    for (const atlas of [high, low]) {
      expect(atlas.colorSpace).toBe(SRGBColorSpace);
      expect(atlas.magFilter).toBe(NearestFilter);
      expect(atlas.minFilter).toBe(NearestMipmapNearestFilter);
      expect(atlas.generateMipmaps).toBe(true);
    }
    expect(high.image.data).toEqual(second.image.data);
    // Concrete's base color stays readable; chips never become large black patches.
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++)
        expect(high.image.data![(y * 128 + x) * 4]).toBeGreaterThanOrEqual(208);
  } finally {
    high.dispose();
    low.dispose();
    second.dispose();
  }
});
it('adds edge fill without another pass or bypassing opaque depth occlusion', () => {
  const material = createReadableMaterial();
  try {
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(true);
    expect(material.transparent).toBe(false);
    expect(material.opacity).toBe(1);
    expect(material.fog).toBe(true);
  } finally {
    material.dispose();
  }
});
