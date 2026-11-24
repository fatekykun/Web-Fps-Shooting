import { expect, it } from 'vitest';
import { recoilProfiles } from '../config/recoil';
import { Recoil } from './Recoil';

it('starts continuously, peaks quickly and recovers without overshooting', () => {
  const recoil = new Recoil();
  recoil.kick(recoilProfiles.rifle, 0, 0);
  expect(recoil.pitch).toBe(0);
  recoil.step(0.013);
  const rising = recoil.pitch;
  recoil.step(0.017);
  const peak = recoil.pitch;
  expect(rising).toBeGreaterThan(0);
  expect(peak).toBeGreaterThan(rising);
  for (let i = 0; i < 90; i++) {
    const before = recoil.pitch;
    recoil.step(1 / 120);
    expect(recoil.pitch).toBeGreaterThanOrEqual(0);
    expect(recoil.pitch).toBeLessThanOrEqual(before);
  }
  expect(recoil.pitch).toBeLessThan(0.00001);
});

it('repeats a learnable pattern, builds sustained pitch and restarts after a pause', () => {
  const recoil = new Recoil();
  const profile = recoilProfiles.rifle;
  const fire = () =>
    Array.from({ length: 12 }, (_, index) => {
      recoil.kick(profile, index * 0.1, 0);
      recoil.step(0.1);
      return { ...recoil.shot };
    });
  const first = fire();
  expect(first[7]!.pitch).toBeGreaterThan(first[0]!.pitch);
  expect(first.slice(0, 4).every(({ yaw }) => yaw > 0)).toBe(true);
  expect(first.slice(5, 8).every(({ yaw }) => yaw < 0)).toBe(true);
  recoil.kick(profile, 1.1 + profile.resetDelay + 0.001, 0);
  expect(recoil.shot).toEqual(first[0]);
  recoil.reset();
  expect(fire()).toEqual(first);
});

it('blends ADS at the impulse and samples the same recoil at different frame rates', () => {
  const profile = recoilProfiles.smg;
  const run = (frames: number, ads: number) => {
    const recoil = new Recoil();
    for (let shot = 0; shot < 10; shot++) {
      recoil.kick(profile, shot * 0.1, ads, 0.11);
      for (let frame = 0; frame < frames; frame++) recoil.step(0.1 / frames);
    }
    const predicted = recoil.sample(0.03, { pitch: 0, yaw: 0 });
    recoil.step(0.005);
    recoil.step(0.025);
    expect(predicted.pitch).toBeCloseTo(recoil.pitch, 12);
    expect(predicted.yaw).toBeCloseTo(recoil.yaw, 12);
    return predicted;
  };
  const hip = run(3, 0);
  const ads = run(6, 1);
  const mixed = run(12, 0.5);
  expect(ads.pitch).toBeCloseTo(hip.pitch * profile.adsMultiplier, 10);
  expect(mixed.pitch).toBeCloseTo((ads.pitch + hip.pitch) / 2, 10);
  expect(run(12, 0).yaw).toBeCloseTo(hip.yaw, 10);
});
