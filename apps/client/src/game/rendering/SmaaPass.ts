import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import {
  RGFormat,
  UnsignedByteType,
  type ShaderMaterial,
  type Texture,
  type WebGLRenderTarget,
} from 'three';
import { withDisplayColor } from './postProcessColor';

/** Three's embedded lookup PNGs decode asynchronously. Wait before sampling them.
 * These fields are present in the installed Three implementation but absent from its typings.
 */
export class ReadySmaaPass extends SMAAPass {
  declare _areaTexture: Texture;
  declare _searchTexture: Texture;
  declare _edgesRT: WebGLRenderTarget;
  declare _materialBlend: ShaderMaterial;

  constructor() {
    super();
    // Edge detection writes two binary flags. The blend weights retain their full precision.
    this._edgesRT.texture.format = RGFormat;
    this._edgesRT.texture.type = UnsignedByteType;
    this._materialBlend.fragmentShader = withDisplayColor(
      this._materialBlend.fragmentShader,
    );
  }

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
