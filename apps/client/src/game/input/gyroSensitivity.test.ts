import { expect, it } from 'vitest';
import {
  addGyroCalibrationSample,
  createGyroGainResolver,
  normalizeGyroCalibration,
  type GyroCalibrationSample,
} from './gyroSensitivity';

const point: GyroCalibrationSample = {
  sensitivity: 100,
  aim: 'ads',
  axis: 'yaw',
  firing: false,
  phoneDegrees: 30,
  cameraDegrees: 60,
  referenceFov: 'COD Mobile FOV 75',
  notes: 'Measured at full ADS',
};

it('applies the FOV scale only to legacy gyro gain', () => {
  const request = {
    sensitivity: 300,
    aim: 'sniper',
    axis: 'yaw',
    firing: false,
    fovScale: 0.25,
  } as const;
  expect(createGyroGainResolver('reference', [])(request)).toEqual({
    gain: 3,
    source: 'reference',
  });
  expect(createGyroGainResolver('legacy', [])(request)).toEqual({
    gain: 9.75,
    source: 'legacy',
  });
});

it('sorts measured points, replaces duplicates and rejects invalid or mismatched data', () => {
  const samples = normalizeGyroCalibration([
    { ...point, sensitivity: 200 },
    point,
    { ...point, cameraDegrees: 90 },
    { ...point, sensitivity: 150, phoneDegrees: 0 },
    { ...point, sensitivity: 160, cameraDegrees: Infinity },
    { ...point, sensitivity: 170, referenceFov: '' },
    {
      ...point,
      sensitivity: 180,
      axis: 'pitch',
      referenceFov: 'Different FOV',
    },
  ]);
  expect(samples).toEqual([
    { ...point, cameraDegrees: 90 },
    { ...point, sensitivity: 200 },
  ]);
  expect(
    addGyroCalibrationSample(samples, { ...point, phoneDegrees: -15 }),
  ).toBeNull();
});

it('interpolates measured total gain and clamps its endpoints without applying FOV again', () => {
  const resolver = createGyroGainResolver('calibrated', [
    { ...point, sensitivity: 200, cameraDegrees: 180 },
    point,
    { ...point, firing: true, cameraDegrees: 150 },
  ]);
  const request = {
    aim: 'ads',
    axis: 'yaw',
    firing: false,
    fovScale: 0.25,
  } as const;
  expect(resolver({ ...request, sensitivity: 100 })).toEqual({
    gain: 2,
    source: 'measured',
  });
  expect(resolver({ ...request, sensitivity: 150 })).toEqual({
    gain: 4,
    source: 'measured',
  });
  expect(resolver({ ...request, sensitivity: 75 })).toEqual({
    gain: 2,
    source: 'clamped',
  });
  expect(resolver({ ...request, sensitivity: 300 })).toEqual({
    gain: 6,
    source: 'clamped',
  });
  expect(resolver({ ...request, sensitivity: 100, firing: true })).toEqual({
    gain: 5,
    source: 'measured',
  });
  expect(resolver({ ...request, sensitivity: 200, axis: 'pitch' })).toEqual({
    gain: 2,
    source: 'uncalibrated',
  });
});

it('uses the same measured gain during firing when there are no separate samples', () => {
  const resolver = createGyroGainResolver('calibrated', [point]);
  expect(resolver({ ...point, firing: true, fovScale: 1 })).toEqual({
    gain: 2,
    source: 'measured',
  });
});
