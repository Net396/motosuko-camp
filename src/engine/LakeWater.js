import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';

/**
 * Photographic Glassy-Mirror Lake Motosuko Water Shader ("逆さ富士" Inverted Mt. Fuji!).
 * Features:
 * - True planar mirror reflection of Sky Dome + Painted Dusk Clouds + Razor-Sharp Mt. Fuji
 * - Boosted calm alpine mirror Fresnel reflectance (matches DSLR magic-hour mirror lake photo!)
 * - Ultra-subtle calm capillary wind shimmer (distortionScale = 0.045) so snow streaks reflect crisply!
 * - High-FPS reflection culling (skips foreground camp/forest props & throttles mirror updates)
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
      distortionScale: 0.042, // Glassy calm mirror lake -> razor-sharp Inverted Mt. Fuji!
      fog: true,
    });

    // Enhance Three.js Water fragment shader so mirror sky/Fuji reflection shines clearly like glass!
    this.water.material.fragmentShader = this.water.material.fragmentShader
      .replace(
        'float rf0 = 0.3;',
        'float rf0 = 0.72;' // Calm magic-hour mirror lake Fresnel reflectance!
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
    // Keep water mirror-calm so Inverted Mt. Fuji stays crystal clear like the reference photograph!
    uniforms.distortionScale.value = 0.035 + sky.windSpeed * 0.018;

    if (sky.sunElevation > -0.04) {
      uniforms.sunDirection.value.copy(sky.sunDir);
      uniforms.sunColor.value.copy(sky.sunLight.color);
    } else {
      const moonDir = sky.sunDir.clone().negate();
      moonDir.y = Math.max(0.1, moonDir.y);
      uniforms.sunDirection.value.copy(moonDir.normalize());
      uniforms.sunColor.value.setHex(0x6e88b5);
    }

    // Vivid sapphire-turquoise alpine lake water during sunny day -> deep cobalt dusk -> midnight indigo
    const nightT = 1.0 - THREE.MathUtils.smoothstep(sky.sunElevation, -0.15, 0.05);
    const dayT = THREE.MathUtils.smoothstep(sky.sunElevation, 0.08, 0.42);
    uniforms.waterColor.value
      .setHex(0x0b2846)
      .lerp(new THREE.Color(0x0a569e), dayT)
      .lerp(new THREE.Color(0x030812), nightT);
  }
}
