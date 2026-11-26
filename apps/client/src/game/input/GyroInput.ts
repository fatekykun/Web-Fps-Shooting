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
const driftThreshold = 0.5; // degrees per second
const gravity = 9.81; // meters per second squared

function axis(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Integrates angular rates and discards stale samples. */
export class GyroInput {
  private active = false;
  private previousTime?: number;
  private screenAngle?: number;

  constructor(private readonly look: (x: number, y: number) => void) {}

  setActive(active: boolean): void {
    active = active && gyroAvailable();
    if (active === this.active) return;
    this.active = active;
    this.reset();
    if (active) window.addEventListener('devicemotion', this.onMotion);
    else window.removeEventListener('devicemotion', this.onMotion);
  }

  reset(): void {
    this.previousTime = undefined;
    this.screenAngle = undefined;
  }

  private readonly onMotion = (event: DeviceMotionEvent): void => {
    const rates = event.rotationRate;
    if (document.hidden || !rates) {
      this.reset();
      return;
    }

    // Older Safari exposes only the legacy display angle.
    const angle = window.screen?.orientation?.angle ?? window.orientation ?? 0;
    const elapsed =
      this.previousTime === undefined ? 0 : event.timeStamp - this.previousTime;
    const rotated = angle !== this.screenAngle;
    this.previousTime = event.timeStamp;
    this.screenAngle = angle;
    if (rotated || !(elapsed > 0 && elapsed <= maximumSampleGap)) return;

    const aroundX = axis(rates.beta);
    const aroundY = axis(rates.gamma);
    const aroundZ = axis(rates.alpha);
    const cos = Math.cos(angle * radiansPerDegree);
    const sin = Math.sin(angle * radiansPerDegree);
    let yaw = aroundX * sin + aroundY * cos;
    let pitch = aroundX * cos - aroundY * sin;

    const measured = event.accelerationIncludingGravity;
    const linear = event.acceleration;
    const upX = axis(measured?.x) - axis(linear?.x);
    const upY = axis(measured?.y) - axis(linear?.y);
    const upZ = axis(measured?.z) - axis(linear?.z);
    const upLength = Math.hypot(upX, upY, upZ);
    if (
      Number.isFinite(measured?.x) &&
      Number.isFinite(measured?.y) &&
      Number.isFinite(measured?.z) &&
      Math.abs(upLength - gravity) < gravity * 0.4
    ) {
      // Turning about world up should feel the same with the phone tilted back.
      yaw = (aroundX * upX + aroundY * upY + aroundZ * upZ) / upLength;
      const planarUp = Math.hypot(upX, upY);
      // When the screen is nearly flat, use screen right for the pitch axis.
      if (planarUp > upLength * 0.2) {
        pitch = (aroundX * upY - aroundY * upX) / planarUp;
      }
    }
    const scale = (elapsed / 1000) * radiansPerDegree;
    const x = Math.abs(yaw) < driftThreshold ? 0 : -yaw * scale;
    const y = Math.abs(pitch) < driftThreshold ? 0 : -pitch * scale;
    if (x || y) this.look(x, y);
  };
}
