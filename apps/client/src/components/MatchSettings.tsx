import { useState } from 'react';
import {
  matchDefaults,
  parseMatchSettings,
  type MatchSettings as Settings,
} from '@breakpoint/shared/match';

export function MatchFields({
  value,
  onChange,
}: {
  value: Settings;
  onChange(value: Settings): void;
}) {
  return (
    <div className="match-fields">
      <label className="room-field">
        GAME MODE
        <select
          value={value.mode}
          onChange={(event) =>
            onChange({
              ...matchDefaults[event.target.value === 'tdm' ? 'tdm' : 'ffa'],
            })
          }
        >
          <option value="ffa">Free-for-All</option>
          <option value="tdm">Team Deathmatch</option>
        </select>
      </label>
      <label className="room-field">
        KILL LIMIT
        <input
          type="number"
          min={1}
          max={100}
          value={value.scoreLimit}
          onChange={(event) =>
            onChange({ ...value, scoreLimit: Number(event.target.value) })
          }
        />
      </label>
      <label className="room-field">
        TIME LIMIT (SECONDS)
        <input
          type="number"
          min={30}
          max={1800}
          step={30}
          value={value.durationSeconds}
          onChange={(event) =>
            onChange({ ...value, durationSeconds: Number(event.target.value) })
          }
        />
      </label>
    </div>
  );
}

export function LobbySettings({
  initial,
  onApply,
}: {
  initial: Settings;
  onApply(value: Settings): void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <details className="lobby-settings">
      <summary>HOST RULES</summary>
      <MatchFields value={value} onChange={setValue} />
      <button
        className="room-button"
        disabled={!parseMatchSettings(value)}
        onClick={() => onApply(value)}
      >
        APPLY RULES
      </button>
      <p className="room-note">Changing rules or teams resets readiness.</p>
    </details>
  );
}
