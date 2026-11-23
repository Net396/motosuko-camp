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
];

const FOLIAGE_MATS = new Set([
  'Mat_MapleRedCard',
  'Mat_MapleGoldCard',
  'Mat_ShrubGreenCard',
  'Mat_CedarBough',
  'Mat_PampasPlume',
]);

export class AssetLoader {
  constructor() {
    this.loader = new GLTFLoader();
    this.models = {};
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
        mat.roughness = 0.58;
        // Subtle warm backlit leaf luminance so foliage feels alive & comfortable in sunlight!
        if (mat.name !== 'Mat_PampasPlume') {
          mat.color.setRGB(1.16, 1.14, 1.08);
        }
        if (mat.name === 'Mat_PampasPlume') obj.castShadow = false;
      } else if (mat.name === 'Mat_TentCanvas') {
        mat.side = THREE.FrontSide;
      } else if (mat.name === 'Mat_VolcanicGround') {
        obj.material = createPhotorealTerrainMaterial(mat);
      } else if (mat.name === 'Mat_MtFuji') {
        // Photographic sapphire-cobalt alpine aerial light bounce so Fuji slopes never crush black at sunset!
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

  /**
   * Batch any multi-mesh Blender .glb asset into GPU InstancedMesh(es) (40x fewer draw calls!).
   */
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
   * Populate the photographic Koan Camping Ground shoreline using GPU InstancedMesh batching:
   * reduces ~360 individual nature draw calls down to 9 GPU-instanced draw calls with identical visuals!
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
      if (Math.hypot(x, z + 2.5) < 9.8) return true;
      if (z < -6.5 && Math.abs(x) < 16.0) return true;
      return false;
    };

    // 1. Japanese Cedars (Sugi) -> batched into 2 InstancedMesh draw calls (focused around visible lakeside wings)
    const cedarXforms = [];
    for (let i = 0; i < 32; i++) {
      const x = (rand() - 0.5) * 110;
      const z = -14 + rand() * 52;
      if (isClearZone(x, z)) continue;
      if (z < getShoreZ(x) + 2.0) continue;
      const s = 0.78 + rand() * 0.55;
      cedarXforms.push({
        x, y: getTerrainHeight(x, z) - 0.25, z,
        ry: rand() * Math.PI * 2,
        sx: s, sy: s * (0.92 + rand() * 0.2), sz: s,
      });
    }
    this._addInstancedModel(natureGroup, 'tree_cedar', cedarXforms, { castShadow: false, receiveShadow: true });

    // 2. Hero + Woodland Autumn Japanese Momiji Maples (disable alpha-test foliage shadow discard for 3x faster shadow pass!)
    const mapleRedXforms = [
      { x: -10.8, y: getTerrainHeight(-10.8, -7.2) - 0.14, z: -7.2, ry: rand() * Math.PI * 2, s: 1.12 },
      { x: 9.0,   y: getTerrainHeight(9.0, 4.2) - 0.14,    z: 4.2,  ry: rand() * Math.PI * 2, s: 1.06 },
      { x: -16.5, y: getTerrainHeight(-16.5, -11.2) - 0.14,z: -11.2,ry: rand() * Math.PI * 2, s: 1.24 },
      { x: 17.5,  y: getTerrainHeight(17.5, -11.5) - 0.14, z: -11.5,ry: rand() * Math.PI * 2, s: 1.20 },
    ];
    const mapleGoldXforms = [
      { x: 11.4,  y: getTerrainHeight(11.4, -8.0) - 0.14,  z: -8.0, ry: rand() * Math.PI * 2, s: 1.15 },
      { x: -9.5,  y: getTerrainHeight(-9.5, 4.5) - 0.14,   z: 4.5,  ry: rand() * Math.PI * 2, s: 1.02 },
    ];
    for (let i = 0; i < 12; i++) {
      const x = (rand() - 0.5) * 95;
      const z = -13 + rand() * 38;
      if (isClearZone(x, z)) continue;
      if (z < getShoreZ(x) + 1.8) continue;
      const t = { x, y: getTerrainHeight(x, z) - 0.14, z, ry: rand() * Math.PI * 2, s: 0.78 + rand() * 0.5 };
      if (rand() > 0.45) mapleRedXforms.push(t);
      else mapleGoldXforms.push(t);
    }
    this._addInstancedModel(natureGroup, 'tree_maple_red', mapleRedXforms, { castShadow: false, receiveShadow: true });
    this._addInstancedModel(natureGroup, 'tree_maple_gold', mapleGoldXforms, { castShadow: false, receiveShadow: true });

