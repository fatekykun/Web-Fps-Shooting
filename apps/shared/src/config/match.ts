import type { Vector3Like } from '../types/movement';

export type GameMode = 'ffa' | 'tdm';
export type Team = 'none' | 'blue' | 'orange';
export type MatchPhase = 'lobby' | 'playing' | 'results';
export interface MatchSettings {
  mode: GameMode;
  scoreLimit: number;
  durationSeconds: number;
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
export function spawnCandidates(team: string): Vector3Like[] {
  if (team === 'blue' || team === 'orange')
    return [-14, -6, 6, 14].map((x) => ({
      x,
      y: 0.91,
      z: team === 'blue' ? 12 : -13.5,
    }));
  return Array.from({ length: 8 }, (_, slot) => ({
    x: -14 + slot * 4,
    y: 0.91,
    z: 12,
  }));
}
