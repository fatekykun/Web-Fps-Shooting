import type { Vector3Like, WeaponId } from '@breakpoint/shared';
import type { WeaponController } from '../weapons/WeaponController';
import { isMoltenLavaRifle, type RifleSkin } from '../weapons/RifleSkins';
import type { SniperSkin } from '../weapons/SniperSkins';
import type { ShotgunSkin } from '../weapons/ShotgunSkins';
import type { SmgSkin } from '../weapons/SmgSkins';
import type { EliminationEffect } from '@breakpoint/shared/combat';
import type { MovementController } from '../movement/MovementController';
import type { CombatSnapshot } from '../combat/PracticeCombat';
import type { PublicPlayer, RoomView } from '@breakpoint/shared/network';
import {
  FootstepTracker,
  type RemoteFootstep,
} from '@breakpoint/shared/movement/Footsteps';
import { matchCountdownSeconds } from '@breakpoint/shared/match';
import { FootstepAudio } from './FootstepAudio';
import {
  defaultUserSettings,
  type UserSettings,
} from '../settings/userSettings';

export function spatialAudio(
  origin: Vector3Like,
  listener: Vector3Like,
  yaw: number,
) {
  const x = origin.x - listener.x,
    z = origin.z - listener.z;
  const distance = Math.hypot(x, origin.y - listener.y, z);
  return {
    gain: Math.max(0, 1 - distance / 40) ** 2 * 0.4,
    pan:
      distance < 0.1
        ? 0
        : Math.max(
            -1,
            Math.min(1, (x * Math.cos(yaw) - z * Math.sin(yaw)) / distance),
          ),
  };
}
type Cue =
  | 'ui'
  | 'enter'
  | 'hit'
  | 'critical'
  | 'kill'
  | 'molten-lava-kill'
  | 'hurt'
  | 'death'
  | 'respawn'
  | 'reload'
  | 'equip'
  | 'jump';
type MatchCue = 'countdown' | 'match-start';
type EquippedSkin = RifleSkin | SniperSkin | ShotgunSkin | SmgSkin;
const shotBySkin = {
  'cinder-wyrm': { weapon: 'rifle', sample: 'molten-lava-shot' },
  'memento-mori': { weapon: 'rifle', sample: 'memento-mori-shot' },
  'lotus-lava': { weapon: 'sniper', sample: 'lotus-lava-shot' },
  'glorious-blaze': { weapon: 'shotgun', sample: 'glorious-blaze-shot' },
  'neon-blade': { weapon: 'smg', sample: 'neon-blade-shot' },
} as const satisfies Record<
  Exclude<EquippedSkin, 'standard'>,
  { weapon: WeaponId; sample: string }
>;
type CustomGunSkin = keyof typeof shotBySkin;
const reloadFiles: Record<CustomGunSkin, string> = {
  'cinder-wyrm': 'molten_lava_reload.wav',
  'memento-mori': 'memento_mori_reload.wav',
  'lotus-lava': 'lotus_lava_reload.wav',
  'glorious-blaze': 'glorious_blaze_shell_reload.wav',
  'neon-blade': 'neon_legend_reload.wav',
};
const moltenLavaKill = 'molten-lava-kill';
type ShotSampleId =
  | Exclude<WeaponId, 'melee'>
  | (typeof shotBySkin)[keyof typeof shotBySkin]['sample'];
type SampleId =
  | ShotSampleId
  | `reload-${CustomGunSkin}`
  | 'hitmarker'
  | 'headshot'
  | 'elimination'
  | typeof moltenLavaKill
  | EliminationEffect;
const shotSamples: Record<
  ShotSampleId,
  { file: string; gain: number; detune: number }
