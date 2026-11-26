import type { HitRegion, WeaponConfig } from '@breakpoint/shared';

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

export function WeaponDamageDetails({ config }: { config: WeaponConfig }) {
  return (
    <details className="weapon-damage-details">
      <summary>BODY MULTIPLIERS &amp; RANGE PROFILE</summary>
      <p className="settings-note">
        Base damage {config.damage} × body multiplier × range multiplier. One
        world unit equals one meter. Range multipliers blend smoothly between
        the listed distances.
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
            Maximum bullet travel: {config.range} m. The last multiplier remains
            active up to this limit.
          </p>
        </div>
      </div>
    </details>
  );
}
