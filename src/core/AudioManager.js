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
  playAmbientDissonance(level = 0.05) {
    if (!this.ctx) return;

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = "sawtooth";
    osc1.frequency.setValueAtTime(55, this.ctx.currentTime);
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(58.7, this.ctx.currentTime);

    gain.gain.setValueAtTime(level, this.ctx.currentTime);
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

  // ============================================================
  // NEGACIÓN
  // ============================================================
  // Idea: un colchón de tres notas que arranca desafinado (segunda menor + tritono sobre La)
  // y se acomoda a un acorde de La mayor a medida que se aceptan las inconsistencias.
  // Encima, eventos esporádicos (tic-tac irregular, notas sueltas con eco tardío, dos
  // tonos que "pelean") cuyo desajuste baja con la resolución.
  // Todo vive entre 200 y 3000 Hz a propósito: los parlantes de notebook no reproducen graves.

  startDenial(level = 1) {
    if (!this.ctx || this.denial) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Salida con limitador (nada de sobresaltos) y entrada suave
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, now);
    out.gain.exponentialRampToValueAtTime(level, now + 2.5);
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -16;
    limiter.knee.value = 8;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    out.connect(limiter);
    limiter.connect(ctx.destination);

    // Bus aparte para el tic-tac "fantasma": se apaga cuando el reloj vuelve a andar
    const ghostBus = ctx.createGain();
    ghostBus.connect(out);

    // Colchón: la respiración (LFO lento) lo hace subir y bajar, así no queda sostenido
    const drone = ctx.createGain();
    drone.gain.value = 0.55;
    drone.connect(out);
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 0.35;
    lfo.connect(lfoGain);
    lfoGain.connect(drone.gain);
    lfo.start(now);

    const nodes = [lfo];
    // from/to: semitonos sobre La3 (220 Hz), tenso -> resuelto
    const defs = [
      { from: 0, to: 0, gain: 0.5 }, //  La fijo
      { from: 1, to: 4, gain: 0.35 }, // Si♭ -> Do#  (2ª menor -> 3ª mayor)
      { from: 6, to: 7, gain: 0.3 }, //  Mi♭ -> Mi   (tritono -> quinta)
    ];
    const voices = defs.map((def) => {
      const f = 220 * Math.pow(2, def.from / 12);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1500;
      const vg = ctx.createGain();
      vg.gain.setValueAtTime(0.0001, now);
      vg.gain.exponentialRampToValueAtTime(def.gain * 0.05, now + 3);
      lp.connect(vg);
      vg.connect(drone);
      // fundamental triangular + octava senoidal (para que se oiga en parlantes chicos)
      const oscs = [
        { type: "triangle", mult: 1, amp: 1 },
        { type: "sine", mult: 2, amp: 0.35 },
      ].map(({ type, mult, amp }) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        o.frequency.value = f * mult;
        g.gain.value = amp;
        o.connect(g);
        g.connect(lp);
        o.start(now);
        nodes.push(o);
        return { o, mult };
      });
      return { def, oscs, lp };
    });

    this.denial = {
      out, limiter, ghostBus, lfoGain, voices, nodes,
      r: 0, resolved: 0, found: new Set(),
      clockOk: false, tickAlt: false, timer: null,
    };
    this._denialSchedule();
  }

  // Aplica la "resolución" r (0 = tenso, 1 = acorde de La mayor) al colchón
  _denialApply(r) {
    const d = this.denial;
    if (!d) return;
    const t = this.ctx.currentTime;
    d.r = r;
    d.voices.forEach((v) => {
      const n = v.def.from + (v.def.to - v.def.from) * r;
      const f = 220 * Math.pow(2, n / 12);
      v.oscs.forEach(({ o, mult }) => o.frequency.setTargetAtTime(f * mult, t, 1.2));
      v.lp.frequency.setTargetAtTime(1500 - 600 * r, t, 1.5); // más cálido al resolverse
    });
    d.lfoGain.gain.setTargetAtTime(0.35 * (1 - 0.6 * r), t, 1.5); // respira menos
  }

  _denialDest(pan = 0, bus = null) {
    const d = this.denial;
    const dest = bus || (d && d.out) || (this.anger && this.anger.out) || (this.bargain && this.bargain.out) || this.ctx.destination;
    if (!pan || !this.ctx.createStereoPanner) return dest;
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    p.connect(dest);
    return p;
  }

  // Nota suave tipo marimba (fundamental + armónico), audible en parlantes chicos
  _denialTone(freq, t, level, dur, pan = 0) {
    const ctx = this.ctx;
    const dest = this._denialDest(pan);
    [[1, 1], [2, 0.3]].forEach(([mult, amp]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq * mult;
      g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(level * amp, t + 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur / mult);
      o.connect(g);
      g.connect(dest);
      o.start(t);
      o.stop(t + dur + 0.05);
    });
  }

  // Tic / toc: golpe de ruido filtrado (para parlantes) + cuerpito de madera
  _denialTick(t, tock = false, level = 0.06, pan = 0, bus = null) {
    const ctx = this.ctx;
    const dest = this._denialDest(pan, bus);
    const len = Math.floor(ctx.sampleRate * 0.03);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = tock ? 1800 : 2800;
    bp.Q.value = 2;
    const ng = ctx.createGain();
    ng.gain.value = level * 1.2;
    src.connect(bp);
    bp.connect(ng);
    ng.connect(dest);
    src.start(t);

    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(tock ? 520 : 780, t);
    o.frequency.exponentialRampToValueAtTime(300, t + 0.04);
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + 0.08);
  }

  _denialSchedule() {
    const d = this.denial;
    if (!d) return;
    // Más espaciado a medida que se resuelve
    const wait = (2200 + Math.random() * 2800) * (1 + d.r * 0.8);
    d.timer = setTimeout(() => {
      if (!this.denial) return;
      this._denialEvent();
      this._denialSchedule();
    }, wait);
  }

  _denialEvent() {
    const d = this.denial;
    const ctx = this.ctx;
    const r = d.r;
    const now = ctx.currentTime + 0.05;
    const pan = (Math.random() * 2 - 1) * 0.7;
    const pool = ["blip", "blip", "pair"];
    if (!d.clockOk) pool.push("ticks", "ticks");
    const kind = pool[Math.floor(Math.random() * pool.length)];

    if (kind === "ticks") {
      // Tic-tac irregular: el pulso se tambalea (jitter) y se ordena con r
      const n = 3 + Math.floor(Math.random() * 4);
      let t = now;
      for (let i = 0; i < n; i++) {
        this._denialTick(t, i % 2 === 1, 0.025, pan, d.ghostBus);
        t += 0.8 + (Math.random() * 2 - 1) * 0.45 * (1 - r);
      }
    } else if (kind === "blip") {
      // Nota suelta + eco que llega tarde y desafinado; al resolverse el eco se acorta y se afina
      const good = [0, 4, 7, 9, 12]; //  La Do# Mi Fa# La
      const bad = [1, 6, 11, 13, 18]; // Si♭ Mi♭ Sol# Si♭ Mi♭ (contra La)
      const set = Math.random() < 1 - r ? bad : good;
      const semis = set[Math.floor(Math.random() * set.length)];
      const cents = (Math.random() * 2 - 1) * 40 * (1 - r);
      const f = 440 * Math.pow(2, semis / 12 + cents / 1200);
      this._denialTone(f, now, 0.04, 1.6, pan); 
      const delay = (1 - r) * (0.55 + Math.random() * 0.5) + r * 0.28;
      const off = (Math.random() < 0.5 ? -1 : 1) * 45 * (1 - r);
      this._denialTone(f * Math.pow(2, off / 1200), now + delay, 0.018, 1.2, -pan); 
    } else {
      // Dos tonos que pelean: intervalo de 2ª menor (r=0) a quinta (r=1), con fade lento
      const f = 440 * Math.pow(2, [0, 4, 7][Math.floor(Math.random() * 3)] / 12) * 0.5;
      const iv = 1 + 6 * r + (Math.random() - 0.5) * (1 - r);
      const dest = this._denialDest(pan);
      [f, f * Math.pow(2, iv / 12)].forEach((fr) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = fr;
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.035, now + 1.2);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 2.8);
        o.connect(g);
        g.connect(dest);
        o.start(now);
        o.stop(now + 2.9);
      });
    }
  }

  // Un objeto desajustado fue aceptado: kind = "clock" | "frame" | "drawer"
  denialFound(kind) {
    const d = this.denial;
    if (!d || d.found.has(kind)) return;
    d.found.add(kind);
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // 1) Golpecito de "encaje"
    this._denialTick(now, true, 0.12);

    // 2) Nota que arranca desafinada (casi un semitono abajo) y se acomoda: La, Do#, Mi
    const target = { clock: 440, frame: 554.37, drawer: 659.25 }[kind] || 440;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(target * Math.pow(2, -0.9 / 12), now + 0.05);
    o.frequency.exponentialRampToValueAtTime(target, now + 0.8);
    g.gain.setValueAtTime(0.0001, now + 0.05);
    g.gain.exponentialRampToValueAtTime(0.05, now + 0.12);  
    g.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
    o.connect(g);
    g.connect(d.out);
    o.start(now + 0.05);
    o.stop(now + 2.5);

    // 3) Resolución del colchón (reloj + cuadro = 100%; el cajón es opcional y no cuenta)
    if (kind === "clock") {
      d.clockOk = true;
      d.ghostBus.gain.setTargetAtTime(0, now, 0.1);
    }
    if (kind !== "drawer") {
      d.resolved = Math.min(1, d.resolved + 0.5);
      this._denialApply(d.resolved);
    }
  }

  // Un tic-tac "real", sincronizado con el segundero del reloj cuando vuelve a andar
  denialClockTick() {
    const d = this.denial;
    if (!d) return;
    d.tickAlt = !d.tickAlt;
    this._denialTick(this.ctx.currentTime, d.tickAlt, 0.03);
  }

  stopDenial(seconds = 1.2) {
    const d = this.denial;
    if (!d) return;
    this.denial = null;
    clearTimeout(d.timer);
    const now = this.ctx.currentTime;
    d.out.gain.cancelScheduledValues(now);
    d.out.gain.setValueAtTime(Math.max(d.out.gain.value, 0.0001), now);
    d.out.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    d.nodes.forEach((n) => { try { n.stop(now + seconds + 0.1); } catch (e) {} });
    setTimeout(() => {
      try { d.out.disconnect(); d.limiter.disconnect(); } catch (e) {}
    }, (seconds + 0.5) * 1000);
  }

  // ============================================================
  // IRA
  // ============================================================
  // Fases: tense (grave + golpes) -> silent (la pared se aleja) -> under (vuelve "bajo el
  // agua", con filtro) -> released (se rompió todo: se acalla y se armoniza).
  // Los graves usan sierras en 110-220 Hz: los parlantes de notebook no reproducen la
  // fundamental, pero sí sus armónicos, y el oído "completa" el grave.

  startAnger(level = 1) {
    if (!this.ctx || this.anger) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, now);
    out.gain.exponentialRampToValueAtTime(level, now + 2);
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -16;
    limiter.knee.value = 8;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    out.connect(limiter);
    limiter.connect(ctx.destination);

    // Filtro maestro: abierto al principio; "bajo el agua" después de la pared
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 6000;
    lp.Q.value = 0.7;
    lp.connect(out);
    // Ondulación lenta del filtro (solo se nota bajo el agua)
    const wobble = ctx.createOscillator();
    const wobbleGain = ctx.createGain();
    wobble.frequency.value = 0.3;
    wobbleGain.gain.value = 0;
    wobble.connect(wobbleGain);
    wobbleGain.connect(lp.frequency);
    wobble.start(now);

    // bus: lo que controla el silencio total
    const bus = ctx.createGain();
    bus.gain.value = 1;
    bus.connect(lp);

    // Colchón grave con respiración leve
    const drone = ctx.createGain();
    drone.gain.value = 0.6;
    drone.connect(bus);
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.11;
    lfoGain.gain.value = 0.2;
    lfo.connect(lfoGain);
    lfoGain.connect(drone.gain);
    lfo.start(now);

    const nodes = [lfo, wobble];
    // from/to: semitonos sobre La2 (110 Hz); g0/g1: nivel tenso -> resuelto
    const defs = [
      { from: 0, to: 0, g0: 0.5, g1: 0.5, type: "sawtooth" }, //   La fijo
      { from: 1, to: 7, g0: 0.35, g1: 0.3, type: "sawtooth" }, //  Si♭ -> Mi  (2ª menor -> quinta)
      { from: 6, to: 12, g0: 0.3, g1: 0.3, type: "sawtooth" }, //  Mi♭ -> La  (tritono -> octava)
      { from: 16, to: 16, g0: 0, g1: 0.5, type: "triangle" }, //   Do# (3ª mayor): aparece al resolver
    ];
    const voices = defs.map((def) => {
      const f = 110 * Math.pow(2, def.from / 12);
      const vlp = ctx.createBiquadFilter();
      vlp.type = "lowpass";
      vlp.frequency.value = 800;
      const vg = ctx.createGain();
      vg.gain.setValueAtTime(0.0001, now);
      if (def.g0 > 0) vg.gain.exponentialRampToValueAtTime(def.g0 * 0.045, now + 3);
      vlp.connect(vg);
      vg.connect(drone);
      const oscs = [0, 7].map((cents) => {
        const o = ctx.createOscillator();
        o.type = def.type;
        o.frequency.value = f;
        o.detune.value = cents;
        o.connect(vlp);
        o.start(now);
        nodes.push(o);
        return o;
      });
      return { def, oscs, vlp, vg };
    });

    this.anger = {
      out, limiter, lp, wobbleGain, bus, drone, lfoGain, voices, nodes,
      phase: "tense", timer: null,
    };
    this._angerSchedule();
  }

  _angerApply(r) {
    const d = this.anger;
    if (!d) return;
    const t = this.ctx.currentTime;
    d.voices.forEach((v) => {
      const n = v.def.from + (v.def.to - v.def.from) * r;
      const f = 110 * Math.pow(2, n / 12);
      v.oscs.forEach((o) => o.frequency.setTargetAtTime(f, t, 1.5));
      const g = (v.def.g0 + (v.def.g1 - v.def.g0) * r) * 0.045;
      v.vg.gain.setTargetAtTime(Math.max(g, 0.0001), t, 1.5);
      v.vlp.frequency.setTargetAtTime(800 - 300 * r, t, 1.5); // más redondo al resolver
    });
  }

  _angerSchedule() {
    const d = this.anger;
    if (!d || d.phase === "released") return;
    const wait = 1400 + Math.random() * 3200;
    d.timer = setTimeout(() => {
      const a = this.anger;
      if (!a || a.phase === "released") return;
      if (a.phase !== "silent") {
        const t = this.ctx.currentTime + 0.03;
        this._angerHit(t, 0.16);
        if (Math.random() < 0.3) this._angerHit(t + 0.18 + Math.random() * 0.12, 0.09);
      }
      this._angerSchedule();
    }, wait);
  }

  // Golpe grave: cuerpo triangular que cae + ruido corto + clic (se oye en parlantes chicos)
  _angerHit(t, level) {
    const ctx = this.ctx;
    const bus = this.anger.bus;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.3);
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    o.connect(g);
    g.connect(bus);
    o.start(t);
    o.stop(t + 0.42);

    const len = Math.floor(ctx.sampleRate * 0.12);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const nlp = ctx.createBiquadFilter();
    nlp.type = "lowpass";
    nlp.frequency.value = 1100;
    const ng = ctx.createGain();
    ng.gain.value = level * 1.6;
    src.connect(nlp);
    nlp.connect(ng);
    ng.connect(bus);
    src.start(t);

    const c = ctx.createOscillator();
    const cg = ctx.createGain();
    c.type = "square";
    c.frequency.value = 380;
    cg.gain.setValueAtTime(level * 0.5, t);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    c.connect(cg);
    cg.connect(bus);
    c.start(t);
    c.stop(t + 0.06);
  }

  // k: 0 (lejos) a 1 (en el punto donde la pared empieza a alejarse). Baja el sonido hasta el silencio.
  angerApproach(k) {
    const d = this.anger;
    if (!d || d.phase !== "tense") return;
    d.bus.gain.setTargetAtTime(1 - k, this.ctx.currentTime, 0.08);
  }

  // Silencio total mientras la pared se aleja
  angerSilence() {
    const d = this.anger;
    if (!d || d.phase === "released") return;
    d.phase = "silent";
    d.bus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.12);
  }

  // La pared terminó de deformarse: vuelve el sonido, pero "bajo el agua"
  angerUnderwater() {
    const d = this.anger;
    if (!d || d.phase !== "silent") return;
    const t = this.ctx.currentTime;
    d.phase = "under";
    d.lp.frequency.cancelScheduledValues(t);
    d.lp.frequency.setValueAtTime(600, t); // estamos en silencio: el salto no se oye
    d.lp.Q.setValueAtTime(1.8, t);
    d.wobbleGain.gain.setTargetAtTime(110, t, 0.5);
    d.bus.gain.setTargetAtTime(0.9, t + 0.3, 1.5); // vuelve de a poco
  }

  // Se rompió todo: se calman los golpes, se abre el agua y el colchón se armoniza
  angerRelease() {
    const d = this.anger;
    if (!d || d.phase === "released") return;
    const t = this.ctx.currentTime;
    d.phase = "released";
    clearTimeout(d.timer);
    d.bus.gain.setTargetAtTime(1, t, 1);
    d.lp.frequency.setTargetAtTime(2600, t, 2.5);
    d.lp.Q.setTargetAtTime(0.7, t, 1.5);
    d.wobbleGain.gain.setTargetAtTime(0, t, 1.5);
    d.lfoGain.gain.setTargetAtTime(0.04, t, 2); // casi sin respiración: grave sostenido
    d.drone.gain.setTargetAtTime(0.5, t, 2);
    this._angerApply(1);
  }

  stopAnger(seconds = 1.2) {
    const d = this.anger;
    if (!d) return;
    this.anger = null;
    clearTimeout(d.timer);
    const now = this.ctx.currentTime;
    d.out.gain.cancelScheduledValues(now);
    d.out.gain.setValueAtTime(Math.max(d.out.gain.value, 0.0001), now);
    d.out.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    d.nodes.forEach((n) => { try { n.stop(now + seconds + 0.1); } catch (e) {} });
    setTimeout(() => {
      try { d.out.disconnect(); d.limiter.disconnect(); } catch (e) {}
    }, (seconds + 0.5) * 1000);
  }

  // Tic-tac del reloj que vuelve a andar: el MISMO sonido en Negación e Ira
  playClockTick(level = 0.03) {
    if (!this.ctx) return;
    this._clockAlt = !this._clockAlt;
    this._denialTick(this.ctx.currentTime, this._clockAlt, level);
  }

  // ============================================================
  // NEGOCIACIÓN
  // ============================================================
  // La tensión NO es un acorde sostenido (cansa). Son "respiros" de acordes abiertos sin
  // tercera (Asus4, Asus2, cuartas apiladas): entran lento, se apagan solos y dejan silencio
  // entre uno y otro. Se alternan para que el oído no se clave en uno.
  // La habitación que se cierra sube la "presión": el tono sube un poco (hasta ~60 cents),
  // el brillo aumenta y los respiros se acercan entre sí.
  // Resolución: la cuarta (Re) cae a la tercera (Do#) y queda La mayor: una suspensión 4-3.

  startBargain(level = 1) {
    if (!this.ctx || this.bargain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, now);
    out.gain.exponentialRampToValueAtTime(level, now + 2);
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -16;
    limiter.knee.value = 8;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    out.connect(limiter);
    limiter.connect(ctx.destination);

    // Filtro de los acordes (los tintineos salen directo, sin filtrar)
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1100 + 1300 * 0.25;
    lp.Q.value = 0.5;
    lp.connect(out);

    this.bargain = {
      out, limiter, lp,
      t: 0.25, // tensión 0..1
      phase: "searching", // searching -> letting -> resolved
      quietUntil: 0, timer: null, keysTimer: null, soon: null,
    };
    this.bargain.soon = setTimeout(() => this._bargainSwell(), 1200);
    this._bargainSchedule();
    this._bargainKeysSchedule();
  }

  _bargainApply() {
    const d = this.bargain;
    if (!d) return;
    d.lp.frequency.setTargetAtTime(1100 + 1300 * d.t, this.ctx.currentTime, 0.8);
  }

  _bargainSwell() {
    const d = this.bargain;
    if (!d) return;
    const ctx = this.ctx;
    const now = ctx.currentTime + 0.05;
    const resolved = d.phase === "resolved";
    const chords = [
      [220, 293.66, 329.63], // La Re Mi  (sus4)
      [220, 246.94, 329.63], // La Si Mi  (sus2)
      [220, 293.66, 392.0], //  La Re Sol (cuartas)
    ];
    const notes = resolved ? [220, 277.18, 329.63, 440] : chords[Math.floor(Math.random() * chords.length)];
    const pf = resolved ? 1 : Math.pow(2, (d.t * 60) / 1200);
    const amp = (resolved ? 0.7 : 0.85 + 0.35 * d.t) * 0.03;
    const dur = 4.5 + Math.random() * 2;
    const dest = this._denialDest((Math.random() * 2 - 1) * 0.5, d.lp);
    notes.forEach((f, i) => {
      const t0 = now + i * 0.12;
      const fr = f * pf * Math.pow(2, ((Math.random() * 2 - 1) * 5) / 1200);
      const e = ctx.createGain();
      e.gain.setValueAtTime(0.0001, t0);
      e.gain.exponentialRampToValueAtTime(amp, t0 + 1.3);
      e.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      e.connect(dest);
      [["triangle", 1, 1], ["sine", 2, 0.3]].forEach(([type, mult, a]) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        o.frequency.value = fr * mult;
        g.gain.value = a;
        o.connect(g);
        g.connect(e);
        o.start(t0);
        o.stop(now + dur + 0.1);
      });
    });
  }

  _bargainSchedule() {
    const d = this.bargain;
    if (!d) return;
    const wait =
      d.phase === "resolved"
        ? 10000 + Math.random() * 5000
        : 7500 - 3700 * d.t + Math.random() * 2500; // más tensión = respiros más seguidos
    d.timer = setTimeout(() => {
      const b = this.bargain;
      if (!b) return;
      if (performance.now() >= b.quietUntil) this._bargainSwell();
      this._bargainSchedule();
    }, wait);
  }

  _bargainKeysSchedule() {
    const d = this.bargain;
    if (!d) return;
    d.keysTimer = setTimeout(() => {
      const b = this.bargain;
      if (!b) return;
      if (b.phase === "searching" && performance.now() >= b.quietUntil) {
        this._keysJingle(
          this.ctx.currentTime + 0.05,
          0.012 + 0.008 * b.t,
          (Math.random() * 2 - 1) * 0.7,
          3 + Math.floor(Math.random() * 3),
        );
      }
      this._bargainKeysSchedule();
    }, 6000 + Math.random() * 9000);
  }

  // Llaves que traquetean contra algo cerrado: golpecitos metálicos apagados, graves para
  // un tintineo, que caen de tono, se espacian y se debilitan hasta apagarse. Sin brillo
  // ni subidas: no hay premio, la puerta no cede.
  _keysJingle(t, level = 0.03, pan = 0, n = 4) {
    const ctx = this.ctx;
    const dest = this._denialDest(pan);
    let at = t;
    for (let i = 0; i < n; i++) {
      const lv = level * Math.pow(0.7, i) * (0.8 + Math.random() * 0.4);
      const f0 = 700 + Math.random() * 500;
      const decay = 0.05 + Math.random() * 0.07;

      // clac: ruido corto filtrado (metal contra madera)
      const len = Math.floor(ctx.sampleRate * 0.04);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let k = 0; k < len; k++) data[k] = (Math.random() * 2 - 1) * Math.pow(1 - k / len, 2);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = f0 * 2.2;
      bp.Q.value = 3;
      const ng = ctx.createGain();
      ng.gain.value = lv * 2.5;
      src.connect(bp);
      bp.connect(ng);
      ng.connect(dest);
      src.start(at);

      // cuerpo: seno corto que cae de tono
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(f0, at);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.85, at + decay);
      g.gain.setValueAtTime(lv, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
      o.connect(g);
      g.connect(dest);
      o.start(at);
      o.stop(at + decay + 0.05);

      at += 0.07 + i * 0.035 + Math.random() * 0.05; // cada vez más espaciados
    }
  }

  // La habitación rechaza la oferta: tintineo + golpe sordo, y la presión sube
  bargainReject(fails, max = 4) {
    const d = this.bargain;
    if (!d || d.phase !== "searching") return;
    const now = this.ctx.currentTime;
    // golpe sordo contra la puerta y, enseguida, las llaves traqueteando hasta apagarse
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(240, now);
    o.frequency.exponentialRampToValueAtTime(120, now + 0.15);
    g.gain.setValueAtTime(0.09, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    o.connect(g);
    g.connect(d.out);
    o.start(now);
    o.stop(now + 0.25);
    this._denialTick(now, true, 0.06);
    this._keysJingle(now + 0.1, 0.05, 0, 4);
    d.t = Math.min(1, 0.25 + 0.75 * (fails / max));
    this._bargainApply();
    clearTimeout(d.soon);
    // un respiro enseguida, ya con el tono más alto, para que se note que se cierra
    d.soon = setTimeout(() => this._bargainSwell(), 500);
  }

  // "No hay tratos posibles": un momento de silencio antes de empezar a soltar
  bargainLettingGo() {
    const d = this.bargain;
    if (!d || d.phase !== "searching") return;
    d.phase = "letting";
    d.quietUntil = performance.now() + 4500;
  }

  // Cada objeto soltado en la mesa: golpecito + nota del acorde final; la tensión baja
  bargainPlace(n) {
    const d = this.bargain;
    if (!d) return;
    const now = this.ctx.currentTime;
    this._denialTick(now, true, 0.05);
    const notes = [329.63, 440, 659.25]; // Mi, La, Mi (el Do# llega al resolver)
    if (n < 4) this._denialTone(notes[n - 1], now + 0.05, 0.06, 2.2);
    d.t = Math.max(0, 1 - n / 4);
    this._bargainApply();
    if (n < 4) {
      clearTimeout(d.soon);
      d.quietUntil = 0;
      d.soon = setTimeout(() => this._bargainSwell(), 900);
    }
  }

  // El cuarto objeto: la cuarta (Re) cae a la tercera (Do#) y el acorde queda resuelto
  bargainResolve() {
    const d = this.bargain;
    if (!d || d.phase === "resolved") return;
    d.phase = "resolved";
    d.t = 0;
    d.quietUntil = 0;
    clearTimeout(d.soon);
    this._bargainApply();
    const ctx = this.ctx;
    const now = ctx.currentTime + 0.1;
    const dur = 9;
    const voices = [
      { f: 220, delay: 0 },
      { f: 329.63, delay: 0.1 },
      { f: 293.66, delay: 0.2, to: 277.18 }, // Re -> Do#
      { f: 440, delay: 2.2 },
    ];
    voices.forEach(({ f, delay, to }) => {
      const t0 = now + delay;
      const e = ctx.createGain();
      e.gain.setValueAtTime(0.0001, t0);
      e.gain.exponentialRampToValueAtTime(0.04, t0 + 1.5);
      e.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      e.connect(d.lp);
      [["triangle", 1, 1], ["sine", 2, 0.3]].forEach(([type, mult, a]) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f * mult, t0);
        if (to) {
          o.frequency.setValueAtTime(f * mult, now + 1.2);
          o.frequency.exponentialRampToValueAtTime(to * mult, now + 2.4);
        }
        g.gain.value = a;
        o.connect(g);
        g.connect(e);
        o.start(t0);
        o.stop(now + dur + 0.1);
      });
    });
  }

  stopBargain(seconds = 1.2) {
    const d = this.bargain;
    if (!d) return;
    this.bargain = null;
    clearTimeout(d.timer);
    clearTimeout(d.keysTimer);
    clearTimeout(d.soon);
    const now = this.ctx.currentTime;
    d.out.gain.cancelScheduledValues(now);
    d.out.gain.setValueAtTime(Math.max(d.out.gain.value, 0.0001), now);
    d.out.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    setTimeout(() => {
      try { d.out.disconnect(); d.limiter.disconnect(); } catch (e) {}
    }, (seconds + 0.5) * 1000);
  }

  // ============================================================
  // PASILLO (4 estados: 0 opresivo -> 3 cálido)
  // ============================================================
  // Estado 0: silencio + zumbido fluorescente por episodios + crujidos sincronizados con el
  //           parpadeo + pasos duros con eco. Sin capa tonal.
  // Estado 1: el zumbido se espacia y se debilita; entra la 1ª capa armónica (La + Mi, quinta
  //           abierta: ni mayor ni menor).
  // Estado 2: sin zumbido; se suma el Do# (La mayor).
  // Estado 3: acorde completo (Fa#, La alto) y filtro más abierto; pasos suaves.
  // Todo en 100-1800 Hz: se oye en parlantes de notebook.

  startCorridor(state = 0, level = 1) {
    if (!this.ctx || this.corridor) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    // Al volver de una sala arranca con las capas del estado anterior y sube al nuevo,
    // así se escucha cómo se suma la capa.
    const from = this._corrLast === undefined ? state : this._corrLast;

    const PAD = [
      [0, 0, 0, 0, 0],
      [0.6, 0, 0.4, 0, 0],
      [0.6, 0.4, 0.45, 0, 0.2],
      [0.6, 0.4, 0.45, 0.3, 0.35],
    ];
    const PADLP = [900, 900, 1200, 1700];
    const FREQS = [220, 277.18, 329.63, 369.99, 440]; // La3 Do#4 Mi4 Fa#4 La4

    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, now);
    out.gain.exponentialRampToValueAtTime(level, now + 2);
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -16;
    limiter.knee.value = 8;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    out.connect(limiter);
    limiter.connect(ctx.destination);

    const dry = ctx.createGain();
    dry.connect(out);

    // Eco de pasillo: reverb por convolución con una respuesta oscura y larga
    const reverb = ctx.createConvolver();
    reverb.buffer = this._corrImpulse(1.6);
    const send = ctx.createGain();
    send.gain.value = 0.5;
    send.connect(reverb);
    const wet = ctx.createGain();
    wet.gain.value = 0.6;
    reverb.connect(wet);
    wet.connect(out);

    const nodes = [];

    // --- Capas armónicas: triángulo + octava senoidal por nota, con respiración lenta
    const padBus = ctx.createGain();
    padBus.gain.value = 0.8;
    padBus.connect(dry);
    const padLp = ctx.createBiquadFilter();
    padLp.type = "lowpass";
    padLp.frequency.value = PADLP[from];
    padLp.connect(padBus);
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.08;
    lfoGain.gain.value = 0.2;
    lfo.connect(lfoGain);
    lfoGain.connect(padBus.gain);
    lfo.start(now);
    nodes.push(lfo);
    const voices = FREQS.map((f, i) => {
      const vg = ctx.createGain();
      vg.gain.setValueAtTime(0.0001, now);
      if (PAD[from][i] > 0) vg.gain.exponentialRampToValueAtTime(PAD[from][i] * 0.03, now + 3);
      vg.connect(padLp);
      [["triangle", 1, 1], ["sine", 2, 0.3]].forEach(([type, mult, a]) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        o.frequency.value = f * mult;
        g.gain.value = a;
        o.connect(g);
        g.connect(vg);
        o.start(now);
        nodes.push(o);
      });
      return vg;
    });

    this.corridor = {
      out, limiter, dry, send, padLp, voices, nodes, PAD, PADLP,
      state: from, lastFlick: -10, stepAlt: false, humTimer: null, soon: null, soon2: null,
    };
    this._corrLast = from;

    // Primer episodio de zumbido enseguida (el estado 0 arranca en silencio y zumba)
    this.corridor.soon = setTimeout(() => {
      if (this.corridor && this.corridor.state === 0) this._corrHumEpisode();
    }, 2500);
    this._corrHumSchedule();
    if (from !== state) {
      this.corridor.soon2 = setTimeout(() => this.setCorridorAudioState(state), 1800);
    }
  }

  _corrImpulse(seconds = 1.6) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        lp += 0.3 * (Math.random() * 2 - 1 - lp); // cola oscura
        d[i] = lp * Math.pow(1 - i / len, 3.2) * 2;
      }
    }
    return buf;
  }

  // Cambia el estado musical (0 a 3): las capas entran o salen de a poco
  setCorridorAudioState(state) {
    const d = this.corridor;
    const s = Math.max(0, Math.min(3, Math.trunc(state) || 0));
    this._corrLast = s;
    if (!d) return;
    const t = this.ctx.currentTime;
    d.state = s;
    d.voices.forEach((vg, i) => {
      vg.gain.setTargetAtTime(Math.max(d.PAD[s][i] * 0.03, 0.0001), t, 2.5);
    });
    d.padLp.frequency.setTargetAtTime(d.PADLP[s], t, 2.5);
  }

  // Episodio de zumbido: usa el sonido de siempre (playAmbientDissonance), más suave en el estado 1
  _corrHumEpisode() {
    const d = this.corridor;
    if (!d) return;
    this.playAmbientDissonance(d.state === 0 ? 0.05 : 0.03);
  }

  _corrHumSchedule() {
    const d = this.corridor;
    if (!d) return;
    const s = d.state;
    const wait = s === 0 ? 5000 + Math.random() * 9000 : s === 1 ? 14000 + Math.random() * 14000 : 6000;
    d.humTimer = setTimeout(() => {
      const c = this.corridor;
      if (!c) return;
      if (c.state <= 1) this._corrHumEpisode();
      this._corrHumSchedule();
    }, wait);
  }

  // Chasquidos eléctricos cortos
  _corrCrackle(t, level, n) {
    const ctx = this.ctx;
    const d = this.corridor;
    let at = t;
    for (let i = 0; i < n; i++) {
      const len = Math.floor(ctx.sampleRate * 0.012);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let k = 0; k < len; k++) data[k] = (Math.random() * 2 - 1) * Math.pow(1 - k / len, 2);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 2200 + Math.random() * 2300;
      bp.Q.value = 1.5;
      const g = ctx.createGain();
      g.gain.value = level * (0.6 + Math.random() * 0.4) * 3;
      src.connect(bp);
      bp.connect(g);
      g.connect(d.dry);
      src.start(at);
      at += 0.015 + Math.random() * 0.04;
    }
  }

  // Lo llama el pasillo cada vez que una luz parpadea (se filtra para no saturar)
  corridorFlicker() {
    const d = this.corridor;
    if (!d || d.state >= 2) return;
    const now = this.ctx.currentTime;
    if (now - d.lastFlick < 0.45) return;
    if (Math.random() > (d.state === 0 ? 0.7 : 0.35)) return;
    d.lastFlick = now;
    const k = d.state === 0 ? 1 : 0.45;
    this._corrCrackle(now + 0.01, 0.03 * k, d.state === 0 ? 3 + Math.floor(Math.random() * 3) : 1);
  }

  // Un paso: talón (ruido filtrado) + cuerpo corto, con eco de pasillo.
  // El estado lo ablanda: duro y seco en el 0, amortiguado en el 3.
  corridorStep() {
    const d = this.corridor;
    if (!d) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    d.stepAlt = !d.stepAlt;
    const soft = d.state / 3;
    const pitch = (d.stepAlt ? 1 : 0.92) * (0.95 + Math.random() * 0.1);

    const len = Math.floor(ctx.sampleRate * 0.06);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = (1800 - 900 * soft) * pitch;
    const ng = ctx.createGain();
    ng.gain.value = 0.12 * (1 - 0.35 * soft);
    src.connect(lp);
    lp.connect(ng);
    ng.connect(d.dry);
    ng.connect(d.send);
    src.start(now);

    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(210 * pitch, now);
    o.frequency.exponentialRampToValueAtTime(110 * pitch, now + 0.08);
    g.gain.setValueAtTime(0.06, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
    o.connect(g);
    g.connect(d.dry);
    g.connect(d.send);
    o.start(now);
    o.stop(now + 0.12);
  }

  // Puerta del pasillo: pestillo + chirrido de bisagra, con eco
  corridorDoorOpen() {
    const d = this.corridor;
    if (!d) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const route = (n) => { n.connect(d.dry); n.connect(d.send); };

    const len = Math.floor(ctx.sampleRate * 0.02);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 2;
    const cg = ctx.createGain();
    cg.gain.value = 0.2;
    src.connect(bp);
    bp.connect(cg);
    route(cg);
    src.start(now);

    const t0 = now + 0.12;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(85, t0);
    o.frequency.exponentialRampToValueAtTime(130, t0 + 1.0);
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = 13;
    lg.gain.value = 12;
    lfo.connect(lg);
    lg.connect(o.frequency);
    const cbp = ctx.createBiquadFilter();
    cbp.type = "bandpass";
    cbp.frequency.value = 650;
    cbp.Q.value = 7;
    const eg = ctx.createGain();
    eg.gain.setValueAtTime(0.0001, t0);
    eg.gain.exponentialRampToValueAtTime(0.035, t0 + 0.35);
    eg.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.2);
    o.connect(cbp);
    cbp.connect(eg);
    route(eg);
    o.start(t0);
    lfo.start(t0);
    o.stop(t0 + 1.3);
    lfo.stop(t0 + 1.3);
  }

  stopCorridor(seconds = 1.2) {
    const d = this.corridor;
    if (!d) return;
    this.corridor = null;
    clearTimeout(d.humTimer);
    clearTimeout(d.soon);
    clearTimeout(d.soon2);
    const now = this.ctx.currentTime;
    d.out.gain.cancelScheduledValues(now);
    d.out.gain.setValueAtTime(Math.max(d.out.gain.value, 0.0001), now);
    d.out.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    d.nodes.forEach((n) => { try { n.stop(now + seconds + 0.1); } catch (e) {} });
    setTimeout(() => {
      try { d.out.disconnect(); d.limiter.disconnect(); } catch (e) {}
    }, (seconds + 0.5) * 1000);
  }

}