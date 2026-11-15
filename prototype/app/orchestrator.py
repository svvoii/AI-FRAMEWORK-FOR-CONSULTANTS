import json

from .agents import DeliverableAgent
from .gateway import MistralGateway
from .knowledge import EVIDENCE_SENTENCES, FILES, ROLES, GovernanceError, KnowledgeStore
from .models import DraftPayload


class Orchestrator:
    def __init__(self, store: KnowledgeStore):
        self.store = store
        self.gateway = MistralGateway()
        self.deliverable_agent = DeliverableAgent(store)

    def generate(self, skill, role, provider, live_backend=None):
        self.store.require_role(role, 'consultant', 'domain_lead')
        phase = self.store.state()
        if skill == 'workshop_report' and phase not in ['evidence', 'clarified']:
            raise ValueError('The initial report is already reviewed. Use another skill without changing the core engine.')
        snapshot_id, snapshot_ctx = self.store.freeze_snapshot(role)
        draft_id = self.deliverable_agent.generate(
            skill, role, provider, self.gateway, snapshot_id, phase, live_backend=live_backend
        )
        draft = self.draft(draft_id, role)
        tel = self.deliverable_agent.last_telemetry or {}
        draft['trace'] = self._build_generate_trace(draft, role, snapshot_ctx, tel)
        draft['assistant_message'] = self._build_generate_reply(draft, tel)
        return draft

    def _build_generate_trace(self, draft, role, snapshot_ctx, tel):
        refs = tel.get('refs', [])
        doc_ids = ', '.join(d['id'].upper() for d in snapshot_ctx.get('documents', [])) or 'WS-04'
        canon_id = snapshot_ctx.get('canonical_record_id', 'DEC-P2P-004-v1')
        in_tok = tel.get('input_tokens', 0)
        out_tok = tel.get('output_tokens', 0)
        tok_str = f' · {in_tok + out_tok} tok' if (in_tok or out_tok) else ''
        latency = tel.get('latency_ms', 0)
        steward = tel.get('steward', {})
        conflict_note = (
            f"Detected unpromoted EUR {steward.get('candidate_amount', 0):,} proposal vs approved EUR {steward.get('baseline_amount', 0):,}."
            if steward.get('conflict')
            else f"Verified against approved {canon_id} without unresolved delta."
        )
        return [
            {
                'actor': 'Main Agent',
                'detail': f'Authorized role "{role}" for P2P-DEMO and matched Skill "{draft["skill"]}".',
                'tag': 'ACL + Skill',
                'state': 'done',
            },
            {
                'actor': 'Knowledge DB',
                'detail': f'Froze snapshot {draft["snapshot_id"]} across [{doc_ids}] ({len(refs)} chunks) + baseline {canon_id}.',
                'tag': ', '.join(refs) or 'SQLite',
                'state': 'done',
            },
            {
                'actor': 'ModelGateway',
                'detail': f'{tel.get("provider", draft["provider"])} ({tel.get("model", "model")}) generated {tel.get("sections_count", 0)} cited sections.',
                'tag': f'{latency}ms{tok_str}',
                'state': 'done',
            },
            {
                'actor': 'Steward & QA',
                'detail': f'{conflict_note} Exact character spans & section rules verified.',
                'tag': 'Verified',
                'state': 'done',
            },
        ]

    def _build_generate_reply(self, draft, tel):
        title = draft['payload']['title']
        summary = draft['payload']['summary']
        ws_state = self.store.state()
        canon = self.store.current_canonical()
        amt = f"EUR {canon['amount']:,}"
        if draft['phase'] == 'resolved':
            return (
                f'Generated "{title}" grounded in Knowledge v{canon["version"]} ({amt} for {canon["scope"]}). '
                f'{summary} Review the citations below, then publish when ready.'
            )
        if draft['skill'] == 'workshop_report':
            return (
                f'Drafted "{title}" from WS-04. {summary} '
                f'Your approved {amt} ({canon["scope"]}) rule remains untouched — inspect the citations below, then flag the conflict in Decisions.'
            )
        if ws_state == 'conflict':
            return (
                f'Drafted "{title}" for review only. Final publication stays blocked because the EUR 50,000 proposal conflicts with approved {amt} ({canon["scope"]}).'
            )
        return f'Drafted "{title}". {summary}'

    def chat(self, question, role, provider='mock', live_backend=None):
        self.store.require_role(role, *ROLES)
        workflow_state = self.store.state()
        canon = self.store.current_canonical()
        cand = self.store.candidate()

        # Gather all active, role-authorized evidence chunks and FTS5 hits for real SQLite grounding.
        fts_hits = self.store.retrieve(question, role)
        citations = []
        active_docs = []
        for doc_id in FILES:
            doc = self.store.document(doc_id)
            if doc['active']:
                active_docs.append(doc_id.upper())
                for number in range(1, len(EVIDENCE_SENTENCES[doc_id]) + 1):
                    chunk_id = f'{doc_id}-{number}'
                    try:
                        citations.append(self.store.citation(chunk_id, role).model_dump())
                    except GovernanceError:
                        continue

        result = self.gateway.chat(
            question,
            citations,
            canon,
            cand,
            workflow_state,
            role,
            provider=provider,
            live_backend=live_backend,
        )
        content = result.content
        cited_refs = list(dict.fromkeys(content.get('cited_refs', [])))
        resolved_citations = [self.store.citation(ref, role).model_dump() for ref in cited_refs]
        self.store.audit(
            'chat',
            f'{result.provider}/{result.model}; state={workflow_state}; cited={",".join(cited_refs) or "none"}; {result.latency_ms}ms.',
            role,
        )
        tok_total = result.input_tokens + result.output_tokens
        tok_str = f' · {tok_total} tok' if tok_total else ''
        trace = [
            {
                'actor': 'Main Agent',
                'detail': f'Authorized role "{role}" in project P2P-DEMO (stage: {workflow_state}).',
                'tag': 'ACL · OK',
                'state': 'done',
            },
            {
                'actor': 'Knowledge DB',
                'detail': f'Queried SQLite FTS5 ({len(fts_hits)} lexical match{"" if len(fts_hits) == 1 else "es"}) across active [{", ".join(active_docs)}] + {canon["record_id"]}.',
                'tag': f'{len(citations)} chunks',
                'state': 'done',
            },
            {
                'actor': 'ModelGateway',
                'detail': f'{result.provider} ({result.model}) synthesized concise grounded reply.',
                'tag': f'{result.latency_ms}ms{tok_str}',
                'state': 'done',
            },
            {
                'actor': 'Citation Guard',
                'detail': (
                    f'Verified {len(resolved_citations)} cited source span{"" if len(resolved_citations) == 1 else "s"} from active documents.'
                    if resolved_citations
                    else 'Responded strictly within authorized baseline & workflow boundaries.'
                ),
                'tag': 'Grounded',
                'state': 'done',
            },
        ]
        return {
            'mode': 'chat',
            'assistant_message': content.get('reply', ''),
            'citations': resolved_citations,
            'trace': trace,
            'provider': f'{result.provider} · {result.model}',
            'latency_ms': result.latency_ms,
        }

    def draft(self, draft_id, role):
        self.store.require_role(role, 'viewer', 'consultant', 'domain_lead')
        draft = self.store.draft(draft_id)
        payload = DraftPayload.model_validate_json(draft['payload'])
        self.store.validate_payload(payload, role)
        return {'id': draft_id, 'skill': draft['skill'], 'payload': payload.model_dump(mode='json'), 'provider': draft['provider'], 'report_approved': draft['report_approved'], 'change_approved': self.store.change_approved(draft_id), 'phase': draft['phase'], 'snapshot_id': draft['snapshot_id'], 'generated_at': draft['generated_at']}

    def workspace(self, role):
        self.store.require_role(role, 'viewer', 'consultant', 'domain_lead')
        state = self.store.state()
        documents = []
        for doc_id in ['ws01', 'ws04', 'ws05']:
            doc = self.store.document(doc_id)
            documents.append({'id': doc_id, 'title': doc['title'], 'active': doc['active'], 'sha256': doc['sha256']})
        candidate = self.store.candidate()
        tasks = [dict(row) for row in self.store.db.execute('SELECT * FROM review_tasks ORDER BY id')]
        return {
            'project': 'Project: S/4HANA Scoping · Procure-to-Pay', 'stream': 'Procure-to-Pay / P2P',
            'state': state, 'role': role, 'candidate_status': candidate['status'],
            'baseline': self.store.current_canonical(), 'candidate': candidate,
            'documents': documents, 'canonical_history': self.store.canonical_history(),
            'drafts': self.store.list_drafts(), 'publications': self.store.list_publications(),
            'tasks': tasks, 'audit': self.store.list_audit(),
            'llm': self.gateway.status(),
            'phase_label': {'evidence': 'Evidence ready', 'report': 'Report reviewed', 'conflict': 'Decision conflict', 'accepted_clarification': 'Candidate accepted · promotion pending', 'clarified': 'Decision clarified'}[state],
        }