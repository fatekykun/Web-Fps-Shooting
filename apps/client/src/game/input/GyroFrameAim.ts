const maxLeadMs = 50;
const maxLeadAngle = (8 * Math.PI) / 180;
// One 30 Hz sensor interval still counts as fresh after a short reading interval.
const minimumStaleMs = 34;
const staleFadeMs = 24;

/** Resample measured gyro turns at display cadence, with bounded prediction between readings. */
export class GyroFrameAim {
  private lastSampleTime = -Infinity;
  private staleAfter = 0;
  private pendingYaw = 0;
  private pendingPitch = 0;
  private yawRate = 0;
  private pitchRate = 0;
  private predictedYaw = 0;
  private predictedPitch = 0;

  addSample(time: number, interval: number, yaw: number, pitch: number): void {
    this.lastSampleTime = time;
    this.staleAfter = Math.min(100, Math.max(minimumStaleMs, interval * 1.5));
    this.pendingYaw += yaw;
    this.pendingPitch += pitch;
    this.yawRate = yaw / interval;
    this.pitchRate = pitch / interval;
  }

  sample(time: number, out: { yaw: number; pitch: number }): boolean {
    if (!Number.isFinite(this.lastSampleTime)) return false;
    const age = Math.max(0, time - this.lastSampleTime);
    const remainingLead = Math.max(
      0,
      1 - Math.max(0, age - this.staleAfter) / staleFadeMs,
    );
    const lead = Math.min(age, this.staleAfter, maxLeadMs) * remainingLead;
    const yaw = Math.max(
      -maxLeadAngle,
      Math.min(maxLeadAngle, this.yawRate * lead),
    );
    const pitch = Math.max(
      -maxLeadAngle,
      Math.min(maxLeadAngle, this.pitchRate * lead),
    );
    // The next reading includes time we already predicted. Apply only the difference.
    out.yaw = this.pendingYaw + yaw - this.predictedYaw;
    out.pitch = this.pendingPitch + pitch - this.predictedPitch;
    this.pendingYaw = this.pendingPitch = 0;
    this.predictedYaw = yaw;
    this.predictedPitch = pitch;
    if (remainingLead === 0) this.lastSampleTime = -Infinity;
    return out.yaw !== 0 || out.pitch !== 0;
  }

  clampPitch(): void {
    // A prediction that hit the aim limit must not pull the camera away from it later.
    this.predictedPitch = this.pitchRate = 0;
  }

  reset(): void {
    this.lastSampleTime = -Infinity;
    this.pendingYaw = this.pendingPitch = 0;
    this.predictedYaw = this.predictedPitch = 0;
  }
}
