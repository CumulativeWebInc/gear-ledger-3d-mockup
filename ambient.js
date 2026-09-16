/* ============================================================
   ambient.js — CWI Agent Stage: DOM-layer ambient life, surprises, polish.
   (Worker C, 2026-09-16)

   What it does, honestly:
   - Presence-driven life: a compact fleet-presence strip (10 registered
     agents) whose dots glow-pulse on FRESH live presence and dim on
     stale/offline. Driven ONLY by real data (window.GearLedgerLive when
     present, else window.WorldClient LIVE snapshots). No simulation.
   - Shift transitions: watches the page's own #shiftbadge; on a DAY<->NIGHT
     flip it runs a ~2s lighting wash across the viewport plus a short,
     skippable SHIFT CHANGE cinematic (caption + gentle canvas ease).
   - Surprise: double-click the ocean/canvas -> expanding bioluminescent
     ripple rings at the click point (pure CSS, GPU-cheap).
   - Polish: mobile HUD fixes (wrap, 44px touch targets, safe-area),
     rAF-throttled housekeeping, honesty text overrides for SAMPLE-vs-live
     labels the page renders.

   What it does NOT do (kill-rule cuts, reported honestly):
   - The 3D scene runs inside the page's <script type="module"> closure and
     exposes NOTHING on window (no scene, camera, lights, agents). Direct
     3D marker pulses, camera moves toward KingCode, and agent turn-to-face
     are therefore CUT; DOM-layer equivalents ship instead. Every effect
     probes defensively and no-ops silently when its targets are absent.

   Pure logic (no DOM) is exported for node tests:
     - node: module.exports = CWIAmbientPure
     - browser: window.CWIAmbientPure
   ============================================================ */
