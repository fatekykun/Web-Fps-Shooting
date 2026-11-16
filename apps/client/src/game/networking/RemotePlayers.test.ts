import { expect, it } from 'vitest';
import { InstancedMesh, Scene } from 'three';
import { matchDefaults } from '@breakpoint/shared/match';
import type { PublicPlayer, RoomView } from '@breakpoint/shared/network';
import { RemotePlayers } from './RemotePlayers';
import { RemoteInterpolation } from './RemoteInterpolation';

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
    expect(mesh.count).toBe(56);
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
    remotes.update(undefined, 900);
    expect(remotes.playerCount).toBe(0);
  } finally {
    remotes.dispose();
  }
  expect(scene.children).toHaveLength(0);
});
