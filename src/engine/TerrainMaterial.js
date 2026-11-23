import * as THREE from 'three';

/**
 * Multi-Biome Photorealistic Japanese Lakeside Terrain Material (MeshStandardMaterial + onBeforeCompile).
 * Eliminates repetitive tiling and bare grey hillsides by seamlessly splatting 4 natural biomes:
 *  1. Wet & warm sunlit golden-ochre shoreline sand/gravel along Lake Motosuko's water edge
 *  2. DSLR photographic Japanese campsite forest floor (loamy volcanic soil, fine pebbles, pine needles, moss & leaves)
 *  3. Lush vibrant Japanese autumn mountain hillside tapestry (crimson, amber, gold & olive foliage canopy)
 *  4. Exposed mountain basalt scree outcrops on steep slopes
 * Retains full Three.js PBR lighting, soft sun shadows, campfire/lantern point lights, PMREM sky IBL & fog!
 */
export function createPhotorealTerrainMaterial(baseMat) {
  const texLoader = new THREE.TextureLoader();

  const loadTileTex = (url, isColor = true) => {
    const t = texLoader.load(url);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (isColor) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };

  const groundPhoto = loadTileTex('/textures/photo_camp_ground.jpg', true);
  const hillsidePhoto = loadTileTex('/textures/photo_autumn_hillside.png', true);

  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: groundPhoto,
    normalMap: baseMat?.normalMap || null,
    normalScale: new THREE.Vector2(0.38, 0.38),
    roughness: 0.92,
    metalness: 0.0,
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGroundMap = { value: groundPhoto };
    shader.uniforms.uHillsideMap = { value: hillsidePhoto };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vTerrainWorldPos;
        varying vec3 vTerrainWorldNormal;`
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vTerrainWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vTerrainWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uGroundMap;
        uniform sampler2D uHillsideMap;
        varying vec3 vTerrainWorldPos;
        varying vec3 vTerrainWorldNormal;

        float tHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float tNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(tHash(i), tHash(i + vec2(1.0, 0.0)), f.x),
            mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), f.x),
            f.y
          );
        }
        // Anti-tiling dual-scale rotated world-space texture lookup (zero repetitive grid!)
        vec3 sampleNatural(sampler2D tex, vec2 wp, float scaleA, float scaleB) {
          vec2 uvA = wp * scaleA;
          mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
          vec2 uvB = (rot * wp) * scaleB + vec2(3.7, 1.9);
          float blend = tNoise(wp * 0.14);
          return mix(texture2D(tex, uvA).rgb, texture2D(tex, uvB).rgb, blend * 0.48);
        }`
      )
      .replace(
        '#include <map_fragment>',
        `
        vec2 wp = vTerrainWorldPos.xz;
        float wy = vTerrainWorldPos.y;
        float slope = 1.0 - clamp(vTerrainWorldNormal.y, 0.0, 1.0);
        float macroN = tNoise(wp * 0.085) * 0.65 + tNoise(wp * 0.24) * 0.35;

        // 1. Real DSLR Photographic Campsite Forest Floor (loamy earth, tiny gravel, moss, pine needles & Momiji leaves!)
        vec3 campFloor = sampleNatural(uGroundMap, wp, 0.34, 0.17);
        // Subtle organic warm/mossy dappled ground color variation so large areas never feel repetitive
        float mossPatch = smoothstep(0.54, 0.82, macroN);
        campFloor = mix(campFloor, campFloor * vec3(0.92, 1.12, 0.82), mossPatch * 0.35);

        // 2. Warm Sunlit Golden-Ochre Sandy/Gravel Shoreline along Lake Motosuko edge (matching autumn lake photo!)
        float shoreBand = 1.0 - smoothstep(0.28, 1.06, wy + (macroN - 0.5) * 0.32);
        vec3 warmSand = mix(vec3(0.58, 0.45, 0.28), vec3(0.38, 0.31, 0.22), tNoise(wp * 1.4));
        vec3 shoreCol = mix(campFloor * vec3(1.22, 1.10, 0.90), warmSand, 0.62);
        float wetMask = 1.0 - smoothstep(0.02, 0.28, wy);
        shoreCol *= mix(1.0, 0.58, wetMask);

        // 3. Lush Vibrant Japanese Autumn Mountain Hillside Tapestry behind camp (crimson, orange, gold & sunlit olive!)
        vec3 hillCol = sampleNatural(uHillsideMap, wp, 0.068, 0.032);
        float autumnWave = tNoise(wp * 0.042 + vec2(2.1, -1.4));
        hillCol *= mix(vec3(0.96, 1.02, 0.88), vec3(1.24, 1.04, 0.86), autumnWave);

        // 4. Natural exposed rocky scree pockets on very steep slopes (like reference autumn mountain photo!)
        float screeMask = smoothstep(0.42, 0.64, slope + (macroN - 0.5) * 0.14) * smoothstep(3.2, 6.5, wy);
        vec3 screeCol = vec3(0.42, 0.37, 0.31) * (0.78 + 0.44 * tNoise(wp * 1.8));

        // Combine biomes seamlessly by height & organic noise!
        float hillBlend = smoothstep(1.55, 3.6, wy + (macroN - 0.5) * 1.05);
        vec3 finalAlbedo = mix(campFloor, shoreCol, shoreBand);
        finalAlbedo = mix(finalAlbedo, hillCol, hillBlend);
        finalAlbedo = mix(finalAlbedo, screeCol, screeMask * 0.68);

        diffuseColor.rgb *= finalAlbedo;
        `
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float wetShoreR = 1.0 - smoothstep(0.02, 0.26, vTerrainWorldPos.y);
        roughnessFactor = mix(roughnessFactor, 0.22, wetShoreR);`
      );
  };

  return mat;
}
