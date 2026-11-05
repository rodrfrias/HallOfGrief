import * as THREE from 'three';

/* ============================================================
   CONFIG: tocá estos valores para ajustar rápido
   ============================================================ */
const CFG = {
    startDepth: 6.0,      // profundidad inicial de la sala (m)
    maxDepth: 29.0,       // hasta dónde se puede alejar la pared (m)
    baseFov: 40,
    fovStretch: 30,       // cuánto se abre el FOV mientras la pared se aleja (vértigo)
    baseShake: 0.0035,
    shakeBoost: 0.012,    // temblor extra a medida que avanzás en la sala
    lantern: { intensity: 9, distance: 10, decay: 1.3 }, // luz que acompaña al usuario
    ambient: 0.45,
    triggerDist: 3.0,     // a qué distancia de la pared se dispara el estiramiento
    stretchDuration: 7.0, // segundos que tarda la pared en irse al fondo
    farGlimmer: 0.22,     // brillo mínimo de las frases lejanas (guía en la oscuridad)
    xLimit: 0.4,          // límite lateral del usuario (lo lee main.js con getXLimit)
};

/* Orden, lado y frase de cada objeto. keep:true = el usuario NO quiere romperlo.
   dist = metros desde la puerta. La separación se acorta hacia el final (ritmo). */
const LAYOUT = [
    { type: 'vase',   side: -1, dist: 8.5,  phrase: 'No quiero ser fuerte' },
    { type: 'frame',  side:  1, dist: 11.0, phrase: 'No es justo' },
    { type: 'mug',    side: -1, dist: 13.5, phrase: 'Me duele todo' },
    { type: 'vase',   side:  1, dist: 15.0, phrase: 'Nadie entiende' },
    { type: 'candle', side: -1, dist: 17.0, phrase: 'Gracias', keep: true },
    { type: 'frame',  side: -1, dist: 19.0, phrase: 'Me dejaste' },
    { type: 'mirror', side:  1, dist: 20.5, phrase: 'No me reconozco' },
    { type: 'photo',  side:  1, dist: 22.0, phrase: 'Te quiero', keep: true },
    { type: 'vase',   side: -1, dist: 23.5, phrase: '¿Por qué a mí?' },
    { type: 'mug',    side:  1, dist: 25.0, phrase: 'Quiero gritar' },
    { type: 'box',    side: -1, dist: 26.5, phrase: 'Tu voz', keep: true },
];

/* ============================================================
   HELPERS
   ============================================================ */
const rnd = (a, b) => a + Math.random() * (b - a);
const smooth = (e0, e1, x) => {
    const t = THREE.MathUtils.clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
};
const canvasOf = (w, h) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; };
const texOf = (cv, srgb = true) => { const t = new THREE.CanvasTexture(cv); if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };

const profile = (pts) => pts.map(([x, y]) => new THREE.Vector2(x, y));
const PEDESTAL = profile([[0.001, 0], [0.2, 0], [0.2, 0.05], [0.13, 0.1], [0.12, 0.78], [0.19, 0.82], [0.19, 0.85], [0.001, 0.85]]);
const VASE = profile([[0.001, 0], [0.08, 0], [0.1, 0.02], [0.17, 0.12], [0.19, 0.22], [0.14, 0.34], [0.075, 0.42], [0.07, 0.5], [0.1, 0.56], [0.11, 0.58], [0.095, 0.58], [0.065, 0.52]]);
const MUG = profile([[0.001, 0], [0.05, 0], [0.055, 0.01], [0.055, 0.1], [0.05, 0.1], [0.047, 0.012], [0.001, 0.012]]);

/* ============================================================
   AUDIO (Web Audio sintetizado, contexto compartido)
   ============================================================ */
let sharedCtx = null;
const getCtx = () => {
    try {
        if (!sharedCtx) sharedCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (sharedCtx.state === 'suspended') sharedCtx.resume();
        return sharedCtx;
    } catch (e) { return null; }
};

function playShatter(kind, level = 0.3) {
    const ctx = getCtx(); if (!ctx) return;
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = level;
    master.connect(ctx.destination);

    // Ruido de fragmentos
    const len = Math.floor(ctx.sampleRate * 0.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = kind === 'ceramic' ? 900 : 2500;
    src.connect(hp); hp.connect(master); src.start(now);

    // Tintineos
    const n = kind === 'ceramic' ? 5 : 9;
    for (let i = 0; i < n; i++) {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = kind === 'ceramic' ? rnd(700, 2200) : rnd(2500, 6500);
        const t = now + rnd(0, 0.35);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(rnd(0.05, 0.12), t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t + rnd(0.06, 0.18));
        o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.25);
    }

    // Golpe grave (el "peso" del impacto)
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, now);
    o.frequency.exponentialRampToValueAtTime(45, now + 0.18);
    g.gain.setValueAtTime(0.5, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    o.connect(g); g.connect(master); o.start(now); o.stop(now + 0.25);
}

