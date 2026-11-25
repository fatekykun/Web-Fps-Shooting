import { afterEach, expect, it, vi } from 'vitest';
import { AudioEngine, spatialAudio } from './AudioEngine';
import { defaultUserSettings } from '../settings/userSettings';
import type { PublicPlayer, RoomView } from '@breakpoint/shared/network';
import {
  footstepSurfaces,
  type RemoteFootstep,
} from '@breakpoint/shared/movement/Footsteps';
import { FootstepBank } from './FootstepBank';
import { matchDefaults } from '@breakpoint/shared/match';
import type { CombatSnapshot } from '../combat/PracticeCombat';

function matchView(
  phase: RoomView['phase'],
  countdownSeconds = 0,
  round = 1,
): RoomView {
  return {
    mapId: 'shipment',
    code: 'ABC234',
    selfId: 'a',
    hostId: 'a',
    phase,
    tick: 0,
    players: [],
    match: {
      ...matchDefaults.ffa,
      round,
      countdownSeconds,
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
}

it('plays one beep per server countdown number and one start cue per round without replaying patches or late joins', async () => {
  vi.stubGlobal('AudioContext', Context);
  const audio = new AudioEngine(),
    cue = vi.spyOn(audio, 'cue');
  try {
    await audio.unlock();
    for (const seconds of [5, 5, 4, 4, 3, 3, 2, 2, 1, 1])
      audio.observeMatch(matchView('countdown', seconds));
    audio.observeMatch(matchView('playing'));
    audio.observeMatch(matchView('playing'));
    expect(cue.mock.calls.map(([name]) => name)).toEqual([
      'countdown',
      'countdown',
      'countdown',
      'countdown',
      'countdown',
      'match-start',
    ]);
    expect(audio.voiceCount).toBe(7); // Five short beats and a two-tone start chord.
    audio.observeMatch(null);
    audio.observeMatch(matchView('playing'));
    expect(cue).toHaveBeenCalledTimes(6);
    audio.observeMatch(matchView('countdown', 2, 2));
    audio.observeMatch(matchView('playing', 0, 2));
    expect(cue).toHaveBeenCalledTimes(8);
  } finally {
    audio.dispose();
  }
});

it('honors mute/interface volume and consumes hidden countdown events without a delayed burst', async () => {
  vi.stubGlobal('AudioContext', Context);
  const audio = new AudioEngine();
  try {
    await audio.unlock();
    audio.configure({ ...defaultUserSettings(), interfaceVolume: 0 });
    audio.observeMatch(matchView('countdown', 3));
    expect(audio.voiceCount).toBe(0);
    audio.configure(defaultUserSettings());
    audio.observeMatch(matchView('countdown', 3));
    expect(audio.voiceCount).toBe(0);
    audio.observeMatch(matchView('countdown', 2));
    expect(audio.voiceCount).toBe(1);
    audio.setActive(false);
    audio.observeMatch(matchView('countdown', 1));
    audio.observeMatch(matchView('playing'));
    audio.setActive(true);
    audio.observeMatch(matchView('playing'));
    expect(audio.voiceCount).toBe(0);
    audio.configure({ ...defaultUserSettings(), muted: true });
    audio.observeMatch(matchView('countdown', 3, 2));
    expect(audio.voiceCount).toBe(0);
  } finally {
    audio.dispose();
  }
});

class Node {
  buffer: object | null = null;
  gain = {
    value: 0,
    setTargetAtTime: vi.fn(),
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
  frequency = this.gain;
  pan = { value: 0 };
  detune = { value: 0 };
  playbackRate = { value: 1 };
  setPosition = vi.fn();
  onended: (() => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}
class Context {
  static instances: Context[] = [];
  state = 'suspended';
  currentTime = 0;
  sampleRate = 8000;
  destination = new Node();
  nodes: Node[] = [];
  panners: Node[] = [];
  constructor() {
    Context.instances.push(this);
  }
  createGain() {
    const node = new Node();
    this.nodes.push(node);
    return node;
  }
  createOscillator = this.createGain;
  createBufferSource = this.createGain;
  createBiquadFilter = this.createGain;
  createStereoPanner = this.createGain;
  createPanner() {
    const node = this.createGain();
    this.panners.push(node);
    return node;
  }
  createBuffer() {
    return { getChannelData: () => new Float32Array(2000) };
  }
  readonly decodedShot = { duration: 1.26 };
  readonly decodedSmg = { duration: 0.064 };
  readonly decodedRifle = { duration: 0.192 };
  readonly decodedShotgun = { duration: 0.736 };
  readonly decodedHitmarker = { duration: 0.072 };
  readonly decodedHeadshot = { duration: 0.112 };
  readonly decodedElimination = { duration: 0.164 };
  readonly decodedMoltenLava = { duration: 0.68 };
  readonly decodedMoltenKill = { duration: 1.38 };
  decodeAudioData = vi.fn(
    async (data: ArrayBuffer) =>
      [
        this.decodedRifle,
        this.decodedShotgun,
        this.decodedSmg,
        this.decodedShot,
        this.decodedHitmarker,
        this.decodedHeadshot,
        this.decodedElimination,
        this.decodedMoltenLava,
        this.decodedMoltenKill,
      ][data.byteLength - 1]!,
  );
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  suspend = vi.fn(async () => {
    this.state = 'suspended';
  });
  close = vi.fn(async () => {
    this.state = 'closed';
  });
}
afterEach(() => {
  Context.instances = [];
  vi.unstubAllGlobals();
});

it('prebuilds distinct surface variations without repeating the previous take', () => {
  const context = {
    createBuffer: (_channels: number, frames: number, rate: number) => {
      const data = new Float32Array(frames);
      return { duration: frames / rate, getChannelData: () => data };
    },
  } as unknown as AudioContext;
  const bank = new FootstepBank();
  bank.preload(context);
  const signatures = footstepSurfaces.map((surface) => {
    const a = bank.sample(context, surface, 'walk');
    const b = bank.sample(context, surface, 'walk');
    expect(a).not.toBe(b);
    expect(a.getChannelData(0).some((value) => Math.abs(value) > 0.02)).toBe(
      true,
    );
    return a.getChannelData(0).slice(120, 140).join(',');
  });
  expect(new Set(signatures).size).toBe(footstepSurfaces.length);

  const concrete = bank.sample(context, 'concrete', 'walk').getChannelData(0);
  const peak = (start: number, end: number) =>
    Math.max(...concrete.slice(start, end).map(Math.abs));
  // A low attack peak keeps the bootstep from cracking like a weapon report.
  expect(peak(0, 88)).toBeLessThan(peak(88, 1103) * 0.65);
  expect(peak(0, concrete.length)).toBeLessThan(0.22);

  const drag = bank.sample(context, 'concrete', 'slide');
  const frames = drag.getChannelData(0);
  const energy = (start: number, end: number) => {
    const segment = frames.slice(start, end);
    return (
      segment.reduce((sum, value) => sum + value * value, 0) / segment.length
    );
  };
  expect(drag.duration).toBeCloseTo(0.48);
  expect(energy(440, 2800)).toBeGreaterThan(0.005);
  expect(energy(7500, 10000)).toBeLessThan(energy(440, 2800) * 0.06);
  expect(frames.at(-1)).toBeCloseTo(0, 5);
});

it('places remote footsteps behind and to the side, caches cover and follows moving sources', async () => {
  vi.stubGlobal('AudioContext', Context);
  const audio = new AudioEngine();
  try {
    await audio.unlock();
    const context = Context.instances[0]!;
    const listener = { x: 0, y: 1.6, z: 0 };
    const step: RemoteFootstep = {
      player: 'peer',
      life: 2,
      kind: 'walk',
      position: { x: -2, y: 0, z: 3 },
      surface: 'metal',
      strength: 1,
    };
    const cover = vi.fn(() => true);
    audio.remoteFootstep(step, listener, 0, false, cover);
    audio.remoteFootstep(step, listener, 0, false, cover);
    expect(cover).toHaveBeenCalledOnce();
    expect(context.panners[0]!.setPosition).toHaveBeenCalledWith(-2, -1.6, 3);
    expect(context.nodes.some((node) => node.frequency.value === 920)).toBe(
      true,
    );
    audio.followFootsteps(listener, 0, [
      {
        id: 'peer',
        life: 2,
        alive: true,
        x: 2,
        y: 0.87,
        z: -3,
      } as PublicPlayer,
    ]);
    expect(context.panners[0]!.setPosition).toHaveBeenLastCalledWith(
      2,
      -1.6,
      -3,
    );
    audio.followFootsteps(listener, 0, []);
    expect(audio.voiceCount).toBe(0);

    audio.configure({ ...defaultUserSettings(), spatialFootsteps: false });
    const panners = context.panners.length;
    for (let i = 0; i < 14; i++)
      audio.remoteFootstep(
        { ...step, player: `runner-${i % 7}` },
        listener,
        0,
        false,
        cover,
      );
    expect(context.panners).toHaveLength(panners);
    expect(audio.voiceCount).toBe(8);
    const oldestStep = context.nodes.find(
      (node) => node.buffer && node.onended,
    )!;
    for (let i = 0; i < 9; i++) audio.cue('countdown');
    expect(audio.voiceCount).toBe(16);
    expect(oldestStep.stop).toHaveBeenCalledOnce();
    audio.configure({ ...defaultUserSettings(), footstepVolume: 0 });
    expect(audio.voiceCount).toBe(9);
    audio.configure(defaultUserSettings());
    audio.remoteFootstep(
      { ...step, kind: 'crawl', position: { x: -5, y: 0, z: 0 } },
      listener,
      0,
      false,
      cover,
    );
    expect(audio.voiceCount).toBe(9);
  } finally {
    audio.dispose();
  }
});

it('creates no context before unlock, bounds voices, suppresses muted allocation and releases hidden/disposed audio', async () => {
  vi.stubGlobal('AudioContext', Context);
  const audio = new AudioEngine();
  audio.shot('rifle');
  audio.cue('hit');
  expect(Context.instances).toHaveLength(0);
  expect(await audio.unlock()).toBe(true);
  expect(await audio.unlock()).toBe(true);
  expect(Context.instances).toHaveLength(1);
  const context = Context.instances[0]!;
  for (let i = 0; i < 40; i++) audio.shot('smg');
  expect(audio.voiceCount).toBe(16);
  const nodeCount = context.nodes.length;
  audio.configure({ ...defaultUserSettings(), muted: true });
  audio.shot('shotgun');
  expect(context.nodes).toHaveLength(nodeCount);
  audio.setActive(false);
  expect(audio.voiceCount).toBe(0);
  expect(context.suspend).toHaveBeenCalledOnce();
  expect(await audio.unlock()).toBe(false);
  audio.configure(defaultUserSettings());
  audio.setActive(true);
  expect(context.resume).toHaveBeenCalledTimes(2);
  audio.shot('rifle');
  expect(audio.voiceCount).toBe(2);
  const source = [...context.nodes].reverse().find((node) => node.onended)!;
  source.onended!();
  expect(audio.voiceCount).toBe(1);
  audio.dispose();
  audio.dispose();
  expect(audio.voiceCount).toBe(0);
  expect(context.close).toHaveBeenCalledOnce();
  expect(await audio.unlock()).toBe(false);
});

it('stays usable when browser audio is unavailable or blocked', async () => {
  vi.stubGlobal('AudioContext', undefined);
  const audio = new AudioEngine();
  expect(audio.status).toBe('unavailable');
  expect(await audio.preview()).toBe(false);
  vi.stubGlobal(
    'AudioContext',
    class {
      constructor() {
        throw new Error('blocked');
      }
    },
  );
  expect(await audio.unlock()).toBe(false);
  audio.dispose();
});

it('attenuates distant shots and pans relative to listener yaw', () => {
  const listener = { x: 0, y: 0, z: 0 };
  expect(spatialAudio({ x: 50, y: 0, z: 0 }, listener, 0).gain).toBe(0);
  expect(spatialAudio(listener, listener, 0)).toEqual({ gain: 0.4, pan: 0 });
  expect(spatialAudio({ x: 10, y: 0, z: 0 }, listener, 0).pan).toBe(1);
  expect(spatialAudio({ x: 10, y: 0, z: 0 }, listener, Math.PI).pan).toBe(-1);
});

it('keeps sniper report and confirmation cues bounded and honors effect volume', async () => {
  vi.stubGlobal('AudioContext', Context);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 404 })),
  );
  const audio = new AudioEngine();
  try {
    await audio.unlock();
    audio.shot('sniper');
    expect(audio.voiceCount).toBe(3);
    audio.cue('kill');
    expect(audio.voiceCount).toBe(4);
    audio.configure({ ...defaultUserSettings(), effectsVolume: 0 });
    audio.shot('sniper');
    audio.cue('kill');
    expect(audio.voiceCount).toBe(4);
    audio.configure(defaultUserSettings());
    for (let i = 0; i < 30; i++) audio.shot('sniper');
    expect(audio.voiceCount).toBe(16);
  } finally {
    audio.dispose();
  }
});

