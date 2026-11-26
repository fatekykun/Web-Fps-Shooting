import { useId, useState } from 'react';
import {
  weaponConfigs,
  weaponOrder,
  type HitRegion,
  type WeaponId,
} from '@breakpoint/shared';
import { weaponStatistics } from '@breakpoint/shared/weapons/statistics';
import { TacticalDialog } from './TacticalDialog';
import {
  normalizeRifleSkin,
  rifleSkinIds,
  rifleSkins,
  type RifleSkin,
} from '../game/weapons/RifleSkins';
import {
  normalizeSniperSkin,
  sniperSkinIds,
  sniperSkins,
  type SniperSkin,
} from '../game/weapons/SniperSkins';
import {
  normalizeShotgunSkin,
  shotgunSkinIds,
  shotgunSkins,
  type ShotgunSkin,
} from '../game/weapons/ShotgunSkins';
import {
  normalizeSmgSkin,
  smgSkinIds,
  smgSkins,
  type SmgSkin,
} from '../game/weapons/SmgSkins';

const regionLabels: Record<HitRegion, string> = {
  head: 'Head',
  upperTorso: 'Upper body',
  lowerTorso: 'Lower body',
  leftArm: 'Left arm',
  rightArm: 'Right arm',
  leftHand: 'Left hand',
  rightHand: 'Right hand',
  leftLeg: 'Left leg',
  rightLeg: 'Right leg',
  leftFoot: 'Left foot',
  rightFoot: 'Right foot',
};
const number = (value: number) => Number(value.toFixed(2)).toString();

