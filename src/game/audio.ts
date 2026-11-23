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

  private schedulerId: number | null = null;
  private nextNoteTime = 0;
  private currentStep = 0;
  private voiceDuckTimeout: number | null = null;

  // Classic Vegas Jazz-Funk ii–V–I–VI turnaround (Dm9 -> G13 -> Cmaj9 -> A7alt)
  // 4 bars x 16 steps = 64 steps
  private readonly bars: Array<{
    bassLine: Array<number | null>;
    chord: number[];
    melody: Array<number | null>;
  }> = [
    {
      // Bar 1: Dm9 (D2 bass, F3-A3-C4-E4 Rhodes)
      bassLine: [
        73.42, null, null, 73.42, null, null, 110.0, null,
        146.83, null, 130.81, null, 110.0, null, 98.0, null,
      ],
      chord: [174.61, 220.0, 261.63, 329.63],
      melody: [
        587.33, null, null, 659.25, null, null, 523.25, null,
        null, 440.0, null, null, 523.25, null, null, null,
      ],
    },
    {
      // Bar 2: G13 (G1/G2 bass, F3-A3-B3-E4 Rhodes)
      bassLine: [
        98.0, null, null, 98.0, null, null, 123.47, null,
        146.83, null, null, 123.47, 98.0, null, 110.0, null,
      ],
      chord: [174.61, 220.0, 246.94, 329.63],
      melody: [
        587.33, null, 659.25, null, 783.99, null, null, 659.25,
        null, null, 587.33, null, 493.88, null, null, null,
      ],
    },
    {
      // Bar 3: Cmaj9 (C2 bass, E3-G3-B3-D4 Rhodes)
      bassLine: [
        65.41, null, null, 65.41, null, null, 98.0, null,
        130.81, null, 123.47, null, 98.0, null, 82.41, null,
      ],
      chord: [164.81, 196.0, 246.94, 293.66],
      melody: [
        523.25, null, null, 659.25, null, null, 783.99, null,
        null, 659.25, null, 587.33, 523.25, null, null, null,
      ],
    },
    {
      // Bar 4: A7#9 turnaround (A1/A2 bass, G3-C#4-E4-C5 Rhodes)
      bassLine: [
        55.0, null, null, 55.0, null, null, 82.41, null,
        110.0, null, null, 98.0, 82.41, null, 65.41, null,
      ],
      chord: [196.0, 277.18, 329.63, 440.0],
      melody: [
        440.0, null, 523.25, null, 659.25, null, null, 587.33,
        null, 554.37, null, null, 440.0, null, null, null,
      ],
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
      const target = this.musicEnabled && !this.muted ? 0.28 : 0;
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
      this.speak('Voice on', true);
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
      this.musicGain.gain.value = this.musicEnabled ? 0.28 : 0;
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
    this.nextNoteTime = this.ctx.currentTime + 0.05;

    if (this.musicGain) {
      this.musicGain.gain.setTargetAtTime(
        this.musicEnabled ? 0.28 : 0,
        this.ctx.currentTime,
        0.15,
      );
    }

    this.schedulerId = window.setInterval(() => {
      this.scheduleMusicLookahead();
    }, 50);
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
      this.nextNoteTime = this.ctx.currentTime + 0.05;
      return;
    }

    const bpm = this.isFreeSpinMood ? 124 : 116;
    const stepDuration = 60 / bpm / 4; // 16th note
    while (this.nextNoteTime < this.ctx.currentTime + 0.18) {
      // Subtle swing on odd 16ths for authentic Vegas jazz-funk feel
      const isOdd16th = this.currentStep % 2 === 1;
      const swingOffset = isOdd16th ? stepDuration * 0.16 : 0;
      this.triggerCasinoStep(
        this.currentStep,
        this.nextNoteTime + swingOffset,
        stepDuration,
      );
      this.nextNoteTime += stepDuration;
      this.currentStep = (this.currentStep + 1) % 64;
    }
  }

  private triggerCasinoStep(step: number, time: number, stepDur: number): void {
    if (!this.ctx || !this.musicGain) return;
    const barIdx = Math.floor(step / 16);
    const stepInBar = step % 16;
    const bar = this.bars[barIdx];

    // 1. Tight Casino Kick Drum (beats 0, 8 in base; 0, 4, 8, 12 in Free Spins)
    const hitKick = this.isFreeSpinMood
      ? stepInBar % 4 === 0
      : stepInBar === 0 || stepInBar === 8 || stepInBar === 10;
    if (hitKick) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(125, time);
      osc.frequency.exponentialRampToValueAtTime(44, time + 0.085);
      gain.gain.setValueAtTime(0.38, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);
      osc.connect(gain);
      gain.connect(this.musicGain);
      osc.start(time);
      osc.stop(time + 0.15);
    }

    // 2. Crisp Rimshot / Snare Backbeat (steps 4 and 12)
    if (stepInBar === 4 || stepInBar === 12) {
      // Woody rim body
      const body = this.ctx.createOscillator();
      const bodyGain = this.ctx.createGain();
      body.type = 'triangle';
      body.frequency.setValueAtTime(210, time);
      body.frequency.exponentialRampToValueAtTime(110, time + 0.045);
      bodyGain.gain.setValueAtTime(0.16, time);
      bodyGain.gain.exponentialRampToValueAtTime(0.001, time + 0.065);
      body.connect(bodyGain);
      bodyGain.connect(this.musicGain);
      body.start(time);
      body.stop(time + 0.07);

      // Snare crisp brush
      if (this.noiseBuffer) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(2400, time);
        filter.Q.value = 1.2;
        const nGain = this.ctx.createGain();
        nGain.gain.setValueAtTime(0.11, time);
        nGain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
        src.connect(filter);
        filter.connect(nGain);
        nGain.connect(this.musicGain);
        src.start(time);
        src.stop(time + 0.09);
      }
    }

    // 3. Swung Jazz Hi-Hat Groove
    if (stepInBar % 2 === 0 || (this.isFreeSpinMood && stepInBar % 2 === 1)) {
      if (this.noiseBuffer) {
        const isOffbeat = stepInBar % 4 === 2;
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(6400, time);
        const gain = this.ctx.createGain();
        const level = isOffbeat ? 0.065 : stepInBar % 4 === 0 ? 0.032 : 0.018;
        const hatDur = isOffbeat ? 0.055 : 0.028;
        gain.gain.setValueAtTime(level, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + hatDur);
        src.connect(filter);
        filter.connect(gain);
        gain.connect(this.musicGain);
        src.start(time);
        src.stop(time + hatDur + 0.01);
      }
    }

    // 4. Funky Walking Casino Bassline
    const bassFreq = bar.bassLine[stepInBar];
    if (bassFreq) {
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(bassFreq, time);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(680, time);
      filter.frequency.exponentialRampToValueAtTime(260, time + stepDur * 1.8);

      const dur = stepDur * 1.85;
      gain.gain.setValueAtTime(0.001, time);
      gain.gain.linearRampToValueAtTime(0.22, time + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain);
      osc.start(time);
      osc.stop(time + dur + 0.02);
    }

    // 5. Syncopated Electric Piano / Rhodes Jazz Chords (steps 0, 6, 14)
    const isShortStab = stepInBar === 6 || stepInBar === 14;
    if (stepInBar === 0 || isShortStab) {
      const chordDur = isShortStab ? stepDur * 1.9 : stepDur * 4.8;
      bar.chord.forEach((freq, idx) => {
        if (!this.ctx || !this.musicGain) return;
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();
        osc.type = idx === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, time);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(isShortStab ? 1850 : 1400, time);

        const amp = isShortStab ? 0.058 : 0.068;
        gain.gain.setValueAtTime(0.0005, time);
        gain.gain.linearRampToValueAtTime(amp, time + 0.014);
        gain.gain.exponentialRampToValueAtTime(0.0005, time + chordDur);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.musicGain);
        osc.start(time);
        osc.stop(time + chordDur + 0.02);
      });
    }

    // 6. Crisp Vegas Vibraphone Melody Hook
    const melFreq = bar.melody[stepInBar];
    if (melFreq) {
      const osc = this.ctx.createOscillator();
      const overtone = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const ovGain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(melFreq, time);
      overtone.type = 'sine';
      overtone.frequency.setValueAtTime(melFreq * 4, time); // vibraphone chime transient

      const dur = stepDur * 2.8;
      gain.gain.setValueAtTime(0.001, time);
      gain.gain.linearRampToValueAtTime(0.08, time + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0005, time + dur);

      ovGain.gain.setValueAtTime(0.024, time);
      ovGain.gain.exponentialRampToValueAtTime(0.0005, time + 0.065);

      osc.connect(gain);
      overtone.connect(ovGain);
      gain.connect(this.musicGain);
      ovGain.connect(this.musicGain);

      osc.start(time);
      overtone.start(time);
      osc.stop(time + dur + 0.02);
      overtone.stop(time + 0.075);
    }
  }

  private duckMusic(duck: boolean): void {
    if (!this.ctx || !this.musicGain) return;
    if (!this.musicEnabled || this.muted) return;
    const target = duck ? 0.09 : 0.28;
    this.musicGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.07);
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
      utter.rate = 1.12;
      utter.pitch = 1.02;
      utter.volume = 0.92;

      this.duckMusic(true);
      if (this.voiceDuckTimeout) {
        window.clearTimeout(this.voiceDuckTimeout);
      }
      this.voiceDuckTimeout = window.setTimeout(() => {
        this.duckMusic(false);
      }, 1800);

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

  public announceMultiplier(tierMultiplier: number): void {
    this.speak(`${tierMultiplier} times`, true);
  }

  public announceBonus(spinsAwarded: number): void {
    this.speak(`${spinsAwarded} free spins`, true);
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

  public playRollupTick(progress01: number): void {
    if (!this.ensureSfxReady() || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const p = Math.max(0, Math.min(1, progress01));
    const baseFreq = 520 + p * 660;

    const osc = this.ctx.createOscillator();
    const shimmer = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.06, now + 0.045);

    shimmer.type = 'sine';
    shimmer.frequency.setValueAtTime(baseFreq * 1.5, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.075, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

    osc.connect(gain);
    shimmer.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    shimmer.start(now);
    osc.stop(now + 0.07);
    shimmer.stop(now + 0.07);
  }

  public playFreeSpinFinale(hasWin: boolean): void {
    if (!this.ensureSfxReady() || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const notes = hasWin
      ? [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98]
      : [440.0, 523.25];

    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.sfxGain) return;
      const t = now + idx * 0.065;
      const osc = this.ctx.createOscillator();
      const harmonic = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = hasWin ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, t);

      harmonic.type = 'sine';
      harmonic.frequency.setValueAtTime(freq * 2, t);

      const peak = hasWin ? 0.14 : 0.08;
      const decay = idx === notes.length - 1 ? 0.85 : 0.45;
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(peak, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + decay);

      osc.connect(gain);
      harmonic.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(t);
      harmonic.start(t);
      osc.stop(t + decay + 0.03);
      harmonic.stop(t + decay + 0.03);
    });
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
