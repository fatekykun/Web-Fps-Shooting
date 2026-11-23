import type { Vector3Like } from '@breakpoint/shared';
import { movementConfig } from '@breakpoint/shared';
import {
  footstepProfiles,
  type Footstep,
  type RemoteFootstep,
} from '@breakpoint/shared/movement/Footsteps';
import type { PublicPlayer } from '@breakpoint/shared/network';
import { FootstepBank } from './FootstepBank';

export function relativeFootstepPosition(
  source: Vector3Like,
  listener: Vector3Like,
  yaw: number,
): Vector3Like {
  const x = source.x - listener.x,
    z = source.z - listener.z;
  return {
    x: x * Math.cos(yaw) - z * Math.sin(yaw),
    y: source.y - listener.y,
    z: x * Math.sin(yaw) + z * Math.cos(yaw),
  };
}
export function footstepAttenuation(distance: number, range: number): number {
  return Math.max(0, 1 - distance / range) ** 1.6;
}

type Cover = (from: Vector3Like, to: Vector3Like) => boolean;
interface SpatialFootstep {
  step: RemoteFootstep;
  listener: Vector3Like;
  yaw: number;
  enabled: boolean;
  ally: boolean;
  cover?: Cover;
}
interface Voice {
  source: AudioBufferSourceNode;
  nodes: AudioNode[];
  mode: Footstep['kind'];
  position?: RemoteFootstep;
  panner?: PannerNode;
  stereo?: StereoPannerNode;
  gain: GainNode;
  volume: number;
}

export class FootstepAudio {
  readonly bank = new FootstepBank();
  private readonly voices = new Set<Voice>();
  private readonly cover = new Map<
    string,
    { until: number; blocked: boolean }
  >();
  get voiceCount(): number {
    return this.voices.size;
  }

  play(
    context: AudioContext,
    output: GainNode,
    step: Footstep,
    volume: number,
    spatial?: SpatialFootstep,
  ): void {
    if (this.voices.size >= 8) return;
    const player = spatial?.step.player;
    if (
      step.kind === 'slide' &&
      [...this.voices].some(
        (voice) => voice.mode === 'slide' && voice.position?.player === player,
      )
    )
      return;
    const profile = footstepProfiles[step.kind];
    const relative =
      spatial &&
      relativeFootstepPosition(step.position, spatial.listener, spatial.yaw);
    const attenuation = relative
      ? footstepAttenuation(
          Math.hypot(relative.x, relative.y, relative.z),
          profile.range,
        )
      : 1;
    if (attenuation < 0.015) return;

    let blocked = false;
    if (spatial?.cover && player) {
      let cached = this.cover.get(player);
      if (!cached || cached.until <= context.currentTime) {
        cached = {
          until: context.currentTime + 0.18,
          blocked: spatial.cover(spatial.listener, step.position),
        };
        this.cover.set(player, cached);
      }
      blocked = cached.blocked;
    }
    const level =
      volume *
      profile.volume *
      step.strength *
      (spatial?.ally ? 0.74 : 1) *
      (blocked ? 0.45 : 1) *
      (0.92 + Math.random() * 0.16);
    const source = context.createBufferSource(),
      gain = context.createGain();
    source.buffer = this.bank.sample(context, step.surface, step.kind);
    source.playbackRate.value = 0.95 + Math.random() * 0.1;
    gain.gain.value = level * attenuation;
    source.connect(gain);
    const nodes: AudioNode[] = [source, gain];
    let tail: AudioNode = gain;
    if (blocked) {
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 920;
      gain.connect(filter);
      tail = filter;
      nodes.push(filter);
    }
    const voice: Voice = {
      source,
      nodes,
      mode: step.kind,
      position: spatial?.step,
      gain,
      volume: level,
    };
    if (spatial?.enabled && relative) {
      if (typeof context.createPanner === 'function') {
        const panner = context.createPanner();
        panner.panningModel = 'HRTF';
        panner.rolloffFactor = 0; // Range is controlled by the movement profile.
        voice.panner = panner;
      } else if (typeof context.createStereoPanner === 'function') {
        voice.stereo = context.createStereoPanner();
      }
      const panner = voice.panner ?? voice.stereo;
      if (panner) {
        tail.connect(panner);
        nodes.push(panner);
        tail = panner;
        this.position(voice, relative);
      }
    }
    tail.connect(output);
    this.voices.add(voice);
    source.onended = () => this.release(voice);
    source.start();
  }

  follow(
    listener: Vector3Like,
    yaw: number,
    players: readonly PublicPlayer[],
    now: number,
  ): void {
    for (const id of this.cover.keys())
      if (!players.some((player) => player.id === id && player.alive))
        this.cover.delete(id);
    for (const voice of this.voices) {
      if (!voice.position) continue;
      const player = players.find(({ id }) => id === voice.position?.player);
      if (!player?.alive || player.life !== voice.position.life) {
        this.stopVoice(voice);
        continue;
      }
      const relative = relativeFootstepPosition(
        {
          x: player.x,
          y:
            player.y -
            movementConfig.capsuleHalfHeight -
            movementConfig.capsuleRadius,
          z: player.z,
        },
        listener,
        yaw,
      );
      const range = footstepProfiles[voice.mode].range;
      voice.gain.gain.setTargetAtTime(
        voice.volume *
          footstepAttenuation(
            Math.hypot(relative.x, relative.y, relative.z),
            range,
          ),
        now,
        0.018,
      );
      this.position(voice, relative);
    }
  }

  private position(voice: Voice, point: Vector3Like): void {
    if (voice.panner) voice.panner.setPosition(point.x, point.y, point.z);
    if (voice.stereo)
      voice.stereo.pan.value =
        point.x / Math.max(0.1, Math.hypot(point.x, point.z));
  }

  stop(): void {
    for (const voice of this.voices) this.stopVoice(voice);
    this.cover.clear();
  }

  releaseOldest(): void {
    for (const voice of this.voices) {
      this.stopVoice(voice);
      break;
    }
  }

  private stopVoice(voice: Voice): void {
    voice.source.onended = null;
    try {
      voice.source.stop();
    } catch {
      /* The source already ended. */
    }
    this.release(voice);
  }

  private release(voice: Voice): void {
    for (const node of voice.nodes) node.disconnect();
    this.voices.delete(voice);
  }
}
