# Dwell Proof Story

*Status: Left-bookend — Proof Story*
*Date: 2026-07-01*
*Position in sequence: Story ✅ → Requirements ✅ → Use Cases ✅ → Business Types ⏳ → Features ⏳ → **Proof Story** → SIG ✅ → Test Spec ✅ → Improved SIG ✅*
*Scenario: AWS SAA certification achieved → GCP PCA declared → plateau hit → bridge synthesized → Azure SAE declared*
*Format: Narrative with inline proof annotations marking which requirement is verified at each beat*

---

## Purpose

The discovery story surfaced requirements. This story verifies them. Every significant system behavior is shown with enough specificity that a gap would be visible. Where the system *should* do something but the spec doesn't fully define how, that is noted as a finding.

---

## Scene 1 — The Certification

It is 9:14 AM. Bill types:

> *I passed the AWS SAA exam.*

**`bb.cert.aws-saa.achieved` fires.**

The Personal Twin moves immediately. Four things happen in eleven seconds:

**Antiquarian** walks the 247 concept nodes previously marked as strong-signal. It upgrades each from `source: "prior-evidence"` to `source: "externally-validated"`. The confidence floor on all 247 nodes is now immutable — validated mastery cannot be weakened by a later signal. `bb.learner.aws-saa.baseline` updated.

> *Proof: REQ-DW-LGM-03 — certification achievement updates the learner record. Antiquarian upgrades evidence type on confirmation.*

**Calibrator** receives the baseline update. It writes `bloomsCurrentAltitude: 3` (Apply) and `confidence: 0.95` across the 247 validated nodes. The remaining 93 nodes — the ones Bill worked through but never formally tested — hold their estimated altitudes with confidence 0.78–0.88.

> *Proof: REQ-DW-MST-01 — initial mastery from evidence; REQ-DW-MST-03 — altitude monotonically increasing (externally validated nodes can only increase from here).*

**Cultivator** activates a staleness watch. It subscribes to the AWS Domain Twin's update channel. From this point, any AWS syllabus change will arrive through the channel connector and be relayed to the BB.

> *Proof: REQ-DW-CUR-04 — staleness watch activated on certification.*

**Surveyor** runs the post-cert gap scan. It finds three concept clusters that the AWS SAA certification implies but Bill's record doesn't show evidence for: multi-payer AWS Organizations design (7 nodes), AWS Control Tower (4 nodes), cost allocation tagging at enterprise scale (5 nodes). It posts these to `bb.gaps.aws-saa.post-cert` with priority: low, urgency: non-urgent.

> *Proof: REQ-DW-GAP-03 — post-certification gap scan runs; downstream knowledge identified.*

Donna holds the post-cert gaps. She will surface them gradually, not today. Today Bill achieved something. She surfaces one card:

> *AWS Solutions Architect — Associate recorded. 247 concepts validated. Three areas to watch when you're ready: AWS Organizations, Control Tower, and enterprise cost governance. No rush.*

Bill presses 👍. The session ends.

---

## Scene 2 — The Declaration

Three days later. Bill opens Dwell:

> *GCP Professional Cloud Architect.*

**`bb.intent.declared` fires.**

The Zipper initiates discovery. It broadcasts `dwell.broadcast.discovery` with:
```
intent: "GCP Professional Cloud Architect"
sourceKnowledge: [{ domain: "aws-saa", masteryLevel: 0.94, validated: true }]
replyTo: "dwell.bill-twin-001.discovery.response"
timeoutMs: 5000
```

Two responses arrive:

**Response A — GCP Cloud Platform Twin (generic)**
```
coverage: 0.71, qualityScore: 0.82
crossDomainSupport: ["aws-saa", "azure"]
```

**Response B — GCP PCA Cert Twin (cert-specific)**
```
coverage: 0.94, qualityScore: 0.89
crossDomainSupport: ["aws-saa"]
```

> *Proof: REQ-DW-DTD-01 — discovery by broadcast, no registry. REQ-DW-DTD-03 — multiple responses evaluated.*

