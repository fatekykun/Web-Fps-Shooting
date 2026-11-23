import type {
  FootstepKind,
  FootstepSurface,
} from '@breakpoint/shared/movement/Footsteps';

type Contact = 'step' | 'crawl' | 'slide' | 'land';
const duration: Record<Contact, number> = {
  step: 0.15,
  crawl: 0.15,
  slide: 0.48,
  land: 0.19,
};
const material = {
  concrete: {
    cutoff: 1700,
    grit: 0.48,
    body: 132,
    ring: 410,
    ringGain: 0.16,
    decay: 62,
  },
  metal: {
    cutoff: 3000,
    grit: 0.48,
    body: 158,
    ring: 735,
    ringGain: 0.42,
    decay: 42,
  },
  wood: {
    cutoff: 1100,
    grit: 0.42,
    body: 184,
    ring: 302,
    ringGain: 0.28,
    decay: 50,
  },
  dirt: {
    cutoff: 620,
    grit: 0.42,
    body: 92,
    ring: 207,
    ringGain: 0.07,
    decay: 74,
  },
  grass: {
    cutoff: 2500,
    grit: 0.76,
    body: 108,
    ring: 330,
    ringGain: 0.04,
    decay: 55,
  },
  gravel: {
    cutoff: 2050,
    grit: 0.84,
    body: 111,
    ring: 450,
    ringGain: 0.08,
    decay: 72,
  },
} satisfies Record<FootstepSurface, Record<string, number>>;

function bootContact(time: number, attack: number, decay: number): number {
  if (time <= 0) return 0;
  return (1 - Math.exp(-time / attack)) * Math.exp(-time / decay);
}

function synthesizeSlide(
  data: Float32Array,
  rate: number,
  surface: FootstepSurface,
  take: number,
): void {
  const profile = material[surface];
  const dragFilter = Math.exp((-2 * Math.PI * profile.cutoff * 0.7) / rate);
  const fabricFilter = Math.exp((-2 * Math.PI * 460) / rate);
  const contactFilter = Math.exp((-2 * Math.PI * 150) / rate);
  let seed = 8287 + take * 2539;
  let drag = 0;
  let fabric = 0;
  let weight = 0;

  for (let i = 0; i < data.length; i++) {
    const time = i / rate;
    const remaining = 1 - i / (data.length - 1);
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = (seed / 4294967296) * 2 - 1;
    drag = drag * dragFilter + noise * (1 - dragFilter);
    fabric = fabric * fabricFilter + drag * (1 - fabricFilter);
    weight = weight * contactFilter + fabric * (1 - contactFilter);

    // Pad contact leads into an uneven scrape that softens as the player slows.
    const contact = bootContact(time, 0.007, 0.035);
    const clothDrag = Math.min(1, time / 0.022) * remaining ** 1.7;
    const grit =
      bootContact(time - (0.028 + take * 0.006), 0.005, 0.027) +
      0.65 * bootContact(time - (0.094 - take * 0.009), 0.008, 0.022) +
      0.4 * bootContact(time - (0.174 + take * 0.012), 0.009, 0.032);
    const scrape = (drag - fabric) * profile.grit * remaining;
    data[i] =
      1.55 * weight * contact +
      0.8 * fabric * clothDrag +
      scrape * (0.55 * clothDrag + 0.7 * grit);
  }
}

/** Three original synthesized takes per surface and contact, cached as mono buffers. */
export class FootstepBank {
  private readonly buffers = new Map<string, AudioBuffer[]>();
  private readonly last = new Map<string, number>();

  preload(context: AudioContext): void {
    for (const surface of ['concrete', 'metal', 'wood'] as const)
      this.collection(context, surface, 'step');
    for (const contact of ['land', 'slide', 'crawl'] as const)
      this.collection(context, 'concrete', contact);
  }

