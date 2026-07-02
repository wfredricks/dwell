# Dwell Use Cases

*Status: Left-bookend — Use Cases phase*
*Date: 2026-07-01*
*Position in sequence: Story ✅ → Requirements ✅ → **Use Cases** → Proof Story → Features → SIG ✅ → Test Spec ✅ → Improved SIG ✅*
*Traceability: Every use case traces to requirements in DWELL-REQUIREMENTS.md*

---

## Actor Glossary

| Actor | Description |
|---|---|
| **Learner** | Bill — the human using Dwell |
| **Personal Twin** | The full agent team inside Bill's twin (Antiquarian, Calibrator, Surveyor, Gatekeeper, Bridge, Answer Agent, Engagement Agent, Cultivator, Donna, Zipper) |
| **Domain Twin** | An external SME-level twin for a specific knowledge domain |
| **Donna** | The Attention Window — the face Bill sees |

---

## UC-01 — Declare a Learning Intent

**Goal:** Learner declares intent to learn a new domain or acquire a certification.
**Primary actor:** Learner
**Satisfies:** REQ-DW-LGM-01, REQ-DW-LGM-02

**Preconditions:**
- Learner has an active Personal Twin session
- No existing active intent for this domain

**Main Flow:**
1. Learner types a learning intent in natural language ("AWS Solutions Architect cert")
2. Personal Twin posts `bb.intent.declared`
3. Zipper initiates Domain Twin discovery (→ UC-02)
4. Antiquarian begins baseline assessment of learner's existing knowledge in the domain
5. Donna surfaces a brief orientation card: what the system found, where the learner starts
6. Learner confirms or adjusts starting preference

**Alternative Flow A — Intent already active:**
- Step 1: Learner declares an intent already in progress
- System recognizes the duplicate and surfaces current progress summary instead

**Alternative Flow B — No Domain Twin found:**
- Step 3: Discovery times out with no response → system notifies learner that no expert is available for this domain (→ UC-11)

**Postconditions:**
- `bb.intent.declared` posted
- Domain Twin connected (or domain gap event fired)
- Mastery initialization in progress

---

## UC-02 — Discover and Connect to a Domain Twin

**Goal:** Personal Twin locates and connects to the appropriate Domain Twin(s) for a declared intent.
**Primary actor:** Personal Twin (Zipper)
**Satisfies:** REQ-DW-DTD-01, REQ-DW-DTD-02, REQ-DW-DTD-03, REQ-DW-DTD-04, REQ-DW-DTD-05

**Preconditions:**
- `bb.intent.declared` has been posted
- Zipper has no existing channel connector for this domain

**Main Flow:**
1. Zipper broadcasts `dwell.broadcast.discovery` with intent and learner source knowledge
2. Domain Twin(s) subscribed to the discovery channel receive the broadcast
3. Each interested Domain Twin responds on `dwell.{userId}.discovery.response` with capabilities
4. Answer Agent evaluates responses using DiscoveryEvaluationPolicy (algorithmic weighted formula)
5. Engagement Agent routes the selection back to Zipper
6. Zipper establishes MCP channel connector(s) to selected Domain Twin(s)
7. Zipper calls `dwell.{twinId}.kg.request` with learner baseline (→ UC-03 or UC-04)

**Alternative Flow A — Single response:**
- Step 4: Only one response received; Answer Agent selects it without comparison

**Alternative Flow B — Multiple responses, clear winner:**
- Step 4: Answer Agent scores all responses; cert-specific twin scores significantly higher; selects it; may also connect generic twin as secondary

**Alternative Flow C — Multiple responses, close scores:**
- Step 4: Answer Agent connects both; routes different need types to each (cert-specific for assessment, general for practical bridge cards)

**Alternative Flow D — No response:**
→ UC-11

**Postconditions:**
- Channel connector(s) established
- Knowledge graph request in flight

---

## UC-03 — Initialize Mastery for a New Domain (Warm Start)

**Goal:** Calibrator initializes the mastery map for a new domain using prior knowledge from related domains.
**Primary actor:** Personal Twin (Calibrator, Antiquarian, Surveyor, Gatekeeper)
**Satisfies:** REQ-DW-KGM-01, REQ-DW-KGM-02, REQ-DW-KGM-03, REQ-DW-KGM-04, REQ-DW-MST-01, REQ-DW-MST-02, REQ-DW-MST-06

