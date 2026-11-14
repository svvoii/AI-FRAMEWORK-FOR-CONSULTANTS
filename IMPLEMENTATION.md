# System Implementation Plan — Consulting Deliverables AI Framework

This document defines the staged engineering plan and build steps for the **Reusable AI Framework for Consulting Deliverables** described in [PLAN.md](PLAN.md), including a runnable prototype that demonstrates the core architecture and the end-to-end S/4HANA scoping workflow.

`PLAN.md` remains the system contract. This document narrows that architecture into an implementable demonstration vertical slice.

---

## Prototype v1 Scope & Acceptance Contract

### Prototype boundary

The prototype is a governed vertical slice using synthetic Procure-to-Pay evidence. It is not a production document platform, an authorization service, or an authoritative S/4HANA advisor.

Use **FastAPI, Pydantic, SQLite, and SQLite full-text search**. SQLite is the queryable system of record for sources, canonical records, candidate records, snapshots, approvals, dependencies, and audit events. Do not introduce a vector database until retrieval evaluation demonstrates a need.

The demonstration implements three skill packages through one shared Deliverable Agent:

- Workshop report.
- Fit-gap analysis using an explicitly synthetic solution-reference dataset, not real S/4HANA product assertions.
- Steering-committee summary.

Target architecture appears as a dependent-deliverable scenario snapshot and impact-notification target, not as a fourth implemented generation skill.

### Included

- Pre-parsed synthetic workshop notes with stable source spans.
- Project/role metadata enforced by server-side retrieval and state-transition checks.
- Cited workshop-report drafts and individual claim review.
- Candidate-fact promotion with explicit conflict preservation.
- Fit-gap proposal and dependent-deliverable review tasks.
- Steering summary using validated facts and explicit conflict escalations.
- Immutable published versions with reproducible provenance.
- One live provider integration plus a clearly labelled deterministic mock provider.

### Deferred beyond v1

- Arbitrary document ingestion, OCR, speaker diarization, and automatic table extraction.
- Production SSO, identity provisioning, tenant administration, and secret management.
- Additional live model adapters or automatic provider failover.
- Authoritative S/4HANA solution catalogues or automated fit-gap recommendations.
- Cross-project client-content reuse.
- Native DOCX/PPTX export.
- Autonomous communication, publication, or conflict resolution.

### Required demo path

```text
WS-01: approved EUR 25,000 approval threshold
  -> WS-04: EUR 50,000 statement with unclear company-code scope
  -> cited workshop-report draft
  -> independent review of report and candidate facts
  -> CONFLICTED candidate; DEC-P2P-004 remains unchanged
  -> CONFLICTED fit-gap proposal; publication blocked
  -> steering summary escalates the conflict without choosing a threshold
  -> new clarification evidence establishes company-code scope
  -> domain lead reviews and approves a versioned canonical change
  -> new immutable report, fit-gap, and steering versions
  -> historical versions and citations remain reproducible
```

No stage may silently replace the existing canonical decision with the unresolved EUR 50,000 statement. A steering summary may describe the reported statement and the unresolved conflict, but must not present either value as the confirmed enterprise rule.

### Governing state-transition rules

These records are distinct and must not be collapsed into one approval status:

| Record | Meaning | Allowed transitions |
|---|---|---|
| `SourceAssertion` | A preserved statement in source evidence | Immutable after ingestion; a correction creates a new source version |
| `CanonicalRecord` | An authoritative project decision or fact | New reviewed version may supersede the current version; history remains unchanged |
| `CandidateRecord` | A proposed assertion/decision awaiting individual review | `Proposed -> Accepted | Rejected | Conflicted`; `Conflicted -> Proposed` only from new clarification evidence; only `Accepted -> Promoted` |
| `DeliverableDraft` | An editable assembly of atomic claims | `Draft -> In review -> Accepted for publication | Changes requested`; correction always creates a new draft |
| `Publication` | An immutable deliverable snapshot | Created only by an authorized approval; never edited or deleted by normal workflow actions |

Additional invariants:

