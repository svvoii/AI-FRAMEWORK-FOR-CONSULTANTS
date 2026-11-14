# Reusable AI Framework for Consulting Deliverables

## 1. Case interpretation

### The problem in one sentence

Over a 26-week S/4HANA scoping project with approximately 30 workshops, consultants must turn scattered, evolving evidence into consistent deliverables without losing time, traceability or professional control.

### The design response

**One governed, evidence-grounded delivery engine. A main agent orchestrates requests; deliverable agents assemble reusable skills; a knowledge steward promotes validated project knowledge; consultants approve every fact entering shared knowledge and every deliverable before publication.**

The platform is not an autonomous report writer. It is a **proposal and control system** that reduces repetitive work while leaving analysis, decisions and accountability with consultants.

### Interview narrative

1. **Start with control:** distinguish source evidence, validated project knowledge and deliverable drafts. They are not interchangeable.
2. **Show the reusable engine:** one main agent, a small number of agents with distinct responsibilities, and a library of narrowly scoped skills.
3. **Walk through one workshop:** notes become a cited draft, validated facts enter project knowledge, and the fit-gap is updated without silently propagating uncertainty.
4. **Prove governance:** permissions follow the evidence, citations point to exact source passages, inconsistencies remain visible, and publication requires approval.
5. **Close with adoption:** begin with two deliverables, measure baseline and outcomes, and scale only after the evaluation set passes.

## 2. Design principles

1. **Source-grounded by default:** generated statements must cite their evidence or be marked as proposals or unknowns.
2. **Human decisions, machine assistance:** AI may extract, retrieve, compare, propose and draft. It may not silently approve facts, resolve contradictions or publish.
3. **Separation of evidence and knowledge:** ingesting a document does not make its contents validated truth.
4. **Controlled workflow over open-ended autonomy:** predictable steps use fixed orchestration and schemas; language models handle ambiguous interpretation and writing within those steps.
5. **Extend through skills, not new platforms:** a new deliverable adds a manifest, template, required inputs, validation rules and tests.
6. **Security follows every artifact:** retrieval, model calls, citations, exports and logs preserve document-level permissions and confidentiality labels.
7. **Provider choice is a governed configuration:** model capability, data policy, quality, latency and cost determine routing; agent logic remains provider-independent.

## 3. Scope and success

### In scope for the case

- Client documents, workshop notes, process lists and technical analyses.
- Workshop reports, fit-gap records, target architecture and steering-committee materials.
- Project-scoped retrieval, source citations, consistency checks, human review, versioned publication and feedback.
- Controlled reuse of approved, reusable knowledge across projects.
- Provider-agnostic model access, evaluation, observability and auditability.

### Not in the initial scope

- Autonomous client communication or publication.
- Automatic acceptance of workshop statements as project decisions.
- Automatic resolution of conflicting sources or proposed content.
- A general enterprise knowledge replacement or one assistant for every consulting task.
- Training a foundation model or hard-coding an S/4HANA rules catalogue into prompts.

### Proposed success measures

Baseline these on a representative current project before setting final numerical targets.

| Dimension | Measure | Initial pilot criterion |
|---|---|---|
| Consultant time | Active drafting and reconciliation time per deliverable | Meaningful reduction, with review time included |
| Groundedness | Atomic claims supported by accessible evidence | 100% of factual claims cited; unsupported proposals clearly labelled |
| Reliability | Required sections, source links and valid structured outputs | 100% schema and citation validity before human review |
| Consistency | Known contradictions and omissions detected in the evaluation set | Critical seeded issues detected; no silent resolution |
| Human value | Reviewer-rated usefulness and correction effort | Stable acceptance and decreasing median correction effort |
| Portability | Same regression suite run against approved model providers | Quality thresholds maintained before routing changes |
| Security | Cross-project and cross-role leakage tests | Zero known unauthorized disclosure |

Quality and security gates take precedence over time savings. Final targets should be agreed after baseline measurement.

## 4. Users and decisions

| Actor | Main responsibility | Explicit decision |
|---|---|---|
| Engagement consultant | Request drafts, inspect citations and correct outputs | Approve or reject the deliverable |
| Workshop / domain lead | Own process decisions and unresolved questions | Accept facts, decisions, gaps and actions for their scope |
| Project knowledge steward | Curate common terminology, reusable knowledge and project scopes | Approve knowledge promotion and cross-project reuse |
| Delivery / quality lead | Monitor quality trends and exceptions | Approve release of new skills or workflow changes |
| Platform team | Operate connectors, model access, evaluation and audit | Approve model routes and platform releases |
| Security / data owner | Define handling, residency, retention and access policy | Authorize sensitive-data processing routes |

