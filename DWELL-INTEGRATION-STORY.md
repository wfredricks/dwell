# How Dwell Fits — An Integration Story

*Purpose: Solidify the architecture of Dwell as a twin plugin, not a standalone system*
*Date: 2026-07-01*
*Scenario: Credence adds Dwell to their existing employee constellation*

---

## Scene 1 — The Existing Constellation

Credence has a constellation. It has been running for months.

Inside it: 47 employee Personal Twins, three Persona Twins (Solutions Architect, Developer, Business Analyst), and a Credence Enterprise Twin. They share Commons — Donna Commons, Observer Commons, Algo Commons. All of them built on the same substrate. All of them running quietly, doing their jobs.

Bill's Personal Twin is one of those 47. It has been alive since February. It knows Bill's projects, his risks, his writing. It has Donna — F-13, watching the room. It has the Zipper, the Blackboard, the Event Fabric. It wakes when Bill wakes and listens when he works.

Nobody has added anything to the constellation in weeks. Everything is stable.

Then one morning, a Credence IT administrator deploys a new twin.

---

## Scene 2 — A New Twin Joins

The AWS Solutions Architect Domain Twin comes online.

It is built on the same substrate as every other twin in the constellation. Same Zipper. Same Blackboard. Same Event Fabric. Different profile.

Its `ModuleActivation` says: `foundation: true`, `dwell-domain: true`, everything else off. It has Cartographer (the AWS SAA knowledge graph, 340 concept nodes, curated batches, misconception catalog), Librarian (300+ bridge cards built from years of pedagogical curation), Tester (a calibrated item bank), and Domain Cultivator (watching the AWS certification changelog).

It does not have Antiquarian. It does not have Calibrator. It does not have Donna. It knows a domain, not a person.

When it starts up, O-1 Self-Assembly registers it in the constellation's twin registry. It subscribes to the discovery channel: `dwell.broadcast.discovery`.

That's all. It is ready. It waits.

---

## Scene 3 — The Module Activates

The Credence IT administrator also pushes a profile update to Bill's Personal Twin.

One line changes in `ModuleActivation`: `dwell-personal: true`.

Bill's twin reads the update and initializes the Dwell personal module. `createDwellModule()` runs. It registers:

- **Antiquarian** as an EventListener on F-5 — subscribes to `bb.intent.declared`, `bb.cert.achieved`, `bb.attention.outcome`
- **Calibrator** as an EventListener — subscribes to `bb.learner.*.baseline`, `bb.assessment.outcome`, `bb.attention.outcome`
- **Surveyor** as an EventListener — subscribes to `bb.mastery.*.initialized`, `bb.mastery.*.updated`
- **Gatekeeper** as a BBTool in the BBToolRegistry — will contribute through the Probe stage when a learning need is active
- **Bridge** as a BBTool — same
- **Answer Agent** as a BBTool — same
- **Cultivator** as an EventListener — subscribes to `bb.cert.*.achieved`, `bb.domain.*.change-available`

Nothing else changes. The Zipper is the same. The Blackboard is the same. Donna is the same. The existing UDT infrastructure doesn't know or care that new tools and listeners just registered. It was designed for exactly this.

Bill's twin is now Dwell-capable. He doesn't see anything different yet.

---

## Scene 4 — The Intent

Bill opens his twin and types:

> *AWS Solutions Architect cert.*

This is a prompt. It enters the Zipper exactly as every other message does — `createEnvelope()`, phase BORN, routed through F-4 Tiered (this is a T1 task — tool-assisted).

The Blackboard's Probe stage fires. The broadcast goes to every registered BBTool.

Most tools abstain. `KnowledgeTool` (F-11) finds nothing relevant in Bill's knowledge graph yet. `AlgoTool` (I-10) has no codified algorithm for this. `McpTool` (I-7) has no active connections yet.

**Gatekeeper** receives the prompt. It reads the intent text. It has something to say: it needs to initiate domain discovery. It returns a `ToolResponse`: *"Learning intent detected — discovery needed for AWS SAA."*

**Answer Agent** also responds: it signals it's ready to evaluate any discovery responses that come back.

The Blackboard scores both responses, gates them, and passes them to synthesis. The Persona Synthesizer composes a response for Bill:

> *Got it — looking for an AWS SAA expert.*

---

## Scene 5 — The Discovery

Meanwhile, on the Event Fabric:

Antiquarian received `bb.intent.declared` and began its baseline assessment. Calibrator is waiting for the baseline. Surveyor is waiting for the mastery map. Gatekeeper, through the Zipper's inter-twin extension, fires `dwell.broadcast.discovery` onto the constellation NATS fabric.

In a different container — the AWS SAA Domain Twin — the discovery event arrives.

