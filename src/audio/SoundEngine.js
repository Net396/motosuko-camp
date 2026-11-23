/**
 * 100% Procedural Spatial Web Audio Soundscape for Motosuko Solo Camp.
 * Zero external audio file dependencies — synthesizes realistic lake waves,
 * mountain pine wind, crackling campfire, sizzling cast-iron skillet, boiling kettle,
 * pour-over trickle, axe splitting wood, flint sparks, autumn crickets, and gravel footsteps.
 */
export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.ready = false;
    this._crackleAccum = 0;
    this._birdAccum = 0;
    this._cricketAccum = 0;
  }

  init() {
    if (this.ready) {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.72;
    this.master.connect(this.ctx.destination);

    this.noiseBuf = this._createNoiseBuffer(3.0, false);
    this.pinkBuf = this._createNoiseBuffer(4.0, true);

    this._setupAmbientLoops();
    this.ready = true;
  }

  _createNoiseBuffer(seconds, pink) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      if (!pink) {
        data[i] = white;
      } else {
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.055;
        b6 = white * 0.115926;
      }
    }
    return buf;
  }

  _makeLoopSource(buf, filterType, freq, q = 1.0, initialGain = 0.0) {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.value = initialGain;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start();
    return { src, filter, gain };
  }

  _setupAmbientLoops() {
    // 1. Lake Motosuko gentle shoreline waves
    this.lakeLoop = this._makeLoopSource(this.pinkBuf, 'lowpass', 360, 0.7, 0.09);

    // 2. Alpine cedar forest breeze
    this.windLoop = this._makeLoopSource(this.pinkBuf, 'bandpass', 480, 1.8, 0.045);

    // 3. Campfire warm roaring body
    this.fireRoarLoop = this._makeLoopSource(this.pinkBuf, 'lowpass', 210, 0.9, 0.0);

    // 4. Cast-iron skillet meat sizzle
    this.sizzleLoop = this._makeLoopSource(this.noiseBuf, 'bandpass', 4800, 1.1, 0.0);

    // 5. Boiling kettle / pot simmering water
    this.boilLoop = this._makeLoopSource(this.pinkBuf, 'bandpass', 720, 2.2, 0.0);

    // 6. Pour-over coffee thin hot water stream
    this.pourLoop = this._makeLoopSource(this.noiseBuf, 'bandpass', 1850, 2.8, 0.0);
  }

  update(dt, elapsed, state) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;

    // Gentle rhythmic Lake Motosuko wave surge
    const shoreDist = Math.max(2.0, state.distToShore || 10.0);
    const waveLfo = 0.55 + 0.45 * Math.sin(elapsed * 0.55) * Math.sin(elapsed * 0.23 + 0.8);
    const lakeVol = Math.min(0.24, (1.1 / (1 + shoreDist * 0.07)) * (0.07 + 0.11 * waveLfo));
    this.lakeLoop.gain.gain.setTargetAtTime(lakeVol, now, 0.12);
    this.lakeLoop.filter.frequency.setTargetAtTime(240 + 260 * waveLfo, now, 0.15);

    // Wind gusts through cedars
    const windN = Math.min(1.0, (state.windSpeed || 2.0) / 5.0);
    const gust = 0.65 + 0.35 * Math.sin(elapsed * 0.43 + 1.4);
    this.windLoop.gain.gain.setTargetAtTime(0.025 + windN * 0.095 * gust, now, 0.2);
    this.windLoop.filter.frequency.setTargetAtTime(340 + windN * 420 * gust, now, 0.2);

    // Campfire spatial attenuation + roar + organic wood pops
    const fireDist = Math.max(0.7, state.distToFire || 4.0);
    const fireAtten = 1.0 / (1.0 + fireDist * fireDist * 0.18);
    const fInt = state.fireIntensity || 0;
    this.fireRoarLoop.gain.gain.setTargetAtTime(fInt * fireAtten * 0.34, now, 0.08);
    this.fireRoarLoop.filter.frequency.setTargetAtTime(160 + fInt * 220, now, 0.1);

    if (fInt > 0.06) {
      this._crackleAccum += dt * (2.5 + fInt * 12.0);
      while (this._crackleAccum >= 1.0) {
        this._crackleAccum -= 1.0;
        if (Math.random() < 0.72) {
          this._playFireCrackle(fireAtten * (0.3 + fInt * 0.7));
        }
      }
    }

    // Skillet sizzle & kettle boil
    const sizzleVol = (state.sizzleLevel || 0) * fireAtten * 0.16;
    this.sizzleLoop.gain.gain.setTargetAtTime(sizzleVol, now, 0.08);

    const boilVol = (state.boilLevel || 0) * fireAtten * 0.12;
    this.boilLoop.gain.gain.setTargetAtTime(boilVol, now, 0.1);

    const pourVol = state.isPouring ? 0.11 : 0.0;
    this.pourLoop.gain.gain.setTargetAtTime(pourVol, now, 0.06);

    // Dusk / Night Japanese autumn crickets (鈴虫 Suzumushi)
    const sunElev = state.sunElevation ?? 0.2;
    if (sunElev < 0.05) {
      this._cricketAccum += dt;
      if (this._cricketAccum > 1.8 + Math.random() * 2.2) {
        this._cricketAccum = 0;
        const nightStrength = Math.min(1.0, (0.05 - sunElev) / 0.16);
        this._playCricketTrill(0.018 * nightStrength);
      }
    }

    // Morning Japanese bush warbler / woodland birds
    if (sunElev > 0.0 && sunElev < 0.45 && (state.timeOfDay || 16) < 12.5) {
      this._birdAccum += dt;
      if (this._birdAccum > 5.5 + Math.random() * 6.0) {
        this._birdAccum = 0;
        this._playMorningBird(0.032);
      }
    }
  }

  _playFireCrackle(vol) {
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1600 + Math.random() * 4400;
    bp.Q.value = 2.5 + Math.random() * 4.0;
    const g = this.ctx.createGain();
    const peak = Math.min(0.28, vol * (0.12 + Math.random() * 0.22));
    const dur = 0.012 + Math.random() * 0.028;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), now + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start(now, Math.random() * 2.0, dur + 0.01);
  }

  _playCricketTrill(vol) {
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    const baseFreq = 4150 + Math.random() * 350;
    osc.frequency.value = baseFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    const pulses = 5 + Math.floor(Math.random() * 5);
    for (let i = 0; i < pulses; i++) {
      const t = now + i * 0.065;
      g.gain.linearRampToValueAtTime(vol, t + 0.015);
      g.gain.linearRampToValueAtTime(0.0001, t + 0.055);
    }
    osc.connect(g);
    g.connect(this.master);
    osc.start(now);
    osc.stop(now + pulses * 0.065 + 0.05);
  }

  _playMorningBird(vol) {
    // Classic Japanese Uguisu-inspired melodic two-note call
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    const g = this.ctx.createGain();
    osc.frequency.setValueAtTime(1650, now);
    osc.frequency.exponentialRampToValueAtTime(2200, now + 0.35);
    osc.frequency.setValueAtTime(2650, now + 0.42);
    osc.frequency.exponentialRampToValueAtTime(2050, now + 0.56);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(vol, now + 0.08);
    g.gain.linearRampToValueAtTime(vol * 0.3, now + 0.38);
    g.gain.linearRampToValueAtTime(vol * 1.1, now + 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
    osc.connect(g);
    g.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.7);
  }

  playAxeSplit() {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    // Deep wood thud
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(175, now);
    osc.frequency.exponentialRampToValueAtTime(52, now + 0.11);
    const g1 = this.ctx.createGain();
    g1.gain.setValueAtTime(0.42, now);
    g1.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(g1);
    g1.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.14);

    // Crisp wood fiber split snap
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1250;
    bp.Q.value = 1.4;
    const g2 = this.ctx.createGain();
    g2.gain.setValueAtTime(0.36, now + 0.015);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    src.connect(bp);
    bp.connect(g2);
    g2.connect(this.master);
    src.start(now + 0.015, Math.random(), 0.18);
  }

  playWoodPlace() {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(240 + Math.random() * 50, now);
    osc.frequency.exponentialRampToValueAtTime(95, now + 0.075);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.24, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
    osc.connect(g);
    g.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  playMetalClink() {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(980 + Math.random() * 140, now);
    osc.frequency.exponentialRampToValueAtTime(720, now + 0.14);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.14, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(g);
    g.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  playFlintSpark() {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3400;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.28, now + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.master);
    src.start(now, Math.random(), 0.2);
  }

  playBlowWhoosh() {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.pinkBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(620, now);
    bp.frequency.linearRampToValueAtTime(340, now + 0.65);
    bp.Q.value = 1.6;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.25, now + 0.12);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.72);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start(now, Math.random(), 0.75);
  }

  playStep() {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 950 + Math.random() * 450;
    bp.Q.value = 0.9;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.085, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start(now, Math.random(), 0.1);
  }

  playShutter() {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2600;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.22, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start(now, 0, 0.06);
  }
}
