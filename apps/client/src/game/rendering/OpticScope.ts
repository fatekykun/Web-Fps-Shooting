import {
  LinearSRGBColorSpace,
  Mesh,
  LinearFilter,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type BufferGeometry,
  type Camera,
  type WebGLRenderer,
} from 'three';

export interface OpticView {
  baseFov: number;
  blend: number;
  diameter: number;
}

/** Crop a full-screen zoom projection to a square lens, retaining apparent magnification. */
export function opticFieldOfView(
  fov: number,
  diameter: number,
  height: number,
): number {
  return (
    (Math.atan((Math.tan((fov * Math.PI) / 360) * diameter) / height) * 360) /
    Math.PI
  );
}

/** One pooled, lens-sized world render, composited before the existing world AA. */
export class OpticScope {
  readonly peripheralCamera = new PerspectiveCamera();
  private readonly camera = new PerspectiveCamera();
  private readonly target = new WebGLRenderTarget(1, 1, {
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    generateMipmaps: false,
    depthBuffer: true,
    stencilBuffer: false,
    resolveDepthBuffer: false,
    storeMultisampledDepthBuffer: false,
    colorSpace: LinearSRGBColorSpace,
  });
  private readonly scene = new Scene();
  private readonly material = new ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    transparent: true,
    toneMapped: false,
    uniforms: {
      lens: { value: this.target.texture },
      size: { value: new Vector2(1, 1) },
      opacity: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D lens;
      uniform vec2 size;
      uniform float opacity;
      varying vec2 vUv;
      void main() {
        vec2 p = (vUv - 0.5) / size;
        if (dot(p, p) > 0.25) discard;
        gl_FragColor = vec4(texture2D(lens, p + 0.5).rgb, opacity);
      }
    `,
  });

  constructor(geometry: BufferGeometry) {
    const mesh = new Mesh(geometry, this.material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  peripheral(camera: PerspectiveCamera, baseFov: number): PerspectiveCamera {
    this.peripheralCamera.copy(camera);
    this.peripheralCamera.fov = baseFov;
    this.peripheralCamera.updateProjectionMatrix();
    return this.peripheralCamera;
  }

  render(
    renderer: WebGLRenderer,
    world: Scene,
    camera: PerspectiveCamera,
    destination: WebGLRenderTarget,
    presentationCamera: Camera,
    view: OpticView,
  ): void {
    if (view.blend <= 0) return;
    const { width, height } = destination;
    // Allocate for the largest aperture, not each animated diameter. Reuse on later ADS.
    const capacity = Math.max(1, Math.ceil(Math.min(width, height) * 0.86));
    this.target.setSize(capacity, capacity);
    if (this.target.samples !== destination.samples) {
      this.target.samples = destination.samples;
      this.target.dispose();
    }
    const diameter = (Math.min(width, height) * view.diameter) / 100;
    this.camera.copy(camera);
    this.camera.aspect = 1;
    this.camera.fov = opticFieldOfView(camera.fov, diameter, height);
    this.camera.updateProjectionMatrix();
    renderer.setRenderTarget(this.target);
    // The normal view already updated these shadows for this exact world frame.
    const updateShadows = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    try {
      renderer.render(world, this.camera);
    } finally {
      renderer.shadowMap.autoUpdate = updateShadows;
    }

    this.material.uniforms.size!.value.set(diameter / width, diameter / height);
    this.material.uniforms.opacity!.value = view.blend;
    renderer.setRenderTarget(destination);
    // Restrict composition to the lens rectangle. The shader cuts its circular edge.
    renderer.setScissor(
      Math.floor((width - diameter) / 2),
      Math.floor((height - diameter) / 2),
      Math.ceil(diameter) + 1,
      Math.ceil(diameter) + 1,
    );
    renderer.setScissorTest(true);
    renderer.autoClear = false;
    try {
      renderer.render(this.scene, presentationCamera);
    } finally {
      renderer.autoClear = true;
      renderer.setScissorTest(false);
    }
  }

  dispose(): void {
    this.target.dispose();
    this.material.dispose();
    this.scene.clear();
  }
}
