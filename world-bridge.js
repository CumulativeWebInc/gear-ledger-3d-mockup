/* world-bridge.js — WorldClient: the SAMPLE/LIVE selector for the 3D world.
 *
 * Backend-architecture §9: sits between the scene and data.
 *   3D scene (islands, agents, HUD) ←→ WorldClient ←→ { SAMPLE engine | LIVE feed }
 *
 * On load it tries live-data.json with a short timeout. Fresh, schema-valid
 * data → LIVE mode (green ● LIVE pill + "data as of" timestamp). Anything
 * else → SAMPLE mode (the existing amber pill stays; honest by default).
 *
 * WorldClient = { mode, live, asOf, onEvent, emit, getSnapshot, getEvidence }
 * LIVE renderer drops any sample:true event (see emit).
 */
(function () {
  'use strict';

  var LIVE_URL = 'live-data.json';
  var FETCH_TIMEOUT_MS = 4000;
  var MAX_AGE_MS = 60 * 60 * 1000; // stale data is worse than labeled sample
  var LIVE_SCHEMA = 'gear-ledger-3d-live/v1';

  var W = typeof window !== 'undefined' ? window : globalThis;

  var subs = [];
  var client = {
    mode: 'SAMPLE',
    live: null,   // raw live-data.json when LIVE
    asOf: null,
    onEvent: function (cb) {
      subs.push(cb);
      return function () { const i = subs.indexOf(cb); if (i >= 0) subs.splice(i, 1); };
    },
    emit: function (ev) {
      // Structural separation: sample:true events are rejected in LIVE mode.
      if (client.mode === 'LIVE' && ev && ev.sample) return;
      for (var i = 0; i < subs.length; i++) {
        try { subs[i](ev); } catch (e) { /* subscriber errors never break the world */ }
      }
    },
    getSnapshot: function () {
      return client.mode === 'LIVE' ? client.live
        : (W.SampleEngine ? W.SampleEngine.getSnapshot() : null);
    },
    getEvidence: function (sel) {
      if (client.mode === 'LIVE' && W.LiveClient) return W.LiveClient.evidenceFor(sel, client.live);
      return W.SampleEngine ? W.SampleEngine.evidenceFor(sel) : null;
    },
  };
  W.WorldClient = client;

  function fresh(json) {
    if (!json || json.schema !== LIVE_SCHEMA || json.mode !== 'LIVE') return false;
    var t = Date.parse(json.as_of);
    if (!t) return false;
    return (Date.now() - t) < MAX_AGE_MS;
  }

  function tryLive() {
    var done = false;
    function finish(json) {
      if (done) return; done = true;
      if (json && fresh(json) && W.LiveClient) {
        W.LiveClient.apply(json, client);
      }
      // else: remain SAMPLE — the honest default. Amber pill already in place.
    }
    try {
      var ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctl) { try { ctl.abort(); } catch (e) {} } finish(null); }, FETCH_TIMEOUT_MS);
      W.fetch(LIVE_URL, { cache: 'no-store', signal: ctl ? ctl.signal : undefined })
        .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
        .then(function (j) { clearTimeout(timer); finish(j); })
        .catch(function () { clearTimeout(timer); finish(null); });
    } catch (e) { finish(null); }
  }

  if (W.document && W.document.readyState === 'loading') {
    W.document.addEventListener('DOMContentLoaded', tryLive);
  } else if (W.document) {
    tryLive();
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { fresh, FETCH_TIMEOUT_MS, MAX_AGE_MS, LIVE_SCHEMA };
  }
})();
