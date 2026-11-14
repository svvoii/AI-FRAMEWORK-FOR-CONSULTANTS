const state = { workspace: null, draft: null, role: 'consultant', provider: 'mock', busy: false };
const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = (amount) => amount == null ? 'Unknown' : `EUR ${Number(amount).toLocaleString('en-US')}`;
const skillNames = {workshop_report:'Workshop report', fit_gap:'Fit-gap analysis', steering_deck:'Steering summary'};
const canonicalId = 'DEC-P2P-004';
let toastTimer;

function toast(message, error=false) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').className = `toast${error ? ' error' : ''}`;
  $('toast').style.display = 'block';
  toastTimer = setTimeout(() => $('toast').style.display = 'none', error ? 10000 : 6000);
}

async function api(path, options={}) {
  const response = await fetch(path, {...options, headers: {'Content-Type':'application/json','X-Demo-Role':state.role,...options.headers}});
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || 'The governed action could not be completed.');
  return data;
}
async function refresh() {
  state.workspace = await api('/api/workspace');
  renderWorkspace();
  if (state.draft && state.draft.payload) {
    try { state.draft = await api(`/api/drafts/${state.draft.id}`); renderDraft(); }
    catch (_) { renderDraft(); }
  }
}
async function action(path, success, body) {
  if (state.busy) return;
  state.busy = true;
  try {
    const result = await api(path, {method:'POST', body:body ? JSON.stringify(body) : undefined});
    await refresh();
    if (result?.payload && typeof result.payload === 'object' && result.draft_id === undefined) { state.draft = result; renderDraft(); }
    toast(success);
  } catch (error) { toast(error.message, true); }
  finally { state.busy = false; }
}

function evidenceCard(doc) {
  const id = doc.id.toUpperCase();
  const locked = !doc.active;
  return `<button class="evidence-card" data-evidence="${doc.id}" data-testid="evidence-${doc.id}" ${locked ? 'aria-label="Inspect pending evidence"' : ''}>
    <span class="source-mark ${locked ? 'future' : ''}">${id}</span>
    <span><span class="evidence-title">${escapeHtml(doc.title)}</span><span class="evidence-subtitle">${locked ? 'Written owner clarification · not yet introduced' : 'Workshop evidence · exact passages indexed'}</span></span>
    <span class="source-meta"><span class="state-badge ${locked ? 'pending' : ''}">${locked ? 'Awaiting review' : 'Source controlled'}</span><div class="evidence-subtitle">${doc.sha256.slice(0,10)} …</div></span>
  </button>`;
}

