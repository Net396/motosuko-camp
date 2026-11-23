import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { getShoreZ } from './terrainMath.js';

/**
 * Photographic Glassy-Mirror Lake Motosuko Water Shader ("逆さ富士" Inverted Mt. Fuji!)
 * + 3D Curved Shoreline Lapping Wave Swash Ribbon washing over the 3D volcanic pebbles.
 */
export class LakeWater {
  constructor(scene) {
    this.scene = scene;
    this.reflectionHidden = [];
    this._frameCounter = 0;

    const normalMap = this._createCalmRippleNormals(256);
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
    normalMap.anisotropy = 4;

    const waterGeom = new THREE.PlaneGeometry(2600, 1800);
    this.water = new Water(waterGeom, {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: normalMap,
      sunDirection: new THREE.Vector3(-0.6, 0.09, -0.8).normalize(),
      sunColor: 0xffc98a,
      waterColor: 0x0b2846,
      distortionScale: 0.042,
      fog: true,
    });

    this.water.material.fragmentShader = this.water.material.fragmentShader
      .replace(
        'float rf0 = 0.3;',
        'float rf0 = 0.72;'
      )
      .replace(
        'vec3 albedo = mix( ( sunColor * diffuseLight * 0.3 + scatter ) * getShadowMask(), ( vec3( 0.1 ) + reflectionSample * 0.9 + reflectionSample * specularLight ), reflectance);',
        'vec3 albedo = mix( ( sunColor * diffuseLight * 0.12 + scatter * 0.55 ) * getShadowMask(), ( reflectionSample * 1.04 + reflectionSample * specularLight * 0.45 ), reflectance);'
      );
    this.water.material.needsUpdate = true;

    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(0, 0.0, -760);
    this.water.material.uniforms.size.value = 11.0;

    const origOnBeforeRender = this.water.onBeforeRender.bind(this.water);
    this.water.onBeforeRender = (renderer, sceneArg, camera) => {
      this._frameCounter++;
      if (this._frameCounter > 3 && this._frameCounter % 3 !== 0) return;

      const prevVis = [];
      for (let i = 0; i < this.reflectionHidden.length; i++) {
        const obj = this.reflectionHidden[i];
        prevVis.push(obj.visible);
        obj.visible = false;
      }

      const prevShadowAuto = renderer.shadowMap.autoUpdate;
      renderer.shadowMap.autoUpdate = false;
      origOnBeforeRender(renderer, sceneArg, camera);
      renderer.shadowMap.autoUpdate = prevShadowAuto;

      for (let i = 0; i < this.reflectionHidden.length; i++) {
        this.reflectionHidden[i].visible = prevVis[i];
      }
    };

    this.scene.add(this.water);
    this._buildShorelineSwash();
  }

