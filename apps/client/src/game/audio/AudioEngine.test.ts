import { afterEach, expect, it, vi } from 'vitest';
import { AudioEngine, spatialAudio } from './AudioEngine';
import { defaultUserSettings } from '../settings/userSettings';
import type { RoomView } from '@breakpoint/shared/network';
import { matchDefaults } from '@breakpoint/shared/match';

function matchView(
  phase: RoomView['phase'],
  countdownSeconds = 0,
  round = 1,
): RoomView {
  return {
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
    for (const seconds of [3, 3, 2, 2, 1, 1])
      audio.observeMatch(matchView('countdown', seconds));
    audio.observeMatch(matchView('playing'));
    audio.observeMatch(matchView('playing'));
    expect(cue.mock.calls.map(([name]) => name)).toEqual([
      'countdown',
      'countdown',
      'countdown',
      'match-start',
    ]);
    expect(audio.voiceCount).toBe(5); // Three short beats and a two-tone start chord.
    audio.observeMatch(null);
    audio.observeMatch(matchView('playing'));
    expect(cue).toHaveBeenCalledTimes(4);
    audio.observeMatch(matchView('countdown', 2, 2));
    audio.observeMatch(matchView('playing', 0, 2));
    expect(cue).toHaveBeenCalledTimes(6);
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
  createBuffer() {
    return { getChannelData: () => new Float32Array(2000) };
  }
  readonly decodedShot = { duration: 1.26 };
  readonly decodedSmg = { duration: 0.064 };
  readonly decodedRifle = { duration: 0.192 };
  readonly decodedShotgun = { duration: 0.736 };
  decodeAudioData = vi.fn(
    async (data: ArrayBuffer) =>
      [
        this.decodedRifle,
        this.decodedShotgun,
        this.decodedSmg,
        this.decodedShot,
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

it('preloads each weapon sample once and plays a separate spatialized voice per shot', async () => {
  vi.stubGlobal('AudioContext', Context);
  const paths = [
    '/audio/ar-01-rifle-shot.wav',
    '/audio/sg-03-shotgun-shot.wav',
    '/audio/sm-02-smg-shot.wav',
    '/audio/sr-04-sniper-shot.wav',
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
  } finally {
    audio.dispose();
  }
});
