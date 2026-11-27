import {
  BufferAttribute,
  BufferGeometry,
  LinearFilter,
  LinearSRGBColorSpace,
  Mesh,
  MeshBasicMaterial,
  NoToneMapping,
  OrthographicCamera,
  PerspectiveCamera,
  PCFShadowMap,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
  WebGLRenderTarget,
  type Camera,
  Texture,
} from 'three';
import { AdaptiveResolution } from './AdaptiveResolution';
import { WorldAntiAliasing } from './WorldAntiAliasing';
import { OpticScope, type OpticView } from './OpticScope';
import {
  calculateResolution,
  calculateOutputResolution,
  type GraphicsPreset,
  type GraphicsSettings,
} from './graphicsConfig';

/** World-resolution AA followed by a device-pixel-aware presentation pass. */
export class GameRenderer {
  readonly renderer = new WebGLRenderer({
    antialias: false,
    powerPreference: 'high-performance',
    depth: false,
    stencil: false,
  });
  readonly target = new WebGLRenderTarget(1, 1, {
    minFilter: LinearFilter,
    magFilter: LinearFilter,
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
  private environment: WebGLRenderTarget | null = null;
  private environmentSource: Texture | null = null;
  private reflections = false;
  get antiAliasing() {
    return this.aa.state;
  }
  private outputWidth = 1;
  private outputHeight = 1;
  private cssWidth = 1;
  private cssHeight = 1;
  private selectedPreset: GraphicsPreset;
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
    this.selectedPreset = settings.preset;
    this.reflections =
      settings.preset === 'quality' ||
      settings.preset === 'hd' ||
      settings.preset === 'ultra';
    this.adaptive = new AdaptiveResolution(settings);
    this.aa = new WorldAntiAliasing(this.renderer, this.target);
    this.aa.configure(settings.antiAliasing);
    this.renderScale = settings.renderScale;
    this.renderer.shadowMap.enabled = settings.shadowQuality !== 'off';
    this.renderer.shadowMap.type = PCFShadowMap;
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
    this.cssWidth = width;
    this.cssHeight = height;
    this.resizeOutput();
    this.adaptive.reset();
  }

  configure(settings: GraphicsSettings): void {
    this.selectedPreset = settings.preset;
    this.reflections =
      settings.preset === 'quality' ||
      settings.preset === 'hd' ||
      settings.preset === 'ultra';
    this.aa.configure(settings.antiAliasing);
    this.renderScale = settings.renderScale;
    this.renderer.shadowMap.enabled = settings.shadowQuality !== 'off';
    this.adaptive.configure(settings);
    this.resizeOutput();
  }

  resetTiming(): void {
    this.adaptive.reset();
  }

  private resizeOutput(): void {
    const size = calculateOutputResolution(
      this.selectedPreset,
      this.cssWidth,
      this.cssHeight,
      window.devicePixelRatio,
    );
    if (
      size.width !== this.outputWidth ||
      size.height !== this.outputHeight ||
      this.renderer.domElement.width !== size.width
    )
      this.renderer.setSize(size.width, size.height, false);
    this.outputWidth = size.width;
    this.outputHeight = size.height;
    this.updateResolution();
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

  private lightMaterials(scene: Scene, viewmodel?: Scene): void {
    const source =
      this.reflections &&
      this.renderer.extensions.has('EXT_color_buffer_float') &&
      scene.background instanceof Texture
        ? scene.background
        : null;
    if (source !== this.environmentSource) {
      this.environment?.dispose();
      this.environment = null;
      this.environmentSource = source;
      if (source) {
        const generator = new PMREMGenerator(this.renderer);
        this.environment = generator.fromEquirectangular(source);
        generator.dispose();
      }
    }
    scene.environment = this.environment?.texture ?? null;
    scene.environmentIntensity = 0.26;
    if (viewmodel) {
      viewmodel.environment = scene.environment;
      viewmodel.environmentIntensity = 0.63;
    }
  }

  render(
    scene: Scene,
    camera: Camera,
    frameMs: number,
    viewmodel: { scene: Scene; camera: Camera } | null = null,
    scope: OpticView | null = null,
  ): void {
    this.lightMaterials(scene, viewmodel?.scene);
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
    this.environment?.dispose();
    this.target.dispose();
    this.triangle.dispose();
    this.material.dispose();
    this.presentation.clear();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
