import * as THREE from 'three';
import { getTerrainHeight } from '../engine/terrainMath.js';
import { AssetLoader } from '../engine/AssetLoader.js';
import { FireSimulation } from './FireSimulation.js';

const ITEM_NAMES = {
  hatchet: '锻造露营手斧',
  log_whole: '整段桧木原木',
  log_split: '劈好的桧木柴',
  kindling: '干燥引火细柴',
  blowpipe: '伸缩火吹棒',
  skillet: '铸铁平底锅',
  wagyu_raw: '生 A5 和牛牛排',
  wagyu_cooked: '香煎 A5 和牛牛排',
  camp_pot: '森林绿珐琅露营锅',
  kettle: '哑光黑手冲细嘴壶',
  mug: 'Snow Peak 钛金属杯',
};

const VIEWMODEL_CFG = {
  hatchet:      { model: 'hatchet',           pos: [0.02, -0.14, 0.04], rot: [0.35, -0.25, 0.12], scale: 1.0 },
  log_whole:    { model: 'log_whole',         pos: [0.0, -0.06, 0.02],  rot: [0.2, 0.8, 0.1],     scale: 0.9 },
  log_split:    { model: 'log_split',         pos: [0.0, -0.05, 0.02],  rot: [0.25, 0.7, 0.15],   scale: 0.95 },
  kindling:     { model: 'kindling_bundle',   pos: [0.0, -0.06, 0.04],  rot: [0.2, 0.4, 0.0],     scale: 1.0 },
  blowpipe:     { model: 'blowpipe',          pos: [0.03, -0.15, 0.0],  rot: [1.15, 0.0, 0.25],   scale: 0.9 },
  skillet:      { model: 'skillet_castiron',  pos: [0.0, -0.08, -0.04], rot: [0.22, 2.8, 0.0],    scale: 0.9 },
  wagyu_raw:    { model: 'wagyu_steak',       pos: [-0.02, -0.05, 0.05],rot: [0.55, 0.2, 0.0],    scale: 1.15 },
  wagyu_cooked: { model: 'wagyu_steak',       pos: [-0.02, -0.05, 0.05],rot: [0.55, 0.2, 0.0],    scale: 1.15 },
  camp_pot:     { model: 'camp_pot',          pos: [0.0, -0.10, -0.02], rot: [0.15, 0.0, 0.0],    scale: 0.9 },
  kettle:       { model: 'kettle_gooseneck',  pos: [-0.02, -0.08, 0.0], rot: [0.12, -1.55, 0.0],  scale: 0.95 },
  mug:          { model: 'titanium_mug',      pos: [-0.03, -0.06, 0.06],rot: [0.15, 1.2, 0.0],    scale: 1.1 },
};

/**
 * Orchestrates the entire interactive Japanese Solo Camping experience at Lake Motosuko:
 * - Authentic campsite layout using real Blender .glb models
 * - Wood chopping at the oak stump (whole log -> 2 split logs -> kindling!)
 * - Thermodynamic campfire ignition, feeding & blowpipe oxygen boost
 * - Cast-iron skillet dual-side A5 Wagyu steak searing (with Maillard color shift & flip!)
 * - Enameled camp pot boiling water & simmering Japanese camp curry soup
 * - Gooseneck kettle boiling + interactive hold-to-pour Hario V60 pour-over coffee + sipping in Kermit Chair!
 * - Hurricane oil lantern toggle & cozy tent glow
 */
export class CampGame {
  constructor(scene, camera, assets, player, sound, hud) {
    this.scene = scene;
    this.camera = camera;
    this.assets = assets;
    this.player = player;
    this.sound = sound;
    this.hud = hud;

    this.interactables = []; // { id, mesh, radius, getPrompt(), onPrimary(), onSecondary?() }
    this.colliders = [];     // { x, z, r }
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 3.6;

    // Player inventory (single realistic hand-held slot + item metadata)
    this.held = null; // { type, meta }

    // Physiological immersion vitals
    this.vitals = { warmth: 36.5, hunger: 68, calm: 82 };

    // Cooking & camp equipment realistic physical state
    this.state = {
      lanternOn: true,

      // Chopping block
      logOnStump: 'whole', // null | 'whole' | 'split'
      wholeLogStock: 6,
      splitLogPile: 2,
      kindlingPile: 1,

      // Cast-iron skillet & Wagyu steak
      skilletOnFire: false,
      skilletTemp: 10,
      steakLoc: 'board', // 'board' | 'skillet' | 'held' | 'eaten'
      steakSide: 0,      // 0 = Side A down, 1 = Side B down
      steakCook: [0, 0], // 0..150 (ideal 75..115)
      steakFlipAnim: 0,

      // Camp pot (Japanese Camp Curry Soup)
      potLoc: 'table',   // 'table' | 'fire' | 'held'
      potHasWater: false,
      potHasCurry: false,
      potTemp: 10,
      potSimmer: 0,      // 0..100
      potServings: 0,

      // Pour-over Coffee Ritual
      kettleLoc: 'table', // 'table' | 'fire' | 'held'
      kettleWater: 0.0,   // 0..1
      kettleTemp: 10,
      coffeeBrew: 0.0,    // 0..100 inside V60 carafe
      mugCoffee: 0.0,     // 0..1 inside Snow Peak titanium mug
      mugLoc: 'table',    // 'table' | 'held'
      isPouring: false,
    };

    this._steamParticles = [];
    this._woodChips = [];
    this._eHeld = false;
    this._activeTarget = null;

    this._buildCampsite();
    this._buildSteamAndPourFX();
    this._bindControls();
  }

  _groundAt(x, z, yOff = 0) {
    return new THREE.Vector3(x, getTerrainHeight(x, z) + yOff, z);
  }

  _registerInteractable(id, obj, handlers) {
    obj.userData.interactId = id;
    obj.traverse((c) => {
      c.userData.interactId = id;
    });
    const entry = { id, obj, ...handlers };
    this.interactables.push(entry);
    return entry;
  }

  _buildCampsite() {
    const campY = getTerrainHeight(0, -2.0); // ~1.05m flat Koan terrace

    // 1. Nordisk / Circus TC Canvas Tent (left lakeside terrace, doorway angled cleanly toward camp!)
    this.tent = this.assets.clone('tent_nordisk');
    this.tent.position.copy(this._groundAt(-4.6, -6.8, -0.02));
    this.tent.rotation.y = 2.55;
    this.tentCanvasMats = [];
    this.tent.traverse((o) => {
      if (o.isMesh && o.material?.name === 'Mat_TentCanvas') {
        o.material = o.material.clone();
        o.material.emissive = new THREE.Color(0xff9436);
        o.material.emissiveIntensity = 0.06;
        this.tentCanvasMats.push(o.material);
      }
    });
    this.scene.add(this.tent);
    this.colliders.push({ x: -4.6, z: -6.8, r: 2.0 });

    // Ground contact AO shadow under tent, firepit, chair, table & chopping stump
    const addAO = (x, z, rx, rz, op) => {
      const s = AssetLoader.createContactShadow(rx, rz, op);
      s.position.set(x, getTerrainHeight(x, z) + 0.018, z);
      this.scene.add(s);
    };
    addAO(-4.6, -6.8, 2.35, 2.35, 0.56);
    addAO(0.0, -3.65, 0.58, 0.58, 0.52);
    addAO(-0.22, -1.78, 0.52, 0.52, 0.44);
    addAO(0.98, -2.05, 0.72, 0.55, 0.48);
    addAO(-2.15, -4.10, 0.44, 0.44, 0.55);

    // Extra authentic Japanese camp atmosphere props: Olive Camp Cooler Box + Iron Lantern Hanger Stand!
    const cooler = this.assets.clone('cooler_box');
    cooler.position.copy(this._groundAt(-2.55, -5.85, 0.0));
    cooler.rotation.y = 0.65;
    this.scene.add(cooler);
    addAO(-2.55, -5.85, 0.42, 0.34, 0.48);

    const lanternStand = this.assets.clone('lantern_stand');
    lanternStand.position.copy(this._groundAt(1.65, -3.55, 0.0));
    lanternStand.rotation.y = -2.35;
    this.scene.add(lanternStand);

    // Hang a warm glowing hurricane oil lantern directly from the iron shepherd's hook!
    this.hangingLanternPivot = new THREE.Group();
    const standBaseY = getTerrainHeight(1.65, -3.55);
    // Hook tip in local lantern_stand is (0, y=1.70, z=-0.26) rotated by -2.35 rad around Y
    const hookOff = new THREE.Vector3(0, 1.72, -0.25).applyAxisAngle(new THREE.Vector3(0, 1, 0), -2.35);
    this.hangingLanternPivot.position.set(1.65 + hookOff.x, standBaseY + hookOff.y, -3.55 + hookOff.z);
    const hangLantern = this.assets.clone('lantern_hurricane');
    hangLantern.position.set(0, -0.34, 0);
    this.hangingLanternPivot.add(hangLantern);
    const hangFlame = new THREE.Mesh(
      new THREE.SphereGeometry(0.016, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xffc864 })
    );
    hangFlame.position.set(0, -0.185, 0);
    this.hangingLanternPivot.add(hangFlame);
    this.hangingLanternLight = new THREE.PointLight(0xffa43c, 1.6, 10.0, 1.65);
    this.hangingLanternLight.position.set(0, -0.185, 0);
    this.hangingLanternPivot.add(this.hangingLanternLight);
    this.scene.add(this.hangingLanternPivot);

