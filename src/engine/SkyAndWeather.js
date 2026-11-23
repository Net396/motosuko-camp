import * as THREE from 'three';

/**
 * Physically-Driven 24-Hour Celestial & Atmospheric Engine for Lake Motosuko (35.47° N, Mt. Fuji).
 * All lighting, sky scattering, cloud illumination, shadow angles, starfield rotation,
 * moon phases/reflections, volumetric God-Rays, and nighttime fireflies are 100% driven
 * by the continuous 3D orbital mechanics of the Sun and Moon.
 */
export class SkyAndWeather {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;

    // Start at 16:35 (late golden afternoon approaching sunset so the user immediately sees the sun sinking!)
    this.timeOfDay = 16.58;
    this.targetTimeOfDay = null; // Smooth orbital fast-forward target when switching moods!
    this.timeScale = 4;          // Default x4 natural flow (~1 game hour per 45s so sun movement is visibly alive!)
    this.windSpeed = 1.2;
    this.windDir = new THREE.Vector2(0.8, 0.4).normalize();

    this.sunDir = new THREE.Vector3(-0.6, 0.18, -0.78).normalize();
    this.moonDir = new THREE.Vector3(0.5, 0.35, -0.78).normalize();
    this.sunElevation = 0.18;
    this.moonElevation = -0.18;
    this.nightFactor = 0.0; // 0 = day, 1 = full night
    this.sunsetFactor = 0.0;
    this.ambientTempC = 8.4;

    this._pmrem = new THREE.PMREMGenerator(renderer);
    this._pmrem.compileEquirectangularShader();
    this._envScene = new THREE.Scene();
    this._lastBakedElev = -999;
    this._envRT = null;

    this._buildSkyDome();
    this._buildLights();
    this._buildLakeMist();
    this._buildVolumetricGodRays();
    this._buildFarVillageLights();
    this._buildNightFireflies();
    this._buildFallingLeaves();

