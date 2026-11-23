import type { CombatSnapshot } from '../game/combat/PracticeCombat';
import { weaponConfigs, weaponOrder } from '@breakpoint/shared';
import { playerCombatConfig } from '@breakpoint/shared/combat';
import { KillFeed } from './KillFeed';
import {
  defaultBindings,
  keyLabel,
  type UserSettings,
} from '../game/settings/userSettings';

// Remove floating-point dust before rounding fractional health up for display.
const healthLabel = (health: number) => Math.ceil(Math.max(0, health - 1e-9));

export function CombatHud({
  combat,
  bindings = defaultBindings,
  multiplayer = false,
}: {
  combat: CombatSnapshot;
  bindings?: UserSettings['bindings'];
  multiplayer?: boolean;
}) {
  const weapon = weaponConfigs[combat.weapon];
  const healthPercent =
    ((combat.player?.health ?? 0) / playerCombatConfig.health) * 100;
  return (
    <>
      <aside
        className="combat-hud"
        aria-label="Weapon status"
        data-testid="weapon-status"
        data-weapon={combat.weapon}
        data-ammo={combat.magazine}
        data-reserve={combat.reserve}
        data-ads={combat.ads}
        data-fov={combat.fov}
        data-spread={combat.spread}
        data-recoil={combat.recoilPitch}
        data-shots={combat.shots}
        data-reloading={String(combat.reloading)}
        data-cycling={String(!!combat.cycling)}
        data-cycle-progress={combat.cycleProgress ?? 0}
        data-hits={combat.hitSequence}
      >
        {multiplayer ? (
          <div className="match-weapon-identity">
            <span className="match-weapon-icon" aria-hidden="true" />
            <div className="weapon-name">{combat.name}</div>
          </div>
        ) : (
          <div className="weapon-name">{combat.name}</div>
        )}
        <div className="ammo-line">
          <strong>{String(combat.magazine).padStart(2, '0')}</strong>
          <span>/ {combat.reserve}</span>
        </div>
        <div className="weapon-action">
          {combat.player && !combat.player.alive
            ? 'WAITING TO RESPAWN'
            : combat.reloading
              ? 'RELOADING'
              : combat.cycling
                ? 'CYCLING BOLT'
                : combat.equipping
                  ? 'EQUIPPING'
                  : combat.magazine === 0
                    ? combat.reserve > 0
                      ? `EMPTY · ${keyLabel(bindings.reload)} TO RELOAD`
                      : 'OUT OF AMMO'
                    : combat.ads > 0.5
                      ? 'AIM DOWN SIGHTS'
                      : 'HIP FIRE'}
        </div>
        {multiplayer && (
          <span className="match-fire-mode">
            {weapon.automatic ? 'AUTO' : 'SINGLE'}
          </span>
        )}
        <div className="reload-track">
          <span
            style={{
              width: `${(combat.reloading ? combat.reloadProgress : (combat.cycleProgress ?? 0)) * 100}%`,
            }}
          />
        </div>
        <div className="weapon-keys">
          {(combat.allowedWeapons ?? weaponOrder)
            .map((id) => `${keyLabel(bindings[id])} ${id.toUpperCase()}`)
            .join(' · ')}
        </div>
      </aside>
      {combat.player ? (
        <>
          <div
            className="player-health"
            data-testid="player-health"
            data-health={combat.player.health}
            data-alive={String(combat.player.alive)}
            data-life={combat.player.life}
          >
            <span className="vitals-label">
              {combat.player.protected
                ? 'SPAWN PROTECTED'
                : multiplayer
                  ? 'HP'
                  : 'VITALS'}
            </span>
            <strong>
              {healthLabel(combat.player.health)}{' '}
              <small>/ {playerCombatConfig.health}</small>
            </strong>
            <span className="health-track">
              <i style={{ width: `${healthPercent}%` }} />
            </span>
            {combat.lastDamage > 0 && (
              <span>
                CONFIRMED {Math.round(combat.lastDamage)}
                {combat.critical ? ' · HEADSHOT' : ''}
              </span>
            )}
          </div>
          {!combat.player.alive && (
            <div
              className="death-notice"
              role="status"
              data-testid="death-notice"
            >
              <strong>ELIMINATED</strong>
              <span>RESPAWNING IN {Math.ceil(combat.player.respawnIn)}</span>
            </div>
          )}
          {combat.player.damageSequence > 0 && (
            <div
              key={combat.player.damageSequence}
              className="damage-flash"
              aria-hidden="true"
            />
          )}
        </>
      ) : (
        <div
          className="dummy-status"
          data-testid="dummy-status"
          data-health={combat.dummyHealth}
          data-resetting={String(combat.dummyResetting)}
        >
          <span>HOLO-01 / LOCAL PRACTICE</span>
          <strong>
            {combat.dummyResetting
              ? 'RESETTING TARGET'
              : `TARGET ${healthLabel(combat.dummyHealth)} / 100`}
          </strong>
          {combat.lastDamage > 0 && (
            <span>
              LAST HIT {Math.round(combat.lastDamage)}
              {combat.critical ? ' · HEADSHOT' : ''}
            </span>
          )}
        </div>
      )}
      {combat.killFeed && <KillFeed events={combat.killFeed} />}
      {combat.hitSequence > 0 && (
        <div
          key={combat.hitSequence}
          className={`hit-marker ${combat.critical ? 'critical' : ''}`}
          aria-hidden="true"
        />
      )}
    </>
  );
}