A consultant may hold several roles on a small project, but the workflow must record who performed each approval.

## 5. Functional architecture

```text
Consultant workspace
        |
        v
Main agent / controlled orchestrator
        |
        +--> Deliverable agent --> workshop-report skill
        |                      --> fit-gap skill
        |                      --> target-architecture skill
        |                      --> steering-committee skill
        |
        +--> Knowledge steward --> source and knowledge services
        |
        +--> Quality reviewer --> completeness, citation and consistency checks
        |
        v
Consultant review --> requested changes --> approved / published / immutable version

Shared platform services:
- Evidence store and validated project-knowledge store
- Retrieval, metadata, identity, permissions and confidentiality policy
- Provider gateway, prompt/model registry and structured-output validation
- Audit log, evaluation suite, cost/latency metrics and feedback
```

### 5.1 Knowledge lifecycle: three distinct layers

| Layer | Contents | Trust and access |
|---|---|---|
| Evidence | Original documents, normalized text, chunk locations, source metadata, extraction diagnostics | Immutable source version; access inherited from source and project ACLs |
| Validated project knowledge | Canonical processes, decisions, requirements, assumptions, gaps, risks, actions, terminology, source links, valid dates and approval history | Claims are proposals until an authorized reviewer accepts them |
| Deliverable snapshots | Structured draft, citations, model/prompt configuration, review findings, approvals, rendered output | Versioned and reproducible; published versions are immutable |

Knowledge is represented as both:

- **A canonical knowledge graph or relational model:** stable IDs, typed entities and relationships, validation state, effective dates and provenance. This supports fit-gap updates and consistency queries.
- **A retrieval index:** text chunks and metadata pointing back to exact source passages and canonical entities. This supports evidence discovery and explanation.

A vector database alone is not the system of record. Source objects, canonical records, permissions and audit history need durable, queryable storage.

### 5.2 Agent responsibilities and handoffs

Use a small team of agents, each with a reason to exist. Individual skills are deterministic tools or constrained model tasks, not extra agents.

| Component | Responsibility | Inputs | Outputs / handoff |
|---|---|---|---|
| Main agent | Authenticate context, classify intent, select workflow, request clarification, enforce budget and present results | Consultant request, identity, project and deliverable scope | Typed workflow plan and review package |
| Deliverable agent | Assemble required context, invoke the selected deliverable skill, retain citations and produce a schema-valid draft | Approved request, versioned evidence/knowledge snapshot, skill manifest | Draft deliverable plus claim-to-source map |
| Knowledge steward | Extract candidate facts and changes, deduplicate, compare versions and route proposed updates for approval | Approved workshop report and source passages | Proposed knowledge delta; approved canonical records only after human validation |
| Quality reviewer | Run separate citation, completeness, permission, consistency and presentation checks | Draft, source snapshot, related deliverables and evaluation rules | Findings with severity and evidence; no silent edits to project decisions |

The main agent is the team's only entry point. The other components receive typed tasks from the orchestrator; they do not independently browse outside their authorized scope.

### 5.3 Reusable skills

Examples of narrow skills:

- Qualify a source and extract document metadata.
- Segment a document and detect extraction failures.
- Extract candidate decisions, requirements, gaps, actions and owners.
- Link a claim to a source span and canonical entity.
- Retrieve evidence under project, role, phase and process filters.
- Draft a workshop report from a controlled schema.
- Propose fit-gap changes and identify affected prior decisions.
- Compare two canonical records or deliverable snapshots.
- Assemble a target-architecture decision view.
- Assemble a steering-committee summary from approved items.
- Render DOCX, PPTX or another approved output from the validated structured draft.

Each **deliverable skill package** contains:

```text
manifest: name, version, purpose, owner, permissions and supported output types
input contract: required facts, optional context, schemas and clarification rules
workflow: fixed steps plus explicitly bounded model-assisted steps
output contract: sections, fields, citation requirements and confidence/status labels
quality rules: required checks, blocking findings and evaluation cases
templates: approved structure and rendering configuration
tests: golden examples, adversarial cases, permissions tests and regression thresholds
```