    this.scene.fog = new THREE.FogExp2(0x8aa8c8, 0.00022);
    this.update(0.016, 0);
  }

  _createSkyMaterial() {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uSunDir: { value: new THREE.Vector3(-0.6, 0.1, -0.8) },
        uMoonDir: { value: new THREE.Vector3(0.4, 0.3, -0.8) },
        uZenithColor: { value: new THREE.Color(0x1e66bd) },
        uMidSkyColor: { value: new THREE.Color(0x5ea6e4) },
        uHorizonColor: { value: new THREE.Color(0xd2e9fa) },
        uGroundColor: { value: new THREE.Color(0x0b121e) },
        uSunColor: { value: new THREE.Color(0xffd292) },
        uSunsetAmount: { value: 0.5 },
        uStarVisibility: { value: 0.0 },
        uCelestialAngle: { value: 0.0 },
        uTime: { value: 0.0 },
      },
      vertexShader: `
        varying vec3 vWorldDir;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldDir = normalize(position);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 uSunDir;
        uniform vec3 uMoonDir;
        uniform vec3 uZenithColor;
        uniform vec3 uMidSkyColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uGroundColor;
        uniform vec3 uSunColor;
        uniform float uSunsetAmount;
        uniform float uStarVisibility;
        uniform float uCelestialAngle;
        uniform float uTime;
        varying vec3 vWorldDir;

        float hash31(vec3 p) {
          p = fract(p * vec3(443.897, 441.423, 437.195));
          p += dot(p, p.yzx + 19.19);
          return fract((p.x + p.y) * p.z);
        }

        float noise3(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float n000 = hash31(i);
          float n100 = hash31(i + vec3(1,0,0));
          float n010 = hash31(i + vec3(0,1,0));
          float n110 = hash31(i + vec3(1,1,0));
          float n001 = hash31(i + vec3(0,0,1));
          float n101 = hash31(i + vec3(1,0,1));
          float n011 = hash31(i + vec3(0,1,1));
          float n111 = hash31(i + vec3(1,1,1));
          float nx00 = mix(n000, n100, f.x);
          float nx10 = mix(n010, n110, f.x);
          float nx01 = mix(n001, n101, f.x);
          float nx11 = mix(n011, n111, f.x);
          return mix(mix(nx00, nx10, f.y), mix(nx01, nx11, f.y), f.z);
        }

        float fbmCloud(vec2 uv) {
          float v = 0.0;
          float a = 0.5;
          mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
          for (int i = 0; i < 4; i++) {
            v += a * noise3(vec3(uv, 1.37));
            uv = rot * uv * 2.05 + vec2(3.1, 1.7);
            a *= 0.5;
          }
          return v;
        }

        // Rotate starfield around the North Celestial Pole (35.47 deg elevation at Lake Motosuko!)
        vec3 rotateCelestial(vec3 d, float ang) {
          float c = cos(ang);
          float s = sin(ang);
          return vec3(c * d.x + s * d.z, d.y, -s * d.x + c * d.z);
        }

        void main() {
          vec3 dir = normalize(vWorldDir);
          float h = dir.y;
          vec3 sDir = normalize(uSunDir);
          vec3 mDir = normalize(uMoonDir);

          // 1. 3-band physically-driven sky gradient
          float tMid = smoothstep(0.0, 0.24, max(h, 0.0));
          float tTop = smoothstep(0.16, 0.68, max(h, 0.0));
          vec3 sky = mix(uHorizonColor, uMidSkyColor, tMid);
          sky = mix(sky, uZenithColor, tTop);
          if (h < 0.0) {
            sky = mix(uHorizonColor, uGroundColor, clamp(-h * 5.0, 0.0, 1.0));
          }

          // 2. Solar Mie scattering & directional horizon glow following the real 3D sun position!
          float sunCos = max(dot(dir, sDir), 0.0);
          float azGlow = max(dot(normalize(vec2(dir.x, dir.z)), normalize(vec2(sDir.x, sDir.z))), 0.0);
          float sunAbove = smoothstep(-0.12, 0.04, sDir.y);
          float horizonBand = exp(-max(h, 0.0) * 5.0);
          sky += vec3(1.0, 0.62, 0.28) * (0.25 + 0.65 * pow(azGlow, 2.0)) * horizonBand * 0.62 * uSunsetAmount * sunAbove;
          sky += uSunColor * (pow(sunCos, 8.0) * 0.20 + pow(sunCos, 72.0) * 0.38) * sunAbove;
          // Crisp solar disc moving across the sky
          sky += uSunColor * smoothstep(0.99935, 0.99978, sunCos) * 1.45 * smoothstep(-0.03, 0.02, sDir.y);

          // 3. Volumetric clouds lit dynamically by both Sun (day/sunset) and Moon (night)!
          if (h > 0.015) {
            vec2 pUV = dir.xz / (h + 0.28);
            vec2 flow = vec2(uTime * 0.0025, -uTime * 0.0012);
            vec2 stretchUV = vec2(pUV.x * 1.15 + pUV.y * 0.45, pUV.y * 2.4 - pUV.x * 0.35) + flow;
            float cBase = fbmCloud(stretchUV * 1.35);
            float cDetail = fbmCloud(stretchUV * 3.1 + vec2(4.2, -1.8));
            float cloudDensity = smoothstep(0.45, 0.81, cBase * 0.72 + cDetail * 0.28);
            cloudDensity *= smoothstep(0.015, 0.14, h) * smoothstep(0.92, 0.35, h);

            vec3 cloudLit = mix(vec3(1.0, 0.97, 0.95), vec3(1.0, 0.70, 0.58), uSunsetAmount);
            vec3 cloudShade = mix(uZenithColor * 0.85, vec3(0.42, 0.34, 0.56), uSunsetAmount);
            float rimLight = smoothstep(0.35, 0.85, cDetail) * (0.4 + 0.6 * pow(sunCos, 1.5));
            vec3 dayCloud = mix(cloudShade, cloudLit, rimLight) * sunAbove;

            // Subtle moonlit silver-blue night clouds
            float moonCosC = max(dot(dir, mDir), 0.0);
            vec3 nightCloud = mix(vec3(0.03, 0.05, 0.10), vec3(0.20, 0.28, 0.44), pow(moonCosC, 4.0) * 0.7 + cDetail * 0.3) * uStarVisibility;

            sky = mix(sky, dayCloud + nightCloud, cloudDensity * mix(0.68, 0.38, uStarVisibility));
          }

          // 4. Crisp 3D Moon with lunar maria surface detail & silver atmospheric corona
          float moonCos = max(dot(dir, mDir), 0.0);
          float moonAbove = smoothstep(-0.04, 0.06, mDir.y);
          float moonHalo = (pow(moonCos, 28.0) * 0.20 + pow(moonCos, 180.0) * 0.45) * moonAbove * (0.25 + 0.75 * uStarVisibility);
          float moonDisc = smoothstep(0.9991, 0.99945, moonCos) * moonAbove;
          float maria = 0.78 + 0.22 * noise3(dir * 180.0);
          sky += vec3(0.72, 0.84, 1.0) * moonHalo + vec3(0.96, 0.98, 1.0) * moonDisc * maria * 1.65;

          // 5. Rotating Alpine Starfield (3,500+ multi-magnitude stars) & Luminous Milky Way Band!
          if (uStarVisibility > 0.01 && h > 0.0) {
            vec3 cDir = rotateCelestial(dir, uCelestialAngle);
            float horizonFade = smoothstep(0.01, 0.20, h);

            // Layer A: Bright primary navigation stars
            vec3 gridA = floor(cDir * 260.0);
            float rndA = hash31(gridA);
            float starA = smoothstep(0.9945, 0.9996, rndA);
            float twA = 0.62 + 0.38 * sin(uTime * 3.4 + rndA * 140.0);
            vec3 colA = mix(vec3(0.74, 0.86, 1.0), vec3(1.0, 0.88, 0.72), fract(rndA * 17.3));

            // Layer B: Dense fine background star dust
            vec3 gridB = floor(cDir * 520.0);
            float rndB = hash31(gridB);
            float starB = smoothstep(0.991, 0.999, rndB) * 0.55;

            sky += (colA * starA * twA * 2.1 + vec3(0.82, 0.88, 1.0) * starB) * uStarVisibility * horizonFade;

            // Luminous Milky Way Galaxy Arch with dark dust rift over Mt. Fuji!
            vec3 galNormal = normalize(vec3(0.58, 0.42, -0.69));
            float galDist = dot(cDir, galNormal);
            float mwBand = exp(-galDist * galDist * 14.0);
            float mwCore = exp(-galDist * galDist * 45.0);
            float mwNoise1 = noise3(cDir * 7.5);
            float mwNoise2 = noise3(cDir * 19.0 + 2.3);
            float dustRift = smoothstep(0.38, 0.68, noise3(cDir * 12.0 - 1.4));
            vec3 mwCol = mix(vec3(0.11, 0.17, 0.32), vec3(0.28, 0.24, 0.42), mwNoise1) * mwBand;
            mwCol += vec3(0.35, 0.32, 0.46) * mwCore * dustRift * mwNoise2;
            sky += mwCol * smoothstep(0.28, 0.82, mwNoise1 * 0.6 + mwNoise2 * 0.4) * uStarVisibility * horizonFade * 1.15;
          }

          gl_FragColor = vec4(sky, 1.0);
        }
      `,
    });
  }

  _buildSkyDome() {
    this.skyMat = this._createSkyMaterial();
    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(2400, 48, 32), this.skyMat);
    this.scene.add(this.skyMesh);

    this._envSkyMat = this._createSkyMaterial();
    this._envSkyMesh = new THREE.Mesh(new THREE.SphereGeometry(40, 24, 16), this._envSkyMat);
    this._envScene.add(this._envSkyMesh);
  }

  _buildLights() {
    this.sunLight = new THREE.DirectionalLight(0xffcf94, 2.8);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.near = 1.0;
    this.sunLight.shadow.camera.far = 75.0;
    const d = 15;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.025;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.hemiLight = new THREE.HemisphereLight(0xf2b5c4, 0x263142, 0.78);
    this.scene.add(this.hemiLight);
  }

  _buildLakeMist() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(128, 64, 6, 128, 64, 120);
    grad.addColorStop(0, 'rgba(185, 220, 250, 0.44)');
    grad.addColorStop(0.55, 'rgba(140, 185, 225, 0.16)');
    grad.addColorStop(1, 'rgba(120, 165, 210, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 128);

    const tex = new THREE.CanvasTexture(canvas);
    this.mistGroup = new THREE.Group();
    this.mistMat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      opacity: 0.24,
      color: 0xa6cbe8,
      side: THREE.DoubleSide,
    });

    this._mistPlanes = [];
    for (let i = 0; i < 10; i++) {
      const w = 180 + (i % 3) * 85;
      const h = 22 + (i % 2) * 12;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mistMat);
      const baseX = (i - 5) * 95;
      const z = -660 - (i % 4) * 55;
      m.position.set(baseX, 18 + (i % 3) * 8, z);
      m.userData = { baseX, speed: 1.1 + (i % 4) * 0.35, phase: i * 1.2 };
      this.mistGroup.add(m);
      this._mistPlanes.push(m);
    }
    this.scene.add(this.mistGroup);
  }

  _buildVolumetricGodRays() {
    this.godRayMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uColor: { value: new THREE.Color(0xffe0a8) },
        uIntensity: { value: 0.14 },
        uTime: { value: 0.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uIntensity;
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          if (uIntensity < 0.005) discard;
          float xFade = pow(sin(vUv.x * 3.14159265), 2.2);
          float yFade = smoothstep(0.0, 0.22, vUv.y) * pow(1.0 - vUv.y, 1.35);
          float shimmer = 0.85 + 0.15 * sin(vUv.x * 18.0 + uTime * 0.45);
          float alpha = xFade * yFade * shimmer * uIntensity;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
    });

    this.godRayGroup = new THREE.Group();
    const rayConfigs = [
      { x: -10.5, z: -5.8, w: 3.8, len: 18.0, rotY: 0.35 },
      { x: -8.2,  z: -2.2, w: 3.2, len: 16.5, rotY: -0.45 },
      { x: -12.0, z: 3.5,  w: 4.2, len: 19.0, rotY: 0.75 },
      { x: 9.8,   z: -6.2, w: 3.6, len: 17.5, rotY: 0.25 },
      { x: 8.5,   z: 2.8,  w: 3.4, len: 16.0, rotY: -0.55 },
      { x: -3.5,  z: 8.5,  w: 4.5, len: 18.5, rotY: 0.15 },
      { x: 4.2,   z: 9.2,  w: 4.0, len: 18.0, rotY: -0.25 },
    ];
    this._godRayMeshes = [];
    for (const rc of rayConfigs) {
      const geom = new THREE.PlaneGeometry(rc.w, rc.len);
      const m = new THREE.Mesh(geom, this.godRayMat);
      m.position.set(rc.x, 7.2, rc.z);
      m.userData = rc;
      this.godRayGroup.add(m);
      this._godRayMeshes.push(m);
    }
    this.scene.add(this.godRayGroup);
  }

  _buildFarVillageLights() {
    const count = 54;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    let seed = 445566;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    for (let i = 0; i < count; i++) {
      const cluster = i % 3;
      const cx = cluster === 0 ? -360 : (cluster === 1 ? 185 : 350);
      const x = cx + (rand() - 0.5) * 190;
      const z = -610 - rand() * 140;
      const y = 4.0 + rand() * 16.0;
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;

      const warm = rand() > 0.2;
      col[i * 3] = warm ? 1.0 : 0.85;
      col[i * 3 + 1] = warm ? (0.78 + rand() * 0.16) : 0.94;
      col[i * 3 + 2] = warm ? 0.42 : 1.0;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(col, 3));

    const vc = document.createElement('canvas');
    vc.width = 32;
    vc.height = 32;
    const vctx = vc.getContext('2d');
    const vg = vctx.createRadialGradient(16, 16, 1, 16, 16, 15);
    vg.addColorStop(0, 'rgba(255,255,255,1)');
    vg.addColorStop(0.45, 'rgba(255,235,190,0.65)');
    vg.addColorStop(1, 'rgba(255,220,160,0)');
    vctx.fillStyle = vg;
    vctx.fillRect(0, 0, 32, 32);

    this.villageMat = new THREE.PointsMaterial({
      size: 2.8,
      map: new THREE.CanvasTexture(vc),
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      sizeAttenuation: true,
      depthWrite: false,
      fog: false,
    });
    this.villageLights = new THREE.Points(geom, this.villageMat);
    this.scene.add(this.villageLights);
  }

  _buildNightFireflies() {
    // 45 warm glowing lakeside fireflies (蛍 Hotaru) that emerge around shoreline reeds & ferns at dusk/night!
    const count = 45;
    const pos = new Float32Array(count * 3);
    this._fireflyData = [];
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 28;
      const y = 1.2 + Math.random() * 2.4;
      const z = -13.5 + Math.random() * 19.0;
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      this._fireflyData.push({
        baseX: x,
        baseY: y,
        baseZ: z,
        phase: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 0.7,
      });
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    const fc = document.createElement('canvas');
    fc.width = 32;
    fc.height = 32;
    const fctx = fc.getContext('2d');
    const fg = fctx.createRadialGradient(16, 16, 1, 16, 16, 15);
    fg.addColorStop(0, 'rgba(255, 255, 190, 1)');
    fg.addColorStop(0.4, 'rgba(185, 245, 95, 0.65)');
    fg.addColorStop(1, 'rgba(140, 220, 60, 0)');
    fctx.fillStyle = fg;
    fctx.fillRect(0, 0, 32, 32);

    this.fireflyMat = new THREE.PointsMaterial({
      size: 0.22,
      map: new THREE.CanvasTexture(fc),
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.fireflyPoints = new THREE.Points(geom, this.fireflyMat);
    this.scene.add(this.fireflyPoints);
  }

  _buildFallingLeaves() {
    const count = 55;
    const geom = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    this._leafData = [];

    const palette = [
      new THREE.Color(0xc93518),
      new THREE.Color(0xd96b1f),
      new THREE.Color(0xe6a82e),
      new THREE.Color(0x9e2315),
    ];

    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 34;
      pos[i * 3 + 1] = 1.2 + Math.random() * 10;
      pos[i * 3 + 2] = -12 + Math.random() * 24;
      const c = palette[i % palette.length];
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
      this._leafData.push({ fall: 0.25 + Math.random() * 0.35, sway: Math.random() * Math.PI * 2 });
    }

    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(col, 3));

    const lc = document.createElement('canvas');
    lc.width = 32;
    lc.height = 32;
    const lctx = lc.getContext('2d');
    lctx.translate(16, 16);
    lctx.fillStyle = '#ffffff';
    lctx.beginPath();
    lctx.moveTo(0, -12);
    lctx.quadraticCurveTo(8, -6, 11, 0);
    lctx.quadraticCurveTo(6, 7, 0, 12);
    lctx.quadraticCurveTo(-6, 7, -11, 0);
    lctx.quadraticCurveTo(-8, -6, 0, -12);
    lctx.fill();

    this.leavesPoints = new THREE.Points(
      geom,
      new THREE.PointsMaterial({
        size: 0.12,
        map: new THREE.CanvasTexture(lc),
        alphaTest: 0.25,
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        sizeAttenuation: true,
      })
    );
    this.scene.add(this.leavesPoints);
  }

  cycleTimeScale() {
    const scales = [0, 4, 24, 90];
    const idx = scales.indexOf(this.timeScale);
    this.timeScale = scales[(idx + 1) % scales.length];
    return this.timeScale;
  }

  /** Scrub time directly (via `[` / `]` keys or HUD slider) */
  nudgeTime(deltaHours) {
    this.targetTimeOfDay = null;
    this.timeOfDay = (this.timeOfDay + deltaHours + 24.0) % 24.0;
  }

  setTimeOfDay(hours, smooth = false) {
    const h = ((hours % 24.0) + 24.0) % 24.0;
    if (smooth) {
      this.targetTimeOfDay = h;
    } else {
      this.targetTimeOfDay = null;
      this.timeOfDay = h;
      this._lastBakedElev = -999;
    }
  }

  cyclePresetTime() {
    const presets = [
      { h: 17.65, label: '富士夕烧 · 粉金晚霞 (17:39)' },
      { h: 21.50, label: '本栖湖星夜 · 皓月与银河 (21:30)' },
      { h: 6.18,  label: '破晓朝烧 · 晨光初照富士山 (06:11)' },
      { h: 15.35, label: '秋日暖阳 · 晴空红叶与碧湖 (15:21)' },
    ];
    let nextIdx = 0;
    const refH = this.targetTimeOfDay ?? this.timeOfDay;
    for (let i = 0; i < presets.length; i++) {
      if (Math.abs(refH - presets[i].h) < 1.1) {
        nextIdx = (i + 1) % presets.length;
        break;
      }
    }
    // Smoothly animate the Sun & Moon along their real orbital path to the target hour!
    this.targetTimeOfDay = presets[nextIdx].h;
    return presets[nextIdx].label;
  }

  getPhaseName() {
    const e = this.sunElevation;
    const h = this.timeOfDay;
    if (e > 0.22) return h < 12.0 ? '秋晨晴空' : '秋日暖阳';
    if (e >= 0.01) return h < 12.0 ? '破晓朝烧' : '黄金夕烧';
    if (e >= -0.11) return h < 12.0 ? '拂晓晨光' : '蓝调暮色';
    return '银河星夜';
  }

  getClockString() {
    const totalMins = Math.floor(this.timeOfDay * 60) % (24 * 60);
    const hh = String(Math.floor(totalMins / 60)).padStart(2, '0');
    const mm = String(totalMins % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  getSolarAngleDeg() {
    return (Math.asin(THREE.MathUtils.clamp(this.sunElevation, -1, 1)) * 180) / Math.PI;
  }

  update(dt, elapsed) {
    // 1. Advance time either via smooth orbital glide (when switching preset moods) or continuous natural flow
    if (this.targetTimeOfDay !== null) {
      let diff = this.targetTimeOfDay - this.timeOfDay;
      if (diff < -12.0) diff += 24.0;
      if (diff > 12.0) diff -= 24.0;
      if (Math.abs(diff) < 0.03) {
        this.timeOfDay = this.targetTimeOfDay;
        this.targetTimeOfDay = null;
        this._lastBakedElev = -999;
      } else {
        // Glide sun across sky over ~1.4 seconds so player literally watches the sun set / rise!
        const step = Math.sign(diff) * Math.max(0.08, Math.abs(diff) * 3.2) * dt;
        this.timeOfDay = (this.timeOfDay + step + 24.0) % 24.0;
      }
    } else if (this.timeScale > 0) {
      this.timeOfDay = (this.timeOfDay + (dt * this.timeScale) / 180.0) % 24.0;
    }

    this.windSpeed = 1.15 + 0.50 * Math.sin(elapsed * 0.16) + 0.22 * Math.cos(elapsed * 0.38);

    // 2. TRUE CELESTIAL MECHANICS AT LAKE MOTOSUKO (35.47° N Latitude, Autumn Solar Declination -11°)
    // Hour angle H = 0 at Solar Noon (12:00), -PI/2 at 06:00 (East rise), +PI/2 at 18:00 (West set)
    const hourAngle = ((this.timeOfDay - 12.0) / 24.0) * Math.PI * 2.0;
    const lat = 35.47 * (Math.PI / 180.0);
    const decl = -11.0 * (Math.PI / 180.0);

    // True spherical astronomy altitude & azimuth!
    const sinAlt = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngle);
    const alt = Math.asin(THREE.MathUtils.clamp(sinAlt, -1.0, 1.0));
    const cosAlt = Math.max(0.001, Math.cos(alt));

    // East (+X) to West (-X) diurnal trajectory, tilted slightly north (-Z) so sunset & sunrise flank Mt. Fuji!
    const sunX = -Math.sin(hourAngle) * cosAlt * 0.92;
    const sunY = Math.sin(alt);
    const sunZ = -0.56 - 0.32 * Math.cos(hourAngle) * cosAlt;
    this.sunDir.set(sunX, sunY, sunZ).normalize();
    this.sunElevation = this.sunDir.y;

    // Moon follows opposite orbital phase with a higher northern alpine culmination so moonlight bathes Mt. Fuji at night!
    const moonHourAngle = hourAngle + Math.PI * 0.96;
    const moonSinAlt = Math.sin(lat) * Math.sin(0.18) + Math.cos(lat) * Math.cos(0.18) * Math.cos(moonHourAngle);
    const moonAlt = Math.asin(THREE.MathUtils.clamp(moonSinAlt, -1.0, 1.0));
    const moonCosAlt = Math.max(0.001, Math.cos(moonAlt));
    this.moonDir.set(
      -Math.sin(moonHourAngle) * moonCosAlt * 0.85,
      Math.sin(moonAlt),
      -0.62 - 0.25 * Math.cos(moonHourAngle) * moonCosAlt
    ).normalize();
    this.moonElevation = this.moonDir.y;

    // Ambient temperature driven by real solar elevation (with thermal lag)
    const tempLag = Math.sin(((this.timeOfDay - 9.0) / 24.0) * Math.PI * 2.0);
    this.ambientTempC = 7.6 + 5.4 * tempLag;

    // 3. Atmospheric Scattering Factors derived purely from Solar Elevation `e`
    const e = this.sunElevation;
    const dayT = THREE.MathUtils.smoothstep(e, 0.06, 0.42);
    const sunsetT = Math.exp(-Math.pow((e - 0.03) / 0.16, 2.0));
    const nightT = 1.0 - THREE.MathUtils.smoothstep(e, -0.13, 0.04);
    const starVis = 1.0 - THREE.MathUtils.smoothstep(e, -0.15, -0.01);

    this.nightFactor = nightT;
    this.sunsetFactor = sunsetT;

    const zenithDay = new THREE.Color(0x1e66bd);
    const zenithSunset = new THREE.Color(0x4a5fa8);
    const zenithNight = new THREE.Color(0x030611);

    const midDay = new THREE.Color(0x5ea6e4);
    const midSunset = new THREE.Color(0xf69eb2);
    const midNight = new THREE.Color(0x070e1f);

    const horizonDay = new THREE.Color(0xd2e9fa);
    const horizonSunset = new THREE.Color(0xffb86c);
    const horizonNight = new THREE.Color(0x0d1932);

    const zenith = zenithDay.clone().lerp(zenithSunset, sunsetT * 0.92).lerp(zenithNight, nightT);
    const midSky = midDay.clone().lerp(midSunset, sunsetT).lerp(midNight, nightT);
    const horizon = horizonDay.clone().lerp(horizonSunset, sunsetT).lerp(horizonNight, nightT);
    const sunCol = new THREE.Color(0xfff4e0).lerp(new THREE.Color(0xff9652), sunsetT * 0.95);

    const celestialAngle = (this.timeOfDay / 24.0) * Math.PI * 2.0;
    const syncUniforms = (u) => {
      u.uSunDir.value.copy(this.sunDir);
      u.uMoonDir.value.copy(this.moonDir);
      u.uZenithColor.value.copy(zenith);
      u.uMidSkyColor.value.copy(midSky);
      u.uHorizonColor.value.copy(horizon);
      u.uSunColor.value.copy(sunCol);
      u.uSunsetAmount.value = sunsetT * (1.0 - nightT * 0.85);
      u.uStarVisibility.value = starVis;
      u.uCelestialAngle.value = celestialAngle;
      u.uTime.value = elapsed;
    };
    syncUniforms(this.skyMat.uniforms);
    syncUniforms(this._envSkyMat.uniforms);

    // 4. Seamless Sun -> Moon Directional Shadow & Specular Light Handoff
    if (e > -0.04) {
      this.sunLight.position.copy(this.sunDir).multiplyScalar(42);
      this.sunLight.color.copy(sunCol);
      this.sunLight.intensity = THREE.MathUtils.lerp(0.55, 3.3, Math.pow(Math.max(0, e + 0.04) / 1.04, 0.5));
    } else {
      // Crisp silver-blue alpine moonlight casting real moon shadows across the camp & lighting Mt. Fuji's snow!
      const mDir = this.moonDir.y > 0.08 ? this.moonDir : new THREE.Vector3(0.35, 0.42, -0.82).normalize();
      this.sunLight.position.copy(mDir).multiplyScalar(42);
      this.sunLight.color.setHex(0x90b4ec);
      this.sunLight.intensity = 0.62 * starVis;
    }
    this.sunLight.target.position.set(0, 1.05, -2.0);
    this.sunLight.target.updateMatrixWorld();

    // Hemisphere ambient fill (keeps night silhouettes readable in cool silver-indigo moonlight!)
    this.hemiLight.color.copy(midSky).lerp(zenith, 0.35).lerp(new THREE.Color(0x3a5688), nightT * 0.65);
    this.hemiLight.groundColor.setHex(0x282628).lerp(new THREE.Color(0x111726), nightT);
    this.hemiLight.intensity = THREE.MathUtils.lerp(0.34, 0.92, dayT) + sunsetT * 0.32;

    this.scene.fog.color.copy(midSky).lerp(new THREE.Color(0x2a5ea8), 0.35 * (1.0 - nightT)).lerp(horizonNight, nightT);
    this.scene.fog.density = 0.00018 + sunsetT * 0.00008 + nightT * 0.00008;

    // 5. Valley mist, far-shore village lights, God-Rays, Fireflies & Falling Leaves
    const mistOp = THREE.MathUtils.clamp(0.14 + sunsetT * 0.16, 0.06, 0.30) * (1.0 - nightT * 0.55);
    this.mistMat.opacity = mistOp;
    for (const m of this._mistPlanes) {
      m.position.x = m.userData.baseX + Math.sin(elapsed * 0.022 * m.userData.speed + m.userData.phase) * 35.0;
    }

    this.villageMat.opacity = THREE.MathUtils.clamp(0.12 + sunsetT * 0.72 + nightT * 0.92, 0.0, 0.98);

    if (this.godRayMat) {
      const rayVis = THREE.MathUtils.smoothstep(e, 0.01, 0.16) * (1.0 - THREE.MathUtils.smoothstep(e, 0.52, 0.78));
      this.godRayMat.uniforms.uIntensity.value = rayVis * (0.095 + sunsetT * 0.075);
      this.godRayMat.uniforms.uColor.value.copy(sunCol).lerp(horizon, 0.35);
      this.godRayMat.uniforms.uTime.value = elapsed;
      this.godRayGroup.visible = rayVis > 0.01;
      if (this.godRayGroup.visible) {
        const tiltX = -Math.atan2(this.sunDir.z, Math.max(0.15, this.sunDir.y)) * 0.42;
        const tiltZ = Math.atan2(this.sunDir.x, Math.max(0.15, this.sunDir.y)) * 0.42;
        for (const m of this._godRayMeshes) {
          m.rotation.set(tiltX, m.userData.rotY, tiltZ);
        }
      }
    }

    // Nighttime fireflies pulse & drift above lakeside reeds and ferns when stars come out!
    if (this.fireflyPoints) {
      this.fireflyPoints.visible = starVis > 0.05;
      if (this.fireflyPoints.visible) {
        const pulse = 0.65 + 0.35 * Math.sin(elapsed * 2.8);
        this.fireflyMat.opacity = starVis * 0.88 * pulse;
        const fAttr = this.fireflyPoints.geometry.getAttribute('position');
        for (let i = 0; i < this._fireflyData.length; i++) {
          const fd = this._fireflyData[i];
          const fx = fd.baseX + Math.sin(elapsed * fd.speed + fd.phase) * 0.85;
          const fy = fd.baseY + Math.sin(elapsed * fd.speed * 1.4 + fd.phase) * 0.42;
          const fz = fd.baseZ + Math.cos(elapsed * fd.speed * 0.9 + fd.phase) * 0.85;
          fAttr.setXYZ(i, fx, fy, fz);
        }
        fAttr.needsUpdate = true;
      }
    }

    const attr = this.leavesPoints.geometry.getAttribute('position');
    for (let i = 0; i < this._leafData.length; i++) {
      const d = this._leafData[i];
      let x = attr.getX(i) + (this.windDir.x * this.windSpeed * 0.2 + Math.sin(elapsed * 1.4 + d.sway) * 0.2) * dt;
      let y = attr.getY(i) - d.fall * dt;
      let z = attr.getZ(i) + (this.windDir.y * this.windSpeed * 0.15 + Math.cos(elapsed * 1.2 + d.sway) * 0.15) * dt;
      if (y < 1.05 || Math.abs(x) > 20) {
        x = (Math.random() - 0.5) * 30;
        y = 7.5 + Math.random() * 4.5;
        z = -10 + Math.random() * 20;
      }
      attr.setXYZ(i, x, y, z);
    }
    attr.needsUpdate = true;

    // Re-bake sky PMREM environment map when solar elevation shifts by > 0.025 rad
    if (Math.abs(e - this._lastBakedElev) > 0.025) {
      this._lastBakedElev = e;
      if (this._envRT) this._envRT.dispose();
      this._envRT = this._pmrem.fromScene(this._envScene, 0.02);
      this.scene.environment = this._envRT.texture;
      this.scene.environmentIntensity = THREE.MathUtils.lerp(0.32, 0.92, 1.0 - nightT * 0.65);
    }
  }
}
