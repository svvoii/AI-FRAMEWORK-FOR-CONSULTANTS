const state = {
  workspace: null,
  draft: null,
  role: 'domain_lead',
  provider: 'mock',
  liveBackend: null,
  providerChosenByUser: false,
  activeTab: 'evidence',
  busy: false,
  messages: [],
  selectedSkill: null,
};

const PROMPT_PRESETS = {
  initial: {
    workshop_report: 'Draft the WS-04 Workshop Report and stage any proposed baseline changes',
    fit_gap: 'Generate Fit-Gap Analysis comparing WS-04 proposals against the DEC-P2P-004 baseline',
    steering_deck: 'Prepare a Steering Summary escalation brief for open P2P threshold conflicts',
  },
  clarified: {
    workshop_report: 'Draft the WS-05 Workshop Report confirming EUR 50,000 for FR01',
    fit_gap: 'Generate updated Fit-Gap Analysis using approved Knowledge v2 (EUR 50,000 for FR01)',
    steering_deck: 'Prepare Steering Summary decision update with Knowledge v2 (FR01)',
  },
};

function currentPresets() {
  return state.workspace?.state === 'clarified' ? PROMPT_PRESETS.clarified : PROMPT_PRESETS.initial;
}

function matchSkillIntent(text) {
  const q = String(text || '').toLowerCase().trim();
  if (!q) return null;
  const isActionVerb = /\b(draft|generate|create|run|prepare|build|make|produce|summarize|write)\b/.test(q);
  const looksLikeQuestion = q.endsWith('?') || /^(what|why|when|where|who|which|how|explain|compare|does|is|are|can|could)\b/.test(q);
  if (looksLikeQuestion && !isActionVerb) {
    return null;
  }
  if (/(fit[\s-]?gap|fitgap)/.test(q) || (isActionVerb && /\b(impact|baseline|delta)\b/.test(q))) return 'fit_gap';
  if (/(steering|escalation brief|steering deck|steering summary)/.test(q) || (isActionVerb && /\b(executive|committee|brief)\b/.test(q))) return 'steering_deck';
  if (/(workshop[\s-]?report)/.test(q) || (isActionVerb && /\b(workshop|ws[\s-]?0?[145]|notes|report|clarification)\b/.test(q))) return 'workshop_report';
  return null;
}

const $ = (id) => document.getElementById(id);
const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));

