"""Read text colour and reconcile patient service lists; retain no identities or clinical notes."""
from collections import defaultdict,Counter
from decimal import Decimal
from pathlib import Path
from pypdf import PdfReader
import re,hashlib,json
MONEY=r'-?[\d.]+,\d{2}'
STATE=r'[A-Z]\s*-\s*-(?:\s*(?:-|[A-Za-z])){10}'
SERVICE=re.compile(rf'^(?:(\d{{2}}\.\d{{2}}\.\d{{2}})\s+)?(.*?)\s+({STATE})\s+({MONEY})(?:\s+(.*))?$')
HEADER=re.compile(r'^.+?\s+([MWX])\s+(\d+)(?:\s|$)')
def cents(s):return int(Decimal(s.replace('.','').replace(',','.'))*100)
def colour_lines(page):
 state={'color':(0,0,0),'y':None};rows={}
 def operator(op,args,cm,tm):
  if op==b'rg':state['color']=tuple(float(v) for v in args)
  elif op==b'g':state['color']=(float(args[0]),)*3
 def visit(text,cm,tm,font,size):
  if not text.strip():return
  if tm[5]!=0:state['y']=round(tm[5],2)
  if state['y'] is None:raise ValueError('Textposition fehlt.')
  rows.setdefault(state['y'],[]).append((text,state['color']))
 page.extract_text(visitor_operand_before=operator,visitor_text=visit)
 for index,(y,pieces) in enumerate(rows.items()):
  text=re.sub(r',\s+(?=\d{2}(?:\D|$))',',',''.join(t for t,c in pieces)).strip()
  yield index,text,{c for t,c in pieces if t.strip()}
