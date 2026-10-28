import * as THREE from 'three';

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

export class Corridor {
    constructor(scene) {
        this.scene = scene;
        this.flickerLights = [];
        this.buildCorridor();
    }

    // Textura procedural de pared deteriorada: concreto estucado (#6B7280 del SDD) con
    // manchas de humedad, chorreaduras, pintura descascarada y grietas.
    // Devuelve { map, bump }: el bump es un mapa de relieve aparte para que las grietas
    // y los parches de pintura caída tengan profundidad real bajo las luces.
    createWallTextures() {
        const S = 1024;
        const mk = () => {
            const cv = document.createElement('canvas');
            cv.width = S;
            cv.height = S;
            return cv;
        };
        const cc = mk();
        const bc = mk();
        const c = cc.getContext('2d');
        const b = bc.getContext('2d');

        // --- Base ---
        const baseGrad = c.createLinearGradient(0, 0, 0, S);
        baseGrad.addColorStop(0, '#656b77');
        baseGrad.addColorStop(0.6, '#6b7280');
        baseGrad.addColorStop(1, '#5a606a');
        c.fillStyle = baseGrad;
        c.fillRect(0, 0, S, S);
        b.fillStyle = '#808080';
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
            const x = rnd(0, S), y = rnd(0, S), r = rnd(60, 190);
            const dark = Math.random() > 0.45;
            const g = c.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, dark ? 'rgba(0,0,0,0.09)' : 'rgba(255,255,255,0.05)');
            g.addColorStop(1, 'rgba(0,0,0,0)');
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
            stain(rnd(80, S - 80), rnd(60, S - 60), rnd(50, 150), rnd(40, 160), '58,44,28', rnd(0.18, 0.4)); // óxido/agua
        }
        for (let i = 0; i < 12; i++) {
            const y = Math.random() < 0.65 ? rnd(S * 0.72, S - 30) : rnd(20, S * 0.18);
            stain(rnd(80, S - 80), y, rnd(60, 170), rnd(30, 90), '22,30,24', rnd(0.25, 0.5)); // moho oscuro
        }
        for (let i = 0; i < 6; i++) {
            stain(rnd(100, S - 100), rnd(100, S - 100), rnd(40, 100), rnd(40, 100), '170,165,150', rnd(0.08, 0.16)); // salitre claro
        }

        // --- Chorreaduras verticales ---
        for (let i = 0; i < 28; i++) {
            const x = rnd(40, S - 40);
            const y0 = rnd(0, S * 0.5);
            const len = rnd(120, 460);
            const w = rnd(3, 11);
            const g = c.createLinearGradient(0, y0, 0, y0 + len);
            g.addColorStop(0, 'rgba(35,28,20,0)');
            g.addColorStop(0.15, 'rgba(35,28,20,0.3)');
            g.addColorStop(1, 'rgba(35,28,20,0)');
            c.fillStyle = g;
            c.fillRect(x, y0, w, len);
        }

        // --- Pintura descascarada (puntual, no generalizada) ---
        const drawPeel = (cx, cy, r) => {
            // halo de humedad alrededor del parche (suavizado)
            stain(cx, cy, r * 1.4, r * 1.2, '20,22,24', 0.12);

            const outer = jaggedPoly(cx, cy, r, rndInt(9, 15), 0.45);
            const inner = outer.map(([x, y]) => [
                cx + (x - cx) * rnd(0.3, 0.65),
                cy + (y - cy) * rnd(0.3, 0.65)
            ]);

            // sombra proyectada del borde de pintura
            tracePoly(c, outer);
            c.strokeStyle = 'rgba(0,0,0,0.4)';
            c.lineWidth = 6;
            c.stroke();

            // capa de yeso/revoque expuesto (más parecida al color de la pared)
            c.fillStyle = '#7d7a72';
            tracePoly(c, outer);
            c.fill();

            // concreto crudo al fondo (menos oscuro)
            c.fillStyle = '#5a5d63';
            tracePoly(c, inner);
            c.fill();

            // borde de pintura curvada (más claro)
            tracePoly(c, outer);
            c.strokeStyle = 'rgba(165,170,182,0.6)';
            c.lineWidth = 2.5;
            c.stroke();

            // relieve: el parche está hundido, el borde levantado
            b.fillStyle = '#505050';
            tracePoly(b, outer);
            b.fill();
            b.fillStyle = '#353535';
            tracePoly(b, inner);
            b.fill();
            tracePoly(b, outer);
            b.strokeStyle = '#d4d4d4';
            b.lineWidth = 3;
            b.stroke();
        };
        for (let i = 0; i < 3; i++) drawPeel(rnd(130, S - 130), rnd(130, S - 130), rnd(18, 42));
        // pequeñas escamas sueltas
        for (let i = 0; i < 10; i++) {
            const cx = rnd(40, S - 40), cy = rnd(40, S - 40);
            const flake = jaggedPoly(cx, cy, rnd(4, 10), rndInt(5, 8), 0.4);
            c.fillStyle = Math.random() > 0.5 ? '#8b8578' : '#4a4d53';
            tracePoly(c, flake);
            c.fill();
            b.fillStyle = '#555';
            tracePoly(b, flake);
            b.fill();
        }

        // --- Grietas (caminata aleatoria con ramificaciones) ---
        const drawCrack = (x, y, angle, len, width, depth) => {
            let px = x, py = y, a = angle, w = width, travelled = 0;
            while (travelled < len) {
                const step = rnd(10, 26);
                a += rnd(-0.6, 0.6);
                const nx = px + Math.cos(a) * step;
                const ny = py + Math.sin(a) * step;
                if (nx < 6 || nx > S - 6 || ny < 6 || ny > S - 6) break;
                w = Math.max(0.7, w * 0.965);

                // reflejo claro del labio de la grieta
                c.strokeStyle = 'rgba(255,255,255,0.1)';
                c.lineWidth = w + 2.5;
                c.beginPath(); c.moveTo(px + 1, py + 1); c.lineTo(nx + 1, ny + 1); c.stroke();
                // fisura oscura
                c.strokeStyle = 'rgba(6,6,8,0.92)';
                c.lineWidth = w;
                c.beginPath(); c.moveTo(px, py); c.lineTo(nx, ny); c.stroke();
                // relieve hundido
                b.strokeStyle = '#0c0c0c';
                b.lineWidth = w + 1.2;
                b.beginPath(); b.moveTo(px, py); b.lineTo(nx, ny); b.stroke();

                if (depth < 2 && Math.random() < 0.13) {
                    drawCrack(nx, ny, a + rnd(-1.1, 1.1), len * 0.45, w * 0.7, depth + 1);
                }
                px = nx; py = ny; travelled += step;
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
                0
            );
        }

        // --- Rozaduras en la zona baja (roces de carros / zócalo sucio) ---
        for (let i = 0; i < 24; i++) {
            const x = rnd(0, S), y = rnd(S * 0.75, S);
            c.fillStyle = `rgba(15,15,18,${rnd(0.06, 0.16)})`;
            c.fillRect(x, y, rnd(40, 160), rnd(2, 8));
        }

        // --- Suciedad acumulada abajo y arriba ---
        const bottomGrime = c.createLinearGradient(0, S * 0.7, 0, S);
        bottomGrime.addColorStop(0, 'rgba(0,0,0,0)');
        bottomGrime.addColorStop(1, 'rgba(0,0,0,0.35)');
        c.fillStyle = bottomGrime;
        c.fillRect(0, S * 0.7, S, S * 0.3);
        const topGrime = c.createLinearGradient(0, 0, 0, S * 0.12);
        topGrime.addColorStop(0, 'rgba(0,0,0,0.25)');
        topGrime.addColorStop(1, 'rgba(0,0,0,0)');
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

    // Genera textura procedural de PISO AJEDREZADO (Checkerboard) con textura de piedra/terrazo
    createCheckerboardFloorTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        const numCols = 4; // 4 columnas a lo ancho del pasillo
        const numRows = 4;
        const tileSize = 512 / numCols;

        for (let row = 0; row < numRows; row++) {
            for (let col = 0; col < numCols; col++) {
                const isWhite = (row + col) % 2 === 0;

                // Color base: Blanco/Gris cálido claro vs Gris muy oscuro / Negro
                ctx.fillStyle = isWhite ? '#b0ab9f' : '#141619';
                ctx.fillRect(col * tileSize, row * tileSize, tileSize, tileSize);

                // Ruido de textura / piedra porosa sobre cada baldosa
                for (let i = 0; i < 600; i++) {
                    const rx = col * tileSize + Math.random() * tileSize;
                    const ry = row * tileSize + Math.random() * tileSize;
                    const noiseColor = isWhite ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.08)';
                    ctx.fillStyle = noiseColor;
                    ctx.fillRect(rx, ry, 2, 2);
                }

                // Borde sutil de separación entre baldosas
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
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

        // --- Hueco de la puerta de Negación (debe coincidir con DenialRoom.js) ---
        const doorZ = -8.0;          // centro de la puerta sobre el eje Z
        const doorOpeningW = 1.16;    // un poco menor que la hoja (1.2) para que la hoja y el marco tapen los bordes
        const doorOpeningH = 2.18;    // un poco menor que la hoja (2.2) por la misma razón
        const wallThickness = 0.08;

        // Texturas de pared (color + relieve)
        const wallTex = this.createWallTextures();
        const TILE_W = 2.6; // metros de pared que cubre una repetición de la textura (en horizontal)
        const TILE_H = 2.8; // alto de pared = una repetición vertical (las manchas y chorreaduras cubren todo el alto)

        // Cada tramo usa copias de la textura con repeat/offset según su posición real en la pared,
        // así la textura continúa sin cortes entre los tramos que rodean la puerta.
        const makeWallMaterial = (segLength, segHeight, zStart = 0, y0 = 0, flipU = true) => {
            const setup = (base) => {
                const t = base.clone();
                t.needsUpdate = true;
                t.repeat.set(Math.max(segLength / TILE_W, 0.05), Math.max(segHeight / TILE_H, 0.05));
                t.offset.set(flipU ? -zStart / TILE_W : zStart / TILE_W, y0 / TILE_H);
                return t;
            };
            return new THREE.MeshStandardMaterial({
                map: setup(wallTex.map),
                bumpMap: setup(wallTex.bump),
                bumpScale: 0.03,
                color: 0xffffff, // el #6B7280 (SDD) ya está en la textura
                roughness: 0.92,
                metalness: 0.03
            });
        };

        const addLeftWallSegment = (z0, z1, y0, y1) => {
            const segLength = Math.abs(z1 - z0);
            const segHeight = y1 - y0;
            const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(wallThickness, segHeight, segLength),
                makeWallMaterial(segLength, segHeight, Math.max(z0, z1), y0, true)
            );
            mesh.position.set(-width / 2, y0 + segHeight / 2, (z0 + z1) / 2);
            this.scene.add(mesh);
            return mesh;
        };

        const floorTexture = this.createCheckerboardFloorTexture();
        const floorMaterial = new THREE.MeshStandardMaterial({
            map: floorTexture,
            bumpMap: floorTexture,
            bumpScale: 0.015,
            roughness: 0.72, // Dispersión difusa sobre el ajedrezado
            metalness: 0.08
        });

        const ceilingMaterial = new THREE.MeshStandardMaterial({
            color: 0x0d0f12,
            roughness: 0.95
        });

        // Pared Izquierda: tramo antes de la puerta, tramo después y dintel sobre el hueco
        addLeftWallSegment(0, -length, 0, height);

        // Pared Derecha (la cara visible es la -X; el offset de V se mantiene en 0)
        const rightWall = new THREE.Mesh(
            new THREE.BoxGeometry(wallThickness, height, length),
            makeWallMaterial(length, height, 0, 0, false)
        );
        rightWall.position.set(width / 2, height / 2, -length / 2);
        this.scene.add(rightWall);

        // Piso Ajedrezado
        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(width, length),
            floorMaterial
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(0, 0, -length / 2);
        this.scene.add(floor);

        // Techo
        const ceiling = new THREE.Mesh(
            new THREE.PlaneGeometry(width, length),
            ceilingMaterial
        );
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.set(0, height, -length / 2);
        this.scene.add(ceiling);

        // Escombros: pequeños trozos de revoque caído al pie de las paredes
        const chipMat = new THREE.MeshStandardMaterial({ color: 0x8b8578, roughness: 0.95 });
        const chipDarkMat = new THREE.MeshStandardMaterial({ color: 0x4a4d53, roughness: 0.95 });
        for (let i = 0; i < 40; i++) {
            const s = rnd(0.015, 0.06);
            const chip = new THREE.Mesh(
                new THREE.BoxGeometry(s * rnd(0.8, 2), s * 0.35, s * rnd(0.8, 1.8)),
                Math.random() > 0.35 ? chipMat : chipDarkMat
            );
            const side = Math.random() > 0.5 ? 1 : -1;
            chip.position.set(side * (width / 2 - rnd(0.04, 0.35)), s * 0.17, -rnd(0.5, length - 0.5));
            chip.rotation.y = rnd(0, Math.PI);
            this.scene.add(chip);
        }

        // Conducto metálico central en el techo
        const conduitGeo = new THREE.CylinderGeometry(0.025, 0.025, length, 16);
        const conduitMat = new THREE.MeshStandardMaterial({ color: 0x2a2f35, roughness: 0.3, metalness: 0.8 });
        const conduit = new THREE.Mesh(conduitGeo, conduitMat);
        conduit.rotation.x = Math.PI / 2;
        conduit.position.set(0, height - 0.04, -length / 2);
        this.scene.add(conduit);

        // Pared Final
        const backWall = new THREE.Mesh(
            new THREE.BoxGeometry(width, height, 0.08),
            new THREE.MeshStandardMaterial({ color: 0x121417, roughness: 0.95 })
        );
        backWall.position.set(0, height / 2, -length);
        this.scene.add(backWall);

        // LUMINARIAS FLUORESCENTES SUSPENDIDAS (Optimizadas para proyectar parches cálidos sobre el ajedrez)
        for (let z = -2.5; z >= -length; z -= 3.5) {
            // Luz puntual difusa ambiente
            const pointLight = new THREE.PointLight(0xe2e8f0, 0.35, 4.5);
            pointLight.position.set(0, height - 0.2, z);
            this.scene.add(pointLight);

            // SpotLight focalizado cálido/neutro que proyecta sobre las baldosas
            const spotLight = new THREE.SpotLight(0xfff7ed, 0.85);
            spotLight.position.set(0, height - 0.15, z);
            spotLight.target.position.set(0, 0, z);
            spotLight.angle = Math.PI / 3.8; // Haz ajustado para marcar el parche sobre el ajedrez
            spotLight.penumbra = 0.6;
            spotLight.distance = 4.2;
            this.scene.add(spotLight);
            this.scene.add(spotLight.target);

            // Soporte del tubo fluorescente suspendido
            const tubeHolderGeo = new THREE.BoxGeometry(0.08, 0.06, 1.1);
            const tubeHolderMat = new THREE.MeshStandardMaterial({ color: 0x333942, metalness: 0.5 });
            const tubeHolder = new THREE.Mesh(tubeHolderGeo, tubeHolderMat);
            tubeHolder.position.set(0, height - 0.1, z);
            this.scene.add(tubeHolder);

            // Cilindro fluorescente emisor
            const tubeGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.95, 16);
            const tubeMat = new THREE.MeshBasicMaterial({ color: 0xfffdfa });
            const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
            tubeMesh.rotation.x = Math.PI / 2;
            tubeMesh.position.set(0, height - 0.14, z);
            this.scene.add(tubeMesh);

            this.flickerLights.push({
                pointLight,
                spotLight,
                baseIntensityPoint: 0.35,
                baseIntensitySpot: 0.85,
                tubeMesh
            });
        }
    }

    update(time) {
        this.flickerLights.forEach((item, index) => {
            // Titileo sutil
            const noise = Math.sin(time * 10 + index * 2) * 0.04;
            const isFlickerFrame = Math.random() < 0.02;

            let factor = 1.0 + noise;
            if (isFlickerFrame) {
                factor *= 0.3;
            }

            item.pointLight.intensity = item.baseIntensityPoint * factor;
            item.spotLight.intensity = item.baseIntensitySpot * factor;
            item.tubeMesh.material.color.setScalar(Math.max(0.3, factor));
        });
    }
}