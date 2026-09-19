/* nightcity.js — Night City redesign plan (dependency-free).
 *
 * Pure data + logic for the night-time Gear Ledger 3D world: performance
 * budget, night palette, CWI sign vocabulary, deterministic city layout,
 * district signage plan, and a validator the scene-builder worker runs
 * before it touches the scene graph.
 *
 * No imports, no Math.random, no Date — mulberry32 is the only entropy
 * source, so the same seed always yields the same plan. Imported by
 * index.html AND by tests/nightcity.test.mjs, so the shipped page and the
 * test battery share one source of truth.
 */

/* ------------------------------------------------------------------ */
/* Performance budget. The scene builder must stay inside these lines. */
/* ------------------------------------------------------------------ */
export const PERF_BUDGET = {
  drawCallsMax: 100,
  drawCallsHard: 150,
  trisMax: 300000,
  texCountMax: 40,
  texVramMaxMB: 96,
  maxTexSize: 2048,
  shadowLightsMax: 1,
  postPasses: 0,          /* no post-processing passes — night look is baked into materials */
  dprCap: 1.5,
  realtimeLights: 2,
  frameBudgetMs: 10,
};

/* ------------------------------------------------------------------ */
/* Night palette — all hex ints, one source for the scene builder.     */
/* ------------------------------------------------------------------ */
export const NIGHT_PALETTE = {
  skyTop: 0x060a10,
  skyHor: 0x0b1e26,
  fog: 0x0b1e26,
  keyOrange: 0xff9a3c,
  fillTeal: 0x35c4ff,
  neonPink: 0xff3df0,
  neonViolet: 0xb388ff,
  mass: 0x0a0e14,
  anchorWhite: 0xf5f7fa,
  asphalt: 0x0b0e13,
  gold: 0xffb224,
};

/* ------------------------------------------------------------------ */
/* Sign vocabulary. Sign copy may ONLY use these strings plus district  */
/* / agent names passed in — NEVER any third-party brand name. Studied */
/* as masters, never named in-world: no Ubisoft, no CD Projekt Red,     */
/* no Cyberpunk, no Watch Dogs.                                         */
/* ------------------------------------------------------------------ */
export const CWI_VOCAB = {
  products: ['SIGNAL BOY', 'GEAR LEDGER', 'CHAIN-OF-TITLE COMPASS'],
  verbs: ['TRACK', 'HANDOFF', 'VERIFY'],
  tagline: 'CWI · AGENT DECK',
  house: ['CUMULATIVE WEB INC'],
};

/* Forbidden substrings (uppercase scan) — third-party brands and their
 * signature titles. Module-private: the validator is the enforcement path. */
const FORBIDDEN_BRANDS = ['UBISOFT', 'CD PROJEKT', 'CYBERPUNK', 'WATCH DOGS', 'ASSASSIN'];

/* Seeded PRNG: mulberry32. Returns function () => [0,1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r2 = (v) => Math.round(v * 100) / 100; /* stable rounding for deep-equal plans */

/**
 * Deterministic night-city layout for a seed.
 * @param {number} seed
 * @returns {{seed:number, skyline:Array, palms:Array, lanes:Array, holoRing:Object, towerShaft:Object}}
 *   skyline: 48 towers on a ring, r 150–280, heights 40–110
 *   palms: 24 street-level palms along the avenues x/z = ±30, ±90
 *   lanes: 4 traffic loop rectangles, alternating direction
 *   holoRing: fixed holo anchor over the origin
 *   towerShaft: central tower excavation spec
 */
export function nightCityPlan(seed) {
  const rng = mulberry32(seed);

  const skyline = [];
  for (let i = 0; i < 48; i++) {
    const ang = (i / 48) * Math.PI * 2 + (rng() - 0.5) * 0.08;
    const r = 150 + rng() * 130;
    skyline.push({
      x: r2(Math.cos(ang) * r),
      z: r2(Math.sin(ang) * r),
      w: r2(8 + rng() * 14),
      d: r2(8 + rng() * 14),
      h: r2(40 + rng() * 70),
      rotY: r2(rng() * Math.PI),
    });
  }

  /* 8 avenue lines × 3 palms = 24, all at street level (y = 0). */
  const avenues = [
    { fixed: 'x', c: -90 }, { fixed: 'x', c: -30 },
    { fixed: 'x', c: 30 }, { fixed: 'x', c: 90 },
    { fixed: 'z', c: -90 }, { fixed: 'z', c: -30 },
    { fixed: 'z', c: 30 }, { fixed: 'z', c: 90 },
  ];
  const palms = [];
  for (const av of avenues) {
    for (let k = 0; k < 3; k++) {
      const t = -60 + k * 60 + (rng() - 0.5) * 20;
      palms.push({
        x: r2(av.fixed === 'x' ? av.c : t),
        z: r2(av.fixed === 'x' ? t : av.c),
        s: r2(0.8 + rng() * 0.6),
      });
    }
  }

  /* 4 traffic loops — rectangles, alternating clockwise/anticlockwise. */
  const loopRadii = [55, 100, 150, 200];
  const lanes = loopRadii.map((base, i) => {
    const hr = r2(base + (rng() - 0.5) * 16);
    return {
      pts: [[-hr, -hr], [hr, -hr], [hr, hr], [-hr, hr]],
      dir: i % 2 === 0 ? 1 : -1,
    };
  });

  return {
    seed,
    skyline,
    palms,
    lanes,
    holoRing: { x: 0, z: 0, y: 30, radius: 26 },
    towerShaft: { depth: 30, topY: -3 },
  };
}

