/* districts.js — home-district layout + data-driven district life (dependency-free).
 *
 * Twenty Minds decision (2026-09-17, world-districts-design-20minds.md):
 * DATA-FIRST districts. Every district's visual life derives from live ledger
 * operational state; department theming is the dressing on top. The spectacle
 * serves the data, never the reverse.
 *
 * One district per agent (1:1 with forms.json order), arranged on an outer
 * ring around the hub, bridged to the hub. District i belongs to the agent
 * whose robot stands on it; the district beacon's pulse and intensity are a
 * pure function of that agent's classifyAgent() state — EXECUTING districts
 * burn bright, DORMANT ones go quiet. Imported by index.html AND by
 * tests/districts.test.mjs, so the shipped page and the test battery share
 * one source of truth.
 */

export const DISTRICT_RING_R = 78;   /* outer ring radius (world units) */
export const DISTRICT_R = 7;         /* district island radius */
export const ATHENA_DISTRICT_R = 8;  /* Athena's observatory runs slightly larger */
export const MIN_DISTRICT_GAP = 6;   /* minimum clear water between district rims */

/* Static charter roster for island layout. ISLANDS is built at module eval,
 * before forms.json arrives over fetch — so layout uses this roster, and the
 * test battery asserts it matches forms.json exactly. Live state always keys
 * by agent_id against STAGE.forms, so a roster/forms drift can only ever
 * affect island labels, never state honesty. */
export const AGENT_ROSTER = [
  { agent_id: 'agent:MUSE_CWI', public_name: 'KingCode', department: 'Command', color: '#FFB224' },
  { agent_id: 'agent:CWI_AandR', public_name: 'Needle', department: 'A&R', color: '#3DFF88' },
  { agent_id: 'agent:CWI_Marketing', public_name: 'Marquee', department: 'Marketing & Social', color: '#FF5C5C' },
  { agent_id: 'agent:CWI_Sync', public_name: 'Seal', department: 'Sync & Licensing', color: '#B388FF' },
  { agent_id: 'agent:CWI_Radio', public_name: 'Dial', department: 'Radio & Playlists', color: '#35C4FF' },
  { agent_id: 'agent:CWI_Press', public_name: 'Dateline', department: 'Press & PR', color: '#4DE3C2' },
  { agent_id: 'agent:CWI_Studio', public_name: 'Fader', department: 'Content Studio', color: '#FF9F43' },
  { agent_id: 'agent:CWI_Data', public_name: 'Ledger', department: 'Data & Analytics', color: '#A8E6FF' },
  { agent_id: 'agent:CWI_Affairs', public_name: 'Charter', department: 'Business Affairs', color: '#D8B36A' },
  { agent_id: 'agent:CWI_Results', public_name: 'Receipt', department: 'Results', color: '#F5F7FA' },
  { agent_id: 'agent:CWI_Athena', public_name: 'Athena', department: 'Reasoning', color: '#C9D6EA' },
];

/* Operational state -> district activity (0..1). Pure, monotonic:
 * brighter/more-alive districts always mean more real work happening. */
const STATE_ACTIVITY = {
  EXECUTING: 1.0,
  THINKING: 0.8,
  WAITING: 0.45,
  DORMANT: 0.12,
  SAMPLE: 0.25,
};
export function districtActivity(state) {
  const s = String(state || '').toUpperCase();
  return STATE_ACTIVITY[s] !== undefined ? STATE_ACTIVITY[s] : 0;
}

/* Activity -> beacon visual params. Pulse quickens and the beacon brightens
 * with real work; nothing here is random or timer-faked. */
export function districtBeacon(state) {
  const a = districtActivity(state);
  return {
    activity: a,
    pulseHz: 0.4 + 2.2 * a,          /* 0.66 Hz dormant-quiet .. 2.6 Hz executing */
    intensity: 0.15 + 1.6 * a,       /* beacon emissive multiplier */
    haloOpacity: 0.06 + 0.5 * a,     /* ground-halo opacity */
  };
}

/* Deterministic ring slot for district index i of n. Starts at the top
 * (-Z, away from the camera-side stage island) and spreads clockwise. */
export function districtSlot(i, n, ringR = DISTRICT_RING_R) {
  const ang = -Math.PI / 2 + (i / n) * Math.PI * 2;
  const r2 = (v) => Math.round(v * 100) / 100;
  return { x: r2(Math.cos(ang) * ringR), z: r2(Math.sin(ang) * ringR), ang: r2(ang) };
}

/**
 * Build the district island configs from the agent forms list.
 * 1:1 mapping: district i <-> forms[i]. Athena's Reasoning district is the
 * observatory — slightly larger, same data rules as everyone else.
 * @param {Array<{agent_id:string, public_name:string, department:string, color:string}>} forms
 * @returns {Array<object>} island configs compatible with buildIsland()
 */
export function districtDefs(forms = AGENT_ROSTER) {
  const list = Array.isArray(forms) ? forms : [];
  const n = list.length;
  return list.map((f, i) => {
    const slot = districtSlot(i, n);
    const isAthena = f.agent_id === 'agent:CWI_Athena';
    const dept = String(f.department || 'Department');
    return {
      id: 'district-' + f.agent_id.replace(/^agent:/, '').toLowerCase(),
      name: dept.toUpperCase(),
      tag: f.public_name + ' · LIVE STATE',
      x: slot.x,
      z: slot.z,
      r: isAthena ? ATHENA_DISTRICT_R : DISTRICT_R,
      accent: f.color || '#35C4FF',
      agent_id: f.agent_id,
      district: true,
    };
  });
}

/**
 * Bridge pairs hub->district, compatible with the existing BRIDGES builder
 * (pairs of island ids).
 */
export function districtBridges(defs) {
  return (Array.isArray(defs) ? defs : []).map((d) => ['hub', d.id]);
}

/**
 * Validate a district layout: every bridge endpoint exists, no two district
 * rims come closer than MIN_DISTRICT_GAP, all ids unique.
 * @returns {Array<string>} list of violation messages (empty = valid)
 */
export function validateDistricts(defs, islandIds) {
  const problems = [];
  const ids = new Set(islandIds || []);
  const seen = new Set();
  for (const d of defs) {
    if (seen.has(d.id)) problems.push('duplicate district id ' + d.id);
    seen.add(d.id);
    if (!ids.has(d.id)) problems.push('district id not in island set: ' + d.id);
    if (!ids.has('hub')) problems.push('hub missing from island set');
  }
  for (let i = 0; i < defs.length; i++) {
    for (let j = i + 1; j < defs.length; j++) {
      const a = defs[i], b = defs[j];
      const dist = Math.hypot(a.x - b.x, a.z - b.z);
      if (dist < a.r + b.r + MIN_DISTRICT_GAP)
        problems.push(`districts ${a.id} and ${b.id} too close (${dist.toFixed(1)} < ${a.r + b.r + MIN_DISTRICT_GAP})`);
    }
  }
  return problems;
}

/* Nameplate spec for a district def — pure charter facts for the billboarded
 * floating label (agent public name + department + accent). The page builds
 * the canvas sprite from this; the logic stays dependency-free and testable.
 * Names are static charter data — the beacon pillars (not the labels) carry
 * live operational state. */
export function districtNameplate(d) {
  const def = d || {};
  const tag = String(def.tag || '');
  const publicName = tag.split('·')[0].trim() || String(def.name || 'DISTRICT');
  return {
    name: publicName.toUpperCase(),
    dept: String(def.name || 'DEPARTMENT').toUpperCase(),
    accent: def.accent || '#35C4FF',
  };
}
