import copy
import json
import sqlite3
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.gateway import GatewayError, MistralGateway
from app.knowledge import GovernanceError, KnowledgeStore
from app.main import app
from app.models import DraftPayload
from app.orchestrator import Orchestrator
from app.skills.registry import SKILLS, skill_manifest


@pytest.fixture
def engine():
    return Orchestrator(KnowledgeStore(':memory:'))


@pytest.fixture
def client():
    app.state.engine = Orchestrator(KnowledgeStore(':memory:'))
    return TestClient(app)


def generate(engine, skill='workshop_report', role='consultant'):
    return engine.generate(skill, role, 'mock')


def through_conflict(engine):
    report = generate(engine)
    engine.store.approve_report(report['id'], 'consultant')
    engine.store.flag_conflict('consultant')
    return report


def through_promotion(engine):
    through_conflict(engine)
    engine.store.accept_clarification('domain_lead')
    assert engine.store.state() == 'accepted_clarification'
    engine.store.promote_candidate('domain_lead', clarification=True)


@pytest.mark.parametrize('role', ['viewer', 'consultant', 'external_role'])
def test_acl_and_tenant_isolation_at_retrieval_and_generation(engine, role):
    active_role = 'viewer' if role == 'external_role' else role
    assert len(engine.store.retrieve('threshold', active_role)) == 3
    with pytest.raises(GovernanceError):
        engine.store.retrieve('threshold', role) if role == 'external_role' else engine.store.authorize_chunk('UNKNOWN', role)
    with pytest.raises(GovernanceError):
        engine.store.authorize_chunk('ws05-1', 'viewer')
    with pytest.raises(GovernanceError):
        engine.store.authorize_chunk('OTHER-PROJECT-1', 'consultant')
    report = generate(engine)
    with pytest.raises(GovernanceError):
        engine.store.publish(report['id'], 'viewer')
    engine.store.db.execute("UPDATE chunks SET roles='[]' WHERE id='ws04-1'")
    engine.store.db.commit()
    with pytest.raises(GovernanceError):
        engine.draft(report['id'], 'viewer')


def test_acl_and_api_reject_unauthorized_actions(client):
    assert client.get('/api/workspace', headers={'X-Demo-Role': 'root'}).status_code == 403
    assert client.get('/api/evidence/ws04', headers={'X-Demo-Role': 'viewer'}).status_code == 200
    post = client.post('/api/generate', json={'skill': 'workshop_report', 'provider': 'mock'}, headers={'X-Demo-Role': 'viewer'})
    assert post.status_code == 403
    assert 'not authorized' in post.json()['detail']


def test_citation_validity_exact_span_and_fingerprint(engine):
    draft = generate(engine)
    payload = DraftPayload.model_validate(draft['payload'])
    for section in payload.sections:
        for citation in section.citations:
            source = engine.store.authorize_chunk(citation.chunk_id, 'viewer')
            assert citation.text == source['excerpt']
            assert source['content'][citation.start:citation.end] == citation.text
    altered = copy.deepcopy(payload)
    altered.sections[0].citations[0].text = 'FABRICATED SOURCE TEXT'
    with pytest.raises(GovernanceError, match='altered citation'):
        engine.store.validate_payload(altered, 'viewer')
    missing = copy.deepcopy(payload)
    missing.sections[0].citations = []
    with pytest.raises(GovernanceError, match='no exact source'):
        engine.store.validate_payload(missing, 'viewer')
    engine.store.db.execute("UPDATE documents SET content='MUTATED DOCUMENT' WHERE id='ws04'")
    with pytest.raises(GovernanceError, match='fingerprint'):
        engine.store.authorize_chunk('ws04-1', 'viewer')


def test_golden_claim_support_scenarios(engine):
    through_conflict(engine)
    payloads = [generate(engine, 'fit_gap'), generate(engine, 'steering_deck')]
    for draft in payloads:
        for section in draft['payload']['sections']:
            assert '25,000' not in section['content'] or any(citation['chunk_id'] == 'ws01-1' for citation in section['citations']) or section['status'] == 'Unknown'
            assert '50,000' not in section['content'] or section['status'] == 'Unknown' or any(citation['chunk_id'] in ['ws04-1', 'ws05-1'] for citation in section['citations'])
            if draft['skill'] == 'fit_gap' and section['title'] == 'Fit assessment':
                assert 'FR01' in section['content']
                assert 'unclear scope' in section['content']
                assert 'no supersession' in section['content']
            if draft['skill'] == 'steering_deck' and section['title'] == 'Scope and control':
                assert 'does not establish its company-code scope or supersede' in section['content']
    assert 'scope_clear' not in payloads[0]['payload']
    invalid = DraftPayload.model_validate(payloads[0]['payload'])
    invalid.sections[1].status = 'Validated'
    invalid.sections[1].canonical_ids = []
    with pytest.raises(GovernanceError, match='canonical provenance'):
        engine.store.validate_payload(invalid, 'viewer')


