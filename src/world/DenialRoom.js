import * as THREE from 'three';

const rnd = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------------------
//  Utilidades y constantes de la habitación interior de Negación
// ---------------------------------------------------------------------------

const FRAME_TILT = 0.12;
const CLOCK_STOPPED = { h: 3, m: 17, s: 41 };
const DRAWER_OUT = 0.07;

const LOOK = {
    wallColor: 0xC9BFAE,
    ceilingColor: 0xD9D1C3,
    roomLight: 0.55,
    reflection: 0.5,
    vaseLight: 0.9,
    vaseGloss: 0.35,
    petalGlow: 0.4,
    leafGlow: 0.16,
    sofaGlow: 0.2,
    tableGloss: 0.55
};

const ROOM_WIDTH = 3.4;
const PLANT_FICUS = true;
const SOFA_SEATS = 2;

const stdMat = (color, roughness = 0.8, metalness = 0.05, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

const lerp3 = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

const seeded = (seed) => () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const VASE_HEIGHT = 0.358;

const canvasOf = (w, h) => {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    return cv;
};

const texOf = (cv, srgb = true) => {
    const t = new THREE.CanvasTexture(cv);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
};

const roundedBox = (w, h, d, r, seg = 6) => {
    const geo = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
    const v = new THREE.Vector3();
    const inner = new THREE.Vector3();
    const dir = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        inner.set(
            THREE.MathUtils.clamp(v.x, -hx, hx),
            THREE.MathUtils.clamp(v.y, -hy, hy),
            THREE.MathUtils.clamp(v.z, -hz, hz)
        );
        dir.copy(v).sub(inner).normalize();
        pos.setXYZ(i, inner.x + dir.x * r, inner.y + dir.y * r, inner.z + dir.z * r);
        nor.setXYZ(i, dir.x, dir.y, dir.z);
    }
    return geo;
};

export class DenialRoom {
    constructor(scene) {
        this.scene = scene;
        this.interactables = [];
        this.anomaliesAccepted = 0;
        this.totalAnomalies = 2;
        this.isDoorUnlocked = false;

        this.buildRoom();
        this._hookRenderer();
    }

    _hookRenderer() {
        const scene = this.scene;
        const prev = scene.onBeforeRender;
        scene.onBeforeRender = (renderer, sc, camera, ...rest) => {
            if (prev) prev.call(scene, renderer, sc, camera, ...rest);
            this._renderHookAt = performance.now();
            if (!this._dragCleanup && this.flowers) this.enableDragging(camera, renderer.domElement);
            if (!this._bookDragCleanup && this.books) this.enableBookDragging(camera, renderer.domElement);
            if (this._dragTick) this._dragTick(camera);
            if (this._bookTick) this._bookTick(camera);
        };
    }

    createDoorTextures() {
        const W = 512;
        const H = 938;
        const mk = () => {
            const cv = document.createElement('canvas');
            cv.width = W;
            cv.height = H;
            return cv;
        };
        const cc = mk(), bc = mk();
        const c = cc.getContext('2d');
        const b = bc.getContext('2d');

        const grad = c.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#12303a');
        grad.addColorStop(0.5, '#0f2a33');
        grad.addColorStop(1, '#091a20');
        c.fillStyle = grad;
        c.fillRect(0, 0, W, H);
        b.fillStyle = '#808080';
        b.fillRect(0, 0, W, H);

        for (let i = 0; i < 14000; i++) {
            const x = Math.random() * W;
            const y = Math.random() * H;
            const o = Math.random() * 0.07;
            const dark = Math.random() > 0.5;
            c.fillStyle = dark ? `rgba(0,0,0,${o})` : `rgba(120,190,200,${o * 0.6})`;
            c.fillRect(x, y, 2, 2);
            b.fillStyle = dark ? `rgba(0,0,0,${o * 2})` : `rgba(255,255,255,${o})`;
            b.fillRect(x, y, 2, 2);
        }

        const drawPanel = (x, y, w, h) => {
            c.fillStyle = '#0b2027';
            c.fillRect(x, y, w, h);
            b.fillStyle = '#686868';
            b.fillRect(x, y, w, h);

            c.strokeStyle = 'rgba(0, 0, 0, 0.65)';
            c.lineWidth = 6;
            c.beginPath();
            c.moveTo(x, y + h);
            c.lineTo(x, y);
            c.lineTo(x + w, y);
            c.stroke();

            c.strokeStyle = 'rgba(110, 190, 205, 0.16)';
            c.lineWidth = 3;
            c.beginPath();
            c.moveTo(x + w, y);
            c.lineTo(x + w, y + h);
            c.lineTo(x, y + h);
            c.stroke();
        };
        drawPanel(62, 70, 388, 470);
        drawPanel(62, 590, 388, 270);

        const glow = c.createLinearGradient(0, 0, 0, H * 0.55);
        glow.addColorStop(0, 'rgba(90, 170, 190, 0.12)');
        glow.addColorStop(1, 'rgba(90, 170, 190, 0)');
        c.fillStyle = glow;
        c.fillRect(0, 0, W, H);

        const blotch = (x, y, r, rgb, alpha, bumpGray = null, bumpAlpha = 0.25) => {
            const g = c.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, `rgba(${rgb},${alpha})`);
            g.addColorStop(0.6, `rgba(${rgb},${alpha * 0.45})`);
            g.addColorStop(1, `rgba(${rgb},0)`);
            c.fillStyle = g;
            c.fillRect(x - r, y - r, r * 2, r * 2);
            if (bumpGray !== null) {
                const gb = b.createRadialGradient(x, y, 0, x, y, r);
                gb.addColorStop(0, `rgba(${bumpGray},${bumpGray},${bumpGray},${bumpAlpha})`);
                gb.addColorStop(1, `rgba(${bumpGray},${bumpGray},${bumpGray},0)`);
                b.fillStyle = gb;
                b.fillRect(x - r, y - r, r * 2, r * 2);
            }
        };
        const jagged = (cx, cy, r, n, j) => {
            const pts = [];
            for (let i = 0; i < n; i++) {
                const ang = (i / n) * Math.PI * 2 + rnd(-0.15, 0.15);
                const rr = r * (1 + rnd(-j, j));
                pts.push([cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr * rnd(0.75, 1.2)]);
            }
            return pts;
        };
        const trace = (ctx, pts) => {
            ctx.beginPath();
            ctx.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
            ctx.closePath();
        };

        for (let i = 0; i < 18; i++) {
            blotch(rnd(0, W), rnd(0, H), rnd(30, 90), '0,0,0', rnd(0.15, 0.35));
        }

        const rustTones = ['150,70,25', '120,55,20', '95,42,18', '170,90,35'];
        for (let i = 0; i < 70; i++) {
            const y = H * (1 - Math.pow(Math.random(), 2.2));
            const edgeBias = Math.random() < 0.4;
            const x = edgeBias ? (Math.random() < 0.5 ? rnd(0, 60) : rnd(W - 60, W)) : rnd(0, W);
            blotch(x, y, rnd(14, 70), rustTones[Math.floor(Math.random() * rustTones.length)], rnd(0.25, 0.6), 190, 0.18);
        }
        blotch(468, 512, 85, '140,65,22', 0.55, 190, 0.2);
        blotch(77, 234, 45, '130,60,20', 0.4, 190, 0.15);
        for (const [px, py] of [[62, 70], [450, 70], [62, 540], [450, 540], [62, 590], [450, 590], [62, 860], [450, 860]]) {
            blotch(px, py, rnd(25, 50), '125,58,20', 0.45, 190, 0.15);
        }

        for (let i = 0; i < 5000; i++) {
            const y = H * (1 - Math.pow(Math.random(), 1.8));
            c.fillStyle = `rgba(${150 + Math.floor(rnd(0, 30))},${70 + Math.floor(rnd(0, 20))},25,${rnd(0.15, 0.55)})`;
            c.fillRect(rnd(0, W), y, 2, 2);
        }

        const drawPeel = (cx, cy, r) => {
            const outer = jagged(cx, cy, r, 11 + Math.floor(rnd(0, 5)), 0.45);
            const inner = outer.map(([x, y]) => [cx + (x - cx) * rnd(0.3, 0.65), cy + (y - cy) * rnd(0.3, 0.65)]);

            trace(c, outer);
            c.strokeStyle = 'rgba(0,0,0,0.45)';
            c.lineWidth = 5;
            c.stroke();

            c.fillStyle = '#6b3a1e';
            trace(c, outer);
            c.fill();
            c.fillStyle = Math.random() > 0.5 ? '#3a2415' : '#58595a';
            trace(c, inner);
            c.fill();

            trace(c, outer);
            c.strokeStyle = 'rgba(120,190,200,0.35)';
            c.lineWidth = 2.5;
            c.stroke();

            b.fillStyle = '#4c4c4c';
            trace(b, outer);
            b.fill();
            b.fillStyle = '#353535';
            trace(b, inner);
            b.fill();
            trace(b, outer);
            b.strokeStyle = '#d0d0d0';
            b.lineWidth = 3;
            b.stroke();
        };
        for (let i = 0; i < 16; i++) {
            const cy = H * (1 - Math.pow(Math.random(), 1.6));
            drawPeel(rnd(40, W - 40), cy, rnd(18, 65));
        }
        for (let i = 0; i < 40; i++) {
            const f = jagged(rnd(20, W - 20), rnd(20, H - 20), rnd(4, 12), 6, 0.4);
            c.fillStyle = Math.random() > 0.5 ? '#6b3a1e' : '#3a2415';
            trace(c, f);
            c.fill();
        }

        for (let i = 0; i < 30; i++) {
            const x = rnd(10, W - 10);
            const y0 = rnd(0, H * 0.7);
            const len = rnd(60, 320);
            const w = rnd(2, 9);
            const g = c.createLinearGradient(0, y0, 0, y0 + len);
            g.addColorStop(0, 'rgba(120,55,20,0)');
            g.addColorStop(0.2, 'rgba(120,55,20,0.4)');
            g.addColorStop(1, 'rgba(120,55,20,0)');
            c.fillStyle = g;
            c.fillRect(x, y0, w, len);
        }

        for (let i = 0; i < 45; i++) {
            const x = rnd(0, W), y = rnd(0, H);
            const ang = rnd(-0.6, 0.6) + (Math.random() > 0.5 ? 0 : Math.PI / 2);
            const len = rnd(20, 90);
            c.strokeStyle = `rgba(180,200,205,${rnd(0.12, 0.3)})`;
            c.lineWidth = rnd(0.8, 1.8);
            c.beginPath();
            c.moveTo(x, y);
            c.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
            c.stroke();
            b.strokeStyle = '#303030';
            b.lineWidth = 1.2;
            b.beginPath();
            b.moveTo(x, y);
            b.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
            b.stroke();
        }

        const dentX = 300, dentY = 700, dentR = 95;
        const dentGrad = b.createRadialGradient(dentX, dentY, 0, dentX, dentY, dentR);
        dentGrad.addColorStop(0, 'rgba(30,30,30,0.9)');
        dentGrad.addColorStop(0.7, 'rgba(110,110,110,0.4)');
        dentGrad.addColorStop(0.9, 'rgba(235,235,235,0.5)');
        dentGrad.addColorStop(1, 'rgba(128,128,128,0)');
        b.fillStyle = dentGrad;
        b.fillRect(dentX - dentR, dentY - dentR, dentR * 2, dentR * 2);
        blotch(dentX, dentY, dentR, '0,0,0', 0.3);