function renderWorkspace() {
  const w = state.workspace;
  const s = w.state;
  $('phase-label').textContent = w.phase_label;
  document.querySelector('.candidate-panel').classList.toggle('conflict', ['Conflicted','Proposed'].includes(w.candidate.status));
  const steps = ['evidence','report','conflict','clarified'];
  const index = s === 'accepted_clarification' ? 3 : steps.indexOf(s);
  document.querySelectorAll('.step').forEach(el => {
    const pos = steps.indexOf(el.dataset.step);
    el.classList.toggle('active', pos === index);
    el.classList.toggle('done', pos < index);
  });
  $('evidence-list').innerHTML = w.documents.map(evidenceCard).join('');
  $('canonical-content').innerHTML = `<span class="state-badge">${w.baseline.record_id} / VALIDATED</span>
    <div class="value">${money(w.baseline.amount)}</div><div class="canonical-label">Procurement director approval threshold</div>
    <p class="statement">Company code <strong>${escapeHtml(w.baseline.scope)}</strong>. Approved by the domain lead. ${w.state === 'clarified' ? 'Effective 5 November 2026.' : 'The current baseline until a scoped replacement is promoted.'}</p>
    <div class="version-stack">${[...w.canonical_history].reverse().map(record => `<div class="version-node ${record.current ? 'current' : ''}">v${record.version}<span>${record.current ? 'current' : 'historical'}</span></div>`).join('<span class="version-arrow">→</span>')}</div>
    <div class="metadata-row"><span>Stable entity</span><b>${canonicalId}</b></div>
    <div class="metadata-row"><span>Source</span><button class="text-button citation" data-evidence="${w.baseline.source_chunk.split('-')[0]}" data-chunk="${w.baseline.source_chunk}">${w.baseline.source_chunk} ↗</button></div>
    <div class="metadata-row"><span>Authority</span><b>${escapeHtml(w.baseline.approved_by)}</b></div>`;
  const c = w.candidate;
  let candidateActions = '';
  if (s === 'report') candidateActions = `<button class="button secondary workflow-action" id="flag-conflict" data-testid="flag-conflict">Flag for clarification →</button>`;
  if (s === 'conflict') candidateActions = `<button class="button workflow-action" id="accept-clarification" data-testid="accept-clarification" ${state.role !== 'domain_lead' ? 'disabled title="Domain lead required"' : ''}>1 · Accept WS-05 clarification →</button><p class="instruct">The candidate becomes scoped, but does not yet enter canonical knowledge.</p>`;
  if (s === 'accepted_clarification') candidateActions = `<button class="button workflow-action" id="promote" data-testid="promote" ${state.role !== 'domain_lead' ? 'disabled title="Domain lead required"' : ''}>2 · Promote accepted candidate →</button><p class="instruct">Only after this independent action does v2 supersede v1 for FR01.</p>`;
  $('candidate-content').innerHTML = `<span class="state-badge ${c.status.toLowerCase()}">${c.status}</span>
    <div class="candidate-value" style="margin-top:15px">${money(c.amount)} <small>/ proposed</small></div>
    <div class="conflict-compare"><div class="compare-number">${money(w.baseline.amount).replace('EUR ','')}<small>Current baseline</small></div><span class="versus">VS</span><div class="compare-number">${money(c.amount).replace('EUR ','')}<small>WS-04 source assertion</small></div></div>
    <p>${c.scope ? `Company code <strong>${c.scope}</strong>.` : '<strong>Company-code scope unknown.</strong>'} ${c.proposed_change}</p>
    <div class="metadata-row"><span>Candidate</span><b>${c.id}</b></div>${candidateActions}`;
  $('tasks-content').innerHTML = w.tasks.length ? w.tasks.map(t => `<div class="task"><span class="task-symbol">↗</span><div><p>${escapeHtml(t.subject)}</p><small>${escapeHtml(t.status)}</small></div></div>`).join('') : '<p class="fine-print">Flag the conflict to create target-architecture review and steering inputs.</p>';
  $('publication-count').textContent = `${w.publications.length} ${w.publications.length === 1 ? 'version' : 'versions'}`;
  $('publications-list').innerHTML = w.publications.map(p => `<div class="publication"><span class="publication-icon">DOC</span><div><b>${escapeHtml(skillNames[p.skill])}</b><small>${p.id} · approved by ${escapeHtml(p.approved_by)}</small></div><button class="text-button inline-action" style="margin-left:auto" data-publication="${p.id}">Inspect ↗</button></div>`).join('');
  const guidance = {
    evidence: '<strong>Start with faithful recording.</strong> The consultant reviews WS-04, including its unresolved scope. No facts change when the report is approved.',
    report: '<strong>The source record is reviewed. The proposal is not yet validated.</strong> Compare WS-04 with approved v1 and flag the decision conflict.',
    conflict: '<strong>The baseline remains unchanged.</strong> You can generate a review-only fit-gap or steering summary now. Bring in WS-05 and accept its clarification as a separate action.',
    accepted_clarification: '<strong>The candidate is accepted. It is not canonical.</strong> Review the WS-05 evidence, then perform the independent promote-to-knowledge action.',
    clarified: '<strong>The accepted decision is now canonical v2.</strong> Generate all three outputs and publish them after domain-lead approval. v1 remains frozen in provenance.'
  }[s];
  $('banner').innerHTML = `<div class="note ${s === 'conflict' ? 'conflict' : ''}"><span>${guidance}</span>${state.role === 'viewer' ? '<strong style="margin-left:auto;white-space:nowrap">Read-only role</strong>' : ''}</div>`;
  renderDecision();
  if (state.role === 'viewer') $('banner').title = 'Generation and approvals require consultant or domain lead permissions.';
  bindDynamic();
}

