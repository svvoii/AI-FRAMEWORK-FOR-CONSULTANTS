import json

from .gateway import GatewayError, MistralGateway
from .knowledge import GovernanceError, KnowledgeStore
from .models import DraftPayload
from .skills.registry import SKILLS, skill_manifest


class DeliverableAgent:
    """One deliverable implementation, composed with a versioned skill package."""

    def __init__(self, store: KnowledgeStore):
        self.store = store
        self.last_telemetry = None

    def generate(self, skill, role, provider, gateway: MistralGateway, snapshot_id, phase, live_backend=None):
        if skill not in SKILLS:
            raise GovernanceError('Unsupported skill. No deliverable contract improvised.')
        snapshot = self.store.db.execute('SELECT context FROM snapshots WHERE id=?', (snapshot_id,)).fetchone()
        if not snapshot or json.loads(snapshot['context']).get('state') != phase:
            raise GovernanceError('The request snapshot does not match the intended workflow state.')
        scenario = 'resolved' if self.store.candidate()['status'] == 'Promoted' else 'initial'
        if phase == 'accepted_clarification':
            scenario = 'accepted_clarification'
        if phase in ['accepted_clarification', 'clarified'] and scenario == 'accepted_clarification':
            raise GovernanceError('Candidate acceptance is recorded; promotion is a separate decision.')
        if phase in ['evidence', 'report'] and skill != 'workshop_report':
            raise GovernanceError('Perform evidence, candidate, and promotion reviews before dependent deliverables.')
        if phase == 'conflict' and skill not in ['fit_gap', 'steering_deck']:
            raise GovernanceError('The initial report is already reviewed; assess its impact instead.')
        if skill == 'steering_deck' and phase != 'conflict' and scenario != 'resolved':
            raise GovernanceError('A conflicted candidate is required for the escalation summary.')
        if skill == 'fit_gap' and phase not in ['report', 'conflict'] and scenario != 'resolved':
            raise GovernanceError('A reviewed candidate is required before fit-gap generation.')
        if phase == 'accepted_clarification' and skill != 'workshop_report':
            raise GovernanceError('Candidate acceptance is recorded; promotion is a separate decision.')
        refs = {
            'workshop_report': ['ws05-1', 'ws05-2'] if scenario == 'resolved' else (
                ['ws01-1', 'ws04-1', 'ws04-2'] if scenario == 'accepted_clarification' else ['ws04-1', 'ws04-2']),
            'fit_gap': ['ws05-1', 'ws05-2', 'ws01-2'] if scenario == 'resolved' else ['ws01-1', 'ws01-2', 'ws04-1', 'ws04-2'],
            'steering_deck': ['ws05-1', 'ws05-2'] if scenario == 'resolved' else ['ws01-1', 'ws04-1', 'ws04-2'],
        }[skill]
        citations = [self.store.citation(ref, role).model_dump() for ref in refs]
        canonical = self.store.current_canonical()
        candidate = self.store.candidate()
        prompt = {
            'citations': citations,
            'manifest': skill_manifest(skill),
            'phase': scenario,
            'snapshot_id': snapshot_id,
            'canonical': canonical,
            'candidate': candidate,
        }
        result = gateway.generate_structured(
            prompt, DraftPayload, provider=provider, skill=skill, phase=scenario, live_backend=live_backend
        )
        content = result.model_dump(mode='json')['content']
        if content.get('skill') != skill:
            raise GatewayError('Model returned the wrong skill contract.')
        for section in content.get('sections', []):
            for cite in section.get('citations', []):
                if cite.get('ref') not in refs:
                    raise GatewayError(f'Out-of-context model citation: {cite.get("ref")}')
                ref = cite.pop('ref')
                cite.update(self.store.citation(ref, role).model_dump())
        structured = DraftPayload.model_validate(content)
        self.store.validate_payload(structured, role)
        QualityReviewer.check(structured, skill)
        draft_id = self.store.save_draft(skill, structured, snapshot_id, f'{result.provider} · {result.model}', scenario, role)
        self.store.audit('model_call', f'{result.provider}/{result.model}; draft {draft_id}; snapshot {snapshot_id}; {result.latency_ms}ms.', role)
        self.last_telemetry = {
            'draft_id': draft_id,
            'skill': skill,
            'phase': scenario,
            'snapshot_id': snapshot_id,
            'refs': refs,
            'provider': result.provider,
            'model': result.model,
            'mode': result.mode,
            'latency_ms': result.latency_ms,
            'input_tokens': result.input_tokens,
            'output_tokens': result.output_tokens,
            'steward': KnowledgeSteward(self.store).compare_candidate(),
            'sections_count': len(structured.sections),
            'title': structured.title,
            'summary': structured.summary,
        }
        return draft_id


class KnowledgeSteward:
    def __init__(self, store):
        self.store = store

    def compare_candidate(self):
        candidate, baseline = self.store.candidate(), self.store.current_canonical()
        return {
            'conflict': candidate['amount'] != baseline['amount'] or candidate['scope'] is None,
            'same_scope': candidate['scope'] == baseline['scope'],
            'baseline_amount': baseline['amount'], 'candidate_amount': candidate['amount'],
            'scope_clear': candidate['scope'] is not None,
        }


class QualityReviewer:
    @staticmethod
    def check(payload: DraftPayload, skill):
        if skill == 'workshop_report' and any(section.title in ['Confirmed scope', 'Supersession'] for section in payload.sections):
            required = 'Confirmed scope'
        else:
            required = {'workshop_report': 'Candidate decision', 'fit_gap': 'Fit assessment', 'steering_deck': 'Scope and control'}[skill]
        if not any(section.title == required for section in payload.sections):
            raise GovernanceError(f'Mandatory skill section missing: {required}')
        if any(not section.content.strip() for section in payload.sections):
            raise GovernanceError('Every required claim must contain reviewable prose.')
        return True
