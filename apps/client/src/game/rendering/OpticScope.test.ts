import { expect, it, vi } from 'vitest';
import {
  BufferGeometry,
  PerspectiveCamera,
  Scene,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import { OpticScope, opticFieldOfView } from './OpticScope';

it.each([65, 85, 110])(
  'keeps true 4x apparent magnification inside different aperture sizes at %s FOV',
  (base) => {
    const zoom =
      (Math.atan(Math.tan((base * Math.PI) / 360) / 4) * 360) / Math.PI;
    for (const [diameter, height] of [
      [80, 720],
      [620, 720],
      [920, 1080],
    ]) {
      const lens = opticFieldOfView(zoom, diameter!, height!);
      const apparent =
        ((diameter! / height!) * Math.tan((base * Math.PI) / 360)) /
        Math.tan((lens * Math.PI) / 360);
      expect(apparent).toBeCloseTo(4, 9);
    }
  },
);

it('keeps the peripheral camera at the hip FOV and preserves aim, pose and the input camera', () => {
  const geometry = new BufferGeometry(),
    scope = new OpticScope(geometry);
  const camera = new PerspectiveCamera(26, 16 / 9, 0.05, 90);
  camera.position.set(2, 1.5, -4);
  camera.rotation.set(0.25, -0.7, 0);
  try {
    const peripheral = scope.peripheral(camera, 103);
    expect(peripheral.fov).toBe(103);
    expect(peripheral.position).toEqual(camera.position);
    expect(peripheral.quaternion.toArray()).toEqual(
      camera.quaternion.toArray(),
    );
    expect(peripheral.aspect).toBe(camera.aspect);
    expect(peripheral.far).toBe(camera.far);
    expect(camera.fov).toBe(26);
  } finally {
    scope.dispose();
    geometry.dispose();
  }
});

it('skips inactive optics, reuses attachments while aiming and matches MSAA without an extra AA chain', () => {
  const geometry = new BufferGeometry(),
    scope = new OpticScope(geometry);
  const destination = new WebGLRenderTarget(1280, 720),
    camera = new PerspectiveCamera(26);
  const world = new Scene();
  const renderer = {
    autoClear: true,
    shadowMap: { autoUpdate: true },
    setRenderTarget: vi.fn(),
    setScissor: vi.fn(),
    setScissorTest: vi.fn(),
    render: vi.fn(),
  };
  const draw = (blend: number, diameter: number) =>
    scope.render(
      renderer as unknown as WebGLRenderer,
      world,
      camera,
      destination,
      camera,
      { baseFov: 85, blend, diameter },
    );
  try {
    draw(0, 10);
    expect(renderer.render).not.toHaveBeenCalled();
    draw(0.5, 10);
    const target = renderer.setRenderTarget.mock
      .calls[0]![0] as WebGLRenderTarget;
    expect(target.width).toBe(620);
    expect(target.height).toBe(620);
    expect(renderer.render).toHaveBeenCalledTimes(2);
    const dispose = vi.fn();
    target.addEventListener('dispose', dispose);
    draw(1, 86);
    expect(dispose).not.toHaveBeenCalled();
    destination.samples = 4;
    draw(1, 86);
    expect(target.samples).toBe(4);
    expect(dispose).toHaveBeenCalledOnce();
    expect(renderer.autoClear).toBe(true);
    expect(renderer.shadowMap.autoUpdate).toBe(true);
    expect(renderer.setScissorTest).toHaveBeenLastCalledWith(false);
    expect(renderer.setRenderTarget).toHaveBeenLastCalledWith(destination);
  } finally {
    scope.dispose();
    destination.dispose();
    geometry.dispose();
  }
});