(function () {
'use strict';

/* ---------------- PURE LOGIC (no DOM) ---------------- */
var DAY_START_H = 6;                 /* day shift: 06:00-18:00 local */
var DAY_END_H = 18;
var FRESH_MS = 15 * 60 * 1000;       /* presence older than this = stale (mirrors ledger-live.js) */

/* Local hour 06:00-18:00 -> DAY, otherwise NIGHT. Mirrors the page's
   currentShift() and instruments.js resolveShift. */
function resolveShift(d) {
  var h = d.getHours();
  return (h >= DAY_START_H && h < DAY_END_H) ? 'DAY' : 'NIGHT';
}

/* Next shift boundary strictly after d (06:00 or 18:00 local). */
function nextBoundary(d) {
  var b = new Date(d.getTime());
  var h = d.getHours();
  if (h < DAY_START_H) b.setHours(DAY_START_H, 0, 0, 0);
  else if (h < DAY_END_H) b.setHours(DAY_END_H, 0, 0, 0);
  else { b.setDate(b.getDate() + 1); b.setHours(DAY_START_H, 0, 0, 0); }
  return b;
}

/* Did a shift transition happen between two moments? */
function shiftTransitioned(a, b) {
  return resolveShift(a) !== resolveShift(b);
}

/* Presence -> glow classification. Pure; mirrors ledger-live.js staleness.
   p: {status, ageMs, stale} | null
   - 'fresh'   : online with a recent, finite, non-negative heartbeat
   - 'stale'   : a record exists but it is flagged stale, too old, or not online
   - 'offline' : no record at all (no live data for this agent) */
function classifyPresenceGlow(p) {
  if (!p) return 'offline';
  var age = p.ageMs;
  var badAge = !(typeof age === 'number' && isFinite(age) && age >= 0) || age > FRESH_MS;
  if (p.stale === true || badAge) return 'stale';
  var s = String(p.status || '').toLowerCase();
  return s === 'online' ? 'fresh' : 'stale';
}

/* Late-joiner shift-inheritance rule. Mirrors the page's shiftDef():
     MUSE_CWI <-> KingCode (day) / RogueCode (night)
     everyone else <-> their day def / night expression variant.
   A spawn is correct iff the resolved form equals the ACTIVE shift. */
function lateJoinerVariant(agentName, shift) {
  var night = String(shift).toUpperCase() === 'NIGHT';
  var chief = agentName === 'MUSE_CWI';
  return {
    form: night ? 'night' : 'day',
    chief: chief,
    label: chief ? (night ? 'RogueCode' : 'KingCode')
                 : (agentName + (night ? ' · night' : ''))
  };
}

/* The 10 registered ledger agents (agent_id + handle + public name,
   verified against forms.json schema gear-ledger-3d-forms/v1). */
var AGENTS = [
  { id: 'agent:MUSE_CWI',     name: 'MUSE_CWI',     pub: 'KingCode' },
  { id: 'agent:CWI_AandR',    name: 'CWI_AandR',    pub: 'Needle'   },
  { id: 'agent:CWI_Marketing',name: 'CWI_Marketing',pub: 'Marquee'  },
  { id: 'agent:CWI_Sync',     name: 'CWI_Sync',     pub: 'Seal'     },
  { id: 'agent:CWI_Radio',    name: 'CWI_Radio',    pub: 'Dial'     },
  { id: 'agent:CWI_Press',    name: 'CWI_Press',    pub: 'Dateline' },
  { id: 'agent:CWI_Studio',   name: 'CWI_Studio',   pub: 'Fader'    },
  { id: 'agent:CWI_Data',     name: 'CWI_Data',     pub: 'Ledger'   },
  { id: 'agent:CWI_Affairs',  name: 'CWI_Affairs',  pub: 'Charter'  },
  { id: 'agent:CWI_Results',  name: 'CWI_Results',  pub: 'Receipt'  }
];

var Pure = {
  DAY_START_H: DAY_START_H, DAY_END_H: DAY_END_H, FRESH_MS: FRESH_MS,
  AGENTS: AGENTS,
  resolveShift: resolveShift,
  nextBoundary: nextBoundary,
  shiftTransitioned: shiftTransitioned,
  classifyPresenceGlow: classifyPresenceGlow,
  lateJoinerVariant: lateJoinerVariant
};

if (typeof module !== 'undefined' && module.exports) module.exports = Pure;

var W = (typeof window !== 'undefined') ? window : null;
var G = (typeof globalThis !== 'undefined') ? globalThis : null;
if (G) { try { G.CWIAmbientPure = Pure; } catch (e) {} }
if (!W || !W.document) return; /* node/test env: pure logic only above */

/* ---------------- DOM LAYER (all defensive, never throws) ---------------- */
var D = W.document;
var reducedMotion = false;
try { reducedMotion = W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

function $(id) { try { return D.getElementById(id); } catch (e) { return null; } }
function bodyBroadcast() { try { return D.body && (D.body.classList.contains('broadcast') || D.body.classList.contains('se-tour')); } catch (e) { return false; } }

/* ----- injected stylesheet (cwi- prefixed; narrow page fixes scoped) ----- */
var CSS = [
  '/* cwi-ambient injected */',
  '#cwi-wash{position:fixed;inset:0;z-index:12;pointer-events:none;opacity:0;background-size:260% 100%;background-position:100% 0}',
  '#cwi-wash.cwi-to-night{background-image:linear-gradient(105deg,rgba(8,14,30,0) 25%,rgba(30,52,110,.42) 55%,rgba(10,20,44,.72) 85%)}',
  '#cwi-wash.cwi-to-day{background-image:linear-gradient(105deg,rgba(255,210,77,0) 25%,rgba(255,196,66,.30) 55%,rgba(255,242,205,.48) 85%)}',
  '#cwi-wash.cwi-play{animation:cwiWash 2.2s ease-out}',
  '@keyframes cwiWash{0%{opacity:0;background-position:100% 0}16%{opacity:1}100%{opacity:0;background-position:0% 0}}',
  '#cwi-shiftcap{position:fixed;z-index:45;left:50%;top:38%;transform:translate(-50%,-50%) scale(.94);text-align:center;pointer-events:auto;cursor:pointer;opacity:0;transition:opacity .35s,transform .35s}',
  '#cwi-shiftcap.cwi-show{opacity:1;transform:translate(-50%,-50%) scale(1)}',
  '#cwi-shiftcap h2{margin:0;font-size:clamp(26px,6vw,54px);letter-spacing:.22em;font-weight:800;color:#fff;text-shadow:0 2px 24px rgba(53,196,255,.55),0 1px 3px rgba(0,0,0,.7)}',
  '#cwi-shiftcap p{margin:10px 0 0;font-size:13px;letter-spacing:.18em;color:#bfe9ff}',
  '#cwi-shiftcap .cwi-skip{display:inline-block;margin-top:14px;font-size:11px;letter-spacing:.14em;color:#8fa9bc;border:1px solid rgba(255,255,255,.25);border-radius:999px;padding:8px 16px}',
  '#scene.cwi-zoom{transition:transform 4.2s cubic-bezier(.25,.7,.3,1)}',
  '#cwi-presence{position:fixed;z-index:21;left:16px;bottom:24px;max-width:calc(100vw - 32px);background:rgba(10,22,34,.82);border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:10px 12px;backdrop-filter:blur(8px);font-size:11px}',
  '#cwi-presence .cwi-phead{display:flex;align-items:center;gap:8px;font-weight:800;letter-spacing:.16em;color:#dfeaf2;cursor:pointer;min-height:44px;background:none;border:0;padding:0;font-size:11px;font-family:inherit;width:100%;text-align:left}',
  '#cwi-presence .cwi-pmode{font-size:9px;letter-spacing:.12em;border-radius:6px;padding:3px 8px;background:#ffb020;color:#1a1206}',
  '#cwi-presence .cwi-pmode.cwi-live{background:#1f9d5c;color:#eafff3}',
  '#cwi-presence .cwi-pmode.cwi-off{background:#3a4a5a;color:#c8d4de}',
  '#cwi-presence .cwi-pdots{display:flex;gap:9px;align-items:center;padding:4px 2px 2px}',
  '#cwi-presence.cwi-collapsed .cwi-pdots{display:none}',
  '.cwi-dot{width:14px;height:14px;border-radius:50%;background:#5a6b7a;opacity:.35;flex:0 0 auto;position:relative}',
  '.cwi-dot.cwi-fresh{background:#35d07f;opacity:1;animation:cwiPulse 2.4s ease-in-out infinite}',
  '.cwi-dot.cwi-stale{background:#ffb020;opacity:.5}',
  '@keyframes cwiPulse{0%,100%{box-shadow:0 0 0 0 rgba(53,208,127,.55)}50%{box-shadow:0 0 0 7px rgba(53,208,127,0)}}',
  '.cwi-ripple{position:fixed;z-index:14;pointer-events:none;border-radius:50%;transform:translate(-50%,-50%)}',
  '.cwi-ripple i{position:absolute;inset:0;border-radius:50%;border:2px solid rgba(126,240,193,.85);animation:cwiRipple 1.25s ease-out forwards}',
  '.cwi-ripple b{position:absolute;left:50%;top:50%;width:10px;height:10px;border-radius:50%;background:radial-gradient(circle,rgba(126,240,193,.9),rgba(126,240,193,0) 70%);transform:translate(-50%,-50%);animation:cwiFlash .6s ease-out forwards}',
  '@keyframes cwiRipple{0%{transform:scale(.15);opacity:.95}100%{transform:scale(3.2);opacity:0}}',
  '@keyframes cwiFlash{0%{opacity:.9;transform:translate(-50%,-50%) scale(1)}100%{opacity:0;transform:translate(-50%,-50%) scale(2.4)}}',
  'body.broadcast #cwi-presence,body.se-tour #cwi-presence,body.broadcast #cwi-shiftcap,body.se-tour #cwi-shiftcap,body.broadcast #cwi-wash,body.se-tour #cwi-wash{display:none!important}',
  '@media (max-width:899px){#cwi-presence{left:12px;bottom:calc(118px + env(safe-area-inset-bottom,0px));padding:8px 10px}}',
  '@media (max-width:480px){',
  ' #topright{flex-wrap:wrap;justify-content:flex-end;row-gap:6px;max-width:calc(100vw - 20px)}',
  ' #samplepill,#shiftbadge{font-size:10px;padding:6px 10px}',
  ' #pill-time{display:none}',
  ' #se-kicker{top:9%}',
  ' #cwi-shiftcap{top:34%}',
  '}',
  '@media (pointer:coarse){',
  ' #tourcap .dot{min-width:44px;min-height:44px}',
  ' #iclose{width:44px;height:44px}',
  ' #mp-close{width:44px;height:44px}',
  '}',
  '@media (prefers-reduced-motion:reduce){',
  ' #cwi-wash.cwi-play,.cwi-ripple i,.cwi-ripple b,.cwi-dot.cwi-fresh{animation:none!important}',
  ' #cwi-shiftcap{transition:none}',
  '}'
].join('\n');

function injectCSS() {
  try {
    if ($('cwi-ambient-css')) return;
    var st = D.createElement('style');
    st.id = 'cwi-ambient-css';
    st.textContent = CSS;
    D.head.appendChild(st);
  } catch (e) {}
}

/* ----- presence: real data only ----- */
function readPresence() {
  var GL = W.GearLedgerLive;
  if (GL && GL.presenceByAgent) {
    return { mode: GL.mode === 'LIVE' ? 'LIVE' : 'OFFLINE', byId: GL.presenceByAgent || {} };
  }
  var WC = W.WorldClient;
  if (WC && WC.mode === 'LIVE') {
    var snap = null;
    try { snap = WC.getSnapshot(); } catch (e) {}
    if (snap && Array.isArray(snap.agents)) {
      var byId = {}, now = Date.now();
      for (var i = 0; i < snap.agents.length; i++) {
        var a = snap.agents[i] || {};
        var age = a.presence_at ? now - Date.parse(a.presence_at) : Infinity;
        byId[a.agent_id] = {
          status: a.presence || 'unknown',
          ageMs: age,
          stale: !(age >= 0) || age > FRESH_MS
        };
      }
      return { mode: 'LIVE', byId: byId };
    }
    return { mode: 'OFFLINE', byId: {} };
  }
  return { mode: 'SAMPLE', byId: {} };
}

var presenceState = { mode: 'SAMPLE', byId: {} };
var presenceDirty = true;
var lastPresenceSig = '';

function agoStr(ms) {
  if (!(ms >= 0) || !isFinite(ms)) return 'no heartbeat';
  var m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  return Math.floor(m / 60) + 'h ago';
}

function buildPresenceStrip() {
  try {
    if ($('cwi-presence')) return;
    var wrap = D.createElement('div');
    wrap.id = 'cwi-presence';
    wrap.setAttribute('role', 'status');
    wrap.setAttribute('aria-label', 'Fleet presence');
    var head = D.createElement('button');
    head.className = 'cwi-phead';
    head.id = 'cwi-phead';
    head.setAttribute('aria-expanded', 'true');
    head.innerHTML = '<span>FLEET</span><span class="cwi-pmode" id="cwi-pmode">SAMPLE</span>';
    head.addEventListener('click', function () {
      var c = wrap.classList.toggle('cwi-collapsed');
      head.setAttribute('aria-expanded', c ? 'false' : 'true');
    });
    var dots = D.createElement('div');
    dots.className = 'cwi-pdots';
    dots.id = 'cwi-pdots';
    for (var i = 0; i < AGENTS.length; i++) {
      var s = D.createElement('span');
      s.className = 'cwi-dot';
      s.setAttribute('data-agent', AGENTS[i].id);
      dots.appendChild(s);
    }
    wrap.appendChild(head);
    wrap.appendChild(dots);
    D.body.appendChild(wrap);
  } catch (e) {}
}

function renderPresence() {
  try {
    var dotsEl = $('cwi-pdots'), modeEl = $('cwi-pmode');
    if (!dotsEl) return;
    var sig = presenceState.mode + '|';
    var info = [];
    for (var i = 0; i < AGENTS.length; i++) {
      var g = classifyPresenceGlow(presenceState.byId[AGENTS[i].id] || null);
      sig += g.charAt(0);
      info.push(g);
    }
    if (sig === lastPresenceSig) return;
    lastPresenceSig = sig;
    if (modeEl) {
      modeEl.textContent = presenceState.mode;
      modeEl.className = 'cwi-pmode' + (presenceState.mode === 'LIVE' ? ' cwi-live' : (presenceState.mode === 'OFFLINE' ? ' cwi-off' : ''));
      modeEl.title = presenceState.mode === 'LIVE' ? 'Real presence from the Gear Ledger'
        : presenceState.mode === 'OFFLINE' ? 'Ledger unreachable — last known state, dimmed'
        : 'No live feed — simulated cast, illustrative only';
    }
    var kids = dotsEl.children;
    for (var k = 0; k < kids.length && k < AGENTS.length; k++) {
      (function (el, ag, g) {
        el.className = 'cwi-dot ' + (g === 'fresh' ? 'cwi-fresh' : (g === 'stale' ? 'cwi-stale' : ''));
        var p = presenceState.byId[ag.id];
        var detail = g === 'fresh' ? ('LIVE · ' + (p && p.status) + ' · heartbeat ' + agoStr(p && p.ageMs))
          : g === 'stale' ? ('STALE · ' + (p ? (p.status + ' · heartbeat ' + agoStr(p.ageMs)) : 'no fresh heartbeat'))
          : (presenceState.mode === 'OFFLINE' ? 'OFFLINE · no live data' : 'SAMPLE · simulated cast');
        el.title = ag.pub + ' — ' + detail;
        el.setAttribute('aria-label', ag.pub + ': ' + detail);
      })(kids[k], AGENTS[k], info[k]);
    }
  } catch (e) {}
}

function refreshPresence() {
  try {
    var next = readPresence();
    presenceState = next;
    presenceDirty = true;
  } catch (e) {}
}

/* ----- shift transitions: wash + cinematic ----- */
var lastShift = resolveShift(new Date());
var washEl = null, capEl = null, capTimer = 0;

function badgeShift() {
  try {
    var b = $('shiftbadge');
    if (!b) return null;
    var t = (b.textContent || '').toUpperCase();
    if (t.indexOf('NIGHT') >= 0) return 'NIGHT';
    if (t.indexOf('DAY') >= 0) return 'DAY';
    return null;
  } catch (e) { return null; }
}

function ensureWash() {
  if (washEl) return washEl;
  washEl = D.createElement('div');
  washEl.id = 'cwi-wash';
  washEl.setAttribute('aria-hidden', 'true');
  D.body.appendChild(washEl);
  return washEl;
}

function playWash(shift) {
  try {
    if (bodyBroadcast() || reducedMotion) return;
    var w = ensureWash();
    w.classList.remove('cwi-play', 'cwi-to-night', 'cwi-to-day');
    void w.offsetWidth;
    w.classList.add('cwi-play', shift === 'NIGHT' ? 'cwi-to-night' : 'cwi-to-day');
  } catch (e) {}
}

function ensureCap() {
  if (capEl) return capEl;
  capEl = D.createElement('div');
  capEl.id = 'cwi-shiftcap';
  capEl.setAttribute('role', 'status');
  capEl.innerHTML = '<h2 id="cwi-cap-title"></h2><p id="cwi-cap-sub"></p><br><span class="cwi-skip">TAP TO SKIP</span>';
  capEl.addEventListener('click', skipCinematic);
  D.body.appendChild(capEl);
  return capEl;
}

function skipCinematic() {
  try {
    if (capTimer) { clearTimeout(capTimer); capTimer = 0; }
    if (capEl) capEl.classList.remove('cwi-show');
    var sc = $('scene');
    if (sc) { sc.classList.remove('cwi-zoom'); sc.style.transform = ''; }
  } catch (e) {}
}

function playCinematic(shift) {
  try {
    if (bodyBroadcast() || reducedMotion || D.hidden) return;
    var c = ensureCap();
    var night = shift === 'NIGHT';
    $('cwi-cap-title').textContent = 'SHIFT CHANGE — ' + shift;
    $('cwi-cap-sub').textContent = night ? 'ROGUECODE TAKES THE WORLD · CROWN OFF' : 'KINGCODE RESUMES · CROWN ON';
    if (capTimer) clearTimeout(capTimer);
    c.classList.add('cwi-show');
    /* gentle ease on the viewport (DOM layer; the 3D camera is not exposed) */
    var sc = $('scene');
    if (sc && !reducedMotion) {
      sc.classList.add('cwi-zoom');
      sc.style.transform = 'scale(1.045)';
      setTimeout(function () { try { sc.style.transform = 'scale(1)'; } catch (e) {} }, 2100);
      setTimeout(function () { try { sc.classList.remove('cwi-zoom'); sc.style.transform = ''; } catch (e) {} }, 4500);
    }
    capTimer = setTimeout(skipCinematic, 4200);
  } catch (e) {}
}

function onShiftChange(shift) {
  lastShift = shift;
  playWash(shift);
  playCinematic(shift);
}

function watchShift() {
  try {
    var b = $('shiftbadge');
    if (b && W.MutationObserver) {
      var mo = new W.MutationObserver(function () {
        var s = badgeShift();
        if (s && s !== lastShift) onShiftChange(s);
      });
      mo.observe(b, { childList: true, characterData: true, subtree: true });
    }
  } catch (e) {}
}

/* ----- surprise: bioluminescent ripple on double-click ----- */
function spawnRipple(x, y) {
  try {
    if (bodyBroadcast()) return;
    var olds = D.querySelectorAll('.cwi-ripple');
    while (olds.length >= 8) { olds[0].parentNode.removeChild(olds[0]); olds = D.querySelectorAll('.cwi-ripple'); }
    var r = D.createElement('div');
    r.className = 'cwi-ripple';
    r.style.left = x + 'px';
    r.style.top = y + 'px';
    r.style.width = r.style.height = '120px';
    r.setAttribute('aria-hidden', 'true');
    r.innerHTML = '<i></i><i style="animation-delay:.18s"></i><b></b>';
    r.addEventListener('animationend', function () {
      try { if (r.parentNode) r.parentNode.removeChild(r); } catch (e) {}
    });
    D.body.appendChild(r);
  } catch (e) {}
}

function watchRipple() {
  try {
    var sc = $('scene');
    if (!sc) return;
    sc.addEventListener('dblclick', function (e) {
      spawnRipple(e.clientX || 0, e.clientY || 0);
    });
  } catch (e) {}
}

/* ----- honesty: text overrides for labels the page renders ----- */
function fixLegend() {
  try {
    var WC = W.WorldClient;
    var live = !!(WC && WC.mode === 'LIVE');
    var items = D.querySelectorAll('#legend .li');
    for (var i = 0; i < items.length; i++) {
      var sp = items[i].querySelector('span');
      if (!sp) continue;
      if (sp.textContent.indexOf('live-sample') < 0 && !sp.getAttribute('data-cwi-fixed')) continue;
      sp.setAttribute('data-cwi-fixed', '1');
      sp.innerHTML = '<b>Purple arc</b> — gear in transit (HANDOFFS island). ' +
        (live ? 'Animated dash = concept visual, not live tracking.'
              : 'Animated dash = simulated movement (SAMPLE cast).');
    }
  } catch (e) {}
}

function watchTourHonesty() {
  try {
    var body = $('tc-body');
    if (!body || !W.MutationObserver) return;
    var guard = false;
    var mo = new W.MutationObserver(function () {
      if (guard) return;
      try {
        var WC = W.WorldClient;
        var live = !!(WC && WC.mode === 'LIVE');
        var t = body.textContent || '';
        if (!live && t.indexOf('Ten forms for the ten registered ledger agents') === 0 &&
            t.indexOf('operational state from the ledger') >= 0 &&
            t.indexOf('SAMPLE cast') < 0) {
          guard = true;
          body.textContent = t.replace('Glow and motion show operational state from the ledger:',
            'Glow and motion show the SAMPLE cast\u2019s simulated operational state (illustrative, not live ledger data):');
          guard = false;
        }
      } catch (e) { guard = false; }
    });
    mo.observe(body, { childList: true, characterData: true, subtree: true });
  } catch (e) {}
}

/* ----- subscriptions: update presence on every live event ----- */
function subscribe() {
  try {
    var GL = W.GearLedgerLive;
    if (GL && typeof GL.onUpdate === 'function') {
      GL.onUpdate(function () { refreshPresence(); fixLegend(); });
    }
  } catch (e) {}
  try {
    var WC = W.WorldClient;
    if (WC && typeof WC.onEvent === 'function') {
      WC.onEvent(function () { refreshPresence(); fixLegend(); });
    }
  } catch (e) {}
  try {
    if (W.__liveUpgradeHooks && typeof W.__liveUpgradeHooks.push === 'function') {
      W.__liveUpgradeHooks.push(function () { refreshPresence(); fixLegend(); });
    }
  } catch (e) {}
  /* slow safety net: presence ages even without events */
  try { setInterval(refreshPresence, 60000); } catch (e) {}
}

/* ----- rAF-throttled housekeeping: no per-frame allocations ----- */
var lastHouse = 0;
function housekeeping(t) {
  if (t - lastHouse >= 1000) {
    lastHouse = t;
    try {
      var s = resolveShift(new Date());
      if (s !== lastShift) onShiftChange(s);
    } catch (e) {}
    if (presenceDirty) { presenceDirty = false; renderPresence(); }
  }
}
function loop(t) {
  try { housekeeping(t || 0); } catch (e) {}
  try { W.requestAnimationFrame(loop); } catch (e) {}
}

/* ----- boot ----- */
function init() {
  try {
    injectCSS();
    buildPresenceStrip();
    refreshPresence();   /* lastPresenceSig starts '' so first renderPresence() paints */
    renderPresence();
    watchShift();
    watchRipple();
    fixLegend();
    watchTourHonesty();
    subscribe();
    /* re-check legend wording shortly after boot (live upgrade may land late) */
    setTimeout(function () { try { fixLegend(); refreshPresence(); } catch (e) {} }, 8000);
    try { W.requestAnimationFrame(loop); } catch (e) {}
  } catch (e) { /* ambient must never break the world */ }
}

if (D.readyState === 'loading') {
  D.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

})();
