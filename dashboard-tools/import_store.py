"""Local, transactional evidence store. No original names or clinical notes in facts."""
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
from decimal import Decimal
import sqlite3,json,hashlib,gzip,os
ROOT=Path(__file__).resolve().parent.parent
DB=ROOT/'.local-state/ordination.sqlite3'
RULE_FILES=['practice-context.json','pflegeheim-finance-context.json','bank-assignments.json','bank-rules.json','bank_assignments.py']
def now():return datetime.now(ZoneInfo('Europe/Vienna')).isoformat(timespec='seconds')
def encoded(value):return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
def connect(path=DB):
 path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
 db=sqlite3.connect(path);db.execute('PRAGMA foreign_keys=ON');db.execute('PRAGMA busy_timeout=5000')
 db.executescript('''
 CREATE TABLE IF NOT EXISTS runs(id INTEGER PRIMARY KEY, created_at TEXT NOT NULL, reason TEXT NOT NULL, snapshot_version TEXT NOT NULL, cutoff TEXT, snapshot BLOB NOT NULL);
 CREATE TABLE IF NOT EXISTS sources(sha256 TEXT PRIMARY KEY, first_seen TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS source_versions(run_id INTEGER REFERENCES runs, sha256 TEXT REFERENCES sources, file TEXT NOT NULL, kind TEXT, period TEXT, selection TEXT, metadata TEXT NOT NULL, PRIMARY KEY(run_id,sha256));
 CREATE TABLE IF NOT EXISTS datasets(hash TEXT PRIMARY KEY, query_id TEXT NOT NULL, source_json TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS facts(dataset_hash TEXT REFERENCES datasets, ordinal INTEGER, year INTEGER, quarter INTEGER, date TEXT, patient_ref TEXT, amount_cents INTEGER, status TEXT, payload TEXT NOT NULL, PRIMARY KEY(dataset_hash,ordinal));
 CREATE INDEX IF NOT EXISTS facts_period ON facts(dataset_hash,year,quarter,date);
 CREATE TABLE IF NOT EXISTS run_datasets(run_id INTEGER REFERENCES runs, query_id TEXT, dataset_hash TEXT REFERENCES datasets, PRIMARY KEY(run_id,query_id));
 CREATE TABLE IF NOT EXISTS rules(run_id INTEGER REFERENCES runs, name TEXT, sha256 TEXT, payload TEXT, PRIMARY KEY(run_id,name));
 ''')
 if db.execute('PRAGMA user_version').fetchone()[0]==0:db.execute('PRAGMA user_version=1')
 os.chmod(path,0o600);return db

def save_snapshot(snapshot,reason='import',path=DB,rule_root=ROOT):
 """One atomic run contains immutable sources, facts, definitions and rule versions."""
 db=connect(path)
 try:
  with db:
   cur=db.execute('INSERT INTO runs(created_at,reason,snapshot_version,cutoff,snapshot) VALUES(?,?,?,?,?)',(now(),reason,snapshot['generatedAt'],snapshot.get('observationCutoff'),gzip.compress(encoded(snapshot))))
   run=cur.lastrowid
   for source in snapshot['queries']['file_inventory']['rows']:
    digest=source['sha256'];db.execute('INSERT OR IGNORE INTO sources VALUES(?,?)',(digest,now()))
    db.execute('INSERT INTO source_versions VALUES(?,?,?,?,?,?,?)',(run,digest,source['file'],source['kind'],source.get('period'),source.get('selection'),encoded(source).decode()))
   for qid,q in snapshot['queries'].items():
    # A new read timestamp is a run property, not a new set of clinical facts.
    definition={k:v for k,v in q['source'].items() if k!='executedAt'}
    digest=hashlib.sha256(encoded({**q,'source':definition})).hexdigest()
    if not db.execute('SELECT 1 FROM datasets WHERE hash=?',(digest,)).fetchone():
     db.execute('INSERT INTO datasets VALUES(?,?,?)',(digest,qid,encoded(definition).decode()))
     def entries():
      for i,row in enumerate(q['rows']):
       value=row.get('amount');cents=int((Decimal(str(value))*100).quantize(Decimal('1'))) if isinstance(value,(int,float)) else None
       yield (digest,i,row.get('year'),row.get('quarter'),row.get('date'),row.get('patientRef'),cents,row.get('status'),encoded(row).decode())
     db.executemany('INSERT INTO facts VALUES(?,?,?,?,?,?,?,?,?)',entries())
    db.execute('INSERT INTO run_datasets VALUES(?,?,?)',(run,qid,digest))
   # Store rules and definitions separately from source facts; no patient salt in this table.
   for name in RULE_FILES+['bank_data.py','practice_scope.py','prepare_data.py','patient_service_data.py']:
    p=rule_root/'dashboard-tools'/name
    if p.exists():
     content=p.read_bytes();db.execute('INSERT INTO rules VALUES(?,?,?,?)',(run,name,hashlib.sha256(content).hexdigest(),content.decode()))
   db.execute('INSERT INTO rules VALUES(?,?,?,?)',(run,'userContext',hashlib.sha256(encoded(snapshot.get('userContext',{}))).hexdigest(),encoded(snapshot.get('userContext',{})).decode()))
  return run
 finally:db.close()

def latest_snapshot(path=DB):
 db=connect(path)
 try:
  row=db.execute('SELECT snapshot FROM runs ORDER BY id DESC LIMIT 1').fetchone()
  return json.loads(gzip.decompress(row[0])) if row else None
 finally:db.close()

def history(path=DB):
 db=connect(path)
 try:
  runs=[dict(zip(['id','createdAt','reason','snapshotVersion','cutoff'],r)) for r in db.execute('SELECT id,created_at,reason,snapshot_version,cutoff FROM runs ORDER BY id DESC LIMIT 20')]
  latest=runs[0]['id'] if runs else 0
  count=db.execute('SELECT count(*) FROM sources').fetchone()[0]
  return {'runs':runs,'sources':count,'activeSources':db.execute("SELECT count(*) FROM source_versions WHERE run_id=? AND selection='Aktiv'",(latest,)).fetchone()[0],'database':'Lokale Datenbank auf diesem Mac','schemaVersion':1}
 finally:db.close()

def backup_database():
 """SQLite online backup yields a consistent single file, including committed history."""
 import tempfile
 fd,name=tempfile.mkstemp(prefix='ordi-database-',suffix='.sqlite3');os.close(fd)
 try:
  source=connect();target=sqlite3.connect(name)
  try:source.backup(target)
  finally:target.close();source.close()
  return Path(name).read_bytes()
 finally:Path(name).unlink(missing_ok=True)
