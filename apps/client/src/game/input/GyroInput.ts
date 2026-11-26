type MotionConstructor = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<PermissionState>;
};

export type GyroAccess = 'granted' | 'denied' | 'unavailable';

export function gyroAvailable(): boolean {
  return (
    window.isSecureContext && typeof window.DeviceMotionEvent === 'function'
  );
}

/** Invoke from a tap so browsers that prompt can use that user activation. */
export async function requestGyroAccess(): Promise<GyroAccess> {
  if (!gyroAvailable()) return 'unavailable';
  const sensor = window.DeviceMotionEvent as MotionConstructor;
  try {
    if (
      sensor.requestPermission &&
      (await sensor.requestPermission()) !== 'granted'
    )
      return 'denied';
    return 'granted';
  } catch {
    return 'denied';
  }
}

const radiansPerDegree = Math.PI / 180;
const maximumSampleGap = 100; // ms
const gravity = 9.81; // meters per second squared

function axis(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export interface GyroSample {
  intervalMs: number;
  yawRate: number;
  pitchRate: number;
  yaw: number;
  pitch: number;
}

/** Maps degrees per second and integrates each valid interval into radians. */
export class GyroInput {
  private active = false;
  private chromiumRateOrder = false;
  private previousTime?: number;
  private screenAngle?: number;

  constructor(private readonly look: (sample: GyroSample) => void) {}

  setActive(active: boolean): void {
    active = active && gyroAvailable();
    if (active === this.active) return;
    this.active = active;
    this.reset();
    if (active) {
      const agent = navigator.userAgent;
      // Blink publishes its raw X/Y/Z rates as alpha/beta/gamma. WebKit uses Z/X/Y.
      this.chromiumRateOrder =
        /\b(?:Chrome|Chromium)\//.test(agent) &&
        !/iPhone|iPad|iPod/.test(agent);
      window.addEventListener('devicemotion', this.onMotion);
      document.addEventListener('visibilitychange', this.reset);
    } else {
      window.removeEventListener('devicemotion', this.onMotion);
      document.removeEventListener('visibilitychange', this.reset);
    }
  }

  readonly reset = (): void => {
    this.previousTime = undefined;
    this.screenAngle = undefined;
  };

  private readonly onMotion = (event: DeviceMotionEvent): void => {
    const rates = event.rotationRate;
    if (
      document.hidden ||
      !Number.isFinite(event.timeStamp) ||
      !rates ||
      ![rates.alpha, rates.beta, rates.gamma].some(Number.isFinite)
    ) {
      this.reset();
      return;
    }

    // Older Safari exposes only the legacy display angle.
    const angle = axis(window.screen?.orientation?.angle ?? window.orientation);
    const elapsed =
      this.previousTime === undefined ? 0 : event.timeStamp - this.previousTime;
    const rotated = angle !== this.screenAngle;
    if (!rotated && this.previousTime !== undefined && elapsed <= 0) return;
    this.previousTime = event.timeStamp;
    this.screenAngle = angle;
    if (rotated || !(elapsed > 0 && elapsed <= maximumSampleGap)) return;

    const aroundX = axis(this.chromiumRateOrder ? rates.alpha : rates.beta);
    const aroundY = axis(this.chromiumRateOrder ? rates.beta : rates.gamma);
    const aroundZ = axis(this.chromiumRateOrder ? rates.gamma : rates.alpha);
    const cos = Math.cos(angle * radiansPerDegree);
    const sin = Math.sin(angle * radiansPerDegree);
    const screenUpRate = aroundX * sin + aroundY * cos;
    const pitchRate = aroundX * cos - aroundY * sin;
    let yawRate = screenUpRate;

    const measured = event.accelerationIncludingGravity;
    const linear = event.acceleration;
    const upX = axis(measured?.x) - axis(linear?.x);
    const upY = axis(measured?.y) - axis(linear?.y);
    const upZ = axis(measured?.z) - axis(linear?.z);
    const upLength = Math.hypot(upX, upY, upZ);
    const screenUp = upX * sin + upY * cos;
    const headingLength = Math.hypot(screenUp, upZ);
    if (
      Number.isFinite(measured?.x) &&
      Number.isFinite(measured?.y) &&
      Number.isFinite(measured?.z) &&
      Math.abs(upLength - gravity) < gravity * 0.4 &&
      headingLength > upLength * 0.2
    ) {
      // Remove gravity's screen-right component so pitching cannot also steer.
      yawRate = (screenUpRate * screenUp + aroundZ * upZ) / headingLength;
    }
    const scale = (elapsed / 1000) * radiansPerDegree;
    this.look({
      intervalMs: elapsed,
      yawRate,
      pitchRate,
      yaw: yawRate * scale,
      pitch: pitchRate * scale,
    });
  };
}
