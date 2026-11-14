import html
import json
import os
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .gateway import GatewayError
from .knowledge import GovernanceError, KnowledgeStore
from .models import GenerateRequest, PublishRequest
from .orchestrator import Orchestrator

BASE = Path(__file__).resolve().parent.parent
ROOT = BASE.parent
app = FastAPI(title='Northstar · Governed Delivery Engine', version='1.0.0')
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
