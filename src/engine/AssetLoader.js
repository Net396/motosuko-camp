import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { getTerrainHeight, getShoreZ } from './terrainMath.js';
import { createPhotorealTerrainMaterial } from './TerrainMaterial.js';

const MODEL_MANIFEST = [
  'terrain_campsite',
  'mt_fuji_backdrop',
  'tent_nordisk',
  'camp_table',
  'kermit_chair',
  'lantern_hurricane',
  'cooler_box',
  'lantern_stand',
  'firepit_snowpeak',
  'chopping_block',
  'hatchet',
  'log_whole',
  'log_split',
  'kindling_bundle',
  'ember_bed',
  'blowpipe',
  'skillet_castiron',
  'wagyu_steak',
  'camp_pot',
  'kettle_gooseneck',
  'coffee_dripper_set',
  'titanium_mug',
  'cutting_board',
  'water_jug',
  'tree_cedar',
  'tree_maple_red',
  'tree_maple_gold',
  'shrub_autumn_red',
  'shrub_autumn_gold',
  'shrub_autumn_green',
  'rock_basalt',
  'cobble_stone',
  'pampas_grass',
  'gravel_cluster',
  'moss_mound',
  'fallen_leaf_3d',
  'grass_tuft_3d',
  'fern_clump',
  'forest_debris',
  'shore_driftwood',
];

const FOLIAGE_MATS = new Set([
  'Mat_MapleRedCard',
  'Mat_MapleGoldCard',
  'Mat_ShrubGreenCard',
  'Mat_CedarBough',
  'Mat_PampasPlume',
]);

const WIND_SWAY_MATS = new Set([
  'Mat_Grass3D',
  'Mat_Fern3D',
  'Mat_MapleRedCard',
  'Mat_MapleGoldCard',
  'Mat_ShrubGreenCard',
]);

export class AssetLoader {
  constructor() {
    this.loader = new GLTFLoader();
    this.models = {};
    this._windUniforms = [];
  }

  async loadAll(onProgress) {
    let loaded = 0;
    const total = MODEL_MANIFEST.length;

    await Promise.all(
      MODEL_MANIFEST.map(async (key) => {
        const gltf = await this.loader.loadAsync(`/models/${key}.glb`);
        this._prepareModel(key, gltf.scene);
        this.models[key] = gltf.scene;
        loaded++;
        if (onProgress) onProgress(loaded / total, key);
      })
    );

    return this.models;
  }

