/* ============================================================
   genome-panel.js — Expression Genome panel for the Agent Stage.
   ------------------------------------------------------------
   GENOME_PANEL_V1 — deploy marker (grep target for live checks)

   Self-contained ES module. Load with:
     <script type="module" src="genome-panel.js"></script>

   On DOMContentLoaded it hooks agent selection by watching the
   existing #inspector (raycast tap -> openInspector(sel) with
   sel.kind === 'AGENT'; titles are "<public_name> — form from
   identity"). When an agent is selected it fetches that agent's
   REAL Expression Genome JSON from cwi-dna-portability and renders
   an honest panel: name, URN, sponsor, vibe line, the day/night
   expression auto-resolved by viewer-local time, palette swatches,
   marks, an integrity chip from a structural check, and a deep link
   to the Genome Gallery.

   Honest states only: loading spinner while fetching, and a plain
   "genome unavailable" state on any fetch/parse failure. Never
   renders fabricated genome data.

   The panel hides itself in broadcast (?broadcast=1) and
   self-expression tour (?tour=self-expression) modes via
   body.broadcast / body.se-tour, like the other sheets.

   Pure functions (URN_TO_SLUG, genomeUrlForUrn, checkGenomeStructure,
   resolveShift, urnFromInspectorTitle) are exported so node --test
   can import them; the DOM shell below only runs when `document`
   exists.
   ============================================================ */

/* ---------- pure, DOM-free section (importable by node --test) ---------- */

export const GENOME_BASE = 'https://cumulativewebinc.github.io/cwi-dna-portability/genome/examples';
export const GALLERY_URL = 'https://cumulativewebinc.github.io/cwi-dna-portability/gallery/';
export const PANEL_VERSION = 'genome-panel/v1';

/* Canonical URN -> genome file slug map (all 10 registered agents). */
export const URN_TO_SLUG = {
  'agent:MUSE_CWI':   'muse-cwi',
  'agent:CWI_AandR':   'cwi-aandr',
  'agent:CWI_Marketing':'cwi-marketing',
  'agent:CWI_Sync':    'cwi-sync',
  'agent:CWI_Radio':   'cwi-radio',
  'agent:CWI_Press':   'cwi-press',
  'agent:CWI_Studio':  'cwi-studio',
  'agent:CWI_Data':    'cwi-data',
  'agent:CWI_Affairs': 'cwi-affairs',
  'agent:CWI_Results': 'cwi-results',
};

/* Inspector titles are "<public_name> — form from identity" (index.html). */
export const PUBLIC_NAME_TO_URN = {
  'KingCode': 'agent:MUSE_CWI',
  'Needle':   'agent:CWI_AandR',
  'Marquee':  'agent:CWI_Marketing',
  'Seal':     'agent:CWI_Sync',
  'Dial':     'agent:CWI_Radio',
  'Dateline': 'agent:CWI_Press',
  'Fader':    'agent:CWI_Studio',
  'Ledger':   'agent:CWI_Data',
  'Charter':  'agent:CWI_Affairs',
  'Receipt':  'agent:CWI_Results',
};

export function genomeUrlForUrn(urn) {
  const slug = URN_TO_SLUG[urn];
  return slug ? GENOME_BASE + '/' + slug + '.genome.json' : null;
}

/* Recover an agent URN from the inspector title. Returns null when the
   title does not name a known agent (caller shows the honest state). */
export function urnFromInspectorTitle(title) {
  if (typeof title !== 'string') return null;
  const name = title.split(' — ')[0].trim();
  return PUBLIC_NAME_TO_URN[name] || null;
}

/* Lightweight structural check. Required keys: genome_version,
   identity.urn, expression.day, expression.night. Never throws. */
export function checkGenomeStructure(g) {
  const missing = [];
  if (!g || typeof g !== 'object' || Array.isArray(g))
    return { ok: false, missing: ['<not an object>'] };
  if (!g.genome_version) missing.push('genome_version');
  const id = g.identity;
  if (!id || typeof id !== 'object' || !id.urn) missing.push('identity.urn');
  const ex = g.expression;
  if (!ex || typeof ex !== 'object' || !ex.day) missing.push('expression.day');
  if (!ex || typeof ex !== 'object' || !ex.night) missing.push('expression.night');
  return { ok: missing.length === 0, missing };
}

/* Day/night resolver. Day is 06:00–18:00 viewer-local, night otherwise.
   Accepts an optional genome schedule {nightStartHour, nightEndHour}
   (defaults 18 / 6, matching expression.schedule in the genomes).
   `hour` is 0–23 (Date.getHours()). Boundary rule: 06:00 -> day,
   18:00 -> night. */
