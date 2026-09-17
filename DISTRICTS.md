# Districts — home islands for the 11 agents

Twenty Minds decision (2026-09-17): **data-first**. Every district's visual
life derives from live ledger operational state; department theming is the
dressing on top. The spectacle serves the data, never the reverse.
Full reasoning: `intelligence/equip-packs/twenty-minds-dryruns/2026-09-17/world-districts-design-20minds.md`.

## Layout

- 11 districts, 1:1 with the chartered agents, on an outer ring (r=78) around
  the central GEAR LEDGER hub. One bridge hub→district each.
- Each district island reuses the existing island factory (deck, trim ring,
  foam, CWI logo decal, sign, palms) — zero changes to existing builders.
- Athena's Reasoning district is the observatory: slightly larger (r=8 vs 7),
  same data rules as everyone else.
- District identity (name/department/accent) comes from `AGENT_ROSTER` in
  `districts.js`; the test battery asserts it matches `forms.json` exactly.

## District life (the data-first part)

Each district carries a light-pillar beacon + ground halo in the agent's
accent color. Both are pure functions of the agent's `classifyAgent()` state
via `districtBeacon()`:

| state     | activity | pulse  | beacon intensity |
|-----------|----------|--------|------------------|
| EXECUTING | 1.00     | 2.6 Hz | 1.75×            |
| THINKING  | 0.80     | 2.2 Hz | 1.43×            |
| WAITING   | 0.45     | 1.4 Hz | 0.87×            |
| DORMANT   | 0.12     | 0.7 Hz | 0.34×            |
| SAMPLE    | 0.25     | 1.0 Hz | 0.55×            |

Brighter, faster districts always mean more real work happening. Nothing is
timer-faked; the live hook runs after `applyLiveState`, reading fresh form
states.

## Files

- `build/districts.js` — pure logic (dependency-free): `AGENT_ROSTER`,
  `districtDefs()`, `districtBridges()`, `districtActivity()`,
  `districtBeacon()`, `districtSlot()`, `districtNameplate()`,
  `validateDistricts()`.
- `build/index.html` — delimited integration blocks (import; ISLANDS/
  BRIDGES push; DISTRICT LIFE beacons + hook + animation; DISTRICT
  NAMEPLATES billboarded labels).
- `tests/districts.test.mjs` — 15 tests: determinism, 1:1 agent mapping,
  layout validity, monotonic state→visual mapping, nameplate charter facts,
  roster≡forms.json.

## District nameplates (2026-09-17, Athena)

Each district carries a billboarded floating nameplate — agent name +
department in the district accent color, `fog:false` so it punches through
fog like PRIME's label. Monument Valley lesson from DESIGN-STUDY.md:
billboards always face the camera, so signage reads from every angle —
phone legibility first. The labels are static charter facts via
`districtNameplate()`; the beacon pillars (never the labels) carry live
operational state. 11 sprites, zero per-frame allocation.

## Known notes

- One hub→district bridge arcs over the AGENT STAGE island's rim (elevated,
  ~1.3 units above deck at the crossing). Intentional, no collision.
- Visual render verification is VM-limited (Chromium 152 blocks loopback page
  loads; GitHub Pages unreachable from this VM's browser). Verified instead:
  126/126 tests green, module syntax valid, all scene identifiers resolve,
  integration follows the proven island/bridge/hook code paths.
- Not yet deployed: the robot-bodies builder is mid-flight in the same files;
  deploy coordination belongs to KingCode to avoid colliding commits.