function renderDecision() {
  const d = state.draft;
  if (!d?.payload) return;
  const c = state.workspace.candidate;
  const b = state.workspace.baseline;
  const resolved = d.phase === 'resolved';
  const review = resolved ? 'Domain-lead change approval' : d.skill === 'fit_gap' ? 'Impact assessment pending WS-05' : d.skill === 'steering_deck' ? 'Source acknowledgement ≠ decision approval' : 'Report approval ≠ knowledge approval';
  $('decision-status-label').textContent = resolved ? 'DECISION FRAMED' : 'REVIEW ITEM';
  $('decision-content').innerHTML = `<div class="report-compare"><div><b>${d.phase === 'initial' ? 'WS-04 / report candidate' : 'BASELINE / v1'}</b><p>${resolved ? `EUR 25,000 · company code FR01` : `EUR 50,000 · scope ${c.scope || 'unknown'}`}</p><p style="margin-top:10px">${resolved ? 'Superseded only for FR01 on 5 November 2026. Its publication remains immutable.' : 'Cited source assertion. The engine does not recursively mark it Validated in a steward prompt.'}</p></div><div><b>${state.workspace.state === 'clarified' ? 'CANONICAL / v2' : 'BEFORE ANY PROMOTION'}</b><p>${money(b.amount)} · company code ${escapeHtml(b.scope)}</p><p style="margin-top:10px">${escapeHtml(review)}. A publication always contains its frozen source snapshot.</p></div></div>
    <div class="success-block"><b>Why this matters</b><p>The difference between a heard statement, a reviewed report and an approved change is explicit. Consultants can review, but only the domain lead can introduce and promote the clarified decision.</p></div>`;
}

function draftActions(d) {
  const published = state.workspace.publications.some(p => p.draft_id === d.id);
  const reportReview = d.skill === 'workshop_report' && d.report_approved;
  const changeApproval = state.workspace.drafts.find(item => item.id === d.id)?.change_approved;
  let html = `<span class="draft-meta">${d.provider}<br>${d.id} · frozen snapshot ${d.snapshot_id}</span><div style="display:flex;gap:8px;flex-wrap:wrap">`;
  if (published) html += `<span class="state-badge">IMMUTABLE / PUBLISHED</span>`;
  else {
    if (d.skill === 'workshop_report' && !reportReview) html += `<button class="button secondary" id="approve-report" data-testid="approve-report">1 · Approve faithful report</button>`;
    if (d.phase === 'initial' && d.skill !== 'workshop_report') html += `<span class="state-badge conflicted">REVIEW ONLY / NOT PUBLISHABLE</span>`;
    if (reportReview) html += `<span class="state-badge">RECORD REVIEWED</span>`;
    if (d.skill === 'workshop_report' && reportReview && state.workspace.state === 'report') html += `<button class="button warning" id="flag-draft-conflict" data-testid="conflict-primary">Flag scope conflict</button>`;
    if (d.phase === 'resolved' || (d.skill !== 'workshop_report' && d.phase === 'initial')) {
      if (!changeApproval && d.phase === 'resolved') html += `<button class="button secondary" id="approve-change" data-testid="approve-change">Approve scoped change</button>`;
      if (d.phase === 'resolved') html += `<button class="button" id="publish-draft" data-testid="publish-draft">${changeApproval ? 'Publish immutable version' : '2 · Approve & publish'}</button>`;
    }
  }
  return html + '</div>';
}

