/**
 * Music System — procedural ambient music with boss leitmotifs
 * Per design spec: sparse exploration (solo cello, choir, wind),
 * full orchestral-choral for boss fights, each boss gets a 2-4 note leitmotif
 */

import { MathUtils } from '../engine/math.js';

export type MusicRegion = 'hub' | 'exploration' | 'combat' | 'boss_ashgrave' | 'boss_corvain' | 'boss_bloomwarden';

export class MusicSystem {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private currentRegion: MusicRegion = 'hub';
  private isPlaying = false;

  // Oscillator pools
  private drones: OscillatorNode[] = [];
  private droneGains: GainNode[] = [];
  private leitmotifTimeout: number | null = null;

  constructor() {}

  init(ctx: AudioContext, masterGain: GainNode): void {
    this.ctx = ctx;
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.25;
    this.musicGain.connect(masterGain);
    this.masterGain = masterGain;
  }

  /** Switch music region */
  setRegion(region: MusicRegion): void {
    if (region === this.currentRegion) return;
    this.currentRegion = region;
    this.transitionTo(region);
  }

  getCurrentRegion(): MusicRegion { return this.currentRegion; }

  /** Start ambient music */
  start(): void {
    if (!this.ctx || !this.musicGain || this.isPlaying) return;
    this.isPlaying = true;
    this.transitionTo(this.currentRegion);
  }

  /** Stop all music */
  stop(): void {
    this.isPlaying = false;
    for (const drone of this.drones) {
      try { drone.stop(); } catch {}
    }
    this.drones = [];
    this.droneGains = [];
    if (this.leitmotifTimeout !== null) {
      clearTimeout(this.leitmotifTimeout);
      this.leitmotifTimeout = null;
    }
  }

  private transitionTo(region: MusicRegion): void {
    if (!this.ctx || !this.musicGain) return;

    // Fade out current drones
    const now = this.ctx.currentTime;
    for (const gain of this.droneGains) {
      gain.gain.linearRampToValueAtTime(0, now + 2);
    }

    // Stop old drones after fade
    const oldDrones = [...this.drones];
    setTimeout(() => {
      for (const d of oldDrones) {
        try { d.stop(); } catch {}
      }
    }, 2500);
    this.drones = [];
    this.droneGains = [];

    // Start new ambient layer
    setTimeout(() => {
      if (!this.isPlaying) return;
      this.startAmbientForRegion(region);
    }, 1500);
  }

  private startAmbientForRegion(region: MusicRegion): void {
    if (!this.ctx || !this.musicGain) return;
    const ctx = this.ctx;

    switch (region) {
      case 'hub':
        // Sparse, calm — low drone + occasional high notes
        this.createDrone(65.41, 0.08); // C2
        this.createDrone(98.00, 0.05); // G2
        this.scheduleLeitmotif([261.63, 329.63, 392.00], 8, 0.1); // C4, E4, G4
        break;

      case 'exploration':
        // Solo cello feel — low strings, wind noise
        this.createDrone(73.42, 0.06); // D2
        this.createDrone(110.00, 0.04); // A2
        this.scheduleLeitmotif([196.00, 233.08, 261.63], 12, 0.08); // G3, Bb3, C4
        break;

      case 'combat':
        // Percussion-like pulses, tense strings
        this.createDrone(82.41, 0.1); // E2
        this.createDrone(123.47, 0.07); // B2
        this.createPulse(2, 0.06);
        break;

      case 'boss_ashgrave':
        // Heavy, oppressive — low brass feel, Ashgrave leitmotif (C-Eb-G)
        this.createDrone(55.00, 0.12); // A1
        this.createDrone(82.41, 0.08); // E2
        this.createPulse(1.5, 0.1);
        this.scheduleLeitmotif([130.81, 155.56, 196.00], 6, 0.15); // C3, Eb3, G3
        break;

      case 'boss_corvain':
        // Noble, tragic — cleaner tones, Corvain leitmotif (D-F#-A)
        this.createDrone(73.42, 0.1); // D2
        this.createDrone(110.00, 0.06); // A2
        this.scheduleLeitmotif([146.83, 185.00, 220.00], 7, 0.12); // D3, F#3, A3
        break;

      case 'boss_bloomwarden':
        // Haunting, organic — Bloomwarden leitmotif (Ab-B-Eb)
        this.createDrone(51.91, 0.1); // Ab1
        this.createDrone(77.78, 0.07); // Eb2
        this.scheduleLeitmotif([103.83, 123.47, 155.56], 9, 0.1); // Ab2, B2, Eb3
        break;
    }
  }

  private createDrone(frequency: number, volume: number): void {
    if (!this.ctx || !this.musicGain) return;
    const ctx = this.ctx;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.value = frequency;

    filter.type = 'lowpass';
    filter.frequency.value = 300;
    filter.Q.value = 1;

    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 3);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    osc.start();

    this.drones.push(osc);
    this.droneGains.push(gain);
  }

  private createPulse(bpm: number, volume: number): void {
    if (!this.ctx || !this.musicGain) return;
    const ctx = this.ctx;

    const interval = 60 / bpm;
    const schedulePulse = () => {
      if (!this.isPlaying || !this.ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.value = 50;

      const now = ctx.currentTime;
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      osc.connect(gain);
      gain.connect(this.musicGain!);
      osc.start(now);
      osc.stop(now + 0.3);

      this.leitmotifTimeout = window.setTimeout(schedulePulse, interval * 1000);
    };
    schedulePulse();
  }

  private scheduleLeitmotif(notes: number[], intervalSec: number, volume: number): void {
    if (!this.ctx || !this.musicGain) return;
    const ctx = this.ctx;
    let noteIndex = 0;

    const playNext = () => {
      if (!this.isPlaying || !this.ctx) return;

      const freq = notes[noteIndex % notes.length];
      noteIndex++;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'sine';
      osc.frequency.value = freq;

      filter.type = 'lowpass';
      filter.frequency.value = 500;

      const now = ctx.currentTime;
      const duration = 1.5;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volume, now + 0.3);
      gain.gain.linearRampToValueAtTime(0, now + duration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain!);
      osc.start(now);
      osc.stop(now + duration);

      // Add slight vibrato
      const vibrato = ctx.createOscillator();
      const vibratoGain = ctx.createGain();
      vibrato.frequency.value = 4 + Math.random() * 2;
      vibratoGain.gain.value = freq * 0.01;
      vibrato.connect(vibratoGain);
      vibratoGain.connect(osc.frequency);
      vibrato.start(now);
      vibrato.stop(now + duration);

      const jitter = intervalSec * (0.8 + Math.random() * 0.4);
      this.leitmotifTimeout = window.setTimeout(playNext, jitter * 1000);
    };

    // Start after a random delay
    const initialDelay = intervalSec * Math.random();
    this.leitmotifTimeout = window.setTimeout(playNext, initialDelay * 1000);
  }

  setVolume(v: number): void {
    if (this.musicGain) {
      this.musicGain.gain.linearRampToValueAtTime(v, (this.ctx?.currentTime ?? 0) + 0.1);
    }
  }
}
