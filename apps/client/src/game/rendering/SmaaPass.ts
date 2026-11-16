import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import type { Texture } from 'three';

/** Three's embedded lookup PNGs decode asynchronously. Wait before sampling them.
 * These fields are present in the installed Three implementation but absent from its typings.
 */
export class ReadySmaaPass extends SMAAPass {
  declare _areaTexture: Texture;
  declare _searchTexture: Texture;

  private get images(): HTMLImageElement[] {
    return [
      this._areaTexture.image,
      this._searchTexture.image,
    ] as HTMLImageElement[];
  }
  get ready(): boolean {
    return this.images.every(
      (image) => image.complete && image.naturalWidth > 0,
    );
  }
  get failed(): boolean {
    return this.images.some(
      (image) => image.complete && image.naturalWidth === 0,
    );
  }
  override dispose(): void {
    for (const image of this.images) image.onload = null;
    super.dispose();
  }
}