def parse_patient_services(path,salt):
 digest=hashlib.sha256(path.read_bytes()).hexdigest()
 cache_root=Path(__file__).resolve().parent.parent/'.local-state/patient-service-cache';cache_root.mkdir(exist_ok=True,parents=True)
 cache=cache_root/(hashlib.sha256((digest+'|'+salt+'|v5').encode()).hexdigest()+'.json')
 if cache.exists():
  cached=json.loads(cache.read_text());label=str(path.relative_to(Path(__file__).resolve().parent.parent))
  return {**cached['summary'],'file':label},[{**r,'file':label} for r in cached['rows']]
 reader=PdfReader(path);text=reader.pages[0].extract_text() or ''
 title=re.search(r'Leistungsaufstellung für das Jahr (\d{4}) - (\d+) Einträge',text)
 if not title:raise ValueError('Kopf der Leistungsaufstellung fehlt.')
 year=int(title[1]);entries=int(title[2]);current=None;last_date=None;patients=set();records=[];totals=None;planned=None;subtotals=[]
 unmatched=Counter();colors=Counter();patient_subtotals=[];current_amount=0
 for page_no,page in enumerate(reader.pages,1):
  for line_no,line,line_colors in colour_lines(page):
   if not line:continue
   header=HEADER.match(line)
   if header:
    current=hashlib.sha256((salt+'|'+header[2]).encode()).hexdigest()[:16];patients.add(current);last_date=None;continue
   final=re.match(rf'^Patienten:\s*(\d+)\s+Privat:\s*({MONEY})\s+Kasse:\s*({MONEY})',line)
   if final:totals=(int(final[1]),cents(final[2]),cents(final[3]));continue
   plan=re.match(rf'^Planungen:\s*({MONEY})\s+({MONEY})\s+({MONEY})',line)
   if plan:planned=(cents(plan[1]),cents(plan[2]),cents(plan[3]));continue
   subtotal=re.match(rf'^Privat:\s*({MONEY})\s+Kasse:\s*({MONEY})',line)
   if subtotal:patient_subtotals.append(cents(subtotal[1])+cents(subtotal[2]));continue
   match=SERVICE.match(line)
   if match:
    if current is None:raise ValueError(f'Leistungszeile ohne Patientenblock: Seite {page_no}.')
    if match[1]:
     dd,mm,yy=match[1].split('.');last_date=f'20{yy}-{mm}-{dd}'
    left=match[2].split();code=left[-1] if left else None
    if not code:raise ValueError(f'Leistungskürzel fehlt: Seite {page_no}.')
    if len(line_colors)!=1:raise ValueError(f'Gemischte Textfarbe einer Leistungszeile: Seite {page_no}.')
    color=next(iter(line_colors));colors[color]+=1
    status='Geplant (rot)' if color==(1,0,0) else 'Erfasst (nicht rot)' if color==(0,0,0) else 'Andere Farbe – prüfen'
    value=cents(match[4]);payer=(match[5] or '').split()[0] if match[5] else ''
    payer=payer if re.match(r'^(?:ÖGK|BVA|SVS|KFA|VA|GKK|W[Gg][Kk][Kk])',payer) else 'Privat / ohne Kassenkennzeichen'
    records.append({'id':hashlib.sha256(f'{digest}:{page_no}:{line_no}'.encode()).hexdigest()[:20],'year':year,'patientRef':current,'date':last_date,'code':code,'amount':value/100,'status':status,'color':','.join(str(int(v)) if float(v).is_integer() else str(v) for v in color),'payer':payer,'file':str(path.relative_to(Path(__file__).resolve().parent.parent)),'page':page_no,'sha256':digest})
   elif re.search(STATE,line) and re.search(MONEY,line):unmatched['state_and_amount']+=1

 if unmatched:raise ValueError(f'Nicht erkannte Leistungszeilen: {dict(unmatched)}')
 groups=defaultdict(lambda:{'count':0,'cents':0,'people':set()})
 for r in records:
  g=groups[r['status']];g['count']+=1;g['cents']+=round(r['amount']*100);g['people'].add(r['patientRef'])
 actual=groups['Erfasst (nicht rot)'];plan=groups['Geplant (rot)'];other=groups['Andere Farbe – prüfen']
 if not totals or not planned:raise ValueError('Gedruckte Gesamt-/Planungssumme fehlt.')
 if len(patients)!=totals[0]:raise ValueError(f'Patientenabgleich: {len(patients)} statt {totals[0]}.')
 if actual['cents']!=totals[1]+totals[2]:raise ValueError(f'Nicht rote Zeilen: {actual["cents"]/100} statt {(totals[1]+totals[2])/100}. Farben {dict(colors)}')
 if plan['cents']!=planned[0]+planned[1]:raise ValueError(f'Rote Zeilen: {plan["cents"]/100} statt {(planned[0]+planned[1])/100}.')
 if sum(patient_subtotals)!=totals[1]+totals[2]:raise ValueError('Patientenzwischensummen stimmen nicht überein.')
 if other['count']:raise ValueError(f'Leistungen mit anderer Farbe: {other["count"]}.')
 if len(records)!=entries:raise ValueError(f'Anzahl aller Einträge: {len(records)} statt {entries}.')
 summary={'year':year,'file':records[0]['file'],'sha256':digest,'pages':len(reader.pages),'entryCount':entries,'patients':len(patients),'recordedRows':actual['count'],'recordedValue':actual['cents']/100,'plannedRows':plan['count'],'plannedValue':plan['cents']/100,'patientsWithPlans':len(plan['people']),'recordedDateMin':min((r['date'] for r in records if r['status']=='Erfasst (nicht rot)' and r['date']),default=None),'recordedDateMax':max((r['date'] for r in records if r['status']=='Erfasst (nicht rot)' and r['date']),default=None),'printedPrivate':totals[1]/100,'printedInsurance':totals[2]/100,'plannedPrivate':planned[0]/100,'plannedInsurance':planned[1]/100,'plannedPatientShare':planned[2]/100,'created':str((reader.metadata or {}).get('/CreationDate','')),'reconciliation':'Einzelzeilen, Patientenzwischensummen, gedruckte Gesamtsummen und Planungssummen stimmen überein.'}
 cache.write_text(json.dumps({'summary':summary,'rows':records},ensure_ascii=False))
 return summary,records
if __name__=='__main__':
 root=Path(__file__).resolve().parent.parent
 # Audit-only: no row identities or notes are printed.
 for f in sorted((root/'Leistungsaufstellung').glob('*.pdf')):
  try:
   summary,records=parse_patient_services(f,json.loads((root/'dashboard-tools/patient-service-context.json').read_text())['anonymizationSalt']);print(json.dumps(summary,ensure_ascii=False))
  except Exception as ex:print(f.name,str(ex))
