# FORMS.md — Agent Stage form derivation

The Agent Stage (7th island of the Gear Ledger 3D world) gives each of the 10
registered ledger agents a 3D form **generated from its department identity**.
The scene reads `forms.json` as data and builds every form from it — no form
is hand-placed or picked from a stock avatar set.

Source identities: `~/workspace/cwi-company/departments/*/BRIEF.md`,
`~/workspace/cwi-company/departments/results/CHARTER.md`, and the live role
strings in `live-data.json` (which come from the canonical Gear Ledger store).

## Per-agent derivation: identity trait → visual choice

| Agent (public name) | Identity trait (real, from brief/role) | Geometry | Color | Why |
|---|---|---|---|---|
| MUSE_CWI (KingCode) | Chief of staff; "the only claimed public face"; orchestrates 9 departments | **spire**: octahedron + orbiting command ring | signal amber `#FFB224` | The spire is command height; the orbiting ring is the 9 departments circling the chief. Amber is the CWI brand authority color. |
| CWI_AandR (Needle) | "The scout. Ear-first, blunt, allergic to hype." | **needle**: sharp cone + tilted ear-dish torus | phosphor green `#3DFF88` | The cone is the blunt verdict; the dish is ear-first listening. Green = go/no-go signal. |
| CWI_Marketing (Marquee) | "The showrunner. Every release is an event." | **marquee**: half-torus arch + radiating light bars | warm red `#FF5C5C` | A theater marquee: the arch frames the event, the bars are its lights. |
| CWI_Sync (Seal) | "The closer. Nothing ships uncleared." | **seal**: stamp cylinder + interlocking ring | violet `#B388FF` | The stamp is clearance; the locked ring is the closed deal. Violet = deal ink. |
| CWI_Radio (Dial) | "The DJ. Lives on rotation." | **dial**: platter cylinder + rotating tone arm | glow blue `#35C4FF` | A turntable: the platter is the rotation, the arm reads it. Blue = airwaves. |
| CWI_Press (Dateline) | "The wire chief. Every claim carries its citation." | **broadcast**: mast + expanding signal rings | teal `#4DE3C2` | The mast is the wire; the rings are the signal going out. Teal = newsroom ticker. |
| CWI_Studio (Fader) | "The craftsperson." House style: neon/cyberpunk. | **fader**: console box + sliding knob | orange `#FF9F43` | A mixer fader: the craft is in the slide. Orange = studio warmth. |
| CWI_Data (Ledger) | "The quant. No number without a source." | **lattice**: icosahedron wireframe + solid core | ice blue `#A8E6FF` | The lattice is the model; the solid core is the verified fact inside it. |
| CWI_Affairs (Charter) | "The guardian. Reads the fine print." | **charter**: protective dome + scroll (partial cylinder) | parchment gold `#D8B36A` | The dome guards; the scroll is the paperwork. Gold = documents. |
| CWI_Results (Receipt) | "The closer of outcomes." Result → mechanism → verification → kill rule. | **receipt**: spike + stacked discs | paper white `#F5F7FA`, green core | A receipt spike filing finished outcomes; the core glows phosphor green while executing. |

Motion signatures (per form, from `forms.json`): each form carries
`spin` (rad/s weight for its rotating part), `bob` (vertical bob frequency),
`turn` (yaw-drift period in seconds), and `amp` (bob amplitude weight), so forms
are recognizable in motion as well as in shape. Special behaviors: chief's
command ring orbits; radio's tone arm rotates; studio's fader knob slides;
press's signal rings expand.

## Operational-state expression (driven ONLY by live-data.json)

The form's *expression* — core brightness, motion energy, drift — is a pure
function of the agent's live record at each 10-minute refresh. On screen it is
labeled **"operational state"**, never a mood or emotion.

| State | Derivation from live-data.json | Expression |
|---|---|---|
| EXECUTING | holds a genuine live `current_task_id` — non-null and not pointing at terminal work (`cancelled`/`verified`/etc.) | focused motion ×1.6, bright core, stable geometry |
| THINKING | `current_task_id` changed since the previous snapshot | slower pulse ×0.5 |
| WAITING | `presence == "online"`, no live task | low-energy drift, dimmed core |
| DORMANT | `presence != "online"` OR `presence_at` older than 30 min | dimmed to ~15%, minimal motion |
| SAMPLE | no live data (SAMPLE pill showing) | neutral dim expression, state tag labeled SAMPLE |

Priority: DORMANT > THINKING > EXECUTING > WAITING. THINKING fires for one
refresh when the task id changed, then settles. If live data is missing
or stale, the world keeps its honest SAMPLE pill behavior — form expression
degrades gracefully and never fakes activity.

## Presence links (driven ONLY by task data)

When two agents' work touches in the same snapshot, a brief additive link
pulse is drawn between their forms:

- **Shared task**: both agents hold the SAME non-null live `current_task_id`. Two agents merely executing different tasks at once are NOT linked.
- **Name reference**: one agent's task title names another agent (handle or
  public name, case-insensitive).

No links are drawn in SAMPLE mode. The stage legend plaque states both rules.

## Performance

10 forms × ~5 low-poly meshes each; one shared animation callback. No new
dependencies, zero backend. Broadcast edition (`broadcast.html`) is a
standalone Canvas2D page and is unaffected.
