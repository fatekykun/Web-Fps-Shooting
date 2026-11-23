import {
  weaponOrder,
  type Vector3Like,
  type WeaponId,
} from '@breakpoint/shared';
import type { WeaponController } from '../weapons/WeaponController';
import type { MovementController } from '../movement/MovementController';
import type { CombatSnapshot } from '../combat/PracticeCombat';
import type { RoomView } from '@breakpoint/shared/network';
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
  | 'hurt'
  | 'death'
  | 'respawn'
  | 'reload'
  | 'equip'
  | 'jump'
  | 'land'
  | 'slide'
  | 'dive'
  | 'step';
type MatchCue = 'countdown' | 'match-start';
const shotSamples: Partial<
  Record<WeaponId, { file: string; gain: number; detune: number }>
> = {
  rifle: { file: 'ar-01-rifle-shot.wav', gain: 0.51, detune: 10 },
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
  private readonly shotBuffers = new Map<WeaponId, AudioBuffer>();
  private readonly shotRequests = new AbortController();
  private readonly ambientSources: OscillatorNode[] = [];
  private readonly voices = new Set<Voice>();
  private settings = defaultUserSettings();
  private active = true;
  private disposed = false;
  private lastUi = -100;
  private lastShots = 0;
  private lastWeapon: WeaponId = 'rifle';
  private lastReload = false;
  private lastBoltPhase = 0;
  private sampledBolt = false;
  private lastScoped = false;
  private lastState = '';
  private grounded: boolean | null = null;
  private distance = 0;
  private hit = 0;
  private damage = 0;
  private life = 0;
  private countdownMatch = '';
  private lastCountdown = 4;
  private sawCountdown = false;
  private matchStarted = false;
  get status(): string {
    return (
      this.context?.state ??
      (typeof AudioContext === 'undefined' ? 'unavailable' : 'locked')
    );
  }
  get voiceCount(): number {
    return this.voices.size;
  }

  configure(settings: UserSettings): void {
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
        for (const weapon of weaponOrder) {
          const sample = shotSamples[weapon];
          if (sample) void this.loadShotSample(context, weapon, sample.file);
        }
      }
      if (this.context.state === 'suspended') await this.context.resume();
      return this.context.state === 'running';
    } catch {
      return false;
    }
  }
  private async loadShotSample(
    context: AudioContext,
    weapon: WeaponId,
    file: string,
  ): Promise<void> {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}audio/${file}`, {
        cache: 'no-cache',
        signal: this.shotRequests.signal,
      });
      if (!response.ok || this.disposed) return;
      const data = await response.arrayBuffer();
      if (this.disposed) return;
      const buffer = await context.decodeAudioData(data);
      if (!this.disposed) this.shotBuffers.set(weapon, buffer);
    } catch {
      // A missing or unsupported asset leaves the procedural report available.
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
  private output(ui = false): GainNode | null {
    if (
      !this.active ||
      this.disposed ||
      this.context?.state !== 'running' ||
      this.settings.muted ||
      this.settings.masterVolume === 0 ||
      this.voices.size >= 16
    )
      return null;
    return ui
      ? this.settings.interfaceVolume > 0
        ? this.ui
        : null
      : this.settings.effectsVolume > 0
        ? this.effects
        : null;
  }
  private connect(
    source: AudioScheduledSourceNode,
    gain: GainNode,
    nodes: AudioNode[],
    output: GainNode,
    pan: number,
    duration: number,
  ): void {
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
    source.start();
    source.stop(context.currentTime + duration);
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
  /** True when the report includes the recorded bolt cycle. */
  shot(weapon: WeaponId, gain = 1, pan = 0): boolean {
    const sample = shotSamples[weapon];
    const buffer = this.shotBuffers.get(weapon);
    if (sample && buffer) {
      const output = this.output();
      if (!output || gain <= 0) return false;
      const context = this.context!;
      const source = context.createBufferSource();
      const volume = context.createGain();
      source.buffer = buffer;
      // A small pitch variation keeps automatic fire from sounding like a loop.
      const detune = sample.detune
        ? (Math.random() * 2 - 1) * sample.detune
        : 0;
      if (detune) source.detune.value = detune;
      volume.gain.value = sample.gain * gain;
      source.connect(volume);
      const duration = buffer.duration / 2 ** (detune / 1200);
      this.connect(source, volume, [], output, pan, duration);
      return weapon === 'sniper';
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
    else if (cue === 'hit' || cue === 'critical')
      this.tone(cue === 'critical' ? 1600 : 1050, 1900, 0.07, 0.075, 'sine');
    else if (cue === 'kill') this.tone(750, 1500, 0.16, 0.085, 'triangle');
    else if (cue === 'death') this.tone(130, 30, 0.45, 0.13);
    else if (cue === 'hurt') this.tone(110, 45, 0.15, 0.12);
    else if (cue === 'reload' || cue === 'equip') {
      this.noise(0.08, 0.065, 2800);
      this.tone(430, 180, 0.08, 0.04, 'square');
    } else if (cue === 'jump') this.tone(140, 240, 0.09, 0.04);
    else if (cue === 'slide' || cue === 'dive') this.noise(0.2, 0.085, 950);
    else
      this.noise(
        cue === 'land' ? 0.12 : 0.07,
        cue === 'land' ? 0.075 : 0.045,
        430,
      );
  }
  observe(
    dt: number,
    weapons: WeaponController,
    movement: MovementController,
    active: boolean,
  ): void {
    const boltPhase = weapons.cycling
      ? weapons.cycleProgress < 0.15
        ? 0
        : weapons.cycleProgress < 0.65
          ? 1
          : 2
      : 0;
    const scoped = !!weapons.config.scopeMagnification && weapons.ads > 0.5;
    if (active) {
      if (weapons.shotsFired > this.lastShots)
        this.sampledBolt = this.shot(weapons.selected);
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
      if (weapons.reloading && !this.lastReload) {
        this.cue('reload');
        if (weapons.config.scopeMagnification)
          this.tone(180, 70, 0.16, 0.055, 'triangle');
      }
      if (movement.state !== this.lastState) {
        if (movement.state === 'sliding' || movement.state === 'backsliding')
          this.cue('slide');
        if (movement.state === 'diving') this.cue('dive');
        if (
          movement.state === 'airborne' &&
          this.grounded &&
          movement.velocity.y > 0
        )
          this.cue('jump');
      }
      if (this.grounded === false && movement.physics.grounded)
        this.cue('land');
      if (
        movement.physics.grounded &&
        (movement.state === 'walking' || movement.state === 'sprinting')
      ) {
        const speed = Math.hypot(movement.velocity.x, movement.velocity.z);
        this.distance += speed * dt;
        if (speed > 0.8 && this.distance > 1.8) {
          this.distance %= 1.8;
          this.cue('step');
        }
      } else this.distance = 0;
    }
    this.lastShots = weapons.shotsFired;
    if (!weapons.cycling) this.sampledBolt = false;
    this.lastBoltPhase = boltPhase;
    this.lastScoped = scoped;
    this.lastWeapon = weapons.selected;
    this.lastReload = weapons.reloading;
    this.lastState = movement.state;
    this.grounded = movement.physics.grounded;
  }
  feedback(snapshot: CombatSnapshot): void {
    const newLife = snapshot.player && snapshot.player.life !== this.life;
    if (!newLife) {
      if (snapshot.hitSequence > this.hit)
        this.cue(
          snapshot.dummyResetting
            ? 'kill'
            : snapshot.critical
              ? 'critical'
              : 'hit',
        );
      if (snapshot.player && snapshot.player.damageSequence > this.damage)
        this.cue(snapshot.player.alive ? 'hurt' : 'death');
    } else if (this.life > 0) this.cue('respawn');
    this.hit = snapshot.hitSequence;
    this.damage = snapshot.player?.damageSequence ?? 0;
    this.life = snapshot.player?.life ?? 0;
  }
  resetFeedback(snapshot: CombatSnapshot): void {
    this.hit = snapshot.hitSequence;
    this.damage = snapshot.player?.damageSequence ?? 0;
    this.life = snapshot.player?.life ?? 0;
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
      this.lastCountdown = 4;
      this.sawCountdown = this.matchStarted = false;
    }
    if (view.phase === 'countdown') {
      this.sawCountdown = true;
      const remaining = view.match.countdownSeconds ?? 3;
      if (remaining >= 1 && remaining <= 3 && remaining < this.lastCountdown) {
        this.lastCountdown = remaining;
        this.cue('countdown');
      }
    } else if (this.sawCountdown && !this.matchStarted) {
      this.matchStarted = true;
      this.cue('match-start');
    }
  }
  resetMotion(): void {
    this.distance = 0;
    this.grounded = null;
    this.lastState = '';
  }
  private stopVoices(): void {
    for (const voice of this.voices) {
      try {
        voice.source.stop();
      } catch {
        /* Already ended. */
      }
      for (const node of voice.nodes) node.disconnect();
      voice.source.onended = null;
    }
    this.voices.clear();
  }
  dispose(): void {
    this.disposed = true;
    this.shotRequests.abort();
    this.shotBuffers.clear();
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
