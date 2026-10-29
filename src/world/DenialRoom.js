import * as THREE from 'three';

const rnd = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------------------
//  Utilidades y constantes de la habitación interior de Negación
// ---------------------------------------------------------------------------

const FRAME_TILT = 0.12;

const CLOCK_STOPPED = { h: 3, m: 17, s: 41 };

const DRAWER_OUT = 0.07;

const LOOK = {
    wallGlow: 0.34,       
    wallBottomDark: 0.6,  
    floorGlow: 1.0,       
    reflection: 0.5,      
    keyLight: 1.5,        
    backLight: 0.6,       
    vaseLight: 1.3,       
    vaseGloss: 1.5,       
    petalGlow: 0.4        
};

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
            if (this._dragTick) this._dragTick(camera);
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
        const W = 3.5, H = 4.0, D = 7.0;
        const halfW = W / 2;
        const Z = (s) => doorZ - s;
        const backZ = Z(D);
        const group = new THREE.Group();
        this.roomGroup = group;

        const modern = parseInt(THREE.REVISION, 10) >= 155;
        const lum = (v) => (modern ? v * Math.PI : v);

        const baked = (tex) => new THREE.MeshStandardMaterial({
            map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 1,
            color: 0x666666, roughness: 0.95, metalness: 0
        });

        const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(D, H), baked(this.createRoomWallTexture('side', true)));
        leftWall.rotation.y = Math.PI / 2;
        leftWall.position.set(-halfW, H / 2, Z(D / 2));
        group.add(leftWall);

        const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(D, H), baked(this.createRoomWallTexture('side', false)));
        rightWall.rotation.y = -Math.PI / 2;
        rightWall.position.set(halfW, H / 2, Z(D / 2));
        group.add(rightWall);

        const backWall = new THREE.Mesh(new THREE.PlaneGeometry(W, H), baked(this.createRoomWallTexture('back', true)));
        backWall.position.set(0, H / 2, backZ);
        group.add(backWall);

        const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), baked(this.createRoomFloorTexture()));
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(0, 0, Z(D / 2));
        group.add(floor);

        const ceiling = new THREE.Mesh(
            new THREE.PlaneGeometry(W, D),
            stdMat(0x04161a, 0.95, 0, { emissive: 0x041a1d })
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
        const dresserS = sofaS;

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
        blob(1.0, 2.0, -halfW + 0.55, dresserS, 0.8);
        blob(1.15, 2.9, halfW - 0.55, sofaS, 0.85);
        blob(0.46, 0.46, vasePos.x, vaseS, 0.85);

        const clock = this.createClock(0.95);
        clock.group.position.set(0, 1.75, backZ);
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

        const keyLight = new THREE.SpotLight(0x86dccf, lum(LOOK.keyLight), 9, 0.9, 1, 0);
        keyLight.position.set(0, H - 0.2, Z(3.4));
        keyLight.target.position.set(0, 0, Z(3.9));
        group.add(keyLight, keyLight.target);

        const rimLight = new THREE.SpotLight(0x5fc4bb, lum(0.7), 8, 0.8, 1, 0);
        rimLight.position.set(0.2, H - 0.3, Z(D - 0.8));
        rimLight.target.position.set(0, 0.6, Z(sofaS));
        group.add(rimLight, rimLight.target);

        const backSpot = new THREE.SpotLight(0x6fbfb8, lum(LOOK.backLight), 8, 0.55, 1, 0);
        backSpot.position.set(0, H - 0.4, Z(2.2));
        backSpot.target.position.set(0, 1.7, backZ);
        group.add(backSpot, backSpot.target);

        const vaseSpot = new THREE.SpotLight(0xcff0ea, lum(LOOK.vaseLight), 5, 0.38, 0.9, 0);
        vaseSpot.position.set(vasePos.x - 0.8, 2.4, vasePos.z + 0.9);
        vaseSpot.target.position.set(vasePos.x, 0.4, vasePos.z);
        group.add(vaseSpot, vaseSpot.target);

        const dresserGlow = new THREE.PointLight(0xcfeee8, lum(0.4), 1.7, 0);
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

        const body = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.07, R + 0.07, 0.12, 96), walnut);
        body.rotation.x = Math.PI / 2;
        body.position.z = 0.06;
        add(body);

        const faceTex = this.createClockFaceTexture();
        const face = new THREE.Mesh(
            new THREE.CircleGeometry(R, 96),
            new THREE.MeshStandardMaterial({
                map: faceTex, emissiveMap: faceTex, emissive: 0xffffff, emissiveIntensity: 0.9,
                roughness: 0.35, metalness: 0
            })
        );
        face.position.z = 0.122;
        add(face);

        const bezel = new THREE.Mesh(
            new THREE.TorusGeometry(R + 0.035, 0.035, 16, 96),
            stdMat(0x1c2b2d, 0.35, 0.6, { emissive: 0x050c0d })
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
            const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }), mat);
            m.position.z = z;
            return add(m);
        };
        const { h, m, s } = CLOCK_STOPPED;
        const TAU = Math.PI * 2;
        const hourHand = makeHand(R * 0.52, 0.08, 0.06, cream, 0.010, 0.130);
        const minuteHand = makeHand(R * 0.82, 0.055, 0.07, cream, 0.010, 0.142);
        const secondHand = makeHand(R * 0.90, 0.012, R * 0.18, coral, 0.004, 0.154);
        hourHand.rotation.z = -(((h % 12) + m / 60) / 12) * TAU;
        minuteHand.rotation.z = -((m + s / 60) / 60) * TAU;
        secondHand.rotation.z = -(s / 60) * TAU;

        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 24), coral);
        cap.rotation.x = Math.PI / 2;
        cap.position.z = 0.162;
        add(cap);

        const glass = new THREE.Mesh(
            new THREE.CircleGeometry(R + 0.01, 64),
            new THREE.MeshBasicMaterial({ map: this.createClockGlassTexture(), transparent: true, depthWrite: false })
        );
        glass.position.z = 0.175;
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
        const sheen = new THREE.Color(0x7fd6cf);
        const velvet = new THREE.MeshPhysicalMaterial({
            color: 0x2b7c7e, roughness: 0.92, metalness: 0, emissive: 0x07262a,
            sheen: 1, sheenRoughness: 0.55, sheenColor: sheen
        });
        const velvetDark = new THREE.MeshPhysicalMaterial({
            color: 0x1f6264, roughness: 0.92, metalness: 0, emissive: 0x051c1f,
            sheen: 0.8, sheenRoughness: 0.6, sheenColor: sheen
        });
        const wood = stdMat(0x3a2418, 0.55, 0.1);
        const len = 2.3, dep = 0.8;

        for (const sx of [-1, 1]) {
            for (const sz of [-1, 1]) {
                const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.14, 10), wood);
                leg.position.set(sx * (dep / 2 - 0.1), 0.07, sz * (len / 2 - 0.12));
                g.add(leg);
            }
        }

        const base = new THREE.Mesh(roundedBox(dep, 0.2, len, 0.05), velvetDark);
        base.position.y = 0.24;
        g.add(base);

        const cw = (len - 0.32) / 3;
        for (let i = 0; i < 3; i++) {
            const z = (i - 1) * cw;
            const seat = new THREE.Mesh(roundedBox(0.6, 0.17, cw - 0.02, 0.06), velvet);
            seat.position.set(-0.08, 0.425, z);
            g.add(seat);
            const back = new THREE.Mesh(roundedBox(0.2, 0.5, cw - 0.02, 0.07), velvet);
            back.position.set(dep / 2 - 0.12, 0.68, z);
            back.rotation.z = -0.1;
            g.add(back);
        }

        for (const sz of [-1, 1]) {
            const arm = new THREE.Mesh(roundedBox(dep - 0.04, 0.46, 0.16, 0.06), velvetDark);
            arm.position.set(0, 0.53, sz * (len / 2 - 0.08));
            g.add(arm);
        }
        return g;
    }

    createVase() {
        const prof = [
            [0, 0], [0.045, 0], [0.072, 0.002], [0.088, 0.012], [0.108, 0.04], [0.131, 0.09], [0.14, 0.15],
            [0.131, 0.21], [0.102, 0.258], [0.07, 0.295], [0.052, 0.318], [0.05, 0.334], [0.058, 0.35],
            [0.0645, 0.3575], [0.0605, 0.3595], [0.057, 0.3565],
            [0.048, 0.34], [0.0435, 0.322], [0.05, 0.298], [0.078, 0.262], [0.11, 0.214], [0.125, 0.15],
            [0.118, 0.09], [0.095, 0.045], [0.055, 0.03], [0.02, 0.028], [0, 0.028]
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

        const mat = new THREE.MeshPhysicalMaterial({
            color: 0x35918c, roughness: 0.32, metalness: 0, emissive: 0x03201f,
            clearcoat: 1, clearcoatRoughness: 0.06,
            envMap: this.createVaseEnvTexture(), envMapIntensity: LOOK.vaseGloss,
            vertexColors: true
        });
        return new THREE.Mesh(geo, mat);
    }

    createVaseEnvTexture() {
        const W = 512, H = 256;
        const cv = canvasOf(W, H);
        const c = cv.getContext('2d');
        const g = c.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#2c6a6c');
        g.addColorStop(0.5, '#0d2a2d');
        g.addColorStop(1, '#030d0f');
        c.fillStyle = g;
        c.fillRect(0, 0, W, H);

        const box = (x, y, w, h, a) => {
            c.save();
            c.filter = 'blur(5px)';
            c.fillStyle = `rgba(228,255,250,${a})`;
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
        const stemMat = stdMat(0x16241b, 0.6, 0, { emissive: 0x050a07 });

        const layers = [
            { n: 22, len: [0.043, 0.052], z: 0, off: 0, tilt: [-0.3, 0.18], w: 0.28 },
            { n: 13, len: [0.036, 0.044], z: -0.004, off: 0.5, tilt: [-0.55, -0.1], w: 0.26 }
        ];
        const makeHead = () => {
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
            f.stem.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), 22, 0.0042, 5, false);
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
        if (this._dragCleanup) {
            this._dragCleanup();
            this._dragCleanup = null;
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

    createRoomWallTexture(kind, towardBack = true) {
        const w = kind === 'back' ? 512 : 1024;
        const h = kind === 'back' ? 732 : 576;
        const cv = canvasOf(w, h);
        const c = cv.getContext('2d');

        const g = c.createLinearGradient(0, 0, 0, h);
        if (kind === 'back') {
            g.addColorStop(0.0, '#07262b');
            g.addColorStop(0.3, '#10444a');
            g.addColorStop(0.55, '#1a5a5e');
            g.addColorStop(0.8, '#1c5f60');
            g.addColorStop(0.95, '#17504f');
            g.addColorStop(1.0, '#0a2f31');
        } else {
            g.addColorStop(0.0, '#082a30');
            g.addColorStop(0.18, '#17565a');
            g.addColorStop(0.4, '#256f72');
            g.addColorStop(0.65, '#195a5e');
            g.addColorStop(1.0, '#04181c');
        }
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);

        if (kind === 'back') {
            const rg = c.createRadialGradient(w * 0.5, h * 0.5625, 0, w * 0.5, h * 0.5625, w * 0.8);
            rg.addColorStop(0, 'rgba(60,150,150,0.22)');
            rg.addColorStop(1, 'rgba(60,150,150,0)');
            c.fillStyle = rg;
            c.fillRect(0, 0, w, h);
            const e = c.createLinearGradient(0, 0, w, 0);
            e.addColorStop(0, 'rgba(0,0,0,0.45)');
            e.addColorStop(0.25, 'rgba(0,0,0,0)');
            e.addColorStop(0.75, 'rgba(0,0,0,0)');
            e.addColorStop(1, 'rgba(0,0,0,0.45)');
            c.fillStyle = e;
            c.fillRect(0, 0, w, h);
        } else {
            const p = towardBack ? 0.6 : 0.45;
            c.save();
            c.translate((towardBack ? p : 1 - p) * w, h * 0.3);
            c.scale(1, (h * 0.5) / (w * 0.34));
            const gl = c.createRadialGradient(0, 0, 0, 0, 0, w * 0.34);
            gl.addColorStop(0, `rgba(95,195,190,${LOOK.wallGlow})`);
            gl.addColorStop(0.6, `rgba(70,165,165,${LOOK.wallGlow * 0.45})`);
            gl.addColorStop(1, 'rgba(60,150,150,0)');
            c.fillStyle = gl;
            c.fillRect(-w, -h * 3, w * 2, h * 6);
            c.restore();

            const bd = c.createLinearGradient(0, h * 0.55, 0, h);
            bd.addColorStop(0, 'rgba(0,0,0,0)');
            bd.addColorStop(1, `rgba(0,0,0,${LOOK.wallBottomDark})`);
            c.fillStyle = bd;
            c.fillRect(0, h * 0.55, w, h * 0.45);

            const dd = c.createLinearGradient(0, 0, w, 0);
            for (const [q, a] of [[0, 0.7], [0.3, 0.25], [0.7, 0.0], [1, 0.12]]) {
                dd.addColorStop(towardBack ? q : 1 - q, `rgba(0,0,0,${a})`);
            }
            c.fillStyle = dd;
            c.fillRect(0, 0, w, h);
        }

        for (let i = 0; i < 9000; i++) {
            c.fillStyle = Math.random() > 0.5
                ? `rgba(0,0,0,${rnd(0.02, 0.06)})`
                : `rgba(120,200,200,${rnd(0.01, 0.04)})`;
            c.fillRect(rnd(0, w), rnd(0, h), 1.5, 1.5);
        }
        for (let i = 0; i < 60; i++) {
            c.fillStyle = `rgba(0,0,0,${rnd(0.01, 0.035)})`;
            c.fillRect(rnd(0, w), 0, rnd(1, 3), h);
        }
        return texOf(cv);
    }

    createRoomFloorTexture() {
        const w = 512, h = 1024;
        const cv = canvasOf(w, h);
        const c = cv.getContext('2d');
        const fg = LOOK.floorGlow;
        const a = (v) => Math.min(1, v * fg);

        // --- 1. Base: Patrón de damero en diagonal (rombos) ---
        c.save();
        c.translate(w / 2, h / 2);
        c.rotate(Math.PI / 4); 

        const tileSize = 55; 
        const span = 900; 

        const colorLight = '#dcded1'; 
        const colorDark = '#799a9c';  

        for (let y = -span; y < span; y += tileSize) {
            for (let x = -span; x < span; x += tileSize) {
                const col = Math.floor(x / tileSize);
                const row = Math.floor(y / tileSize);
                c.fillStyle = (col + row) % 2 === 0 ? colorLight : colorDark;
                c.fillRect(x, y, tileSize, tileSize);
            }
        }
        c.restore();

        c.fillStyle = 'rgba(10, 45, 50, 0.15)';
        c.fillRect(0, 0, w, h);

        // --- 2. Charco de luz central ---
        c.save();
        c.translate(w * 0.5, h * 0.42);
        c.scale(1, 2.2);
        const g = c.createRadialGradient(0, 0, 0, 0, 0, w * 0.62);
        g.addColorStop(0, `rgba(140,225,205,${a(0.55)})`);
        g.addColorStop(0.4, `rgba(80,170,160,${a(0.35)})`);
        g.addColorStop(1, 'rgba(20,90,92,0)');
        c.fillStyle = g;
        c.fillRect(-w, -h * 2, w * 2, h * 4);
        c.restore();

        // --- 3. Rebote de luz al pie de la pared del fondo ---
        const bk = c.createLinearGradient(0, 0, 0, h * 0.22);
        bk.addColorStop(0, `rgba(110,200,185,${a(0.25)})`);
        bk.addColorStop(1, 'rgba(110,200,185,0)');
        c.fillStyle = bk;
        c.fillRect(0, 0, w, h * 0.22);

        // --- 4. Sombras duras bajo la cómoda (izq.) y el sillón (der.) ---
        const shadowColor = (alpha) => `rgba(4, 22, 26, ${alpha})`;
        
        const L = c.createLinearGradient(0, 0, w * 0.32, 0);
        L.addColorStop(0, shadowColor(0.88));
        L.addColorStop(0.55, shadowColor(0.75));
        L.addColorStop(1, shadowColor(0));
        c.fillStyle = L;
        c.fillRect(0, 0, w * 0.32, h);

        const R = c.createLinearGradient(w, 0, w * 0.56, 0);
        R.addColorStop(0, shadowColor(0.92));
        R.addColorStop(0.55, shadowColor(0.78));
        R.addColorStop(1, shadowColor(0));
        c.fillStyle = R;
        c.fillRect(w * 0.56, 0, w * 0.44, h);

        // --- 5. Entrada más oscura ---
        const F = c.createLinearGradient(0, h, 0, h * 0.7);
        F.addColorStop(0, shadowColor(0.7));
        F.addColorStop(1, shadowColor(0));
        c.fillStyle = F;
        c.fillRect(0, h * 0.7, w, h * 0.3);

        // --- 6. Grano / Textura ---
        for (let i = 0; i < 22000; i++) {
            c.fillStyle = Math.random() > 0.5
                ? `rgba(0,0,0,${rnd(0.03, 0.07)})`
                : `rgba(255,255,255,${rnd(0.01, 0.05)})`;
            c.fillRect(rnd(0, w), rnd(0, h), 2, 2);
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