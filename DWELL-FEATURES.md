# Dwell Features

*Status: Left-bookend — Features phase*
*Date: 2026-07-01*
*Position in sequence: Story ✅ → Requirements ✅ → Use Cases ✅ → Business Types ✅ → **Features** → Proof Story ✅ → SIG ✅ → Test Spec ✅ → Improved SIG ✅*
*Traceability: Every feature traces to requirements and use cases*

---

## Feature Altitude Convention

- **Parent feature** — headline capability the business needs
- **Sub-feature** — meaningful part of that capability
- **Leaf rule** — smallest enforced check; the thing that either passes or fails

Features describe WHAT the system does, not HOW. No implementation vocabulary.

---

## F-1 — Learn a Domain

*The learner can declare a goal, follow a structured path toward it, and record when they've achieved it.*

### F-1.1 — Declare Intent and Orient

The learner states a learning goal in natural language and receives an immediate orientation: where they start, what the target is, and what the biggest gaps are.

**Leaf rules:**
- A learning intent must be accepted in natural language without structured input
- On intent declaration, the system must produce a starting-point estimate within the session
- The orientation summary must name the learner's starting readiness percentage
- If no expertise is available for the declared domain, the learner must be informed immediately and the intent preserved

**Satisfies:** REQ-DW-LGM-01, REQ-DW-LGM-02, REQ-DW-DTD-02
**Exercised by:** UC-01, UC-11

---

### F-1.2 — Navigate a Structured Learning Path

The learner progresses through content sequenced to their current state — warm nodes skip to where they left off, cold nodes start at the beginning, and the path respects pedagogical batch groupings.

**Leaf rules:**
- Content served to a learner must start at that learner's current altitude + 1 for each concept (never below)
- Content ceiling per concept must not exceed the course target altitude
- Concepts in the same curated batch must be scheduled together, not scattered
- High-risk divergence concepts (where prior knowledge misleads) must appear at the head of the path, not scattered throughout
- Concurrent intents must each maintain an independent path; learner may switch focus explicitly

**Satisfies:** REQ-DW-BLM-02, REQ-DW-BLM-03, REQ-DW-KGM-02, REQ-DW-LGM-04, REQ-DW-ATT-05
**Exercised by:** UC-03, UC-04, UC-05, UC-09, UC-13, UC-15

---

### F-1.3 — Record Certification Achievement

When a learner reports passing an external certification, the system records it as validated mastery, activates ongoing monitoring of that domain's currency, and identifies what the certification implies the learner should next know.

**Leaf rules:**
- Certification must upgrade all concept nodes in scope from estimated to externally-validated
- A domain currency watch must activate automatically on certification
- Post-certification gaps must be identified and queued — not surfaced urgently

**Satisfies:** REQ-DW-LGM-03, REQ-DW-CUR-04, REQ-DW-GAP-03
**Exercised by:** UC-08, UC-14

---

## F-2 — Know the Learner

*The system builds and maintains a deep model of what the learner already knows, how they think, and where they are in each learning journey.*

### F-2.1 — Maintain Knowledge History and Mental Model Inventory

The system maintains a running record of everything the learner has worked on, written, explained, and applied. From this record it extracts deep mental models — the thinking structures the learner uses operationally, not just academically.

**Leaf rules:**
- Evidence type must map to a Bloom's altitude (read-about → Remember; used-in-project → Apply; etc.)
- Mental models derived from operational experience must be weighted more heavily than academic knowledge
- The learner's knowledge profile must be available to the bridge synthesis function without requiring a direct query to the knowledge history store

**Satisfies:** REQ-DW-MST-01, REQ-DW-BRG-02, REQ-DW-BRG-03
**Exercised by:** UC-03, UC-06

---

### F-2.2 — Track Mastery Per Concept

