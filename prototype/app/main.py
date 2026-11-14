import html
import json
import os
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .gateway import GatewayError
from .knowledge import GovernanceError, KnowledgeStore
from .models import GenerateRequest, PublishRequest
from .orchestrator import Orchestrator
from .skills.registry import SKILLS, skill_manifest

BASE = Path(__file__).resolve().parent.parent
ROOT = BASE.parent
app = FastAPI(title='Deloitte · Reusable AI Framework for Consultants', version='1.0.0')
app.mount('/static', StaticFiles(directory=BASE / 'static'), name='static')


@app.get('/favicon.ico', include_in_schema=False)
def favicon():
    return JSONResponse({}, status_code=204)

app.mount('/diagrams', StaticFiles(directory=ROOT / 'diagrams'), name='diagrams')
app.mount('/presentation', StaticFiles(directory=ROOT / 'presentation', html=True), name='presentation')


@app.get('/', response_model=None)
def workspace():
    return FileResponse(BASE / 'static' / 'index.html')


def engine() -> Orchestrator:
    if not hasattr(app.state, 'engine'):
        app.state.engine = Orchestrator(KnowledgeStore())
    return app.state.engine


def check_role(role):
    engine().store.require_role(role, 'viewer', 'consultant', 'domain_lead')


@app.exception_handler(GovernanceError)
def governance_error(_request, exc):
    return JSONResponse(status_code=403, content={'detail': str(exc)})


@app.exception_handler(ValueError)
def workflow_error(_request, exc):
    return JSONResponse(status_code=409, content={'detail': str(exc)})


@app.exception_handler(GatewayError)
def gateway_error(_request, exc):
    return JSONResponse(status_code=502, content={'detail': str(exc)})


@app.get('/api/workspace')
def get_workspace(x_demo_role: str = Header(default='viewer')):
    return engine().workspace(x_demo_role)


@app.get('/api/evidence/{doc_id}')
def evidence(doc_id: str, x_demo_role: str = Header(default='viewer')):
    check_role(x_demo_role)
    if doc_id not in ['ws01', 'ws04', 'ws05']:
        raise HTTPException(status_code=404, detail='Unknown synthetic source.')
    doc = engine().store.document(doc_id)
    if not doc['active']:
        raise GovernanceError('This evidence is not yet active in the scenario.')
    rows = engine().store.db.execute('SELECT * FROM chunks WHERE document_id=? ORDER BY start', (doc_id,))
    parts = []
    cursor = 0
    for row in rows:
        source = engine().store.authorize_chunk(row['id'], x_demo_role)
        parts.append({'html': html.escape(doc['content'][cursor:source['start']]), 'chunk_id': None})
        parts.append({'html': html.escape(source['excerpt']), 'chunk_id': row['id']})
        cursor = source['start'] + source['length']
    parts.append({'html': html.escape(doc['content'][cursor:]), 'chunk_id': None})
    return {'id': doc_id, 'title': doc['title'], 'content': doc['content'], 'parts': parts, 'sha256': doc['sha256']}


@app.post('/api/generate')
def generate(body: GenerateRequest, x_demo_role: str = Header(default='viewer')):
    return engine().generate(body.skill, x_demo_role, body.provider)


@app.post('/api/drafts/{draft_id}/approve-report')
def approve_report(draft_id: str, x_demo_role: str = Header(default='viewer')):
    return {'state': engine().store.approve_report(draft_id, x_demo_role)}


@app.post('/api/drafts/{draft_id}/approve-change')
def approve_change(draft_id: str, x_demo_role: str = Header(default='viewer')):
    return {'state': engine().store.approve_change(draft_id, x_demo_role)}


@app.post('/api/conflict')
def flag_conflict(x_demo_role: str = Header(default='viewer')):
    return {'state': engine().store.flag_conflict(x_demo_role)}


@app.post('/api/clarification/accept')
def accept_clarification(x_demo_role: str = Header(default='viewer')):
    return {'state': engine().store.accept_clarification(x_demo_role)}


@app.post('/api/promote')
def promote(clarification: bool = False, x_demo_role: str = Header(default='viewer')):
    return {'state': engine().store.promote_candidate(x_demo_role, clarification)}


@app.post('/api/publish')
def publish(body: PublishRequest, x_demo_role: str = Header(default='viewer')):
    return engine().store.publish(body.draft_id, x_demo_role)


@app.get('/api/drafts/{draft_id}')
def draft(draft_id: str, x_demo_role: str = Header(default='viewer')):
    return engine().draft(draft_id, x_demo_role)


@app.get('/api/publications/{publication_id}')
def publication(publication_id: str, x_demo_role: str = Header(default='viewer')):
    check_role(x_demo_role)
    return engine().store.publication(publication_id)


@app.get('/api/audit')
def audit(x_demo_role: str = Header(default='viewer')):
    check_role(x_demo_role)
    return engine().store.list_audit()


@app.post('/api/reset')
def reset_demo():
    engine().store.reset()
    return engine().workspace('domain_lead')