**Preconditions:**
- Domain Twin channel connector established
- Learner has prior validated mastery in at least one related domain
- Domain Twin's knowledge graph includes cross-domain equivalence edges

**Main Flow:**
1. Domain Twin delivers knowledge graph, curated batches, and misconception catalog
2. Antiquarian posts `bb.learner.{domain}.baseline` with evidence signals per concept
3. Calibrator reads both: domain graph equivalence edges and Antiquarian baseline
4. For each concept node with a cross-domain equivalent: applies PartialCreditFormula
   - confidence = priorConfidence × similarityScore
   - altitude: full transfer if sim ≥ 0.80; altitude−1 if 0.60–0.79; cold if < 0.60
5. Calibrator posts `bb.mastery.{domain}.initialized` with per-node altitude and confidence
6. Surveyor reads mastery map and posts initial gap clusters by type and priority
7. Gatekeeper reads gap clusters and domain graph; generates learning path respecting curated batches
8. Donna surfaces opening summary: starting point, top gaps, first learning item

**Postconditions:**
- Mastery map initialized (partial credit applied where applicable)
- Learning path generated
- Learner is oriented: knows where they start, not at zero

---

## UC-04 — Initialize Mastery for a New Domain (Cold Start)

**Goal:** Calibrator initializes the mastery map for a domain where the learner has no prior related knowledge.
**Primary actor:** Personal Twin (Calibrator, Antiquarian, Surveyor, Gatekeeper)
**Satisfies:** REQ-DW-MST-01, REQ-DW-MST-06, REQ-DW-BLM-02, REQ-DW-BLM-03

**Preconditions:**
- Domain Twin channel connector established
- Learner has no prior mastery in any domain with cross-domain equivalence to this domain
- OR all cross-domain similarity scores are below 0.60

**Main Flow:**
1. Domain Twin delivers knowledge graph, curated batches, and misconception catalog
2. Antiquarian baseline shows no signal for any concept node
3. Calibrator initializes all nodes at bloomsCurrentAltitude = 0, confidence = 0
4. Calibrator posts `bb.mastery.{domain}.initialized` — all nodes cold
5. Surveyor posts all nodes as gaps; prioritizes by exam weight and prerequisite depth
6. Gatekeeper generates full path starting at Remember (1) for all nodes, sequenced by prerequisites and curated batches
7. Donna surfaces opening summary: learner is starting fresh, path is full — sets expectations

**Postconditions:**
- Mastery map initialized at zero for all nodes
- Full traversal path generated

**Note:** Cold start produces the longest path. Warm start (UC-03) is the common case for experienced professionals pivoting across domains.

---

## UC-05 — Complete a Learning Session

**Goal:** Learner works through a learning session on one or more concept nodes, with the system adapting in real time.
**Primary actor:** Learner, Personal Twin
**Satisfies:** REQ-DW-LGM-01, REQ-DW-MST-03, REQ-DW-MST-04, REQ-DW-ATT-01, REQ-DW-ATT-02, REQ-DW-OUT-01

**Preconditions:**
- Mastery initialized (UC-03 or UC-04)
- Learning path generated
- Learner is in ambient or transitioning mode

**Main Flow:**
1. Donna surfaces the next learning item from Gatekeeper's path at an appropriate moment
2. Domain Twin methodology layer delivers the learning experience (story, puzzle, Socratic dialogue) at the correct Bloom's altitude floor for this learner on this concept
3. Learner engages with the material
4. Methodology layer returns outcome signal to Zipper
5. Zipper fires `dwell.{twinId}.outcome.signal` to Domain Twin
6. Calibrator receives outcome and updates mastery: confidence adjusts; altitude checked for advancement eligibility
7. Surveyor re-reads updated mastery; revises gap clusters if needed
8. Gatekeeper adjusts path if needed (e.g. additional reinforcement before advancing)
9. Repeat from step 1 for next item

**Alternative Flow A — Learner skips or dismisses:**
- Step 3: Learner dismisses the item
- Calibrator notes slight negative confidence signal; Gatekeeper may re-queue later