Adding a deliverable therefore changes configuration, templates, domain rules and tests, not the orchestration or provider integration.

### 5.4 Ingestion and source qualification

1. Register the source with client, project, source owner, ACL, confidentiality and retention metadata.
2. Virus-scan and fingerprint it; deduplicate by content hash while retaining source identity.
3. Parse text, tables and speaker attribution where available. Flag OCR or parsing uncertainty instead of hiding it.
4. Preserve an immutable original and extraction diagnostics.
5. Classify document type, phase, workshop, process and language as **proposed metadata** when inferred by AI.
6. Chunk structurally by section, table row or meaningful note block; retain document version, page/paragraph or timestamp, parent section and speaker where known.
7. Index authorized chunks and entities; never bypass source ACLs through embeddings, summaries or caches.
8. Expose low-quality or ambiguous sources for consultant correction before drafting.

Chunk size and retrieval depth are tuned using the evaluation set rather than presented as universal constants.

### 5.5 Retrieval and generation contract

For each request, freeze a versioned context snapshot and apply:

- Identity, project, client, source ACL and confidentiality filters **before retrieval**.
- Optional phase, workshop, process, entity, deliverable and validity-period filters.
- Hybrid lexical/vector retrieval with metadata filters; reranking where evaluation justifies its cost.
- Separation of approved project knowledge from unvalidated source claims.
- Source diversity so the response does not rely on many chunks from one incomplete document.
- Explicit context limits and a clarification response when evidence is insufficient.

The draft contains atomic, reviewable claims. Each claim has one status:

| Status | Meaning | Allowed behaviour |
|---|---|---|
| Sourced | Directly supported by cited source evidence | Show source version and exact passage |
| Validated | Approved project fact with provenance | Show canonical ID, approval and supporting sources |
| Proposed | AI inference or recommendation, not established fact | Label visibly and request review |
| Conflicted | Sources or approved records disagree | Show alternatives; do not select silently |
| Unknown | Required evidence is missing | Request input; do not infer |

No single numeric LLM "confidence" should substitute for these statuses or human validation.

### 5.6 Review, publication and learning

- Reviewer sees the draft, exact citations, source snapshots, warnings and changes since the previous version.
- Blocking findings: inaccessible or missing citations, invalid schema, unauthorized context, unresolved critical contradiction or missing mandatory approval.
- Corrections are captured as structured signals: wrong source, wrong extraction, missing context, bad inference, style or template issue.
- Approval creates a new immutable deliverable version, including input snapshot and generation configuration for audit.
- Feedback changes source processing, retrieval, prompts, templates or tests through a reviewed platform change; it does not trigger uncontrolled self-training.
- Reusable cross-project knowledge requires a separate stewardship decision: sanitize/generalize, verify ownership, licence and policy, then publish without client identifiers or restricted details. The default is no cross-project retrieval of client content.

## 6. Concrete walkthrough: workshop notes to fit-gap update

### Scenario

During an Analyze workshop, the client says: "A purchase order above EUR 50,000 requires approval by the procurement director." An earlier approved workshop report states EUR 25,000. The notes do not say whether the new statement replaces the old threshold or applies to a different company code.

### End-to-end flow

1. **Register evidence:** upload notes with client/project, workshop, date, participants, source ACL and confidentiality. Preserve the original version.
2. **Qualify:** detect workshop notes, extract agenda, process references and speaker attributions where supported. Flag ambiguous speakers or OCR problems.
3. **Request:** consultant selects "Draft workshop report" for the authorized project and workshop.
4. **Retrieve:** main agent scopes retrieval to that workshop, relevant procure-to-pay process, applicable prior decisions and source versions.
5. **Draft:** workshop-report skill produces discussion summary, candidate decisions, requirements, gaps, actions, owners, due dates, open questions and citations.
6. **Review report:** the domain lead verifies the draft against the notes. They can accept the discussion as evidence, but must mark the threshold as unresolved because its scope is unclear.
7. **Promote knowledge:** only approved facts become canonical. The new threshold proposal links to the old approved record and both exact source passages; it does not overwrite the old value.
8. **Propose fit-gap delta:** fit-gap skill retrieves the current approved fit-gap, process scope, related requirements and new knowledge delta. It proposes a change and marks the item "conflicted / clarification required."
9. **Check impact:** quality reviewer compares the change with the current workshop report, fit-gap and any target-architecture or steering materials that cite the old threshold.
10. **Resolve and approve:** consultant asks the client/workshop owner whether the threshold differs by company code or replaces the earlier decision. The confirmed answer is captured as new evidence, then approved as a canonical decision with an effective date and supersession link.
11. **Publish:** approved workshop report and fit-gap receive new immutable versions. Affected dependent deliverables show a change notification; they are not silently rewritten.

