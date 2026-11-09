export class AudioManager {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  // Tono grave disonante (Se desvanece a los 3.5 segundos para no quedar zumbando)
  playAmbientDissonance() {
    if (!this.ctx) return;

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = "sawtooth";
    osc1.frequency.setValueAtTime(55, this.ctx.currentTime);
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(58.7, this.ctx.currentTime);

    gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
    // Desvanecimiento suave a los 3.5 segundos
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 3.5);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);

    osc1.start();
    osc2.start();
    osc1.stop(this.ctx.currentTime + 4.0);
    osc2.stop(this.ctx.currentTime + 4.0);
  }

  playClickSound() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(440, this.ctx.currentTime);
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  }

  // --- SONIDOS SINTETIZADOS DE ANGER ROOM ---
  playShatter(kind, level = 0.3) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const master = this.ctx.createGain();
    master.gain.value = level;
    master.connect(this.ctx.destination);

    const len = Math.floor(this.ctx.sampleRate * 0.5);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++)
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = kind === "ceramic" ? 900 : 2500;
    src.connect(hp);
    hp.connect(master);
    src.start(now);

    const n = kind === "ceramic" ? 5 : 9;
    for (let i = 0; i < n; i++) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = "triangle";
      o.frequency.value =
        kind === "ceramic"
          ? 700 + Math.random() * 1500
          : 2500 + Math.random() * 4000;
      const t = now + Math.random() * 0.35;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(
        0.05 + Math.random() * 0.07,
        t + 0.005,
      );
      g.gain.exponentialRampToValueAtTime(
        0.0001,
        t + 0.06 + Math.random() * 0.12,
      );
      o.connect(g);
      g.connect(master);
      o.start(t);
      o.stop(t + 0.25);
    }

    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(140, now);
    o.frequency.exponentialRampToValueAtTime(45, now + 0.18);
    g.gain.setValueAtTime(0.5, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    o.connect(g);
    g.connect(master);
    o.start(now);
    o.stop(now + 0.25);
  }

  playSoft(freq = 392, level = 0.06) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(level, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    o.connect(g);
    g.connect(this.ctx.destination);
    o.start(now);
    o.stop(now + 0.65);
  }

  playTick() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "square";
    o.frequency.value = 1800;
    g.gain.setValueAtTime(0.03, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
    o.connect(g);
    g.connect(this.ctx.destination);
    o.start(now);
    o.stop(now + 0.04);
  }

    // --- DEPRESSION ROOM ---
  startRain() {
    if (!this.ctx || this.rainNode) return;
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 3200;
    bp.Q.value = 0.4;
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.05, now + 3);
    src.connect(bp); bp.connect(gain); gain.connect(this.ctx.destination);
    src.start();
    this.rainNode = { src, gain };
  }

  stopRain() {
    if (!this.rainNode) return;
    const { src, gain } = this.rainNode;
    const now = this.ctx.currentTime;
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);
    src.stop(now + 1.6);
    this.rainNode = null;
  }

  playHeavyTick(level = 0.3) {
  if (!this.ctx) return;
  const now = this.ctx.currentTime;
  const master = this.ctx.createGain();
  master.gain.value = level;
  master.connect(this.ctx.destination);

  // Cuerpo grave: el triángulo tiene armónicos, así se oye en parlantes chicos
  const o = this.ctx.createOscillator();
  const g = this.ctx.createGain();
  o.type = "triangle";
  o.frequency.setValueAtTime(160, now);
  o.frequency.exponentialRampToValueAtTime(55, now + 0.3);
  g.gain.setValueAtTime(1, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
  o.connect(g); g.connect(master);
  o.start(now); o.stop(now + 0.4);

  // Golpe seco: ruido corto filtrado
  const len = Math.floor(this.ctx.sampleRate * 0.1);
  const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = this.ctx.createBufferSource();
  src.buffer = buf;
  const lp = this.ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 900;
  src.connect(lp); lp.connect(master);
  src.start(now);

  // Clic metálico: le da el "tic" al "tum"
  const c = this.ctx.createOscillator();
  const cg = this.ctx.createGain();
  c.type = "square";
  c.frequency.value = 420;
  cg.gain.setValueAtTime(0.25, now);
  cg.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
  c.connect(cg); cg.connect(master);
  c.start(now); c.stop(now + 0.06);
}

// ============================================================
  // ACEPTACIÓN
  // ============================================================

  // Viento suave del jardín + bus donde se acumula el acorde del memorial
  startGarden() {
    if (!this.ctx || this.garden) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const bus = ctx.createGain();
    bus.gain.value = 1;
    bus.connect(ctx.destination);

    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const wind = ctx.createBufferSource();
    wind.buffer = buf;
    wind.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 500;
    bp.Q.value = 0.6;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.12;
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain);
    lfoGain.connect(bp.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.05, now + 3);
    wind.connect(bp);
    bp.connect(g);
    g.connect(bus);
    wind.start();
    lfo.start();
    this.garden = { bus, nodes: [wind, lfo] };
  }

  // Cada objeto que se deja en el memorial suma una nota consonante, con ataque lento
  addHarmonyVoice(freq) {
    if (!this.ctx || !this.garden) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.03, now + 3);
    lp.connect(g);
    g.connect(this.garden.bus);
    [1, 1.003].forEach((k) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq * k;
      o.connect(lp);
      o.start();
      this.garden.nodes.push(o);
    });
  }

  // Campana suave (brote, semilla, puerta)
  playBell(freq = 880) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const master = this.ctx.createGain();
    master.gain.setValueAtTime(0.08, now);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
    master.connect(this.ctx.destination);
    [[1, "sine"], [2.76, "triangle"]].forEach(([k, type]) => {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq * k;
      o.connect(master);
      o.start(now);
      o.stop(now + 2.3);
    });
  }

  // Tierra: golpe sordo + ruido grave
  playEarth() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.3;
    master.connect(ctx.destination);
    const len = Math.floor(ctx.sampleRate * 0.3);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 500;
    src.connect(lp);
    lp.connect(master);
    src.start(now);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(110, now);
    o.frequency.exponentialRampToValueAtTime(50, now + 0.2);
    g.gain.setValueAtTime(0.8, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    o.connect(g);
    g.connect(master);
    o.start(now);
    o.stop(now + 0.3);
  }

  // Agua que cae: ruido filtrado con burbujeo
  playWater() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 2.4);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 0.8;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 9;
    lfoGain.gain.value = 0.03;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.09, now + 0.4);
    g.gain.setValueAtTime(0.09, now + 1.7);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);
    src.connect(bp);
    bp.connect(g);
    g.connect(ctx.destination);
    src.start(now);
    lfo.start(now);
    lfo.stop(now + 2.4);
  }

  // Al salir al exterior todo se va apagando hasta el silencio
  fadeOutGarden(seconds = 4) {
    if (!this.ctx || !this.garden) return;
    const { bus, nodes } = this.garden;
    const now = this.ctx.currentTime;
    bus.gain.setValueAtTime(bus.gain.value, now);
    bus.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    nodes.forEach((n) => { try { n.stop(now + seconds + 0.1); } catch (e) {} });
    this.garden = null;
  }

  stopGarden() {
    if (!this.ctx || !this.garden) return;
    this.garden.nodes.forEach((n) => { try { n.stop(); } catch (e) {} });
    this.garden.bus.disconnect();
    this.garden = null;
  }


}
