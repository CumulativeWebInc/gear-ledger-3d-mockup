/* stage-logic.js — Agent Stage pure state rules (dependency-free).
 *
 * Single source of truth for operational-state classification and presence-link
 * derivation. Imported by index.html AND by tests/stage-logic.test.mjs, so the
 * shipped page and the test battery can never drift apart.
 *
 * Rules (Black's spec, 2026-09-16):
 *  - EXECUTING: agent holds a genuine live current_task_id (not terminal work).
 *  - WAITING:   online with a fresh heartbeat, no live task.
 *  - THINKING:  current_task_id changed since the previous snapshot — fires for
 *    one refresh cycle when a change is detected, then settles to EXECUTING /
 *    WAITING on the next snapshot with no further change.
 *  - DORMANT:   heartbeat older than 30 minutes (or unparseable), or not online.
 *  - SAMPLE:    no live data at all (applied by the page, never by this module).
 *  Priority: DORMANT > THINKING > EXECUTING > WAITING.
 *  - Link pulses ONLY when: (1) two agents share the SAME non-null live task id,
 *    or (2) one agent's task title references another agent by handle or name.
 *    Never link merely because two unrelated tasks are both in progress.
 */

export const STALE_MS = 30 * 60 * 1000;
export const STATES = ['EXECUTING', 'THINKING', 'WAITING', 'DORMANT', 'SAMPLE'];

/* A held task id is "genuine" unless it positively points at terminal work.
 * Terminal states seen in the live store: cancelled, verified (=done). */
const TERMINAL_TASK_STATES = new Set(['cancelled', 'verified', 'completed', 'complete', 'failed', 'done', 'archived']);
function holdsLiveTask(rec) {
  return !!(rec && rec.current_task_id &&
    !TERMINAL_TASK_STATES.has(String(rec.current_task_state || '').toLowerCase()));
}

/**
 * Classify one agent's operational state from a live-data.json agent record.
 * @param {object|null} rec  agent row from live-data.json (agents[])
 * @param {string|null|undefined} prevTaskId  current_task_id from the previous snapshot (undefined = first snapshot)
 * @param {number} nowMs  Date.now()
 * @returns {{state:string, detail:string}}
 */
export function classifyAgent(rec, prevTaskId, nowMs) {
  if (!rec) return { state: 'DORMANT', detail: 'no live record' };
  let stale = true;
  try {
    const age = nowMs - Date.parse(rec.presence_at);
    stale = Number.isNaN(age) || age > STALE_MS;
  } catch (e) { stale = true; }
  if (rec.presence !== 'online') return { state: 'DORMANT', detail: 'presence ' + rec.presence };
  if (stale) return { state: 'DORMANT', detail: 'heartbeat stale' };
  /* THINKING wins for one cycle when the assignment changed, then settles */
  if (prevTaskId !== undefined && prevTaskId !== rec.current_task_id)
    return { state: 'THINKING', detail: 'task changed since last snapshot' };
  /* Black's rule: any genuine live current_task_id -> EXECUTING (no state-string gate) */
  if (holdsLiveTask(rec))
    return { state: 'EXECUTING', detail: String(rec.current_task_title || rec.current_task_id) };
  return { state: 'WAITING', detail: 'online' };
}

/* short public names get word-boundary matching so ordinary words
 * ("dial in", "seal the deal") don't fake a cross-agent reference */
function nameHit(title, name) {
  const n = String(name).toLowerCase();
  const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (n.length <= 4) return new RegExp('\\b' + esc + '\\b').test(title);
  return title.includes(n);
}

/**
 * Derive presence-link pairs from one live snapshot. Pure data in/out.
 * @param {Array<{agent_id:string, public_name:string}>} forms  stage forms (identity order)
 * @param {Object<string,object>} recById  live agent rows keyed by agent_id
 * @param {Array<{assigned_to:string, title:string}>} tasksRecent  live tasks_recent
 * @returns {Array<{a:string, b:string, reason:string}>}  unordered agent_id pairs
 */
