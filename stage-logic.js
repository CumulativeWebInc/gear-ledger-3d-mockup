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
