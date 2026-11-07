import * as THREE from "three";

const rnd = (a, b) => a + Math.random() * (b - a);
const rndInt = (a, b) => Math.floor(rnd(a, b + 1));
const jaggedPoly = (cx, cy, r, n, jitter) => {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd(-0.15, 0.15);
    const rr = r * (1 + rnd(-jitter, jitter));
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * rnd(0.7, 1.2)]);
  }
  return pts;
};
const tracePoly = (ctx, pts) => {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
};

export class CorridorDoor {
  constructor() {
    this.initGeometries();
    this.initMaterials();
  }

  initGeometries() {
    const openingW = 1.2,
      openingH = 2.2,
      frameThickness = 0.11,
      frameDepth = 0.14;
    this.geoFrameSide = new THREE.BoxGeometry(
      frameThickness,
      openingH + frameThickness,
      frameDepth,
    );
    this.geoFrameTop = new THREE.BoxGeometry(
      openingW + frameThickness * 2,
      frameThickness,
      frameDepth,
    );

    this.geoDoor = new THREE.BoxGeometry(openingW, openingH, 0.05);
    this.geoDoor.translate(openingW / 2, 0, 0);

    this.geoRose = new THREE.CylinderGeometry(0.03, 0.03, 0.01, 16);
    this.geoRose.rotateX(Math.PI / 2);
    this.geoHandle = new THREE.CylinderGeometry(0.01, 0.01, 0.1, 12);
    this.geoHandle.rotateX(Math.PI / 2);
    this.geoHandle.rotateY(0.22);
    this.geoKnob = new THREE.SphereGeometry(0.022, 12, 12);
    this.geoPlate = new THREE.BoxGeometry(0.1, 0.1, 0.01);
    this.geoHinge = new THREE.BoxGeometry(0.05, 0.18, 0.02);
  }

  initMaterials() {
    const frameBrokenTex = this.createFrameTexture(true);
    this.frameBroken = new THREE.MeshStandardMaterial({
      map: frameBrokenTex,
      bumpMap: frameBrokenTex,
      bumpScale: 0.8,
      roughness: 0.8,
      metalness: 0.2,
    });

    const frameCleanTex = this.createFrameTexture(false);
    this.frameClean = new THREE.MeshStandardMaterial({
      map: frameCleanTex,
      bumpMap: frameCleanTex,
      bumpScale: 0.1,
      roughness: 0.5,
      metalness: 0.1,
    });

    this.doorBrokenVars = [
      this.makeDoorMat(["#12303a", "#0f2a33", "#091a20"], true, 0x020d11),
      this.makeDoorMat(["#3a1812", "#2a110d", "#1a0a08"], true, 0x110202),
      this.makeDoorMat(["#353a3c", "#25292b", "#151719"], true, 0x0a0b0d),
      this.makeDoorMat(["#183a20", "#112a17", "#0a1a0e"], true, 0x021105),
    ];

    this.doorCleanVars = [
      this.makeDoorMat(["#3b4f59", "#2a3b45", "#1a262e"], false, 0x081114),
      this.makeDoorMat(["#595856", "#454442", "#2e2e2d"], false, 0x111111),
      this.makeDoorMat(["#45594b", "#354539", "#242e26"], false, 0x0a140d),
      this.makeDoorMat(["#7a2828", "#5c1919", "#3d0c0c"], false, 0x1a0505),
    ];

    this.doorAcceptance = this.makeDoorMat(
      ["#634731", "#4a3423", "#332317"],
      false,
      0x140a05,
    );

    this.hwBroken = new THREE.MeshStandardMaterial({
      color: 0x4a3a2e,
      metalness: 0.4,
      roughness: 0.9,
    });
    this.hwClean = new THREE.MeshStandardMaterial({
      color: 0xb59e7a,
      metalness: 0.8,
      roughness: 0.3,
    });
  }

  makeDoorMat(colors, isBroken, emissiveHex) {
    const tex = this.createDoorTextures(colors, isBroken);
    return new THREE.MeshStandardMaterial({
      map: tex.map,
      bumpMap: tex.bump,
      bumpScale: isBroken ? 0.9 : 0.2,
      color: 0xffffff,
      emissive: emissiveHex,
      roughness: isBroken ? 0.75 : 0.4,
      metalness: isBroken ? 0.25 : 0.1,
    });
  }

  createDoorTextures(colors, isBroken) {
    const W = 512,
      H = 938;
    const cv = document.createElement("canvas"),
      bc = document.createElement("canvas");
    cv.width = bc.width = W;
    cv.height = bc.height = H;
    const c = cv.getContext("2d"),
      b = bc.getContext("2d");

    const grad = c.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, colors[0]);
    grad.addColorStop(0.5, colors[1]);
    grad.addColorStop(1, colors[2]);
    c.fillStyle = grad;
    c.fillRect(0, 0, W, H);
    b.fillStyle = "#808080";
    b.fillRect(0, 0, W, H);

