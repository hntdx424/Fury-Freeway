import { clamp } from "./math";

export type ImpactKind =
  | "cone"
  | "barrier"
  | "dumpster"
  | "sign"
  | "hydrant"
  | "stall"
  | "mailbox"
  | "trash"
  | "parked"
  | "crate"
  | "pole"
  | "traffic"
  | "building";

type Material = "metal" | "glass" | "wood" | "concrete" | "hollow" | "plastic" | "water";

const MATERIAL: Record<ImpactKind, Material> = {
  cone: "plastic",
  barrier: "concrete",
  dumpster: "hollow",
  sign: "metal",
  hydrant: "water",
  stall: "wood",
  mailbox: "metal",
  trash: "plastic",
  parked: "glass",
  crate: "wood",
  pole: "metal",
  traffic: "glass",
  building: "concrete",
};

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private rumble: OscillatorNode | null = null;
  private rumbleGain: GainNode | null = null;
  private tireFilter: BiquadFilterNode | null = null;
  private tireGain: GainNode | null = null;
  private skidFilter: BiquadFilterNode | null = null;
  private skidGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private buffers = new Map<Material, AudioBuffer[]>();
  private voices = 0;
  private lastCrash = 0;
  private started = false;
  muted = false;

  async start(): Promise<void> {
    if (this.started) {
      if (this.ctx?.state === "suspended") await this.ctx.resume();
      this.applyMute();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = 0.7;
    this.master = master;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 5.5;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    master.connect(comp);
    comp.connect(ctx.destination);

    const engineBus = ctx.createGain();
    engineBus.gain.value = 1;
    engineBus.connect(master);
    this.engineBus = engineBus;

    const sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.9;
    sfxBus.connect(master);
    this.sfxBus = sfxBus;

    const pink = makePink(ctx, 2.2);

    const rumble = ctx.createOscillator();
    rumble.type = "sine";
    rumble.frequency.value = 42;
    const rg = ctx.createGain();
    rg.gain.value = 0;
    rumble.connect(rg);
    rg.connect(engineBus);
    rumble.start();
    this.rumble = rumble;
    this.rumbleGain = rg;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 380;
    filter.Q.value = 1.1;
    this.engineFilter = filter;
    const eg = ctx.createGain();
    eg.gain.value = 0;
    this.engineGain = eg;
    filter.connect(eg);
    eg.connect(engineBus);

    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 55;
    osc.connect(filter);
    osc.start();
    this.engineOsc = osc;

    const osc2 = ctx.createOscillator();
    osc2.type = "triangle";
    osc2.frequency.value = 82;
    const g2 = ctx.createGain();
    g2.gain.value = 0.35;
    osc2.connect(g2);
    g2.connect(filter);
    osc2.start();
    this.engineOsc2 = osc2;

    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 22;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 4.5;
    lfo.connect(lfoG);
    lfoG.connect(osc.frequency);
    lfo.start();

    const tireSrc = ctx.createBufferSource();
    tireSrc.buffer = pink;
    tireSrc.loop = true;
    const tf = ctx.createBiquadFilter();
    tf.type = "bandpass";
    tf.frequency.value = 780;
    tf.Q.value = 0.85;
    const tg = ctx.createGain();
    tg.gain.value = 0;
    tireSrc.connect(tf);
    tf.connect(tg);
    tg.connect(engineBus);
    tireSrc.start();
    this.tireFilter = tf;
    this.tireGain = tg;

    const skidSrc = ctx.createBufferSource();
    skidSrc.buffer = pink;
    skidSrc.loop = true;
    const sf = ctx.createBiquadFilter();
    sf.type = "bandpass";
    sf.frequency.value = 1600;
    sf.Q.value = 3.2;
    const sg = ctx.createGain();
    sg.gain.value = 0;
    skidSrc.connect(sf);
    sf.connect(sg);
    sg.connect(engineBus);
    skidSrc.start();
    this.skidFilter = sf;
    this.skidGain = sg;

    const windSrc = ctx.createBufferSource();
    windSrc.buffer = pink;
    windSrc.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = "highpass";
    wf.frequency.value = 1800;
    wf.Q.value = 0.5;
    const wg = ctx.createGain();
    wg.gain.value = 0;
    windSrc.connect(wf);
    wf.connect(wg);
    wg.connect(engineBus);
    windSrc.start();
    this.windFilter = wf;
    this.windGain = wg;

    this.bakeHits(ctx);
    this.started = true;
    this.applyMute();
    if (ctx.state === "suspended") await ctx.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyMute();
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setEngine(speed: number, throttle: number, sliding: number): void {
    if (!this.ctx || !this.engineOsc || !this.engineOsc2 || !this.engineGain || !this.engineFilter) return;
    if (!this.rumble || !this.rumbleGain || !this.tireGain || !this.skidGain || !this.windGain) return;
    if (!this.tireFilter || !this.skidFilter || !this.windFilter) return;
    const t = this.ctx.currentTime;
    const abs = Math.abs(speed);
    const th = Math.max(0, throttle);
    const gear = Math.max(1, Math.min(5, Math.floor(abs / 92) + 1));
    const inGear = clamp((abs - (gear - 1) * 92) / 92, 0, 1);
    const idle = abs < 12;
    const rpmN = idle ? 0.2 + th * 0.12 : 0.28 + inGear * 0.52 + th * 0.16;
    const baseHz = 48 + rpmN * 150;
    this.engineOsc.frequency.setTargetAtTime(baseHz, t, 0.06);
    this.engineOsc2.frequency.setTargetAtTime(baseHz * 1.48 + 8, t, 0.07);
    this.engineFilter.frequency.setTargetAtTime(260 + rpmN * 720 + th * 220, t, 0.08);
    const engVol = this.muted ? 0 : idle ? 0.035 + th * 0.02 : 0.045 + rpmN * 0.07 + th * 0.025;
    this.engineGain.gain.setTargetAtTime(engVol, t, 0.08);
    this.rumble.frequency.setTargetAtTime(36 + rpmN * 28, t, 0.08);
    this.rumbleGain.gain.setTargetAtTime(this.muted ? 0 : 0.02 + rpmN * 0.035, t, 0.1);

    const tire = this.muted ? 0 : Math.min(0.055, (abs / 520) * 0.05);
    this.tireGain.gain.setTargetAtTime(tire, t, 0.1);
    this.tireFilter.frequency.setTargetAtTime(520 + abs * 0.9, t, 0.12);

    const skid = this.muted ? 0 : sliding * 0.07;
    this.skidGain.gain.setTargetAtTime(skid, t, 0.05);
    this.skidFilter.frequency.setTargetAtTime(1200 + sliding * 900, t, 0.05);

    const wind = this.muted ? 0 : Math.max(0, (abs - 160) / 700) * 0.045;
    this.windGain.gain.setTargetAtTime(wind, t, 0.15);
    this.windFilter.frequency.setTargetAtTime(1400 + abs * 1.2, t, 0.2);
  }

  crash(impact: number, kind: ImpactKind = "barrier"): void {
    if (!this.ctx || !this.sfxBus || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (t - this.lastCrash < 0.032) return;
    if (this.voices >= 6) return;
    this.lastCrash = t;
    const mag = clamp(impact / 340, 0.18, 1.35);
    const material = MATERIAL[kind] ?? "concrete";
    const variants = this.buffers.get(material);
    const buf = variants && variants.length ? variants[Math.floor(Math.random() * variants.length)] : null;

    const thump = ctx.createOscillator();
    thump.type = "sine";
    const tg = ctx.createGain();
    const low = material === "concrete" ? 42 : material === "hollow" ? 70 : 58;
    thump.frequency.setValueAtTime(low + mag * 36, t);
    thump.frequency.exponentialRampToValueAtTime(24, t + 0.22);
    tg.gain.setValueAtTime(0.16 * mag, t);
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
    thump.connect(tg);
    tg.connect(this.sfxBus);
    thump.start(t);
    thump.stop(t + 0.28);

    if (buf) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = 0.88 + Math.random() * 0.28;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.22 * mag, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      const f = ctx.createBiquadFilter();
      f.type = "lowshelf";
      f.frequency.value = 180;
      f.gain.value = mag * 4;
      src.connect(f);
      f.connect(g);
      g.connect(this.sfxBus);
      src.start(t);
      this.voices++;
      src.onended = () => {
        this.voices = Math.max(0, this.voices - 1);
      };
    }

    if (material === "glass" && mag > 0.45) this.playGlass(t, mag);
    if (kind === "hydrant" && mag > 0.4) this.playWater(t, mag);

    this.duck(t, mag);
  }

  combo(level: number): void {
    if (!this.ctx || !this.sfxBus || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 1400;
    const g = ctx.createGain();
    const freq = 180 + Math.min(10, level) * 28;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.35, t + 0.08);
    g.gain.setValueAtTime(0.035, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(f);
    f.connect(g);
    g.connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + 0.14);
  }

  fury(): void {
    if (!this.ctx || !this.sfxBus || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 420;
      const g = ctx.createGain();
      osc.frequency.setValueAtTime(70 * (i + 1), t);
      osc.frequency.exponentialRampToValueAtTime(110 * (i + 1), t + 0.4);
      g.gain.setValueAtTime(0.028, t + i * 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      osc.connect(f);
      f.connect(g);
      g.connect(this.sfxBus);
      osc.start(t);
      osc.stop(t + 0.52);
    }
  }

  hydrant(): void {
    if (!this.ctx) return;
    this.playWater(this.ctx.currentTime, 0.9);
  }

  private duck(t: number, mag: number): void {
    if (!this.engineBus) return;
    const drop = clamp(1 - mag * 0.22, 0.55, 0.92);
    this.engineBus.gain.cancelScheduledValues(t);
    this.engineBus.gain.setTargetAtTime(drop, t, 0.02);
    this.engineBus.gain.setTargetAtTime(1, t + 0.12, 0.12);
  }

  private playGlass(t: number, mag: number): void {
    const ctx = this.ctx!;
    const freqs = [2100, 3400, 5100];
    for (const freq of freqs) {
      const o = ctx.createOscillator();
      o.type = "sine";
      const g = ctx.createGain();
      o.frequency.setValueAtTime(freq * (0.96 + Math.random() * 0.08), t);
      g.gain.setValueAtTime(0.03 * mag, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(g);
      g.connect(this.sfxBus!);
      o.start(t);
      o.stop(t + 0.2);
    }
  }

  private playWater(t: number, mag: number): void {
    if (!this.ctx || !this.sfxBus || this.muted) return;
    const variants = this.buffers.get("water");
    const buf = variants?.[0];
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.12 * mag, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    src.connect(g);
    g.connect(this.sfxBus);
    src.start(t);
  }

  private applyMute(): void {
    if (!this.master || !this.ctx) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.7, this.ctx.currentTime, 0.04);
  }

  private bakeHits(ctx: AudioContext): void {
    this.buffers.set("metal", [bake(ctx, 0.32, metalHit), bake(ctx, 0.28, metalHit)]);
    this.buffers.set("glass", [bake(ctx, 0.26, glassHit), bake(ctx, 0.22, glassHit)]);
    this.buffers.set("wood", [bake(ctx, 0.28, woodHit), bake(ctx, 0.24, woodHit)]);
    this.buffers.set("concrete", [bake(ctx, 0.38, concreteHit), bake(ctx, 0.32, concreteHit)]);
    this.buffers.set("hollow", [bake(ctx, 0.36, hollowHit)]);
    this.buffers.set("plastic", [bake(ctx, 0.18, plasticHit), bake(ctx, 0.16, plasticHit)]);
    this.buffers.set("water", [bake(ctx, 0.42, waterHit)]);
  }
}

function makePink(ctx: AudioContext, seconds: number): AudioBuffer {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return buf;
}

function bake(ctx: AudioContext, dur: number, fn: (i: number, n: number) => number): AudioBuffer {
  const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = clamp(fn(i, n), -1, 1);
  return buf;
}

function env(i: number, n: number, attack = 0.004, decay = 0.9): number {
  const a = Math.max(1, attack * n);
  const t = i / n;
  if (i < a) return i / a;
  return Math.pow(1 - t, decay);
}

function metalHit(i: number, n: number): number {
  const t = i / n;
  const e = env(i, n, 0.002, 1.4);
  const ring =
    Math.sin(i * 0.082) * 0.35 * Math.exp(-t * 8) +
    Math.sin(i * 0.19) * 0.18 * Math.exp(-t * 12) +
    Math.sin(i * 0.31) * 0.1 * Math.exp(-t * 18);
  const noise = (Math.random() * 2 - 1) * 0.45 * Math.exp(-t * 22);
  return (ring + noise) * e;
}

function glassHit(i: number, n: number): number {
  const t = i / n;
  const e = env(i, n, 0.001, 2.2);
  const tink =
    Math.sin(i * 0.42) * 0.2 * Math.exp(-t * 16) +
    Math.sin(i * 0.71) * 0.14 * Math.exp(-t * 22) +
    Math.sin(i * 1.05) * 0.08 * Math.exp(-t * 28);
  const shards = (Math.random() * 2 - 1) * 0.7 * Math.exp(-t * 30);
  return (tink + shards) * e;
}

function woodHit(i: number, n: number): number {
  const t = i / n;
  const e = env(i, n, 0.003, 1.6);
  const thud = Math.sin(i * 0.028) * 0.4 * Math.exp(-t * 10);
  const crack = (Math.random() * 2 - 1) * 0.5 * Math.exp(-t * 18);
  const mid = Math.sin(i * 0.09) * 0.15 * Math.exp(-t * 14);
  return (thud + crack + mid) * e;
}

function concreteHit(i: number, n: number): number {
  const t = i / n;
  const e = env(i, n, 0.004, 1.1);
  const boom = Math.sin(i * 0.014) * 0.55 * Math.exp(-t * 7);
  const gravel = (Math.random() * 2 - 1) * 0.55 * Math.exp(-t * 14);
  return (boom + gravel) * e;
}

function hollowHit(i: number, n: number): number {
  const t = i / n;
  const e = env(i, n, 0.003, 1.2);
  const body =
    Math.sin(i * 0.038) * 0.45 * Math.exp(-t * 6) +
    Math.sin(i * 0.072) * 0.22 * Math.exp(-t * 9);
  const clang = (Math.random() * 2 - 1) * 0.35 * Math.exp(-t * 16);
  return (body + clang) * e;
}

function plasticHit(i: number, n: number): number {
  const t = i / n;
  const e = env(i, n, 0.001, 2.4);
  const tick = Math.sin(i * 0.16) * 0.25 * Math.exp(-t * 20);
  const hiss = (Math.random() * 2 - 1) * 0.55 * Math.exp(-t * 28);
  return (tick + hiss) * e;
}

function waterHit(i: number, n: number): number {
  const t = i / n;
  const e = env(i, n, 0.01, 0.7);
  const spray = (Math.random() * 2 - 1) * 0.7 * (0.4 + 0.6 * Math.sin(i * 0.05));
  const metal = Math.sin(i * 0.06) * 0.12 * Math.exp(-t * 10);
  return (spray * Math.exp(-t * 8) + metal) * e;
}