    // Cozy warm interior tent bulb/lantern glow
    const tentY = getTerrainHeight(-4.6, -6.8);
    this.tentLight = new THREE.PointLight(0xffb45c, 2.2, 10.0, 1.55);
    this.tentLight.position.set(-4.3, tentY + 1.35, -6.5);
    this.scene.add(this.tentLight);

    // 2. Snow Peak Takibi Fire Pit (centerpiece facing Mt. Fuji!)
    this.pitPos = this._groundAt(0.0, -3.65, 0.0);
    this.firepit = this.assets.clone('firepit_snowpeak');
    this.firepit.position.copy(this.pitPos);
    this.scene.add(this.firepit);
    this.colliders.push({ x: this.pitPos.x, z: this.pitPos.z, r: 0.62 });

    this.fire = new FireSimulation(this.scene, this.assets, this.pitPos);

    this._registerInteractable('firepit', this.firepit, {
      getPrompt: () => {
        const actions = [];
        let sub = `炉温 ${Math.round(this.fire.temperature)}°C · ${this.fire.getStateLabel()}`;
        if (this.held?.type === 'log_split') {
          actions.push({ key: 'E', label: '添加劈好的桧木柴' });
        } else if (this.held?.type === 'kindling') {
          actions.push({ key: 'E', label: '放入引火细柴' });
        } else if (this.held?.type === 'blowpipe') {
          actions.push({ key: 'E', label: '用火吹棒吹气助燃' });
        } else if (this.held?.type === 'skillet' && !this.state.skilletOnFire) {
          actions.push({ key: 'E', label: '将铸铁锅放上烤架' });
        } else if (this.held?.type === 'camp_pot' && this.state.potLoc !== 'fire') {
          actions.push({ key: 'E', label: '将露营锅放上烤架' });
        } else if (this.held?.type === 'kettle' && this.state.kettleLoc !== 'fire') {
          actions.push({ key: 'E', label: '将手冲壶放上烤架烧水' });
        } else if (!this.fire.lit) {
          actions.push({ key: 'E', label: '擦打火石引燃引火绒' });
        } else {
          actions.push({ key: 'F', label: '吹气助燃 (火吹棒)' });
        }
        if (this.fire.lit || this.fire.emberMass > 0.05) {
          if (!actions.some((a) => a.key === 'F')) {
            actions.push({ key: 'F', label: '吹火助燃' });
          }
        }
        return { title: 'Snow Peak 焚火台', actions, sub };
      },
      onPrimary: () => this._interactFirepit(),
      onSecondary: () => this._blowFire(),
    });

    // 3. Kermit Chair (directly behind campfire overlooking Mt. Fuji & Lake Motosuko!)
    this.chairPos = this._groundAt(-0.22, -1.78, 0.0);
    this.chair = this.assets.clone('kermit_chair');
    this.chair.position.copy(this.chairPos);
    this.chair.rotation.y = Math.PI + 0.08; // Face -Z (campfire & Mt. Fuji!)
    this.scene.add(this.chair);
    this.colliders.push({ x: this.chairPos.x, z: this.chairPos.z, r: 0.45 });

    this._registerInteractable('chair', this.chair, {
      getPrompt: () => ({
        title: '克米特实木露营椅',
        actions: [{ key: 'E', label: this.player.seated ? '起身' : '坐下烤火观富士山' }],
        sub: this.held?.type === 'mug' && this.state.mugCoffee > 0.05 ? '手持热咖啡：坐下后按 E 可小口品尝' : '绝佳逆富士观景位',
      }),
      onPrimary: () => {
        if (this.player.seated) {
          this.player.standUp();
        } else {
          this.player.sitInChair(new THREE.Vector3(this.chairPos.x, this.chairPos.y, this.chairPos.z), 0.06);
          this.hud.completeQuest('sit');
          this.hud.showToast('坐上克米特椅，烤着篝火静赏富士山与本栖湖 (按 W 或空格起身)');
        }
      },
    });

    // 4. Wooden Roll-Top Camp Table (蛋卷桌 right beside Kermit Chair)
    this.tablePos = this._groundAt(0.98, -2.05, 0.0);
    this.tableTopY = this.tablePos.y + 0.445;
    this.table = this.assets.clone('camp_table');
    this.table.position.copy(this.tablePos);
    this.table.rotation.y = -0.35;
    this.scene.add(this.table);
    this.colliders.push({ x: this.tablePos.x, z: this.tablePos.z, r: 0.56 });

    // Allow placing held cookware neatly back on table!
    this._registerInteractable('table', this.table, {
      getPrompt: () => {
        if (this.held && ['skillet', 'camp_pot', 'kettle', 'mug', 'blowpipe', 'hatchet'].includes(this.held.type)) {
          return {
            title: '实木蛋卷桌',
            actions: [{ key: 'E', label: `放回 ${ITEM_NAMES[this.held.type]}` }],
          };
        }
        return null;
      },
      onPrimary: () => this._putHeldBack(),
    });

    // 5. Hurricane Oil Lantern on corner of table
    this.lantern = this.assets.clone('lantern_hurricane');
    this.lantern.position.set(this.tablePos.x + 0.28, this.tableTopY, this.tablePos.z - 0.14);
    this.scene.add(this.lantern);

