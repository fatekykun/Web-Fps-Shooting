import { expect, it } from 'vitest';
import { InstancedMesh, Scene, Matrix4, Vector3 } from 'three';
import { matchDefaults } from '@breakpoint/shared/match';
import type { PublicPlayer, RoomView } from '@breakpoint/shared/network';
import { RemotePlayers } from './RemotePlayers';
import { RemoteInterpolation } from './RemoteInterpolation';
import { intersectAvatar } from '@breakpoint/shared/avatar';
import { characterParts } from '@breakpoint/shared/character';

it('keeps eight avatars in one pool and only uploads colors when their appearance changes', () => {
  const scene = new Scene();
  const remotes = new RemotePlayers(scene);
  const history = new RemoteInterpolation();
  const peers: PublicPlayer[] = Array.from({ length: 8 }, (_, index) => ({
    id: String(index),
    name: `Peer ${index}`,
    slot: index,
    ready: true,
    x: index * 2,
    y: 1,
    z: 0,
    yaw: 0,
    pitch: 0,
    halfHeight: 0.55,
    movement: 'walking',
    ack: 0,
    health: 100,
    alive: true,
    life: 1,
    weapon: 'rifle',
    protected: false,
    team: 'blue',
  }));
  const view: RoomView = {
    code: 'ABC234',
    selfId: 'self',
    hostId: 'self',
    phase: 'playing',
    tick: 10,
    players: peers,
    match: {
      ...matchDefaults.tdm,
      round: 1,
      remainingSeconds: 300,
      blueScore: 0,
      orangeScore: 0,
      winnerId: '',
      winnerName: '',
      winningTeam: 'none',
      endReason: '',
      scores: [],
    },
  };
  try {
    history.push(view, 100);
    remotes.update(history, 100);
    expect(remotes.playerCount).toBe(8);
    expect(scene.children).toHaveLength(1);
    const mesh = scene.children[0] as InstancedMesh;
    expect(mesh.count).toBe(8 * characterParts.length);
    const version = mesh.instanceColor!.version;
    for (let frame = 0; frame < 30; frame++)
      remotes.update(history, 110 + frame * 16);
    expect(mesh.instanceColor!.version).toBe(version);
    history.push(
      {
        ...view,
        tick: 11,
        players: peers.map((peer) => ({
          ...peer,
          team: 'orange',
          protected: true,
        })),
      },
      600,
    );
    remotes.update(history, 800);
    expect(mesh.instanceColor!.version).toBe(version + 1);
    const animated = {
      ...peers[0]!,
      x: 3,
      y: 3,
      z: -4,
      yaw: 1.1,
      pitch: 0.4,
      halfHeight: 0.2,
      gaitPhase: 1.2,
      gaitAmount: 0.8,
    };
    history.push({ ...view, tick: 12, players: [animated] }, 900);
    remotes.update(history, 1200);
    const matrix = new Matrix4();
    for (let index = 0; index < characterParts.length; index++) {
      if (!characterParts[index]!.region) continue;
      mesh.getMatrixAt(index, matrix);
      const visible = [
        [0, 0, -1],
        [0, 0, 1],
        [-1, 0, 0],
        [1, 0, 0],
        [0, -1, 0],
        [0, 1, 0],
      ].some((axis) => {
        const direction = new Vector3(
          ...(axis as [number, number, number]),
        ).transformDirection(matrix);
        // A grip can be partly occluded by a forearm or vest; sample the
        // exposed surface as well as its center instead of requiring a clear
        // line to the center from one of only six directions.
        return [-0.35, 0, 0.35].some((u) =>
          [-0.35, 0, 0.35].some((v) => {
            const offset = axis[0]
              ? new Vector3(0, u, v)
              : axis[1]
                ? new Vector3(u, 0, v)
                : new Vector3(u, v, 0);
            const point = offset.applyMatrix4(matrix);
            const origin = point.addScaledVector(direction, -0.5);
            return (
              intersectAvatar(origin, direction, animated, 0.6)?.region ===
              characterParts[index]!.region
            );
          }),
        );
      });
      expect(visible, characterParts[index]!.name).toBe(true);
    }
    remotes.update(undefined, 900);
    expect(remotes.playerCount).toBe(0);
  } finally {
    remotes.dispose();
  }
  expect(scene.children).toHaveLength(0);
});