function renderDraft() {
  const d = state.draft;
  if (!d?.payload || !Array.isArray(d.payload.sections)) return;
  const p = d.payload;
  const history = state.workspace?.drafts || [];
  $('draft-content').innerHTML = `<div class="draft-header"><div><div class="eyebrow">${skillNames[d.skill]} / ${escapeHtml(d.phase)}</div><h2 id="draft-title" data-testid="draft-title">${escapeHtml(p.title)}</h2><p>${escapeHtml(p.summary)}</p></div><div><select id="draft-history" aria-label="Draft history">${history.map(item => `<option value="${item.id}" ${item.id === d.id ? 'selected' : ''}>${skillNames[item.skill]} · ${item.phase} · ${item.id}</option>`).join('')}</select><span class="draft-id">${d.id}</span></div></div>
  <div class="draft-body">${p.sections.map(section => `<article class="claim" id="claim-${encodeURIComponent(section.title)}"><div class="claim-heading"><h3>${escapeHtml(section.title)}</h3><span class="state-badge badge-${section.status.toLowerCase()}">${section.status}</span>${section.canonical_ids?.length ? `<span class="draft-id">${section.canonical_ids.join(' / ')}</span>` : ''}</div><p class="claim-text">${escapeHtml(section.content)}</p><div class="citation-line">${section.citations.map(c => `<button class="citation" data-evidence="${c.chunk_id.split('-')[0]}" data-chunk="${c.chunk_id}" title="${escapeHtml(c.text)}">${c.chunk_id} · ${c.start}–${c.end} ↗</button>`).join('')}</div></article>`).join('')}</div>
  <div class="draft-footer">${draftActions(d)}</div>`;
  bindDynamic();
  if ($('draft-history')) $('draft-history').onchange = async e => {
    try { state.draft = await api(`/api/drafts/${e.target.value}`); renderDraft(); renderDecision(); }
    catch (error) { toast(error.message, true); }
  };
}

async function generate(skill) {
  if (state.busy) return;
  state.busy = true;
  $('draft-content').innerHTML = `<div class="loading"><div><div class="loading-bar"></div>Freezing authorized evidence and validating the skill output…</div></div>`;
  try {
    const draft = await api('/api/generate', {method:'POST', body:JSON.stringify({skill,provider:state.provider})});
    state.draft = draft;
    await refresh();
    renderDraft();
    $('draft-panel').scrollIntoView({behavior:'smooth', block:'nearest'});
    toast(`${skillNames[skill]} generated. Inspect its exact evidence spans and approval requirements.`);
  } catch (error) {
    toast(error.message, true);
    if (!state.draft) $('draft-content').innerHTML = `<div class="empty-state"><h2>The governed gate held.</h2><p>${escapeHtml(error.message)}</p><button class="inline-action" data-generate-report>Try the workshop report →</button></div>`;
    else renderDraft();
  } finally { state.busy = false; }
}

async function inspectEvidence(docId, chunkId) {
  try {
    const d = await api(`/api/evidence/${docId}`);
    document.querySelector('#evidence-dialog .eyebrow').textContent = 'EXACT SOURCE SPAN / VERIFIED CITATION';
    $('evidence-title').textContent = d.title;
    const target = chunkId || d.parts.find(p => p.chunk_id)?.chunk_id;
    $('evidence-content').innerHTML = `<p class="explanation">The citation was resolved from source offsets and checked against the document fingerprint. The highlighted span below is the exact evidence returned to the reviewer.</p><div class="source-document">${d.id.toUpperCase()} / IMMUTABLE SOURCE REGISTER</div><div class="source-content">${d.parts.map(p => p.chunk_id ? `<span class="source-highlight ${p.chunk_id === target ? 'focused' : ''}" data-source-chunk="${p.chunk_id}">${p.html}</span>` : p.html).join('')}</div><div class="source-footer">SHA-256: ${d.sha256}</div>`;
    $('evidence-dialog').showModal();
  } catch(error) { toast(error.message, true); }
}