1. Approving the accuracy of a workshop report does **not** approve all candidate facts within it.
2. A conflicted candidate cannot replace or supersede an authoritative canonical record.
3. A conflict may block promotion or publication, but never source ingestion or draft creation.
4. Only an accepted candidate or an independently reviewed canonical change may create an authoritative canonical version.
5. A clarification is new source evidence; reviewer text alone is not silently converted into evidence.
6. An approved version is immutable. Corrections create a linked new draft and publication version.
7. Every generation is bound to frozen source versions, authorized context, canonical-record versions, citations, skill/prompt/template versions, and provider configuration.
8. Report, fit-gap, and steering publication are separate decisions. Approval of one does not approve the others.

---

## Target System & Prototype Structure

```text
AI-FRAMEWORK-FOR-CONSULTANTS/
├── PLAN.md                       # System architecture & technical design specification
├── IMPLEMENTATION.md             # Staged engineering & prototype build plan (this file)
├── diagrams/                     # Mermaid (.mmd) sources + light/dark rendered SVGs
│   ├── architecture.mmd          # System architecture & skill extension model
│   ├── workshop-to-fit-gap.mmd   # End-to-end workflow with contradiction handling
│   └── governance.mmd            # 3-layer knowledge lifecycle & security gates
├── presentation/                 # Sleek 16:9 HTML slide deck (Deloitte minimal style)
│   └── index.html
└── prototype/                    # Functional prototype of the reusable engine
    ├── app/
    │   ├── main.py               # FastAPI entry point & web UI routes
    │   ├── models.py             # Sources, assertions, canonical/candidate records, claims, drafts
    │   ├── gateway.py            # Common gateway contract, live provider, explicit mock provider
    │   ├── knowledge.py          # SQLite three-layer store, ACL filters, FTS5 retrieval
    │   ├── orchestrator.py       # Main Agent: scope check, snapshot freeze, skill routing
    │   ├── agents.py             # Shared Deliverable Agent, Knowledge Steward, Quality Reviewer
    │   └── skills/               # Pluggable skill packages (manifest + schema + template)
    │       ├── registry.py       # Skill discovery & contract validation
    │       ├── workshop_report/  # Skill 1: Workshop Report generation
    │       ├── fit_gap/          # Skill 2: Fit-Gap analysis & conflict detection
    │       └── steering_deck/    # Skill 3: Steering Committee executive summary
    ├── data/                     # Synthetic S/4HANA P2P scoping dataset
    │   ├── ws01_notes_approved.md
    │   ├── ws04_notes_raw.md     # Contains the EUR 50,000 vs EUR 25,000 PO contradiction
    │   ├── ws05_clarification.md # New evidence resolving company-code scope
    │   ├── canonical_seed.json   # Baseline validated project knowledge
    │   ├── solution_reference.json # Explicitly synthetic fit-gap comparison knowledge
    │   └── demo_fixtures/        # Frozen requests and deterministic mock responses
    ├── static/                   # Minimalist consultant workspace UI (HTML/CSS/JS)
    └── tests/                    # Golden evaluation & regression test bench
        └── test_engine.py
```

---

## Stage 1 — Architecture & Visual Diagrams (`diagrams/`)

**Objective:** Produce clean, syntax-validated Mermaid diagrams (`.mmd` + light/dark `.svg`) that visually explain the architecture, the three-layer knowledge model, and the end-to-end conflict-aware walkthrough.

### Specific Steps

1. **`diagrams/architecture.mmd` — Reusable Engine & Skill Extension:**
   - Model the 4 core layers: Consultant Workspace → Controlled Orchestrator (Main Agent + shared Deliverable Agent, Knowledge Steward, Quality Reviewer) → Pluggable Skill Packages (`workshop-report`, `fit-gap`, `target-architecture`, `steering-committee`) → Shared Platform Services (3-Layer Store + Provider-Agnostic Gateway).
   - Target architecture remains an architectural extension in this diagram; v1 stores a dependent snapshot rather than implementing its generation skill.
2. **`diagrams/workshop-to-fit-gap.mmd` — Concrete Walkthrough & Contradiction Handling:**
   - Trace the scenario: Raw Workshop Notes (`EUR 50k PO approval`) → Cited Workshop Report Draft → Report Approval Separate from Fact Review → Knowledge Steward Comparison against Canonical Record (`EUR 25k`) → `Conflicted` Candidate and Fit-Gap Proposal with Publication Blocked → Impact Notification → New Clarification Evidence → Domain Lead Approval → Versioned Canonical Change and New Immutable Deliverables.
