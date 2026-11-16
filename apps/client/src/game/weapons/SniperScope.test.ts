import { expect, it } from 'vitest';
import {
  sniperRaise,
  sniperEyePosition,
  sniperScopeBlend,
  sniperScopeDiameter,
  sniperZoom,
} from './SniperScope';

it('raises and aligns before the optic opens, then reverses the same path when released', () => {
  expect(sniperScopeBlend(0.65)).toBe(0);
  expect(sniperRaise(0.72)).toBe(1);
  expect(sniperZoom(0.4)).toBe(0);
  expect(sniperScopeBlend(1)).toBe(1);
  expect(sniperZoom(1)).toBe(1);
  expect(sniperScopeDiameter(1)).toBeCloseTo(86, 6);
  const checkpoints = [0, 0.3, 0.65, 0.8, 0.9, 1];
  for (let i = 1; i < checkpoints.length; i++) {
    const before = checkpoints[i - 1]!,
      after = checkpoints[i]!;
    expect(sniperRaise(after)).toBeGreaterThanOrEqual(sniperRaise(before));
    expect(sniperEyePosition(after)).toBeGreaterThanOrEqual(
      sniperEyePosition(before),
    );
    expect(sniperScopeDiameter(after)).toBeGreaterThanOrEqual(
      sniperScopeDiameter(before),
    );
    expect(sniperScopeBlend(after)).toBeGreaterThanOrEqual(
      sniperScopeBlend(before),
    );
  }
  for (const ads of [-1, 0, 0.5, 1, 2]) {
    expect(sniperScopeBlend(ads)).toBeGreaterThanOrEqual(0);
    expect(sniperScopeBlend(ads)).toBeLessThanOrEqual(1);
    expect(Number.isFinite(sniperScopeDiameter(ads))).toBe(true);
  }
});
