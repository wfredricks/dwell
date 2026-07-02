# Dwell Event Architecture

*Status: Specification — source document for SIG codification*
*Date: 2026-07-01 (updated 2026-07-01 16:35 with inbox topic convention and calls/events vocabulary)*
*Traceability: Derived from conversation 2026-07-01 and story artifact `artifacts/responses/2026-07-01-08-46-dwell-agent-story.md` and constellation architecture `artifacts/responses/2026-07-01-11-00-dwell-constellation-architecture.md`*

---

## Governing Principle

**This document is written before the SIG, not after.** The SIG codifies what is specified here. Every SIG node for Dwell event types must be traceable to a section of this document. If it isn't here, it isn't ready to be in the SIG.

---

## Communication Vocabulary

Two terms cover all inter-agent communication at the `/dom` level:

| Term | Character | Pattern | Direction |
|---|---|---|---|
| **Call** | A component needs something it doesn't own. It calls out for it and expects a response. | Request-response | Pull |
| **Event** | Something happened. The emitter announces it and does not wait for a response. | Fire-and-forget pub/sub | Push |

The `/imp` layer decides how each is carried — NATS request/reply for calls, NATS pub/sub for events. At `/dom`, only the term matters.

---

## Namespace Rules

All Dwell communications live on NATS. Two namespaces, one firm boundary:

| Prefix | Scope | Meaning |
|---|---|---|
| `bb.*` | Intra-twin | Agents within a single twin coordinating on the shared Blackboard |
| `dwell.*` | Inter-twin | Communication across constellation boundaries — Personal Twin ↔ Domain Twin |

**The rule:** `bb.*` communications never leave the twin. `dwell.*` communications always cross a twin boundary. An agent that reads both is an integration point and should be noted as such.

---

## Inter-Twin Inbox Convention

For `dwell.*` communications, the addressee is encoded in the NATS subject — not in the payload. This gives NATS server-side routing; no application has to open the envelope to find out if the message is theirs.

| Subject pattern | Owner | Subscribes with |
|---|---|---|
| `dwell.broadcast.>` | No owner — any Domain Twin listens | `dwell.broadcast.>` |
| `dwell.{userId}.>` | Personal Twin's inbox | `dwell.{myUserId}.>` |
| `dwell.{twinId}.>` | Domain Twin's inbox | `dwell.{myTwinId}.>` |

**Consequence:** `requesterId` is removed from all inter-twin payloads. The reply address is the subject itself.

**Discovery exception:** The discovery broadcast is the only case where a userId appears in the payload. Domain Twins need to know which inbox to reply to, and the broadcast subject has no owner by design.

---

## The Zipper

The Zipper is the Personal Twin's **declarative tool layer** — the only agent that straddles `bb.*` and `dwell.*`. Every other agent works exclusively on the BB and never interacts with inter-twin communication directly.

### What it does

The Zipper maintains a set of **channel connectors** — one persistent MCP connection per connected Domain Twin or external service. On the Zipper, **everything looks like a tool**. A Domain Twin is a tool. A methodology server is a tool. An external API is a tool. The internal agents declare needs; the Zipper routes those needs to the right tool and posts results back to the BB.

### Declarative, not imperative

Agents do not say *"call the GCP Domain Twin."* They emit a need event on the BB. The Zipper reads it, determines which connected tool can satisfy it, calls the tool, and posts the result back. The agent that expressed the need reads the result from the BB — it never interacts with the Zipper directly.

### Discovery is registration, not broadcast

When a new Domain Twin comes online and connects as an MCP server, the Zipper registers its tools. Discovery happens at connection time. When an internal agent raises a need, the Zipper already knows which tools can satisfy it — there is no per-need discovery broadcast at the agent level. The `dwell.broadcast.discovery` subject exists as the Zipper's own connection-time mechanism, not as an agent-facing operation.

### The `dwell.*` layer is the Zipper's wire format

The inter-twin event catalog in Part 2 describes communication between the Zipper and its connected MCP servers. Internal agents never see `dwell.*` subjects. They only see `bb.*`. The Zipper is the translation boundary.

### Staleness via channel notification

When a Domain Twin's knowledge graph changes, it sends a thin notification through its channel connector: **"I've been updated."** The Zipper receives it and posts `bb.domain.<domain>.change-available` to the BB. The Personal Twin's Cultivator sees it and requests the pre-curated delta through the Zipper's tool layer. This replaces any push-to-individual-inbox staleness model — the Domain Twin never needs to know who is subscribed.

