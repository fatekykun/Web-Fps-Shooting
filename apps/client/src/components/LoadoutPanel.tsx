import { weaponConfigs, weaponOrder, type WeaponId } from '@breakpoint/shared';
import { weaponStatistics } from '@breakpoint/shared/weapons/statistics';
import { rifleSkins, type RifleSkin } from '../game/weapons/RifleSkins';

const categories: Record<WeaponId, string> = {
  rifle: 'Assault Rifles',
  smg: 'Submachine Guns',
  shotgun: 'Shotguns',
  sniper: 'Sniper Rifles',
};

const stats = Object.fromEntries(
  weaponOrder.map((weapon) => [
    weapon,
    weaponStatistics(weaponConfigs[weapon]).filter(({ id }) => id !== 'ads'),
  ]),
);

export function LoadoutPanel({
  respawning,
  seconds,
  selected,
  allowedWeapons = weaponOrder,
  rifleSkin = 'standard',
  onEquip,
}: {
  respawning: boolean;
  seconds: number;
  selected?: WeaponId;
  allowedWeapons?: readonly WeaponId[];
  rifleSkin?: RifleSkin;
  onEquip(weapon: WeaponId): void;
}) {
  const equipped =
    selected && allowedWeapons.includes(selected)
      ? selected
      : allowedWeapons[0];

  return (
    <div className="loadout-layer">
      <section className="loadout-panel" aria-labelledby="loadout-title">
        <header className="loadout-header">
          <h2 id="loadout-title">CHOOSE YOUR WEAPON</h2>
          <div
            className="loadout-clock"
            role="status"
            aria-atomic="true"
            data-testid={respawning ? 'death-notice' : 'match-countdown'}
          >
            <span>{respawning ? 'RESPAWNING IN' : 'MATCH STARTS IN'}</span>
            <strong>{seconds}</strong>
          </div>
        </header>
        <div className="loadout-weapons">
          {allowedWeapons.map((weapon) => (
            <article
              className="loadout-weapon"
              key={weapon}
              data-weapon={weapon}
              data-selected={weapon === equipped}
            >
              <span className="loadout-category">
                {weapon === 'rifle' && rifleSkin !== 'standard'
                  ? `${rifleSkins[rifleSkin].name} / Mythic`
                  : categories[weapon]}
              </span>
              <h3>{weaponConfigs[weapon].name}</h3>
              <span className="match-weapon-icon" aria-hidden="true" />
              <dl className="loadout-stats">
                {stats[weapon]!.map(({ id, label, rating }) => (
                  <div key={id}>
                    <dt>{label}</dt>
                    <dd>
                      <meter
                        min={0}
                        max={100}
                        value={rating}
                        aria-label={label}
                      />
                      <span>{rating}</span>
                    </dd>
                  </div>
                ))}
              </dl>
              <button
                type="button"
                className="loadout-equip"
                aria-label={`Equip ${weaponConfigs[weapon].name}`}
                aria-pressed={weapon === equipped}
                onClick={() => onEquip(weapon)}
              >
                {weapon === equipped ? 'SELECTED' : 'EQUIP'}
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
