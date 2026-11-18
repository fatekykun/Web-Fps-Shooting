import type { MovementInput, MovementState } from '../types/movement';
import type { MovementSnapshot } from '../movement/MovementController';
import type { WeaponInput, WeaponId } from '../types/weapons';
import { weaponOrder } from '../config/weapons';
import type { OwnerCombat } from '../combat/networkCombat';
import type { MatchPhase, MatchView, Team } from '../config/match';

export const networkConfig = Object.freeze({
  roomType: 'depot',
  maxPlayers: 8,
  tickRate: 60,
  patchRate: 50,
  batchSize: 2,
  maxBatch: 6,
  maxQueuedInputs: 90,
  maxPrediction: 180,
  interpolationDelay: 6,
  staleInputTicks: 15,
});
export const codePattern = /^[A-HJ-NP-Z2-9]{6}$/;

export interface PlayerInput extends MovementInput {
  seq: number;
  pitch: number;
  life?: number;
  weapon?: WeaponInput;
}
export interface Correction {
  /** Highest finalized input. An overloaded server may discard older queued inputs. */
  ack: number;
  snapshot: MovementSnapshot;
  combat?: OwnerCombat;
  look?: { yaw: number; pitch: number };
}
export interface PublicPlayer {
  id: string;
  name: string;
  slot: number;
  ready: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  halfHeight: number;
  movement: MovementState;
  ack: number;
  health: number;
  alive: boolean;
  life: number;
  weapon: WeaponId;
  protected: boolean;
  team: Team;
}
export interface RoomView {
  playerLimit?: number;
  allowedWeapons?: readonly WeaponId[];
  code: string;
  selfId: string;
  hostId: string;
  phase: MatchPhase;
  tick: number;
  players: PublicPlayer[];
  match: MatchView;
}

/** Treat websocket payloads as unknown; copy only accepted input fields. */
export function parseInput(value: unknown): PlayerInput | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(v.seq) ||
    (v.seq as number) <= 0 ||
    (v.seq as number) > 2 ** 31 - 1
  )
    return null;
  if (
    ![v.forward, v.right].every(
      (axis) => axis === -1 || axis === 0 || axis === 1,
    )
  )
    return null;
  if (
    typeof v.yaw !== 'number' ||
    !Number.isFinite(v.yaw) ||
    Math.abs(v.yaw) > Math.PI + 0.00001
  )
    return null;
  if (
    typeof v.pitch !== 'number' ||
    !Number.isFinite(v.pitch) ||
    Math.abs(v.pitch) > Math.PI / 2
  )
    return null;
  const flags = [
    'sprint',
    'jump',
    'jumpPressed',
    'slidePressed',
    'divePressed',
  ] as const;
  if (flags.some((key) => typeof v[key] !== 'boolean')) return null;
  let weapon: WeaponInput | undefined;
  if (
    v.life !== undefined &&
    (!Number.isSafeInteger(v.life) || (v.life as number) < 1)
  )
    return null;
  if (v.weapon !== undefined) {
    if (!v.weapon || typeof v.weapon !== 'object' || v.life === undefined)
      return null;
    const w = v.weapon as Record<string, unknown>;
    if (
      ['fire', 'aim', 'firePressed', 'reloadPressed'].some(
        (key) => typeof w[key] !== 'boolean',
      )
    )
      return null;
    if (w.switchTo !== null && !weaponOrder.includes(w.switchTo as WeaponId))
      return null;
    if (w.autoReload !== undefined && typeof w.autoReload !== 'boolean')
      return null;
    weapon = {
      fire: w.fire as boolean,
      aim: w.aim as boolean,
      firePressed: w.firePressed as boolean,
      reloadPressed: w.reloadPressed as boolean,
      switchTo: w.switchTo as WeaponId | null,
      ...(w.autoReload !== undefined
        ? { autoReload: w.autoReload as boolean }
        : {}),
    };
  }
  return {
    seq: v.seq as number,
    forward: v.forward as number,
    right: v.right as number,
    yaw: v.yaw,
    pitch: v.pitch,
    sprint: v.sprint as boolean,
    jump: v.jump as boolean,
    jumpPressed: v.jumpPressed as boolean,
    slidePressed: v.slidePressed as boolean,
    divePressed: v.divePressed as boolean,
    ...(v.life !== undefined ? { life: v.life as number } : {}),
    ...(weapon ? { weapon } : {}),
  };
}

export function parseName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  // Explicit character-code check also rejects control characters without a regex lint exception.
  if (
    !name ||
    name.length > 20 ||
    [...name].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    return null;
  return name;
}