### Resolves
- **Open Question #1** — Subscription management is NATS subscription to the Domain Twin's update notification channel, handled by the Zipper at connection time. No explicit subscription event needed.
- **Open Question #2** — Bridge = synthesis only. Zipper = all inter-twin coordination. The Bridge reads contributions from the BB; it never calls a Domain Twin directly.

---

## Routing Type Vocabulary

| Type | Meaning | Example |
|---|---|---|
| **broadcast** | Any subscriber can respond; zero or more responses expected | Domain discovery |
| **request-response** | Directed to a specific twin after discovery; one response expected | Bridge query, knowledge graph request |
| **fire-and-forget** | No ACK required or expected | Outcome signals |
| **subscription** | Persistent; Domain Twin pushes to subscribed Personal Twins when state changes | Staleness notifications |

---

## Bloom's Altitude Model

Bloom's Taxonomy provides the altitude framework for all mastery tracking in Dwell. Six levels:

| Level | Name | Meaning in Dwell |
|---|---|---|
| 1 | Remember | Can recall facts and definitions |
| 2 | Understand | Can explain the concept in own words |
| 3 | Apply | Can use the knowledge in practice |
| 4 | Analyze | Can diagnose problems using the knowledge |
| 5 | Evaluate | Can assess options and make architectural judgments |
| 6 | Create | Can design new systems or artifacts using the knowledge |

### Two Distinct Altitude Values

**`bloomsTargetAltitude`** — set by the course or cert offering. The Domain Twin owns this. Learners never set it directly. Examples:
- Professional certification → Evaluate (5)
- Associate certification → Apply (3)
- Travel preparation → Understand (2) with light Apply (3) for key phrases

**`bloomsCurrentAltitude`** — Calibrator's estimate of where the learner is right now on each node. Derived from Antiquarian's evidence using this mapping:

| Evidence type | Altitude |
|---|---|
| Read about, was exposed to | Remember (1) |
| Explained in writing, described to others | Understand (2) |
| Used in a project, applied in practice | Apply (3) |
| Diagnosed a problem using it | Analyze (4) |
| Evaluated options, made architectural decisions using it | Evaluate (5) |
| Designed a system built around it | Create (6) |

### Altitude Is Cumulative — System Invariant

To reach altitude N, all levels 1 through N must be traversed in sequence. There is no skipping. A learner cannot reach Evaluate without first earning Apply and Analyze. Content is served and assessed at each level in order.

**Altitude gap** = `bloomsTargetAltitude − bloomsCurrentAltitude` per node. This is the unit of work:
- Gap = 0 → node complete at required altitude; skip in path
- Gap > 0 → levels `currentAltitude+1` through `targetAltitude` must be traversed in order

### Warm and Cold Students

- **Cold student** — no prior evidence on a node. `currentAltitude = 0`. Full traversal required (levels 1 → target). Maximum effort.
- **Warm student** — prior evidence exists. `currentAltitude > 0`. Traversal begins at `currentAltitude + 1`. Proportionally less effort.

The overall warmth of a learner in a new domain is the distribution of altitude gaps across all nodes. An Associate cert holder pursuing a Professional cert is warm across most nodes (gap ≈ 2). A first-time learner in the domain is cold across all nodes (gap = target altitude, typically 3–5).

**Example:** Bill holds AWS SAA (Associate, `currentAltitude ≈ 3` across most nodes). Pursuing AWS SAP (Pro, `targetAltitude = 5`). Most nodes have a gap of 2. The system skips levels 1–3 for those nodes and serves content starting at Analyze.

### Domain Twin Regulates Both Ceiling and Floor

For each node, the Domain Twin's content output is bounded by two values drawn from the learner baseline:

- **Floor** = `bloomsCurrentAltitude + 1` — where content starts for this learner on this node
- **Ceiling** = `bloomsTargetAltitude` — where content ends

A warm student receives content starting at Analyze (4). A cold student receives content starting at Remember (1). The Domain Twin serves nothing below the floor and nothing above the ceiling for any given learner on any given node.

This means the learner baseline passed in `dwell.{twinId}.kg.request` is not merely for partial credit scoring — it actively shapes every piece of content the Domain Twin produces.

---

## Part 1 — Intra-Twin Events (`bb.*`)

These events coordinate agents within a single twin. The Personal Twin is the primary host; a Domain Twin has its own internal `bb.*` space for its own agent coordination.

---

### Intent & Lifecycle

#### `bb.intent.declared`
Bill declares a learning intent.

| Field | Value |
|---|---|
| Producer | UI / User |
| Consumers | Bridge (triggers Domain Twin discovery), Antiquarian, Calibrator, Surveyor |
| Routing | fire-and-forget |

Payload:
```
{
  intent: string,           // "AWS Solutions Architect cert"
  declaredAt: ISO8601
}
```