Answer Agent scores both using DiscoveryEvaluationPolicy (defaults: coverage×0.30, quality×0.30, crossDomain×0.25, specificity×0.15):

- Generic twin: (0.71×0.30) + (0.82×0.30) + (1.0×0.25) + (0.40×0.15) = **0.758**
- Cert-specific twin: (0.94×0.30) + (0.89×0.30) + (1.0×0.25) + (0.90×0.15) = **0.892**

Cert-specific twin wins clearly. Engagement Agent routes to Zipper. Channel connector established.

> *Proof: REQ-DW-DTD-04 — selection is algorithmic, deterministic, no LLM. REQ-DW-ARC-04 — Tier 0.*

---

## Scene 3 — The Warm Start

Zipper calls `dwell.gcp-pca-twin.kg.request` with Bill's full AWS SAA mastery baseline: 340 nodes, per-node confidence and altitude.

GCP PCA Domain Twin delivers:
- 312 concept nodes, each with `bloomsTargetAltitude: 5` (Evaluate — Professional cert)
- Cross-domain equivalence edges for 201 of 312 nodes, each with `similarityScore`
- 14 curated batches
- 23 misconception catalog entries (8 with `sourceDomain: "aws-saa"`)

> *Proof: REQ-DW-KGM-01 — knowledge graph loaded. REQ-DW-KGM-02 — curated batches included. REQ-DW-KGM-03 — misconception catalog included. REQ-DW-BLM-01 — Domain Twin sets bloomsTargetAltitude=5.*

**Calibrator** runs PartialCreditFormula on all 201 nodes with equivalences:

Example — IAM → Cloud IAM: similarityScore=0.92
- Confidence: 0.95 × 0.92 = **0.874**
- Altitude: 0.92 ≥ 0.80 → full transfer → **bloomsCurrentAltitude: 3**

Example — VPC → VPC Networking: similarityScore=0.71
- Confidence: 0.91 × 0.71 = **0.646**
- Altitude: 0.60 ≤ 0.71 < 0.80 → transfer at altitude−1 → **bloomsCurrentAltitude: 2**

Example — Direct Connect → Cloud Interconnect: similarityScore=0.55
- Confidence: 0.55 × 0.55 = **0.302** (treating as cold estimate)
- Altitude: 0.55 < 0.60 → cold → **bloomsCurrentAltitude: 0**

> *Proof: REQ-DW-MST-02 — partial credit computed per PartialCreditFormula. G6 formula applied correctly.*

Calibrator posts `bb.mastery.gcp-pca.initialized`:
- 201 nodes with partial credit (warm)
- 111 nodes at altitude 0 (cold)
- Overall readiness: 64.4%

> *Proof: REQ-DW-MST-06 — warm vs cold classification per node.*

**Surveyor** reads the mastery map. It identifies 8 misconception catalog entries where `sourceDomain: "aws-saa"` — these are the nodes where Bill's AWS knowledge actively misleads. It classifies these as `convergent-misconception` gap type and flags them as highest priority.

> *Proof: REQ-DW-GAP-02 — gap type classification including convergent-misconception.*

**Gatekeeper** generates the learning path:
1. First: the 8 convergent-misconception nodes (AWS knowledge misleads here — address before Bill gets comfortable with wrong intuition)
2. Then: cold nodes (111, starting at altitude 1)
3. Then: warm nodes below target altitude (starting at their current altitude + 1)
4. Skipped: nodes already at target altitude (none — target is Evaluate, most warm nodes are at Apply)

> *Proof: UC-09 — pivot to related domain; Gatekeeper prioritizes high-delta nodes first.*

Donna surfaces:

> *You're starting GCP at 64%. Your biggest risk isn't what you don't know — it's eight places where your AWS experience will steer you wrong. Let's deal with those first.*

Bill taps: *Show me.*

---

## Scene 4 — The Convergent Misconception

First node: GCP subnet model. Bill reads the documentation for 22 minutes. The Calibrator has logged 4 visits. Confidence has moved from 0.646 (partial credit from VPC) to 0.661 — a delta of 0.015 over the full 22 minutes.