**Alternative Flow B — Plateau detected:**
- Step 6: Calibrator signals repeated visits with insufficient confidence movement
- Surveyor detects plateau per PlateauDetectionPolicy; fires `bb.bridge.requested` (→ UC-06)

**Alternative Flow C — Confidence reaches confidenceToAdvance at current altitude:**
- Step 6: Calibrator determines learner is ready to advance
- Gatekeeper routes next item at altitude + 1 for this concept

**Postconditions:**
- Mastery updated
- Outcome signal delivered to Domain Twin
- Path adjusted if needed

---

## UC-06 — Receive and Engage with a Bridge Card

**Goal:** When a learner is stuck, the system synthesizes a personalized connection from the learner's existing knowledge to the new concept and surfaces it at the right moment.
**Primary actor:** Personal Twin (Surveyor, Bridge, Donna), Learner
**Satisfies:** REQ-DW-GAP-04, REQ-DW-BRG-01, REQ-DW-BRG-02, REQ-DW-BRG-03, REQ-DW-BRG-04, REQ-DW-ATT-01, REQ-DW-ATT-02

**Preconditions:**
- Plateau detected by Surveyor per PlateauDetectionPolicy
- Domain Twin channel connector active
- AntiquarianSnapshot present on BB

**Main Flow:**
1. Surveyor posts `bb.bridge.requested` with concept IDs, learner state, and Calibrator signals
2. Zipper calls `dwell.{twinId}.bridge.query` to Domain Twin Librarian
3. Domain Twin Librarian returns ranked generic bridge card candidates (sorted by effectiveness score)
4. Answer Agent evaluates candidates against BB context (mastery state, learner source domains)
5. Engagement Agent delivers best candidate to Bridge
6. Bridge reads AntiquarianSnapshot; identifies strongest matching mental model (highest strength score)
7. Bridge personalizes the generic card using learner's specific mental model (e.g. "Peach Bottom EOP hierarchy" for an IAM policy evaluation bridge)
8. Bridge posts `bb.bridge.ready`
9. Donna holds the card
10. Donna detects mode transition + stillness; surfaces the card
11. Learner reads the card; presses 👍 or "later" or dismisses
12. `bb.attention.outcome` fires; Calibrator receives engagement signal; confidence updates

**Alternative Flow A — No suitable bridge found:**
- Step 3: Domain Twin Librarian returns empty candidates for the concept
- Bridge posts to BB: no bridge available; Surveyor notes the gap; Gatekeeper may try a different methodology

**Alternative Flow B — Learner presses "later":**
- Step 11: Card is re-queued; Donna surfaces it at the next appropriate moment

**Postconditions:**
- Bridge card delivered and responded to
- Calibrator updated with engagement outcome
- Outcome signal fired to Domain Twin Librarian (effectiveness score updated)

---

## UC-07 — Complete an Assessment

**Goal:** Learner completes a targeted assessment item to validate mastery at a specific Bloom's level.
**Primary actor:** Learner, Personal Twin (Tester, Calibrator)
**Satisfies:** REQ-DW-ASM-01, REQ-DW-ASM-02, REQ-DW-ASM-03, REQ-DW-ASM-04

**Preconditions:**
- Concept node has been visited; confidence at current altitude warrants validation
- Domain Twin channel connector active

**Main Flow:**
1. Tester (via Zipper) calls `dwell.{twinId}.assessment.request` for the concept at bloomsTargetAltitude
2. Domain Twin Tester delivers assessment items calibrated to mastery context
3. Donna surfaces the assessment item at the right moment (not during focused mode)
4. Learner answers
5. Methodology layer returns outcome: correct/incorrect + confidence signal (certain/hesitant/guessed)
6. `bb.assessment.outcome` fires
7. Calibrator updates:
   - Correct + certain → confidence increases significantly; checks altitude advancement eligibility
   - Correct + hesitant → confidence increases moderately; continues reinforcement
   - Incorrect → confidence decreases; altitude unchanged; more content at current altitude
8. Outcome signal fires to Domain Twin Tester (item calibration feedback)

**Alternative Flow A — Correct answer advances altitude:**
- Step 7: confidence ≥ confidenceToAdvance (0.85 default)
- Calibrator increments bloomsCurrentAltitude; Gatekeeper updates path

