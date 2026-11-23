import * as THREE from 'three';

/**
 * Thermodynamic Japanese Campfire Simulation inside the Blender Snow Peak Takibi Fire Pit.
 * Models real kindling ignition (ferro-rod sparks -> smoldering -> flame), stacked Hinoki logs,
 * oxygen flow (fire blowpipe flares!), ember bed glow, custom GLSL volumetric-style flames,
 * rising glowing sparks, billowing smoke plumes, and warm flickering shadow-casting firelight.
 */
export class FireSimulation {
  constructor(scene, assets, pitPosition) {
    this.scene = scene;
    this.assets = assets;
    this.pitPos = pitPosition.clone();

    // Thermodynamic state
    this.kindlingFuel = 1.0; // Start with 1 bundle of dry tinder pre-laid so player can add more or ignite!
    this.logFuel = 0.0;      // Split Hinoki logs added (0..6)
    this.emberMass = 0.0;    // Glowing charcoal bed (0..1)
    this.temperature = 9.0;  // °C
    this.oxygen = 0.55;      // 0..1 (blowing with blowpipe boosts towards 1.0!)
    this.ignitionHeat = 0.0; // Builds up from ferro-rod strikes (0..1)
    this.lit = false;
    this.flameIntensity = 0.0;
    this.smokeIntensity = 0.0;

    this.group = new THREE.Group();
    this.group.position.copy(this.pitPos);
    this.scene.add(this.group);

    this._buildPitFuelVisuals();
    this._buildFlameShaderMeshes();
    this._buildSparksAndSmoke();
    this._buildFireLights();
    this._syncFuelMeshes();
  }

  _buildPitFuelVisuals() {
    // 1. Ember bed model from Blender (dynamically pulses emissive with temperature!)
    this.emberMesh = this.assets.clone('ember_bed');
    this.emberMesh.position.set(0, 0.115, 0);
    this.emberMesh.scale.set(1.05, 0.9, 1.05);
    this.emberMats = [];
    this.emberMesh.traverse((o) => {
      if (o.isMesh && o.material) {
        o.material = o.material.clone();
        o.material.emissive = new THREE.Color(0xff4a0a);
        o.material.emissiveIntensity = 0.0;
        this.emberMats.push(o.material);
      }
    });
    this.group.add(this.emberMesh);

    // 2. Kindling bundle inside center of fire bowl
    this.kindlingVisual = this.assets.clone('kindling_bundle');
    this.kindlingVisual.position.set(0, 0.145, 0);
    this.kindlingVisual.scale.setScalar(1.05);
    this.group.add(this.kindlingVisual);

    // 3. Up to 6 split Hinoki logs arranged in realistic Japanese camp tipi / star lay
    this.logSlots = [];
    const layouts = [
      { pos: [-0.07, 0.19, 0.03], rot: [0.32, 0.25, -0.35] },
      { pos: [0.07, 0.19, -0.02], rot: [-0.28, 1.85, 0.32] },
      { pos: [0.01, 0.20, 0.07],  rot: [0.35, -0.9, 0.22] },
      { pos: [-0.02, 0.20, -0.07],rot: [-0.36, 0.9, -0.25] },
      { pos: [0.04, 0.24, 0.04],  rot: [0.22, 2.5, -0.40] },
      { pos: [-0.05, 0.24, -0.04],rot: [-0.24, -2.3, 0.38] },
    ];
    for (const cfg of layouts) {
      const m = this.assets.clone('log_split');
      m.position.set(...cfg.pos);
      m.rotation.set(...cfg.rot);
      m.scale.setScalar(0.86);
      m.visible = false;
      this.group.add(m);
      this.logSlots.push(m);
    }
  }

