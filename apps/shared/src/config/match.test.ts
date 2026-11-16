import { expect, it } from 'vitest';
import {
  matchDefaults,
  parseMatchSettings,
  rankScores,
  spawnCandidates,
} from './match';

it('uses the specified FFA and TDM defaults', () => {
  expect(matchDefaults.ffa).toEqual({
    mode: 'ffa',
    scoreLimit: 20,
    durationSeconds: 300,
  });
  expect(matchDefaults.tdm).toEqual({
    mode: 'tdm',
    scoreLimit: 40,
    durationSeconds: 420,
  });
});
it('accepts bounded integer settings and strips extra client claims', () => {
  expect(
    parseMatchSettings({ ...matchDefaults.tdm, blueScore: 99, winnerId: 'me' }),
  ).toEqual(matchDefaults.tdm);
  for (const change of [
    { mode: 'race' },
    { scoreLimit: 0 },
    { scoreLimit: 101 },
    { scoreLimit: 1.5 },
    { durationSeconds: 29 },
    { durationSeconds: Infinity },
    { durationSeconds: '300' },
  ])
    expect(parseMatchSettings({ ...matchDefaults.ffa, ...change })).toBeNull();
});
it('ranks copies consistently and provides four spawns on each opposite side', () => {
  const rows = [
    {
      id: 'a',
      name: 'A',
      team: 'none' as const,
      kills: 2,
      deaths: 3,
      connected: true,
    },
    {
      id: 'b',
      name: 'B',
      team: 'none' as const,
      kills: 2,
      deaths: 1,
      connected: true,
    },
  ];
  expect(rankScores(rows)[0]!.id).toBe('b');
  expect(rows[0]!.id).toBe('a');
  expect(spawnCandidates('blue')).toHaveLength(4);
  expect(spawnCandidates('orange').every((p) => p.z < 0)).toBe(true);
  expect(spawnCandidates('blue').every((p) => p.z > 0)).toBe(true);
});