export function deriveLinks(forms, recById, tasksRecent) {
  const pairs = new Map();
  /* rule 1: the SAME non-null live task id held by two agents */
  const byTask = {};
  for (const f of forms) {
    const rec = recById[f.agent_id];
    if (rec && holdsLiveTask(rec)) {
      (byTask[rec.current_task_id] = byTask[rec.current_task_id] || []).push(f.agent_id);
    }
  }
  for (const ids of Object.values(byTask)) {
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++)
      pairs.set([ids[i], ids[j]].sort().join('|'), 'shared task · both executing');
  }
  /* rule 2: one agent's task title references another agent */
  for (const t of (tasksRecent || [])) {
    if (!t || !t.assigned_to || !t.title) continue;
    const title = String(t.title).toLowerCase();
    for (const f of forms) {
      if (f.agent_id === t.assigned_to) continue;
      const keys = [f.agent_id.slice(6).toLowerCase(), String(f.public_name).toLowerCase()];
      if (keys.some((k) => k && nameHit(title, k)))
        pairs.set([t.assigned_to, f.agent_id].sort().join('|'), 'task names ' + f.public_name);
    }
  }
  return [...pairs.entries()].map(([key, reason]) => {
    const p = key.split('|');
    return { a: p[0], b: p[1], reason };
  });
}

/* ---- wave 2: articulated robot bodies (2026-09-17) ----
 * Every agent form is now a real articulated ROBOT BODY — head, torso, arms
 * (upper/fore + hand), legs (thigh/shin + foot), visible joints — with the
 * agent's identity-derived signature elements MOUNTED onto the body
 * (identityMounts), never replacing it. Pure data + pure functions here;
 * index.html turns the plan into Three.js meshes. Same agent -> same body. */
export const ROBOT_SCHEMA = 'gear-ledger-3d-robot-body/v1';
/* Local body space: feet at y=0, head top at y=2.82. The page offsets by the
 * plinth base. parts: mesh entries {id,shape,dims,at,parent,mat} or joint
 * entries {id,joint:true,pivot,parent}. parent names a joint id for chained
 * pivots (elbow inside shoulder). mat: shell|core|accent. */
