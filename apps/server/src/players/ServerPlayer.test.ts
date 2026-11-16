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
    } finally {
      player.dispose();
    }
  });
});