### Reuse of the pattern

| Deliverable | Same engine, different skill and contract |
|---|---|
| Workshop report | Structured record of discussions, decisions, actions and open questions |
| Fit-gap | Requirements, standard fit, gaps, decisions, priorities and traceable changes |
| Target architecture | Approved requirements and decisions linked to architecture options, components and decision records |
| Steering committee | Approved progress, key decisions, risks, scope changes and actions summarized for decision-makers |

## 7. Quality, consistency and evaluation

### Evaluation layers

| Layer | Examples | Release behaviour |
|---|---|---|
| Deterministic unit tests | Schema validation, ACL filters, version links, output rendering, model adapter contract | Defects block release |
| Retrieval evaluation | Recall of required evidence, metadata filtering, permission boundaries, stale-source preference | Threshold regression blocks release |
| Generation evaluation | Atomic claim support, correct labels, section completeness, contradiction preservation | Critical failures block; aggregate score informs readiness |
| Workflow evaluation | End-to-end workshop-to-fit-gap scenario, review routing, approval and reproducibility | Broken handoffs block release |
| Human review | Usefulness, corrections, missed nuances, presentation quality | Required for pilot promotion |
| Production monitoring | Drift, latency, cost, failed citations, user overrides and provider incidents | Alert and rollback/fallback according to policy |

Build a versioned golden set with consultants: representative workshop notes, known source contradictions, missing information, multilingual inputs, tables, revised decisions and cross-project permission traps. Include expected evidence, acceptable answer elements and forbidden behaviours. Keep a holdout set to reduce prompt overfitting.

### Cross-deliverable consistency

- Canonical stable IDs for requirements, decisions, processes, gaps, risks and actions.
- Every deliverable assertion references the canonical ID and version used.
- On a newly approved change, identify all dependent artifacts and create review tasks.
- Compare meaning as well as exact values: amounts, thresholds, scope, owners, dates and negations.
- Classify findings as informational, warning or blocking; deterministic rules handle hard constraints, while model-assisted comparisons propose matches for review.
- Superseded facts remain visible historically and are excluded by validity filters unless the user requests history.

## 8. Security and governance

1. **Identity and least privilege:** SSO, role/project membership, owner-assigned source ACLs and permission checks at retrieval and output time.
2. **Tenant separation:** no shared client indexes or caches without strict partitioning; explicit negative tests for leakage.
3. **Data policy before model routing:** classify data and select only provider/deployment routes approved for that class. Redaction can reduce exposure but does not by itself authorize processing.
4. **Provider protection:** approved endpoints, no provider training on customer data where contractually required, encryption, regional/residency controls and managed secrets.
5. **Prompt-injection resistance:** documents are untrusted evidence, never instructions. Tool allowlists, constrained parameters, output schemas and no autonomous external actions.
6. **Auditability:** append-only record of source versions, retrieval snapshot, agent/skill/model/prompt versions, tool calls, findings, approvals and publication.
7. **Data minimization and retention:** model calls receive only necessary excerpts; retention and deletion propagate to derived indexes and caches subject to legal holds.
8. **Accountability:** approved RACI, exception procedure, incident response, periodic access review and clear ownership of every skill and knowledge domain.

## 9. Provider-agnostic design

The provider gateway exposes a constrained internal contract for chat/structured generation, embeddings where required, token/cost metadata, health and capability discovery. Adapters translate this contract to approved providers.

Provider independence does **not** mean every model is interchangeable:

- Register model capabilities and supported structured-output behaviour.
- Pin and version model, prompt, skill and retrieval configuration for reproducibility.
- Route by data classification and capability first, then evaluated quality, availability, latency and cost.
- Run contract tests plus the full domain evaluation suite before adding or switching a model.
- Use an approved fallback only for the same data class; never silently route sensitive content elsewhere.
- Treat embeddings and rerankers as versioned dependencies too; changing them can require re-indexing and re-evaluation.

