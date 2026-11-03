import { store } from './Storage';

type Wave = OscillatorType;

/** Fully procedural sound effects (WebAudio) so the game needs no audio assets. */
class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private jetGain: GainNode | null = null;
  private lastPlay = new Map<string, number>();

  /** Must be called from a user gesture (browsers / Android WebView block autoplay). */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = store.settings.sfx;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.startJet();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolume(v: number): void {
    if (this.master) this.master.gain.value = v;
  }

  private startJet(): void {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 520;
    bp.Q.value = 0.8;
    this.jetGain = c.createGain();
    this.jetGain.gain.value = 0;
    src.connect(bp).connect(this.jetGain).connect(this.master!);
    src.start();
  }

  jet(on: boolean): void {
    if (!this.ctx || !this.jetGain) return;
    this.jetGain.gain.setTargetAtTime(on ? 0.22 : 0, this.ctx.currentTime, 0.05);
  }

  private tone(freq: number, to: number, dur: number, type: Wave, gain: number, delay = 0): void {
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private hiss(dur: number, from: number, to: number, gain: number, delay = 0): void {
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master!);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  play(name: string, vol = 1): void {
    if (!this.ctx || !this.master || this.ctx.state !== 'running' || vol <= 0.02) return;
    // collapse identical sounds that fire inside the same few ms (shotgun pellets, chain explosions)
    const nowMs = performance.now();
    if (nowMs - (this.lastPlay.get(name) ?? 0) < 25) return;
    this.lastPlay.set(name, nowMs);
    const v = vol;
    switch (name) {
      case 'shoot_pistol':
        this.hiss(0.08, 3200, 700, 0.5 * v);
        this.tone(260, 90, 0.07, 'square', 0.18 * v);
        break;
      case 'shoot_assault':
        this.hiss(0.09, 2800, 500, 0.55 * v);
        this.tone(170, 60, 0.08, 'sawtooth', 0.2 * v);
        break;
      case 'shoot_mg':
        this.hiss(0.08, 2200, 400, 0.55 * v);
        this.tone(120, 50, 0.09, 'sawtooth', 0.26 * v);
        break;
      case 'shoot_shotgun':
        this.hiss(0.28, 2400, 200, 0.9 * v);
        this.tone(100, 38, 0.22, 'sawtooth', 0.35 * v);
        break;
      case 'shoot_sniper':
        this.hiss(0.4, 5000, 150, 0.9 * v);
        this.tone(520, 40, 0.3, 'sawtooth', 0.3 * v);
        break;
      case 'shoot_rocket':
        this.hiss(0.5, 1400, 150, 0.7 * v);
        this.tone(130, 45, 0.35, 'sawtooth', 0.25 * v);
        break;
      case 'shoot_magnum':
        this.hiss(0.2, 3500, 250, 0.9 * v);
        this.tone(190, 50, 0.18, 'square', 0.3 * v);
        break;
      case 'shoot_smg':
        this.hiss(0.06, 3600, 800, 0.45 * v);
        this.tone(230, 90, 0.05, 'square', 0.14 * v);
        break;
      case 'shoot_dmr':
        this.hiss(0.22, 4500, 250, 0.75 * v);
        this.tone(380, 60, 0.18, 'sawtooth', 0.26 * v);
        break;
      case 'shoot_plasma':
        this.tone(1100, 260, 0.12, 'sawtooth', 0.2 * v);
        this.tone(700, 200, 0.14, 'sine', 0.2 * v);
        break;
      case 'shoot_railgun':
        this.tone(1800, 50, 0.5, 'sawtooth', 0.3 * v);
        this.hiss(0.45, 6000, 200, 0.8 * v);
        this.tone(90, 30, 0.4, 'sine', 0.5 * v);
        break;
      case 'gas':
        this.hiss(1.1, 3200, 700, 0.55 * v);
        this.tone(160, 60, 0.3, 'sawtooth', 0.12 * v);
        break;
      case 'explosion':
        this.hiss(1.0, 1100, 50, 1.2 * v);
        this.tone(70, 22, 0.7, 'sine', 0.7 * v);
        break;
      case 'reload':
        this.tone(900, 700, 0.04, 'square', 0.12 * v);
        this.tone(500, 380, 0.05, 'square', 0.14 * v, 0.16);
        break;
      case 'empty':
        this.tone(1300, 1100, 0.025, 'square', 0.1 * v);
        break;
      case 'hit':
        this.tone(1900, 1500, 0.05, 'sine', 0.25 * v);
        break;
      case 'headshot':
        this.tone(2400, 1800, 0.07, 'sine', 0.3 * v);
        this.tone(1200, 900, 0.08, 'sine', 0.2 * v, 0.03);
        break;
      case 'hurt':
        this.tone(220, 80, 0.18, 'sawtooth', 0.28 * v);
        break;
      case 'jump':
        this.tone(280, 520, 0.1, 'sine', 0.16 * v);
        break;
      case 'switch':
        this.tone(520, 420, 0.05, 'square', 0.1 * v);
        break;
      case 'pickup':
        this.tone(620, 920, 0.1, 'sine', 0.25 * v);
        this.tone(920, 1300, 0.12, 'sine', 0.2 * v, 0.08);
        break;
      case 'throw':
        this.hiss(0.14, 900, 300, 0.3 * v);
        break;
      case 'kill':
        this.tone(700, 1250, 0.12, 'triangle', 0.3 * v);
        break;
      case 'death':
        this.hiss(0.35, 1500, 100, 0.5 * v);
        this.tone(300, 40, 0.4, 'sawtooth', 0.25 * v);
        break;
      case 'beep':
        this.tone(880, 880, 0.12, 'square', 0.18 * v);
        break;
      case 'go':
        this.tone(1320, 1320, 0.3, 'square', 0.2 * v);
        break;
      case 'ui':
        this.tone(980, 760, 0.05, 'triangle', 0.16 * v);
        break;
      case 'hover':
        this.tone(1300, 1300, 0.02, 'sine', 0.05 * v);
        break;
      case 'back':
        this.tone(560, 380, 0.07, 'triangle', 0.16 * v);
        break;
      case 'win':
        this.tone(520, 520, 0.15, 'triangle', 0.25 * v);
        this.tone(660, 660, 0.15, 'triangle', 0.25 * v, 0.15);
        this.tone(880, 880, 0.35, 'triangle', 0.25 * v, 0.3);
        break;
    }
  }
}

export const audio = new AudioManager();