        const drawCrack = (x, y, ang, len, w, depth) => {
            let px = x, py = y, t = 0, ww = w;
            while (t < len) {
                const step = rnd(8, 20);
                ang += rnd(-0.5, 0.5);
                const nx = px + Math.cos(ang) * step;
                const ny = py + Math.sin(ang) * step;
                if (nx < 4 || nx > W - 4 || ny < 4 || ny > H - 4) break;
                ww = Math.max(0.8, ww * 0.97);
                c.strokeStyle = 'rgba(3,6,8,0.95)';
                c.lineWidth = ww;
                c.beginPath(); c.moveTo(px, py); c.lineTo(nx, ny); c.stroke();
                b.strokeStyle = '#080808';
                b.lineWidth = ww + 1;
                b.beginPath(); b.moveTo(px, py); b.lineTo(nx, ny); b.stroke();
                if (depth < 2 && Math.random() < 0.15) drawCrack(nx, ny, ang + rnd(-1, 1), len * 0.4, ww * 0.7, depth + 1);
                px = nx; py = ny; t += step;
            }
        };
        drawCrack(140, 120, Math.PI / 2 + 0.2, 380, 3.2, 0);
        drawCrack(420, 610, Math.PI / 2 - 0.35, 260, 2.6, 0);

        const bottom = c.createLinearGradient(0, H * 0.8, 0, H);
        bottom.addColorStop(0, 'rgba(0, 0, 0, 0)');
        bottom.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
        c.fillStyle = bottom;
        c.fillRect(0, 0, W, H);

