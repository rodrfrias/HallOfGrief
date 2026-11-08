import * as THREE from "three";

/* ============================================================
   CONFIG: valores para ajustar
   ============================================================ */
const CFG = {
  doorZ: -8,
  exitZ: -108,
  halfWidth: 25, // límite lateral del usuario (lo lee main.js con getXLimit)
  cameraFar: 400, // el reloj está a ~140 m: hay que ampliar el far de la cámara
  baseFov: 75,
  floorRoughness: 0.92, // 0 = vidrio, 1 = mate. Más alto = el barro absorbe la luz en vez de reflejarla

  sky: 0x04070c, // cielo y niebla
  fogNear: 6,
  fogFar: 85,
  ambient: { color: 0x1b2536, intensity: 0.45 },
  playerLight: { color: 0x93a9c4, intensity: 2.0, distance: 5.5, decay: 1.5 },

  // Faroles
  lampCount: 9,
  lampFirstZ: -12, // el primero ilumina la entrada
  lampLastZ: -104, // el último ilumina la puerta de salida (-108)
  lampSide: 3.2, // se alternan a izquierda y derecha del camino
  lampH: 4.6,
  spot: { color: 0xffd9a8, intensity: 40, distance: 14, angle: 0.85, penumbra: 0.7, decay: 1.5, pool: 5 },

  // Freno: velocidad normal cerca de la luz, casi nula en la oscuridad
  litInner: 3.8, // metros al farol con luz plena
  litOuter: 6.8, // metros al farol donde ya es oscuridad
  darkSpeed: 0.18, // fracción de la velocidad normal en la oscuridad total 0.18

  rainCount: 9000,

  // Siluetas (glitch)
  sil: { pool: 6, interval: [3, 4], life: [5, 8], fadeEnd: 6.5, fadeStart: 16, minSpawn: 15 },

  // Reloj
  clockScale: 25, // radio final = 0.6 * 25 = 15 m
  clockY: 34,
  clockBehind: 36, // metros detrás de la puerta de salida
  clockTick: 3, // segundos entre cada tic (lento y pesado)
};

