/**
 * nightcity-scene.js — Night City scene builders for the Gear Ledger 3D world.
 *
 * Consumes the pure plan from ./nightcity.js (nightCityPlan / signagePlan) and
 * builds the actual three.js scene graph. Browser-only ESM; receives THREE as a
 * parameter (keeps it testable) and imports only the plan constants/helpers.
 *
 * Perf discipline (no bloom pass, no planar reflections, no per-sign point
 * lights): shared materials/textures everywhere, InstancedMesh for skyline /
 * trunks / cars, additive sprites only where they read as neon.
 *
 * Mode honesty: the holo-ring badge and blade textures call env.getMode() at
 * build time; setRingBadge(mode) re-bakes the ring badge on demand so the
 * live-upgrade hooks can flip SAMPLE <-> LIVE without rebuilding the scene.
 */

/* ============ imports (plan layer only; three arrives via param) ============ */
import { NIGHT_PALETTE, PERF_BUDGET, CWI_VOCAB } from './nightcity.js';

/* ============ module top-level SCREAMING_SNAKE identifiers ============ */
const TWO_PI = Math.PI * 2;
const DEG2RAD = Math.PI / 180;
const DAY_FOG = 0xcdefff;
const SAMPLE_BADGE_BG = '#FFC93C';
const SAMPLE_BADGE_FG = '#1a1206';
const LIVE_BADGE_BG = '#1F9D5C';
const LIVE_BADGE_FG = '#EAFFF3';
const STAR_COUNT_FULL = 600;
const STAR_COUNT_REDUCED = 300;
const CARS_PER_LANE_FULL = 5;
const CARS_PER_LANE_REDUCED = 3;
const SKYLINE_COUNT = 48;
const SHAFT_DEPTH = 30;
const SHAFT_TOP_Y = -2.5;
const BLADE_W = 3;
const BLADE_H = 9;
const BLADE_MOUNT_Y = 6.5; // plaza-edge vertical signs above the deck (Athena fix, 2026-09-19)
const STREET_Y = -0.5;
const STREAK_Y = -0.45;
const RING_RADIUS = 26;
const RING_HEIGHT = 7;
const RING_Y = 30;
const RING_SCROLL_SPEED = 0.02;
const RING_SPIN_SPEED = 0.05;
const FACADE_COLS = 16;
const FACADE_ROWS = 32;
const FACADE_LIT_PROB = 0.25;
const EMISSIVE_INTENSITY = 0.55;
const TRUNK_H = 5;
const TRUNK_R_TOP = 0.18;
const TRUNK_R_BOT = 0.3;
const FROND_W = 3;
const FROND_H = 1.2;
const SWAY_AMPL = 0.06;
const SWAY_FREQ = 1.2;
const CAR_W = 2.2;
const CAR_H = 0.9;
const CAR_L = 4.5;
const FLICKER_GROUP_COUNT = 3;
const STREAK_OPACITY = 0.35;
const STREAK_LENGTH = 14;
const RING_PANELS = 8;
const CAR_Y = STREET_Y + CAR_H / 2 + 0.05;

/* ============ small helpers ============ */

/** Normalize a palette value (hex number or css string) to a css color string. */
function cssOf(v) {
  if (typeof v === 'number') return '#' + v.toString(16).padStart(6, '0');
  return v;
}

/** Number-or-string palette value to a THREE.Color-ready value (pass through). */
function colOf(v) {
  return v;
}