The Domain Twin reads the intent: "AWS Solutions Architect cert." It reads the source knowledge: Bill holds 12 years of AWS experience, no prior validated cert. It decides it can serve this. It fires `dwell.bill-twin-001.discovery.response` back onto the fabric.

Bill's Zipper receives the response on its inbox subject. It posts `bb.contribution.discovery` to the Blackboard.

Answer Agent sees the contribution. One response, clear match. It posts `bb.answer.discovery` — selected the AWS SAA Domain Twin.

The Engagement Agent (already in the twin — F-13 pipeline infrastructure) routes the answer to the Zipper, which establishes the MCP channel connector to the AWS SAA Domain Twin.

The Zipper calls `dwell.aws-saa-twin.kg.request` with Bill's mastery baseline.

---

## Scene 6 — The Knowledge Graph Arrives

The AWS SAA Domain Twin's Cartographer receives the request. It assembles the knowledge graph with Bill's baseline applied — computing content floors per concept from his prior evidence. It delivers `dwell.bill-twin-001.kg.delivered` back through the fabric.

The Zipper receives it. Posts `bb.domain.aws-saa.loaded` to the BB.

Calibrator, Surveyor, and Gatekeeper all hear it simultaneously:

- Calibrator initializes the mastery map — 247 nodes at Apply (3) from prior evidence, 93 cold
- Surveyor posts the initial gap clusters — four priority clusters
- Gatekeeper generates the learning path — convergent-misconception nodes first

These are all `bb.*` events. They never leave the twin. They're just the Event Fabric doing what it always does — listeners reacting, state updating, the system orienting itself.

**None of this disturbs the rest of Bill's twin.** His briefings still run. His task tracking still works. Donna is still watching. The Observer is still observing. The Algo engine is still running. A new capability has been added; nothing existing was displaced.

---

## Scene 7 — Donna Gets New Material

Three days later. Bill is drafting a proposal. He's been at it for 45 minutes.

Somewhere in the Blackboard pipeline, Surveyor has been watching. It noticed that the GCP subnet concept cluster has been visited four times in the last 22 minutes with confidence stalled at 0.61. It posted `bb.bridge.requested`.

Bridge received it. Queried the AWS Domain Twin's Librarian through the Zipper. Got candidate bridge cards back. Read the AntiquarianSnapshot on the BB. Selected the containment-zone mental model. Personalized the card. Posted `bb.bridge.ready`.

That post went into the Office of Facts pipeline — the same pipeline that handles regulatory updates, project insights, and meeting prep. Scribe logged it. Reader classified the content type: learning-bridge, domain: cloud-networking, urgency: non-urgent. Sorter assigned a priority. Curator retrieved related knowledge nodes from the graph. Steward verified currency. Janitor checked: has Bill seen this concept cluster recently? Yes but hasn't engaged. Is the window appropriate? Not yet — he's in focused mode.

Donna holds it.

Bill finishes a section. Pauses. Eleven seconds.

Donna surfaces the card — the same way she always surfaces things. She has no idea it's a "Dwell item." It's just an item, classified and prioritized by her pipeline, surfaced at the right moment. The fact that it came from a learning agent rather than a knowledge retrieval agent is invisible to her. The pipeline doesn't distinguish.

Bill reads it. Presses 👍.

`bb.attention.outcome` fires. Calibrator receives the engagement signal. The Zipper fires an outcome signal to the AWS Domain Twin. Donna records it in her commons contribution.

Everything that just happened — the bridge synthesis, the domain twin query, the mastery update, the outcome signal — ran through infrastructure that was already there. Donna was Donna. The Zipper was the Zipper. The Blackboard was the Blackboard.

Dwell was just the intelligence layer that gave them something new to work with.

---

## What the Story Establishes

**Dwell is not a system. It is a set of capabilities that activate within a system.**

The twin provides:
- The pipeline (Zipper, Blackboard, Tiered Router)
- The event fabric (NATS, F-5)
- The surfacing (Donna, F-13)
- The constellation infrastructure (O-1, twin registry, discovery fabric)

Dwell provides:
- Learning state management (Antiquarian, Calibrator) — EventListeners
- Gap and path intelligence (Surveyor, Gatekeeper) — EventListeners + BBTool
- Bridge synthesis (Bridge, Answer Agent) — BBTools
- Domain currency (Cultivator) — EventListener
- Domain expert knowledge (Domain Twin — a separate twin in the constellation)

The Domain Twin is not special infrastructure. It is a twin with a domain-expert profile. It joins the constellation the same way any twin does. It listens on the discovery channel. When asked, it answers.

Enterprise deployment is: deploy Domain Twins into the existing constellation, flip `dwell-personal: true` in the relevant employee twin profiles. Nothing else. The constellation handles the rest.
