import { expect, it } from 'vitest';
import {
  gyroTurnScale,
  normalizeGyroCalibration,
  type GyroCalibrationSample,
} from './gyroSensitivity';

it('keeps fine gyro control below 100 and the faster response at maximum gain', () => {
  expect(gyroTurnScale(50, 0.25)).toBe(0.125);
  expect(gyroTurnScale(100, 1)).toBe(1);
  expect(gyroTurnScale(300, 1)).toBe(12);
  expect(gyroTurnScale(300, 0.25)).toBe(9.75);
});

it('preserves saved reference measurements in sensitivity order', () => {
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
  expect(
    normalizeGyroCalibration([
      { ...point, sensitivity: 200 },
      point,
      { ...point, cameraDegrees: 90 },
      { ...point, sensitivity: 150, phoneDegrees: 0 },
      { ...point, sensitivity: 160, cameraDegrees: Infinity },
      { ...point, sensitivity: 170, referenceFov: '' },
    ]),
  ).toEqual([
    { ...point, cameraDegrees: 90 },
    { ...point, sensitivity: 200 },
  ]);
});