MCP can standardize access to approved tools, but it is not the security boundary. The platform still enforces identity, authorization, argument validation, timeouts and audit. Claude Code can be one consultant-facing client; core services must not depend on a single client.

## 10. Key trade-offs and proposed choices

| Decision | Recommendation | Why |
|---|---|---|
| Free-form multi-agent collaboration or bounded workflow | Bounded orchestrator with typed handoffs | Easier to audit, evaluate and operate |
| One agent per deliverable or shared agent plus skills | Shared deliverable capability plus versioned skills | Prevents agent proliferation while preserving specialization |
| Vector search only or hybrid knowledge model | Canonical records plus hybrid retrieval | Supports both traceable state and unstructured evidence discovery |
| Automatically update all linked documents or notify owners | Notify owners and require approval | Avoids propagating errors and preserves accountability |
| Maximum model autonomy or human review of everything initially | Human review first, relax only low-risk steps with evidence | Appropriate for consequential consulting outputs |
| Provider abstraction as lowest common denominator or capability registry | Common contract plus declared capabilities | Portability without blocking valuable provider features |
| Optimize time saved first or trust first | Trust gates before productivity claims | Adoption depends on reliable evidence and control |

## 11. Presentation proposal

Four core slides, plus an appendix for technical Q&A. Target a 10-12 minute core walkthrough, leaving most of the interview for discussion.

| Slide | Message | Visual | Speaker emphasis |
|---|---|---|---|
| 1. From scattered work to a governed delivery engine | Reuse and control are the value proposition | Inputs -> one engine -> four deliverables; three pain/value callouts | Name the 26-week / 30-workshop challenge and consultant accountability |
| 2. Architecture: one engine, specialized work, shared controls | Agents orchestrate; skills produce; knowledge and governance are shared | Main agent, three responsibilities, evidence/knowledge/deliverable layers and provider gateway | Explain extension by skill and deliberate limits on agent count |
| 3. Workshop to fit-gap: improve without losing the contradiction | The workflow creates value while preserving uncertainty | Versioned workshop report -> approval -> knowledge delta -> fit-gap review -> impact notification | Use the EUR 50,000 vs EUR 25,000 threshold example |
| 4. Start narrow, measure, then scale | Adoption is earned through evidence | Pilot slices -> quality/security gates -> reusable skills -> rollout | Close with success measures, delivery stages and decisions needed |

Appendix candidates:

- Security, tenant isolation and approval gates.
- Evaluation matrix and release process.
- Skill manifest and canonical knowledge model.
- Provider routing and fallback.
- Implementation stages and indicative timeline.

### Visual direction

- 16:9, generous whitespace, dark navy text, white background and one restrained teal/blue accent.
- One message and one diagram per slide; no dense paragraphs.
- English slides with concise labels; spoken walkthrough and Q&A rehearsed in French.
- Consistent Mermaid architecture diagrams with rounded shapes, clear flow direction and no decorative icons.

## 12. Questions to align with the brief owner

These are explicit design assumptions to discuss, not prerequisites for drafting the proposal.

1. Should the initial demo include a clickable prototype and generated sample outputs, or only the four-slide technical design?
2. Is a 10-12 minute design walkthrough appropriate for the one-hour interview?
3. Does Deloitte have an approved platform stack, identity service, document store or preferred model-provider shortlist that should replace the stack-neutral design?
4. Which source languages and output formats matter most: French/English, DOCX/PPTX, or others?
5. Who owns knowledge stewardship on a real engagement: domain leads, a dedicated knowledge manager or the deliverable owner?
6. What time horizon should `IMPLEMENTATION.md` illustrate: interview preparation only, a 6-10 week pilot, or a longer production roadmap?

## 13. Proposed working assumptions until alignment

- The primary deliverable is a professional four-slide English technical design with Mermaid visuals and a French-speaking script.
- No provider or implementation technology is mandated; the architecture remains stack-neutral.
- The case demonstration uses synthetic, bilingual-capable procurement examples and never actual client data.
- The initial product pilot covers workshop report and fit-gap, then proves extension to target architecture and steering-committee materials.
- `IMPLEMENTATION.md` distinguishes interview-artifact creation from an indicative product discovery/pilot/hardening roadmap; delivery dates are not commitments.