async function inspectPublication(id) {
  try {
    const p = await api(`/api/publications/${id}`);
    const content = JSON.parse(p.payload);
    const provenance = JSON.parse(p.provenance);
    document.querySelector('#evidence-dialog .eyebrow').textContent = 'IMMUTABLE PUBLICATION / FROZEN PROVENANCE';
    $('evidence-title').textContent = content.title;
    $('evidence-content').innerHTML = `<p class="explanation">This publication is protected by SQLite immutability triggers. It stores the exact output, approval, retrieval context and provider in force at approval time.</p>${content.sections.map(s => `<div style="margin-bottom:20px"><span class="state-badge">${s.status}</span><p>${escapeHtml(s.content)}</p><div>${s.citations.map(c => `<span class="draft-id">${c.chunk_id} · ${c.start}–${c.end}</span>`).join(' · ')}</div></div>`).join('')}<div class="provenance">${escapeHtml(JSON.stringify(provenance,null,2))}</div>`;
    $('evidence-dialog').showModal();
  } catch(error) { toast(error.message, true); }
}

async function showAudit() {
  try {
    const rows = await api('/api/audit');
    $('audit-content').innerHTML = rows.map(e => `<div class="audit-entry"><div class="audit-type">${escapeHtml(e.event_type)}</div><div><p>${escapeHtml(e.event)}</p><div class="audit-meta">${e.actor} · ${e.created_at}<br>HASH ${e.event_hash}</div></div></div>`).join('');
    $('audit-dialog').showModal();
  } catch(error) { toast(error.message,true); }
}

function bindDynamic() {
  document.querySelectorAll('[data-evidence]').forEach(el => {el.onclick = () => inspectEvidence(el.dataset.evidence, el.dataset.chunk)});
  document.querySelectorAll('[data-publication]').forEach(el => {el.onclick = () => inspectPublication(el.dataset.publication)});
  const bind = (id, fn) => {if ($(id)) $(id).onclick = fn};
  bind('flag-conflict', () => action('/api/conflict','Decision conflict recorded. Target-architecture and steering reviews requested.'));
  bind('flag-draft-conflict', () => action('/api/conflict','Decision conflict recorded. Canonical v1 remains unchanged.'));
  bind('accept-clarification', () => action('/api/clarification/accept','WS-05 introduced and candidate accepted. Knowledge promotion remains independent.'));
  bind('promote', () => action('/api/promote?clarification=true','Decision promoted to canonical v2. Generate the three clarified deliverables.'));
  bind('approve-report', () => action(`/api/drafts/${state.draft.id}/approve-report`,'Faithful record approved. The candidate remains unvalidated.'));
  bind('approve-change', () => action(`/api/drafts/${state.draft.id}/approve-change`,'Scoped change approved for this exact draft. You can now publish.'));
  bind('publish-draft', () => action('/api/publish','Immutable publication approved and provenance frozen.',{draft_id:state.draft.id}));
}

$('role-select').addEventListener('change', async e => {
  state.role = e.target.value;
  toast(`Role switched to ${state.role}. The server checks each request independently.`);
  await refresh();
});
$('provider').addEventListener('change', e => {
  state.provider = e.target.value;
  $('provider-note').textContent = state.provider === 'mock' ? 'No silent fallback' : 'Explicit key required · failures visible';
});
document.querySelectorAll('[data-skill]').forEach(el => {el.onclick = () => generate(el.dataset.skill)});
document.querySelector('[data-generate-report]').onclick = () => generate('workshop_report');
$('audit-top').onclick = showAudit;
document.querySelectorAll('[data-close-dialog]').forEach(el => el.onclick = () => $('audit-dialog').close());
document.querySelectorAll('[data-close-evidence]').forEach(el => el.onclick = () => $('evidence-dialog').close());
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', e => {if(e.target === dialog) dialog.close()}));
document.querySelectorAll('.step').forEach(el => el.addEventListener('click', () => {
  const instruction = {evidence:'Inspect WS-01 and WS-04; preserve both sides of the conflict.',report:'Generate the WS-04 workshop report, then approve its faithfulness, not the new fact.',conflict:'Flag the conflict after report review. Generate fit-gap and steering review drafts here.',clarified:'Accept the WS-05 clarification, then promote it independently with the domain lead.'}[el.dataset.step];
  toast(instruction);
}));
refresh().catch(error => {toast(error.message,true); $('canonical-content').textContent = error.message;});