**Postconditions:**
- Mastery updated
- Outcome signal delivered
- Domain Twin Tester receives item-level feedback for calibration

---

## UC-08 — Achieve Certification

**Goal:** Learner records external certification achievement; system updates the mastery record and activates staleness monitoring.
**Primary actor:** Learner, Personal Twin
**Satisfies:** REQ-DW-LGM-03, REQ-DW-CUR-04, REQ-DW-GAP-03

**Preconditions:**
- Active learning intent for the domain
- Learner has passed the external exam

**Main Flow:**
1. Learner posts certification achievement ("I passed the AWS SAA exam")
2. Personal Twin posts `bb.cert.{domain}.achieved`
3. Antiquarian upgrades all domain nodes from evidence-based to externally-validated
4. Calibrator marks mastery map complete
5. Cultivator activates staleness watch for the domain; subscribes to Domain Twin update channel
6. Surveyor runs post-cert gap scan; identifies downstream knowledge implied by cert; posts to `bb.gaps.{domain}.post-cert`
7. Donna surfaces: "Certification recorded. A few areas to watch as you move forward." — surfaces post-cert gaps as non-urgent items over the following days

**Postconditions:**
- Cert recorded as validated mastery
- Staleness watch active
- Post-cert gaps queued for Donna surfacing

---

## UC-09 — Pivot to a Related Domain (Cross-Domain Transfer)

**Goal:** Learner declares a new intent in a domain related to one they have already mastered. System transfers applicable knowledge and computes a warm start.
**Primary actor:** Learner, Personal Twin, Domain Twin (new domain)
**Satisfies:** REQ-DW-MST-02, REQ-DW-MST-06, REQ-DW-KGM-01, REQ-DW-KGM-03

**Preconditions:**
- Learner holds validated mastery in at least one domain
- New intent maps to a domain with cross-domain equivalence edges to the mastered domain

**Main Flow:**
1. Learner declares new intent ("GCP Professional Cloud Architect")
2. → UC-02: discover and connect to GCP Domain Twin
3. Personal Twin sends learner baseline including AWS mastery nodes with this request
4. GCP Domain Twin delivers knowledge graph with cross-domain equivalence edges (AWS→GCP)
5. → UC-03: warm start initialization using PartialCreditFormula
6. Gatekeeper receives mastery map: ~64% of nodes have partial credit
7. Gatekeeper generates path starting from the warm baseline; prioritizes high-delta divergence nodes (where AWS knowledge actively misleads for GCP)
8. Donna surfaces: "You're starting GCP at 64%. Your biggest risks are the divergence points, not the gaps — here they are."

**Alternative Flow A — Convergent misconception risk detected:**
- Step 7: Surveyor identifies nodes where BOTH the AWS domain AND another prior domain point the same wrong direction (→ UC-15)

**Postconditions:**
- Warm start mastery map initialized
- High-delta divergence nodes prioritized in path
- Learner knows where their AWS knowledge helps and where it misleads

---

## UC-10 — Domain Twin Knowledge Graph Update

**Goal:** A Domain Twin updates its knowledge graph (cert syllabus change, deprecated service, new content). Connected Personal Twins receive and process the update.
**Primary actor:** Domain Twin (Cultivator), Personal Twin (Cultivator, Surveyor, Gatekeeper)
**Satisfies:** REQ-DW-CUR-01, REQ-DW-CUR-02, REQ-DW-CUR-03, REQ-DW-CUR-04

**Preconditions:**
- Personal Twin has an active channel connector to the Domain Twin
- Domain Twin knowledge graph has changed

**Main Flow:**
1. Domain Twin Cultivator detects knowledge graph change; pre-curates a change delta
2. Domain Twin emits `dwell.domain.{twinId}.updated` through the channel connector (thin broadcast — no detail)
3. Zipper receives the notification; posts `bb.domain.{domain}.change-available` to BB
4. Cultivator sees the event; requests the pre-curated delta via Zipper (`dwell.{twinId}.update.request`)
5. Domain Twin delivers delta (`dwell.{userId}.update.delivered`) with affected concepts and change types
6. Zipper posts `bb.domain.{domain}.updated` with full delta
7. Surveyor re-scans gap clusters for affected concepts; may upgrade some gaps or create new ones
8. Gatekeeper adjusts path if new concepts were added or existing ones deprecated
9. Calibrator flags any mastered nodes that changed significantly (staleness markers)
10. Donna surfaces update summary if changes affect the learner's active path

