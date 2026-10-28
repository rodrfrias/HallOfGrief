import * as THREE from 'three';

export class FirstPersonControls {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;
        
        this.isLocked = false;
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        
        this.pitchObject = new THREE.Object3D();
        this.yawObject = new THREE.Object3D();
        
        this.yawObject.position.set(0, 1.6, 0); // Altura de ojos humanos
        this.yawObject.add(this.pitchObject);
        this.pitchObject.add(this.camera);

        this.initListeners();
    }

    initListeners() {
        document.addEventListener('mousemove', (e) => {
        if (!this.isLocked) return;
        const movementX = e.movementX || 0;
        const movementY = e.movementY || 0;

        this.yawObject.rotation.y -= movementX * 0.002;
        this.pitchObject.rotation.x -= movementY * 0.002;

        // Limitar rotación vertical
        this.pitchObject.rotation.x = Math.max(
            -Math.PI / 2.2,
            Math.min(Math.PI / 2.2, this.pitchObject.rotation.x)
        );
        });

        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        document.addEventListener('keyup', (e) => this.onKeyUp(e));
    }

    lock() {
        this.domElement.requestPointerLock();
        this.isLocked = true;
    }

    unlock() {
        document.exitPointerLock();
        this.isLocked = false;
    }

    onKeyDown(event) {
        switch (event.code) {
        case 'KeyW': this.moveForward = true; break;
        case 'KeyS': this.moveBackward = true; break;
        case 'KeyA': this.moveLeft = true; break;
        case 'KeyD': this.moveRight = true; break;
        }
    }

    onKeyUp(event) {
        switch (event.code) {
        case 'KeyW': this.moveForward = false; break;
        case 'KeyS': this.moveBackward = false; break;
        case 'KeyA': this.moveLeft = false; break;
        case 'KeyD': this.moveRight = false; break;
        }
    }

    getObject() {
        return this.yawObject;
    }

    update(delta) {
        if (!this.isLocked) return;

        // Fricción de movimiento
        this.velocity.x -= this.velocity.x * 10.0 * delta;
        this.velocity.z -= this.velocity.z * 10.0 * delta;

        this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
        this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
        this.direction.normalize();

        const speed = 12.0;
        if (this.moveForward || this.moveBackward) {
        this.velocity.z -= this.direction.z * speed * delta;
        }
        if (this.moveLeft || this.moveRight) {
        this.velocity.x -= this.direction.x * speed * delta;
        }

        this.yawObject.translateX(-this.velocity.x * delta);
        this.yawObject.translateZ(this.velocity.z * delta);
    }
}