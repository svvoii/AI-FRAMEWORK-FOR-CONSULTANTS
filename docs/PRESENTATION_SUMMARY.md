# Presentation Summary & Major Updates

**Deck File:** `presentation/index.html` (100% standalone, offline-capable HTML/CSS/SVG deck linked directly to the live FastAPI prototype at `http://127.0.0.1:8000/`)

---

## 1. General Outlook of the Presentation (`01 / 05` to `05 / 05`)

The presentation is a concise, interactive 5-slide walkthrough of Deloitte's **Reusable AI Framework for Consultants** anchored around a concrete 26-week SAP S/4HANA Procure-to-Pay scoping scenario:

1. **Slide 1 (`01 / 05`) - Case Study: Problems & Mapped Solutions**
   - Progressive 1-by-1 reveal pairing 5 consulting delivery pain points (information volume, repetitive drafting, variable quality, scattered knowledge, omissions/contradictions) with concrete framework safeguards.
2. **Slide 2 (`02 / 05`) - Proposed Solution: One Reusable Framework**
   - Shows the 4 consulting phases (`Prepare -> Assess -> Analyze -> Advise`) supported by three core pillars: one generic multi-agent engine, structured knowledge + Skills under consultant control, and `1 Skill = 1 Deliverable`.
3. **Slide 3 (`03 / 05`) - System Architecture (General View + Zoom-In)**
   - Interactive 5-block pipeline (`Main Agent`, `Specialized Agents`, `Pluggable Skills`, `Project Knowledge`, `Model Gateway`). Clicking any block displays its high-level role and internal components.
4. **Slide 4 (`04 / 05`) - Architecture Diagram (Interactive Deep Dive)**
   - End-to-end color-coded SVG architecture diagram showing how a request moves from the Consultant Workspace through orchestration, Skills, Knowledge retrieval, and Model Gateway while isolating proposals from canonical truth.
   - Clicking any block or connector opens tailored detail modals without leaving the slide.
5. **Slide 5 (`05 / 05`) - Demo Stages & Workflow (Interactive Transition to Demo)**
   - Standalone 5-stage governance flowchart mapping the live prototype's exact workflow states (`evidence` -> `report` -> `conflict` -> `accepted_clarification` -> `clarified`), the 4 explicit human gates, canonical KB protection (`v1` -> `v2`), and a direct **Launch Live Platform Demo** button.

### Built-In Presentation Controls
- Keyboard & bar navigation (`prev`/`next`, range slider, slide overview grid, fullscreen, speaker notes modal, timer, print/PDF shell).
- Automatic localhost/127.0.0.1 URL binding for `#demo-link` and `#bottom-demo` when served from FastAPI.

---

## 2. Major Changes Completed

- **Slide 4 SVG Diagram Refinement:**
  - Removed cluttering `Inspect` badge pills while keeping every subsystem box and connector pill keyboard-accessible and clickable.
  - Centered `1. Request deliverable`, clarified `1 Skill = 1 Deliverable` / `2. Load skill`, and aligned the `LAYERED PROJECT KNOWLEDGE STORE` footer.
- **Subsystem Modal Standardization (`#engine-dialog`, `#skills-dialog`, `#gateway-dialog`, `#knowledge-dialog`):**
  - Replaced technical demo jargon with clean, consistent 3-card structures (`Skill Structure`, `Model Gateway Structure`, `Knowledge Store Structure`).
  - Added clear operational phrasing (`Selected deterministically by user`, `Strict JSON output structure`, `Checks previous steps are done`).
  - Paired the 3 `Knowledge Store Structure` cards (`01 · Evidence Store`, `02 · Canonical Knowledge`, `03 · Deliverable Store`) with 3 aligned bottom DB blocks explaining storage types:
    1. `Blob Storage + Vector / Keyword DB` (`e.g. File storage (S3) + pgvector / Full-Text Search (FTS5)`)
    2. `Relational SQL Tables (ACID)` (`e.g. PostgreSQL / SQLite (Atomicity, Consistency, Isolation, Durability)`)
    3. `JSON Store + Append-Only SQL` (`e.g. JSONB + immutable audit log`)
- **End-to-End Event & Logic Sequence Modal (`#sequence-dialog`):**
  - Documented the 6-step execution flow from `Step 01` to `Step 06` with color-coded architecture tokens matching Slide 4's subsystem palette plus a color legend.
  - Added a dedicated two-column `snapshot_id` explanation covering **What?** ("git commit" ID of exact documents and KB rules), **Why?** (prevents citing unapproved data and proves input provenance), and **How It Is Made** (sample frozen JSON payload from `snapshots`).
- **Consolidated 5-Slide Deck & Standalone Demo Stage Flowchart (Slide 5):**
  - Removed the separate data-types and transition slides and replaced them with a unified **Live Demo Workflow** flowchart on Slide 5 (`05 / 05`), connecting `WS-01` (`EUR 25k v1`), `WS-04` (`EUR 50k` missing scope), and `WS-05` (`FR01` owner clarification) across all 5 backend phases and 4 human gates, alongside the header CTA button to launch the live demo.