#### `bb.cert.<domain>.achieved`
External validation received — Bill has passed a certification.

| Field | Value |
|---|---|
| Producer | UI / User |
| Consumers | Antiquarian, Calibrator, Cultivator, Surveyor |
| Routing | fire-and-forget |

Payload:
```
{
  domain: string,           // "aws-saa"
  certName: string,
  achievedAt: ISO8601,
  validatedExternally: boolean
}
```

---

### Learner Model Events

#### `bb.learner.<domain>.baseline`
Antiquarian's initial read of Bill's prior knowledge in a domain, before any active learning begins.

| Field | Value |
|---|---|
| Producer | Antiquarian |
| Consumers | Calibrator |
| Routing | fire-and-forget |

Payload:
```
{
  domain: string,
  nodes: [
    {
      conceptId: string,
      signalStrength: "strong" | "weak" | "none" | "conflicting",
      evidenceSources: string[]   // e.g. ["project-notes-2019", "cert-aws-saa"]
    }
  ],
  assessedAt: ISO8601
}
```

#### `bb.learner.preferences.updated`
Learner has made an explicit choice that affects path ordering or methodology.

| Field | Value |
|---|---|
| Producer | UI / Donna |
| Consumers | Gatekeeper |
| Routing | fire-and-forget |

Payload:
```
{
  preferenceType: "path-order" | "methodology" | "batch-start",
  value: string,
  context: string             // what decision prompted this
}
```

---

### Mastery Events

#### `bb.mastery.<domain>.initialized`
Calibrator posts the first mastery estimate for a domain, reconciling the domain graph against the learner baseline.

| Field | Value |
|---|---|
| Producer | Calibrator |
| Consumers | Surveyor, Gatekeeper |
| Routing | fire-and-forget |

Payload:
```
{
  domain: string,
  totalNodes: number,
  nodes: [
    {
      conceptId: string,
      confidence: number,       // 0.0–1.0
      bloomsAltitude: 1 | 2 | 3 | 4 | 5 | 6,   // Remembering → Creating
      source: "prior-evidence" | "partial-credit" | "no-signal"
    }
  ],
  overallReadiness: number,     // 0.0–1.0
  initializedAt: ISO8601
}
```

#### `bb.mastery.<domain>.updated`
Calibrator posts an updated mastery estimate after a learning interaction.

| Field | Value |
|---|---|
| Producer | Calibrator |
| Consumers | Surveyor, Gatekeeper, Donna |
| Routing | fire-and-forget |

Payload:
```
{
  domain: string,
  updatedNodes: [
    {
      conceptId: string,
      confidencePrevious: number,
      confidenceNew: number,
      bloomsAltitudePrevious: number,
      bloomsAltitudeNew: number,
      trigger: "learning-interaction" | "assessment" | "bridge-engagement"
    }
  ],
  updatedAt: ISO8601
}
```

*Note: Only changed nodes are included; not the full map.*

---

### Gap Events

#### `bb.gaps.<domain>.initial`
Surveyor posts the first gap cluster analysis for a domain after mastery is initialized.

| Field | Value |
|---|---|
| Producer | Surveyor |
| Consumers | Gatekeeper, Donna |
| Routing | fire-and-forget |

Payload:
```
{
  domain: string,
  clusters: [
    {
      clusterId: string,
      label: string,            // human-readable, e.g. "IAM policy evaluation"
      gapType: "knowledge" | "drift" | "bridge" | "convergent-misconception",
      conceptIds: string[],
      priority: "high" | "medium" | "low",
      examWeight: number        // 0.0–1.0, if applicable
    }
  ],
  assessedAt: ISO8601
}
```

#### `bb.gaps.<domain>.updated`
Surveyor posts revised gap analysis as mastery state changes.

| Field | Value |
|---|---|
| Producer | Surveyor |
| Consumers | Gatekeeper, Donna |
| Routing | fire-and-forget |

Payload: same shape as `bb.gaps.<domain>.initial`

#### `bb.gaps.<domain>.post-cert`
Surveyor posts gaps discovered *from* a certification — downstream knowledge implied by the cert but not yet evidenced.

| Field | Value |
|---|---|
| Producer | Surveyor |
| Consumers | Donna |
| Routing | fire-and-forget |

Payload: same shape as `bb.gaps.<domain>.initial`, with `gapType` typically `"knowledge"` or `"bridge"`

---

### Path Events

#### `bb.path.<domain>.ready`
Gatekeeper posts the learning path — the ordered sequence of concept nodes to address.

| Field | Value |
|---|---|
| Producer | Gatekeeper |
| Consumers | Donna, methodology layer |
| Routing | fire-and-forget |

