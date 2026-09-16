/* sample-engine.js — the ORIGINAL fixed SAMPLE dataset + sim event source,
 * extracted verbatim from index.html (was: inline `const SAMPLE = {...}`).
 *
 * Implements the WorldClient data interface in SAMPLE mode. Every event this
 * engine emits is tagged `sample: true`; the LIVE renderer drops those.
 */
(function () {
  'use strict';

  window.__SAMPLE_DATA = {
    hub: { handoffs: '1,284', agents: '9', integrity: 'VERIFIED', chains: '36' },
    departments: [
      { name: 'A&R', share: 14, equipped: 31, out: 22, color: '#FF6B6B' },
      { name: 'Marketing & Social', share: 12, equipped: 27, out: 19, color: '#FF9F43' },
      { name: 'Sync & Licensing', share: 16, equipped: 36, out: 25, color: '#B388FF' },
      { name: 'Radio & Playlists', share: 11, equipped: 25, out: 17, color: '#35C4FF' },
      { name: 'Press & PR', share: 9, equipped: 20, out: 14, color: '#F368E0' },
      { name: 'Content Studio', share: 13, equipped: 29, out: 21, color: '#7EF0C1' },
      { name: 'Data & Analytics', share: 15, equipped: 34, out: 24, color: '#54D8FF' },
      { name: 'Business Affairs', share: 10, equipped: 22, out: 15, color: '#FFD24D' },
    ],
    podium: [
      { agent: 'MUSE_CWI', handoffs: 47, medal: 'GOLD', color: '#FFD24D' },
      { agent: 'AGENT-07', handoffs: 38, medal: 'SILVER', color: '#DCE7EE' },
      { agent: 'AGENT-12', handoffs: 33, medal: 'BRONZE', color: '#D89A5B' },
    ],
    receivers: [
      { agent: 'AGENT-04', handoffs: 41 }, { agent: 'AGENT-09', handoffs: 35 },
      { agent: 'AGENT-02', handoffs: 29 }, { agent: 'AGENT-11', handoffs: 26 },
    ],
    legends: [
      { item: 'Signal Boy “Origin”', trips: 214, h: 3.2 },
      { item: 'Needle Drop', trips: 167, h: 2.4 },
      { item: 'First Spin', trips: 142, h: 1.6 },
    ],
    arcs: [
      { from: 'Studio', to: 'Radio', units: 3, day: 21 },
      { from: 'A&R', to: 'Sync', units: 2, day: 22 },
      { from: 'Data', to: 'Press', units: 4, day: 23 },
      { from: 'Radio', to: 'Marketing', units: 2, day: 24 },
      { from: 'Affairs', to: 'A&R', units: 1, day: 25 },
      { from: 'Sync', to: 'Studio', units: 3, day: 26 },
    ],
    timeline: [12, 9, 14, 18, 22, 17, 8, 6, 13, 19, 24, 21, 16, 9, 7, 15, 20, 26, 23, 18, 10, 8, 16, 22, 27, 24, 19, 11, 9, 17],
  };

  // SAMPLE-mode evidence: the explainer, never a fake record.
  function evidenceFor(/* sel */) {
    return {
      kind: 'sample',
      title: 'Evidence (sample)',
      body: 'In the live product, this links to the signed handoff record. This mockup carries no real records.',
      preview: 'handoff #0482 · gear: signal-boy/origin · from AGENT-07 → AGENT-12 · day 21 of 30 · seal: SAMPLE',
    };
  }

  window.SampleEngine = {
    mode: 'SAMPLE',
    data: window.__SAMPLE_DATA,
    getSnapshot() { return window.__SAMPLE_DATA; },
    evidenceFor,
  };
})();