> = {
  rifle: { file: 'ar-01-rifle-shot.wav', gain: 0.51, detune: 10 },
  'molten-lava-shot': {
    file: 'molten_lava_rifle_shot.wav',
    gain: 0.51,
    detune: 0,
  },
  'memento-mori-shot': {
    file: 'memento_mori_reference_shot.wav',
    gain: 0.51,
    detune: 0,
  },
  'lotus-lava-shot': { file: 'lotus_lava_gunshot.wav', gain: 0.51, detune: 0 },
  'glorious-blaze-shot': {
    file: 'Glorious_Blaze_Shot_V2.wav',
    gain: 0.65,
    detune: 0,
  },
  'neon-blade-shot': { file: 'neon_legend_shot.wav', gain: 0.39, detune: 0 },
  shotgun: { file: 'sg-03-shotgun-shot.wav', gain: 0.69, detune: 0 },
  sniper: { file: 'sr-04-sniper-shot.wav', gain: 0.72, detune: 0 },
  smg: { file: 'sm-02-smg-shot.wav', gain: 0.36, detune: 12 },
};

interface Voice {
  source: AudioScheduledSourceNode;
  nodes: AudioNode[];
}

/** Gesture-unlocked audio with one context and bounded transient voices. */
export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private effects: GainNode | null = null;
  private ui: GainNode | null = null;
  private ambience: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private readonly sampleBuffers = new Map<SampleId, AudioBuffer>();
  private readonly sampleRequests = new AbortController();
  private readonly ambientSources: OscillatorNode[] = [];
  private readonly voices = new Set<Voice>();
  private readonly footsteps = new FootstepAudio();
  private readonly footstepTracker = new FootstepTracker();
  private settings = defaultUserSettings();
  private active = true;
  private disposed = false;
  private lastUi = -100;
  private lastShots = 0;
  private lastWeapon: WeaponId = 'rifle';
  private reload?: {
    controller: WeaponController;
    skin: EquippedSkin;
    magazine: number;
    voice?: Voice;
  };
  private lastBoltPhase = 0;
  private sampledBolt = false;
  private lastScoped = false;
  private lastState = '';
  private grounded: boolean | null = null;
  private hit = 0;
  private damage = 0;
  private life = 0;
  private wasDead = false;
  private countdownMatch = '';
  private lastCountdown = matchCountdownSeconds + 1;
  private sawCountdown = false;
  private matchStarted = false;
  get status(): string {
    return (
      this.context?.state ??
      (typeof AudioContext === 'undefined' ? 'unavailable' : 'locked')
    );
  }
  get voiceCount(): number {
    return this.voices.size + this.footsteps.voiceCount;
  }

  configure(settings: UserSettings): void {
    if (
      settings.footstepVolume === 0 ||
      settings.spatialFootsteps !== this.settings.spatialFootsteps ||
      settings.footstepOcclusion !== this.settings.footstepOcclusion
    )
      this.footsteps.stop();
    this.settings = settings;
    this.applyVolumes();
  }
  async unlock(): Promise<boolean> {
    if (
      this.disposed ||
      !this.active ||
      this.settings.muted ||
      typeof AudioContext === 'undefined'
    )
      return false;
    try {
      if (!this.context) {
        const context = new AudioContext({ latencyHint: 'interactive' });
        this.context = context;
        this.master = context.createGain();
        this.master.connect(context.destination);
        this.effects = context.createGain();
        this.effects.connect(this.master);
        this.ui = context.createGain();
        this.ui.connect(this.master);
        this.ambience = context.createGain();
        this.ambience.connect(this.master);
        this.noiseBuffer = context.createBuffer(
          1,
          Math.ceil(context.sampleRate * 0.25),
          context.sampleRate,
        );
        const samples = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++)
          samples[i] = Math.random() * 2 - 1;
        for (const frequency of [58, 87]) {
          const oscillator = context.createOscillator(),
            gain = context.createGain();
          oscillator.type = 'sine';
          oscillator.frequency.value = frequency;
          gain.gain.value = 0.012;
          oscillator.connect(gain);
          gain.connect(this.ambience);
          oscillator.start();
          this.ambientSources.push(oscillator);
        }
        this.applyVolumes();
        this.footsteps.bank.preload(context);
        for (const id of Object.keys(shotSamples) as ShotSampleId[])
          void this.loadSample(context, id, shotSamples[id].file);
        for (const skin of Object.keys(reloadFiles) as CustomGunSkin[])
          void this.loadSample(context, `reload-${skin}`, reloadFiles[skin]);
        void this.loadSample(context, 'hitmarker', 'breakpoint-hitmarker.wav');
        void this.loadSample(context, 'headshot', 'breakpoint-headshot.wav');
        void this.loadSample(
          context,
          'elimination',
          'breakpoint-elimination.wav',
        );
        void this.loadSample(
          context,
          moltenLavaKill,
          'molten_lava_kill_effect.wav',
        );
        void this.loadSample(
          context,
          'soul-requiem',
          'memento_mori_reference_kill.wav',
        );
        void this.loadSample(context, 'lotus-lava', 'lotus_lava_kill.wav');
        void this.loadSample(context, 'neon-blade', 'neon_legend_kill.wav');
        void this.loadSample(
          context,
          'glorious-blaze',
          'Glorious_Blaze_Kill_V4_Isolated.wav',
        );
      }
      if (this.context.state === 'suspended') await this.context.resume();
      return this.context.state === 'running';
    } catch {
      return false;
    }
  }
  private async loadSample(
    context: AudioContext,
    id: SampleId,
    file: string,
  ): Promise<void> {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}audio/${file}`, {
        cache: 'no-cache',
        priority: 'low',
        signal: this.sampleRequests.signal,
      });
      if (!response.ok || this.disposed) return;
      const data = await response.arrayBuffer();
      if (this.disposed) return;
      const buffer = await context.decodeAudioData(data);
      if (!this.disposed) this.sampleBuffers.set(id, buffer);
    } catch {
      // A missing or unsupported asset leaves the procedural cue available.
    }
  }
  async uiClick(): Promise<void> {
    if (await this.unlock()) this.cue('ui');
  }
  async preview(): Promise<boolean> {
    if (!(await this.unlock())) return false;
    this.cue('enter');
    return true;
  }
  setActive(active: boolean): void {
    this.active = active;
    if (!active) {
      this.stopVoices();
      void this.context?.suspend().catch(() => {});
    } else if (this.context && !this.settings.muted)
      void this.context.resume().catch(() => {});
    this.resetMotion();
  }
  private applyVolumes(): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    this.master?.gain.setTargetAtTime(
      this.settings.muted ? 0 : this.settings.masterVolume,
      now,
      0.02,
    );
    this.effects?.gain.setTargetAtTime(this.settings.effectsVolume, now, 0.02);
    this.ui?.gain.setTargetAtTime(this.settings.interfaceVolume, now, 0.02);
    this.ambience?.gain.setTargetAtTime(this.settings.ambientVolume, now, 0.05);
  }
  private output(ui = false, footstep = false): GainNode | null {
    if (
      !this.active ||
      this.disposed ||
      this.context?.state !== 'running' ||
      this.settings.muted ||
      this.settings.masterVolume === 0 ||
      this.voices.size >= 16 ||
      (footstep && this.voiceCount >= 16)
    )
      return null;
    const output = ui
      ? this.settings.interfaceVolume > 0
        ? this.ui
        : null
      : this.settings.effectsVolume > 0
        ? this.effects
        : null;
    if (output && this.voiceCount >= 16) this.footsteps.releaseOldest();
    return output;
  }

  remoteFootstep(
    step: RemoteFootstep,
    listener: Vector3Like,
    yaw: number,
    ally: boolean,
    occluded: (from: Vector3Like, to: Vector3Like) => boolean,
  ): void {
    const output = this.output(false, true);
    if (!output || this.settings.footstepVolume === 0) return;
    this.footsteps.play(
      this.context!,
      output,
      step,
      this.settings.footstepVolume,
      {
        step,
        listener,
        yaw,
        ally,
        enabled: this.settings.spatialFootsteps,
        cover: this.settings.footstepOcclusion ? occluded : undefined,
      },
    );
  }

  followFootsteps(
    listener: Vector3Like,
    yaw: number,
    players: readonly PublicPlayer[],
  ): void {
    if (this.context?.state === 'running')
      this.footsteps.follow(listener, yaw, players, this.context.currentTime);
  }
  private connect(
    source: OscillatorNode | AudioBufferSourceNode,
    gain: GainNode,
    nodes: AudioNode[],
    output: GainNode,
    pan: number,
    duration: number,
    offset?: number,
  ): Voice {
    const context = this.context!;
    if (typeof context.createStereoPanner === 'function') {
      const panner = context.createStereoPanner();
      panner.pan.value = pan;
      gain.connect(panner);
      panner.connect(output);
      nodes.push(panner);
    } else gain.connect(output);
    const voice = { source, nodes: [source, gain, ...nodes] };
    this.voices.add(voice);
    source.onended = () => {
      for (const node of voice.nodes) node.disconnect();
      this.voices.delete(voice);
    };
    if (offset !== undefined && 'buffer' in source) source.start(0, offset);
    else source.start();
    source.stop(context.currentTime + duration);
    return voice;
  }
  private tone(
    frequency: number,
    end: number,
    duration: number,
    volume: number,
    type: OscillatorType = 'triangle',
    pan = 0,
    ui = false,
  ): void {
    const output = this.output(ui);
    if (!output || volume <= 0) return;
    const context = this.context!,
      source = context.createOscillator(),
      gain = context.createGain(),
      now = context.currentTime;
    source.type = type;
    source.frequency.setValueAtTime(frequency, now);
    source.frequency.exponentialRampToValueAtTime(end, now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(gain);
    this.connect(source, gain, [], output, pan, duration);
  }
  private noise(
    duration: number,
    volume: number,
    cutoff: number,
    pan = 0,
  ): void {
    const output = this.output();
    if (!output || !this.noiseBuffer || volume <= 0) return;
    const context = this.context!,
      source = context.createBufferSource(),
      gain = context.createGain(),
      filter = context.createBiquadFilter(),
      now = context.currentTime;
    source.buffer = this.noiseBuffer;
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    this.connect(source, gain, [filter], output, pan, duration);
  }
  private playSample(
    buffer: AudioBuffer,
    gain: number,
    pan = 0,
    detune = 0,
    reload?: { duration: number; progress: number },
  ): Voice | undefined {
    const output = this.output();
    if (!output || gain <= 0) return;
    const context = this.context!;
    const source = context.createBufferSource();
    const volume = context.createGain();
    source.buffer = buffer;
    if (detune) source.detune.value = detune;
    if (reload) source.playbackRate.value = buffer.duration / reload.duration;
    volume.gain.value = gain;
    source.connect(volume);
    const duration = reload
      ? reload.duration * (1 - reload.progress)
      : buffer.duration / 2 ** (detune / 1200);
    const offset = reload ? buffer.duration * reload.progress : undefined;
    return this.connect(source, volume, [], output, pan, duration, offset);
  }
  /** True when a recorded sniper report plays with the bolt cycle included. */
  shot(weapon: WeaponId, gain = 1, pan = 0, skin?: EquippedSkin): boolean {
    if (weapon === 'melee') {
      this.noise(0.145, 0.13 * gain, 1750, pan);
      return false;
    }
    const custom = skin && skin !== 'standard' ? shotBySkin[skin] : undefined;
    const requested = custom?.weapon === weapon ? custom.sample : weapon;
    const id = this.sampleBuffers.has(requested) ? requested : weapon;
    const sample = shotSamples[id];
    const buffer = this.sampleBuffers.get(id);
    if (buffer) {
      // A small pitch variation keeps automatic fire from sounding like a loop.
      const detune = sample.detune
        ? (Math.random() * 2 - 1) * sample.detune
        : 0;
      return (
        !!this.playSample(buffer, sample.gain * gain, pan, detune) &&
        id === 'sniper'
      );
    }
    if (weapon === 'sniper') {
      this.noise(0.24, 0.28 * gain, 2300, pan);
      this.tone(95, 24, 0.24, 0.24 * gain, 'triangle', pan);
      this.tone(850, 180, 0.06, 0.07 * gain, 'square', pan);
    } else if (weapon === 'shotgun') {
      this.noise(0.2, 0.23 * gain, 1500, pan);
      this.tone(72, 28, 0.2, 0.2 * gain, 'triangle', pan);
    } else if (weapon === 'smg') {
      this.noise(0.07, 0.12 * gain, 2800, pan);
      this.tone(150, 65, 0.065, 0.12 * gain, 'square', pan);
    } else {
      this.noise(0.11, 0.17 * gain, 2100, pan);
      this.tone(110, 38, 0.12, 0.17 * gain, 'triangle', pan);
    }
    return false;
  }

  /** Read the same clock as the custom recording, starting at its scheduled onset. */
  playMythicElimination(
    effect: EliminationEffect,
    gain = 1,
    pan = 0,
  ): (() => number) | undefined {
    const context = this.context;
    const buffer = this.sampleBuffers.get(effect);
    if (!context || !buffer) return undefined;
    const start = context.currentTime;
    if (!this.playSample(buffer, gain * 0.49, pan)) return undefined;
    return () => context.currentTime - start;
  }
  playRemoteMoltenElimination(gain: number, pan: number): void {
    const sample = this.sampleBuffers.get(moltenLavaKill);
    if (sample) this.playSample(sample, gain * 0.48, pan);
  }

  cue(cue: Cue | MatchCue): void {
    if (cue === 'countdown') {
      this.tone(880, 880, 0.11, 0.085, 'sine', 0, true);
      return;
    }
    if (cue === 'match-start') {
      this.tone(440, 880, 0.32, 0.09, 'triangle', 0, true);
      this.tone(660, 1320, 0.28, 0.055, 'sine', 0, true);
      return;
    }
    if (cue === 'ui') {
      const now = this.context?.currentTime ?? 0;
      if (now - this.lastUi < 0.06) return;
      this.lastUi = now;
      this.tone(620, 400, 0.045, 0.045, 'square', 0, true);
    } else if (cue === 'enter' || cue === 'respawn')
      this.tone(340, 850, 0.18, 0.07, 'triangle', 0, cue === 'enter');
    else if (cue === 'hit' || cue === 'critical') {
      const hitmarker = this.sampleBuffers.get('hitmarker');
      const critical = cue === 'critical';
      const headshot = critical
        ? this.sampleBuffers.get('headshot')
        : undefined;
      if (headshot) this.playSample(headshot, 0.39);
      else if (hitmarker)
        this.playSample(
          hitmarker,
          critical ? 0.36 : 0.33,
          0,
          critical ? 210 : 0,
        );
      else this.tone(critical ? 1600 : 1050, 1900, 0.07, 0.075, 'sine');
    } else if (cue === 'kill' || cue === moltenLavaKill) {
      const molten =
        cue === moltenLavaKill
          ? this.sampleBuffers.get(moltenLavaKill)
          : undefined;
      const elimination = this.sampleBuffers.get('elimination');
      if (molten) this.playSample(molten, 0.48);
      else if (elimination) this.playSample(elimination, 0.38);
      else this.tone(750, 1500, 0.16, 0.085, 'triangle');
    } else if (cue === 'death') this.tone(130, 30, 0.45, 0.13);
    else if (cue === 'hurt') this.tone(110, 45, 0.15, 0.12);
    else if (cue === 'reload' || cue === 'equip') {
      this.noise(0.08, 0.065, 2800);
      this.tone(430, 180, 0.08, 0.04, 'square');
    } else if (cue === 'jump') this.tone(140, 240, 0.09, 0.04);
  }
  private observeReload(
    weapons: WeaponController,
    active: boolean,
    skin: EquippedSkin,
    fired: boolean,
  ): void {
    const weapon = weapons.selected;
    if (!active || !weapons.reloading || weapon === 'melee') {
      this.stopReload();
      return;
    }
    if (
      this.reload?.controller === weapons &&
      this.reload.skin === skin &&
      this.lastWeapon === weapon &&
      !fired &&
      !(
        weapons.config.reloadPerShell &&
        weapons.current.magazine > this.reload.magazine
      )
    )
      return;
    this.stopReload();

    const buffer =
      skin !== 'standard' && shotBySkin[skin].weapon === weapon
        ? this.sampleBuffers.get(`reload-${skin}`)
        : undefined;
    const progress = Math.max(0, weapons.reloadProgress);
    let voice: Voice | undefined;
    if (buffer && progress < 1)
      voice = this.playSample(buffer, 0.38, 0, 0, {
        duration: weapons.config.reloadTime,
        progress,
      });
    else if (!buffer) {
      this.cue('reload');
      if (weapons.config.scopeMagnification)
        this.tone(180, 70, 0.16, 0.055, 'triangle');
    }
    this.reload = {
      controller: weapons,
      skin,
      magazine: weapons.current.magazine,
      voice,
    };
  }

  observe(
    dt: number,
    weapons: WeaponController,
    movement: MovementController,
    active: boolean,
    priorVerticalSpeed = 0,
    skin: EquippedSkin = 'standard',
    reloadSkin: EquippedSkin = skin,
  ): void {
    const boltPhase = weapons.cycling
      ? weapons.cycleProgress < 0.15
        ? 0
        : weapons.cycleProgress < 0.65
          ? 1
          : 2
      : 0;
    const scoped = !!weapons.config.scopeMagnification && weapons.ads > 0.5;
    const fired = weapons.shotsFired > this.lastShots;
    if (active) {
      if (fired) this.sampledBolt = this.shot(weapons.selected, 1, 0, skin);
      if (
        !this.sampledBolt &&
        boltPhase !== this.lastBoltPhase &&
        boltPhase > 0
      ) {
        this.noise(0.09, 0.08, 3600);
        this.tone(boltPhase === 1 ? 640 : 350, 150, 0.07, 0.05, 'square');
      }
      if (scoped !== this.lastScoped)
        this.tone(scoped ? 330 : 480, scoped ? 600 : 220, 0.09, 0.025);
      if (weapons.selected !== this.lastWeapon) this.cue('equip');
      if (movement.state !== this.lastState) {
        if (
          movement.state === 'airborne' &&
          this.grounded &&
          movement.velocity.y > 0
        )
          this.cue('jump');
      }
      const output = this.output(false, true);
      if (output && this.settings.footstepVolume > 0) {
        const step = this.footstepTracker.step(
          movement,
          dt,
          priorVerticalSpeed,
        );
        if (step)
          this.footsteps.play(
            this.context!,
            output,
            step,
            this.settings.footstepVolume * 0.68,
          );
      } else this.footstepTracker.reset();
    } else this.footstepTracker.reset();
    this.observeReload(weapons, active, reloadSkin, fired);
    this.lastShots = weapons.shotsFired;
    if (!weapons.cycling) this.sampledBolt = false;
    this.lastBoltPhase = boltPhase;
    this.lastScoped = scoped;
    this.lastWeapon = weapons.selected;
    this.lastState = movement.state;
    this.grounded = movement.physics.grounded;
  }
  feedback(snapshot: CombatSnapshot): void {
    const newLife = snapshot.player && snapshot.player.life !== this.life;
    if (!newLife) {
      const customDummyElimination =
        snapshot.dummyResetting &&
        ((snapshot.weapon === 'rifle' &&
          snapshot.rifleSkin === 'memento-mori' &&
          snapshot.rifleSkinStatus === 'ready') ||
          (snapshot.weapon === 'sniper' &&
            snapshot.sniperSkin === 'lotus-lava' &&
            snapshot.sniperSkinStatus === 'ready') ||
          (snapshot.weapon === 'shotgun' &&
            snapshot.shotgunSkin === 'glorious-blaze' &&
            snapshot.shotgunSkinStatus === 'ready') ||
          (snapshot.weapon === 'smg' &&
            snapshot.smgSkin === 'neon-blade' &&
            snapshot.smgSkinStatus === 'ready'));
      if (snapshot.hitSequence > this.hit && !customDummyElimination)
        this.cue(
          snapshot.dummyResetting &&
            isMoltenLavaRifle(snapshot.weapon, snapshot.rifleSkin)
            ? moltenLavaKill
            : snapshot.critical
              ? 'critical'
              : snapshot.dummyResetting
                ? 'kill'
                : 'hit',
        );
      if (snapshot.player && snapshot.player.damageSequence > this.damage)
        this.cue(snapshot.player.alive ? 'hurt' : 'death');
    } else if (this.wasDead) this.cue('respawn');
    this.hit = snapshot.hitSequence;
    this.damage = snapshot.player?.damageSequence ?? 0;
    this.life = snapshot.player?.life ?? 0;
    this.wasDead = snapshot.player?.alive === false;
  }
  resetFeedback(snapshot: CombatSnapshot): void {
    this.hit = snapshot.hitSequence;
    this.damage = snapshot.player?.damageSequence ?? 0;
    this.life = snapshot.player?.life ?? 0;
    this.wasDead = snapshot.player?.alive === false;
  }

  /** State patches trigger each beat once; late joiners and hidden tabs never replay missed cues. */
  observeMatch(view: RoomView | null): void {
    if (!view || (view.phase !== 'countdown' && view.phase !== 'playing')) {
      this.countdownMatch = '';
      return;
    }
    const key = `${view.code}:${view.match.round}`;
    if (key !== this.countdownMatch) {
      this.countdownMatch = key;
      this.lastCountdown = matchCountdownSeconds + 1;
      this.sawCountdown = this.matchStarted = false;
    }
    if (view.phase === 'countdown') {
      this.sawCountdown = true;
      const remaining = view.match.countdownSeconds ?? matchCountdownSeconds;
      if (remaining >= 1 && remaining < this.lastCountdown) {
        this.lastCountdown = remaining;
        this.cue('countdown');
      }
    } else if (this.sawCountdown && !this.matchStarted) {
      this.matchStarted = true;
      this.cue('match-start');
    }
  }
  resetMotion(): void {
    this.stopReload();
    this.footstepTracker.reset();
    this.footsteps.stop();
    this.grounded = null;
    this.lastState = '';
  }
  private stopReload(): void {
    const voice = this.reload?.voice;
    if (voice) this.stopVoice(voice);
    this.reload = undefined;
  }
  private stopVoice(voice: Voice): void {
    if (!this.voices.delete(voice)) return;
    voice.source.onended = null;
    try {
      voice.source.stop();
    } catch {
      /* Already ended. */
    }
    for (const node of voice.nodes) node.disconnect();
  }
  private stopVoices(): void {
    for (const voice of this.voices) this.stopVoice(voice);
  }
  dispose(): void {
    this.disposed = true;
    this.sampleRequests.abort();
    this.sampleBuffers.clear();
    this.footsteps.stop();
    this.footsteps.bank.clear();
    this.stopReload();
    this.stopVoices();
    for (const source of this.ambientSources) {
      source.stop();
      source.disconnect();
    }
    this.ambientSources.length = 0;
    void this.context?.close().catch(() => {});
    this.context = null;
  }
}
