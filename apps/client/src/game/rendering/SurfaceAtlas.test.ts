import { expect, it } from 'vitest';
import { LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';
import { createSurfaceAtlas } from './SurfaceAtlas';
import { createReadableMaterial } from './ReadableMaterial';

it('builds a deterministic, mipmapped 2K atlas with distinct material relief', () => {
  const hd = createSurfaceAtlas('hd', 'depot');
  const low = createSurfaceAtlas('low', 'depot');
  const second = createSurfaceAtlas('low', 'depot');
  try {
    expect([hd.image.width, hd.image.height]).toEqual([2048, 1024]);
    expect(low.image.width).toBe(512);
    for (const atlas of [hd, low]) {
      expect(atlas.colorSpace).toBe(SRGBColorSpace);
      expect(atlas.magFilter).toBe(LinearFilter);
      expect(atlas.minFilter).toBe(LinearMipmapLinearFilter);
      expect(atlas.generateMipmaps).toBe(true);
    }
    expect(low.image.data).toEqual(second.image.data);
    const alpha = new Set(
      Array.from(low.image.data!).filter((_, i) => i % 4 === 3),
    );
    expect(alpha.size).toBeGreaterThan(20);
  } finally {
    hd.dispose();
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
