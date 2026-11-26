import { useState, type FormEvent } from 'react';
import type { GyroMeasurement } from '../game/input/InputManager';
import {
  addGyroCalibrationSample,
  gyroAimModes,
  gyroAxes,
  measuredGyroGain,
} from '../game/input/gyroSensitivity';
import type { UserSettings } from '../game/settings/userSettings';

const aimLabels = { hip: 'Hip fire', ads: 'ADS', sniper: 'Sniper scope' };
const axisLabels = { yaw: 'Horizontal', pitch: 'Vertical' };

function degrees(radians: number): string {
  return `${((radians * 180) / Math.PI).toFixed(1)}°`;
}

export function GyroCalibrationPanel({
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
  const [message, setMessage] = useState('');
  const { gyroCalibration: samples, gyroMapping } = settings;
  const missing = gyroAimModes.flatMap((aim) =>
    gyroAxes
      .filter((axis) =>
        samples.every(
          (point) => point.aim !== aim || point.axis !== axis || point.firing,
        ),
      )
      .map((axis) => `${aimLabels[aim]} ${axisLabels[axis].toLowerCase()}`),
  );
  const sample = measurement?.sample;
  const aim = measurement?.aim;

  function saveSample(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = addGyroCalibrationSample(samples, {
      sensitivity: Number(data.get('sensitivity')),
      aim: data.get('aim'),
      axis: data.get('axis'),
      firing: data.has('firing'),
      phoneDegrees: Number(data.get('phone')),
      cameraDegrees: Number(data.get('camera')),
      referenceFov: data.get('fov'),
      notes: data.get('notes'),
    });
    if (!next) {
      setMessage(
        'Check the rotation values and use the same reference FOV for samples in each aiming and firing state.',
      );
      return;
    }
    onChange({ gyroCalibration: next });
    setMessage(
      gyroMapping === 'calibrated'
        ? 'Measurement saved.'
        : 'Measurement saved. Select Measured calibration to use it.',
    );
  }

  return (
    <details className="gyro-calibration">
      <summary>Gyro diagnostics and calibration</summary>
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
              <dt>Calibration source</dt>
              <dd>
                {aim.yawSource} / {aim.pitchSource}
              </dd>
              <dt>FOV policy</dt>
              <dd>
                {aim.baseFov}° base ·{' '}
                {aim.mapping === 'legacy'
                  ? `Legacy FOV ratio ${aim.fovScale.toFixed(2)}×`
                  : 'Direct angular gain'}
              </dd>
            </>
          )}
        </dl>
      )}

      <h3>Add a COD Mobile measurement</h3>
      <p className="settings-note">
        Enter a measurement you took in COD Mobile. Use the same reference FOV
        when measuring a curve. Vertical Turning at 100 applies the measured
        vertical gain directly.
      </p>
      <p className="settings-note">
        {missing.length > 0
          ? `Uncalibrated in normal aiming: ${missing.join(', ')}. Missing curves use reference gain.`
          : 'All normal aiming axes have measurement data.'}
      </p>
      <form className="gyro-calibration-form" onSubmit={saveSample}>
        <div className="setting-grid gyro-calibration-fields">
          <label>
            Sensitivity value
            <input
              name="sensitivity"
              type="number"
              required
              min={1}
              max={300}
              defaultValue={settings.gyroSensitivity.steering}
            />
          </label>
          <label>
            Aiming state
            <select name="aim">
              {gyroAimModes.map((mode) => (
                <option key={mode} value={mode}>
                  {aimLabels[mode]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Axis
            <select name="axis">
              {gyroAxes.map((axis) => (
                <option key={axis} value={axis}>
                  {axisLabels[axis]}
                </option>
              ))}
            </select>
          </label>
          <label>
            COD Mobile FOV
            <input
              name="fov"
              required
              maxLength={80}
              placeholder="FOV setting and optic if used"
            />
          </label>
          <label>
            Physical phone rotation (degrees)
            <input
              name="phone"
              type="number"
              required
              min="0.0001"
              step="any"
            />
          </label>
          <label>
            COD Mobile camera rotation (degrees)
            <input name="camera" type="number" required min={0} step="any" />
          </label>
          <label>
            Device or test notes (optional)
            <input name="notes" maxLength={160} />
          </label>
          <label className="setting-toggle">
            <input name="firing" type="checkbox" />
            Measured while firing
          </label>
        </div>
        <button type="submit" className="room-button primary">
          Save measurement
        </button>
        {message && (
          <p role="status" className="settings-note">
            {message}
          </p>
        )}
      </form>
      {samples.length > 0 && (
        <details className="gyro-saved">
          <summary>Saved measurements ({samples.length})</summary>
          <ul>
            {samples.map((point, index) => {
              const label = `${aimLabels[point.aim]} · ${axisLabels[point.axis]} · ${point.firing ? 'Firing' : 'Normal'} · ${point.sensitivity}`;
              return (
                <li key={label}>
                  <span>
                    {label} · {measuredGyroGain(point).toFixed(2)}×
                    <small>
                      {point.referenceFov}
                      {point.notes && ` · ${point.notes}`}
                    </small>
                  </span>
                  <button
                    type="button"
                    className="room-button"
                    aria-label={`Remove ${label}`}
                    onClick={() =>
                      onChange({
                        gyroCalibration: samples.filter((_, i) => i !== index),
                      })
                    }
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </details>
  );
}