export function resolveShift(hour, schedule) {
  const h = Number(hour);
  if (!Number.isFinite(h)) return 'day';
  const hh = ((h % 24) + 24) % 24;
  const ns = schedule && Number.isFinite(Number(schedule.nightStartHour))
    ? Number(schedule.nightStartHour) : 18;
  const ne = schedule && Number.isFinite(Number(schedule.nightEndHour))
    ? Number(schedule.nightEndHour) : 6;
  if (ns === ne) return 'day';
  if (ns > ne) return (hh >= ns || hh < ne) ? 'night' : 'day'; // night wraps midnight
  return (hh >= ns && hh < ne) ? 'night' : 'day';
}

/* ---------- DOM shell (browser only) ---------- */

const CSS = `
#genome-panel{position:fixed;z-index:26;left:16px;top:76px;width:344px;max-width:calc(100vw - 32px);
  max-height:calc(100vh - 170px);overflow:auto;background:rgba(10,22,34,.94);
  border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:16px 16px 14px;color:#f5f7fa;
  font-family:"Helvetica Neue",Helvetica,Arial,system-ui,sans-serif;display:none;backdrop-filter:blur(10px);
  box-shadow:0 12px 40px rgba(0,0,0,.45)}
#genome-panel.open{display:block}
body.broadcast #genome-panel,body.se-tour #genome-panel{display:none!important}
#genome-panel .gp-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
#genome-panel .gp-kicker{font-size:10px;letter-spacing:.22em;font-weight:800;color:#7ef0c1}
#genome-panel .gp-x{width:36px;height:36px;border-radius:10px;border:0;background:rgba(255,255,255,.1);
  color:#f5f7fa;font-size:16px;cursor:pointer}
#genome-panel h3{margin:0 0 2px;font-size:19px;letter-spacing:.02em}
#genome-panel .gp-urn{font-size:11px;color:#8fa9bc;font-family:monospace;margin-bottom:8px;word-break:break-all}
#genome-panel .gp-chips{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}
#genome-panel .gp-chip{font-size:10px;font-weight:800;letter-spacing:.1em;border-radius:6px;padding:4px 8px}
#genome-panel .gp-chip.ok{background:rgba(61,255,136,.16);color:#3dff88;border:1px solid rgba(61,255,136,.5)}
#genome-panel .gp-chip.bad{background:rgba(255,92,92,.14);color:#ff8a8a;border:1px solid rgba(255,92,92,.5)}
#genome-panel .gp-chip.live{background:rgba(53,196,255,.14);color:#7fd8ff;border:1px solid rgba(53,196,255,.5)}
#genome-panel .gp-sponsor{font-size:12px;color:#bfe9ff;margin:6px 0}
#genome-panel .gp-vibe{font-size:13px;line-height:1.55;color:#dfeaf2;font-style:italic;
  border-left:3px solid rgba(126,240,193,.5);padding-left:10px;margin:10px 0}
#genome-panel .gp-shift{margin-top:12px;border-top:1px solid rgba(255,255,255,.1);padding-top:10px}
#genome-panel .gp-shiftname{font-size:13px;font-weight:800;letter-spacing:.06em;margin-bottom:8px}
#genome-panel .gp-swatches{display:flex;gap:10px;margin:8px 0}
#genome-panel .gp-sw{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:10px;color:#8fa9bc}
#genome-panel .gp-dot{width:34px;height:34px;border-radius:50%;border:2px solid rgba(255,255,255,.25)}
#genome-panel .gp-marks{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}
#genome-panel .gp-mark{font-size:11px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);
  border-radius:999px;padding:4px 10px;color:#dfeaf2}
#genome-panel .gp-visor{font-size:11px;color:#8fa9bc;margin-top:6px}
#genome-panel .gp-toggle{background:none;border:0;color:#7fd8ff;font-size:11px;font-weight:700;
  cursor:pointer;padding:6px 0;letter-spacing:.04em}
#genome-panel .gp-gallery{display:block;text-align:center;margin-top:12px;padding:12px 14px;border-radius:10px;
  background:rgba(53,196,255,.18);border:1px solid rgba(53,196,255,.5);color:#f5f7fa;
  font-weight:700;font-size:13px;text-decoration:none}
#genome-panel .gp-gallery:hover{background:rgba(53,196,255,.3)}
#genome-panel .gp-load{display:flex;align-items:center;gap:12px;padding:18px 4px;font-size:13px;color:#bfe9ff}
#genome-panel .gp-spin{width:26px;height:26px;border-radius:50%;flex:none;
  border:3px solid rgba(53,196,255,.25);border-top-color:#35c4ff;animation:gp-spin 1s linear infinite}
@keyframes gp-spin{to{transform:rotate(360deg)}}
#genome-panel .gp-err{padding:14px 4px;font-size:13px;line-height:1.55;color:#ffd9d9}
#genome-panel .gp-retry{margin-top:10px;padding:10px 16px;border-radius:10px;border:1px solid rgba(255,255,255,.2);
  background:rgba(255,255,255,.08);color:#f5f7fa;font-weight:700;font-size:12px;cursor:pointer}
#genome-panel .gp-note{font-size:10px;color:#8fa9bc;margin-top:10px;line-height:1.5}
@media (max-width:899px){
  #genome-panel{left:8px;right:8px;width:auto;top:calc(60px + env(safe-area-inset-top,0px));max-height:40vh}
}
@media (prefers-reduced-motion:reduce){
  #genome-panel .gp-spin{animation:none}
}`;

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
function safeColor(c) { return (typeof c === 'string' && HEX_RE.test(c.trim())) ? c.trim() : '#5a6672'; }
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { cache: 'no-store', signal: ctrl.signal })
    .finally(() => clearTimeout(t));
}

