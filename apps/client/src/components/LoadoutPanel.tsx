import { useEffect, useState } from 'react';
import { weaponConfigs, type WeaponId } from '@breakpoint/shared';
import {
  allowsMelee,
  defaultMeleeSkin,
  loadoutSlots,
  skinDefinitions,
  weaponCategories,
  type LoadoutProfile,
  type LoadoutSlot,
} from '@breakpoint/shared/weapons/loadouts';
import { weaponStatistics } from '@breakpoint/shared/weapons/statistics';
import { weaponThumbnail } from './WeaponPreview';
import { operators } from '@breakpoint/shared/operators';

export function LoadoutPanel({
  respawning,
  seconds,
  selected,
  allowedWeapons,
  profile,
  onEquip,
}: {
  respawning: boolean;
  seconds: number;
  selected?: LoadoutSlot;
  allowedWeapons: readonly WeaponId[];
  profile: LoadoutProfile;
  onEquip(slot: LoadoutSlot): void;
}) {
  const [pending, setPending] = useState<LoadoutSlot>();
  const equipped = pending ?? selected;
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat)
        return;
      const slot = loadoutSlots.find(
        (index) =>
          event.code === `Digit${index + 1}` ||
          event.code === `Numpad${index + 1}`,
      );
      if (slot === undefined) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!allowedWeapons.includes(profile.slots[slot].weapon)) return;
      setPending(slot);
      onEquip(slot);
    };
    window.addEventListener('keydown', handle, true);
    return () => window.removeEventListener('keydown', handle, true);
  }, [allowedWeapons, onEquip, profile]);

  return (
    <div className="loadout-layer">
      <section className="loadout-panel" aria-labelledby="loadout-title">
        <header className="loadout-header">
          <h2 id="loadout-title">CHOOSE YOUR LOADOUT</h2>
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
        {equipped === undefined && (
          <p className="loadout-room-fallback">
            This room will equip{' '}
            {weaponConfigs[allowedWeapons[0] ?? 'rifle'].name} with the standard
            skin.
          </p>
        )}
        <div className="loadout-weapons">
          {loadoutSlots.map((slot) => {
            const equipment = profile.slots[slot];
            const { weapon, skin } = equipment;
            const config = weaponConfigs[weapon];
            const allowed = allowedWeapons.includes(weapon);
            return (
              <article
                className="loadout-weapon"
                key={slot}
                data-weapon={weapon}
                data-slot={slot + 1}
                data-selected={slot === equipped}
                data-rarity={skinDefinitions[skin].rarity}
              >
                <span className="loadout-category">Loadout {slot + 1}</span>
                <h3>{config.name}</h3>
                <span className="loadout-skin">
                  {skinDefinitions[skin].name}
                </span>
                <span className="loadout-category">
                  {weaponCategories[weapon]}
                </span>
                <span className="loadout-category">
                  {operators[equipment.operator ?? 'standard'].name}
                </span>
                {allowsMelee(allowedWeapons) && (
                  <span className="loadout-category">
                    {
                      skinDefinitions[equipment.meleeSkin ?? defaultMeleeSkin]
                        .name
                    }
                  </span>
                )}
                <div className="loadout-thumbnail">
                  <img
                    src={weaponThumbnail(equipment)}
                    width="224"
                    height="120"
                    alt=""
                    onError={(event) => {
                      event.currentTarget.hidden = true;
                    }}
                  />
                  <span className="match-weapon-icon" aria-hidden="true" />
                </div>
                <dl className="loadout-stats">
                  {weaponStatistics(config).map(
                    ({ id, label, rating, value, unit }) => (
                      <div key={id}>
                        <dt>{label}</dt>
                        <dd title={`${Number(value.toFixed(2))} ${unit}`}>
                          <meter
                            min={0}
                            max={100}
                            value={rating}
                            aria-label={label}
                          />
                          {rating}
                        </dd>
                      </div>
                    ),
                  )}
                  <div>
                    <dt>Magazine</dt>
                    <dd>{config.magazine}</dd>
                  </div>
                </dl>
                <button
                  type="button"
                  className="loadout-equip"
                  aria-label={`Equip Loadout ${slot + 1}`}
                  aria-pressed={slot === equipped}
                  disabled={!allowed}
                  onClick={() => {
                    setPending(slot);
                    onEquip(slot);
                  }}
                >
                  {!allowed
                    ? 'ROOM RESTRICTED'
                    : slot === equipped
                      ? 'SELECTED'
                      : 'EQUIP'}
                </button>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
