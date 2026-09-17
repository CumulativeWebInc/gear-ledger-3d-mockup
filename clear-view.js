/* clear-view.js — CLEAR VIEW mode for the Gear Ledger 3D world.
 *
 * One-tap UI hide for mobile (Black's iPhone complaint: HUD cards cover the world).
 * - Floating toggle (bottom-right) hides all HUD except a small restore pill.
 * - Activity area becomes a bottom drawer with a peek handle + unread count.
 * - Idle auto-fade (4s) dims non-essential HUD to 15%; any tap restores it.
 * - Every floating card gets a visible × close button.
 * - No-ops in body.broadcast / body.se-tour (those modes own the UI already).
 * - Kill rule: if expected HUD nodes are missing, degrades to toggle-only,
 *   never throws, never touches #scene / the 3D canvas.
 *
 * Pure logic lives in ClearViewPure so node --test can exercise it headlessly.
 * Loaded as a classic <script> (no build step); wired by the coordinator.
 */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Pure logic — no DOM. Shared with tests.                             *
   * ------------------------------------------------------------------ */
  var STORE_CLEAR = 'gear-ledger-3d.clearView';
  var STORE_FADE  = 'gear-ledger-3d.clearViewFade';
  var STORE_DRAWER= 'gear-ledger-3d.clearViewDrawer';
  var FADE_DELAY_MS = 4000;
  var SMALL_SCREEN_PX = 640;

  var ClearViewPure = {
    STORE_CLEAR: STORE_CLEAR,
    STORE_FADE: STORE_FADE,
    STORE_DRAWER: STORE_DRAWER,
    FADE_DELAY_MS: FADE_DELAY_MS,
    SMALL_SCREEN_PX: SMALL_SCREEN_PX,

    /* hidden<->shown toggle state machine */
    toggleClear: function (clear) { return !clear; },

    /* drawer state machine: handle tap flips open<->closed; peek is a resting state */
    drawerDefault: function (viewportWidth) {
      return (viewportWidth <= SMALL_SCREEN_PX) ? 'closed' : 'peek';
    },
    drawerToggle: function (state) {
      return (state === 'open') ? 'closed' : 'open';
    },
    isDrawerValid: function (state) {
      return state === 'open' || state === 'closed' || state === 'peek';
    },

    /* idle-fade: fade HUD when there has been no interaction for delayMs */
    shouldFade: function (nowMs, lastInteractMs, fadeOn, delayMs) {
      if (!fadeOn) return false;
      var delay = (typeof delayMs === 'number' && delayMs >= 0) ? delayMs : FADE_DELAY_MS;
      return (nowMs - lastInteractMs) >= delay;
    },

    /* never fight the page's own clean-feed modes */
    isSpecialMode: function (bodyClassList) {
      var classes = bodyClassList || [];
      for (var i = 0; i < classes.length; i++) {
        if (classes[i] === 'broadcast' || classes[i] === 'se-tour') return true;
      }
      return false;
    },

    /* CSS class the page body carries for a drawer state */
    drawerBodyClass: function (state) {
      return 'cwi-cv-drawer-' + state;
    }
  };

  /* Node test hook — invisible in the browser (no `module` there). */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ClearViewPure;
  }

  /* ------------------------------------------------------------------ *
   * Browser wiring.                                                     *
   * ------------------------------------------------------------------ */
  function init() {
    try { boot(); }
    catch (e) { /* never break the page */ }
  }

  function boot() {
    var doc = (typeof document !== 'undefined') ? document : null;
    var win = (typeof window !== 'undefined') ? window : null;
    if (!doc || !win || !doc.body) return;

    /* Compatibility: broadcast / se-tour own the UI — clear-view no-ops. */
    var bodyClasses = [];
    try { bodyClasses = Array.prototype.slice.call(doc.body.classList); } catch (e) {}
    if (ClearViewPure.isSpecialMode(bodyClasses)) return;

    var store = win.__glStore || null;
    function storeGet(k, fb) {
      try { var v = store ? store.get(k) : null; return (v === null || v === undefined) ? fb : v; }
      catch (e) { return fb; }
    }
    function storeSet(k, v) {
      try { if (store) store.set(k, v); } catch (e) {}
    }

    /* Expected HUD nodes. Missing ones simply degrade features. */
    var el = {
      hud: doc.getElementById('hud'),
      inspector: doc.getElementById('inspector'),
      toast: doc.getElementById('toast'),
      tourcap: doc.getElementById('tourcap'),
      musicpanel: doc.getElementById('musicpanel'),
      musicticker: doc.getElementById('musicticker'),
      welcome: doc.getElementById('welcome'),
      livefeed: doc.getElementById('livefeed'),
      presence: doc.getElementById('cwi-presence'),
      ticker: doc.getElementById('cwi-ticker'),
      scene: doc.getElementById('scene')
    };
    var hudFound = !!(el.hud || el.inspector || el.toast || el.tourcap || el.musicpanel);

    /* ---- state ---- */
    var clear = storeGet(STORE_CLEAR, '0') === '1';
    var fadeOn = storeGet(STORE_FADE, '1') === '1'; /* default on */
    var drawer = storeGet(STORE_DRAWER, null);
    if (!ClearViewPure.isDrawerValid(drawer)) {
      var w = (win.innerWidth || 1024);
      drawer = ClearViewPure.drawerDefault(w);
    }
    var unread = 0;
    var lastInteract = Date.now();

    /* ---- inject controls ---- */
    var toggle = doc.createElement('button');
    toggle.className = 'cwi-cv-toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-label', 'Clear view: hide interface');
    toggle.innerHTML = '<span class="cwi-cv-eye" aria-hidden="true">👁</span>' +
      '<span class="cwi-cv-toggle-label">Hide UI</span>';

    var pill = doc.createElement('div');
    pill.className = 'cwi-cv-pill';
    pill.setAttribute('role', 'group');
    pill.setAttribute('aria-label', 'Interface hidden');
    pill.innerHTML =
      '<button type="button" class="cwi-cv-pill-show" aria-label="Show interface">Show UI</button>' +
      '<button type="button" class="cwi-cv-pill-menu" aria-label="View options" aria-haspopup="true">⋯</button>' +
      '<div class="cwi-cv-menu" role="menu" hidden>' +
        '<button type="button" class="cwi-cv-menu-row" data-act="fade" role="menuitemcheckbox">' +
          '<span>Auto-fade</span><b class="cwi-cv-fade-state"></b></button>' +
        '<button type="button" class="cwi-cv-menu-row" data-act="drawer" role="menuitem">' +
          '<span>Activity drawer</span><b class="cwi-cv-drawer-state"></b></button>' +
      '</div>';
    var pillShow = pill.querySelector('.cwi-cv-pill-show');
    var pillMenuBtn = pill.querySelector('.cwi-cv-pill-menu');
    var menu = pill.querySelector('.cwi-cv-menu');
    var fadeStateEl = pill.querySelector('.cwi-cv-fade-state');
    var drawerStateEl = pill.querySelector('.cwi-cv-drawer-state');

    var handle = doc.createElement('button');
    handle.className = 'cwi-cv-handle';
    handle.type = 'button';
    handle.setAttribute('aria-label', 'Toggle activity drawer');
    handle.innerHTML = '<span class="cwi-cv-dot" aria-hidden="true">●</span>' +
      '<span class="cwi-cv-handle-label">Activity</span>' +
      '<span class="cwi-cv-badge" hidden></span>' +
      '<span class="cwi-cv-chev" aria-hidden="true">▲</span>';

    try {
      doc.body.appendChild(toggle);
      doc.body.appendChild(pill);
      doc.body.appendChild(handle);
    } catch (e) { return; }

    /* ---- dismissible × on every floating card ---- */
    function addClose(host, onClose, label) {
      if (!host) return;
      try {
        if (host.querySelector('.x, #iclose, #mp-close, .cwi-cv-x')) return; /* already has one */
        var b = doc.createElement('button');
        b.type = 'button';
        b.className = 'cwi-cv-x';
        b.setAttribute('aria-label', label || 'Close');
        b.textContent = '✕';
        b.addEventListener('click', function (ev) { ev.stopPropagation(); onClose(host); });
        host.appendChild(b);
        try { host.classList.add('cwi-cv-xhost'); } catch (e2) {}
      } catch (e) {}
    }
    try {
      var sheets = doc.querySelectorAll('.sheet');
      for (var i = 0; i < sheets.length; i++) {
        (function (sheet) {
          addClose(sheet, function () {
            try { sheet.classList.remove('open'); } catch (e) {}
            /* hint sheet's explore button also dismisses welcome state */
            var explore = doc.getElementById('hint-explore');
            if (sheet.id === 'hint' && explore) { try { explore.click(); } catch (e) {} }
          }, 'Close panel');
        })(sheets[i]);
      }
      addClose(el.toast, function () { try { el.toast.classList.remove('show'); } catch (e) {} }, 'Dismiss');
      addClose(el.inspector, function () { try { el.inspector.classList.remove('open'); } catch (e) {} }, 'Close inspector');
      addClose(el.musicpanel, function () {
        try { el.musicpanel.style.display = 'none'; } catch (e) {}
      }, 'Close music panel');
    } catch (e) {}

    /* ---- unread count: watch cards appearing while drawer is closed ---- */
    function bumpUnread() {
      if (drawer === 'open') return;
      unread++;
      renderHandle();
    }
    try {
      var mo = new MutationObserver(function (muts) {
        for (var m = 0; m < muts.length; m++) {
          var t = muts[m].target;
          if (!t || !t.classList) continue;
          var shown = t.classList.contains('show') || t.classList.contains('open');
          if (shown && (t.id === 'toast' || t.classList.contains('sheet'))) bumpUnread();
          /* the welcome card shows via the hidden attribute, not a class */
          if (t.id === 'welcome' && !t.hidden) bumpUnread();
          /* keep drawer state honest when the page itself opens/closes the inspector */
          if (t === el.inspector && !clear) {
            if (t.classList.contains('open') && drawer !== 'open') {
              drawer = 'open'; storeSet(STORE_DRAWER, drawer); unread = 0; apply();
            } else if (!t.classList.contains('open') && drawer === 'open') {
              drawer = 'closed'; storeSet(STORE_DRAWER, drawer); apply();
            }
          }
        }
      });
      mo.observe(doc.body, { attributes: true, attributeFilter: ['class', 'hidden'], subtree: true });
    } catch (e) {}

    /* ---- render ---- */
    function renderHandle() {
      var badge = handle.querySelector('.cwi-cv-badge');
      var chev = handle.querySelector('.cwi-cv-chev');
      if (unread > 0 && drawer !== 'open') {
        badge.hidden = false;
        badge.textContent = unread > 9 ? '9+' : String(unread);
      } else {
        badge.hidden = true;
      }
      chev.textContent = (drawer === 'open') ? '▼' : '▲';
      handle.setAttribute('aria-expanded', drawer === 'open' ? 'true' : 'false');
    }

    function renderMenu() {
      fadeStateEl.textContent = fadeOn ? 'on' : 'off';
      drawerStateEl.textContent = drawer;
    }

    function apply() {
      /* never hide #scene itself */
      doc.body.classList.toggle('cwi-cv-hidden', clear);
      doc.body.classList.remove('cwi-cv-drawer-open', 'cwi-cv-drawer-closed', 'cwi-cv-drawer-peek');
      if (!clear) doc.body.classList.add(ClearViewPure.drawerBodyClass(drawer));
      /* drawer owns inspector visibility; the page's own open/close flows through it */
      if (el.inspector && !clear) {
        try { el.inspector.classList.toggle('open', drawer === 'open'); } catch (e2) {}
      }
      toggle.setAttribute('aria-label', clear ? 'Show interface' : 'Clear view: hide interface');
      toggle.querySelector('.cwi-cv-toggle-label').textContent = clear ? '' : 'Hide UI';
      renderHandle();
      renderMenu();
    }

    /* ---- events ---- */
    toggle.addEventListener('click', function () {
      clear = ClearViewPure.toggleClear(clear);
      storeSet(STORE_CLEAR, clear ? '1' : '0');
      lastInteract = Date.now();
      apply();
    });
    pillShow.addEventListener('click', function () {
      clear = false;
      storeSet(STORE_CLEAR, '0');
      lastInteract = Date.now();
      apply();
    });
    pillMenuBtn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      menu.hidden = !menu.hidden;
    });
    menu.addEventListener('click', function (ev) {
      var row = ev.target.closest ? ev.target.closest('.cwi-cv-menu-row') : null;
      if (!row) return;
      var act = row.getAttribute('data-act');
      if (act === 'fade') {
        fadeOn = !fadeOn;
        storeSet(STORE_FADE, fadeOn ? '1' : '0');
        if (!fadeOn) doc.body.classList.remove('cwi-cv-faded');
        lastInteract = Date.now();
      } else if (act === 'drawer') {
        drawer = ClearViewPure.drawerToggle(drawer === 'open' ? 'open' : 'closed');
        storeSet(STORE_DRAWER, drawer);
        unread = 0;
      }
      renderMenu();
      renderHandle();
      apply();
    });
    doc.addEventListener('click', function (ev) {
      if (!menu.hidden && !pill.contains(ev.target)) menu.hidden = true;
    });
    handle.addEventListener('click', function () {
      drawer = ClearViewPure.drawerToggle(drawer);
      storeSet(STORE_DRAWER, drawer);
      if (drawer === 'open') unread = 0;
      lastInteract = Date.now();
      apply();
    });

    /* ---- idle auto-fade ---- */
    function poke() {
      lastInteract = Date.now();
      doc.body.classList.remove('cwi-cv-faded');
    }
    var pokeEvents = ['pointerdown', 'pointermove', 'wheel', 'touchstart', 'keydown'];
    for (var p = 0; p < pokeEvents.length; p++) {
      win.addEventListener(pokeEvents[p], poke, { passive: true, capture: true });
    }
    win.setInterval(function () {
      try {
        if (ClearViewPure.shouldFade(Date.now(), lastInteract, fadeOn, FADE_DELAY_MS) && !clear) {
          doc.body.classList.add('cwi-cv-faded');
        }
      } catch (e) {}
    }, 1000);

    /* ---- go ---- */
    renderHandle();
    renderMenu();
    apply();
  }

  if (typeof document !== 'undefined' && document.readyState !== 'loading') {
    init();
  } else if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', init);
  }
  /* In Node (tests) there is no document — nothing runs. */

})(typeof globalThis !== 'undefined' ? globalThis : this);
