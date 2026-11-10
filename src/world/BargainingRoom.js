import * as THREE from "three";

const rnd = (a, b) => a + Math.random() * (b - a);
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
const smooth = (e0, e1, x) => {
  const t = THREE.MathUtils.clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

export class BargainingRoom {
  constructor(scene, doorFactory, initialState, camera, audio, say) {
    this.scene = scene;
    this.doorFactory = doorFactory;
    this.initialState = initialState;
    this.camera = camera;
    this.audio = audio;
    this.say = say || (() => {});
    this.interactables = [];
    this.isDoorUnlocked = false;

    //colores
    this.ambientColor = new THREE.Color(0xffe6c2);

    this.roomGroup = new THREE.Group();
    this.scene.add(this.roomGroup);

    this.doorZ = -8.0;
    this.roomD = 7.0;

    // Medidas dinámicas
    this.baseW = 3.5;
    this.baseH = 4.0;
    this.currentW = this.baseW;
    this.currentH = this.baseH;

    this.heldObject = null;
    this.failedAttempts = 0;
    this.maxFails = 4;
    this.objectsPlaced = 0;
    this.state = "SEARCHING";

    this.clockRunning = true;
    this.clockTime = 0;

    this.lastTime = null;
    this.ambientCol = new THREE.Color(0x6b4423);

    this.wallProps = [];

    this.buildRoom();
  }

  getZLimit() {
    return this.doorZ - this.roomD + 0.5;
  }
  getXLimit() {
    return this.currentW / 2 - 0.4;
  }

  /* ---------- TEXTURAS AMBAR/SEPIA ---------- */
  createWallTexture() {
    const w = 512,
      h = 512;
    const cv = canvasOf(w, h);
    const c = cv.getContext("2d");
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#3f2716");
    g.addColorStop(0.5, "#664225");
    g.addColorStop(1, "#26160b");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);

    for (let i = 0; i < 4000; i++) {
      c.fillStyle =
        Math.random() > 0.5 ? "rgba(0,0,0,0.15)" : "rgba(255,200,100,0.06)";
      c.fillRect(rnd(0, w), rnd(0, h), 2, 2);
    }
    return texOf(cv);
  }

  createPaperTexture(phrase) {
    const w = 128,
      h = 256;
    const cv = canvasOf(w, h);
    const c = cv.getContext("2d");
    c.fillStyle = "#e8dcc5";
    c.fillRect(0, 0, w, h);

    c.strokeStyle = "rgba(60, 40, 20, 0.25)";
    c.lineWidth = 1.5;
    for (let y = 30; y < h - 20; y += 18) {
      c.beginPath();
      c.moveTo(15, y + rnd(-1, 1));
      c.lineTo(w - 15, y + rnd(-1, 1));
      c.stroke();
    }

    c.fillStyle = "rgba(30, 15, 10, 0.85)";
    c.font = '600 14px "Courier New", monospace';
    c.textAlign = "center";
    c.textBaseline = "bottom";

    const words = phrase.split(" ");
    let line = "";
    let yText = 48;

    for (let i = 0; i < words.length; i++) {
      const testLine = line + words[i] + " ";
      if (c.measureText(testLine).width > w - 24 && i > 0) {
        c.fillText(line, w / 2, yText);
        line = words[i] + " ";
        yText += 18;
      } else {
        line = testLine;
      }
    }
    c.fillText(line, w / 2, yText);

    return texOf(cv);
  }

  createWoodTexture(base) {
    const S = 256;
    const cv = canvasOf(S, S);
    const c = cv.getContext("2d");
    c.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
    c.fillRect(0, 0, S, S);
    for (let i = 0; i < 160; i++) {
      const y = rnd(0, S);
      const dark = Math.random() > 0.45;
      c.strokeStyle = dark
        ? `rgba(0,0,0,${rnd(0.05, 0.16)})`
        : `rgba(255,220,180,${rnd(0.02, 0.06)})`;
      c.lineWidth = rnd(0.6, 2.2);
      c.beginPath();
      c.moveTo(0, y);
      for (let x = 0; x <= S; x += 32)
        c.lineTo(x, y + Math.sin(x * 0.05 + i) * rnd(0.5, 2.5));
      c.stroke();
    }
    const t = texOf(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  /* ---------- CONSTRUCCIÓN DEL ESPACIO ---------- */
  buildRoom() {
    const doorGroup = this.doorFactory.getClone(true, this.initialState);
    doorGroup.position.set(0, 0, this.doorZ);
    doorGroup.rotation.y = Math.PI;

    doorGroup.traverse((c) => {
      if (c.userData && c.userData.id === "corridorDoor") {
        c.userData = { id: "entryDoor_bargaining", prompt: "Interactuar" };
        this.interactables.push(c);
      }
    });

    this.entryDoorGroup = doorGroup;
    this.roomGroup.add(doorGroup);

    const wallTex = this.createWallTexture();
    const wallMat = new THREE.MeshStandardMaterial({
      map: wallTex,
      roughness: 0.9,
      metalness: 0.1,
    });
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x2e1a0f,
      roughness: 0.8,
    });
    const ceilingMat = new THREE.MeshStandardMaterial({
      color: 0x1c1008,
      roughness: 1.0,
    });

    this.leftWall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), wallMat);
    this.leftWall.rotation.y = Math.PI / 2;
    this.rightWall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), wallMat);
    this.rightWall.rotation.y = -Math.PI / 2;
    this.backWall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), wallMat);
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.ceiling = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), ceilingMat);
    this.ceiling.rotation.x = Math.PI / 2;

    const pSide = (this.baseW - 1.2) / 2;
    this.pLeft = new THREE.Mesh(new THREE.PlaneGeometry(pSide, 1), wallMat);
    this.pLeft.rotation.y = Math.PI;
    this.pRight = new THREE.Mesh(new THREE.PlaneGeometry(pSide, 1), wallMat);
    this.pRight.rotation.y = Math.PI;
    this.pTop = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1), wallMat);
    this.pTop.rotation.y = Math.PI;

    this.roomGroup.add(
      this.leftWall,
      this.rightWall,
      this.backWall,
      this.pLeft,
      this.pRight,
      this.pTop,
      this.floor,
      this.ceiling,
    );

    this.ambient = new THREE.AmbientLight(0xffcc88, 0.4);
    this.mainLight = new THREE.PointLight(0xffb866, 2.5, 18);
    this.roomGroup.add(this.ambient, this.mainLight);

    this.buildFurnitureAndObjects();
    this.buildFloatingPapers();
    this.applyRoomSize(this.currentW, this.currentH);
  }

  applyRoomSize(w, h) {
    const d = this.roomD;
    const halfW = w / 2;
    const centerZ = this.doorZ - d / 2;

    this.leftWall.scale.set(d, h, 1);
    this.leftWall.position.set(-halfW, h / 2, centerZ);

    this.rightWall.scale.set(d, h, 1);
    this.rightWall.position.set(halfW, h / 2, centerZ);

    this.backWall.scale.set(w, h, 1);
    this.backWall.position.set(0, h / 2, this.doorZ - d);

    this.floor.scale.set(w, d, 1);
    this.floor.position.set(0, 0, centerZ);

    this.ceiling.scale.set(w, d, 1);
    this.ceiling.position.set(0, h, centerZ);

    const pSide = Math.max(0.1, (w - 1.2) / 2);
    this.pLeft.scale.set(pSide, h, 1);
    this.pLeft.position.set(-w / 2 + pSide / 2, h / 2, this.doorZ);

    this.pRight.scale.set(pSide, h, 1);
    this.pRight.position.set(w / 2 - pSide / 2, h / 2, this.doorZ);

    const topH = Math.max(0.1, h - 2.2);
    this.pTop.scale.set(1.2, topH, 1);
    this.pTop.position.set(0, 2.2 + topH / 2, this.doorZ);

    this.mainLight.position.set(0, h - 0.5, centerZ);

    const setUVs = (mesh, uMin, uMax, vMin, vMax) => {
      const uv = mesh.geometry.attributes.uv;
      if (!uv) return;
      uv.setXY(0, uMin, vMax);
      uv.setXY(1, uMax, vMax);
      uv.setXY(2, uMin, vMin);
      uv.setXY(3, uMax, vMin);
      uv.needsUpdate = true;
    };

    const u1 = pSide / w;
    const u2 = (pSide + 1.2) / w;
    const v1 = 2.2 / h;

    setUVs(this.pRight, 0, u1, 0, 1);
    setUVs(this.pTop, u1, u2, v1, 1);
    setUVs(this.pLeft, u2, 1, 0, 1);

    const scaleX = w / this.baseW;
    if (this.wallProps) {
      this.wallProps.forEach((obj) => {
        if (obj.userData && obj.userData.placed) return;

        const newX = obj.userData.baseX * scaleX;

        if (obj.parent === this.roomGroup) {
          obj.position.x = newX;
        }

        if (obj.userData && obj.userData.originalPos) {
          obj.userData.originalPos.x = newX;
        }
      });
    }
  }

  /* ---------- MUEBLES Y OBJETOS ---------- */
  buildFurnitureAndObjects() {
    const woodMat = new THREE.MeshStandardMaterial({
      map: this.createWoodTexture([85, 55, 35]),
      roughness: 0.8,
    });

    this.tableMat = new THREE.MeshStandardMaterial({
      map: this.createWoodTexture([100, 65, 40]),
      emissive: 0xcc7722,
      emissiveIntensity: 0,
      roughness: 0.8,
    });

    this.tableGroup = new THREE.Group();
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.05, 0.8),
      this.tableMat,
    );
    top.position.y = 0.9;

    top.userData = { id: "bargain_table", prompt: "" }; // Sin pistas explicitas
    this.interactables.push(top);

    const legGeo = new THREE.CylinderGeometry(0.04, 0.02, 0.9);
    const positions = [
      [-0.65, -0.3],
      [0.65, -0.3],
      [-0.65, 0.3],
      [0.65, 0.3],
    ];
    positions.forEach((pos) => {
      const leg = new THREE.Mesh(legGeo, this.tableMat);
      leg.position.set(pos[0], 0.45, pos[1]);
      this.tableGroup.add(leg);
    });

    this.tableGroup.add(top);
    this.tableGroup.position.set(0, 0, this.doorZ - 6.0);
    this.roomGroup.add(this.tableGroup);

    this.objects = [];
    this.glowMat = new THREE.MeshStandardMaterial({
      color: 0x555555,
      emissive: 0xffaa00,
      emissiveIntensity: 0.6,
      roughness: 0.3,
      metalness: 0.5,
    });
    const blankPaperMat = new THREE.MeshStandardMaterial({
      map: this.createPaperTexture(""),
      emissive: 0xffaa00,
      emissiveIntensity: 0.4,
    });

    const createObj = (mesh, name, x, y, z) => {
      mesh.position.set(x, y, z);
      mesh.traverse((child) => {
        if (child.isMesh && child.material)
          child.material = child.material.clone();
      });

      mesh.userData = {
        id: "bargain_obj",
        prompt: `Agarrar ${name}`,
        originalPos: mesh.position.clone(),
        originalRot: mesh.rotation.clone(),
        baseX: x,
        placed: false,
        root: mesh,
      };
      this.roomGroup.add(mesh);

      mesh.traverse((child) => {
        if (child.isMesh) {
          child.userData = mesh.userData;
          this.interactables.push(child);
        }
      });

      this.objects.push(mesh);
      this.wallProps.push(mesh);
    };

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.04, 0.015, 16, 32),
      this.glowMat,
    );
    ring.rotation.x = -Math.PI / 2;
    createObj(ring, "Anillo", -1.0, 0.05, this.doorZ - 3);

    const keyGroup = new THREE.Group();
    const keyBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.01, 0.15),
      this.glowMat,
    );
    const keyHead = new THREE.Mesh(
      new THREE.TorusGeometry(0.03, 0.01),
      this.glowMat,
    );
    keyHead.position.y = 0.08;
    const keyTeeth = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.03, 0.01),
      this.glowMat,
    );
    keyTeeth.position.set(0.02, -0.05, 0);
    keyGroup.add(keyBase, keyHead, keyTeeth);
    keyGroup.rotation.set(-Math.PI / 2, Math.PI / 4, 0); // Acostada (-90° en X) y cruzada (45° en Y)
    createObj(keyGroup, "Llave", 1.2, 1.05, this.doorZ - 4.5);

    const shelf1 = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.05, 0.3),
      woodMat,
    );
    shelf1.position.set(1.4, 1.0, this.doorZ - 4.5);
    shelf1.userData = { baseX: 1.4 };
    this.roomGroup.add(shelf1);
    this.wallProps.push(shelf1);

    const watch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.02, 32),
      this.glowMat,
    );
    createObj(watch, "Reloj de bolsillo", -1.3, 0.85, this.doorZ - 5.5);

    const shelf2 = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.05, 0.3),
      woodMat,
    );
    shelf2.position.set(-1.4, 0.8, this.doorZ - 5.5);
    shelf2.userData = { baseX: -1.4 };
    this.roomGroup.add(shelf2);
    this.wallProps.push(shelf2);

    const letter = new THREE.Mesh(
      new THREE.PlaneGeometry(0.15, 0.2),
      blankPaperMat,
    );
    letter.rotation.x = -Math.PI / 2 + 0.1;
    createObj(letter, "Carta", 0.5, 0.05, this.doorZ - 2.5);

    const clockData = this.createClock(0.5);
    this.clockHands = clockData.hands;
    clockData.group.position.set(0, 2.0, this.doorZ - 6.9);
    this.roomGroup.add(clockData.group);
  }

  /* ---------- PAPELES FLOTANTES (Múltiples InstancedMesh por rendimiento) ---------- */
  buildFloatingPapers() {
    const phrases = [
      "¿Y si hubiera estado ahí?",
      "¿Si me hubiera dado cuenta?",
      "Daría mi vida por volver",
      "Solo un día más",
      "No volveré a fallar",
      "¿Por qué no yo?",
    ];

    const papersPerPhrase = 25;
    this.paperCount = phrases.length * papersPerPhrase;

    this.paperGroups = [];
    this.paperData = [];

    const geo = new THREE.BoxGeometry(0.2, 0.28, 0.002);

    // 1. Creamos UN SOLO material en blanco (con renglones pero sin texto) para reciclarlo
    const blankTex = this.createPaperTexture("");
    const blankMat = new THREE.MeshStandardMaterial({
      map: blankTex,
      roughness: 0.9,
    });

    phrases.forEach((phrase, groupIdx) => {
      const tex = this.createPaperTexture(phrase);
      const textMat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.9,
      });

      // 2. Un cubo en Three.js tiene 6 caras en este orden exacto:
      // [Derecha, Izquierda, Arriba, Abajo, Frente, Dorso]
      const materials = [
        blankMat, // 0: Derecha
        blankMat, // 1: Izquierda
        blankMat, // 2: Arriba
        blankMat, // 3: Abajo
        textMat, // 4: FRENTE (Acá va el texto)
        blankMat, // 5: DORSO (Acá va en blanco)
      ];

      // Le pasamos la lista de materiales en lugar de uno solo
      const instMesh = new THREE.InstancedMesh(geo, materials, papersPerPhrase);

      this.roomGroup.add(instMesh);
      this.paperGroups.push(instMesh);

      for (let i = 0; i < papersPerPhrase; i++) {
        const baseX = rnd(-1.5, 1.5);
        const z = this.doorZ - rnd(1, 6.5);
        const baseY = rnd(0.5, 2.5);

        this.paperData.push({
          groupIdx,
          instanceIdx: i,
          baseX,
          baseY,
          currentY: baseY,
          z,
          rotX: rnd(0, Math.PI * 2),
          rotY: rnd(0, Math.PI * 2),
          rotZ: rnd(0, Math.PI * 2),
          speed: rnd(0.5, 1.5),
          phase: rnd(0, Math.PI * 2),
        });
      }
    });
  }

  /* ---------- LÓGICA DE INTERACCIÓN ---------- */
  interact(object, uiPromptCallback) {
    const id = object.userData.id;

    const tempMsg = (msg) => {
      if (!msg) return; // Si no hay mensaje, solo hace la acción en silencio
      const old = object.userData.prompt;
      object.userData.prompt = msg;
      uiPromptCallback(msg);
      setTimeout(() => {
        if (object && object.userData) object.userData.prompt = old;
      }, 2000);
    };

    if (id === "entryDoor_bargaining") {
      if (this.state === "RESOLVED") {
        return;
      }

      if (this.heldObject) {
        tempMsg("La habitación rechaza tu oferta.");
        this.audio?.playSoft(200);

        // Apaga el brillo del objeto para indicar que fue rechazado
        this.heldObject.traverse((child) => {
          if (child.isMesh && child.material)
            child.material.emissiveIntensity = 0;
        });

        this.roomGroup.add(this.heldObject);
        this.heldObject.position.copy(this.heldObject.userData.originalPos);
        this.heldObject.rotation.copy(this.heldObject.userData.originalRot);
        this.heldObject = null;

        this.failedAttempts++;
        this.checkStateTransition();
      } else {
        tempMsg("Esta bloqueada. Todavía intentás encontrar otra salida");
      }
      return;
    }

    if (id === "bargain_obj") {
      const root = object.userData.root;

      if (this.heldObject) {
        tempMsg("Ya tienes algo en la mano.");
        return;
      }

      this.heldObject = root;
      this.camera.add(root);
      root.position.set(0.2, -0.2, -0.4);
      root.rotation.set(0, 0, 0);

      this.audio?.playClickSound();
      return; // Silencio, el jugador se da cuenta solo que lo agarró
    }

    if (id === "bargain_table") {
      if (this.state !== "LETTING_GO") {
        return; // Silencio si tocas la mesa antes de tiempo
      }

      if (this.heldObject) {
        this.roomGroup.add(this.heldObject);
        const slotX = -0.45 + this.objectsPlaced * 0.3;

        // Ajustamos un poco la altura (Y=0.935) para que no floten ni se hundan
        this.heldObject.position.set(slotX, 0.935, this.doorZ - 6.0);

        // Rescata la rotación original de cada objeto
        this.heldObject.rotation.copy(this.heldObject.userData.originalRot);

        // Aplana la carta para que quede bien sobre la mesa
        if (this.heldObject.userData.prompt === "Carta") {
          this.heldObject.rotation.x = -Math.PI / 2;
        }

        this.heldObject.userData.placed = true;

        this.heldObject.traverse((child) => {
          if (child.isMesh && child.material)
            child.material.emissiveIntensity = 0;
        });

        this.heldObject.traverse((child) => {
          if (child.isMesh) {
            const idx = this.interactables.indexOf(child);
            if (idx > -1) this.interactables.splice(idx, 1);
          }
        });

        this.heldObject = null;
        this.objectsPlaced++;
        this.audio?.playTick();

        if (this.objectsPlaced >= 4) {
          this.resolveRoom(uiPromptCallback);
        }
      }
    }
  }

  checkStateTransition() {
    if (this.failedAttempts >= this.maxFails && this.state === "SEARCHING") {
      this.state = "LETTING_GO";

      this.objects.forEach((obj) => {
        obj.traverse((child) => {
          if (child.isMesh && child.material)
            child.material.emissiveIntensity = 0.1;
        });
      });
      // La mesa empieza a brillar en el update() con un pulso

      const mesa = this.interactables.find(
        (i) => i.userData.id === "bargain_table",
      );
      if (mesa) mesa.userData.prompt = "Dejarlo ir";

      const ui = document.getElementById("ui-prompt");
      if (ui) {
        ui.innerText = "No hay tratos posibles.";
        setTimeout(() => {
          if (ui.innerText.includes("tratos")) ui.innerText = "";
        }, 4000);
      }
    }
  }

  resolveRoom(uiPromptCallback) {
    this.state = "RESOLVED";
    this.isDoorUnlocked = true;

    this.tableMat.emissiveIntensity = 0;

    this.entryDoorGroup.traverse((c) => {
      if (c.userData && c.userData.id === "entryDoor_bargaining") {
        c.userData.prompt = "Dejar de buscar respuestas (Interactuar)";
      }
    });

    setTimeout(() => {
      uiPromptCallback("Buscas otra salida. El reloj sigue avanzando");
      this.audio?.playClickSound();
    }, 1500);
  }

  /* ---------- BUCLE PRINCIPAL ---------- */
  update(time) {
    if (!this.lastTime) this.lastTime = time;
    const dt = Math.min(0.05, time - this.lastTime);
    this.lastTime = time;

    let targetW = this.baseW;
    let targetH = this.baseH;

    if (this.state === "SEARCHING" || this.state === "LETTING_GO") {
      targetW = Math.max(1.5, this.baseW - this.failedAttempts * 0.35);
      targetH = Math.max(2.5, this.baseH - this.failedAttempts * 0.25);
    }

    this.currentW += (targetW - this.currentW) * dt * 2.0;
    this.currentH += (targetH - this.currentH) * dt * 2.0;
    this.applyRoomSize(this.currentW, this.currentH);

    if (this.state === "LETTING_GO") {
      this.ambient.intensity = 0.2 + Math.sin(time * 3) * 0.1;
      // Latido en la mesa
      this.tableMat.emissiveIntensity = 0.4 + Math.sin(time * 4) * 0.2;
    } else if (this.state === "RESOLVED") {
      this.ambient.intensity += (0.6 - this.ambient.intensity) * dt * 2.0;
      this.ambient.color.lerp(this.ambientColor, dt);
    }

    const dummy = new THREE.Object3D();
    const scaleX = this.currentW / this.baseW;

    for (let i = 0; i < this.paperCount; i++) {
      const p = this.paperData[i];

      if (this.state !== "RESOLVED") {
        p.currentY = p.baseY + Math.sin(time * p.speed + p.phase) * 0.3;
        dummy.rotation.set(
          p.rotX + Math.sin(time * 0.5) * 0.2,
          p.rotY + time * p.speed * 0.2,
          p.rotZ + Math.cos(time * 0.5) * 0.2,
        );
      } else {
        p.currentY += (0.02 - p.currentY) * dt * 2.0;
        dummy.rotation.set(-Math.PI / 2, 0, p.rotZ);
      }

      const currentX = p.baseX * scaleX;

      dummy.position.set(currentX, p.currentY, p.z);
      dummy.updateMatrix();
      this.paperGroups[p.groupIdx].setMatrixAt(p.instanceIdx, dummy.matrix);
    }

    this.paperGroups.forEach((g) => (g.instanceMatrix.needsUpdate = true));

    if (this.clockRunning) {
      this.clockTime += this.state === "RESOLVED" ? dt : -dt * 8.0;
      const chaos = this.state !== "RESOLVED" ? Math.sin(time * 20) * 0.5 : 0;

      const TAU = Math.PI * 2;
      const base = 43200;
      const total = base + this.clockTime + chaos;

      this.clockHands.hourHand.rotation.z = -((total / 43200) % 1) * TAU;
      this.clockHands.minuteHand.rotation.z = -((total % 3600) / 3600) * TAU;
      this.clockHands.secondHand.rotation.z = -((total % 60) / 60) * TAU;
    }
  }

  /* ---------- CÓDIGO DEL RELOJ ---------- */
  createClockFaceTexture() {
    const S = 512,
      c0 = S / 2;
    const cv = canvasOf(S, S);
    const c = cv.getContext("2d");
    const g = c.createRadialGradient(c0, c0, 0, c0, c0, c0);
    g.addColorStop(0, "#1c1005");
    g.addColorStop(1, "#000000");
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);
    c.strokeStyle = "rgba(255,180,100,0.3)";
    c.lineWidth = 3;
    c.beginPath();
    c.arc(c0, c0, c0 * 0.94, 0, Math.PI * 2);
    c.stroke();
    c.translate(c0, c0);
    c.lineCap = "round";
    for (let i = 0; i < 60; i++) {
      c.save();
      c.rotate((i / 60) * Math.PI * 2);
      const hour = i % 5 === 0;
      const card = i % 15 === 0;
      c.strokeStyle =
        i === 0 ? "#ff9900" : hour ? "#e8ccaa" : "rgba(230,200,150,0.4)";
      c.lineWidth = card ? 20 : hour ? 13 : 4;
      const r1 = c0 * 0.9,
        r2 = r1 - (card ? 100 : hour ? 70 : 20);
      c.beginPath();
      c.moveTo(0, -r1);
      c.lineTo(0, -r2);
      c.stroke();
      c.restore();
    }
    return texOf(cv);
  }

  createClock(R) {
    const group = new THREE.Group();
    const faceTex = this.createClockFaceTexture();
    const face = new THREE.Mesh(
      new THREE.CircleGeometry(R, 64),
      new THREE.MeshStandardMaterial({
        map: faceTex,
        emissiveMap: faceTex,
        emissive: 0xffffff,
        emissiveIntensity: 0.5,
        roughness: 0.4,
      }),
    );
    const bezel = new THREE.Mesh(
      new THREE.TorusGeometry(R + 0.035, 0.035, 16, 64),
      new THREE.MeshStandardMaterial({
        color: 0x3a2005,
        metalness: 0.8,
        roughness: 0.2,
      }),
    );
    bezel.position.z = 0.01;

    const mat = new THREE.MeshStandardMaterial({ color: 0xe8ccaa });
    const coral = new THREE.MeshStandardMaterial({ color: 0xff9900 });

    const makeHand = (len, w, mat, z) => {
      const s = new THREE.Shape();
      s.moveTo(-w / 2, 0);
      s.lineTo(w / 2, 0);
      s.lineTo(0, len);
      s.closePath();
      const m = new THREE.Mesh(
        new THREE.ExtrudeGeometry(s, { depth: 0.01, bevelEnabled: false }),
        mat,
      );
      m.position.z = z;
      group.add(m);
      return m;
    };

    const hourHand = makeHand(R * 0.55, 0.06, mat, 0.02);
    const minuteHand = makeHand(R * 0.85, 0.04, mat, 0.03);
    const secondHand = makeHand(R * 0.95, 0.015, coral, 0.04);

    group.add(face, bezel);
    return { group, hands: { hourHand, minuteHand, secondHand } };
  }
}
