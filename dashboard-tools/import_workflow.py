"""Two-step local import: immutable staging, source/period review, then explicit apply."""
from pathlib import Path
from datetime import datetime,timedelta
import base64,hashlib,json,secrets,shutil,os
from pypdf import PdfReader
import io
from prepare_data import build,pdf_paths,ROOT
from import_store import encoded,save_snapshot
PENDING=ROOT/'.local-state/imports'

def fingerprint():
 paths=pdf_paths()+list((ROOT/'dashboard-tools').glob('*.py'))+list((ROOT/'dashboard-tools').glob('*.json'))
 # Generated status is intentionally excluded; actual source, rules and importer code are bound.
 paths=[p for p in paths if p.name not in ['import-status.json','reviewed-snapshot.json','report-snapshot.json'] and 'verification' not in p.name]
 return hashlib.sha256(encoded([(str(p.relative_to(ROOT)),hashlib.sha256(p.read_bytes()).hexdigest()) for p in sorted(set(paths))])).hexdigest()

def metrics(snapshot):
 q=snapshot['queries'];out={}
 for r in q['ordination_periods']['rows']:
  period=f'{r["year"]} · '+(f'Q{r["quarter"]}' if r['quarter'] else 'Jahr')
  out[period+' · Leistungswert (€)']=r['amount'];out[period+' · Personen']=r['patients']
 for r in q.get('ordination_patient_service_summary',{}).get('rows',[]):out[f'{r["year"]} · Geplant (€)']=r['plannedValue']
 rows=q.get('bank_transactions',{}).get('rows',[])
 for year in sorted({r['year'] for r in rows}):
  for name,positive in [('Bankeingänge (€)',True),('Bankausgänge (€)',False)]:
   out[f'{year} · {name}']=sum(round(abs(r['amount'])*100) for r in rows if r['year']==year and (r['amount']>=0)==positive)/100
 return out

