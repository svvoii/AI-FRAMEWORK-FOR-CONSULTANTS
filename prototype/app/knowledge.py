import hashlib
import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

from .models import Citation, DraftPayload

ROLES = ['viewer', 'consultant', 'domain_lead']
EVIDENCE_SENTENCES = {
    'ws01': [
        'DECISION. The purchase order approval threshold is EUR 25,000. Above this amount, the procurement director approves the purchase order. The rule applies to company code FR01.',
        'CONTEXT. The initial process scope uses standard purchase order approval management. No exception for urgent purchase orders was agreed.',
    ],
    'ws04': [
        'DISCUSSION. The purchase order approval threshold is EUR 50,000. Above this amount, the procurement director approves the purchase order.',
        'OPEN QUESTION. The workshop did not establish whether this amount replaces the earlier threshold or applies to a different company code. The company-code scope remains unclear.',
        'ACTION. The consultant will request a written confirmation from the process owner. No supersession of the earlier decision was approved in this workshop.',
    ],
    'ws05': [
        'DECISION. For company code FR01, the approved purchase order approval threshold changes from EUR 25,000 to EUR 50,000, effective 2026-11-05. Above EUR 50,000, the procurement director approves the purchase order. No exception for urgent purchase orders applies.',
        'SUPERSESSION. This confirmed rule replaces the earlier EUR 25,000 decision only for company code FR01. The earlier decision remains available in the approval history.',
    ],
}
FILES = {
    'ws01': ('WS-01 · Baseline', 'ws01_notes_approved.md'),
    'ws04': ('WS-04 · Follow-up', 'ws04_notes_raw.md'),
    'ws05': ('WS-05 · Owner clarification', 'ws05_clarification.md'),
}


class GovernanceError(ValueError):
    pass


