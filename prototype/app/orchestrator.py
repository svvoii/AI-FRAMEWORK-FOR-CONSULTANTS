import json

from .agents import DeliverableAgent
from .gateway import MistralGateway
from .knowledge import KnowledgeStore
from .models import DraftPayload


class Orchestrator:
    def __init__(self, store: KnowledgeStore):
        self.store = store
        self.gateway = MistralGateway()
        self.deliverable_agent = DeliverableAgent(store)


    def generate(self, skill, role, provider):
        self.store.require_role(role, 'consultant', 'domain_lead')
        phase = self.store.state()
        if skill == 'workshop_report' and phase not in ['evidence', 'clarified']:
            raise ValueError('The initial report is already reviewed. Use another skill without changing the core engine.')
        snapshot_id, _ = self.store.freeze_snapshot(role)
        draft_id = self.deliverable_agent.generate(skill, role, provider, self.gateway, snapshot_id, phase)
        return self.draft(draft_id, role)

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
            'phase_label': {'evidence': 'Evidence ready', 'report': 'Report reviewed', 'conflict': 'Decision conflict', 'accepted_clarification': 'Candidate accepted · promotion pending', 'clarified': 'Decision clarified'}[state],
        }