def test_report_approval_does_not_promote_or_publish_fact(engine):
    report = generate(engine)
    assert engine.store.change_approved(report['id']) is False
    with pytest.raises(GovernanceError, match='approval'):
        engine.store.publish(report['id'], 'domain_lead')
    assert engine.store.candidate()['status'] == 'Proposed'
    engine.store.approve_report(report['id'], 'consultant')
    assert engine.store.candidate()['status'] == 'Proposed'
    assert engine.store.current_canonical()['amount'] == 25000
    with pytest.raises(GovernanceError, match='conflicted|Conflicted|unknown'):
        engine.store.approve_change(report['id'], 'domain_lead')
    with pytest.raises(GovernanceError, match='approve|Conflicted|unknown'):
        engine.store.publish(report['id'], 'domain_lead')
    with pytest.raises(GovernanceError):
        engine.store.promote_candidate('domain_lead', clarification=True)


def test_c_and_state_transition_safeguards_and_dependencies(engine):
    through_conflict(engine)
    assert engine.store.candidate()['status'] == 'Conflicted'
    assert engine.store.current_canonical()['record_id'] == 'DEC-P2P-004-v1'
    assert len(engine.store.db.execute('SELECT * FROM review_tasks').fetchall()) == 2
    with pytest.raises(GovernanceError):
        engine.store.promote_candidate('domain_lead')
    fit_gap = generate(engine, 'fit_gap')
    with pytest.raises(GovernanceError):
        engine.store.publish(fit_gap['id'], 'domain_lead')
    steering = generate(engine, 'steering_deck')
    content = steering['payload']['sections'][1]
    assert content['status'] == 'Conflicted'
    assert 'does not establish its company-code scope or supersede' in content['content']
    with pytest.raises(GovernanceError):
        engine.store.accept_clarification('consultant')
    engine.store.accept_clarification('domain_lead')
    assert engine.store.current_canonical()['amount'] == 25000
    with pytest.raises(GovernanceError, match='separate decision'):
        generate(engine, 'fit_gap')
    with pytest.raises(GovernanceError):
        engine.store.accept_clarification('domain_lead')
    engine.store.promote_candidate('domain_lead', True)
    assert engine.store.current_canonical()['record_id'] == 'DEC-P2P-004-v2'
    assert engine.store.current_canonical()['supersedes_id'] == 'DEC-P2P-004-v1'
    with pytest.raises(GovernanceError):
        engine.store.promote_candidate('domain_lead', True)


def test_resolved_skills_and_publication_reproducibility(engine):
    baseline = engine.store.publication('PUB-WS01-V1')
    through_promotion(engine)
    assert len(engine.store.canonical_history()) == 2
    publications = []
    for skill in ['workshop_report', 'fit_gap', 'steering_deck']:
        draft = generate(engine, skill, 'domain_lead')
        if skill == 'workshop_report':
            engine.store.approve_report(draft['id'], 'domain_lead')
        engine.store.approve_change(draft['id'], 'domain_lead')
        publication = engine.store.publish(draft['id'], 'domain_lead')
        provenance = json.loads(publication['provenance'])
        assert provenance['canonical_record_id'] == 'DEC-P2P-004-v2'
        assert provenance['prompt'] == 'governed-golden-v1'
        assert provenance['skill'] == f'{skill}@1.0.0'
        assert provenance['snapshot_hash']
        publications.append(publication)
        with pytest.raises(sqlite3.IntegrityError):
            with engine.store.db:
                engine.store.db.execute("UPDATE publications SET approved_by='tamper' WHERE id=?", (publication['id'],))
        with pytest.raises(sqlite3.IntegrityError):
            with engine.store.db:
                engine.store.db.execute("UPDATE events SET event='tamper' WHERE id=1")
        with pytest.raises(GovernanceError):
            engine.store.publish(draft['id'], 'domain_lead')
    old = engine.store.publication(baseline['id'])
    assert old['provenance'] == baseline['provenance']
    assert '25,000' in old['payload']
    assert old['approved_by'] == 'Domain lead'
    with pytest.raises(GovernanceError, match='fingerp'):
        engine.store.db.execute("UPDATE documents SET content='MUTATED BY TEST' WHERE id='ws05'")
        engine.draft(publications[0]['draft_id'], 'viewer')


