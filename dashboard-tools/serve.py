"""Local-only dashboard server with explicit PDF import and rebuild."""
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse
from pypdf import PdfReader
from datetime import datetime
import json,base64,hashlib,subprocess,threading,tempfile,shutil,os,sys,argparse,io
from export_pdf import export_pdf
from runtime_config import NODE,BUILD
from data_exports import table_export,check_version,create_backup,last_backup
from import_workflow import preview,prepare_apply,cancel,PENDING
from import_store import save_snapshot,latest_snapshot,history
from source_documents import resolve_document
from bank_assignments import PATH as ASSIGNMENTS_PATH,load as load_assignments,write as write_assignments,prepare_update as prepare_assignment_update
ROOT=Path(__file__).resolve().parent.parent;APP=ROOT/'dashboard';DIST=APP/'dist'
LOCK=threading.Lock()
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(DIST),**kwargs)
 def end_headers(self):
  self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');super().end_headers()
 def respond(self,status,data):
  b=json.dumps(data,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b)
 def do_GET(self):
  if self.headers.get('Host') not in {f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'}:self.respond(403,{'error':'Nur auf diesem Mac verfügbar.'});return
  route=urlparse(self.path).path
  if route.startswith('/api/ordi/source-pdf/'):
   if self.headers.get('Sec-Fetch-Site') not in [None,'none','same-origin']:self.respond(403,{'error':'Originale nur in dieser lokalen Ansicht öffnen.'});return
   try:
    digest=route.removeprefix('/api/ordi/source-pdf/');path=resolve_document(digest);content=path.read_bytes()
    if hashlib.sha256(content).hexdigest()!=digest:raise ValueError('Original wurde geändert.')
   except (ValueError,OSError,KeyError):self.respond(404,{'error':'Original-PDF nicht verfügbar oder geändert. Bitte den Datenstand erneut prüfen.'});return
   self.send_response(200);self.send_header('Content-Type','application/pdf');self.send_header('Content-Disposition','inline');self.send_header('Content-Length',str(len(content)));self.send_header('Cross-Origin-Resource-Policy','same-origin');self.end_headers();self.wfile.write(content);return
  if urlparse(self.path).path=='/api/ordi/status':
   p=ROOT/'dashboard-tools/import-status.json';data=json.loads(p.read_text()) if p.exists() else {};self.respond(200,{**data,'applicationId':'at.ordi.local-panel','applicationVersion':1,'busy':LOCK.locked(),'lastBackup':last_backup()});return
  if urlparse(self.path).path=='/api/ordi/import-history':
   self.respond(200,history());return
  super().do_GET()
 def do_POST(self):
  if self.headers.get('Host') not in {f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'}:self.respond(403,{'error':'Nur auf diesem Mac verfügbar.'});return
  if urlparse(self.path).path in ['/api/ordi/export-tables','/api/ordi/backup']:
   origin=self.headers.get('Origin')
   if origin and origin!=f'http://{self.headers.get("Host")}':self.respond(403,{'error':'Nur in dieser lokalen Ansicht verfügbar.'});return
   if not self.headers.get('Content-Type','').startswith('application/json'):self.respond(415,{'error':'JSON erwartet.'});return
   if not LOCK.acquire(blocking=False):self.respond(409,{'error':'Es läuft bereits eine Verarbeitung. Bitte kurz warten.'});return
   try:
    length=int(self.headers.get('Content-Length','0'))
    if length<0 or length>16384:raise ValueError('Ungültige Anfrage.')
    payload=json.loads(self.rfile.read(length) or b'{}');data=check_version(payload)
    if urlparse(self.path).path.endswith('/backup'):
     path=create_backup('manual');content=path.read_bytes();filename=path.name
    else:content=table_export(data);filename='Ordi-Tabellen-'+data['observationCutoff']+'.zip'
    self.send_response(200);self.send_header('Content-Type','application/zip');self.send_header('Content-Disposition',f'attachment; filename="{filename}"');self.send_header('Content-Length',str(len(content)));self.end_headers();self.wfile.write(content)
   except ValueError as exc:self.respond(400,{'error':str(exc)})
   except Exception:self.respond(500,{'error':'Export konnte nicht erstellt werden. Die vorhandenen Daten bleiben erhalten.'})
   finally:LOCK.release()
   return
  if urlparse(self.path).path=='/api/ordi/report-pdf':
   origin=self.headers.get('Origin')
   if origin and origin!=f'http://{self.headers.get("Host")}':self.respond(403,{'error':'دانلود فقط در همین گزارش محلی در دسترس است.'});return
   if not self.headers.get('Content-Type','').startswith('application/json'):self.respond(415,{'error':'درخواست معتبر نیست.'});return
   if not LOCK.acquire(blocking=False):self.respond(409,{'error':'گزارش در حال پردازش است. کمی بعد دوباره تلاش کنید.'});return
   try:
    length=int(self.headers.get('Content-Length','0'))
    if length<0 or length>512*1024:raise ValueError('حجم تنظیمات گزارش بیش از حد مجاز است.')
    content=export_pdf(json.loads(self.rfile.read(length) or b'{}'))
    self.send_response(200);self.send_header('Content-Type','application/pdf');self.send_header('Content-Disposition','attachment; filename="Ordi-Analyse-FA.pdf"');self.send_header('Content-Length',str(len(content)));self.end_headers();self.wfile.write(content)
   except (ValueError,RuntimeError) as exc:self.respond(400,{'error':str(exc)})
   except Exception:self.respond(500,{'error':'ساخت PDF انجام نشد. صفحه را تازه کنید و دوباره تلاش کنید.'})
   finally:LOCK.release()
   return
  if urlparse(self.path).path not in ['/api/ordi/preview','/api/ordi/import-apply','/api/ordi/import-cancel','/api/ordi/refresh','/api/ordi/bank-allocation']:
   self.respond(404,{'error':'Nicht gefunden.'});return
  origin=self.headers.get('Origin')
  if origin and origin!=f'http://{self.headers.get("Host")}':self.respond(403,{'error':'Nur in dieser lokalen Ansicht verfügbar.'});return
  if not self.headers.get('Content-Type','').startswith('application/json'):self.respond(415,{'error':'JSON erwartet.'});return
  if not LOCK.acquire(blocking=False):self.respond(409,{'error':'Es läuft bereits eine Prüfung oder Aktualisierung.'});return
  rollback=None;target=None;assignments_changed=False;old_assignments=None;committed=False
  try:
   length=int(self.headers.get('Content-Length','0'))
   if length<0 or length>100*1024*1024:raise ValueError('Maximal 100 MB pro Anfrage.')
   payload=json.loads(self.rfile.read(length) or b'{}');route=urlparse(self.path).path
   if route=='/api/ordi/preview':
    self.respond(200,preview(payload));return
   if route=='/api/ordi/import-cancel':
    cancel(payload.get('token'));self.respond(200,{'message':'Prüfung verworfen. Die bisherigen Daten bleiben erhalten.'});return
   allocation=route=='/api/ordi/bank-allocation'
   if allocation:
    data=check_version(payload);new_assignments,affected=prepare_assignment_update(payload,data,load_assignments())
    old_assignments=ASSIGNMENTS_PATH.read_bytes() if ASSIGNMENTS_PATH.exists() else None
    plan={'staged':[]}
   else:
    if not payload.get('token'):raise ValueError('Bitte zuerst „Dateien prüfen“ wählen und die Vorschau ansehen.')
    plan=prepare_apply(payload['token'])
   create_backup('before-bank-allocation' if allocation else 'before-import')
   rollback=Path(tempfile.mkdtemp(prefix='ordi-build-'))
   for name,path in [('dashboard-data',APP/'src/data.json'),('report-data',ROOT/'bericht/src/data.json'),('status',ROOT/'dashboard-tools/import-status.json')]:
    if path.exists():shutil.copy2(path,rollback/name)
   shutil.copytree(DIST,rollback/'dist',symlinks=True)
   if (ROOT/'bericht/dist').exists():shutil.copytree(ROOT/'bericht/dist',rollback/'report-dist',symlinks=True)
   if allocation:write_assignments(new_assignments);assignments_changed=True
   if plan['staged']:
    target=ROOT/'Eingang'/datetime.now().strftime('%Y%m%d-%H%M%S-%f');target.mkdir(parents=True)
    for label in plan['staged']:shutil.copy2(ROOT/label,target/Path(label).name)
   env={**os.environ,'ORDI_BUILD_STATUS':'complete'}
   result=subprocess.run([sys.executable,str(ROOT/'dashboard-tools/prepare_data.py')],capture_output=True,text=True,timeout=600,env=env)
   if result.returncode:raise RuntimeError('Die Auswertungen konnten nicht eingelesen werden. Der bisherige Datenstand bleibt erhalten.')
   result=subprocess.run([sys.executable,str(ROOT/'dashboard-tools/rebuild.py')],capture_output=True,text=True,timeout=90)
   if result.returncode:raise RuntimeError('Die neue Ansicht konnte nicht erstellt werden. Der bisherige Datenstand bleibt erhalten.')
   data=json.loads((APP/'src/data.json').read_text());run=save_snapshot(data,'Bankzuordnung im Panel' if allocation else 'Bestätigter Import')
   committed=True
   if allocation:
    self.respond(200,{'message':f'Zuordnung für {len(affected)} Buchung(en) gespeichert. Kontosummen bleiben unverändert.','runId':run,'count':len(affected)})
   else:
    shutil.rmtree(PENDING/payload['token'],ignore_errors=True)
    self.respond(200,{'message':'Daten gespeichert. Die neue Ansicht ist bereit.','runId':run,'notes':[f'{len(plan["files"])} Datei(en) geprüft; {plan["duplicateCount"]} identische Datei(en) übersprungen.',f'{len(plan["changes"])} Kennzahlenänderung(en) übernommen. Originale und frühere Datenstände bleiben erhalten.']})
  except Exception as exc:
   if committed:return
   if rollback:
    for name,path in [('dashboard-data',APP/'src/data.json'),('report-data',ROOT/'bericht/src/data.json'),('status',ROOT/'dashboard-tools/import-status.json')]:
     if (rollback/name).exists():shutil.copy2(rollback/name,path)
    for name,path in [('dist',DIST),('report-dist',ROOT/'bericht/dist')]:
     if (rollback/name).exists():shutil.rmtree(path,ignore_errors=True);shutil.copytree(rollback/name,path,symlinks=True)
   if target:shutil.rmtree(target,ignore_errors=True)
   if assignments_changed:
    if old_assignments is None:ASSIGNMENTS_PATH.unlink(missing_ok=True)
    else:ASSIGNMENTS_PATH.write_bytes(old_assignments)
   self.respond(400,{'error':str(exc)})
  finally:
   if rollback:shutil.rmtree(rollback,ignore_errors=True)
   LOCK.release()
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=4187);args=parser.parse_args()
 print(f'Ordinationsüberblick: http://127.0.0.1:{args.port}/',flush=True)
 current=json.loads((APP/'src/data.json').read_text());stored=latest_snapshot()
 if current.get('buildStatus')=='complete' and stored!=current:save_snapshot(current,'Start / übernommener geprüfter Bestand')
 create_backup('start')
 ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()
