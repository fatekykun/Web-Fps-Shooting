import type { GyroMeasurement } from '../game/input/InputManager';
import { measuredGyroGain } from '../game/input/gyroSensitivity';
import type { UserSettings } from '../game/settings/userSettings';

const aimLabels = { hip: 'Hip fire', ads: 'ADS', sniper: 'Sniper scope' };
const axisLabels = { yaw: 'Horizontal', pitch: 'Vertical' };

function degrees(radians: number): string {
  return `${((radians * 180) / Math.PI).toFixed(1)}°`;
}

export function GyroDiagnosticsPanel({
  settings,
  measurement,
  ready,
  onChange,
  onStart,
}: {
  settings: UserSettings;
  measurement: GyroMeasurement | null;
  ready: boolean;
  onChange(values: Partial<UserSettings>): void;
  onStart(): void;
}) {
  const samples = settings.gyroCalibration;
  const sample = measurement?.sample;
  const aim = measurement?.aim;

  return (
    <details className="gyro-diagnostics">
      <summary>Gyro diagnostics</summary>
      <p className="settings-note">
        Start a measurement, enter Training, then return here to read the
        results. Gyro rotations exclude touch input and recoil.
      </p>
      <label className="setting-range">
        <span>
          Gyro dead zone (°/s)
          <output aria-hidden="true">{settings.gyroDeadZone}</output>
        </span>
        <input
          type="range"
          min={0}
          max={5}
          step={0.1}
          value={settings.gyroDeadZone}
          onChange={({ target }) =>
            onChange({ gyroDeadZone: Number(target.value) })
          }
        />
      </label>
      <button
        type="button"
        className="room-button"
        disabled={!ready || settings.gyroActivation === 'off'}
        onClick={onStart}
      >
        {measurement ? 'Reset gyro measurement' : 'Start gyro measurement'}
      </button>
      {measurement && (
        <dl className="gyro-measurement">
          <dt>Sensor interval</dt>
          <dd>
            {sample
              ? `${sample.intervalMs.toFixed(1)} ms`
              : 'Waiting for motion samples'}
          </dd>
          <dt>Yaw / pitch rate</dt>
          <dd>
            {sample
              ? `${sample.yawRate.toFixed(1)} / ${sample.pitchRate.toFixed(1)} °/s`
              : '—'}
          </dd>
          <dt>Physical yaw / pitch</dt>
          <dd>
            {degrees(measurement.physicalYaw)} /{' '}
            {degrees(measurement.physicalPitch)}
          </dd>
          <dt>Gyro camera yaw / pitch</dt>
          <dd data-testid="gyro-camera-rotation">
            {degrees(measurement.cameraYaw)} /{' '}
            {degrees(measurement.cameraPitch)}
          </dd>
          <dt>Gyro yaw travel</dt>
          <dd>{degrees(measurement.cameraYawTravel)}</dd>
          {aim && (
            <>
              <dt>State</dt>
              <dd>
                {aimLabels[aim.mode]} · {Math.round(aim.ads * 100)}% aimed ·{' '}
                {aim.firing ? 'Firing' : 'Normal'} ·{' '}
                {aim.active ? 'Gyro active' : 'Waiting for ADS'}
              </dd>
              <dt>Sensitivity</dt>
              <dd>
                {aim.steeringSensitivity} steering / {aim.aimedSensitivity}{' '}
                active
              </dd>
              <dt>Yaw / pitch gain</dt>
              <dd>
                {aim.yawGain.toFixed(2)}× / {aim.pitchGain.toFixed(2)}×
              </dd>
              <dt>Base FOV / zoom ratio</dt>
              <dd>
                {aim.baseFov}° / {aim.fovScale.toFixed(2)}×
              </dd>
            </>
          )}
        </dl>
      )}

      {samples.length > 0 && (
        <details className="gyro-saved">
          <summary>Saved reference measurements ({samples.length})</summary>
          <ul>
            {samples.map((point) => {
              const label = `${aimLabels[point.aim]} · ${axisLabels[point.axis]} · ${point.firing ? 'Firing' : 'Normal'} · ${point.sensitivity}`;
              return (
                <li key={label}>
                  {label} · {measuredGyroGain(point).toFixed(2)}×
                  <small>
                    {point.referenceFov}
                    {point.notes && ` · ${point.notes}`}
                  </small>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </details>
  );
}