def test_skill_discovery_and_shared_engine(engine):
    assert set(SKILLS) == {'workshop_report', 'fit_gap', 'steering_deck'}
    for skill in SKILLS:
        assert skill_manifest(skill)['name'] == skill
        assert skill_manifest(skill)['version'] == '1.0.0'
    through_promotion(engine)
    original = engine.deliverable_agent.generate
    outputs = []
    for skill in SKILLS:
        outputs.append(generate(engine, skill))
        assert engine.deliverable_agent.generate == original
    assert {output['skill'] for output in outputs} == set(SKILLS)
    assert len(list(engine.store.db.execute('SELECT * FROM drafts WHERE is_seed=0'))) == 4


def test_mock_contract_failures_are_visible_instead_of_live_fallback(monkeypatch):
    monkeypatch.delenv('MISTRAL_API_KEY', raising=False)
    gateway = MistralGateway()
    with pytest.raises(GatewayError, match='Internal Demo'):
        gateway.generate_structured({}, data_class='Restricted', provider='live')
    with pytest.raises(GatewayError, match='requires MISTRAL_API_KEY'):
        gateway.generate_structured({'citations': []}, provider='live', skill='workshop_report', phase='initial')
    with pytest.raises(GatewayError, match='No deterministic fixture'):
        gateway.generate_structured({}, provider='mock', skill='unknown', phase='nonexistent')
    with pytest.raises(GatewayError, match='Unsupported provider'):
        gateway.generate_structured({'citations': []}, provider='openai', skill='workshop_report', phase='initial')


def test_live_gateway_uses_mockable_transport_without_external_call(monkeypatch):
    monkeypatch.setenv('MISTRAL_API_KEY', 'test-only-not-a-real-key')
    fixture = json.loads((Path(__file__).parents[1] / 'data/demo_fixtures/governed-golden-v1.json').read_text())
    content = fixture['responses']['workshop_report.initial']
    requests = []

    def handler(request):
        requests.append(json.loads(request.content))
        return httpx.Response(200, json={'choices': [{'message': {'content': json.dumps(content)}}], 'usage': {'prompt_tokens': 100, 'completion_tokens': 50}})

    gateway = MistralGateway(transport=httpx.MockTransport(handler))
    result = gateway.generate_structured({'citations': [{'chunk_id': 'ws04-1', 'text': 'Synthetic test source'}]}, provider='live', skill='workshop_report', phase='initial')
    assert result.provider == 'Mistral'
    assert result.mode == 'Live'
    assert result.output_tokens == 50
    assert requests[0]['response_format']['type'] == 'json_schema'


def test_api_end_to_end(client):
    role = {'X-Demo-Role': 'consultant'}
    lead = {'X-Demo-Role': 'domain_lead'}
    report = client.post('/api/generate', json={'skill': 'workshop_report', 'provider': 'mock'}, headers=role)
    assert report.status_code == 200
    draft_id = report.json()['id']
    assert client.post(f'/api/drafts/{draft_id}/approve-report', headers=role).status_code == 200
    assert client.post('/api/conflict', headers=role).status_code == 200
    assert client.post('/api/promote?clarification=true', headers=lead).status_code == 403
    assert client.post('/api/clarification/accept', headers=lead).status_code == 200
    assert client.get('/api/workspace', headers=role).json()['baseline']['amount'] == 25000
    assert client.post('/api/promote?clarification=true', headers=lead).status_code == 200
    state = client.get('/api/workspace', headers=role).json()
    assert state['baseline']['amount'] == 50000
    assert len(state['canonical_history']) == 2
    for skill in ['workshop_report', 'fit_gap', 'steering_deck']:
        draft = client.post('/api/generate', json={'skill': skill, 'provider': 'mock'}, headers=role).json()
        if skill == 'workshop_report':
            assert client.post(f"/api/drafts/{draft['id']}/approve-report", headers=role).status_code == 200
        assert client.post(f"/api/drafts/{draft['id']}/approve-change", headers=lead).status_code == 200
        result = client.post('/api/publish', json={'draft_id': draft['id']}, headers=lead)
        assert result.status_code == 200
        assert client.get('/api/publications/' + result.json()['id'], headers=role).status_code == 200
    assert len(client.get('/api/workspace', headers=lead).json()['publications']) == 4
    assert client.get('/api/audit', headers=lead).status_code == 200