it('preloads samples once and plays spatialized shots and local hit confirmations', async () => {
  vi.stubGlobal('AudioContext', Context);
  const paths = [
    '/audio/ar-01-rifle-shot.wav',
    '/audio/sg-03-shotgun-shot.wav',
    '/audio/sm-02-smg-shot.wav',
    '/audio/sr-04-sniper-shot.wav',
    '/audio/breakpoint-hitmarker.wav',
    '/audio/breakpoint-headshot.wav',
    '/audio/breakpoint-elimination.wav',
    '/audio/molten_lava_rifle_shot.wav',
    '/audio/molten_lava_kill_effect.wav',
  ];
  const fetchShot = vi.fn(
    async (path: string) =>
      new Response(new ArrayBuffer(paths.indexOf(path) + 1)),
  );
  vi.stubGlobal('fetch', fetchShot);
  const audio = new AudioEngine();
  try {
    await audio.unlock();
    await audio.unlock();
    const context = Context.instances[0]!;
    await vi.waitFor(() =>
      expect(context.decodeAudioData).toHaveBeenCalledTimes(paths.length),
    );
    expect(fetchShot).toHaveBeenCalledTimes(paths.length);
    for (const path of paths)
      expect(fetchShot).toHaveBeenCalledWith(
        path,
        expect.objectContaining({ cache: 'no-cache' }),
      );
    expect(audio.shot('sniper', 0.4, -0.6)).toBe(true);
    expect(audio.voiceCount).toBe(1);
    expect(
      context.nodes.find((node) => node.buffer === context.decodedShot)?.stop,
    ).toHaveBeenCalledWith(1.26);
    expect(context.nodes.some((node) => node.pan.value === -0.6)).toBe(true);
    audio.shot('smg');
    audio.shot('smg');
    expect(audio.voiceCount).toBe(3);
    const smgShots = context.nodes.filter(
      (node) => node.buffer === context.decodedSmg,
    );
    expect(smgShots).toHaveLength(2);
    for (const shot of smgShots) {
      expect(Math.abs(shot.detune.value)).toBeLessThanOrEqual(12);
      expect(shot.stop.mock.calls[0]?.[0]).toBeLessThan(1 / 15);
    }
    audio.shot('rifle');
    audio.shot('rifle');
    expect(audio.voiceCount).toBe(5);
    const rifleShots = context.nodes.filter(
      (node) => node.buffer === context.decodedRifle,
    );
    expect(rifleShots).toHaveLength(2);
    for (const shot of rifleShots) {
      expect(Math.abs(shot.detune.value)).toBeLessThanOrEqual(10);
      expect(shot.stop.mock.calls[0]?.[0]).toBeCloseTo(0.192, 2);
    }
    audio.shot('shotgun');
    expect(audio.voiceCount).toBe(6);
    expect(
      context.nodes.find((node) => node.buffer === context.decodedShotgun)
        ?.stop,
    ).toHaveBeenCalledWith(0.736);
    const hit: CombatSnapshot = {
      weapon: 'rifle',
      name: 'Rifle',
      magazine: 29,
      reserve: 120,
      reloading: false,
      equipping: false,
      reloadProgress: 0,
      ads: 0,
      fov: 85,
      spread: 0,
      recoilPitch: 0,
      shots: 1,
      hitSequence: 1,
      lastDamage: 25,
      critical: false,
      dummyHealth: 75,
      dummyResetting: false,
    };
    audio.feedback(hit);
    audio.feedback(hit);
    expect(audio.voiceCount).toBe(7);
    const confirmations = () =>
      context.nodes.filter((node) => node.buffer === context.decodedHitmarker);
    expect(confirmations()).toHaveLength(1);
    expect(confirmations()[0]?.stop).toHaveBeenCalledWith(0.072);
    audio.feedback({ ...hit, hitSequence: 2, critical: true });
    const headshots = () =>
      context.nodes.filter((node) => node.buffer === context.decodedHeadshot);
    expect(confirmations()).toHaveLength(1);
    expect(headshots()).toHaveLength(1);
    expect(headshots()[0]?.stop).toHaveBeenCalledWith(0.112);
    audio.feedback({
      ...hit,
      hitSequence: 3,
      critical: true,
      dummyResetting: true,
    });
    expect(headshots()).toHaveLength(2);
    const downedTarget = { ...hit, hitSequence: 4, dummyResetting: true };
    audio.feedback(downedTarget);
    audio.feedback(downedTarget);
    const eliminations = context.nodes.filter(
      (node) => node.buffer === context.decodedElimination,
    );
    expect(eliminations).toHaveLength(1);
    expect(eliminations[0]?.stop).toHaveBeenCalledWith(0.164);
    audio.configure({ ...defaultUserSettings(), effectsVolume: 0 });
    audio.feedback({ ...hit, hitSequence: 5 });
    expect(confirmations()).toHaveLength(1);
    audio.configure(defaultUserSettings());
    const moltenElimination = {
      ...hit,
      rifleSkin: 'cinder-wyrm' as const,
      hitSequence: 6,
      critical: true,
      dummyResetting: true,
    };
    audio.feedback(moltenElimination);
    audio.feedback(moltenElimination);
    const moltenKills = context.nodes.filter(
      (node) => node.buffer === context.decodedMoltenKill,
    );
    expect(moltenKills).toHaveLength(1);
    expect(moltenKills[0]?.stop).toHaveBeenCalledWith(1.38);
    expect(headshots()).toHaveLength(2);
    audio.shot('rifle', 1, 0, 'cinder-wyrm');
    audio.shot('rifle', 0.4, -0.6);
    audio.shot('smg', 1, 0, 'cinder-wyrm');
    const mythicShots = context.nodes.filter(
      (node) => node.buffer === context.decodedMoltenLava,
    );
    expect(mythicShots).toHaveLength(1);
    expect(mythicShots[0]?.stop).toHaveBeenCalledWith(0.68);
    expect(
      context.nodes.filter((node) => node.buffer === context.decodedRifle),
    ).toHaveLength(3);
    expect(
      context.nodes.filter((node) => node.buffer === context.decodedSmg),
    ).toHaveLength(3);
  } finally {
    audio.dispose();
  }
});