For every concept in every active domain, the system maintains both a depth signal (confidence) and an altitude signal (Bloom's level demonstrated). These two signals move independently.

**Leaf rules:**
- Demonstrated altitude must only increase, never decrease
- Confidence must be updated bidirectionally based on assessment and engagement outcomes
- A wrong answer must decrease confidence but must not decrease demonstrated altitude
- Altitude advancement requires confidence to meet a configurable threshold — not just any positive signal

**Satisfies:** REQ-DW-MST-02, REQ-DW-MST-03, REQ-DW-MST-04, REQ-DW-MST-05
**Exercised by:** UC-05, UC-07

---

### F-2.3 — Compute Warm vs Cold Classification and Partial Credit

When a learner enters a new domain, the system determines how much of their prior knowledge transfers — concept by concept — using the structural similarity between domains.

**Leaf rules:**
- For each concept with a cross-domain equivalent, partial credit must be computed: confidence = prior × similarity
- Altitude transfers fully when similarity ≥ 0.80; partially (altitude − 1) when 0.60–0.79; not at all below 0.60
- When two prior domains both provide equivalences to the same concept, the higher result takes precedence
- Each concept must be classified warm or cold; the path for warm concepts starts at current altitude + 1

**Satisfies:** REQ-DW-MST-02, REQ-DW-MST-06, REQ-DW-MST-08
**Exercised by:** UC-03, UC-09

---

## F-3 — Find and Connect to Expertise

*The system locates the appropriate domain expert source for a declared intent, evaluates options algorithmically, and handles the case where no expertise exists.*

### F-3.1 — Discover Domain Expertise by Broadcast

When a new intent is declared, the system broadcasts a discovery request and collects responses from available domain experts. It does not consult a central registry.

**Leaf rules:**
- Discovery must be initiated by broadcast — no central registry consulted
- The broadcast must include the learner's prior mastery so respondents can declare their cross-domain support
- A timeout must be enforced; if no response arrives within it, a domain gap event must fire

**Satisfies:** REQ-DW-DTD-01, REQ-DW-DTD-02
**Exercised by:** UC-02, UC-11

---

### F-3.2 — Evaluate and Select the Best-Fit Expertise

When multiple domain expert sources respond, the system selects the best fit using a deterministic, configurable scoring formula.

**Leaf rules:**
- Selection must be computed as a weighted sum of coverage, quality, cross-domain match, and specificity — no inference required
- All scoring weights must be externalized in configuration; no hardcoded values
- The system may connect to more than one expert source simultaneously when their specializations differ

**Satisfies:** REQ-DW-DTD-03, REQ-DW-DTD-04, REQ-DW-DTD-05, REQ-DW-ARC-04
**Exercised by:** UC-02, UC-12

---

### F-3.3 — Handle Missing Expertise Gracefully

When no domain expert exists for a declared intent, the system informs the learner, preserves the intent, and records the gap as a platform-level finding.

**Leaf rules:**
- A missing-expertise event must be recorded for platform-level action (not silently discarded)
- The learner must be informed; the intent must be preserved, not abandoned

**Satisfies:** REQ-DW-DTD-02
**Exercised by:** UC-11

---

## F-4 — Map the Knowledge Domain

*The system loads, maintains, and keeps current a structured map of everything a domain contains — including how it relates to other domains.*

### F-4.1 — Load Domain Knowledge with Pedagogical Context

When connecting to a domain expert source, the system loads the full knowledge structure along with the pedagogical guidance the expert has encoded: which concepts to teach together, and which misconceptions to watch for.

**Leaf rules:**
- The knowledge graph must include target altitude per concept (set by the domain expert, not the learner)
- Curated batches must be loaded and honored in path sequencing
- The misconception catalog must be loaded and used to classify gap types

**Satisfies:** REQ-DW-KGM-01, REQ-DW-KGM-02, REQ-DW-KGM-03, REQ-DW-BLM-01
**Exercised by:** UC-03, UC-04, UC-09

---

### F-4.2 — Maintain Cross-Domain Equivalence Map

The system tracks structural relationships between concepts in different domains, enabling partial credit and bridge synthesis when a learner pivots from one domain to another.

**Leaf rules:**
- Cross-domain equivalences must carry a similarity score and a delta note (where the analogy breaks down)
- The learner's prior mastery baseline must be sent to the domain expert when requesting the knowledge graph
- The domain expert uses the baseline to determine content floor per concept before serving any content

**Satisfies:** REQ-DW-KGM-04, REQ-DW-BLM-03
**Exercised by:** UC-03, UC-09

---

### F-4.3 — Keep Domain Knowledge Current

When a domain's knowledge graph changes, the system receives notification, retrieves the update, and propagates the relevant changes to the learner's mastery map and learning path.

**Leaf rules:**
- Domain change notification must be a thin signal (no change detail); the system pulls detail on demand
- The domain expert must not be required to track which learners are connected
- Concept nodes affected by a major change must be flagged for mastery review
- The learning path must be adjusted to incorporate newly relevant or modified concepts

**Satisfies:** REQ-DW-CUR-01, REQ-DW-CUR-02, REQ-DW-CUR-03, REQ-DW-CUR-04
**Exercised by:** UC-10

---

## F-5 — Surface the Right Thing at the Right Moment

*The system delivers the right piece of information or learning item to the learner at the moment when they're actually ready to receive it — not when it's generated, and not on a timer.*

### F-5.1 — Detect Learner Mode and Transitions

The system continuously monitors signals of the learner's current state — focused, transitioning, ambient — and uses mode as the primary gate for surfacing decisions.

**Leaf rules:**
- Items must not be surfaced during focused mode
- Stillness (configurable duration) must be treated as a mode-transition signal
- Mode transitions must be detected, not inferred from a timer

**Satisfies:** REQ-DW-ATT-01, REQ-DW-ATT-02
**Exercised by:** UC-05, UC-06

---

### F-5.2 — Hold, Prioritize, and Surface Items

The system holds generated items until mode permits, prioritizes among competing items, and presents one at a time.

**Leaf rules:**
- Every surfaced item must offer at minimum: engage, later, and dismiss responses
- A "later" response must re-queue the item for future surfacing
- An engaged or dismissed response must be reported back so mastery and bridge effectiveness can be updated
- The system must not name itself ("Donna") in the user interface; an ambient label is appropriate

**Satisfies:** REQ-DW-ATT-03, REQ-DW-ATT-04
**Exercised by:** UC-06, UC-14

---

### F-5.3 — Arbitrate Between Concurrent Learning Paths

When the learner has multiple active intents, the system must arbitrate intelligently between surfacing items from each path.

**Leaf rules:**
- An explicit learner focus declaration must take highest priority in surfacing decisions
- When no explicit focus is set, the most recently engaged intent takes default priority
- Items from lower-priority paths must not be abandoned — they must be held and surface when appropriate

**Satisfies:** REQ-DW-LGM-05, REQ-DW-ATT-05
**Exercised by:** UC-13

---

## F-6 — Bridge Knowledge Gaps

*When a learner is stuck — not through lack of exposure but through inability to connect new knowledge to what they already know — the system builds a personalized bridge using the learner's own existing mental models.*

### F-6.1 — Detect Learning Plateaus

The system recognizes when a learner is stuck — repeated visits without meaningful confidence movement — and initiates the bridge process rather than serving more of the same content.

**Leaf rules:**
- Plateau must be declared only when: minimum visit count met AND confidence delta below threshold AND duration exceeded AND confidence below ceiling
- All four threshold values must be externalized in configuration; none hardcoded
- Plateau detection must not trigger on near-mastered concepts (confidence already high)

**Satisfies:** REQ-DW-GAP-04, REQ-DW-ARC-03
**Exercised by:** UC-06

---

### F-6.2 — Synthesize Personalized Connections

The system retrieves candidate bridge cards from the domain expert, selects the best fit for this learner's specific mental model inventory, and personalizes the generic card into something anchored in the learner's lived experience.

**Leaf rules:**
- Bridge card candidates must come from the domain expert — the system must not generate them independently
- Personalization must use the learner's mental model inventory, available on the shared state board — never retrieved by direct query
- Operational/embodied mental models (strength > academic) must be preferred as anchors
- The personalized card must attribute its source (generic bridge type + learner-specific anchor used)

**Satisfies:** REQ-DW-BRG-01, REQ-DW-BRG-02, REQ-DW-BRG-03, REQ-DW-BRG-04
**Exercised by:** UC-06

---

### F-6.3 — Handle Convergent Misconceptions Specially

When a learner's prior knowledge from multiple domains all points toward the same wrong understanding of a new concept, the system identifies this as the highest-risk gap type and addresses it first — with bridges that reach for mental models outside the misleading prior domains.

**Leaf rules:**
- Convergent-misconception concepts must be placed at the head of the learning path
- Bridge synthesis for convergent-misconception concepts must seek anchors from domains orthogonal to the misleading ones
- The learner must be forewarned that these concepts are where their prior experience will mislead them

**Satisfies:** REQ-DW-GAP-02, REQ-DW-BRG-05
**Exercised by:** UC-15

---

## F-7 — Validate Mastery

*The system validates what the learner actually knows — not what content they've consumed — using targeted assessment at the right cognitive altitude.*

### F-7.1 — Assess at Target Bloom's Altitude

Assessment items probe the learner at the target altitude for each concept, not at the altitude they currently hold.

**Leaf rules:**
- Assessment items must be requested from the domain expert at the concept's target altitude
- The system must not generate assessment items independently
- Assessment items must be requested with the learner's current mastery context so the domain expert can calibrate difficulty

**Satisfies:** REQ-DW-ASM-01, REQ-DW-ASM-02
**Exercised by:** UC-07

---

### F-7.2 — Advance Altitude on Demonstrated Competence

Demonstrated competence at the target altitude, confirmed by confident correct assessment responses, unlocks advancement to the next altitude level.

**Leaf rules:**
- Altitude advancement requires confidence to meet or exceed the configurable advance threshold (default 0.85)
- A correct but hesitant response increases confidence moderately — it does not automatically advance altitude
- Assessment may be attempted at altitude N when confidence at altitude N-1 meets the advance threshold, regardless of prior formal assessment history
- When assessment results are mixed, the system must route additional content at the current altitude before re-assessing; the policy for "how much additional content" must be externalized in configuration

**Satisfies:** REQ-DW-MST-05, REQ-DW-ASM-03, REQ-DW-ASM-05, REQ-DW-ASM-06
**Exercised by:** UC-07

---

### F-7.3 — Enforce the Altitude Floor

Once a learner has demonstrated competence at altitude N, the system must never serve content below altitude N for that concept, regardless of subsequent assessment performance.

**Leaf rules:**
- A wrong answer decreases confidence but must not decrease demonstrated altitude
- Content served must always start at current altitude + 1 (never at or below demonstrated altitude)
- If confidence drops below a threshold after altitude N was demonstrated, the system serves more N-level content — it does not drop to N-1

**Satisfies:** REQ-DW-MST-03, REQ-DW-MST-04, REQ-DW-ASM-04, REQ-DW-BLM-02
**Exercised by:** UC-07

---

## F-8 — Feed the Learning Ecosystem

*Every learning interaction contributes a signal back to the domain expert source, making the domain expert smarter over time. The learner's record stays current as domains evolve.*

### F-8.1 — Report Outcome Signals

After every learning interaction, the system reports a lean outcome signal to the relevant domain expert. The domain expert uses this signal for internal analytics. The learner's personal record is never exposed.

**Leaf rules:**
- An outcome signal must fire after every learning-node engagement, bridge card engagement, assessment response, and methodology interaction
- The outcome signal must contain no personal identifiers, no twin IDs traceable to a person, and no fields from the learner's personal knowledge record
- The domain expert is the sole analytics processor of outcome signals — the learner's system only reports

**Satisfies:** REQ-DW-OUT-01, REQ-DW-OUT-02, REQ-DW-OUT-03
**Exercised by:** UC-05, UC-06, UC-07

---

### F-8.2 — Keep Mastery Current as Domains Evolve

When a domain's knowledge changes, the system ensures the learner's mastery record reflects the new reality: flagging potentially stale concepts and adjusting the active learning path.

**Leaf rules:**
- A domain knowledge change must propagate to the learner's gap analysis and learning path within the same session it is received
- Concepts with major changes must be flagged for mastery review, even if they were previously well-mastered
- The domain expert must never be required to know who is subscribed to its updates

**Satisfies:** REQ-DW-CUR-01, REQ-DW-CUR-02, REQ-DW-CUR-03
**Exercised by:** UC-10

---

## F-9 — Enforce Architectural Boundaries

*The system maintains clean separation between the learner's private world and the outside world, keeps all tunable behavior externalized in configuration, and ensures no operation uses inference where determinism is available.*

### F-9.1 — Isolate the Learner's Private World

All internal learner state — mastery, mental models, knowledge history — stays inside the learner's system. The outside world receives only lean, non-identifying outcome signals.

**Leaf rules:**
- No internal learner state may cross to an external system in identifiable form
- Internal agents must communicate only through the shared state board — no direct agent-to-agent calls
- Only the inter-twin coordination layer may communicate across the internal/external boundary

**Satisfies:** REQ-DW-ARC-01, REQ-DW-ARC-02, REQ-DW-OUT-02
**Exercised by:** UC-05, UC-06

---

### F-9.2 — Externalize All Tunable Thresholds

Every threshold that governs system behavior must live in configuration, not in code.

**Leaf rules:**
- Discovery evaluation weights must be in configuration
- Plateau detection thresholds (visit count, confidence delta, duration, ceiling) must be in configuration
- Partial credit formula thresholds (altitude transfer thresholds) must be in configuration
- Altitude advance threshold must be in configuration
- Mixed-assessment routing policy must be in configuration

**Satisfies:** REQ-DW-ARC-03
**Exercised by:** UC-02, UC-06, UC-07, UC-09

---

### F-9.3 — Prefer Determinism Over Inference

Where a correct answer can be computed from known data, the system must compute it — not infer it via language model.

**Leaf rules:**
- Discovery scoring must be a weighted sum of known metadata fields — no inference
- Partial credit calculation must be a formula applied to known similarity and confidence values — no inference
- Plateau detection must be a threshold check on known visit counts, deltas, and durations — no inference
- Altitude gap calculation must be a subtraction — no inference

**Satisfies:** REQ-DW-ARC-04
**Exercised by:** UC-02, UC-03, UC-05, UC-06

---

## Feature-to-Requirement Traceability

| Feature | Requirements |
|---|---|
| F-1.1 Declare Intent and Orient | REQ-DW-LGM-01, LGM-02, DTD-02 |
| F-1.2 Navigate a Structured Path | REQ-DW-BLM-02, BLM-03, KGM-02, LGM-04, ATT-05 |
| F-1.3 Record Certification | REQ-DW-LGM-03, CUR-04, GAP-03 |
| F-2.1 Knowledge History + Mental Models | REQ-DW-MST-01, BRG-02, BRG-03 |
| F-2.2 Track Mastery Per Concept | REQ-DW-MST-02, MST-03, MST-04, MST-05 |
| F-2.3 Warm/Cold + Partial Credit | REQ-DW-MST-02, MST-06, MST-08 |
| F-3.1 Discover by Broadcast | REQ-DW-DTD-01, DTD-02 |
| F-3.2 Evaluate and Select | REQ-DW-DTD-03, DTD-04, DTD-05, ARC-04 |
| F-3.3 Handle Missing Expertise | REQ-DW-DTD-02 |
| F-4.1 Load Domain Knowledge | REQ-DW-KGM-01, KGM-02, KGM-03, BLM-01 |
| F-4.2 Cross-Domain Equivalence | REQ-DW-KGM-04, BLM-03 |
| F-4.3 Keep Domain Current | REQ-DW-CUR-01, CUR-02, CUR-03, CUR-04 |
| F-5.1 Detect Learner Mode | REQ-DW-ATT-01, ATT-02 |
| F-5.2 Hold and Surface Items | REQ-DW-ATT-03, ATT-04 |
| F-5.3 Arbitrate Concurrent Paths | REQ-DW-LGM-05, ATT-05 |
| F-6.1 Detect Plateaus | REQ-DW-GAP-04, ARC-03 |
| F-6.2 Synthesize Personalized Bridges | REQ-DW-BRG-01, BRG-02, BRG-03, BRG-04 |
| F-6.3 Convergent Misconceptions | REQ-DW-GAP-02, BRG-05 |
| F-7.1 Assess at Target Altitude | REQ-DW-ASM-01, ASM-02 |
| F-7.2 Advance on Competence | REQ-DW-MST-05, ASM-03, ASM-05, ASM-06 |
| F-7.3 Enforce Altitude Floor | REQ-DW-MST-03, MST-04, ASM-04, BLM-02 |
| F-8.1 Report Outcome Signals | REQ-DW-OUT-01, OUT-02, OUT-03 |
| F-8.2 Keep Mastery Current | REQ-DW-CUR-01, CUR-02, CUR-03 |
| F-9.1 Isolate Learner's Private World | REQ-DW-ARC-01, ARC-02, OUT-02 |
| F-9.2 Externalize Thresholds | REQ-DW-ARC-03 |
| F-9.3 Prefer Determinism | REQ-DW-ARC-04 |