  _buildFlameShaderMeshes() {
    this.flameMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uWindX: { value: 0 },
        uWindZ: { value: 0 },
      },
      vertexShader: `
        uniform float uTime;
        uniform float uIntensity;
        uniform float uWindX;
        uniform float uWindZ;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec3 p = position;
          float h = clamp(uv.y, 0.0, 1.0);
          // Natural wind sway & upward flame flicker
          float sway = sin(uTime * 6.5 + h * 4.0 + position.x * 8.0) * 0.035 * h;
          p.x += (uWindX * 0.09 * h * h + sway) * max(0.3, uIntensity);
          p.z += (uWindZ * 0.09 * h * h) * max(0.3, uIntensity);
          p.y *= (0.35 + uIntensity * 0.95);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uIntensity;
        varying vec2 vUv;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
            mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
            f.y
          );
        }
        float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 4; i++) {
            v += a * noise(p);
            p *= 2.08;
            a *= 0.5;
          }
          return v;
        }

        void main() {
          if (uIntensity < 0.01) discard;
          vec2 uv = vUv;
          float xDist = abs(uv.x - 0.5) * 2.0;

          // Rising turbulent FBM licks
          vec2 flow = vec2(uv.x * 3.4, uv.y * 2.8 - uTime * 3.4);
          float n1 = fbm(flow);
          float n2 = fbm(flow * 1.9 + vec2(2.4, -uTime * 2.2));
          float turb = n1 * 0.65 + n2 * 0.35;

          // Tapered teardrop flame envelope
          float width = mix(0.95, 0.06, pow(uv.y, 0.78));
          float shape = smoothstep(width, width * 0.15, xDist + (turb - 0.48) * 0.55);
          shape *= smoothstep(0.0, 0.14, uv.y) * smoothstep(1.0, 0.35, uv.y + (0.45 - turb) * 0.5);

          float core = shape * turb * 1.85;
          if (core < 0.05) discard;

          // Physically realistic blackbody flame color ramp: blue-white base -> bright yellow -> rich orange -> deep red tips
          vec3 col = mix(vec3(0.95, 0.18, 0.02), vec3(1.0, 0.58, 0.09), smoothstep(0.12, 0.55, core));
          col = mix(col, vec3(1.0, 0.94, 0.72), smoothstep(0.55, 0.92, core));
          // Subtle hot oxygen-rich blue base tint
          float baseBlue = smoothstep(0.22, 0.04, uv.y) * smoothstep(0.55, 0.1, xDist);
          col = mix(col, vec3(0.45, 0.72, 1.0), baseBlue * 0.32 * uIntensity);

          float alpha = clamp(core * uIntensity * 1.15, 0.0, 0.95);
          gl_FragColor = vec4(col * (1.2 + uIntensity * 0.9), alpha);
        }
      `,
    });

    this.flameGroup = new THREE.Group();
    this.flameGroup.position.set(0, 0.17, 0);
    // 4 intersecting flame sheets at 45° increments for full 360° volumetric appearance!
    for (let i = 0; i < 4; i++) {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.56, 8, 14), this.flameMat);
      plane.position.y = 0.25;
      plane.rotation.y = (i * Math.PI) / 4;
      this.flameGroup.add(plane);
    }
    this.group.add(this.flameGroup);
  }

  _buildSparksAndSmoke() {
    // 1. Incandescent rising sparks (also reused for ferro-rod ignition spark bursts!)
    const sparkCount = 130;
    const sPos = new Float32Array(sparkCount * 3);
    this._sparks = [];
    for (let i = 0; i < sparkCount; i++) {
      sPos[i * 3 + 1] = -99;
      this._sparks.push({ x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1 });
    }
    const sGeom = new THREE.BufferGeometry();
    sGeom.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    const sMat = new THREE.PointsMaterial({
      color: 0xffa63b,
      size: 0.032,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.sparkPoints = new THREE.Points(sGeom, sMat);
    this.group.add(this.sparkPoints);

    // 2. Soft woodsmoke puff particles
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
    g.addColorStop(0, 'rgba(215, 222, 232, 0.38)');
    g.addColorStop(0.55, 'rgba(185, 194, 206, 0.14)');
    g.addColorStop(1, 'rgba(160, 170, 182, 0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const smokeTex = new THREE.CanvasTexture(canvas);

    const smokeCount = 56;
    const smPos = new Float32Array(smokeCount * 3);
    this._smokes = [];
    for (let i = 0; i < smokeCount; i++) {
      smPos[i * 3 + 1] = -99;
      this._smokes.push({ x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 2.5 });
    }
    const smGeom = new THREE.BufferGeometry();
    smGeom.setAttribute('position', new THREE.BufferAttribute(smPos, 3));
    this.smokeMat = new THREE.PointsMaterial({
      map: smokeTex,
      size: 0.42,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
      color: 0xd8dee6,
    });
    this.smokePoints = new THREE.Points(smGeom, this.smokeMat);
    this.group.add(this.smokePoints);
  }

  _buildFireLights() {
    // Non-shadow point light eliminates 6 full-scene cubemap shadow passes per frame (~3x FPS boost!)
    this.fireLight = new THREE.PointLight(0xff7728, 0.0, 16.0, 1.55);
    this.fireLight.position.set(0, 0.48, 0);
    this.fireLight.castShadow = false;
    this.group.add(this.fireLight);

    // Secondary soft warm bounce glow near embers
    this.emberLight = new THREE.PointLight(0xff420e, 0.0, 4.5, 1.8);
    this.emberLight.position.set(0, 0.22, 0);
    this.group.add(this.emberLight);
  }

  _syncFuelMeshes() {
    this.kindlingVisual.visible = this.kindlingFuel > 0.05;
    const shownLogs = Math.min(this.logSlots.length, Math.ceil(this.logFuel));
    for (let i = 0; i < this.logSlots.length; i++) {
      this.logSlots[i].visible = i < shownLogs;
    }
    this.emberMesh.visible = this.emberMass > 0.02 || this.lit;
  }

  addKindling() {
    if (this.kindlingFuel >= 3.5) return false;
    this.kindlingFuel = Math.min(4.0, this.kindlingFuel + 1.0);
    this._syncFuelMeshes();
    return true;
  }

  addSplitLog() {
    if (this.logFuel >= 6.0) return false;
    this.logFuel = Math.min(6.0, this.logFuel + 1.0);
    this._syncFuelMeshes();
    return true;
  }

  /** Strike ferrocerium flint rod into the kindling! */
  strikeFlint() {
    // Emit bright burst of hot white-orange ferro sparks
    let spawned = 0;
    for (const s of this._sparks) {
      if (s.life <= 0 && spawned < 28) {
        s.x = (Math.random() - 0.5) * 0.08;
        s.y = 0.22 + Math.random() * 0.06;
        s.z = (Math.random() - 0.5) * 0.08;
        s.vx = (Math.random() - 0.5) * 1.25;
        s.vy = 0.55 + Math.random() * 0.95;
        s.vz = (Math.random() - 0.5) * 1.25;
        s.maxLife = 0.28 + Math.random() * 0.35;
        s.life = s.maxLife;
        spawned++;
      }
    }

    if (this.kindlingFuel < 0.15) {
      return { ignited: false, reason: 'no_tinder' };
    }
    if (this.lit) {
      return { ignited: true, alreadyLit: true };
    }

    this.ignitionHeat += 0.42 + Math.random() * 0.25;
    this.temperature = Math.max(this.temperature, 60 + this.ignitionHeat * 140);
    if (this.ignitionHeat >= 1.0) {
      this.lit = true;
      this.temperature = Math.max(this.temperature, 230);
      this.emberMass = Math.max(this.emberMass, 0.22);
      this.oxygen = Math.max(this.oxygen, 0.65);
      return { ignited: true, newlyLit: true };
    }
    return { ignited: false, progress: this.ignitionHeat };
  }

  /** Blow air through the Japanese fire blowpipe (火吹棒) to surge oxygen & flame! */
  blowOxygen(amount = 0.36) {
    this.oxygen = Math.min(1.0, this.oxygen + amount);
    if (this.lit || this.emberMass > 0.08) {
      if (!this.lit && (this.kindlingFuel > 0.1 || this.logFuel > 0.1)) {
        this.lit = true;
      }
      this.temperature = Math.min(820, this.temperature + 55 * amount);
      // Kick up bright glowing sparks!
      let spawned = 0;
      for (const s of this._sparks) {
        if (s.life <= 0 && spawned < 18) {
          s.x = (Math.random() - 0.5) * 0.14;
          s.y = 0.16;
          s.z = (Math.random() - 0.5) * 0.14;
          s.vx = (Math.random() - 0.5) * 0.8;
          s.vy = 1.2 + Math.random() * 1.5;
          s.vz = (Math.random() - 0.5) * 0.8;
          s.maxLife = 0.6 + Math.random() * 0.8;
          s.life = s.maxLife;
          spawned++;
        }
      }
    }
  }

  getStateLabel() {
    if (!this.lit && this.emberMass < 0.08) {
      if (this.ignitionHeat > 0.1) return '引火冒烟';
      if (this.kindlingFuel < 0.1 && this.logFuel < 0.1) return '空炉';
      return '待引燃';
    }
    if (this.temperature > 560) return '炽旺明火';
    if (this.temperature > 320) return '稳定燃火';
    if (this.temperature > 170) return '初燃火苗';
    return '余烬炭火';
  }

  update(dt, elapsed, sky) {
    const ambient = sky.ambientTempC;

    // Natural oxygen equilibrium
    this.oxygen += (0.52 - this.oxygen) * dt * 0.18;

    if (this.lit) {
      const totalFuel = this.kindlingFuel * 0.7 + this.logFuel * 1.35;
      if (totalFuel > 0.02) {
        // Burn rate scales with oxygen; slow realistic camping burn (1 log burns ~4-5 real minutes!)
        const burnRate = (0.0042 + this.oxygen * 0.0045) * dt;
        if (this.kindlingFuel > 0) {
          const usedK = Math.min(this.kindlingFuel, burnRate * 1.8);
          this.kindlingFuel -= usedK;
          this.emberMass = Math.min(1.0, this.emberMass + usedK * 0.25);
        }
        if (this.logFuel > 0) {
          const usedL = Math.min(this.logFuel, burnRate * 0.85);
          this.logFuel -= usedL;
          this.emberMass = Math.min(1.0, this.emberMass + usedL * 0.42);
        }
        const fuelFactor = Math.min(1.0, (this.kindlingFuel * 0.55 + this.logFuel * 0.48) / 1.45);
        const targetTemp = 210 + fuelFactor * 430 + this.oxygen * 180 + this.emberMass * 90;
        this.temperature += (targetTemp - this.temperature) * Math.min(1.0, dt * 0.45);
      } else {
        // Out of active wood -> transition to glowing charcoal embers
        this.lit = false;
      }
    } else {
      this.ignitionHeat = Math.max(0, this.ignitionHeat - dt * 0.08);
      if (this.emberMass > 0.01) {
        this.emberMass = Math.max(0, this.emberMass - dt * 0.0022);
        const emberTemp = ambient + this.emberMass * (280 + this.oxygen * 160);
        this.temperature += (emberTemp - this.temperature) * Math.min(1.0, dt * 0.3);
      } else {
        this.temperature += (ambient - this.temperature) * Math.min(1.0, dt * 0.25);
      }
    }

    this._syncFuelMeshes();

    // Compute normalized visual intensities
    const targetFlame = this.lit
      ? THREE.MathUtils.clamp((this.temperature - 140) / 480, 0.18, 1.35)
      : 0.0;
    this.flameIntensity += (targetFlame - this.flameIntensity) * Math.min(1.0, dt * 3.5);

    // Smoke is thickest when smoldering / newly lit, lighter when fire is hot and clean!
    const smolderSmoke = (!this.lit && this.ignitionHeat > 0.15) ? 0.85 : 0;
    const burnSmoke = this.lit ? THREE.MathUtils.clamp(0.75 - (this.temperature - 220) / 700, 0.22, 0.72) : 0;
    const emberSmoke = (!this.lit && this.emberMass > 0.08) ? 0.25 : 0;
    this.smokeIntensity = Math.max(smolderSmoke, burnSmoke, emberSmoke);

    // Update flame shader uniforms
    this.flameMat.uniforms.uTime.value = elapsed;
    this.flameMat.uniforms.uIntensity.value = this.flameIntensity;
    this.flameMat.uniforms.uWindX.value = sky.windDir.x * sky.windSpeed;
    this.flameMat.uniforms.uWindZ.value = sky.windDir.y * sky.windSpeed;
    this.flameGroup.visible = this.flameIntensity > 0.015;

    // Pulsing charcoal ember bed glow
    const emberGlow = THREE.MathUtils.clamp((this.temperature - 90) / 450, 0.0, 1.0);
    const pulse = 0.86 + 0.14 * Math.sin(elapsed * 3.4) + 0.1 * Math.sin(elapsed * 7.8);
    for (const m of this.emberMats) {
      m.emissiveIntensity = emberGlow * (1.8 + this.oxygen * 2.2) * pulse;
    }

    // Dynamic realistic flickering firelight
    const flicker =
      0.86 +
      0.10 * Math.sin(elapsed * 13.7) +
      0.06 * Math.sin(elapsed * 23.1 + 1.4) +
      0.04 * Math.cos(elapsed * 37.0);
    this.fireLight.intensity = this.flameIntensity * 6.8 * flicker;
    this.fireLight.position.x = Math.sin(elapsed * 9.5) * 0.03;
    this.fireLight.position.z = Math.cos(elapsed * 11.2) * 0.03;
    this.emberLight.intensity = emberGlow * 1.9 * pulse;

    // Update sparks
    const sAttr = this.sparkPoints.geometry.getAttribute('position');
    for (let i = 0; i < this._sparks.length; i++) {
      const s = this._sparks[i];
      if (s.life > 0) {
        s.life -= dt;
        s.x += (s.vx + sky.windDir.x * sky.windSpeed * 0.18) * dt;
        s.y += s.vy * dt;
        s.z += (s.vz + sky.windDir.y * sky.windSpeed * 0.18) * dt;
        s.vy -= 0.45 * dt; // subtle gravity / buoyancy balance
        sAttr.setXYZ(i, s.x, s.y, s.z);
      } else if (this.flameIntensity > 0.18 && Math.random() < dt * (2.5 + this.flameIntensity * 6.5)) {
        s.x = (Math.random() - 0.5) * 0.18;
        s.y = 0.22 + Math.random() * 0.15;
        s.z = (Math.random() - 0.5) * 0.18;
        s.vx = (Math.random() - 0.5) * 0.35;
        s.vy = 0.65 + Math.random() * (0.85 * this.flameIntensity);
        s.vz = (Math.random() - 0.5) * 0.35;
        s.maxLife = 0.7 + Math.random() * 1.1;
        s.life = s.maxLife;
        sAttr.setXYZ(i, s.x, s.y, s.z);
      } else {
        sAttr.setXYZ(i, 0, -99, 0);
      }
    }
    sAttr.needsUpdate = true;

    // Update woodsmoke plumes
    const smAttr = this.smokePoints.geometry.getAttribute('position');
    this.smokeMat.opacity = 0.16 + this.smokeIntensity * 0.26;
    for (let i = 0; i < this._smokes.length; i++) {
      const sm = this._smokes[i];
      if (sm.life > 0) {
        sm.life -= dt;
        sm.x += (sm.vx + sky.windDir.x * sky.windSpeed * 0.16) * dt;
        sm.y += sm.vy * dt;
        sm.z += (sm.vz + sky.windDir.y * sky.windSpeed * 0.16) * dt;
        smAttr.setXYZ(i, sm.x, sm.y, sm.z);
      } else if (this.smokeIntensity > 0.08 && Math.random() < dt * (4.0 + this.smokeIntensity * 11.0)) {
        sm.x = (Math.random() - 0.5) * 0.14;
        sm.y = 0.34;
        sm.z = (Math.random() - 0.5) * 0.14;
        sm.vx = (Math.random() - 0.5) * 0.12;
        sm.vy = 0.45 + Math.random() * 0.35;
        sm.vz = (Math.random() - 0.5) * 0.12;
        sm.maxLife = 2.0 + Math.random() * 1.8;
        sm.life = sm.maxLife;
        smAttr.setXYZ(i, sm.x, sm.y, sm.z);
      } else {
        smAttr.setXYZ(i, 0, -99, 0);
      }
    }
    smAttr.needsUpdate = true;
  }
}
