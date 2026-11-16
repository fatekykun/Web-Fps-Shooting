import { afterEach, expect, it, vi } from 'vitest';
import { AudioEngine, spatialAudio } from './AudioEngine';
import { defaultUserSettings } from '../settings/userSettings';

class Node {
  gain = {
    value: 0,
    setTargetAtTime: vi.fn(),
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
  frequency = this.gain;
  pan = { value: 0 };
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
