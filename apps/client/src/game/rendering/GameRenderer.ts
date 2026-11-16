import {
  BufferAttribute,
  BufferGeometry,
  BasicShadowMap,
  LinearSRGBColorSpace,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  NoToneMapping,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
  WebGLRenderTarget,
  type Camera,
} from 'three';
import { AdaptiveResolution } from './AdaptiveResolution';
import { WorldAntiAliasing } from './WorldAntiAliasing';
import { OpticScope, type OpticView } from './OpticScope';
import {
  calculateResolution,
  type GraphicsPreset,
  type GraphicsSettings,
} from './graphicsConfig';

/** World-resolution AA followed by one nearest native-size presentation pass. */
export class GameRenderer {
  readonly renderer = new WebGLRenderer({
    antialias: false,
    powerPreference: 'high-performance',
    depth: false,
    stencil: false,
  });
  readonly target = new WebGLRenderTarget(1, 1, {
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    generateMipmaps: false,
    depthBuffer: true,
    stencilBuffer: false,
    samples: 0,
    colorSpace: LinearSRGBColorSpace,
  });
  private readonly presentation = new Scene();
  private readonly presentationCamera = new OrthographicCamera(
    -1,
    1,
    1,
    -1,
    0,
    1,
  );
  private readonly triangle = new BufferGeometry();
  private readonly material = new MeshBasicMaterial({
    map: this.target.texture,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly adaptive: AdaptiveResolution;
  private readonly aa: WorldAntiAliasing;
  private optic: OpticScope | null = null;
  get antiAliasing() {
    return this.aa.state;
  }
  private outputWidth = 1;
  private outputHeight = 1;
  private renderScale = 1;
  worldDrawCalls = 0;

  get preset(): GraphicsPreset {
    return this.adaptive.current;
  }
  get renderWidth(): number {
    return this.target.width;
  }
  get renderHeight(): number {
    return this.target.height;
  }

  constructor(host: HTMLElement, settings: GraphicsSettings) {
    this.adaptive = new AdaptiveResolution(settings);
    this.aa = new WorldAntiAliasing(this.renderer, this.target);
    this.aa.configure(settings.antiAliasing);
    this.renderScale = settings.renderScale;
    this.renderer.shadowMap.enabled = settings.shadowQuality !== 'off';
    this.renderer.shadowMap.type = BasicShadowMap;
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NoToneMapping;
    this.renderer.info.autoReset = false;
    this.triangle.setAttribute(
      'position',
      new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
    );
    this.triangle.setAttribute(
      'uv',
      new BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2),
    );
    const mesh = new Mesh(this.triangle, this.material);
    mesh.frustumCulled = false;
    this.presentation.add(mesh);
    this.renderer.domElement.setAttribute(
      'aria-label',
      'The Depot training arena',
    );
    host.appendChild(this.renderer.domElement);
  }

  resize(width: number, height: number): void {
    this.outputWidth = Math.max(1, Math.floor(width));
    this.outputHeight = Math.max(1, Math.floor(height));
    this.renderer.setSize(this.outputWidth, this.outputHeight, false);
    this.updateResolution();
    this.adaptive.reset();
  }

  configure(settings: GraphicsSettings): void {
    this.aa.configure(settings.antiAliasing);
    this.renderScale = settings.renderScale;
    this.renderer.shadowMap.enabled = settings.shadowQuality !== 'off';
    this.adaptive.configure(settings);
    this.updateResolution();
  }

  resetTiming(): void {
    this.adaptive.reset();
  }

  private updateResolution(): void {
    const size = calculateResolution(
      this.adaptive.current,
      this.outputWidth,
      this.outputHeight,
      this.renderScale,
    );
    if (size.width !== this.target.width || size.height !== this.target.height)
      this.target.setSize(size.width, size.height);
    this.aa.resize();
  }

  render(
    scene: Scene,
    camera: Camera,
    frameMs: number,
    viewmodel: { scene: Scene; camera: Camera } | null = null,
    scope: OpticView | null = null,
  ): void {
    if (this.adaptive.observe(frameMs)) this.updateResolution();
    this.aa.prepare();
    this.renderer.info.reset();
    this.renderer.setRenderTarget(this.target);
    let worldCamera = camera;
    if (scope && camera instanceof PerspectiveCamera) {
      this.optic ??= new OpticScope(this.triangle);
      worldCamera = this.optic.peripheral(camera, scope.baseFov);
    }
    this.renderer.render(scene, worldCamera);
    if (viewmodel) {
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(viewmodel.scene, viewmodel.camera);
      this.renderer.autoClear = true;
    }
    if (scope && camera instanceof PerspectiveCamera)
      this.optic!.render(
        this.renderer,
        scene,
        camera,
        this.target,
        this.presentationCamera,
        scope,
      );
    this.worldDrawCalls = this.renderer.info.render.calls;
    this.material.map = this.aa.render();
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.presentation, this.presentationCamera);
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.aa.dispose();
    this.optic?.dispose();
    this.target.dispose();
    this.triangle.dispose();
    this.material.dispose();
    this.presentation.clear();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
