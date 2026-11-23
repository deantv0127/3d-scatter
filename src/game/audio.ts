class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        muted ? 0 : 0.72,
        this.ctx.currentTime,
        0.02,
      );
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    if (!this.muted) {
      this.playClick();
    }
    return this.muted;
  }

  public unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.knee.value = 18;
      compressor.ratio.value = 6;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.16;

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.72;
      this.masterGain.connect(compressor);
      compressor.connect(this.ctx.destination);

      this.noiseBuffer = this.createNoiseBuffer(this.ctx);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 0.4);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private ensureReady(): boolean {
    if (this.muted) return false;
    this.unlock();
    return Boolean(this.ctx && this.masterGain);
  }

  public playClick(): void {
    if (!this.ensureReady() || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(640, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.032);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.036);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  public playSpinLaunch(): void {
    if (!this.ensureReady() || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // Rapid card riffle burst (5 micro card flicks)
    for (let i = 0; i < 5; i += 1) {
      const t = now + i * 0.028;
      if (this.noiseBuffer) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1600 + i * 280, t);
        filter.Q.value = 2.4;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.12, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.038);
        src.connect(filter);
        filter.connect(g);
        g.connect(this.masterGain);
        src.start(t);
        src.stop(t + 0.045);
      }
    }

    // Subtle rising shimmer sweep
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.19);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.21);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  public playCardSnap(columnIndex: number, isSpecial = false): void {
    if (!this.ensureReady() || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // Tactile ivory card snap on velvet baize
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const baseFreq = 195 + columnIndex * 22;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq * 1.4, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.65, now + 0.048);
    gain.gain.setValueAtTime(0.19, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.06);

    // Crisp paper edge transient
    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(2200, now);
      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.08, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.024);
      src.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.masterGain);
      src.start(now);
      src.stop(now + 0.03);
    }

    if (isSpecial) {
      const bell = this.ctx.createOscillator();
      const bGain = this.ctx.createGain();
      bell.type = 'sine';
      bell.frequency.setValueAtTime(987.77 + columnIndex * 65, now);
      bGain.gain.setValueAtTime(0.09, now);
      bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      bell.connect(bGain);
      bGain.connect(this.masterGain);
      bell.start(now);
      bell.stop(now + 0.24);
    }
  }

  public playScatterWin(cascadeStep: number): void {
    if (!this.ensureReady() || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    // Ascending pentatonic crystalline arpeggio that pitches up per cascade chain
    const rootShift = Math.pow(1.059463, Math.min(cascadeStep, 7));
    const notes = [523.25, 659.25, 783.99, 1046.5];

    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const t = now + idx * 0.052;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq * rootShift, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.14, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.36);
    });
  }

  public playCascadeTumble(): void {
    if (!this.ensureReady() || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(900, now);
      filter.frequency.exponentialRampToValueAtTime(360, now + 0.18);
      filter.Q.value = 1.5;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      src.start(now);
      src.stop(now + 0.2);
    }
  }

  public playMultiplierHit(multValue: number): void {
    if (!this.ensureReady() || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const boost = Math.min(multValue, 25) * 14;
    const freqs = [440 + boost, 659.25 + boost, 880 + boost * 1.3];

    freqs.forEach((f, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const t = now + idx * 0.03;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(f * 1.03, t + 0.28);
      gain.gain.setValueAtTime(0.14, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.44);
    });
  }

  public playBonusTrigger(): void {
    if (!this.ensureReady() || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const fanfare = [392.0, 493.88, 587.33, 783.99, 987.77, 1174.66];
    fanfare.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const t = now + idx * 0.075;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.16, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.58);
    });
  }

  public playBigWinTick(step: number): void {
    if (!this.ensureReady() || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(780 + (step % 8) * 55, now);
    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.065);
  }

  public playInspect(): void {
    if (!this.ensureReady() || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(760, now + 0.06);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.09);
  }
}

export const soundEngine = new SoundEngine();