class KnowledgeStore:
    def __init__(self, path=None):
        base = Path(__file__).resolve().parent.parent
        self.db_path = str(path or os.environ.get('NORTHSTAR_DB') or base / 'data' / 'prototype.db')
        self.data_dir = base / 'data'
        self.db = sqlite3.connect(self.db_path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.execute('PRAGMA foreign_keys = ON')
        self._init_schema()
        if not any(row['name'] == 'change_approved' for row in self.db.execute('PRAGMA table_info(drafts)')):
            self.db.execute('ALTER TABLE drafts ADD COLUMN change_approved INTEGER DEFAULT 0')
            self.db.commit()
        self.seed()

    @staticmethod
    def now():
        return datetime.now(timezone.utc).isoformat()

    def _init_schema(self):
        self.db.executescript('''
        CREATE TABLE IF NOT EXISTS documents(
            id TEXT PRIMARY KEY, title TEXT, content TEXT, sha256 TEXT,
            project_id TEXT, roles TEXT, active INTEGER, created_at TEXT
        );
        CREATE TABLE IF NOT EXISTS chunks(
            id TEXT PRIMARY KEY, document_id TEXT, start INTEGER, length INTEGER,
            excerpt TEXT, roles TEXT, document_hash TEXT,
            FOREIGN KEY(document_id) REFERENCES documents(id)
        );
        CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(id UNINDEXED, excerpt);
        CREATE TABLE IF NOT EXISTS canonical(
            record_id TEXT PRIMARY KEY, stable_id TEXT, version INTEGER,
            statement TEXT, amount INTEGER, scope TEXT, effective_date TEXT,
            current INTEGER, approved_by TEXT, source_chunk TEXT,
            supersedes_id TEXT, roles TEXT, project_id TEXT
        );
        CREATE TABLE IF NOT EXISTS candidates(
            id TEXT PRIMARY KEY, source_chunk TEXT, amount INTEGER, scope TEXT,
            status TEXT, clarification TEXT, promoted_record TEXT,
            proposed_change TEXT, project_id TEXT, roles TEXT
        );
        CREATE TABLE IF NOT EXISTS snapshots(id TEXT PRIMARY KEY, context TEXT, created_at TEXT);
        CREATE TABLE IF NOT EXISTS drafts(
            id TEXT PRIMARY KEY, skill TEXT, payload TEXT, snapshot_id TEXT,
            provider TEXT, generated_at TEXT, report_approved INTEGER DEFAULT 0,
            phase TEXT, is_seed INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS publications(
            id TEXT PRIMARY KEY, draft_id TEXT UNIQUE, approved_by TEXT,
            approved_at TEXT, provenance TEXT, FOREIGN KEY(draft_id) REFERENCES drafts(id)
        );
        CREATE TABLE IF NOT EXISTS review_tasks(
            id INTEGER PRIMARY KEY AUTOINCREMENT, subject TEXT, status TEXT,
            created_at TEXT, project_id TEXT
        );
        CREATE TABLE IF NOT EXISTS events(
            id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT, event TEXT,
            actor TEXT, created_at TEXT, previous_hash TEXT, event_hash TEXT
        );
        CREATE TRIGGER IF NOT EXISTS publications_no_update BEFORE UPDATE ON publications
        BEGIN SELECT RAISE(ABORT, 'Published versions are immutable'); END;
        CREATE TRIGGER IF NOT EXISTS publications_no_delete BEFORE DELETE ON publications
        BEGIN SELECT RAISE(ABORT, 'Published versions are immutable'); END;
        CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events
        BEGIN SELECT RAISE(ABORT, 'Audit events are immutable'); END;
        CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events
        BEGIN SELECT RAISE(ABORT, 'Audit events are immutable'); END;
        ''')
        self.db.commit()

    def reset(self):
        with self.db:
            self.db.executescript('''
                DROP TRIGGER IF EXISTS publications_no_update;
                DROP TRIGGER IF EXISTS publications_no_delete;
                DROP TRIGGER IF EXISTS events_no_update;
                DROP TRIGGER IF EXISTS events_no_delete;
                DELETE FROM publications;
                DELETE FROM events;
                DELETE FROM review_tasks;
                DELETE FROM drafts;
                DELETE FROM snapshots;
                DELETE FROM candidates;
                DELETE FROM canonical;
                DELETE FROM chunks_fts;
                DELETE FROM chunks;
                DELETE FROM documents;
            ''')
        self._init_schema()
        self.seed()
        return self.state()

    def seed(self):
        if self.db.execute('SELECT COUNT(*) FROM documents').fetchone()[0]:
            return
        for doc_id, (title, filename) in FILES.items():
            text = (self.data_dir / filename).read_text()
            digest = hashlib.sha256(text.encode()).hexdigest()
            with self.db:
                self.db.execute('INSERT INTO documents VALUES (?,?,?,?,?,?,?,?)', (
                    doc_id, title, text, digest, 'P2P-DEMO', json.dumps(ROLES),
                    int(doc_id != 'ws05'), self.now()))
                for number, sentence in enumerate(EVIDENCE_SENTENCES[doc_id], 1):
                    chunk_id = f'{doc_id}-{number}'
                    start = text.index(sentence)
                    self.db.execute('INSERT INTO chunks VALUES (?,?,?,?,?,?,?)', (
                        chunk_id, doc_id, start, len(sentence), sentence,
                        json.dumps(ROLES), digest))
                    self.db.execute('INSERT INTO chunks_fts VALUES (?,?)', (chunk_id, sentence))
        seed = json.loads((self.data_dir / 'canonical_seed.json').read_text())
        with self.db:
            self.db.execute('INSERT INTO canonical VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', (
                seed['record_id'], seed['stable_id'], seed['version'], seed['statement'],
                seed['amount'], seed['scope'], seed['effective_date'], 1, 'Domain lead',
                'ws01-1', None, json.dumps(ROLES), 'P2P-DEMO'))
            self.db.execute('INSERT INTO candidates VALUES (?,?,?,?,?,?,?,?,?,?)', (
                'CAND-DEC004-V2', 'ws04-1', 50000, None, 'Proposed', None, None,
                'Replace EUR 25,000 with EUR 50,000; company-code scope not established.',
                'P2P-DEMO', json.dumps(ROLES)))
        self.seed_publication()
        self.audit('seed', 'Synthetic evidence and approved EUR 25,000 baseline loaded.')

    def seed_publication(self):
        cite = self.citation('ws01-1')
        payload = DraftPayload(
            skill='workshop_report', title='WS-01 · Approved workshop record',
            summary='Baseline decision validated by the P2P domain lead.',
            sections=[{'title': 'Decision', 'status': 'Validated',
                       'content': 'For company code FR01, purchase orders above EUR 25,000 require procurement director approval.',
                       'citations': [cite.model_dump()], 'canonical_ids': ['DEC-P2P-004']}],
        )
        with self.db:
            self.db.execute('INSERT INTO snapshots VALUES (?,?,?)', (
                'SNAPSHOT-WS01-V1', json.dumps({
                    'documents': [{'id': 'ws01', 'sha256': self.document('ws01')['sha256']}],
                    'canonical_record_id': 'DEC-P2P-004-v1', 'state': 'evidence'}), self.now()))
            self.db.execute('INSERT INTO drafts(id,skill,payload,snapshot_id,provider,generated_at,report_approved,phase,is_seed) VALUES (?,?,?,?,?,?,?,?,?)', (
                'DRAFT-WS01-V1', 'workshop_report', payload.model_dump_json(),
                'SNAPSHOT-WS01-V1', 'Governed seed', self.now(), 1, 'baseline', 1))
            self.db.execute('INSERT INTO publications VALUES (?,?,?,?,?)', (
                'PUB-WS01-V1', 'DRAFT-WS01-V1', 'Domain lead', self.now(), json.dumps({
                    'canonical_version': 'DEC-P2P-004-v1', 'source_version': 'ws01',
                    'mode': 'Seed approval', 'skill': 'workshop_report@1.0.0',
                    'prompt': 'governed-golden-v1', 'template': 'workshop_report-v1'})))

    def require_role(self, role, *allowed):
        if role not in ROLES:
            raise GovernanceError('Unknown project role. Use a registered demonstration role.')
        if role not in allowed:
            raise GovernanceError(f'Role {role} is not authorized here. Required: {", ".join(allowed)}.')

    def document(self, doc_id):
        row = self.db.execute('SELECT * FROM documents WHERE id=? AND project_id=?', (doc_id, 'P2P-DEMO')).fetchone()
        if not row:
            raise GovernanceError('Source is unavailable or outside the project scope.')
        return dict(row)

    def authorize_chunk(self, chunk_id, role):
        self.require_role(role, *ROLES)
        row = self.db.execute('''SELECT c.*, d.content, d.active, d.project_id
             FROM chunks c JOIN documents d ON d.id=c.document_id WHERE c.id=?''', (chunk_id,)).fetchone()
        if not row or row['project_id'] != 'P2P-DEMO' or not row['active'] or role not in json.loads(row['roles']):
            raise GovernanceError('Source is unavailable or outside the authorized project scope.')
        text = row['content'][row['start']:row['start'] + row['length']]
        if text != row['excerpt'] or hashlib.sha256(row['content'].encode()).hexdigest() != row['document_hash']:
            raise GovernanceError('Source text or document fingerprint no longer matches the immutable source.')
        return dict(row)

    def citation(self, chunk_id, role='domain_lead'):
        row = self.authorize_chunk(chunk_id, role)
        return Citation(chunk_id=chunk_id, start=row['start'], end=row['start'] + row['length'], text=row['excerpt'])

    def retrieve(self, query, role):
        self.require_role(role, *ROLES)
        terms = [word.replace('"', '') for word in query.split() if len(word) > 3]
        matcher = ' OR '.join(f'"{word}"' for word in terms)
        rows = self.db.execute('SELECT id FROM chunks_fts WHERE chunks_fts MATCH ?', (matcher or 'nothing',)).fetchall()
        result = []
        for row in rows:
            try:
                result.append(self.authorize_chunk(row['id'], role)['excerpt'])
            except GovernanceError:
                continue  # Filters apply after lookup and before any returned evidence.
        return result

    def candidate(self):
        return dict(self.db.execute("SELECT * FROM candidates WHERE id='CAND-DEC004-V2' AND project_id='P2P-DEMO'").fetchone())

    def current_canonical(self):
        return dict(self.db.execute("SELECT * FROM canonical WHERE stable_id='DEC-P2P-004' AND current=1 AND project_id='P2P-DEMO'").fetchone())

    def canonical_history(self):
        return [dict(row) for row in self.db.execute("SELECT * FROM canonical WHERE project_id='P2P-DEMO' ORDER BY version DESC")]

    def state(self):
        approved_report = self.db.execute("""SELECT 1 FROM drafts WHERE skill='workshop_report'
            AND phase='initial' AND is_seed=0 AND report_approved=1""").fetchone()
        if not approved_report:
            return 'evidence'
        if self.candidate()['status'] == 'Promoted':
            return 'clarified'
        if self.candidate()['status'] == 'Accepted':
            return 'accepted_clarification'
        if self.candidate()['status'] == 'Conflicted':
            return 'conflict'
        return 'report'

    def freeze_snapshot(self, role):
        self.require_role(role, 'consultant', 'domain_lead')
        docs = []
        for doc_id in FILES:
            doc = self.document(doc_id)
            if doc['active']:
                docs.append({'id': doc_id, 'sha256': doc['sha256']})
                for number in range(1, len(EVIDENCE_SENTENCES[doc_id]) + 1):
                    self.authorize_chunk(f'{doc_id}-{number}', role)
        context = {
            'documents': docs, 'canonical_record_id': self.current_canonical()['record_id'],
            'canonical_history': [row['record_id'] for row in self.canonical_history()],
            'candidate_id': self.candidate()['id'], 'candidate_status': self.candidate()['status'],
            'state': self.state(), 'role': role, 'project_id': 'P2P-DEMO',
        }
        snapshot_id = 'SNAP-' + uuid.uuid4().hex[:12].upper()
        with self.db:
            self.db.execute('INSERT INTO snapshots VALUES (?,?,?)', (snapshot_id, json.dumps(context, sort_keys=True), self.now()))
        return snapshot_id, context

    def draft(self, draft_id):
        row = self.db.execute('SELECT * FROM drafts WHERE id=?', (draft_id,)).fetchone()
        if not row:
            raise GovernanceError('Draft not found.')
        return dict(row)

    def list_drafts(self):
        return [dict(row) for row in self.db.execute('SELECT id,skill,payload,snapshot_id,generated_at,report_approved,change_approved,phase FROM drafts WHERE is_seed=0 ORDER BY rowid DESC')]

    def list_publications(self):
        return [dict(row) for row in self.db.execute('SELECT p.*,d.skill,d.payload FROM publications p JOIN drafts d ON d.id=p.draft_id ORDER BY p.rowid DESC')]

    def list_audit(self):
        return [dict(row) for row in self.db.execute('SELECT id,event_type,event,actor,created_at,event_hash FROM events ORDER BY id DESC LIMIT 50')]

    def audit(self, event_type, event, actor='System'):
        last = self.db.execute('SELECT event_hash FROM events ORDER BY id DESC LIMIT 1').fetchone()
        previous = last[0] if last else 'GENESIS'
        timestamp = self.now()
        digest = hashlib.sha256((previous + event_type + event + actor + timestamp).encode()).hexdigest()
        with self.db:
            self.db.execute('INSERT INTO events(event_type,event,actor,created_at,previous_hash,event_hash) VALUES (?,?,?,?,?,?)', (event_type, event, actor, timestamp, previous, digest))

    def save_draft(self, skill, payload, snapshot_id, provider, phase, actor):
        draft_id = 'DR-' + uuid.uuid4().hex[:12].upper()
        with self.db:
            self.db.execute('INSERT INTO drafts(id,skill,payload,snapshot_id,provider,generated_at,report_approved,phase,is_seed) VALUES (?,?,?,?,?,?,?,?,0)', (
                draft_id, skill, payload.model_dump_json(), snapshot_id,
                provider, self.now(), 0, phase))
        self.audit('draft', f'{skill}: {draft_id}; snapshot {snapshot_id}; {provider}.', actor)
        return draft_id

    def validate_payload(self, payload, role):
        for section in payload.sections:
            if not section.citations:
                raise GovernanceError(f'Claim has no exact source span: {section.title}')
            for cite in section.citations:
                source = self.authorize_chunk(cite.chunk_id, role)
                if (cite.start != source['start'] or cite.end != source['start'] + source['length']
                        or cite.text != source['excerpt']):
                    raise GovernanceError(f'Invalid or altered citation span: {cite.chunk_id}')
            if section.status == 'Validated':
                if not section.canonical_ids:
                    raise GovernanceError('Validated claims require approved canonical provenance.')
                for stable_id in section.canonical_ids:
                    if stable_id != 'DEC-P2P-004':
                        raise GovernanceError('Validated claim references an unknown canonical entity.')
                    matches = [record for record in self.canonical_history()
                               if any(record['source_chunk'] == cite.chunk_id for cite in section.citations)]
                    is_history = any(cite.chunk_id == 'ws05-2' for cite in section.citations)
                    if not matches:
                        if is_history and self.current_canonical()['supersedes_id'] and any(cite.chunk_id == 'ws05-1' for cite in section.citations):
                            matches = [self.current_canonical()]
                        else:
                            raise GovernanceError('Validated claim has no approved canonical provenance for its citation.')
                    approved = matches[0]
                    if is_history:
                        previous = next((record for record in self.canonical_history() if record['record_id'] == approved['supersedes_id']), None)
                        if f"{approved['amount']:,}" in section.content:
                            amount_match = True
                        else:
                            amount_match = bool(previous) and f"{previous['amount']:,}" in section.content and any(term in section.content for term in ['earlier', 'replaces', 'replaced', 'supersedes'])
                    else:
                        amount_match = f"{approved['amount']:,}" in section.content
                    if not amount_match or approved['scope'] not in section.content:
                        raise GovernanceError('Validated statement does not match approved amount and company-code scope.')
        return True

    def approve_report(self, draft_id, role):
        self.require_role(role, 'consultant', 'domain_lead')
        draft = self.draft(draft_id)
        if draft['skill'] != 'workshop_report' or draft['phase'] not in ['initial', 'resolved']:
            raise GovernanceError('This action applies only to the initial workshop report.')
        self.validate_payload(DraftPayload.model_validate_json(draft['payload']), role)
        with self.db:
            self.db.execute('UPDATE drafts SET report_approved=1 WHERE id=?', (draft_id,))
        self.audit('report_approval', f'{draft_id}: faithful report approved; no candidate facts promoted.', role)
        return self.state()

    def change_approved(self, draft_id):
        return self.db.execute("SELECT 1 FROM drafts WHERE id=? AND change_approved=1", (draft_id,)).fetchone() is not None

    def approve_change(self, draft_id, role):
        self.require_role(role, 'domain_lead')
        draft = self.draft(draft_id)
        payload = DraftPayload.model_validate_json(draft['payload'])
        if draft['skill'] == 'workshop_report' and not draft['report_approved']:
            raise GovernanceError('Review the faithful report before approving its proposed change.')
        if not any(section.status in ['Proposed', 'Validated'] for section in payload.sections):
            raise GovernanceError('Only a proposed or validated knowledge change can be approved for publication.')
        if any(section.status in ['Conflicted', 'Unknown'] for section in payload.sections):
            raise GovernanceError('A conflicted record cannot be approved as a resolved change. Regenerate after clarification and promotion.')
        if draft['phase'] in ['initial', 'accepted_clarification']:
            raise GovernanceError('A scoped clarification and knowledge promotion are required before resolved publication.')
        self.validate_payload(payload, role)
        with self.db:
            self.db.execute('UPDATE drafts SET change_approved=1 WHERE id=?', (draft_id,))
        self.audit('change_approval', f'{draft_id}: scoped knowledge change approved for publication; knowledge status unchanged.', role)
        return self.state()

    def flag_conflict(self, role):
        self.require_role(role, 'consultant', 'domain_lead')
        if self.state() != 'report':
            raise GovernanceError('An approved report and unflagged candidate are needed before conflict review.')
        candidate, baseline = self.candidate(), self.current_canonical()
        if candidate['scope'] is not None or candidate['amount'] == baseline['amount']:
            raise GovernanceError('The seeded candidate does not have the expected amount and scope uncertainty.')
        subjects = ['Target architecture snapshot · threshold impact review', 'Steering committee · approval-threshold conflict escalation']
        with self.db:
            self.db.execute("UPDATE candidates SET status='Conflicted' WHERE id=?", (candidate['id'],))
            for subject in subjects:
                self.db.execute('INSERT INTO review_tasks(subject,status,created_at,project_id) VALUES (?,?,?,?)', (subject, 'Open', self.now(), 'P2P-DEMO'))
        self.audit('conflict', 'EUR 50,000 reports unclear scope. DEC-P2P-004-v1 remains authoritative; v1 was not changed.', role)
        return self.state()

    def accept_clarification(self, role):
        self.require_role(role, 'domain_lead')
        if self.state() != 'conflict':
            raise GovernanceError('Clarification review requires an open conflicted candidate.')
        with self.db:
            self.db.execute("UPDATE documents SET active=1 WHERE id='ws05'")
            self.authorize_chunk('ws05-1', role)
            self.db.execute('''UPDATE candidates SET status='Accepted', scope='FR01',
                clarification='ws05-1', proposed_change='For FR01 only: replace EUR 25,000 with EUR 50,000 effective 2026-11-05; no urgent-order exception.'
                WHERE id='CAND-DEC004-V2' ''')
        self.audit('candidate_acceptance', 'WS-05 evidence introduced and scoped candidate accepted; it is not yet canonical.', role)
        return self.state()

    def promote_candidate(self, role, clarification=False):
        self.require_role(role, 'domain_lead')
        if not clarification:
            raise GovernanceError('Promotion requires new clarification evidence and separate candidate acceptance.')
        if self.candidate()['status'] != 'Accepted' or self.candidate()['clarification'] != 'ws05-1':
            raise GovernanceError('An independently accepted WS-05 clarification is required before promotion.')
        self.authorize_chunk('ws05-1', role)
        baseline = self.current_canonical()
        with self.db:
            self.db.execute('UPDATE canonical SET current=0 WHERE record_id=?', (baseline['record_id'],))
            statement = 'For company code FR01, purchase orders above EUR 50,000 require procurement director approval, effective 2026-11-05.'
            self.db.execute('INSERT INTO canonical VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', (
                'DEC-P2P-004-v2', 'DEC-P2P-004', 2, statement, 50000, 'FR01',
                '2026-11-05', 1, role, 'ws05-1', baseline['record_id'], json.dumps(ROLES), 'P2P-DEMO'))
            self.db.execute("UPDATE candidates SET status='Promoted', promoted_record='DEC-P2P-004-v2' WHERE id='CAND-DEC004-V2'")
            self.db.execute("UPDATE review_tasks SET status='Resolved by WS-05'")
        self.audit('knowledge_promotion', 'Accepted WS-05 candidate promoted: v2 supersedes v1 only for FR01.', role)
        return self.state()

    def publication(self, pub_id):
        row = self.db.execute('SELECT p.*,d.payload,d.skill FROM publications p JOIN drafts d ON d.id=p.draft_id WHERE p.id=?', (pub_id,)).fetchone()
        if not row:
            raise GovernanceError('Publication not found.')
        return dict(row)

    def publish(self, draft_id, role):
        self.require_role(role, 'domain_lead')
        draft = self.draft(draft_id)
        if draft['skill'] == 'workshop_report' and not draft['report_approved']:
            raise GovernanceError('Human faithful-report approval is required before publication.')
        if not self.change_approved(draft_id):
            self.approve_change(draft_id, role)
            draft = self.draft(draft_id)
        if self.db.execute('SELECT 1 FROM publications WHERE draft_id=?', (draft_id,)).fetchone():
            raise GovernanceError('This draft is already published; make a new reviewed draft.')
        payload = DraftPayload.model_validate_json(draft['payload'])
        if draft['skill'] == 'workshop_report' and not draft['report_approved']:
            raise GovernanceError('Human faithful-report approval is required before publication.')
        if any(section.status in ['Conflicted', 'Unknown'] for section in payload.sections):
            raise GovernanceError('Conflicted or unknown claims cannot enter an authoritative publication.')
        if draft['phase'] == 'accepted_clarification' and self.candidate()['status'] == 'Accepted' and draft['skill'] != 'workshop_report':
            raise GovernanceError('Acceptance of a candidate does not itself authorize a resolved deliverable.')
        self.validate_payload(payload, role)
        if draft['skill'] != 'workshop_report' and not any(section.status == 'Validated' and 'DEC-P2P-004' in section.canonical_ids for section in payload.sections):
            raise GovernanceError('Dependent deliverables need a validated canonical record reference.')
        snapshot = self.db.execute('SELECT context FROM snapshots WHERE id=?', (draft['snapshot_id'],)).fetchone()
        provenance = json.loads(snapshot['context'])
        provenance.update({
            'provider': draft['provider'], 'skill': draft['skill'] + '@1.0.0',
            'prompt': 'governed-golden-v1', 'template': draft['skill'] + '-v1',
            'snapshot_hash': hashlib.sha256(snapshot['context'].encode()).hexdigest(),
            'claims': payload.model_dump(mode='json')['sections'],
        })
        pub_id = 'PUB-' + uuid.uuid4().hex[:12].upper()
        with self.db:
            self.db.execute('INSERT INTO publications VALUES (?,?,?,?,?)', (pub_id, draft_id, role, self.now(), json.dumps(provenance)))
        self.audit('publication', f'{pub_id}: immutable {draft["skill"]} version approved; provenance preserved.', role)
        return self.publication(pub_id)
