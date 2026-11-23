import * as THREE from 'three';

/**
 * AAA Hybrid 3D-Relief & Multi-Biome Photographic Terrain Shader.
 * Combines our real 3D sculpted terrain topography (shoreline gravel berms, forest hummocks, rocky ledges)
 * and deep 3D normal/roughness micro-relief with photographic Japanese forest floor & autumn hillside
 * color detail — so the 3D-modeled pebbles, 3D grass blades, 3D ferns, and 3D curled Momiji leaves
 * embed seamlessly into a rich, living earth bed (zero bare grey clay floor!).
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
    normalScale: new THREE.Vector2(0.72, 0.72),
    roughness: 0.90,
    metalness: 0.0,
  });

  if (mat.normalMap) {
    mat.normalMap.wrapS = mat.normalMap.wrapT = THREE.RepeatWrapping;
    mat.normalMap.repeat.set(56, 56);
    mat.normalMap.anisotropy = 8;
  }

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
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
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

        // 1. Rich Photographic Forest Floor Bed under our 3D stones, 3D grass blades & 3D curled leaves
        vec3 campFloor = sampleNatural(uGroundMap, wp, 0.34, 0.17);
        float mossPatch = smoothstep(0.52, 0.80, macroN);
        campFloor = mix(campFloor, campFloor * vec3(0.90, 1.14, 0.80), mossPatch * 0.38);

        // 2. Warm Sunlit Golden-Ochre Sandy & Volcanic Gravel Shoreline along Lake Motosuko edge
        float shoreBand = 1.0 - smoothstep(0.28, 1.08, wy + (macroN - 0.5) * 0.32);
        vec3 warmSand = mix(vec3(0.56, 0.44, 0.28), vec3(0.36, 0.29, 0.21), tNoise(wp * 1.4));
        vec3 shoreCol = mix(campFloor * vec3(1.20, 1.08, 0.90), warmSand, 0.60);
        float wetMask = 1.0 - smoothstep(0.02, 0.28, wy);
        shoreCol *= mix(1.0, 0.56, wetMask);

        // 3. Lush Vibrant Japanese Autumn Mountain Hillside Tapestry behind camp
        vec3 hillCol = sampleNatural(uHillsideMap, wp, 0.068, 0.032);
        float autumnWave = tNoise(wp * 0.042 + vec2(2.1, -1.4));
        hillCol *= mix(vec3(0.96, 1.02, 0.88), vec3(1.24, 1.04, 0.86), autumnWave);

        // 4. Natural exposed rocky scree pockets on very steep slopes
        float screeMask = smoothstep(0.42, 0.64, slope + (macroN - 0.5) * 0.14) * smoothstep(3.2, 6.5, wy);
        vec3 screeCol = vec3(0.42, 0.37, 0.31) * (0.78 + 0.44 * tNoise(wp * 1.8));

        float hillBlend = smoothstep(1.55, 3.6, wy + (macroN - 0.5) * 1.05);
        vec3 finalAlbedo = mix(campFloor, shoreCol, shoreBand);
        finalAlbedo = mix(finalAlbedo, hillCol, hillBlend);
        finalAlbedo = mix(finalAlbedo, screeCol, screeMask * 0.68);

        diffuseColor.rgb = finalAlbedo;
        `
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float wetShoreR = 1.0 - smoothstep(0.02, 0.26, vTerrainWorldPos.y);
        roughnessFactor = mix(roughnessFactor, 0.18, wetShoreR);`
      );
  };

  return mat;
}
