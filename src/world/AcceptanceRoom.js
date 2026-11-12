import * as THREE from "three";

/* ============================================================
   CONFIG: tocá estos valores para ajustar rápido
   ============================================================ */
const CFG = {
  doorZ: -8, // puerta de entrada
  wallZ: -30, // pared del fondo (puerta de salida)
  halfW: 8, // el atrio mide 16 m de ancho
  H: 5.2, // altura de las paredes
  cameraFar: 300,
  baseFov: 75,
  fog: { color: 0xf3e6c4, near: 24, far: 130 },

  growSeconds: 80, // de la semilla al capullo abierto
  sproutAt: 0.06, // fracción de crecimiento en la que aparece el primer brote (destraba la puerta)
  finaleDistance: 14, // metros caminados afuera antes de pasar a la pantalla final

  // Acorde consonante (do mayor con 7ª y 9ª): cada objeto del memorial suma una nota
  chord: [130.81, 196.0, 329.63, 493.88, 587.33],

  // Dónde están esparcidos los objetos del recorrido (x, z)
  spots: [
    [-3.2, -13.2],
    [3.4, -14.6],
    [-3.6, -22.6],
    [4.2, -23.4],
    [-0.2, -26.2],
  ],
  pot: { x: 0, z: -19 },
  table: { x: -7.0, z: -18.3, w: 2.7, d: 1.3 }, // w = ancho (eje z), d = profundidad (eje x)
};