    // 2b. Lush Layered Japanese Autumn Shrubbery blanketing the back hillside & forest border!
    // Eliminates bare hillside walls completely — creates a rich sunlit autumn tapestry behind the tent!
    const shrubRed = [];
    const shrubGold = [];
    const shrubGreen = [];
    for (let i = 0; i < 88; i++) {
      // Concentrate lush crimson/gold/olive autumn bushes along the hillside rising behind camp (z = 2..36m) & flanks!
      const isBackSlope = i < 64;
      const x = isBackSlope ? (rand() - 0.5) * 68 : (rand() > 0.5 ? 1 : -1) * (10.5 + rand() * 24);
      const z = isBackSlope ? (4.8 + rand() * 28.0) : (-10.0 + rand() * 26.0);
      if (Math.hypot(x, z + 2.5) < 7.8) continue;
      if (z < getShoreZ(x) + 2.2) continue;
      const s = 1.05 + rand() * 1.15;
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

    // 3. Volcanic Basalt Boulders -> 1 InstancedMesh draw call!
    const rockXforms = [];
    for (let i = 0; i < 32; i++) {
      const alongShore = i < 22;
      const x = alongShore ? (rand() - 0.5) * 74 : (rand() - 0.5) * 60;
      const z = alongShore ? getShoreZ(x) + (rand() - 0.35) * 4.5 : -8 + rand() * 30;
      if (Math.hypot(x, z + 2.5) < 6.8) continue;
      const sx = 0.42 + rand() * 1.35;
      const sy = 0.30 + rand() * 0.85;
      const sz = 0.42 + rand() * 1.35;
      rockXforms.push({
        x, y: getTerrainHeight(x, z) - sy * 0.20, z,
        rx: rand() * 0.4, ry: rand() * Math.PI * 2, rz: rand() * 0.4,
        sx, sy, sz,
      });
    }
    this._addInstancedModel(natureGroup, 'rock_basalt', rockXforms, { castShadow: false, receiveShadow: true });

    // 4. 320 Lightweight Instanced 3D Shoreline Volcanic Cobbles (80 tris/stone instead of 320 -> 8x fewer triangles!)
    let cobbleMat = null;
    this.models['cobble_stone'].traverse((o) => {
      if (o.isMesh && !cobbleMat) cobbleMat = o.material;
    });
    if (cobbleMat) {
      const cobGeo = new THREE.IcosahedronGeometry(0.095, 1);
      cobGeo.scale(1.15, 0.55, 1.0);
      const cobCount = 320;
      const cobInst = new THREE.InstancedMesh(cobGeo, cobbleMat, cobCount);
      cobInst.castShadow = false;
      cobInst.receiveShadow = true;
      const dummy = new THREE.Object3D();
      const col = new THREE.Color();
      for (let i = 0; i < cobCount; i++) {
        const shoreCluster = i < 230;
        const x = shoreCluster ? (rand() - 0.5) * 44 : (rand() - 0.5) * 20;
        const shoreZ = getShoreZ(x);
        const z = shoreCluster ? shoreZ - 0.5 + rand() * 5.2 : -12 + rand() * 18;
        const y = getTerrainHeight(x, z);
        const s = shoreCluster ? (0.55 + Math.pow(rand(), 1.8) * 2.2) : (0.4 + Math.pow(rand(), 2.0) * 1.3);
        dummy.position.set(x, y - 0.015 * s, z);
        dummy.rotation.set((rand() - 0.5) * 0.5, rand() * Math.PI * 2, (rand() - 0.5) * 0.5);
        dummy.scale.set(s * (0.85 + rand() * 0.4), s * (0.65 + rand() * 0.35), s * (0.85 + rand() * 0.4));
        dummy.updateMatrix();
        cobInst.setMatrixAt(i, dummy.matrix);
        const sh = 0.65 + rand() * 0.65;
        col.setRGB(sh, sh * 0.98, sh * 0.96);
        cobInst.setColorAt(i, col);
      }
      cobInst.instanceMatrix.needsUpdate = true;
      if (cobInst.instanceColor) cobInst.instanceColor.needsUpdate = true;
      natureGroup.add(cobInst);
    }

    // 5. 420 Instanced 3D Fallen 7-Lobed Japanese Momiji Maple Leaves!
    const lc = document.createElement('canvas');
    lc.width = 128;
    lc.height = 128;
    const lctx = lc.getContext('2d');
    lctx.clearRect(0, 0, 128, 128);
    lctx.translate(64, 64);
    lctx.fillStyle = '#ffffff';
    lctx.beginPath();
    for (let k = 0; k <= 72; k++) {
      const a = (k / 72) * Math.PI * 2;
      const lobe = 22 + 24 * Math.pow(Math.max(0, Math.cos(a * 3.5)), 2.2) + 8 * Math.cos(a * 7.0);
      const cut = 1.0 - 0.68 * Math.exp(-Math.pow(Math.abs(a - Math.PI), 2) / 0.25);
      const rad = lobe * cut;
      const px = Math.cos(a) * rad;
      const py = Math.sin(a) * rad;
      if (k === 0) lctx.moveTo(px, py);
      else lctx.lineTo(px, py);
    }
    lctx.closePath();
    lctx.fill();
    lctx.strokeStyle = '#ffffff';
    lctx.lineWidth = 3;
    lctx.beginPath();
    lctx.moveTo(-14, 0);
    lctx.lineTo(-42, 0);
    lctx.stroke();

    const leafTex = new THREE.CanvasTexture(lc);
    const leafGeo = new THREE.PlaneGeometry(0.11, 0.11);
    leafGeo.rotateX(-Math.PI / 2);
    const leafMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: leafTex,
      alphaTest: 0.4,
      roughness: 0.80,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    const leafInst = new THREE.InstancedMesh(leafGeo, leafMat, 420);
    leafInst.receiveShadow = true;
    const lDummy = new THREE.Object3D();
    const lPalette = [
      new THREE.Color(0x9a210f),
      new THREE.Color(0xb84314),
      new THREE.Color(0xc97b1c),
      new THREE.Color(0x782812),
    ];
    for (let i = 0; i < 420; i++) {
      const x = (rand() - 0.5) * 24;
      const z = -12.5 + rand() * 19;
      const y = getTerrainHeight(x, z);
      if (y < 0.18) {
        lDummy.position.set(0, -99, 0);
      } else {
        lDummy.position.set(x, y + 0.014, z);
        lDummy.rotation.set((rand() - 0.5) * 0.22, rand() * Math.PI * 2, (rand() - 0.5) * 0.22);
        const s = 0.65 + rand() * 0.85;
        lDummy.scale.set(s, 1, s);
      }
      lDummy.updateMatrix();
      leafInst.setMatrixAt(i, lDummy.matrix);
      leafInst.setColorAt(i, lPalette[Math.floor(rand() * lPalette.length)]);
    }
    leafInst.instanceMatrix.needsUpdate = true;
    if (leafInst.instanceColor) leafInst.instanceColor.needsUpdate = true;
    natureGroup.add(leafInst);

    // 6. Swaying Autumn Susuki Pampas Grass -> frame left & right shore wings, leaving central mirror bay open for 逆さ富士!
    const pampasXforms = [];
    for (let i = 0; i < 52; i++) {
      const x = (rand() - 0.5) * 64;
      const z = getShoreZ(x) + 0.9 + rand() * 5.6;
      if (Math.hypot(x, z + 2.5) < 6.4) continue;
      if (Math.abs(x) < 6.2) continue; // Keep unobstructed mirror reflection window to Mt. Fuji!
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
    if (!this._pampasGroups || !this._pampasGroups.length) return;
    // Update gentle grass sway at ~20Hz (imperceptibly smooth, saves CPU!)
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
