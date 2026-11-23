import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { initializePhysics } from '@breakpoint/shared/physics';
import { arenas, type ArenaDefinition } from '@breakpoint/shared/maps';
import { matchCountdownSeconds, matchDefaults } from '@breakpoint/shared/match';
import { PlayerState, RoomState } from '../rooms/RoomState';
import { ServerPlayer } from '../players/ServerPlayer';
import { ServerCombat } from '../combat/ServerCombat';
import { MatchController } from './MatchController';

const worlds: ServerPlayer[] = [];
beforeAll(initializePhysics);
afterEach(() => {
  for (const player of worlds) player.dispose();
  worlds.length = 0;
});
function fixture(arena: ArenaDefinition = arenas.depot) {
  const state = new RoomState(),
    players = new Map<string, ServerPlayer>();
  const combat = new ServerCombat(
    players,
    () => {},
    (kill) => match.recordKill(kill),
    () => 12345,
  );
  let time = 0,
    event = 0;
  const match = new MatchController(state, players, combat, () => time);
  function add(id: string) {
    const s = new PlayerState({
      id,
      name: id,
      slot: state.players.size,
      ready: true,
    });
    match.assignTeam(s);
    const player = new ServerPlayer(s, arena);
    if (!state.hostId) state.hostId = id;
    players.set(id, player);
    state.players.set(id, s);
    combat.add(player);
    match.joined(player);
    worlds.push(player);
    return player;
  }
  function ready() {
    for (const player of state.players.values()) player.ready = true;
  }
  function kill(killer: string, victim: string) {
    match.recordKill({
      id: ++event,
      killer,
      victim,
      killerId: killer,
      victimId: victim,
      weapon: 'rifle',
      headshot: false,
    });
  }
  return {
    state,
    players,
    combat,
    match,
    add,
    ready,
    begin: () => {
      const error = match.start();
      if (error === null) {
        time += matchCountdownSeconds * 1000;
        match.beforeTick();
      }
      return error;
    },
    kill,
    advance: (ms: number) => {
      time += ms;
    },
  };
}
describe('match lifecycle and score authority', () => {
  it('uses Shipment team spawns and keeps respawns away from nearby opponents', () => {
    const f = fixture(arenas.shipment);
    expect(f.match.configure(matchDefaults.tdm)).toBeNull();
    const blue = f.add('blue');
    const orange = f.add('orange');
    expect(f.begin()).toBeNull();
    expect(blue.state.z).toBeCloseTo(-15.7);
    expect(blue.state.yaw).toBeCloseTo(Math.PI);
    expect(orange.state.z).toBeCloseTo(15.7);
    expect(orange.state.yaw).toBe(0);
    orange.respawn({ x: -8, y: 0.91, z: -12.8 });
    blue.state.alive = false;
    f.combat.step(1);
    expect(blue.state.alive).toBe(true);
    expect(blue.state.x).toBeCloseTo(7.5);
    expect(blue.state.z).toBeCloseTo(-15.7);
    expect(blue.state.yaw).toBeCloseTo(Math.PI);
  });
  it('counts down exactly five seconds, blocks premature scores and starts the full match clock at MATCH START', () => {
    const f = fixture();
    f.add('a');
    f.add('b');
    expect(f.match.start()).toBeNull();
    expect(f.state.phase).toBe('countdown');
    expect(f.state.countdownSeconds).toBe(5);
    expect(f.match.beforeTick()).toBe(false);
    f.kill('a', 'b');
    expect(f.state.scores.get('a')!.kills).toBe(0);
    for (const expected of [5, 4, 3, 2, 1]) {
      f.advance(999);
      expect(f.match.beforeTick()).toBe(false);
      expect(f.state.countdownSeconds).toBe(expected);
      expect(f.state.remainingSeconds).toBe(300);
      f.advance(1);
      expect(f.match.beforeTick()).toBe(expected === 1);
    }
    expect(f.state.phase).toBe('playing');
    expect(f.state.countdownSeconds).toBe(0);
    expect(f.state.remainingSeconds).toBe(300);
    f.advance(1000);
    f.match.beforeTick();
    expect(f.state.remainingSeconds).toBe(299);
    f.kill('a', 'b');
    expect(f.state.scores.get('a')!.kills).toBe(1);
  });

  it('supports joining and leaving during the countdown and locks ready/rule changes once it starts', () => {
    const f = fixture();
    f.add('a');
    expect(f.match.start()).toBeNull();
    f.advance(1500);
    f.match.beforeTick();
    f.add('b');
    expect(f.state.countdownSeconds).toBe(4);
    expect(f.state.scores.get('b')!.connected).toBe(true);
    f.match.left('b');
    expect(f.state.scores.get('b')!.connected).toBe(false);
    expect(f.match.configure(matchDefaults.tdm)).not.toBeNull();
    expect(f.match.start()).not.toBeNull();
    f.advance(3500);
    expect(f.match.beforeTick()).toBe(true);
  });
  it('finishes FFA at the kill limit, counts deaths once and freezes results', () => {
    const f = fixture();
    f.add('a');
    f.add('b');
    expect(f.begin()).toBeNull();
    for (let i = 0; i < 20; i++) f.kill('a', 'b');
    f.match.afterCombat();
    expect(f.state.phase).toBe('results');
    expect(f.state.winnerId).toBe('a');
    expect(f.state.endReason).toBe('score');
    expect(f.state.scores.get('a')!.kills).toBe(20);
    expect(f.state.scores.get('b')!.deaths).toBe(20);
    f.kill('b', 'a');
    f.match.left('a');
    expect(f.state.scores.get('a')!.kills).toBe(20);
    expect(f.state.scores.get('a')!.connected).toBe(true);
    expect(f.match.beforeTick()).toBe(false);
  });
  it('uses a monotonic clock, awards the leader at timeout and draws tied matches', () => {
    const f = fixture();
    f.add('a');
    f.add('b');
    f.begin();
    f.kill('b', 'a');
    f.advance(299999);
    expect(f.match.beforeTick()).toBe(true);
    expect(f.state.remainingSeconds).toBe(1);
    f.advance(1);
    expect(f.match.beforeTick()).toBe(false);
    expect(f.state.winnerId).toBe('b');
    expect(f.state.endReason).toBe('time');
    f.match.returnToLobby();
    f.ready();
    f.begin();
    f.advance(300000);
    f.match.beforeTick();
    expect(f.state.winningTeam).toBe('draw');
  });
  it('records only known, nonduplicate server eliminations and preserves departed scores', () => {
    const f = fixture();
    f.add('a');
    f.add('b');
    f.begin();
    const event = {
      id: 1,
      killerId: 'a',
      victimId: 'b',
      killer: 'forged name',
      victim: 'b',
      weapon: 'rifle' as const,
      headshot: false,
    };
    f.match.recordKill(event);
    f.match.recordKill(event);
    f.match.recordKill({ ...event, id: 2, victimId: 'unknown' });
    f.match.recordKill({ ...event, id: 3, victimId: 'a' });
    expect(f.state.scores.get('a')!.kills).toBe(1);
    expect(f.state.scores.get('a')!.name).toBe('a');
    f.match.left('a');
    f.state.players.delete('a');
    expect(f.state.scores.get('a')!.connected).toBe(false);
    f.advance(300000);
    f.match.beforeTick();
    expect(f.state.winnerName).toBe('a');
  });
  it('returns to a clean lobby and starts a new round without reusing life generations', () => {
    const f = fixture();
    const a = f.add('a');
    f.add('b');
    f.match.configure({ ...matchDefaults.ffa, scoreLimit: 1 });
    f.ready();
    f.begin();
    f.kill('a', 'b');
    f.match.afterCombat();
    const life = a.state.life;
    expect(f.match.returnToLobby()).toBeNull();
    expect(a.state.life).toBeGreaterThan(life);
    expect(f.state.scores.size).toBe(0);
    expect(f.state.players.get('b')!.ready).toBe(false);
    expect(f.begin()).not.toBeNull();
    f.ready();
    expect(f.begin()).toBeNull();
    expect(f.state.round).toBe(2);
    expect(f.state.scores.get('a')!.kills).toBe(0);
    expect(f.combat.owner(a).ammo.rifle.magazine).toBe(30);
  });
});
describe('TDM teams and rules', () => {
  it('assigns four per side, blocks a full team and starts at opposite spawns', () => {
    const f = fixture();
    f.match.configure(matchDefaults.tdm);
    for (let i = 0; i < 8; i++) f.add(String(i));
    expect(
      [...f.state.players.values()].filter((p) => p.team === 'blue'),
    ).toHaveLength(4);
    expect(f.match.changeTeam('1', 'blue')).not.toBeNull();
    f.ready();
    expect(f.begin()).toBeNull();
    for (const p of f.state.players.values()) {
      expect(p.team === 'blue' ? p.z > 0 : p.z < 0).toBe(true);
      expect(p.y).toBeCloseTo(0.91);
      if (p.team === 'orange') expect(p.yaw).toBe(Math.PI);
    }
  });
  it('requires both teams and balanced ready players, and locks rules while playing', () => {
    const f = fixture();
    f.match.configure(matchDefaults.tdm);
    f.add('a');
    expect(f.begin()).not.toBeNull();
    f.add('b');
    f.add('c');
    f.add('d');
    expect(f.match.changeTeam('b', 'blue')).toBeNull();
    f.ready();
    expect(f.begin()).not.toBeNull();
    f.match.changeTeam('b', 'orange');
    f.ready();
    expect(f.begin()).toBeNull();
    expect(f.match.configure(matchDefaults.ffa)).not.toBeNull();
    expect(f.match.changeTeam('a', 'orange')).not.toBeNull();
  });
  it('counts enemy kills toward 40, ignores friendly kills and supports a timed draw', () => {
    const f = fixture();
    f.match.configure(matchDefaults.tdm);
    f.add('a');
    f.add('b');
    f.add('c');
    f.ready();
    f.begin();
    f.kill('a', 'c');
    expect(f.state.blueScore).toBe(0);
    for (let i = 0; i < 40; i++) f.kill('a', 'b');
    f.match.afterCombat();
    expect(f.state.winningTeam).toBe('blue');
    expect(f.state.blueScore).toBe(40);
    f.match.returnToLobby();
    f.ready();
    f.begin();
    f.advance(420000);
    f.match.beforeTick();
    expect(f.state.winningTeam).toBe('draw');
    expect(f.state.endReason).toBe('time');
  });
  it('draws simultaneous equal score-limit finishes and balances late joins', () => {
    const f = fixture();
    f.match.configure({ ...matchDefaults.tdm, scoreLimit: 1 });
    f.add('a');
    f.add('b');
    f.ready();
    f.begin();
    f.add('c');
    expect(f.state.players.get('c')!.team).toBe('blue');
    f.add('d');
    expect(f.state.players.get('d')!.team).toBe('orange');
    f.kill('a', 'b');
    f.kill('d', 'c');
    f.match.afterCombat();
    expect(f.state.winningTeam).toBe('draw');
  });
});

it('keeps the restricted loadout through results, return to lobby and a TDM rematch', () => {
  const f = fixture();
  f.combat.setAllowedWeapons(['shotgun', 'sniper']);
  expect(f.match.configure({ ...matchDefaults.ffa, scoreLimit: 1 })).toBeNull();
  f.add('a');
  f.add('b');
  f.ready();
  expect(f.begin()).toBeNull();
  expect(
    [...f.players.values()].every((p) => p.state.weapon === 'shotgun'),
  ).toBe(true);
  f.kill('a', 'b');
  f.match.afterCombat();
  expect(f.state.phase).toBe('results');
  expect(f.match.returnToLobby()).toBeNull();
  expect(f.match.configure(matchDefaults.tdm)).toBeNull();
  f.ready();
  expect(f.begin()).toBeNull();
  for (const player of f.players.values()) {
    expect(player.state.weapon).toBe('shotgun');
    expect([...f.combat.get(player.state.id)!.owned]).toEqual([
      'shotgun',
      'sniper',
    ]);
  }
});
