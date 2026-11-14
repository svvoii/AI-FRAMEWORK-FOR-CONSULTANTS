const state = {
  workspace: null,
  draft: null,
  architecture: null,
  role: 'domain_lead',
  provider: 'mock',
  activeTab: 'evidence',
  busy: false,
};

const $ = (id) => document.getElementById(id);
const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));

const money = (amount) => (amount == null ? 'Unknown' : `EUR ${Number(amount).toLocaleString('en-US')}`);
const skillNames = {
  workshop_report: 'Workshop Report',
  fit_gap: 'Fit-Gap Analysis',
  steering_deck: 'Steering Summary',
};
const statusLabels = {
  Sourced: 'Cited from Notes',
  Validated: 'Approved Rule',
  Proposed: 'AI Proposal',
  Conflicted: 'Conflict · Unresolved',
  Unknown: 'Missing Scope',
};

let toastTimer;
function toast(message, error = false) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').className = `toast${error ? ' error' : ''}`;
  $('toast').style.display = 'block';
  toastTimer = setTimeout(() => {
    $('toast').style.display = 'none';
  }, error ? 9000 : 5000);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Demo-Role': state.role,
      ...options.headers,
    },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.detail || 'This action could not be completed.');
  }
  return data;
}

function formatCitationLabel(chunkId) {
  const [doc, num] = String(chunkId).split('-');
  return `${doc.toUpperCase()} · Passage ${num || '1'} ↗`;
}

async function refresh() {
  state.workspace = await api('/api/workspace');
  renderWorkspace();
  if (state.draft && state.draft.id) {
    try {
      state.draft = await api(`/api/drafts/${state.draft.id}`);
      renderDraft();
    } catch (_) {
      state.draft = null;
      renderEmptyDraft();
    }
  } else {
    renderEmptyDraft();
  }
}

