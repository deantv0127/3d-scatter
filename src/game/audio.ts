class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private muted = false;
  private musicEnabled = true;
  private voiceEnabled = true;
  private musicPlaying = false;
  private isFreeSpinMood = false;

  // 106 BPM step sequencer state
  private schedulerId: number | null = null;
  private nextNoteTime = 0;
  private currentStep = 0;
  private voiceDuckTimeout: number | null = null;

  // Minor-9th luxury lounge progression: Dm9 -> Bbmaj7 -> Gm7 -> A7sus4 (4 bars = 64 steps)
  private readonly chords: Array<{ bass: number; pad: number[]; arp: number[] }> = [
    {
      bass: 73.42, // D2
      pad: [146.83, 220.0, 261.63, 329.63], // D3, A3, C4, E4
      arp: [440.0, 523.25, 659.25, 587.33],
    },
    {
      bass: 58.27, // Bb1
      pad: [116.54, 174.61, 220.0, 293.66], // Bb2, F3, A3, D4
      arp: [349.23, 440.0, 587.33, 523.25],
    },
    {
      bass: 98.0, // G2
      pad: [196.0, 233.08, 293.66, 349.23], // G3, Bb3, D4, F4
      arp: [392.0, 466.16, 587.33, 698.46],
    },
    {
      bass: 55.0, // A1
      pad: [110.0, 164.81, 220.0, 293.66], // A2, E3, A3, D4
      arp: [329.63, 440.0, 587.33, 659.25],
    },
  ];

  public isMuted(): boolean {
    return this.muted;
  }

  public isMusicEnabled(): boolean {
    return this.musicEnabled;
  }

  public isVoiceEnabled(): boolean {
    return this.voiceEnabled;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.stopSpeech();
    }
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        muted ? 0 : 0.78,
        this.ctx.currentTime,
        0.025,
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

  public toggleMusic(): boolean {
    this.musicEnabled = !this.musicEnabled;
    this.unlock();
    if (this.musicGain && this.ctx) {
      const target = this.musicEnabled && !this.muted ? 0.24 : 0;
      this.musicGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    }
    if (this.musicEnabled && !this.musicPlaying) {
      this.startMusic();
    }
    this.playClick();
    return this.musicEnabled;
  }

  public toggleVoice(): boolean {
    this.voiceEnabled = !this.voiceEnabled;
    if (!this.voiceEnabled) {
      this.stopSpeech();
    } else {
      this.unlock();
      this.speak('Voice announcer active.', true);
    }
    this.playClick();
    return this.voiceEnabled;
  }

  public setFreeSpinMood(active: boolean): void {
    this.isFreeSpinMood = active;
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
      this.masterGain.gain.value = this.muted ? 0 : 0.78;
      this.masterGain.connect(compressor);
      compressor.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.9;
      this.sfxGain.connect(this.masterGain);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicEnabled ? 0.24 : 0;
      this.musicGain.connect(this.masterGain);

      this.noiseBuffer = this.createNoiseBuffer(this.ctx);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  public startMusic(): void {
    this.unlock();
    if (!this.ctx || this.musicPlaying) return;
    this.musicPlaying = true;
    this.currentStep = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.06;

    if (this.musicGain) {
      this.musicGain.gain.setTargetAtTime(
        this.musicEnabled ? 0.24 : 0,
        this.ctx.currentTime,
        0.15,
      );
    }

    this.schedulerId = window.setInterval(() => {
      this.scheduleMusicLookahead();
    }, 60);
  }

  public stopMusic(): void {
    this.musicPlaying = false;
    if (this.schedulerId !== null) {
      window.clearInterval(this.schedulerId);
      this.schedulerId = null;
    }
  }

  private scheduleMusicLookahead(): void {
    if (!this.ctx || !this.musicGain || !this.musicPlaying) return;
    if (this.ctx.state === 'suspended') return;
    if (!this.musicEnabled || this.muted) {
      // Keep cursor synced without generating voices when muted/disabled
      this.nextNoteTime = this.ctx.currentTime + 0.06;
      return;
    }

    const stepDuration = 60 / (this.isFreeSpinMood ? 114 : 104) / 4; // 16th note
    while (this.nextNoteTime < this.ctx.currentTime + 0.18) {
      this.triggerMusicStep(this.currentStep, this.nextNoteTime, stepDuration);
      this.nextNoteTime += stepDuration;
      this.currentStep = (this.currentStep + 1) % 64;
    }
  }

  private triggerMusicStep(step: number, time: number, stepDur: number): void {
    if (!this.ctx || !this.musicGain) return;
    const barIdx = Math.floor(step / 16);
    const stepInBar = step % 16;
    const chord = this.chords[barIdx];

    // Warm pad chord on beat 1 of each bar
    if (stepInBar === 0) {
      const padDur = stepDur * 15.5;
      chord.pad.forEach((freq, idx) => {
        if (!this.ctx || !this.musicGain) return;
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();
        osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, time);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(this.isFreeSpinMood ? 980 : 720, time);

        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.linearRampToValueAtTime(0.085, time + 0.18);
        gain.gain.setValueAtTime(0.075, time + padDur - 0.25);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + padDur);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.musicGain);
        osc.start(time);
        osc.stop(time + padDur + 0.02);
      });
    }

    // Smooth lounge bass groove (steps 0, 6, 8, 12)
    if (
      stepInBar === 0 ||
      stepInBar === 6 ||
      stepInBar === 8 ||
      stepInBar === 12
    ) {
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      const bassNote =
        stepInBar === 12 ? chord.bass * 1.5 : chord.bass;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(bassNote, time);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(360, time);

      const dur = stepInBar === 0 ? stepDur * 4.5 : stepDur * 2.2;
      gain.gain.setValueAtTime(0.001, time);
      gain.gain.linearRampToValueAtTime(0.24, time + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain);
      osc.start(time);
      osc.stop(time + dur + 0.02);
    }

    // Soft brushed casino shaker on off-beats (2, 6, 10, 14)
    if (stepInBar % 4 === 2 && this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(4800, time);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.04, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.045);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain);
      src.start(time);
      src.stop(time + 0.05);
    }

    // Delicate Rhodes/bell shimmer arpeggio accents
    if (
      stepInBar === 4 ||
      stepInBar === 10 ||
      (this.isFreeSpinMood && (stepInBar === 2 || stepInBar === 14))
    ) {
      const noteIdx = (barIdx + Math.floor(stepInBar / 2)) % chord.arp.length;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(chord.arp[noteIdx], time);
      gain.gain.setValueAtTime(0.001, time);
      gain.gain.linearRampToValueAtTime(0.065, time + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0005, time + stepDur * 3.5);
      osc.connect(gain);
      gain.connect(this.musicGain);
      osc.start(time);
      osc.stop(time + stepDur * 3.6);
    }
  }

  private duckMusic(duck: boolean): void {
    if (!this.ctx || !this.musicGain) return;
    if (!this.musicEnabled || this.muted) return;
    const target = duck ? 0.07 : 0.24;
    this.musicGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
  }

  public stopSpeech(): void {
    if (this.voiceDuckTimeout) {
      window.clearTimeout(this.voiceDuckTimeout);
      this.voiceDuckTimeout = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.duckMusic(false);
  }

  private speak(text: string, interrupt = true): void {
    if (this.muted || !this.voiceEnabled) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    try {
      const synth = window.speechSynthesis;
      if (interrupt) {
        synth.cancel();
      }

      const utter = new SpeechSynthesisUtterance(text);
      const voices = synth.getVoices();
      const preferred =
        voices.find(
          (v) =>
            v.lang.startsWith('en') &&
            /Natural|Google|Samantha|Daniel|Arthur|Aria|Serena/i.test(v.name),
        ) || voices.find((v) => v.lang.startsWith('en'));

      if (preferred) {
        utter.voice = preferred;
      }
      utter.lang = 'en-US';
      utter.rate = 1.04;
      utter.pitch = 1.0;
      utter.volume = 0.92;

      this.duckMusic(true);
      if (this.voiceDuckTimeout) {
        window.clearTimeout(this.voiceDuckTimeout);
      }
      this.voiceDuckTimeout = window.setTimeout(() => {
        this.duckMusic(false);
      }, 3600);

      utter.onend = () => {
        if (this.voiceDuckTimeout) {
          window.clearTimeout(this.voiceDuckTimeout);
          this.voiceDuckTimeout = null;
        }
        this.duckMusic(false);
      };
      utter.onerror = () => {
        this.duckMusic(false);
      };

      synth.speak(utter);
    } catch {
      this.duckMusic(false);
    }
  }

  public announceMultiplier(tierMultiplier: number, isMaxTier: boolean): void {
    const phrase = isMaxTier
      ? `${tierMultiplier}x maximum multiplier!`
      : `${tierMultiplier}x multiplier`;
    this.speak(phrase, true);
  }

  public announceFoilMultiplier(totalExtra: number): void {
    this.speak(`Multiplier boosted to ${totalExtra}x!`, true);
  }

  public announceWin(
    amount: number,
    peakMultiplier: number,
    isBig: boolean,
  ): void {
    const whole = Math.floor(amount);
    const cents = Math.round((amount - whole) * 100);
    const moneyText =
      cents > 0
        ? `${whole} dollars and ${cents} cents`
        : `${whole} ${whole === 1 ? 'dollar' : 'dollars'}`;

    const prefix = isBig ? 'Sovereign win!' : 'You won';
    const multNote =
      peakMultiplier >= 2 ? ` at ${peakMultiplier}x multiplier` : '';
    const line = isBig
      ? `${prefix} ${moneyText}${multNote}!`
      : `${prefix} ${moneyText}${multNote}.`;
    this.speak(line, true);
  }

  public announceBonus(spinsAwarded: number, retrigger: boolean): void {
    const line = retrigger
      ? `Bonus retriggered! Plus ${spinsAwarded} free spins!`
      : `Arcana vault unlocked! ${spinsAwarded} free spins!`;
    this.speak(line, true);
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

  private ensureSfxReady(): boolean {
    if (this.muted) return false;
    this.unlock();
    return Boolean(this.ctx && this.sfxGain);
  }

  public playClick(): void {
    if (!this.ensureSfxReady() || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(640, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.032);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.036);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  public playSpinLaunch(): void {
    if (!this.ensureSfxReady() || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    for (let i = 0; i < 5; i += 1) {
      const t = now + i * 0.026;
      if (this.noiseBuffer) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1600 + i * 280, t);
        filter.Q.value = 2.4;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.11, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.036);
        src.connect(filter);
        filter.connect(g);
        g.connect(this.sfxGain);
        src.start(t);
        src.stop(t + 0.042);
      }
    }

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.17);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  public playCardSnap(columnIndex: number, isSpecial = false): void {
    if (!this.ensureSfxReady() || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const baseFreq = 195 + columnIndex * 22;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq * 1.4, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.65, now + 0.048);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.06);

    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(2200, now);
      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.075, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.024);
      src.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.sfxGain);
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
      bGain.connect(this.sfxGain);
      bell.start(now);
      bell.stop(now + 0.24);
    }
  }

  public playScatterWin(cascadeStep: number): void {
    if (!this.ensureSfxReady() || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const rootShift = Math.pow(1.059463, Math.min(cascadeStep, 7));
    const notes = [523.25, 659.25, 783.99, 1046.5];

    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.sfxGain) return;
      const t = now + idx * 0.05;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq * rootShift, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.14, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.36);
    });
  }

  public playCascadeTumble(): void {
    if (!this.ensureSfxReady() || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(900, now);
      filter.frequency.exponentialRampToValueAtTime(360, now + 0.16);
      filter.Q.value = 1.5;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.095, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);
      src.start(now);
      src.stop(now + 0.18);
    }
  }

  public playMultiplierHit(multValue: number): void {
    if (!this.ensureSfxReady() || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const boost = Math.min(multValue, 25) * 14;
    const freqs = [440 + boost, 659.25 + boost, 880 + boost * 1.3];

    freqs.forEach((f, idx) => {
      if (!this.ctx || !this.sfxGain) return;
      const t = now + idx * 0.03;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(f * 1.03, t + 0.28);
      gain.gain.setValueAtTime(0.14, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.44);
    });
  }

  public playBonusTrigger(): void {
    if (!this.ensureSfxReady() || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const fanfare = [392.0, 493.88, 587.33, 783.99, 987.77, 1174.66];
    fanfare.forEach((freq, idx) => {
      if (!this.ctx || !this.sfxGain) return;
      const t = now + idx * 0.075;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.16, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.58);
    });
  }

  public playBigWinTick(step: number): void {
    if (!this.ensureSfxReady() || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(780 + (step % 8) * 55, now);
    gain.gain.setValueAtTime(0.065, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  public playInspect(): void {
    if (!this.ensureSfxReady() || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(760, now + 0.06);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.09);
  }
}

export const soundEngine = new SoundEngine();
