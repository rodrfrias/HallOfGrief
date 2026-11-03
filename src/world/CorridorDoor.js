import * as THREE from 'three';

// Helpers matemáticos necesarios para las texturas procedurales
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
        this.prefab = this.buildPrefab();
    }

    createDoorTextures() {
        const W = 512, H = 938; 
        const cv = document.createElement('canvas'), bc = document.createElement('canvas');
        cv.width = bc.width = W; cv.height = bc.height = H;
        const c = cv.getContext('2d'), b = bc.getContext('2d');

        const grad = c.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#12303a');
        grad.addColorStop(0.5, '#0f2a33');
        grad.addColorStop(1, '#091a20');
        c.fillStyle = grad; c.fillRect(0, 0, W, H);
        b.fillStyle = '#808080'; b.fillRect(0, 0, W, H);

        for (let i = 0; i < 14000; i++) {
            const x = rnd(0, W), y = rnd(0, H), o = rnd(0, 0.07);
            const dark = Math.random() > 0.5;
            c.fillStyle = dark ? `rgba(0,0,0,${o})` : `rgba(120,190,200,${o * 0.6})`;
            c.fillRect(x, y, 2, 2);
            b.fillStyle = dark ? `rgba(0,0,0,${o * 2})` : `rgba(255,255,255,${o})`;
            b.fillRect(x, y, 2, 2);
        }

        const drawPanel = (x, y, w, h) => {
            c.fillStyle = '#0b2027'; c.fillRect(x, y, w, h);
            b.fillStyle = '#686868'; b.fillRect(x, y, w, h);
            c.strokeStyle = 'rgba(0, 0, 0, 0.65)'; c.lineWidth = 6;
            c.beginPath(); c.moveTo(x, y + h); c.lineTo(x, y); c.lineTo(x + w, y); c.stroke();
            c.strokeStyle = 'rgba(110, 190, 205, 0.16)'; c.lineWidth = 3;
            c.beginPath(); c.moveTo(x + w, y); c.lineTo(x + w, y + h); c.lineTo(x, y + h); c.stroke();
        };
        drawPanel(62, 70, 388, 470);
        drawPanel(62, 590, 388, 270);

        const blotch = (x, y, r, rgb, alpha, bumpGray = null, bumpAlpha = 0.25) => {
            const g = c.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, `rgba(${rgb},${alpha})`);
            g.addColorStop(0.6, `rgba(${rgb},${alpha * 0.45})`);
            g.addColorStop(1, `rgba(${rgb},0)`);
            c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
            if (bumpGray !== null) {
                const gb = b.createRadialGradient(x, y, 0, x, y, r);
                gb.addColorStop(0, `rgba(${bumpGray},${bumpGray},${bumpGray},${bumpAlpha})`);
                gb.addColorStop(1, `rgba(${bumpGray},${bumpGray},${bumpGray},0)`);
                b.fillStyle = gb; b.fillRect(x - r, y - r, r * 2, r * 2);
            }
        };

        const rustTones = ['150,70,25', '120,55,20', '95,42,18', '170,90,35'];
        for (let i = 0; i < 70; i++) {
            const y = H * (1 - Math.pow(Math.random(), 2.2));
            const x = (Math.random() < 0.4) ? (Math.random() < 0.5 ? rnd(0, 60) : rnd(W - 60, W)) : rnd(0, W);
            blotch(x, y, rnd(14, 70), rustTones[Math.floor(Math.random() * rustTones.length)], rnd(0.25, 0.6), 190, 0.18);
        }

        const drawPeel = (cx, cy, r) => {
            const outer = jaggedPoly(cx, cy, r, rndInt(11, 15), 0.45);
            const inner = outer.map(([x, y]) => [cx + (x - cx) * rnd(0.3, 0.65), cy + (y - cy) * rnd(0.3, 0.65)]);
            
            tracePoly(c, outer); c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 5; c.stroke();
            c.fillStyle = '#6b3a1e'; tracePoly(c, outer); c.fill();
            c.fillStyle = Math.random() > 0.5 ? '#3a2415' : '#58595a'; tracePoly(c, inner); c.fill();
            
            b.fillStyle = '#4c4c4c'; tracePoly(b, outer); b.fill();
            b.fillStyle = '#353535'; tracePoly(b, inner); b.fill();
            tracePoly(b, outer); b.strokeStyle = '#d0d0d0'; b.lineWidth = 3; b.stroke();
        };
        for (let i = 0; i < 16; i++) drawPeel(rnd(40, W - 40), H * (1 - Math.pow(Math.random(), 1.6)), rnd(18, 65));

        const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
        const bTex = new THREE.CanvasTexture(bc);
        return { map: tex, bump: bTex };
    }

    createFrameTexture() {
        const S = 256, cv = document.createElement('canvas');
        cv.width = cv.height = S; const c = cv.getContext('2d');
        c.fillStyle = '#05090c'; c.fillRect(0, 0, S, S);
        for (let i = 0; i < 9; i++) {
            const x = rnd(0, S), y = rnd(0, S), r = rnd(20, 60);
            const g = c.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, `rgba(135,62,22,${rnd(0.3, 0.6)})`);
            g.addColorStop(1, 'rgba(135,62,22,0)');
            c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
        }
        for (let i = 0; i < 1800; i++) {
            c.fillStyle = `rgba(${140 + rndInt(0, 30)},${65 + rndInt(0, 20)},25,${rnd(0.15, 0.55)})`;
            c.fillRect(rnd(0, S), rnd(0, S), 2, 2);
        }
        const tex = new THREE.CanvasTexture(cv);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }

    buildPrefab() {
        const group = new THREE.Group();
        const frameTex = this.createFrameTexture();
        const doorFrameMat = new THREE.MeshStandardMaterial({
            map: frameTex, bumpMap: frameTex, bumpScale: 0.8,
            color: 0xffffff, roughness: 0.75, metalness: 0.25
        });
        
        const openingW = 1.2, openingH = 2.2, frameThickness = 0.11, frameDepth = 0.14, frameZ = 0.03;

        const frameLeft = new THREE.Mesh(new THREE.BoxGeometry(frameThickness, openingH + frameThickness, frameDepth), doorFrameMat);
        frameLeft.position.set(-(openingW / 2 + frameThickness / 2), (openingH + frameThickness) / 2, frameZ);
        const frameRight = frameLeft.clone();
        frameRight.position.x = openingW / 2 + frameThickness / 2;
        const frameTop = new THREE.Mesh(new THREE.BoxGeometry(openingW + frameThickness * 2, frameThickness, frameDepth), doorFrameMat);
        frameTop.position.set(0, openingH + frameThickness / 2, frameZ);
        group.add(frameLeft, frameRight, frameTop);

        const doorTex = this.createDoorTextures();
        const doorMat = new THREE.MeshStandardMaterial({
            map: doorTex.map, bumpMap: doorTex.bump, bumpScale: 0.9,
            color: 0xffffff, emissive: 0x020d11, roughness: 0.75, metalness: 0.25
        });
        const door = new THREE.Mesh(new THREE.BoxGeometry(openingW, openingH, 0.05), doorMat);
        door.position.set(0, openingH / 2, 0);
        
        door.userData = { id: 'corridorDoor', prompt: 'Abrir puerta (Interactuar)', isCorridorDoor: true };
        group.add(door);

        const handleMat = new THREE.MeshStandardMaterial({ color: 0x6b5445, metalness: 0.7, roughness: 0.65 });
        const roseMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 24), handleMat);
        roseMesh.rotation.x = Math.PI / 2; roseMesh.position.set(0.5, 1.0, 0.03);
        const handleMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.1, 16), handleMat);
        handleMesh.rotation.set(Math.PI / 2, 0.22, 0); handleMesh.position.set(0.5, 1.0, 0.075);
        const knobMesh = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 16), handleMat);
        knobMesh.position.set(0.522, 0.99, 0.123);
        
        const plateMat = new THREE.MeshStandardMaterial({ color: 0x2b1a10, roughness: 0.8, metalness: 0.3 });
        const plateMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.01), plateMat);
        plateMesh.position.set(-0.42, 1.65, 0.03); plateMesh.rotation.z = 0.12;

        const hingeMat = new THREE.MeshStandardMaterial({ color: 0x5a3a26, metalness: 0.7, roughness: 0.7 });
        for (const y of [1.85, 1.1, 0.34]) {
            const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.02), hingeMat);
            hinge.position.set(-0.6, y, 0.04); group.add(hinge);
        }
        
        group.add(roseMesh, handleMesh, knobMesh, plateMesh);
        return group;
    }

    // Devuelve un clon ya posicionado para la izquierda o la derecha
    getClone(isLeft) {
        const doorGroup = this.prefab.clone();
        const wallX = isLeft ? -1.08 : 1.08;
        
        doorGroup.position.set(wallX, 0, -4);
        doorGroup.rotation.y = isLeft ? Math.PI / 2 : -Math.PI / 2;
        doorGroup.userData.isDoorAssembly = true;
        
        return doorGroup;
    }
}