def preview(payload):
 if len(payload.get('files',[]))>50:raise ValueError('Maximal 50 Dateien pro Import.')
 old=json.loads((ROOT/'dashboard/src/data.json').read_text())
 if payload.get('snapshotVersion')!=old['generatedAt']:raise ValueError('Datenstand geändert. Bitte die Ansicht neu öffnen.')
 PENDING.mkdir(parents=True,exist_ok=True)
 for p in PENDING.iterdir():
  if p.is_dir() and datetime.fromtimestamp(p.stat().st_mtime)<datetime.now()-timedelta(days=1):shutil.rmtree(p)
 token=secrets.token_hex(24);folder=PENDING/token;folder.mkdir(mode=0o700)
 try:
  base=pdf_paths();known={hashlib.sha256(p.read_bytes()).hexdigest() for p in base};original_known={r['sha256'] for r in old['queries']['file_inventory']['rows']}
  staged=[];duplicates=[]
  for index,item in enumerate(payload.get('files',[])):
   name=Path(str(item.get('name',''))).name
   if not name.lower().endswith('.pdf'):raise ValueError('Bitte Original-PDFs auswählen. Neue CSV-/Excel-Formate müssen zuerst geprüft werden.')
   content=base64.b64decode(item.get('data',''),validate=True)
   if len(content)>20*1024*1024 or not content.startswith(b'%PDF-'):raise ValueError(f'{name}: gültige PDF mit maximal 20 MB erforderlich.')
   reader=PdfReader(io.BytesIO(content))
   if reader.is_encrypted:raise ValueError(f'{name}: passwortgeschützte PDF wird nicht unterstützt.')
   digest=hashlib.sha256(content).hexdigest()
   if digest in known:duplicates.append(name);continue
   known.add(digest);p=folder/f'{index+1:02d}-{name}';p.write_bytes(content);staged.append(p)
  before=fingerprint();candidate=build(paths=base+staged,persist=False)
  if fingerprint()!=before:raise ValueError('Quellen wurden während der Prüfung geändert. Bitte erneut prüfen.')
  documents=candidate['queries']['file_inventory']['rows'];new=[r for r in documents if r['sha256'] not in original_known]
  names={p.name for p in staged}|{Path(r['file']).name for r in new}
  # New invalid or unknown files block the entire batch; existing disclosed issues stay visible.
  blockers=[r for r in candidate.get('importIssues',[]) if Path(r['file']).name in names or any(Path(r['file']).name==p.name for p in base if hashlib.sha256(p.read_bytes()).hexdigest() not in original_known)]
  a=metrics(old);b=metrics(candidate)
  changes=[{'metric':k,'before':a.get(k),'after':b.get(k),'difference':round(b[k]-a[k],2) if k in a and k in b else None} for k in sorted(a.keys()|b.keys()) if a.get(k)!=b.get(k)]
  dataset_changes=[{'queryId':qid,'beforeRows':len(old['queries'].get(qid,{}).get('rows',[])),'afterRows':len(q['rows'])} for qid,q in candidate['queries'].items() if encoded(q['rows'])!=encoded(old['queries'].get(qid,{}).get('rows',[])) and qid!='file_inventory']
  files=[{'file':Path(r['file']).name,'kind':('Nicht erkannt' if r['kind']=='unknown' else r['kind']),'period':r.get('period','Nicht erkannt'),'action':('Nicht übernehmen – zuerst prüfen' if any(Path(issue['file']).name==Path(r['file']).name for issue in blockers) else 'Separat abstimmen; keine doppelte Addition' if r['kind']=='Bank-Umsatzübersicht' else 'Gültigen Berichtsstand verwenden' if r['selection']=='Aktiv' else 'Nur archivieren; keine Addition'),'selection':r['selection']} for r in new]
  files += [{'file':n,'kind':'Identische Datei','period':'Bereits vorhanden','action':'Überspringen; keine doppelte Zählung','selection':'Unverändert'} for n in duplicates]
  plan={'token':token,'createdAt':datetime.now().isoformat(),'fingerprint':before,'snapshotVersion':old['generatedAt'],'staged':[str(p.relative_to(ROOT)) for p in staged],'files':files,'changes':changes,'datasetChanges':dataset_changes,'issues':blockers,'canApply':not blockers,'duplicateCount':len(duplicates),'cutoff':candidate.get('observationCutoff')}
  plan['stagedHashes']={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in staged}
  (folder/'plan.json').write_bytes(encoded(plan));return public_plan(plan)
 except Exception:
  shutil.rmtree(folder,ignore_errors=True);raise

def public_plan(plan):return {k:v for k,v in plan.items() if k not in ['fingerprint','staged','stagedHashes','snapshotVersion']}
def load_plan(token):
 if not isinstance(token,str) or len(token)!=48 or any(c not in '0123456789abcdef' for c in token):raise ValueError('Ungültige Importprüfung.')
 p=PENDING/token/'plan.json'
 if not p.exists():raise ValueError('Diese Prüfung ist nicht mehr verfügbar. Bitte erneut prüfen.')
 plan=json.loads(p.read_text())
 if datetime.fromisoformat(plan['createdAt'])<datetime.now()-timedelta(days=1):raise ValueError('Die Prüfung ist abgelaufen. Bitte erneut prüfen.')
 return plan

def prepare_apply(token):
 plan=load_plan(token)
 if not plan['canApply']:raise ValueError('Unklare Dateien zuerst klären; der bisherige Datenstand bleibt erhalten.')
 old=json.loads((ROOT/'dashboard/src/data.json').read_text())
 if old.get('buildStatus')!='complete':raise ValueError('Die Ansicht wird gerade bearbeitet. Bitte danach erneut prüfen.')
 if old['generatedAt']!=plan['snapshotVersion'] or fingerprint()!=plan['fingerprint']:raise ValueError('Dateien oder Regeln wurden seit der Vorschau geändert. Bitte erneut prüfen.')
 for label in plan['staged']:
  p=ROOT/label
  if not p.is_file():raise ValueError('Eine geprüfte Datei fehlt. Bitte erneut prüfen.')
  if hashlib.sha256(p.read_bytes()).hexdigest()!=plan['stagedHashes'][label]:raise ValueError('Eine geprüfte Datei wurde geändert. Bitte erneut prüfen.')
 return plan

def cancel(token):
 load_plan(token);shutil.rmtree(PENDING/token)
