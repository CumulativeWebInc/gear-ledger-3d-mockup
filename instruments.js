/* ============================================================
   instruments.js — CWI Agent Stage instruments (Worker B)
   ------------------------------------------------------------
   Two self-contained instruments. Every CSS class is prefixed `cwi-`;
   no globals leak (single `window.CWIInstruments` handle).

   1. LIVE presence/activity ticker (bottom strip): latest REAL ledger
      events via window.GearLedgerLive.onUpdate + .humanize(), plus one
      presence dot per agent (green pulse = fresh, gray = stale/offline).
      Kill rule: GearLedgerLive absent, or OFFLINE for 3 consecutive
      polls -> ticker collapses to an honest offline pill. Stale data is
      NEVER presented as live.
   2. Shift countdown chip (HUD top area / #topright): current shift
      DAY/NIGHT from pure local-time math + a ticking countdown to the
      next 06:00/18:00 boundary. Zero network. Keeps working even when
      the ticker is killed.

   Pure logic (resolveShift / nextBoundary / shiftInfo /
   formatCountdown / classifyPresence / shouldCollapseTicker) is
   exported for node tests via globalThis.CWIInstrumentPure and, where
   supported, CommonJS module.exports.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure logic (testable, no DOM) ---------------- */

  var DAY_START_H = 6;              // day shift: 06:00–18:00 local
  var DAY_END_H = 18;
  var FRESH_MS = 15 * 60 * 1000;    // presence older than this = stale
  var OFFLINE_KILL_AFTER = 3;       // consecutive OFFLINE polls -> collapse
  var MAX_DOTS = 10;
  var MAX_ITEMS = 8;

  // Local hour 06:00–18:00 -> DAY, otherwise NIGHT.
  function resolveShift(d) {
    var h = d.getHours();
    return (h >= DAY_START_H && h < DAY_END_H) ? 'DAY' : 'NIGHT';
  }

  // Next shift boundary strictly after d (06:00 or 18:00 local).
  function nextBoundary(d) {
    var b = new Date(d.getTime());
    var h = d.getHours();
    if (h < DAY_START_H) {
      b.setHours(DAY_START_H, 0, 0, 0);
    } else if (h < DAY_END_H) {
      b.setHours(DAY_END_H, 0, 0, 0);
    } else {
      b.setDate(b.getDate() + 1);
      b.setHours(DAY_START_H, 0, 0, 0);
    }
    return b;
  }

  function shiftInfo(d) {
    d = d || new Date();
    var shift = resolveShift(d);
    var b = nextBoundary(d);
    return {
      shift: shift,
      icon: shift === 'DAY' ? '\u2600' : '\uD83C\uDF19',
      nextShift: shift === 'DAY' ? 'NIGHT' : 'DAY',
      boundary: b,
      msUntil: Math.max(0, b.getTime() - d.getTime())
    };
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  // ms -> "HH:MM:SS" (clamped at 0).
  function formatCountdown(ms) {
    if (!(ms > 0)) ms = 0;
    var s = Math.floor(ms / 1000);
    return pad2(Math.floor(s / 3600)) + ':' +
           pad2(Math.floor(s / 60) % 60) + ':' +
           pad2(s % 60);
  }

  // Mirror the ledger client's own staleness rule:
  // live iff ageMs is a finite, non-negative duration <= staleMs.
  function classifyPresence(ageMs, staleMs) {
    if (staleMs == null) staleMs = FRESH_MS;
    return (typeof ageMs === 'number' && isFinite(ageMs) &&
            ageMs >= 0 && ageMs <= staleMs) ? 'live' : 'stale';
  }

  function shouldCollapseTicker(offlineStreak) {
    return offlineStreak >= OFFLINE_KILL_AFTER;
  }

  var PURE = {
    DAY_START_H: DAY_START_H,
    DAY_END_H: DAY_END_H,
    FRESH_MS: FRESH_MS,
    OFFLINE_KILL_AFTER: OFFLINE_KILL_AFTER,
    MAX_DOTS: MAX_DOTS,
    MAX_ITEMS: MAX_ITEMS,
    resolveShift: resolveShift,
    nextBoundary: nextBoundary,
    shiftInfo: shiftInfo,
    formatCountdown: formatCountdown,
    classifyPresence: classifyPresence,
    shouldCollapseTicker: shouldCollapseTicker
  };

  if (typeof globalThis !== 'undefined') globalThis.CWIInstrumentPure = PURE;
  if (typeof module !== 'undefined' && module.exports) module.exports = PURE;

  /* ---------------- DOM instruments (browser only) ---------------- */

  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  var AGENT_ORDER = [
    'agent:MUSE_CWI', 'agent:CWI_AandR', 'agent:CWI_Marketing',
    'agent:CWI_Sync', 'agent:CWI_Radio', 'agent:CWI_Press',
    'agent:CWI_Studio', 'agent:CWI_Data', 'agent:CWI_Affairs'
  ];

  var chipEl = null, tickerEl = null, modeEl = null, trackEl = null, dotsEl = null;
  var offlineStreak = 0;
  var wired = false;

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  /* ---- instrument 2: shift countdown chip ---- */

  function buildChip() {
    var anchor = document.getElementById('shiftbadge');
    var host = document.getElementById('topright') ||
               document.getElementById('hud') || document.body;
    chipEl = el('div', 'cwi-chip');
    chipEl.id = 'cwi-shift-chip';
    chipEl.setAttribute('role', 'status');
    chipEl.setAttribute('aria-live', 'off');
    chipEl.innerHTML =
      '<span class="cwi-chip-ico" aria-hidden="true"></span>' +
      '<b class="cwi-chip-shift"></b>' +
      '<span class="cwi-chip-count" aria-hidden="true"></span>' +
      '<span class="cwi-chip-next" aria-hidden="true"></span>';
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(chipEl, anchor.nextSibling);
    } else {
      host.appendChild(chipEl);
    }
    tickChip();
    setInterval(tickChip, 1000);   // pure local-time math, zero network
  }

  function tickChip() {
    if (!chipEl) return;
    var info = shiftInfo(new Date());
    var ico = chipEl.querySelector('.cwi-chip-ico');
    var sh = chipEl.querySelector('.cwi-chip-shift');
    var cnt = chipEl.querySelector('.cwi-chip-count');
    var nxt = chipEl.querySelector('.cwi-chip-next');
    ico.textContent = info.icon;
    sh.textContent = info.shift;
    cnt.textContent = formatCountdown(info.msUntil);
    nxt.textContent = '\u2192 ' + (info.nextShift === 'DAY' ? '\u2600' : '\uD83C\uDF19');
    chipEl.classList.toggle('cwi-night', info.shift === 'NIGHT');
    var hh = pad2(info.boundary.getHours()) + ':' + pad2(info.boundary.getMinutes());
    chipEl.title = info.shift + ' shift \u00B7 next boundary ' + hh +
                   ' local \u2192 ' + info.nextShift.toLowerCase() + ' shift';
    chipEl.setAttribute('aria-label',
      info.shift + ' shift, ' + formatCountdown(info.msUntil) +
      ' until the ' + info.nextShift.toLowerCase() + ' shift at ' + hh);
  }

  /* ---- instrument 1: live presence/activity ticker ---- */

  function buildTicker() {
    tickerEl = el('div', 'cwi-ticker cwi-collapsed');
    tickerEl.id = 'cwi-ticker';
    tickerEl.setAttribute('role', 'status');
    tickerEl.setAttribute('aria-live', 'polite');
    tickerEl.innerHTML =
      '<span class="cwi-ticker-mode cwi-off"><span class="cwi-mode-dot" aria-hidden="true"></span>' +
      '<span class="cwi-mode-text">OFFLINE</span></span>' +
      '<div class="cwi-ticker-viewport"><div class="cwi-ticker-track"></div></div>' +
      '<div class="cwi-ticker-dots" aria-label="Agent presence"></div>';
    document.body.appendChild(tickerEl);
    modeEl = tickerEl.querySelector('.cwi-ticker-mode');
    trackEl = tickerEl.querySelector('.cwi-ticker-track');
    dotsEl = tickerEl.querySelector('.cwi-ticker-dots');
    // touch-friendly: tap-hold pauses the scroll; release resumes
    tickerEl.addEventListener('pointerdown', function () {
      tickerEl.classList.add('cwi-paused');
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (t) {
      tickerEl.addEventListener(t, function () {
        tickerEl.classList.remove('cwi-paused');
      });
    });
  }

  function setModeLabel(mode) {
    if (!modeEl) return;
    var txt = modeEl.querySelector('.cwi-mode-text');
    modeEl.classList.toggle('cwi-live', mode === 'LIVE');
    modeEl.classList.toggle('cwi-off', mode !== 'LIVE');
    txt.textContent = mode === 'LIVE' ? 'LIVE' : 'OFFLINE \u2014 last known activity';
  }

  function renderEvents(gl) {
    if (!trackEl || !gl || !Array.isArray(gl.events)) return;
    var evs = gl.events.slice(-MAX_ITEMS);
    var items = evs.map(function (ev) {
      var h = gl.humanize(ev);
      return '<span class="cwi-ticker-item">' + h.html +
             ' <i class="cwi-ticker-time">' + h.time + '</i></span>';
    });
    if (!items.length) {
      items = ['<span class="cwi-ticker-item">no ledger events yet</span>'];
    }
    var html = items.join('<span class="cwi-ticker-sep" aria-hidden="true">\u00B7\u00B7\u00B7</span>');
    // two identical runs -> seamless -50% marquee loop
    trackEl.innerHTML =
      '<div class="cwi-ticker-run">' + html + '</div>' +
      '<div class="cwi-ticker-run" aria-hidden="true">' + html + '</div>';
  }

  function agentIds(gl) {
    var ids = gl && gl.names ? Object.keys(gl.names) : [];
    ids.sort(function (a, b) {
      var ia = AGENT_ORDER.indexOf(a), ib = AGENT_ORDER.indexOf(b);
      if (ia === -1) ia = 999;
      if (ib === -1) ib = 999;
      return ia - ib;
    });
    return ids.slice(0, MAX_DOTS);
  }

  function renderDots(gl) {
    if (!dotsEl) return;
    dotsEl.innerHTML = '';
    if (!gl) return;
    agentIds(gl).forEach(function (id) {
      var p = (gl.presenceByAgent && gl.presenceByAgent[id]) || {};
      var cls = classifyPresence(p.ageMs);
      var name = (gl.names && gl.names[id]) || id.replace(/^agent:/, '');
      var dot = document.createElement('span');
      dot.className = 'cwi-dot cwi-' + cls;
      dot.setAttribute('role', 'img');
      dot.setAttribute('aria-label',
        name + ' \u2014 ' + (cls === 'live' ? 'live' : 'stale/offline'));
      dot.title = name + (cls === 'live' ? ' \u00B7 live' : ' \u00B7 stale/offline');
      dotsEl.appendChild(dot);
    });
  }

  // Kill rule: absent client, or OFFLINE for OFFLINE_KILL_AFTER polls
  // in a row -> collapse to the honest offline pill.
  function handleUpdate(gl) {
    if (!tickerEl) return;
    if (gl.mode === 'LIVE') {
      offlineStreak = 0;
      tickerEl.classList.remove('cwi-offline', 'cwi-collapsed');
      setModeLabel('LIVE');
      renderEvents(gl);
      renderDots(gl);
    } else {
      offlineStreak += 1;
      setModeLabel('OFFLINE');
      tickerEl.classList.add('cwi-offline');
      renderDots(gl);   // presence stays honest: stale dots go gray
      if (shouldCollapseTicker(offlineStreak)) {
        tickerEl.classList.add('cwi-collapsed');
      }
      // else: strip stays up, frozen on last-known events (never live-claimed)
    }
  }

  function wireTicker() {
    var gl = window.GearLedgerLive;
    if (!gl || typeof gl.onUpdate !== 'function') return false;
    gl.onUpdate(handleUpdate);
    handleUpdate(gl);   // evaluate current state immediately
    return true;
  }

  function init() {
    buildChip();    // instrument 2 — always on, zero network
    buildTicker();  // instrument 1 — honest by default (collapsed)
    wired = wireTicker();
    if (!wired) {
      // ledger-live.js may load after us; one deferred re-check.
      setTimeout(function () {
        if (!wired) wireTicker();
      }, 2500);
    }
  }

  window.CWIInstruments = {
    init: init,
    pure: PURE
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
