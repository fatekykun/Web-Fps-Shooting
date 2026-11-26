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

/** Integrates motion in display coordinates and discards stale samples. */
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

    const aroundX = Number.isFinite(rates.beta) ? rates.beta! : 0;
    const aroundY = Number.isFinite(rates.gamma) ? rates.gamma! : 0;
    const cos = Math.cos(angle * radiansPerDegree);
    const sin = Math.sin(angle * radiansPerDegree);
    const yaw = aroundX * sin + aroundY * cos;
    const pitch = aroundX * cos - aroundY * sin;
    const scale = (elapsed / 1000) * radiansPerDegree;
    const x = Math.abs(yaw) < driftThreshold ? 0 : -yaw * scale;
    const y = Math.abs(pitch) < driftThreshold ? 0 : -pitch * scale;
    if (x || y) this.look(x, y);
  };
}