function formatInlineText(value) {
  return escapeHtml(value).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

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

function defaultGreeting() {
  const w = state.workspace;
  const amt = w?.baseline ? money(w.baseline.amount) : 'EUR 25,000';
  const scope = w?.baseline?.scope || 'FR01';
  const ver = w?.baseline?.version ? `v${w.baseline.version}` : 'v1';
  return {
    id: 'welcome',
    role: 'assistant',
    text: `Ready on Procure-to-Pay scoping (**${ver} · ${amt}** approved for **${scope}**). Ask a question about the evidence or select a skill below to generate a cited deliverable.`,
    thoughtLabel: null,
    thoughtOpen: false,
    steps: [],
    citations: [],
  };
}

function syncSkillSelection() {
  document.querySelectorAll('.quick-pill[data-prompt-skill]').forEach((btn) => {
    const selected = btn.dataset.promptSkill === state.selectedSkill;
    btn.classList.toggle('selected', selected);
    btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
}

function setSelectedSkill(skill) {
  state.selectedSkill = state.selectedSkill === skill ? null : skill;
  syncSkillSelection();
  syncRoutePill();
}

function syncRoutePill() {
  const input = $('agent-prompt-input');
  const pill = $('matched-skill-pill');
  if (!input || !pill) return null;
  const matched = state.selectedSkill || matchSkillIntent(input.value.trim());
  pill.classList.toggle('skill-match', Boolean(matched));
  pill.textContent = matched ? `Skill: ${skillNames[matched]}` : 'Chat QA';
  return matched;
}

function syncProviderUI() {
  const llm = state.workspace?.llm;
  const select = $('provider');
  const note = $('provider-note');
  if (!select || !note) return;

  [...select.options].forEach((option) => {
    if (!option.value.startsWith('live:')) return;
    const backend = option.value.split(':', 2)[1];
    if (!option.dataset.baseLabel) option.dataset.baseLabel = option.textContent;
    const configured = llm?.backends?.[backend]?.configured;
    option.textContent = configured ? option.dataset.baseLabel : `${option.dataset.baseLabel} · no key`;
  });

  if (!state.providerChosenByUser && llm?.any_live_configured && llm.default_live_backend) {
    const autoVal = `live:${llm.default_live_backend}`;
    if ([...select.options].some((o) => o.value === autoVal)) {
      select.value = autoVal;
      state.provider = 'live';
      state.liveBackend = llm.default_live_backend;
    }
  }

  note.classList.remove('live-ready', 'needs-key');
  if (state.provider === 'mock') {
    note.textContent = llm?.any_live_configured ? 'Mock Mode (Live Key Ready)' : 'Mock Mode';
    return;
  }
  const backend = state.liveBackend || 'mistral';
  const info = llm?.backends?.[backend];
  if (info?.configured) {
    note.textContent = `Live · ${info.label} (${info.model})`;
    note.classList.add('live-ready');
  } else {
    const envVar = info?.env_var || 'MISTRAL_API_KEY';
    note.textContent = `Live · Set ${envVar} in .env`;
    note.classList.add('needs-key');
  }
}

function missingLiveKey() {
  if (state.provider !== 'live') return null;
  const backend = state.liveBackend || 'mistral';
  const info = state.workspace?.llm?.backends?.[backend];
  if (info && !info.configured) return { label: info.label || backend, envVar: info.env_var || 'MISTRAL_API_KEY' };
  return null;
}

function renderThread() {
  const container = $('agent-thread');
  if (!container) return;
  const items = state.messages.length ? state.messages : [defaultGreeting()];

  container.innerHTML = items
    .map((msg) => {
      if (msg.role === 'user') {
        return `<div class="msg-row user"><div class="msg-user-bubble">${escapeHtml(msg.text)}</div></div>`;
      }
      const hasLog = Boolean(msg.thoughtLabel) || (msg.steps && msg.steps.length > 0);
      const drawerHtml = hasLog
        ? `<details class="thought-drawer" ${msg.thoughtOpen ? 'open' : ''}>
            <summary class="thought-summary">
              <span class="thought-summary-left">
                <span class="thought-dot ${msg.thoughtStatus || 'done'}" aria-hidden="true"></span>
                <span class="thought-title">${escapeHtml(msg.thoughtLabel || 'Thinking & actions')}</span>
              </span>
              <span class="thought-summary-right">
                ${msg.thoughtMeta ? `<span class="thought-meta">${escapeHtml(msg.thoughtMeta)}</span>` : ''}
                <span class="thought-chevron" aria-hidden="true">▾</span>
              </span>
            </summary>
            ${
              msg.steps?.length
                ? `<div class="thought-steps">
                    ${msg.steps
                      .map(
                        (s) => `<div class="thought-step ${s.state || 'done'}">
                          <span class="thought-actor">${escapeHtml(s.actor)}</span>
                          <span class="thought-detail">${escapeHtml(s.detail)}</span>
                          <span class="thought-tag">${escapeHtml(s.tag || '')}</span>
                        </div>`
                      )
                      .join('')}
                  </div>`
                : ''
            }
          </details>`
        : '';

      const citesHtml =
        msg.citations?.length
          ? `<div class="agent-reply-citations">
              ${msg.citations
                .map(
                  (c) => `<button class="dark-citation" type="button" data-evidence="${escapeHtml(c.chunk_id.split('-')[0])}" data-chunk="${escapeHtml(c.chunk_id)}" title="${escapeHtml(c.text)}">${formatCitationLabel(c.chunk_id)}</button>`
                )
                .join('')}
            </div>`
          : '';

      const bodyHtml = msg.text
        ? `<div class="agent-reply-text ${msg.isError ? 'error-text' : ''}">${formatInlineText(msg.text)}</div>`
        : '';

      return `<div class="msg-row">
        <div class="msg-assistant">
          <div class="agent-avatar" aria-hidden="true">M</div>
          <div class="msg-assistant-body">
            ${drawerHtml}
            ${bodyHtml}
            ${citesHtml}
          </div>
        </div>
      </div>`;
    })
    .join('');

  const dot = $('agent-pulse-dot');
  if (dot) {
    dot.classList.remove('running', 'blocked');
    const last = items[items.length - 1];
    if (state.busy) dot.classList.add('running');
    else if (last?.isError || last?.thoughtStatus === 'blocked') dot.classList.add('blocked');
  }

  container.scrollTop = container.scrollHeight;
  bindCitationAndDraftLinks();
}

function collapseOlderThoughts() {
  state.messages.forEach((m) => {
    if (m.role === 'assistant') m.thoughtOpen = false;
  });
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

async function action(path, success, body, { clearDraft = false, targetTab = null } = {}) {
  if (state.busy) return;
  state.busy = true;
  try {
    const result = await api(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
    if (clearDraft) {
      state.draft = null;
    }
    if (targetTab) {
      switchTab(targetTab);
    }
    await refresh();
    if (result?.payload && typeof result.payload === 'object' && result.draft_id === undefined && !clearDraft) {
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
  const panel = $('draft-panel');
  const content = $('draft-content');
  if (panel) panel.classList.add('hidden');
  if (content) content.innerHTML = '';
}

function evidenceCard(doc) {
  const id = doc.id.toUpperCase();
  const locked = !doc.active;
  return `<button class="evidence-card" type="button" data-evidence="${doc.id}" data-testid="evidence-${doc.id}">
    <span class="evidence-left">
      <span class="source-mark ${locked ? 'future' : ''}">${id}</span>
      <span>
        <span class="evidence-title">${escapeHtml(doc.title)}</span>
        <span class="evidence-subtitle">${locked ? 'Owner reply · unlocks in Stage 4' : 'Indexed source · click to view passages'}</span>
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
  const hasDrafts = Boolean(state.draft) || (w.drafts && w.drafts.length > 0);

  const historyChips = [...w.canonical_history]
    .reverse()
    .map((rec) => `<span class="version-chip ${rec.current ? 'current' : ''}">v${rec.version} · ${money(rec.amount)}${rec.current ? ' (Active)' : ' (Saved)'}</span>`)
    .join('<span aria-hidden="true">→</span>');

  let proposalBox = '';
  if (s === 'evidence' && !hasDrafts) {
    proposalBox = `
      <div class="no-proposal-box">
        <strong>No candidate decision deltas staged yet.</strong><br>
        Run <em>01 · Workshop Report</em> above to let KnowledgeSteward extract proposals from WS-04 without modifying the approved EUR 25,000 rule.
      </div>`;
  } else if (isClarified) {
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
          <button class="button full-btn" type="button" id="flag-conflict" data-testid="flag-conflict" ${state.role === 'viewer' ? 'disabled' : ''}>Gate 2 · Flag Scope Conflict (EUR 50k vs 25k) →</button>
          <p class="helper-note">Marks this proposal as conflicted and notifies dependent deliverables without changing v1.</p>
        </div>`;
    } else if (isConflict) {
      actionHtml = `
        <div class="resolve-action-wrap">
          <button class="button full-btn" type="button" id="guided-resolve" ${state.role !== 'domain_lead' ? 'disabled title="Requires Domain Lead role"' : ''}>Gates 3 &amp; 4 · Apply WS-05 &amp; Promote to KB v2 →</button>
          <p class="helper-note">Loads the process owner's reply (WS-05) confirming FR01, then updates Project Knowledge to v2.</p>
          <details class="granular-controls" open>
            <summary>Explicit human gates (Domain Lead)</summary>
            <div class="granular-row">
              <button class="button secondary small" type="button" id="accept-clarification" data-testid="accept-clarification" ${s !== 'conflict' || state.role !== 'domain_lead' ? 'disabled' : ''}>Gate 3 · Accept WS-05 Scope</button>
              <button class="button secondary small" type="button" id="promote" data-testid="promote" ${s !== 'accepted_clarification' || state.role !== 'domain_lead' ? 'disabled' : ''}>Gate 4 · Promote to KB v2</button>
            </div>
          </details>
        </div>`;
    }

    proposalBox = `
      <div class="rule-box ${isConflict ? 'conflict-box' : ''}">
        <div class="rule-head">
          <span class="eyebrow" style="margin:0">Extracted Proposal (${c.id})</span>
          <span class="state-badge ${c.status === 'Conflicted' ? 'conflicted' : 'badge-proposed'}">${escapeHtml(c.status)}</span>
        </div>
        <div class="rule-amount">${money(c.amount)}</div>
        <div class="rule-meta">${c.scope ? `Company code <strong>${escapeHtml(c.scope)}</strong>` : '<strong>Company code unclear:</strong> WS-04 did not confirm if this replaces FR01 or adds a new entity.'}</div>
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
    evidence: 'Stage 1 · Evidence Ready',
    report: 'Stage 2 · Report Approved',
    conflict: 'Stage 3 · EUR 50k vs 25k Conflict',
    accepted_clarification: 'Stage 4 · WS-05 Scope Accepted',
    clarified: 'Stage 5 · KB v2 Active (EUR 50k)',
  }[s] || s;
  $('phase-label').textContent = phaseText;

  syncProviderUI();

  const stageIndex = {
    evidence: 1,
    report: 2,
    conflict: 3,
    accepted_clarification: 4,
    clarified: 5,
  }[s] || 1;
  document.querySelectorAll('.stage-pill').forEach((el) => {
    const idx = Number(el.dataset.stage);
    const isActive = idx === stageIndex;
    const isDone = idx < stageIndex || (s === 'clarified' && idx === 5 && w.publications.length > 1);
    el.classList.toggle('active', isActive && s !== 'conflict');
    el.classList.toggle('conflict-active', isActive && s === 'conflict');
    el.classList.toggle('done', isDone);
  });

  const presets = currentPresets();
  document.querySelectorAll('.quick-pill[data-prompt-skill]').forEach((btn) => {
    const sk = btn.dataset.promptSkill;
    if (presets[sk]) btn.title = presets[sk];
    btn.classList.remove('suggested', 'muted-skill');
    if (s === 'evidence' || s === 'report') {
      if (sk === 'workshop_report') btn.classList.add('suggested');
      else btn.classList.add('muted-skill');
    } else if (s === 'conflict') {
      if (sk === 'fit_gap' || sk === 'steering_deck') btn.classList.add('suggested');
    } else if (s === 'clarified') {
      btn.classList.add('suggested');
    }
  });
  syncSkillSelection();

  const guidance = {
    evidence: '<strong>Next:</strong> Run <strong>01 · Workshop Report</strong> above to extract WS-04 evidence. Baseline v1 stays untouched.',
    report: '<strong>Report approved:</strong> Extracted proposal lacks company code. Click <strong>Gate 2 · Flag Scope Conflict</strong> below.',
    conflict: '<strong>Conflict caught:</strong> Preview Fit-Gap/Steering or click <strong>Gates 3 &amp; 4 · Apply WS-05</strong> below.',
    accepted_clarification: '<strong>WS-05 accepted:</strong> Click <strong>Gate 4 · Promote to KB v2</strong> below to activate EUR 50,000 for FR01.',
    clarified: '<strong>Resolved (KB v2):</strong> Run updated <strong>Fit-Gap</strong> or <strong>Steering</strong> skills above and publish locked v2.',
  }[s];
  $('banner').innerHTML = `<div class="note ${isConflictState(s) ? 'conflict' : ''}"><span>${guidance}</span>${state.role === 'viewer' ? '<span class="state-badge conflicted">Read-Only Mode</span>' : ''}</div>`;

  renderKnowledgePanel();
  if (!state.messages.length) {
    renderThread();
  }

  $('count-evidence').textContent = w.documents.length;
  $('count-tasks').textContent = w.tasks.length;
  $('count-pubs').textContent = w.publications.length;

  $('evidence-list').innerHTML = w.documents.map(evidenceCard).join('');
  $('tasks-content').innerHTML = w.tasks.length
    ? w.tasks.map((t) => `<div class="task"><span class="task-symbol">!</span><div><p>${escapeHtml(t.subject)}</p><small>${escapeHtml(t.status)}</small></div></div>`).join('')
    : '<p class="helper-note">No alerts yet. Flagging the EUR 50k vs 25k conflict automatically notifies dependent deliverables.</p>';

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
    primaryHtml = `<button class="button" type="button" id="guided-flag-conflict" ${state.role === 'viewer' ? 'disabled' : ''}>2 · Approve Report &amp; Catch EUR 50k Conflict →</button>`;
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
  if ($('draft-panel')) $('draft-panel').classList.remove('hidden');
  const p = d.payload;
  const history = state.workspace?.drafts || [];
  const staleWarning =
    state.workspace?.state === 'clarified' && d.phase === 'initial'
      ? `<div class="stale-draft-banner">
          <span><strong>Update available:</strong> Project Knowledge is now v2 (EUR 50,000 for FR01). Generate an updated deliverable to see the resolved output.</span>
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
        <div style="display:flex;align-items:center">
          <select id="draft-history" aria-label="Draft history">
            ${history.map((item) => `<option value="${item.id}" ${item.id === d.id ? 'selected' : ''}>${escapeHtml(skillNames[item.skill] || item.skill)} · ${item.phase === 'resolved' ? 'v2' : 'initial'} (${item.id.slice(0, 8)})</option>`).join('')}
          </select>
          <button class="close-draft-btn" id="close-draft-btn" type="button" title="Hide deliverable card">✕</button>
        </div>
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
  if ($('close-draft-btn')) {
    $('close-draft-btn').onclick = () => {
      state.draft = null;
      renderEmptyDraft();
    };
  }
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

async function generate(skill, userPrompt = null) {
  if (state.busy) return;
  const missingKey = missingLiveKey();
  if (missingKey) {
    toast(`Live mode needs ${missingKey.envVar} in prototype/.env. Add the key or switch Model to Mock.`, true);
    return;
  }
  state.busy = true;
  state.selectedSkill = null;
  syncSkillSelection();
  syncRoutePill();
  const skillLabel = skillNames[skill] || skill;
  const promptText = userPrompt || currentPresets()[skill] || `Run ${skillLabel}`;
  const wsState = state.workspace?.state || 'evidence';
  const liveTag = state.provider === 'live' ? (state.liveBackend || 'mistral') : 'mock';

  collapseOlderThoughts();
  const assistantTurn = {
    id: `turn-${Date.now()}`,
    role: 'assistant',
    text: '',
    thoughtStatus: 'running',
    thoughtLabel: `Thinking & executing actions for ${skillLabel}…`,
    thoughtMeta: `${wsState} · ${liveTag}`,
    thoughtOpen: true,
    steps: [
      { actor: 'Main Agent', detail: `Checking ACL for "${state.role}" & selecting "${skill}" skill contract`, tag: 'ACL + Skill', state: 'done' },
      { actor: 'Knowledge DB', detail: 'Freezing SQLite snapshot & retrieving FTS5 evidence chunks', tag: 'SQLite FTS5', state: 'running' },
      { actor: 'ModelGateway', detail: `Calling ${state.provider === 'live' ? `Live ${liveTag}` : 'Offline Mock'} structured generation`, tag: liveTag, state: 'running' },
    ],
    citations: [],
  };
  state.messages.push({ id: `u-${Date.now()}`, role: 'user', text: promptText }, assistantTurn);
  renderThread();

  if ($('draft-panel') && $('draft-content')) {
    $('draft-panel').classList.remove('hidden');
    $('draft-content').innerHTML = `<div class="loading"><div><div class="loading-bar"></div>Main Agent checking scope &amp; running ${escapeHtml(skillLabel)}…</div></div>`;
  }
  try {
    const draft = await api('/api/generate', {
      method: 'POST',
      body: JSON.stringify({
        skill,
        provider: state.provider,
        live_backend: state.liveBackend,
        prompt_text: promptText,
      }),
    });
    state.draft = draft;
    const steps = draft.trace || assistantTurn.steps;
    assistantTurn.thoughtStatus = 'done';
    assistantTurn.thoughtLabel = `Thinking & actions · ${steps.length} steps`;
    assistantTurn.thoughtMeta = `${draft.provider} · ${draft.snapshot_id}`;
    assistantTurn.steps = steps;
    assistantTurn.text = draft.assistant_message || `${skillLabel} is ready below.`;
    assistantTurn.citations = (draft.payload?.sections || [])
      .flatMap((sec) => sec.citations || [])
      .filter((c, i, arr) => arr.findIndex((x) => x.chunk_id === c.chunk_id) === i)
      .slice(0, 4);

    await refresh();
    renderThread();
    toast(`${skillLabel} generated. Inspect citations and governance actions below.`);
  } catch (error) {
    assistantTurn.thoughtStatus = 'blocked';
    assistantTurn.thoughtLabel = `Blocked at governance / model check`;
    assistantTurn.thoughtMeta = `${liveTag} · blocked`;
    assistantTurn.steps = [
      { actor: 'Main Agent', detail: `Evaluated "${skill}" at stage "${wsState}"`, tag: 'Check', state: 'done' },
      { actor: 'Policy / Gateway', detail: error.message, tag: 'Blocked', state: 'blocked' },
    ];
    assistantTurn.text = error.message;
    assistantTurn.isError = true;

    renderThread();
    toast(error.message, true);
    if (!state.draft) {
      renderEmptyDraft();
    } else {
      renderDraft();
    }
  } finally {
    state.busy = false;
    renderThread();
  }
}

async function sendChat(question) {
  if (state.busy) return;
  const missingKey = missingLiveKey();
  if (missingKey) {
    toast(`Live mode needs ${missingKey.envVar} in prototype/.env. Add the key or switch Model to Mock.`, true);
    return;
  }
  state.busy = true;
  const wsState = state.workspace?.state || 'evidence';
  const liveTag = state.provider === 'live' ? (state.liveBackend || 'mistral') : 'mock';

  collapseOlderThoughts();
  const assistantTurn = {
    id: `turn-${Date.now()}`,
    role: 'assistant',
    text: '',
    thoughtStatus: 'running',
    thoughtLabel: 'Thinking & querying authorized Project Knowledge…',
    thoughtMeta: `${wsState} · ${liveTag}`,
    thoughtOpen: true,
    steps: [
      { actor: 'Main Agent', detail: `Checking role "${state.role}" & scanning P2P-DEMO scope`, tag: 'ACL Guard', state: 'done' },
      { actor: 'Knowledge DB', detail: 'Querying SQLite FTS5 across active notes & canonical rule', tag: 'SQLite FTS5', state: 'running' },
      { actor: 'ModelGateway', detail: `Generating concise grounded response (${liveTag})`, tag: liveTag, state: 'running' },
    ],
    citations: [],
  };
  state.messages.push({ id: `u-${Date.now()}`, role: 'user', text: question }, assistantTurn);
  renderThread();

  try {
    const res = await api('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        message: question,
        provider: state.provider,
        live_backend: state.liveBackend,
      }),
    });
    const steps = res.trace || assistantTurn.steps;
    assistantTurn.thoughtStatus = 'done';
    assistantTurn.thoughtLabel = `Thinking & actions · ${steps.length} steps`;
    assistantTurn.thoughtMeta = `${res.provider} · ${res.latency_ms}ms`;
    assistantTurn.steps = steps;
    assistantTurn.text = res.assistant_message;
    assistantTurn.citations = res.citations || [];
  } catch (error) {
    assistantTurn.thoughtStatus = 'blocked';
    assistantTurn.thoughtLabel = 'Stopped at gateway / scope boundary';
    assistantTurn.thoughtMeta = `${liveTag} · error`;
    assistantTurn.steps = [
      { actor: 'Main Agent', detail: `Evaluated conversational request under "${state.role}"`, tag: 'ACL', state: 'done' },
      { actor: 'ModelGateway', detail: error.message, tag: 'Error', state: 'blocked' },
    ];
    assistantTurn.text = error.message;
    assistantTurn.isError = true;
    toast(error.message, true);
  } finally {
    state.busy = false;
    renderThread();
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

const ARCH_DETAILS = {
  main_agent: {
    eyebrow: 'Zoom-In · 1 of 5',
    title: 'Main Agent (Orchestrator)',
    roles: [
      'Single entry point for the team.',
      'Receives the request.',
      'Checks project scope and permissions.',
      'Coordinates the specialized agents.',
    ],
    elements: [
      { name: 'Intent & Deliverable Router', desc: 'Identifies the requested deliverable and selects the matching Skill.' },
      { name: 'Project Scope & Permission Guard', desc: 'Limits retrieval strictly to authorized project documents.' },
      { name: 'Workflow Coordinator', desc: 'Ensures drafting, comparison, and quality checks run in order.' },
    ],
  },
  specialized_agents: {
    eyebrow: 'Zoom-In · 2 of 5',
    title: 'Specialized Agents',
    roles: [
      'Three focused agents with clear, bounded responsibilities.',
      'Separates drafting from knowledge checks and quality review.',
      'Avoids giant unmaintainable prompts or uncontrolled agent swarms.',
    ],
    elements: [
      { name: 'Deliverable Agent', desc: 'Structures and drafts content using the selected Skill contract.' },
      { name: 'Knowledge Steward', desc: 'Extracts candidate facts and compares them against approved decisions.' },
      { name: 'Quality Reviewer', desc: 'Checks citations, completeness, and flags unresolved conflicts.' },
    ],
  },
  skills: {
    eyebrow: 'Zoom-In · 3 of 5',
    title: 'Pluggable Skills',
    roles: [
      'Packages each deliverable type as a modular Skill.',
      'Plugs new deliverables directly into the shared engine.',
      'Enforces consistent structure across all consultants.',
    ],
    elements: [
      { name: 'Workshop Report Skill', desc: 'Captures meeting outcomes and open questions with source links.' },
      { name: 'Fit-Gap & Target Architecture Skills', desc: 'Assesses impact against approved rules and flags scope gaps.' },
      { name: 'Steering Committee Skill', desc: 'Summarizes validated progress and escalates open decisions.' },
    ],
  },
  knowledge_layers: {
    eyebrow: 'Zoom-In · 4 of 5',
    title: 'Project Knowledge (Layered Memory)',
    roles: [
      'Structured layered memory model for the engagement.',
      'Separates raw workshop inputs from approved project decisions.',
      'Links published deliverables to exact knowledge versions.',
    ],
    elements: [
      { name: 'Workshop & Client Evidence', desc: 'Immutable raw notes and client docs ("what was said").' },
      { name: 'Validated Project Knowledge', desc: 'Versioned, human-approved rules ("what was decided").' },
      { name: 'Deliverable Versions', desc: 'Drafts and locked publications linked to exact knowledge versions.' },
    ],
  },
  model_gateway: {
    eyebrow: 'Zoom-In · 5 of 5',
    title: 'Model Gateway',
    roles: [
      'Single provider-agnostic interface to enterprise LLMs.',
      'Enforces data sensitivity and residency rules.',
      'Validates structured outputs across AI vendors.',
    ],
    elements: [
      { name: 'Data Sensitivity Router', desc: 'Routes requests only to models approved for the project’s confidentiality.' },
      { name: 'Structured Output Enforcer', desc: 'Ensures every AI response matches the required deliverable structure.' },
      { name: 'Multi-Provider Connectors', desc: 'Supports Mistral, Gemini, OpenAI, or self-hosted enterprise models.' },
    ],
  },
};

function openArchitectureZoom(key) {
  const detail = ARCH_DETAILS[key];
  if (!detail) return;
  const dialog = $('arch-dialog');
  dialog.className = 'engine-dialog';
  $('arch-eyebrow').textContent = detail.eyebrow.toUpperCase();
  $('arch-title').textContent = detail.title;
  $('arch-content').innerHTML = `
    <div class="slide3-zoom-grid">
      <div>
        <div class="slide3-col-label">Role in Architecture</div>
        <ul class="slide3-role-list">
          ${detail.roles.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}
        </ul>
      </div>
      <div>
        <div class="slide3-col-label">Key Elements Inside</div>
        <div class="slide3-subcard-stack">
          ${detail.elements
            .map(
              (el) => `<div class="slide3-subcard">
                <strong>${escapeHtml(el.name)}</strong>
                <span>${escapeHtml(el.desc)}</span>
              </div>`
            )
            .join('')}
        </div>
      </div>
    </div>`;
  dialog.showModal();
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

function runPresetSkill(skill) {
  if (state.busy) return;
  const promptText = currentPresets()[skill] || `Run ${skillNames[skill] || skill}`;
  if ($('agent-prompt-input')) {
    $('agent-prompt-input').value = '';
    syncRoutePill();
  }
  generate(skill, promptText);
}

function bindCitationAndDraftLinks() {
  document.querySelectorAll('[data-evidence]').forEach((el) => {
    el.onclick = () => inspectEvidence(el.dataset.evidence, el.dataset.chunk);
  });
  document.querySelectorAll('[data-publication]').forEach((el) => {
    el.onclick = () => inspectPublication(el.dataset.publication);
  });
}

function bindDynamic() {
  bindCitationAndDraftLinks();
  document.querySelectorAll('[data-generate-report]').forEach((el) => {
    el.onclick = () => runPresetSkill('workshop_report');
  });
  document.querySelectorAll('[data-quick-skill]').forEach((el) => {
    el.onclick = () => runPresetSkill(el.dataset.quickSkill);
  });

  const bind = (id, fn) => {
    if ($(id)) $(id).onclick = fn;
  };

  bind('guided-flag-conflict', () =>
    action('/api/guided/flag-conflict', 'Report approved & EUR 50k conflict flagged! Dependent teams alerted.', { draft_id: state.draft?.id }, { targetTab: 'tasks' })
  );
  bind('guided-resolve', () =>
    action('/api/guided/resolve-conflict', 'WS-05 clarification applied! Approved rule updated to v2 (EUR 50,000 for FR01).', undefined, { clearDraft: true, targetTab: 'evidence' })
  );
  bind('guided-publish', () =>
    action('/api/guided/publish', 'Deliverable approved and locked as an immutable publication.', { draft_id: state.draft?.id }, { targetTab: 'publications' })
  );

  bind('flag-conflict', () => action('/api/conflict', 'Decision conflict recorded. Dependent review alerts created.', undefined, { targetTab: 'tasks' }));
  bind('flag-draft-conflict', () => action('/api/conflict', 'Decision conflict recorded. Baseline v1 remains unchanged.', undefined, { targetTab: 'tasks' }));
  bind('accept-clarification', () => action('/api/clarification/accept', 'WS-05 accepted. Now promote to update Project Knowledge.'));
  bind('promote', () => action('/api/promote?clarification=true', 'Decision promoted to Project Knowledge v2.', undefined, { clearDraft: true, targetTab: 'evidence' }));
  bind('approve-report', () => action(`/api/drafts/${state.draft?.id}/approve-report`, 'Report accuracy approved. Knowledge baseline unchanged.'));
  bind('approve-change', () => action(`/api/drafts/${state.draft?.id}/approve-change`, 'Knowledge change approved for this draft.'));
  bind('publish-draft', () => action('/api/publish', 'Locked publication created.', { draft_id: state.draft?.id }, { targetTab: 'publications' }));
}

// Static Event Listeners
$('role-select').addEventListener('change', async (e) => {
  state.role = e.target.value;
  toast(`Role switched to ${e.target.options[e.target.selectedIndex].text}.`);
  await refresh();
});

$('provider').addEventListener('change', (e) => {
  state.providerChosenByUser = true;
  const val = e.target.value;
  if (val.startsWith('live:')) {
    state.provider = 'live';
    state.liveBackend = val.split(':', 2)[1];
  } else {
    state.provider = 'mock';
    state.liveBackend = null;
  }
  syncProviderUI();
});

$('reset-demo').addEventListener('click', async () => {
  if (state.busy) return;
  state.busy = true;
  try {
    state.draft = null;
    state.messages = [];
    state.selectedSkill = null;
    state.workspace = await api('/api/reset', { method: 'POST' });
    switchTab('evidence');
    renderWorkspace();
    renderEmptyDraft();
    renderThread();
    toast('Demo reset to Stage 01 (WS-04 evidence ready).');
  } catch (error) {
    toast(error.message, true);
  } finally {
    state.busy = false;
    renderThread();
  }
});

if ($('clear-chat')) {
  $('clear-chat').addEventListener('click', () => {
    if (state.busy) return;
    state.messages = [];
    renderThread();
  });
}

if ($('toggle-arch')) {
  $('toggle-arch').addEventListener('click', () => {
    const pipeline = $('arch-pipeline');
    const wrap = $('arch-strip-wrap');
    const collapsed = pipeline.classList.toggle('collapsed');
    wrap.classList.toggle('strip-collapsed', collapsed);
    $('toggle-arch').setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    $('toggle-arch-label').textContent = collapsed ? 'Show 5 Blocks' : 'Collapse';
    $('toggle-arch-icon').textContent = collapsed ? '▾' : '▴';
  });
}

document.querySelectorAll('[data-arch]').forEach((el) => {
  el.addEventListener('click', () => openArchitectureZoom(el.dataset.arch));
});

document.querySelectorAll('[data-prompt-skill]').forEach((el) => {
  el.addEventListener('click', () => {
    if (state.busy) return;
    setSelectedSkill(el.dataset.promptSkill);
    $('agent-prompt-input')?.focus();
  });
});

document.querySelectorAll('[data-quick-question]').forEach((el) => {
  el.addEventListener('click', () => {
    if (state.busy) return;
    state.selectedSkill = null;
    syncSkillSelection();
    syncRoutePill();
    sendChat(el.dataset.quickQuestion);
  });
});

if ($('agent-prompt-input')) {
  $('agent-prompt-input').addEventListener('input', syncRoutePill);
}

if ($('agent-prompt-form')) {
  $('agent-prompt-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (state.busy) return;
    const input = $('agent-prompt-input');
    const text = (input?.value || '').trim();
    const skill = state.selectedSkill || matchSkillIntent(text);
    if (!skill && !text) {
      toast('Select a skill above or type a question for the Main Agent.', true);
      return;
    }
    if (input) input.value = '';
    if (skill) {
      generate(skill, text);
    } else {
      sendChat(text);
    }
  });
}

document.querySelectorAll('.stage-pill').forEach((el) => {
  el.addEventListener('click', () => {
    const hints = {
      '1': 'Stage 01: Click 01 · Workshop Report or ask Main Agent about WS-04.',
      '2': 'Stage 02: Review the cited draft below and spot the unpromoted EUR 50,000 proposal.',
      '3': 'Stage 03: Flag the EUR 50k vs 25k conflict — dependent teams are alerted automatically.',
      '4': 'Stage 04: Accept & promote WS-05 owner clarification to upgrade Project Knowledge to v2.',
      '5': 'Stage 05: Generate Fit-Gap or Steering outputs grounded in Knowledge v2 and lock publication.',
    };
    toast(hints[el.dataset.stage] || 'Follow the highlighted stage on the right.');
  });
});

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
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
