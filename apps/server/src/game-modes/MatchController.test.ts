import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { initializePhysics } from '@breakpoint/shared/physics';
import { matchDefaults } from '@breakpoint/shared/match';
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
function fixture() {
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
    const player = new ServerPlayer(s);
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
    kill,
    advance: (ms: number) => {
      time += ms;
    },
  };
}
describe('match lifecycle and score authority', () => {
  it('finishes FFA at the kill limit, counts deaths once and freezes results', () => {
    const f = fixture();
    f.add('a');
    f.add('b');
    expect(f.match.start()).toBeNull();
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
    f.match.start();
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
    f.match.start();
    f.advance(300000);
    f.match.beforeTick();
    expect(f.state.winningTeam).toBe('draw');
  });
  it('records only known, nonduplicate server eliminations and preserves departed scores', () => {
    const f = fixture();
    f.add('a');
    f.add('b');
    f.match.start();
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
    f.match.start();
    f.kill('a', 'b');
    f.match.afterCombat();
    const life = a.state.life;
    expect(f.match.returnToLobby()).toBeNull();
    expect(a.state.life).toBeGreaterThan(life);
    expect(f.state.scores.size).toBe(0);
    expect(f.state.players.get('b')!.ready).toBe(false);
    expect(f.match.start()).not.toBeNull();
    f.ready();
    expect(f.match.start()).toBeNull();
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
    expect(f.match.start()).toBeNull();
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
    expect(f.match.start()).not.toBeNull();
    f.add('b');
    f.add('c');
    f.add('d');
    expect(f.match.changeTeam('b', 'blue')).toBeNull();
    f.ready();
    expect(f.match.start()).not.toBeNull();
    f.match.changeTeam('b', 'orange');
    f.ready();
    expect(f.match.start()).toBeNull();
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
    f.match.start();
    f.kill('a', 'c');
    expect(f.state.blueScore).toBe(0);
    for (let i = 0; i < 40; i++) f.kill('a', 'b');
    f.match.afterCombat();
    expect(f.state.winningTeam).toBe('blue');
    expect(f.state.blueScore).toBe(40);
    f.match.returnToLobby();
    f.ready();
    f.match.start();
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
    f.match.start();
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
