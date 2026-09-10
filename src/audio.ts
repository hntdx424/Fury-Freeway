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

/** Keep biquads well below Nyquist — values near/above it NaN the whole graph. */
export const AUDIO_SPEED_CAP = 640;
export const ENGINE_HZ_MIN = 42;
export const ENGINE_HZ_MAX = 168;
export const FILTER_HZ_MAX = 2400;

export type EngineVoice = {
  engineHz: number;
  engineHz2: number;
  engineCutoff: number;
  engineVol: number;
  rumbleHz: number;
  rumbleVol: number;
  tireHz: number;
  tireVol: number;
  skidHz: number;
  skidVol: number;
  windHz: number;
  windVol: number;
};

export function computeEngineVoice(
  speed: number,
  throttle: number,
  sliding: number,
  muted: boolean,
  sampleRate: number,
): EngineVoice {
  const nyquist = Math.max(2000, sampleRate * 0.5);
  const hzCeil = Math.min(FILTER_HZ_MAX, nyquist * 0.38);
  const hz = (value: number, lo: number, hi: number) => clamp(finite(value, lo), lo, Math.min(hi, hzCeil));
  const vol = (value: number, hi: number) => (muted ? 0 : clamp(finite(value, 0), 0, hi));

  const abs = clamp(finite(Math.abs(speed), 0), 0, AUDIO_SPEED_CAP);
  const th = clamp(finite(throttle, 0), 0, 1);
  const slide = clamp(finite(sliding, 0), 0, 1);
  const gear = Math.max(1, Math.min(5, Math.floor(abs / 92) + 1));
  const inGear = clamp((abs - (gear - 1) * 92) / 92, 0, 1);
  const idle = abs < 12;
  const rpmN = clamp(idle ? 0.2 + th * 0.12 : 0.28 + inGear * 0.5 + th * 0.14, 0.12, 0.92);
  const engineHz = hz(46 + rpmN * 110, ENGINE_HZ_MIN, ENGINE_HZ_MAX);
  return {
    engineHz,
    engineHz2: hz(engineHz * 1.42 + 6, 50, 230),
    engineCutoff: hz(240 + rpmN * 400 + th * 110, 220, 720),
    engineVol: vol(idle ? 0.035 + th * 0.02 : 0.045 + rpmN * 0.065 + th * 0.02, 0.14),
    rumbleHz: hz(36 + rpmN * 22, 28, 58),
    rumbleVol: vol(0.018 + rpmN * 0.028, 0.05),
    tireHz: hz(480 + abs * 0.42, 420, 760),
    tireVol: vol(Math.min(0.05, (abs / 560) * 0.048), 0.055),
    skidHz: hz(880 + slide * 320, 800, 1280),
    skidVol: vol(slide * 0.055, 0.07),
    windHz: hz(360 + abs * 0.55, 320, 720),
    windVol: vol(Math.max(0, (abs - 140) / 720) * 0.04, 0.045),
  };
}

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
  /** Strong refs so Chrome cannot GC live nodes and mute the destination. */
  private graph: AudioNode[] = [];
  private buffers = new Map<Material, AudioBuffer[]>();
  private voices = 0;
  private lastCrash = 0;
  private started = false;
  private resumeBound = false;
  private resuming = false;
  muted = false;

  async start(): Promise<void> {
    if (this.ctx?.state === "closed") this.dropGraph();
    if (this.started && this.ctx) {
      await this.resume();
      this.applyMute();
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    let ctx: AudioContext;
    try {
      ctx = new Ctx({ latencyHint: "interactive" });
    } catch {
      ctx = new Ctx();
    }
    this.ctx = ctx;
    this.bindResume();

    const master = ctx.createGain();
    master.gain.value = 0.7;
    this.master = master;

    const air = ctx.createBiquadFilter();
    air.type = "lowpass";
    air.Q.value = 0.65;
    air.frequency.value = maxFilterHz(ctx.sampleRate, 7500);

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 5.5;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;

    master.connect(air);
    air.connect(comp);
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
    filter.Q.value = 0.95;
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
    g2.gain.value = 0.32;
    osc2.connect(g2);
    g2.connect(filter);
    osc2.start();
    this.engineOsc2 = osc2;

    // Detune (cents), not frequency — FM into frequency can scream if the LFO gain runs away.
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 6.5;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 18;
    lfo.connect(lfoG);
    lfoG.connect(osc.detune);
    lfo.start();

    const tireSrc = loopNoise(ctx, pink);
    const tf = ctx.createBiquadFilter();
    tf.type = "bandpass";
    tf.frequency.value = 520;
    tf.Q.value = 0.75;
    const tg = ctx.createGain();
    tg.gain.value = 0;
    tireSrc.connect(tf);
    tf.connect(tg);
    tg.connect(engineBus);
    tireSrc.start();
    this.tireFilter = tf;
    this.tireGain = tg;

    const skidSrc = loopNoise(ctx, pink);
    const sf = ctx.createBiquadFilter();
    sf.type = "bandpass";
    sf.frequency.value = 980;
    sf.Q.value = 1.15;
    const sg = ctx.createGain();
    sg.gain.value = 0;
    skidSrc.connect(sf);
    sf.connect(sg);
    sg.connect(engineBus);
    skidSrc.start();
    this.skidFilter = sf;
    this.skidGain = sg;

    const windSrc = loopNoise(ctx, pink);
    const wf = ctx.createBiquadFilter();
    wf.type = "bandpass";
    wf.frequency.value = 420;
    wf.Q.value = 0.7;
    const wa = ctx.createBiquadFilter();
    wa.type = "lowpass";
    wa.frequency.value = maxFilterHz(ctx.sampleRate, 1800);
    wa.Q.value = 0.5;
    const wg = ctx.createGain();
    wg.gain.value = 0;
    windSrc.connect(wf);
    wf.connect(wa);
    wa.connect(wg);
    wg.connect(engineBus);
    windSrc.start();
    this.windFilter = wf;
    this.windGain = wg;

    this.graph = [
      master,
      air,
      comp,
      engineBus,
      sfxBus,
      rumble,
      rg,
      filter,
      eg,
      osc,
      osc2,
      g2,
      lfo,
      lfoG,
      tireSrc,
      tf,
      tg,
      skidSrc,
      sf,
      sg,
      windSrc,
      wf,
      wa,
      wg,
    ];
    if (this.graph.length < 20) throw new Error("Audio graph failed to wire");

    this.bakeHits(ctx);
    this.started = true;
    this.applyMute();
    await this.resume();
  }

  async resume(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || ctx.state === "closed" || this.resuming) return;
    if (document.visibilityState === "hidden") return;
    if (ctx.state === "running") return;
    this.resuming = true;
    try {
      await ctx.resume();
    } catch {
      /* autoplay may require another gesture; start() / click will retry */
    } finally {
      this.resuming = false;
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyMute();
    if (!muted) void this.resume();
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setEngine(speed: number, throttle: number, sliding: number): void {
    if (!this.ctx || !this.engineOsc || !this.engineOsc2 || !this.engineGain || !this.engineFilter) return;
    if (!this.rumble || !this.rumbleGain || !this.tireGain || !this.skidGain || !this.windGain) return;
    if (!this.tireFilter || !this.skidFilter || !this.windFilter) return;
    this.kickResume();
    const v = computeEngineVoice(speed, throttle, sliding, this.muted, this.ctx.sampleRate);
    // Direct .value (not per-frame setTargetAtTime): automation events were unbounded and killed the graph.
    this.engineOsc.frequency.value = v.engineHz;
    this.engineOsc2.frequency.value = v.engineHz2;
    this.engineFilter.frequency.value = v.engineCutoff;
    this.engineGain.gain.value = v.engineVol;
    this.rumble.frequency.value = v.rumbleHz;
    this.rumbleGain.gain.value = v.rumbleVol;
    this.tireGain.gain.value = v.tireVol;
    this.tireFilter.frequency.value = v.tireHz;
    this.skidGain.gain.value = v.skidVol;
    this.skidFilter.frequency.value = v.skidHz;
    this.windGain.gain.value = v.windVol;
    this.windFilter.frequency.value = v.windHz;
  }

  crash(impact: number, kind: ImpactKind = "barrier"): void {
    if (!this.ctx || !this.sfxBus || this.muted) return;
    this.kickResume();
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
    tg.gain.setValueAtTime(Math.max(0.001, 0.16 * mag), t);
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
    thump.connect(tg);
    tg.connect(this.sfxBus);
    thump.start(t);
    thump.stop(t + 0.28);

    if (buf) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = clamp(0.88 + Math.random() * 0.28, 0.7, 1.25);
      const g = ctx.createGain();
      g.gain.setValueAtTime(Math.max(0.001, 0.22 * mag), t);
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
    this.kickResume();
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = maxFilterHz(ctx.sampleRate, 1400);
    const g = ctx.createGain();
    const freq = clamp(180 + Math.min(10, level) * 28, 120, 480);
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
    this.kickResume();
    const ctx = this.ctx;
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = maxFilterHz(ctx.sampleRate, 420);
      const g = ctx.createGain();
      osc.frequency.setValueAtTime(clamp(70 * (i + 1), 40, 280), t);
      osc.frequency.exponentialRampToValueAtTime(clamp(110 * (i + 1), 50, 360), t + 0.4);
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
    this.kickResume();
    this.playWater(this.ctx.currentTime, 0.9);
  }

  private duck(t: number, mag: number): void {
    if (!this.engineBus) return;
    const drop = clamp(1 - mag * 0.22, 0.55, 0.92);
    const g = this.engineBus.gain;
    try {
      g.cancelAndHoldAtTime(t);
      g.setTargetAtTime(drop, t, 0.02);
      g.setTargetAtTime(1, t + 0.12, 0.12);
    } catch {
      g.value = 1;
    }
  }

  private playGlass(t: number, mag: number): void {
    const ctx = this.ctx!;
    const freqs = [2100, 3400, 5100];
    for (const freq of freqs) {
      const o = ctx.createOscillator();
      o.type = "sine";
      const g = ctx.createGain();
      const hz = clamp(freq * (0.96 + Math.random() * 0.08), 400, maxFilterHz(ctx.sampleRate, 5200));
      o.frequency.setValueAtTime(hz, t);
      g.gain.setValueAtTime(Math.max(0.001, 0.03 * mag), t);
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
    g.gain.setValueAtTime(Math.max(0.001, 0.12 * mag), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    src.connect(g);
    g.connect(this.sfxBus);
    src.start(t);
    src.stop(t + 0.55);
  }

  private applyMute(): void {
    if (!this.master || !this.ctx) return;
    const t = this.ctx.currentTime;
    setParam(this.master.gain, this.muted ? 0 : 0.7, t, 0.04);
  }

  private kickResume(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state === "closed" || ctx.state === "running") return;
    if (document.visibilityState === "hidden") return;
    void this.resume();
  }

  private bindResume(): void {
    const kick = () => {
      if (document.visibilityState === "visible") void this.resume();
    };
    this.ctx?.addEventListener("statechange", kick);
    if (this.resumeBound) return;
    this.resumeBound = true;
    window.addEventListener("focus", kick);
    window.addEventListener("pointerdown", kick);
    window.addEventListener("keydown", kick);
    document.addEventListener("visibilitychange", kick);
  }

  private dropGraph(): void {
    this.ctx = null;
    this.master = null;
    this.engineBus = null;
    this.sfxBus = null;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineFilter = null;
    this.engineGain = null;
    this.rumble = null;
    this.rumbleGain = null;
    this.tireFilter = null;
    this.tireGain = null;
    this.skidFilter = null;
    this.skidGain = null;
    this.windFilter = null;
    this.windGain = null;
    this.graph = [];
    this.buffers.clear();
    this.started = false;
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

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function maxFilterHz(sampleRate: number, want: number): number {
  const nyquist = Math.max(2000, sampleRate * 0.5);
  return clamp(want, 40, nyquist * 0.42);
}

function loopNoise(ctx: AudioContext, buf: AudioBuffer): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.loopStart = 0;
  src.loopEnd = buf.duration;
  return src;
}

function setParam(param: AudioParam, value: number, t: number, tc: number): void {
  const v = finite(value, param.value);
  try {
    param.cancelAndHoldAtTime(t);
    param.setTargetAtTime(v, t, tc);
  } catch {
    param.value = v;
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
