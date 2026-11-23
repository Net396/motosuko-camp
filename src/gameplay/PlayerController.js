import * as THREE from 'three';
import { getTerrainHeight, getShoreZ } from '../engine/terrainMath.js';

/**
 * First-person realistic camp controller with smooth Pointer Lock look,
 * walking/crouching (to tend the campfire!), Kermit Chair sitting mode,
 * terrain height following, collision bounds, gravel footstep cadence,
 * and first-person held-item viewmodel with action animations.
 */
export class PlayerController {
  constructor(camera, domElement, soundEngine) {
    this.camera = camera;
    this.domElement = domElement;
    this.sound = soundEngine;

    // Start standing near camp facing north-northwest toward tent, campfire, Lake Motosuko & Mt. Fuji!
    this.pos = new THREE.Vector3(0.45, getTerrainHeight(0.45, 1.85), 1.85);
    this.yaw = 0.11;
    this.pitch = -0.04;

    this.eyeHeightStand = 1.62;
    this.eyeHeightCrouch = 1.02;
    this.currentEyeHeight = this.eyeHeightStand;
    this.crouching = false;

    // Sitting mode (Kermit Chair overlooking campfire & Mt. Fuji!)
    this.seated = false;
    this.seatPos = new THREE.Vector3();
    this.seatExitPos = new THREE.Vector3();

    this.keys = {};
    this.isLocked = false;
    this._bobPhase = 0;
    this._lastStepSign = 1;

    // Viewmodel mount inside camera
    this.handAnchor = new THREE.Group();
    this.handAnchor.position.set(0.32, -0.28, -0.52);
    this.camera.add(this.handAnchor);
    this.viewmodel = null;
    this._actionAnim = { type: null, t: 0, dur: 0.4 };

    this._bindEvents();
  }