function playSoft(freq = 392, level = 0.06) {
    const ctx = getCtx(); if (!ctx) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(level, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    o.connect(g); g.connect(ctx.destination);
    o.start(now); o.stop(now + 0.65);
}

function playTick() {
    const ctx = getCtx(); if (!ctx) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'square'; o.frequency.value = 1800;
    g.gain.setValueAtTime(0.03, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
    o.connect(g); g.connect(ctx.destination);
    o.start(now); o.stop(now + 0.04);
}

/* ============================================================
   TEXTURAS
   ============================================================ */
// Frase flotante que mira al usuario. warm = palabra "sana" (cálida), si no, rabia (roja)
function makeTagTexture(text, warm) {
    const w = 768, h = 144;
    const cv = canvasOf(w, h);
    const c = cv.getContext('2d');
    let size = 60;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `bold ${size}px "Courier New", monospace`;
    while (c.measureText(text).width > w - 60 && size > 22) {
        size -= 2;
        c.font = `bold ${size}px "Courier New", monospace`;
    }
    c.shadowColor = warm ? 'rgba(255,170,80,0.9)' : 'rgba(255,40,20,0.9)';
    c.shadowBlur = 18;
    c.fillStyle = warm ? '#ffe6bd' : '#ff6a4d';
    c.fillText(text, w / 2, h / 2);
    c.fillText(text, w / 2, h / 2); // refuerza el glow
    return texOf(cv);
}

// Foto del portarretratos: cálida (recuerdo sano) o fría y rota (dolor)
function makePhotoTexture(warm) {
    const w = 256, h = 340;
    const cv = canvasOf(w, h);
    const c = cv.getContext('2d');
    const g = c.createLinearGradient(0, 0, 0, h);
    if (warm) { g.addColorStop(0, '#f0c98a'); g.addColorStop(1, '#a8693a'); }
    else { g.addColorStop(0, '#3a2a2c'); g.addColorStop(1, '#1a0e10'); }
    c.fillStyle = g; c.fillRect(0, 0, w, h);

    c.fillStyle = warm ? 'rgba(70,35,15,0.85)' : 'rgba(0,0,0,0.65)';
    const figure = (cx, cy, s) => {
        c.beginPath(); c.arc(cx, cy, 34 * s, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.ellipse(cx, cy + 110 * s, 70 * s, 80 * s, 0, Math.PI, Math.PI * 2); c.fill();
    };
    figure(100, 130, 1);
    figure(170, 145, 0.9);

    if (!warm) {
        c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 2;
        const ox = rnd(90, 170), oy = rnd(120, 220);
        for (let i = 0; i < 7; i++) {
            const a = rnd(0, Math.PI * 2), l = rnd(50, 170);
            c.beginPath(); c.moveTo(ox, oy);
            c.lineTo(ox + Math.cos(a) * l * 0.5 + rnd(-8, 8), oy + Math.sin(a) * l * 0.5 + rnd(-8, 8));
            c.lineTo(ox + Math.cos(a) * l, oy + Math.sin(a) * l);
            c.stroke();
        }
    }
    return texOf(cv);
}

/* Material estándar que además se registra para brillar por cercanía */
const mk = (mats, color, glow, extra = {}, max = 0.9) => {
    const mat = new THREE.MeshStandardMaterial({
        color, roughness: 0.6, metalness: 0.05, emissive: glow, emissiveIntensity: 0, ...extra
    });
    mats.push({ mat, max });
    return mat;
};

// Caja invisible, más grande que el objeto, para apuntar con comodidad
const hitBox = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false }));
    m.position.set(x, y, z);
    return m;
};

/* ============================================================
   SALA DE LA IRA
   ============================================================ */
export class AngerRoom {
    constructor(scene, doorFactory, initialState, camera) {
        this.scene = scene;
        this.doorFactory = doorFactory;
        this.initialState = initialState;
        this.camera = camera;
        this.interactables = [];
        this.isDoorUnlocked = false;

        this.roomGroup = new THREE.Group();
        this.scene.add(this.roomGroup);

        // Accesibilidad: 0 = sin temblor ni cambios de FOV, 1 = completo
        this.intensity = 1.0;
        this.camera.fov = CFG.baseFov;
        this.camera.updateProjectionMatrix();
        this.currentFov = CFG.baseFov;

        this.doorZ = -8.0;
        this.currentD = CFG.startDepth;
        this.maxD = CFG.maxDepth;
        this.stretching = false;
        this.stretchStart = 0;
        this.stretchFrom = CFG.startDepth;
        this.wallSwapped = false;
        this.wallSpeed = 0;
        this.playerDepth = 0;

        this.entries = [];
        this.breakablesCount = 0;
        this.brokenCount = 0;
        this.shards = [];

        this.releaseSmooth = 0;   // 0 = tensión total, 1 = todo roto (alivio)
        this.warmSmooth = 0;      // luz cálida cerca de lo que querés conservar
        this.warmTarget = 0;
        this.kick = 0;
        this.shakeSpike = 0;
        this.flash = 0;
        this.lastTime = null;

        this.clockRunning = false;
        this.clockT0 = 0;
        this.lastTick = -1;

        this.camPos = new THREE.Vector3();
        this.camLocal = new THREE.Vector3();
        this.camDir = new THREE.Vector3();
        this.redCol = new THREE.Color(0xff4a2a);
        this.warmCol = new THREE.Color(0xffb066);

        this.initShardAssets();
        this.buildRoom();
    }

    setIntensity(value) {
        this.intensity = THREE.MathUtils.clamp(value, 0, 1);
    }

    getZLimit() {
        return this.doorZ - this.currentD + 0.5;
    }

    getXLimit() {
        return CFG.xLimit;
    }

    /* ---------- Pared del fondo (frases de los demás) ---------- */
    createBackWallTexture(withText) {
        const w = 1024, h = 1024;
        const cv = canvasOf(w, h);
        const c = cv.getContext('2d');

        const grad = c.createLinearGradient(0, 0, 0, h);
        if (withText) {
            grad.addColorStop(0, '#1a0505');
            grad.addColorStop(0.5, '#2a0a0a');
            grad.addColorStop(1, '#0a0202');
        } else {
            grad.addColorStop(0, '#050101');
            grad.addColorStop(1, '#000000');
        }
        c.fillStyle = grad;
        c.fillRect(0, 0, w, h);

        if (withText) {
            c.fillStyle = 'rgba(255, 255, 255, 0.9)';
            const phrases = ['El tiempo lo cura todo', 'Tenés que ser fuerte', 'Ya va a pasar...', 'Todo pasa por algo', 'Estoy bien, ya fue'];
            for (let i = 0; i < 16; i++) {
                c.save();
                c.translate(w / 2 + rnd(-400, 400), h / 2 + rnd(-400, 400));
                c.rotate(rnd(-1.5, 1.5));
                c.font = `bold ${Math.floor(rnd(35, 80))}px "Courier New", monospace`;
                c.textAlign = 'center';
                c.fillText(phrases[i % phrases.length], 0, 0);
                c.restore();
            }
        }
        return texOf(cv);
    }

