import { useId, useState } from 'react';
import { weaponConfigs, weaponOrder, type WeaponId } from '@breakpoint/shared';
import {
  loadoutSlots,
  skinDefinitions,
  weaponCategories,
  weaponSkinIds,
  type Equipment,
  type LoadoutProfile,
  type LoadoutSlot,
  type WeaponSkin,
} from '@breakpoint/shared/weapons/loadouts';
import { weaponStatistics } from '@breakpoint/shared/weapons/statistics';
import { TacticalDialog } from './TacticalDialog';
import { WeaponPreview } from './WeaponPreview';
import { WeaponDamageDetails } from './WeaponDamageDetails';
import { isOperator, operators } from '@breakpoint/shared/operators';

export function LoadoutEditor({
  profile,
  reducedMotion,
  onSave,
  onClose,
}: {
  profile: LoadoutProfile;
  reducedMotion: boolean;
  onSave(next: LoadoutProfile): boolean;
  onClose(): void;
}) {
  const [slot, setSlot] = useState(profile.defaultSlot);
  const [drafts, setDrafts] = useState(profile.slots);
  const [message, setMessage] = useState('');
  const [inspecting, setInspecting] = useState(false);
  const [previewCharacter, setPreviewCharacter] = useState(false);
  const characterField = useId();
  const draft = drafts[slot];
  const operator = draft.operator ?? 'standard';
  const config = weaponConfigs[draft.weapon];
  const definition = skinDefinitions[draft.skin];
  const dirty = (index: LoadoutSlot) =>
    drafts[index].weapon !== profile.slots[index].weapon ||
    drafts[index].skin !== profile.slots[index].skin ||
    drafts[index].operator !== profile.slots[index].operator;
  const edit = (next: Equipment) => {
    const updated = [...drafts] as LoadoutProfile['slots'];
    updated[slot] = next;
    setDrafts(updated);
    setMessage('');
  };
  function save() {
    const slots = [...profile.slots] as LoadoutProfile['slots'];
    slots[slot] = draft;
    setMessage(
      onSave({ ...profile, slots })
        ? `Loadout ${slot + 1} saved`
        : 'Loadout updated for this session. Storage unavailable.',
    );
  }
  return (
    <TacticalDialog
      title="LOADOUTS"
      eyebrow="BREAKPOINT / EQUIPMENT"
      name="Loadouts"
      onClose={() => (inspecting ? setInspecting(false) : onClose())}
      className={`loadout-editor${inspecting ? ' inspecting' : ''}`}
      footer={
        <>
          <label>
            Change Weapon
            <select
              value={draft.weapon}
              onChange={({ target }) =>
                edit({
                  ...draft,
                  weapon: target.value as WeaponId,
                  skin: 'standard',
                })
              }
            >
              {weaponOrder.map((id) => (
                <option key={id} value={id}>
                  {weaponConfigs[id].name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Change Skin
            <select
              value={draft.skin}
              onChange={({ target }) =>
                edit({ ...draft, skin: target.value as WeaponSkin })
              }
            >
              {weaponSkinIds[draft.weapon].map((id) => (
                <option key={id} value={id}>
                  {skinDefinitions[id].name}
                </option>
              ))}
            </select>
          </label>
          <div className="equipment-commands">
            <button type="button" onClick={onClose}>
              Back
            </button>
            <button
              type="button"
              disabled={profile.defaultSlot === slot}
              onClick={() => {
                setMessage(
                  onSave({ ...profile, defaultSlot: slot })
                    ? `Loadout ${slot + 1} set as default`
                    : 'Default updated for this session. Storage unavailable.',
                );
              }}
            >
              Set as Default
            </button>
            <button type="button" className="equipment-save" onClick={save}>
              Save Loadout
            </button>
          </div>
        </>
      }
    >
      <nav className="equipment-slots" aria-label="Loadout slots">
        {loadoutSlots.map((index) => (
          <button
            key={index}
            type="button"
            aria-pressed={slot === index}
            onClick={() => {
              setSlot(index);
              setMessage('');
            }}
          >
            <strong>Loadout {index + 1}</strong>
            <span>
              {dirty(index)
                ? 'Unsaved'
                : profile.defaultSlot === index
                  ? 'Default'
                  : skinDefinitions[profile.slots[index].skin].name}
            </span>
          </button>
        ))}
      </nav>
      <div className="equipment-grid">
        <section className="equipment-identity" data-rarity={definition.rarity}>
          <span>{config.name}</span>
          <h3>{definition.name}</h3>
          <span className="equipment-rarity">{definition.rarity}</span>
          <p>{weaponCategories[draft.weapon]}</p>
          <div className="equipment-character">
            <label htmlFor={characterField}>Character</label>
            <select
              id={characterField}
              value={operator}
              onChange={({ target: { value } }) => {
                if (!isOperator(value)) return;
                edit({ ...draft, operator: value });
                setPreviewCharacter(value !== 'standard');
              }}
            >
              {Object.entries(operators).map(([id, entry]) => (
                <option key={id} value={id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </div>
          {operator !== 'standard' && (
            <div
              className="equipment-preview-mode"
              role="group"
              aria-label="Preview mode"
            >
              <button
                type="button"
                aria-pressed={!previewCharacter}
                onClick={() => setPreviewCharacter(false)}
              >
                Weapon
              </button>
              <button
                type="button"
                aria-pressed={previewCharacter}
                onClick={() => setPreviewCharacter(true)}
              >
                Character
              </button>
            </div>
          )}
        </section>
        <WeaponPreview
          equipment={draft}
          operator={
            previewCharacter && operator !== 'standard' ? operator : undefined
          }
          reducedMotion={reducedMotion}
          inspecting={inspecting}
          onInspect={() => setInspecting(!inspecting)}
        />
        <section
          className="equipment-statistics"
          aria-label="Weapon statistics"
          data-testid="weapon-statistics"
          data-weapon={draft.weapon}
        >
          <h3>Weapon Statistics</h3>
          <dl>
            {weaponStatistics(config).map((stat) => (
              <div key={stat.id} data-stat={stat.id} data-value={stat.value}>
                <dt>{stat.label}</dt>
                <dd>
                  {Number(stat.value.toFixed(2))} <small>{stat.unit}</small>
                </dd>
                <meter
                  aria-label={stat.label}
                  min={0}
                  max={100}
                  value={stat.rating}
                />
              </div>
            ))}
            <div>
              <dt>Magazine Capacity</dt>
              <dd>
                {config.magazine} <small>rounds</small>
              </dd>
            </div>
          </dl>
          <WeaponDamageDetails config={config} />
        </section>
      </div>
      <div className="equipment-message" role="status">
        {message}
      </div>
    </TacticalDialog>
  );
}