Payload:
```
{
  domain: string,
  sequence: [
    {
      conceptId: string,
      batchId: string | null,   // curated batch this node belongs to
      estimatedSessions: number,
      methodology: string | null  // preferred MCP methodology if specified
    }
  ],
  generatedAt: ISO8601
}
```

#### `bb.path.<domain>.updated`
Gatekeeper posts a revised path after a domain graph update or learner preference change.

| Field | Value |
|---|---|
| Producer | Gatekeeper |
| Consumers | Donna, methodology layer |
| Routing | fire-and-forget |

Payload: same shape as `bb.path.<domain>.ready`, with `updateReason: string` added.

---

### Bridge Events

#### `bb.bridge.requested`
Surveyor files a bridge request when Calibrator signals a confidence plateau on a concept cluster — indicating the learner is stuck and more content alone won't help.

| Field | Value |
|---|---|
| Producer | Surveyor |
| Consumers | Bridge |
| Routing | fire-and-forget |

Payload:
```
{
  domain: string,
  conceptIds: string[],
  learnerState: "plateau" | "confused" | "slow",
  calibratorSignal: {
    confidenceCurrent: number,
    visitsCount: number,
    plateauDuration: string     // e.g. "18min"
  },
  requestedAt: ISO8601
}
```

#### `bb.bridge.ready`
Bridge posts the personalized connection card for Donna to surface.

| Field | Value |
|---|---|
| Producer | Bridge |
| Consumers | Donna |
| Routing | fire-and-forget |

Payload:
```
{
  domain: string,
  conceptIds: string[],
  sourceAnchor: string,         // the Bill-specific mental model used (e.g. "Peach Bottom containment zones")
  bridgeType: string,           // generic bridge type from Domain Twin Librarian
  card: {
    body: string,               // the personalized bridge text
    origin: "domain-twin-generic" | "personal-twin-synthesized"
  },
  readyAt: ISO8601
}
```

---

### Assessment Events

#### `bb.assessment.diagnostic.<topic>`
Tester posts calibrated diagnostic questions to probe mastery depth on a specific topic.

| Field | Value |
|---|---|
| Producer | Tester (Domain Twin, relayed) |
| Consumers | Calibrator, methodology layer |
| Routing | fire-and-forget |

Payload:
```
{
  topic: string,
  items: [
    {
      itemId: string,
      question: string,
      bloomsLevel: 1 | 2 | 3 | 4 | 5 | 6,
      conceptIds: string[]
    }
  ]
}
```

#### `bb.assessment.outcome`
Result of an assessment interaction returned from the methodology layer.

| Field | Value |
|---|---|
| Producer | methodology layer (MCP server) |
| Consumers | Calibrator, Tester (for item calibration feedback) |
| Routing | fire-and-forget |

Payload:
```
{
  itemId: string,
  conceptIds: string[],
  bloomsLevelDemonstrated: number,
  correct: boolean,
  responseTimeMs: number,
  confidence: "certain" | "hesitant" | "guessed"
}
```

---

### Attention Events

#### `bb.synthesis.completed`
*(Existing — from Donna/UDT SIG, F-13)*
Signals that the Office of Facts pipeline has produced a brief ready for Donna. Donna is a read-only consumer of the BB; this event is what she primarily subscribes to.

| Field | Value |
|---|---|
| Producer | Janitor (end of Scribe→Reader→Sorter→Curator→Steward→Janitor pipeline) |
| Consumers | Donna |
| Routing | fire-and-forget |

#### `bb.attention.surfaced`
Donna has surfaced an item to Bill.

| Field | Value |
|---|---|
| Producer | Donna |
| Consumers | analytics / logging |
| Routing | fire-and-forget |

Payload:
```
{
  itemType: "bridge-card" | "gap-item" | "brief" | "learning-node",
  itemId: string,
  mode: string,               // Bill's mode at time of surfacing
  surfacedAt: ISO8601
}
```

#### `bb.attention.outcome`
Bill's response to a surfaced item.

| Field | Value |
|---|---|
| Producer | UI |
| Consumers | Donna, Calibrator (if learning card), Bridge (if bridge card) |
| Routing | fire-and-forget |

Payload:
```
{
  itemId: string,
  itemType: string,
  response: "engaged" | "thanked" | "later" | "dismissed",
  noteAdded: string | null,   // Bill's optional note
  respondedAt: ISO8601
}
```

---

### Domain Currency Events

#### `bb.domain.<domain>.updated`
Cultivator relays a domain graph update from the Domain Twin — cert syllabus changed, service deprecated, new content added.

