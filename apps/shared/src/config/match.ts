import type { WeaponId } from '../types/weapons';
import { weaponOrder } from './weapons';
import {
  arenas,
  isArenaId,
  type ArenaDefinition,
  type ArenaId,
} from '../maps/arenas';

export type GameMode = 'ffa' | 'tdm';
export type Team = 'none' | 'blue' | 'orange';
export type MatchPhase = 'lobby' | 'countdown' | 'playing' | 'results';
export const matchCountdownSeconds = 5;
export function isMatchActive(phase: MatchPhase | string | undefined): boolean {
  return phase === 'countdown' || phase === 'playing';
}
export interface MatchSettings {
  mode: GameMode;
  scoreLimit: number;
  durationSeconds: number;
}
export const playerLimits = [2, 4, 6, 8] as const;
export interface PrivateRoomSettings extends MatchSettings {
  mapId?: ArenaId;
  playerLimit?: (typeof playerLimits)[number];
  /** Omitted means unrestricted; custom restrictions contain one or two categories. */
  allowedWeapons?: readonly WeaponId[];
}

export function parsePrivateRoomSettings(
  value: unknown,
): PrivateRoomSettings | null {
  const match = parseMatchSettings(value);
  if (!match) return null;
  const v = value as Record<string, unknown>;
  if (v.mapId !== undefined && !isArenaId(v.mapId)) return null;
  if (
    v.playerLimit !== undefined &&
    !playerLimits.includes(v.playerLimit as 2 | 4 | 6 | 8)
  )
    return null;
  let allowedWeapons: WeaponId[] | undefined;
  if (v.allowedWeapons !== undefined) {
    if (
      !Array.isArray(v.allowedWeapons) ||
      v.allowedWeapons.length < 1 ||
      v.allowedWeapons.length > 2 ||
      new Set(v.allowedWeapons).size !== v.allowedWeapons.length ||
      [...v.allowedWeapons].some((id) => !weaponOrder.includes(id))
    )
      return null;
    allowedWeapons = weaponOrder.filter((id) =>
      (v.allowedWeapons as unknown[]).includes(id),
    );
  }
  return {
    ...match,
    ...(v.mapId ? { mapId: v.mapId } : {}),
    playerLimit: (v.playerLimit ?? 8) as 2 | 4 | 6 | 8,
    ...(allowedWeapons ? { allowedWeapons } : {}),
  };
}
export const matchDefaults: Readonly<
  Record<GameMode, Readonly<MatchSettings>>
> = Object.freeze({
  ffa: Object.freeze({ mode: 'ffa', scoreLimit: 20, durationSeconds: 300 }),
  tdm: Object.freeze({ mode: 'tdm', scoreLimit: 40, durationSeconds: 420 }),
});
export const matchLimits = Object.freeze({
  maxTeamSize: 4,
  maxParticipants: 64,
  minScore: 1,
  maxScore: 100,
  minDuration: 30,
  maxDuration: 1800,
});
export interface ScoreRow {
  id: string;
  name: string;
  team: Team;
  kills: number;
  deaths: number;
  connected: boolean;
}
export interface MatchView extends MatchSettings {
  countdownSeconds?: number;
  round: number;
  remainingSeconds: number;
  blueScore: number;
  orangeScore: number;
  winnerId: string;
  winnerName: string;
  winningTeam: Team | 'draw';
  endReason: '' | 'score' | 'time';
  scores: ScoreRow[];
}
export function parseMatchSettings(value: unknown): MatchSettings | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (v.mode !== 'ffa' && v.mode !== 'tdm') return null;
  if (
    !Number.isInteger(v.scoreLimit) ||
    (v.scoreLimit as number) < matchLimits.minScore ||
    (v.scoreLimit as number) > matchLimits.maxScore
  )
    return null;
  if (
    !Number.isInteger(v.durationSeconds) ||
    (v.durationSeconds as number) < matchLimits.minDuration ||
    (v.durationSeconds as number) > matchLimits.maxDuration
  )
    return null;
  return {
    mode: v.mode,
    scoreLimit: v.scoreLimit as number,
    durationSeconds: v.durationSeconds as number,
  };
}
export function rankScores(rows: readonly ScoreRow[]): ScoreRow[] {
  return [...rows].sort(
    (a, b) =>
      b.kills - a.kills || a.deaths - b.deaths || a.id.localeCompare(b.id),
  );
}
export function spawnCandidates(
  team: string,
  arena: ArenaDefinition = arenas.depot,
) {
  return arena.spawns[team === 'blue' || team === 'orange' ? team : 'none'];
}