3. **`diagrams/governance.mmd` — Knowledge Lifecycle & Trust Boundaries:**
   - Illustrate the separation between Immutable Source Evidence (Layer 1), Validated Canonical Knowledge (Layer 2), and Versioned Deliverable Snapshots (Layer 3), alongside Pre-Retrieval ACL Filtering and Provider Routing by Data Classification.
4. **Validation & Rendering:**
   - Lint every `.mmd` file with `check_mmd.py` and render light and dark SVGs via `render_mmd.sh`. Do not reuse an old SVG as evidence that the current source renders.

---

## Stage 2 — Core Engine & Three-Layer Knowledge Store (`prototype/app/models.py`, `knowledge.py`)

**Objective:** Build the data contracts and storage layer that enforce separation between raw unvalidated evidence, approved project facts, and immutable deliverable snapshots.

### Specific Steps

1. **Define Strict Data Schemas (`models.py`):**
   - `SourceChunk`: document ID, version hash, project ID, phase (`Prepare`, `Assess`, `Analyze`, `Advise`), workshop ID, process (`P2P`), ACL role list, confidentiality level, text span, and character offsets into the immutable normalized source.
   - `SourceAssertion`: stable ID, source chunk/span, extracted statement, scope qualifiers, and extraction state. It records what a source says, not whether it is authoritative.
   - `CanonicalRecord`: stable ID (e.g., `DEC-P2P-004`), entity type (`Decision`, `Requirement`, `Gap`, `Risk`), statement, value and applicable scope, effective dates, source citations, approval metadata, version, and `supersedes_id`. Use separate stable ID and record-version ID so supersession history remains queryable.
   - `CandidateRecord`: linked source assertion, proposed canonical entity/change, review state (`Proposed`, `Accepted`, `Rejected`, `Conflicted`), review metadata, clarification references, and eventual promoted canonical version.
   - `AtomicClaim`: text statement, claim status (`Sourced`, `Validated`, `Proposed`, `Conflicted`, `Unknown`), exact source span citations, canonical IDs plus versions, and claim-level review outcome.
   - `DeliverableDraft`: skill ID/version, context snapshot ID, sections of `AtomicClaim` items, quality findings, review metadata, predecessor draft ID, and lifecycle state.
   - `Publication`: immutable rendered/structured snapshot, predecessor publication ID, reviewer and approval timestamp, source/canonical/skill/prompt/template/provider versions, and complete claim-to-source map.
2. **Implement the 3-Layer Store (`knowledge.py`):**
   - **Layer 1 (Evidence Store):** Ingests the controlled dataset, computes SHA-256 content hashes, preserves immutable originals/normalized text, and indexes known spans with project/phase/process metadata. Synthetic ingestion does not claim general OCR or parsing support.
   - **Layer 2 (Canonical Knowledge Store):** Separately stores authoritative canonical versions and non-authoritative candidates. Query by process and applicable scope; detect the seeded conflict deterministically using amount, currency, role, scope, exclusions, validity dates, and negation. Never treat numeric inequality alone as general semantic contradiction detection.
   - **Layer 3 (Deliverable Store):** Saves versioned drafts, publications, dependencies, source spans, generation configuration, review events, and append-only audit records. Use transactional writes; reject updates/deletes to published rows and append-only audit rows in the data access layer, supplemented by SQLite triggers where practical.
3. **Enforce Pre-Retrieval Access Control and State Transitions:**
   - Filter all retrieval queries by `user_role`, `project_id`, and permitted `confidentiality_class` before returning chunks, candidates, or canonical records.
   - Enforce record transitions and role checks in service-layer transactions, not only by disabling UI buttons. Prototype identities are explicitly simulated test fixtures rather than production authentication.
   - Freeze the IDs and versions of all authorized inputs in a reproducible context snapshot. Recheck authorization before displaying sources or publishing an output.

---

## Stage 3 — Provider-Agnostic Model Gateway (`prototype/app/gateway.py`)

**Objective:** Decouple agent and skill logic from specific model vendors while making live versus deterministic operation explicit.

### Specific Steps

