"""Practice-only comparisons without an optional care-home cohort; immutable original queries remain available.

The cohort is configured in pflegeheim-finance-context.json (serviceYear, listFile). Without that
configuration, the practice-scoped queries are plain copies of the original queries.
"""
from pathlib import Path
from collections import defaultdict
import hashlib,re,json,copy
from pypdf import PdfReader

SCOPED={'ordination_periods':'patient_periods','ordination_service_codes':'service_codes','ordination_patient_segments':'patient_segments','ordination_biz_patients':'biz_patients','ordination_patient_service_summary':'patient_service_summary'}

def unscoped(q):
 """No confirmed care-home cohort: practice views equal the original reports."""
 for target,base in SCOPED.items():
  rows=[dict(r) for r in q[base]['rows']]
  if target=='ordination_periods':rows=[{**r,'reportedPatients':r['patients'],'reportedAmount':r['amount'],'reportedServiceRows':r['serviceRows'],'pflegeheimPatients':0,'pflegeheimAmount':0,'scope':'Ordination'} for r in rows]
  q[target]={'rows':rows,'source':copy.deepcopy(q[base]['source'])}
 q['pflegeheim_exclusion']={'rows':[],'source':copy.deepcopy(q['patient_service_records']['source'])}
 for r in q['patient_service_records']['rows']:r['pflegeheimExcluded']=False
 return {'patients':0,'detailRows':0,'amount':0,'quarterExclusions':[]}