PlateauDetectionPolicy check:
- visits: 4 ≥ 3 ✓
- confidenceDelta: 0.015 < 0.05 ✓
- duration: 22 min > 15 min ✓
- confidence: 0.661 < 0.80 ✓

**All four conditions met. Plateau declared.**

> *Proof: REQ-DW-GAP-04 — plateau detection per PlateauDetectionPolicy. G7 thresholds applied correctly. All thresholds are config-driven in F-7 Profile — no hardcoding.*

Surveyor posts `bb.bridge.requested`:
```
conceptIds: ["gcp.networking.subnet-model"]
learnerState: "plateau"
calibratorSignal: { confidenceCurrent: 0.661, visitsCount: 4, plateauDuration: "22min" }
```

Zipper calls `dwell.gcp-pca-twin.bridge.query`:
```
targetConceptIds: ["gcp.networking.subnet-model"]
sourceDomains: [{ domain: "aws-saa", masteryLevel: 0.94 }]
```

Domain Twin Librarian returns 3 candidates ranked by effectiveness:
1. `containment-zone-model` — effectivenessScore: 0.91 (for learners with hierarchical systems background)
2. `layer-stack-analogy` — effectivenessScore: 0.84
3. `building-floor-plan` — effectivenessScore: 0.79

Answer Agent evaluates against BB context: Bill's masteryLevel in aws-saa is 0.94, sourceDomains includes nuclear power background. `containment-zone-model` scores highest.

Bridge reads **AntiquarianSnapshot**:
```
mentalModels: [
  { label: "Peach Bottom EOP hierarchy", domain: "nuclear-power",
    structure: "hierarchy", strength: 0.95 },
  { label: "OSI layer model", domain: "networking",
    structure: "layer-stack", strength: 0.72 },
  ...
]
```

Bridge matches `containment-zone-model` bridge type to `Peach Bottom EOP hierarchy` mental model (structure: "hierarchy", strength: 0.95 — highest available).

> *Proof: REQ-DW-BRG-02 — personalization uses AntiquarianSnapshot. REQ-DW-BRG-03 — Bridge reads snapshot from BB, not from Antiquarian directly. G8 pattern applied correctly.*

Bridge personalizes:

> *At Peach Bottom, the site-wide systems — cooling, power — served every building regardless of which building you were in. You didn't pick a building and get building-level utilities. You picked the site.*
>
> *GCP subnets work the same way. The subnet belongs to the region — the site. Zones are the buildings. Any instance in any zone draws from the same regional subnet. In AWS you picked the AZ and got the subnet. In GCP you pick the region and the subnet is there.*

Bridge posts `bb.bridge.ready`.

Bill saves his document. Eleven seconds of stillness. Mode: transitioning.

Donna surfaces the card.

Bill reads it. He gets it immediately. He presses 👍.

`bb.attention.outcome` fires: `{ response: "engaged", itemType: "bridge-card" }`.

Calibrator receives: confidence → 0.661 + bridge-engagement-boost → **0.81**. `bloomsCurrentAltitude` stays at 2 (understanding was demonstrated, not apply-level yet).

