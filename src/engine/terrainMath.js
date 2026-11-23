/**
 * Exact JS mirror of Blender's campsite_height(x, y) in terrain_fuji.py.
 * Blender (X, Y, Z) -> Three.js (X, Z, -Y), so blenderY = -threeZ.
 */
export function getTerrainHeight(x, z) {
  const y = -z; // Blender Y coordinate (+Y points toward Lake Motosuko / Mt. Fuji = Three.js -Z)
  const shoreY = 14.5 + 3.2 * Math.sin(x * 0.045) + 1.8 * Math.cos(x * 0.095 + 0.6);
  const distFromShore = shoreY - y;

  let h;
  if (distFromShore < 0) {
    h = distFromShore * 0.16 - 0.008 * (distFromShore * distFromShore);
    h = Math.max(h, -6.0);
  } else {
    const beach = Math.min(distFromShore, 8.0) * 0.11;
    const flatCamp = Math.max(0.0, Math.min(distFromShore - 8.0, 14.0)) * 0.03;
    const backHill = Math.pow(Math.max(0.0, distFromShore - 22.0), 1.38) * 0.19;
    h = beach + flatCamp + backHill;
  }

  const campR = Math.hypot(x, y - 2.0);
  const campBlend = Math.max(0.0, Math.min(1.0, (campR - 7.5) / 8.0));

  const undul =
    0.18 * Math.sin(x * 0.13 + 0.4) * Math.cos(y * 0.11) +
    0.09 * Math.sin(x * 0.31 - y * 0.27) +
    0.04 * Math.cos(x * 0.7 + y * 0.6);
  h += undul * campBlend;

  if (campR < 12.0) {
    const targetCampZ = 1.05;
    let t = Math.max(0.0, Math.min(1.0, (campR - 6.0) / 6.0));
    t = t * t * (3.0 - 2.0 * t);
    h = targetCampZ * (1.0 - t) + h * t;
  }

  return h;
}

export function getShoreZ(x) {
  return -(14.5 + 3.2 * Math.sin(x * 0.045) + 1.8 * Math.cos(x * 0.095 + 0.6));
}
