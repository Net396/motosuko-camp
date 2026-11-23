import './style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import { AssetLoader } from './engine/AssetLoader.js';
import { SkyAndWeather } from './engine/SkyAndWeather.js';
import { LakeWater } from './engine/LakeWater.js';
import { SoundEngine } from './audio/SoundEngine.js';
import { PlayerController } from './gameplay/PlayerController.js';
import { CampGame } from './gameplay/CampGame.js';
import { HUDManager } from './ui/HUDManager.js';

// Optional Cinematic Fujifilm Classic-Chrome / DSLR optical lens color-grading pass ([Q] toggle)
const FilmGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 col = tex.rgb;
      col = mix(col, smoothstep(0.0, 1.0, col), 0.14);
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col += vec3(-0.008, 0.0, 0.012) * (1.0 - smoothstep(0.0, 0.35, lum));
      col += vec3(0.012, 0.004, -0.006) * smoothstep(0.55, 1.0, lum);
      vec2 d = vUv - 0.5;
      col *= clamp(1.0 - dot(d, d) * 0.36, 0.76, 1.0);
      gl_FragColor = vec4(max(col, 0.0), tex.a);
    }
  `,
};

async function bootstrap() {
  const canvas = document.getElementById('webgl-canvas');
  const hud = new HUDManager();

  // 1. High-FPS Photorealistic WebGL2 Renderer (no preserveDrawingBuffer overhead!)
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });

  // Graphics mode: 0 = 流畅实景 (Default: silky high-FPS direct ACES render)
  //                1 = 电影光晕 (HDR Bloom + Fujifilm post-processing)
  let qualityMode = 0;
  const applyQuality = () => {
    const dpr = qualityMode === 0
      ? 1.0
      : Math.min(window.devicePixelRatio, 1.5);
    renderer.setPixelRatio(dpr);
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (composer) composer.setSize(window.innerWidth, window.innerHeight);
  };

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false; // Update shadow map on timer/events instead of 60x/sec!
  renderer.shadowMap.needsUpdate = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(56, window.innerWidth / window.innerHeight, 0.08, 3200);
  scene.add(camera);

  // 2. Optional Cinematic Post-processing Composer (only invoked when qualityMode === 1!)
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(Math.floor(window.innerWidth * 0.5), Math.floor(window.innerHeight * 0.5)),
    0.26,
    0.45,
    1.05
  );
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  composer.addPass(new ShaderPass(FilmGradeShader));

  applyQuality();

  // 3. Atmosphere, Sky Dome, Milky Way & Silky Lake Motosuko Planar-Reflection Water
  const sky = new SkyAndWeather(scene, renderer);
  const lake = new LakeWater(scene);

  // 4. Load all 30 high-detail Blender 5.3 PBR .glb Models (batched via GPU InstancedMesh!)
  const assets = new AssetLoader();
  await assets.loadAll((frac, key) => {
    hud.setLoadingProgress(frac, key);
  });
  assets.populateEnvironment(scene);

  // Exclude high-poly foreground trees/pebbles from Lake Motosuko's planar reflection pass
  // (Sky Dome + Mt. Fuji still reflect crisply for authentic 逆さ富士 at 30x lower GPU cost!)
  lake.excludeFromReflection(assets.natureGroup);

  // 5. Audio, First-Person Controller & Interactive Japanese Solo Camp Gameplay
  const sound = new SoundEngine();
  const player = new PlayerController(camera, canvas, sound);
  const game = new CampGame(scene, camera, assets, player, sound, hud);
  renderer.shadowMap.needsUpdate = true;

  hud.showReady();

  let started = false;
  hud.el.startBtn.addEventListener('click', () => {
    started = true;
    sound.init();
    hud.enterGame();
    player.lock();
    hud.showToast('欢迎来到本栖湖·浩庵露营场！先去左侧劈柴、架柴点亮篝火吧 🔥', 4200);
  });

  canvas.addEventListener('click', () => {
    if (started && !player.isLocked) {
      sound.init();
      player.lock();
    }
  });

  const renderFrame = () => {
    if (qualityMode === 1) composer.render();
    else renderer.render(scene, camera);
  };

  window.addEventListener('keydown', (e) => {
    if (!started) return;
    if (e.code === 'KeyT') {
      const scale = sky.cycleTimeScale();
      hud.showToast(scale === 0 ? '⏸ 时间流逝已暂停 (可用 [ / ] 键手动拨动太阳)' : `⏱ 真实太阳运转流速已切换为 ×${scale}`);
    } else if (e.code === 'KeyG') {
      const mood = sky.cyclePresetTime();
      renderer.shadowMap.needsUpdate = true;
      lake.forceReflectionRefresh();
      hud.showToast(`☀️ 太阳正沿真实天体轨道运转至：${mood}`);
    } else if (e.code === 'Digit1') {
      sky.setTimeOfDay(6.18, true);
      hud.showToast('🌅 太阳正从东侧山脊升起：破晓朝烧 (06:11)');
    } else if (e.code === 'Digit2') {
      sky.setTimeOfDay(15.35, true);
      hud.showToast('☀️ 太阳正运行至午后斜阳：秋日暖阳 (15:21)');
    } else if (e.code === 'Digit3') {
      sky.setTimeOfDay(17.65, true);
      hud.showToast('🌇 太阳正西沉至富士山侧：黄金夕烧 (17:39)');
    } else if (e.code === 'Digit4') {
      sky.setTimeOfDay(21.50, true);
      hud.showToast('🌌 太阳沉入地平线以下：本栖湖银河星夜与露营串灯 (21:30)');
    } else if (e.code === 'BracketLeft') {
      sky.nudgeTime(-0.35);
      renderer.shadowMap.needsUpdate = true;
      lake.forceReflectionRefresh();
    } else if (e.code === 'BracketRight') {
      sky.nudgeTime(0.35);
      renderer.shadowMap.needsUpdate = true;
      lake.forceReflectionRefresh();
    } else if (e.code === 'KeyQ') {
      qualityMode = 1 - qualityMode;
      applyQuality();
      hud.showToast(qualityMode === 0 ? '⚡ 已切换至：流畅实景模式 (高帧率)' : '🎬 已切换至：电影光晕模式 (HDR Bloom + 胶片调色)');
    } else if (e.code === 'KeyH') {
      hud.toggleGuide();
    } else if (e.code === 'KeyP') {
      hud.capturePhoto(renderer, sound, renderFrame);
    }
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    applyQuality();
  });

  const clock = new THREE.Clock();
  let elapsed = 0;
  let fpsFrames = 0;
  let fpsTimer = 0;
  let shadowTimer = 0;

  function animate() {
    requestAnimationFrame(animate);
    const realDt = clock.getDelta();
    const dt = Math.min(0.05, realDt);
    elapsed += dt;

    // Accurate unclamped live FPS counter updated every 0.5s
    fpsFrames++;
    fpsTimer += realDt;
    if (fpsTimer >= 0.5) {
      hud.updateFps(Math.round(fpsFrames / fpsTimer));
      fpsFrames = 0;
      fpsTimer = 0;
    }

    // Refresh static sun shadow map at ~4Hz (or every frame while sun is actively gliding across sky!)
    shadowTimer += realDt;
    if (sky.targetTimeOfDay !== null || shadowTimer >= 0.25) {
      shadowTimer = 0;
      renderer.shadowMap.needsUpdate = true;
      if (sky.targetTimeOfDay !== null) lake.forceReflectionRefresh();
    }

    sky.update(dt, elapsed);
    lake.update(dt, sky);
    assets.updateNature(elapsed, sky.windSpeed, dt);

    if (started) {
      player.update(dt, elapsed, game.colliders);
      game.update(dt, elapsed, sky);
      hud.updateEnvironment(sky);
    } else {
      const sway = Math.sin(elapsed * 0.22) * 1.1;
      camera.position.set(1.6 + sway, 2.35, 0.8);
      camera.lookAt(-0.4, 2.6, -32.0);
      game.fire.update(dt, elapsed, sky);
    }

    renderFrame();
  }

  animate();
}

bootstrap().catch((err) => {
  console.error('Motosuko Camp bootstrap error:', err);
  const el = document.getElementById('loading-text');
  if (el) el.textContent = `加载出错: ${err.message}`;
});