function initGenomePanel() {
  const insp = document.getElementById('inspector');
  if (!insp) return;

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const panel = el('aside', null, null);
  panel.id = 'genome-panel';
  panel.setAttribute('aria-live', 'polite');
  panel.setAttribute('aria-label', 'Expression Genome');
  document.body.appendChild(panel);

  const cache = new Map(); // urn -> parsed genome (successes only)
  let seq = 0;
  let lastKey = null;

  function hidePanel() { panel.classList.remove('open'); }

  function headRow() {
    const head = el('div', 'gp-head');
    head.appendChild(el('span', 'gp-kicker', 'EXPRESSION GENOME'));
    const x = el('button', 'gp-x', '✕');
    x.setAttribute('aria-label', 'Close genome panel');
    x.onclick = hidePanel;
    head.appendChild(x);
    return head;
  }

  function showLoading(urn) {
    panel.innerHTML = '';
    panel.appendChild(headRow());
    const box = el('div', 'gp-load');
    box.appendChild(el('div', 'gp-spin'));
    box.appendChild(el('span', null, 'Fetching Expression Genome for ' + urn + '…'));
    panel.appendChild(box);
    panel.classList.add('open');
  }

  function showError(urn, err, retry) {
    panel.innerHTML = '';
    panel.appendChild(headRow());
    const box = el('div', 'gp-err');
    box.appendChild(el('div', null, 'Genome unavailable — the Expression Genome for ' + urn + ' could not be loaded.'));
    const why = el('div', 'gp-note', 'Reason: ' + (err && err.name === 'AbortError' ? 'request timed out' : String((err && err.message) || err)));
    box.appendChild(why);
    const b = el('button', 'gp-retry', 'Retry');
    b.onclick = retry;
    box.appendChild(b);
    panel.appendChild(box);
    panel.classList.add('open');
  }

  function showUnknown(title) {
    panel.innerHTML = '';
    panel.appendChild(headRow());
    const box = el('div', 'gp-err');
    box.appendChild(el('div', null, 'Genome unavailable — no Expression Genome is registered for this selection.'));
    box.appendChild(el('div', 'gp-note', 'Selection: ' + title));
    panel.appendChild(box);
    panel.classList.add('open');
  }

  function renderGenome(urn, g) {
    const check = checkGenomeStructure(g);
    const identity = (g && g.identity) || {};
    const schedule = (g && g.expression && g.expression.schedule) || null;
    let shift = resolveShift(new Date().getHours(), schedule);

    panel.innerHTML = '';
    panel.appendChild(headRow());
    panel.appendChild(el('h3', null, identity.name || urn));
    panel.appendChild(el('div', 'gp-urn', identity.urn || urn));

    const chips = el('div', 'gp-chips');
    const integ = el('span', 'gp-chip ' + (check.ok ? 'ok' : 'bad'),
      (check.ok ? '✓ INTEGRITY' : '✗ CHECK FAILED'));
    if (!check.ok) integ.title = 'Missing: ' + check.missing.join(', ');
    chips.appendChild(integ);
    chips.appendChild(el('span', 'gp-chip live', 'LIVE GENOME'));
    panel.appendChild(chips);

    const sponsor = identity.sponsor;
    const sponsorName = typeof sponsor === 'string' ? sponsor
      : (sponsor && sponsor.name) ? sponsor.name : null;
    if (sponsorName) panel.appendChild(el('div', 'gp-sponsor', 'Sponsor · ' + sponsorName));

    const vibe = g && g.personality && g.personality.vibe;
    if (vibe) panel.appendChild(el('p', 'gp-vibe', '“' + vibe + '”'));

    const shiftBox = el('div', 'gp-shift');
    const toggle = el('button', 'gp-toggle');
    function drawShift() {
      shiftBox.innerHTML = '';
      const expr = (g.expression && g.expression[shift]) || {};
      const isDay = shift === 'day';
      const label = (isDay ? '☀ DAY EXPRESSION' : '🌙 NIGHT EXPRESSION') +
        ' — ' + (expr.displayName || (isDay ? 'Day' : 'Night'));
      shiftBox.appendChild(el('div', 'gp-shiftname', label + ' · local ' +
        String(new Date().getHours()).padStart(2, '0') + ':00'));
      const pal = expr.palette || {};
      const sw = el('div', 'gp-swatches');
      ['primary', 'secondary', 'accent'].forEach((k) => {
        const wrap = el('div', 'gp-sw');
        const dot = el('div', 'gp-dot');
        const col = safeColor(pal[k]);
        dot.style.background = col;
        wrap.appendChild(dot);
        wrap.appendChild(el('span', null, k + ' ' + (HEX_RE.test(String(pal[k] || '').trim()) ? String(pal[k]).trim() : '—')));
        sw.appendChild(wrap);
      });
      shiftBox.appendChild(sw);
      const marks = Array.isArray(expr.marks) ? expr.marks : [];
      const mbox = el('div', 'gp-marks');
      if (marks.length) marks.forEach((m) => mbox.appendChild(el('span', 'gp-mark', String(m))));
      else mbox.appendChild(el('span', 'gp-mark', 'no marks listed'));
      shiftBox.appendChild(mbox);
      if (expr.visor) shiftBox.appendChild(el('div', 'gp-visor', 'visor · ' + String(expr.visor)));
      toggle.textContent = isDay ? 'View night expression →' : '← View day expression';
    }
    toggle.onclick = () => { shift = (shift === 'day') ? 'night' : 'day'; drawShift(); };
    drawShift();
    panel.appendChild(shiftBox);
    panel.appendChild(toggle);

    const a = el('a', 'gp-gallery', 'Open in Genome Gallery ↗');
    a.href = GALLERY_URL;
    a.target = '_blank';
    a.rel = 'noopener';
    panel.appendChild(a);

    panel.appendChild(el('div', 'gp-note',
      'Genome v' + (g.genome_version || 'unknown') + ' · fetched live from cwi-dna-portability · day 06:00–18:00 local.'));
    panel.classList.add('open');
  }

  function selectAgent(urn, title) {
    const my = ++seq;
    if (!urn) { showUnknown(title || ''); return; }
    const url = genomeUrlForUrn(urn);
    if (!url) { showUnknown(title || ''); return; }
    showLoading(urn);
    if (cache.has(urn)) {
      if (my === seq) renderGenome(urn, cache.get(urn));
      return;
    }
    fetchWithTimeout(url, 12000)
      .then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then((g) => {
        cache.set(urn, g);
        if (my === seq) renderGenome(urn, g);
      })
      .catch((err) => {
        if (my === seq) showError(urn, err, () => selectAgent(urn, title));
      });
  }

  function onMut() {
    if (document.body.classList.contains('broadcast') ||
        document.body.classList.contains('se-tour')) { lastKey = null; hidePanel(); return; }
    const open = insp.classList.contains('open');
    if (!open) { lastKey = null; hidePanel(); return; }
    const tagEl = document.getElementById('i-tag');
    const titleEl = document.getElementById('i-title');
    const tag = tagEl ? tagEl.textContent.trim() : '';
    const title = titleEl ? titleEl.textContent.trim() : '';
    if (tag !== 'AGENT') { lastKey = null; hidePanel(); return; }
    const urn = urnFromInspectorTitle(title);
    const key = urn || ('title:' + title);
    if (key !== lastKey) { lastKey = key; selectAgent(urn, title); }
  }

  new MutationObserver(onMut).observe(insp, {
    attributes: true, attributeFilter: ['class'],
    childList: true, characterData: true, subtree: true,
  });
  onMut();
  window.__genomePanel = { version: PANEL_VERSION };
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGenomePanel);
  } else {
    initGenomePanel();
  }
}