        const wrap = (cv, srgb) => {
            const t = new THREE.CanvasTexture(cv);
            if (srgb) t.colorSpace = THREE.SRGBColorSpace;
            return t;
        };
        return { map: wrap(cc, true), bump: wrap(bc, false) };
    }

    createFrameTexture() {
        const S = 256;
        const canvas = document.createElement('canvas');
        canvas.width = S;
        canvas.height = S;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#05090c';
        ctx.fillRect(0, 0, S, S);

        for (let i = 0; i < 9; i++) {
            const x = rnd(0, S), y = rnd(0, S), r = rnd(20, 60);
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, `rgba(135,62,22,${rnd(0.3, 0.6)})`);
            g.addColorStop(1, 'rgba(135,62,22,0)');
            ctx.fillStyle = g;
            ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
        for (let i = 0; i < 1800; i++) {
            ctx.fillStyle = `rgba(${140 + Math.floor(rnd(0, 30))},${65 + Math.floor(rnd(0, 20))},25,${rnd(0.15, 0.55)})`;
            ctx.fillRect(rnd(0, S), rnd(0, S), 2, 2);
        }
        for (let i = 0; i < 500; i++) {
            ctx.fillStyle = `rgba(0,0,0,${rnd(0.1, 0.3)})`;
            ctx.fillRect(rnd(0, S), rnd(0, S), 2, 2);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    createFloorStainTexture() {
        const S = 256;
        const canvas = document.createElement('canvas');
        canvas.width = S;
        canvas.height = S;
        const ctx = canvas.getContext('2d');
        for (let i = 0; i < 6; i++) {
            const x = rnd(70, S - 70), y = rnd(70, S - 70), r = rnd(40, 100);
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, 'rgba(90,40,14,0.55)');
            g.addColorStop(0.6, 'rgba(60,28,10,0.25)');
            g.addColorStop(1, 'rgba(40,20,8,0)');
            ctx.fillStyle = g;
            ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    }

    buildRoom() {
        const doorX = 0;
        const doorZ = -8.0;
        const doorRotationY = 0;

        const doorGroup = new THREE.Group();

        const frameTex = this.createFrameTexture();
        const doorFrameMat = new THREE.MeshStandardMaterial({
            map: frameTex,
            bumpMap: frameTex,
            bumpScale: 0.8,
            color: 0xffffff,
            roughness: 0.75,
            metalness: 0.25
        });
        const frameDepth = 0.14;
        const frameThickness = 0.11;
        const openingW = 1.2;
        const openingH = 2.2;
        const frameZ = 0.03;

        const frameLeft = new THREE.Mesh(
            new THREE.BoxGeometry(frameThickness, openingH + frameThickness, frameDepth),
            doorFrameMat
        );
        frameLeft.position.set(-(openingW / 2 + frameThickness / 2), (openingH + frameThickness) / 2, frameZ);
        doorGroup.add(frameLeft);

        const frameRight = frameLeft.clone();
        frameRight.position.x = openingW / 2 + frameThickness / 2;
        doorGroup.add(frameRight);

        const frameTop = new THREE.Mesh(
            new THREE.BoxGeometry(openingW + frameThickness * 2, frameThickness, frameDepth),
            doorFrameMat
        );
        frameTop.position.set(0, openingH + frameThickness / 2, frameZ);
        doorGroup.add(frameTop);

        const doorGeo = new THREE.BoxGeometry(openingW, openingH, 0.05);
        const doorTex = this.createDoorTextures();
        this.doorMaterial = new THREE.MeshStandardMaterial({
            map: doorTex.map,
            bumpMap: doorTex.bump,
            bumpScale: 0.9,
            color: 0xffffff,
            emissive: 0x020d11,
            roughness: 0.75,
            metalness: 0.25
        });
        this.entryDoor = new THREE.Mesh(doorGeo, this.doorMaterial);
        this.entryDoor.position.set(0, openingH / 2, 0);
        this.entryDoor.rotation.z = 0;
        this.entryDoor.userData = {
            id: 'entryDoor',
            prompt: 'Puerta 1: Negación (Interactuar)'
        };
        doorGroup.add(this.entryDoor);
        this.interactables.push(this.entryDoor);

        const handleMat = new THREE.MeshStandardMaterial({ color: 0x6b5445, metalness: 0.7, roughness: 0.65 });

        const roseGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.01, 24);
        const roseMesh = new THREE.Mesh(roseGeo, handleMat);
        roseMesh.rotation.x = Math.PI / 2;
        roseMesh.position.set(0.5, 1.0, 0.03);
        doorGroup.add(roseMesh);

        const handleGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.1, 16);
        const handleMesh = new THREE.Mesh(handleGeo, handleMat);
        handleMesh.rotation.x = Math.PI / 2;
        handleMesh.rotation.y = 0.22;
        handleMesh.position.set(0.5, 1.0, 0.075);
        doorGroup.add(handleMesh);

        const knobMesh = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 16), handleMat);
        knobMesh.position.set(0.522, 0.99, 0.123);
        doorGroup.add(knobMesh);

        const plateGeo = new THREE.BoxGeometry(0.1, 0.1, 0.01);
        const plateMat = new THREE.MeshStandardMaterial({ color: 0x2b1a10, roughness: 0.8, metalness: 0.3 });
        const plateMesh = new THREE.Mesh(plateGeo, plateMat);
        plateMesh.position.set(-0.42, 1.65, 0.03);
        plateMesh.rotation.z = 0.12;
        doorGroup.add(plateMesh);

        const hingeMat = new THREE.MeshStandardMaterial({ color: 0x5a3a26, metalness: 0.7, roughness: 0.7 });
        const hingeTop = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.02), hingeMat);
        hingeTop.position.set(-0.6, 1.85, 0.04);
        doorGroup.add(hingeTop);
        const hingeMid = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.02), hingeMat);
        hingeMid.position.set(-0.6, 1.1, 0.04);
        doorGroup.add(hingeMid);
        const hingeBottom = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.02), hingeMat);
        hingeBottom.position.set(-0.6, 0.34, 0.04);
        doorGroup.add(hingeBottom);

        doorGroup.position.set(doorX, 0, doorZ);
        doorGroup.rotation.y = doorRotationY;
        this.scene.add(doorGroup);

        const debrisMats = [
            new THREE.MeshStandardMaterial({ color: 0x5a2f1c, roughness: 0.9, metalness: 0.3 }),
            new THREE.MeshStandardMaterial({ color: 0x3a2415, roughness: 0.9, metalness: 0.2 }),
            new THREE.MeshStandardMaterial({ color: 0x12303a, roughness: 0.8, metalness: 0.1 })
        ];
        for (let i = 0; i < 16; i++) {
            const s = rnd(0.02, 0.075);
            const piece = new THREE.Mesh(
                new THREE.BoxGeometry(s * rnd(0.6, 2.2), s * 0.25, s * rnd(0.6, 1.6)),
                debrisMats[Math.floor(Math.random() * debrisMats.length)]
            );
            piece.position.set(doorX + rnd(-0.55, 0.55), s * 0.12, doorZ + rnd(0.1, 0.65));
            piece.rotation.y = rnd(0, Math.PI);
            this.scene.add(piece);
        }

        const stainMat = new THREE.MeshBasicMaterial({
            map: this.createFloorStainTexture(),
            transparent: true,
            depthWrite: false
        });
        const stain = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.5), stainMat);
        stain.rotation.x = -Math.PI / 2;
        stain.position.set(doorX, 0.006, doorZ + 0.45);
        this.scene.add(stain);

        const doorSpotLight = new THREE.SpotLight(0x5fa8b8, 1.6);
        doorSpotLight.position.set(doorX, 2.7, doorZ + 0.9);
        doorSpotLight.target.position.set(doorX, 1.2, doorZ);
        doorSpotLight.angle = Math.PI / 4;
        doorSpotLight.penumbra = 0.9;
        doorSpotLight.distance = 5;
        this.scene.add(doorSpotLight);
        this.scene.add(doorSpotLight.target);

        const doorPointLight = new THREE.PointLight(0x2a6572, 0.55, 3.5);
        doorPointLight.position.set(doorX, 2.2, doorZ + 0.5);
        this.scene.add(doorPointLight);

        this.buildInterior(doorZ);
    }

    buildInterior(doorZ) {
        const W = ROOM_WIDTH, H = 4.0, D = 7.0;
        const halfW = W / 2;
        const Z = (s) => doorZ - s;
        const backZ = Z(D);
        const group = new THREE.Group();
        this.roomGroup = group;

        const modern = parseInt(THREE.REVISION, 10) >= 155;
        const lum = (v) => (modern ? v * Math.PI : v);

        const wallMat = new THREE.MeshBasicMaterial({ color: LOOK.wallColor });

        const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(D, H), wallMat);
        leftWall.rotation.y = Math.PI / 2;
        leftWall.position.set(-halfW, H / 2, Z(D / 2));
        group.add(leftWall);

        const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(D, H), wallMat);
        rightWall.rotation.y = -Math.PI / 2;
        rightWall.position.set(halfW, H / 2, Z(D / 2));
        group.add(rightWall);

        const backWall = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wallMat);
        backWall.position.set(0, H / 2, backZ);
        group.add(backWall);

        const floorTex = this.createRoomFloorTexture(W, D);
        floorTex.anisotropy = 8;
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshBasicMaterial({ map: floorTex }));
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(0, 0, Z(D / 2));
        group.add(floor);

        const ceiling = new THREE.Mesh(
            new THREE.PlaneGeometry(W, D),
            new THREE.MeshBasicMaterial({ color: LOOK.ceilingColor })
        );
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.set(0, H, Z(D / 2));
        group.add(ceiling);

        const baseMat = stdMat(0x04090b, 0.6, 0.1, { emissive: 0x010304 });
        const bbH = 0.1, bbT = 0.025;
        const bbBack = new THREE.Mesh(new THREE.BoxGeometry(W, bbH, bbT), baseMat);
        bbBack.position.set(0, bbH / 2, backZ + bbT / 2);
        const bbLeft = new THREE.Mesh(new THREE.BoxGeometry(bbT, bbH, D), baseMat);
        bbLeft.position.set(-halfW + bbT / 2, bbH / 2, Z(D / 2));
        const bbRight = new THREE.Mesh(new THREE.BoxGeometry(bbT, bbH, D), baseMat);
        bbRight.position.set(halfW - bbT / 2, bbH / 2, Z(D / 2));
        group.add(bbBack, bbLeft, bbRight);

        const sofaS = 3.9;
        const dresserS = 1.5;

        const dresser = this.createDresser();
        dresser.position.set(-halfW + 0.25, 0, Z(dresserS));
        group.add(dresser);

        this.drawer = dresser.userData.drawer;
        const drawerData = {
            id: 'drawer',
            prompt: 'Cerrar el cajón entreabierto',
            accepted: false
        };
        this.drawer.traverse((o) => { o.userData = drawerData; });
        this.interactables.push(this.drawer);

        const sofa = this.createSofa();
        sofa.position.set(halfW - 0.415, 0, Z(sofaS));
        group.add(sofa);

        const tableX = halfW - 0.415 - 0.4 - 0.2 - 0.31;
        const coffeeTable = this.createCoffeeTable();
        coffeeTable.position.set(tableX, 0, Z(sofaS));
        group.add(coffeeTable);

        const vaseS = 2.42;
        const vasePos = new THREE.Vector3(halfW - 0.43, 0, Z(vaseS));
        const vase = this.createVase();
        vase.position.copy(vasePos);
        group.add(vase);

        const vaseCatcher = new THREE.Mesh(
            new THREE.CylinderGeometry(0.2, 0.2, 0.7, 12),
            new THREE.MeshBasicMaterial({ visible: false })
        );
        vaseCatcher.position.set(vasePos.x, 0.35, vasePos.z);
        group.add(vaseCatcher);

        const bouquet = this.createBouquet();
        const lyingT = new THREE.Vector3(dresser.position.x + 0.02, dresser.userData.topY + 0.018, dresser.position.z - 0.15);
        const vaseT = new THREE.Vector3(vasePos.x, VASE_HEIGHT - 0.012, vasePos.z);
        group.add(bouquet.group);
        this.flowers = {
            group: bouquet.group,
            items: bouquet.items,
            lyingT,
            vaseT,
            hoverT: vaseT.clone().add(new THREE.Vector3(0, 0.22, 0)),
            vaseCatcher,
            T: lyingT.clone(),
            blend: 0,
            appliedBlend: -1,
            placed: false,
            anim: null,
            carryY: lyingT.y + 0.05,
            bounds: { minX: -halfW + 0.2, maxX: halfW - 0.2, minZ: Z(D - 0.3), maxZ: Z(0.3) }
        };
        this._flushBouquet();
        const flowerData = {
            id: 'flowers',
            prompt: 'Mantén presionado para mover las flores',
            accepted: false
        };
        bouquet.group.traverse((o) => { o.userData = flowerData; });
        this.interactables.push(bouquet.group);

        const blobTex = this.createBlobTexture();
        const blob = (w, l, x, s, opacity, rotY = 0) => {
            const m = new THREE.Mesh(
                new THREE.PlaneGeometry(w, l),
                new THREE.MeshBasicMaterial({ map: blobTex, color: 0x000000, transparent: true, opacity, depthWrite: false })
            );
            m.rotation.x = -Math.PI / 2;
            m.rotation.z = rotY;
            m.position.set(x, 0.004, Z(s));
            group.add(m);
        };
        blob(1.0, 2.0, -halfW + 0.55, dresserS, 0.32);
        blob(1.15, 2.9, halfW - 0.55, sofaS, 0.32);
        blob(0.46, 0.46, vasePos.x, vaseS, 0.35);
        blob(0.95, 1.55, tableX, sofaS, 0.28);

        // ---- Estante al fondo (modificado: doble de ancho W = 1.0m, H = 2.0m, profundidad D = 0.36m para albergar libros dobles) ----
        const shelf = this.createBookshelf(1.0, H / 2, 0.36);
        const shelfZ = backZ + shelf.depth / 2 + 0.004;
        shelf.group.position.set(0, 0, shelfZ);
        group.add(shelf.group);

        const slots = [];
        for (const sy of shelf.surfaces) {
            for (const sx of shelf.slotX) {
                slots.push({
                    x: sx,
                    z: shelfZ + 0.005,
                    surfaceY: sy,
                    center: new THREE.Vector3(sx, sy + 0.22, shelfZ + 0.005),
                    book: null
                });
            }
        }
        const shelfCatcher = new THREE.Mesh(
            new THREE.BoxGeometry(shelf.width, shelf.height, shelf.depth + 0.1),
            new THREE.MeshBasicMaterial({ visible: false })
        );
        shelfCatcher.position.set(0, shelf.height / 2, shelfZ + 0.05);
        group.add(shelfCatcher);
        this.shelf = { slots, catcher: shelfCatcher };

        this.books = [];
        // Libros con dimensiones al doble de su tamaño original
        const bookSpecs = [
            { color: 0x8a2f2f, t: 0.072, h: 0.42, d: 0.30, x: -0.35, s: D - 0.9, yaw: 0.5 },
            { color: 0x2f5a3d, t: 0.084, h: 0.40, d: 0.28, x: 0.15, s: D - 1.25, yaw: -0.9 },
            { color: 0x2f4a7a, t: 0.060, h: 0.38, d: 0.26, x: 0.5, s: D - 0.8, yaw: 2.2 }
        ];
        bookSpecs.forEach((spec) => {
            const bg = this.createBook(spec);
            const floorPos = new THREE.Vector3(spec.x, spec.t / 2 + 0.002, Z(spec.s));
            const floorQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, spec.yaw, Math.PI / 2));
            bg.position.copy(floorPos);
            bg.quaternion.copy(floorQuat);
            group.add(bg);
            const book = { group: bg, t: spec.t, h: spec.h, d: spec.d, floorPos, floorQuat, placed: false, anim: null };
            const bookData = {
                id: 'book',
                prompt: 'Mantén presionado para mover el libro',
                accepted: false
            };
            bg.traverse((o) => { o.userData = bookData; });
            this.books.push(book);
            this.interactables.push(bg);
        });
        blob(1.2, 0.68, 0, D - 0.1, 0.3);

        // ---- Anomalía 1: reloj detenido (radio = 0.475m, alineado con el sofá) ----
        const clock = this.createClock(0.475);
        clock.group.position.set(halfW - 0.001, 2.1, Z(sofaS));
        clock.group.rotation.y = -Math.PI / 2;
        group.add(clock.group);
        this.clock = clock.face;
        this.clockHands = clock.hands;
        const clockData = {
            id: 'clock',
            prompt: 'Observar reloj detenido (Aceptar anomalía)',
            accepted: false
        };
        clock.parts.forEach((p) => { p.userData = clockData; });
        this.clock.userData = clockData;
        this.interactables.push(this.clock);

        // ---- Anomalía 2: cuadro ----
        const painting = this.createPainting();
        this.frame = painting.frame;
        this.frame.position.set(-halfW + 0.03, 1.85, Z(dresserS));
        this.frame.rotation.set(0, Math.PI / 2, FRAME_TILT);
        const frameData = {
            id: 'frame',
            prompt: 'Inspeccionar cuadro torcido (Aceptar anomalía)',
            accepted: false
        };
        painting.parts.forEach((p) => { p.userData = frameData; });
        this.frame.userData = frameData;
        group.add(this.frame);
        this.interactables.push(this.frame);

        for (const s of [2.6, 4.8]) {
            const fill = new THREE.PointLight(0xffffff, lum(LOOK.roomLight), 5.2, 0);
            fill.position.set(0, H - 0.6, Z(s));
            group.add(fill);
        }

        const vaseSpot = new THREE.SpotLight(0xfff4e6, lum(LOOK.vaseLight), 5, 0.38, 0.9, 0);
        vaseSpot.position.set(vasePos.x - 0.8, 2.4, vasePos.z + 0.9);
        vaseSpot.target.position.set(vasePos.x, 0.4, vasePos.z);
        group.add(vaseSpot, vaseSpot.target);

        const dresserGlow = new THREE.PointLight(0xffffff, lum(0.3), 1.7, 0);
        dresserGlow.position.set(dresser.position.x + 0.45, 1.5, lyingT.z + 0.25);
        group.add(dresserGlow);

        this.scene.add(group);
    }

    createClock(R) {
        const group = new THREE.Group();
        const parts = [];
        const add = (m) => { group.add(m); parts.push(m); return m; };

        const walnut = stdMat(0xffffff, 0.5, 0.1, { map: this.createWoodTexture([58, 32, 22]), emissive: 0x100804 });
        const cream = stdMat(0xf1d9c9, 0.45, 0.25, { emissive: 0x3a2a22 });
        const coral = stdMat(0xe2704f, 0.5, 0.1, { emissive: 0x4a1a0e });

        const body = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.035, R + 0.035, 0.06, 96), walnut);
        body.rotation.x = Math.PI / 2;
        body.position.z = 0.03;
        add(body);

        const faceTex = this.createClockFaceTexture();
        const face = new THREE.Mesh(
            new THREE.CircleGeometry(R, 96),
            new THREE.MeshStandardMaterial({
                map: faceTex, emissiveMap: faceTex, emissive: 0xffffff, emissiveIntensity: 0.9,
                roughness: 0.35, metalness: 0
            })
        );
        face.position.z = 0.061;
        add(face);

        const bezel = new THREE.Mesh(
            new THREE.TorusGeometry(R + 0.0175, 0.0175, 16, 96),
            stdMat(0x1c2b2d, 0.35, 0.6, { emissive: 0x050c0d })
        );
        bezel.position.z = 0.0625;
        add(bezel);

        const makeHand = (len, w, tail, mat, depth, z) => {
            const s = new THREE.Shape();
            s.moveTo(-w / 2, -tail);
            s.lineTo(w / 2, -tail);
            s.lineTo(w / 2, len * 0.88);
            s.lineTo(0, len);
            s.lineTo(-w / 2, len * 0.88);
            s.closePath();
            const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }), mat);
            m.position.z = z;
            return add(m);
        };
        const { h, m, s } = CLOCK_STOPPED;
        const TAU = Math.PI * 2;
        const hourHand = makeHand(R * 0.52, 0.04, 0.03, cream, 0.005, 0.065);
        const minuteHand = makeHand(R * 0.82, 0.0275, 0.035, cream, 0.005, 0.071);
        const secondHand = makeHand(R * 0.90, 0.006, R * 0.18, coral, 0.002, 0.077);
        hourHand.rotation.z = -(((h % 12) + m / 60) / 12) * TAU;
        minuteHand.rotation.z = -((m + s / 60) / 60) * TAU;
        secondHand.rotation.z = -(s / 60) * TAU;

        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.015, 24), coral);
        cap.rotation.x = Math.PI / 2;
        cap.position.z = 0.081;
        add(cap);

        const glass = new THREE.Mesh(
            new THREE.CircleGeometry(R + 0.005, 64),
            new THREE.MeshBasicMaterial({ map: this.createClockGlassTexture(), transparent: true, depthWrite: false })
        );
        glass.position.z = 0.0875;
        add(glass);

        return { group, face, parts, hands: { hourHand, minuteHand, secondHand } };
    }

    createClockFaceTexture() {
        const S = 1024, c0 = S / 2;
        const cv = canvasOf(S, S);
        const c = cv.getContext('2d');

        const g = c.createRadialGradient(c0, c0, 0, c0, c0, c0);
        g.addColorStop(0, '#04161a');
        g.addColorStop(0.7, '#020b0d');
        g.addColorStop(1, '#000000');
        c.fillStyle = g;
        c.fillRect(0, 0, S, S);

        c.strokeStyle = 'rgba(60,150,150,0.25)';
        c.lineWidth = 3;
        c.beginPath();
        c.arc(c0, c0, c0 * 0.94, 0, Math.PI * 2);
        c.stroke();

        c.translate(c0, c0);
        c.lineCap = 'round';
        for (let i = 0; i < 60; i++) {
            c.save();
            c.rotate((i / 60) * Math.PI * 2);
            const hour = i % 5 === 0;
            const card = i % 15 === 0;
            c.strokeStyle = i === 0 ? '#e2704f' : (hour ? '#f3dccd' : 'rgba(243,220,205,0.4)');
            c.lineWidth = card ? 20 : (hour ? 13 : 4);
            const r1 = c0 * 0.9;
            const r2 = r1 - (card ? 100 : (hour ? 70 : 20));
            c.beginPath();
            c.moveTo(0, -r1);
            c.lineTo(0, -r2);
            c.stroke();
            c.restore();
        }
        return texOf(cv);
    }

    createClockGlassTexture() {
        const S = 1024, c0 = S / 2;
        const cv = canvasOf(S, S);
        const c = cv.getContext('2d');
        c.beginPath();
        c.arc(c0, c0, c0, 0, Math.PI * 2);
        c.clip();

        c.save();
        c.filter = 'blur(7px)';
        this.drawDahliaCanvas(c, S * 0.88, S * 0.48, S * 0.11, LOOK.reflection);
        c.globalAlpha = LOOK.reflection * 0.8;
        c.strokeStyle = '#3f7a4c';
        c.lineWidth = 7;
        c.beginPath();
        c.moveTo(S * 0.88, S * 0.59);
        c.quadraticCurveTo(S * 0.86, S * 0.7, S * 0.83, S * 0.82);
        c.stroke();
        c.fillStyle = '#2f6a40';
        for (const [x, y, rot] of [[0.85, 0.7, -0.9], [0.86, 0.77, 0.8]]) {
            c.save();
            c.translate(S * x, S * y);
            c.rotate(rot);
            c.beginPath();
            c.ellipse(0, -S * 0.035, S * 0.018, S * 0.04, 0, 0, Math.PI * 2);
            c.fill();
            c.restore();
        }
        c.restore();

        const gl = c.createLinearGradient(0, 0, S, S);
        gl.addColorStop(0.0, 'rgba(160,230,225,0.10)');
        gl.addColorStop(0.35, 'rgba(160,230,225,0)');
        c.fillStyle = gl;
        c.fillRect(0, 0, S, S);

        c.strokeStyle = 'rgba(120,200,195,0.14)';
        c.lineWidth = 6;
        c.beginPath();
        c.arc(c0, c0, c0 * 0.97, Math.PI * 0.95, Math.PI * 1.45);
        c.stroke();
        return texOf(cv);
    }

    createDresser() {
        const g = new THREE.Group();
        const body = stdMat(0xffffff, 0.55, 0.08, { map: this.createWoodTexture([66, 36, 26]), emissive: 0x120804 });
        const top = stdMat(0xffffff, 0.28, 0.15, { map: this.createWoodTexture([104, 62, 38]), emissive: 0x160a05 });
        const dark = stdMat(0x120a07, 0.7, 0.1);
        const brass = stdMat(0x9a7a4a, 0.4, 0.8, { emissive: 0x1a1308 });

        const bodyW = 0.46, bodyH = 0.74, bodyL = 1.3, legH = 0.14;

        const box = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, bodyL), body);
        box.position.y = legH + bodyH / 2;
        g.add(box);

        const tp = new THREE.Mesh(new THREE.BoxGeometry(bodyW + 0.04, 0.04, bodyL + 0.05), top);
        tp.position.y = legH + bodyH + 0.02;
        g.add(tp);

        const frontX = bodyW / 2;
        const innerH = bodyH - 0.1;
        const gap = 0.014;
        const dH = (innerH - gap * 2) / 3;
        const recess = new THREE.Mesh(new THREE.BoxGeometry(0.01, innerH + 0.02, bodyL - 0.08), dark);
        recess.position.set(frontX, legH + 0.05 + innerH / 2, 0);
        g.add(recess);
        const trayMat = stdMat(0x1a0f0a, 0.8, 0.05);
        for (let i = 0; i < 3; i++) {
            const drawer = new THREE.Group();
            drawer.position.y = legH + 0.05 + dH / 2 + i * (dH + gap);

            const front = new THREE.Mesh(new THREE.BoxGeometry(0.022, dH, bodyL - 0.1), body);
            front.position.set(frontX + 0.004, 0, 0);
            const handle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.028, 0.16), brass);
            handle.position.set(frontX + 0.024, 0, 0);
            const tray = new THREE.Mesh(new THREE.BoxGeometry(0.12, dH - 0.03, bodyL - 0.14), trayMat);
            tray.position.set(frontX - 0.065, 0, 0);
            drawer.add(front, handle, tray);
            g.add(drawer);

            if (i === 1) {
                drawer.position.x = DRAWER_OUT;
                g.userData.drawer = drawer;
            }
        }

        for (const sx of [-1, 1]) {
            for (const sz of [-1, 1]) {
                const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.018, legH, 10), dark);
                leg.position.set(sx * (bodyW / 2 - 0.06), legH / 2, sz * (bodyL / 2 - 0.08));
                g.add(leg);
            }
        }
        g.userData.topY = legH + bodyH + 0.04;
        return g;
    }

    createSofa() {
        const g = new THREE.Group();
        const tex = this.createLinenTextures();
        const fabric = (tint = 0xffffff, sheen = 0.7) => new THREE.MeshPhysicalMaterial({
            color: tint, map: tex.map, bumpMap: tex.bump, bumpScale: 0.6,
            roughness: 0.95, metalness: 0,
            emissive: 0xffffff, emissiveMap: tex.map, emissiveIntensity: LOOK.sofaGlow,
            sheen, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xfff3dc)
        });
        const linen = fabric();
        const linenDeep = fabric(0xdcd3c3, 0.5);
        const shadow = stdMat(0x17110c, 0.9, 0);

        const len = 2.3, dep = 0.8;
        const armW = 0.24, floorGap = 0.07, baseTop = 0.3;
        const inner = len - armW * 2;
        const cw = inner / SOFA_SEATS;

        const plinth = new THREE.Mesh(new THREE.BoxGeometry(dep - 0.22, floorGap + 0.02, len - 0.5), shadow);
        plinth.position.y = (floorGap + 0.02) / 2;
        g.add(plinth);

        const base = new THREE.Mesh(roundedBox(dep - 0.04, baseTop - floorGap, inner + 0.1, 0.04), linenDeep);
        base.position.y = (baseTop + floorGap) / 2;
        g.add(base);

        for (const sz of [-1, 1]) {
            const arm = new THREE.Mesh(roundedBox(dep, 0.7 - floorGap, armW, 0.07), linenDeep);
            arm.position.set(0, floorGap + (0.7 - floorGap) / 2, sz * (len / 2 - armW / 2));
            g.add(arm);
        }

        const backFrame = new THREE.Mesh(roundedBox(0.12, 0.5, inner + 0.02, 0.04), linenDeep);
        backFrame.position.set(dep / 2 - 0.06, 0.55, 0);
        g.add(backFrame);

        for (let i = 0; i < SOFA_SEATS; i++) {
            const z = (i - (SOFA_SEATS - 1) / 2) * cw;
            const seat = new THREE.Mesh(roundedBox(0.6, 0.17, cw - 0.015, 0.07), linen);
            seat.position.set(-0.08, 0.375, z);
            g.add(seat);
            const back = new THREE.Mesh(roundedBox(0.26, 0.46, cw - 0.015, 0.08), linen);
            back.position.set(dep / 2 - 0.145, 0.55, z);
            back.rotation.z = -0.08;
            g.add(back);
        }
        return g;
    }

    createLinenTextures() {
        const S = 512;
        const cc = canvasOf(S, S), bc = canvasOf(S, S);
        const c = cc.getContext('2d'), b = bc.getContext('2d');
        c.fillStyle = '#d9ccb3';
        c.fillRect(0, 0, S, S);
        b.fillStyle = '#808080';
        b.fillRect(0, 0, S, S);

        for (let i = 0; i < S; i += 2) {
            const dark = Math.random() > 0.5;
            const a = rnd(0.03, 0.11);
            c.fillStyle = dark ? `rgba(120,100,70,${a})` : `rgba(255,248,232,${a})`;
            c.fillRect(i, 0, 1, S);
            b.fillStyle = dark ? `rgba(0,0,0,${a * 1.6})` : `rgba(255,255,255,${a * 1.6})`;
            b.fillRect(i, 0, 1, S);
            const dark2 = Math.random() > 0.5;
            const a2 = rnd(0.03, 0.11);
            c.fillStyle = dark2 ? `rgba(120,100,70,${a2})` : `rgba(255,248,232,${a2})`;
            c.fillRect(0, i, S, 1);
            b.fillStyle = dark2 ? `rgba(0,0,0,${a2 * 1.6})` : `rgba(255,255,255,${a2 * 1.6})`;
            b.fillRect(0, i, S, 1);
        }

        for (let i = 0; i < 520; i++) {
            const x = rnd(0, S), y = rnd(0, S), l = rnd(8, 46), horiz = Math.random() > 0.5;
            const light = Math.random() > 0.45;
            c.fillStyle = light ? `rgba(255,248,232,${rnd(0.1, 0.22)})` : `rgba(110,90,60,${rnd(0.08, 0.18)})`;
            b.fillStyle = light ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.2)';
            const wd = rnd(1, 2.4);
            if (horiz) { c.fillRect(x, y, l, wd); b.fillRect(x, y, l, wd); }
            else { c.fillRect(x, y, wd, l); b.fillRect(x, y, wd, l); }
        }

        for (let i = 0; i < 40; i++) {
            const x = rnd(0, S), y = rnd(0, S), r = rnd(30, 90);
            const gr = c.createRadialGradient(x, y, 0, x, y, r);
            const light = Math.random() > 0.5;
            gr.addColorStop(0, light ? 'rgba(255,246,228,0.07)' : 'rgba(120,98,66,0.06)');
            gr.addColorStop(1, light ? 'rgba(255,246,228,0)' : 'rgba(120,98,66,0)');
            c.fillStyle = gr;
            c.fillRect(x - r, y - r, r * 2, r * 2);
        }
        for (let i = 0; i < 9000; i++) {
            c.fillStyle = Math.random() > 0.5 ? `rgba(110,90,60,${rnd(0.03, 0.08)})` : `rgba(255,250,238,${rnd(0.03, 0.08)})`;
            c.fillRect(rnd(0, S), rnd(0, S), 1.5, 1.5);
        }
        const map = texOf(cc);
        const bump = texOf(bc, false);
        for (const t of [map, bump]) {
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            t.repeat.set(2, 2);
            t.anisotropy = 8;
        }
        return { map, bump };
    }

    createCoffeeTable() {
        const g = new THREE.Group();
        const L = 1.2, Dp = 0.62, H = 0.34;
        const topT = 0.065, botT = 0.045, plinthH = 0.05, endT = 0.05, backT = 0.03;
        const innerH = H - topT - plinthH - botT;

        const env = this.createVaseEnvTexture();
        const sideTex = this.createWalnutTexture();
        const topTex = this.createWalnutTexture();
        topTex.center.set(0.5, 0.5);
        topTex.rotation = Math.PI / 2;
        const walnut = (map, rough, coat, envI) => new THREE.MeshPhysicalMaterial({
            map, color: 0xffffff, roughness: rough, metalness: 0.02,
            clearcoat: coat, clearcoatRoughness: 0.3,
            emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.08,
            envMap: env, envMapIntensity: envI
        });
        const bodyMat = walnut(sideTex, 0.5, 0.2, LOOK.tableGloss * 0.6);
        const topMat = walnut(topTex, 0.34, 0.7, LOOK.tableGloss);
        const darkMat = stdMat(0x120b07, 0.8, 0.05);

        const add = (geo, mat, x, y, z) => {
            const m = new THREE.Mesh(geo, mat);
            m.position.set(x, y, z);
            g.add(m);
            return m;
        };
        add(new THREE.BoxGeometry(Dp - 0.14, plinthH, L - 0.2), darkMat, 0, plinthH / 2, 0);
        add(roundedBox(Dp, botT, L, 0.01, 4), bodyMat, 0, plinthH + botT / 2, 0);
        const yMid = plinthH + botT + innerH / 2;
        for (const sz of [-1, 1]) {
            add(roundedBox(Dp, innerH + 0.02, endT, 0.01, 4), bodyMat, 0, yMid, sz * (L / 2 - endT / 2));
        }
        add(roundedBox(backT, innerH + 0.02, L - endT * 2 + 0.02, 0.01, 4), bodyMat, Dp / 2 - backT / 2, yMid, 0);
        add(roundedBox(Dp + 0.03, topT, L + 0.03, 0.014, 5),
            [bodyMat, bodyMat, topMat, bodyMat, bodyMat, bodyMat], 0, H - topT / 2, 0);

        const shadeMat = () => new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });
        const backShade = new THREE.Mesh(new THREE.PlaneGeometry(L - endT * 2, innerH), shadeMat());
        backShade.rotation.y = -Math.PI / 2;
        backShade.position.set(Dp / 2 - backT - 0.002, yMid, 0);
        g.add(backShade);
        const floorShade = new THREE.Mesh(new THREE.PlaneGeometry(Dp - backT, L - endT * 2), shadeMat());
        floorShade.rotation.x = -Math.PI / 2;
        floorShade.position.set(-backT / 2, plinthH + botT + 0.002, 0);
        g.add(floorShade);

        g.userData.topY = H;
        return g;
    }

    createWalnutTexture() {
        const S = 512;
        const cv = canvasOf(S, S);
        const c = cv.getContext('2d');
        c.fillStyle = 'rgb(98,62,42)';
        c.fillRect(0, 0, S, S);
        for (let i = 0; i < 14; i++) {
            const y = rnd(0, S), h = rnd(20, 70);
            const g = c.createLinearGradient(0, y - h, 0, y + h);
            const dark = Math.random() > 0.5;
            const mid = dark ? `rgba(40,22,12,${rnd(0.12, 0.26)})` : `rgba(160,108,70,${rnd(0.08, 0.18)})`;
            const edge = dark ? 'rgba(40,22,12,0)' : 'rgba(160,108,70,0)';
            g.addColorStop(0, edge);
            g.addColorStop(0.5, mid);
            g.addColorStop(1, edge);
            c.fillStyle = g;
            c.fillRect(0, y - h, S, h * 2);
        }
        for (let i = 0; i < 220; i++) {
            const y = rnd(0, S);
            const dark = Math.random() > 0.4;
            c.strokeStyle = dark ? `rgba(30,16,8,${rnd(0.08, 0.22)})` : `rgba(190,140,100,${rnd(0.03, 0.08)})`;
            c.lineWidth = rnd(0.5, 1.6);
            const ph = rnd(0, 6.28), amp = rnd(0.6, 3.2), fr = rnd(0.008, 0.02);
            c.beginPath();
            c.moveTo(0, y);
            for (let x = 0; x <= S; x += 16) c.lineTo(x, y + Math.sin(x * fr + ph) * amp);
            c.stroke();
        }
        const t = texOf(cv);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 8;
        return t;
    }

    createVase() {
        const prof = [
            [0, 0], [0.06, 0], [0.09, 0.003], [0.115, 0.022], [0.145, 0.065], [0.168, 0.125], [0.178, 0.19],
            [0.17, 0.25], [0.15, 0.3], [0.13, 0.337], [0.124, 0.352],
            [0.1255, 0.3575], [0.1225, 0.3595], [0.1175, 0.3575],
            [0.113, 0.345], [0.118, 0.32], [0.136, 0.27], [0.152, 0.21], [0.15, 0.14],
            [0.126, 0.075], [0.085, 0.04], [0.04, 0.03], [0, 0.028]
        ];
        const curve = new THREE.CatmullRomCurve3(prof.map(([r, y]) => new THREE.Vector3(r, y, 0)), false, 'centripetal');
        const pts = curve.getPoints(180).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y));
        let jLip = 0;
        pts.forEach((p, j) => { if (p.y > pts[jLip].y) jLip = j; });

        const geo = new THREE.LatheGeometry(pts, 80);
        const n = pts.length;
        const colors = new Float32Array(geo.attributes.position.count * 3);
        for (let i = 0; i < geo.attributes.position.count; i++) {
            const j = i % n;
            const f = j <= jLip ? 1 : 0.5 - 0.38 * ((j - jLip) / (n - 1 - jLip));
            colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = f;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const tex = this.createPlanterTexture();
        const mat = new THREE.MeshPhysicalMaterial({
            color: 0xffffff, map: tex, bumpMap: tex, bumpScale: 0.4,
            roughness: 0.8, metalness: 0, emissive: 0x060606,
            envMap: this.createVaseEnvTexture(), envMapIntensity: LOOK.vaseGloss,
            vertexColors: true
        });
        const pot = new THREE.Mesh(geo, mat);

        const soil = new THREE.Mesh(
            new THREE.CircleGeometry(0.118, 40),
            new THREE.MeshStandardMaterial({ color: 0x15100c, roughness: 1, metalness: 0 })
        );
        soil.rotation.x = -Math.PI / 2;
        soil.position.y = 0.305;
        pot.add(soil);
        return pot;
    }

    createPlanterTexture() {
        const S = 256;
        const cv = canvasOf(S, S);
        const c = cv.getContext('2d');
        c.fillStyle = '#252526';
        c.fillRect(0, 0, S, S);
        for (let i = 0; i < 9000; i++) {
            c.fillStyle = Math.random() > 0.5 ? `rgba(0,0,0,${rnd(0.08, 0.25)})` : `rgba(150,150,150,${rnd(0.03, 0.09)})`;
            c.fillRect(rnd(0, S), rnd(0, S), rnd(1, 2.4), rnd(1, 2.4));
        }
        for (let i = 0; i < 12; i++) {
            const x = rnd(0, S), y = rnd(0, S), r = rnd(30, 80);
            const g = c.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, 'rgba(120,120,120,0.05)');
            g.addColorStop(1, 'rgba(120,120,120,0)');
            c.fillStyle = g;
            c.fillRect(x - r, y - r, r * 2, r * 2);
        }
        const t = texOf(cv);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(4, 2);
        return t;
    }

    createVaseEnvTexture() {
        const W = 512, H = 256;
        const cv = canvasOf(W, H);
        const c = cv.getContext('2d');
        const g = c.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#9a9a96');
        g.addColorStop(0.5, '#3a3a3a');
        g.addColorStop(1, '#0c0c0c');
        c.fillStyle = g;
        c.fillRect(0, 0, W, H);

        const box = (x, y, w, h, a) => {
            c.save();
            c.filter = 'blur(5px)';
            c.fillStyle = `rgba(255,255,255,${a})`;
            c.fillRect(x - w / 2, y - h / 2, w, h);
            c.restore();
        };
        box(0.452 * W, 0.287 * H, 0.05 * W, 0.17 * H, 1);
        box(0.12 * W, 0.4 * H, 0.025 * W, 0.2 * H, 0.35);

        const t = new THREE.CanvasTexture(cv);
        t.mapping = THREE.EquirectangularReflectionMapping;
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
    }

    createPetalGeometry() {
        const geo = new THREE.PlaneGeometry(1, 1, 4, 16);
        const pos = geo.attributes.position;
        const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
        for (let i = 0; i < pos.count; i++) {
            const u = pos.getY(i) + 0.5;
            const v = pos.getX(i) * 2;
            const ww = u < 0.78
                ? 0.3 + 0.7 * smooth(u / 0.32)
                : Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.78) / 0.22, 2)));
            const x = v * 0.5 * ww;
            const z = 0.1 * u * u + 0.06 * v * v * ww;
            pos.setXYZ(i, x, u, z);
        }
        geo.computeVertexNormals();
        return geo;
    }

    createPetalTexture() {
        const w = 64, h = 256;
        const cv = canvasOf(w, h);
        const c = cv.getContext('2d');
        const g = c.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#f6f5ef');
        g.addColorStop(0.45, '#fdfdfa');
        g.addColorStop(0.82, '#f6f1dc');
        g.addColorStop(1, '#e9d78c');
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);
        c.lineCap = 'round';
        for (let k = -5; k <= 5; k++) {
            c.strokeStyle = `rgba(185,190,170,${0.16 + rnd(0, 0.1)})`;
            c.lineWidth = 1;
            c.beginPath();
            c.moveTo(w / 2 + k * 1.2, h);
            c.quadraticCurveTo(w / 2 + k * 3.2, h * 0.5, w / 2 + k * 4.4, h * 0.04);
            c.stroke();
        }
        for (let i = 0; i < 1400; i++) {
            c.fillStyle = Math.random() > 0.5 ? `rgba(150,150,130,${rnd(0.02, 0.05)})` : `rgba(255,255,255,${rnd(0.03, 0.08)})`;
            c.fillRect(rnd(0, w), rnd(0, h), 1.5, 1.5);
        }
        return texOf(cv);
    }

    createDiscTexture() {
        const w = 256, h = 128;
        const cv = canvasOf(w, h);
        const c = cv.getContext('2d');
        const g = c.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#c4a53a');
        g.addColorStop(0.5, '#e5a21f');
        g.addColorStop(1, '#7d5014');
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);
        const tones = ['#f2c23a', '#d98d1a', '#b87414', '#f6d460', '#8a5a16'];
        for (let i = 0; i < 900; i++) {
            c.fillStyle = tones[Math.floor(Math.random() * tones.length)];
            c.beginPath();
            c.arc(rnd(0, w), rnd(0, h), rnd(0.8, 2.4), 0, Math.PI * 2);
            c.fill();
        }
        return texOf(cv);
    }

    createLeafGeometry() {
        const geo = new THREE.PlaneGeometry(1, 1, 6, 14);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const u = pos.getY(i) + 0.5;
            const v = pos.getX(i) * 2;
            const ww = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.72)), 0.85);
            const x = v * 0.5 * ww;
            const z = 0.12 * v * v * ww - 0.2 * u * u;
            pos.setXYZ(i, x, u, z);
        }
        geo.computeVertexNormals();
        return geo;
    }

    createLeafTexture() {
        const w = 128, h = 256;
        const cv = canvasOf(w, h);
        const c = cv.getContext('2d');
        const g = c.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#2a6430');
        g.addColorStop(0.5, '#33753a');
        g.addColorStop(1, '#4b8a3e');
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);
        for (let i = 0; i < 14; i++) {
            const x = rnd(0, w), y = rnd(0, h), r = rnd(14, 40);
            const light = Math.random() > 0.5;
            const rg = c.createRadialGradient(x, y, 0, x, y, r);
            rg.addColorStop(0, light ? 'rgba(120,170,80,0.28)' : 'rgba(10,50,25,0.3)');
            rg.addColorStop(1, light ? 'rgba(120,170,80,0)' : 'rgba(10,50,25,0)');
            c.fillStyle = rg;
            c.fillRect(x - r, y - r, r * 2, r * 2);
        }
        c.lineCap = 'round';
        c.strokeStyle = 'rgba(176,214,128,0.75)';
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(w / 2, h);
        c.lineTo(w / 2, h * 0.06);
        c.stroke();
        c.strokeStyle = 'rgba(170,208,120,0.35)';
        c.lineWidth = 1.2;
        for (let k = 1; k <= 7; k++) {
            const y = h * (0.92 - k * 0.105);
            for (const sx of [-1, 1]) {
                c.beginPath();
                c.moveTo(w / 2, y);
                c.quadraticCurveTo(w / 2 + sx * w * 0.2, y - h * 0.03, w / 2 + sx * w * 0.44, y - h * 0.13);
                c.stroke();
            }
        }
        for (let i = 0; i < 1200; i++) {
            c.fillStyle = Math.random() > 0.5 ? `rgba(10,40,20,${rnd(0.03, 0.08)})` : `rgba(190,230,150,${rnd(0.02, 0.06)})`;
            c.fillRect(rnd(0, w), rnd(0, h), 1.5, 1.5);
        }
        return texOf(cv);
    }

    createBouquet() {
        const N = 10, TAU = Math.PI * 2;
        const rng = seeded(11);
        const r = (a, b) => a + rng() * (b - a);
        const group = new THREE.Group();

        const petalGeo = this.createPetalGeometry();
        const petalTex = this.createPetalTexture();
        const petalMat = new THREE.MeshStandardMaterial({
            map: petalTex, emissiveMap: petalTex, emissive: 0xffffff, emissiveIntensity: LOOK.petalGlow,
            color: 0xf4f1e6, roughness: 0.78, metalness: 0, side: THREE.DoubleSide
        });
        const discGeo = new THREE.SphereGeometry(0.0165, 24, 8, 0, TAU, 0, Math.PI / 2);
        discGeo.rotateX(Math.PI / 2);
        discGeo.scale(1, 1, 0.55);
        const discMat = new THREE.MeshStandardMaterial({
            map: this.createDiscTexture(), roughness: 0.85, metalness: 0, emissive: 0x3a2606
        });
        const stemMat = PLANT_FICUS
            ? stdMat(0x75665a, 0.85, 0, { emissive: 0x15100b })
            : stdMat(0x16241b, 0.6, 0, { emissive: 0x050a07 });

        const layers = [
            { n: 22, len: [0.043, 0.052], z: 0, off: 0, tilt: [-0.3, 0.18], w: 0.28 },
            { n: 13, len: [0.036, 0.044], z: -0.004, off: 0.5, tilt: [-0.55, -0.1], w: 0.26 }
        ];
        const makeDaisyHead = () => {
            const head = new THREE.Group();
            const dummy = new THREE.Object3D();
            dummy.rotation.order = 'ZXY';
            const col = new THREE.Color();
            for (const L of layers) {
                const mesh = new THREE.InstancedMesh(petalGeo, petalMat, L.n);
                for (let k = 0; k < L.n; k++) {
                    const a = ((k + L.off) / L.n) * TAU + r(-0.07, 0.07);
                    const len = r(L.len[0], L.len[1]);
                    dummy.position.set(Math.cos(a) * 0.012, Math.sin(a) * 0.012, L.z);
                    dummy.rotation.set(r(L.tilt[0], L.tilt[1]), 0, a - Math.PI / 2);
                    dummy.scale.set(len * L.w * r(0.9, 1.1), len, len);
                    dummy.updateMatrix();
                    mesh.setMatrixAt(k, dummy.matrix);
                    const v = r(0.9, 1);
                    mesh.setColorAt(k, col.setRGB(v, v * 0.99, v * 0.94));
                }
                mesh.instanceMatrix.needsUpdate = true;
                mesh.instanceColor.needsUpdate = true;
                mesh.frustumCulled = false;
                head.add(mesh);
            }
            const disc = new THREE.Mesh(discGeo, discMat);
            disc.position.z = 0.002;
            head.add(disc);
            return head;
        };

        const leafGeo = PLANT_FICUS ? this.createLeafGeometry() : null;
        const leafTex = PLANT_FICUS ? this.createLeafTexture() : null;
        const leafMat = PLANT_FICUS ? new THREE.MeshStandardMaterial({
            map: leafTex, emissiveMap: leafTex, emissive: 0xffffff, emissiveIntensity: LOOK.leafGlow,
            color: 0xffffff, roughness: 0.42, metalness: 0, side: THREE.DoubleSide
        }) : null;
        const rl = seeded(97);
        const rr = (a, b) => a + rl() * (b - a);
        const makeLeafHead = () => {
            const nL = 6;
            const head = new THREE.Group();
            const mesh = new THREE.InstancedMesh(leafGeo, leafMat, nL);
            const m = new THREE.Matrix4();
            const X = new THREE.Vector3(), Y = new THREE.Vector3(), N = new THREE.Vector3();
            const Zc = new THREE.Vector3(0, 0, 1), tmp = new THREE.Vector3();
            const col = new THREE.Color();
            for (let k = 0; k < nL; k++) {
                const terminal = k === 0;
                const a = terminal ? 0 : ((k - 1) / (nL - 1)) * TAU + rr(-0.4, 0.4);
                const t = terminal ? 0.12 : rr(0.55, 1.25);
                Y.set(Math.sin(t) * Math.cos(a), Math.sin(t) * Math.sin(a), Math.cos(t));
                N.copy(Zc).addScaledVector(Y, -Zc.dot(Y)).normalize();
                X.crossVectors(Y, N).normalize();
                const roll = rr(-0.35, 0.35);
                tmp.copy(X).multiplyScalar(Math.cos(roll)).addScaledVector(N, Math.sin(roll));
                N.multiplyScalar(Math.cos(roll)).addScaledVector(X, -Math.sin(roll));
                X.copy(tmp);
                const len = rr(0.09, 0.13);
                m.makeBasis(X, Y, N);
                m.scale(new THREE.Vector3(len * rr(0.8, 0.95), len, len));
                m.setPosition(Y.x * 0.01, Y.y * 0.01, Y.z * 0.01);
                mesh.setMatrixAt(k, m);
                const v = rr(0.8, 1.1);
                const warm = rr(0, 0.18);
                mesh.setColorAt(k, col.setRGB(v * (1 + warm), v * (1 + warm * 0.6), v * (1 - warm)));
            }
            mesh.instanceMatrix.needsUpdate = true;
            mesh.instanceColor.needsUpdate = true;
            mesh.frustumCulled = false;
            head.add(mesh);
            return head;
        };
        const makeHead = PLANT_FICUS ? makeLeafHead : makeDaisyHead;
        const daisyDraws = layers.reduce((acc, L) => acc + L.n * 5, 0);

        const V = (x, y, z) => new THREE.Vector3(x, y, z);
        const items = [];
        for (let i = 0; i < N; i++) {
            const phi = i * 2.39996 + r(-0.25, 0.25);

            const alpha = 0.05 + 0.62 * Math.sqrt(i / (N - 1)) + r(-0.03, 0.03);
            const len = 0.46 - 0.12 * (alpha / 0.7) + r(-0.02, 0.02);
            const Pv = V(Math.sin(alpha) * Math.cos(phi), Math.cos(alpha), Math.sin(alpha) * Math.sin(phi)).multiplyScalar(len);
            const Dv = Pv.clone().normalize().add(V(0, 0.35, 0)).add(V(r(-0.08, 0.08), 0, r(-0.08, 0.08))).normalize();

            const rho = Math.sqrt((i + 0.5) / N);
            const lx = 0.16 * rho * Math.cos(phi);
            const Pl = V(lx, 0.03 + 0.03 * (1 - rho) + r(0, 0.02), 0.27 + 0.19 * rho * Math.sin(phi));
            const Dl = V((lx / 0.16) * 0.22, 1, 0.22 + r(-0.1, 0.1)).normalize();

            const ba = r(0, TAU), br = 0.022 * Math.sqrt(rng());
            const bx = Math.cos(ba) * br, bz = Math.sin(ba) * br;
            const by = (bz + 0.022) * 0.6;
            const bow = V(r(-0.012, 0.012), r(-0.006, 0.012), r(-0.012, 0.012));

            const Cv = [
                V(bx, -0.26, bz), V(bx * 0.55, -0.11, bz * 0.55), V(0, 0, 0),
                Pv.clone().multiplyScalar(0.5).add(bow), Pv.clone().addScaledVector(Dv, -0.01)
            ];
            const Cl = [
                V(bx, by, -0.26), V(bx * 0.55, by * 0.55, -0.11), V(0, 0, 0),
                Pl.clone().multiplyScalar(0.5).add(bow).add(V(0, 0.012, 0)), Pl.clone().addScaledVector(Dl, -0.01)
            ];

            if (PLANT_FICUS) for (let q = 0; q < daisyDraws; q++) rng();
            const head = makeHead();
            head.scale.setScalar(r(0.92, 1.12));
            const stem = new THREE.Mesh(new THREE.BufferGeometry(), stemMat);
            group.add(head, stem);
            items.push({ head, stem, Pv, Dv, Pl, Dl, Cv, Cl, roll: r(0, TAU) });
        }
        return { group, items };
    }

    _applyBouquetPose(blend) {
        const e = blend * blend * (3 - 2 * blend);
        const Z = new THREE.Vector3(0, 0, 1);
        const qRoll = new THREE.Quaternion();
        const pos = new THREE.Vector3();
        const dir = new THREE.Vector3();
        for (const f of this.flowers.items) {
            pos.lerpVectors(f.Pl, f.Pv, e);
            dir.lerpVectors(f.Dl, f.Dv, e).normalize();
            f.head.position.copy(pos);
            f.head.quaternion.setFromUnitVectors(Z, dir).multiply(qRoll.setFromAxisAngle(Z, f.roll));
            const pts = f.Cl.map((c, k) => c.clone().lerp(f.Cv[k], e));
            f.stem.geometry.dispose();
            f.stem.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), 22, PLANT_FICUS ? 0.0055 : 0.0042, 5, false);
        }
    }

    _flushBouquet() {
        const st = this.flowers;
        st.group.position.copy(st.T);
        if (st.blend !== st.appliedBlend) {
            this._applyBouquetPose(st.blend);
            st.appliedBlend = st.blend;
        }
    }

    _tweenBouquet(Tend, blendEnd, duration, done) {
        const st = this.flowers;
        if (st.anim) st.anim.cancelled = true;
        const anim = { cancelled: false };
        st.anim = anim;
        const T0 = st.T.clone(), b0 = st.blend, t0 = performance.now();
        const step = (now) => {
            if (anim.cancelled) return;
            const k = Math.min(1, Math.max(0, (now - t0) / (duration * 1000)));
            const e = k * k * (3 - 2 * k);
            st.T.lerpVectors(T0, Tend, e);
            st.blend = b0 + (blendEnd - b0) * e;
            this._flushBouquet();
            if (k < 1) {
                requestAnimationFrame(step);
            } else {
                st.anim = null;
                if (done) done();
            }
        };
        requestAnimationFrame(step);
    }

    enableDragging(camera, domElement, uiPromptCallback, options = {}) {
        this.disableDragging();
        const st = this.flowers;
        const say = (msg) => { (uiPromptCallback || this._ui || (() => {}))(msg); };
        const rc = new THREE.Raycaster();
        const ndc = new THREE.Vector2();
        const target = new THREE.Vector3();
        const baseCursor = domElement.style.cursor;
        const useCrosshair = () => !!options.crosshair || !!document.pointerLockElement;
        const clamp = THREE.MathUtils.clamp;
        let drag = null;
        let lastT = 0;

        const setNdc = (e) => {
            if (useCrosshair()) { ndc.set(0, 0); return; }
            const rect = domElement.getBoundingClientRect();
            ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
        };
        const pickBouquet = (cam) => {
            cam.updateMatrixWorld();
            rc.setFromCamera(ndc, cam);
            st.group.updateMatrixWorld(true);
            return rc.intersectObject(st.group, true)[0];
        };

        const tick = (cam) => {
            if (!drag) return;
            const now = performance.now();
            const dt = Math.min(0.05, (now - lastT) / 1000);
            lastT = now;
            if (useCrosshair()) ndc.set(0, 0);
            cam.updateMatrixWorld();
            rc.setFromCamera(ndc, cam);
            target.copy(rc.ray.direction).multiplyScalar(drag.dist).add(rc.ray.origin);
            target.y -= 0.3;
            st.vaseCatcher.updateMatrixWorld(true);
            drag.overVase = rc.intersectObject(st.vaseCatcher, false).length > 0
                || target.distanceTo(st.vaseT) < 0.45;
            if (drag.overVase) target.copy(st.hoverT);
            target.x = clamp(target.x, st.bounds.minX, st.bounds.maxX);
            target.z = clamp(target.z, st.bounds.minZ, st.bounds.maxZ);
            target.y = clamp(target.y, 0.3, 2.6);
            st.T.lerp(target, 1 - Math.exp(-dt * 18));
            st.blend = Math.min(1, st.blend + dt / 0.3);
            this._flushBouquet();
        };

        const loop = () => {
            if (!drag) return;
            if (performance.now() - (this._renderHookAt || 0) > 100) tick(camera);
            requestAnimationFrame(loop);
        };

        const onDown = (e) => {
            if (st.placed || e.button !== 0) return;
            setNdc(e);
            const h = pickBouquet(camera);
            if (!h) return;
            e.stopImmediatePropagation();
            e.preventDefault();
            if (st.anim) { st.anim.cancelled = true; st.anim = null; }
            drag = { overVase: false, dist: clamp(h.distance, 0.9, 2.2) };
            this.isDragging = true;
            this._dragTick = tick;
            domElement.style.cursor = 'grabbing';
            if (!document.pointerLockElement) {
                try { domElement.setPointerCapture(e.pointerId); } catch (err) { }
            }
            lastT = performance.now();
            requestAnimationFrame(loop);
        };

        const onMove = (e) => {
            if (document.pointerLockElement && !options.crosshair) return;
            if (!document.pointerLockElement) setNdc(e);
            if (!drag && !st.placed && !document.pointerLockElement && e.target === domElement) {
                domElement.style.cursor = pickBouquet(camera) ? 'grab' : baseCursor;
            }
        };

        const onUp = () => {
            if (!drag) return;
            const dropped = drag.overVase;
            drag = null;
            this.isDragging = false;
            this._dragTick = null;
            domElement.style.cursor = baseCursor;
            if (dropped) {
                this._tweenBouquet(st.vaseT, 1, 0.45, () => {
                    st.placed = true;
                    const idx = this.interactables.indexOf(st.group);
                    if (idx >= 0) this.interactables.splice(idx, 1);
                    say('Colocas las flores en el jarrón. Ahora sí, todo está en su lugar.');
                });
            } else {
                this._tweenBouquet(st.lyingT, 0, 0.5);
            }
        };

        document.addEventListener('pointerdown', onDown, { capture: true });
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('mouseup', onUp);
        window.addEventListener('pointercancel', onUp);
        window.addEventListener('blur', onUp);
        this._dragCleanup = () => {
            document.removeEventListener('pointerdown', onDown, { capture: true });
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('mouseup', onUp);
            window.removeEventListener('pointercancel', onUp);
            window.removeEventListener('blur', onUp);
            domElement.style.cursor = baseCursor;
            drag = null;
            this.isDragging = false;
            this._dragTick = null;
        };
    }

    disableDragging() {
        this.disableBookDragging();
        if (this._dragCleanup) {
            this._dragCleanup();
            this._dragCleanup = null;
        }
    }

    // Estante de madera oscura (W = 1.0m, H = 2.0m, D = 0.36m para acomodar los libros de doble tamaño)
    createBookshelf(W = 1.0, H = 2.0, D = 0.36) {
        const T = 0.02;
        const surfaces = [H * 0.15, H * 0.45, H * 0.75];
        // 3 posiciones horizontales redistribuidas para el ancho de 1 metro
        const slotX = [-0.28, 0, 0.28];
        const g = new THREE.Group();
        const wood = stdMat(0xffffff, 0.55, 0.08, { map: this.createWoodTexture([58, 32, 22]), emissive: 0x100804 });
        const add = (w, h, d, x, y, z) => {
            const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wood);
            m.position.set(x, y, z);
            g.add(m);
            return m;
        };
        add(T, H, D, -(W / 2 - T / 2), H / 2, 0);                  // lateral izquierdo
        add(T, H, D, W / 2 - T / 2, H / 2, 0);                     // lateral derecho
        add(W - T * 2, H, 0.01, 0, H / 2, -D / 2 + 0.005);         // fondo
        for (const sy of surfaces) add(W - T * 2, T, D - 0.01, 0, sy - T / 2, 0.005); // estantes
        add(W, T, D, 0, H - T / 2, 0);                             // tapa
        add(W - T * 2, 0.03, D - 0.04, 0, 0.015, 0);               // zócalo hundido
        return { group: g, width: W, height: H, depth: D, surfaces, slotX };
    }

    createBook({ color, t, h, d }) {
        const g = new THREE.Group();
        const c = 0.004;
        const cover = stdMat(color, 0.7, 0.05, { emissive: new THREE.Color(color).multiplyScalar(0.12) });
        const pages = stdMat(0xe8dcc0, 0.9, 0, { emissive: 0x2a2418 });
        const gold = stdMat(0xc9a35a, 0.45, 0.6, { emissive: 0x201808 });
        const add = (w, hh, dd, mat, x, y, z) => {
            const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, dd), mat);
            m.position.set(x, y, z);
            g.add(m);
        };
        add(c, h, d, cover, t / 2 - c / 2, 0, 0);
        add(c, h, d, cover, -t / 2 + c / 2, 0, 0);
        add(t, h, c, cover, 0, 0, d / 2 - c / 2);
        add(t - c * 2, h - 0.008, d - c - 0.003, pages, 0, 0, (0.003 - c) / 2);
        add(t + 0.002, 0.012, c + 0.002, gold, 0, h * 0.22, d / 2 - c / 2);
        add(t + 0.002, 0.008, c + 0.002, gold, 0, -h * 0.3, d / 2 - c / 2);
        return g;
    }

    _slotPos(slot, book) {
        return new THREE.Vector3(slot.x, slot.surfaceY + book.h / 2 + 0.001, slot.z);
    }

    _tweenBook(book, posEnd, quatEnd, duration, done) {
        if (book.anim) book.anim.cancelled = true;
        const anim = { cancelled: false };
        book.anim = anim;
        const p0 = book.group.position.clone();
        const q0 = book.group.quaternion.clone();
        const t0 = performance.now();
        const step = (now) => {
            if (anim.cancelled) return;
            const k = Math.min(1, Math.max(0, (now - t0) / (duration * 1000)));
            const e = k * k * (3 - 2 * k);
            book.group.position.lerpVectors(p0, posEnd, e);
            book.group.quaternion.copy(q0).slerp(quatEnd, e);
            if (k < 1) {
                requestAnimationFrame(step);
            } else {
                book.anim = null;
                if (done) done();
            }
        };
        requestAnimationFrame(step);
    }

    enableBookDragging(camera, domElement, uiPromptCallback, options = {}) {
        this.disableBookDragging();
        const books = this.books;
        const sh = this.shelf;
        const say = (msg) => { (uiPromptCallback || this._ui || (() => {}))(msg); };
        const rc = new THREE.Raycaster();
        const ndc = new THREE.Vector2();
        const target = new THREE.Vector3();
        const baseCursor = domElement.style.cursor;
        const useCrosshair = () => !!options.crosshair || !!document.pointerLockElement;
        const clamp = THREE.MathUtils.clamp;
        const upright = new THREE.Quaternion();
        const halfW = ROOM_WIDTH / 2;
        const bounds = { minX: -halfW + 0.15, maxX: halfW - 0.15, minZ: sh.catcher.position.z + 0.1, maxZ: sh.catcher.position.z + 6.7 };
        let drag = null;
        let lastT = 0;

        const setNdc = (e) => {
            if (useCrosshair()) { ndc.set(0, 0); return; }
            const rect = domElement.getBoundingClientRect();
            ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
        };
        const pickBook = (cam) => {
            cam.updateMatrixWorld();
            rc.setFromCamera(ndc, cam);
            const groups = books.filter((b) => !b.placed).map((b) => b.group);
            groups.forEach((gr) => gr.updateMatrixWorld(true));
            const h = rc.intersectObjects(groups, true)[0];
            if (!h) return null;
            let o = h.object;
            while (o && !books.some((b) => b.group === o)) o = o.parent;
            const book = books.find((b) => b.group === o);
            return book ? { book, distance: h.distance } : null;
        };
        const nearestSlot = () => {
            sh.catcher.updateMatrixWorld(true);
            const hit = rc.intersectObject(sh.catcher, false)[0];
            const P = hit ? hit.point : target;
            let best = null;
            let bd = hit ? Infinity : 0.25;
            for (const s of sh.slots) {
                if (s.book) continue;
                const d = P.distanceTo(s.center);
                if (d < bd) { bd = d; best = s; }
            }
            return best;
        };

        const tick = (cam) => {
            if (!drag) return;
            const now = performance.now();
            const dt = Math.min(0.05, (now - lastT) / 1000);
            lastT = now;
            if (useCrosshair()) ndc.set(0, 0);
            cam.updateMatrixWorld();
            rc.setFromCamera(ndc, cam);
            target.copy(rc.ray.direction).multiplyScalar(drag.dist).add(rc.ray.origin);
            target.x = clamp(target.x, bounds.minX, bounds.maxX);
            target.z = clamp(target.z, bounds.minZ, bounds.maxZ);
            target.y = clamp(target.y, 0.12, 1.9);
            drag.slot = nearestSlot();
            const b = drag.book;
            const goal = drag.slot ? this._slotPos(drag.slot, b) : target;
            b.group.position.lerp(goal, 1 - Math.exp(-dt * 18));
            b.group.quaternion.slerp(upright, 1 - Math.exp(-dt * 10));
        };

        const loop = () => {
            if (!drag) return;
            if (performance.now() - (this._renderHookAt || 0) > 100) tick(camera);
            requestAnimationFrame(loop);
        };

        const onDown = (e) => {
            if (drag || this.isDragging || e.button !== 0) return;
            setNdc(e);
            const p = pickBook(camera);
            if (!p) return;
            e.stopImmediatePropagation();
            e.preventDefault();
            if (p.book.anim) { p.book.anim.cancelled = true; p.book.anim = null; }
            drag = { book: p.book, dist: clamp(p.distance, 0.7, 2.0), slot: null };
            this.isDraggingBook = true;
            this._bookTick = tick;
            domElement.style.cursor = 'grabbing';
            if (!document.pointerLockElement) {
                try { domElement.setPointerCapture(e.pointerId); } catch (err) { }
            }
            lastT = performance.now();
            requestAnimationFrame(loop);
        };

        const onMove = (e) => {
            if (document.pointerLockElement && !options.crosshair) return;
            if (!document.pointerLockElement) setNdc(e);
            if (!drag && !this.isDragging && !document.pointerLockElement && e.target === domElement) {
                domElement.style.cursor = pickBook(camera) ? 'grab' : baseCursor;
            }
        };

        const onUp = () => {
            if (!drag) return;
            const { book, slot } = drag;
            drag = null;
            this.isDraggingBook = false;
            this._bookTick = null;
            domElement.style.cursor = baseCursor;
            if (slot && !slot.book) {
                slot.book = book;
                book.placed = true;
                const idx = this.interactables.indexOf(book.group);
                if (idx >= 0) this.interactables.splice(idx, 1);
                this._tweenBook(book, this._slotPos(slot, book), upright, 0.25, () => {
                    const left = books.filter((b) => !b.placed).length;
                    say(left === 0
                        ? 'Todos los libros están en el estante. Cada cosa en su lugar.'
                        : 'Acomodas el libro en el estante.');
                });
            } else {
                this._tweenBook(book, book.floorPos, book.floorQuat, 0.5);
            }
        };

        document.addEventListener('pointerdown', onDown, { capture: true });
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('mouseup', onUp);
        window.addEventListener('pointercancel', onUp);
        window.addEventListener('blur', onUp);
        this._bookDragCleanup = () => {
            document.removeEventListener('pointerdown', onDown, { capture: true });
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('mouseup', onUp);
            window.removeEventListener('pointercancel', onUp);
            window.removeEventListener('blur', onUp);
            domElement.style.cursor = baseCursor;
            drag = null;
            this.isDraggingBook = false;
            this._bookTick = null;
        };
    }

    disableBookDragging() {
        if (this._bookDragCleanup) {
            this._bookDragCleanup();
            this._bookDragCleanup = null;
        }
    }

    drawDahliaCanvas(c, cx, cy, R, alpha = 1) {
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
                c.strokeStyle = 'rgba(120,50,30,0.18)';
                c.lineWidth = Math.max(1, R * 0.008);
                c.stroke();
                c.restore();
            }
        }
        c.restore();
    }

    createPainting() {
        const fw = 0.72, fh = 0.96, fd = 0.05;
        const frame = new THREE.Mesh(
            new THREE.BoxGeometry(fw, fh, fd),
            stdMat(0xffffff, 0.5, 0.1, { map: this.createWoodTexture([58, 32, 22]), emissive: 0x100804 })
        );
        const tex = this.createPaintingTexture();
        const art = new THREE.Mesh(
            new THREE.PlaneGeometry(fw - 0.1, fh - 0.1),
            new THREE.MeshStandardMaterial({
                map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.8,
                roughness: 0.4, metalness: 0
            })
        );
        art.position.z = fd / 2 + 0.002;
        frame.add(art);

        const glass = new THREE.Mesh(
            new THREE.PlaneGeometry(fw - 0.1, fh - 0.1),
            new THREE.MeshBasicMaterial({ map: this.createGlassSheenTexture(), transparent: true, depthWrite: false })
        );
        glass.position.z = fd / 2 + 0.004;
        frame.add(glass);
        return { frame, parts: [art, glass] };
    }

    createPaintingTexture() {
        const w = 384, h = 512;
        const cv = canvasOf(w, h);
        const c = cv.getContext('2d');

        const bg = c.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0.0, '#2a7678');
        bg.addColorStop(0.3, '#154a4f');
        bg.addColorStop(0.65, '#071f23');
        bg.addColorStop(1.0, '#03121a');
        c.fillStyle = bg;
        c.fillRect(0, 0, w, h);

        const glow = c.createRadialGradient(w * 0.55, h * 0.55, 0, w * 0.55, h * 0.55, w * 0.6);
        glow.addColorStop(0, 'rgba(255,190,160,0.14)');
        glow.addColorStop(1, 'rgba(255,190,160,0)');
        c.fillStyle = glow;
        c.fillRect(0, 0, w, h);

        c.strokeStyle = '#2a7a3e';
        c.lineWidth = 8;
        c.beginPath();
        c.moveTo(w * 0.55, h * 0.62);
        c.quadraticCurveTo(w * 0.5, h * 0.8, w * 0.52, h);
        c.stroke();
        c.fillStyle = '#2f8a46';
        for (const [x, y, rot, sx] of [[0.5, 0.78, -1.0, 1], [0.56, 0.86, 0.9, 0.9], [0.48, 0.95, -0.5, 0.8]]) {
            c.save();
            c.translate(w * x, h * y);
            c.rotate(rot);
            c.scale(sx, 1);
            c.beginPath();
            c.ellipse(0, -w * 0.12, w * 0.06, w * 0.13, 0, 0, Math.PI * 2);
            c.fill();
            c.restore();
        }

        this.drawDahliaCanvas(c, w * 0.55, h * 0.55, w * 0.36, 0.95);

        const vg = c.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, h * 0.7);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,0.35)');
        c.fillStyle = vg;
        c.fillRect(0, 0, w, h);
        return texOf(cv);
    }

    createGlassSheenTexture() {
        const cv = canvasOf(128, 256);
        const c = cv.getContext('2d');
        const g = c.createLinearGradient(0, 0, 128, 256);
        g.addColorStop(0.0, 'rgba(170,235,230,0.16)');
        g.addColorStop(0.28, 'rgba(170,235,230,0.05)');
        g.addColorStop(0.32, 'rgba(0,0,0,0)');
        g.addColorStop(0.62, 'rgba(0,0,0,0)');
        g.addColorStop(0.7, 'rgba(170,235,230,0.06)');
        g.addColorStop(0.8, 'rgba(0,0,0,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, 128, 256);
        return texOf(cv);
    }

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

    createRoomFloorTexture(W, D) {
        const ppm = 280;
        const w = Math.round(W * ppm), h = Math.round(D * ppm);
        const cv = canvasOf(w, h);
        const c = cv.getContext('2d');
        c.fillStyle = '#dcbc94';
        c.fillRect(0, 0, w, h);

        const plankW = 0.19 * ppm;
        const cols = Math.ceil(w / plankW);
        const TAU = Math.PI * 2;

        const drawPlank = (x, y, pw, len) => {
            c.save();
            c.beginPath();
            c.rect(x, y, pw, len);
            c.clip();

            const t = rnd(-9, 9);
            c.fillStyle = `rgb(${Math.round(221 + t)},${Math.round(189 + t)},${Math.round(149 + t * 1.1)})`;
            c.fillRect(x, y, pw, len);

            for (let i = 0; i < 5; i++) {
                const bw = rnd(pw * 0.25, pw * 0.8);
                const bx = x + rnd(0, pw);
                const warm = Math.random() > 0.5;
                const rgb = warm ? '198,152,108' : '238,214,178';
                const a = warm ? rnd(0.08, 0.2) : rnd(0.1, 0.22);
                const g = c.createLinearGradient(bx - bw / 2, 0, bx + bw / 2, 0);
                g.addColorStop(0, `rgba(${rgb},0)`);
                g.addColorStop(0.5, `rgba(${rgb},${a})`);
                g.addColorStop(1, `rgba(${rgb},0)`);
                c.fillStyle = g;
                c.fillRect(bx - bw / 2, y, bw, len);
            }

            for (let i = 0; i < pw * 0.9; i++) {
                const gx = x + rnd(0, pw);
                const dark = Math.random() < 0.6;
                c.strokeStyle = dark
                    ? `rgba(122,84,50,${rnd(0.04, 0.16)})`
                    : `rgba(247,228,194,${rnd(0.05, 0.14)})`;
                c.lineWidth = rnd(0.5, 1.4);
                const amp = rnd(0.5, 2.8), ph = rnd(0, TAU), fr = rnd(0.004, 0.012);
                c.beginPath();
                c.moveTo(gx, y);
                for (let yy = y; yy <= y + len + 16; yy += 16) c.lineTo(gx + Math.sin(yy * fr + ph) * amp, yy);
                c.stroke();
            }

            if (Math.random() < 0.2) {
                const kx = x + rnd(pw * 0.25, pw * 0.75), ky = y + rnd(len * 0.1, len * 0.9);
                const kr = rnd(5, 10);
                c.save();
                c.translate(kx, ky);
                c.scale(1, 2.4);
                const kg = c.createRadialGradient(0, 0, 0, 0, 0, kr * 1.8);
                kg.addColorStop(0, 'rgba(112,72,42,0.6)');
                kg.addColorStop(0.45, 'rgba(140,96,60,0.32)');
                kg.addColorStop(1, 'rgba(140,96,60,0)');
                c.fillStyle = kg;
                c.fillRect(-kr * 2, -kr * 2, kr * 4, kr * 4);
                c.strokeStyle = 'rgba(100,66,38,0.3)';
                c.lineWidth = 0.8;
                for (let q = 1; q <= 3; q++) {
                    c.beginPath();
                    c.arc(0, 0, kr * 0.35 * q, 0, TAU);
                    c.stroke();
                }
                c.restore();
            }

            const sh = c.createLinearGradient(x, 0, x + pw, 0);
            sh.addColorStop(0, 'rgba(255,242,220,0.08)');
            sh.addColorStop(0.5, 'rgba(255,242,220,0)');
            sh.addColorStop(1, 'rgba(90,60,30,0.06)');
            c.fillStyle = sh;
            c.fillRect(x, y, pw, len);
            c.restore();

            c.fillStyle = 'rgba(92,64,38,0.5)';
            c.fillRect(x, y, 1.6, len);
            c.fillRect(x, y, pw, 1.6);
            c.fillStyle = 'rgba(252,236,208,0.32)';
            c.fillRect(x + 1.6, y, 1, len);
            c.fillRect(x, y + 1.6, pw, 1);
        };

        for (let col = 0; col < cols; col++) {
            const x0 = col * plankW;
            const pw = Math.min(plankW, w - x0);
            let y = -rnd(0.2, 1.4) * ppm;
            while (y < h) {
                const len = rnd(1.1, 2.4) * ppm;
                drawPlank(x0, y, pw, len);
                y += len;
            }
        }

        for (let i = 0; i < 10; i++) {
            const x = rnd(0, w), y = rnd(0, h), r = rnd(120, 320);
            const g = c.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, 'rgba(255,238,210,0.07)');
            g.addColorStop(1, 'rgba(255,238,210,0)');
            c.fillStyle = g;
            c.fillRect(x - r, y - r, r * 2, r * 2);
        }
        for (let i = 0; i < 20000; i++) {
            c.fillStyle = Math.random() > 0.5
                ? `rgba(90,60,30,${rnd(0.02, 0.06)})`
                : `rgba(255,240,215,${rnd(0.02, 0.05)})`;
            c.fillRect(rnd(0, w), rnd(0, h), 1.5, 1.5);
        }
        return texOf(cv);
    }

    createBlobTexture() {
        const cv = canvasOf(128, 128);
        const c = cv.getContext('2d');
        const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
        g.addColorStop(0, 'rgba(0,0,0,0.9)');
        g.addColorStop(0.55, 'rgba(0,0,0,0.45)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, 128, 128);
        return texOf(cv, false);
    }

    interact(object, uiPromptCallback) {
        this._ui = uiPromptCallback;
        if (object.userData.id === 'entryDoor') {
            if (!this.isDoorUnlocked) {
                uiPromptCallback('La puerta está trabada. Sientes que estás ignorando detalles en el entorno...');
            } else {
                uiPromptCallback('Aceptas la realidad. La puerta de Negación se ha abierto.');
            }
        }

        if (object.userData.id === 'clock' && !object.userData.accepted) {
            object.userData.accepted = true;
            this.anomaliesAccepted++;
            this.startClock();
            uiPromptCallback('Reconoces que el tiempo se había detenido. Las agujas vuelven a moverse.');
            this.checkProgress(uiPromptCallback);
        }

        if (object.userData.id === 'drawer' && !object.userData.accepted) {
            object.userData.accepted = true;
            this.closeDrawer();
            uiPromptCallback('Empujas el cajón hasta dejarlo al ras.');
        }

        if (object.userData.id === 'frame' && !object.userData.accepted) {
            object.userData.accepted = true;
            this.frame.rotation.z = 0;
            this.anomaliesAccepted++;
            uiPromptCallback('Aceptas la distorsión del entorno.');
            this.checkProgress(uiPromptCallback);
        }
    }

    startClock() {
        if (this.clockRunning) return;
        this.clockRunning = true;
        const { hourHand, minuteHand, secondHand } = this.clockHands;
        const { h, m, s } = CLOCK_STOPPED;
        const TAU = Math.PI * 2;
        const base = (h % 12) * 3600 + m * 60 + s;
        const t0 = performance.now();
        const tick = (now) => {
            const elapsed = Math.max(0, (now - t0) / 1000);
            const whole = Math.floor(elapsed);
            const jump = Math.min(1, (elapsed - whole) / 0.15);
            const total = base + whole + (1 - Math.pow(1 - jump, 3));
            hourHand.rotation.z = -((total / 43200) % 1) * TAU;
            minuteHand.rotation.z = -(((total % 3600) / 3600)) * TAU;
            secondHand.rotation.z = -(((total % 60) / 60)) * TAU;
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    closeDrawer(duration = 420) {
        const drawer = this.drawer;
        const from = drawer.position.x;
        const t0 = performance.now();
        const step = (now) => {
            const k = Math.min(1, Math.max(0, (now - t0) / duration));
            const eased = 1 - Math.pow(1 - k, 3);
            drawer.position.x = from * (1 - eased);
            if (k < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    checkProgress(uiPromptCallback) {
        if (this.anomaliesAccepted >= this.totalAnomalies) {
            this.isDoorUnlocked = true;
            this.doorMaterial.color.setHex(0x7fd1a0);
            this.doorMaterial.emissive.setHex(0x07281a);
            setTimeout(() => {
                uiPromptCallback('La puerta 1 (Negación) se ha desbloqueado.');
            }, 1500);
        }
    }
}

export function addLensEffects(container = document.body) {
    const blur = document.createElement('div');
    blur.style.cssText = [
        'position:absolute', 'inset:0', 'pointer-events:none', 'z-index:4',
        'backdrop-filter:blur(3px)', '-webkit-backdrop-filter:blur(3px)',
        '-webkit-mask-image:radial-gradient(ellipse 55% 50% at 52% 50%, transparent 55%, #000 100%)',
        'mask-image:radial-gradient(ellipse 55% 50% at 52% 50%, transparent 55%, #000 100%)'
    ].join(';');
    const vignette = document.createElement('div');
    vignette.style.cssText = [
        'position:absolute', 'inset:0', 'pointer-events:none', 'z-index:5',
        'background:radial-gradient(ellipse 70% 65% at 50% 52%, rgba(0,0,0,0) 40%, rgba(0,8,10,0.55) 80%, rgba(0,6,8,0.85) 100%)'
    ].join(';');
    container.append(blur, vignette);
    return () => { blur.remove(); vignette.remove(); };
}