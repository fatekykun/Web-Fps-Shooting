import { beforeAll, describe, expect, it } from 'vitest';
import { initializePhysics } from '@breakpoint/shared/physics';
import { ServerPlayer } from './ServerPlayer';
import { PlayerState } from '../rooms/RoomState';

beforeAll(initializePhysics);
const input = (seq: number) => ({
  seq,
  forward: 1,
  right: 0,
  yaw: 0,
  pitch: 0,
  sprint: true,
  jump: false,
  jumpPressed: false,
  slidePressed: false,
  divePressed: false,
});

describe('server movement ownership', () => {
  it('owns gait animation on the server and resets it on respawn', () => {
    const player = new ServerPlayer(new PlayerState());
    try {
      for (let seq = 1; seq <= 30; seq++) {
        expect(
          player.enqueue([{ ...input(seq), gaitPhase: 99, gaitAmount: 99 }]),
        ).toBe(true);
        player.step();
      }
      expect(player.state.movement).toBe('sprinting');
      expect(player.state.gaitPhase).toBeGreaterThan(0);
      expect(player.state.gaitPhase).toBeLessThan(2 * Math.PI);
      expect(player.state.gaitAmount).toBeGreaterThan(0.8);
      expect(player.state.gaitAmount).toBeLessThanOrEqual(1);
      player.respawn({ x: 0, y: 0.91, z: 12 });
      expect(player.state.gaitPhase).toBe(0);
      expect(player.state.gaitAmount).toBe(0);
    } finally {
      player.dispose();
    }
  });
  it('consumes at most one fixed input per tick despite a queued burst', () => {
    const player = new ServerPlayer(new PlayerState());
    try {
      expect(
        player.enqueue(Array.from({ length: 6 }, (_, i) => input(i + 1))),
      ).toBe(true);
      player.step();
      expect(player.state.ack).toBe(1);
      expect(player.state.z).toBeGreaterThan(11.98);
      expect(player.enqueue([input(1)])).toBe(false);
      expect(player.enqueue([input(8)])).toBe(false);
      for (let i = 0; i < 5; i++) player.step();
      expect(player.state.ack).toBe(6);
    } finally {
      player.dispose();
    }
  });
  it('resynchronizes an overflowing queue without granting extra movement time', () => {
    const player = new ServerPlayer(new PlayerState());
    try {
      for (let i = 0; i < 15; i++)
        expect(
          player.enqueue(
            Array.from({ length: 6 }, (_, j) => input(i * 6 + j + 1)),
          ),
        ).toBe(true);
      const position = { ...player.movement.physics.position };
      expect(player.enqueue([input(91)])).toBe(true);
      expect(player.resynchronizations).toBe(1);
      expect(player.state.ack).toBe(90);
      expect(player.movement.physics.position).toEqual(position);
      player.step();
      expect(player.state.ack).toBe(91);
      expect(player.state.z).toBeGreaterThan(11.98);
      expect(player.enqueue([input(91)])).toBe(false);
    } finally {
      player.dispose();
    }
  });
  it('resolves map collision and stops stale held input', () => {
    const player = new ServerPlayer(new PlayerState({ slot: 3 }));
    try {
      let sequence = 0;
      for (let i = 0; i < 15; i++)
        expect(
          player.enqueue(Array.from({ length: 6 }, () => input(++sequence))),
        ).toBe(true);
      for (let i = 0; i < 90; i++) player.step();
      const before = player.state.z;
      for (let i = 0; i < 120; i++) player.step();
      expect(player.state.z).toBeGreaterThan(before - 1);
      expect(
        Math.hypot(player.movement.velocity.x, player.movement.velocity.z),
      ).toBeLessThan(0.01);
      // Keep walking into the shared arena boundary: server resolves the collision.
      for (let i = 0; i < 500; i++) {
        expect(player.enqueue([input(++sequence)])).toBe(true);
        player.step();
      }
      expect(player.state.z).toBeGreaterThan(-15.2);
      expect(player.state.y).toBeGreaterThan(0.87);
      expect(player.state.gaitAmount).toBeLessThan(0.01);
    } finally {
      player.dispose();
    }
  });
});
