/* ============================================================
   ledger-live.js — Gear Ledger LIVE client for the 3D mockup.
   ------------------------------------------------------------
   Hot path: GitHub Pages mirror (no auth, no secrets):
     https://cumulativewebinc.github.io/gear-ledger/state.json
     https://cumulativewebinc.github.io/gear-ledger/events.jsonl
   Authority for truth decisions: GitHub Contents API
     GET /repos/CumulativeWebInc/gear-ledger/contents/state.json
   (raw CDN / Pages can lag commits; Contents API is the authority.)

   Poll: ETag + If-None-Match every 15s (falls back to version-diff
   where the CDN does not expose ETag to cross-origin JS).

   LIVE criteria (ALL must hold, evaluated every poll):
     1. fetch of state.json succeeds (HTTP 200)
     2. state.version advanced since last read, OR state.updated_at < 15 min old
     3. every task in state.json has sample === false
   Otherwise the client is OFFLINE and the mockup renders its honest
   SAMPLE fallback. Never render a simulated datum as live.

   Exposes: window.GearLedgerLive
   ============================================================ */
(function () {
  'use strict';

  var PAGES_BASE = 'https://cumulativewebinc.github.io/gear-ledger';
  var REPO_URL = 'https://github.com/CumulativeWebInc/gear-ledger';
  var POLL_MS = 15000;
  var STALE_MS = 15 * 60 * 1000;   // presence older than this = away
  var FRESH_MS = 15 * 60 * 1000;   // updated_at older than this = not live

  /* 1:1 character map (brief §Character map). The ledger's own
     public_name wins when present; this map is the fallback. */
  var CHAR_MAP = {
    'agent:MUSE_CWI': 'KingCode',
    'agent:CWI_AandR': 'Needle',
    'agent:CWI_Marketing': 'Marquee',
    'agent:CWI_Sync': 'Seal',
    'agent:CWI_Radio': 'Dial',
    'agent:CWI_Press': 'Dateline',
    'agent:CWI_Studio': 'Fader',
    'agent:CWI_Data': 'Ledger',
    'agent:CWI_Affairs': 'Charter',
    'agent:CWI_Results': 'Receipt'
  };

  var EVENT_GLYPH = {
    'task.created': '📝', 'task.assigned': '📌', 'task.started': '▶️',
    'task.delivered': '📦', 'task.verified': '✅', 'task.cancelled': '✖️',
    'task.failed': '💥', 'task.attention': '⚠️', 'task.handoff': '⇄',
    'agent.presence': '💓', 'approval.sealed': '🖋️', 'handoff.sealed': '🔏'
  };

  var listeners = [];
  var seenEventIds = {};
  var lastVersion = null;
  var etags = { state: null, events: null };
  var pollTimer = null;

  function ago(ts) {
    var d = Date.now() - Date.parse(ts);
    if (isNaN(d) || d < 0) return '—';
    var m = Math.floor(d / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    var h = Math.floor(m / 60);
    if (h < 48) return h + 'h ago';
    return Math.floor(h / 24) + 'd ago';
  }

  function agentName(id, state) {
    if (state && Array.isArray(state.agents)) {
      for (var i = 0; i < state.agents.length; i++) {
        if (state.agents[i].agent_id === id && state.agents[i].public_name)
          return state.agents[i].public_name;
      }
    }
    return CHAR_MAP[id] || (id || '—').replace(/^agent:/, '');
  }

  function humanize(ev, state) {
    var g = EVENT_GLYPH[ev.event] || '⛓';
    var d = ev.data || {};
    var actorN = agentName(ev.actor, state);
    var t = '';
    switch (ev.event) {
      case 'task.handoff':
        t = g + ' <b>' + agentName(d.from, state) + '</b> → <b>' + agentName(d.to, state) + '</b>' +
            (d.note ? ' · ' + d.note : '');
        break;
      case 'task.created':
        t = g + ' <b>' + actorN + '</b> created <b>' + (d.task_id || '') + '</b>' +
            (d.title ? ' · ' + d.title : '');
        break;
      case 'task.assigned':
        t = g + ' <b>' + (d.task_id || '') + '</b> → <b>' + agentName(d.assignee || d.assigned_to, state) + '</b>' +
            (d.title ? ' · ' + d.title : '');
        break;
      case 'task.started':
        t = g + ' <b>' + actorN + '</b> started <b>' + (d.task_id || '') + '</b>' +
            (d.title ? ' · ' + d.title : '');
        break;
      case 'task.delivered':
        t = g + ' <b>' + actorN + '</b> delivered <b>' + (d.task_id || '') + '</b>' +
            (d.title ? ' · ' + d.title : '');
        break;
      case 'task.verified':
        t = g + ' <b>' + actorN + '</b> verified <b>' + (d.task_id || '') + '</b>' +
            (d.title ? ' · ' + d.title : '');
        break;
      case 'task.cancelled':
      case 'task.failed':
        t = g + ' <b>' + (d.task_id || '') + '</b> ' + ev.event.split('.')[1] +
            (d.reason ? ' · ' + d.reason : '') + (d.title ? ' · ' + d.title : '');
        break;
      case 'agent.presence':
        t = g + ' <b>' + agentName(d.agent_id, state) + '</b> ' + (d.status || 'online');
        break;
      default:
        t = g + ' <b>' + actorN + '</b> · ' + ev.event;
    }
    return { html: t, time: ago(ev.at), id: ev.event_id, event: ev.event };
  }

  function fetchJson(url, slot) {
    var headers = {};
    if (etags[slot]) headers['If-None-Match'] = etags[slot];
    return fetch(url, { headers: headers, cache: 'no-store' }).then(function (resp) {
      if (resp.status === 304) return { notModified: true };
      if (!resp.ok) throw new Error('HTTP ' + resp.status + ' on ' + url);
      var et = null;
      try { et = resp.headers.get('ETag'); } catch (e) { /* not exposed cross-origin */ }
      if (et) etags[slot] = et;
      var ct = (resp.headers.get('Content-Type') || '').toLowerCase();
      return resp.text().then(function (text) {
        if (slot === 'events') return { text: text };
        return { json: JSON.parse(text) };
      });
    });
  }

  function allReal(tasks) {
    if (!Array.isArray(tasks)) return false;
    for (var i = 0; i < tasks.length; i++) {
      if (tasks[i].sample !== false) return false;
    }
    return true;
  }

  function evaluateLive(state) {
    if (!state || !allReal(state.tasks)) return false;
    var advanced = lastVersion !== null && typeof state.version === 'number' && state.version > lastVersion;
    var fresh = false;
    if (state.updated_at) {
      var age = Date.now() - Date.parse(state.updated_at);
      fresh = !isNaN(age) && age >= 0 && age < FRESH_MS;
    }
    return advanced || fresh;
  }

  function buildDerived(state, eventLines) {
    var tasksByAgent = {}, presenceByAgent = {}, names = {};
    (state.agents || []).forEach(function (a) {
      names[a.agent_id] = a.public_name || CHAR_MAP[a.agent_id] || a.agent_id;
    });
    (state.tasks || []).forEach(function (t) {
      if (t.sample !== false || !t.assigned_to) return;
      (tasksByAgent[t.assigned_to] = tasksByAgent[t.assigned_to] || []).push(t);
    });
    Object.keys(state.presence || {}).forEach(function (id) {
      var p = state.presence[id] || {};
      var ageMs = p.at ? (Date.now() - Date.parse(p.at)) : Infinity;
      presenceByAgent[id] = {
        status: p.status || 'unknown', at: p.at || null,
        ageMs: ageMs, stale: !(ageMs >= 0) || ageMs > STALE_MS,
        current_task_id: p.current_task_id || null
      };
    });
    var events = [];
    (eventLines || []).forEach(function (line) {
      line = (line || '').trim();
      if (!line) return;
      try {
        var ev = JSON.parse(line);
        if (ev.sample !== false || !ev.event_id || !ev.event) return;  // reject non-real records
        events.push(ev);
      } catch (e) { /* skip malformed lines */ }
    });
    events.sort(function (a, b) { return (a.event_id < b.event_id ? -1 : 1); });
    var handoffs = events
      .filter(function (ev) { return ev.event === 'task.handoff'; })
      .map(function (ev) {
        return { event_id: ev.event_id, at: ev.at, actor: ev.actor,
                 from: ev.data && ev.data.from, to: ev.data && ev.data.to,
                 note: ev.data && ev.data.note, task_ref: ev.data && (ev.data.task_ref || ev.data.task_id) };
      });
    return { tasksByAgent: tasksByAgent, presenceByAgent: presenceByAgent,
             names: names, events: events, handoffs: handoffs };
  }

  function emit() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](GL); } catch (e) { /* listener errors must not kill the poll */ }
    }
  }

  var GL = {
    mode: 'OFFLINE',
    version: null,
    updated_at: null,
    state: null,
    events: [],
    handoffs: [],
    tasksByAgent: {},
    presenceByAgent: {},
    names: {},
    lastError: null,
    lastPollAt: null,
    repoUrl: REPO_URL,
    pagesBase: PAGES_BASE,
    onUpdate: function (cb) { if (typeof cb === 'function') listeners.push(cb); },
    agentName: function (id) { return agentName(id, this.state); },
    humanize: function (ev) { return humanize(ev, this.state); },
    ago: ago,
    refresh: function () { poll(); }
  };

  function poll() {
    var stateUrl = PAGES_BASE + '/state.json';
    var eventsUrl = PAGES_BASE + '/events.jsonl';
    fetchJson(stateUrl, 'state').then(function (sr) {
      if (sr.notModified && GL.state) {
        // no change on the mirror; re-evaluate freshness only
        GL.mode = evaluateLive(GL.state) ? 'LIVE' : 'OFFLINE';
        GL.lastPollAt = new Date().toISOString();
        emit();
        return;
      }
      var state = sr.json;
      var live = evaluateLive(state);
      var evLines = [];
      return fetchJson(eventsUrl, 'events').then(function (er) {
        if (!er.notModified) evLines = er.text.split('\n');
        else evLines = null; // keep previous events
        if (state && typeof state.version === 'number') lastVersion = state.version;
        var d = buildDerived(state, evLines === null ? [] : evLines);
        GL.state = state;
        GL.version = state.version;
        GL.updated_at = state.updated_at;
        GL.tasksByAgent = d.tasksByAgent;
        GL.presenceByAgent = d.presenceByAgent;
        GL.names = d.names;
        if (evLines !== null) {
          GL.events = d.events;
          GL.handoffs = d.handoffs;
        }
        GL.mode = live ? 'LIVE' : 'OFFLINE';
        GL.lastError = null;
        GL.lastPollAt = new Date().toISOString();
        emit();
      });
    }).catch(function (err) {
      // fetch failed: keep last-known state, drop to OFFLINE
      GL.mode = 'OFFLINE';
      GL.lastError = String((err && err.message) || err);
      GL.lastPollAt = new Date().toISOString();
      emit();
    });
  }

  function seen(ev) { return !!seenEventIds[ev.event_id]; }
  function markSeen(ev) { seenEventIds[ev.event_id] = 1; }
  GL.isNew = function (ev) { return !seen(ev); };
  GL.markSeen = markSeen;
  GL.newEvents = function () {
    var out = [];
    for (var i = 0; i < GL.events.length; i++) {
      if (!seen(GL.events[i])) { out.push(GL.events[i]); markSeen(GL.events[i]); }
    }
    return out;
  };

  window.GearLedgerLive = GL;
  poll();
  pollTimer = setInterval(poll, POLL_MS);
})();