const rnd = (a, b) => a + Math.random() * (b - a);
const smooth = (e0, e1, x) => {
  const t = THREE.MathUtils.clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const lerp3 = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const canvasOf = (w, h) => {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  return cv;
};
const texOf = (cv, srgb = true) => {
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
const profile = (pts) => pts.map(([x, y]) => new THREE.Vector2(x, y));

// La dalia del vidrio del reloj de la Negación
function drawDahlia(c, cx, cy, R, alpha = 1) {
  c.save();
  c.translate(cx, cy);
  c.globalAlpha = alpha;
  const rings = 7;
  for (let i = rings - 1; i >= 0; i--) {
    const t = i / (rings - 1);
    const n = 9 + i * 5;
    const col = lerp3([231, 108, 76], [248, 232, 222], t);
    const d = R * (0.05 + 0.6 * t);
    const l = R * (0.11 + 0.21 * t);
    for (let k = 0; k < n; k++) {
      c.save();
      c.rotate((k / n) * Math.PI * 2 + i * 0.4);
      c.beginPath();
      c.ellipse(0, -d, l * 0.45, l, 0, 0, Math.PI * 2);
      c.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
      c.fill();
      c.strokeStyle = "rgba(120,50,30,0.18)";
      c.lineWidth = Math.max(1, R * 0.008);
      c.stroke();
      c.restore();
    }
  }
  c.restore();
}

export class AcceptanceRoom {
  /* extras = { memories: ['vase','photo',...], setControlsLocked(bool), onFinish() } */
  constructor(
    scene,
    doorFactory,
    initialState,
    camera,
    audio,
    say,
    extras = {},
  ) {
    this.scene = scene;
    this.doorFactory = doorFactory;
    this.initialState = initialState;
    this.camera = camera;
    this.audio = audio || null;
    this.say = say || (() => {});
    this.extras = extras;
    this.interactables = [];
    this.isDoorUnlocked = false; // a propósito: la salida la maneja la sala (main.js no debe tratarla como puerta al pasillo)

    this.roomGroup = new THREE.Group();
    this.scene.add(this.roomGroup);

    // Objetos del recorrido (si se prueba la sala sola, usa unos de ejemplo)
    this.memories =
      extras.memories && extras.memories.length
        ? extras.memories.slice(0, 4)
        : ["vase", "photo", "key", "lantern"];

    this.textures = [];
    this.items = [];
    this.slots = [];
    this.tweens = [];
    this.carrying = null;
    this.placed = 0;
    this.lastTime = null;
    this.lastPz = CFG.doorZ;
    this.yaw = null;

    this.seedAvailable = false;
    this.pot = { seed: false, wet: false, growing: false, g: 0, t0: 0 };
    this.hope = 0;
    this.hint = 0;

    this.exitUnlocked = false;
    this.exitOpen = false;
    this.finale = false;
    this.clockRunning = false;
    this.clockT0 = 0;
    this.lastTick = -1;
    this.cardTouched = false;
    this.cardText = "";
    this.editorOpen = false;
    this.handYaw = 0.4;
    this.colliders = [];
    this.sunC0 = new THREE.Color(0xfff0d0);
    this.sunC1 = new THREE.Color(0xffd890);

    this.saved = {
      far: camera.far,
      fogColor: scene.fog ? scene.fog.color.clone() : null,
      fogNear: scene.fog ? scene.fog.near : 2,
      fogFar: scene.fog ? scene.fog.far : 22,
      bg:
        scene.background && scene.background.isColor
          ? scene.background.clone()
          : null,
    };

    this.buildRoom();
    this.audio?.startGarden?.();
  }

  getZLimit() {
    return this.exitOpen ? CFG.wallZ - 45 : CFG.wallZ + 0.7;
  }
  getXLimit() {
    const d = Math.abs(this.lastPz - CFG.wallZ);
    if (this.exitOpen && d < 0.8) return 0.5; // pasar por el marco de la puerta
    if (this.lastPz < CFG.wallZ - 0.8) return 4.5; // afuera, sobre el camino
    return CFG.halfW - 0.6;
  }

  dispose() {
    this.audio?.stopGarden?.();
    if (this.hand) this.camera.remove(this.hand);
    document.getElementById("card-editor")?.remove();
    this.camera.far = this.saved.far;
    this.camera.fov = CFG.baseFov;
    this.camera.position.set(0, 0, 0);
    this.camera.rotation.set(0, 0, 0);
    this.camera.updateProjectionMatrix();
    if (this.scene.fog && this.saved.fogColor) {
      this.scene.fog.color.copy(this.saved.fogColor);
      this.scene.fog.near = this.saved.fogNear;
      this.scene.fog.far = this.saved.fogFar;
    }
    if (this.saved.bg && this.scene.background && this.scene.background.isColor)
      this.scene.background.copy(this.saved.bg);
    this.textures.forEach((t) => t.dispose());
    this.textures = [];
  }

  tex(cv, srgb = true) {
    const t = texOf(cv, srgb);
    this.textures.push(t);
    return t;
  }
  addHit(h) {
    if (!this.interactables.includes(h)) this.interactables.push(h);
  }
  removeHit(h) {
    const i = this.interactables.indexOf(h);
    if (i > -1) this.interactables.splice(i, 1);
  }
  hitBox(w, h, d, x, y, z, userData) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    m.position.set(x, y, z);
    m.userData = userData;
    return m;
  }
  glowSprite(color, size, opacity = 1) {
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTex,
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    );
    s.scale.set(size, size, 1);
    return s;
  }
  std(color, extra = {}) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.75,
      metalness: 0,
      ...extra,
    });
  }

  /* ============================================================
     CONSTRUCCIÓN
     ============================================================ */
  buildRoom() {
    this.setupAtmosphere();
    this.buildLights();
    this.buildSky();
    this.buildArchitecture();
    this.buildGarden();
    this.buildExterior();
    this.buildDoors();
    this.buildMemorial();
    this.buildItems();
    this.buildPotAndPlant();
    this.buildAtmosphereFx();

    // Mano: donde se ve lo que el usuario lleva
    this.hand = new THREE.Group();
    this.hand.position.set(0.3, -0.26, -0.55);
    this.camera.add(this.hand);
  }

  setupAtmosphere() {
    this.camera.far = CFG.cameraFar;
    this.camera.updateProjectionMatrix();
    if (this.scene.background && this.scene.background.isColor)
      this.scene.background.setHex(CFG.fog.color);
    else this.scene.background = new THREE.Color(CFG.fog.color);
    if (this.scene.fog) {
      this.scene.fog.color.setHex(CFG.fog.color);
      this.scene.fog.near = CFG.fog.near;
      this.scene.fog.far = CFG.fog.far;
    }
    // Textura de brillo compartida
    const S = 128;
    const cv = canvasOf(S, S);
    const c = cv.getContext("2d");
    const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);
    this.glowTex = this.tex(cv);
  }

  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xfff1cf, 0x6f8f5a, 0.9);
    this.sun = new THREE.DirectionalLight(0xfff0d0, 1.25);
    this.sun.position.set(-8, 14, -6);
    this.sun.target.position.set(0, 0, -20);
    this.plantLight = new THREE.PointLight(0xffe3a0, 0, 4.5, 2);
    this.roomGroup.add(this.hemi, this.sun, this.sun.target, this.plantLight);
  }

  buildSky() {
    const cv = canvasOf(8, 512);
    const c = cv.getContext("2d");
    const g = c.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, "#6fb0d4");
    g.addColorStop(0.35, "#b9dde6");
    g.addColorStop(0.5, "#f6e3b0");
    g.addColorStop(1, "#f3e6c4");
    c.fillStyle = g;
    c.fillRect(0, 0, 8, 512);
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(200, 24, 16),
      new THREE.MeshBasicMaterial({
        map: this.tex(cv),
        side: THREE.BackSide,
        fog: false,
        depthWrite: false,
      }),
    );
    dome.position.set(0, 0, -30);
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    this.sunGlow = this.glowSprite(0xffe2a0, 110, 0.55);
    this.sunGlow.position.set(-25, 30, -185);
    this.roomGroup.add(dome, this.sunGlow);
  }

  /* ---------- Paredes, techo con claraboya y piso ---------- */
  buildArchitecture() {
    const { halfW: W, H, wallZ, doorZ } = CFG;
    const L = doorZ - wallZ; // 22
    const midZ = (doorZ + wallZ) / 2;
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0xe9dec2,
      roughness: 0.95,
      side: THREE.DoubleSide,
    });
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x8b6a4a,
      roughness: 0.8,
      side: THREE.DoubleSide,
    });
    const plane = (w, h, mat, x, y, z, ry = 0, rx = 0) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, 0);
      this.roomGroup.add(m);
      return m;
    };
    // Paredes laterales
    plane(L, H, wallMat, -W, H / 2, midZ, Math.PI / 2);
    plane(L, H, wallMat, W, H / 2, midZ, -Math.PI / 2);
    // Paredes de entrada y de salida, con el hueco de la puerta (1.2 x 2.2)
    [doorZ, wallZ].forEach((z) => {
      const side = W - 0.6;
      plane(side, H, wallMat, -0.6 - side / 2, H / 2, z);
      plane(side, H, wallMat, 0.6 + side / 2, H / 2, z);
      plane(1.2, H - 2.2, wallMat, 0, 2.2 + (H - 2.2) / 2, z);
    });
    // Techo: un marco de madera alrededor de una gran claraboya abierta al cielo
    const roof = (w, d, x, z) => plane(w, d, woodMat, x, H, z, 0, Math.PI / 2);
    roof(3, L, -W + 1.5, midZ);
    roof(3, L, W - 1.5, midZ);
    roof(2 * W - 6, 3, 0, doorZ - 1.5);
    roof(2 * W - 6, 3, 0, wallZ + 1.5);

    // Piso de piedra clara
    const S = 512;
    const cv = canvasOf(S, S);
    const c = cv.getContext("2d");
    c.fillStyle = "#d3c7aa";
    c.fillRect(0, 0, S, S);
    for (let i = 0; i < 3000; i++) {
      c.fillStyle =
        Math.random() > 0.5 ? "rgba(90,70,40,0.07)" : "rgba(255,250,230,0.08)";
      c.fillRect(rnd(0, S), rnd(0, S), 3, 3);
    }
    c.strokeStyle = "rgba(110,90,60,0.35)";
    c.lineWidth = 3;
    c.strokeRect(0, 0, S, S);
    const ft = this.tex(cv);
    ft.wrapS = ft.wrapT = THREE.RepeatWrapping;
    ft.repeat.set(16, 22);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(2 * W, L),
      new THREE.MeshStandardMaterial({ map: ft, roughness: 0.9 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.005, midZ);
    this.roomGroup.add(floor);

    // Haces de sol que bajan por la claraboya (planos aditivos con degradé)
    const bc = canvasOf(64, 256);
    const b = bc.getContext("2d");
    const bg = b.createLinearGradient(0, 0, 0, 256);
    bg.addColorStop(0, "rgba(255,236,180,0.9)");
    bg.addColorStop(1, "rgba(255,236,180,0)");
    b.fillStyle = bg;
    b.fillRect(0, 0, 64, 256);
    b.globalCompositeOperation = "destination-in";
    const bh = b.createLinearGradient(0, 0, 64, 0);
    bh.addColorStop(0, "rgba(0,0,0,0)");
    bh.addColorStop(0.5, "rgba(0,0,0,1)");
    bh.addColorStop(1, "rgba(0,0,0,0)");
    b.fillStyle = bh;
    b.fillRect(0, 0, 64, 256);
    const beamTex = this.tex(bc);
    this.beams = [];
    [
      [-3.5, -14],
      [-1.2, -21],
      [2.2, -17],
      [4.2, -24],
      [0.2, -12.5],
    ].forEach(([x, z], i) => {
      const mat = new THREE.MeshBasicMaterial({
        map: beamTex,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      });
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1.8 + (i % 2) * 0.6, 8),
        mat,
      );
      m.position.set(x, H / 2 + 0.4, z);
      m.rotation.set(0, 0.5 + i * 0.7, 0.32);
      m.renderOrder = 2;
      this.roomGroup.add(m);
      this.beams.push({ mesh: m, phase: i * 1.7 });
    });
  }

  /* ---------- Jardín: canteros, pasto que se mece, flores y árboles ---------- */
  buildGarden() {
    const soilMat = this.std(0x4a3626, { roughness: 1 });
    const beds = [
      [-5.6, -0.9],
      [0.9, 5.6],
    ];
    const zMin = -26.4,
      zMax = -11.6;
    beds.forEach(([x0, x1]) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(x1 - x0, zMax - zMin),
        soilMat,
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set((x0 + x1) / 2, 0.012, (zMin + zMax) / 2);
      this.roomGroup.add(m);
    });
    // Plazoleta de piedra alrededor de la maceta
    const plaza = new THREE.Mesh(
      new THREE.CircleGeometry(1.7, 40),
      this.std(0xdacfb2, { roughness: 0.9 }),
    );
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(CFG.pot.x, 0.02, CFG.pot.z);
    this.roomGroup.add(plaza);

    // Pasto instanciado: el vaivén ocurre en el vertex shader (sin costo de CPU)
    const blade = new THREE.BufferGeometry();
    blade.setAttribute(
      "position",
      new THREE.BufferAttribute(
        new Float32Array([-0.03, 0, 0, 0.03, 0, 0, 0, 1, 0]),
        3,
      ),
    );
    this.grassMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { uTime: { value: 0 }, uHope: { value: 0 } },
      ]),
      vertexShader: `
        uniform float uTime;
        varying float vH; varying float vTint;
        #include <fog_pars_vertex>
        void main(){
          vH = position.y;
          vec4 ip = instanceMatrix * vec4(position, 1.0);
          float ph = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 1.3;
          ip.x += sin(uTime * 1.5 + ph) * 0.09 * vH * vH;
          ip.z += cos(uTime * 1.2 + ph * 0.7) * 0.05 * vH * vH;
          vTint = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
          vec4 mvPosition = modelViewMatrix * ip;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform float uHope;
        varying float vH; varying float vTint;
        #include <fog_pars_fragment>
        void main(){
          vec3 base = mix(vec3(0.20, 0.40, 0.22), vec3(0.28, 0.52, 0.28), vTint);
          vec3 tip = mix(vec3(0.55, 0.78, 0.42), vec3(0.88, 0.82, 0.46), vTint * 0.6 + uHope * 0.4);
          gl_FragColor = vec4(mix(base, tip, vH), 1.0);
          #include <fog_fragment>
        }`,
      side: THREE.DoubleSide,
      fog: true,
    });
    const per = 2600;
    const grass = new THREE.InstancedMesh(
      blade,
      this.grassMat,
      per * beds.length,
    );
    const d = new THREE.Object3D();
    let k = 0;
    beds.forEach(([x0, x1]) => {
      for (let i = 0; i < per; i++) {
        d.position.set(
          rnd(x0 + 0.05, x1 - 0.05),
          0.012,
          rnd(zMin + 0.05, zMax - 0.05),
        );
        d.rotation.set(0, rnd(0, Math.PI * 2), 0);
        d.scale.set(1, rnd(0.28, 0.62), 1);
        d.updateMatrix();
        grass.setMatrixAt(k++, d.matrix);
      }
    });
    grass.frustumCulled = false;
    this.roomGroup.add(grass);

    // Flores sueltas (esferas de color: estilo simple, sin detalle fotográfico)
    const palette = [0xf2c14e, 0xe8805f, 0xf4efe6, 0xe9a0b4, 0xd9b45b];
    const flowers = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.065, 6, 5),
      new THREE.MeshBasicMaterial(),
      150,
    );
    for (let i = 0; i < 150; i++) {
      const [x0, x1] = beds[i % 2];
      d.position.set(
        rnd(x0 + 0.1, x1 - 0.1),
        rnd(0.38, 0.62),
        rnd(zMin + 0.1, zMax - 0.1),
      );
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(rnd(0.8, 1.3));
      d.updateMatrix();
      flowers.setMatrixAt(i, d.matrix);
      flowers.setColorAt(i, new THREE.Color(palette[i % palette.length]));
    }
    flowers.instanceMatrix.needsUpdate = true;
    flowers.instanceColor.needsUpdate = true;
    flowers.frustumCulled = false;
    this.roomGroup.add(flowers);

    // Cuatro árboles bajos en las esquinas
    const trunk = this.std(0x6b4a32);
    const leaf = this.std(0x5f9a5a, { flatShading: true });
    [
      [-6.8, -12.4],
      [6.8, -13.4],
      [6.8, -26.8],
      [-6.8, -26.2],
    ].forEach(([x, z]) => {
      const t = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.22, 2.6, 6),
        trunk,
      );
      t.position.set(x, 1.3, z);
      this.roomGroup.add(t);
      [
        [0, 3.1, 0, 1.2],
        [0.55, 2.7, 0.2, 0.85],
        [-0.5, 2.8, -0.3, 0.9],
      ].forEach(([ox, oy, oz, r]) => {
        const f = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), leaf);
        f.position.set(x + ox, oy, z + oz);
        this.roomGroup.add(f);
      });
      this.colliders.push({ x, z, r: 0.5 });
    });
  }

  /* ---------- Afuera: pradera, camino y colinas hacia el horizonte ---------- */
  buildExterior() {
    const S = 256;
    const cv = canvasOf(S, S);
    const c = cv.getContext("2d");
    c.fillStyle = "#8fbf7a";
    c.fillRect(0, 0, S, S);
    for (let i = 0; i < 2500; i++) {
      c.fillStyle =
        Math.random() > 0.5 ? "rgba(60,110,60,0.18)" : "rgba(235,225,150,0.14)";
      c.fillRect(rnd(0, S), rnd(0, S), 3, 3);
    }
    const mt = this.tex(cv);
    mt.wrapS = mt.wrapT = THREE.RepeatWrapping;
    mt.repeat.set(60, 45);
    const meadow = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 300),
      new THREE.MeshBasicMaterial({ map: mt }),
    );
    meadow.rotation.x = -Math.PI / 2;
    meadow.position.set(0, -0.01, -150);
    this.roomGroup.add(meadow);

    const path = new THREE.Mesh(
      new THREE.PlaneGeometry(1.8, 150),
      new THREE.MeshBasicMaterial({ color: 0xe3d3a8 }),
    );
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0.01, CFG.wallZ - 75);
    this.roomGroup.add(path);

    const hillMat = new THREE.MeshBasicMaterial({ color: 0x86b374 });
    [
      [-60, -150, 70, 16, 40],
      [30, -165, 80, 20, 45],
      [90, -140, 60, 14, 35],
      [-130, -170, 90, 22, 50],
      [0, -185, 100, 18, 40],
    ].forEach(([x, z, sx, sy, sz]) => {
      const h = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), hillMat);
      h.scale.set(sx, sy, sz);
      h.position.set(x, 0, z);
      this.roomGroup.add(h);
    });
  }

  stripVoid(group) {
    [...group.children].forEach((c) => {
      if (
        c.isMesh &&
        c.material &&
        c.material.isMeshBasicMaterial &&
        c.material.color.getHex() === 0x000000
      ) {
        group.remove(c);
        c.geometry.dispose();
        c.material.dispose();
      }
    });
  }

  buildDoors() {
    const entry = this.doorFactory.getClone(true, this.initialState);
    entry.position.set(0, 0, CFG.doorZ);
    entry.rotation.y = Math.PI;
    entry.traverse((c) => {
      if (c.userData && c.userData.id === "corridorDoor") {
        c.userData = { id: "lockedDoor_acceptance", prompt: "Interactuar" };
        this.addHit(c);
      }
    });
    this.stripVoid(entry);

    // Salida: de frente al usuario. El id NO empieza con "entryDoor": la abre la propia sala.
    const exit = this.doorFactory.getClone(true, this.initialState);
    exit.position.set(0, 0, CFG.wallZ);
    exit.rotation.y = 0;
    exit.traverse((c) => {
      if (c.userData && c.userData.id === "corridorDoor") {
        c.userData = { id: "finalDoor_acceptance", prompt: "Interactuar" };
        this.exitHit = this.exitHit || c;
        this.addHit(c);
        this.exitPivot = this.exitPivot || c.parent;
      }
    });
    this.stripVoid(exit);
    this.exitDoorGroup = exit;
    this.roomGroup.add(entry, exit);

    // Luz que se cuela por los bordes de la puerta cuando se destraba
    this.edgeMat = new THREE.MeshBasicMaterial({
      color: 0xffe2a0,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    [
      [-0.61, 1.1, 0.05, 2.2],
      [0.61, 1.1, 0.05, 2.2],
      [0, 2.2, 1.27, 0.05],
    ].forEach(([x, y, w, h]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.edgeMat);
      m.position.set(x, y, CFG.wallZ + 0.11);
      this.roomGroup.add(m);
    });
  }

  /* ---------- Memorial: un altar con plataforma, objetos que toman forma y velas a los costados ---------- */
  // Huecos del frente de la mesa, relativos a su centro: [hacia la sala, a lo ancho].
  // La plataforma de atrás recibe el primer objeto que el usuario elija; el resto se agrupa adelante.
  frontSlots(count) {
    const layouts = [
      [],
      [[0.3, 0]],
      [
        [0.25, -0.62],
        [0.25, 0.62],
      ],
      [
        [0.2, -0.82],
        [0.3, 0],
        [0.2, 0.82],
      ],
    ];
    return layouts[Math.max(0, Math.min(3, count))];
  }

  buildMemorial() {
    const { x: tx, z: tz, w: W, d: D } = CFG.table;
    const wood = this.std(0x8a5d3b, { roughness: 0.7 });
    const darkWood = this.std(0x6d4528, { roughness: 0.7 });
    const TOP = 0.84;

    // Mesa con mantel
    const top = new THREE.Mesh(new THREE.BoxGeometry(D, 0.06, W), wood);
    top.position.set(tx, TOP - 0.03, tz);
    this.roomGroup.add(top);
    [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ].forEach(([sx, sz]) => {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, TOP - 0.06, 0.08),
        wood,
      );
      leg.position.set(
        tx + sx * (D / 2 - 0.08),
        (TOP - 0.06) / 2,
        tz + sz * (W / 2 - 0.08),
      );
      this.roomGroup.add(leg);
    });
    const cc = canvasOf(256, 64);
    const cx = cc.getContext("2d");
    for (let x = 0; x < 256; x++) {
      const v = 0.9 + 0.07 * Math.sin(x * 0.16) + 0.04 * Math.sin(x * 0.43);
      cx.fillStyle = `rgb(${Math.round(240 * v)},${Math.round(232 * v)},${Math.round(212 * v)})`;
      cx.fillRect(x, 0, 1, 64);
    }
    const clothTex = this.tex(cc);
    clothTex.wrapS = THREE.RepeatWrapping;
    clothTex.repeat.set(4, 1);
    const cloth = this.std(0xffffff, {
      map: clothTex,
      roughness: 1,
      side: THREE.DoubleSide,
    });
    const cTop = new THREE.Mesh(
      new THREE.BoxGeometry(D + 0.08, 0.014, W + 0.08),
      cloth,
    );
    cTop.position.set(tx, TOP + 0.007, tz);
    const dropH = 0.5;
    const front = new THREE.Mesh(
      new THREE.PlaneGeometry(W + 0.08, dropH),
      cloth,
    );
    front.position.set(tx + D / 2 + 0.04, TOP - dropH / 2, tz);
    front.rotation.y = Math.PI / 2;
    const sideL = new THREE.Mesh(
      new THREE.PlaneGeometry(D + 0.08, dropH),
      cloth,
    );
    sideL.position.set(tx, TOP - dropH / 2, tz - W / 2 - 0.04);
    const sideR = sideL.clone();
    sideR.position.z = tz + W / 2 + 0.04;
    this.roomGroup.add(cTop, front, sideL, sideR);
    this.memorialY = TOP + 0.014;
    for (let i = 0; i < 4; i++)
      this.colliders.push({ x: tx + 0.1, z: tz - 1.0 + i * 0.67, r: 0.75 });

    // Plataforma elevada, al fondo y al centro
    const riser = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.2, 1.0),
      darkWood,
    );
    riser.position.set(tx - 0.25, this.memorialY + 0.1, tz);
    this.roomGroup.add(riser);

    // Huecos: un anillo tenue marca dónde dejar cada objeto. Los del frente giran apenas hacia el centro.
    const rc = canvasOf(128, 128);
    const r = rc.getContext("2d");
    r.strokeStyle = "rgba(217,180,91,0.9)";
    r.lineWidth = 6;
    r.beginPath();
    r.arc(64, 64, 52, 0, Math.PI * 2);
    r.stroke();
    const ringTex = this.tex(rc);
    const defs = [
      {
        x: tx - 0.25,
        y: this.memorialY + 0.2,
        z: tz,
        yaw: Math.PI / 2,
        size: 0.46,
      },
    ];
    this.frontSlots(this.memories.length - 1).forEach(([dx, dz]) => {
      defs.push({
        x: tx + dx,
        y: this.memorialY,
        z: tz + dz,
        yaw: Math.PI / 2 + 0.25 * Math.sign(dz),
        size: 0.38,
      });
    });
    defs.slice(0, this.memories.length).forEach((d) => {
      const pos = new THREE.Vector3(d.x, d.y, d.z);
      const ring = new THREE.Mesh(
        new THREE.PlaneGeometry(d.size, d.size),
        new THREE.MeshBasicMaterial({
          map: ringTex,
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(pos).setY(d.y + 0.002);
      const glow = this.glowSprite(0xffe2a0, 0.9, 0);
      glow.position.copy(pos).setY(d.y + 0.25);
      const slot = { pos, yaw: d.yaw, filled: false, ring, glow, hit: null };
      slot.hit = this.hitBox(0.38, 0.7, 0.38, pos.x, pos.y + 0.3, pos.z, {
        id: "memory_slot",
        prompt: "Interactuar",
        slot,
      });
      this.roomGroup.add(ring, glow, slot.hit);
      this.addHit(slot.hit);
      this.slots.push(slot);
    });

    // Velas a los costados: se van encendiendo a medida que el memorial toma forma
    const brass = this.std(0xc9a24a, { metalness: 0.6, roughness: 0.35 });
    const wax = this.std(0xf3ead2, { roughness: 0.6 });
    this.candles = [];
    [
      [-0.45, -1.12, 0.3],
      [-0.45, 1.12, 0.3],
      [0.05, -1.12, 0.2],
      [0.05, 1.12, 0.2],
    ].forEach(([dx, dz, h], i) => {
      const g = new THREE.Group();
      g.position.set(tx + dx, this.memorialY, tz + dz);
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.075, 0.025, 12),
        brass,
      );
      base.position.y = 0.0125;
      const stick = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, h, 12),
        wax,
      );
      stick.position.y = 0.025 + h / 2;
      const flame = this.glowSprite(0xffd890, 0.22, 0);
      flame.position.y = 0.025 + h + 0.07;
      g.add(base, stick, flame);
      this.roomGroup.add(g);
      this.candles.push({ flame, lit: false, level: 0, phase: i * 1.7 });
    });

    // Tarjeta en blanco al frente del altar
    const stand = new THREE.Group();
    stand.position.set(tx + 0.62, this.memorialY, tz);
    stand.rotation.y = Math.PI / 2;
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.14), wood);
    base.position.y = 0.015;
    this.cardCanvas = canvasOf(512, 680);
    this.cardTex = this.tex(this.cardCanvas);
    this.paintCard("");
    this.cardMat = new THREE.MeshStandardMaterial({
      map: this.cardTex,
      color: 0xd9d1bd,
      roughness: 0.95,
      emissive: 0xffe2a0,
      emissiveIntensity: 0,
      emissiveMap: this.cardTex,
    });
    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(0.24, 0.32),
      this.cardMat,
    );
    card.position.set(0, 0.2, 0);
    card.rotation.x = -0.25;
    const cardHit = this.hitBox(0.3, 0.42, 0.25, 0, 0.22, 0.04, {
      id: "memory_card",
      prompt: "Interactuar",
    });
    stand.add(base, card, cardHit);
    // El brillo queda detrás de la tarjeta para no tapar lo que se escribe
    this.cardGlow = this.glowSprite(0xffe2a0, 0.6, 0);
    this.cardGlow.position.set(tx + 0.47, this.memorialY + 0.22, tz);
    this.roomGroup.add(stand, this.cardGlow);
    this.addHit(cardHit);

    // La semilla aparece flotando sobre el memorial cuando está completo
    this.dishPos = new THREE.Vector3(tx + 0.8, 1.45, tz);

    // Reloj en la pared: Detenido en las 3:17:41 hasta que algo empieza a crecer.
    const clock = this.buildClock(0.55);
    clock.group.position.set(-CFG.halfW + 0.05, 2.5, tz);
    clock.group.rotation.y = Math.PI / 2;
    this.clockHands = clock.hands;
    this.roomGroup.add(clock.group);
    this.updateClock(0);
  }

  updateCandleTargets() {
    const lit = Math.round(
      (this.candles.length * this.placed) / this.items.length,
    );
    this.candles.forEach((c, i) => {
      c.lit = i < lit;
    });
  }

  paintCard(text) {
    const c = this.cardCanvas.getContext("2d");
    c.fillStyle = "#efe5cc";
    c.fillRect(0, 0, 512, 680);
    c.strokeStyle = "rgba(90,70,40,0.22)";
    c.lineWidth = 2;
    for (let y = 150; y < 640; y += 56) {
      c.beginPath();
      c.moveTo(44, y);
      c.lineTo(468, y);
      c.stroke();
    }
    if (text) {
      c.fillStyle = "#2b2118";
      c.font = '38px "Special Elite", "Courier New", monospace';
      let line = "",
        y = 136;
      text.split(/\s+/).forEach((w) => {
        const t = line ? line + " " + w : w;
        if (c.measureText(t).width > 424 && line) {
          c.fillText(line, 44, y);
          line = w;
          y += 56;
        } else line = t;
      });
      c.fillText(line, 44, y);
    }
    this.cardTex.needsUpdate = true;
  }

  /* ---------- Reloj (mismo de las otras salas, con la dalia de vuelta en el vidrio) ---------- */
  buildClock(R) {
    const group = new THREE.Group();
    const add = (m) => {
      group.add(m);
      return m;
    };
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(R + 0.07, R + 0.07, 0.12, 96),
      this.std(0x4a2f22, { roughness: 0.5 }),
    );
    body.rotation.x = Math.PI / 2;
    body.position.z = 0.06;
    add(body);

    // Cara
    const S = 1024,
      c0 = S / 2;
    const fc = canvasOf(S, S);
    const f = fc.getContext("2d");
    const g = f.createRadialGradient(c0, c0, 0, c0, c0, c0);
    g.addColorStop(0, "#16323a");
    g.addColorStop(0.7, "#0f242b");
    g.addColorStop(1, "#08141a");
    f.fillStyle = g;
    f.fillRect(0, 0, S, S);
    f.strokeStyle = "rgba(60,150,150,0.3)";
    f.lineWidth = 3;
    f.beginPath();
    f.arc(c0, c0, c0 * 0.94, 0, Math.PI * 2);
    f.stroke();
    f.translate(c0, c0);
    f.lineCap = "round";
    for (let i = 0; i < 60; i++) {
      f.save();
      f.rotate((i / 60) * Math.PI * 2);
      const hour = i % 5 === 0,
        card = i % 15 === 0;
      f.strokeStyle =
        i === 0 ? "#e2704f" : hour ? "#f3dccd" : "rgba(243,220,205,0.4)";
      f.lineWidth = card ? 20 : hour ? 13 : 4;
      const r1 = c0 * 0.9,
        r2 = r1 - (card ? 100 : hour ? 70 : 20);
      f.beginPath();
      f.moveTo(0, -r1);
      f.lineTo(0, -r2);
      f.stroke();
      f.restore();
    }
    const face = new THREE.Mesh(
      new THREE.CircleGeometry(R, 96),
      new THREE.MeshBasicMaterial({ map: this.tex(fc) }),
    );
    face.position.z = 0.122;
    add(face);
    const bezel = new THREE.Mesh(
      new THREE.TorusGeometry(R + 0.035, 0.035, 16, 96),
      this.std(0x1c2b2d, { metalness: 0.6, roughness: 0.35 }),
    );
    bezel.position.z = 0.125;
    add(bezel);

    const makeHand = (len, w, tail, mat, depth, z) => {
      const s = new THREE.Shape();
      s.moveTo(-w / 2, -tail);
      s.lineTo(w / 2, -tail);
      s.lineTo(w / 2, len * 0.88);
      s.lineTo(0, len);
      s.lineTo(-w / 2, len * 0.88);
      s.closePath();
      const m = new THREE.Mesh(
        new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }),
        mat,
      );
      m.position.z = z;
      return add(m);
    };
    const cream = new THREE.MeshBasicMaterial({ color: 0xf1d9c9 });
    const coral = new THREE.MeshBasicMaterial({ color: 0xe2704f });
    const hands = {
      hourHand: makeHand(R * 0.52, 0.08, 0.06, cream, 0.01, 0.13),
      minuteHand: makeHand(R * 0.82, 0.055, 0.07, cream, 0.01, 0.142),
      secondHand: makeHand(R * 0.9, 0.012, R * 0.18, coral, 0.004, 0.154),
    };

    // Vidrio con la dalia (la del reloj de la Negación)
    const gc = canvasOf(S, S);
    const gx = gc.getContext("2d");
    gx.beginPath();
    gx.arc(c0, c0, c0, 0, Math.PI * 2);
    gx.clip();
    gx.save();
    gx.filter = "blur(7px)";
    drawDahlia(gx, S * 0.88, S * 0.48, S * 0.11, 0.5);
    gx.globalAlpha = 0.4;
    gx.strokeStyle = "#3f7a4c";
    gx.lineWidth = 7;
    gx.beginPath();
    gx.moveTo(S * 0.88, S * 0.59);
    gx.quadraticCurveTo(S * 0.86, S * 0.7, S * 0.83, S * 0.82);
    gx.stroke();
    gx.restore();
    const gl = gx.createLinearGradient(0, 0, S, S);
    gl.addColorStop(0, "rgba(160,230,225,0.10)");
    gl.addColorStop(0.35, "rgba(160,230,225,0)");
    gx.fillStyle = gl;
    gx.fillRect(0, 0, S, S);
    const glass = new THREE.Mesh(
      new THREE.CircleGeometry(R + 0.01, 64),
      new THREE.MeshBasicMaterial({
        map: this.tex(gc),
        transparent: true,
        depthWrite: false,
      }),
    );
    glass.position.z = 0.175;
    add(glass);

    return { group, hands };
  }

  // 3:17:41 detenido; al empezar a crecer la planta, el tiempo vuelve a correr desde ese mismo instante
  updateClock(time) {
    const base = 3 * 3600 + 17 * 60 + 41;
    let total = base;
    if (this.clockRunning) {
      const el = Math.max(0, time - this.clockT0);
      const whole = Math.floor(el);
      if (whole !== this.lastTick) {
        this.lastTick = whole;
        this.audio?.playTick?.();
      }
      const jump = Math.min(1, (el - whole) / 0.15);
      total = base + whole + (1 - Math.pow(1 - jump, 3));
    }
    const TAU = Math.PI * 2;
    const { hourHand, minuteHand, secondHand } = this.clockHands;
    hourHand.rotation.z = -((total / 43200) % 1) * TAU;
    minuteHand.rotation.z = -((total % 3600) / 3600) * TAU;
    secondHand.rotation.z = -((total % 60) / 60) * TAU;
  }

  /* ---------- Objetos del recorrido, esparcidos por el jardín ---------- */
  itemModel(id) {
    const g = new THREE.Group();
    const m = (mesh, x, y, z) => {
      mesh.position.set(x, y, z);
      g.add(mesh);
      return mesh;
    };
    if (id === "vase") {
      // El florero con flores de la Negación
      const vase = new THREE.Mesh(
        new THREE.LatheGeometry(
          profile([
            [0.001, 0],
            [0.05, 0],
            [0.065, 0.03],
            [0.1, 0.11],
            [0.11, 0.18],
            [0.08, 0.26],
            [0.05, 0.3],
            [0.045, 0.34],
            [0.06, 0.37],
            [0.05, 0.37],
            [0.04, 0.34],
          ]),
          20,
        ),
        this.std(0xd9ccb9, { roughness: 0.4, side: THREE.DoubleSide }),
      );
      m(vase, 0, 0, 0);
      const stem = this.std(0x4f8a4c);
      [
        [-0.04, 0.2, -0.3, 0xf2c14e],
        [0.03, 0.26, 0.2, 0xe8805f],
        [0.0, 0.3, 0.0, 0xf4efe6],
        [0.05, 0.22, 0.45, 0xe9a0b4],
        [-0.05, 0.25, -0.5, 0xd9b45b],
      ].forEach(([x, h, tilt, col]) => {
        const s = new THREE.Mesh(
          new THREE.CylinderGeometry(0.004, 0.004, h, 4).translate(0, h / 2, 0),
          stem,
        );
        s.position.set(x * 0.4, 0.34, 0);
        s.rotation.z = tilt;
        g.add(s);
        const top = new THREE.Vector3(0, h, 0)
          .applyEuler(s.rotation)
          .add(s.position);
        m(
          new THREE.Mesh(
            new THREE.SphereGeometry(0.036, 8, 6),
            new THREE.MeshBasicMaterial({ color: col }),
          ),
          top.x,
          top.y,
          top.z,
        );
      });
    } else if (id === "photo") {
      // El portarretratos cálido de la Ira (las dos siluetas)
      const wood = this.std(0x7a4a24);
      const frame = m(
        new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.03), wood),
        0,
        0.2,
        0,
      );
      frame.rotation.x = -0.12;
      const pc = canvasOf(128, 170);
      const p = pc.getContext("2d");
      const pg = p.createLinearGradient(0, 0, 0, 170);
      pg.addColorStop(0, "#f0c98a");
      pg.addColorStop(1, "#a8693a");
      p.fillStyle = pg;
      p.fillRect(0, 0, 128, 170);
      p.fillStyle = "rgba(70,35,15,0.85)";
      [
        [50, 65, 0.5],
        [85, 72, 0.45],
      ].forEach(([cx, cy, s]) => {
        p.beginPath();
        p.arc(cx, cy, 34 * s, 0, Math.PI * 2);
        p.fill();
        p.beginPath();
        p.ellipse(cx, cy + 110 * s, 70 * s, 80 * s, 0, Math.PI, Math.PI * 2);
        p.fill();
      });
      const pic = new THREE.Mesh(
        new THREE.PlaneGeometry(0.21, 0.28),
        new THREE.MeshBasicMaterial({ map: this.tex(pc) }),
      );
      pic.position.set(0, 0.2, 0.017);
      pic.rotation.x = -0.12;
      g.add(pic);
      m(
        new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.02), wood),
        0,
        0.1,
        -0.06,
      ).rotation.x = 0.5;
    } else if (id === "key") {
      // La llave de la Negociación: apoyada de costado, en diagonal
      const brass = this.std(0xc9a24a, { metalness: 0.6, roughness: 0.35 });
      const pivot = new THREE.Group();
      pivot.position.y = 0.02;
      pivot.rotation.set(-Math.PI / 2, 0, 0.7);
      const part = (mesh, x, y) => {
        mesh.position.set(x, y, 0);
        pivot.add(mesh);
      };
      part(
        new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.014, 8, 20), brass),
        0,
        0.28,
      );
      part(
        new THREE.Mesh(
          new THREE.CylinderGeometry(0.012, 0.012, 0.24, 8),
          brass,
        ),
        0,
        0.11,
      );
      part(
        new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.025, 0.02), brass),
        0.035,
        0.03,
      );
      part(
        new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.025, 0.02), brass),
        0.025,
        0.07,
      );
      g.add(pivot);
    } else {
      // Un farol chico: la luz de la Depresión
      const metal = this.std(0x27324a, { metalness: 0.2, roughness: 0.55 });
      m(
        new THREE.Mesh(
          new THREE.CylinderGeometry(0.1, 0.12, 0.04, 4).rotateY(Math.PI / 4),
          metal,
        ),
        0,
        0.02,
        0,
      );
      m(
        new THREE.Mesh(
          new THREE.CylinderGeometry(0.1, 0.07, 0.2, 4).rotateY(Math.PI / 4),
          new THREE.MeshBasicMaterial({ color: 0xffd9a0 }),
        ),
        0,
        0.14,
        0,
      );
      m(
        new THREE.Mesh(
          new THREE.ConeGeometry(0.14, 0.1, 4).rotateY(Math.PI / 4),
          metal,
        ),
        0,
        0.29,
        0,
      );
      const handle = m(
        new THREE.Mesh(
          new THREE.TorusGeometry(0.07, 0.007, 6, 16, Math.PI),
          metal,
        ),
        0,
        0.33,
        0,
      );
      handle.rotation.z = 0;
    }
    return g;
  }

  buildItems() {
    const stone = this.std(0xb9b09a, { roughness: 0.9 });
    this.memories.forEach((id, i) => {
      const [sx, sz] = CFG.spots[i % CFG.spots.length];
      const stool = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.26, 0.5, 14),
        stone,
      );
      stool.position.set(sx, 0.25, sz);
      this.roomGroup.add(stool);
      this.colliders.push({ x: sx, z: sz, r: 0.3 });

      const group = this.itemModel(id);
      group.position.set(sx, 0.5, sz);
      const item = {
        id,
        group,
        home: group.position.clone(),
        placed: false,
        hit: null,
        glow: null,
      };
      item.hit = this.hitBox(0.5, 0.6, 0.5, 0, 0.3, 0, {
        id: "memory_item",
        prompt: "Tomar",
        item,
      });
      group.add(item.hit);
      item.glow = this.glowSprite(0xffe2a0, 1.3, 0.55);
      item.glow.position.set(sx, 0.95, sz);
      this.roomGroup.add(group, item.glow);
      this.addHit(item.hit);
      this.items.push(item);
    });
  }

  /* ---------- Maceta, semilla, jarra y planta ---------- */
  buildPotAndPlant() {
    const { x: px, z: pz } = CFG.pot;
    const stone = this.std(0xb9b09a, { roughness: 0.9 });
    const ped = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.38, 0.55, 16),
      stone,
    );
    ped.position.set(px, 0.275, pz);
    const pot = new THREE.Mesh(
      new THREE.LatheGeometry(
        profile([
          [0.001, 0],
          [0.14, 0],
          [0.19, 0.05],
          [0.24, 0.34],
          [0.27, 0.37],
          [0.27, 0.4],
          [0.23, 0.4],
          [0.22, 0.36],
        ]),
        24,
      ),
      this.std(0xb4673f, { roughness: 0.8, side: THREE.DoubleSide }),
    );
    pot.position.set(px, 0.55, pz);
    this.soilMat = this.std(0x6a4a34, { roughness: 1 });
    const soil = new THREE.Mesh(
      new THREE.CircleGeometry(0.225, 20),
      this.soilMat,
    );
    soil.rotation.x = -Math.PI / 2;
    soil.position.set(px, 0.55 + 0.37, pz);
    this.soilY = 0.55 + 0.37;
    this.potPos = new THREE.Vector3(px, this.soilY, pz);
    const potHit = this.hitBox(0.7, 0.9, 0.7, px, 1.2, pz, {
      id: "pot",
      prompt: "Interactuar",
    });
    this.potHit = potHit;
    this.roomGroup.add(ped, pot, soil, potHit);
    this.addHit(potHit);
    this.colliders.push({ x: px, z: pz, r: 0.55 });

    // Semilla (aparece en el plato del memorial cuando está completo)
    const seed = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xf2c14e }),
    );
    body.scale.set(1, 0.7, 0.7);
    seed.add(body);
    const sGlow = this.glowSprite(0xffe2a0, 0.5, 0.8);
    seed.add(sGlow);
    seed.position.copy(this.dishPos);
    seed.visible = false;
    this.seed = {
      group: seed,
      glow: sGlow,
      hit: this.hitBox(0.3, 0.3, 0.3, 0, 0, 0, {
        id: "seed_obj",
        prompt: "Tomar",
      }),
    };
    seed.add(this.seed.hit);
    this.roomGroup.add(seed);

    // Jarra de barro sobre un banquito, junto a la maceta
    const jug = new THREE.Group();
    const clay = this.std(0xb4673f, { roughness: 0.8, side: THREE.DoubleSide });
    jug.add(
      new THREE.Mesh(
        new THREE.LatheGeometry(
          profile([
            [0.001, 0],
            [0.07, 0],
            [0.1, 0.06],
            [0.1, 0.16],
            [0.06, 0.24],
            [0.05, 0.28],
            [0.07, 0.3],
            [0.045, 0.3],
            [0.04, 0.26],
          ]),
          18,
        ),
        clay,
      ),
    );
    const spout = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.035, 0.1, 8),
      clay,
    );
    spout.position.set(-0.1, 0.25, 0);
    spout.rotation.z = 0.9;
    jug.add(spout);
    const handle = new THREE.Mesh(
      new THREE.TorusGeometry(0.06, 0.012, 6, 14, Math.PI),
      clay,
    );
    handle.position.set(0.09, 0.17, 0);
    handle.rotation.z = -Math.PI / 2;
    jug.add(handle);
    const stoolX = px + 1.25,
      stoolZ = pz - 0.9;
    const stool = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.24, 0.45, 14),
      stone,
    );
    stool.position.set(stoolX, 0.225, stoolZ);
    jug.position.set(stoolX, 0.45, stoolZ);
    const jugHit = this.hitBox(0.5, 0.5, 0.5, 0, 0.18, 0, {
      id: "jug",
      prompt: "Tomar",
    });
    jug.add(jugHit);
    this.jug = { group: jug, home: jug.position.clone(), hit: jugHit };
    this.roomGroup.add(stool, jug);
    this.addHit(jugHit);
    this.colliders.push({ x: stoolX, z: stoolZ, r: 0.3 });

    // Planta
    const plant = new THREE.Group();
    plant.position.copy(this.potPos);
    const green = this.std(0x5f9a5a, {
      roughness: 0.7,
      side: THREE.DoubleSide,
    });
    this.stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.022, 1, 6).translate(0, 0.5, 0),
      green,
    );
    this.stem.scale.set(1, 0.001, 1);
    plant.add(this.stem);

    const leafShape = new THREE.Shape();
    leafShape.moveTo(0, 0);
    leafShape.bezierCurveTo(0.09, 0.05, 0.1, 0.2, 0, 0.3);
    leafShape.bezierCurveTo(-0.1, 0.2, -0.09, 0.05, 0, 0);
    const leafGeo = new THREE.ShapeGeometry(leafShape);
    this.leaves = [];
    [
      [0.2, 0.9],
      [0.34, 0.95],
      [0.5, 0.85],
      [0.64, 0.75],
      [0.78, 0.6],
      [0.9, 0.5],
    ].forEach(([frac, size], i) => {
      const pivot = new THREE.Group();
      pivot.rotation.y = i * 1.9;
      const lf = new THREE.Mesh(leafGeo, green);
      lf.rotation.z = -1.0;
      pivot.add(lf);
      pivot.scale.setScalar(0.001);
      plant.add(pivot);
      this.leaves.push({ pivot, frac, size, appear: 0.03 + i * 0.1 });
    });

    this.bud = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 10, 8),
      this.std(0x8fb870),
    );
    this.bud.scale.setScalar(0.001);
    plant.add(this.bud);

    const fc = canvasOf(512, 512);
    drawDahlia(fc.getContext("2d"), 256, 256, 235, 1);
    this.flower = new THREE.Mesh(
      new THREE.PlaneGeometry(0.46, 0.46),
      new THREE.MeshBasicMaterial({
        map: this.tex(fc),
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.flower.scale.setScalar(0.001);
    plant.add(this.flower);

    this.plantGlow = this.glowSprite(0xffe2a0, 1.2, 0);
    plant.add(this.plantGlow);
    this.plant = plant;
    this.roomGroup.add(plant);
    this.stemMaxH = 0.85;
  }

  /* ---------- Polvo dorado en los haces y luciérnagas alrededor de la planta ---------- */
  makeMotes(count, box, size, center) {
    const pos = new Float32Array(count * 3),
      seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos.set(
        [
          center.x + rnd(-box.x, box.x),
          rnd(0, box.y),
          center.z + rnd(-box.z, box.z),
        ],
        i * 3,
      );
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uAlpha: { value: 0.3 },
        uSize: { value: size },
        uH: { value: box.y },
      },
      vertexShader: `
        uniform float uTime; uniform float uSize; uniform float uH;
        attribute float aSeed; varying float vA;
        void main(){
          vec3 p = position;
          p.y = mod(p.y + uTime * 0.07 * (0.5 + aSeed), uH);
          p.x += sin(uTime * 0.3 + aSeed * 20.0) * 0.4;
          p.z += cos(uTime * 0.25 + aSeed * 17.0) * 0.4;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = uSize * (0.6 + aSeed) * (180.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
          vA = 0.5 + 0.5 * sin(uTime * 1.3 + aSeed * 30.0);
        }`,
      fragmentShader: `
        uniform float uAlpha; varying float vA;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          gl_FragColor = vec4(1.0, 0.92, 0.7, smoothstep(0.5, 0.0, d) * vA * uAlpha);
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.roomGroup.add(pts);
    return mat;
  }

  buildAtmosphereFx() {
    this.dustMat = this.makeMotes(
      260,
      { x: 7, y: 5, z: 10 },
      5,
      new THREE.Vector3(0, 0, -19),
    );
    this.fireflyMat = this.makeMotes(
      45,
      { x: 1.1, y: 1.8, z: 1.1 },
      6,
      new THREE.Vector3(CFG.pot.x, 0.9, CFG.pot.z),
    );
    this.fireflyMat.uniforms.uAlpha.value = 0;

    // Chorro de agua de la jarra
    const n = 40;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(n * 3), 3),
    );
    this.stream = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xcfe6ff,
        size: 0.035,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.stream.visible = false;
    this.stream.frustumCulled = false;
    this.streamN = n;
    this.roomGroup.add(this.stream);
  }

  /* ============================================================
     INTERACCIÓN (un solo clic: el objeto define qué pasa)
     ============================================================ */
  tween(dur, fn, done) {
    this.tweens.push({ t: 0, dur, fn, done });
  }
  updateTweens(dt) {
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.t += dt;
      const p = Math.min(1, tw.t / tw.dur);
      tw.fn(p);
      if (p >= 1) {
        this.tweens.splice(i, 1);
        tw.done?.();
      }
    }
  }
  ease(p) {
    return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
  }

  // Pasa un objeto de la mano al jardín (conserva su posición en el mundo)
  releaseToRoom(group) {
    const v = new THREE.Vector3();
    group.getWorldPosition(v);
    this.roomGroup.worldToLocal(v);
    group.removeFromParent();
    this.roomGroup.add(group);
    group.position.copy(v);
    group.rotation.set(0, 0, 0);
    group.scale.setScalar(1);
    return v;
  }
  takeInHand(group, scale = 0.85, yaw = 0.4) {
    this.handYaw = yaw;
    group.removeFromParent();
    this.hand.add(group);
    group.position.set(0, -0.06, 0);
    group.rotation.set(0, yaw, 0);
    group.scale.setScalar(scale);
  }
  flyTo(group, from, to, dur, arc, done, yawTo = null) {
    this.tween(
      dur,
      (p) => {
        const e = this.ease(p);
        group.position.lerpVectors(from, to, e);
        group.position.y += arc * Math.sin(Math.PI * e);
        if (yawTo !== null) group.rotation.y = yawTo * e;
      },
      done,
    );
  }

  interact(object, uiPromptCallback) {
    const id = object.userData.id;
    if (id === "lockedDoor_acceptance")
      uiPromptCallback("No hace falta volver atras para recordar.");
    else if (id === "finalDoor_acceptance") this.useExitDoor();
    else if (id === "memory_item") this.pickItem(object.userData.item);
    else if (id === "memory_slot") this.useSlot(object.userData.slot);
    else if (id === "memory_card") this.openCardEditor();
    else if (id === "seed_obj") this.pickSeed();
    else if (id === "jug") this.pickJug();
    else if (id === "pot") this.usePot();
  }

  pickItem(item) {
    if (this.carrying || item.placed) {
      this.audio?.playSoft?.(330);
      return;
    }
    this.carrying = { type: "item", item };
    this.removeHit(item.hit);
    item.glow.visible = false;
    this.takeInHand(item.group);
    this.audio?.playSoft?.(523);
  }

  useSlot(slot) {
    if (!this.carrying || this.carrying.type !== "item" || slot.filled) {
      this.audio?.playSoft?.(330);
      this.hint = 1; // el jardín responde: los objetos que faltan brillan un poco más
      return;
    }
    const item = this.carrying.item;
    this.carrying = null;
    slot.filled = true;
    item.placed = true;
    this.removeHit(slot.hit);
    const from = this.releaseToRoom(item.group);
    this.flyTo(
      item.group,
      from,
      slot.pos.clone(),
      0.7,
      0.25,
      () => {
        slot.glow.material.opacity = 0.7;
        slot.ring.material.opacity = 0.9;
      },
      slot.yaw,
    ); // queda de frente a la sala
    this.audio?.playSoft?.(659);
    this.audio?.addHarmonyVoice?.(CFG.chord[this.placed % CFG.chord.length]);
    this.placed++;
    this.updateCandleTargets();
    if (this.placed >= this.items.length)
      this.tween(
        1.4,
        () => {},
        () => this.revealSeed(),
      ); // pausa corta, en tiempo de juego
  }

  revealSeed() {
    this.seedAvailable = true;
    this.seed.group.visible = true;
    this.addHit(this.seed.hit);
    this.audio?.playBell?.(880);
  }

  pickSeed() {
    if (this.carrying) {
      this.audio?.playSoft?.(330);
      return;
    }
    this.carrying = { type: "seed" };
    this.removeHit(this.seed.hit);
    this.takeInHand(this.seed.group, 1.4);
    this.audio?.playSoft?.(587);
  }

  pickJug() {
    if (this.carrying) {
      this.audio?.playSoft?.(330);
      return;
    }
    this.carrying = { type: "jug" };
    this.removeHit(this.jug.hit);
    this.takeInHand(this.jug.group, 0.8, -0.6); // el pico apunta hacia adelante y a la izquierda
    this.audio?.playSoft?.(440);
  }

  usePot() {
    const c = this.carrying;
    if (c && c.type === "seed") {
      this.carrying = null;
      const g = this.seed.group;
      const from = this.releaseToRoom(g);
      const to = this.potPos.clone().setY(this.soilY + 0.03);
      this.flyTo(g, from, to, 0.8, 0.2, () => {
        this.tween(
          0.8,
          (p) => g.scale.setScalar(1 - p),
          () => {
            g.visible = false;
          },
        );
        this.audio?.playEarth?.();
        this.pot.seed = true;
        this.maybeStartGrowing();
      });
    } else if (c && c.type === "jug") {
      this.carrying = null;
      this.pourWater();
    } else {
      this.audio?.playSoft?.(392); // ya está todo hecho: el jardín solo responde con un sonido suave
      this.hint = 1;
    }
  }

  pourWater() {
    const g = this.jug.group;
    const from = this.releaseToRoom(g);
    const pour = this.potPos.clone().add(new THREE.Vector3(0.35, 0.55, 0));
    const dry = new THREE.Color(0x6a4a34),
      wet = new THREE.Color(0x2e2118);
    this.flyTo(g, from, pour, 0.8, 0.1, () => {
      this.audio?.playWater?.();
      this.stream.visible = true;
      this.tween(
        2.0,
        (p) => {
          g.rotation.z = Math.min(0.9, p * 4) * 0.9;
          const start = pour.clone().add(new THREE.Vector3(-0.2, -0.05, 0));
          const arr = this.stream.geometry.attributes.position.array;
          for (let i = 0; i < this.streamN; i++) {
            const q = (((p * 3 + i / this.streamN) % 1) + 1) % 1;
            arr[i * 3] = THREE.MathUtils.lerp(start.x, this.potPos.x, q);
            arr[i * 3 + 1] = THREE.MathUtils.lerp(start.y, this.soilY, q * q);
            arr[i * 3 + 2] = start.z + Math.sin(i * 12.9) * 0.02;
          }
          this.stream.geometry.attributes.position.needsUpdate = true;
          this.soilMat.color.copy(dry).lerp(wet, p);
        },
        () => {
          this.stream.visible = false;
          this.pot.wet = true;
          this.maybeStartGrowing();
          const back = g.position.clone();
          this.tween(
            0.9,
            (p) => {
              g.position.lerpVectors(back, this.jug.home, this.ease(p));
              g.rotation.z = 0.9 * (1 - p);
            },
            () => {
              g.rotation.set(0, 0, 0);
              this.addHit(this.jug.hit);
            },
          );
        },
      );
    });
  }

  maybeStartGrowing() {
    if (this.pot.seed && this.pot.wet && !this.pot.growing) {
      this.pot.growing = true;
      this.pot.t0 = this.lastTime ?? 0;
      this.clockRunning = true; // el tiempo vuelve a correr
      this.clockT0 = this.lastTime ?? 0;
      this.audio?.playBell?.(659);
    }
  }

  useExitDoor() {
    if (!this.exitUnlocked) {
      this.audio?.playSoft?.(330);
      this.hint = 1; // sin error ni cartel: la planta se hace un poco más notoria
      return;
    }
    if (this.exitOpen || this.exitOpening) return;
    this.exitOpening = true;
    this.audio?.playBell?.(523);
    this.tween(
      1.8,
      (p) => {
        const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        this.exitPivot.rotation.y = e * (Math.PI / 2.2); // se abre hacia afuera
      },
      () => {
        this.exitOpen = true;
      },
    );
  }

  /* ---------- Tarjeta en blanco: escribir es opcional y no se guarda en ningún lado ---------- */
  openCardEditor() {
    if (this.editorOpen) return;
    this.editorOpen = true;
    this.extras.setControlsLocked?.(false);

    const wrap = document.createElement("div");
    wrap.id = "card-editor";
    wrap.style.cssText =
      "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(30,24,14,.55);z-index:120;";
    const card = document.createElement("div");
    card.style.cssText =
      'width:min(360px,86vw);padding:22px;border-radius:6px;background:#f3ead4;color:#3b2f22;box-shadow:0 10px 40px rgba(0,0,0,.4);font-family:"Special Elite","Courier New",monospace;';
    const ta = document.createElement("textarea");
    ta.maxLength = 120;
    ta.rows = 5;
    ta.placeholder = "...";
    ta.value = this.cardText;
    ta.style.cssText =
      "width:100%;resize:none;border:0;outline:0;background:repeating-linear-gradient(transparent,transparent 27px,rgba(90,70,40,.25) 28px);font:inherit;font-size:18px;line-height:28px;color:inherit;user-select:text;";
    const row = document.createElement("div");
    row.style.cssText =
      "display:flex;gap:10px;justify-content:flex-end;margin-top:14px;";
    const mkBtn = (label) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.style.cssText =
        "background:#d9c9a3;color:#3b2f22;padding:8px 14px;font:inherit;font-size:14px;border:0;border-radius:4px;cursor:pointer;";
      return b;
    };
    const blank = mkBtn("Dejar en blanco");
    const save = mkBtn("Guardar");
    row.append(blank, save);
    card.append(ta, row);
    wrap.append(card);
    document.body.appendChild(wrap);
    ta.focus();

    const close = (text) => {
      wrap.remove();
      this.editorOpen = false;
      this.cardText = text;
      this.paintCard(text);
      if (!this.cardTouched) {
        this.cardTouched = true;
        this.audio?.addHarmonyVoice?.(783.99);
      }
      this.cardMat.emissiveIntensity = 0.05; // un brillo muy suave: que se lea lo escrito
      this.cardGlow.material.opacity = 0.3;
      this.audio?.playSoft?.(698);
      setTimeout(() => this.extras.setControlsLocked?.(true), 0);
    };
    save.onclick = (e) => {
      e.stopPropagation();
      close(ta.value.trim());
    };
    blank.onclick = (e) => {
      e.stopPropagation();
      close("");
    };
    wrap.addEventListener("click", (e) => e.stopPropagation());
    ta.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") close(this.cardText);
    });
    ta.addEventListener("keyup", (e) => e.stopPropagation());
  }

  /* ============================================================
     BUCLE PRINCIPAL
     ============================================================ */
  collide(yaw) {
    const ox = this.roomGroup.position.x;
    for (const c of this.colliders) {
      const dx = yaw.position.x - ox - c.x,
        dz = yaw.position.z - c.z;
      const d = Math.hypot(dx, dz),
        min = c.r + 0.3;
      if (d < min && d > 0.0001) {
        yaw.position.x = ox + c.x + (dx / d) * min;
        yaw.position.z = c.z + (dz / d) * min;
      }
    }
  }

  updateGrowth(time, dt) {
    const P = this.pot;
    if (P.growing)
      P.g = THREE.MathUtils.clamp((time - P.t0) / CFG.growSeconds, 0, 1);
    const g = P.g;

    if (g >= CFG.sproutAt && !this.exitUnlocked) {
      this.exitUnlocked = true; // primer brote: la puerta se destraba (sin cartel, solo luz)
      this.audio?.playBell?.(1046);
    }
    this.edgeMat.opacity +=
      ((this.exitUnlocked ? 0.75 : 0) - this.edgeMat.opacity) *
      (1 - Math.exp(-dt * 1.5));

    // Tallo
    const h = this.stemMaxH * smooth(0.02, 0.85, g);
    this.stem.scale.y = Math.max(0.001, h);
    this.plant.rotation.z = Math.sin(time * 0.8) * 0.03 * h;
    // Hojas: aparecen y se abren de a una
    this.leaves.forEach((L) => {
      const s = smooth(L.appear, L.appear + 0.12, g) * L.size;
      L.pivot.scale.setScalar(Math.max(0.001, s));
      L.pivot.position.y = h * L.frac;
    });
    // Capullo y dalia
    const bud = smooth(0.7, 0.8, g) * (1 - smooth(0.88, 0.95, g));
    this.bud.scale.setScalar(Math.max(0.001, bud));
    this.bud.position.set(0, h + 0.02, 0);
    const fl = smooth(0.82, 1.0, g);
    this.flower.scale.setScalar(Math.max(0.001, fl));
    this.flower.position.set(0, h + 0.06, 0.02);
    this.flower.rotation.y = Math.atan2(
      this.camLocal.x - this.potPos.x,
      this.camLocal.z - this.potPos.z,
    );
    this.flower.rotation.x = -0.2;

    this.plantGlow.position.set(0, h + 0.1, 0);
    this.plantGlow.material.opacity =
      0.65 * smooth(0.25, 1, g) + 0.25 * this.hint;
    this.plantLight.position.set(
      this.potPos.x,
      this.potPos.y + h + 0.4,
      this.potPos.z,
    );
    this.plantLight.intensity = 2.2 * smooth(0.08, 1, g);
  }

  updateLighting(time, dt) {
    this.hope += (this.pot.g - this.hope) * (1 - Math.exp(-dt * 1.5));
    const hp = this.hope;
    this.hint *= Math.exp(-dt * 1.2);

    this.sun.intensity = THREE.MathUtils.lerp(1.25, 1.9, hp);
    this.sun.color.copy(this.sunC0).lerp(this.sunC1, hp);
    this.hemi.intensity = THREE.MathUtils.lerp(0.9, 1.15, hp);
    this.sunGlow.material.opacity = 0.55 + 0.35 * hp;
    this.grassMat.uniforms.uHope.value = hp;
    this.grassMat.uniforms.uTime.value = time;
    this.dustMat.uniforms.uTime.value = time;
    this.dustMat.uniforms.uAlpha.value = 0.25 + 0.5 * hp;
    this.fireflyMat.uniforms.uTime.value = time;
    this.fireflyMat.uniforms.uAlpha.value = 0.9 * smooth(0.3, 1, this.pot.g);
    this.beams.forEach((b) => {
      b.mesh.material.opacity =
        (0.22 + 0.36 * hp) * (0.85 + 0.15 * Math.sin(time * 0.6 + b.phase));
    });
  }

  updateItems(time, dt) {
    const c = this.carrying;
    this.candles.forEach((cd) => {
      cd.level += ((cd.lit ? 1 : 0) - cd.level) * (1 - Math.exp(-dt * 2.5));
      const flick =
        0.78 +
        0.18 * Math.sin(time * 9 + cd.phase) +
        0.04 * Math.sin(time * 23 + cd.phase);
      cd.flame.material.opacity = cd.level * flick;
      cd.flame.scale.setScalar(0.22 * (0.85 + 0.15 * flick));
    });
    // Brillo suave en lo que se puede tomar (más fuerte cuando el jardín "responde")
    this.items.forEach((it, i) => {
      if (!it.placed && it.glow.visible) {
        it.glow.material.opacity =
          0.45 + 0.15 * Math.sin(time * 1.6 + i) + 0.4 * this.hint;
      }
    });
    if (this.seed.group.visible && !c) {
      this.seed.group.position.y =
        this.dishPos.y + 0.03 + Math.sin(time * 2) * 0.012;
    }
    // Lo que lleva en la mano se mece un poco
    if (c) {
      const g =
        c.type === "item"
          ? c.item.group
          : c.type === "seed"
            ? this.seed.group
            : this.jug.group;
      g.position.y = -0.06 + Math.sin(time * 2.2) * 0.008;
      g.rotation.y = this.handYaw + Math.sin(time * 0.9) * 0.1;
    }
    // Textos al apuntar: dependen de lo que lleve
    this.slots.forEach((s) => {
      s.hit.userData.prompt =
        c && c.type === "item" && !s.filled ? "Dejar aquí" : "Interactuar";
    });
    this.potHit.userData.prompt =
      c && c.type === "seed"
        ? "Plantar"
        : c && c.type === "jug"
          ? "Regar"
          : "Interactuar";
  }

  updateFinale(pz) {
    if (this.finale || !this.exitOpen) return;
    if (pz < CFG.wallZ - CFG.finaleDistance) {
      this.finale = true;
      this.audio?.fadeOutGarden?.(4);
      this.extras.onFinish?.();
    }
  }

  update(time) {
    if (this.lastTime === null) this.lastTime = time;
    const dt = Math.min(0.05, Math.max(0.0001, time - this.lastTime));
    this.lastTime = time;

    if (!this.yaw) this.yaw = this.camera.parent && this.camera.parent.parent;
    this.camLocal = this.camLocal || new THREE.Vector3(0, 1.6, CFG.doorZ);
    let pz = this.lastPz;
    if (this.yaw) {
      this.collide(this.yaw);
      this.camLocal.set(
        this.yaw.position.x - this.roomGroup.position.x,
        1.6,
        this.yaw.position.z,
      );
      pz = this.yaw.position.z;
    }
    this.lastPz = pz;

    this.updateTweens(dt);
    this.updateGrowth(time, dt);
    this.updateLighting(time, dt);
    this.updateItems(time, dt);
    this.updateClock(time);
    this.updateFinale(pz);
  }
}