**Postconditions:**
- Domain knowledge graph current in Personal Twin
- Mastery map updated with staleness flags where needed
- Learning path adjusted

---

## UC-11 — No Domain Twin Found (Domain Gap)

**Goal:** System handles gracefully the case where no Domain Twin exists for a declared intent.
**Primary actor:** Personal Twin (Zipper), Learner
**Satisfies:** REQ-DW-DTD-02

**Preconditions:**
- `bb.intent.declared` posted
- Discovery broadcast fired and timed out with zero responses

**Main Flow:**
1. Zipper fires discovery broadcast; waits for configured timeout
2. No Domain Twin responds
3. Zipper fires `dwell.{userId}.domain.gap` event
4. Platform / constellation level receives event (logged as a finding — which expertise needs to be built)
5. Donna surfaces to learner: "No expert available for this domain yet. You've been added to the waitlist. We'll notify you when coverage is ready."
6. Intent is marked pending; not abandoned

**Postconditions:**
- Domain gap event recorded at platform level
- Learner informed; intent preserved for when a Domain Twin becomes available
- Platform has a signal to prioritize building coverage for this domain

---

## UC-12 — Multiple Domain Twins Respond to Discovery

**Goal:** Answer Agent evaluates multiple competing Domain Twin responses and selects the best fit.
**Primary actor:** Personal Twin (Answer Agent, Engagement Agent, Zipper)
**Satisfies:** REQ-DW-DTD-03, REQ-DW-DTD-04, REQ-DW-DTD-05

**Preconditions:**
- Discovery broadcast fired
- Two or more Domain Twins respond within timeout

**Main Flow:**
1. Both responses land on BB as contributions
2. Answer Agent evaluates each using DiscoveryEvaluationPolicy weighted formula
3. Answer Agent checks crossDomainSupport against learner's source domains
4. Answer Agent checks specificity (cert-specific preferred over generic for cert prep intents)
5. If one twin scores significantly higher: select it; connect as primary
6. If scores are close and specializations differ: connect both; route different need types to each
7. Engagement Agent routes selection to Zipper
8. Zipper establishes channel connector(s)

**Alternative Flow A — Tie score, same specialization:**
- Step 5: Both twins are equivalent; select higher quality score as tiebreaker
- Connect one; note the other as fallback

**Postconditions:**
- Best-fit Domain Twin(s) connected
- Selection rationale traceable via DiscoveryEvaluationPolicy scores

---

## UC-13 — Concurrent Learning Intents

**Goal:** Learner has two active learning paths. Personal Twin manages both without conflicts, and Donna arbitrates between competing surfacing needs.
**Primary actor:** Learner, Personal Twin
**Satisfies:** REQ-DW-LGM-04

**Preconditions:**
- Learner has an active intent (e.g. AWS SAA)
- Learner declares a second intent (e.g. GCP PCA) before the first is complete

**Main Flow:**
1. Second intent declared (→ UC-01, UC-02)
2. Second mastery map initialized in parallel with first
3. Two learning paths now active; each has its own gap clusters and path
4. Donna receives surfacing items from both paths
5. Donna arbitrates: priorities based on exam weight, gap urgency, learner mode, recency of engagement with each path
6. Learner may explicitly switch focus ("let's work on GCP today"); Donna adjusts surfacing priority
7. Outcome signals from each path go to their respective Domain Twins independently

**Conflict identified:** Donna's arbitration policy for concurrent paths is not yet specified.
**→ New requirement surfaced: REQ-DW-LGM-05 — Donna must support explicit learner focus-switching between active intents. Default priority when no explicit focus: most recent engagement.**

**Postconditions:**
- Both paths maintained independently
- Donna arbitrates surfacing across both

---

## UC-14 — Post-Certification Gap Surfacing