@app.get('/api/architecture')
def architecture():
    registered_skills = [skill_manifest(name) for name in SKILLS]
    extension_example = {
        'name': 'target_architecture',
        'version': 'planned-extension',
        'purpose': 'Map approved decisions and gaps to target S/4HANA components without changing core engine code.',
        'sections': ['Architecture baseline', 'Impact of decision changes', 'Open design choices'],
        'mandatory_checks': ['validated_provenance', 'impact_traceability'],
        'implemented': False,
    }
    return {
        'main_agent': {
            'id': 'main_agent',
            'title': 'Main Agent (Orchestrator)',
            'subtitle': 'Single team entry point',
            'summary': 'Receives the consultant request, enforces project permissions, freezes an authorized snapshot of current documents and decisions, and routes work to the right skill.',
            'inputs': ['Consultant request + selected deliverable type', 'User role & project scope'],
            'outputs': ['Frozen context snapshot', 'Routed task to Deliverable Agent'],
            'guarantees': 'Agents can never browse outside the authorized project scope or silently skip review gates.',
            'code_ref': 'app/orchestrator.py :: Orchestrator',
        },
        'specialized_agents': [
            {
                'id': 'deliverable_agent',
                'title': 'Deliverable Agent (Shared)',
                'role': 'Assembles context and runs the selected Skill contract to produce a cited draft.',
                'detail': 'One shared agent runs all deliverables; we do not build a separate agent per document.',
                'code_ref': 'app/agents.py :: DeliverableAgent',
            },
            {
                'id': 'knowledge_steward',
                'title': 'Knowledge Steward',
                'role': 'Compares new workshop statements against approved Project Knowledge.',
                'detail': 'Detects conflicts (e.g. EUR 50,000 vs. EUR 25,000) and proposes updates without overwriting approved facts.',
                'code_ref': 'app/agents.py :: KnowledgeSteward',
            },
            {
                'id': 'quality_reviewer',
                'title': 'Quality Reviewer',
                'role': 'Verifies required sections, exact citation links, and publication blocks before human review.',
                'detail': 'Blocks final publication whenever a critical conflict or missing scope remains unresolved.',
                'code_ref': 'app/agents.py :: QualityReviewer',
            },
        ],
        'skills': registered_skills,
        'skill_extension': extension_example,
        'knowledge_layers': [
            {
                'layer': 'Layer 1',
                'title': 'Workshop Evidence',
                'subtitle': 'What was said',
                'detail': 'Original workshop notes and client documents with SHA-256 fingerprints and exact passage offsets. Never treated as final truth automatically.',
            },
            {
                'layer': 'Layer 2',
                'title': 'Project Knowledge Base',
                'subtitle': 'What is approved',
                'detail': 'Structured, versioned project decisions (e.g. DEC-P2P-004 v1 -> v2). Only human approval updates or supersedes an official rule.',
            },
            {
                'layer': 'Layer 3',
                'title': 'Deliverable Snapshots',
                'subtitle': 'What we publish',
                'detail': 'Drafts and locked published versions. Each publication freezes the exact evidence, knowledge version, skill, and model used.',
            },
        ],
        'model_gateway': {
            'id': 'model_gateway',
            'title': 'Provider-Agnostic Model Gateway',
            'subtitle': 'Schema-checked LLM calls & data routing',
            'summary': 'Separates agent logic from model vendors through a single JSON-schema contract, supporting offline Mock mode and live Mistral API calls with zero silent fallback.',
            'modes': ['Mock: deterministic fixtures for offline & repeatable demos', 'Live: Mistral API with strict JSON schema validation'],
            'governance': 'Every call checks data classification first and writes latency, provider, and snapshot ID to the append-only audit trail.',
            'code_ref': 'app/gateway.py :: MistralGateway',
        },
    }


@app.post('/api/guided/flag-conflict')
async def guided_flag_conflict(request: Request, x_demo_role: str = Header(default='domain_lead')):
    store = engine().store
    if x_demo_role == 'viewer':
        store.require_role(x_demo_role, 'consultant', 'domain_lead')
    draft_id = None
    raw = await request.body()
    if raw:
        try:
            data = json.loads(raw)
            if isinstance(data, dict):
                draft_id = data.get('draft_id')
        except json.JSONDecodeError:
            pass
    if store.state() == 'evidence':
        if not draft_id:
            row = store.db.execute(
                "SELECT id FROM drafts WHERE skill='workshop_report' AND phase='initial' AND is_seed=0 ORDER BY rowid DESC LIMIT 1"
            ).fetchone()
            if not row:
                raise GovernanceError('Generate the WS-04 workshop report first so its evidence can be reviewed.')
            draft_id = row['id']
        store.approve_report(draft_id, 'consultant')
    if store.state() == 'report':
        store.flag_conflict('consultant')
    return engine().workspace('domain_lead')


@app.post('/api/guided/resolve-conflict')
def guided_resolve_conflict(x_demo_role: str = Header(default='domain_lead')):
    store = engine().store
    if x_demo_role == 'viewer':
        store.require_role(x_demo_role, 'consultant', 'domain_lead')
    if store.state() == 'evidence':
        row = store.db.execute(
            "SELECT id FROM drafts WHERE skill='workshop_report' AND phase='initial' AND is_seed=0 ORDER BY rowid DESC LIMIT 1"
        ).fetchone()
        if not row:
            raise GovernanceError('Generate the WS-04 workshop report first before resolving the conflict.')
        store.approve_report(row['id'], 'consultant')
    if store.state() == 'report':
        store.flag_conflict('consultant')
    if store.state() == 'conflict':
        store.accept_clarification('domain_lead')
    if store.state() == 'accepted_clarification':
        store.promote_candidate('domain_lead', clarification=True)
    return engine().workspace('domain_lead')


@app.post('/api/guided/publish')
def guided_publish(body: PublishRequest, x_demo_role: str = Header(default='domain_lead')):
    store = engine().store
    if x_demo_role == 'viewer':
        store.require_role(x_demo_role, 'domain_lead')
    draft_row = store.draft(body.draft_id)
    if draft_row['skill'] == 'workshop_report' and not draft_row['report_approved']:
        store.approve_report(body.draft_id, 'domain_lead')
    return store.publish(body.draft_id, 'domain_lead')