    const noiseCount = isBroken ? 14000 : 3000;
    for (let i = 0; i < noiseCount; i++) {
      const x = rnd(0, W),
        y = rnd(0, H),
        o = rnd(0, isBroken ? 0.07 : 0.03);
      const dark = Math.random() > 0.5;
      c.fillStyle = dark ? `rgba(0,0,0,${o})` : `rgba(255,255,255,${o * 0.4})`;
      c.fillRect(x, y, 2, 2);
    }

    const drawPanel = (x, y, w, h) => {
      c.fillStyle = isBroken ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.15)";
      c.fillRect(x, y, w, h);
      b.fillStyle = isBroken ? "#686868" : "#757575";
      b.fillRect(x, y, w, h);
      c.strokeStyle = "rgba(0, 0, 0, 0.65)";
      c.lineWidth = isBroken ? 6 : 3;
      c.beginPath();
      c.moveTo(x, y + h);
      c.lineTo(x, y);
      c.lineTo(x + w, y);
      c.stroke();
      c.strokeStyle = "rgba(255, 255, 255, 0.1)";
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x + w, y);
      c.lineTo(x + w, y + h);
      c.lineTo(x, y + h);
      c.stroke();
    };
    drawPanel(62, 70, 388, 470);
    drawPanel(62, 590, 388, 270);

    if (isBroken) {
      const blotch = (
        x,
        y,
        r,
        rgb,
        alpha,
        bumpGray = null,
        bumpAlpha = 0.25,
      ) => {
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(${rgb},${alpha})`);
        g.addColorStop(0.6, `rgba(${rgb},${alpha * 0.45})`);
        g.addColorStop(1, `rgba(${rgb},0)`);
        c.fillStyle = g;
        c.fillRect(x - r, y - r, r * 2, r * 2);
        if (bumpGray !== null) {
          const gb = b.createRadialGradient(x, y, 0, x, y, r);
          gb.addColorStop(
            0,
            `rgba(${bumpGray},${bumpGray},${bumpGray},${bumpAlpha})`,
          );
          gb.addColorStop(1, `rgba(${bumpGray},${bumpGray},${bumpGray},0)`);
          b.fillStyle = gb;
          b.fillRect(x - r, y - r, r * 2, r * 2);
        }
      };
      const rustTones = ["150,70,25", "120,55,20", "95,42,18"];
      for (let i = 0; i < 70; i++) {
        const y = H * (1 - Math.pow(Math.random(), 2.2));
        const x =
          Math.random() < 0.4
            ? Math.random() < 0.5
              ? rnd(0, 60)
              : rnd(W - 60, W)
            : rnd(0, W);
        blotch(
          x,
          y,
          rnd(14, 70),
          rustTones[Math.floor(Math.random() * rustTones.length)],
          rnd(0.25, 0.6),
          190,
          0.18,
        );
      }
      const drawPeel = (cx, cy, r) => {
        const outer = jaggedPoly(cx, cy, r, rndInt(11, 15), 0.45);
        const inner = outer.map(([x, y]) => [
          cx + (x - cx) * rnd(0.3, 0.65),
          cy + (y - cy) * rnd(0.3, 0.65),
        ]);
        tracePoly(c, outer);
        c.strokeStyle = "rgba(0,0,0,0.45)";
        c.lineWidth = 5;
        c.stroke();
        c.fillStyle = "#6b3a1e";
        tracePoly(c, outer);
        c.fill();
        c.fillStyle = Math.random() > 0.5 ? "#3a2415" : "#58595a";
        tracePoly(c, inner);
        c.fill();
        b.fillStyle = "#4c4c4c";
        tracePoly(b, outer);
        b.fill();
        b.fillStyle = "#353535";
        tracePoly(b, inner);
        b.fill();
      };
      for (let i = 0; i < 16; i++)
        drawPeel(
          rnd(40, W - 40),
          H * (1 - Math.pow(Math.random(), 1.6)),
          rnd(18, 65),
        );
    }

    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const bTex = new THREE.CanvasTexture(bc);
    return { map: tex, bump: bTex };
  }

  createFrameTexture(isBroken) {
    const S = 256,
      cv = document.createElement("canvas");
    cv.width = cv.height = S;
    const c = cv.getContext("2d");
    c.fillStyle = isBroken ? "#05090c" : "#1a1410";
    c.fillRect(0, 0, S, S);

    if (isBroken) {
      for (let i = 0; i < 9; i++) {
        const x = rnd(0, S),
          y = rnd(0, S),
          r = rnd(20, 60);
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(135,62,22,${rnd(0.3, 0.6)})`);
        g.addColorStop(1, "rgba(135,62,22,0)");
        c.fillStyle = g;
        c.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }
    const noiseCount = isBroken ? 1800 : 400;
    for (let i = 0; i < noiseCount; i++) {
      c.fillStyle = isBroken
        ? `rgba(${140 + rndInt(0, 30)},${65 + rndInt(0, 20)},25,${rnd(0.15, 0.55)})`
        : `rgba(0,0,0,0.2)`;
      c.fillRect(rnd(0, S), rnd(0, S), 2, 2);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  getClone(isLeft, currentState = 0) {
    const group = new THREE.Group();

    const varIdxBroken = Math.floor(Math.random() * this.doorBrokenVars.length);
    const varIdxClean = Math.floor(Math.random() * this.doorCleanVars.length);

    const doorMats = [
      this.doorBrokenVars[varIdxBroken],
      this.doorBrokenVars[varIdxBroken],
      this.doorCleanVars[varIdxClean],
      this.doorAcceptance,
    ];

    const frameMats = [
      this.frameBroken,
      this.frameBroken,
      this.frameClean,
      this.frameClean,
    ];
    const hwMats = [this.hwBroken, this.hwBroken, this.hwClean, this.hwClean];

    const openingW = 1.2,
      openingH = 2.2,
      frameThickness = 0.11,
      frameZ = 0.03;

    const frameLeft = new THREE.Mesh(
      this.geoFrameSide,
      frameMats[currentState],
    );
    frameLeft.position.set(
      -(openingW / 2 + frameThickness / 2),
      (openingH + frameThickness) / 2,
      frameZ,
    );
    const frameRight = new THREE.Mesh(
      this.geoFrameSide,
      frameMats[currentState],
    );
    frameRight.position.set(
      openingW / 2 + frameThickness / 2,
      (openingH + frameThickness) / 2,
      frameZ,
    );
    const frameTop = new THREE.Mesh(this.geoFrameTop, frameMats[currentState]);
    frameTop.position.set(0, openingH + frameThickness / 2, frameZ);

    const doorPivot = new THREE.Group();
    doorPivot.position.set(-openingW / 2, 0, 0);

    const door = new THREE.Mesh(this.geoDoor, doorMats[currentState]);
    door.position.set(0, openingH / 2, 0);
    door.userData = {
      id: "corridorDoor",
      prompt: "Abrir puerta (Interactuar)",
      isCorridorDoor: true,
    };
    doorPivot.add(door);

    const hwMeshes = [];
    const addHw = (geo, x, y, z, rotZ = 0) => {
      const m = new THREE.Mesh(geo, hwMats[currentState]);
      m.position.set(x + openingW / 2, y, z);
      if (rotZ) m.rotation.z = rotZ;
      m.userData = {
        id: "corridorDoor",
        prompt: "Abrir puerta (Interactuar)",
        isCorridorDoor: true,
      };
      hwMeshes.push(m);
      doorPivot.add(m);
    };
    addHw(this.geoRose, 0.5, 1.0, 0.03);
    addHw(this.geoHandle, 0.5, 1.0, 0.075);
    addHw(this.geoKnob, 0.522, 0.99, 0.123);
    addHw(this.geoPlate, -0.42, 1.65, 0.03, 0.12);

    [1.85, 1.1, 0.34].forEach((y) => {
      const hinge = new THREE.Mesh(this.geoHinge, hwMats[currentState]);
      hinge.position.set(-0.6, y, 0.04);
      hwMeshes.push(hinge);
      group.add(hinge);
    });

    // PLANO NEGRO (Sticker para tapar la pared)
    const voidPlaneGeo = new THREE.PlaneGeometry(
      openingW - 0.02,
      openingH - 0.02,
    );
    const voidPlaneMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      fog: false,
    });
    const voidPlane = new THREE.Mesh(voidPlaneGeo, voidPlaneMat);
    const voidBoxGeo = new THREE.BoxGeometry(
      openingW - 0.02,
      openingH - 0.02,
      3.5,
    );
    const voidBoxMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      fog: false,
      side: THREE.BackSide,
    });
    const voidBox = new THREE.Mesh(voidBoxGeo, voidBoxMat);

    // Z = -0.005 sitúa el plano en el punto exacto entre la pared (-0.01) y la cara interior de la puerta (-0.025)
    voidPlane.position.set(0, openingH / 2, -0.005);
    voidBox.position.set(0, openingH / 2, -1.75);
    group.add(frameLeft, frameRight, frameTop, doorPivot, voidBox, voidPlane);

    group.userData.isDoorAssembly = true;
    group.userData.setState = (nextState) => {
      frameLeft.material = frameMats[nextState];
      frameRight.material = frameMats[nextState];
      frameTop.material = frameMats[nextState];
      door.material = doorMats[nextState];
      hwMeshes.forEach((m) => (m.material = hwMats[nextState]));
    };

    const wallX = isLeft ? -1.05 : 1.05;
    group.position.set(wallX, 0, -4);
    group.rotation.y = isLeft ? Math.PI / 2 : -Math.PI / 2;

    return group;
  }
}
