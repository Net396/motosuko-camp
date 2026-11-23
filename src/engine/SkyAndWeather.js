import * as THREE from 'three';

/**
 * Photographic Japanese Magic-Hour Atmospheric Sky Dome, Sculpted Backlit Dusk Clouds,
 * Milky Way Starfield, Dynamic Sun/Moon Shadows, Far-Shore Lakeside Village Lights,
 * Misty Blue Aokigahara Base Fog, and Autumn Falling Maple Leaves.
 */
export class SkyAndWeather {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;

    // Start at 15:24 (Crisp Sunlit Golden Autumn Afternoon — warm cozy light & shadows, vibrant azure sky & sapphire lake!)
    // Press [G] anytime to switch to 17:44 Pink-Gold Sunset Alpenglow, 21:20 Milky Way Starry Night, or 06:22 Dawn Mist!
    this.timeOfDay = 15.40;
    this.timeScale = 1;
    this.windSpeed = 1.2;
    this.windDir = new THREE.Vector2(0.8, 0.4).normalize();
    this.sunDir = new THREE.Vector3(-0.62, 0.09, -0.78).normalize();
    this.sunElevation = 0.09;
    this.ambientTempC = 8.4;

    this._pmrem = new THREE.PMREMGenerator(renderer);
    this._pmrem.compileEquirectangularShader();
    this._envScene = new THREE.Scene();
    this._lastBakedElev = -999;
    this._envRT = null;

    this._buildSkyDome();
    this._buildLights();
    this._buildLakeMist();
    this._buildFarVillageLights();
    this._buildFallingLeaves();

