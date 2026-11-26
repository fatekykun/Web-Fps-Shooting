import type { CombatSnapshot } from '../game/combat/PracticeCombat';
import { weaponConfigs, weaponOrder } from '@breakpoint/shared';
import {
  allowsMelee,
  defaultMeleeSkin,
  skinDefinitions,
} from '@breakpoint/shared/weapons/loadouts';
import { playerCombatConfig } from '@breakpoint/shared/combat';
import { KillFeed } from './KillFeed';
import { rifleSkins } from '../game/weapons/RifleSkins';
import { sniperSkins } from '../game/weapons/SniperSkins';
import { shotgunSkins } from '../game/weapons/ShotgunSkins';
import { smgSkins } from '../game/weapons/SmgSkins';
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
  choosingLoadout = false,
}: {
  combat: CombatSnapshot;
  bindings?: UserSettings['bindings'];
  multiplayer?: boolean;
  choosingLoadout?: boolean;
}) {
  const weapon = weaponConfigs[combat.weapon];
  const melee = combat.weapon === 'melee';
  const skin =
    combat.weapon === 'sniper'
      ? sniperSkins[combat.sniperSkin ?? 'standard']
      : combat.weapon === 'shotgun'
        ? shotgunSkins[combat.shotgunSkin ?? 'standard']
        : combat.weapon === 'smg'
          ? smgSkins[combat.smgSkin ?? 'standard']
          : rifleSkins[combat.rifleSkin ?? 'standard'];
  const gunSkinStatus =
    combat.weapon === 'sniper'
      ? combat.sniperSkinStatus
      : combat.weapon === 'shotgun'
        ? combat.shotgunSkinStatus
        : combat.weapon === 'smg'
          ? combat.smgSkinStatus
          : combat.rifleSkinStatus;
  const skinStatus = melee ? combat.meleeSkinStatus : gunSkinStatus;
  const skinName = melee
    ? skinDefinitions[combat.meleeSkin ?? defaultMeleeSkin].name
    : skin.name;
  const mythic = !melee && skin.mythic && skinStatus === 'ready';
  const name = melee
    ? skinName.toUpperCase()
    : mythic
      ? `${combat.name.split(' / ')[0]} / ${skinName.toUpperCase()}`
      : combat.name;
  const healthPercent =
    ((combat.player?.health ?? 0) / playerCombatConfig.health) * 100;
  return (
    <>
      <aside
        className="combat-hud"
        aria-label="Weapon status"
        data-testid="weapon-status"
        data-weapon={combat.weapon}
        data-operator={combat.operator}
        data-rifle-skin={combat.rifleSkin}
        data-rifle-skin-status={combat.rifleSkinStatus}
        data-sniper-skin={combat.sniperSkin}
        data-sniper-skin-status={combat.sniperSkinStatus}
        data-shotgun-skin={combat.shotgunSkin}
        data-shotgun-skin-status={combat.shotgunSkinStatus}
        data-smg-skin={combat.smgSkin}
        data-smg-skin-status={combat.smgSkinStatus}
        data-melee-skin={combat.meleeSkin}
        data-melee-skin-status={combat.meleeSkinStatus}
        data-inspecting={!!combat.inspecting}
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
            {!melee && (
              <span className="match-weapon-icon" aria-hidden="true" />
            )}
            <div className="weapon-name">{name}</div>
          </div>
        ) : (
          <div className="weapon-name">{name}</div>
        )}
        {!melee && (
          <div className="ammo-line">
            <strong>{String(combat.magazine).padStart(2, '0')}</strong>
            <span>/ {combat.reserve}</span>
          </div>
        )}
        <div className="weapon-action">
          {combat.player && !combat.player.alive
            ? 'WAITING TO RESPAWN'
            : combat.reloading
              ? 'RELOADING'
              : combat.cycling
                ? 'CYCLING BOLT'
                : combat.equipping
                  ? 'EQUIPPING'
                  : melee
                    ? 'MELEE READY'
                    : combat.magazine === 0
                      ? combat.reserve > 0
                        ? `EMPTY · ${keyLabel(bindings.reload)} TO RELOAD`
                        : 'OUT OF AMMO'
                      : combat.ads > 0.5
                        ? 'AIM DOWN SIGHTS'
                        : 'HIP FIRE'}
        </div>
        {skinStatus && skinStatus !== 'ready' && (
          <span className="weapon-action" role="status">
            {skinStatus === 'loading'
              ? `LOADING ${skinName.toUpperCase()}`
              : `${skinName.toUpperCase()} UNAVAILABLE`}
          </span>
        )}
        {multiplayer && !melee && (
          <span className="match-fire-mode">
            {weapon.burstSize ? 'BURST' : weapon.automatic ? 'AUTO' : 'SINGLE'}
          </span>
        )}
        <div className="reload-track">
          <span
            style={{
              width: `${(combat.reloading ? combat.reloadProgress : (combat.cycleProgress ?? 0)) * 100}%`,
            }}
          />
        </div>
        {!choosingLoadout && (
          <div className="weapon-keys">
            {multiplayer
              ? 'LOADOUT LOCKED UNTIL RESPAWN'
              : `${weaponOrder.map((id) => keyLabel(bindings[id])).join(' / ')} LOADOUTS`}
            {(!combat.allowedWeapons || allowsMelee(combat.allowedWeapons)) &&
              ` · ${keyLabel(bindings.melee)} SWITCH`}
            {!melee && ` · ${keyLabel(bindings.inspect)} INSPECT`}
          </div>
        )}
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
