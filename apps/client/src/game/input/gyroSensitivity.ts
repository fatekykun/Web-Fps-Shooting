export const gyroAimModes = ['hip', 'ads', 'sniper'] as const;
export const gyroAxes = ['yaw', 'pitch'] as const;

export type GyroAimMode = (typeof gyroAimModes)[number];
export type GyroAxis = (typeof gyroAxes)[number];
export type GyroActivation = 'off' | 'ads' | 'always';
export type GyroMapping = 'reference' | 'calibrated' | 'legacy';

export interface GyroCalibrationSample {
  sensitivity: number;
  aim: GyroAimMode;
  axis: GyroAxis;
  firing: boolean;
  phoneDegrees: number;
  cameraDegrees: number;
  referenceFov: string;
  notes: string;
}

export type GyroGainSource =
  'reference' | 'legacy' | 'measured' | 'clamped' | 'uncalibrated';

export interface GyroGain {
  gain: number;
  source: GyroGainSource;
}

const maxCalibrationSamples = 240;

export function measuredGyroGain(sample: GyroCalibrationSample): number {
  return sample.cameraDegrees / sample.phoneDegrees;
}

function parseSample(value: unknown): GyroCalibrationSample | null {
  if (!value || typeof value !== 'object') return null;
  const sample = value as Partial<GyroCalibrationSample>;
  const { sensitivity, aim, axis, phoneDegrees, cameraDegrees } = sample;
  if (
    typeof sensitivity !== 'number' ||
    !Number.isInteger(sensitivity) ||
    sensitivity < 1 ||
    sensitivity > 300 ||
    (aim !== 'hip' && aim !== 'ads' && aim !== 'sniper') ||
    (axis !== 'yaw' && axis !== 'pitch') ||
    typeof phoneDegrees !== 'number' ||
    !Number.isFinite(phoneDegrees) ||
    phoneDegrees <= 0 ||
    typeof cameraDegrees !== 'number' ||
    !Number.isFinite(cameraDegrees) ||
    cameraDegrees < 0 ||
    cameraDegrees / phoneDegrees > 1000 ||
    typeof sample.referenceFov !== 'string' ||
    !sample.referenceFov.trim() ||
    sample.referenceFov.trim().length > 80
  )
    return null;
  return {
    sensitivity,
    aim,
    axis,
    firing: sample.firing === true,
    phoneDegrees,
    cameraDegrees,
    referenceFov: sample.referenceFov.trim(),
    notes:
      typeof sample.notes === 'string' ? sample.notes.trim().slice(0, 160) : '',
  };
}

export function addGyroCalibrationSample(
  samples: readonly GyroCalibrationSample[],
  rawSample: unknown,
): GyroCalibrationSample[] | null {
  const sample = parseSample(rawSample);
  if (!sample) return null;
  // Keep each aiming state's samples comparable, including its two axes.
  const sameState = (point: GyroCalibrationSample) =>
    point.aim === sample.aim && point.firing === sample.firing;
  if (
    samples.some(
      (point) => sameState(point) && point.referenceFov !== sample.referenceFov,
    )
  )
    return null;

  const index = samples.findIndex(
    (point) =>
      sameState(point) &&
      point.axis === sample.axis &&
      point.sensitivity === sample.sensitivity,
  );
  if (index < 0 && samples.length >= maxCalibrationSamples) return null;
  const result = [...samples];
  if (index < 0) result.push(sample);
  else result[index] = sample;
  return result.sort((a, b) => a.sensitivity - b.sensitivity);
}

export function normalizeGyroCalibration(
  value: unknown,
): GyroCalibrationSample[] {
  if (!Array.isArray(value)) return [];
  let samples: GyroCalibrationSample[] = [];
  for (const sample of value.slice(0, maxCalibrationSamples))
    samples = addGyroCalibrationSample(samples, sample) ?? samples;
  return samples;
}

interface GyroGainRequest {
  sensitivity: number;
  aim: GyroAimMode;
  axis: GyroAxis;
  firing: boolean;
  fovScale: number;
}

function evaluateCurve(
  points: readonly GyroCalibrationSample[],
  sensitivity: number,
): GyroGain {
  const index = points.findIndex((point) => point.sensitivity >= sensitivity);
  if (index < 0)
    return {
      gain: measuredGyroGain(points[points.length - 1]!),
      source: 'clamped',
    };
  const upper = points[index]!;
  if (upper.sensitivity === sensitivity)
    return { gain: measuredGyroGain(upper), source: 'measured' };
  if (index === 0) return { gain: measuredGyroGain(upper), source: 'clamped' };
  const lower = points[index - 1]!;
  const start = measuredGyroGain(lower);
  const end = measuredGyroGain(upper);
  const t =
    (sensitivity - lower.sensitivity) / (upper.sensitivity - lower.sensitivity);
  return { gain: start + (end - start) * t, source: 'measured' };
}

/** Calibration contains total angular gain. Only legacy gain uses the game's FOV ratio. */
export function createGyroGainResolver(
  mapping: GyroMapping,
  samples: readonly GyroCalibrationSample[],
): (request: GyroGainRequest) => GyroGain {
  const curves = new Map<string, GyroCalibrationSample[]>();
  if (mapping === 'calibrated') {
    for (const sample of samples) {
      const key = `${sample.aim}:${sample.axis}:${sample.firing}`;
      const curve = curves.get(key);
      if (curve) curve.push(sample);
      else curves.set(key, [sample]);
    }
    for (const curve of curves.values())
      curve.sort((a, b) => a.sensitivity - b.sensitivity);
  }
  return ({ sensitivity, aim, axis, firing, fovScale }) => {
    const linear = sensitivity / 100;
    if (mapping === 'legacy')
      return {
        gain: linear * fovScale + 2.25 * Math.max(0, linear - 1) ** 2,
        source: 'legacy',
      };
    if (mapping === 'reference') return { gain: linear, source: 'reference' };
    const prefix = `${aim}:${axis}:`;
    const curve = curves.get(prefix + firing) ?? curves.get(prefix + false);
    return curve
      ? evaluateCurve(curve, sensitivity)
      : { gain: linear, source: 'uncalibrated' };
  };
}