    // Very light alpine crystal-clear aerial haze so Mt. Fuji stays razor sharp!
    this.scene.fog = new THREE.FogExp2(0x8aa8c8, 0.00024);
    this.update(0.016, 0);
  }

  _createSkyMaterial() {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uSunDir: { value: new THREE.Vector3(-0.6, 0.08, -0.8) },
        uMoonDir: { value: new THREE.Vector3(0.4, -0.2, 0.8) },
        uZenithColor: { value: new THREE.Color(0x4b68b4) },
        uMidSkyColor: { value: new THREE.Color(0xf4a6b8) },
        uHorizonColor: { value: new THREE.Color(0xffbe72) },
        uGroundColor: { value: new THREE.Color(0x131d2b) },
        uSunColor: { value: new THREE.Color(0xffd292) },
        uSunsetAmount: { value: 0.9 },
        uStarVisibility: { value: 0.0 },
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

        void main() {
          vec3 dir = normalize(vWorldDir);
          float h = dir.y;
          vec3 sDir = normalize(uSunDir);

          // 3-band photographic sky gradient: Apricot-Gold Horizon -> Sakura Rose-Pink Mid-Sky -> Violet-Blue Zenith!
          float tMid = smoothstep(0.0, 0.24, max(h, 0.0));
          float tTop = smoothstep(0.16, 0.68, max(h, 0.0));
          vec3 sky = mix(uHorizonColor, uMidSkyColor, tMid);
          sky = mix(sky, uZenithColor, tTop);
          if (h < 0.0) {
            sky = mix(uHorizonColor, uGroundColor, clamp(-h * 5.0, 0.0, 1.0));
          }

          // Soft glowing apricot-gold horizon band + diffused magic-hour solar glow (no harsh white blowout!)
          float sunCos = max(dot(dir, sDir), 0.0);
          float azGlow = max(dot(normalize(vec2(dir.x, dir.z)), normalize(vec2(sDir.x, sDir.z))), 0.0);
          float sunAbove = smoothstep(-0.10, 0.03, sDir.y);
          float horizonBand = exp(-max(h, 0.0) * 5.2);
          sky += vec3(1.0, 0.66, 0.32) * (0.28 + 0.52 * pow(azGlow, 1.8)) * horizonBand * 0.58 * uSunsetAmount * sunAbove;
          sky += uSunColor * (pow(sunCos, 8.0) * 0.18 + pow(sunCos, 64.0) * 0.30) * sunAbove;
          sky += uSunColor * smoothstep(0.99945, 0.9998, sunCos) * 1.1 * sunAbove;

          // Rich sculpted backlit Japanese dusk/dawn cirrus & altocumulus clouds!
          if (h > 0.015) {
            vec2 pUV = dir.xz / (h + 0.28);
            vec2 flow = vec2(uTime * 0.0025, -uTime * 0.0012);
            // Sweeping diagonal cloud streaks across upper-right & mid-sky (just like reference photo!)
            vec2 stretchUV = vec2(pUV.x * 1.15 + pUV.y * 0.45, pUV.y * 2.4 - pUV.x * 0.35) + flow;
            float cBase = fbmCloud(stretchUV * 1.35);
            float cDetail = fbmCloud(stretchUV * 3.1 + vec2(4.2, -1.8));
            float cloudDensity = smoothstep(0.44, 0.80, cBase * 0.72 + cDetail * 0.28);
            cloudDensity *= smoothstep(0.015, 0.14, h) * smoothstep(0.92, 0.35, h);

            // Cloud lighting: warm luminous apricot-pink rim on sunlit side, soft lavender-violet shadows!
            vec3 cloudLit = mix(vec3(1.0, 0.96, 0.94), vec3(1.0, 0.74, 0.68), uSunsetAmount);
            vec3 cloudShade = mix(uZenithColor * 0.85, vec3(0.46, 0.38, 0.58), uSunsetAmount);
            float rimLight = smoothstep(0.35, 0.85, cDetail) * (0.4 + 0.6 * pow(sunCos, 1.5));
            vec3 cloudCol = mix(cloudShade, cloudLit, rimLight) * (0.18 + 0.82 * sunAbove);
            sky = mix(sky, cloudCol, cloudDensity * 0.68);
          }

          // Silver Moon disc & subtle halo at night
          float moonCos = max(dot(dir, normalize(uMoonDir)), 0.0);
          float moonAbove = smoothstep(-0.05, 0.08, uMoonDir.y);
          sky += vec3(0.76, 0.86, 1.0) * (pow(moonCos, 36.0) * 0.15 + smoothstep(0.9994, 0.9997, moonCos) * 1.45) * moonAbove;

          // Crisp Alpine Starfield + Milky Way band after dusk
          if (uStarVisibility > 0.01 && h > 0.0) {
            vec3 starGrid = floor(dir * 340.0);
            float rnd = hash31(starGrid);
            float starMask = smoothstep(0.9935, 0.9995, rnd);
            float twinkle = 0.65 + 0.35 * sin(uTime * 3.0 + rnd * 120.0);
            vec3 starCol = mix(vec3(0.78, 0.86, 1.0), vec3(1.0, 0.88, 0.74), fract(rnd * 17.3));
            float horizonFade = smoothstep(0.02, 0.24, h);
            sky += starCol * starMask * twinkle * uStarVisibility * horizonFade * 1.65;

            float galPlane = abs(dot(dir, normalize(vec3(0.62, 0.38, -0.68))));
            float mwBand = exp(-galPlane * galPlane * 16.0);
            float mwCloud = noise3(dir * 9.0) * 0.6 + noise3(dir * 21.0) * 0.4;
            sky += vec3(0.16, 0.20, 0.32) * mwBand * smoothstep(0.32, 0.82, mwCloud) * uStarVisibility * horizonFade * 0.75;
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
    // Tight 1024x1024 shadow frustum over campsite (crisp 3cm texels, updated at 4Hz!)
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

    // Rich sky/ground atmospheric bounce fill
    this.hemiLight = new THREE.HemisphereLight(0xf2b5c4, 0x263142, 0.78);
    this.scene.add(this.hemiLight);
  }

  _buildLakeMist() {
    // Delicate blue-silver Aokigahara valley mist hovering gently along Fuji's wooded foothills!
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

  _buildFarVillageLights() {
    // Tiny warm-gold distant roadside & lakeside cabin lights nestled along the far shore of Lake Motosuko!
    const count = 48;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    let seed = 445566;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    for (let i = 0; i < count; i++) {
      // Cluster loosely in 3 small lakeside village pockets along far shore (left, center-right foothills, far right)
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
    vg.addColorStop(0.45, 'rgba(255,235,190,0.6)');
    vg.addColorStop(1, 'rgba(255,220,160,0)');
    vctx.fillStyle = vg;
    vctx.fillRect(0, 0, 32, 32);

    this.villageMat = new THREE.PointsMaterial({
      size: 2.6,
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
    const scales = [1, 12, 60];
    const idx = scales.indexOf(this.timeScale);
    this.timeScale = scales[(idx + 1) % scales.length];
    return this.timeScale;
  }

  cyclePresetTime() {
    const presets = [
      { h: 15.40, label: '秋日暖阳 · 晴空红叶与碧湖' },
      { h: 17.74, label: '富士暮霞 · 粉金晚霞逆富士' },
      { h: 21.30, label: '本栖湖银河 · 静谧星夜' },
      { h: 6.22,  label: '清晨薄雾 · 粉金富士朝烧' },
    ];
    let nextIdx = 0;
    for (let i = 0; i < presets.length; i++) {
      if (Math.abs(this.timeOfDay - presets[i].h) < 1.2) {
        nextIdx = (i + 1) % presets.length;
        break;
      }
    }
    this.timeOfDay = presets[nextIdx].h;
    this._lastBakedElev = -999;
    return presets[nextIdx].label;
  }

  getPhaseName() {
    const h = this.timeOfDay;
    if (h >= 5.2 && h < 7.2) return '粉金朝烧';
    if (h >= 7.2 && h < 11.2) return '秋晨晴空';
    if (h >= 11.2 && h < 15.5) return '清朗午后';
    if (h >= 15.5 && h < 17.7) return '魔幻暮霞';
    if (h >= 17.7 && h < 19.0) return '蓝调暮色';
    if (h >= 19.0 || h < 4.5) return '银河星夜';
    return '拂晓微明';
  }

  getClockString() {
    const totalMins = Math.floor(this.timeOfDay * 60) % (24 * 60);
    const hh = String(Math.floor(totalMins / 60)).padStart(2, '0');
    const mm = String(totalMins % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  update(dt, elapsed) {
    this.timeOfDay = (this.timeOfDay + (dt * this.timeScale) / 180.0) % 24.0;
    this.windSpeed = 1.2 + 0.55 * Math.sin(elapsed * 0.16) + 0.25 * Math.cos(elapsed * 0.38);

    const tempWave = Math.sin(((this.timeOfDay - 8.5) / 24.0) * Math.PI * 2.0);
    this.ambientTempC = 7.8 + 5.2 * tempWave;

    // Solar orbital arc placing sunrise/sunset warmly flanking Mt. Fuji!
    const solarAngle = ((this.timeOfDay - 6.0) / 24.0) * Math.PI * 2.0;
    const elev = Math.sin(solarAngle) * 0.88;
    const horiz = Math.cos(solarAngle);
    this.sunDir.set(horiz * 0.82, elev, -0.58 - 0.22 * Math.sin(solarAngle * 0.5)).normalize();
    this.sunElevation = this.sunDir.y;

    const moonDir = this.sunDir.clone().negate();
    moonDir.y = Math.max(-0.5, moonDir.y * 0.85 + 0.15);
    moonDir.normalize();

    const e = this.sunElevation;
    const dayT = THREE.MathUtils.smoothstep(e, 0.06, 0.44);
    const sunsetT = Math.exp(-Math.pow((e - 0.05) / 0.18, 2.0));
    const nightT = 1.0 - THREE.MathUtils.smoothstep(e, -0.14, 0.05);
    const starVis = 1.0 - THREE.MathUtils.smoothstep(e, -0.18, -0.01);

    // Crisp Japanese autumn azure sky in daytime + luminous Alpenglow sunset/sunrise!
    const zenithDay = new THREE.Color(0x1e66bd);
    const zenithSunset = new THREE.Color(0x5269b2);
    const zenithNight = new THREE.Color(0x040712);

    const midDay = new THREE.Color(0x5ea6e4);
    const midSunset = new THREE.Color(0xf6a3b5);
    const midNight = new THREE.Color(0x091020);

    const horizonDay = new THREE.Color(0xd2e9fa);
    const horizonSunset = new THREE.Color(0xffbe74);
    const horizonNight = new THREE.Color(0x0c1426);

    const zenith = zenithDay.clone().lerp(zenithSunset, sunsetT * 0.92).lerp(zenithNight, nightT);
    const midSky = midDay.clone().lerp(midSunset, sunsetT).lerp(midNight, nightT);
    const horizon = horizonDay.clone().lerp(horizonSunset, sunsetT).lerp(horizonNight, nightT);
    const sunCol = new THREE.Color(0xfff3de).lerp(new THREE.Color(0xffa768), sunsetT * 0.9);

    const syncUniforms = (u) => {
      u.uSunDir.value.copy(this.sunDir);
      u.uMoonDir.value.copy(moonDir);
      u.uZenithColor.value.copy(zenith);
      u.uMidSkyColor.value.copy(midSky);
      u.uHorizonColor.value.copy(horizon);
      u.uSunColor.value.copy(sunCol);
      u.uSunsetAmount.value = sunsetT * (1.0 - nightT);
      u.uStarVisibility.value = starVis;
      u.uTime.value = elapsed;
    };
    syncUniforms(this.skyMat.uniforms);
    syncUniforms(this._envSkyMat.uniforms);

    // Directional Sun / Moon lighting
    if (e > -0.06) {
      this.sunLight.position.copy(this.sunDir).multiplyScalar(42);
      this.sunLight.color.copy(sunCol);
      this.sunLight.intensity = THREE.MathUtils.lerp(0.65, 3.2, Math.pow(Math.max(0, e + 0.06) / 1.06, 0.52));
    } else {
      this.sunLight.position.copy(moonDir).multiplyScalar(42);
      this.sunLight.color.setHex(0x88a8dc);
      this.sunLight.intensity = 0.36;
    }
    this.sunLight.target.position.set(0, 1.05, -2.0);
    this.sunLight.target.updateMatrixWorld();

    // Rich hemisphere skylight (warm pink-lavender top + deep alpine shadow bottom)
    this.hemiLight.color.copy(midSky).lerp(zenith, 0.35);
    this.hemiLight.groundColor.setHex(0x282628).lerp(new THREE.Color(0x0c0f16), nightT);
    this.hemiLight.intensity = THREE.MathUtils.lerp(0.22, 0.92, dayT) + sunsetT * 0.32;

    // Very crisp alpine distance haze so Mt. Fuji retains photographic cobalt contrast (never washed out!)
    this.scene.fog.color.copy(midSky).lerp(new THREE.Color(0x2a5ea8), 0.35 * (1.0 - nightT)).lerp(horizonNight, nightT);
    this.scene.fog.density = 0.00018 + sunsetT * 0.00008 + nightT * 0.00009;

    // Blue-silver misty valley layer along Fuji's wooded foothills
    const mistOp = THREE.MathUtils.clamp(0.14 + sunsetT * 0.16, 0.06, 0.30) * (1.0 - nightT * 0.65);
    this.mistMat.opacity = mistOp;
    for (const m of this._mistPlanes) {
      m.position.x = m.userData.baseX + Math.sin(elapsed * 0.022 * m.userData.speed + m.userData.phase) * 35.0;
    }

    // Far-shore village lights twinkle softly during twilight/sunset & starry night
    this.villageMat.opacity = THREE.MathUtils.clamp(0.2 + sunsetT * 0.65 + nightT * 0.85, 0.0, 0.95);

    // Falling maple leaves
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

    // Event-driven PMREM environment cubemap baking (zero periodic frame hitch!)
    if (Math.abs(e - this._lastBakedElev) > 0.03) {
      this._lastBakedElev = e;
      if (this._envRT) this._envRT.dispose();
      this._envRT = this._pmrem.fromScene(this._envScene, 0.02);
      this.scene.environment = this._envRT.texture;
      this.scene.environmentIntensity = THREE.MathUtils.lerp(0.28, 0.92, 1.0 - nightT * 0.72);
    }
  }
}