    /* ---------- Construcción ---------- */
    buildRoom() {
        const doorX = 0;

        const doorGroup = this.doorFactory.getClone(true, this.initialState);
        doorGroup.position.set(doorX, 0, this.doorZ);
        doorGroup.rotation.y = Math.PI;

        doorGroup.traverse((c) => {
            if (c.userData && c.userData.id === 'corridorDoor') {
                c.userData = { id: 'entryDoor_anger', prompt: 'Interactuar' };
                this.interactables.push(c);
            }
        });

        this.entryDoorGroup = doorGroup;
        this.roomGroup.add(doorGroup);

        const W = 2.2;
        const H = 2.7;

        const wallMat = new THREE.MeshStandardMaterial({ color: 0x2a0a0a, roughness: 0.9, metalness: 0.1 });
        const floorMat = new THREE.MeshStandardMaterial({ color: 0x1a0505, roughness: 0.8 });
        const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x110202, roughness: 1.0 });

        this.backWallTexWithText = this.createBackWallTexture(true);
        this.backWallTexDark = this.createBackWallTexture(false);
        this.backWallMat = new THREE.MeshStandardMaterial({
            map: this.backWallTexWithText,
            emissiveMap: this.backWallTexWithText,
            emissive: 0xffffff,
            emissiveIntensity: 0.55,
            roughness: 0.9
        });

        this.leftWall = new THREE.Mesh(new THREE.PlaneGeometry(1, H), wallMat);
        this.leftWall.rotation.y = Math.PI / 2;

        this.rightWall = new THREE.Mesh(new THREE.PlaneGeometry(1, H), wallMat);
        this.rightWall.rotation.y = -Math.PI / 2;

        this.backWall = new THREE.Mesh(new THREE.PlaneGeometry(W, H), this.backWallMat);

        this.floor = new THREE.Mesh(new THREE.PlaneGeometry(W, 1), floorMat);
        this.floor.rotation.x = -Math.PI / 2;

        this.ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, 1), ceilingMat);
        this.ceiling.rotation.x = Math.PI / 2;

        const pSide = (W - 1.2) / 2;
        const pLeft = new THREE.Mesh(new THREE.PlaneGeometry(pSide, H), wallMat);
        pLeft.position.set(-W / 2 + pSide / 2, H / 2, this.doorZ);
        pLeft.rotation.y = Math.PI;

        const pRight = new THREE.Mesh(new THREE.PlaneGeometry(pSide, H), wallMat);
        pRight.position.set(W / 2 - pSide / 2, H / 2, this.doorZ);
        pRight.rotation.y = Math.PI;

        const pTop = new THREE.Mesh(new THREE.PlaneGeometry(1.2, H - 2.2), wallMat);
        pTop.position.set(0, 2.2 + (H - 2.2) / 2, this.doorZ);
        pTop.rotation.y = Math.PI;

        this.roomGroup.add(this.leftWall, this.rightWall, this.backWall, pLeft, pRight, pTop, this.floor, this.ceiling);

        // Luces (cantidad fija: no se agregan ni quitan en runtime para evitar tirones)
        this.ambient = new THREE.AmbientLight(0x4a0a0a, CFG.ambient);
        this.lantern = new THREE.PointLight(0xff4a2a, CFG.lantern.intensity, CFG.lantern.distance, CFG.lantern.decay);
        this.flashLight = new THREE.PointLight(0xff9070, 0, 6, 1.5);
        this.roomGroup.add(this.ambient, this.lantern, this.flashLight);

        this.spawnObjects();

        // El reloj de la sala de Negación como hilo conductor (pared izquierda)
        const clockData = this.createClock(0.6);
        this.clockGroup = clockData.group;
        this.clockHands = clockData.hands;
        this.clockGroup.position.set(-W / 2 + 0.05, 1.8, this.doorZ - 3.5);
        this.clockGroup.rotation.y = Math.PI / 2;
        this.roomGroup.add(this.clockGroup);

        this.applyRoomDepth(this.currentD);
    }

    applyRoomDepth(d) {
        const H = 2.7;
        const halfW = 1.1;
        const centerZ = this.doorZ - (d / 2);

        this.leftWall.scale.x = d;
        this.leftWall.position.set(-halfW, H / 2, centerZ);

        this.rightWall.scale.x = d;
        this.rightWall.position.set(halfW, H / 2, centerZ);

        this.backWall.position.set(0, H / 2, this.doorZ - d);

        this.floor.scale.y = d;
        this.floor.position.set(0, 0, centerZ);

        this.ceiling.scale.y = d;
        this.ceiling.position.set(0, H, centerZ);
    }

    /* ============================================================
       OBJETOS
       Los objetos ya están en su lugar, pero detrás de la pared del fondo.
       Cuando la pared se va, los "descubre" uno a uno, y recién ahí se vuelven interactuables.
       ============================================================ */
    spawnObjects() {
        for (const def of LAYOUT) this.addEntry(def);
    }

    addEntry(def) {
        const mats = [];
        const side = def.side;
        const z = this.doorZ - def.dist;
        const keep = !!def.keep;

        let b;
        switch (def.type) {
            case 'vase': b = this.buildVase(side, mats); break;
            case 'mug': b = this.buildMug(side, mats); break;
            case 'frame': b = this.buildFrame(side, mats, false); break;
            case 'photo': b = this.buildFrame(side, mats, true); break;
            case 'mirror': b = this.buildMirror(side, mats); break;
            case 'candle': b = this.buildCandle(side, mats); break;
            case 'box': b = this.buildBox(side, mats); break;
            default: return;
        }

        const group = b.group;
        group.position.z = z;
        group.updateMatrix();
        const center = b.localCenter.clone().applyMatrix4(group.matrix);

        const entry = {
            def, group, mats, keep, center,
            hits: b.hits, parts: b.parts, kind: b.kind, wall: b.wall, side,
            shardSpec: b.shardSpec || [], flame: b.flame || null,
            dist: def.dist, revealed: false, broken: false, brokenAt: 0, wobble: 0, tag: null
        };

        entry.hits.forEach((h) => {
            h.userData = { id: keep ? 'keepsake' : 'breakable', prompt: 'Interactuar', entry };
        });

        // Frase flotante: siempre mira al usuario
        const tag = new THREE.Mesh(
            new THREE.PlaneGeometry(1.2, 0.225),
            new THREE.MeshBasicMaterial({ map: makeTagTexture(def.phrase, keep), transparent: true, opacity: 0, depthWrite: false, fog: false })
        );
        tag.position.set(side * 0.5, b.tagY, z);
        entry.tag = tag;

        this.roomGroup.add(group, tag);
        this.entries.push(entry);
        if (!keep) this.breakablesCount++;
    }

    buildVase(side, mats) {
        const g = new THREE.Group();
        g.position.x = side * 0.66;
        const stone = mk(mats, 0x2a2a2f, 0x501208, { roughness: 0.85 }, 0.7);
        const ceramic = mk(mats, 0xd9ccb9, 0x8a1c10, { roughness: 0.35, side: THREE.DoubleSide }, 0.9);

        const ped = new THREE.Mesh(new THREE.LatheGeometry(PEDESTAL, 24), stone);
        const vase = new THREE.Mesh(new THREE.LatheGeometry(VASE, 32), ceramic);
        vase.position.y = 0.85;
        const hit = hitBox(0.5, 0.75, 0.5, 0, 1.2, 0);
        g.add(ped, vase, hit);

        return {
            group: g, hits: [hit], parts: [vase], localCenter: new THREE.Vector3(0, 1.15, 0),
            tagY: 1.95, kind: 'ceramic', wall: false, shardSpec: [{ mat: 'ceramic', n: 28 }]
        };
    }

    buildMug(side, mats) {
        const g = new THREE.Group();
        g.position.x = side * 1.1;
        g.rotation.y = -side * Math.PI / 2; // mira hacia el centro de la sala
        const wood = mk(mats, 0x2b1a12, 0x501208, { roughness: 0.8 }, 0.7);
        const ceramic = mk(mats, 0xe3d6c3, 0x8a1c10, { roughness: 0.35, side: THREE.DoubleSide }, 0.9);

        const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.035, 0.24), wood);
        shelf.position.set(0, 1.25, 0.12);
        const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.2), wood);
        b1.position.set(-0.2, 1.17, 0.1);
        const b2 = b1.clone(); b2.position.x = 0.2;

        const mug = new THREE.Mesh(new THREE.LatheGeometry(MUG, 24), ceramic);
        mug.position.set(0, 1.2675, 0.12);
        const handle = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.009, 8, 16, Math.PI), ceramic);
        handle.position.set(0.055, 1.3225, 0.12);
        handle.rotation.z = -Math.PI / 2;

        const hit = hitBox(0.35, 0.3, 0.3, 0, 1.36, 0.14);
        g.add(shelf, b1, b2, mug, handle, hit);

        return {
            group: g, hits: [hit], parts: [mug, handle], localCenter: new THREE.Vector3(0, 1.32, 0.12),
            tagY: 1.95, kind: 'ceramic', wall: true, shardSpec: [{ mat: 'ceramic', n: 16 }]
        };
    }

    buildFrame(side, mats, warm) {
        const g = new THREE.Group();
        g.position.x = side * 1.1;
        g.rotation.y = -side * Math.PI / 2;

        const wood = mk(mats, warm ? 0x7a4a24 : 0x1d1411, warm ? 0x6a3a10 : 0x501208, { roughness: 0.6 }, 0.8);
        const photoTex = makePhotoTexture(warm);
        const photo = mk(mats, 0xffffff, 0xffffff, { map: photoTex, emissiveMap: photoTex, roughness: 0.5 }, warm ? 0.55 : 0.35);

        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.84, 0.05), wood);
        frame.position.set(0, 1.55, 0.025);
        const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7), photo);
        pic.position.set(0, 1.55, 0.052);
        const hit = hitBox(0.75, 0.95, 0.2, 0, 1.55, 0.1);
        g.add(frame, pic, hit);

        return {
            group: g, hits: [hit], parts: warm ? [] : [frame, pic], localCenter: new THREE.Vector3(0, 1.55, 0.08),
            tagY: 2.2, kind: 'glass', wall: true, shardSpec: [{ mat: 'glass', n: 18 }, { mat: 'wood', n: 8 }]
        };
    }

    buildMirror(side, mats) {
        const g = new THREE.Group();
        g.position.x = side * 1.1;
        g.rotation.y = -side * Math.PI / 2;

        const metal = mk(mats, 0x2a2d30, 0x501208, { roughness: 0.4, metalness: 0.5 }, 0.7);
        const glass = mk(mats, 0xa8b8c0, 0x7a4038, { roughness: 0.12, metalness: 0.4 }, 0.8);

        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.035, 12, 40), metal);
        ring.position.set(0, 1.5, 0.04);
        const disc = new THREE.Mesh(new THREE.CircleGeometry(0.33, 40), glass);
        disc.position.set(0, 1.5, 0.05);
        const hit = hitBox(0.8, 0.8, 0.2, 0, 1.5, 0.1);
        g.add(ring, disc, hit);

        return {
            group: g, hits: [hit], parts: [ring, disc], localCenter: new THREE.Vector3(0, 1.5, 0.08),
            tagY: 2.25, kind: 'mirror', wall: true, shardSpec: [{ mat: 'mirror', n: 30 }, { mat: 'wood', n: 6 }]
        };
    }

    // --- Objetos que el usuario NO quiere romper (cálidos, con palabras sanas) ---
    buildCandle(side, mats) {
        const g = new THREE.Group();
        g.position.x = side * 0.68;
        const wood = mk(mats, 0x8a5a33, 0x7a4a18, { roughness: 0.7 }, 0.9);
        const wax = mk(mats, 0xefe3cc, 0xa87a3a, { roughness: 0.6 }, 1.0);

        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.04, 28), wood);
        top.position.y = 0.72;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.7, 12), wood);
        leg.position.y = 0.35;
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.04, 24), wood);
        base.position.y = 0.02;
        const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.18, 16), wax);
        candle.position.y = 0.83;
        const flame = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffc766, fog: false }));
        flame.position.y = 0.95;
        flame.scale.y = 1.6;
        const hit = hitBox(0.5, 0.55, 0.5, 0, 0.8, 0);
        g.add(top, leg, base, candle, flame, hit);

        return {
            group: g, hits: [hit], parts: [], localCenter: new THREE.Vector3(0, 0.85, 0),
            tagY: 1.85, kind: 'ceramic', wall: false, flame
        };
    }

    buildBox(side, mats) {
        const g = new THREE.Group();
        g.position.x = side * 0.66;
        const pedWood = mk(mats, 0x6b4426, 0x7a4a18, { roughness: 0.8 }, 0.8);
        const wood = mk(mats, 0x8a5a33, 0x7a4a18, { roughness: 0.7 }, 0.9);
        const brass = mk(mats, 0xc9a24a, 0x8a6a20, { roughness: 0.3, metalness: 0.6 }, 0.8);

        const ped = new THREE.Mesh(new THREE.LatheGeometry(PEDESTAL, 24), pedWood);
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.2), wood);
        body.position.y = 0.93;
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.22), wood);
        lid.position.y = 1.035;
        const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.01), brass);
        clasp.position.set(0, 1.0, 0.105);
        const hit = hitBox(0.5, 0.5, 0.4, 0, 1.0, 0);
        g.add(ped, body, lid, clasp, hit);

        return {
            group: g, hits: [hit], parts: [], localCenter: new THREE.Vector3(0, 1.0, 0),
            tagY: 1.85, kind: 'ceramic', wall: false
        };
    }

    /* ============================================================
       ROMPER / FRAGMENTOS
       ============================================================ */
    initShardAssets() {
        this.shardGeos = [];
        for (let i = 0; i < 6; i++) {
            const s = new THREE.Shape();
            const a = rnd(0.03, 0.07), b = rnd(0.03, 0.08);
            s.moveTo(0, 0);
            s.lineTo(a, rnd(-0.02, 0.02));
            s.lineTo(rnd(0, a), b);
            s.closePath();
            this.shardGeos.push(new THREE.ShapeGeometry(s));
        }
        const base = (color, emissive, extra = {}) => new THREE.MeshStandardMaterial({
            color, emissive, roughness: 0.4, side: THREE.DoubleSide, ...extra
        });
        this.shardMats = {
            ceramic: base(0xd9ccb9, 0x3a1812),
            glass: base(0xbfd9e6, 0x1a2a32, { roughness: 0.1 }),
            mirror: base(0xb8c4cc, 0x1e262a, { roughness: 0.1, metalness: 0.3 }),
            wood: base(0x3a2214, 0x180a04, { roughness: 0.8 })
        };
    }

    spawnShards(entry, burst) {
        for (const part of entry.shardSpec) {
            for (let i = 0; i < part.n; i++) {
                const geo = this.shardGeos[(Math.random() * this.shardGeos.length) | 0];
                const m = new THREE.Mesh(geo, this.shardMats[part.mat]);
                const base = rnd(0.7, 1.5);
                m.scale.setScalar(base);
                m.position.copy(entry.center).add(new THREE.Vector3(rnd(-0.12, 0.12), rnd(-0.15, 0.15), rnd(-0.12, 0.12)));
                m.rotation.set(rnd(0, 6.28), rnd(0, 6.28), rnd(0, 6.28));
                this.roomGroup.add(m);

                const vel = new THREE.Vector3(rnd(-0.8, 0.8), rnd(0.6, 2.8), rnd(-0.8, 0.8)).addScaledVector(burst, rnd(0.4, 2.2));
                this.shards.push({
                    mesh: m, vel, base,
                    spin: new THREE.Vector3(rnd(-12, 12), rnd(-12, 12), rnd(-12, 12)),
                    life: rnd(6, 9), age: 0, rest: false
                });
            }
        }
        while (this.shards.length > 220) {
            const old = this.shards.shift();
            this.roomGroup.remove(old.mesh);
        }
    }

    updateShards(dt) {
        const H = 2.7;
        for (let i = this.shards.length - 1; i >= 0; i--) {
            const s = this.shards[i], m = s.mesh;
            s.age += dt;
            if (!s.rest) {
                s.vel.y -= 9.8 * dt;
                m.position.addScaledVector(s.vel, dt);
                m.rotation.x += s.spin.x * dt;
                m.rotation.y += s.spin.y * dt;
                m.rotation.z += s.spin.z * dt;

                if (m.position.y < 0.01) {
                    m.position.y = 0.01;
                    s.vel.y *= -0.3;
                    s.vel.x *= 0.6; s.vel.z *= 0.6;
                    s.spin.multiplyScalar(0.6);
                    if (Math.abs(s.vel.y) < 0.4) {
                        s.rest = true;
                        m.rotation.set(-Math.PI / 2, 0, rnd(0, 6.28)); // queda tirado en el piso
                    }
                }
                if (Math.abs(m.position.x) > 1.05) {
                    m.position.x = Math.sign(m.position.x) * 1.05;
                    s.vel.x *= -0.3;
                }
                if (m.position.y > H - 0.05) {
                    m.position.y = H - 0.05;
                    s.vel.y = -Math.abs(s.vel.y) * 0.3;
                }
            }
            const left = s.life - s.age;
            if (left < 1) m.scale.setScalar(Math.max(0.001, left) * s.base);
            if (left <= 0) {
                this.roomGroup.remove(m);
                this.shards.splice(i, 1);
            }
        }
    }

    breakEntry(entry, uiPromptCallback) {
        entry.broken = true;
        entry.brokenAt = this.lastTime ?? 0;
        entry.parts.forEach((p) => { p.visible = false; });
        entry.hits.forEach((h) => {
            const i = this.interactables.indexOf(h);
            if (i > -1) this.interactables.splice(i, 1);
        });
        this.brokenCount++;

        // Los fragmentos salen hacia el pasillo (objetos de pared) o alejándose del usuario
        const burst = entry.wall
            ? new THREE.Vector3(-entry.side, 0, 0)
            : new THREE.Vector3(entry.center.x - this.camLocal.x, 0, entry.center.z - this.camLocal.z).normalize();
        this.spawnShards(entry, burst);

        // Feedback por varios canales: luz, cámara y sonido
        const flashColors = { ceramic: 0xffa070, glass: 0xc8e0ff, mirror: 0xdde8ff };
        this.flashLight.color.setHex(flashColors[entry.kind] || 0xffa070);
        this.flashLight.position.copy(entry.center);
        this.flash = 1;
        this.kick = 1;
        this.shakeSpike = 1;
        playShatter(entry.kind, 0.18 + 0.22 * this.intensity);

        if (this.brokenCount >= this.breakablesCount && !this.isDoorUnlocked) {
            this.releaseRoom(uiPromptCallback);
        }
    }

    nudge(entry) {
        entry.wobble = 1;
        playSoft(330 + Math.random() * 90);
    }

    releaseRoom(uiPromptCallback) {
        this.isDoorUnlocked = true;
        this.startClock();
        setTimeout(() => {
            uiPromptCallback('La ira se baja. Escuchás el tic-tac de un reloj...');
        }, 1800);

        this.entryDoorGroup.userData.setState(2);
        this.entryDoorGroup.traverse((c) => {
            if (c.userData && c.userData.id === 'entryDoor_anger') {
                c.userData.prompt = 'Salir de la Ira (Interactuar)';
            }
        });
    }

    /* ---------- Interacción ---------- */
    interact(object, uiPromptCallback) {
        const id = object.userData.id;

        if (id === 'entryDoor_anger') {
            uiPromptCallback(this.isDoorUnlocked
                ? 'La puerta ya no está trabada.'
                : 'La manija ni se mueve. La ira te encierra.');
            return;
        }

        const entry = object.userData.entry;
        if (!entry || entry.broken) return;

        if (entry.keep) {
            this.nudge(entry);
            uiPromptCallback('No lo querés romper.');
            return;
        }
        this.breakEntry(entry, uiPromptCallback);
    }

    /* ============================================================
       RELOJ (mismo de Denial, pero sin la flor en el vidrio)
       ============================================================ */
    createWoodTexture(base) {
        const S = 256;
        const cv = canvasOf(S, S);
        const c = cv.getContext('2d');
        c.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
        c.fillRect(0, 0, S, S);
        for (let i = 0; i < 160; i++) {
            const y = rnd(0, S);
            const dark = Math.random() > 0.45;
            c.strokeStyle = dark ? `rgba(0,0,0,${rnd(0.05, 0.16)})` : `rgba(255,220,180,${rnd(0.02, 0.06)})`;
            c.lineWidth = rnd(0.6, 2.2);
            c.beginPath();
            c.moveTo(0, y);
            for (let x = 0; x <= S; x += 32) c.lineTo(x, y + Math.sin(x * 0.05 + i) * rnd(0.5, 2.5));
            c.stroke();
        }
        const t = texOf(cv);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        return t;
    }

    createClockFaceTexture() {
        const S = 1024, c0 = S / 2;
        const cv = canvasOf(S, S);
        const c = cv.getContext('2d');
        const g = c.createRadialGradient(c0, c0, 0, c0, c0, c0);
        g.addColorStop(0, '#04161a'); g.addColorStop(0.7, '#020b0d'); g.addColorStop(1, '#000000');
        c.fillStyle = g; c.fillRect(0, 0, S, S);
        c.strokeStyle = 'rgba(60,150,150,0.25)'; c.lineWidth = 3;
        c.beginPath(); c.arc(c0, c0, c0 * 0.94, 0, Math.PI * 2); c.stroke();
        c.translate(c0, c0); c.lineCap = 'round';
        for (let i = 0; i < 60; i++) {
            c.save(); c.rotate((i / 60) * Math.PI * 2);
            const hour = i % 5 === 0; const card = i % 15 === 0;
            c.strokeStyle = i === 0 ? '#e2704f' : (hour ? '#f3dccd' : 'rgba(243,220,205,0.4)');
            c.lineWidth = card ? 20 : (hour ? 13 : 4);
            const r1 = c0 * 0.9, r2 = r1 - (card ? 100 : (hour ? 70 : 20));
            c.beginPath(); c.moveTo(0, -r1); c.lineTo(0, -r2); c.stroke();
            c.restore();
        }
        return texOf(cv);
    }

    // Solo un reflejo suave en el vidrio (sin flor)
    createClockGlassTexture() {
        const S = 1024, c0 = S / 2;
        const cv = canvasOf(S, S);
        const c = cv.getContext('2d');
        c.beginPath(); c.arc(c0, c0, c0, 0, Math.PI * 2); c.clip();
        const gl = c.createLinearGradient(0, 0, S, S);
        gl.addColorStop(0.0, 'rgba(160,230,225,0.10)');
        gl.addColorStop(0.35, 'rgba(160,230,225,0)');
        c.fillStyle = gl; c.fillRect(0, 0, S, S);
        return texOf(cv);
    }

    createClock(R) {
        const group = new THREE.Group();
        const add = (m) => { group.add(m); return m; };

        const walnut = new THREE.MeshStandardMaterial({ map: this.createWoodTexture([58, 32, 22]), emissive: 0x100804, roughness: 0.5 });
        const cream = new THREE.MeshStandardMaterial({ color: 0xf1d9c9, emissive: 0x3a2a22, roughness: 0.45 });
        const coral = new THREE.MeshStandardMaterial({ color: 0xe2704f, emissive: 0x4a1a0e, roughness: 0.5 });

        const body = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.07, R + 0.07, 0.12, 96), walnut);
        body.rotation.x = Math.PI / 2; body.position.z = 0.06; add(body);

        const faceTex = this.createClockFaceTexture();
        const face = new THREE.Mesh(new THREE.CircleGeometry(R, 96), new THREE.MeshStandardMaterial({ map: faceTex, emissiveMap: faceTex, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.35 }));
        face.position.z = 0.122; add(face);

        const bezel = new THREE.Mesh(new THREE.TorusGeometry(R + 0.035, 0.035, 16, 96), new THREE.MeshStandardMaterial({ color: 0x1c2b2d, emissive: 0x050c0d, roughness: 0.35, metalness: 0.6 }));
        bezel.position.z = 0.125; add(bezel);

        const makeHand = (len, w, tail, mat, depth, z) => {
            const s = new THREE.Shape();
            s.moveTo(-w / 2, -tail); s.lineTo(w / 2, -tail); s.lineTo(w / 2, len * 0.88); s.lineTo(0, len); s.lineTo(-w / 2, len * 0.88); s.closePath();
            const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }), mat);
            m.position.z = z; return add(m);
        };

        const TAU = Math.PI * 2;
        const hourHand = makeHand(R * 0.52, 0.08, 0.06, cream, 0.010, 0.130);
        const minuteHand = makeHand(R * 0.82, 0.055, 0.07, cream, 0.010, 0.142);
        const secondHand = makeHand(R * 0.90, 0.012, R * 0.18, coral, 0.004, 0.154);

        // Detenido en las 3:17:41
        hourHand.rotation.z = -(((3 % 12) + 17 / 60) / 12) * TAU;
        minuteHand.rotation.z = -((17 + 41 / 60) / 60) * TAU;
        secondHand.rotation.z = -(41 / 60) * TAU;

        const glass = new THREE.Mesh(new THREE.CircleGeometry(R + 0.01, 64), new THREE.MeshBasicMaterial({ map: this.createClockGlassTexture(), transparent: true, depthWrite: false }));
        glass.position.z = 0.175; add(glass);

        return { group, hands: { hourHand, minuteHand, secondHand } };
    }

    startClock() {
        if (this.clockRunning) return;
        this.clockRunning = true;
        this.clockT0 = this.lastTime ?? 0;
        this.lastTick = -1;
    }

    updateClock(time) {
        if (!this.clockRunning) return;
        const { hourHand, minuteHand, secondHand } = this.clockHands;
        const TAU = Math.PI * 2;
        const base = (3 % 12) * 3600 + 17 * 60 + 41;
        const elapsed = Math.max(0, time - this.clockT0);
        const whole = Math.floor(elapsed);
        if (whole !== this.lastTick) {
            this.lastTick = whole;
            playTick();
        }
        const jump = Math.min(1, (elapsed - whole) / 0.15);
        const total = base + whole + (1 - Math.pow(1 - jump, 3));
        hourHand.rotation.z = -((total / 43200) % 1) * TAU;
        minuteHand.rotation.z = -((total % 3600) / 3600) * TAU;
        secondHand.rotation.z = -((total % 60) / 60) * TAU;
    }

    /* ============================================================
       BUCLE PRINCIPAL
       ============================================================ */
    update(time) {
        if (!this.camera) return;

        const dt = this.lastTime === null ? 0.016 : Math.min(0.05, Math.max(0.0001, time - this.lastTime));
        this.lastTime = time;

        this.camera.getWorldPosition(this.camPos);
        this.camLocal.copy(this.camPos).sub(this.roomGroup.position);
        this.camera.getWorldDirection(this.camDir);
        const playerDepth = this.doorZ - this.camLocal.z;
        this.playerDepth = playerDepth;

        this.updateWall(dt, playerDepth, time);
        this.updateEntries(time, dt);
        this.updateShards(dt);
        this.updateClock(time);
        this.updateLightsAndCamera(time, dt);
    }

    // Al acercarte a la pared del fondo, se dispara el estiramiento: la pared se va hasta el fondo
    updateWall(dt, playerDepth, time) {
        if (!this.stretching && this.currentD - playerDepth < CFG.triggerDist) {
            this.stretching = true;
            this.stretchStart = time;
            this.stretchFrom = this.currentD;
            this.shakeSpike = 1;

            const ui = document.getElementById('ui-prompt');
            if (ui) {
                const msg = 'El espacio se retuerce... la rabia lo consume todo.';
                ui.innerText = msg;
                setTimeout(() => { if (ui.innerText === msg) ui.innerText = ''; }, 4000);
            }
        }

        let newD = this.currentD;
        if (this.stretching && this.currentD < this.maxD) {
            const p = THREE.MathUtils.clamp((time - this.stretchStart) / CFG.stretchDuration, 0, 1);
            // Arranca lento, explota rápido y frena brusco
            const ease = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
            newD = this.stretchFrom + (this.maxD - this.stretchFrom) * ease;
        }

        const speed = (newD - this.currentD) / dt;
        this.wallSpeed += (speed - this.wallSpeed) * (1 - Math.exp(-dt * 5));
        if (newD !== this.currentD) {
            this.currentD = newD;
            this.applyRoomDepth(newD);
        }

        // Las frases de los demás se van apagando a medida que la pared se aleja
        if (!this.wallSwapped) {
            this.backWallMat.emissiveIntensity = 0.55 * (1 - 0.85 * smooth(6, 26, this.currentD));
            if (this.currentD >= this.maxD - 0.01) {
                this.wallSwapped = true;
                this.backWallMat.map = this.backWallTexDark;
                this.backWallMat.emissiveMap = this.backWallTexDark;
                this.backWallMat.emissiveIntensity = 0.05;
            }
        }
    }

    // Descubre objetos, los ilumina al acercarse y hace que las frases te miren
    updateEntries(time, dt) {
        const release = this.breakablesCount ? this.brokenCount / this.breakablesCount : 0;
        this.releaseSmooth += (release - this.releaseSmooth) * (1 - Math.exp(-dt * 1.5));
        const rel = this.releaseSmooth;

        let warm = 0;
        for (const e of this.entries) {
            if (!e.revealed && this.currentD > e.dist + 0.45) {
                e.revealed = true;
                for (const h of e.hits) this.interactables.push(h);
            }
            if (!e.revealed) continue;

            const dx = e.center.x - this.camLocal.x;
            const dz = e.center.z - this.camLocal.z;
            const d = Math.hypot(dx, dz);
            const prox = 1 - smooth(1.2, 5.5, d);

            // La frase siempre mira al usuario (solo rota en Y)
            e.tag.rotation.y = Math.atan2(this.camLocal.x - e.tag.position.x, this.camLocal.z - e.tag.position.z);

            if (!e.broken) {
                for (const m of e.mats) {
                    m.mat.emissiveIntensity = e.keep
                        ? m.max * (0.35 + 0.65 * prox) + 0.25 * rel
                        : m.max * (0.12 + 0.88 * prox);
                }
                e.tag.material.opacity = e.keep
                    ? Math.max(prox, 0.6 * rel, CFG.farGlimmer)
                    : Math.max(prox, CFG.farGlimmer);
                if (e.keep) warm = Math.max(warm, 1 - smooth(0.9, 3.2, d));

                if (e.flame) {
                    e.flame.scale.y = 1.5 + 0.25 * Math.sin(time * 13 + e.dist) + 0.1 * Math.sin(time * 29);
                }
                if (e.wobble > 0.001) {
                    e.group.rotation.z = Math.sin(time * 38) * 0.05 * e.wobble;
                    e.wobble *= Math.exp(-dt * 5);
                } else if (e.group.rotation.z !== 0) {
                    e.group.rotation.z = 0;
                }
            } else if (e.tag.visible) {
                // La frase "se dice" y se va
                const t = time - e.brokenAt;
                const op = Math.max(0, 1 - t / 1.6);
                e.tag.material.opacity = op;
                e.tag.scale.setScalar(1 + t * 0.25);
                if (op <= 0) e.tag.visible = false;
            }
        }
        this.warmTarget = Math.max(warm, 0.6 * rel);
    }

    updateLightsAndCamera(time, dt) {
        const calm = 1 - 0.7 * this.releaseSmooth; // 1 = tensión total, 0.3 = alivio
        this.warmSmooth += (this.warmTarget - this.warmSmooth) * (1 - Math.exp(-dt * 4));
        const tension = THREE.MathUtils.clamp((this.playerDepth - 3) / 22, 0, 1);

        // La luz acompaña al usuario, un poco hacia donde mira
        this.lantern.position.set(
            this.camLocal.x + this.camDir.x * 0.35,
            this.camLocal.y + 0.25,
            this.camLocal.z + this.camDir.z * 0.35
        );
        const omega = 5 + 4 * tension; // late más rápido a medida que avanzás
        const pulse = 0.18 * Math.pow(Math.max(0, Math.sin(time * omega)), 6) * (1 - this.warmSmooth);
        this.lantern.intensity = CFG.lantern.intensity * calm * (1 + pulse);
        this.lantern.color.copy(this.redCol).lerp(this.warmCol, this.warmSmooth);
        this.ambient.intensity = CFG.ambient * (0.4 + 0.6 * calm);

        // Destello al romper
        this.flash *= Math.exp(-dt * 10);
        this.flashLight.intensity = this.flash * 14;

        // Cámara
        this.kick *= Math.exp(-dt * 7);
        this.shakeSpike *= Math.exp(-dt * 5);
        const stretch = THREE.MathUtils.clamp(this.wallSpeed / 8, 0, 1);
        const k = this.intensity * calm;

        const targetFov = CFG.baseFov + CFG.fovStretch * stretch * k - this.kick * 1.5 * this.intensity;
        if (Math.abs(targetFov - this.currentFov) > 0.01) {
            this.currentFov = targetFov;
            this.camera.fov = targetFov;
            this.camera.updateProjectionMatrix();
        }

        const amp = (CFG.baseShake + CFG.shakeBoost * tension + this.shakeSpike * 0.015 + stretch * 0.012) * k * (1 - 0.6 * this.warmSmooth);
        const shakeX = Math.sin(time * 45) * amp + Math.cos(time * 30) * amp * 0.5;
        const shakeY = Math.cos(time * 50) * amp + Math.sin(time * 25) * amp * 0.5;
        this.camera.position.set(shakeX, shakeY, this.kick * 0.05 * this.intensity);
        this.camera.rotation.z = Math.sin(time * 55) * 0.008 * this.kick * this.intensity;
    }
}