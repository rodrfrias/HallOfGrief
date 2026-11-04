import * as THREE from 'three';
import { FirstPersonControls } from './core/Controls.js';
import { AudioManager } from './core/AudioManager.js';
import { GameManager } from './core/GameManager.js';
import { Corridor } from './world/Corridor.js';
import { DenialRoom } from './world/DenialRoom.js';

class App {
    constructor() {
        this.container = document.body;
        this.clock = new THREE.Clock();
        this.gameManager = new GameManager();
        this.currentRoom = null;
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
        this.raycaster.far = 3.0;
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
                    const readyForAcceptance = this.gameManager.markRoomCompleted();
                    if (readyForAcceptance) {
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
        const targetRot = -Math.PI / 2.2; 
        const duration = 1200;
        const startRot = doorPivot.rotation.y;
        const startTime = performance.now();

        const animate = (time) => {
            let elapsed = time - startTime;
            if (elapsed > duration) elapsed = duration;
            const progress = elapsed / duration;
            const ease = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
            
            doorPivot.rotation.y = startRot + (targetRot * ease);

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                this.fadeToBlack(() => {
                    doorPivot.rotation.y = 0;
                    this.loadNextRoom();
                });
            }
        };
        requestAnimationFrame(animate);
    }

    fadeToBlack(callback) {
        this.fadeOverlay.style.opacity = '1';
        setTimeout(callback, 1500); 
    }

    fadeIn() {
        this.fadeOverlay.style.opacity = '0';
        setTimeout(() => { this.isTransitioning = false; }, 1500);
    }

    loadNextRoom() {
        const roomName = this.gameManager.getNextRoom();
        if (!roomName) {
            this.showPrompt('No quedan habitaciones por descubrir.');
            this.fadeIn();
            return;
        }

        if (this.currentRoom) this.unloadRoom(this.currentRoom);

        const roomFactories = {
            Denial: () => new DenialRoom(this.scene, this.corridor.doorFactory)
        };
        const createRoom = roomFactories[roomName];
        if (!createRoom) {
            this.showPrompt(`La habitación "${roomName}" todavía no está disponible.`);
            this.fadeIn();
            return;
        }

        this.corridor.segments.forEach(seg => seg.visible = false);
        this.currentRoom = createRoom();
        
        this.currentRoom.roomGroup.position.set(1000, 0, 0);
        
        const yawObject = this.controls.getObject();
        yawObject.position.set(1000, 1.6, -9.5); 
        yawObject.rotation.set(0, Math.PI, 0); 
        this.controls.pitchObject.rotation.set(0, 0, 0);
        
        // Forzar recalculo de matriz física
        yawObject.updateMatrixWorld(true);
        this.camera.updateMatrixWorld(true);
        if (this.controls.velocity) this.controls.velocity.set(0,0,0);
        
        this.showPrompt(`Has entrado en: ${roomName}`);
        this.fadeIn();
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
        if (this.currentRoom === roomInstance) this.currentRoom = null;
    }

    showPrompt(text) {
        this.uiPrompt.innerText = text;
        clearTimeout(this.promptTimeout);
        this.promptTimeout = setTimeout(() => { this.uiPrompt.innerText = ''; }, 4000);
    }

    checkRaycastHover() {
        if (!this.controls.isLocked) return;
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

        this.controls.update(delta);
        
        if (!this.currentRoom) {
            this.corridor.update(elapsedTime, this.controls.getObject().position.z); 
        }
        
        this.checkRaycastHover();
        this.renderer.render(this.scene, this.camera);
    }
}

new App();