  _bindEvents() {
    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.domElement;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isLocked) return;
      const sens = 0.0019;
      this.yaw -= e.movementX * sens;
      this.pitch -= e.movementY * sens;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -1.35, 1.25);
    });

    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'KeyC' && this.isLocked && !this.seated) {
        this.crouching = !this.crouching;
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
  }

  lock() {
    if (this.domElement.requestPointerLock) {
      try {
        const res = this.domElement.requestPointerLock();
        if (res && typeof res.catch === 'function') {
          res.catch(() => {});
        }
      } catch {
        // Ignore pointer lock rejection in restricted/headless contexts
      }
    }
  }

  sitInChair(chairPos, faceYaw) {
    this.seated = true;
    this.crouching = false;
    this.seatExitPos.copy(this.pos);
    this.seatPos.copy(chairPos);
    this.yaw = faceYaw;
    this.pitch = 0.02;
  }

  standUp() {
    if (!this.seated) return;
    this.seated = false;
    this.pos.copy(this.seatExitPos);
  }

  setViewmodel(meshOrNull, transformCfg = null) {
    while (this.handAnchor.children.length > 0) {
      this.handAnchor.remove(this.handAnchor.children[0]);
    }
    this.viewmodel = meshOrNull;
    if (meshOrNull) {
      meshOrNull.position.set(0, 0, 0);
      meshOrNull.rotation.set(0, 0, 0);
      meshOrNull.scale.setScalar(1);
      if (transformCfg) {
        if (transformCfg.pos) meshOrNull.position.set(...transformCfg.pos);
        if (transformCfg.rot) meshOrNull.rotation.set(...transformCfg.rot);
        if (transformCfg.scale) meshOrNull.scale.setScalar(transformCfg.scale);
      }
      // Prevent held item from casting weird close-up shadow artifacts on face
      meshOrNull.traverse((o) => {
        if (o.isMesh) o.castShadow = false;
      });
      this.handAnchor.add(meshOrNull);
    }
  }

  triggerHandAnim(type, duration = 0.42) {
    this._actionAnim = { type, t: 0, dur: duration };
  }

  update(dt, elapsed, colliders = []) {
    // Smooth stand/crouch eye height
    const targetEye = this.seated ? 0.94 : (this.crouching ? this.eyeHeightCrouch : this.eyeHeightStand);
    this.currentEyeHeight += (targetEye - this.currentEyeHeight) * Math.min(1, dt * 9.0);

    let moving = false;

    if (this.isLocked && !this.seated) {
      const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const move = new THREE.Vector3();

      if (this.keys['KeyW']) move.add(forward);
      if (this.keys['KeyS']) move.sub(forward);
      if (this.keys['KeyD']) move.add(right);
      if (this.keys['KeyA']) move.sub(right);

      if (move.lengthSq() > 0.001) {
        moving = true;
        move.normalize();
        const speed = this.crouching ? 1.55 : (this.keys['ShiftLeft'] ? 4.2 : 2.75);
        const nextX = this.pos.x + move.x * speed * dt;
        const nextZ = this.pos.z + move.z * speed * dt;

        // Keep within scenic shoreline & forest boundary (don't walk into deep lake!)
        const minZ = getShoreZ(nextX) + 0.35;
        const clampedX = THREE.MathUtils.clamp(nextX, -42, 42);
        const clampedZ = THREE.MathUtils.clamp(nextZ, minZ, 26);

        let blocked = false;
        for (const c of colliders) {
          if (Math.hypot(clampedX - c.x, clampedZ - c.z) < c.r) {
            blocked = true;
            break;
          }
        }
        if (!blocked) {
          this.pos.x = clampedX;
          this.pos.z = clampedZ;
        }
      }
    } else if (this.seated) {
      // Pressing W/S/A/D or Space lets you gracefully stand up from the Kermit Chair!
      if (this.keys['KeyW'] || this.keys['KeyS'] || this.keys['Space']) {
        this.standUp();
      }
    }

    // Snap Y smoothly to Blender volcanic gravel terrain
    const groundY = this.seated ? this.seatPos.y : getTerrainHeight(this.pos.x, this.pos.z);
    this.pos.y = groundY;

    // Gentle realistic walk head-bob + gravel footstep triggers
    let bobY = 0;
    let bobX = 0;
    if (moving) {
      const rate = this.crouching ? 6.2 : (this.keys['ShiftLeft'] ? 11.2 : 8.4);
      this._bobPhase += dt * rate;
      bobY = Math.sin(this._bobPhase * 2.0) * 0.026;
      bobX = Math.cos(this._bobPhase) * 0.016;
      const stepSign = Math.sin(this._bobPhase) >= 0 ? 1 : -1;
      if (stepSign !== this._lastStepSign) {
        this._lastStepSign = stepSign;
        this.sound.playStep();
      }
    } else {
      // Subtle alive breathing motion
      bobY = Math.sin(elapsed * 1.65) * 0.004;
    }

    const camPos = this.seated ? this.seatPos : this.pos;
    this.camera.position.set(camPos.x + bobX, camPos.y + this.currentEyeHeight + bobY, camPos.z);

    // Apply FPS Euler (YXZ order)
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;

    // Animate held viewmodel (subtle breathing sway + active tool/pour/sip animations)
    let hx = 0.32 + Math.cos(this._bobPhase) * (moving ? 0.014 : 0.002);
    let hy = -0.27 + Math.sin(this._bobPhase * 2.0) * (moving ? 0.014 : 0.003);
    let hz = -0.50;
    let rx = 0, ry = 0, rz = 0;

    if (this._actionAnim.type) {
      this._actionAnim.t += dt;
      const p = Math.min(1, this._actionAnim.t / this._actionAnim.dur);
      const s = Math.sin(p * Math.PI);

      if (this._actionAnim.type === 'chop') {
        // Overhead raise then snappy downward cleave!
        const cleave = p < 0.45 ? -Math.sin((p / 0.45) * Math.PI * 0.5) * 0.9 : Math.sin(((p - 0.45) / 0.55) * Math.PI) * 1.15;
        rx = -cleave;
        hy += (p < 0.45 ? 0.14 : -0.10) * s;
        hz -= 0.08 * s;
      } else if (this._actionAnim.type === 'pour') {
        hx -= 0.12 * s;
        hy += 0.06 * s;
        rz = 0.48 * s;
        rx = -0.28 * s;
      } else if (this._actionAnim.type === 'sip') {
        hx -= 0.24 * s;
        hy += 0.16 * s;
        hz += 0.18 * s;
        rx = 0.38 * s;
      } else if (this._actionAnim.type === 'blow') {
        hx -= 0.22 * s;
        hy += 0.14 * s;
        hz -= 0.10 * s;
      } else if (this._actionAnim.type === 'use') {
        hz -= 0.10 * s;
        rx = -0.25 * s;
      }

      if (p >= 1) this._actionAnim.type = null;
    }

    this.handAnchor.position.set(hx, hy, hz);
    this.handAnchor.rotation.set(rx, ry, rz);
  }
}