1. **Unified Completion & Structured-Output Contract:**
   - Implement `ModelGateway.generate_structured(prompt, schema, data_class, provider)` returning schema-validated Pydantic objects plus provider, model, request, latency, and available token/cost telemetry.
   - Gateway implementations must not bypass orchestrator authorization or claim-status validation. Schema validation establishes structure, not source support.
2. **Two Explicit Operating Modes:**
   - **Live:** one implemented Mistral API integration using a configured model and approved structured-output mechanism, selected through environment configuration. No live calls occur without an explicit live-mode selection and configured credentials.
   - **Mock:** deterministic fixture replay keyed by the frozen scenario/request ID and fixture version. Unknown requests return a clear error rather than fabricated live output.
   - Do not silently cache or replay a response when a live request fails. The UI and audit log always show `Live`, `Mock`, or an explicit failure. Anthropic/OpenAI/Local adapters are deferred; supporting a new provider requires a new adapter and passing its contract/domain tests, not merely changing a string.
3. **Policy and Telemetry:**
   - Use only synthetic `Internal Demo` data in v1. Production classifications such as `Restricted` remain design metadata and do not prove any provider's hosting sovereignty, authorization, or retention policy. Provider/deployment approval is an explicit future configuration, not a claim implied by a vendor name.
   - Record every attempted call in an append-only audit log: timestamp, request ID, operating mode, context snapshot hash, skill/prompt/template versions, provider/model/fixture ID, latency, outcome, and available token/cost telemetry. Do not log secrets or unnecessary source content.

---

## Stage 4 — Agents & Pluggable Skill Packages (`prototype/app/orchestrator.py`, `agents.py`, `skills/`)

**Objective:** Implement the bounded workflow and prove that adding a new deliverable requires only adding a skill package, not modifying the core engine.

### Specific Steps

1. **Main Agent / Orchestrator (`orchestrator.py`):**
   - Resolves the simulated project role and allowed scope, freezes a read-only context snapshot, selects the target skill from the registry, and coordinates the pipeline (`Shared Deliverable Agent` → `Quality Reviewer` → `Consultant Review Gate`).
   - Coordinates separate report-review, candidate-review, clarification, canonical-promotion, and publication workflows. It must not convert one UI approval into several unrelated approvals.
2. **Specialized Agents (`agents.py`):**
   - **Deliverable Agent (shared):** Executes the selected skill's retrieval rules and generation prompt to produce a structured draft with atomic claims and exact citations. There is one Deliverable Agent implementation, not one agent per deliverable.
   - **Knowledge Steward:** Extracts candidate assertions/decisions from an approved workshop report without promoting them. Each candidate is reviewed independently. Compares proposed changes against existing canonical records and preserves conflicts (EUR 50,000 versus EUR 25,000), rather than silently overwriting.
   - **Quality Reviewer:** Runs checks before human review:
     - *Citation validity:* Every `Sourced` or `Validated` claim resolves to an authorized source chunk in the frozen snapshot.
     - *Source fidelity:* Exact character offsets resolve to the cited source text; `Validated` claims link approved canonical versions and supporting sources.
     - *Completeness:* All mandatory template sections in the skill manifest are populated or explicitly `Unknown`.
     - *Contradiction and scope:* Seeded value/scope/negation conflicts are marked `Conflicted`; an unresolved candidate never replaces the current canonical record.
     - *Publication gate:* Invalid citations, invalid schema, unauthorized context, unresolved critical conflicts affecting the assertion, or missing required approval block publication.
3. **Pluggable Skill Registry (`skills/`):**
   - Each skill folder contains a declarative `manifest.json` (name, version, required inputs, output schema, mandatory sections/checks, supported claim statuses) and prompt/template rules:
     - `workshop_report`: Produces structured summary, candidate decisions, gaps, actions, and open questions from workshop notes. Report approval verifies faithful documentation only.
     - `fit_gap`: Compares requirements to the explicitly synthetic solution-reference records, incorporates candidate knowledge deltas, and surfaces conflicts. A conflicted proposal may be saved as a draft but cannot be published as the resolved fit-gap.
     - `steering_deck`: Aggregates `Validated` decisions, open `Conflicted` escalations, and critical gaps without upgrading conflicted candidates into established facts.
   - Prove extensibility through a skill-contract test that registers and executes all three skills without changing orchestrator code.

