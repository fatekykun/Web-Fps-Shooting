import {
  LinearFilter,
  LinearSRGBColorSpace,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import {
  resolveAntiAliasing,
  supportedAntiAliasing,
  type AntiAliasingMode,
  type AntiAliasingState,
} from './antiAliasing';
import type { ReadySmaaPass } from './SmaaPass';

/** Mutually exclusive world-resolution AA, with no history buffers or HUD filtering. */
export class WorldAntiAliasing {
  private supported: AntiAliasingMode[];
  private requested: AntiAliasingMode = 'off';
  private mode: AntiAliasingMode = 'off';
  private generation = 0;
  private pass: ShaderPass | ReadySmaaPass | null = null;
  private output: WebGLRenderTarget | null = null;
  private smaa: ReadySmaaPass | null = null;

  constructor(
    private readonly renderer: WebGLRenderer,
    private readonly target: WebGLRenderTarget,
  ) {
    const gl = renderer.getContext() as WebGL2RenderingContext;
    let color: number[] = [],
      depth: number[] = [];
    try {
      color = Array.from(
        gl.getInternalformatParameter(
          gl.RENDERBUFFER,
          gl.RGBA8,
          gl.SAMPLES,
        ) as Int32Array,
      );
      depth = Array.from(
        gl.getInternalformatParameter(
          gl.RENDERBUFFER,
          gl.DEPTH_COMPONENT24,
          gl.SAMPLES,
        ) as Int32Array,
      );
    } catch {
      /* Keep post AA available if a driver cannot report MSAA formats. */
    }
    this.supported = supportedAntiAliasing(
      color,
      depth,
      renderer.extensions.has('EXT_color_buffer_float'),
    );
  }

  get state(): AntiAliasingState {
    const loading = this.mode === 'smaa' && !this.smaa?.ready;
    const active = loading ? 'off' : this.mode;
    return {
      requested: this.requested,
      active,
      supported: this.supported,
      samples: this.target.samples,
      passes: active === 'fxaa' ? 1 : active === 'smaa' ? 3 : 0,
      loading,
    };
  }

  configure(requested: AntiAliasingMode): void {
    this.requested = requested;
    const next = resolveAntiAliasing(requested, this.supported);
    if (next === this.mode) return;
    this.renderer.setRenderTarget(null);
    this.releasePost();
    this.mode = next;
    const samples = next === 'msaa2' ? 2 : next === 'msaa4' ? 4 : 0;
    if (this.target.samples !== samples) {
      this.target.samples = samples;
      this.target.dispose(); // Reallocate attachments even if dimensions did not change.
    }
    if (next === 'fxaa' || next === 'smaa') {
      this.output = new WebGLRenderTarget(
        this.target.width,
        this.target.height,
        {
          minFilter: LinearFilter,
          magFilter: LinearFilter,
          depthBuffer: false,
          stencilBuffer: false,
          generateMipmaps: false,
          colorSpace: LinearSRGBColorSpace,
        },
      );
    }
    if (next === 'fxaa') {
      // FXAA detects perceptual contrast. Encode each linear input sample, then
      // decode its result so the existing presentation performs sRGB output once.
      this.pass = new ShaderPass({
        ...FXAAShader,
        fragmentShader: FXAAShader.fragmentShader
          .replace(
            'return texture( tex2D, uv );',
            'return sRGBTransferOETF( texture( tex2D, uv ) );',
          )
          .replace(
            'gl_FragColor = ApplyFXAA( tDiffuse, resolution.xy, vUv );',
            'gl_FragColor = sRGBTransferEOTF( ApplyFXAA( tDiffuse, resolution.xy, vUv ) );',
          )
          .replace('_RelativeThreshold = 0.063', '_RelativeThreshold = 0.125')
          .replace('_SubpixelBlending = 1.0', '_SubpixelBlending = 0.25'),
      });
      this.pass.material.depthTest = false;
      this.pass.material.depthWrite = false;
      this.resize();
    } else if (next === 'smaa') {
      const generation = this.generation;
      // Load the three-pass implementation and embedded lookup data only on demand.
      void import('./SmaaPass')
        .then(({ ReadySmaaPass }) => {
          if (this.generation !== generation) return;
          this.pass = this.smaa = new ReadySmaaPass();
          this.resize();
        })
        .catch(() => {
          if (this.generation === generation) this.disableSmaa();
        });
    }
  }

  resize(): void {
    const { width, height } = this.target;
    this.output?.setSize(width, height);
    if (this.pass instanceof ShaderPass)
      this.pass.uniforms.resolution!.value.set(1 / width, 1 / height);
    else this.pass?.setSize(width, height);
  }

  prepare(): void {
    if (this.smaa?.failed) this.disableSmaa();
  }

  render(): Texture {
    if (!this.pass || !this.output || (this.smaa && !this.smaa.ready))
      return this.target.texture;
    this.pass.render(this.renderer, this.output, this.target, 0, false);
    return this.output.texture;
  }
  private disableSmaa(): void {
    this.supported = this.supported.filter((mode) => mode !== 'smaa');
    this.configure(this.requested);
  }
  private releasePost(): void {
    this.generation++;
    this.pass?.dispose();
    this.output?.dispose();
    this.pass = this.smaa = null;
    this.output = null;
  }
  dispose(): void {
    this.releasePost();
  }
}