export const ROBOT_PARTS = [
  { id: 'pelvis', shape: 'box', dims: [0.72, 0.34, 0.5], at: [0, 1.14, 0], parent: null, mat: 'shell' },
  { id: 'torso', shape: 'box', dims: [0.95, 0.8, 0.6], at: [0, 1.68, 0], parent: null, mat: 'shell' },
  { id: 'chest-core', shape: 'sph', dims: [0.24], at: [0, 1.72, 0.28], parent: null, mat: 'core', isCore: true },
  { id: 'neck-post', shape: 'cyl', dims: [0.12, 0.12, 0.2], at: [0, 2.12, 0], parent: null, mat: 'shell' },
  { id: 'neck', joint: true, pivot: [0, 2.16, 0], parent: null },
  { id: 'head', shape: 'box', dims: [0.52, 0.56, 0.5], at: [0, 2.5, 0], parent: 'neck', mat: 'shell' },
  { id: 'visor', shape: 'box', dims: [0.42, 0.15, 0.05], at: [0, 2.54, 0.26], parent: 'neck', mat: 'core' },
  { id: 'shoulderL', joint: true, pivot: [-0.6, 1.98, 0], parent: null },
  { id: 'shoulderR', joint: true, pivot: [0.6, 1.98, 0], parent: null },
  { id: 'shoulder-ballL', shape: 'sph', dims: [0.15], at: [-0.6, 1.98, 0], parent: null, mat: 'accent' },
  { id: 'shoulder-ballR', shape: 'sph', dims: [0.15], at: [0.6, 1.98, 0], parent: null, mat: 'accent' },
  { id: 'pauldronL', shape: 'box', dims: [0.36, 0.18, 0.42], at: [-0.6, 2.1, 0], parent: 'shoulderL', mat: 'shell' },
  { id: 'pauldronR', shape: 'box', dims: [0.36, 0.18, 0.42], at: [0.6, 2.1, 0], parent: 'shoulderR', mat: 'shell' },
  { id: 'upperArmL', shape: 'box', dims: [0.24, 0.52, 0.28], at: [-0.6, 1.7, 0], parent: 'shoulderL', mat: 'shell' },
  { id: 'upperArmR', shape: 'box', dims: [0.24, 0.52, 0.28], at: [0.6, 1.7, 0], parent: 'shoulderR', mat: 'shell' },
  { id: 'elbowL', joint: true, pivot: [-0.6, 1.42, 0], parent: 'shoulderL' },
  { id: 'elbowR', joint: true, pivot: [0.6, 1.42, 0], parent: 'shoulderR' },
  { id: 'elbow-ballL', shape: 'sph', dims: [0.12], at: [-0.6, 1.42, 0], parent: 'shoulderL', mat: 'accent' },
  { id: 'elbow-ballR', shape: 'sph', dims: [0.12], at: [0.6, 1.42, 0], parent: 'shoulderR', mat: 'accent' },
  { id: 'foreArmL', shape: 'box', dims: [0.22, 0.46, 0.26], at: [-0.6, 1.17, 0], parent: 'elbowL', mat: 'shell' },
  { id: 'foreArmR', shape: 'box', dims: [0.22, 0.46, 0.26], at: [0.6, 1.17, 0], parent: 'elbowR', mat: 'shell' },
  { id: 'handL', shape: 'box', dims: [0.2, 0.24, 0.24], at: [-0.6, 0.82, 0], parent: 'elbowL', mat: 'accent' },
  { id: 'handR', shape: 'box', dims: [0.2, 0.24, 0.24], at: [0.6, 0.82, 0], parent: 'elbowR', mat: 'accent' },
  { id: 'hipL', joint: true, pivot: [-0.24, 1.0, 0], parent: null },
  { id: 'hipR', joint: true, pivot: [0.24, 1.0, 0], parent: null },
  { id: 'hip-ballL', shape: 'sph', dims: [0.14], at: [-0.24, 1.0, 0], parent: null, mat: 'accent' },
  { id: 'hip-ballR', shape: 'sph', dims: [0.14], at: [0.24, 1.0, 0], parent: null, mat: 'accent' },
  { id: 'thighL', shape: 'box', dims: [0.3, 0.52, 0.34], at: [-0.24, 0.74, 0], parent: 'hipL', mat: 'shell' },
  { id: 'thighR', shape: 'box', dims: [0.3, 0.52, 0.34], at: [0.24, 0.74, 0], parent: 'hipR', mat: 'shell' },
  { id: 'kneeL', joint: true, pivot: [-0.24, 0.5, 0], parent: 'hipL' },
  { id: 'kneeR', joint: true, pivot: [0.24, 0.5, 0], parent: 'hipR' },
  { id: 'knee-ballL', shape: 'sph', dims: [0.12], at: [-0.24, 0.5, 0], parent: 'hipL', mat: 'accent' },
  { id: 'knee-ballR', shape: 'sph', dims: [0.12], at: [0.24, 0.5, 0], parent: 'hipR', mat: 'accent' },
  { id: 'shinL', shape: 'box', dims: [0.26, 0.44, 0.3], at: [-0.24, 0.28, 0], parent: 'kneeL', mat: 'shell' },
  { id: 'shinR', shape: 'box', dims: [0.26, 0.44, 0.3], at: [0.24, 0.28, 0], parent: 'kneeR', mat: 'shell' },
  { id: 'footL', shape: 'box', dims: [0.3, 0.14, 0.52], at: [-0.24, 0.07, 0.08], parent: 'kneeL', mat: 'accent' },
  { id: 'footR', shape: 'box', dims: [0.3, 0.14, 0.52], at: [0.24, 0.07, 0.08], parent: 'kneeR', mat: 'accent' },
];
export const ROBOT_JOINTS = ['neck', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'hipL', 'hipR', 'kneeL', 'kneeR'];
/* Named mount anchors for identity kits. at = body-space coords; parent = the
 * joint group the anchor rides with (null = body). orbit anchors are ring
 * paths, not points. */
export const BODY_ANCHORS = {
  'head-top': { at: [0, 2.84, 0], parent: 'neck' },
  'head-front': { at: [0, 2.54, 0.3], parent: 'neck' },
  'chest': { at: [0, 1.68, 0.34], parent: null },
  'chest-inner': { at: [0, 1.68, 0], parent: null },
  'back': { at: [0, 1.72, -0.38], parent: null },
  'torso-orbit': { at: [0, 1.68, 0], parent: null, orbit: true },
  'shoulderL': { at: [-0.6, 2.24, 0], parent: null },
  'shoulderR': { at: [0.6, 2.24, 0], parent: null },
  'forearmL': { at: [-0.6, 1.17, 0.3], parent: 'elbowL' },
  'wristR': { at: [0.6, 0.94, 0], parent: 'elbowR' },
};
/* Identity kits: the wave-1 signature elements translated onto the robot
 * body. element: {id, anchor, shape, dims, mat, motion, rot, count, note}.
 * motion wires the page's existing animated refs (ring/spin/slide/rings/discs).
 * No third-party brand names — CWI identity only. */