async function action(path, success, body, clearDraftOnClarified = false) {
  if (state.busy) return;
  state.busy = true;
  try {
    const result = await api(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
    if (clearDraftOnClarified) {
      state.draft = null;
    }
    await refresh();
    if (result?.payload && typeof result.payload === 'object' && result.draft_id === undefined && !clearDraftOnClarified) {
      state.draft = result;
      renderDraft();
    }
    toast(success);
  } catch (error) {
    toast(error.message, true);
  } finally {
    state.busy = false;
  }
}

function renderEmptyDraft() {
  const w = state.workspace;
  if (!w) return;
  const s = w.state;
  if (s === 'clarified') {
    $('draft-content').innerHTML = `
      <div class="empty-state">
        <span class="empty-kicker">STEP 3 · KNOWLEDGE UPDATED TO V2 (€50,000 FOR FR01)</span>
        <h2>Generate updated deliverables from approved Knowledge v2.</h2>
        <p>The process owner's reply (WS-05) is now the approved Project Knowledge baseline. Run any of the three skills below using the exact same shared engine.</p>
        <div class="quick-skill-row">
          <button class="button" type="button" data-quick-skill="fit_gap">Generate Fit-Gap (v2) →</button>
          <button class="button secondary" type="button" data-quick-skill="steering_deck">Generate Steering (v2)</button>
          <button class="button secondary" type="button" data-quick-skill="workshop_report">Generate WS-05 Record</button>
        </div>
      </div>`;
  } else if (s === 'conflict' || s === 'accepted_clarification') {
    $('draft-content').innerHTML = `
      <div class="empty-state">
        <span class="empty-kicker">STEP 2 · CONFLICT FLAGGED (€50,000 VS €25,000)</span>
        <h2>Preview conflicted Fit-Gap or Steering drafts, or resolve with WS-05.</h2>
        <p>You can test generating Fit-Gap or Steering drafts right now to see how the engine flags the conflict and blocks final publication, or apply WS-05 in the Project Knowledge panel on the right.</p>
        <div class="quick-skill-row">
          <button class="button secondary" type="button" data-quick-skill="fit_gap">Preview Conflicted Fit-Gap</button>
          <button class="button secondary" type="button" data-quick-skill="steering_deck">Preview Steering Escalation</button>
        </div>
      </div>`;
  } else {
    $('draft-content').innerHTML = `
      <div class="empty-state">
        <span class="empty-kicker">START HERE · STEP 1</span>
        <h2>Turn Workshop 4 notes into a cited draft.</h2>
        <p>Click below to run the <strong>Workshop Report</strong> skill. Every claim will link back to its exact passage in WS-04 without silently overwriting the approved €25,000 baseline.</p>
        <button class="button" type="button" data-generate-report>1 · Generate WS-04 Workshop Report →</button>
      </div>`;
  }
  bindDynamic();
}

function evidenceCard(doc) {
  const id = doc.id.toUpperCase();
  const locked = !doc.active;
  return `<button class="evidence-card" type="button" data-evidence="${doc.id}" data-testid="evidence-${doc.id}">
    <span class="evidence-left">
      <span class="source-mark ${locked ? 'future' : ''}">${id}</span>
      <span>
        <span class="evidence-title">${escapeHtml(doc.title)}</span>
        <span class="evidence-subtitle">${locked ? 'Owner reply · unlocks in Step 3' : 'Indexed source · click to view passages'}</span>
      </span>
    </span>
    <span class="state-badge ${locked ? 'pending' : ''}">${locked ? 'Pending' : 'Active'}</span>
  </button>`;
}

function renderKnowledgePanel() {
  const w = state.workspace;
  const s = w.state;
  const b = w.baseline;
  const c = w.candidate;
  const isClarified = s === 'clarified';
  const isConflict = s === 'conflict' || s === 'accepted_clarification';

  const historyChips = [...w.canonical_history]
    .reverse()
    .map((rec) => `<span class="version-chip ${rec.current ? 'current' : ''}">v${rec.version} · ${money(rec.amount)}${rec.current ? ' (Active)' : ' (Saved)'}</span>`)
    .join('<span aria-hidden="true">→</span>');

  let proposalBox = '';
  if (isClarified) {
    proposalBox = `
      <div class="rule-box clarified-box">
        <div class="rule-head">
          <span class="eyebrow" style="margin:0">WS-05 Clarification Applied</span>
          <span class="state-badge">Updated to v2</span>
        </div>
        <div class="rule-meta">WS-05 confirmed that <strong>EUR 50,000</strong> replaces EUR 25,000 for <strong>company code FR01</strong> starting 5 Nov 2026. Historical v1 remains preserved.</div>
      </div>`;
  } else {
    let actionHtml = '';
    if (s === 'report') {
      actionHtml = `
        <div class="resolve-action-wrap">
          <button class="button full-btn" type="button" id="flag-conflict" data-testid="flag-conflict">Flag Scope Conflict (€50k vs €25k) →</button>
          <p class="helper-note">Marks this proposal as conflicted without altering the approved €25,000 rule.</p>
        </div>`;
    } else if (isConflict) {
      actionHtml = `
        <div class="resolve-action-wrap">
          <button class="button full-btn" type="button" id="guided-resolve" ${state.role === 'viewer' ? 'disabled' : ''}>3 · Apply WS-05 Clarification &amp; Approve €50k (v2) →</button>
          <p class="helper-note">Loads the process owner's written reply (WS-05) confirming company code FR01, then updates Project Knowledge to v2.</p>
          <details class="granular-controls">
            <summary>Step-by-step promotion gates</summary>
            <div class="granular-row">
              <button class="button secondary small" type="button" id="accept-clarification" data-testid="accept-clarification" ${s !== 'conflict' || state.role !== 'domain_lead' ? 'disabled' : ''}>A · Accept WS-05 Scope</button>
              <button class="button secondary small" type="button" id="promote" data-testid="promote" ${s !== 'accepted_clarification' || state.role !== 'domain_lead' ? 'disabled' : ''}>B · Promote to Knowledge v2</button>
            </div>
          </details>
        </div>`;
    }

    proposalBox = `
      <div class="rule-box ${isConflict ? 'conflict-box' : ''}">
        <div class="rule-head">
          <span class="eyebrow" style="margin:0">Workshop 4 Proposal (${c.id})</span>
          <span class="state-badge ${c.status === 'Conflicted' ? 'conflicted' : 'badge-proposed'}">${escapeHtml(c.status)}</span>
        </div>
        <div class="rule-amount">${money(c.amount)}</div>
        <div class="rule-meta">${c.scope ? `Company code <strong>${escapeHtml(c.scope)}</strong>` : '<strong>Company code unclear:</strong> did not confirm if this replaces FR01 or adds a new entity.'}</div>
        ${actionHtml}
      </div>`;
  }

  $('knowledge-compare').innerHTML = `
    <div class="rule-box approved">
      <div class="rule-head">
        <span class="eyebrow" style="margin:0">Current Approved Rule</span>
        <span class="state-badge">${escapeHtml(b.record_id)}</span>
      </div>
      <div class="rule-amount">${money(b.amount)}</div>
      <div class="rule-meta">Procurement director approval · Company code <strong>${escapeHtml(b.scope)}</strong> · Source: <button class="text-button" type="button" data-evidence="${b.source_chunk.split('-')[0]}" data-chunk="${b.source_chunk}">${formatCitationLabel(b.source_chunk)}</button></div>
      <div class="version-strip">${historyChips}</div>
    </div>
    ${proposalBox}
  `;
}

function renderWorkspace() {
  const w = state.workspace;
  const s = w.state;

  const phaseText = {
    evidence: 'Step 1 · Draft WS-04 Workshop Report',
    report: 'Step 1 · Report reviewed, ready to flag conflict',
    conflict: 'Step 2 · €50k vs €25k conflict active',
    accepted_clarification: 'Step 2 · WS-05 accepted, ready to promote v2',
    clarified: 'Step 3 · Knowledge v2 active (€50,000)',
  }[s] || s;
  $('phase-label').textContent = phaseText;

  // 3-step progress bar state
  const currentStep = s === 'clarified' ? 3 : (s === 'conflict' || s === 'accepted_clarification') ? 2 : 1;
  document.querySelectorAll('.step').forEach((el) => {
    const stepNum = Number(el.dataset.step);
    el.classList.toggle('active', stepNum === currentStep);
    el.classList.toggle('done', stepNum < currentStep || (s === 'clarified' && stepNum === 3 && w.publications.length > 1));
  });

  // Update skill highlights
  document.querySelectorAll('.skill-button').forEach((btn) => {
    const sk = btn.dataset.skill;
    btn.classList.remove('suggested', 'muted-skill');
    if (s === 'evidence') {
      if (sk === 'workshop_report') btn.classList.add('suggested');
      else btn.classList.add('muted-skill');
    } else if (s === 'conflict') {
      if (sk === 'fit_gap' || sk === 'steering_deck') btn.classList.add('suggested');
    } else if (s === 'clarified') {
      btn.classList.add('suggested');
    }
  });

  // Guidance banner
  const guidance = {
    evidence: '<strong>Step 1:</strong> Generate the <strong>Workshop Report</strong> from WS-04 notes. Notice that drafting a report never overwrites the approved €25,000 rule.',
    report: '<strong>Step 1 complete:</strong> The report faithfully records the €50,000 discussion. Next, click <strong>Flag Conflict</strong> to preserve the contradiction.',
    conflict: '<strong>Step 2 (Conflict Caught):</strong> €50k vs €25k is flagged. You can preview conflicted Fit-Gap or Steering drafts (publication is blocked), then click <strong>Apply WS-05 Clarification</strong> on the right.',
    accepted_clarification: '<strong>Clarification accepted:</strong> Now promote the scoped rule to make €50,000 the official v2 Project Knowledge.',
    clarified: '<strong>Step 3 (Resolved):</strong> Project Knowledge is now <strong>v2 (€50,000 for FR01)</strong>. Generate updated deliverables and publish them with full version history.',
  }[s];
  $('banner').innerHTML = `<div class="note ${isConflictState(s) ? 'conflict' : ''}"><span>${guidance}</span>${state.role === 'viewer' ? '<span class="state-badge conflicted">Read-Only Mode (Writes Blocked)</span>' : ''}</div>`;

  renderKnowledgePanel();

  // Tabs & counts
  $('count-evidence').textContent = w.documents.length;
  $('count-tasks').textContent = w.tasks.length;
  $('count-pubs').textContent = w.publications.length;

  $('evidence-list').innerHTML = w.documents.map(evidenceCard).join('');
  $('tasks-content').innerHTML = w.tasks.length
    ? w.tasks.map((t) => `<div class="task"><span class="task-symbol">!</span><div><p>${escapeHtml(t.subject)}</p><small>${escapeHtml(t.status)}</small></div></div>`).join('')
    : '<p class="helper-note">No alerts yet. Flagging the €50k vs €25k conflict automatically notifies dependent deliverables.</p>';

  $('publications-list').innerHTML = w.publications
    .map((p) => `<div class="publication">
      <span class="publication-icon">PUB</span>
      <div>
        <b>${escapeHtml(skillNames[p.skill] || p.skill)}</b>
        <small>${escapeHtml(p.id)} · Approved by ${escapeHtml(p.approved_by)}</small>
      </div>
      <button class="text-button" style="margin-left:auto" type="button" data-publication="${p.id}">Inspect ↗</button>
    </div>`)
    .join('');

  bindDynamic();
}

function isConflictState(s) {
  return s === 'conflict' || s === 'accepted_clarification';
}

function draftActions(d) {
  const published = state.workspace.publications.some((p) => p.draft_id === d.id);
  const reportApproved = d.skill === 'workshop_report' && d.report_approved;
  const changeApproved = state.workspace.drafts.find((item) => item.id === d.id)?.change_approved;
  const wsState = state.workspace.state;

  let primaryHtml = '';
  if (published) {
    const pub = state.workspace.publications.find((p) => p.draft_id === d.id);
    primaryHtml = `<div style="display:flex;gap:10px;align-items:center">
      <span class="state-badge">Published · Locked Version</span>
      ${pub ? `<button class="button secondary small" type="button" data-publication="${pub.id}">Inspect Snapshot ↗</button>` : ''}
    </div>`;
  } else if (d.phase === 'initial' && d.skill === 'workshop_report' && (wsState === 'evidence' || wsState === 'report')) {
    primaryHtml = `<button class="button" type="button" id="guided-flag-conflict" ${state.role === 'viewer' ? 'disabled' : ''}>2 · Approve Report &amp; Catch €50k Conflict →</button>`;
  } else if (d.phase === 'initial' && d.skill !== 'workshop_report') {
    primaryHtml = `<span class="state-badge conflicted">Review Draft Only · Final Publication Blocked Until Conflict Resolved</span>`;
  } else if (d.phase === 'resolved') {
    primaryHtml = `<button class="button" type="button" id="guided-publish" ${state.role !== 'domain_lead' ? 'disabled title="Requires Domain Lead role"' : ''}>Approve &amp; Publish Final Deliverable →</button>`;
  } else {
    primaryHtml = `<span class="state-badge pending">Historical Draft</span>`;
  }

  let granularHtml = '';
  if (!published) {
    const buttons = [];
    if (d.skill === 'workshop_report' && !reportApproved) {
      buttons.push(`<button class="button secondary small" type="button" id="approve-report" data-testid="approve-report">Approve Report Accuracy</button>`);
    }
    if (d.skill === 'workshop_report' && reportApproved && wsState === 'report') {
      buttons.push(`<button class="button secondary small" type="button" id="flag-draft-conflict" data-testid="conflict-primary">Flag Conflict</button>`);
    }
    if (d.phase === 'resolved') {
      if (!changeApproved) {
        buttons.push(`<button class="button secondary small" type="button" id="approve-change" data-testid="approve-change">Approve Knowledge Change</button>`);
      }
      buttons.push(`<button class="button secondary small" type="button" id="publish-draft" data-testid="publish-draft">Publish Locked Version</button>`);
    }
    if (buttons.length) {
      granularHtml = `<details class="granular-controls">
        <summary>Show step-by-step governance gates</summary>
        <div class="granular-row">${buttons.join('')}</div>
      </details>`;
    }
  }

  return `
    <div class="draft-footer-main">
      <span class="draft-meta">Generated by <strong>${escapeHtml(d.provider)}</strong> · Snapshot ${escapeHtml(d.snapshot_id)}</span>
      ${primaryHtml}
    </div>
    ${granularHtml}
  `;
}

function renderDraft() {
  const d = state.draft;
  if (!d?.payload || !Array.isArray(d.payload.sections)) {
    renderEmptyDraft();
    return;
  }
  const p = d.payload;
  const history = state.workspace?.drafts || [];
  const staleWarning =
    state.workspace?.state === 'clarified' && d.phase === 'initial'
      ? `<div class="stale-draft-banner">
          <span><strong>Update available:</strong> Project Knowledge is now v2 (€50,000 for FR01). Generate an updated deliverable to see the resolved output.</span>
          <button class="button small" type="button" data-quick-skill="${d.skill === 'workshop_report' ? 'fit_gap' : d.skill}">Generate Updated ${escapeHtml(skillNames[d.skill === 'workshop_report' ? 'fit_gap' : d.skill])} →</button>
        </div>`
      : '';

  $('draft-content').innerHTML = `
    <div class="draft-header">
      <div>
        <div class="eyebrow">${escapeHtml(skillNames[d.skill] || d.skill)} · ${d.phase === 'resolved' ? 'Updated (Knowledge v2)' : 'Initial Review'}</div>
        <h2 id="draft-title" data-testid="draft-title">${escapeHtml(p.title)}</h2>
        <p>${escapeHtml(p.summary)}</p>
      </div>
      <div class="draft-history-wrap">
        <select id="draft-history" aria-label="Draft history">
          ${history.map((item) => `<option value="${item.id}" ${item.id === d.id ? 'selected' : ''}>${escapeHtml(skillNames[item.skill] || item.skill)} · ${item.phase === 'resolved' ? 'v2' : 'initial'} (${item.id.slice(0, 8)})</option>`).join('')}
        </select>
        <span class="draft-id">${escapeHtml(d.id)}</span>
      </div>
    </div>
    ${staleWarning}
    <div class="draft-body">
      ${p.sections
        .map(
          (section) => `<article class="claim">
            <div class="claim-heading">
              <h3>${escapeHtml(section.title)}</h3>
              <span class="state-badge badge-${section.status.toLowerCase()}">${escapeHtml(statusLabels[section.status] || section.status)}</span>
              ${section.canonical_ids?.length ? `<span class="draft-id">Rule: ${escapeHtml(section.canonical_ids.join(', '))}</span>` : ''}
            </div>
            <p class="claim-text">${escapeHtml(section.content)}</p>
            <div class="citation-line">
              ${section.citations
                .map(
                  (c) => `<button class="citation" type="button" data-evidence="${c.chunk_id.split('-')[0]}" data-chunk="${c.chunk_id}" title="${escapeHtml(c.text)}">${formatCitationLabel(c.chunk_id)}</button>`
                )
                .join('')}
            </div>
          </article>`
        )
        .join('')}
    </div>
    <div class="draft-footer">${draftActions(d)}</div>
  `;

  bindDynamic();
  if ($('draft-history')) {
    $('draft-history').onchange = async (e) => {
      try {
        state.draft = await api(`/api/drafts/${e.target.value}`);
        renderDraft();
      } catch (error) {
        toast(error.message, true);
      }
    };
  }
}

async function generate(skill) {
  if (state.busy) return;
  state.busy = true;
  $('draft-content').innerHTML = `<div class="loading"><div><div class="loading-bar"></div>Main Agent checking scope &amp; running ${escapeHtml(skillNames[skill] || skill)} skill…</div></div>`;
  try {
    const draft = await api('/api/generate', {
      method: 'POST',
      body: JSON.stringify({ skill, provider: state.provider }),
    });
    state.draft = draft;
    await refresh();
    renderDraft();
    toast(`${skillNames[skill]} generated. Click any passage pill to verify its source citation.`);
  } catch (error) {
    toast(error.message, true);
    if (!state.draft) {
      $('draft-content').innerHTML = `<div class="empty-state">
        <span class="empty-kicker">GOVERNANCE CHECK BLOCKED THIS ACTION</span>
        <h2>Main Agent held the workflow gate.</h2>
        <p>${escapeHtml(error.message)}</p>
        <button class="button" type="button" data-generate-report>Generate WS-04 Workshop Report →</button>
      </div>`;
      bindDynamic();
    } else {
      renderDraft();
    }
  } finally {
    state.busy = false;
  }
}

async function inspectEvidence(docId, chunkId) {
  try {
    const d = await api(`/api/evidence/${docId}`);
    $('evidence-eyebrow').textContent = 'VERIFIED SOURCE CITATION';
    $('evidence-title').textContent = d.title;
    const target = chunkId || d.parts.find((p) => p.chunk_id)?.chunk_id;
    $('evidence-content').innerHTML = `
      <p class="explanation">The highlighted passage below comes directly from the original workshop record using exact character offsets and SHA-256 verification.</p>
      <div class="source-document">${d.id.toUpperCase()} · ORIGINAL SOURCE DOCUMENT</div>
      <div class="source-content">${d.parts
        .map((p) => (p.chunk_id ? `<span class="source-highlight ${p.chunk_id === target ? 'focused' : ''}" data-source-chunk="${p.chunk_id}">${p.html}</span>` : p.html))
        .join('')}</div>
      <div class="source-footer">Fingerprint (SHA-256): ${d.sha256}</div>`;
    $('evidence-dialog').showModal();
  } catch (error) {
    toast(error.message, true);
  }
}

async function inspectPublication(id) {
  try {
    const p = await api(`/api/publications/${id}`);
    const content = JSON.parse(p.payload);
    const provenance = JSON.parse(p.provenance);
    $('evidence-eyebrow').textContent = 'LOCKED PUBLICATION & LINEAGE';
    $('evidence-title').textContent = content.title;
    $('evidence-content').innerHTML = `
      <p class="explanation">This published deliverable is locked by SQLite triggers and records the exact knowledge version, source files, skill, and model used.</p>
      ${content.sections
        .map(
          (s) => `<div style="margin-bottom:14px">
            <span class="state-badge badge-${s.status.toLowerCase()}">${escapeHtml(statusLabels[s.status] || s.status)}</span>
            <p style="margin:6px 0 4px">${escapeHtml(s.content)}</p>
            <div style="font-size:11px;color:var(--muted)">${s.citations.map((c) => formatCitationLabel(c.chunk_id)).join(' · ')}</div>
          </div>`
        )
        .join('')}
      <div class="provenance">${escapeHtml(JSON.stringify(provenance, null, 2))}</div>`;
    $('evidence-dialog').showModal();
  } catch (error) {
    toast(error.message, true);
  }
}

async function showAudit() {
  try {
    const rows = await api('/api/audit');
    $('audit-content').innerHTML = rows
      .map(
        (e) => `<div class="audit-entry">
          <div class="audit-type">${escapeHtml(e.event_type)}</div>
          <div>
            <p>${escapeHtml(e.event)}</p>
            <div class="audit-meta">Actor: ${escapeHtml(e.actor)} · ${escapeHtml(e.created_at)}<br>Chain Hash: ${escapeHtml(e.event_hash)}</div>
          </div>
        </div>`
      )
      .join('');
    $('audit-dialog').showModal();
  } catch (error) {
    toast(error.message, true);
  }
}

async function openArchitectureZoom(key) {
  try {
    if (!state.architecture) {
      state.architecture = await api('/api/architecture');
    }
    const arch = state.architecture;
    let html = '';

    if (key === 'main_agent') {
      const m = arch.main_agent;
      $('arch-eyebrow').textContent = 'ARCHITECTURE ZOOM-IN · 1 OF 5';
      $('arch-title').textContent = m.title;
      html = `
        <div class="arch-modal-card">
          <h3>${escapeHtml(m.subtitle)}</h3>
          <p>${escapeHtml(m.summary)}</p>
          <div class="arch-code-ref">Implementation: ${escapeHtml(m.code_ref)}</div>
        </div>
        <div class="arch-modal-card">
          <h3>Inputs &amp; Outputs</h3>
          <ul class="arch-list">
            <li><strong>Receives:</strong> ${m.inputs.map(escapeHtml).join(' · ')}</li>
            <li><strong>Produces:</strong> ${m.outputs.map(escapeHtml).join(' · ')}</li>
            <li><strong>Safety guarantee:</strong> ${escapeHtml(m.guarantees)}</li>
          </ul>
        </div>`;
    } else if (key === 'specialized_agents') {
      $('arch-eyebrow').textContent = 'ARCHITECTURE ZOOM-IN · 2 OF 5';
      $('arch-title').textContent = 'Specialized Agents (Shared Engine)';
      html = arch.specialized_agents
        .map(
          (ag) => `<div class="arch-modal-card">
            <h3>${escapeHtml(ag.title)}</h3>
            <p><strong>Role:</strong> ${escapeHtml(ag.role)}</p>
            <p>${escapeHtml(ag.detail)}</p>
            <div class="arch-code-ref">Implementation: ${escapeHtml(ag.code_ref)}</div>
          </div>`
        )
        .join('');
    } else if (key === 'skills') {
      $('arch-eyebrow').textContent = 'ARCHITECTURE ZOOM-IN · 3 OF 5';
      $('arch-title').textContent = 'Pluggable Skill Packages (1 Skill = 1 Deliverable)';
      const ext = arch.skill_extension;
      html = `
        <p class="explanation">We do not build a new application for each consulting deliverable. Every skill is a declarative folder (<code>manifest.json</code> + required sections + quality checks) executed by the exact same Deliverable Agent.</p>
        <div class="skill-manifest-grid">
          ${arch.skills
            .map(
              (sk) => `<div class="manifest-card">
                <h4>${escapeHtml(skillNames[sk.name] || sk.name)} <span class="draft-id">v${escapeHtml(sk.version)}</span></h4>
                <p>${escapeHtml(sk.purpose)}</p>
                <div class="manifest-tags">${sk.sections.map((s) => `<span class="manifest-tag">${escapeHtml(s)}</span>`).join('')}</div>
              </div>`
            )
            .join('')}
          <div class="manifest-card planned">
            <h4>Target Architecture <span class="draft-id">(Extension Example)</span></h4>
            <p>${escapeHtml(ext.purpose)}</p>
            <div class="manifest-tags">${ext.sections.map((s) => `<span class="manifest-tag">${escapeHtml(s)}</span>`).join('')}</div>
          </div>
        </div>`;
    } else if (key === 'knowledge_layers') {
      $('arch-eyebrow').textContent = 'ARCHITECTURE ZOOM-IN · 4 OF 5';
      $('arch-title').textContent = 'Layered Project Knowledge Base';
      html = arch.knowledge_layers
        .map(
          (l) => `<div class="arch-modal-card">
            <h3>${escapeHtml(l.layer)}: ${escapeHtml(l.title)} &middot; <em>${escapeHtml(l.subtitle)}</em></h3>
            <p>${escapeHtml(l.detail)}</p>
          </div>`
        )
        .join('') + `<div class="arch-code-ref">Implementation: app/knowledge.py :: KnowledgeStore (SQLite + FTS5 + triggers)</div>`;
    } else if (key === 'model_gateway') {
      const g = arch.model_gateway;
      $('arch-eyebrow').textContent = 'ARCHITECTURE ZOOM-IN · 5 OF 5';
      $('arch-title').textContent = g.title;
      html = `
        <div class="arch-modal-card">
          <h3>${escapeHtml(g.subtitle)}</h3>
          <p>${escapeHtml(g.summary)}</p>
          <ul class="arch-list">
            ${g.modes.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}
            <li><strong>Governance:</strong> ${escapeHtml(g.governance)}</li>
          </ul>
          <div class="arch-code-ref" style="margin-top:8px">Implementation: ${escapeHtml(g.code_ref)}</div>
        </div>`;
    }

    $('arch-content').innerHTML = html;
    $('arch-dialog').showModal();
  } catch (error) {
    toast(error.message, true);
  }
}

function switchTab(tabName) {
  state.activeTab = tabName;
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    const active = btn.dataset.tab === tabName;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  document.querySelectorAll('.tab-pane').forEach((pane) => {
    pane.classList.toggle('active', pane.id === `pane-${tabName}`);
  });
}

function bindDynamic() {
  document.querySelectorAll('[data-evidence]').forEach((el) => {
    el.onclick = () => inspectEvidence(el.dataset.evidence, el.dataset.chunk);
  });
  document.querySelectorAll('[data-publication]').forEach((el) => {
    el.onclick = () => inspectPublication(el.dataset.publication);
  });
  document.querySelectorAll('[data-generate-report]').forEach((el) => {
    el.onclick = () => generate('workshop_report');
  });
  document.querySelectorAll('[data-quick-skill]').forEach((el) => {
    el.onclick = () => generate(el.dataset.quickSkill);
  });

  const bind = (id, fn) => {
    if ($(id)) $(id).onclick = fn;
  };

  // Guided 1-click actions
  bind('guided-flag-conflict', () =>
    action('/api/guided/flag-conflict', 'Report approved & €50k conflict flagged! Dependent teams alerted.', { draft_id: state.draft?.id })
  );
  bind('guided-resolve', () =>
    action('/api/guided/resolve-conflict', 'WS-05 clarification applied! Approved rule updated to v2 (€50,000 for FR01).', undefined, true)
  );
  bind('guided-publish', () =>
    action('/api/guided/publish', 'Deliverable approved and locked as an immutable publication.', { draft_id: state.draft?.id })
  );

  // Granular controls (preserved for deep inspection / testability)
  bind('flag-conflict', () => action('/api/conflict', 'Decision conflict recorded. Dependent review alerts created.'));
  bind('flag-draft-conflict', () => action('/api/conflict', 'Decision conflict recorded. Baseline v1 remains unchanged.'));
  bind('accept-clarification', () => action('/api/clarification/accept', 'WS-05 accepted. Now promote to update Project Knowledge.'));
  bind('promote', () => action('/api/promote?clarification=true', 'Decision promoted to Project Knowledge v2.', undefined, true));
  bind('approve-report', () => action(`/api/drafts/${state.draft.id}/approve-report`, 'Report accuracy approved. Knowledge baseline unchanged.'));
  bind('approve-change', () => action(`/api/drafts/${state.draft.id}/approve-change`, 'Knowledge change approved for this draft.'));
  bind('publish-draft', () => action('/api/publish', 'Locked publication created.', { draft_id: state.draft.id }));
}

// Static Event Listeners
$('role-select').addEventListener('change', async (e) => {
  state.role = e.target.value;
  toast(`Role switched to ${e.target.options[e.target.selectedIndex].text}.`);
  await refresh();
});

$('provider').addEventListener('change', (e) => {
  state.provider = e.target.value;
  $('provider-note').textContent = state.provider === 'mock' ? 'Offline deterministic fixtures' : 'Live Mistral API · key required';
});

$('reset-demo').addEventListener('click', async () => {
  if (state.busy) return;
  state.busy = true;
  try {
    state.draft = null;
    state.workspace = await api('/api/reset', { method: 'POST' });
    switchTab('evidence');
    renderWorkspace();
    renderEmptyDraft();
    toast('Demo reset to Step 1 (WS-04 ready).');
  } catch (error) {
    toast(error.message, true);
  } finally {
    state.busy = false;
  }
});

document.querySelectorAll('[data-arch]').forEach((el) => {
  el.addEventListener('click', () => openArchitectureZoom(el.dataset.arch));
});

document.querySelectorAll('[data-skill]').forEach((el) => {
  el.addEventListener('click', () => generate(el.dataset.skill));
});

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

document.querySelectorAll('.step').forEach((el) => {
  el.addEventListener('click', () => {
    const hints = {
      '1': 'Step 1: Generate the WS-04 Workshop Report and verify its citations.',
      '2': 'Step 2: Flag the €50k vs €25k conflict, preview blocked drafts, then apply WS-05.',
      '3': 'Step 3: After WS-05 updates Knowledge to v2, generate and publish final deliverables.',
    };
    toast(hints[el.dataset.step]);
  });
});

$('audit-top').onclick = showAudit;
document.querySelectorAll('[data-close-dialog]').forEach((el) => (el.onclick = () => $('audit-dialog').close()));
document.querySelectorAll('[data-close-evidence]').forEach((el) => (el.onclick = () => $('evidence-dialog').close()));
document.querySelectorAll('[data-close-arch]').forEach((el) => (el.onclick = () => $('arch-dialog').close()));
document.querySelectorAll('dialog').forEach((dialog) =>
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  })
);

refresh().catch((error) => {
  toast(error.message, true);
});