    // Warm glowing lantern flame bead & point light
    this.lanternFlameMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.015, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xffc864 })
    );
    this.lanternFlameMesh.position.set(this.lantern.position.x, this.lantern.position.y + 0.155, this.lantern.position.z);
    this.scene.add(this.lanternFlameMesh);

    this.lanternLight = new THREE.PointLight(0xffa43c, 2.2, 8.5, 1.7);
    this.lanternLight.position.copy(this.lanternFlameMesh.position);
    this.scene.add(this.lanternLight);

    this._registerInteractable('lantern', this.lantern, {
      getPrompt: () => ({
        title: '复古煤油风灯 (Feuerhand)',
        actions: [{ key: 'E', label: this.state.lanternOn ? '熄灭风灯' : '点亮煤油风灯' }],
      }),
      onPrimary: () => {
        this.state.lanternOn = !this.state.lanternOn;
        this.sound.playFlintSpark();
        this.hud.showToast(this.state.lanternOn ? '煤油风灯已点亮，暖黄灯火映照营地' : '已熄灭煤油风灯');
      },
    });

    // 6. Cutting Board & Raw A5 Wagyu Steak on table
    this.cuttingBoard = this.assets.clone('cutting_board');
    this.cuttingBoard.position.set(this.tablePos.x - 0.24, this.tableTopY, this.tablePos.z + 0.08);
    this.cuttingBoard.rotation.y = -0.35;
    this.scene.add(this.cuttingBoard);

    this.steakBoardPos = new THREE.Vector3(this.cuttingBoard.position.x, this.tableTopY + 0.022, this.cuttingBoard.position.z);
    this.wagyu = this.assets.clone('wagyu_steak');
    this.wagyu.position.copy(this.steakBoardPos);
    this.wagyuMats = [];
    this.wagyu.traverse((o) => {
      if (o.isMesh && o.material) {
        o.material = o.material.clone();
        this.wagyuMats.push(o.material);
      }
    });
    this.scene.add(this.wagyu);

    this._registerInteractable('wagyu', this.wagyu, {
      getPrompt: () => {
        if (this.state.steakLoc === 'board') {
          return {
            title: '雪花 A5 和牛牛排 (生)',
            actions: [{ key: 'E', label: '拿取牛排准备煎制' }],
            sub: '先将铸铁锅放到焚火台烤架加热',
          };
        }
        if (this.state.steakLoc === 'skillet') {
          const avg = (this.state.steakCook[0] + this.state.steakCook[1]) * 0.5;
          const status = avg > 125 ? '过焦' : avg > 72 ? '金黄多汁 (可享用!)' : avg > 35 ? '半熟焦香' : '生肉加热中';
          return {
            title: `铸铁锅煎牛排 · ${status}`,
            actions: [
              { key: 'E', label: '翻面均匀煎制' },
              { key: 'F', label: avg >= 60 ? '盛出享用 A5 和牛' : '取出牛排' },
            ],
            sub: `A面 ${Math.min(100, Math.round(this.state.steakCook[0]))}% · B面 ${Math.min(100, Math.round(this.state.steakCook[1]))}% · 锅温 ${Math.round(this.state.skilletTemp)}°C`,
          };
        }
        return null;
      },
      onPrimary: () => this._interactSteakPrimary(),
      onSecondary: () => this._interactSteakSecondary(),
    });

    // 7. Cast-Iron Skillet (starts near table/fire ready to place on grill grate!)
    this.skilletHomePos = new THREE.Vector3(this.tablePos.x + 0.02, this.tableTopY + 0.002, this.tablePos.z - 0.14);
    this.skilletFirePos = new THREE.Vector3(this.pitPos.x - 0.08, this.pitPos.y + 0.412, this.pitPos.z);
    this.skillet = this.assets.clone('skillet_castiron');
    this.skillet.position.copy(this.skilletHomePos);
    this.skillet.rotation.y = 0.6;
    this.scene.add(this.skillet);

    this._registerInteractable('skillet', this.skillet, {
      getPrompt: () => {
        if (this.state.skilletOnFire) {
          if (this.held?.type === 'wagyu_raw') {
            return {
              title: '烧热的铸铁平底锅',
              actions: [{ key: 'E', label: '放入 A5 和牛牛排开始煎制' }],
              sub: `锅温 ${Math.round(this.state.skilletTemp)}°C`,
            };
          }
          if (this.state.steakLoc === 'skillet') {
            // Delegate cleanly to steak interaction so aiming anywhere at skillet flips/serves steak!
            return this.interactables.find((i) => i.id === 'wagyu').getPrompt();
          }
          return {
            title: '铸铁平底锅 (架在焚火台)',
            actions: [{ key: 'E', label: '取下铸铁锅' }],
            sub: `锅温 ${Math.round(this.state.skilletTemp)}°C`,
          };
        }
        return {
          title: '铸铁平底锅 (Lodge 风)',
          actions: [{ key: 'E', label: '拿起铸铁锅' }],
          sub: '放到焚火台烤架上加热后可煎和牛',
        };
      },
      onPrimary: () => {
        if (this.state.skilletOnFire && this.held?.type === 'wagyu_raw') {
          this._placeSteakInSkillet();
        } else if (this.state.skilletOnFire && this.state.steakLoc === 'skillet') {
          this._interactSteakPrimary();
        } else if (!this.held) {
          this.state.skilletOnFire = false;
          this.skillet.visible = false;
          this._holdItem('skillet');
          this.sound.playMetalClink();
        }
      },
      onSecondary: () => {
        if (this.state.skilletOnFire && this.state.steakLoc === 'skillet') {
          this._interactSteakSecondary();
        }
      },
    });

    // 8. Stanley Water Jug (beside roll-top table on a flat stone)
    this.waterJug = this.assets.clone('water_jug');
    this.waterJug.position.copy(this._groundAt(1.56, -2.35, 0.0));
    this.waterJug.rotation.y = -0.9;
    this.scene.add(this.waterJug);

    this._registerInteractable('water_jug', this.waterJug, {
      getPrompt: () => {
        if (this.held?.type === 'kettle') {
          return {
            title: '富士山泉水保温桶',
            actions: [{ key: 'E', label: '给手冲壶加满泉水' }],
            sub: `当前水量 ${Math.round(this.state.kettleWater * 100)}%`,
          };
        }
        if (this.held?.type === 'camp_pot') {
          return {
            title: '富士山泉水保温桶',
            actions: [{ key: 'E', label: '给露营锅注入泉水' }],
            sub: this.state.potHasWater ? '锅内已有清水' : '空锅',
          };
        }
        return {
          title: '富士山泉水保温桶',
          actions: [],
          sub: '手持手冲壶或露营锅靠近可接水',
        };
      },
      onPrimary: () => {
        if (this.held?.type === 'kettle') {
          this.state.kettleWater = 1.0;
          this.state.kettleTemp = 11;
          this.sound.playMetalClink();
          this.hud.showToast('已为手冲壶注入清冽的富士山泉水，放到焚火台烧开吧');
          this._updateHeldHud();
        } else if (this.held?.type === 'camp_pot') {
          this.state.potHasWater = true;
          this.state.potTemp = 11;
          this.sound.playMetalClink();
          this.hud.showToast('已为露营锅加水，放到焚火台烤架煮沸后可做咖喱汤');
          this._updateHeldHud();
        }
      },
    });

    // 9. Enameled Camp Pot (for Japanese Camp Curry Soup!)
    this.potHomePos = this._groundAt(1.42, -2.82, 0.0);
    this.potFirePos = new THREE.Vector3(this.pitPos.x + 0.11, this.pitPos.y + 0.412, this.pitPos.z - 0.04);
    this.campPot = this.assets.clone('camp_pot');
    this.campPot.position.copy(this.potHomePos);
    this.scene.add(this.campPot);

    this._registerInteractable('camp_pot', this.campPot, {
      getPrompt: () => {
        if (this.state.potLoc === 'fire') {
          if (this.state.potServings > 0) {
            return {
              title: '热腾腾的露营咖喱汤',
              actions: [
                { key: 'E', label: '享用一碗热咖喱汤' },
                { key: 'F', label: '端下露营锅' },
              ],
              sub: `剩余 ${this.state.potServings} 碗 · 温度 ${Math.round(this.state.potTemp)}°C`,
            };
          }
          if (this.state.potHasWater && !this.state.potHasCurry) {
            return {
              title: '珐琅露营锅 (加热中)',
              actions: [
                { key: 'E', label: this.state.potTemp >= 85 ? '加入日式咖喱块与乌冬面' : '等待水烧热 (≥85°C)' },
                { key: 'F', label: '取下露营锅' },
              ],
              sub: `水温 ${Math.round(this.state.potTemp)}°C`,
            };
          }
          if (this.state.potHasCurry) {
            return {
              title: '正在咕嘟炖煮咖喱锅...',
              actions: [{ key: 'F', label: '取下露营锅' }],
              sub: `熬煮进度 ${Math.round(this.state.potSimmer)}% · 温度 ${Math.round(this.state.potTemp)}°C`,
            };
          }
          return {
            title: '珐琅露营锅 (空锅)',
            actions: [{ key: 'E', label: '拿起去水桶接水' }],
          };
        }
        return {
          title: '森林绿珐琅露营锅',
          actions: [{ key: 'E', label: '拿起露营锅' }],
          sub: this.state.potHasWater ? '已盛水：放到焚火台烤架煮咖喱' : '先去水桶接水，再放焚火台煮热汤',
        };
      },
      onPrimary: () => {
        if (this.state.potLoc === 'fire') {
          if (this.state.potServings > 0) {
            this.state.potServings--;
            this.vitals.hunger = Math.min(100, this.vitals.hunger + 34);
            this.vitals.warmth = Math.min(37.2, this.vitals.warmth + 1.4);
            this.vitals.calm = Math.min(100, this.vitals.calm + 12);
            this.hud.completeQuest('curry');
            this.hud.showToast('🍛 喝了一大口滚烫浓香的露营咖喱汤，浑身立刻暖和起来！');
            if (this.state.potServings === 0) {
              this.state.potHasWater = false;
              this.state.potHasCurry = false;
              this.state.potSimmer = 0;
            }
            return;
          }
          if (this.state.potHasWater && !this.state.potHasCurry) {
            if (this.state.potTemp >= 85) {
              this.state.potHasCurry = true;
              this.state.potSimmer = 0;
              this.sound.playWoodPlace();
              this.hud.showToast('已投入日式咖喱块与蔬菜，小火咕嘟炖煮中...');
            } else {
              this.hud.showToast(`水温还只有 ${Math.round(this.state.potTemp)}°C，等水烧开再加咖喱吧`);
            }
            return;
          }
          if (!this.state.potHasWater && !this.held) {
            this.state.potLoc = 'held';
            this.campPot.visible = false;
            this._holdItem('camp_pot');
            this.sound.playMetalClink();
          }
        } else if (!this.held) {
          this.state.potLoc = 'held';
          this.campPot.visible = false;
          this._holdItem('camp_pot');
          this.sound.playMetalClink();
        }
      },
      onSecondary: () => {
        if (this.state.potLoc === 'fire' && !this.held) {
          this.state.potLoc = 'held';
          this.campPot.visible = false;
          this._holdItem('camp_pot');
          this.sound.playMetalClink();
        }
      },
    });

    // 10. Gooseneck Pour-Over Kettle (starts on table, can fill & boil on firepit!)
    this.kettleHomePos = new THREE.Vector3(this.tablePos.x + 0.25, this.tableTopY, this.tablePos.z + 0.14);
    this.kettleFirePos = new THREE.Vector3(this.pitPos.x + 0.08, this.pitPos.y + 0.412, this.pitPos.z + 0.10);
    this.kettle = this.assets.clone('kettle_gooseneck');
    this.kettle.position.copy(this.kettleHomePos);
    this.kettle.rotation.y = -2.1;
    this.scene.add(this.kettle);

    this._registerInteractable('kettle', this.kettle, {
      getPrompt: () => ({
        title: '哑光黑手冲细嘴壶',
        actions: [{ key: 'E', label: '拿起手冲壶' }],
        sub: this.state.kettleWater > 0.05
          ? `水量 ${Math.round(this.state.kettleWater * 100)}% · 水温 ${Math.round(this.state.kettleTemp)}°C${this.state.kettleTemp >= 88 ? ' (已烧开!)' : ''}`
          : '空壶：去水桶接泉水后放焚火台烧开',
      }),
      onPrimary: () => {
        if (this.held) return this.hud.showToast('请先按 [F] 放下手中物品');
        this.state.kettleLoc = 'held';
        this.kettle.visible = false;
        this._holdItem('kettle');
        this.sound.playMetalClink();
      },
    });

    // 11. Hario V60 Ceramic Coffee Dripper + Glass Carafe on table
    this.dripper = this.assets.clone('coffee_dripper_set');
    this.dripper.position.set(this.tablePos.x - 0.02, this.tableTopY, this.tablePos.z + 0.13);
    this.scene.add(this.dripper);

    // Rising dark coffee cylinder inside glass carafe!
    this.carafeCoffeeMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.044, 0.052, 0.072, 20),
      new THREE.MeshStandardMaterial({ color: 0x1a0903, roughness: 0.1, metalness: 0.05 })
    );
    this.carafeCoffeeMesh.position.set(this.dripper.position.x, this.tableTopY + 0.04, this.dripper.position.z);
    this.carafeCoffeeMesh.scale.y = 0.01;
    this.carafeCoffeeMesh.visible = false;
    this.scene.add(this.carafeCoffeeMesh);

    this._registerInteractable('dripper', this.dripper, {
      getPrompt: () => {
        if (this.held?.type === 'kettle') {
          if (this.state.kettleWater < 0.05) {
            return { title: 'Hario V60 手冲咖啡滤杯', actions: [], sub: '壶里没有水，请先去水桶接水并烧开' };
          }
          if (this.state.kettleTemp < 85) {
            return {
              title: 'Hario V60 手冲咖啡滤杯',
              actions: [],
              sub: `当前水温 ${Math.round(this.state.kettleTemp)}°C，需放到焚火台烧至 85°C 以上`,
            };
          }
          return {
            title: 'Hario V60 手冲咖啡滤杯',
            actions: [{ key: '长按 E', label: '缓慢绕圈注水萃取手冲咖啡' }],
            sub: `萃取进度 ${Math.round(this.state.coffeeBrew)}%`,
          };
        }
        if (this.state.coffeeBrew >= 85) {
          return {
            title: '手冲咖啡分享壶 (已萃好!)',
            actions: [{ key: 'E', label: '倒入 Snow Peak 钛杯' }],
            sub: '耶加雪菲中浅烘 · 醇香扑鼻',
          };
        }
        return {
          title: 'Hario V60 手冲咖啡组',
          actions: [],
          sub: '已铺好滤纸与现磨咖啡粉，烧一壶热水来手冲吧',
        };
      },
      onPrimary: () => {
        if (this.state.coffeeBrew >= 85 && this.held?.type !== 'kettle') {
          this.state.mugCoffee = 1.0;
          this.state.coffeeBrew = 0;
          this.carafeCoffeeMesh.visible = false;
          this.mugCoffeeLiquid.visible = true;
          this.hud.completeQuest('coffee');
          this.hud.showToast('☕ 热气腾腾的手冲咖啡已倒入钛杯！拿起钛杯坐上克米特椅品尝吧');
        }
      },
    });

    // 12. Snow Peak Titanium Mug on table
    this.mugHomePos = new THREE.Vector3(this.tablePos.x - 0.14, this.tableTopY, this.tablePos.z - 0.12);
    this.mug = this.assets.clone('titanium_mug');
    this.mug.position.copy(this.mugHomePos);
    this.scene.add(this.mug);

    this.mugCoffeeLiquid = new THREE.Mesh(
      new THREE.CylinderGeometry(0.037, 0.037, 0.068, 18),
      new THREE.MeshStandardMaterial({ color: 0x1c0a03, roughness: 0.12 })
    );
    this.mugCoffeeLiquid.position.set(0, 0.044, 0);
    this.mugCoffeeLiquid.visible = false;
    this.mug.add(this.mugCoffeeLiquid);

    this._registerInteractable('mug', this.mug, {
      getPrompt: () => ({
        title: 'Snow Peak 450ml 钛杯',
        actions: [{ key: 'E', label: this.state.mugCoffee > 0.05 ? '端起热咖啡' : '拿起钛杯' }],
        sub: this.state.mugCoffee > 0.05 ? `热手冲咖啡剩余 ${Math.round(this.state.mugCoffee * 100)}%` : '空杯',
      }),
      onPrimary: () => {
        if (this.held) return this.hud.showToast('请先按 [F] 放下手中物品');
        this.state.mugLoc = 'held';
        this.mug.visible = false;
        this._holdItem('mug');
        this.sound.playMetalClink();
      },
    });

    // 13. Fire Blowpipe (火吹棒) resting cleanly flat on the side edge of the roll-top table!
    this.blowpipeHomePos = new THREE.Vector3(this.tablePos.x + 0.08, this.tableTopY + 0.012, this.tablePos.z + 0.24);
    this.blowpipe = this.assets.clone('blowpipe');
    this.blowpipe.position.copy(this.blowpipeHomePos);
    this.blowpipe.rotation.set(Math.PI * 0.5, 0.0, 1.22);
    this.scene.add(this.blowpipe);

    this._registerInteractable('blowpipe', this.blowpipe, {
      getPrompt: () => ({
        title: '日式伸缩火吹棒',
        actions: [{ key: 'E', label: '拾起火吹棒' }],
        sub: '对准焚火台吹气可迅速提温助燃',
      }),
      onPrimary: () => {
        if (this.held) return this.hud.showToast('请先按 [F] 放下手中物品');
        this.blowpipe.visible = false;
        this._holdItem('blowpipe');
        this.sound.playMetalClink();
      },
    });

    // 14. WOOD CHOPPING STATION (left of firepit: oak stump, hatchet, whole log stack, split log pile!)
    this.stumpPos = this._groundAt(-2.15, -4.10, 0.0);
    this.stump = this.assets.clone('chopping_block');
    this.stump.position.copy(this.stumpPos);
    this.scene.add(this.stump);
    this.colliders.push({ x: this.stumpPos.x, z: this.stumpPos.z, r: 0.42 });

    // Log perched upright on top of chopping stump
    this.stumpWholeLog = this.assets.clone('log_whole');
    this.stumpWholeLog.position.set(this.stumpPos.x, this.stumpPos.y + 0.65, this.stumpPos.z);
    this.stumpWholeLog.rotation.z = Math.PI * 0.5;
    this.scene.add(this.stumpWholeLog);

    this.stumpSplitLog = this.assets.clone('log_split');
    this.stumpSplitLog.position.set(this.stumpPos.x, this.stumpPos.y + 0.65, this.stumpPos.z);
    this.stumpSplitLog.rotation.z = Math.PI * 0.5;
    this.stumpSplitLog.visible = false;
    this.scene.add(this.stumpSplitLog);

    this._registerInteractable('stump', this.stump, {
      getPrompt: () => {
        if (this.state.logOnStump === 'whole') {
          return {
            title: '橡木劈柴墩 (已放桧木原木)',
            actions: [{ key: 'E', label: '挥斧劈开桧木原木!' }],
            sub: this.held?.type === 'hatchet' ? '手斧就绪：干净利落一斧劈两半' : '可直接挥起旁边的手斧劈柴',
          };
        }
        if (this.state.logOnStump === 'split') {
          return {
            title: '橡木劈柴墩 (已放半块劈柴)',
            actions: [{ key: 'E', label: '再劈成干燥引火细柴' }],
            sub: '细柴更容易用打火石引燃',
          };
        }
        if (this.held?.type === 'log_whole') {
          return { title: '橡木劈柴墩', actions: [{ key: 'E', label: '放上桧木原木准备劈柴' }] };
        }
        if (this.held?.type === 'log_split') {
          return { title: '橡木劈柴墩', actions: [{ key: 'E', label: '放上劈柴细劈成引火柴' }] };
        }
        return {
          title: '橡木劈柴墩',
          actions: this.state.wholeLogStock > 0 ? [{ key: 'E', label: '从旁边木堆架上一根原木' }] : [],
          sub: '先把原木架上树墩再挥斧劈柴',
        };
      },
      onPrimary: () => this._interactStump(),
    });
    // Also register the log perched on stump so aiming directly at the log works seamlessly!
    this._registerInteractable('stump_log', this.stumpWholeLog, {
      getPrompt: () => this.interactables.find((i) => i.id === 'stump').getPrompt(),
      onPrimary: () => this._interactStump(),
    });
    this._registerInteractable('stump_split', this.stumpSplitLog, {
      getPrompt: () => this.interactables.find((i) => i.id === 'stump').getPrompt(),
      onPrimary: () => this._interactStump(),
    });

    // Camping Hatchet embedded in edge of chopping stump
    this.hatchetHomePos = new THREE.Vector3(this.stumpPos.x + 0.16, this.stumpPos.y + 0.45, this.stumpPos.z + 0.08);
    this.hatchet = this.assets.clone('hatchet');
    this.hatchet.position.copy(this.hatchetHomePos);
    this.hatchet.rotation.set(0.1, 0.5, -2.15);
    this.scene.add(this.hatchet);

    this._registerInteractable('hatchet', this.hatchet, {
      getPrompt: () => ({
        title: '手锻露营手斧',
        actions: [{ key: 'E', label: '拔起手斧' }],
        sub: '用于劈开桧木原木与制作引火柴',
      }),
      onPrimary: () => {
        if (this.held) return this.hud.showToast('请先按 [F] 放下手中物品');
        this.hatchet.visible = false;
        this._holdItem('hatchet');
        this.sound.playWoodPlace();
      },
    });

    // Whole Hinoki Log Stack beside stump
    this.wholePileGroup = new THREE.Group();
    this.wholePileGroup.position.copy(this._groundAt(-2.95, -4.25, 0.0));
    this.wholeLogMeshes = [];
    const wholeOffsets = [
      [0, 0.06, -0.14], [0, 0.06, 0.0], [0, 0.06, 0.14],
      [0, 0.17, -0.07], [0, 0.17, 0.07], [0, 0.28, 0.0],
    ];
    for (const o of wholeOffsets) {
      const m = this.assets.clone('log_whole');
      m.position.set(...o);
      m.rotation.y = 0.25 + (Math.random() - 0.5) * 0.1;
      this.wholePileGroup.add(m);
      this.wholeLogMeshes.push(m);
    }
    this.scene.add(this.wholePileGroup);

    this._registerInteractable('whole_pile', this.wholePileGroup, {
      getPrompt: () => ({
        title: `桧木原木堆 (余 ${this.state.wholeLogStock} 根)`,
        actions: this.state.wholeLogStock > 0 ? [{ key: 'E', label: '抱起一根桧木原木' }] : [],
        sub: '拿到劈柴墩上劈开后更耐烧',
      }),
      onPrimary: () => {
        if (this.held) return this.hud.showToast('请先按 [F] 放下手中物品');
        if (this.state.wholeLogStock <= 0) return;
        this.state.wholeLogStock--;
        this._syncWoodPiles();
        this._holdItem('log_whole');
        this.sound.playWoodPlace();
      },
    });

    // Split Firewood Pile beside stump (grows as you chop wood!)
    this.splitPileGroup = new THREE.Group();
    this.splitPileGroup.position.copy(this._groundAt(-1.42, -4.32, 0.0));
    this.splitLogMeshes = [];
    for (let i = 0; i < 10; i++) {
      const row = Math.floor(i / 4);
      const col = i % 4;
      const m = this.assets.clone('log_split');
      m.position.set(0, 0.04 + row * 0.075, (col - 1.5) * 0.095 + row * 0.03);
      m.rotation.set(0.2 * (i % 3), -0.35 + (i % 2) * 0.15, 0);
      this.splitPileGroup.add(m);
      this.splitLogMeshes.push(m);
    }
    this.scene.add(this.splitPileGroup);

    this._registerInteractable('split_pile', this.splitPileGroup, {
      getPrompt: () => ({
        title: `已劈好的桧木柴 (余 ${this.state.splitLogPile} 根)`,
        actions: this.state.splitLogPile > 0 ? [{ key: 'E', label: '拾取一根桧木劈柴' }] : [],
        sub: '放入焚火台维持长效旺火',
      }),
      onPrimary: () => {
        if (this.held) return this.hud.showToast('请先按 [F] 放下手中物品');
        if (this.state.splitLogPile <= 0) return;
        this.state.splitLogPile--;
        this._syncWoodPiles();
        this._holdItem('log_split');
        this.sound.playWoodPlace();
      },
    });

    // Kindling Basket / Pile near stump
    this.kindlingPileMesh = this.assets.clone('kindling_bundle');
    this.kindlingPileMesh.position.copy(this._groundAt(-1.42, -3.72, 0.0));
    this.scene.add(this.kindlingPileMesh);

    this._registerInteractable('kindling_pile', this.kindlingPileMesh, {
      getPrompt: () => ({
        title: `干燥引火细柴 (余 ${this.state.kindlingPile} 束)`,
        actions: this.state.kindlingPile > 0 ? [{ key: 'E', label: '拾取引火细柴' }] : [],
        sub: '放入焚火台后用打火石轻松引燃',
      }),
      onPrimary: () => {
        if (this.held) return this.hud.showToast('请先按 [F] 放下手中物品');
        if (this.state.kindlingPile <= 0) return;
        this.state.kindlingPile--;
        this._syncWoodPiles();
        this._holdItem('kindling');
        this.sound.playWoodPlace();
      },
    });

    this._syncWoodPiles();
  }

  _buildSteamAndPourFX() {
    // 1. Rising savory steam particle pool (shared by skillet, camp pot, kettle, and hot coffee mug!)
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 3, 32, 32, 28);
    g.addColorStop(0, 'rgba(255,255,255,0.52)');
    g.addColorStop(1, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);

    const count = 75;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3 + 1] = -99;
      this._steamParticles.push({ x: 0, y: -99, z: 0, vy: 0, life: 0, maxLife: 1 });
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      map: new THREE.CanvasTexture(canvas),
      size: 0.16,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    this.steamPoints = new THREE.Points(geom, mat);
    this.scene.add(this.steamPoints);

    // 2. Flying wood chips burst when chopping a Hinoki log!
    const chipCount = 24;
    const cPos = new Float32Array(chipCount * 3);
    for (let i = 0; i < chipCount; i++) {
      cPos[i * 3 + 1] = -99;
      this._woodChips.push({ x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, life: 0 });
    }
    const cGeom = new THREE.BufferGeometry();
    cGeom.setAttribute('position', new THREE.BufferAttribute(cPos, 3));
    this.chipPoints = new THREE.Points(
      cGeom,
      new THREE.PointsMaterial({ color: 0xdab276, size: 0.045 })
    );
    this.scene.add(this.chipPoints);

    // 3. Delicate curved hot water stream when pouring into the Hario V60 dripper!
    const streamCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0.08, 0.34, 0.02),
      new THREE.Vector3(0.02, 0.27, 0.0),
      new THREE.Vector3(0.0, 0.17, 0.0)
    );
    this.pourStreamMesh = new THREE.Mesh(
      new THREE.TubeGeometry(streamCurve, 12, 0.0032, 6, false),
      new THREE.MeshPhysicalMaterial({
        color: 0xdff2ff,
        transparent: true,
        opacity: 0.72,
        roughness: 0.05,
        metalness: 0.1,
      })
    );
    this.pourStreamMesh.position.copy(this.dripper.position);
    this.pourStreamMesh.visible = false;
    this.scene.add(this.pourStreamMesh);
  }

  _bindControls() {
    window.addEventListener('keydown', (e) => {
      if (!this.player.isLocked) return;
      if (e.code === 'KeyE') {
        if (!this._eHeld) {
          this._eHeld = true;
          this._onPrimaryKey();
        }
      } else if (e.code === 'KeyF') {
        this._onSecondaryKey();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'KeyE') {
        this._eHeld = false;
        this.state.isPouring = false;
        this.pourStreamMesh.visible = false;
        this.hud.setActionMeter(null, 0);
      }
    });

    // Left mouse click mirrors E for super intuitive tactile interaction!
    window.addEventListener('mousedown', (e) => {
      if (!this.player.isLocked || e.button !== 0) return;
      this._eHeld = true;
      this._onPrimaryKey();
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button !== 0) return;
      this._eHeld = false;
      this.state.isPouring = false;
      this.pourStreamMesh.visible = false;
      this.hud.setActionMeter(null, 0);
    });
  }

  _holdItem(type, meta = {}) {
    this.held = { type, meta };
    const cfg = VIEWMODEL_CFG[type];
    if (cfg) {
      const vm = this.assets.clone(cfg.model);
      if (type === 'wagyu_cooked') {
        vm.traverse((o) => {
          if (o.isMesh && o.material) {
            o.material = o.material.clone();
            o.material.color.setRGB(0.42, 0.24, 0.14);
          }
        });
      }
      if (type === 'mug' && this.state.mugCoffee > 0.05) {
        const liq = new THREE.Mesh(
          new THREE.CylinderGeometry(0.037, 0.037, 0.068, 16),
          new THREE.MeshStandardMaterial({ color: 0x1c0a03, roughness: 0.12 })
        );
        liq.position.set(0, 0.044, 0);
        vm.add(liq);
      }
      this.player.setViewmodel(vm, cfg);
    }
    this._updateHeldHud();
  }

  _clearHeld() {
    this.held = null;
    this.player.setViewmodel(null);
    this._updateHeldHud();
  }

  _updateHeldHud() {
    if (!this.held) {
      this.hud.setHeldItem('空手', '');
      return;
    }
    const t = this.held.type;
    let hint = '[F] 放回原位';
    if (t === 'mug' && this.state.mugCoffee > 0.05) {
      hint = `[E] 品尝热手冲咖啡 (${Math.round(this.state.mugCoffee * 100)}%) · [F] 放回桌面`;
    } else if (t === 'wagyu_cooked') {
      hint = '[E] 享用香煎 A5 和牛 · [F] 放回砧板';
    } else if (t === 'kettle') {
      hint = `水量 ${Math.round(this.state.kettleWater * 100)}% · ${Math.round(this.state.kettleTemp)}°C`;
    } else if (t === 'blowpipe') {
      hint = '对准焚火台按 [E] 或 [F] 吹火助燃';
    }
    this.hud.setHeldItem(ITEM_NAMES[t] || t, hint);
  }

  _putHeldBack() {
    if (!this.held) return;
    const t = this.held.type;
    if (t === 'hatchet') {
      this.hatchet.visible = true;
    } else if (t === 'blowpipe') {
      this.blowpipe.visible = true;
    } else if (t === 'skillet') {
      this.state.skilletOnFire = false;
      this.skillet.position.copy(this.skilletHomePos);
      this.skillet.visible = true;
    } else if (t === 'camp_pot') {
      this.state.potLoc = 'table';
      this.campPot.position.copy(this.potHomePos);
      this.campPot.visible = true;
    } else if (t === 'kettle') {
      this.state.kettleLoc = 'table';
      this.kettle.position.copy(this.kettleHomePos);
      this.kettle.visible = true;
    } else if (t === 'mug') {
      this.state.mugLoc = 'table';
      this.mug.position.copy(this.mugHomePos);
      this.mugCoffeeLiquid.visible = this.state.mugCoffee > 0.05;
      this.mug.visible = true;
    } else if (t === 'log_whole') {
      this.state.wholeLogStock++;
      this._syncWoodPiles();
    } else if (t === 'log_split') {
      this.state.splitLogPile++;
      this._syncWoodPiles();
    } else if (t === 'kindling') {
      this.state.kindlingPile++;
      this._syncWoodPiles();
    } else if (t === 'wagyu_raw' || t === 'wagyu_cooked') {
      this.state.steakLoc = 'board';
      this.wagyu.position.copy(this.steakBoardPos);
      this.wagyu.visible = true;
    }
    this.sound.playWoodPlace();
    this._clearHeld();
  }

  _syncWoodPiles() {
    for (let i = 0; i < this.wholeLogMeshes.length; i++) {
      this.wholeLogMeshes[i].visible = i < this.state.wholeLogStock;
    }
    for (let i = 0; i < this.splitLogMeshes.length; i++) {
      this.splitLogMeshes[i].visible = i < this.state.splitLogPile;
    }
    this.kindlingPileMesh.visible = this.state.kindlingPile > 0;
    this.stumpWholeLog.visible = this.state.logOnStump === 'whole';
    this.stumpSplitLog.visible = this.state.logOnStump === 'split';
  }

  _onPrimaryKey() {
    // Special case: holding hot coffee mug or cooked Wagyu while looking at sky/lake (or seated!)
    if (!this._activeTarget) {
      if (this.held?.type === 'mug' && this.state.mugCoffee > 0.05) {
        this._sipCoffee();
        return;
      }
      if (this.held?.type === 'wagyu_cooked') {
        this._eatWagyu();
        return;
      }
      return;
    }
    if (this._activeTarget.onPrimary) {
      this._activeTarget.onPrimary();
    }
  }

  _onSecondaryKey() {
    if (this._activeTarget?.onSecondary) {
      this._activeTarget.onSecondary();
      return;
    }
    // Near firepit -> quick blowpipe boost if empty handed or holding blowpipe
    const distToFire = this.player.pos.distanceTo(this.pitPos);
    if (distToFire < 3.0 && (!this.held || this.held.type === 'blowpipe')) {
      this._blowFire();
      return;
    }
    if (this.held) {
      this._putHeldBack();
    }
  }

  _interactStump() {
    if (this.state.logOnStump === 'whole') {
      // Swing hatchet and cleave whole Hinoki log into 2 fresh split logs!
      this.player.triggerHandAnim('chop', 0.44);
      setTimeout(() => {
        this.sound.playAxeSplit();
        this.state.logOnStump = null;
        this.state.splitLogPile += 2;
        this._syncWoodPiles();
        this._spawnWoodChips(this.stumpPos.x, this.stumpPos.y + 0.56, this.stumpPos.z);
        this.hud.completeQuest('chop');
        this.hud.showToast('🪓 干净利落！桧木原木一劈为二，散发清新的木香');
      }, 170);
      return;
    }

    if (this.state.logOnStump === 'split') {
      this.player.triggerHandAnim('chop', 0.40);
      setTimeout(() => {
        this.sound.playAxeSplit();
        this.state.logOnStump = null;
        this.state.kindlingPile += 2;
        this._syncWoodPiles();
        this._spawnWoodChips(this.stumpPos.x, this.stumpPos.y + 0.56, this.stumpPos.z);
        this.hud.showToast('🪓 已细劈出两束干燥的引火细柴');
      }, 160);
      return;
    }

    if (this.held?.type === 'log_whole') {
      this.state.logOnStump = 'whole';
      this._clearHeld();
      this._syncWoodPiles();
      this.sound.playWoodPlace();
    } else if (this.held?.type === 'log_split') {
      this.state.logOnStump = 'split';
      this._clearHeld();
      this._syncWoodPiles();
      this.sound.playWoodPlace();
    } else if (this.state.wholeLogStock > 0) {
      this.state.wholeLogStock--;
      this.state.logOnStump = 'whole';
      this._syncWoodPiles();
      this.sound.playWoodPlace();
      this.hud.showToast('已将桧木原木立在树墩上，再按 [E] 挥斧劈开！');
    }
  }

  _spawnWoodChips(x, y, z) {
    for (const c of this._woodChips) {
      c.x = x + (Math.random() - 0.5) * 0.1;
      c.y = y;
      c.z = z + (Math.random() - 0.5) * 0.1;
      c.vx = (Math.random() - 0.5) * 2.2;
      c.vy = 1.2 + Math.random() * 1.6;
      c.vz = (Math.random() - 0.5) * 2.2;
      c.life = 0.7 + Math.random() * 0.4;
    }
  }

  _interactFirepit() {
    if (this.held?.type === 'log_split') {
      if (this.fire.addSplitLog()) {
        this.sound.playWoodPlace();
        this._clearHeld();
        this.hud.showToast('已架入一根桧木劈柴');
      } else {
        this.hud.showToast('焚火台里的木柴已经堆满啦');
      }
      return;
    }
    if (this.held?.type === 'kindling') {
      if (this.fire.addKindling()) {
        this.sound.playWoodPlace();
        this._clearHeld();
        this.hud.showToast('已放入干燥引火细柴');
      }
      return;
    }
    if (this.held?.type === 'blowpipe') {
      this._blowFire();
      return;
    }
    if (this.held?.type === 'skillet') {
      this.state.skilletOnFire = true;
      this.skillet.position.copy(this.skilletFirePos);
      this.skillet.rotation.y = 0.25;
      this.skillet.visible = true;
      this._clearHeld();
      this.sound.playMetalClink();
      this.hud.showToast('铸铁平底锅已架上焚火台，开始导热升温');
      return;
    }
    if (this.held?.type === 'camp_pot') {
      this.state.potLoc = 'fire';
      this.campPot.position.copy(this.potFirePos);
      this.campPot.visible = true;
      this._clearHeld();
      this.sound.playMetalClink();
      this.hud.showToast(this.state.potHasWater ? '露营锅已上架，泉水开始加热' : '提示：锅还是空的，先去水桶接水哦');
      return;
    }
    if (this.held?.type === 'kettle') {
      this.state.kettleLoc = 'fire';
      this.kettle.position.copy(this.kettleFirePos);
      this.kettle.rotation.y = 0.5;
      this.kettle.visible = true;
      this._clearHeld();
      this.sound.playMetalClink();
      this.hud.showToast(this.state.kettleWater > 0.05 ? '手冲壶已架上炉火，等待水开煮咖啡' : '提示：手冲壶是空的，先去水桶接水');
      return;
    }

    // Otherwise strike ferrocerium flint rod to ignite!
    this.player.triggerHandAnim('use', 0.3);
    this.sound.playFlintSpark();
    const res = this.fire.strikeFlint();
    if (res.reason === 'no_tinder') {
      this.hud.showToast('需要先把干燥引火细柴放入焚火台再打火引燃！');
    } else if (res.newlyLit) {
      this.hud.completeQuest('fire');
      this.hud.showToast('🔥 火星点燃了干燥细柴！篝火燃起来了，快架入桧木劈柴吧！');
    } else if (!res.ignited) {
      this.hud.showToast(`打火石擦出火星，引火绒正在冒烟 (${Math.round(res.progress * 100)}%)，再擦一次！`);
    }
  }

  _blowFire() {
    this.player.triggerHandAnim('blow', 0.55);
    this.sound.playBlowWhoosh();
    this.fire.blowOxygen(0.42);
    this.hud.showToast('💨 吹入气流，炭火骤然发亮，火势更旺了！');
  }

  _placeSteakInSkillet() {
    this.state.steakLoc = 'skillet';
    this.wagyu.position.set(this.skilletFirePos.x, this.skilletFirePos.y + 0.012, this.skilletFirePos.z);
    this.wagyu.rotation.set(0, 0.3, 0);
    this.wagyu.visible = true;
    this._clearHeld();
    this.hud.showToast('🥩 A5 和牛落入热铸铁锅，滋啦作响，脂香四溢！');
  }

  _interactSteakPrimary() {
    if (this.state.steakLoc === 'board') {
      if (this.held) return this.hud.showToast('请先按 [F] 放下手中物品');
      this.state.steakLoc = 'held';
      this.wagyu.visible = false;
      this._holdItem('wagyu_raw');
      this.hud.showToast('拿起了生 A5 和牛牛排，放入架在火上的铸铁锅开始煎制');
    } else if (this.state.steakLoc === 'skillet') {
      this.state.steakSide = 1 - this.state.steakSide;
      this.state.steakFlipAnim = 1.0;
      this.sound.playWoodPlace();
      this.hud.showToast(`翻面成功！当前煎制 ${this.state.steakSide === 0 ? 'A面' : 'B面'}`);
    }
  }

  _interactSteakSecondary() {
    if (this.state.steakLoc !== 'skillet') return;
    if (this.held) return this.hud.showToast('请先按 [F] 放下手中物品');
    const avg = (this.state.steakCook[0] + this.state.steakCook[1]) * 0.5;
    this.state.steakLoc = 'held';
    this.wagyu.visible = false;
    if (avg >= 60) {
      this._holdItem('wagyu_cooked');
      this.hud.showToast('🥩 香煎 A5 和牛出锅！按 [E] 趁热品尝吧！');
    } else {
      this._holdItem('wagyu_raw');
      this.hud.showToast('牛排还没煎熟，已先取出');
    }
  }

  _eatWagyu() {
    this.player.triggerHandAnim('sip', 0.5);
    const avg = (this.state.steakCook[0] + this.state.steakCook[1]) * 0.5;
    const burnt = avg > 128;
    this.vitals.hunger = Math.min(100, this.vitals.hunger + (burnt ? 24 : 46));
    this.vitals.warmth = Math.min(37.2, this.vitals.warmth + 1.2);
    this.vitals.calm = Math.min(100, this.vitals.calm + (burnt ? 6 : 18));
    this.hud.completeQuest('steak');
    this.hud.showToast(burnt ? '🥩 稍微煎老了一点，但野外炭火烤肉依然超满足！' : '🥩 外焦里嫩、肉汁丰盈的 A5 和牛！露营幸福感拉满！');
    this._clearHeld();
    // Replenish a fresh steak on the cutting board after 8 seconds so players can keep cooking!
    setTimeout(() => {
      this.state.steakLoc = 'board';
      this.state.steakCook = [0, 0];
      this.state.steakSide = 0;
      this._updateSteakVisual();
      this.wagyu.position.copy(this.steakBoardPos);
      this.wagyu.rotation.set(0, 0, 0);
      this.wagyu.visible = true;
    }, 8000);
  }

  _sipCoffee() {
    if (this.state.mugCoffee <= 0.04) return;
    this.player.triggerHandAnim('sip', 0.65);
    this.state.mugCoffee = Math.max(0, this.state.mugCoffee - 0.34);
    this.vitals.warmth = Math.min(37.2, this.vitals.warmth + 1.1);
    this.vitals.calm = Math.min(100, this.vitals.calm + 16);
    this._updateHeldHud();
    if (this.state.mugCoffee <= 0.04) {
      this.hud.showToast('☕ 喝完了最后一口温热的手冲咖啡，余韵甘甜');
      this._holdItem('mug'); // refreshes viewmodel without liquid
    } else {
      this.hud.showToast('☕ 轻啜一口热手冲咖啡，微风拂过本栖湖面...');
    }
  }

  _updateSteakVisual() {
    const avg = (this.state.steakCook[0] + this.state.steakCook[1]) * 0.5;
    const searT = THREE.MathUtils.clamp(avg / 100, 0, 1);
    const charT = THREE.MathUtils.clamp((avg - 110) / 45, 0, 1);
    // Raw bright red/white marbling -> rich golden-brown Maillard crust -> dark char
    const col = new THREE.Color(1.0, 1.0, 1.0)
      .lerp(new THREE.Color(0.54, 0.34, 0.22), searT)
      .lerp(new THREE.Color(0.14, 0.11, 0.10), charT);
    for (const m of this.wagyuMats) {
      m.color.copy(col);
      m.roughness = THREE.MathUtils.lerp(0.32, 0.58, searT);
    }
  }

  _spawnSteam(x, y, z, rate, dt) {
    if (Math.random() > rate * dt) return;
    for (const p of this._steamParticles) {
      if (p.life <= 0) {
        p.x = x + (Math.random() - 0.5) * 0.07;
        p.y = y;
        p.z = z + (Math.random() - 0.5) * 0.07;
        p.vy = 0.24 + Math.random() * 0.22;
        p.maxLife = 1.2 + Math.random() * 0.8;
        p.life = p.maxLife;
        break;
      }
    }
  }

  update(dt, elapsed, sky) {
    // 1. Update thermodynamic campfire
    this.fire.update(dt, elapsed, sky);

    // 2. Lantern & tent warm night glow
    const nightBoost = 1.0 - THREE.MathUtils.smoothstep(sky.sunElevation, -0.10, 0.15);
    const lanternFlicker = 0.94 + 0.06 * Math.sin(elapsed * 16.0);
    this.lanternLight.intensity = this.state.lanternOn ? (1.6 + nightBoost * 3.2) * lanternFlicker : 0;
    this.lanternFlameMesh.visible = this.state.lanternOn;
    this.tentLight.intensity = 0.65 + nightBoost * 2.6;
    if (this.hangingLanternPivot) {
      this.hangingLanternPivot.rotation.z = Math.sin(elapsed * 1.45) * 0.028 * (0.5 + sky.windSpeed * 0.25);
      this.hangingLanternPivot.rotation.x = Math.cos(elapsed * 1.15) * 0.018 * (0.5 + sky.windSpeed * 0.25);
      this.hangingLanternLight.intensity = (1.1 + nightBoost * 2.8) * lanternFlicker;
    }
    if (this.tentCanvasMats) {
      for (const m of this.tentCanvasMats) {
        m.emissiveIntensity = 0.04 + nightBoost * 0.24 * lanternFlicker;
      }
    }

    // 3. Cooking Heat Conduction from Campfire!
    const ambient = sky.ambientTempC;
    const fireHeat = this.fire.temperature;

    // Cast-iron skillet temperature & Wagyu Maillard cooking
    const targetSkillet = this.state.skilletOnFire ? ambient + (fireHeat - ambient) * 0.48 : ambient;
    this.state.skilletTemp += (targetSkillet - this.state.skilletTemp) * Math.min(1, dt * 0.22);

    let sizzleLevel = 0;
    if (this.state.skilletOnFire && this.state.steakLoc === 'skillet') {
      if (this.state.skilletTemp > 95) {
        const cookRate = ((this.state.skilletTemp - 85) / 160) * 6.5; // ~15-20s per side at roaring fire!
        this.state.steakCook[this.state.steakSide] = Math.min(150, this.state.steakCook[this.state.steakSide] + cookRate * dt);
        sizzleLevel = THREE.MathUtils.clamp((this.state.skilletTemp - 95) / 140, 0.15, 1.0);
        this._updateSteakVisual();
        this._spawnSteam(this.skilletFirePos.x, this.skilletFirePos.y + 0.04, this.skilletFirePos.z, 12 * sizzleLevel, dt);
      }
      // Flip toss animation
      if (this.state.steakFlipAnim > 0) {
        this.state.steakFlipAnim = Math.max(0, this.state.steakFlipAnim - dt * 2.8);
        const f = 1.0 - this.state.steakFlipAnim;
        this.wagyu.position.y = this.skilletFirePos.y + 0.012 + Math.sin(f * Math.PI) * 0.14;
        this.wagyu.rotation.x = this.state.steakSide * Math.PI + Math.sin(f * Math.PI) * Math.PI;
      } else {
        this.wagyu.position.y = this.skilletFirePos.y + 0.012;
        this.wagyu.rotation.x = this.state.steakSide * Math.PI;
      }
    }

    // Camp pot boiling & curry simmering
    let boilLevel = 0;
    const targetPot = this.state.potLoc === 'fire' ? Math.min(100, ambient + (fireHeat - ambient) * 0.35) : ambient;
    this.state.potTemp += (targetPot - this.state.potTemp) * Math.min(1, dt * 0.18);
    if (this.state.potLoc === 'fire' && this.state.potHasWater && this.state.potTemp > 84) {
      boilLevel = Math.max(boilLevel, (this.state.potTemp - 84) / 16);
      this._spawnSteam(this.potFirePos.x, this.potFirePos.y + 0.16, this.potFirePos.z, 10, dt);
      if (this.state.potHasCurry && this.state.potServings === 0) {
        this.state.potSimmer = Math.min(100, this.state.potSimmer + dt * 11.0);
        if (this.state.potSimmer >= 100) {
          this.state.potServings = 3;
          this.hud.showToast('🍛 露营咖喱锅已熬煮浓稠喷香！快按 [E] 趁热盛碗享用吧！');
        }
      }
    }

    // Gooseneck kettle heating
    const targetKettle = this.state.kettleLoc === 'fire' ? Math.min(98, ambient + (fireHeat - ambient) * 0.38) : ambient;
    this.state.kettleTemp += (targetKettle - this.state.kettleTemp) * Math.min(1, dt * (this.state.kettleLoc === 'fire' ? 0.22 : 0.02));
    if (this.state.kettleLoc === 'fire' && this.state.kettleWater > 0.05 && this.state.kettleTemp > 86) {
      boilLevel = Math.max(boilLevel, (this.state.kettleTemp - 86) / 12);
      this._spawnSteam(this.kettleFirePos.x, this.kettleFirePos.y + 0.15, this.kettleFirePos.z, 9, dt);
    }

    // Steam from freshly brewed coffee mug on table
    if (this.state.mugLoc === 'table' && this.state.mugCoffee > 0.05) {
      this._spawnSteam(this.mugHomePos.x, this.mugHomePos.y + 0.10, this.mugHomePos.z, 4, dt);
    }

    // 4. Raycast Interaction Detection
    this._activeTarget = null;
    if (this.player.isLocked) {
      this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
      const roots = this.interactables.filter((i) => i.obj.visible).map((i) => i.obj);
      const hits = this.raycaster.intersectObjects(roots, true);
      if (hits.length > 0) {
        let obj = hits[0].object;
        while (obj && !obj.userData.interactId) obj = obj.parent;
        if (obj?.userData.interactId) {
          this._activeTarget = this.interactables.find((i) => i.id === obj.userData.interactId) || null;
        }
      }
    }

    // 5. Hold-to-Pour V60 Coffee Ritual!
    if (
      this._eHeld &&
      this._activeTarget?.id === 'dripper' &&
      this.held?.type === 'kettle' &&
      this.state.kettleWater > 0.02 &&
      this.state.kettleTemp >= 85 &&
      this.state.coffeeBrew < 100
    ) {
      this.state.isPouring = true;
      this.pourStreamMesh.visible = true;
      this.player.triggerHandAnim('pour', 0.3);
      this.state.coffeeBrew = Math.min(100, this.state.coffeeBrew + dt * 24.0);
      this.state.kettleWater = Math.max(0, this.state.kettleWater - dt * 0.16);
      this.carafeCoffeeMesh.visible = true;
      this.carafeCoffeeMesh.scale.y = Math.max(0.05, this.state.coffeeBrew / 100);
      this.carafeCoffeeMesh.position.y = this.tableTopY + 0.008 + (this.state.coffeeBrew / 100) * 0.036;
      this._spawnSteam(this.dripper.position.x, this.tableTopY + 0.21, this.dripper.position.z, 12, dt);
      this.hud.setActionMeter(`正在手冲萃取耶加雪菲... ${Math.round(this.state.coffeeBrew)}%`, this.state.coffeeBrew / 100);

      if (this.state.coffeeBrew >= 100) {
        this.state.isPouring = false;
        this.pourStreamMesh.visible = false;
        this.hud.setActionMeter(null, 0);
        this.hud.showToast('☕ 手冲萃取完成！放下手冲壶，再对准分享壶按 [E] 倒入钛杯！');
      }
    } else if (this.state.isPouring) {
      this.state.isPouring = false;
      this.pourStreamMesh.visible = false;
      this.hud.setActionMeter(null, 0);
    }

    // Update HUD prompt
    if (this._activeTarget) {
      this.hud.setPrompt(this._activeTarget.getPrompt());
    } else if (this.player.seated && this.held?.type === 'mug' && this.state.mugCoffee > 0.05) {
      this.hud.setPrompt({
        title: '富士山与热手冲咖啡',
        actions: [{ key: 'E', label: '轻啜一口热咖啡' }, { key: 'W', label: '起身' }],
      });
    } else {
      this.hud.setPrompt(null);
    }

    // 6. Physiological Vitals Simulation (warmth responds authentically to alpine cold vs fire radiation!)
    const distToFire = this.player.pos.distanceTo(this.pitPos);
    const fireWarmth = this.fire.temperature > 120 ? Math.max(0, (1.0 - distToFire / 5.5)) * (this.fire.temperature / 420) : 0;
    const coldDrain = Math.max(0, (14.0 - ambient) * 0.0045);
    const targetWarmth = THREE.MathUtils.clamp(36.3 - coldDrain * 8 + fireWarmth * 1.4, 34.8, 37.1);
    this.vitals.warmth += (targetWarmth - this.vitals.warmth) * dt * 0.08;
    this.vitals.hunger = Math.max(10, this.vitals.hunger - dt * 0.04);
    const scenicBoost = (this.player.seated || distToFire < 3.5 && this.fire.lit) ? 0.45 : -0.05;
    this.vitals.calm = THREE.MathUtils.clamp(this.vitals.calm + scenicBoost * dt, 30, 100);

    // 7. Update Steam & Wood Chips particles
    const stAttr = this.steamPoints.geometry.getAttribute('position');
    for (let i = 0; i < this._steamParticles.length; i++) {
      const p = this._steamParticles[i];
      if (p.life > 0) {
        p.life -= dt;
        p.y += p.vy * dt;
        p.x += sky.windDir.x * 0.06 * dt;
        p.z += sky.windDir.y * 0.06 * dt;
        stAttr.setXYZ(i, p.x, p.y, p.z);
      } else {
        stAttr.setXYZ(i, 0, -99, 0);
      }
    }
    stAttr.needsUpdate = true;

    const chAttr = this.chipPoints.geometry.getAttribute('position');
    for (let i = 0; i < this._woodChips.length; i++) {
      const c = this._woodChips[i];
      if (c.life > 0) {
        c.life -= dt;
        c.vy -= 7.8 * dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.z += c.vz * dt;
        chAttr.setXYZ(i, c.x, c.y, c.z);
      } else {
        chAttr.setXYZ(i, 0, -99, 0);
      }
    }
    chAttr.needsUpdate = true;

    // 8. Feed live state into HUD & Spatial Audio!
    this.hud.updateVitals(this.vitals);
    this.hud.updateFireTelemetry(this.fire, distToFire);
    this.sound.update(dt, elapsed, {
      distToShore: Math.max(1.0, this.player.pos.z + 14.5),
      distToFire,
      windSpeed: sky.windSpeed,
      fireIntensity: this.fire.flameIntensity,
      sizzleLevel,
      boilLevel,
      isPouring: this.state.isPouring,
      sunElevation: sky.sunElevation,
      timeOfDay: sky.timeOfDay,
    });
  }
}