**Goal:** After certification, Surveyor identifies downstream knowledge gaps implied by the cert but not yet in the learner record. Donna surfaces them gradually over time.
**Primary actor:** Personal Twin (Surveyor, Donna), Learner
**Satisfies:** REQ-DW-GAP-03

**Preconditions:**
- Certification achieved (UC-08)
- Post-cert gap scan completed

**Main Flow:**
1. Surveyor posts `bb.gaps.{domain}.post-cert` with downstream knowledge gaps
2. Donna receives gaps; classifies them as non-urgent (no active learning pressure)
3. Over following days, Donna surfaces one gap at a time during ambient moments
4. Example: "You have the AWS SAA cert. Your record doesn't show experience with multi-payer Organization design — that's often the first thing that trips up newly-certified architects in enterprise deployments. Worth a look?"
5. Learner may engage (adds to active path) or dismiss (noted, not repeated soon)

**Postconditions:**
- Post-cert gaps surfaced gradually without urgency
- Learner's knowledge deepened beyond the cert itself

---

## UC-15 — Convergent Misconception Risk

**Goal:** When a learner pivots to a new domain (e.g. Azure after AWS and GCP), Surveyor identifies nodes where prior knowledge from MULTIPLE domains produces the same wrong intuition. These are flagged as highest-risk nodes and addressed first.
**Primary actor:** Personal Twin (Surveyor, Bridge, Donna), Learner
**Satisfies:** REQ-DW-GAP-02, REQ-DW-BRG-02

**Preconditions:**
- Learner has mastered two or more prior domains
- New domain knowledge graph contains misconception catalog entries with sourceDomain references
- Calibrator identifies nodes where both prior domains' cross-domain equivalences point away from the correct understanding

**Main Flow:**
1. Surveyor cross-references: for each target concept, checks if both prior domain equivalences produce the same incorrect intuition
2. Surveyor classifies these as `convergent-misconception` gap type; flags them as highest priority
3. Gatekeeper routes convergent-misconception nodes to the START of the learning path, before any other gaps
4. Donna surfaces an early warning: "There are five places where your AWS and GCP experience will both point the wrong direction. Let's deal with those first before you get comfortable."
5. Bridge constructs bridge cards that work AGAINST the prior models rather than building from them — uses the learner's mechanical engineering or other non-computing background as anchor instead
6. Learner works through convergent-misconception nodes with appropriate bridges

**Postconditions:**
- Highest-risk nodes addressed early
- Bridge cards anchored to non-misleading mental models
- Learner's confidence in their own intuition appropriately calibrated

---

## New Requirements Surfaced by Use Cases

| ID | Description | Source |
|---|---|---|
| REQ-DW-LGM-05 | Donna must support explicit learner focus-switching between concurrent active intents. Default when no explicit focus: most recently engaged intent. | UC-13 |
| REQ-DW-ATT-05 | Donna must arbitrate between surfacing items from concurrent active intents using: learner-declared focus (highest priority), gap urgency, exam weight, and recency of engagement. | UC-13 |
| REQ-DW-BRG-05 | For convergent-misconception gaps, Bridge must seek mental model anchors outside the misleading prior domains — preferring non-computing, embodied, or domain-orthogonal models. | UC-15 |

---

## Use Case Count Summary

| UC | Title | Priority |
|---|---|---|
| UC-01 | Declare a Learning Intent | P0 |
| UC-02 | Discover and Connect to a Domain Twin | P0 |
| UC-03 | Initialize Mastery — Warm Start | P0 |
| UC-04 | Initialize Mastery — Cold Start | P0 |
| UC-05 | Complete a Learning Session | P0 |
| UC-06 | Receive and Engage with a Bridge Card | P0 |
| UC-07 | Complete an Assessment | P0 |
| UC-08 | Achieve Certification | P0 |
| UC-09 | Pivot to a Related Domain | P0 |
| UC-10 | Domain Twin Knowledge Graph Update | P1 |
| UC-11 | No Domain Twin Found | P0 |
| UC-12 | Multiple Domain Twins Respond | P1 |
| UC-13 | Concurrent Learning Intents | P1 |
| UC-14 | Post-Certification Gap Surfacing | P1 |
| UC-15 | Convergent Misconception Risk | P0 |

**15 use cases. 10 P0, 5 P1. 3 new requirements surfaced.**
