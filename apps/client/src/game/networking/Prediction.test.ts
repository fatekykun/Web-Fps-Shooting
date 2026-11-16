import { beforeAll, expect, it } from 'vitest';
import { initializePhysics, PhysicsWorld } from '@breakpoint/shared/physics';
import { MovementController } from '@breakpoint/shared/movement/MovementController';
import { arenaBoxes, spawn, type ArenaBox } from '@breakpoint/shared/maps';
import { movementConfig, type MovementInput } from '@breakpoint/shared';
import { Prediction } from './Prediction';
import type { OwnerCombat } from '@breakpoint/shared/combat';

beforeAll(initializePhysics);

it('clears old-life prediction on death/respawn without reusing sequence numbers', () => {
  const player = new MovementController(new PhysicsWorld(arenaBoxes, spawn));
  const prediction = new Prediction(player);
  const combat: OwnerCombat = {
    life: 1,
    health: 0,
    alive: false,
    respawnIn: 3,
    protected: false,
    selected: 'rifle',
    ammo: {
      rifle: { magazine: 30, reserve: 120 },
      smg: { magazine: 35, reserve: 140 },
      shotgun: { magazine: 8, reserve: 40 },
    },
    reloading: false,
    equipping: false,
    reloadProgress: 0,
    ads: 0,
    spread: 0,
    shots: 0,
    hitSequence: 0,
    lastDamage: 0,
    critical: false,
    damageSequence: 1,
  };
  try {
    const snapshot = player.capture();
    for (let i = 0; i < 12; i++)
      prediction.step({ forward: 1, right: 0, yaw: 0 }, 0);
    prediction.reconcile({ ack: 6, snapshot, combat });
    const position = { ...player.physics.position };
    const deadPacket = prediction.step({ forward: 1, right: 0, yaw: 0 }, 0);
    expect(deadPacket.seq).toBe(13);
    expect(player.physics.position).toEqual(position);
    const respawn = { ...snapshot, position: { x: 14, y: 0.91, z: 12 } };
    prediction.reconcile({
      ack: 13,
      snapshot: respawn,
      combat: { ...combat, life: 2, alive: true, health: 100 },
    });
    const packet = prediction.step({ forward: 0, right: 0, yaw: 0 }, 0);
    expect(packet.seq).toBe(14);
    expect(packet.life).toBe(2);
    expect(player.physics.position.x).toBeCloseTo(14, 2);
    prediction.reconcile({ ack: 13, snapshot, combat });
    expect(player.physics.position.x).toBeCloseTo(14, 2);
  } finally {
    player.physics.dispose();
  }
});

it('replays wall contact and the jump budget even with client-only practice sensors', () => {
  const boxes: ArenaBox[] = [-0.75, 0.75].map((x) => ({
    position: [x, 10, 0],
    size: [0.3, 20, 30],
    color: 0,
  }));
  const client = new MovementController(
    new PhysicsWorld(boxes, { x: 0.1, y: 10, z: 0 }),
  );
  const server = new MovementController(
    new PhysicsWorld(boxes, { x: 0.1, y: 10, z: 0 }),
  );
  client.physics.addSensorBox({ x: 0, y: 10, z: -3 }, { x: 1, y: 2, z: 1 });
  const prediction = new Prediction(client);
  const inputs = Array.from({ length: 70 }, (_, i) => ({
    forward: 0,
    right: 0,
    yaw: 0,
    jumpPressed: i % 15 === 0,
  }));
  try {
    for (const input of inputs) prediction.step(input, 0);
    for (const input of inputs.slice(0, 22))
      server.step(input, movementConfig.fixedStep);
    const snapshot = server.capture();
    expect(snapshot.lastWall).not.toBeNull();
    prediction.reconcile({ ack: 22, snapshot });
    for (const input of inputs.slice(22))
      server.step(input, movementConfig.fixedStep);
    expect(client.wallJumps).toBe(2);
    expect(client.capture().lastWall).toBe(server.capture().lastWall);
    expect(client.physics.position.x).toBeCloseTo(server.physics.position.x, 4);
    expect(client.physics.position.y).toBeCloseTo(server.physics.position.y, 4);
    expect(client.velocity.x).toBeCloseTo(server.velocity.x, 4);
  } finally {
    client.physics.dispose();
    server.physics.dispose();
  }
});

it.each(['slide', 'dive', 'jump'] as const)(
  'restores complete %s state and replays unacknowledged inputs',
  (action) => {
    const client = new MovementController(new PhysicsWorld(arenaBoxes, spawn));
    const server = new MovementController(new PhysicsWorld(arenaBoxes, spawn));
    const prediction = new Prediction(client);
    try {
      const inputs: MovementInput[] = Array.from({ length: 85 }, (_, i) => ({
        forward: 1,
        right: 0,
        yaw: 0,
        sprint: true,
        slidePressed: action === 'slide' && i === 65,
        divePressed: action === 'dive' && i === 65,
        jumpPressed: action === 'jump' && i === 65,
      }));
      for (const input of inputs) prediction.step(input, 0);
      for (const input of inputs.slice(0, 70))
        server.step(input, movementConfig.fixedStep);
      const snapshot = server.capture();
      // Simulate local drift while the authoritative update is in flight.
      client.physics.restore(
        { ...client.physics.position, x: 0.4 },
        client.physics.halfHeight,
        client.physics.grounded,
      );
      prediction.reconcile({ ack: 70, snapshot });
      for (const input of inputs.slice(70))
        server.step(input, movementConfig.fixedStep);
      const expected = server.capture();
      const actual = client.capture();
      expect(actual.state).toBe(expected.state);
      expect(actual.halfHeight).toBeCloseTo(expected.halfHeight, 5);
      expect(actual.stateTime).toBeCloseTo(expected.stateTime, 6);
      expect(actual.position.x).toBeCloseTo(expected.position.x, 4);
      expect(actual.position.y).toBeCloseTo(expected.position.y, 4);
      expect(actual.position.z).toBeCloseTo(expected.position.z, 4);
      expect(actual.velocity.z).toBeCloseTo(expected.velocity.z, 4);
      expect(actual.diveCooldown).toBe(expected.diveCooldown);
      expect(actual.slideCooldown).toBe(expected.slideCooldown);
      prediction.reconcile({ ack: 69, snapshot });
      expect(client.physics.position.z).toBeCloseTo(expected.position.z, 4);
    } finally {
      client.physics.dispose();
      server.physics.dispose();
    }
  },
);