| Field | Value |
|---|---|
| Producer | Cultivator |
| Consumers | Surveyor, Gatekeeper |
| Routing | fire-and-forget |

Payload:
```
{
  domain: string,
  changes: [
    {
      conceptId: string,
      changeType: "added" | "deprecated" | "modified" | "reweighted",
      examWeightDelta: number | null,
      severity: "minor" | "major"
    }
  ],
  detectedAt: ISO8601
}
```

#### `bb.staleness.watch.<domain>.active`
Cultivator confirms it has registered a staleness watch for a mastered domain.

| Field | Value |
|---|---|
| Producer | Cultivator |
| Consumers | (system / logging) |
| Routing | fire-and-forget |

Payload:
```
{
  domain: string,
  certName: string,
  achievedAt: ISO8601,
  firstReviewAt: ISO8601      // 6 months default
}
```

---

## Part 2 — Inter-Twin Communications (`dwell.*`)

These communications cross constellation boundaries. All are carried on NATS. Subject names encode the addressee per the Inbox Convention above; payloads do not carry `requesterId`.

Each entry is marked **Call** or **Event**.

---

### Discovery Protocol

The Personal Twin does not maintain a registry of Domain Twins. It discovers them by broadcast.

#### `dwell.broadcast.discovery` — **Call** (broadcast)
Personal Twin broadcasts a discovery request. Any Domain Twin covering the requested domain may respond.

| Field | Value |
|---|---|
| Producer | Personal Twin (Bridge) |
| Consumers | All Domain Twins |
| Kind | Call — broadcast; multiple responses possible |

Payload:
```
{
  replyTo: string,            // "dwell.{userId}.discovery.response" — where to reply
  intent: string,             // "GCP Professional Cloud Architect"
  sourceKnowledge: [
    {
      domain: string,         // "aws-saa"
      masteryLevel: number,   // 0.0–1.0
      validated: boolean
    }
  ],
  requestedAt: ISO8601,
  timeoutMs: number
}
```

*Note: `replyTo` is the only case where a userId appears in an inter-twin payload. The broadcast subject has no owner, so Domain Twins need an explicit reply address.*

#### `dwell.{userId}.discovery.response` — **Event**
Domain Twin announces its capabilities to the Personal Twin's inbox.

| Field | Value |
|---|---|
| Producer | Domain Twin |
| Consumers | Personal Twin (Bridge) |
| Kind | Event — directed to Personal Twin's inbox |

Payload:
```
{
  twinId: string,
  domain: string,
  certName: string | null,
  coverage: number,           // 0.0–1.0
  qualityScore: number,
  crossDomainSupport: string[],
  version: string
}
```

#### `dwell.{userId}.domain.gap` — **Event**
Personal Twin self-publishes when no Domain Twin responded within the timeout. First-class finding — not an error.

| Field | Value |
|---|---|
| Producer | Personal Twin |
| Consumers | Platform / constellation level |
| Kind | Event — informs the platform which Domain Twins need to be built |

Payload:
```
{
  intent: string,
  timeoutMs: number,
  requestedAt: ISO8601
}
```

---

### Knowledge Graph Protocol

After discovery, the Personal Twin calls the selected Domain Twin for its knowledge graph.

#### `dwell.{twinId}.kg.request` — **Call**
Personal Twin calls the Domain Twin's inbox for the full knowledge graph.

| Field | Value |
|---|---|
| Producer | Personal Twin |
| Consumers | Domain Twin (Cartographer) |
| Kind | Call — response expected on `dwell.{userId}.kg.delivered` |

Payload:
```
{
  learnerBaseline: [
    {
      domain: string,
      masteryNodes: [
        { conceptId: string, confidence: number, bloomsAltitude: number }
      ]
    }
  ]
}
```

#### `dwell.{userId}.kg.delivered` — **Event**
Domain Twin delivers the knowledge graph, curated batches, and misconception catalog to the Personal Twin's inbox.

| Field | Value |
|---|---|
| Producer | Domain Twin (Cartographer) |
| Consumers | Personal Twin (Calibrator, Surveyor, Gatekeeper) |
| Kind | Event — directed to Personal Twin's inbox |

Payload:
```
{
  twinId: string,
  domain: string,
  graph: {
    nodes: [
      {
        conceptId: string,
        label: string,
        bloomsTargetAltitude: number,
        examWeight: number,
        crossDomainEquivalents: [
          { domain: string, conceptId: string, similarityScore: number, deltaNote: string | null }
        ]
      }
    ],
    edges: [
      { from: string, to: string, relationshipType: "prerequisite" | "reinforces" | "contrasts" }
    ]
  },
  curatedBatches: [
    {
      batchId: string,
      label: string,
      conceptIds: string[],
      teachTogetherReason: string
    }
  ],
  misconceptionCatalog: [
    {
      misconceptionId: string,
      conceptIds: string[],
      sourceDomain: string | null,
      description: string
    }
  ]
}
```

