import * as THREE from 'three';
import { FirstPersonControls } from './core/Controls.js';
import { AudioManager } from './core/AudioManager.js';
import { Corridor } from './world/Corridor.js';
import { DenialRoom } from './world/DenialRoom.js';

class App {
    constructor() {
        this.container = document.body;
        this.clock = new THREE.Clock();
        this.initScene();
        this.initCore();
        this.buildWorld();
        this.initRaycaster();
        this.animate();
    }

    initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x020304);
        this.scene.fog = new THREE.FogExp2(0x020304, 0.095); // Densidad para oscurecer el fondo

        this.camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        100
        );

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
        this.denialRoom = new DenialRoom(this.scene);
    }

    initRaycaster() {
        this.raycaster = new THREE.Raycaster();
        this.raycaster.far = 3.0;
        this.uiPrompt = document.getElementById('ui-prompt');

        document.addEventListener('click', () => {
        if (!this.controls.isLocked) return;

        this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        const intersects = this.raycaster.intersectObjects(this.denialRoom.interactables);

        if (intersects.length > 0) {
            const obj = intersects[0].object;
            this.audioManager.playClickSound();
            this.denialRoom.interact(obj, (text) => this.showPrompt(text));
        }
        });
    }

    showPrompt(text) {
        this.uiPrompt.innerText = text;
        clearTimeout(this.promptTimeout);
        this.promptTimeout = setTimeout(() => {
        this.uiPrompt.innerText = '';
        }, 4000);
    }

    checkRaycastHover() {
        if (!this.controls.isLocked) return;

        this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        const intersects = this.raycaster.intersectObjects(this.denialRoom.interactables);

        if (intersects.length > 0) {
        const obj = intersects[0].object;
        if (obj.userData && obj.userData.prompt) {
            this.uiPrompt.innerText = obj.userData.prompt;
            return;
        }
        }
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
        this.corridor.update(elapsedTime); // Actualizar titileo de luces
        this.checkRaycastHover();

        this.renderer.render(this.scene, this.camera);
    }
}

new App();