  sample(
    context: AudioContext,
    surface: FootstepSurface,
    kind: FootstepKind,
  ): AudioBuffer {
    const contact =
      kind === 'crawl' || kind === 'slide' || kind === 'land' ? kind : 'step';
    const key = `${surface}:${contact}`;
    const buffers = this.collection(context, surface, contact);
    const last = this.last.get(key);
    const offset = Math.floor(
      Math.random() * (buffers.length - (last === undefined ? 0 : 1)),
    );
    const index = last !== undefined && offset >= last ? offset + 1 : offset;
    this.last.set(key, index);
    return buffers[index]!;
  }

  clear(): void {
    this.buffers.clear();
    this.last.clear();
  }

  private collection(
    context: AudioContext,
    surface: FootstepSurface,
    contact: Contact,
  ): AudioBuffer[] {
    const key = `${surface}:${contact}`;
    const cached = this.buffers.get(key);
    if (cached) return cached;
    const buffers = Array.from({ length: 3 }, (_, take) =>
      this.synthesize(context, surface, contact, take),
    );
    this.buffers.set(key, buffers);
    return buffers;
  }

  private synthesize(
    context: AudioContext,
    surface: FootstepSurface,
    contact: Contact,
    take: number,
  ): AudioBuffer {
    const rate = 22050;
    const length = duration[contact];
    const buffer = context.createBuffer(1, Math.ceil(length * rate), rate);
    const data = buffer.getChannelData(0);
    if (contact === 'slide') {
      synthesizeSlide(data, rate, surface, take);
      return buffer;
    }
    const profile = material[surface];
    const scrape = contact === 'crawl';
    const land = contact === 'land';
    const frequency = profile.body * (land ? 0.74 : 1) * (0.965 + take * 0.035);
    const cutoff =
      profile.cutoff *
      (contact === 'crawl' ? 0.55 : contact === 'step' ? 0.65 : 1);
    const smoothing = Math.exp((-2 * Math.PI * cutoff) / rate);
    let seed = 1729 + take * 1237,
      low = 0,
      sole = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / rate;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const white = (seed / 4294967296) * 2 - 1;
      low = low * smoothing + white * (1 - smoothing);
      if (contact === 'step') {
        sole = sole * smoothing + low * (1 - smoothing);
        const heel = bootContact(t, 0.009, 0.029);
        const toe = bootContact(t - (0.038 + take * 0.005), 0.009, 0.024);
        const tread = sole * (heel + 0.32 * toe) * profile.grit;
        const body = Math.sin(t * 2 * Math.PI * frequency) * 0.15 * heel;
        const surfaceRing =
          Math.sin(t * 2 * Math.PI * profile.ring) *
          profile.ringGain *
          0.35 *
          heel *
          Math.exp(-t * profile.decay);
        data[i] = (tread + body + surfaceRing) * Math.min(1, (length - t) * 80);
        continue;
      }
      const fade = Math.min(
        1,
        t * (scrape ? 160 : 700),
        Math.max(0, (length - t) * 75),
      );
      const second = t - 0.025;
      const heel = Math.exp(-t * 38);
      const toe = second > 0 ? 0.42 * Math.exp(-second * 61) : 0;
      const grain =
        0.62 +
        0.23 * Math.sin(t * (420 + take * 77)) +
        0.15 * Math.sin(t * 1259);
      const texture =
        (low * 0.83 +
          (white - low) *
            (surface === 'grass' || surface === 'gravel' ? 0.34 : 0.1)) *
        profile.grit;
      const thud =
        Math.sin(t * 2 * Math.PI * frequency) *
        (surface === 'grass' ? 0.13 : 0.29) *
        Math.exp(-t * 58);
      const resonance =
        Math.sin(t * 2 * Math.PI * profile.ring) *
        profile.ringGain *
        Math.exp(-t * profile.decay);
      data[i] =
        fade *
        (scrape
          ? texture * grain * 0.63 + thud * 0.13
          : texture * (heel + toe) * (surface === 'gravel' ? 1.5 * grain : 1) +
            thud +
            resonance);
    }
    return buffer;
  }
}
