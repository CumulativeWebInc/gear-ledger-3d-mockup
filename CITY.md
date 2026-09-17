# PRIME — the founding city · derivation notes (Athena, 2026-09-17)

Twenty Minds decision: `~/workspace/cwi-company/intelligence/equip-packs/twenty-minds-dryruns/2026-09-17/founding-city-prime-20minds.md`

## The decision
The 11 agents already live at the hub-islands with articulated robot bodies.
PRIME rises **there** — a civic disc elevated above the hub island — instead of
on a new landmass. Reasons: zero re-anchoring of agents, zero collision with
islands/bridges/robots (the disc floats at y=20, bridges arc at ~3), fastest
legible win on Black's phone, and the district islands become PRIME's
neighborhoods without touching their data-first behavior.

## What PRIME is
- **Civic disc** (r=15, y=20): dark alloy platform, glowing cyan rim, chord-clipped street grid.
- **8 light towers**: deterministic ring placement, heights 8–16, cyan/gold/sea-green/violet.
- **4 data obelisks**: dark glass, emissive cores.
- **Central spire**: CWI gold (#FFB224), tallest structure (26), octahedron crown.
- **3 holographic rings**: orbit the spire, alternating direction (Athena's calibration-ring language).
- **4 foundation light-beams**: translucent pillars anchoring the disc to the hub island below.
- **Data-first life**: every emissive/opacity in PRIME is driven by the mean of the
  districts' live beacon targets — the city breathes with real ledger work. Idle ≈ 0.55×, full work ≈ 1.0×.

## The Earth frame (earth.js)
- **World ocean**: 2600×2600 dark plane at y=−0.6 with a faint survey grid — the home
  waters (400×400 animated) sit at the center of it.
- **6 continent plates**: PROCEDURAL ABSTRACT LANDFORMS (seeded sine-lobe blobs),
  never traced from real coastlines. Extruded 2.5, dark basalt, glowing cyan coastlines.
- **Survey beacons**: 3 dim pulsing markers per continent — future city sites, not cities yet.
- Names are neutral descriptors (Northern/Western/Eastern/Southern Landmass, polar caps).
  `worldCopyClean()` + tests enforce: no real place names, no politics, never "replica".

## Copy guardrails (user-facing)
- "Inspired by Earth's geography" — never "replica".
- "Built for agents" — never post-human.
- Geographic descriptors only — never political.

## Files
- `build/earth.js` — pure plan: ocean, plates, beacons, ban-list, `earthPlan()`.
- `build/city.js` — pure plan: `CITY` identity, `cityPlan(seed)`, `minTowerGap()`.
- `build/index.html` — imports both new modules with `?v=20260917w3`;
  `stage-logic.js` untouched at `?v=20260917w2` (importer+module unchanged together,
  so no bump needed there); mesh construction is additive only.
- `tests/earth.test.mjs`, `tests/city.test.mjs` — determinism, validity, guardrails, import query.

## Kill rule
No visible founding city live by 2026-09-23 10:00 ET → scope back to robots-only, report why.