/**
 * District signage plan. Copy is assembled ONLY from CWI_VOCAB plus the
 * district's own name/dept — deterministic in district order.
 * @param {Array<{id:string,name:string,dept?:string,accent?:string,x:number,z:number,r:number}>} districtDefs
 * @returns {Array<{districtId:string, heroBlade:{text:string,accent:string}, wallSigns:Array<{text:string}>}>}
 */
export function signagePlan(districtDefs) {
  const defs = Array.isArray(districtDefs) ? districtDefs : [];
  const { products, verbs, tagline, house } = CWI_VOCAB;
  return defs.map((d, i) => {
    const def = d || {};
    const name = String(def.name || 'DISTRICT').toUpperCase();
    const dept = String(def.dept || def.name || 'DEPARTMENT').toUpperCase();
    const product = products[i % products.length];
    const verb = verbs[i % verbs.length];
    return {
      districtId: def.id || 'district-' + i,
      heroBlade: {
        text: product + ' · ' + verb + ' · ' + name,
        accent: def.accent || '#35C4FF',
      },
      wallSigns: [
        { text: verb + ' ' + product + ' — ' + dept },
        { text: tagline + ' / ' + house[0] },
      ],
    };
  });
}

/* All sign-copy strings flattened for one blade entry. */
function bladeTexts(entry) {
  const out = [];
  if (entry && entry.heroBlade && typeof entry.heroBlade.text === 'string') out.push(entry.heroBlade.text);
  if (entry && Array.isArray(entry.wallSigns)) {
    for (const s of entry.wallSigns) {
      if (s && typeof s.text === 'string') out.push(s.text);
    }
  }
  return out;
}

/**
 * Validate a night-city plan + district roster before the scene builder
 * runs. Checks counts, ranges, holo anchor position, sign-vocabulary
 * purity (forbidden-brand scan), blade 1:1 coverage, and determinism
 * (re-run nightCityPlan(seed) must deep-equal the plan).
 *
 * @param {object} plan — nightCityPlan() output
 * @param {Array} districtDefs — the district defs passed to signagePlan()
 * @param {Array} [signage] — optional prebuilt signagePlan() output
 * @returns {Array<string>} violation messages (empty = valid)
 */
export function validateNightCity(plan, districtDefs, signage) {
  const problems = [];
  const defs = Array.isArray(districtDefs) ? districtDefs : [];

  if (!plan || typeof plan !== 'object') {
    problems.push('plan missing or not an object');
    return problems;
  }
  if (typeof plan.seed !== 'number') problems.push('plan.seed missing — determinism cannot be checked');

  /* Skyline: exact 48, ring 150–280, heights 40–110. */
  if (!Array.isArray(plan.skyline)) {
    problems.push('plan.skyline missing or not an array');
  } else {
    if (plan.skyline.length !== 48) problems.push('skyline count ' + plan.skyline.length + ', expected 48');
    plan.skyline.forEach((t, i) => {
      if (!t || typeof t !== 'object') { problems.push('skyline[' + i + '] not an object'); return; }
      const r = Math.hypot(t.x || 0, t.z || 0);
      if (!(r >= 150 && r <= 280)) problems.push('skyline[' + i + '] ring radius ' + r.toFixed(1) + ' outside 150–280');
      if (!(t.h >= 40 && t.h <= 110)) problems.push('skyline[' + i + '] height ' + t.h + ' outside 40–110');
      for (const k of ['x', 'z', 'w', 'd', 'h', 'rotY']) {
        if (typeof t[k] !== 'number') problems.push('skyline[' + i + '].' + k + ' not a number');
      }
    });
  }

  /* Palms: exact 24. Lanes: exact 4. */
  if (!Array.isArray(plan.palms) || plan.palms.length !== 24)
    problems.push('palms count ' + (plan.palms && plan.palms.length) + ', expected 24');
  if (!Array.isArray(plan.lanes) || plan.lanes.length !== 4)
    problems.push('lanes count ' + (plan.lanes && plan.lanes.length) + ', expected 4');

  /* Holo ring pinned over the origin; tower shaft spec exact. */
  const hr = plan.holoRing || {};
  if (hr.x !== 0 || hr.z !== 0) problems.push('holoRing not over origin (x=' + hr.x + ', z=' + hr.z + ')');
  if (hr.y !== 30 || hr.radius !== 26) problems.push('holoRing y/radius changed (y=' + hr.y + ', radius=' + hr.radius + ')');
  const ts = plan.towerShaft || {};
  if (ts.depth !== 30 || ts.topY !== -3) problems.push('towerShaft spec changed (depth=' + ts.depth + ', topY=' + ts.topY + ')');

  /* Signage: 1:1 with districts, vocabulary-pure. */
  const sig = signage !== undefined ? signage : signagePlan(defs);
  if (!Array.isArray(sig) || sig.length !== defs.length) {
    problems.push('blade count mismatch: ' + (sig && sig.length) + ' blades for ' + defs.length + ' districts');
  }
  defs.forEach((d, i) => {
    const entry = sig && sig[i];
    if (!entry) return; /* already flagged by the count check */
    const texts = bladeTexts(entry);
    if (texts.length !== 3) problems.push('district ' + (d.id || i) + ': expected 3 sign texts, got ' + texts.length);
    for (const text of texts) {
      const upper = text.toUpperCase();
      for (const brand of FORBIDDEN_BRANDS) {
        if (upper.includes(brand))
          problems.push('district ' + (d.id || i) + ': sign copy contains forbidden brand "' + brand + '"');
      }
    }
  });

  /* Determinism: re-running the plan from the seed must deep-equal. */
  if (typeof plan.seed === 'number') {
    const rerun = JSON.stringify(nightCityPlan(plan.seed));
    if (JSON.stringify(plan) !== rerun)
      problems.push('plan not deterministic: nightCityPlan(seed) re-run differs from plan');
  }

  return problems;
}
