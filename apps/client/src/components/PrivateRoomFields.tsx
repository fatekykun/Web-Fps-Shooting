import { weaponOrder } from '@breakpoint/shared';
import {
  arenas,
  defaultMultiplayerMapId,
  isMultiplayerMapId,
  multiplayerMapIds,
} from '@breakpoint/shared/maps';
import {
  playerLimits,
  type PrivateRoomSettings,
} from '@breakpoint/shared/match';

export function PrivateRoomFields({
  value,
  onChange,
  disabled = false,
}: {
  value: PrivateRoomSettings;
  onChange(value: PrivateRoomSettings): void;
  disabled?: boolean;
}) {
  const custom = value.allowedWeapons !== undefined;
  const selected = value.allowedWeapons ?? [];
  return (
    <fieldset className="private-room-fields" disabled={disabled}>
      <label className="room-field">
        MAP
        <select
          value={value.mapId ?? defaultMultiplayerMapId}
          onChange={(event) => {
            const mapId = event.target.value;
            if (isMultiplayerMapId(mapId)) onChange({ ...value, mapId });
          }}
        >
          {multiplayerMapIds.map((id) => (
            <option key={id} value={id}>
              {arenas[id].name}
            </option>
          ))}
        </select>
      </label>
      <label className="room-field">
        PLAYER LIMIT
        <select
          value={value.playerLimit ?? 8}
          onChange={(event) =>
            onChange({
              ...value,
              playerLimit: Number(event.target.value) as 2 | 4 | 6 | 8,
            })
          }
        >
          {playerLimits.map((limit) => (
            <option key={limit} value={limit}>
              {limit} Players
            </option>
          ))}
        </select>
      </label>
      <div className="section-heading">
        <h3>WEAPON SETTINGS</h3>
        <span data-testid="weapon-selection-count">
          {custom ? `${selected.length}/2 SELECTED` : 'UNRESTRICTED'}
        </span>
      </div>
      <p className="room-note">
        Choose which weapons players can use in this room. Select up to 2 weapon
        categories.
      </p>
      <label className="setting-toggle">
        <input
          type="checkbox"
          checked={custom}
          onChange={(event) =>
            onChange({
              ...value,
              allowedWeapons: event.target.checked ? [] : undefined,
            })
          }
        />
        Restrict weapons
      </label>
      <div className="weapon-choices">
        {weaponOrder.map((id) => (
          <label
            key={id}
            className={`weapon-choice ${selected.includes(id) ? 'selected' : ''}`}
          >
            <input
              type="checkbox"
              aria-label={
                id === 'smg' ? 'SMG' : id[0]!.toUpperCase() + id.slice(1)
              }
              checked={selected.includes(id)}
              disabled={
                !custom || (selected.length === 2 && !selected.includes(id))
              }
              onChange={(event) =>
                onChange({
                  ...value,
                  allowedWeapons: event.target.checked
                    ? [...selected, id]
                    : selected.filter((weapon) => weapon !== id),
                })
              }
            />
            {id.toUpperCase()}
          </label>
        ))}
      </div>
      <p className="room-note">
        {custom
          ? 'Select one or two categories. These rules apply to everyone for the lifetime of this room.'
          : 'All four weapon categories are available. Enable restrictions to choose a custom loadout.'}
      </p>
    </fieldset>
  );
}
