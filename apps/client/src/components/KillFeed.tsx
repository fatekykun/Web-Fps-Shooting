import { weaponConfigs, type WeaponCategory } from '@breakpoint/shared';
import type { KillEvent } from '@breakpoint/shared/combat';

const weaponLabels: Record<WeaponCategory, string> = {
  melee: 'MELEE',
  rifle: 'Assault rifle',
  smg: 'Submachine gun',
  shotgun: 'Shotgun',
  sniper: 'Sniper rifle',
};

export function KillFeed({ events }: { events: readonly KillEvent[] }) {
  return (
    <ol className="kill-feed" aria-label="Kill feed">
      {events.map(({ id, killer, victim, weapon, headshot }) => {
        const category = weaponConfigs[weapon].category;
        return (
          <li key={id}>
            <strong className="kill-feed-name">{killer}</strong>
            <span className="kill-feed-icons">
              <span
                className="kill-feed-weapon"
                data-weapon={category}
                role="img"
                aria-label={weaponLabels[category]}
              >
                <span className="match-weapon-icon" aria-hidden="true" />
              </span>
              {headshot && (
                <span
                  className="kill-feed-headshot"
                  role="img"
                  aria-label="Headshot"
                />
              )}
            </span>
            <span className="kill-feed-name kill-feed-victim">{victim}</span>
          </li>
        );
      })}
    </ol>
  );
}
