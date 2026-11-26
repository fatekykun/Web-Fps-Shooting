import {
  DataTexture,
  LinearFilter,
  Mesh,
  PlaneGeometry,
  RedFormat,
  ShaderMaterial,
} from 'three';

const width = 128;
const height = 96;
// Seven-segment masks in top, upper-right, lower-right, bottom, lower-left, upper-left, middle order.
const digits = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f];
const segments = [
  [6, 41, 24, 46],
  [23, 26, 28, 42],
  [23, 8, 28, 24],
  [6, 4, 24, 9],
  [2, 8, 7, 24],
  [2, 26, 7, 42],
  [6, 23, 24, 28],
] as const;

/** A single depth-tested mesh with a texture upload only when the magazine changes. */
export class NeonAmmoDisplay {
  private readonly pixels = new Uint8Array(width * height);
  private readonly texture = new DataTexture(
    this.pixels,
    width,
    height,
    RedFormat,
  );
  private readonly geometry = new PlaneGeometry(0.0255, 0.032);
  private readonly material = new ShaderMaterial({
    uniforms: {
      digits: { value: this.texture },
      warning: { value: 0 },
      strength: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D digits;
      uniform float warning;
      uniform float strength;
      varying vec2 vUv;
      void main() {
        float ink = texture2D(digits, vUv).r;
        vec2 spread = vec2(0.045, 0.035);
        float halo = (
          texture2D(digits, vUv + vec2(spread.x, 0.0)).r +
          texture2D(digits, vUv - vec2(spread.x, 0.0)).r +
          texture2D(digits, vUv + vec2(0.0, spread.y)).r +
          texture2D(digits, vUv - vec2(0.0, spread.y)).r
        ) * 0.105;
        float scanline = 0.90 + 0.10 * cos(vUv.y * 113.097);
        vec3 hue = mix(vec3(0.008, 0.75, 1.0), vec3(1.0, 0.012, 0.025), warning);
        vec3 color = mix(hue, vec3(1.0), ink * mix(0.19, 0.06, warning));
        // Dim the emission without fading the red digits into the blue panel.
        gl_FragColor = vec4(color * mix(0.25, 1.0, strength), min(1.0, ink * scanline + halo * strength));
        #include <colorspace_fragment>
      }
    `,
  });
  readonly mesh = new Mesh(this.geometry, this.material);
  private magazine = -1;

  constructor() {
    this.mesh.name = 'neon-blade-ammo';
    this.mesh.position.set(0.0105, 0.005, 0.001);
    this.mesh.renderOrder = 2;
    this.texture.minFilter = LinearFilter;
    this.texture.magFilter = LinearFilter;
  }

  update(
    magazine: number,
    capacity: number,
    time: number,
    reducedMotion: boolean,
  ): void {
    if (magazine !== this.magazine) {
      this.magazine = magazine;
      this.drawDigits(String(magazine).padStart(2, '0'));
    }
    const low = magazine * 5 < capacity;
    this.material.uniforms.warning!.value = Number(low);
    // Keep the number legible during the darker part of the two-hertz pulse.
    this.material.uniforms.strength!.value =
      low && !reducedMotion ? 0.65 + 0.35 * Math.cos(time * Math.PI * 4) : 1;
  }

  private drawDigits(readout: string): void {
    this.pixels.fill(0);
    const step = (width * 0.84) / readout.length;
    const originX = (width - step * readout.length) * 0.5;
    for (let i = 0; i < readout.length; i++) {
      const mask = digits[Number(readout[i])]!;
      const x = originX + i * step;
      segments.forEach(([left, bottom, right, top], bit) => {
        if (!(mask & (1 << bit))) return;
        const x0 = Math.round(x + (left * step) / 31);
        const x1 = Math.round(x + (right * step) / 31);
        const y0 = Math.round(height * (0.12 + bottom * 0.0152));
        const y1 = Math.round(height * (0.12 + top * 0.0152));
        for (let row = y0; row < y1; row++) {
          for (let col = x0; col < x1; col++) {
            const edge =
              Math.min(col - x0, x1 - col - 1) +
              Math.min(row - y0, y1 - row - 1);
            if (edge >= 2) this.pixels[row * width + col] = 255;
          }
        }
      });
    }
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
