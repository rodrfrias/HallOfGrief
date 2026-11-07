import * as THREE from "three";
import { CorridorDoor } from "./CorridorDoor.js";

// --- Helpers de dibujo procedural ---
const rnd = (a, b) => a + Math.random() * (b - a);
const rndInt = (a, b) => Math.floor(rnd(a, b + 1));

// Polígono irregular (para parches de pintura caída)
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

const HOTEL_THEME = {
  wood: "#9b6239",
  woodDark: "#633b27",
  woodLight: "#d8b27d",
  woodFloor: "#c9965f",
  brass: "#c89b5b",
  brassLight: "#f4d49b",
  cream: "#f4e3c2",
  creamLight: "#fff9e9",
  blueGray: "#9eafb2",
  blueGrayLight: "#e5ece8",
  blueGrayDark: "#7d8886",
  carpet: "#52646b",
  carpetLight: "#687b80",
  carpetDark: "#485a61",
  warmLight: 0xffd9a8,
};

const CORRIDOR_STATES = [
  { lightFactor: 1, fogNear: 2, fogFar: 22, debrisVisible: true },
  { lightFactor: 1.15, fogNear: 5, fogFar: 24, debrisVisible: false },
  { lightFactor: 1.3, fogNear: 5, fogFar: 24, debrisVisible: false },
  { lightFactor: 1.45, fogNear: 5, fogFar: 24, debrisVisible: false },
];
export class Corridor {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.doorFactory = new CorridorDoor();
    this.theme = { ...HOTEL_THEME, ...options.theme };
    this.flickerLights = [];
    this.stateMaterialBindings = [];
    this.debrisMeshes = [];
    this.interactables = [];
    this.currentState = 0;
    this.defaultFogDensity = scene.fog ? scene.fog.density : 0.095;
    this.buildCorridor();
  }

  // Textura procedural de pared deteriorada: concreto estucado (#6B7280 del SDD) con
  // manchas de humedad, chorreaduras, pintura descascarada y grietas.
  // Devuelve { map, bump }: el bump es un mapa de relieve aparte para que las grietas
  // y los parches de pintura caída tengan profundidad real bajo las luces.
  createWallTextures() {
    const S = 1024;
    const mk = () => {
      const cv = document.createElement("canvas");
      cv.width = S;
      cv.height = S;
      return cv;
    };
    const cc = mk();
    const bc = mk();
    const c = cc.getContext("2d");
    const b = bc.getContext("2d");

    // --- Base ---
    const baseGrad = c.createLinearGradient(0, 0, 0, S);
    baseGrad.addColorStop(0, "#656b77");
    baseGrad.addColorStop(0.6, "#6b7280");
    baseGrad.addColorStop(1, "#5a606a");
    c.fillStyle = baseGrad;
    c.fillRect(0, 0, S, S);
    b.fillStyle = "#808080";
    b.fillRect(0, 0, S, S);

    // --- Micro-grano de concreto ---
    for (let i = 0; i < 40000; i++) {
      const x = Math.random() * S;
      const y = Math.random() * S;
      const o = Math.random() * 0.1;
      const dark = Math.random() > 0.5;
      c.fillStyle = dark ? `rgba(0,0,0,${o})` : `rgba(255,255,255,${o * 0.5})`;
      c.fillRect(x, y, 2, 2);
      b.fillStyle = dark ? `rgba(0,0,0,${o * 2})` : `rgba(255,255,255,${o})`;
      b.fillRect(x, y, 2, 2);
    }

    // --- Moteado grande (irregularidades del estuco) ---
    for (let i = 0; i < 45; i++) {
      const x = rnd(0, S),
        y = rnd(0, S),
        r = rnd(60, 190);
      const dark = Math.random() > 0.45;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, dark ? "rgba(0,0,0,0.09)" : "rgba(255,255,255,0.05)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // --- Manchas de humedad / moho (más marcadas hacia abajo y arriba) ---
    const stain = (x, y, rx, ry, rgb, alpha) => {
      c.save();
      c.translate(x, y);
      c.scale(1, ry / rx);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0, `rgba(${rgb},${alpha})`);
      g.addColorStop(0.55, `rgba(${rgb},${alpha * 0.55})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      c.fillStyle = g;
      c.fillRect(-rx, -rx, rx * 2, rx * 2);
      c.restore();
    };
    for (let i = 0; i < 16; i++) {
      stain(
        rnd(80, S - 80),
        rnd(60, S - 60),
        rnd(50, 150),
        rnd(40, 160),
        "58,44,28",
        rnd(0.18, 0.4),
      ); // óxido/agua
    }
    for (let i = 0; i < 12; i++) {
      const y =
        Math.random() < 0.65 ? rnd(S * 0.72, S - 30) : rnd(20, S * 0.18);
      stain(
        rnd(80, S - 80),
        y,
        rnd(60, 170),
        rnd(30, 90),
        "22,30,24",
        rnd(0.25, 0.5),
      ); // moho oscuro
    }
    for (let i = 0; i < 6; i++) {
      stain(
        rnd(100, S - 100),
        rnd(100, S - 100),
        rnd(40, 100),
        rnd(40, 100),
        "170,165,150",
        rnd(0.08, 0.16),
      ); // salitre claro
    }

    // --- Chorreaduras verticales ---
    for (let i = 0; i < 28; i++) {
      const x = rnd(40, S - 40);
      const y0 = rnd(0, S * 0.5);
      const len = rnd(120, 460);
      const w = rnd(3, 11);
      const g = c.createLinearGradient(0, y0, 0, y0 + len);
      g.addColorStop(0, "rgba(35,28,20,0)");
      g.addColorStop(0.15, "rgba(35,28,20,0.3)");
      g.addColorStop(1, "rgba(35,28,20,0)");
      c.fillStyle = g;
      c.fillRect(x, y0, w, len);
    }

    // --- Pintura descascarada (puntual, no generalizada) ---
    const drawPeel = (cx, cy, r) => {
      // halo de humedad alrededor del parche (suavizado)
      stain(cx, cy, r * 1.4, r * 1.2, "20,22,24", 0.12);

      const outer = jaggedPoly(cx, cy, r, rndInt(9, 15), 0.45);
      const inner = outer.map(([x, y]) => [
        cx + (x - cx) * rnd(0.3, 0.65),
        cy + (y - cy) * rnd(0.3, 0.65),
      ]);

      // sombra proyectada del borde de pintura
      tracePoly(c, outer);
      c.strokeStyle = "rgba(0,0,0,0.4)";
      c.lineWidth = 6;
      c.stroke();

      // capa de yeso/revoque expuesto (más parecida al color de la pared)
      c.fillStyle = "#7d7a72";
      tracePoly(c, outer);
      c.fill();

      // concreto crudo al fondo (menos oscuro)
      c.fillStyle = "#5a5d63";
      tracePoly(c, inner);
      c.fill();

      // borde de pintura curvada (más claro)
      tracePoly(c, outer);
      c.strokeStyle = "rgba(165,170,182,0.6)";
      c.lineWidth = 2.5;
      c.stroke();

      // relieve: el parche está hundido, el borde levantado
      b.fillStyle = "#505050";
      tracePoly(b, outer);
      b.fill();
      b.fillStyle = "#353535";
      tracePoly(b, inner);
      b.fill();
      tracePoly(b, outer);
      b.strokeStyle = "#d4d4d4";
      b.lineWidth = 3;
      b.stroke();
    };
    for (let i = 0; i < 3; i++)
      drawPeel(rnd(130, S - 130), rnd(130, S - 130), rnd(18, 42));
    // pequeñas escamas sueltas
    for (let i = 0; i < 10; i++) {
      const cx = rnd(40, S - 40),
        cy = rnd(40, S - 40);
      const flake = jaggedPoly(cx, cy, rnd(4, 10), rndInt(5, 8), 0.4);
      c.fillStyle = Math.random() > 0.5 ? "#8b8578" : "#4a4d53";
      tracePoly(c, flake);
      c.fill();
      b.fillStyle = "#555";
      tracePoly(b, flake);
      b.fill();
    }

    // --- Grietas (caminata aleatoria con ramificaciones) ---
    const drawCrack = (x, y, angle, len, width, depth) => {
      let px = x,
        py = y,
        a = angle,
        w = width,
        travelled = 0;
      while (travelled < len) {
        const step = rnd(10, 26);
        a += rnd(-0.6, 0.6);
        const nx = px + Math.cos(a) * step;
        const ny = py + Math.sin(a) * step;
        if (nx < 6 || nx > S - 6 || ny < 6 || ny > S - 6) break;
        w = Math.max(0.7, w * 0.965);

        // reflejo claro del labio de la grieta
        c.strokeStyle = "rgba(255,255,255,0.1)";
        c.lineWidth = w + 2.5;
        c.beginPath();
        c.moveTo(px + 1, py + 1);
        c.lineTo(nx + 1, ny + 1);
        c.stroke();
        // fisura oscura
        c.strokeStyle = "rgba(6,6,8,0.92)";
        c.lineWidth = w;
        c.beginPath();
        c.moveTo(px, py);
        c.lineTo(nx, ny);
        c.stroke();
        // relieve hundido
        b.strokeStyle = "#0c0c0c";
        b.lineWidth = w + 1.2;
        b.beginPath();
        b.moveTo(px, py);
        b.lineTo(nx, ny);
        b.stroke();

        if (depth < 2 && Math.random() < 0.13) {
          drawCrack(nx, ny, a + rnd(-1.1, 1.1), len * 0.45, w * 0.7, depth + 1);
        }
        px = nx;
        py = ny;
        travelled += step;
      }
    };
    for (let i = 0; i < 9; i++) {
      const vertical = Math.random() < 0.7;
      drawCrack(
        rnd(80, S - 80),
        rnd(40, S * 0.6),
        vertical ? Math.PI / 2 + rnd(-0.5, 0.5) : rnd(-0.4, 0.4),
        rnd(220, 560),
        rnd(2.2, 4),
        0,
      );
    }

    // --- Rozaduras en la zona baja (roces de carros / zócalo sucio) ---
    for (let i = 0; i < 24; i++) {
      const x = rnd(0, S),
        y = rnd(S * 0.75, S);
      c.fillStyle = `rgba(15,15,18,${rnd(0.06, 0.16)})`;
      c.fillRect(x, y, rnd(40, 160), rnd(2, 8));
    }

    // --- Suciedad acumulada abajo y arriba ---
    const bottomGrime = c.createLinearGradient(0, S * 0.7, 0, S);
    bottomGrime.addColorStop(0, "rgba(0,0,0,0)");
    bottomGrime.addColorStop(1, "rgba(0,0,0,0.35)");
    c.fillStyle = bottomGrime;
    c.fillRect(0, S * 0.7, S, S * 0.3);
    const topGrime = c.createLinearGradient(0, 0, 0, S * 0.12);
    topGrime.addColorStop(0, "rgba(0,0,0,0.25)");
    topGrime.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = topGrime;
    c.fillRect(0, 0, S, S * 0.12);

    const wrap = (cv, srgb) => {
      const t = new THREE.CanvasTexture(cv);
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      return t;
    };
    return { map: wrap(cc, true), bump: wrap(bc, false) };
  }

  createCleanWallTextures(baseColor, highlightColor) {
    const canvas = document.createElement("canvas");
    const bumpCanvas = document.createElement("canvas");
    canvas.width = canvas.height = bumpCanvas.width = bumpCanvas.height = 512;
    const ctx = canvas.getContext("2d");
    const bumpCtx = bumpCanvas.getContext("2d");

    const gradient = ctx.createLinearGradient(0, 0, 0, 512);
    gradient.addColorStop(0, highlightColor);
    gradient.addColorStop(1, baseColor);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 512);
    bumpCtx.fillStyle = "#808080";
    bumpCtx.fillRect(0, 0, 512, 512);

    const wrap = (source, srgb) => {
      const texture = new THREE.CanvasTexture(source);
      if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      return texture;
    };
    return { map: wrap(canvas, true), bump: wrap(bumpCanvas, false) };
  }

  createHotelWallTextures({
    baseColor,
    stripeColor,
    trimColor,
    panelColor,
    includePeeling = false,
    peelingScale = 1,
  }) {
    const S = 1024;
    const canvas = document.createElement("canvas");
    const bumpCanvas = document.createElement("canvas");
    canvas.width = canvas.height = bumpCanvas.width = bumpCanvas.height = S;
    const ctx = canvas.getContext("2d");
    const bumpCtx = bumpCanvas.getContext("2d");

    const gradient = ctx.createLinearGradient(0, 0, 0, S);
    gradient.addColorStop(0, baseColor);
    gradient.addColorStop(0.72, baseColor);
    gradient.addColorStop(0.73, trimColor);
    gradient.addColorStop(1, panelColor);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, S, S);

    // Papel tapiz sutil y zócalo de paneles, sin manchas ni grietas.
    for (let x = 0; x < S; x += 36) {
      ctx.fillStyle = stripeColor;
      ctx.globalAlpha = 0.16;
      ctx.fillRect(x, 0, 5, S * 0.72);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = trimColor;
    ctx.fillRect(0, S * 0.69, S, 10);
    ctx.fillStyle = `${this.theme.woodDark}33`;
    ctx.fillRect(0, S * 0.7, S, 4);

    for (let x = 28; x < S; x += 170) {
      ctx.strokeStyle = `${this.theme.woodDark}4d`;
      ctx.lineWidth = 5;
      ctx.strokeRect(x, S * 0.78, 130, S * 0.17);
      ctx.strokeStyle = `${this.theme.creamLight}52`;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 7, S * 0.78 + 7, 116, S * 0.17 - 14);
    }

    bumpCtx.fillStyle = "#808080";
    bumpCtx.fillRect(0, 0, S, S);
    bumpCtx.fillStyle = "#a0a0a0";
    bumpCtx.fillRect(0, S * 0.69, S, 10);
    bumpCtx.fillStyle = "#686868";
    bumpCtx.fillRect(0, S * 0.7, S, 4);
    for (let x = 28; x < S; x += 170) {
      bumpCtx.strokeStyle = "#5c5c5c";
      bumpCtx.lineWidth = 5;
      bumpCtx.strokeRect(x, S * 0.78, 130, S * 0.17);
    }

    if (includePeeling) {
      const drawPeeling = (cx, cy, rx, ry, rotation, pointCount) => {
        const outer = [];
        const inner = [];
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);

        for (let i = 0; i < pointCount; i++) {
          const angle = (i / pointCount) * Math.PI * 2 + rnd(-0.2, 0.2);
          const radius = 1 + rnd(-0.38, 0.28);
          const localX = Math.cos(angle) * rx * radius;
          const localY = Math.sin(angle) * ry * radius;
          const x = cx + localX * cos - localY * sin;
          const y = cy + localX * sin + localY * cos;
          outer.push([x, y]);

          const inset = rnd(0.42, 0.7);
          inner.push([
            cx + (x - cx) * inset + rnd(-8, 8),
            cy + (y - cy) * inset + rnd(-8, 8),
          ]);
        }

        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.translate(7, 9);
        ctx.fillStyle = "#3e4549";
        tracePoly(ctx, outer);
        ctx.fill();
        ctx.restore();

        ctx.save();
        tracePoly(ctx, outer);
        ctx.clip();
        bumpCtx.save();
        tracePoly(bumpCtx, outer);
        bumpCtx.clip();
        const concrete = ctx.createLinearGradient(0, cy - ry, 0, cy + ry);
        concrete.addColorStop(0, "#9a9187");
        concrete.addColorStop(0.55, "#817970");
        concrete.addColorStop(1, "#625e5a");
        ctx.fillStyle = concrete;
        ctx.fillRect(cx - rx - 20, cy - ry - 20, rx * 2 + 40, ry * 2 + 40);

        for (let i = 0; i < 260; i++) {
          ctx.fillStyle =
            Math.random() > 0.5
              ? "rgba(255, 247, 232, 0.11)"
              : "rgba(35, 29, 25, 0.13)";
          ctx.fillRect(
            cx + rnd(-rx, rx),
            cy + rnd(-ry, ry),
            rnd(2, 8),
            rnd(2, 8),
          );
        }
        const drawExposedCrack = (x, y, angle, length, width, depth) => {
          let px = x;
          let py = y;
          let currentAngle = angle;
          let currentWidth = width;
          let travelled = 0;
          while (travelled < length) {
            const step = rnd(9, 20);
            currentAngle += rnd(-0.55, 0.55);
            const nx = px + Math.cos(currentAngle) * step;
            const ny = py + Math.sin(currentAngle) * step;
            currentWidth = Math.max(0.7, currentWidth * 0.95);

            ctx.strokeStyle = "rgba(255, 247, 232, 0.16)";
            ctx.lineWidth = currentWidth + 2;
            ctx.beginPath();
            ctx.moveTo(px + 1, py + 1);
            ctx.lineTo(nx + 1, ny + 1);
            ctx.stroke();
            ctx.strokeStyle = "rgba(20, 17, 15, 0.78)";
            ctx.lineWidth = currentWidth;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(nx, ny);
            ctx.stroke();
            bumpCtx.strokeStyle = "#171717";
            bumpCtx.lineWidth = currentWidth + 1;
            bumpCtx.beginPath();
            bumpCtx.moveTo(px, py);
            bumpCtx.lineTo(nx, ny);
            bumpCtx.stroke();

            if (depth < 2 && Math.random() < 0.16) {
              drawExposedCrack(
                nx,
                ny,
                currentAngle + rnd(-1.1, 1.1),
                length * 0.38,
                currentWidth * 0.7,
                depth + 1,
              );
            }
            px = nx;
            py = ny;
            travelled += step;
          }
        };
        for (let crack = 0; crack < 3; crack++) {
          drawExposedCrack(
            cx + rnd(-rx * 0.5, rx * 0.35),
            cy + rnd(-ry * 0.55, ry * 0.4),
            rnd(-Math.PI, Math.PI),
            rnd(Math.min(rx, ry) * 0.7, Math.max(rx, ry) * 1.1),
            rnd(2.2, 3.8),
            0,
          );
        }
        ctx.restore();
        bumpCtx.restore();

        ctx.strokeStyle = "rgba(72, 48, 34, 0.68)";
        ctx.lineWidth = 8;
        tracePoly(ctx, outer);
        ctx.stroke();
        ctx.strokeStyle = `${stripeColor}b3`;
        ctx.lineWidth = 4;
        tracePoly(ctx, outer);
        ctx.stroke();

        bumpCtx.fillStyle = "#4d4d4d";
        tracePoly(bumpCtx, outer);
        bumpCtx.fill();
        bumpCtx.fillStyle = "#858585";
        tracePoly(bumpCtx, inner);
        bumpCtx.fill();
        bumpCtx.strokeStyle = "#d0d0d0";
        bumpCtx.lineWidth = 3;
        tracePoly(bumpCtx, outer);
        bumpCtx.stroke();

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(outer[1][0], outer[1][1]);
        ctx.lineTo(outer[2][0], outer[2][1]);
        ctx.lineTo(inner[2][0], inner[2][1]);
        ctx.lineTo(inner[1][0], inner[1][1]);
        ctx.closePath();
        ctx.fillStyle = `${baseColor}cc`;
        ctx.fill();
        ctx.restore();
      };

      drawPeeling(220, 245, 145 * peelingScale, 54 * peelingScale, -0.22, 19);
      drawPeeling(735, 430, 72 * peelingScale, 132 * peelingScale, 0.34, 17);
      drawPeeling(465, 610, 118 * peelingScale, 44 * peelingScale, 0.12, 18);
    }

    const wrap = (source, srgb) => {
      const texture = new THREE.CanvasTexture(source);
      if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      return texture;
    };
    return { map: wrap(canvas, true), bump: wrap(bumpCanvas, false) };
  }

  createCarpetFloorTexture(includeWear = false) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = this.theme.carpet;
    ctx.fillRect(0, 0, 512, 512);

    for (let y = 0; y < 512; y += 32) {
      ctx.fillStyle =
        y % 64 === 0 ? this.theme.carpetLight : this.theme.carpetDark;
      ctx.fillRect(0, y, 512, 16);
    }
    for (let i = 0; i < 1800; i++) {
      ctx.fillStyle =
        Math.random() > 0.5
          ? "rgba(220, 226, 218, 0.12)"
          : "rgba(15, 25, 28, 0.12)";
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 5);
    }
    ctx.strokeStyle = `${this.theme.brass}8c`;
    ctx.lineWidth = 5;
    ctx.strokeRect(8, 8, 496, 496);
    if (includeWear) {
      const drawWear = (cx, cy, rx, ry, rotation) => {
        const points = [];
        const count = 13;
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2 + rnd(-0.25, 0.25);
          const radius = 1 + rnd(-0.28, 0.2);
          const x = Math.cos(angle) * rx * radius;
          const y = Math.sin(angle) * ry * radius;
          points.push([
            cx + x * Math.cos(rotation) - y * Math.sin(rotation),
            cy + x * Math.sin(rotation) + y * Math.cos(rotation),
          ]);
        }
        ctx.fillStyle = "rgba(27, 38, 41, 0.34)";
        tracePoly(ctx, points);
        ctx.fill();
        ctx.strokeStyle = "rgba(194, 164, 112, 0.42)";
        ctx.lineWidth = 3;
        tracePoly(ctx, points);
        ctx.stroke();
        const drawCrack = (x, y, angle, length, depth) => {
          let px = x;
          let py = y;
          let currentAngle = angle;
          let travelled = 0;
          while (travelled < length) {
            const step = rnd(8, 18);
            currentAngle += rnd(-0.5, 0.5);
            const nx = px + Math.cos(currentAngle) * step;
            const ny = py + Math.sin(currentAngle) * step;
            ctx.strokeStyle = "rgba(18, 27, 30, 0.7)";
            ctx.lineWidth = Math.max(1, 2.8 - travelled / length);
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(nx, ny);
            ctx.stroke();
            if (depth < 2 && Math.random() < 0.16) {
              drawCrack(
                nx,
                ny,
                currentAngle + rnd(-1.1, 1.1),
                length * 0.4,
                depth + 1,
              );
            }
            px = nx;
            py = ny;
            travelled += step;
          }
        };
        ctx.save();
        tracePoly(ctx, points);
        ctx.clip();
        drawCrack(
          cx - rx * 0.35,
          cy,
          rnd(-Math.PI, Math.PI),
          Math.max(rx, ry) * 1.2,
          0,
        );
        drawCrack(
          cx + rx * 0.1,
          cy + ry * 0.15,
          rnd(-Math.PI, Math.PI),
          Math.max(rx, ry) * 0.7,
          0,
        );
        ctx.restore();
      };
      drawWear(105, 150, 70, 28, -0.3);
      drawWear(390, 345, 46, 82, 0.4);
      drawWear(270, 450, 82, 24, 0.12);
    }
    return this.wrapTexture(canvas, true, 1, 8);
  }

  createWornCeilingTexture(wear = 1) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#bfc5c7";
    ctx.fillRect(0, 0, 512, 512);

    for (let i = 0; i < 900; i++) {
      ctx.fillStyle =
        Math.random() > 0.5
          ? `rgba(255,255,255,${0.12 * wear})`
          : `rgba(58,62,61,${0.12 * wear})`;
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
    }

    const drawPatch = (cx, cy, rx, ry, rotation) => {
      const points = [];
      for (let i = 0; i < 14; i++) {
        const angle = (i / 14) * Math.PI * 2 + rnd(-0.3, 0.3);
        const radius = 1 + rnd(-0.3, 0.22);
        const x = Math.cos(angle) * rx * radius;
        const y = Math.sin(angle) * ry * radius;
        points.push([
          cx + x * Math.cos(rotation) - y * Math.sin(rotation),
          cy + x * Math.sin(rotation) + y * Math.cos(rotation),
        ]);
      }
      ctx.fillStyle = `rgba(83, 78, 70, ${0.38 * wear})`;
      tracePoly(ctx, points);
      ctx.fill();
      ctx.strokeStyle = `rgba(238, 231, 211, ${0.55 * wear})`;
      ctx.lineWidth = 4;
      tracePoly(ctx, points);
      ctx.stroke();
      const drawCrack = (x, y, angle, length, depth) => {
        let px = x;
        let py = y;
        let currentAngle = angle;
        let travelled = 0;
        while (travelled < length) {
          const step = rnd(9, 20);
          currentAngle += rnd(-0.55, 0.55);
          const nx = px + Math.cos(currentAngle) * step;
          const ny = py + Math.sin(currentAngle) * step;
          ctx.strokeStyle = "rgba(53, 49, 44, 0.68)";
          ctx.lineWidth = Math.max(1, 2.8 - travelled / length);
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(nx, ny);
          ctx.stroke();
          if (depth < 2 && Math.random() < 0.16) {
            drawCrack(
              nx,
              ny,
              currentAngle + rnd(-1.1, 1.1),
              length * 0.4,
              depth + 1,
            );
          }
          px = nx;
          py = ny;
          travelled += step;
        }
      };
      ctx.save();
      tracePoly(ctx, points);
      ctx.clip();
      drawCrack(
        cx - rx * 0.35,
        cy,
        rnd(-Math.PI, Math.PI),
        Math.max(rx, ry) * 1.1,
        0,
      );
      drawCrack(
        cx + rx * 0.1,
        cy + ry * 0.1,
        rnd(-Math.PI, Math.PI),
        Math.max(rx, ry) * 0.65,
        0,
      );
      ctx.restore();
    };
    drawPatch(95, 125, 68 * wear, 28 * wear, -0.25);
    drawPatch(365, 270, 44 * wear, 80 * wear, 0.3);
    drawPatch(250, 440, 88 * wear, 24 * wear, 0.08);

    ctx.strokeStyle = `rgba(53, 49, 44, ${0.5 * wear})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(132, 112);
    ctx.lineTo(156, 134);
    ctx.lineTo(143, 162);
    ctx.lineTo(169, 188);
    ctx.moveTo(370, 245);
    ctx.lineTo(346, 270);
    ctx.lineTo(360, 296);
    ctx.stroke();
    return this.wrapTexture(canvas, true, 1, 3);
  }

  createParquetFloorTexture(includeWear = false) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext("2d");
    const plankWidth = 64;

    for (let row = 0; row < 8; row++) {
      const y = row * 64;
      for (let col = -1; col < 9; col++) {
        const x = col * plankWidth + (row % 2) * 32;
        ctx.fillStyle =
          (row + col) % 3 === 0
            ? this.theme.woodFloor
            : (row + col) % 2
              ? this.theme.cream
              : this.theme.woodLight;
        ctx.fillRect(x, y, plankWidth - 3, 61);
        ctx.strokeStyle = `${this.theme.woodDark}55`;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, plankWidth - 3, 61);
        ctx.strokeStyle = `${this.theme.brassLight}38`;
        ctx.lineWidth = 1;
        for (let grain = 12; grain < 58; grain += 15) {
          ctx.beginPath();
          ctx.moveTo(x + 8, y + grain);
          ctx.lineTo(x + plankWidth - 12, y + grain + 2);
          ctx.stroke();
        }
      }
    }
    if (includeWear) {
      ctx.fillStyle = "rgba(86, 54, 35, 0.16)";
      ctx.fillRect(82, 126, 62, 18);
      ctx.fillRect(334, 337, 38, 24);
      ctx.strokeStyle = "rgba(86, 54, 35, 0.38)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(98, 134);
      ctx.lineTo(116, 145);
      ctx.lineTo(109, 158);
      ctx.moveTo(340, 347);
      ctx.lineTo(357, 360);
      ctx.stroke();
    }
    return this.wrapTexture(canvas, true, 1, 6);
  }

  wrapTexture(canvas, srgb, repeatX, repeatY) {
    const texture = new THREE.CanvasTexture(canvas);
    if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    return texture;
  }

  // Genera textura procedural de PISO AJEDREZADO (Checkerboard) con textura de piedra/terrazo
  createCheckerboardFloorTexture(
    lightColor = "#b0ab9f",
    darkColor = "#141619",
    noiseAlpha = 0.12,
    borderColor = "rgba(0, 0, 0, 0.4)",
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");

    const numCols = 4; // 4 columnas a lo ancho del pasillo
    const numRows = 4;
    const tileSize = 512 / numCols;

    for (let row = 0; row < numRows; row++) {
      for (let col = 0; col < numCols; col++) {
        const isWhite = (row + col) % 2 === 0;

        // Color base: Blanco/Gris cálido claro vs Gris muy oscuro / Negro
        ctx.fillStyle = isWhite ? lightColor : darkColor;
        ctx.fillRect(col * tileSize, row * tileSize, tileSize, tileSize);

        // Ruido de textura / piedra porosa sobre cada baldosa
        for (let i = 0; i < 600; i++) {
          const rx = col * tileSize + Math.random() * tileSize;
          const ry = row * tileSize + Math.random() * tileSize;
          const noiseColor = isWhite
            ? `rgba(0,0,0,${noiseAlpha})`
            : `rgba(255,255,255,${noiseAlpha * 0.66})`;
          ctx.fillStyle = noiseColor;
          ctx.fillRect(rx, ry, 2, 2);
        }

        // Borde sutil de separación entre baldosas
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(col * tileSize, row * tileSize, tileSize, tileSize);
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 8); // Repetición a lo largo del pasillo
    return texture;
  }

  buildCorridor() {
    const width = 2.2;
    const height = 2.8;
    const length = 8.0;

    const wallThickness = 0.08;

    // Tres sets visuales: deteriorado, limpio y limpio con tonos cálidos.
    const wallTextures = [
      this.createWallTextures(),
      this.createHotelWallTextures({
        baseColor: this.theme.blueGray,
        stripeColor: this.theme.blueGrayLight,
        trimColor: "#c4b39b",
        panelColor: this.theme.blueGrayDark,
        includePeeling: true,
      }),
      this.createHotelWallTextures({
        baseColor: this.theme.blueGray,
        stripeColor: this.theme.blueGrayLight,
        trimColor: "#c4b39b",
        panelColor: this.theme.blueGrayDark,
        includePeeling: true,
        peelingScale: 0.42,
      }),
      this.createHotelWallTextures({
        baseColor: this.theme.cream,
        stripeColor: this.theme.creamLight,
        trimColor: this.theme.creamLight,
        panelColor: this.theme.woodLight,
      }),
    ];
    const TILE_W = 2.6; // metros de pared que cubre una repetición de la textura (en horizontal)
    const TILE_H = 2.8; // alto de pared = una repetición vertical (las manchas y chorreaduras cubren todo el alto)

    // Cada tramo usa copias de la textura con repeat/offset según su posición real en la pared,
    // así la textura continúa sin cortes entre los tramos que rodean la puerta.
    const makeWallMaterial = (
      wallTex,
      segLength,
      segHeight,
      zStart = 0,
      y0 = 0,
      flipU = true,
      stateIndex = 0,
    ) => {
      const setup = (base) => {
        const t = base.clone();
        t.needsUpdate = true;
        t.repeat.set(
          Math.max(segLength / TILE_W, 0.05),
          Math.max(segHeight / TILE_H, 0.05),
        );
        t.offset.set(flipU ? -zStart / TILE_W : zStart / TILE_W, y0 / TILE_H);
        return t;
      };
      return new THREE.MeshStandardMaterial({
        map: setup(wallTex.map),
        bumpMap: setup(wallTex.bump),
        bumpScale: stateIndex === 0 ? 0.03 : 0.008,
        color: 0xffffff, // el #6B7280 (SDD) ya está en la textura
        roughness: stateIndex >= 2 ? 0.78 : 0.92,
        metalness: stateIndex >= 2 ? 0.05 : 0.03,
      });
    };

    const addLeftWallSegment = (z0, z1, y0, y1) => {
      const segLength = Math.abs(z1 - z0);
      const segHeight = y1 - y0;
      const materials = wallTextures.map((textureSet, stateIndex) =>
        makeWallMaterial(
          textureSet,
          segLength,
          segHeight,
          Math.max(z0, z1),
          y0,
          true,
          stateIndex,
        ),
      );
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(wallThickness, segHeight, segLength),
        materials[0],
      );
      mesh.position.set(-width / 2, y0 + segHeight / 2, (z0 + z1) / 2);
      segment.add(mesh);
      this.stateMaterialBindings.push({ mesh, materials });
      return mesh;
    };

    const floorTextures = [
      this.createCheckerboardFloorTexture(),
      this.createCarpetFloorTexture(true),
      this.createParquetFloorTexture(true),
      this.createParquetFloorTexture(),
    ];
    const floorMaterials = floorTextures.map(
      (texture, stateIndex) =>
        new THREE.MeshStandardMaterial({
          map: texture,
          bumpMap: texture,
          bumpScale: stateIndex === 0 ? 0.015 : 0.004,
          roughness: stateIndex >= 2 ? 0.58 : 0.72,
          metalness: stateIndex >= 2 ? 0.12 : 0.08,
        }),
    );

    const ceilingWornTexture = this.createWornCeilingTexture();
    const ceilingTransitionTexture = this.createWornCeilingTexture(0.35);
    const ceilingMaterials = [
      new THREE.MeshStandardMaterial({ color: 0x0d0f12, roughness: 0.95 }),
      new THREE.MeshStandardMaterial({
        map: ceilingWornTexture,
        bumpMap: ceilingWornTexture,
        bumpScale: 0.012,
        roughness: 0.88,
      }),
      new THREE.MeshStandardMaterial({
        map: ceilingTransitionTexture,
        bumpMap: ceilingTransitionTexture,
        bumpScale: 0.006,
        roughness: 0.82,
      }),
      new THREE.MeshStandardMaterial({ color: 0xfff1d6, roughness: 0.72 }),
    ];

    const segment = new THREE.Group();
    segment.frustumCulled = false;
    const prototypeBindingStart = this.stateMaterialBindings.length;

    // Paredes del segmento
    addLeftWallSegment(0, -length, 0, height);

    // Pared Derecha (la cara visible es la -X; el offset de V se mantiene en 0)
    const rightWallMaterials = wallTextures.map((textureSet, stateIndex) =>
      makeWallMaterial(textureSet, length, height, 0, 0, false, stateIndex),
    );
    const rightWall = new THREE.Mesh(
      new THREE.BoxGeometry(wallThickness, height, length),
      rightWallMaterials[0],
    );
    rightWall.position.set(width / 2, height / 2, -length / 2);
    segment.add(rightWall);
    this.stateMaterialBindings.push({
      mesh: rightWall,
      materials: rightWallMaterials,
    });

    // Piso Ajedrezado
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(width, length),
      floorMaterials[0],
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -length / 2);
    segment.add(floor);
    this.stateMaterialBindings.push({ mesh: floor, materials: floorMaterials });

    // Techo
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(width, length),
      ceilingMaterials[0],
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, height, -length / 2);
    segment.add(ceiling);
    this.stateMaterialBindings.push({
      mesh: ceiling,
      materials: ceilingMaterials,
    });

    // Escombros: pequeños trozos de revoque caído al pie de las paredes
    const chipMat = new THREE.MeshStandardMaterial({
      color: 0x8b8578,
      roughness: 0.95,
    });
    const chipDarkMat = new THREE.MeshStandardMaterial({
      color: 0x4a4d53,
      roughness: 0.95,
    });
    for (let i = 0; i < 40; i++) {
      const s = rnd(0.015, 0.06);
      const chip = new THREE.Mesh(
        new THREE.BoxGeometry(s * rnd(0.8, 2), s * 0.35, s * rnd(0.8, 1.8)),
        Math.random() > 0.35 ? chipMat : chipDarkMat,
      );
      chip.userData.isCorridorDebris = true;
      const side = Math.random() > 0.5 ? 1 : -1;
      chip.position.set(
        side * (width / 2 - rnd(0.04, 0.35)),
        s * 0.17,
        -rnd(0.5, length - 0.5),
      );
      chip.rotation.y = rnd(0, Math.PI);
      segment.add(chip);
      this.debrisMeshes.push(chip);
    }

    // Conducto metálico central en el techo
    const conduitGeo = new THREE.CylinderGeometry(0.025, 0.025, length, 16);
    const conduitMat = new THREE.MeshStandardMaterial({
      color: 0x2a2f35,
      roughness: 0.3,
      metalness: 0.8,
    });
    const conduit = new THREE.Mesh(conduitGeo, conduitMat);
    conduit.rotation.x = Math.PI / 2;
    conduit.position.set(0, height - 0.04, -length / 2);
    segment.add(conduit);

    // Luminarias fluorescentes suspendidas
    for (let z = -2.5; z >= -length; z -= 3.5) {
      // Luz puntual difusa ambiente
      const pointLight = new THREE.PointLight(0xe2e8f0, 0.35, 4.5);
      pointLight.position.set(0, height - 0.2, z);
      segment.add(pointLight);

      // SpotLight focalizado cálido/neutro que proyecta sobre las baldosas
      const spotLight = new THREE.SpotLight(0xfff7ed, 0.85);
      spotLight.position.set(0, height - 0.15, z);
      spotLight.target.position.set(0, 0, z);
      spotLight.angle = Math.PI / 3.8; // Haz ajustado para marcar el parche sobre el ajedrez
      spotLight.penumbra = 0.6;
      spotLight.distance = 4.2;
      segment.add(spotLight);
      segment.add(spotLight.target);

      // Soporte del tubo fluorescente suspendido
      const tubeHolderGeo = new THREE.BoxGeometry(0.08, 0.06, 1.1);
      const tubeHolderMat = new THREE.MeshStandardMaterial({
        color: 0x333942,
        metalness: 0.5,
      });
      const tubeHolder = new THREE.Mesh(tubeHolderGeo, tubeHolderMat);
      tubeHolder.position.set(0, height - 0.1, z);
      segment.add(tubeHolder);

      // Cilindro fluorescente emisor
      const tubeGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.95, 16);
      const tubeMat = new THREE.MeshBasicMaterial({ color: 0xfffdfa });
      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      tubeMesh.rotation.x = Math.PI / 2;
      tubeMesh.position.set(0, height - 0.14, z);
      segment.add(tubeMesh);

      this.flickerLights.push({
        pointLight,
        spotLight,
        baseIntensityPoint: 0.35,
        baseIntensitySpot: 0.85,
        tubeMesh,
        softFlickerUntil: 0,
        nextSoftFlickerAt: 8 + Math.random() * 8,
      });
    }

    const prototypeBindings = this.stateMaterialBindings.slice(
      prototypeBindingStart,
    );
    const registerClone = (clone) => {
      const cloneMeshes = [];
      clone.traverse((object) => {
        if (object.isMesh) cloneMeshes.push(object);
      });
      prototypeBindings.forEach((binding, index) => {
        const cloneMesh = cloneMeshes[index];
        if (cloneMesh) {
          this.stateMaterialBindings.push({
            mesh: cloneMesh,
            materials: binding.materials,
          });
        }
      });

      const cloneLights = [];
      clone.traverse((object) => {
        if (object.isPointLight) cloneLights.push({ pointLight: object });
      });
      const cloneSpots = [];
      clone.traverse((object) => {
        if (object.isSpotLight) cloneSpots.push({ spotLight: object });
      });
      const cloneTubes = [];
      clone.traverse((object) => {
        if (
          object.isMesh &&
          object.material &&
          object.material.isMeshBasicMaterial
        ) {
          cloneTubes.push(object);
        }
      });
      cloneLights.forEach(({ pointLight }, index) => {
        const spotLight = cloneSpots[index] && cloneSpots[index].spotLight;
        const tubeMesh = cloneTubes[index];
        if (!spotLight || !tubeMesh) return;
        this.flickerLights.push({
          pointLight,
          spotLight,
          baseIntensityPoint: 0.35,
          baseIntensitySpot: 0.85,
          tubeMesh,
          softFlickerUntil: 0,
          nextSoftFlickerAt: 8 + Math.random() * 8,
        });
      });

      clone.traverse((object) => {
        if (object.isMesh && object.userData.isCorridorDebris) {
          this.debrisMeshes.push(object);
        }
      });
    };

    //     this.segments = [segment];
    //     segment.position.z = 0;
    //     this.scene.add(segment);
    //    for (let i = 1; i < 7; i++) {
    //         const clone = segment.clone(true);
    //         clone.frustumCulled = false;
    //         clone.position.z = -length * i;
    //         this.segments.push(clone);
    //         this.scene.add(clone);
    //         registerClone(clone);
    //     }

    this.segments = [];
    const halfCount = 3; // 3 hacia atrás, el centro (0), y 3 hacia adelante = 7 segmentos

    for (let i = -halfCount; i <= halfCount; i++) {
      let currentSegment;

      if (i === 0) {
        currentSegment = segment; // Usamos el original para el centro
      } else {
        currentSegment = segment.clone(true);
        registerClone(currentSegment);
      }

      currentSegment.frustumCulled = false;
      currentSegment.position.z = -length * i;

      if (i !== 0) this.addRandomDoor(currentSegment);

      this.segments.push(currentSegment);
      this.scene.add(currentSegment);
    }
    this.segmentLength = length;
  }

  setCorridorState(stateIndex, scene = this.scene) {
    const requestedState = Number.isFinite(stateIndex)
      ? Math.trunc(stateIndex)
      : 0;
    const nextState = Math.max(0, Math.min(3, requestedState));
    this.currentState = nextState;

    if (this.segments) {
      this.segments.forEach((segment) => {
        segment.children.forEach((child) => {
          if (
            child.userData &&
            child.userData.isDoorAssembly &&
            child.userData.setState
          ) {
            child.userData.setState(nextState);
          }
        });
      });
    }

    this.stateMaterialBindings.forEach(({ mesh, materials }) => {
      mesh.material = materials[nextState];
    });
    this.debrisMeshes.forEach((mesh) => {
      mesh.visible = CORRIDOR_STATES[nextState].debrisVisible;
    });

    if (nextState > 0) {
      const stateConfig = CORRIDOR_STATES[nextState];
      const intensityFactor = stateConfig.lightFactor;
      const lightColor = nextState >= 2 ? this.theme.warmLight : 0xffd6a3;
      this.flickerLights.forEach((item) => {
        item.pointLight.color.set(lightColor);
        item.spotLight.color.set(lightColor);
        item.pointLight.intensity = item.baseIntensityPoint * intensityFactor;
        item.spotLight.intensity = item.baseIntensitySpot * intensityFactor;
        item.tubeMesh.material.color.set(lightColor);
      });
      // if (scene.fog) {
      //     scene.fog.density = stateConfig.fogDensity;
      //     scene.fog.color.setHex(nextState === 1 ? 0x9eafb2 : 0xf0d7b0);
      // }
      // scene.background.setHex(nextState === 1 ? 0x9eafb2 : 0xf0d7b0);
      if (scene.fog) {
        scene.fog.near = stateConfig.fogNear;
        scene.fog.far = stateConfig.fogFar;
        const fogColor = nextState === 1 ? 0x9eafb2 : 0xf0d7b0;
        scene.fog.color.setHex(fogColor);
      }
      scene.background.setHex(nextState === 1 ? 0x9eafb2 : 0xf0d7b0);
    } else {
      this.flickerLights.forEach((item) => {
        item.pointLight.color.set(0xe2e8f0);
        item.spotLight.color.set(0xfff7ed);
        item.pointLight.intensity = item.baseIntensityPoint;
        item.spotLight.intensity = item.baseIntensitySpot;
        item.tubeMesh.material.color.set(0xfffdfa);
      });
      // if (scene.fog) {
      //     scene.fog.density = this.defaultFogDensity;
      //     scene.fog.color.setHex(0x020304);
      // }
      // scene.background.setHex(0x020304);
      if (scene.fog) {
        scene.fog.near = 2; // Valores por defecto del estado oscuro
        scene.fog.far = 22;
        scene.fog.color.setHex(0x020304);
      }
      scene.background.setHex(0x020304);
    }
  }

  addRandomDoor(segmentGroup) {
    this.removeDoorFromSegment(segmentGroup);

    // 35% de chance de spawnear puerta en la pared IZQUIERDA
    if (Math.random() <= 0.35) {
      // AQUÍ: pasamos this.currentState
      const doorLeft = this.doorFactory.getClone(true, this.currentState);
      doorLeft.traverse((child) => {
        if (child.userData && child.userData.isCorridorDoor)
          this.interactables.push(child);
      });
      segmentGroup.add(doorLeft);
    }

    // 35% de chance de spawnear puerta en la pared DERECHA
    if (Math.random() <= 0.35) {
      // AQUÍ: pasamos this.currentState
      const doorRight = this.doorFactory.getClone(false, this.currentState);
      doorRight.traverse((child) => {
        if (child.userData && child.userData.isCorridorDoor)
          this.interactables.push(child);
      });
      segmentGroup.add(doorRight);
    }
  }
  // addRandomDoor(segmentGroup) {
  //         this.removeDoorFromSegment(segmentGroup);

  //         // 35% de chance de spawnear puerta en la pared IZQUIERDA
  //         if (Math.random() <= 0.35) {
  //             const doorLeft = this.doorFactory.getClone(true);
  //             doorLeft.traverse((child) => {
  //                 if (child.userData && child.userData.isCorridorDoor) this.interactables.push(child);
  //             });
  //             segmentGroup.add(doorLeft);
  //         }

  //         // 35% de chance de spawnear puerta en la pared DERECHA
  //         if (Math.random() <= 0.35) {
  //             const doorRight = this.doorFactory.getClone(false);
  //             doorRight.traverse((child) => {
  //                 if (child.userData && child.userData.isCorridorDoor) this.interactables.push(child);
  //             });
  //             segmentGroup.add(doorRight);
  //         }
  //     }

  removeDoorFromSegment(segmentGroup) {
    // Encontramos TODAS las puertas del segmento (ahora puede haber hasta 2)
    const oldDoors = segmentGroup.children.filter(
      (c) => c.userData && c.userData.isDoorAssembly,
    );
    oldDoors.forEach((oldDoor) => {
      segmentGroup.remove(oldDoor);
      oldDoor.traverse((child) => {
        if (child.userData && child.userData.isCorridorDoor) {
          this.interactables = this.interactables.filter(
            (item) => item !== child,
          );
        }
      });
    });
  }

  update(time, cameraZ = 0) {
    // 1. Lógica del pasillo infinito (Treadmill por distancia geométrica)
    if (this.segments && this.segments.length > 0) {
      const totalLength = this.segments.length * this.segmentLength; // ej: 56m con 7 segmentos
      const halfLength = totalLength / 2; // 28m

      this.segments.forEach((segment) => {
        // El centro geométrico real del segmento
        const segmentCenter = segment.position.z - this.segmentLength / 2;
        const dist = segmentCenter - cameraZ;

        // Si quedó más de 28m a nuestras espaldas (+Z), lo mandamos al fondo (-Z)
        if (dist > halfLength) {
          segment.position.z -= totalLength;
          if (this.addRandomDoor) this.addRandomDoor(segment);
        }
        // Si quedó más de 28m adelante (-Z), lo mandamos atrás (+Z)
        else if (dist < -halfLength) {
          segment.position.z += totalLength;
          if (this.addRandomDoor) this.addRandomDoor(segment);
        }
      });
    }

    // 2. Lógica de luces (Estado 1 - Transición)
    if (this.currentState === 1) {
      this.flickerLights.forEach((item) => {
        if (time >= item.nextSoftFlickerAt) {
          item.softFlickerUntil = time + 0.12;
          item.nextSoftFlickerAt = time + 8 + Math.random() * 10;
        }
        const factor =
          time < item.softFlickerUntil ? 0.88 + Math.sin(time * 35) * 0.04 : 1;
        item.pointLight.intensity = item.baseIntensityPoint * 1.15 * factor;
        item.spotLight.intensity = item.baseIntensitySpot * 1.15 * factor;
        item.tubeMesh.material.color.setScalar(Math.max(0.75, factor));
      });
      return;
    }

    if (this.currentState >= 2) return;

    // 3. Lógica de luces (Estado 0 - Opresivo)
    this.flickerLights.forEach((item, index) => {
      const noise = Math.sin(time * 10 + index * 2) * 0.04;
      const isFlickerFrame = Math.random() < 0.02;
      let factor = 1.0 + noise;
      if (isFlickerFrame) factor *= 0.3;

      item.pointLight.intensity = item.baseIntensityPoint * factor;
      item.spotLight.intensity = item.baseIntensitySpot * factor;
      item.tubeMesh.material.color.setScalar(Math.max(0.3, factor));
    });
  }
}