---

### Bridge Query Protocol

Bridge in the Personal Twin calls the Domain Twin's Librarian for generic bridge cards when building a personalized connection.

#### `dwell.{twinId}.bridge.query` — **Call**

| Field | Value |
|---|---|
| Producer | Personal Twin (Bridge) |
| Consumers | Domain Twin (Librarian) |
| Kind | Call — response expected on `dwell.{userId}.bridge.response` |

Payload:
```
{
  targetConceptIds: string[],
  sourceDomains: [
    { domain: string, masteryLevel: number }
  ],
  learnerProfileCluster: string
}
```

#### `dwell.{userId}.bridge.response` — **Event**

| Field | Value |
|---|---|
| Producer | Domain Twin (Librarian) |
| Consumers | Personal Twin (Bridge) |
| Kind | Event — directed to Personal Twin's inbox |

Payload:
```
{
  twinId: string,
  targetConceptIds: string[],
  candidates: [
    {
      bridgeId: string,
      bridgeType: string,
      sourceAnchor: string,
      targetConcept: string,
      genericText: string,
      effectivenessScore: number,
      profileClusterMatch: number
    }
  ]
}
```

---

### Assessment Protocol

#### `dwell.{twinId}.assessment.request` — **Call**

| Field | Value |
|---|---|
| Producer | Personal Twin |
| Consumers | Domain Twin (Tester) |
| Kind | Call — response expected on `dwell.{userId}.assessment.delivered` |

Payload:
```
{
  conceptIds: string[],
  bloomsLevel: 1 | 2 | 3 | 4 | 5 | 6,
  count: number,
  masteryContext: { conceptId: string, currentConfidence: number }[]
}
```

#### `dwell.{userId}.assessment.delivered` — **Event**

| Field | Value |
|---|---|
| Producer | Domain Twin (Tester) |
| Consumers | Personal Twin |
| Kind | Event — directed to Personal Twin's inbox |

Payload:
```
{
  twinId: string,
  items: [
    {
      itemId: string,
      question: string,
      bloomsLevel: number,
      conceptIds: string[],
      distractors: string[],
      correctAnswer: string
    }
  ]
}
```

---

### Outcome Signal Protocol

Personal Twin fires anonymized outcome signals to the Domain Twin after every interaction. This is how Domain Twins get smarter over time.

#### `dwell.{twinId}.outcome.signal` — **Event**

The Personal Twin's job is to report what happened accurately. Analytics, clustering, and pattern recognition are the Domain Twin's responsibility. The signal is already lean enough to be privacy-safe without a cluster label — it contains domain-level facts about an interaction, not personal data.

| Field | Value |
|---|---|
| Producer | Zipper (on behalf of Personal Twin) |
| Consumers | Domain Twin (Librarian, Tester) |
| Kind | Event — fire-and-forget; directed to Domain Twin's inbox |

Payload:
```
{
  conceptId: string,
  interactionType: "learning-node" | "bridge-card" | "assessment-item" | "methodology",
  bridgeId: string | null,     // which bridge card, if interaction was a bridge
  itemId: string | null,       // which assessment item, if interaction was an assessment
  sourceDomains: string[],     // prior domains the learner held (domain-level context, not personal)
  outcome: "engaged" | "thanked" | "later" | "dismissed" | "correct" | "incorrect",
  bloomsAltitudeAtInteraction: number,   // the altitude level this interaction was pitched at
  occurredAt: ISO8601
}
```

**Design principle:** The Personal Twin reports; the Domain Twin learns. The Domain Twin's Librarian accumulates these signals over time and performs its own internal clustering — e.g. "learners arriving from AWS background respond well to hierarchy analogies for IAM concepts." No cluster label is computed or attached by the Personal Twin.

---

### Domain Currency Protocol

The Domain Twin does not push change details to individual Personal Twins. It emits a thin broadcast when its knowledge graph changes. Personal Twins that have the Domain Twin connected via the Zipper receive the notification and pull the pre-curated delta.

#### `dwell.domain.{twinId}.updated` — **Event** (broadcast via channel connector)
Domain Twin notifies all connected Personal Twins that its knowledge graph has changed. Thin signal — no change detail in payload.