---

## Stage 5 — Interactive Consultant Workspace UI (`prototype/static/`)

**Objective:** Provide a minimal interface for the end-to-end case study walkthrough and make the governance model visible during the presentation.

### Specific Steps

1. **Project & Evidence View:**
   - Display the synthetic P2P context, WS-01 evidence and its approved report, WS-04 raw evidence, the WS-05 clarification when introduced, and current canonical and candidate records.
   - Distinguish clearly between a source-approved report and the currently authoritative decision.
2. **Skill Execution & Draft Inspector:**
   - Allow selection and generation of the three v1 skills using the same shared Deliverable Agent.
   - Render each claim with status badges and clickable exact source spans. Show source/canonical versions and distinguish mock/live/failure results.
3. **Independent Review & Promotion Controls:**
   - Provide separate **Approve faithful report**, **Accept candidate**, **Reject candidate**, **Flag conflict / Request clarification**, **Promote accepted candidate**, and **Publish deliverable** actions.
   - Promotion of the unresolved WS-04 threshold must be rejected server-side. Flagging the conflict preserves `DEC-P2P-004`, creates the conflicted candidate, enables a conflicted fit-gap draft, and creates dependent-deliverable review tasks.
   - Introduce WS-05 as new evidence, review its candidate scope, then authorize a canonical change with effective dates/supersession. Publish new immutable versions and display version history.
4. **Governance & Operating-Mode Panel:**
   - Display the actual active mode: **Live (Mistral)** or **Mock (fixture)**. Do not show unimplemented provider switches or automatic fallback.
   - Display audit entries, simulated project role/ACL checks, quality findings, blocked-publication reasons, and reviews. Simulate named roles only for the demonstration; enforce the same state transitions server-side.

---

## Stage 6 — Evaluation Test Bench & Presentation Deck (`prototype/tests/`, `presentation/`)

**Objective:** Verify the governance behavior with automated regression tests and package the architecture, diagrams, and walkthrough into a 16:9 HTML presentation.

### Specific Steps

1. **Automated Test Bench (`prototype/tests/test_engine.py`):**
   - Test 1 — *ACL & Tenant Isolation:* Unauthorized roles or cross-project queries return zero evidence chunks and cannot invoke generation, promotion, or publication operations. Citations cannot expose unauthorized exact spans.
   - Test 2 — *Citation Validity & Fidelity:* Factual claims have authorized snapshot citations; exact character offsets reproduce the cited passage; dangling or modified spans fail. Validated claims additionally have approved canonical provenance.
   - Test 3 — *Claim Support & Status:* Golden examples cover support for meaning, amount, currency, approver, company-code scope, exclusions, and negation for both English/French variants. Unsupported, contradicted, or scope-mismatched evidence cannot qualify as direct support. Model-assisted support judgements receive human golden-set review; a passing citation checksum alone does not prove grounding.
   - Test 4 — *State Transitions:* Report approval does not promote facts. `Conflicted` cannot be promoted. The existing canonical record remains unchanged until accepted clarification evidence and authorized approval create a new version. Accepted/rejected candidates cannot jump directly to published deliverables.
   - Test 5 — *Conflict-Safe Deliverables:* EUR 50,000 versus EUR 25,000 produces a `Conflicted` candidate and fit-gap proposal, prevents resolved fit-gap publication, creates review tasks, and keeps steering wording explicitly unresolved.
   - Test 6 — *Immutability & Reproducibility:* Modifying/deleting an approved publication or audit record fails. Reopening an old publication reproduces its source/canonical/skill/prompt/template/provider configuration. Editing creates a linked successor rather than mutating history.
   - Test 7 — *Skill Contract & Provider Contract:* All three registered skills run through the unchanged shared engine against live-independent mock fixtures. Both gateway implementations meet the common contract; live failure produces an explicit failure and never silent fixture substitution.
2. **Presentation Deck (`presentation/index.html`):**
   - Build a clean, self-contained, keyboard-navigable 16:9 HTML slide deck with embedded SVG diagrams, clear architectural callouts, the contradiction-preservation walkthrough, and a direct link/embed for the live prototype demo.
   - Explain the prototype boundary, mock/live distinction, source-to-candidate-to-canonical decision path, and why report approval does not imply fact approval.