export function WeaponPanel({
  initialWeapon = 'rifle',
  allowedWeapons = weaponOrder,
  rifleSkin,
  onRifleSkin,
  sniperSkin,
  onSniperSkin,
  shotgunSkin,
  onShotgunSkin,
  smgSkin,
  onSmgSkin,
  onClose,
}: {
  initialWeapon?: WeaponId;
  allowedWeapons?: readonly WeaponId[];
  rifleSkin: RifleSkin;
  onRifleSkin(skin: RifleSkin): void;
  sniperSkin: SniperSkin;
  onSniperSkin(skin: SniperSkin): void;
  shotgunSkin: ShotgunSkin;
  onShotgunSkin(skin: ShotgunSkin): void;
  smgSkin: SmgSkin;
  onSmgSkin(skin: SmgSkin): void;
  onClose(): void;
}) {
  const [selection, setSelection] = useState(initialWeapon);
  const selected = allowedWeapons.includes(selection)
    ? selection
    : allowedWeapons[0]!;
  const config = weaponConfigs[selected];
  const title = useId();
  return (
    <TacticalDialog
      title="KNOW YOUR EQUIPMENT"
      eyebrow="ARMORY / WEAPON INTELLIGENCE"
      name="Armory"
      onClose={onClose}
      className="weapon-panel"
    >
      <div className="armory-selector" role="group" aria-label="Inspect weapon">
        {allowedWeapons.map((id) => (
          <button
            key={id}
            aria-pressed={selected === id}
            onClick={() => setSelection(id)}
          >
            {weaponConfigs[id].name}
          </button>
        ))}
      </div>
      {selected === 'rifle' && (
        <div className="scope-style-setting armory-finish">
          <label htmlFor={`${title}-rifle-skin`}>Rifle skin</label>
          <select
            id={`${title}-rifle-skin`}
            value={rifleSkin}
            onChange={({ target }) =>
              onRifleSkin(normalizeRifleSkin(target.value))
            }
          >
            {rifleSkinIds.map((id) => (
              <option key={id} value={id}>
                {rifleSkins[id].name}
                {rifleSkins[id].mythic && ' / Mythic'}
              </option>
            ))}
          </select>
        </div>
      )}
      {selected === 'sniper' && (
        <div className="scope-style-setting armory-finish">
          <label htmlFor={`${title}-sniper-skin`}>Sniper skin</label>
          <select
            id={`${title}-sniper-skin`}
            value={sniperSkin}
            onChange={({ target }) =>
              onSniperSkin(normalizeSniperSkin(target.value))
            }
          >
            {sniperSkinIds.map((id) => (
              <option key={id} value={id}>
                {sniperSkins[id].name}
              </option>
            ))}
          </select>
        </div>
      )}
      {selected === 'shotgun' && (
        <div className="scope-style-setting armory-finish">
          <label htmlFor={`${title}-shotgun-skin`}>Shotgun skin</label>
          <select
            id={`${title}-shotgun-skin`}
            value={shotgunSkin}
            onChange={({ target }) =>
              onShotgunSkin(normalizeShotgunSkin(target.value))
            }
          >
            {shotgunSkinIds.map((id) => (
              <option key={id} value={id}>
                {shotgunSkins[id].name}
              </option>
            ))}
          </select>
        </div>
      )}
      {selected === 'smg' && (
        <div className="scope-style-setting armory-finish">
          <label htmlFor={`${title}-smg-skin`}>SMG skin</label>
          <select
            id={`${title}-smg-skin`}
            value={smgSkin}
            onChange={({ target }) => onSmgSkin(normalizeSmgSkin(target.value))}
          >
            {smgSkinIds.map((id) => (
              <option key={id} value={id}>
                {smgSkins[id].name}
              </option>
            ))}
          </select>
        </div>
      )}
      <section
        className="weapon-statistics"
        aria-labelledby={title}
        data-testid="weapon-statistics"
        data-weapon={selected}
      >
        <div className="section-heading">
          <h3 id={title}>{config.name}</h3>
          <span>
            {config.burstSize
              ? `${config.burstSize}-ROUND BURST`
              : config.automatic
                ? 'AUTOMATIC'
                : 'SEMI-AUTO'}{' '}
            / {config.magazine} ROUNDS
          </span>
        </div>
        <div className="weapon-stat-grid">
          {weaponStatistics(config).map((stat) => (
            <div
              key={stat.id}
              className="weapon-stat"
              data-stat={stat.id}
              data-value={stat.value}
            >
              <div>
                <span>{stat.label}</span>
                <span>
                  {stat.rating}
                  <small> / 100</small>
                </span>
              </div>
              <div
                className="weapon-stat-track"
                role="meter"
                aria-label={stat.label}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={stat.rating}
                aria-valuetext={`${number(stat.value)} ${stat.unit}; rating ${stat.rating} of 100`}
              >
                <i style={{ width: `${stat.rating}%` }} />
              </div>
              <span className="weapon-stat-value">
                {number(stat.value)} <small>{stat.unit}</small>
              </span>
            </div>
          ))}
        </div>
        <p className="settings-note">
          Ratings compare equipment on a 0-100 scale. Values below each bar are
          the actual weapon specifications. Damage depends on the body region
          and distance.
        </p>
        <details className="weapon-damage-details">
          <summary>BODY MULTIPLIERS &amp; RANGE PROFILE</summary>
          <p className="settings-note">
            Base damage {config.damage} × body multiplier × range multiplier.
            One world unit equals one meter. Range multipliers blend smoothly
            between the listed distances.
          </p>
          <div className="weapon-profile-grid">
            <table aria-label="Body damage multipliers">
              <thead>
                <tr>
                  <th>HIT REGION</th>
                  <th>MULTIPLIER</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(config.bodyMultipliers).map(
                  ([region, multiplier]) => (
                    <tr key={region}>
                      <th scope="row">{regionLabels[region as HitRegion]}</th>
                      <td>{number(multiplier)}×</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
            <div>
              <table aria-label="Range damage multipliers">
                <thead>
                  <tr>
                    <th>DISTANCE</th>
                    <th>MULTIPLIER</th>
                  </tr>
                </thead>
                <tbody>
                  {config.damageFalloff.length ? (
                    config.damageFalloff.map((point) => (
                      <tr key={point.distance}>
                        <th scope="row">{point.distance} m</th>
                        <td>{number(point.multiplier)}×</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <th scope="row">All distances</th>
                      <td>1×</td>
                    </tr>
                  )}
                </tbody>
              </table>
              <p className="settings-note">
                Maximum bullet travel: {config.range} m. The last multiplier
                remains active up to this limit.
              </p>
            </div>
          </div>
        </details>
      </section>
    </TacticalDialog>
  );
}