const IDENTITY_KITS = {
  spire: [
    { id: 'command-crown', anchor: 'head-top', shape: 'cone', dims: [0.34, 0.34], mat: 'core', note: 'KingCode crown: command height worn, not orbited' },
    { id: 'command-ring', anchor: 'torso-orbit', shape: 'torus', dims: [1.5, 0.07], mat: 'shell', motion: 'ring', orbit: true, note: '9 departments circling the chief' },
  ],
  needle: [
    { id: 'verdict-fin', anchor: 'head-top', shape: 'cone', dims: [0.15, 0.75], mat: 'shell', note: 'the blunt verdict, worn sharp' },
    { id: 'ear-dish', anchor: 'shoulderR', shape: 'torus', dims: [0.5, 0.09], mat: 'shell', motion: 'spin', rot: [0, 1.2, 0], note: 'ear-first listening dish on the scout shoulder' },
  ],
  marquee: [
    { id: 'event-arch', anchor: 'back', shape: 'torus', dims: [0.95, 0.12, Math.PI], mat: 'shell', rot: [0, 0, 0], note: 'theater marquee frame carried like a halo' },
    { id: 'light-bars', anchor: 'back', shape: 'box', dims: [0.12, 0.42, 0.12], mat: 'core', count: 5, arc: 0.95, note: 'marquee lights radiating off the arch' },
  ],
  seal: [
    { id: 'clearance-stamp', anchor: 'chest', shape: 'cyl', dims: [0.5, 0.62, 0.36], mat: 'shell', rot: [Math.PI / 2, 0, 0], note: 'the seal of clearance, stamped on the chest' },
    { id: 'deal-ring', anchor: 'chest', shape: 'torus', dims: [0.82, 0.07], mat: 'shell', motion: 'ring', rot: [0, Math.PI / 2.4, 0], note: 'the closed deal, locked around the stamp' },
  ],
  dial: [
    { id: 'platter', anchor: 'back', shape: 'cyl', dims: [0.68, 0.68, 0.16], mat: 'shell', rot: [Math.PI / 2, 0, 0], note: 'turntable deck carried on the back' },
    { id: 'tone-arm', anchor: 'back', shape: 'box', dims: [1.05, 0.07, 0.1], mat: 'accent', motion: 'spin', off: [0.3, 0.1, 0], note: 'the arm reading the rotation' },
  ],
  broadcast: [
    { id: 'wire-antenna', anchor: 'shoulderL', shape: 'cyl', dims: [0.05, 0.08, 1.5], mat: 'shell', note: 'the wire, raised high' },
    { id: 'signal-rings', anchor: 'shoulderL', shape: 'torus', dims: [0.5, 0.04], mat: 'core', motion: 'rings', count: 3, stack: 0.45, note: 'the signal going out' },
  ],
  fader: [
    { id: 'mix-console', anchor: 'chest', shape: 'box', dims: [0.8, 0.52, 0.16], mat: 'shell', note: 'the mix, worn where the craft lives' },
    { id: 'fader-knob', anchor: 'chest', shape: 'cyl', dims: [0.1, 0.1, 0.22], mat: 'core', motion: 'slide', off: [0, 0, 0.14], note: 'the craft is in the slide' },
  ],
  lattice: [
    { id: 'model-lattice', anchor: 'chest-inner', shape: 'wire', dims: [0.55], mat: 'shell', motion: 'spin', note: 'the model, worn open' },
    { id: 'verified-core', anchor: 'chest-inner', shape: 'ico', dims: [0.2], mat: 'core', note: 'the verified fact inside the lattice' },
  ],
  charter: [
    { id: 'guard-dome', anchor: 'forearmL', shape: 'dome', dims: [0.42], mat: 'shell', note: 'the guardian dome, shielding the working arm' },
    { id: 'charter-scroll', anchor: 'back', shape: 'scroll', dims: [0.3, 0.95], mat: 'accent', note: 'the fine print, carried on the back' },
  ],
  receipt: [
    { id: 'filing-spike', anchor: 'shoulderR', shape: 'cone', dims: [0.1, 1.15], mat: 'shell', note: 'the spike filing finished outcomes' },
    { id: 'receipt-discs', anchor: 'chest', shape: 'cyl', dims: [0.4, 0.4, 0.07], mat: 'core', motion: 'discs', count: 4, stack: 0.24, note: 'stacked receipts on the chest' },
  ],
  keystone: [
    { id: 'owl-visor', anchor: 'head-front', shape: 'disc-pair', dims: [0.16, 0.08], mat: 'core', note: "Athena's owl eyes — wisdom watching the whole board" },
    { id: 'keystone-chest', anchor: 'chest', shape: 'wedge', dims: [0.42, 0.68, 0.5], mat: 'shell', rot: [0, Math.PI / 4, 0], note: 'strategy locked into structure, worn as the chest plate' },
    { id: 'calibration-ring', anchor: 'torso-orbit', shape: 'torus', dims: [1.35, 0.06], mat: 'shell', motion: 'ring', orbit: true, note: 'every prediction scored, orbiting the architect' },
  ],
  construct: [
    { id: 'assembly-frame', anchor: 'chest-inner', shape: 'wire', dims: [0.5], mat: 'shell', note: 'proto-frame under construction — plates pending' },
  ],
};
/**
 * Identity kit for a geometry key. Pure data; the page mounts it.
 * @param {string} geometry  forms.json geometry key
 * @returns {Array<object>}  kit elements (never empty)
 */