def apply_practice_scope(queries,root,ph_stats,care):
 q=queries;records=q['patient_service_records']['rows']
 Y=care.get('serviceYear');list_file=care.get('listFile')
 source=Path(root)/list_file if list_file else None
 ph=next((r for r in ph_stats if r['year']==Y and r['quarter'] is None),None) if Y else None
 if not Y or not source or not source.is_file() or not ph:return unscoped(q)
 salt=json.loads((root/'dashboard-tools/patient-service-context.json').read_text())['anonymizationSalt']
 refs=set();header=re.compile(r'^.+?\s+([MWX])\s+(\d+)\s+(\S+)\s+\d{2}(?:\s|$)')
 for page in PdfReader(source).pages:
  for line in (page.extract_text() or '').splitlines():
   match=header.match(line)
   if match:refs.add(hashlib.sha256((salt+'|'+match[2]).encode()).hexdigest()[:16])
 if len(refs)!=ph['patients']:raise ValueError('Pflegeheim-Kohorte nicht vollständig mit PH-Jahresstatistik abgestimmt.')
 actual=[r for r in records if r['year']==Y and r['patientRef'] in refs and r['status']=='Erfasst (nicht rot)']
 cents=lambda rows:sum(round(r['amount']*100) for r in rows)
 if len({r['patientRef'] for r in actual})!=ph['patients'] or cents(actual)!=round(ph['amount']*100):raise ValueError('Pflegeheim-Einzelbeträge stimmen nicht mit vollständiger PH-Jahresstatistik überein.')
 if any(not r['date'] or not r['date'].startswith(f'{Y}-') for r in actual):raise ValueError(f'Vollständiger Pflegeheim-Abzug je Quartal benötigt datierte Zeilen {Y}.')
 def scoped_source(base,definition):
  src=copy.deepcopy(q[base]['source']);src['label']=f'Ordination ohne Pflegeheim {Y}'
  labels={x['label'] for x in src.get('files',[])}
  for label in [list_file,ph['file']]+[r['file'] for r in q['patient_service_summary']['rows'] if r['year']==Y]:
   if label not in labels:src['files'].append({'label':label});labels.add(label)
  src['metricDefinitions'].append({'label':'Abgrenzung ohne Pflegeheim','definition':definition})
  src['caveats']=[x for x in src.get('caveats',[]) if not any(t in x for t in ['bleiben Gesamt','nicht bereinigt','zusätzliche Besuche'])]
  src['evidenceFlow'].append({'kind':'method','title':f'Vollständig abgestimmte Kohorte {Y}','detail':f'{len(refs)} interne Nummern aus der bestätigten Liste werden ausschließlich lokal mit gesalzenen Referenzen verbunden. {len(actual)} schwarze Detailzeilen stimmen exakt mit der PH-Jahresstatistik überein. Einzelzeilen sind keine Mengeneinheiten. Originalberichte bleiben in eigenen Queries unverändert.'})
  return src
 adjusted=[];exclusions=[]
 for row in q['patient_periods']['rows']:
  if row['year']!=Y:
   adjusted.append({**row,'reportedPatients':row['patients'],'reportedAmount':row['amount'],'reportedServiceRows':row['serviceRows'],'pflegeheimPatients':0,'pflegeheimAmount':0,'scope':'Ordination'});continue
  rr=actual if row['quarter'] is None else [r for r in actual if (int(r['date'][5:7])-1)//3+1==row['quarter']]
  people=len({r['patientRef'] for r in rr});amount=cents(rr)/100
  adjusted.append({**row,'reportedPatients':row['patients'],'reportedAmount':row['amount'],'reportedServiceRows':row['serviceRows'],'pflegeheimPatients':people,'pflegeheimAmount':amount,'patients':row['patients']-people,'amount':(round(row['amount']*100)-cents(rr))/100,'serviceRows':row['serviceRows']-ph['serviceRows'] if row['quarter'] is None else None,'scope':'Ordination ohne Pflegeheim'})
  exclusions.append({'year':Y,'quarter':row['quarter'],'patients':people,'amount':amount,'detailRows':len(rr),'serviceRows':ph['serviceRows'] if row['quarter'] is None else None,'file':ph['file']})
 q['ordination_periods']={'rows':adjusted,'source':scoped_source('patient_periods',f'Für {Y} werden Betrag und Personen derselben vollständig abgestimmten Pflegeheim-Kohorte abgezogen; Quartale aus tatsächlichen nicht roten Zeilen, Jahrespersonen nicht durch Addition. Andere Jahre bleiben unverändert.')}
 q['pflegeheim_exclusion']={'rows':exclusions,'source':scoped_source('patient_service_records','Vollständige jährliche und quartalsweise Pflegeheim-Abzüge; Quartalszahlen können sich überschneiden.')}
 bycode=defaultdict(list)
 for r in actual:bycode[re.sub(r'\*.*$','',r['code'])].append(r)
 full_bycode=defaultdict(list)
 for r in records:
  if r['year']==Y and r['status']=='Erfasst (nicht rot)':full_bycode[re.sub(r'\*.*$','',r['code'])].append(r)
 for code,rr in bycode.items():
  source_rows=[r for r in q['service_codes']['rows'] if r['year']==Y and r['baseCode']==code]
  if len(source_rows)!=1 or round(source_rows[0]['amount']*100)!=cents(full_bycode[code]):raise ValueError(f'Code-Abgleich für Pflegeheim nicht eindeutig: {code}')
 codes=[]
 for row in q['service_codes']['rows']:
  if row['year']!=Y:codes.append(row);continue
  removed=cents(bycode.get(row['baseCode'],[]));rr={**row,'reportedAmount':row['amount'],'amount':(round(row['amount']*100)-removed)/100,'pflegeheimAmount':removed/100,'scope':'Ordination ohne Pflegeheim'}
  if removed or bycode.get(row['baseCode']):rr.update(reportedCount=row['count'],count=None,patientAmount=None,insuranceAmount=None)
  codes.append(rr)
 q['ordination_service_codes']={'rows':codes,'source':scoped_source('service_codes',f'Leistungswerte je Code {Y} minus exakt abgeglichene Pflegeheim-Zeilen. Die Aufteilung in Patienten-/Kassenanteil und Mengeneinheiten betroffener Codes ist ohne gesonderten PH-Codeexport unbekannt, daher null statt Schätzung.')}
 # Independent annual demographic tables permit an exact matching-category subtraction.
 segments=[]
 for row in q['patient_segments']['rows']:
  rr=dict(row)
  if row['year']==Y:
   match=next((r for r in ph['sections'].get(row['dimension'],[]) if r['label']==row['label']),None)
   for key in ['patients','serviceRows','amount']:
    rr['reported'+key[0].upper()+key[1:]]=row[key]
    rr[key]=(round(row[key]*100)-round((match or {}).get(key,0)*100))/100 if key=='amount' else row[key]-(match or {}).get(key,0)
    if rr[key]<0:raise ValueError('Pflegeheim-Demografie überschreitet Gesamtgruppe.')
   rr['scope']='Ordination ohne Pflegeheim'
  segments.append(rr)
 expected_people=next(r['patients'] for r in adjusted if r['year']==Y and r['quarter'] is None)
 for dim in ['Alter','Geschlecht']:
  if sum(r['patients'] for r in segments if r['year']==Y and r['dimension']==dim)!=expected_people:raise ValueError('Bereinigte Demografie nicht abgestimmt.')
 q['ordination_patient_segments']={'rows':segments,'source':scoped_source('patient_segments',f'Die vollständige PH-Jahresstatistik wird anhand identischer Alters-/Geschlechtskategorien von {Y} abgezogen.')}
 biz=[]
 for row in q['biz_patients']['rows']:
  rr=dict(row)
  if row['year']==Y:
   for key in list(rr):
    if key not in ['year','quarter'] and isinstance(rr[key],(int,float)):rr[key]=None
   rr['scopeStatus']='Nicht verfügbar: BIZ-Auswertung ohne Pflegeheim fehlt'
  biz.append(rr)
 q['ordination_biz_patients']={'rows':biz,'source':scoped_source('biz_patients',f'Für {Y} fehlt eine BIZ-Auswertung ohne Pflegeheim; Neupatienten und Sitzungen werden nicht geschätzt. Alle BIZ-Kennzahlen {Y} bleiben in dieser bereinigten Sicht unbekannt. Die Original-BIZ-Query bleibt erhalten.')}
 for r in records:r['pflegeheimExcluded']=r['year']==Y and r['patientRef'] in refs
 summaries=[]
 for row in q['patient_service_summary']['rows']:
  rr=dict(row)
  if row['year']==Y:
   own=[r for r in records if r['year']==Y and not r['pflegeheimExcluded']];black=[r for r in own if r['status']=='Erfasst (nicht rot)'];red=[r for r in own if r['status']=='Geplant (rot)'];main=next(r for r in adjusted if r['year']==Y and r['quarter'] is None)
   rr.update(patients=len({r['patientRef'] for r in own}),entryCount=len(own),recordedRows=len(black),recordedValue=cents(black)/100,plannedRows=len(red),plannedValue=cents(red)/100,patientsWithPlans=len({r['patientRef'] for r in red}),patientStatsValue=main['amount'],patientStatsPatients=main['patients'],differenceToPatientStats=round(cents(black)/100-main['amount'],2),scope='Ordination ohne Pflegeheim')
   for field in ['printedPrivate','printedInsurance','plannedPrivate','plannedInsurance','plannedPatientShare']:rr[field]=None
  summaries.append(rr)
 q['ordination_patient_service_summary']={'rows':summaries,'source':scoped_source('patient_service_summary',f'{Y}: Pflegeheim-Kohorte aus schwarzen und roten Detailzeilen ausgeschlossen; Summen werden erneut aus den enthaltenen Zeilen berechnet. Andere Jahre unverändert.')}
 return {'patients':len(refs),'detailRows':len(actual),'amount':cents(actual)/100,'quarterExclusions':exclusions}
