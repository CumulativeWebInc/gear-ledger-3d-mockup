/* earth.js — digital-age Earth frame: world ocean + abstract continent plates.
 *
 * Twenty Minds decision (2026-09-17, founding-city-prime-20minds.md): the
 * world is INSPIRED BY Earth's geography — never a replica. Continent shapes
 * here are PROCEDURAL ABSTRACT LANDFORMS (seeded blobs), not traced from
 * real coastlines: no map tiles, no licensed data, no real addresses, no
 * political boundaries, no human likenesses. Names are neutral geographic
 * descriptors. $0, dependency-free. Imported by index.html AND by
 * tests/earth.test.mjs — one source of truth.
 */

export const WORLD_OCEAN = { size: 2600, y: -0.6, color: 0x06121e };

/* Neutral landmass descriptors. Positions are world units on the ocean plane;
 * the home waters (hub + districts) sit at the origin, continents on the rim. */
export const CONTINENTS = [
  { id: 'nc', name: 'Northern Landmass', cx: 170,  cz: -430, r: 150, seed: 'nc-v1', lobes: 5 },
  { id: 'wc', name: 'Western Landmass',  cx: -460, cz: -140, r: 170, seed: 'wc-v1', lobes: 6 },
  { id: 'ec', name: 'Eastern Landmass',  cx: 480,  cz: 120,  r: 160, seed: 'ec-v1', lobes: 5 },
  { id: 'sc', name: 'Southern Landmass', cx: -80,  cz: 470,  r: 190, seed: 'sc-v1', lobes: 7 },
  { id: 'np', name: 'North Polar Cap',   cx: 40,   cz: -700, r: 110, seed: 'np-v1', lobes: 4 },
  { id: 'sp', name: 'South Polar Cap',   cx: -260, cz: 700,  r: 120, seed: 'sp-v1', lobes: 4 },
];

export const PLATE = { height: 2.5, y: 0.2, color: 0x0e1a26, coast: 0x35c4ff };
export const BEACONS_PER_CONTINENT = 3;

/* Deterministic hashing + PRNG (same family as constructPlan in stage-logic). */
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Abstract continent outline: N-gon whose radius is modulated by two seeded
 * sine lobes — organic but clearly stylized, never a real coastline. */
export function continentPolygon(def, n = 20) {
  const rnd = mulberry32(fnv1a(def.seed));
  const p1 = rnd() * Math.PI * 2, p2 = rnd() * Math.PI * 2;
  const a1 = 0.16 + rnd() * 0.14, a2 = 0.08 + rnd() * 0.10;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const wob = 1 + a1 * Math.sin(def.lobes * t + p1) + a2 * Math.sin(2 * t + p2);
    const rr = def.r * wob;
    pts.push([def.cx + Math.cos(t) * rr, def.cz + Math.sin(t) * rr * 0.82]);
  }
  return pts;
}

/* "Survey beacons" — dim markers for future city sites. Deterministic,
 * interior to the landmass (rejection sample inside 0.55r of an ellipse). */
export function surveyBeacons(def, count = BEACONS_PER_CONTINENT) {
  const rnd = mulberry32(fnv1a(def.seed + ':beacons'));
  const out = [];
  let guard = 0;
  while (out.length < count && guard++ < 200) {
    const t = rnd() * Math.PI * 2, k = Math.sqrt(rnd()) * 0.55;
    out.push({
      id: def.id + '-sv' + out.length,
      x: def.cx + Math.cos(t) * def.r * k,
      z: def.cz + Math.sin(t) * def.r * k * 0.82,
    });
  }
  return out;
}

/* Full Earth frame plan: ocean + plates (with polygons) + beacons. Pure data. */
export function earthPlan() {
  return {
    ocean: { ...WORLD_OCEAN },
    plates: CONTINENTS.map((def) => ({
      ...def,
      polygon: continentPolygon(def),
      beacons: surveyBeacons(def),
    })),
  };
}

/* Names that must never appear in world copy: real places, politics, replica claims. */
export const BANNED_TOKENS = [
  'replica', 'post-human', 'posthuman',
  'america', 'europe', 'asia', 'africa', 'antarctica',
  'usa', 'china', 'russia', 'ukraine', 'israel', 'palestine',
  'country', 'nation', 'border', 'capital city',
];
export function worldCopyClean(text) {
  const t = String(text).toLowerCase();
  return BANNED_TOKENS.filter((tok) => t.includes(tok));
}
