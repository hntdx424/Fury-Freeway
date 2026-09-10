export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private rumbleGain: GainNode | null = null;
  private started = false;
  muted = false;

  async start(): Promise<void> {
    if (this.started) {
      if (this.ctx?.state === "suspended") await this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(ctx.destination);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 420;
    filter.Q.value = 0.7;
    this.engineFilter = filter;

    const gain = ctx.createGain();
    gain.gain.value = 0;
    this.engineGain = gain;

    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 48;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start();
    this.engineOsc = osc;

    const rumble = ctx.createOscillator();
    rumble.type = "sine";
    rumble.frequency.value = 38;
    const rg = ctx.createGain();
    rg.gain.value = 0;
    rumble.connect(rg);
    rg.connect(this.master);
    rumble.start();
    this.rumbleGain = rg;

    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 18;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 6;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    lfo.start();

    this.started = true;
    if (ctx.state === "suspended") await ctx.resume();
  }

  setEngine(speed: number, throttle: number, sliding: number): void {
    if (!this.ctx || !this.engineOsc || !this.engineGain || !this.engineFilter || !this.rumbleGain) return;
    const t = this.ctx.currentTime;
    const abs = Math.abs(speed);
    const rpm = 42 + abs * 0.55 + Math.max(0, throttle) * 28 + sliding * 18;
    const vol = this.muted ? 0 : 0.018 + Math.min(0.09, abs / 5200 + Math.max(0, throttle) * 0.04);
    this.engineOsc.frequency.setTargetAtTime(rpm, t, 0.05);
    this.engineFilter.frequency.setTargetAtTime(280 + abs * 1.4 + throttle * 180, t, 0.08);
    this.engineGain.gain.setTargetAtTime(vol, t, 0.06);
    this.rumbleGain.gain.setTargetAtTime(this.muted ? 0 : Math.min(0.05, abs / 9000 + sliding * 0.03), t, 0.1);
  }

  private lastCrash = 0;

  crash(impact: number, metallic = 0.5): void {
    if (!this.ctx || !this.master || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (t - this.lastCrash < 0.045) return;
    this.lastCrash = t;
    const mag = Math.min(1.4, impact / 280);

    const thump = ctx.createOscillator();
    thump.type = "sine";
    const tg = ctx.createGain();
    thump.frequency.setValueAtTime(70 + mag * 40, t);
    thump.frequency.exponentialRampToValueAtTime(28, t + 0.18);
    tg.gain.setValueAtTime(0.22 * mag, t);
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    thump.connect(tg);
    tg.connect(this.master);
    thump.start(t);
    thump.stop(t + 0.24);

    const noise = this.noiseBurst(0.16 + mag * 0.12, 0.12 * mag, 400 + metallic * 2200, t);
    noise();
  }

  scrape(): void {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime;
    this.noiseBurst(0.05, 0.03, 1800, t)();
  }

  combo(level: number): void {
    if (!this.ctx || !this.master || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "square";
    const g = ctx.createGain();
    const f = 220 + Math.min(12, level) * 55;
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.09);
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  fury(): void {
    if (!this.ctx || !this.master || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      const g = ctx.createGain();
      osc.frequency.setValueAtTime(90 * (i + 1), t);
      osc.frequency.exponentialRampToValueAtTime(180 * (i + 1), t + 0.35);
      g.gain.setValueAtTime(0.05, t + i * 0.04);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t);
      osc.stop(t + 0.5);
    }
  }

  hydrant(): void {
    if (!this.ctx || !this.master || this.muted) return;
    this.noiseBurst(0.35, 0.07, 2400, this.ctx.currentTime)();
  }

  private noiseBurst(dur: number, gain: number, freq: number, t: number): () => void {
    const ctx = this.ctx!;
    const n = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
    const data = n.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = n;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    filter.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master!);
    return () => {
      src.start(t);
      src.stop(t + dur + 0.02);
    };
  }
}