export function identityMounts(geometry) {
  const kit = IDENTITY_KITS[String(geometry)];
  if (kit) return kit.map((e) => ({ ...e }));
  return [{ id: 'fallback-sigil', anchor: 'chest', shape: 'sph', dims: [0.2], mat: 'core', note: 'unmapped geometry — core sigil' }];
}
/* ---- deterministic proto-frame assembly plan ----
 * Newborn agents (auto-forms) render as a robot UNDER CONSTRUCTION: the
 * fnv1a hash of the agent_id decides which limbs are plated (assembled) and
 * which are exposed frame. Same id -> same assembly state, forever. */
const FRAME_LIMBS = ['head', 'armL', 'armR', 'legL', 'legR', 'chest-plate'];
export function constructPlan(agent_id) {
  const id = String(agent_id == null ? '' : agent_id);
  const h = fnv1a(id);
  const assembled = FRAME_LIMBS.filter((_, i) => (h >> (i * 3)) & 1);
  return {
    agent_id: id,
    schema: ROBOT_SCHEMA,
    frame: 'proto',
    color: AUTO_COLOR,
    core_color: AUTO_CORE,
    assembled,
    exposed: FRAME_LIMBS.filter((l) => !assembled.includes(l)),
    note: 'Proto-frame robot under construction: plated limbs are assembled, exposed limbs show the frame. Graduates to a true identity-derived body when chartered.',
  };
}
export const FRAME_LIMBS_OUT = FRAME_LIMBS;
/* ---- procedural auto-forms: the world extends itself ----
 * Any live agent with no hand-built forms.json entry gets a deterministic
 * procedural "construct" form — visibly unfinished (stacked plates, orbiting
 * part), so newborn agents (e.g. Athena's children) appear in the world the
 * moment the ledger knows them, and graduate to a true identity-derived form
 * when one is chartered for them. Pure function: same agent_id -> same spec.
 * Proto-silver is reserved for the unformed; no chartered form may use it. */
export const AUTO_COLOR = '#B9C6DC';
export const AUTO_CORE = '#FFFFFF';
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
export function proceduralForm(agent_id) {
  const id = String(agent_id == null ? '' : agent_id);
  const h = fnv1a(id);
  const tail = id.split(':').pop().split('_').pop() || 'unit';
  const name = tail.charAt(0).toUpperCase() + tail.slice(1).toLowerCase();
  const jitter = 0.9 + (h % 21) / 100; /* deterministic ±10% motion variety */
  const r2 = (v) => Math.round(v * 100) / 100;
  return {
    agent_id: id,
    public_name: name,
    department: 'Unformed',
    color: AUTO_COLOR,
    core_color: AUTO_CORE,
    geometry: 'construct',
    derivation: 'Procedural auto-form: this agent has no chartered form yet and renders as an assembling construct until its identity is built.',
    motion: { spin: r2(0.5 * jitter), bob: r2(1.8 * jitter), turn: r2(3 * jitter), amp: 0.7 },
    auto: true,
  };
}
