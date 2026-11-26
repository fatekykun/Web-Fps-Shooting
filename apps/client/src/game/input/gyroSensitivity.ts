export type GyroAimMode = 'hip' | 'ads' | 'sniper';
type GyroAxis = 'yaw' | 'pitch';
export type GyroActivation = 'off' | 'ads' | 'always';

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

export function gyroTurnScale(sensitivity: number, fovScale: number): number {
  const linear = sensitivity / 100;
  const aboveDefault = Math.max(0, linear - 1);
  return linear * fovScale + 2.25 * aboveDefault ** 2;
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

function addGyroCalibrationSample(
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
