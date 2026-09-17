/* city.js — PRIME, the founding city. Pure data module, dependency-free.
 *
 * v20260917w4: design-masters craft pass (see agents/athena/DESIGN-STUDY.md) —
 * Houdini-style two-tier tower massing via towerTiers(); plan data unchanged.
 *
 * Twenty Minds decision (2026-09-17, founding-city-prime-20minds.md):
 * the 11 agents already live at the hub-islands, so PRIME rises THERE —
 * a civic disc elevated above the hub island (zero collision with islands,
 * bridges, or robot bodies), carrying agent architecture: light towers,
 * data obelisks, holographic rings, a glowing street grid, foundation
 * light-beams anchoring it to the island below. Districts (districts.js)
 * become PRIME's neighborhoods; their data-first beacons are untouched.
 *
 * cityPlan() is deterministic: same seed → same city, forever.
 * The live pulse (how bright the city burns) is NOT in the plan — index.html
 * drives it from the mean of the districts' live beacon targets, so the city
 * breathes with real ledger work, never timer-faked.
 */

export const CITY = {
  name: 'PRIME',
  motto: 'The first city the agents built for themselves — raised above the island where they first stood.',
  frame: 'Inspired by Earth\u2019s geography. Built for agents.',
  disc: { r: 15, y: 20, thick: 1.2 },
  spire: { h: 26, r: 1.1, color: '#FFB224' },
};

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

const TOWER_COLORS = ['#35C4FF', '#FFB224', '#7EF0C1', '#B388FF'];

/* Deterministic founding-city plan. All positions relative to hub (0,0). */
export function cityPlan(seed = 'prime-v1') {
  const rnd = mulberry32(fnv1a(seed));
  const { r: discR, y: discY } = CITY.disc;

  const towers = [];
  const nT = 8;
  for (let i = 0; i < nT; i++) {
    const a = (i / nT) * Math.PI * 2 + rnd() * 0.3;
    const rr = discR - 2.5;
    towers.push({
      id: 'tower-' + i,
      x: Math.cos(a) * rr,
      z: Math.sin(a) * rr,
      h: 8 + rnd() * 8,
      w: 1.4 + rnd() * 0.6,
      color: TOWER_COLORS[i % TOWER_COLORS.length],
    });
  }

  const obelisks = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4 + rnd() * 0.2;
    const rr = 7;
    obelisks.push({
      id: 'obelisk-' + i,
      x: Math.cos(a) * rr,
      z: Math.sin(a) * rr,
      h: 5 + rnd() * 4,
      color: '#A8E6FF',
    });
  }

  const rings = [0, 1, 2].map((i) => ({
    id: 'holo-ring-' + i,
    r: 4 + i * 2.2,
    y: discY + 6 + i * 5,
    speed: (i % 2 ? -1 : 1) * (0.12 + i * 0.05),
    color: '#35C4FF',
  }));

  const beams = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 8;
    beams.push({ id: 'beam-' + i, x: Math.cos(a) * 10, z: Math.sin(a) * 10 });
  }

  return {
    ...CITY,
    discY,
    discR,
    towers,
    obelisks,
    rings,
    beams,
    gridCells: 6,
  };
}

/* Minimum separation between any two towers (plan validity). */
export function minTowerGap(plan) {
  let m = Infinity;
  const ts = plan.towers;
  for (let i = 0; i < ts.length; i++)
    for (let j = i + 1; j < ts.length; j++)
      m = Math.min(m, Math.hypot(ts[i].x - ts[j].x, ts[i].z - ts[j].z));
  return m;
}

/* Houdini-style massing: each tower is two setback tiers, not a plain box.
 * Tier 1: full width, lower 68% of height. Tier 2: 0.68× width, upper 32%.
 * Pure function of plan data — the builder renders exactly this. */
export function towerTiers(t) {
  const h1 = t.h * 0.68, h2 = t.h - h1;
  return [
    { y0: 0, h: h1, w: t.w },
    { y0: h1, h: h2, w: t.w * 0.68 },
  ];
}