const rnd = (a, b) => a + Math.random() * (b - a);
const smooth = (e0, e1, x) => {
  const t = THREE.MathUtils.clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
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

export class DepressionRoom {
  constructor(scene, doorFactory, initialState, camera, audio, say) {
    this.scene = scene;
    this.doorFactory = doorFactory;
    this.initialState = initialState;
    this.camera = camera;
    this.audio = audio || null;
    this.say = say || (() => {});
    this.interactables = [];
    this.isDoorUnlocked = false;

    this.roomGroup = new THREE.Group();
    this.scene.add(this.roomGroup);

    this.doorZ = CFG.doorZ;
    this.exitZ = CFG.exitZ;
    this.textures = []; // para liberarlas en dispose()

    this.resolved = false;
    this.resolvedAt = 0;
    this.relief = 0;
    this.lastTime = null;
    this.t0 = 0;

    // Freno
    this.yaw = null;
    this.prev = null;
    this.brake = 1;
    this.stepPhase = 0;
    this.fovNow = CFG.baseFov;

    this.lamps = [];
    this.silhouettes = [];
    this.nextSil = 0;
    this.lastTick = -1;

    this.camDir = new THREE.Vector3();
    this.tmpA = new THREE.Vector3();

    // Guardamos el ambiente para restaurarlo al salir
    this.saved = {
      far: camera.far,
      fogColor: scene.fog ? scene.fog.color.clone() : null,
      fogNear: scene.fog ? scene.fog.near : 2,
      fogFar: scene.fog ? scene.fog.far : 22,
      bg: scene.background && scene.background.isColor ? scene.background.clone() : null,
    };

    this.buildRoom();
    this.audio?.startRain?.();
  }

  getZLimit() {
    return this.exitZ + 0.7;
  }
  getXLimit() {
    return CFG.halfWidth;
  }

  // main.js lo llama al descargar la sala 
  dispose() {
    this.audio?.stopRain?.();
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
    if (this.saved.bg && this.scene.background && this.scene.background.isColor) {
      this.scene.background.copy(this.saved.bg);
    }
    this.textures.forEach((t) => t.dispose());
    this.textures = [];
  }

  tex(cv, srgb = true) {
    const t = texOf(cv, srgb);
    this.textures.push(t);
    return t;
  }

  /* ============================================================
     CONSTRUCCIÓN
     ============================================================ */
  buildRoom() {
    this.setupAtmosphere();
    this.buildLights();
    this.buildGround();
    this.buildLamps();
    this.buildProps();
    this.buildRain();
    this.buildSilhouettes();
    this.buildDoors();
    this.buildClock();
  }

  setupAtmosphere() {
    this.camera.far = CFG.cameraFar;
    this.camera.updateProjectionMatrix();

    if (this.scene.background && this.scene.background.isColor) {
      this.scene.background.setHex(CFG.sky);
    } else {
      this.scene.background = new THREE.Color(CFG.sky);
    }
    if (this.scene.fog) {
      this.scene.fog.color.setHex(CFG.sky);
      this.scene.fog.near = CFG.fogNear;
      this.scene.fog.far = CFG.fogFar;
    }
  }

  buildLights() {
    this.ambient = new THREE.AmbientLight(CFG.ambient.color, CFG.ambient.intensity);
    const P = CFG.playerLight;
    this.playerLight = new THREE.PointLight(P.color, P.intensity, P.distance, P.decay);
    this.roomGroup.add(this.ambient, this.playerLight);

    // Pool de SpotLights de cantidad fija: solo iluminan los faroles cercanos.
    // Los demás faroles se ven con sus haces falsos (baratos). Cambiar la cantidad
    // de luces en runtime obliga a recompilar shaders, por eso el pool es fijo.
    const S = CFG.spot;
    this.spots = [];
    for (let j = 0; j < S.pool; j++) {
      const l = new THREE.SpotLight(S.color, 0, S.distance, S.angle, S.penumbra, S.decay);
      l.userData = { lamp: -1, level: 0 };
      this.roomGroup.add(l, l.target);
      this.spots.push(l);
    }
  }

  /* ---------- Barro ---------- */
  paintMud() {
    const S = 512;
    const cv = canvasOf(S, S);
    const c = cv.getContext("2d");
    c.fillStyle = "#15120f";
    c.fillRect(0, 0, S, S);
    for (let i = 0; i < 40; i++) {
      const x = rnd(0, S), y = rnd(0, S), r = rnd(30, 90);
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(46,60,78,0.40)");
      g.addColorStop(1, "rgba(46,60,78,0)");
      c.fillStyle = g;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 6000; i++) {
      c.fillStyle = Math.random() > 0.5 ? "rgba(0,0,0,0.25)" : "rgba(120,110,100,0.06)";
      c.fillRect(rnd(0, S), rnd(0, S), 2, 2);
    }
    return cv;
  }

  buildGround() {
    const W = 160, L = 190;
    const t = this.tex(this.paintMud());
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(W / 6, L / 6);
    const mat = new THREE.MeshStandardMaterial({ map: t, roughness: CFG.floorRoughness, metalness: 0 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, L), mat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 2 - L / 2);
    this.roomGroup.add(floor);
  }

  /* ---------- Faroles (instanciados: pocas draw calls) ---------- */
  instanced(geo, mat, matrices) {
    const m = new THREE.InstancedMesh(geo, mat, matrices.length);
    matrices.forEach((mx, i) => m.setMatrixAt(i, mx));
    m.instanceMatrix.needsUpdate = true;
    m.frustumCulled = false;
    this.roomGroup.add(m);
    return m;
  }

  glowTexture(inner, outer) {
    const S = 256;
    const cv = canvasOf(S, S);
    const c = cv.getContext("2d");
    const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, inner);
    g.addColorStop(0.35, outer);
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);
    return this.tex(cv);
  }

  buildLamps() {
    const n = CFG.lampCount, H = CFG.lampH;
    for (let i = 0; i < n; i++) {
      const z = CFG.lampFirstZ + (i * (CFG.lampLastZ - CFG.lampFirstZ)) / (n - 1);
      this.lamps.push({ x: (i % 2 ? 1 : -1) * CFG.lampSide, z });
    }
    this.lastLampZ = this.lamps[n - 1].z;

    const dummy = new THREE.Object3D();
    const at = (y, rot = 0) =>
      this.lamps.map((l) => {
        dummy.position.set(l.x, y, l.z);
        dummy.rotation.set(0, rot, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        return dummy.matrix.clone();
      });

    const metal = new THREE.MeshStandardMaterial({ color: 0x27324a, roughness: 0.55, metalness: 0.2 });
    const shaftL = H - 1.45;
    this.instanced(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 10), metal, at(0.04));
    this.instanced(new THREE.CylinderGeometry(0.13, 0.3, 0.75, 10), metal, at(0.375));
    this.instanced(new THREE.CylinderGeometry(0.07, 0.09, shaftL, 8), metal, at(0.75 + shaftL / 2));
    this.instanced(new THREE.CylinderGeometry(0.12, 0.12, 0.14, 10), metal, at(0.75 + shaftL * 0.55));
    this.instanced(new THREE.CylinderGeometry(0.2, 0.14, 0.08, 4).rotateY(Math.PI / 4), metal, at(H - 0.66));
    this.instanced(new THREE.ConeGeometry(0.38, 0.28, 4).rotateY(Math.PI / 4), metal, at(H + 0.02));
    // Vidrio encendido (sin niebla: los faroles lejanos funcionan como faros)
    const glassMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: false });
    this.instanced(new THREE.CylinderGeometry(0.27, 0.17, 0.5, 4).rotateY(Math.PI / 4), glassMat, at(H - 0.37));

    // Halo del farol
    const gp = new Float32Array(n * 3);
    this.lamps.forEach((l, i) => gp.set([l.x, H - 0.35, l.z], i * 3));
    const gg = new THREE.BufferGeometry();
    gg.setAttribute("position", new THREE.BufferAttribute(gp, 3));
    const glow = new THREE.Points(
      gg,
      new THREE.PointsMaterial({
        map: this.glowTexture("rgba(255,235,190,1)", "rgba(255,190,110,0.35)"),
        color: 0xffd9a0,
        size: 4.2,
        sizeAttenuation: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    );
    glow.frustumCulled = false;
    this.roomGroup.add(glow);

    // Haz de luz falso (cono aditivo con borde suave) + charco de luz en el piso
    const beamH = H - 0.4;
    const tanA = Math.tan(CFG.spot.angle);
    const beamR = beamH * tanA;
    const beamGeo = new THREE.ConeGeometry(beamR, beamH, 28, 1, true);
    beamGeo.translate(0, beamH / 2, 0);
    const beamMat = new THREE.ShaderMaterial({
      uniforms: { uH: { value: beamH }, uAlpha: { value: 0.2 }, uColor: { value: new THREE.Color(0xffd9a0) } },
      vertexShader: `
        uniform float uH;
        varying vec3 vN; varying vec3 vV; varying float vY;
        void main(){
          vY = clamp(position.y / uH, 0.0, 1.0);
          vec4 mv = modelViewMatrix * (instanceMatrix * vec4(position, 1.0));
          vN = normalize(mat3(modelViewMatrix) * mat3(instanceMatrix) * normal);
          vV = -mv.xyz;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float uAlpha; uniform vec3 uColor;
        varying vec3 vN; varying vec3 vV; varying float vY;
        void main(){
          float e = pow(abs(dot(normalize(vN), normalize(vV))), 1.5);
          float a = uAlpha * e * (0.25 + 0.75 * pow(vY, 1.3));
          a *= 1.0 - smoothstep(40.0, 85.0, length(vV));
          gl_FragColor = vec4(uColor, a);
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.instanced(beamGeo, beamMat, at(0));

    const poolD = beamR * 2.3;
    const poolMats = this.lamps.map((l) => {
      dummy.position.set(l.x, 0.03, l.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(poolD, 1, poolD);
      dummy.updateMatrix();
      return dummy.matrix.clone();
    });
    this.instanced(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        map: this.glowTexture("rgba(255,214,150,0.55)", "rgba(255,190,120,0.22)"),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      poolMats,
    );

    this.beamTan = tanA;
  }

  /* ---------- Mesas y sillas hundidas en el barro (instanciadas) ---------- */
  buildProps() {
    const wood = new THREE.MeshStandardMaterial({ color: 0x17140f, roughness: 0.5, metalness: 0 });
    const parts = {
      tableTop: { geo: new THREE.BoxGeometry(1.5, 0.06, 0.9), items: [] },
      tableLeg: { geo: new THREE.BoxGeometry(0.07, 0.78, 0.07), items: [] },
      chairSeat: { geo: new THREE.BoxGeometry(0.46, 0.05, 0.46), items: [] },
      chairLeg: { geo: new THREE.BoxGeometry(0.05, 0.45, 0.05), items: [] },
      chairBack: { geo: new THREE.BoxGeometry(0.46, 0.5, 0.05), items: [] },
    };
    const quat = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), eul = new THREE.Euler();
    const push = (part, base, lx, ly, lz) => {
      parts[part].items.push(base.clone().multiply(new THREE.Matrix4().makeTranslation(lx, ly, lz)));
    };
    const place = (type, x, z) => {
      eul.set(rnd(-0.22, 0.22), rnd(0, Math.PI * 2), rnd(-0.22, 0.22));
      quat.setFromEuler(eul);
      const base = new THREE.Matrix4().compose(new THREE.Vector3(x, -rnd(0.22, 0.45), z), quat, one);
      if (type === "table") {
        push("tableTop", base, 0, 0.78, 0);
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => push("tableLeg", base, sx * 0.68, 0.39, sz * 0.38));
      } else {
        push("chairSeat", base, 0, 0.45, 0);
        push("chairBack", base, 0, 0.72, -0.21);
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => push("chairLeg", base, sx * 0.19, 0.225, sz * 0.19));
      }
    };

    // Bajo cada farol, hacia el lado del camino (dentro del charco de luz)
    this.lamps.forEach((l, i) => {
      const toPath = -Math.sign(l.x);
      const cx = l.x + toPath * rnd(1.2, 2.2);
      const cz = l.z + rnd(-1.2, 1.2);
      const kind = i % 3;
      if (kind === 0) {
        place("table", cx, cz);
        place("chair", cx + rnd(-1.4, -0.9), cz + rnd(-0.6, 0.6));
        place("chair", cx + rnd(0.9, 1.4), cz + rnd(-0.6, 0.6));
      } else if (kind === 1) {
        place("chair", cx, cz);
        place("chair", cx + rnd(0.8, 1.5), cz + rnd(-1, 1));
      } else {
        place("table", cx, cz);
      }
    });

    Object.values(parts).forEach((p) => {
      if (p.items.length) this.instanced(p.geo, wood, p.items);
    });
  }

  /* ---------- Lluvia: líneas largas animadas 100% en el vertex shader ---------- */
  buildRain() {
    const N = CFG.rainCount;
    const pos = new Float32Array(N * 6);
    const end = new Float32Array(N * 2);
    const seed = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const x = Math.random(), y = Math.random(), z = Math.random(), s = Math.random();
      pos.set([x, y, z, x, y, z], i * 6);
      end[i * 2] = 0;
      end[i * 2 + 1] = 1;
      seed[i * 2] = s;
      seed[i * 2 + 1] = s;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aEnd", new THREE.BufferAttribute(end, 1));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));

    this.rainMat = new THREE.ShaderMaterial({
      defines: { LAMPS: this.lamps.length },
      uniforms: {
        uTime: { value: 0 },
        uPlayer: { value: new THREE.Vector3() },
        uAlpha: { value: 0.2 },
        uLamps: { value: this.lamps.map((l) => new THREE.Vector2(l.x, l.z)) },
        uLampH: { value: CFG.lampH - 0.4 },
        uTan: { value: this.beamTan },
      },
      vertexShader: `
        uniform float uTime; uniform vec3 uPlayer; uniform float uAlpha;
        uniform vec2 uLamps[LAMPS]; uniform float uLampH; uniform float uTan;
        attribute float aEnd; attribute float aSeed;
        varying float vA; varying float vLit;
        void main(){
          vec3 box = vec3(60.0, 28.0, 60.0);
          float speed = 16.0 + aSeed * 8.0;
          vec3 p = position * box;
          p.y = mod(p.y - uTime * speed, box.y);
          p.xz = mod(p.xz - uPlayer.xz + box.xz * 0.5, box.xz) - box.xz * 0.5 + uPlayer.xz;
          vec3 dir = normalize(vec3(0.14, -1.0, 0.06));
          vec3 pos = p - dir * (0.9 + aSeed * 0.9) * aEnd;   // la cola queda arriba
          float lit = 0.0;
          for (int i = 0; i < LAMPS; i++) {
            float h = uLampH - pos.y;
            float r = max(h, 0.0) * uTan;
            float inCone = (1.0 - smoothstep(r * 0.55, r, length(pos.xz - uLamps[i]))) * step(0.0, h);
            lit = max(lit, inCone);
          }
          float d = length(pos - uPlayer);
          float a = uAlpha * (0.5 + 0.5 * aSeed) * (1.0 - aEnd * 0.85);
          a *= 1.0 - smoothstep(18.0, 30.0, d);
          vA = min(a * (1.0 + 3.0 * lit), 0.85);   // las gotas brillan dentro de los haces
          vLit = lit;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }`,
      fragmentShader: `
        varying float vA; varying float vLit;
        void main(){
          vec3 col = mix(vec3(0.55, 0.66, 0.80), vec3(1.0, 0.88, 0.65), vLit);
          gl_FragColor = vec4(col, vA);
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const rain = new THREE.LineSegments(geo, this.rainMat);
    rain.frustumCulled = false;
    this.roomGroup.add(rain);
  }

  /* ---------- Siluetas 2D con glitch ---------- */
  paintFigure(v) {
    const W = 256, H = 512;
    const draw = (c) => {
      const poly = (pts) => {
        c.beginPath();
        pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
        c.closePath();
        c.fill();
      };
      const standing = () => {
        c.beginPath(); c.ellipse(128, 76, 23, 30, 0, 0, Math.PI * 2); c.fill();
        poly([[114, 104], [142, 104], [146, 118], [110, 118]]);
        poly([[94, 118], [162, 118], [174, 300], [82, 300]]);
        poly([[82, 122], [96, 122], [86, 310], [72, 308]]);
        poly([[160, 122], [174, 122], [184, 308], [170, 310]]);
        poly([[92, 296], [126, 296], [122, 490], [100, 490]]);
        poly([[130, 296], [164, 296], [156, 490], [134, 490]]);
      };
      if (v === 0) {
        standing();
      } else if (v === 1) {
        // sentada, encorvada, en una silla
        c.beginPath(); c.ellipse(118, 190, 24, 28, 0.3, 0, Math.PI * 2); c.fill();
        poly([[98, 214], [150, 210], [162, 360], [96, 366]]);
        poly([[96, 350], [214, 340], [218, 374], [96, 388]]);
        poly([[192, 372], [218, 374], [214, 480], [192, 480]]);
        poly([[148, 226], [196, 300], [186, 312], [140, 250]]);
        poly([[66, 236], [80, 236], [80, 480], [66, 480]]);
        poly([[70, 378], [150, 378], [150, 388], [70, 388]]);
      } else {
        // dos figuras, una grande y una chica
        c.save(); c.translate(-34, 36); c.scale(0.9, 0.9); standing(); c.restore();
        c.save(); c.translate(148, 232); c.scale(0.55, 0.55); standing(); c.restore();
      }
    };
    // R = silueta, G = halo borroso (se usa para la estática alrededor)
    const mc = canvasOf(W, H), m = mc.getContext("2d");
    m.fillStyle = "#000"; m.fillRect(0, 0, W, H);
    m.fillStyle = "#fff"; draw(m);
    const hc = canvasOf(W, H), h = hc.getContext("2d");
    h.shadowColor = "#fff"; h.shadowBlur = 34; h.shadowOffsetX = 1000;
    h.fillStyle = "#fff"; h.translate(-1000, 0); draw(h);
    const md = m.getImageData(0, 0, W, H), hd = h.getImageData(0, 0, W, H);
    const out = canvasOf(W, H), o = out.getContext("2d");
    const od = o.createImageData(W, H);
    for (let i = 0; i < W * H; i++) {
      od.data[i * 4] = md.data[i * 4];
      od.data[i * 4 + 1] = hd.data[i * 4 + 3];
      od.data[i * 4 + 2] = 0;
      od.data[i * 4 + 3] = 255;
    }
    o.putImageData(od, 0, 0);
    return this.tex(out, false);
  }

  buildSilhouettes() {
    this.figTex = [0, 1, 2].map((v) => this.paintFigure(v));
    const geo = new THREE.PlaneGeometry(1.3, 2.6);
    const vertexShader = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
    const fragmentShader = `
      uniform sampler2D uMap; uniform float uTime; uniform float uOpacity; uniform float uSeed; uniform float uGlitch;
      varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        float band = floor(vUv.y * 40.0);
        float t = floor(uTime * 16.0);
        float h = hash(vec2(band, t + uSeed));
        float shift = 0.0;
        if (h > 0.9 - 0.4 * uGlitch) shift = (h - 0.7) * 0.5 * (0.4 + uGlitch);   // desplazamiento horizontal por bandas
        vec4 m = texture2D(uMap, vec2(vUv.x + shift, vUv.y));
        float stat = hash(vec2(floor(vUv.x * 90.0), floor(vUv.y * 160.0) + t));  // estática
        float scan = 0.85 + 0.15 * sin(vUv.y * 300.0 + uTime * 40.0);
        float halo = m.g * (0.2 + 0.6 * stat) * scan;
        vec3 col = mix(vec3(0.55, 0.62, 0.70) * halo, vec3(0.0), m.r);          // silueta negra sobre estática fría
        float a = max(halo * 0.9, m.r) * uOpacity;
        if (h > 0.97) a *= 0.2;                                                  // cortes
        if (a < 0.01) discard;
        gl_FragColor = vec4(col, a);
      }`;
    for (let i = 0; i < CFG.sil.pool; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: this.figTex[0] },
          uTime: { value: 0 },
          uOpacity: { value: 0 },
          uSeed: { value: Math.random() * 100 },
          uGlitch: { value: 0.4 },
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.position.y = 1.3;
      this.roomGroup.add(mesh);
      this.silhouettes.push({ mesh, mat, active: false, born: 0, life: 0 });
    }
  }

  spawnSilhouette(time, px, pz) {
    const s = this.silhouettes.find((q) => !q.active);
    if (!s) return;
    const S = CFG.sil;
    for (let attempt = 0; attempt < 8; attempt++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = side * rnd(8, 22);
      const z = THREE.MathUtils.clamp(pz - rnd(15, 42), this.exitZ - 6, this.doorZ - 8);
      if (Math.hypot(x - px, z - pz) < S.minSpawn) continue;
      s.mesh.position.set(x, 1.3, z);
      s.mat.uniforms.uMap.value = this.figTex[(Math.random() * 3) | 0];
      s.mat.uniforms.uSeed.value = Math.random() * 100;
      s.mat.uniforms.uOpacity.value = 0;
      s.born = time;
      s.life = rnd(S.life[0], S.life[1]);
      s.active = true;
      return;
    }
  }

  /* ---------- Puertas de entrada y de salida ---------- */
  // El modelo de la puerta trae un plano y un box negros detrás (el efecto de "entrar a un
  // lugar oscuro" del pasillo). Acá no hacen falta: se quitan solo de estos dos clones,
  // el modelo original de CorridorDoor no se toca.
  stripVoid(group) {
    [...group.children].forEach((c) => {
      if (c.isMesh && c.material && c.material.isMeshBasicMaterial && c.material.color.getHex() === 0x000000) {
        group.remove(c);
        c.geometry.dispose();
        c.material.dispose();
      }
    });
  }

  buildDoors() {
    const entry = this.doorFactory.getClone(true, this.initialState);
    entry.position.set(0, 0, this.doorZ);
    entry.rotation.y = Math.PI;
    entry.traverse((c) => {
      if (c.userData && c.userData.id === "corridorDoor") {
        c.userData = { id: "lockedDoor_depression", prompt: "Interactuar" };
        this.interactables.push(c);
      }
    });
    this.entryDoorGroup = entry;

    // Salida: de frente al usuario que viene caminando por -Z. El id empieza con
    // "entryDoor" para que main.js la trate como puerta de salida al destrabarse.
    const exit = this.doorFactory.getClone(true, this.initialState);
    exit.position.set(0, 0, this.exitZ);
    exit.rotation.y = 0;
    exit.traverse((c) => {
      if (c.userData && c.userData.id === "corridorDoor") {
        c.userData = { id: "entryDoor_depression", prompt: "Interactuar" };
        this.interactables.push(c);
      }
    });
    this.exitDoorGroup = exit;

    this.stripVoid(entry);
    this.stripVoid(exit);
    this.roomGroup.add(entry, exit);
  }

  /* ---------- Reloj imponente (mismo reloj, materiales sin luz y sin niebla) ---------- */
  paintClockFace() {
    const S = 1024, c0 = S / 2;
    const cv = canvasOf(S, S);
    const c = cv.getContext("2d");
    const g = c.createRadialGradient(c0, c0, 0, c0, c0, c0);
    g.addColorStop(0, "#0d1a22");
    g.addColorStop(0.7, "#07101a");
    g.addColorStop(1, "#03070c");
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);
    c.strokeStyle = "rgba(150,190,200,0.35)";
    c.lineWidth = 4;
    c.beginPath(); c.arc(c0, c0, c0 * 0.94, 0, Math.PI * 2); c.stroke();
    c.translate(c0, c0);
    c.lineCap = "round";
    for (let i = 0; i < 60; i++) {
      c.save();
      c.rotate((i / 60) * Math.PI * 2);
      const hour = i % 5 === 0, card = i % 15 === 0;
      c.strokeStyle = i === 0 ? "#d98a6c" : hour ? "#b9c9d4" : "rgba(185,201,212,0.45)";
      c.lineWidth = card ? 20 : hour ? 13 : 4;
      const r1 = c0 * 0.9, r2 = r1 - (card ? 100 : hour ? 70 : 20);
      c.beginPath(); c.moveTo(0, -r1); c.lineTo(0, -r2); c.stroke();
      c.restore();
    }
    return this.tex(cv);
  }

  buildClock() {
    const R = 0.6;
    const group = new THREE.Group();
    const add = (m) => { group.add(m); return m; };
    const basic = (color) => new THREE.MeshBasicMaterial({ color, fog: false });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.07, R + 0.07, 0.12, 96), basic(0x241d19));
    body.rotation.x = Math.PI / 2; body.position.z = 0.06; add(body);

    const face = new THREE.Mesh(
      new THREE.CircleGeometry(R, 96),
      new THREE.MeshBasicMaterial({ map: this.paintClockFace(), fog: false }),
    );
    face.position.z = 0.122; add(face);

    const bezel = new THREE.Mesh(new THREE.TorusGeometry(R + 0.035, 0.035, 16, 96), basic(0x3a4a55));
    bezel.position.z = 0.125; add(bezel);

    const makeHand = (len, w, tail, mat, depth, z) => {
      const s = new THREE.Shape();
      s.moveTo(-w / 2, -tail); s.lineTo(w / 2, -tail); s.lineTo(w / 2, len * 0.88); s.lineTo(0, len); s.lineTo(-w / 2, len * 0.88); s.closePath();
      const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }), mat);
      m.position.z = z;
      return add(m);
    };
    const cream = basic(0xe3d8c8), coral = basic(0xd86a4a);
    const hourHand = makeHand(R * 0.52, 0.08, 0.06, cream, 0.01, 0.13);
    const minuteHand = makeHand(R * 0.82, 0.055, 0.07, cream, 0.01, 0.142);
    const secondHand = makeHand(R * 0.9, 0.012, R * 0.18, coral, 0.004, 0.154);
    this.clockHands = { hourHand, minuteHand, secondHand };

    group.scale.setScalar(CFG.clockScale);
    const cz = this.exitZ - CFG.clockBehind;
    group.position.set(0, CFG.clockY, cz);
    // Renderizado forzado: sin niebla, sin culling, y dibujado aunque quede lejos del frustum
    group.traverse((o) => { o.frustumCulled = false; });
    this.clockGroup = group;

    // Resplandor frío detrás del reloj (la luna que no es luna)
    const rW = R * CFG.clockScale;
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(rW * 5, rW * 5),
      new THREE.MeshBasicMaterial({
        map: this.glowTexture("rgba(150,190,230,0.55)", "rgba(120,160,210,0.16)"),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        opacity: 0.45,
      }),
    );
    halo.position.set(0, CFG.clockY, cz - 1);
    halo.frustumCulled = false;

    this.roomGroup.add(group, halo);
    this.updateClock(0);
  }

  // Tic lento y pesado: salto brusco con un pequeño rebote cada `clockTick` segundos.
  // Parte de las 3:17:41, la hora en la que quedaron detenidos los otros relojes.
  updateClock(t) {
    const T = CFG.clockTick;
    const n = Math.floor(t / T);
    const q = Math.min(1, (t - n * T) / 0.55);
    const sweep = 1 - Math.pow(1 - q, 3) + 0.07 * Math.sin(q * Math.PI * 3) * (1 - q);
    const ticks = n + sweep;
    const TAU = Math.PI * 2;
    const { hourHand, minuteHand, secondHand } = this.clockHands;
    secondHand.rotation.z = -(41 / 60 + ticks / 60) * TAU;
    minuteHand.rotation.z = -((17 + 41 / 60) / 60 + ticks / 360) * TAU;
    hourHand.rotation.z = -((3 + 17 / 60) / 12 + ticks / 4320) * TAU;
    if (n !== this.lastTick) {
      this.lastTick = n;
      if (n > 0) this.audio?.playHeavyTick?.();
    }
  }

  /* ============================================================
     MECÁNICAS
     ============================================================ */
  // 1 = bajo la luz de un farol, 0 = oscuridad total
  lightAt(px, pz) {
    let light = 0;
    for (const l of this.lamps) {
      light = Math.max(light, 1 - smooth(CFG.litInner, CFG.litOuter, Math.hypot(px - l.x, pz - l.z)));
    }
    return light;
  }

  // Freno falso: main.js ya movió al usuario este frame; acá recortamos ese
  // desplazamiento según cuánta luz hay (contrarresta el movimiento).
  updateMovement(dt) {
    if (!this.yaw) this.yaw = this.camera.parent && this.camera.parent.parent;
    const yaw = this.yaw;
    if (!yaw) return { px: 0, pz: this.doorZ };
    if (!this.prev) this.prev = yaw.position.clone();

    const ox = this.roomGroup.position.x;
    // Fuera de la caminata de entrada, y mientras la sala no esté resuelta
    const active = !this.resolved && yaw.position.z < this.doorZ - 2.0;
    const light = this.lightAt(yaw.position.x - ox, yaw.position.z);
    const target = active ? CFG.darkSpeed + (1 - CFG.darkSpeed) * light : 1;
    this.brake += (target - this.brake) * (1 - Math.exp(-dt * 3.5));

    const dx = yaw.position.x - this.prev.x;
    const dz = yaw.position.z - this.prev.z;
    if (active && Math.hypot(dx, dz) < 1.0) {
      yaw.position.x = this.prev.x + dx * this.brake;
      yaw.position.z = this.prev.z + dz * this.brake;
    }
    const real = Math.hypot(yaw.position.x - this.prev.x, yaw.position.z - this.prev.z);
    this.prev.copy(yaw.position);

    // Peso en el cuerpo: pasos más hondos, cabeza gacha y FOV un poco más cerrado
    const heavy = 1 - this.brake;
    this.stepPhase += real * 7;
    const amp = THREE.MathUtils.lerp(0.012, 0.045, heavy);
    this.camera.position.set(0, Math.sin(this.stepPhase) * amp, 0);
    this.camera.rotation.x = -0.07 * heavy;
    this.camera.rotation.z = Math.sin(this.stepPhase * 0.5) * 0.01 * heavy;
    const fov = CFG.baseFov - 7 * heavy;
    if (Math.abs(fov - this.fovNow) > 0.05) {
      this.fovNow = fov;
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    return { px: yaw.position.x - ox, pz: yaw.position.z };
  }

  updateLamps(time, dt, pz) {
    const n = this.lamps.length, P = CFG.spot.pool;
    const spacing = (CFG.lampLastZ - CFG.lampFirstZ) / (n - 1);
    const k = THREE.MathUtils.clamp(Math.round((pz - CFG.lampFirstZ) / spacing), 0, n - 1);

    // Ventana de faroles con luz real: uno atrás y los 3 de adelante. El farol m
    // siempre lo maneja el spot (m % P), así solo uno cambia de farol por paso.
    const desired = new Array(P).fill(-1);
    for (let m = k - 1; m <= k + P - 2; m++) if (m >= 0 && m < n) desired[m % P] = m;

    const boost = 1 + 0.25 * this.relief;
    this.spots.forEach((l, j) => {
      const u = l.userData;
      if (u.lamp !== desired[j]) {
        u.level -= dt * 2.5; // se apaga, se muda al farol nuevo y se vuelve a encender
        if (u.level <= 0) {
          u.level = 0;
          u.lamp = desired[j];
          if (u.lamp >= 0) {
            const lp = this.lamps[u.lamp];
            l.position.set(lp.x, CFG.lampH - 0.4, lp.z);
            l.target.position.set(lp.x, 0, lp.z);
          }
        }
      } else if (u.lamp >= 0) {
        u.level = Math.min(1, u.level + dt * 2.5);
      }
      const flick = u.lamp >= 0 ? 1 - 0.18 * Math.pow(Math.max(0, Math.sin(time * 9.1 + u.lamp * 5.3) * Math.sin(time * 2.3 + u.lamp)), 6) : 1;
      l.intensity = CFG.spot.intensity * u.level * boost * flick;
    });
  }

  updateSilhouettes(time, px, pz) {
    const S = CFG.sil;
    if (!this.resolved && time >= this.nextSil) {
      this.spawnSilhouette(time, px, pz);
      this.nextSil = time + rnd(S.interval[0], S.interval[1]);
    }
    const kill = this.resolved ? 1 - smooth(0, 2.5, time - this.resolvedAt) : 1;
    for (const s of this.silhouettes) {
      if (!s.active) continue;
      const age = time - s.born;
      const m = s.mesh;
      const d = Math.hypot(m.position.x - px, m.position.z - pz);
      const env = smooth(0, 1.2, age) * (1 - smooth(s.life - 1.6, s.life, age));
      // Se desvanece con la distancia: opacidad 0 exacta a los 6.5 m (nunca se ven de cerca)
      const near = smooth(S.fadeEnd, S.fadeStart, d);
      const prox = near * (1 - smooth(40, 60, d));
      const op = env * prox * kill * 0.9;
      const u = s.mat.uniforms;
      u.uOpacity.value = op;
      u.uTime.value = time;
      u.uGlitch.value = 0.3 + 0.7 * (1 - near);
      m.visible = op > 0.004;
      m.rotation.y = Math.atan2(px - m.position.x, pz - m.position.z);
      if (age >= s.life || (this.resolved && kill <= 0)) {
        s.active = false;
        m.visible = false;
      }
    }
  }

  resolveRoom(time) {
    this.resolved = true;
    this.resolvedAt = time;
    this.isDoorUnlocked = true;
    this.say("El peso cede. El tiempo sigue su curso incluso en la oscuridad.");
    this.audio?.playSoft?.(261);

    
    this.exitDoorGroup.traverse((c) => {
      if (c.userData && c.userData.id === "entryDoor_depression") {
        c.userData.prompt = "Esta bien no estar bien. (Interactuar)";
      }
    });
  }

  interact(object, uiPromptCallback) {
    const id = object.userData.id;
    if (id === "lockedDoor_depression") {
      uiPromptCallback("Ya no hay vuelta atrás. No encontras el camino de regreso");
    } else if (id === "entryDoor_depression") {
      // main.js se encarga de la salida cuando isDoorUnlocked es true
      uiPromptCallback(this.isDoorUnlocked ? "La puerta cede." : "La puerta pesa demasiado. Todavía no.");
    }
  }

  /* ============================================================
     BUCLE PRINCIPAL
     ============================================================ */
  update(time) {
    if (this.lastTime === null) {
      this.lastTime = time;
      this.t0 = time;
      this.nextSil = time + 2.5;
      this.spots.forEach((l, j) => {
        // Arranca con los primeros faroles ya encendidos
        const lp = this.lamps[j];
        if (!lp) return;
        l.userData.lamp = j;
        l.userData.level = 1;
        l.position.set(lp.x, CFG.lampH - 0.4, lp.z);
        l.target.position.set(lp.x, 0, lp.z);
      });
    }
    const dt = Math.min(0.05, Math.max(0.0001, time - this.lastTime));
    this.lastTime = time;

    const { px, pz } = this.updateMovement(dt);

    if (!this.resolved && pz <= this.lastLampZ) this.resolveRoom(time);
    if (this.resolved) this.relief += (1 - this.relief) * (1 - Math.exp(-dt * 0.6));

    // Luz del usuario: sutil, un poco adelante y a la altura de la cintura (ve el piso inmediato)
    this.camera.getWorldDirection(this.camDir);
    this.camDir.y = 0;
    if (this.camDir.lengthSq() > 0) this.camDir.normalize();
    this.playerLight.position.set(px + this.camDir.x * 0.5, 1.0, pz + this.camDir.z * 0.5);

    this.ambient.intensity = CFG.ambient.intensity * (1 + 0.5 * this.relief);

    this.updateLamps(time, dt, pz);

    const ru = this.rainMat.uniforms;
    ru.uTime.value = time;
    ru.uPlayer.value.set(px, 1.6, pz);
    ru.uAlpha.value = 0.2 - 0.07 * this.relief;

    this.updateSilhouettes(time, px, pz);
    // El reloj no se encoge ni se mueve al resolver: sigue marcando su tic pesado
    this.updateClock(time - this.t0);
  }
}