> *Proof: REQ-DW-MST-04 — confidence updates. REQ-DW-MST-03 — altitude unchanged (engagement doesn't demonstrate altitude; assessment does).*

Outcome signal fires to Domain Twin Librarian:
```
conceptId: "gcp.networking.subnet-model"
interactionType: "bridge-card"
bridgeId: "containment-zone-model"
sourceDomains: ["aws-saa"]
outcome: "engaged"
bloomsAltitudeAtInteraction: 2
```

No userId. No personal identifiers. No mental model details. The Domain Twin Librarian receives it and notes: `containment-zone-model` effectiveness score for aws-saa learners at altitude 2: tick upward.

> *Proof: REQ-DW-OUT-01 — signal fires after every interaction. REQ-DW-OUT-02 — no PII. REQ-DW-OUT-03 — Domain Twin does all analytics.*

---

## Scene 5 — Assessment and Altitude Advancement

Two weeks later. Bill has worked through the subnet model cluster. Confidence: 0.88 at Apply (3). Target: Evaluate (5). `confidenceToAdvance` threshold: 0.85.

0.88 ≥ 0.85. **Eligible to advance to Analyze (4).**

Tester calls `dwell.gcp-pca-twin.assessment.request`:
```
conceptIds: ["gcp.networking.subnet-model"]
bloomsLevel: 4   ← target altitude (4), not current (3)
count: 2
masteryContext: [{ conceptId: "gcp.networking.subnet-model", currentConfidence: 0.88 }]
```

> *Proof: REQ-DW-ASM-01 — assessment at target altitude. REQ-DW-ASM-02 — items from Domain Twin bank.*

Domain Twin Tester delivers two Analyze-level items:

**Item 1:** *A customer reports intermittent connectivity between two GCP VMs in different zones of the same region. Both VMs are on the same subnet. A firewall rule allows traffic on the required port. What is the most likely explanation, and how would you diagnose it?*

Bill answers correctly and confidently.

**Item 2:** *Your team deployed a new subnet in us-central1. VMs in us-central1-a can reach each other. VMs in us-central1-b cannot reach us-central1-a. What is the likely cause?*

Bill hesitates. Gets it wrong — he still has a residual AWS mental model about AZ-scoped routing.

`bb.assessment.outcome` fires for each item.

Calibrator processes:
- Item 1: correct + certain → confidence +0.06 → 0.94
- Item 2: incorrect + hesitant → confidence −0.04 → **0.90**

`bloomsCurrentAltitude`: **still 3**. Wrong answer does not regress altitude.

> *Proof: REQ-DW-ASM-04 — wrong answer does not regress altitude. REQ-DW-MST-03 — altitude monotonically increasing. Confidence adjusted bidirectionally — REQ-DW-MST-04.*

Calibrator checks advancement eligibility: 0.90 ≥ 0.85. One correct and one incorrect — Gatekeeper decides: route more Analyze-level content before declaring altitude 4. The wrong answer on Item 2 revealed a specific sub-gap. Gatekeeper adjusts path to address it.

> *Proof: REQ-DW-MST-05 — altitude advancement requires confidence threshold. Gatekeeper manages path based on mastery state.*

---

## Scene 6 — The Domain Twin Updates

Six weeks in. GCP announces a major update to the VPC Service Controls feature — it now applies to more APIs and the exam has been updated to include it. The GCP PCA Domain Twin detects the change.

Domain Twin Cultivator emits `dwell.domain.gcp-pca-twin.updated` through the channel connector. Thin payload:
```
{ twinId: "gcp-pca-twin", domain: "gcp-pca", notifiedAt: "2026-08-14T11:30:00Z" }
```

No change detail in the broadcast.

> *Proof: REQ-DW-CUR-01 — Domain Twin notifies of changes. REQ-DW-CUR-02 — thin broadcast, no detail. REQ-DW-CUR-03 — Domain Twin does not know who received this.*

Zipper posts `bb.domain.gcp-pca.change-available`. Cultivator sees it. Zipper calls `dwell.gcp-pca-twin.update.request` with `sinceVersion: "2.4.1"`.

Domain Twin delivers pre-curated delta:
```
affectedConcepts: [
  { conceptId: "gcp.security.vpc-service-controls",
    changeType: "modified", severity: "major",
    changeNote: "VPC SC now applies to 40+ additional APIs; exam weight increased from 3% to 7%" }
]
```

Zipper posts `bb.domain.gcp-pca.updated`.

Surveyor re-scans: `gcp.security.vpc-service-controls` was at confidence 0.71, altitude 2. With the major change and exam weight jump from 3% to 7%, Surveyor elevates it from `knowledge` gap to high-priority `drift` gap.

Gatekeeper inserts refreshed VPC Service Controls content into the active path — ahead of lower-priority items.

Donna surfaces at the next ambient moment:

> *The GCP exam was updated. VPC Service Controls now covers more APIs and carries more weight — I've moved it up your path.*

> *Proof: Full domain currency protocol verified: thin event → pull delta → BB updated → Surveyor re-scans → path adjusted.*

---

## Scene 7 — The Third Mountain

Bill achieves GCP PCA. He declares:

> *Azure Solutions Architect Expert.*

Discovery fires. Azure Domain Twin responds. Mastery initialization runs with Bill's FULL baseline: AWS SAA (validated, confidence ~0.94 across 247 nodes) AND GCP PCA (validated, confidence ~0.88 across 312 nodes).

For Azure concepts with equivalences to BOTH AWS and GCP:
- The formula runs independently for each prior domain
- Calibrator takes the higher resulting confidence as the starting point
- Example — Azure VNet: AWS VPC equiv=0.85 → confidence=0.94×0.85=0.799; GCP VPC equiv=0.78 → confidence=0.88×0.78=0.686. AWS gives higher → **confidence: 0.799, altitude: 3 (Apply)**

Bill's starting point for Azure: **71%** — his highest yet.

Surveyor runs the convergent-misconception scan across both prior domains. It finds 5 nodes where both AWS and GCP equivalences point to the same incorrect Azure assumption. Gatekeeper routes all 5 to the top of the path.

> *Proof: UC-15 — convergent misconception detection across multiple prior domains. REQ-DW-GAP-02 — correctly classified. UC-09 — cross-domain transfer from two prior domains simultaneously.*

Donna surfaces:

> *You're starting Azure at 71%. There are five places where your AWS and GCP experience agree with each other but disagree with Azure. Those are the most dangerous gaps — the ones that feel like confidence. Let's start there.*

---

## What the Proof Story Revealed

All major requirements verified in narrative. The following seam surfaced that was not visible from Use Cases alone:

### Finding 1 — Assessment advancement policy when mixed results
In Scene 5, Bill got one assessment item correct and one incorrect. The spec says Calibrator updates confidence, but it does not specify when the Gatekeeper decides "continue at current altitude" vs. "try again with a different item" vs. "route to adjacent concepts first." The current behavior (continue reinforcement) is reasonable but it's a policy decision that should be in the SIG.

**→ New requirement: REQ-DW-ASM-05 — When a learner produces mixed assessment results at the target altitude (some correct, some incorrect), Gatekeeper must route additional content at the current altitude before re-assessing. The specific policy (N additional items, or confidence must return to confidenceToAdvance) must be externalized in F-7 Profile config.**

### Finding 2 — Partial credit when two prior domains provide equivalences for the same concept
In Scene 7, Calibrator had AWS and GCP equivalences for the same Azure concept. The current spec doesn't say how to reconcile two partial credit calculations for the same node. Taking the higher was assumed — but this is a policy decision.

**→ New requirement: REQ-DW-MST-08 — When multiple prior domains each provide a cross-domain equivalence to the same target concept, Calibrator must take the higher resulting confidence as the initial mastery estimate. Altitude is set by the equivalence that produces the higher altitude per PartialCreditFormula.**

### Finding 3 — Bloom's altitude for the validation assessment
In Scene 5, the Tester requested items at `bloomsLevel: 4` (Analyze) when the current altitude was 3 (Apply). This is correct per REQ-DW-ASM-01. But the Domain Twin delivered items at altitude 4 even though Bill hadn't yet demonstrated altitude 3 mastery via formal assessment (only via learning interactions). The system assumed learning interactions were sufficient evidence before allowing the first assessment attempt. This assumption should be explicit.

**→ New requirement: REQ-DW-ASM-06 — Assessment at altitude N may be requested when confidence at altitude N-1 meets confidenceToAdvance, even if the learner has not previously passed a formal assessment at altitude N-1. Learning interaction engagement is sufficient evidence to attempt altitude N assessment for the first time.**

---

## Updated Requirement Count

Three new requirements from Proof Story:

| ID | Description |
|---|---|
| REQ-DW-ASM-05 | Mixed assessment results → Gatekeeper routes additional content before re-assessing; policy externalized in F-7 Profile |
| REQ-DW-MST-08 | Multiple prior-domain equivalences for same target → take higher confidence; take higher altitude |
| REQ-DW-ASM-06 | Learning interaction confidence sufficient to attempt first altitude N assessment; no prior formal assessment required |
