"""User-owned bank allocation overrides, bound to stable existing transaction IDs."""
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
import json,os,re
from bank_data import safe_text
ROOT=Path(__file__).resolve().parent.parent
PATH=ROOT/'dashboard-tools/bank-assignments.json'
BUCKETS=['Ordination','Privat','Finanzierung','Steuern / SV offen','Bankkosten','Vermögensanlage','Zu prüfen']
DEFAULT_CATEGORIES={'Ordination':'Sonstige Ordinationsausgaben','Privat':'Sonstige private Ausgaben','Finanzierung':'Finanzierung / Aufteilung offen','Steuern / SV offen':'Steuerart / Zuordnung offen','Bankkosten':'Bankgebühren / Zinsen','Vermögensanlage':'Vermögensanlage','Zu prüfen':'Zweck noch offen'}
AUTO_FIELDS=['bucket','category','basis','classification','review','cooperation','cooperationBasis','costServiceYear']

def load(path=PATH):
 return json.loads(path.read_text()) if path.exists() else {'format':'ordi-bank-assignments-v1','bookings':{},'history':[]}

def write(data,path=PATH):
 tmp=path.with_suffix('.partial');tmp.write_text(json.dumps(data,ensure_ascii=False,indent=2));os.chmod(tmp,0o600);os.replace(tmp,path)

def matching(rows,selected,scope):
 if scope=='single':return [selected]
 if scope!='existingPayee':raise ValueError('Ungültiger Geltungsbereich.')
 return [r for r in rows if r['amount']<0 and r['payee']==selected['payee'] and r['merchant']==selected['merchant']]

def prepare_update(payload,snapshot,context):
 if payload.get('snapshotVersion')!=snapshot['generatedAt'] or snapshot.get('buildStatus')!='complete':raise ValueError('Datenstand geändert oder in Bearbeitung. Bitte die Ansicht neu öffnen.')
 selected=next((r for r in snapshot['queries']['bank_transactions']['rows'] if r['id']==payload.get('transactionId')),None)
 if not selected or selected['amount']>=0:raise ValueError('Bitte eine vorhandene Auszahlung auswählen.')
 action=payload.get('action','assign');scope=payload.get('scope','single')
 if action not in ['assign','reset']:raise ValueError('Ungültige Änderung.')
 if action=='reset' and scope!='single':raise ValueError('Zurücksetzen gilt nur für die ausgewählte Buchung.')
 affected=matching(snapshot['queries']['bank_transactions']['rows'],selected,scope)
 if payload.get('expectedCount')!=len(affected):raise ValueError('Die Anzahl der betroffenen Buchungen hat sich geändert. Bitte erneut prüfen.')
 bucket=payload.get('bucket');category=str(payload.get('category','')).strip();note=str(payload.get('note','')).strip()
 if action=='assign':
  if bucket not in BUCKETS:raise ValueError('Bitte Privat, Ordination oder einen anderen vorhandenen Bereich wählen.')
  if not category or len(category)>100 or len(note)>300 or any(ord(c)<32 for c in category+note):raise ValueError('Bitte eine Kategorie (max. 100 Zeichen) und optional eine kurze Notiz (max. 300 Zeichen) eingeben.')
 timestamp=datetime.now(ZoneInfo('Europe/Vienna')).isoformat(timespec='seconds');new=json.loads(json.dumps(context))
 changed=[]
 for row in affected:
  old=new['bookings'].get(row['id'])
  if action=='reset':new['bookings'].pop(row['id'],None);entry=None
  else:
   entry={'bucket':bucket,'category':safe_text(category),'note':safe_text(note),'updatedAt':timestamp,'scope':scope}
   new['bookings'][row['id']]=entry
  changed.append({'transactionId':row['id'],'before':old,'after':entry})
 new.setdefault('history',[]).append({'updatedAt':timestamp,'action':action,'scope':scope,'changes':changed})
 return new,affected

def apply(rows,context):
 """Keep amounts, descriptions, source hashes and transaction IDs immutable."""
 out=[]
 for original in rows:
  r=dict(original)
  automatic=r.get('automaticClassification') or {key:r.get(key) for key in AUTO_FIELDS}
  for key,value in automatic.items():
   if value is None:r.pop(key,None)
   else:r[key]=value
  r['automaticClassification']=automatic
  for key in ['manualAssignment','assignmentUpdatedAt','assignmentNote']:r.pop(key,None)
  rule=context['bookings'].get(r['id'])
  if rule and r['amount']<0:
   if rule.get('bucket') not in BUCKETS or not rule.get('category'):raise ValueError('Ungültige gespeicherte Bankzuordnung. Bisheriger Bestand bleibt erhalten.')
   r.update(bucket=rule['bucket'],category=rule['category'],classification='Im Panel bestätigt',basis='Im Ordinationspanel vom Nutzer zugeordnet. '+rule.get('note',''),review=rule['bucket'] in ['Zu prüfen','Steuern / SV offen','Finanzierung'],manualAssignment=True,assignmentUpdatedAt=rule['updatedAt'],assignmentNote=rule.get('note',''))
   if r.get('cooperation') and r['bucket']!='Ordination':
    for field in ['cooperation','cooperationBasis','costServiceYear']:r.pop(field,None)
  out.append(r)
 return out

def audit_rows(rows,context):
 byid={r['id']:r for r in rows}
 return [{'transactionId':tid,**rule,'presentInCurrentData':tid in byid,'date':byid.get(tid,{}).get('date'),'merchant':byid.get(tid,{}).get('merchant'),'amount':byid.get(tid,{}).get('amount')} for tid,rule in sorted(context['bookings'].items())]