| Field | Value |
|---|---|
| Producer | Domain Twin (Cultivator) |
| Consumers | Zipper (on behalf of Personal Twin's Cultivator) |
| Kind | Event — broadcast through channel connector; Zipper relays to BB |

Payload:
```
{
  twinId: string,
  domain: string,
  notifiedAt: ISO8601
}
```

Zipper receives this and posts `bb.domain.<domain>.change-available` to the BB. Personal Twin's Cultivator then requests the delta.

#### `dwell.{twinId}.update.request` — **Call**
Zipper (on behalf of Cultivator) calls the Domain Twin for the pre-curated change delta.

| Field | Value |
|---|---|
| Producer | Zipper |
| Consumers | Domain Twin (Cultivator) |
| Kind | Call — response expected on `dwell.{userId}.update.delivered` |

Payload:
```
{
  sinceVersion: string        // last known Domain Twin version
}
```

#### `dwell.{userId}.update.delivered` — **Event**
Domain Twin delivers the pre-curated delta to the Personal Twin's inbox.

| Field | Value |
|---|---|
| Producer | Domain Twin (Cultivator) |
| Consumers | Zipper → `bb.domain.<domain>.updated` |
| Kind | Event — directed to Personal Twin's inbox |

Payload:
```
{
  twinId: string,
  domain: string,
  fromVersion: string,
  toVersion: string,
  affectedConcepts: [
    {
      conceptId: string,
      changeType: "deprecated" | "modified" | "reweighted" | "added",
      severity: "minor" | "major",
      changeNote: string
    }
  ],
  deliveredAt: ISO8601
}
```

Zipper receives this and emits `bb.domain.<domain>.updated` internally for Surveyor, Gatekeeper, and Cultivator to act on.

---

## Part 3 — Agent-to-Event Map

Summary of which agents produce and consume which events.

### Personal Twin Agents

| Agent | Emits / Calls | Consumes |
|---|---|---|
| **Antiquarian** | emits `bb.learner.<domain>.baseline` | `bb.intent.declared`, `bb.cert.<domain>.achieved` |
| **Calibrator** | emits `bb.mastery.<domain>.initialized`, `bb.mastery.<domain>.updated` | `bb.learner.<domain>.baseline`, `bb.assessment.outcome`, `bb.attention.outcome` |
| **Surveyor** | emits `bb.gaps.<domain>.initial`, `bb.gaps.<domain>.updated`, `bb.gaps.<domain>.post-cert`, `bb.bridge.requested` | `bb.mastery.<domain>.initialized`, `bb.mastery.<domain>.updated`, `bb.domain.<domain>.updated` |
| **Gatekeeper** | emits `bb.path.<domain>.ready`, `bb.path.<domain>.updated` | `bb.mastery.<domain>.initialized`, `bb.mastery.<domain>.updated`, `bb.gaps.<domain>.*`, `bb.learner.preferences.updated`, `bb.domain.<domain>.updated` |
| **Bridge** | emits `bb.bridge.ready` | `bb.bridge.requested`, `bb.attention.outcome`, `bb.answer.bridge` |
| **Answer Agent** | emits `bb.answer.*` (typed by contribution kind) | `bb.contribution.*`; evaluates in context of full BB state |
| **Engagement Agent** | routes `bb.answer.*` to correct downstream consumer | `bb.answer.*`; routes to Donna, Calibrator, Gatekeeper, or Zipper |
| **Cultivator** | emits `bb.staleness.watch.<domain>.active`, `bb.domain.<domain>.updated` | `bb.cert.<domain>.achieved`, `bb.domain.<domain>.change-available` |
| **Zipper** | calls/fires all `dwell.*` subjects; emits `bb.domain.<domain>.change-available`, `bb.contribution.*` | all `bb.need.*` events; all inbound `dwell.{userId}.*` responses |
| **Donna** | emits `bb.attention.surfaced` | `bb.bridge.ready`, `bb.gaps.<domain>.*`, `bb.path.<domain>.ready`, `bb.synthesis.completed`, `bb.mastery.<domain>.updated`, `bb.attention.outcome` |

### Domain Twin Agents

| Agent | Emits / Responds | Consumes |
|---|---|---|
| **Cartographer** | emits `dwell.{userId}.kg.delivered` | `dwell.{twinId}.kg.request` |
| **Librarian** | emits `dwell.{userId}.bridge.response` | `dwell.{twinId}.bridge.query`, `dwell.{twinId}.outcome.signal` |
| **Tester** | emits `dwell.{userId}.assessment.delivered` | `dwell.{twinId}.assessment.request`, `dwell.{twinId}.outcome.signal` |
| **Cultivator** | emits `dwell.domain.{twinId}.updated`, `dwell.{userId}.update.delivered` | *(external: cert body feeds, changelog monitors)*; `dwell.{twinId}.update.request` |
| *(self-announcement)* | emits `dwell.{userId}.discovery.response` | `dwell.broadcast.discovery` |

---

## Part 4 — Open Questions (Not Yet Resolved)

These are design questions that must be answered before the SIG is written for the affected events.

1. ~~**Who manages the subscription list for `dwell.domain.staleness.notified`?**~~ **RESOLVED.** The Zipper holds the channel connector to the Domain Twin as an MCP connection. The Domain Twin emits a thin `dwell.domain.{twinId}.updated` notification through the channel when it changes. The Zipper receives it and relays to the BB. No explicit subscription management needed — the channel connector IS the subscription.

2. ~~**Who is the Liaison?**~~ **RESOLVED.** The Zipper is the Liaison. Bridge = synthesis only (reads from BB, writes to BB). Zipper = all inter-twin coordination (translates BB needs into `dwell.*` tool calls, posts results back to BB). The two agents do not overlap.

3. ~~**Bloom's altitude on `bb.mastery.initialized`**~~ **RESOLVED.** See *Bloom's Altitude Model* section. `bloomsTargetAltitude` is course configuration owned by the Domain Twin. `bloomsCurrentAltitude` is Calibrator's estimate from Antiquarian's evidence using the evidence-type → altitude mapping. Altitude gap = target − current = unit of work per node. Warm/cold student distinction governs path depth and Domain Twin content floor/ceiling.

4. ~~**`learnerProfileCluster` definition**~~ **RESOLVED.** `learnerProfileCluster` dropped entirely. The Personal Twin reports what happened (lean domain-level signal); Domain Twin does its own analytics and clustering internally. No cluster label needed on the Personal Twin side. See updated `dwell.{twinId}.outcome.signal` payload.

5. ~~**Multiple Domain Twin responses**~~ **RESOLVED.** Two agents handle this. **Answer Agent** (new) evaluates multiple contributions on the BB using full BB context and posts a ranked selection as `bb.answer.*`. **Engagement Agent** (existing — `foundation/attention/engagement-agent.ts`) routes the selection to the right downstream consumer. Answer Agent selects; Engagement Agent delivers. For discovery: Answer Agent evaluates Domain Twin responses by `coverage`, `qualityScore`, `crossDomainSupport`, and specificity; may connect to multiple Domain Twins simultaneously.

---

## Vocabulary

- **`bb.*`** — intra-twin NATS namespace; events that coordinate agents within a single twin
- **`dwell.*`** — inter-twin NATS namespace; the Zipper's wire format for communicating with Domain Twin MCP servers
- **Zipper** — the Personal Twin's declarative tool layer; the only agent that crosses the `bb.*` / `dwell.*` boundary; maintains channel connectors (MCP connections) to all connected Domain Twins; everything on the Zipper looks like a tool
- **Channel connector** — a persistent MCP connection between the Zipper and one Domain Twin or external service
- **Answer Agent** — Personal Twin agent that evaluates multiple contributions landing on the BB and selects or ranks them in the context of full BB state (mastery, gaps, learner profile); posts selections as `bb.answer.*`
- **Engagement Agent** — existing twin agent (`foundation/attention/engagement-agent.ts`); routes Answer Agent selections to the correct downstream consumer (Donna, Calibrator, Gatekeeper, or Zipper)
- **Curated batch** — a pedagogically-coupled concept cluster defined by the Domain Twin; concepts that must be taught together
- **Outcome signal** — lean domain-level report of a learning interaction, fired by the Zipper to the Domain Twin after every interaction; Personal Twin reports, Domain Twin learns; no personal identifiers, no cluster labels
- **Convergent-misconception risk** — a gap type where multiple prior-domain experiences produce the same wrong intuition in a new domain
- **Librarian** — Domain Twin agent that curates and serves pedagogical artifacts; accepts outcome signals; updates effectiveness scores
- **Bloom's altitude** — the cognitive level at which mastery is held (1=Remember, 2=Understand, 3=Apply, 4=Analyze, 5=Evaluate, 6=Create)
- **`bloomsTargetAltitude`** — the altitude required by the course/cert offering; set by the Domain Twin; determines content ceiling per node
- **`bloomsCurrentAltitude`** — Calibrator's estimate of where the learner is now on a node; derived from Antiquarian evidence; determines content floor
- **Altitude gap** — `bloomsTargetAltitude − bloomsCurrentAltitude`; the unit of work for a node; gap=0 means complete
- **Warm student** — learner with prior evidence on a domain; `currentAltitude > 0` on many nodes; shorter traversal path
- **Cold student** — learner with no prior evidence; `currentAltitude = 0` across nodes; full traversal required
