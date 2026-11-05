import * as THREE from 'three';

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

        // VISIÓN DE TÚNEL: Reducimos el campo de visión para generar tensión
        this.originalFov = this.camera.fov;
        this.camera.fov = 60; 
        this.camera.updateProjectionMatrix();

        this.buildRoom();
    }

    buildRoom() {
        const doorX = 0;
        const doorZ = -8.0;

        // 1. Puerta de Entrada (Idéntica a Negación pero con otro ID)
        const doorGroup = this.doorFactory.getClone(true, this.initialState);
        doorGroup.position.set(doorX, 0, doorZ);
        doorGroup.rotation.y = Math.PI; // Rotada 180° hacia el pasillo
        
        doorGroup.traverse((c) => {
            if (c.userData && c.userData.id === 'corridorDoor') {
                c.userData = { id: 'entryDoor_anger', prompt: 'Interactuar' };
                this.interactables.push(c);
            }
        });

        this.entryDoorGroup = doorGroup;
        this.roomGroup.add(doorGroup);

        // 2. Arquitectura Opresiva (Más angosta y baja)
        const W = 2.2; // Negación era 3.5
        const H = 2.7; // Negación era 4.0
        const D = 6.0; // Negación era 7.0
        const halfW = W / 2;
        const Z = (s) => doorZ - s;
        const backZ = Z(D);

        // Materiales base oscuros (luego meteremos texturas)
        const wallMat = new THREE.MeshStandardMaterial({ color: 0x1f0d0d, roughness: 0.9, metalness: 0.1 });
        const floorMat = new THREE.MeshStandardMaterial({ color: 0x110505, roughness: 0.8 });
        const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x080202, roughness: 1.0 });

        const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(D, H), wallMat);
        leftWall.rotation.y = Math.PI / 2;
        leftWall.position.set(-halfW, H / 2, Z(D / 2));

        const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(D, H), wallMat);
        rightWall.rotation.y = -Math.PI / 2;
        rightWall.position.set(halfW, H / 2, Z(D / 2));

        const backWall = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wallMat);
        backWall.position.set(0, H / 2, backZ);

        // Pequeñas paredes frontales al lado de la puerta
        const pSide = (W - 1.2) / 2;
        const pLeft = new THREE.Mesh(new THREE.PlaneGeometry(pSide, H), wallMat);
        pLeft.position.set(-W/2 + pSide/2, H/2, doorZ);
        pLeft.rotation.y = Math.PI;
        
        const pRight = new THREE.Mesh(new THREE.PlaneGeometry(pSide, H), wallMat);
        pRight.position.set(W/2 - pSide/2, H/2, doorZ);
        pRight.rotation.y = Math.PI;

        const pTop = new THREE.Mesh(new THREE.PlaneGeometry(1.2, H - 2.2), wallMat);
        pTop.position.set(0, 2.2 + (H - 2.2)/2, doorZ);
        pTop.rotation.y = Math.PI;

        const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(0, 0, Z(D / 2));

        const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, D), ceilingMat);
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.set(0, H, Z(D / 2));

        this.roomGroup.add(leftWall, rightWall, backWall, pLeft, pRight, pTop, floor, ceiling);

        // 3. Iluminación Hostil
        const mainLight = new THREE.PointLight(0x8a2b1c, 4.0, 7);
        mainLight.position.set(0, H - 0.4, Z(D / 2));
        this.roomGroup.add(mainLight);
        
        // Spot de alto contraste apuntando a la pared del fondo
        const harshSpot = new THREE.SpotLight(0xff5533, 5.0, 8, Math.PI/4, 0.2, 1);
        harshSpot.position.set(0, H - 0.2, doorZ - 1.0);
        harshSpot.target.position.set(0, H / 2, backZ);
        this.roomGroup.add(harshSpot);
        this.roomGroup.add(harshSpot.target);
    }

    interact(object, uiPromptCallback) {
        if (object.userData.id === 'entryDoor_anger') {
            uiPromptCallback('La manija ni se mueve. Algo debe romperse primero.');
        }
    }

    // Se ejecuta cada frame desde main.js
    update(time) {
        // TEMBLOR CONSTANTE: Alta frecuencia (rápido), baja amplitud (sutil pero molesto)
        if (!this.camera) return;
        
        const intensity = 0.0035; 
        const shakeX = Math.sin(time * 45) * intensity + Math.cos(time * 30) * (intensity * 0.5);
        const shakeY = Math.cos(time * 50) * intensity + Math.sin(time * 25) * (intensity * 0.5);
        
        // Modificamos la posición local de la cámara (no afecta al jugador, solo a sus "ojos")
        this.camera.position.set(shakeX, shakeY, 0);
    }
}