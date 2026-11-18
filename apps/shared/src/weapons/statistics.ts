import type { WeaponConfig } from '../types/weapons';

export interface WeaponStatistic {
  id: 'fireRate' | 'damage' | 'range' | 'control' | 'accuracy' | 'ads';
  label: string;
  /** Presentation only, never used to resolve shots. Higher means better. */
  rating: number;
  value: number;
  unit: string;
}

/** End of the initial full-damage plateau, independent of maximum bullet travel. */
export function effectiveRange(config: Readonly<WeaponConfig>): number {
  const profile = config.damageFalloff;
  if (!profile.length) return config.range;
  let distance = 0;
  for (const point of profile) {
    if (point.multiplier !== 1) break;
    distance = point.distance;
  }
  return Math.min(config.range, distance);
}

/** All six ratings and raw values come from the same configuration used by gunplay. */
export function weaponStatistics(
  config: Readonly<WeaponConfig>,
): WeaponStatistic[] {
  const rpm = 60 / config.fireInterval;
  const range = effectiveRange(config);
  const kick = Math.hypot(config.recoilPitch, config.recoilYaw);
  const rating = (value: number) =>
    Math.round(Math.max(0, Math.min(100, value)));
  return [
    {
      id: 'fireRate',
      label: 'FIRE RATE',
      rating: rating(rpm / 10),
      value: rpm,
      unit: 'RPM',
    },
    {
      id: 'damage',
      label: 'DAMAGE',
      rating: rating(config.damage),
      value: config.damage,
      unit:
        config.pellets > 1 ? `PER PELLET / ${config.pellets} PELLETS` : 'BASE',
    },
    {
      id: 'range',
      label: 'RANGE',
      rating: rating(range / 1.25),
      value: range,
      unit: 'm FULL DAMAGE',
    },
    {
      id: 'control',
      label: 'CONTROL',
      rating: rating(100 / (1 + (10 * kick) / config.recoilRecovery)),
      value: kick,
      unit: 'deg KICK / SHOT',
    },
    {
      id: 'accuracy',
      label: 'ACCURACY',
      rating: rating(100 / (1 + 2 * config.adsSpread)),
      value: config.adsSpread,
      unit: 'deg ADS SPREAD',
    },
    {
      id: 'ads',
      label: 'ADS',
      rating: rating(100 * (1 - config.adsTime / 0.5)),
      value: config.adsTime * 1000,
      unit: 'ms',
    },
  ];
}
