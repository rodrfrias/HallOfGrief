import * as THREE from 'three';
import { FirstPersonControls } from './core/Controls.js';
import { AudioManager } from './core/AudioManager.js';
import { GameManager } from './core/GameManager.js';
import { Corridor } from './world/Corridor.js';
import { DenialRoom } from './world/DenialRoom.js';
import { AngerRoom } from './world/AngerRoom.js';

class App {
    constructor() {
        this.container = document.body;
        this.clock = new THREE.Clock();
        this.gameManager = new GameManager();
        this.currentRoom = null;
        AngerRoom.preloadFonts();
        this.initScene();
        this.initCore();
        this.buildWorld();
        this.initRaycaster();
        this.animate();
    }

    initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x020304);
        this.scene.fog = new THREE.Fog(0x020304, 2, 22);
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.container.appendChild(this.renderer.domElement);

        window.addEventListener('resize', () => this.onWindowResize());
    }

    initCore() {
        this.controls = new FirstPersonControls(this.camera, this.renderer.domElement);
        this.scene.add(this.controls.getObject());
        this.audioManager = new AudioManager();

        this.fadeOverlay = document.createElement('div');
        this.fadeOverlay.style.cssText = 'position:fixed; inset:0; background:black; opacity:0; pointer-events:none; transition: opacity 1.5s ease-in-out; z-index:99;';
        document.body.appendChild(this.fadeOverlay);

        const startBtn = document.getElementById('btn-start');
        const overlay = document.getElementById('overlay');

        startBtn.addEventListener('click', () => {
            overlay.style.display = 'none';
            this.controls.lock();
            this.audioManager.init();
            this.audioManager.playAmbientDissonance();
        });
    }

    buildWorld() {
        this.corridor = new Corridor(this.scene);
        this.corridor.setCorridorState(0, this.scene);
        this.initCorridorStateControls();
    }

    initCorridorStateControls() {
        document.addEventListener('keydown', (event) => {
            const stateByKey = { Digit0: 0, Digit1: 1, Digit2: 2, Digit3: 3, Numpad0: 0, Numpad1: 1, Numpad2: 2, Numpad3: 3 };
            const state = stateByKey[event.code];
            if (state === undefined) return;
            this.corridor.setCorridorState(state, this.scene);
        });
    }

    initRaycaster() {
        this.raycaster = new THREE.Raycaster();
        this.raycaster.far = 2.2; //no tocar, es para no poder interactuar desde muy lejos
        this.uiPrompt = document.getElementById('ui-prompt');

        document.addEventListener('click', () => {
            if (!this.controls.isLocked || this.isTransitioning) return;

            const obj = this.getInteractionTarget();
            if (!obj) return;

            this.audioManager.playClickSound();
            
            if (obj.userData.id === 'corridorDoor') {
                this.isTransitioning = true;
                this.animateDoorAndLoad(obj.parent); 
                
            } else if (this.currentRoom) {
                this.currentRoom.interact(obj, (text) => this.showPrompt(text));
                
                if (this.currentRoom.isDoorUnlocked && !this.currentRoom.cleared) {
                    this.currentRoom.cleared = true;
                    if (this.gameManager.markRoomCompleted()) {
                        this.corridor.setCorridorState(3, this.scene);
                    }
                }
            }
        });
    }

    getInteractionTarget() {
        this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        if (!this.currentRoom) {
            const corridorIntersects = this.raycaster.intersectObjects(this.corridor.interactables, false);
            if (corridorIntersects.length > 0) return corridorIntersects[0].object;
            return null;
        }
        const roomIntersects = this.raycaster.intersectObjects(this.currentRoom.interactables, false);
        return roomIntersects.length > 0 ? roomIntersects[0].object : null;
    }

    animateDoorAndLoad(doorPivot) {
        if (!doorPivot) return;
        
        // Ahora sí: Al abrir la puerta hacia adentro (negativo), se va a sumergir a lo profundo 
        // de la Caja Negra que acabamos de crear, sin tocar bordes invisibles.
        const targetRot = -Math.PI / 2.2; 
        const duration = 1800; 
        const startRot = doorPivot.rotation.y;

        const yaw = this.controls.getObject();
        const startPos = yaw.position.clone();
        
        // Calculamos el centro de la puerta globalmente
        const doorCenter = new THREE.Vector3();
        doorPivot.parent.getWorldPosition(doorCenter);
        doorCenter.y = startPos.y; 
        
        // Trazamos una línea perfecta desde el jugador hacia el hueco de la puerta
        const dirToDoor = new THREE.Vector3().subVectors(doorCenter, startPos);
        dirToDoor.y = 0;
        dirToDoor.normalize();
        
        // El jugador da un mínimo paso atrás (20cm) y luego avanza en línea recta (50cm adentro del marco)
        const stepBackPos = startPos.clone().addScaledVector(dirToDoor, -0.2); 
        const stepInPos = doorCenter.clone().addScaledVector(dirToDoor, 0.5); 

        let startTime = null;

        const animate = (time) => {
            if (!startTime) startTime = time;
            let elapsed = time - startTime;
            if (elapsed > duration) elapsed = duration;
            const progress = elapsed / duration;
            
            const ease = progress < 0.5 
                ? 4 * Math.pow(progress, 3) 
                : 1 - Math.pow(-2 * progress + 2, 3) / 2;
            
            doorPivot.rotation.y = startRot + (targetRot * ease);

            if (progress < 0.25) {
                // Paso atrás corto y veloz
                const p = progress / 0.25;
                yaw.position.lerpVectors(startPos, stepBackPos, p);
            } else {
                // Caminata lenta, recta y de frente hacia el hueco negro
                const p = (progress - 0.25) / 0.75;
                const eWalk = p * p; 
                yaw.position.lerpVectors(stepBackPos, stepInPos, eWalk);
            }

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                this.fadeToBlack(() => {
                    doorPivot.rotation.y = startRot; 
                    this.loadNextRoom();
                });
            }
        };
        requestAnimationFrame(animate);
    }

   fadeToBlack(callback) {
        this.fadeOverlay.style.opacity = '1';
        // Sincronizamos a 1500ms exactos para que el CSS termine al 100% de oscuridad
        setTimeout(callback, 1500); 
    }

    fadeInAndWalk() {
        this.fadeOverlay.style.opacity = '0';
        
        const yaw = this.controls.getObject();
        const startPos = yaw.position.clone();
        
        const endPos = startPos.clone();
        endPos.z -= 1.3; 
        
        const duration = 2000;
        let startTime = null;
        
        const animateWalk = (time) => {
            if (!startTime) startTime = time;
            let elapsed = time - startTime;
            if (elapsed > duration) elapsed = duration;
            const progress = elapsed / duration;
            
            const ease = 1 - Math.pow(1 - progress, 3);
            yaw.position.lerpVectors(startPos, endPos, ease);
            
            if (progress < 1) {
                requestAnimationFrame(animateWalk);
            } else {
                this.isTransitioning = false; 
            }
        };
        requestAnimationFrame(animateWalk);
    }