def test_guided_flow_and_reset(client):
    arch = client.get('/api/architecture')
    assert arch.status_code == 200
    arch_data = arch.json()
    for key in ['main_agent', 'specialized_agents', 'skills', 'knowledge_layers', 'model_gateway']:
        assert key in arch_data
    assert {s['name'] for s in arch_data['skills']} == {'workshop_report', 'fit_gap', 'steering_deck'}

    assert client.post('/api/guided/flag-conflict', headers={'X-Demo-Role': 'viewer'}).status_code == 403

    report = client.post('/api/generate', json={'skill': 'workshop_report', 'provider': 'mock'}, headers={'X-Demo-Role': 'domain_lead'})
    assert report.status_code == 200
    flagged = client.post('/api/guided/flag-conflict', json={'draft_id': report.json()['id']})
    assert flagged.status_code == 200
    assert flagged.json()['state'] == 'conflict'
    assert flagged.json()['baseline']['amount'] == 25000

    resolved = client.post('/api/guided/resolve-conflict')
    assert resolved.status_code == 200
    assert resolved.json()['state'] == 'clarified'
    assert resolved.json()['baseline']['amount'] == 50000

    fit_gap = client.post('/api/generate', json={'skill': 'fit_gap', 'provider': 'mock'}, headers={'X-Demo-Role': 'domain_lead'})
    assert fit_gap.status_code == 200
    pub = client.post('/api/guided/publish', json={'draft_id': fit_gap.json()['id']})
    assert pub.status_code == 200
    assert len(client.get('/api/workspace', headers={'X-Demo-Role': 'domain_lead'}).json()['publications']) == 2

    reset_res = client.post('/api/reset')
    assert reset_res.status_code == 200
    reset_data = reset_res.json()
    assert reset_data['state'] == 'evidence'
    assert reset_data['baseline']['amount'] == 25000
    assert len(reset_data['publications']) == 1


def test_conversational_chat_trace_and_multi_backend_live_gateway(client, monkeypatch):
    ws = client.get('/api/workspace', headers={'X-Demo-Role': 'domain_lead'}).json()
    assert 'llm' in ws and 'backends' in ws['llm']

    # Conversational chat in Stage 1 must not expose inactive WS-05 chunks.
    chat_res = client.post(
        '/api/chat',
        json={'message': 'What did WS-05 decide for FR01?', 'provider': 'mock'},
        headers={'X-Demo-Role': 'consultant'},
    )
    assert chat_res.status_code == 200
    chat_data = chat_res.json()
    assert chat_data['mode'] == 'chat'
    assert len(chat_data['trace']) >= 3
    assert all(not c['chunk_id'].startswith('ws05') for c in chat_data['citations'])

    # Generate returns real backend trace and concise assistant_message.
    gen_res = client.post(
        '/api/generate',
        json={'skill': 'workshop_report', 'provider': 'mock'},
        headers={'X-Demo-Role': 'consultant'},
    )
    assert gen_res.status_code == 200
    gen_data = gen_res.json()
    assert len(gen_data['trace']) == 4
    assert 'assistant_message' in gen_data and 'EUR 25,000' in gen_data['assistant_message']

    # Gemini and OpenAI live structured + chat paths work via MockTransport without external calls.
    monkeypatch.setenv('GEMINI_API_KEY', 'test-gemini-key')
    fixture = json.loads((Path(__file__).parents[1] / 'data/demo_fixtures/governed-golden-v1.json').read_text())
    draft_content = fixture['responses']['workshop_report.initial']
    seen_urls = []

    def handler(request):
        seen_urls.append(str(request.url))
        body = json.loads(request.content)
        assert body['response_format']['type'] == 'json_schema'
        if 'reply' in str(body['response_format']):
            payload = {'reply': 'Approved rule is EUR 25,000 for FR01.', 'cited_refs': ['ws01-1']}
        else:
            payload = draft_content
        return httpx.Response(
            200,
            json={'choices': [{'message': {'content': json.dumps(payload)}}], 'usage': {'prompt_tokens': 40, 'completion_tokens': 20}},
        )

    gw = MistralGateway(transport=httpx.MockTransport(handler))
    res_draft = gw.generate_structured(
        {'citations': [{'chunk_id': 'ws04-1', 'text': 'Test'}]},
        provider='live',
        skill='workshop_report',
        phase='initial',
        live_backend='gemini',
    )
    assert res_draft.provider == 'Gemini'
    res_chat = gw.chat(
        'What is approved?',
        [{'chunk_id': 'ws01-1', 'text': 'EUR 25,000 for FR01.'}],
        {'record_id': 'DEC-P2P-004-v1', 'amount': 25000, 'scope': 'FR01', 'statement': 'EUR 25k'},
        {'id': 'CAND-DEC004-V2', 'amount': 50000, 'scope': None, 'status': 'Proposed'},
        'evidence',
        'consultant',
        provider='live',
        live_backend='gemini',
    )
    assert res_chat.provider == 'Gemini'
    assert res_chat.content['cited_refs'] == ['ws01-1']
    assert all('generativelanguage.googleapis.com' in u for u in seen_urls)
