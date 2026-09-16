/* live-client.js — LIVE-mode client for the Gear Ledger 3D world.
 *
 * Consumes live-data.json (published every 10 min from the canonical
 * Gear Ledger store by scripts/publish-live-data.js). All events are real
 * (sample:false). Never invents agents, tasks, or counts.
 */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function fmtTime(iso) {
    try {
      const d = new Date(iso);
      return d.toISOString().slice(11, 16) + ' UTC';
    } catch (e) { return ''; }
  }

  // Switch the HUD pill to LIVE. Called once, on successful upgrade.
  function upgradePill(json) {
    const pill = document.getElementById('samplepill');
    if (!pill) return;
    pill.classList.add('live');
    const dot = document.getElementById('pill-dot');
    const txt = document.getElementById('pill-text');
    const time = document.getElementById('pill-time');
    if (txt) txt.textContent = 'LIVE';
    if (time) time.textContent = ' · data as of ' + fmtTime(json.as_of);
    if (dot) dot.textContent = '●';
    pill.title = 'Connected to the live Gear Ledger · store v' + json.store_version + ' · as of ' + json.as_of;
    if (typeof pill.classList !== 'undefined') { pill.classList.remove('pulse'); void pill.offsetWidth; pill.classList.add('pulse'); }
  }

  // LIVE evidence: real record references from the store. Never sample text.
  function evidenceFor(sel, json) {
    const out = { kind: 'live', title: 'Evidence (live)', records: [] };
    if (!json) return out;
    if (sel && sel.kind === 'AGENT' && sel.agent && sel.agent.def) {
      const handle = sel.agent.def.name;
      const rec = json.agents.find((a) => 'agent:' + handle === a.agent_id || a.handle === handle);
      if (rec) {
        out.records = (json.tasks_recent || [])
          .filter((t) => t.assigned_to === rec.agent_id)
          .slice(0, 5)
          .map((t) => t.task_id + ' · ' + t.state + ' · ' + t.title);
        out.context = rec.agent_id + ' · presence ' + rec.presence +
          (rec.current_task_id ? ' · on ' + rec.current_task_id : ' · no live task');
      }
    } else {
      out.records = (json.tasks_recent || []).slice(0, 5)
        .map((t) => t.task_id + ' · ' + t.state + ' · ' + t.title);
      out.context = 'Gear Ledger store v' + json.store_version + ' · as of ' + json.as_of;
    }
    return out;
  }

  function apply(json, client) {
    client.mode = 'LIVE';
    client.live = json;
    client.asOf = json.as_of;
    upgradePill(json);
    if (typeof window.__liveUpgrade === 'function') {
      try { window.__liveUpgrade(json); } catch (e) { /* stay in honest SAMPLE visuals on hook failure */ }
    }
    client.emit({ type: 'world.live', sample: false, asOf: json.as_of, store_version: json.store_version });
  }

  window.LiveClient = { apply, evidenceFor, upgradePill, fmtTime, esc };
})();