//Aca
    loadNextRoom() {
        const roomName = this.gameManager.getNextRoom();
        if (!roomName) {
            this.showPrompt('No quedan habitaciones por descubrir.');
            this.fadeOverlay.style.opacity = '0';
            this.isTransitioning = false;
            return;
        }

        if (this.currentRoom) this.unloadRoom(this.currentRoom);

        const roomFactories = {
            Denial: () => new DenialRoom(this.scene, this.corridor.doorFactory, this.corridor.currentState),
          Anger: () => new AngerRoom(this.scene, this.corridor.doorFactory, this.corridor.currentState,
                           this.camera, this.audioManager, (t) => this.showPrompt(t))
        };
        const createRoom = roomFactories[roomName];
        if (!createRoom) {
            this.showPrompt(`La habitación "${roomName}" todavía no está disponible.`);
            this.fadeOverlay.style.opacity = '0';
            this.isTransitioning = false;
            return;
        }

        // Apagamos el pasillo
        this.corridor.segments.forEach(seg => seg.visible = false);
        
        // RESET DE AMBIENTE: Apagamos la niebla clara global para que la sala no tenga resplandores
        this.scene.background.setHex(0x020304);
        if (this.scene.fog) {
            this.scene.fog.color.setHex(0x020304);
            this.scene.fog.near = 2;
            this.scene.fog.far = 22;
        }

        this.currentRoom = createRoom();
        
        this.currentRoom.roomGroup.position.set(1000, 0, 0);
        
        const yawObject = this.controls.getObject();
        
        yawObject.position.set(1000, 1.6, -8.2); 
        yawObject.rotation.set(0, 0, 0); 
        this.controls.pitchObject.rotation.set(0, 0, 0);
        
        yawObject.updateMatrixWorld(true);
        this.camera.updateMatrixWorld(true);
        if (this.controls.velocity) this.controls.velocity.set(0,0,0);
        
        
        
        setTimeout(() => {
            this.fadeInAndWalk();
        }, 100);
    }

    unloadRoom(roomInstance) {
        if (!roomInstance || !roomInstance.roomGroup) return;
        roomInstance.roomGroup.traverse((object) => {
            if (object.geometry) object.geometry.dispose();
            if (!object.material) return;
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((material) => material.dispose());
        });
        this.scene.remove(roomInstance.roomGroup);

        this.camera.fov = 75;
        this.camera.updateProjectionMatrix();
        this.camera.position.set(0, 0, 0);

        if (this.currentRoom === roomInstance) this.currentRoom = null;
    }

    showPrompt(text) {
    this.uiPrompt.innerText = text;
    this.promptLockUntil = performance.now() + 3000; // el hover no lo pisa durante 3 s
    clearTimeout(this.promptTimeout);
    this.promptTimeout = setTimeout(() => { this.uiPrompt.innerText = ''; }, 4000);
}


    checkRaycastHover() {
        if (!this.controls.isLocked) return;
        if (performance.now() < this.promptLockUntil) return;
        const obj = this.getInteractionTarget();
        if (obj && obj.userData && obj.userData.prompt) {
            this.uiPrompt.innerText = obj.userData.prompt;
            return;
        }
        this.uiPrompt.innerText = '';
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    animate() {
        requestAnimationFrame(() => this.animate());
        const delta = this.clock.getDelta();
        const elapsedTime = this.clock.getElapsedTime();

        // 1. Frenamos durante cinemáticas
        if (this.isTransitioning && this.controls.velocity) {
            this.controls.velocity.set(0, 0, 0);
        } else {
            this.controls.update(delta);
            const yaw = this.controls.getObject();
            
            if (!this.currentRoom) {
                // COLISIÓN DEL PASILLO
                yaw.position.x = Math.max(-0.8, Math.min(0.8, yaw.position.x));
            } else {
                // COLISIÓN DE LAS HABITACIONES
                // Verificamos de forma segura en qué sala estamos
                const isDenial = (this.currentRoom instanceof DenialRoom);
                const limitX = typeof this.currentRoom.getXLimit === 'function'
    ? this.currentRoom.getXLimit()
    : (isDenial ? 1.45 : 0.8);
                yaw.position.x = Math.max(1000 - limitX, Math.min(1000 + limitX, yaw.position.x));
                
                // Límite Z dinámico (por si la sala de Ira se estira)
                let limitZ = -14.7;
                if (typeof this.currentRoom.getZLimit === 'function') {
                    limitZ = this.currentRoom.getZLimit();
                }
                yaw.position.z = Math.max(limitZ, Math.min(-8.2, yaw.position.z)); 
            }
        }
        
        // 2. Lógica de renderizado de entornos
        if (!this.currentRoom) {
            this.corridor.update(elapsedTime, this.controls.getObject().position.z); 
        } else if (typeof this.currentRoom.update === 'function') {
            // Ejecuta el temblor y los eventos de AngerRoom
            this.currentRoom.update(elapsedTime);
        }
        
        this.checkRaycastHover();
        this.renderer.render(this.scene, this.camera);
    }
   
}

new App();