  _buildShorelineSwash() {
    const segsX = 110;
    const widthX = 92.0;
    const geom = new THREE.BufferGeometry();
    const verts = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i <= segsX; i++) {
      const u = i / segsX;
      const x = (u - 0.5) * widthX;
      const sz = getShoreZ(x);
      verts.push(x, 0.025, sz + 0.35);
      verts.push(x, 0.015, sz - 1.45);
      uvs.push(u * 14.0, 0.0);
      uvs.push(u * 14.0, 1.0);
      if (i < segsX) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    geom.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setIndex(indices);

    this.swashMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0xd8ecfa) },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColor;
        varying vec2 vUv;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
        }
        void main() {
          float n = noise(vec2(vUv.x * 2.5, vUv.y * 4.0 - uTime * 0.55));
          float wave1 = sin(vUv.y * 9.0 - uTime * 1.65 + n * 2.2);
          float foam1 = smoothstep(0.76, 0.98, wave1) * (1.0 - smoothstep(0.0, 0.14, vUv.y));
          float shoreEdge = exp(-pow((vUv.y - 0.18 - 0.08 * sin(uTime * 1.65 + vUv.x * 0.8)) * 9.5, 2.0));
          float alpha = clamp((foam1 * 0.35 + shoreEdge * 0.55) * (0.55 + 0.45 * n) * (1.0 - vUv.y), 0.0, 0.52);
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
    });

    this.swashMesh = new THREE.Mesh(geom, this.swashMat);
    this.scene.add(this.swashMesh);
    this.excludeFromReflection(this.swashMesh);
  }

  excludeFromReflection(obj) {
    if (obj) this.reflectionHidden.push(obj);
  }

  forceReflectionRefresh() {
    this._frameCounter = 0;
  }

  _createCalmRippleNormals(size) {
    const data = new Uint8Array(size * size * 4);
    const TAU = Math.PI * 2;
    let seed = 918273;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    const waves = [];
    for (let i = 0; i < 24; i++) {
      const ang = (i / 24) * Math.PI + (rand() - 0.5) * 0.22;
      const k = 4 + Math.floor(Math.pow(rand(), 1.35) * 24);
      const fx = Math.round(Math.cos(ang) * k);
      const fy = Math.round(Math.sin(ang) * k);
      if (fx === 0 && fy === 0) continue;
      const freqMag = Math.hypot(fx, fy);
      waves.push({ fx, fy, amp: 0.26 / Math.pow(freqMag, 1.15), ph: rand() * TAU });
    }

    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        let dhdx = 0;
        let dhdy = 0;
        for (let w = 0; w < waves.length; w++) {
          const wave = waves[w];
          const c = Math.cos(TAU * (wave.fx * u + wave.fy * v) + wave.ph) * wave.amp;
          dhdx += c * wave.fx;
          dhdy += c * wave.fy;
        }
        const nx = -dhdx * 0.16;
        const ny = -dhdy * 0.16;
        const nz = 1.0;
        const invLen = 1.0 / Math.hypot(nx, ny, nz);
        const idx = (y * size + x) * 4;
        data[idx]     = Math.floor(((nx * invLen) * 0.5 + 0.5) * 255);
        data[idx + 1] = Math.floor(((ny * invLen) * 0.5 + 0.5) * 255);
        data[idx + 2] = Math.floor(((nz * invLen) * 0.5 + 0.5) * 255);
        data[idx + 3] = 255;
      }
    }

    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.needsUpdate = true;
    return tex;
  }

  update(dt, sky) {
    const uniforms = this.water.material.uniforms;
    uniforms.time.value += dt * (0.09 + sky.windSpeed * 0.025);
    uniforms.distortionScale.value = 0.035 + sky.windSpeed * 0.018;

    if (sky.sunElevation > -0.04) {
      uniforms.sunDirection.value.copy(sky.sunDir);
      uniforms.sunColor.value.copy(sky.sunLight.color);
    } else {
      // Shimmering Silver Moon Path (月光道) driven by the real 3D Moon orbit at night!
      const mDir = sky.moonDir && sky.moonDir.y > 0.06
        ? sky.moonDir
        : new THREE.Vector3(0.35, 0.42, -0.82).normalize();
      uniforms.sunDirection.value.copy(mDir);
      uniforms.sunColor.value.setHex(0x9cbfff);
    }

    const nightT = 1.0 - THREE.MathUtils.smoothstep(sky.sunElevation, -0.15, 0.05);
    const dayT = THREE.MathUtils.smoothstep(sky.sunElevation, 0.08, 0.42);
    uniforms.waterColor.value
      .setHex(0x0b2846)
      .lerp(new THREE.Color(0x0a569e), dayT)
      .lerp(new THREE.Color(0x030812), nightT);

    if (this.swashMat) {
      this.swashMat.uniforms.uTime.value = uniforms.time.value * 4.5;
      this.swashMat.uniforms.uColor.value.copy(uniforms.sunColor.value).lerp(new THREE.Color(0xd8ecfa), 0.55);
    }
  }
}