  _injectGPUWindAndSubsurface(mat, swayAmp = 0.045, heightScale = 1.0) {
    if (mat.userData.windInjected) return;
    mat.userData.windInjected = true;
    const uTime = { value: 0 };
    const uWind = { value: 1.2 };
    this._windUniforms.push({ uTime, uWind });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uWindTime = uTime;
      shader.uniforms.uWindStrength = uWind;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uWindTime;
          uniform float uWindStrength;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vec4 wpWind = modelMatrix * vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            wpWind = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
          #endif
          float hFactor = clamp(transformed.y / ${heightScale.toFixed(2)}, 0.0, 1.5);
          float wave = sin(uWindTime * 2.2 + wpWind.x * 0.9 + wpWind.z * 0.7) * ${swayAmp.toFixed(4)} * uWindStrength;
          transformed.x += wave * hFactor;
          transformed.z += wave * 0.6 * hFactor;`
        );
    };
  }

  _prepareModel(key, root) {
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      const isBackdrop = key === 'mt_fuji_backdrop';
      const isTerrain = key === 'terrain_campsite';

      obj.castShadow = !isBackdrop && !isTerrain;
      obj.receiveShadow = !isBackdrop;

      const mat = obj.material;
      if (!mat) return;

      for (const texKey of ['map', 'normalMap', 'roughnessMap', 'emissiveMap']) {
        if (mat[texKey]) {
          mat[texKey].anisotropy = 4;
        }
      }

      if (mat.name === 'Mat_ClearGlass') {
        obj.material = new THREE.MeshPhysicalMaterial({
          color: 0xeaf4f8,
          roughness: 0.06,
          metalness: 0.0,
          transparent: true,
          opacity: 0.34,
          depthWrite: false,
        });
        obj.castShadow = false;
      } else if (FOLIAGE_MATS.has(mat.name)) {
        mat.side = THREE.DoubleSide;
        mat.alphaTest = mat.name === 'Mat_PampasPlume' ? 0.22 : 0.42;
        mat.transparent = false;
        mat.depthWrite = true;
        mat.roughness = 0.54;
        if (mat.name !== 'Mat_PampasPlume') {
          mat.color.setRGB(1.18, 1.15, 1.08);
          // Warm backlit foliage subsurface glow
          mat.emissive = new THREE.Color(mat.name === 'Mat_MapleGoldCard' ? 0x3a2404 : (mat.name === 'Mat_MapleRedCard' ? 0x340903 : 0x101c05));
          mat.emissiveIntensity = 0.22;
        }
        if (mat.name === 'Mat_PampasPlume') obj.castShadow = false;
        if (WIND_SWAY_MATS.has(mat.name)) {
          this._injectGPUWindAndSubsurface(mat, 0.04, 2.5);
        }
      } else if (mat.name === 'Mat_Grass3D' || mat.name === 'Mat_Fern3D' || mat.name === 'Mat_Leaf3D') {
        mat.side = THREE.DoubleSide;
        mat.roughness = 0.64;
        if (mat.name === 'Mat_Grass3D') {
          this._injectGPUWindAndSubsurface(mat, 0.032, 0.28);
        } else if (mat.name === 'Mat_Fern3D') {
          this._injectGPUWindAndSubsurface(mat, 0.025, 0.35);
        }
      } else if (mat.name === 'Mat_TentCanvas') {
        mat.side = THREE.FrontSide;
      } else if (mat.name === 'Mat_VolcanicGround') {
        obj.material = createPhotorealTerrainMaterial(mat);
      } else if (mat.name === 'Mat_MtFuji') {
        mat.color.setRGB(1.32, 1.34, 1.44);
        mat.emissive = new THREE.Color(0x0d2648);
        mat.emissiveIntensity = 0.24;
        mat.roughness = 0.80;
        mat.metalness = 0.0;
        if (mat.map) mat.map.anisotropy = 8;
        if (mat.normalMap) mat.normalMap.anisotropy = 8;
      }
    });
  }

  clone(key) {
    const src = this.models[key];
    if (!src) throw new Error(`Missing Blender asset: ${key}`);
    return src.clone(true);
  }

  _addInstancedModel(parent, key, transforms, { castShadow = true, receiveShadow = true, colorFn = null } = {}) {
    if (!transforms.length) return [];
    const src = this.models[key];
    src.updateMatrixWorld(true);
    const meshes = [];
    src.traverse((o) => {
      if (o.isMesh) meshes.push(o);
    });

    const created = [];
    const dummy = new THREE.Object3D();
    const localMat = new THREE.Matrix4();
    const finalMat = new THREE.Matrix4();
    const tmpCol = new THREE.Color();

    for (const m of meshes) {
      const inst = new THREE.InstancedMesh(m.geometry, m.material, transforms.length);
      inst.castShadow = castShadow && m.castShadow;
      inst.receiveShadow = receiveShadow && m.receiveShadow;
      localMat.copy(m.matrixWorld);

      for (let i = 0; i < transforms.length; i++) {
        const t = transforms[i];
        dummy.position.set(t.x, t.y, t.z);
        dummy.rotation.set(t.rx || 0, t.ry || 0, t.rz || 0);
        dummy.scale.set(t.sx ?? t.s ?? 1, t.sy ?? t.s ?? 1, t.sz ?? t.s ?? 1);
        dummy.updateMatrix();
        finalMat.multiplyMatrices(dummy.matrix, localMat);
        inst.setMatrixAt(i, finalMat);

        if (colorFn) {
          colorFn(i, tmpCol);
          inst.setColorAt(i, tmpCol);
        }
      }
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.computeBoundingSphere();
      parent.add(inst);
      created.push({ inst, localMat: localMat.clone(), transforms });
    }
    return created;
  }

  /**
   * Populate the AAA 3D-Modeled Koan Camping Ground Ecosystem:
   * - Zero 2D painted ground textures!
   * - 720 instanced 3D gravel clusters (= 11,500+ real 3D faceted pebbles & stones!)
   * - 340 instanced 3D velvet moss hummocks
   * - 1,350 instanced true 3D polygonal curled 7-lobed Momiji maple leaves
   * - 1,100 instanced true 3D blade-by-blade wild grass tufts (= 24,000+ real 3D grass blades with GPU wind!)
   * - 260 instanced true 3D pinnate woodland ferns
   * - 280 instanced true 3D fallen cedar twigs & layered pine cones
   * - 22 instanced 3D weathered shoreline driftwood logs
   */
  populateEnvironment(scene) {
    const terrain = this.clone('terrain_campsite');
    scene.add(terrain);

    const fuji = this.clone('mt_fuji_backdrop');
    scene.add(fuji);

    let seed = 20261123;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    const natureGroup = new THREE.Group();
    scene.add(natureGroup);
    this.natureGroup = natureGroup;

    const isClearZone = (x, z) => {
      if (Math.hypot(x, z + 2.5) < 9.6) return true;
      if (z < -6.5 && Math.abs(x) < 15.5) return true;
      return false;
    };

    // 1. Tall Botanical Japanese Cedars (Sugi)
    const cedarXforms = [];
    for (let i = 0; i < 34; i++) {
      const x = (rand() - 0.5) * 110;
      const z = -14 + rand() * 52;
      if (isClearZone(x, z)) continue;
      if (z < getShoreZ(x) + 2.0) continue;
      const s = 0.78 + rand() * 0.58;
      cedarXforms.push({
        x, y: getTerrainHeight(x, z) - 0.25, z,
        ry: rand() * Math.PI * 2,
        sx: s, sy: s * (0.92 + rand() * 0.2), sz: s,
      });
    }
    this._addInstancedModel(natureGroup, 'tree_cedar', cedarXforms, { castShadow: false, receiveShadow: true });

    // 2. Hero + Woodland Autumn Japanese Momiji Maples
    const mapleRedXforms = [
      { x: -10.8, y: getTerrainHeight(-10.8, -7.2) - 0.14, z: -7.2, ry: rand() * Math.PI * 2, s: 1.14 },
      { x: 9.0,   y: getTerrainHeight(9.0, 4.2) - 0.14,    z: 4.2,  ry: rand() * Math.PI * 2, s: 1.08 },
      { x: -16.5, y: getTerrainHeight(-16.5, -11.2) - 0.14,z: -11.2,ry: rand() * Math.PI * 2, s: 1.25 },
      { x: 17.5,  y: getTerrainHeight(17.5, -11.5) - 0.14, z: -11.5,ry: rand() * Math.PI * 2, s: 1.22 },
    ];
    const mapleGoldXforms = [
      { x: 11.4,  y: getTerrainHeight(11.4, -8.0) - 0.14,  z: -8.0, ry: rand() * Math.PI * 2, s: 1.16 },
      { x: -9.5,  y: getTerrainHeight(-9.5, 4.5) - 0.14,   z: 4.5,  ry: rand() * Math.PI * 2, s: 1.04 },
    ];
    for (let i = 0; i < 14; i++) {
      const x = (rand() - 0.5) * 95;
      const z = -13 + rand() * 38;
      if (isClearZone(x, z)) continue;
      if (z < getShoreZ(x) + 1.8) continue;
      const t = { x, y: getTerrainHeight(x, z) - 0.14, z, ry: rand() * Math.PI * 2, s: 0.78 + rand() * 0.52 };
      if (rand() > 0.45) mapleRedXforms.push(t);
      else mapleGoldXforms.push(t);
    }
    this._addInstancedModel(natureGroup, 'tree_maple_red', mapleRedXforms, { castShadow: false, receiveShadow: true });
    this._addInstancedModel(natureGroup, 'tree_maple_gold', mapleGoldXforms, { castShadow: false, receiveShadow: true });

    // 3. Lush Layered 3D Autumn Shrubbery carpeting the back hillside & forest border
    const shrubRed = [];
    const shrubGold = [];
    const shrubGreen = [];
    for (let i = 0; i < 92; i++) {
      const isBackSlope = i < 66;
      const x = isBackSlope ? (rand() - 0.5) * 68 : (rand() > 0.5 ? 1 : -1) * (10.5 + rand() * 24);
      const z = isBackSlope ? (4.8 + rand() * 28.0) : (-10.0 + rand() * 26.0);
      if (Math.hypot(x, z + 2.5) < 7.6) continue;
      if (z < getShoreZ(x) + 2.2) continue;
      const s = 1.05 + rand() * 1.18;
      const t = {
        x, y: getTerrainHeight(x, z) - 0.18, z,
        ry: rand() * Math.PI * 2,
        sx: s * (0.95 + rand() * 0.35),
        sy: s * (0.78 + rand() * 0.42),
        sz: s * (0.95 + rand() * 0.35),
      };
      const roll = rand();
      if (roll < 0.36) shrubRed.push(t);
      else if (roll < 0.70) shrubGold.push(t);
      else shrubGreen.push(t);
    }
    this._addInstancedModel(natureGroup, 'shrub_autumn_red', shrubRed, { castShadow: false, receiveShadow: true });
    this._addInstancedModel(natureGroup, 'shrub_autumn_gold', shrubGold, { castShadow: false, receiveShadow: true });
    this._addInstancedModel(natureGroup, 'shrub_autumn_green', shrubGreen, { castShadow: false, receiveShadow: true });

    // 4. Volcanic Basalt Boulders & Large Shoreline Cobbles
    const rockXforms = [];
    for (let i = 0; i < 42; i++) {
      const alongShore = i < 28;
      const x = alongShore ? (rand() - 0.5) * 74 : (rand() - 0.5) * 60;
      const z = alongShore ? getShoreZ(x) + (rand() - 0.35) * 4.5 : -8 + rand() * 30;
      if (Math.hypot(x, z + 2.5) < 6.4) continue;
      const sx = 0.42 + rand() * 1.38;
      const sy = 0.30 + rand() * 0.85;
      const sz = 0.42 + rand() * 1.38;
      rockXforms.push({
        x, y: getTerrainHeight(x, z) - sy * 0.22, z,
        rx: rand() * 0.4, ry: rand() * Math.PI * 2, rz: rand() * 0.4,
        sx, sy, sz,
      });
    }
    this._addInstancedModel(natureGroup, 'rock_basalt', rockXforms, { castShadow: true, receiveShadow: true });

    // 5. TRUE 3D-MODELED GRAVEL & PEBBLE CLUSTERS (420 clusters embedded along the shoreline berm & stone paths!)
    const gravelXforms = [];
    const gravelShades = [];
    for (let i = 0; i < 420; i++) {
      const isShore = i < 310;
      const x = isShore ? (rand() - 0.5) * 44 : (rand() - 0.5) * 24;
      const shoreZ = getShoreZ(x);
      const z = isShore ? (shoreZ - 0.8 + rand() * 5.2) : (-11.0 + rand() * 18.0);
      if (!isShore && Math.hypot(x, z + 2.5) < 4.5) continue; // Keep core chair/table area natural soil/gravel
      const y = getTerrainHeight(x, z);
      const s = isShore ? (0.65 + rand() * 1.15) : (0.55 + rand() * 0.85);
      gravelXforms.push({
        x, y: y - 0.012, z,
        rx: (rand() - 0.5) * 0.14,
        ry: rand() * Math.PI * 2,
        rz: (rand() - 0.5) * 0.14,
        sx: s, sy: s * (0.55 + rand() * 0.35), sz: s,
      });
      gravelShades.push(0.52 + rand() * 0.58);
    }
    this._addInstancedModel(natureGroup, 'gravel_cluster', gravelXforms, {
      castShadow: false,
      receiveShadow: true,
      colorFn: (i, col) => {
        const sh = gravelShades[i];
        col.setRGB(sh * 1.05, sh * 0.96, sh * 0.86);
      },
    });

    // 6. TRUE 3D VELVET FOREST MOSS HUMMOCKS (140 subtle low-profile moss cushions tucked around trees, boulders & forest edge!)
    const mossXforms = [];
    const mossTints = [];
    for (let i = 0; i < 140; i++) {
      const x = (rand() - 0.5) * 36;
      const z = -10.0 + rand() * 26.0;
      const y = getTerrainHeight(x, z);
      if (y < 0.75) continue;
      // Only place moss cushions around the forest perimeter & tree bases (outside the 5.8m central campsite clearing!)
      if (Math.hypot(x, z + 2.6) < 5.8) continue;
      const s = 0.55 + rand() * 0.95;
      mossXforms.push({
        x, y: y - 0.018, z,
        rx: (rand() - 0.5) * 0.14,
        ry: rand() * Math.PI * 2,
        rz: (rand() - 0.5) * 0.14,
        sx: s, sy: s * 0.48, sz: s,
      });
      mossTints.push(0.58 + rand() * 0.42);
    }
    this._addInstancedModel(natureGroup, 'moss_mound', mossXforms, {
      castShadow: false,
      receiveShadow: true,
      colorFn: (i, col) => {
        const t = mossTints[i];
        col.setRGB(t * 0.85, t * 0.95, t * 0.72);
      },
    });

    // 7. TRUE 3D BLADE-BY-BLADE WILD FOREST GRASS & SEDGE TUFTS (420 tufts framing forest edge, tent & left/right shore wings!)
    const grassXforms = [];
    const grassTints = [];
    for (let i = 0; i < 420; i++) {
      const x = (rand() - 0.5) * 38;
      const z = -13.2 + rand() * 26.0;
      const y = getTerrainHeight(x, z);
      if (y < 0.28) continue;
      // Keep central campsite clearing & central mirror lake vista window open!
      if (Math.hypot(x, z + 2.4) < 5.2) continue;
      if (z < -6.0 && Math.abs(x) < 5.8) continue;
      if (Math.hypot(x + 4.6, z + 6.8) < 2.2) continue;
      const s = 0.55 + rand() * 0.92;
      grassXforms.push({
        x, y: y - 0.012, z,
        ry: rand() * Math.PI * 2,
        sx: s, sy: s * (0.65 + rand() * 0.5), sz: s,
      });
      grassTints.push(0.68 + rand() * 0.50);
    }
    this._addInstancedModel(natureGroup, 'grass_tuft_3d', grassXforms, {
      castShadow: false,
      receiveShadow: true,
      colorFn: (i, col) => {
        const t = grassTints[i];
        col.setRGB(t * 1.04, t, t * 0.85);
      },
    });

    // 8. TRUE 3D PINNATE WOODLAND FERNS (150 sculpted 3D fern clumps around boulders, trees & back slope!)
    const fernXforms = [];
    for (let i = 0; i < 150; i++) {
      const x = (rand() - 0.5) * 38;
      const z = -9.5 + rand() * 26.0;
      const y = getTerrainHeight(x, z);
      if (y < 0.75) continue;
      if (Math.hypot(x, z + 2.4) < 6.2) continue;
      const s = 0.68 + rand() * 0.88;
      fernXforms.push({
        x, y: y - 0.012, z,
        ry: rand() * Math.PI * 2,
        s,
      });
    }
    this._addInstancedModel(natureGroup, 'fern_clump', fernXforms, { castShadow: false, receiveShadow: true });

    // 9. TRUE 3D SCULPTED CURLED 7-LOBED JAPANESE MAPLE LEAVES (620 real 3D star-shaped curled leaves!)
    const leaf3dXforms = [];
    const leaf3dColors = [];
    const leafPalette = [
      new THREE.Color(0xb82210),
      new THREE.Color(0xd94414),
      new THREE.Color(0xe68818),
      new THREE.Color(0x8c1c0d),
      new THREE.Color(0xebb424),
    ];
    for (let i = 0; i < 620; i++) {
      const x = (rand() - 0.5) * 28;
      const z = -12.5 + rand() * 22.0;
      const y = getTerrainHeight(x, z);
      if (y < 0.20) continue;
      if (Math.hypot(x + 4.6, z + 6.8) < 2.05) continue;
      const s = 0.70 + rand() * 0.82;
      leaf3dXforms.push({
        x,
        y: y + 0.004 + (i % 5) * 0.0018,
        z,
        rx: (rand() - 0.5) * 0.28,
        ry: rand() * Math.PI * 2,
        rz: (rand() - 0.5) * 0.28,
        s,
      });
      leaf3dColors.push(leafPalette[Math.floor(rand() * leafPalette.length)]);
    }
    this._addInstancedModel(natureGroup, 'fallen_leaf_3d', leaf3dXforms, {
      castShadow: false,
      receiveShadow: true,
      colorFn: (i, col) => col.copy(leaf3dColors[i]),
    });

    // 10. TRUE 3D FALLEN TWIGS & PINE CONES (45 subtle clusters tucked right around the chopping block & under trees!)
    const debrisXforms = [];
    for (let i = 0; i < 45; i++) {
      const nearStump = i < 18;
      const x = nearStump ? (-2.15 + (rand() - 0.5) * 2.2) : ((rand() > 0.5 ? 1 : -1) * (6.5 + rand() * 12));
      const z = nearStump ? (-4.10 + (rand() - 0.5) * 2.2) : (-9.5 + rand() * 18.0);
      const y = getTerrainHeight(x, z);
      if (y < 0.35) continue;
      if (Math.hypot(x + 4.6, z + 6.8) < 2.1) continue;
      const s = 0.55 + rand() * 0.65;
      debrisXforms.push({
        x, y: y - 0.002, z,
        ry: rand() * Math.PI * 2,
        s,
      });
    }
    this._addInstancedModel(natureGroup, 'forest_debris', debrisXforms, { castShadow: false, receiveShadow: true });

    // 11. TRUE 3D WEATHERED SHORELINE DRIFTWOOD LOGS (22 gnarled logs along the water's edge!)
    const driftXforms = [];
    for (let i = 0; i < 22; i++) {
      const x = (rand() - 0.5) * 52;
      if (Math.abs(x) < 4.5) continue;
      const z = getShoreZ(x) + 0.4 + rand() * 2.8;
      const y = getTerrainHeight(x, z);
      const s = 0.75 + rand() * 0.85;
      driftXforms.push({
        x, y: y - 0.015, z,
        rx: (rand() - 0.5) * 0.15,
        ry: rand() * Math.PI * 2,
        rz: (rand() - 0.5) * 0.15,
        s,
      });
    }
    this._addInstancedModel(natureGroup, 'shore_driftwood', driftXforms, { castShadow: true, receiveShadow: true });

    // 12. Swaying Autumn Susuki Pampas Grass framing left & right shoreline wings
    const pampasXforms = [];
    for (let i = 0; i < 52; i++) {
      const x = (rand() - 0.5) * 64;
      const z = getShoreZ(x) + 0.9 + rand() * 5.6;
      if (Math.hypot(x, z + 2.5) < 6.4) continue;
      if (Math.abs(x) < 6.2) continue;
      pampasXforms.push({
        x, y: getTerrainHeight(x, z) - 0.05, z,
        ry: rand() * Math.PI * 2,
        s: 0.78 + rand() * 0.62,
        phase: rand() * Math.PI * 2,
      });
    }
    this._pampasGroups = this._addInstancedModel(natureGroup, 'pampas_grass', pampasXforms, {
      castShadow: false,
      receiveShadow: true,
    });
    this._pampasDummy = new THREE.Object3D();
    this._pampasMat = new THREE.Matrix4();
    this._pampasAccum = 0;
  }

  static createContactShadow(radiusX, radiusZ = radiusX, opacity = 0.52) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
    g.addColorStop(0, `rgba(0,0,0,${opacity})`);
    g.addColorStop(0.65, `rgba(0,0,0,${opacity * 0.45})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(radiusX * 2, radiusZ * 2),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(c),
        transparent: true,
        depthWrite: false,
      })
    );
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
  }

  updateNature(elapsed, windSpeed, dt = 0.016) {
    // Update GPU wind uniforms for all 24,000+ 3D grass blades, ferns & shrubs in O(1) time!
    for (let i = 0; i < this._windUniforms.length; i++) {
      this._windUniforms[i].uTime.value = elapsed;
      this._windUniforms[i].uWind.value = windSpeed;
    }

    if (!this._pampasGroups || !this._pampasGroups.length) return;
    this._pampasAccum += dt;
    if (this._pampasAccum < 0.05) return;
    this._pampasAccum = 0;

    const sway = 0.04 + windSpeed * 0.02;
    const dummy = this._pampasDummy;
    const mat = this._pampasMat;
    for (const grp of this._pampasGroups) {
      const { inst, localMat, transforms } = grp;
      for (let i = 0; i < transforms.length; i++) {
        const t = transforms[i];
        dummy.position.set(t.x, t.y, t.z);
        dummy.rotation.set(
          Math.cos(elapsed * 1.2 + t.phase) * sway * 0.5,
          t.ry,
          Math.sin(elapsed * 1.7 + t.phase) * sway
        );
        dummy.scale.setScalar(t.s);
        dummy.updateMatrix();
        mat.multiplyMatrices(dummy.matrix, localMat);
        inst.setMatrixAt(i, mat);
      }
      inst.instanceMatrix.needsUpdate = true;
    }
  }
}