function roundRectPath(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/* ============ main builder ============ */

/**
 * Build the Night City layer.
 * @param {object} THREE - three.js module (param, not the top-level import)
 * @param {THREE.Scene} scene
 * @param {object} env - { anims, canvasTex, glowTex, plan, signage, districtDefs,
 *                         islandById, reduced, getMode, renderer }
 * @returns {{ setNight, getStats, ringTex, setRingBadge }}
 */
export function buildNightCity(THREE, scene, env) {
  const anims = env.anims;
  const canvasTex = env.canvasTex;
  const glowTex = env.glowTex;
  const plan = env.plan || {};
  const signage = env.signage || [];
  const districtDefs = env.districtDefs || [];
  const islandById = env.islandById || {};
  const reduced = !!env.reduced;
  const readMode = (typeof env.getMode === 'function') ? env.getMode : () => 'SAMPLE';

  let nightK = 1; // 0 = day, 1 = full night

  const dummy = new THREE.Object3D();

  /* ============================================================
     1. nightSky — background, fog, stars
     ============================================================ */
  function nightSky() {
    scene.background = new THREE.Color(colOf(NIGHT_PALETTE.skyTop));
    scene.fog = new THREE.Fog(colOf(NIGHT_PALETTE.fog), 120, 420);

    const starCount = reduced ? STAR_COUNT_REDUCED : STAR_COUNT_FULL;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      // random point on sphere shell r 500..700
      const u = Math.random() * 2 - 1;
      const a = Math.random() * TWO_PI;
      const r = 500 + Math.random() * 200;
      const s = Math.sqrt(1 - u * u);
      positions[i * 3] = r * s * Math.cos(a);
      positions[i * 3 + 1] = Math.abs(r * u) * 0.9 + 20; // upper hemisphere bias
      positions[i * 3 + 2] = r * s * Math.sin(a);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false,
      transparent: true, opacity: 0.9, depthWrite: false
    });
    const stars = new THREE.Points(geo, mat);
    stars.frustumCulled = false;
    scene.add(stars);
  }

  /* ============================================================
     2. wetStreet — dark asphalt with neon lane lines + puddle speckle
     ============================================================ */
  function wetStreet() {
    const asphaltCss = cssOf(NIGHT_PALETTE.asphalt);
    const keyCss = cssOf(NIGHT_PALETTE.keyOrange);
    const tealCss = cssOf(NIGHT_PALETTE.fillTeal);
    const streetTex = canvasTex(1024, 1024, (g, w, h) => {
      // base asphalt
      g.fillStyle = asphaltCss;
      g.fillRect(0, 0, w, h);
      // tonal noise patches
      for (let i = 0; i < 260; i++) {
        const x = Math.random() * w, y = Math.random() * h, r = 6 + Math.random() * 30;
        g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.022)' : 'rgba(0,0,0,0.05)';
        g.beginPath(); g.arc(x, y, r, 0, TWO_PI); g.fill();
      }
      // lane dashes: orange center lines + teal edge lines
      g.fillStyle = keyCss;
      for (let x = 64; x < w; x += 256) {
        for (let y = 0; y < h; y += 64) g.fillRect(x - 3, y, 6, 34);
      }
      g.fillStyle = tealCss;
      for (let y = 96; y < h; y += 256) {
        for (let x = 0; x < w; x += 64) g.fillRect(x, y - 3, 34, 6);
      }
      // puddle-noise speckles (wet highlights)
      for (let i = 0; i < 900; i++) {
        const x = Math.random() * w, y = Math.random() * h;
        const a = 0.03 + Math.random() * 0.10;
        g.fillStyle = `rgba(150,210,235,${a.toFixed(3)})`;
        g.fillRect(x, y, 1 + Math.random() * 3, 1 + Math.random() * 2);
      }
    }, { repeat: true });
    streetTex.repeat.set(4, 4);
    const mat = new THREE.MeshStandardMaterial({
      color: colOf(NIGHT_PALETTE.asphalt),
      roughness: 0.32,
      metalness: 0.55,
      map: streetTex
    });
    const street = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mat);
    street.rotation.x = -Math.PI / 2;
    street.position.y = STREET_Y;
    street.receiveShadow = false;
    scene.add(street);
  }

  /* ============ shared window-facade texture (emissive windows) ============ */
  function facadeTexture() {
    const massCss = cssOf(NIGHT_PALETTE.mass);
    const keyCss = cssOf(NIGHT_PALETTE.keyOrange);
    const tealCss = cssOf(NIGHT_PALETTE.fillTeal);
    return canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = massCss;
      g.fillRect(0, 0, w, h);
      const cw = w / FACADE_COLS, ch = h / FACADE_ROWS;
      for (let cx = 0; cx < FACADE_COLS; cx++) {
        for (let cy = 0; cy < FACADE_ROWS; cy++) {
          const x = cx * cw + cw * 0.22, y = cy * ch + ch * 0.24;
          const ww = cw * 0.56, hh = ch * 0.52;
          if (Math.random() < FACADE_LIT_PROB) {
            g.fillStyle = Math.random() < 0.5 ? keyCss : tealCss;
            g.globalAlpha = 0.55 + Math.random() * 0.45;
          } else {
            g.fillStyle = '#05070a';
            g.globalAlpha = 1;
          }
          g.fillRect(x, y, ww, hh);
        }
      }
      g.globalAlpha = 1;
    }, { repeat: true });
  }

  /* ============================================================
     3. towerShafts — dark under-city towers with lit window grids
     ============================================================ */
  function towerShafts() {
    const facadeTex = facadeTexture();
    const shaftMat = new THREE.MeshStandardMaterial({
      color: colOf(NIGHT_PALETTE.mass),
      roughness: 0.85,
      metalness: 0.05,
      emissive: 0xffffff,
      emissiveIntensity: EMISSIVE_INTENSITY,
      emissiveMap: facadeTex
    });
    const seen = new Set();
    const spots = [];
    for (const d of districtDefs) {
      const key = `d:${d.id}:${Math.round(d.x)}:${Math.round(d.z)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      spots.push({ x: d.x, z: d.z, w: (d.r || 10) * 1.7, id: `blade:${d.id}` });
    }
    for (const id of Object.keys(islandById)) {
      const isl = islandById[id];
      const cfg = isl && isl.cfg;
      if (!cfg) continue;
      const key = `i:${id}:${Math.round(cfg.x)}:${Math.round(cfg.z)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const sx = cfg.sx || 1;
      spots.push({ x: cfg.x, z: cfg.z, w: (cfg.r || 10) * sx * 1.7, id: `blade:island:${id}` });
    }
    for (const s of spots) {
      const geo = new THREE.BoxGeometry(s.w, SHAFT_DEPTH, s.w);
      const shaft = new THREE.Mesh(geo, shaftMat);
      shaft.position.set(s.x, SHAFT_TOP_Y - SHAFT_DEPTH / 2, s.z);
      shaft.userData.bladeAnchorId = s.id;
      shaft.userData.bladeX = s.x;
      shaft.userData.bladeZ = s.z;
      scene.add(shaft);
    }
    return spots; // blade anchors
  }

  /* ============================================================
     4. skylineRing — instanced silhouette ring with lit windows (1 draw call)
     ============================================================ */
  function skylineRing() {
    const skyline = (plan.skyline || []).slice(0, SKYLINE_COUNT);
    if (skyline.length === 0) return;
    const tex = facadeTexture();
    const mat = new THREE.MeshBasicMaterial({ color: 0x05080c, map: tex });
    // NOTE: MeshBasicMaterial has no emissive slot; the map carries the lit
    // windows and the near-black base color keeps the silhouette dark. The
    // map multiplies color, so windows read dim — brighten via a white base
    // and rely on fog for depth instead.
    mat.color.set(0xffffff);
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0); // pivot at base
    const inst = new THREE.InstancedMesh(geo, mat, skyline.length);
    inst.frustumCulled = false;
    for (let i = 0; i < skyline.length; i++) {
      const b = skyline[i];
      dummy.position.set(b.x, STREET_Y, b.z);
      dummy.scale.set(b.w || 10, b.h || 30, b.d || 10);
      dummy.rotation.set(0, b.rotY || 0, 0);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    scene.add(inst);
  }

  /* ============================================================
     5. neonBlades — vertical district blade signs + glow sprites
     ============================================================ */
  const flickerGroups = [[], [], []]; // 3 shared flicker phases

  function bladeTexture(text, accentCss) {
    return canvasTex(256, 768, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      // dark housing
      g.fillStyle = 'rgba(6,10,14,0.92)';
      roundRectPath(g, 14, 14, w - 28, h - 28, 26);
      g.fill();
      // neon border
      g.strokeStyle = accentCss;
      g.lineWidth = 5;
      g.shadowColor = accentCss;
      g.shadowBlur = 22;
      roundRectPath(g, 14, 14, w - 28, h - 28, 26);
      g.stroke();
      // vertical text (rotated -90deg, reading bottom-up)
      g.save();
      g.translate(w / 2, h / 2);
      g.rotate(-Math.PI / 2);
      g.font = '900 64px "Arial Black", Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = accentCss;
      g.shadowColor = accentCss;
      g.shadowBlur = 30;
      g.fillText(text, 0, 8, h - 120);
      g.restore();
      g.shadowBlur = 0;
    });
  }

  function neonBlades() {
    const blades = signage.length ? signage : districtDefs.map((d) => ({
      districtId: d.id,
      heroBlade: { text: d.name || d.id, accent: d.accent },
      wallSigns: []
    }));
    blades.forEach((b, i) => {
      const d = districtDefs.find((dd) => dd.id === b.districtId);
      if (!d) return;
      const accentCss = cssOf((b.heroBlade && b.heroBlade.accent) || d.accent || NIGHT_PALETTE.neonPink);
      const text = (b.heroBlade && b.heroBlade.text) || d.name || d.id;

      const tex = bladeTexture(text, accentCss);
      const mat = new THREE.MeshBasicMaterial({
        map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false
      });
      const blade = new THREE.Mesh(new THREE.PlaneGeometry(BLADE_W, BLADE_H), mat);

      // perpendicular to radial dir: normal faces tangentially
      const rl = Math.hypot(d.x, d.z) || 1;
      const rx = d.x / rl, rz = d.z / rl;
      const tx = -rz, tz = rx;
      blade.rotation.y = Math.atan2(tx, tz);
      blade.position.set(d.x, BLADE_MOUNT_Y, d.z);
      scene.add(blade);

      // additive glow sprite behind the blade
      const smat = new THREE.SpriteMaterial({
        map: glowTex(accentCss),
        color: accentCss,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      smat.userData.base = 0.5;
      const glow = new THREE.Sprite(smat);
      glow.scale.set(8, 16, 1);
      glow.position.set(d.x - tx * 0.8, BLADE_MOUNT_Y, d.z - tz * 0.8);
      scene.add(glow);

      // round-robin into 3 shared flicker phases
      flickerGroups[i % FLICKER_GROUP_COUNT].push(smat);
    });

    // shared flicker tick: only glow sprites flicker, blades stay steady
    anims.push((t) => {
      for (let gi = 0; gi < FLICKER_GROUP_COUNT; gi++) {
        const o = 0.80 + 0.20 * Math.sin(t * (6 + gi) + gi * 2.4);
        for (const m of flickerGroups[gi]) m.opacity = m.userData.base * o;
      }
    });
  }

  /* ============================================================
     6. holoRing — rotating ad cylinder with mode-honest badge
     ============================================================ */
  let ringTex = null;
  let ringCanvas = null;

  function drawRing(mode) {
    const products = (CWI_VOCAB && CWI_VOCAB.products) || ['Signal Boy', 'Gear Ledger'];
    const verbs = (CWI_VOCAB && CWI_VOCAB.verbs) || ['EQUIP', 'VERIFY'];
    const live = mode === 'LIVE';
    return (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const pw = w / RING_PANELS;
      for (let p = 0; p < RING_PANELS; p++) {
        const x0 = p * pw;
        const accent = p % 2 === 0 ? cssOf(NIGHT_PALETTE.neonPink) : cssOf(NIGHT_PALETTE.neonViolet);
        // panel frame
        g.strokeStyle = accent;
        g.globalAlpha = 0.85;
        g.lineWidth = 3;
        g.strokeRect(x0 + 6, 8, pw - 12, h - 16);
        // product + verb
        g.globalAlpha = 1;
        g.fillStyle = '#ffffff';
        g.font = '900 44px "Arial Black", Arial, sans-serif';
        g.textAlign = 'center';
        g.fillText(products[p % products.length].toUpperCase(), x0 + pw / 2, 92, pw - 40);
        g.fillStyle = accent;
        g.font = '700 34px Arial, sans-serif';
        g.fillText(verbs[p % verbs.length].toUpperCase(), x0 + pw / 2, 148, pw - 40);
        // badge — redrawn from the live mode, never hardcoded
        g.fillStyle = live ? LIVE_BADGE_BG : SAMPLE_BADGE_BG;
        roundRectPath(g, x0 + pw / 2 - 78, 172, 156, 52, 26);
        g.fill();
        g.fillStyle = live ? LIVE_BADGE_FG : SAMPLE_BADGE_FG;
        g.font = '800 30px Arial, sans-serif';
        g.fillText(mode, x0 + pw / 2, 208);
      }
    };
  }

  function holoRing() {
    const ringPos = plan.holoRing || { x: 0, z: 0, y: RING_Y, radius: RING_RADIUS };
    const mode = readMode();
    const tex = canvasTex(2048, 256, drawRing(mode), { repeat: true });
    ringTex = tex;
    // keep a handle on the canvas so setRingBadge can re-bake without reallocating
    ringCanvas = tex.image;

    const mat = new THREE.MeshBasicMaterial({
      map: ringTex,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(ringPos.radius, ringPos.radius, RING_HEIGHT, 64, 1, true),
      mat
    );
    ring.position.set(ringPos.x || 0, ringPos.y || RING_Y, ringPos.z || 0);
    scene.add(ring);

    anims.push((t, dt) => {
      ringTex.offset.x -= dt * RING_SCROLL_SPEED;
      ring.rotation.y += dt * RING_SPIN_SPEED;
    });
  }

  /** Re-bake the ring badge for a new mode (called by live-upgrade hooks). */
  function setRingBadge(mode) {
    if (!ringTex || !ringCanvas) return;
    const g = ringCanvas.getContext('2d');
    drawRing(mode)(g, ringCanvas.width, ringCanvas.height);
    ringTex.needsUpdate = true;
  }

  /* ============================================================
     7. dataPalms — instanced trunks + per-palm swaying fronds
     ============================================================ */
  function frondTexture() {
    return canvasTex(128, 64, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      // frond blades: teal-green strokes with bright tips
      for (let i = 0; i < 9; i++) {
        const y0 = h - 4;
        const x0 = 8 + i * ((w - 16) / 8);
        const tipX = x0 + (Math.random() - 0.5) * 18;
        const tipY = 6 + Math.random() * 10;
        const grad = g.createLinearGradient(x0, y0, tipX, tipY);
        grad.addColorStop(0, cssOf(NIGHT_PALETTE.fillTeal));
        grad.addColorStop(1, '#eafff7');
        g.strokeStyle = grad;
        g.lineWidth = 5;
        g.beginPath();
        g.moveTo(x0, y0);
        g.quadraticCurveTo(x0 + (tipX - x0) * 0.5, (y0 + tipY) / 2 + 8, tipX, tipY);
        g.stroke();
      }
    });
  }

  function dataPalms() {
    const palms = plan.palms || [];
    if (palms.length === 0) return;
    const frondTex = frondTexture();

    // trunks: one instanced draw
    const trunkGeo = new THREE.CylinderGeometry(TRUNK_R_TOP, TRUNK_R_BOT, TRUNK_H, 7);
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x0a0e12, roughness: 0.9, metalness: 0.1
    });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palms.length);
    trunks.frustumCulled = false;

    const frondMat = new THREE.MeshBasicMaterial({
      map: frondTex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, depthWrite: false
    });
    const frondGeo = new THREE.PlaneGeometry(FROND_W, FROND_H);
    const sway = [];

    palms.forEach((p, i) => {
      const s = p.s || 1;
      dummy.position.set(p.x, STREET_Y + (TRUNK_H * s) / 2, p.z);
      dummy.scale.set(s, s, s);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);

      // frond crown: 2 crossed planes in a swaying group
      const crown = new THREE.Group();
      crown.position.set(p.x, STREET_Y + TRUNK_H * s, p.z);
      crown.scale.setScalar(s);
      const f1 = new THREE.Mesh(frondGeo, frondMat);
      const f2 = new THREE.Mesh(frondGeo, frondMat);
      f2.rotation.y = Math.PI / 2;
      f1.position.y = 0.4; f2.position.y = 0.4;
      crown.add(f1, f2);
      scene.add(crown);
      sway.push({ crown, phase: Math.random() * TWO_PI });
    });
    trunks.instanceMatrix.needsUpdate = true;
    scene.add(trunks);

    anims.push((t) => {
      for (const s of sway) {
        s.crown.rotation.z = SWAY_AMPL * Math.sin(t * SWAY_FREQ + s.phase);
        s.crown.rotation.x = SWAY_AMPL * 0.6 * Math.cos(t * SWAY_FREQ * 0.9 + s.phase);
      }
    });
  }

  /* ============================================================
     8. traffic — instanced cars looping the lanes + glow sprites
     ============================================================ */
  function traffic() {
    const lanes = plan.lanes || [];
    if (lanes.length === 0) return;
    const perLane = reduced ? CARS_PER_LANE_REDUCED : CARS_PER_LANE_FULL;

    // precompute loop geometry per lane
    const loops = lanes.map((lane) => {
      const pts = lane.pts || [];
      const segs = [];
      let total = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 0.001;
        segs.push({ a, b, len, start: total });
        total += len;
      }
      return { segs, total, dir: lane.dir === -1 ? -1 : 1 };
    });

    function sampleOn(loop, dist, out) {
      const d = ((dist % loop.total) + loop.total) % loop.total;
      let seg = loop.segs[loop.segs.length - 1];
      for (const s of loop.segs) {
        if (d >= s.start && d <= s.start + s.len) { seg = s; break; }
      }
      const f = (d - seg.start) / seg.len;
      out.x = seg.a[0] + (seg.b[0] - seg.a[0]) * f;
      out.z = seg.a[1] + (seg.b[1] - seg.a[1]) * f;
      out.yaw = Math.atan2(seg.b[0] - seg.a[0], seg.b[1] - seg.a[1]);
      return out;
    }

    const cars = [];
    for (let li = 0; li < loops.length; li++) {
      const loop = loops[li];
      for (let c = 0; c < perLane; c++) {
        cars.push({
          loop,
          dist: (loop.total / perLane) * c,
          speed: (10 + Math.random() * 8) * loop.dir
        });
      }
    }

    const carGeo = new THREE.BoxGeometry(CAR_W, CAR_H, CAR_L);
    const carMat = new THREE.MeshStandardMaterial({
      color: 0x0b0f14, roughness: 0.4, metalness: 0.6
    });
    const carMesh = new THREE.InstancedMesh(carGeo, carMat, cars.length);
    carMesh.frustumCulled = false;
    scene.add(carMesh);

    const headTex = glowTex(cssOf(NIGHT_PALETTE.anchorWhite));
    const tailTex = glowTex(cssOf(NIGHT_PALETTE.neonPink));
    const headMat = new THREE.SpriteMaterial({
      map: headTex, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const tailMat = new THREE.SpriteMaterial({
      map: tailTex, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const pos = { x: 0, z: 0, yaw: 0 };
    for (const car of cars) {
      const head = new THREE.Sprite(headMat);
      head.scale.set(2.2, 1.1, 1);
      const tail = new THREE.Sprite(tailMat);
      tail.scale.set(1.8, 0.9, 1);
      scene.add(head, tail);
      car.head = head;
      car.tail = tail;
    }

    anims.push((t, dt) => {
      for (let i = 0; i < cars.length; i++) {
        const car = cars[i];
        car.dist += car.speed * dt;
        sampleOn(car.loop, car.dist, pos);
        dummy.position.set(pos.x, CAR_Y, pos.z);
        dummy.rotation.set(0, pos.yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        carMesh.setMatrixAt(i, dummy.matrix);
        const fx = Math.sin(pos.yaw), fz = Math.cos(pos.yaw);
        car.head.position.set(pos.x + fx * (CAR_L / 2 + 0.3), CAR_Y, pos.z + fz * (CAR_L / 2 + 0.3));
        car.tail.position.set(pos.x - fx * (CAR_L / 2 + 0.3), CAR_Y, pos.z - fz * (CAR_L / 2 + 0.3));
      }
      carMesh.instanceMatrix.needsUpdate = true;
    });
  }

  /* ============================================================
     9. reflectionStreaks — additive neon streaks on the street
     ============================================================ */
  function reflectionStreaks() {
    // shared vertical gradient: bright top fading down, tinted per district
    const streakTex = canvasTex(64, 256, (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, 'rgba(255,255,255,0.95)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.28)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    });
    for (const d of districtDefs) {
      const accentCss = cssOf(d.accent || NIGHT_PALETTE.neonPink);
      const mat = new THREE.MeshBasicMaterial({
        map: streakTex,
        color: accentCss,
        transparent: true,
        opacity: STREAK_OPACITY,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const streak = new THREE.Mesh(new THREE.PlaneGeometry(BLADE_W, STREAK_LENGTH), mat);
      streak.rotation.x = -Math.PI / 2;
      // radial orientation: streak runs outward from under the blade
      const rl = Math.hypot(d.x, d.z) || 1;
      const rx = d.x / rl, rz = d.z / rl;
      streak.rotation.z = Math.atan2(rx, rz) + Math.PI / 2;
      streak.position.set(d.x + rx * (STREAK_LENGTH / 2 - 1), STREAK_Y, d.z + rz * (STREAK_LENGTH / 2 - 1));
      scene.add(streak);
    }
  }

  /* ============ build order ============ */
  nightSky();
  wetStreet();
  towerShafts();
  skylineRing();
  neonBlades();
  holoRing();
  dataPalms();
  traffic();
  reflectionStreaks();

  /* ============================================================
     10. setNight / getStats
     ============================================================ */
  const _fogDay = new THREE.Color(DAY_FOG);
  const _fogNight = new THREE.Color(colOf(NIGHT_PALETTE.fog));

  /**
   * Blend between day and night. Returns k; hemi.intensity stays with the
   * integration layer.
   */
  function setNight(k) {
    nightK = Math.max(0, Math.min(1, k));
    if (scene.fog) {
      scene.fog.color.copy(_fogDay).lerp(_fogNight, nightK);
    }
    return nightK;
  }

  function getStats() {
    const r = env.renderer;
    if (!r || !r.info || !r.info.render) return { drawCalls: -1, tris: -1 };
    return { drawCalls: r.info.render.calls, tris: r.info.render.triangles };
  }

  return { setNight, getStats, ringTex, setRingBadge };
}
