// Fully synthesized audio — no external assets needed.

export type SfxProfile = 'heavy' | 'hydraulic' | 'glove' | 'cinema';

export const SFX_PROFILES: { id: SfxProfile; name: string; desc: string; tone: number }[] = [
  { id: 'heavy', name: 'BAJA BERAT', desc: 'Tumpul, tebal, dentuman logam rendah', tone: 4200 },
  { id: 'hydraulic', name: 'HIDROLIK', desc: 'Hantaman piston + desis udara', tone: 9000 },
  { id: 'glove', name: 'SARUNG TINJU', desc: 'Tamparan empuk ala ring tinju', tone: 6000 },
  { id: 'cinema', name: 'SINEMATIK', desc: 'Boom sub-bass + retakan film', tone: 7500 },
];

const LS_SFX = 'steel-titans-sfx-v2'; // v2: the default sound is now HIDROLIK
export const loadSfxProfile = (): SfxProfile => {
  try {
    const v = localStorage.getItem(LS_SFX) as SfxProfile | null;
    if (v && SFX_PROFILES.some((p) => p.id === v)) return v;
  } catch {
    /* ignore */
  }
  return 'hydraulic';
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export class Sfx {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private punchBus!: GainNode;
  private toneF!: BiquadFilterNode;
  private musicBus!: GainNode;
  private crowdGain!: GainNode;
  private roarBus!: GainNode;
  private lastRoarAt = 0;
  private noiseBuf!: AudioBuffer;
  muted = false;
  profile: SfxProfile = loadSfxProfile();
  private readonly CROWD_BASE = 0.012;
  private musicOn = false;
  private nextT = 0;
  private stepIdx = 0;
  private timer: number | undefined;
  musicIntensity = 1;

  init() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    const c = new AC();
    this.ctx = c;

    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 8;
    comp.ratio.value = 5;
    comp.attack.value = 0.002;
    comp.release.value = 0.14;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.95;
    this.master.connect(comp).connect(c.destination);

    // every effect goes through a profile-dependent low-pass → kills the harsh "tin tray" top end
    this.toneF = c.createBiquadFilter();
    this.toneF.type = 'lowpass';
    this.toneF.Q.value = 0.65;
    this.toneF.frequency.value = this.profileTone();
    this.toneF.connect(this.master);
    this.sfxBus = c.createGain();
    this.sfxBus.connect(this.toneF);

    // Dedicated Heavy Punch Bus: warm analog-style soft-clip saturation + sub-bass shelf boost for massive impact weight!
    const shaper = c.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i * 2) / 1023 - 1;
      curve[i] = Math.tanh(x * 2.2) / Math.tanh(2.2);
    }
    shaper.curve = curve;
    shaper.oversample = '2x';
    const subBoost = c.createBiquadFilter();
    subBoost.type = 'lowshelf';
    subBoost.frequency.value = 115;
    subBoost.gain.value = 5.5;
    this.punchBus = c.createGain();
    this.punchBus.gain.value = 1.15;
    this.punchBus.connect(subBoost).connect(shaper).connect(this.toneF);

    // reverb (arena feel)
    const len = Math.floor(c.sampleRate * 1.6);
    const ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    const conv = c.createConvolver();
    conv.buffer = ir;
    const damp = c.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 2400;
    const send = c.createGain();
    send.gain.value = 0.2;
    this.toneF.connect(send).connect(damp).connect(conv).connect(this.master);

    this.musicBus = c.createGain();
    this.musicBus.gain.value = 0.2;
    this.musicBus.connect(this.master);

    // noise buffer
    const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;

    // crowd ambience
    this.crowdGain = c.createGain();
    this.crowdGain.gain.value = this.CROWD_BASE;
    const mk = (f: number, q: number) => {
      const s = c.createBufferSource();
      s.buffer = nb;
      s.loop = true;
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      s.connect(bp).connect(this.crowdGain);
      s.start();
    };
    mk(500, 0.6);
    mk(1100, 0.9);
    mk(250, 0.5);
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.23;
    const lg = c.createGain();
    lg.gain.value = 0.004;
    lfo.connect(lg).connect(this.crowdGain.gain);
    lfo.start();
    this.crowdGain.connect(this.master);

    // dedicated bus for the big crowd reactions (roars + applause); bypasses the metal-tone filter
    this.roarBus = c.createGain();
    this.roarBus.gain.value = 1;
    this.roarBus.connect(this.master);
  }

  private profileTone() {
    return SFX_PROFILES.find((p) => p.id === this.profile)?.tone ?? 6000;
  }

  setProfile(id: SfxProfile, preview = true) {
    this.profile = id;
    try {
      localStorage.setItem(LS_SFX, id);
    } catch {
      /* ignore */
    }
    if (this.ctx && this.toneF) this.toneF.frequency.setTargetAtTime(this.profileTone(), this.ctx.currentTime, 0.02);
    if (preview) this.preview();
  }

  /** A short demo: medium hit → block → heavy hit. */
  preview() {
    if (!this.ctx) return;
    void this.ctx.resume();
    this.hit(0.4);
    window.setTimeout(() => this.block(0.5), 420);
    window.setTimeout(() => this.hit(0.9), 880);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
    if (m && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  // ------------------------------------------------------------ primitives
  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0, bus?: AudioNode) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus ?? this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, type: BiquadFilterType, f0: number, f1: number, vol: number, delay = 0, q = 1, bus?: AudioNode) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(bus ?? this.sfxBus);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  /** damped low-frequency "body of the metal": short-lived partials instead of a long ringing bell */
  private modal(freqs: number[], dur: number, vol: number, type: OscillatorType = 'triangle', delay = 0) {
    freqs.forEach((f, i) => this.tone(type, f, f * 0.985, Math.max(0.05, dur * (1 - i * 0.14)), vol / (1 + i * 0.8), delay));
  }

  // ------------------------------------------------------------ movement
  whoosh(p: number) {
    // Heavy air-cutting Doppler whoosh + hydraulic actuator surge + turbine spin-up
    this.noise(0.18 + 0.16 * p, 'bandpass', 240, 1450 + 1200 * p, 0.32 + 0.36 * p, 0, 0.85, this.punchBus);
    this.noise(0.12 + 0.1 * p, 'lowpass', 480, 140, 0.28 + 0.25 * p, 0.02, 0.9, this.punchBus);
    this.tone('sawtooth', 95, 260 + 110 * p, 0.18, 0.07 + 0.05 * p);
    this.tone('sine', 140, 68, 0.14, 0.18 + 0.15 * p, 0.01, this.punchBus);
  }
  servo() {
    this.tone('sawtooth', 165, 340, 0.16, 0.045);
    this.tone('triangle', 95, 190, 0.14, 0.06);
  }
  dodge() {
    this.noise(0.24, 'bandpass', 450, 3400, 0.34, 0, 1.15);
    this.tone('sine', 130, 52, 0.18, 0.28, 0, this.punchBus);
  }

  step(scale: number) {
    const s = scale;
    switch (this.profile) {
      case 'hydraulic':
        this.tone('sine', 92, 36, 0.15, 0.46 * s, 0, this.punchBus);
        this.noise(0.07, 'lowpass', 600, 120, 0.32 * s);
        this.noise(0.06, 'bandpass', 3000, 1700, 0.1 * s, 0.01, 0.8);
        break;
      case 'glove':
        this.tone('sine', 80, 38, 0.13, 0.38 * s, 0, this.punchBus);
        this.noise(0.08, 'lowpass', 400, 100, 0.34 * s);
        break;
      case 'cinema':
        this.tone('sine', 75, 30, 0.22, 0.54 * s, 0, this.punchBus);
        this.noise(0.1, 'lowpass', 700, 100, 0.4 * s);
        this.noise(0.06, 'bandpass', 680, 420, 0.12 * s, 0, 6);
        break;
      default:
        this.tone('sine', 88, 36, 0.16, 0.48 * s, 0, this.punchBus);
        this.noise(0.09, 'lowpass', 520, 110, 0.4 * s);
        this.noise(0.05, 'bandpass', 600, 380, 0.12 * s, 0, 5);
    }
    // THE TONNAGE under every profile: a sub thump that you feel more than hear, and a short steel clank off the
    // sole plate — a multi-tonne machine, not a man in a suit
    this.tone('sine', 52, 28, 0.21, 0.3 * s, 0, this.punchBus);
    this.noise(0.035, 'bandpass', 2500, 1800, 0.075 * s, 0.004, 9);
    this.noise(0.12, 'lowpass', 260, 80, 0.22 * s, 0.01);
  }

  // ------------------------------------------------------------ impacts
  hit(p: number) {
    p = clamp01(p);
    const r = 0.92 + Math.random() * 0.16;
    const pb = this.punchBus;
    this.crackle(p); // + the crackle of the sparks flying off the metal

    // Layer 1 (Shared across all profiles): Ultra-sharp 15ms knuckle-to-armor transient snap + deep sub-bass cannon drop!
    this.tone('triangle', (1450 + 600 * p) * r, 160, 0.024, 0.55 + 0.35 * p, 0, pb);
    this.noise(0.022, 'bandpass', 2600 * r, 950, 0.65 + 0.35 * p, 0, 1.1, pb);
    this.tone('sine', (96 + 28 * p) * r, 24, 0.38 + 0.32 * p, 1.15 + 0.45 * p, 0, pb);

    switch (this.profile) {
      case 'hydraulic':
        // Heavy hydraulic piston slam + titanium plate crunch + pressurized steam blowoff
        this.tone('sine', (135 + 45 * p) * r, 36, 0.26 + 0.22 * p, 1.15, 0, pb);
        this.noise(0.16 + 0.1 * p, 'lowpass', 1650, 130, 0.95, 0, 0.9, pb);
        this.noise(0.08 + 0.04 * p, 'bandpass', 780 * r, 360, 0.72, 0, 3.2, pb); // thick armor plate dent
        this.modal([172 * r, 264 * r, 412 * r, 585 * r], 0.16 + 0.1 * p, 0.22);
        this.noise(0.22 + 0.16 * p, 'bandpass', 4200, 1450, 0.42, 0.014, 0.75); // high-pressure pneumatic hiss
        this.tone('sawtooth', 260 * r, 62, 0.15, 0.28, 0.005, pb); // heavy servo recoil groan
        if (p > 0.4) this.tone('sine', 64, 22, 0.65, 0.95 * p, 0.01, pb);
        break;
      case 'glove':
        this.noise(0.075, 'bandpass', 2100 * r, 850, 0.85, 0, 0.9, pb); // heavy leather/steel slap
        this.tone('sine', (128 + 35 * p) * r, 38, 0.24 + 0.18 * p, 1.2, 0, pb);
        this.noise(0.18 + 0.12 * p, 'lowpass', 1100, 110, 0.95, 0, 0.85, pb);
        this.modal([290 * r, 435 * r], 0.09, 0.12);
        if (p > 0.35) this.tone('sine', 68, 25, 0.55, 0.9 * p, 0, pb);
        break;
      case 'cinema':
        this.tone('sine', 88 * r, 22, 0.85 + 0.65 * p, 1.25 + 0.3 * p, 0, pb);
        this.noise(0.09, 'highpass', 1600, 680, 0.6, 0, 1, pb);
        this.noise(0.45 + 0.3 * p, 'lowpass', 2600, 85, 0.95, 0, 0.9, pb);
        this.modal([184 * r, 278 * r, 420 * r, 640 * r], 0.28 + 0.2 * p, 0.2);
        this.noise(0.9 + 0.5 * p, 'lowpass', 520, 48, 0.42, 0.025, 0.8, pb);
        this.tone('sawtooth', 340 * r, 55, 0.26, 0.18, 0, pb);
        break;
      default: // heavy steel
        this.tone('sine', (142 + 48 * p) * r, 32, 0.32 + 0.28 * p, 1.15 + 0.35 * p, 0, pb);
        this.tone('sine', 66 * r, 24, 0.55 + 0.45 * p, 0.75 + 0.5 * p, 0, pb);
        this.noise(0.24 + 0.16 * p, 'lowpass', 1750, 120, 0.95, 0, 0.9, pb);
        this.noise(0.14, 'bandpass', 580 * r, 290, 0.68, 0, 3.2, pb); // thick steel armor clank
        this.modal([151 * r, 233 * r, 347 * r, 489 * r], 0.22 + 0.12 * p, 0.26);
        this.noise(0.04, 'highpass', 2200, 1400, 0.24);
        if (p > 0.45) this.noise(0.65, 'lowpass', 460, 52, 0.6, 0.015, 0.85, pb);
    }
  }

  block(p: number) {
    p = clamp01(p);
    const r = 0.94 + Math.random() * 0.12;
    const pb = this.punchBus;
    // Heavy steel-on-steel guard clang + shock absorber compression
    this.tone('triangle', 980 * r, 210, 0.02, 0.45 + 0.25 * p, 0, pb);
    switch (this.profile) {
      case 'hydraulic':
        this.tone('sine', 115 * r, 48, 0.18, 0.85, 0, pb);
        this.noise(0.14, 'bandpass', 3800, 1850, 0.36, 0, 0.85);
        this.noise(0.08, 'bandpass', 760 * r, 440, 0.58, 0, 4.5, pb);
        this.modal([240 * r, 365 * r, 540 * r], 0.14, 0.18);
        break;
      case 'glove':
        this.noise(0.07, 'bandpass', 1500, 780, 0.68, 0, 0.9, pb);
        this.tone('sine', 105 * r, 44, 0.16, 0.82, 0, pb);
        this.noise(0.12, 'lowpass', 750, 115, 0.62, 0, 0.9, pb);
        break;
      case 'cinema':
        this.noise(0.07, 'highpass', 1500, 780, 0.5, 0, 1, pb);
        this.tone('sine', 82 * r, 32, 0.34, 0.95, 0, pb);
        this.modal([220 * r, 330 * r, 495 * r], 0.22, 0.2);
        break;
      default:
        this.noise(0.15, 'bandpass', 460 * r, 260, 0.78, 0, 4, pb);
        this.modal([180 * r, 270 * r, 390 * r], 0.22 + 0.08 * p, 0.25);
        this.tone('sine', 115 * r, 46, 0.18, 0.82, 0, pb);
    }
  }

  guardBreak() {
    const pb = this.punchBus;
    this.noise(0.58, 'lowpass', 3400, 160, 0.95, 0, 0.9, pb);
    this.tone('sawtooth', 320, 48, 0.52, 0.32, 0, pb);
    this.tone('sine', 84, 22, 0.85, 1.15, 0, pb);
    this.modal([147, 221, 334], 0.36, 0.28);
  }

  /** the ring ropes stretching and snapping back */
  ropeCreak(p: number) {
    p = clamp01(p);
    this.noise(0.35 + 0.25 * p, 'bandpass', 220, 90, 0.3 + 0.2 * p, 0, 2.5);
    this.tone('sine', 82, 46, 0.35, 0.35 * p + 0.15);
    this.noise(0.18, 'lowpass', 900, 160, 0.3);
  }

  /** a two-ton body slamming the ropes: the posts boom, the turnbuckles rattle and the canvas thumps */
  ropeSlam(p: number) {
    p = clamp01(p);
    this.tone('sine', 58, 30, 0.42, 0.5 + 0.4 * p, 0, this.punchBus);
    this.noise(0.22, 'lowpass', 380, 90, 0.45 + 0.3 * p);
    this.noise(0.5 + 0.3 * p, 'bandpass', 1400, 600, 0.12 + 0.12 * p, 0.02, 3); // steel cable twang
    this.tone('triangle', 240, 170, 0.28, 0.08 + 0.08 * p);
  }

  bell(n: number) {
    for (let i = 0; i < n; i++) {
      [1, 2.4, 3.1, 5.2].forEach((m, k) => this.tone('sine', 660 * m, 660 * m * 0.995, 1.8, 0.2 / (k + 1), i * 0.32));
    }
  }
  /** a swelling band of noise — one "voice" of the crowd */
  private swell(freq: number, q: number, peak: number, dur: number, attack: number, freqEnd = freq) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    f.frequency.linearRampToValueAtTime(freqEnd, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.setValueAtTime(Math.max(0.0002, peak), t + Math.max(attack, dur * 0.45));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.roarBus);
    s.start(t, Math.random());
    s.stop(t + dur + 0.1);
  }

  /**
   * The crowd erupts: a roar that swells and fades, plus applause.
   * level ≈ 0.3 (an "ooh" at a knockdown) … 1 (knockout / victory).
   */
  roar(level: number, dur = 2.6) {
    const c = this.ctx;
    if (!c || !this.roarBus || this.muted) return;
    const now = performance.now();
    if (now - this.lastRoarAt < 900 && level < 0.95) return; // don't stack the small ones
    this.lastRoarAt = now;
    const L = clamp01(level);
    // voices: low body, vowel-like formants, and a bright "whoo" on top
    this.swell(300, 0.8, 0.07 * L, dur, 0.28, 360);
    this.swell(620, 1.1, 0.09 * L, dur, 0.22, 780);
    this.swell(1150, 1.3, 0.07 * L, dur * 0.95, 0.2, 1500);
    this.swell(2300, 1.6, 0.035 * L, dur * 0.8, 0.18, 2700);
    // applause: many short, random claps
    const claps = Math.floor(dur * (10 + 16 * L));
    for (let i = 0; i < claps; i++) {
      const d = 0.2 + Math.random() * (dur * 0.95);
      const fall = 1 - d / (dur + 0.4);
      this.noise(0.035, 'bandpass', 1800 + Math.random() * 2600, 1200, 0.05 * L * fall + 0.004, d, 0.9, this.roarBus);
    }
    this.cheer(L); // and the ambient crowd bed rises as well
  }

  cheer(level: number) {
    const c = this.ctx;
    if (!c) return;
    const g = this.crowdGain.gain;
    const t = c.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(this.CROWD_BASE + 0.03 * level, t + 0.12);
    g.linearRampToValueAtTime(this.CROWD_BASE, t + 1.2 + level * 1.0);
  }
  ko() {
    this.tone('sine', 80, 20, 1.6, 1.0);
    this.noise(1.4, 'lowpass', 1500, 70, 0.9);
    this.modal([110, 165, 247], 1.0, 0.22);
    this.tone('sawtooth', 380, 40, 1.1, 0.16);
  }
  charge() {
    this.tone('sawtooth', 50, 480, 0.7, 0.2);
    this.noise(0.7, 'bandpass', 200, 3200, 0.33, 0, 1.2);
  }
  /** the dry crackle that real welding / grinding sparks make: lots of tiny, random, high-pitched ticks */
  crackle(p: number) {
    if (!this.ctx) return;
    const n = 4 + Math.floor(clamp01(p) * 9);
    for (let i = 0; i < n; i++) {
      const d = 0.015 + Math.random() * (0.18 + p * 0.3);
      this.noise(0.012 + Math.random() * 0.02, 'highpass', 3600 + Math.random() * 3200, 5200, 0.05 + Math.random() * 0.07, d, 0.8);
    }
  }

  /** the pyro fountains on the corner towers: a hiss, a low whump and a shower of crackles */
  pyro(level: number) {
    this.noise(0.9 + level * 0.5, 'bandpass', 1400, 5200, 0.22 * level, 0, 0.7);
    this.tone('sine', 110, 46, 0.5, 0.45 * level);
    this.crackle(level);
  }

  /** the attack-indicator cue: a short blip for a normal strike, a rising two-tone alarm for an unblockable one */
  warn(red: boolean) {
    if (red) {
      this.tone('sawtooth', 240, 360, 0.14, 0.14);
      this.tone('sawtooth', 320, 520, 0.18, 0.14, 0.13);
    } else {
      this.tone('triangle', 880, 1100, 0.1, 0.13);
    }
  }

  ready() {
    this.tone('square', 440, 880, 0.15, 0.08);
    this.tone('square', 660, 1320, 0.2, 0.08, 0.1);
  }
  click(vol = 1) {
    this.tone('square', 900, 600, 0.06, 0.07 * vol);
  }
  /** a barely-there servo tick: used when the stance hand changes, so the switch reads without shouting */
  tick(vol = 1) {
    this.tone('sine', 380, 250, 0.05, 0.03 * vol);
  }
  /** heavy steel screeching as a joint is torn apart (used for the head rip) */
  screech(p: number) {
    this.tone('sawtooth', 190, 62, 0.5, 0.1 + p * 0.08);
    this.tone('square', 640, 180, 0.34, 0.05 + p * 0.05, 0.03);
    this.crackle(0.7 + p * 0.3);
  }
  say(text: string) {
    if (this.muted || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.85;
      u.pitch = 0.35;
      u.volume = 0.9;
      window.speechSynthesis.speak(u);
    } catch {
      /* ignore */
    }
  }

  // ---------- music ----------
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.nextT = this.ctx.currentTime + 0.1;
    this.stepIdx = 0;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }
  stopMusic() {
    this.musicOn = false;
    if (this.timer) window.clearInterval(this.timer);
  }
  private schedule() {
    const c = this.ctx;
    if (!c || !this.musicOn) return;
    const spb = 60 / 112 / 4;
    while (this.nextT < c.currentTime + 0.15) {
      this.playStep(this.stepIdx, this.nextT - c.currentTime);
      this.nextT += spb;
      this.stepIdx++;
    }
  }
  private playStep(i: number, delay: number) {
    const s = i % 16;
    const bar = Math.floor(i / 16);
    const mb = this.musicBus;
    const k = this.musicIntensity;
    if (s % 4 === 0 || (s === 10 && bar % 2 === 1)) this.tone('sine', 160, 40, 0.3, 0.9, delay, mb);
    if (s === 4 || s === 12) {
      this.noise(0.16, 'bandpass', 2000, 1200, 0.5, delay, 0.8, mb);
      this.tone('triangle', 220, 110, 0.12, 0.3, delay, mb);
    }
    if (s % 2 === 1) this.noise(0.04, 'highpass', 8000, 8000, 0.1 * k, delay, 1, mb);
    const bass = [41.2, 0, 41.2, 0, 49, 0, 41.2, 0, 55, 0, 41.2, 0, 61.7, 49, 41.2, 0];
    const f = bass[s];
    if (f) {
      this.tone('sawtooth', f * 2, f * 1.9, 0.22, 0.28 * k, delay, mb);
      this.tone('sine', f, f, 0.24, 0.5, delay, mb);
    }
    if (s === 0 && bar % 2 === 0) {
      [330, 497, 745].forEach((m) => this.tone('square', m, m * 0.99, 0.5, 0.05 * k, delay, mb));
    }
    if (s === 14 && bar % 4 === 3) this.noise(0.5, 'bandpass', 400, 4000, 0.3, delay, 1, mb);
  }
}
