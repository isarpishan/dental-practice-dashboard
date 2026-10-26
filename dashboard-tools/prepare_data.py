"""Read aggregate Ordination PDFs. Never changes original files or estimates missing patients."""
from pathlib import Path
from decimal import Decimal
from datetime import datetime
from zoneinfo import ZoneInfo
from pypdf import PdfReader
import json,re,hashlib,sys,os
from bank_data import parse_bank,combine,classify
from pflegeheim_data import parse_pflegeheim
from practice_scope import apply_practice_scope
from patient_service_data import parse_patient_services
from bank_assignments import load as load_bank_assignments,apply as apply_bank_assignments,audit_rows as bank_assignment_rows
from care_home import load_context as load_care_context
ROOT=Path(__file__).resolve().parent.parent
APP=ROOT/'dashboard'
AMOUNT=r'-?[\d.]+,\d{2}'
SRE=re.compile(rf'^(.*?)\s+({AMOUNT})\s+({AMOUNT})\s+({AMOUNT})\s+(\d+)(?:\s+[\d,]+)?\s*$')
PRE=re.compile(rf'^(.*?)\s+(\d+|--)\s+(?:[\d,]+\s+)?(\d+|--)\s+(?:[\d,]+\s+)?({AMOUNT}|--)(?:\s+[\d,]+)?\s*$')
def number(s): return float(Decimal(s.replace('.','').replace(',','.')))
def rounded(n): return round(n,2)
def created(reader,f):
 v=str((reader.metadata or {}).get('/CreationDate',''))
 m=re.search(r'D:(\d{14})',v)
 return m[1] if m else datetime.fromtimestamp(f.stat().st_mtime).strftime('%Y%m%d%H%M%S')
def category(c):
 if c=='RAB':return 'Preisnachlässe'
 if c=='Termi':return 'Versäumte Termine'
 if c in {'IP','BHB'}:return 'Dokumentation'
 if c in {'KUi1','KuI2','KuI3','Kul4','Kulo','KUVE','MKU1','MKU2','MKU3','MKUK','MKUO','MKUV'}:return 'Digitale Restaurationen'
 if c in {'BT30','BT60','Rec10','Rec20','Rec30','Reev','paber','Parob','ParS','Keim','PDTP','PDTPF','Steri'}:return 'Parodontologie & Laser'
 if c in {'MH','MHGR','MHKIN','MHPAR','KiMH','ErwMH','Zst','PZRim','PZRTe'}:return 'Mundhygiene & Zahnstein'
 if c in {'PDTE','W1','W2','W3','WU','WA','RevW1','RevW2','RevW3','KOf','KOFe'}:return 'Wurzelbehandlungen'
 if c in {'Imp','IMPKr','IKRge','IKRze','IKRzi','ImpAn','ImpTo','imrei','ipkl'}:return 'Implantate & Implantatkronen'
 if c in {'ECK','Eckep','Hö','F1','F2','FM','K1','K2','KM','KiG1','KiG2','KiGM','KiHö','PK1','PK2','PK3+','KFF1','KFF2','KFF3','Comp1'}:return 'Füllungen & Aufbauten'
 if c in {'Pan','Rö','RöPri','RöSt'}:return 'Röntgen'
 if c in {'Krone','KroZi','Total','MG','MGPri','MGpri','VMK','VMK+C','KZK','a','b','c','d','e','x','y','z','PZ','PZM','PZMPR','PZMpr','PK','PP','Bügel','Lokat','lokta','Metvp','I1K','I2K','I3K','I1','I2','I3','InLöf','Ge-Kr','Ge-Pr','G-Tau','venke','venek','ZE3D','WÜF','STaus','Stif'}:return 'Zahnersatz & Reparaturen'
 if c in {'E','OZ','EK','RZ','Zy','KK','SKB','STA','Nb','Ii','Hl','Gop'}:return 'Chirurgie & Nachbehandlung'
 return 'Weitere Leistungen'

def pdf_paths():
 return sorted([f for f in (ROOT/'Leistungsaufstellung').glob('**/*.pdf') if f.is_file()]+[f for f in ROOT.iterdir() if f.is_file() and f.suffix.lower()=='.pdf']+[f for f in (ROOT/'Eingang').glob('**/*') if f.is_file() and f.suffix.lower()=='.pdf'])

def build(paths=None,persist=True):
 now=datetime.now(ZoneInfo('Europe/Vienna')).isoformat(timespec='seconds')
 patient_context=json.loads((ROOT/'dashboard-tools/patient-service-context.json').read_text())
 care=load_care_context(ROOT);care_year=care.get('serviceYear')
 documents=[]; candidates={};lex_candidates=[];unsupported=[];errors=[];bank_statements=[]
 source_paths=list(paths) if paths is not None else pdf_paths()
 seen_hashes=set()
 for f in source_paths:
  digest=hashlib.sha256(f.read_bytes()).hexdigest()
  if digest in seen_hashes:continue
  seen_hashes.add(digest)
  try:
   if re.match(r'^(?:\d+-)?Leistungsaufstellung-20\d{2}',f.stem,re.I):
    summary,detail_rows=parse_patient_services(f,patient_context['anonymizationSalt'])
    r=PdfReader(f);stamp=created(r,f);record={'created':stamp,'summary':summary,'rows':detail_rows};key=('patient_services',summary['year'])
    documents.append({'file':str(f.relative_to(ROOT)),'sha256':digest,'pages':summary['pages'],'created':stamp,'kind':'Leistungsaufstellung mit Planungen','reportKey':list(key),'period':str(summary['year'])})
    if key in candidates and stamp==candidates[key]['created']:raise ValueError('Zwei unterschiedliche Versionen haben denselben Erstellungszeitpunkt. Bitte eine eindeutige neue Auswertung exportieren.')
    if key not in candidates or stamp>candidates[key]['created']:candidates[key]=record
    continue
   r=PdfReader(f);texts=[p.extract_text(extraction_mode='layout') or '' for p in r.pages];t='\n'.join(texts)
   item={'file':str(f.relative_to(ROOT)),'sha256':digest,'pages':len(r.pages),'created':created(r,f),'kind':'unknown'}
   if 'Umsatzübersicht' in t and 'Buchungsdatum' in t:
    bank=parse_bank(f)
    bank_statements.append(bank);item['kind']='Bank-Umsatzübersicht';record=None;key=None
   elif 'Leistungsaufstellung für das Jahr' in t and 'heim' in f.stem.lower():
    if not care_year:raise ValueError('Pflegeheim-Liste gefunden, aber kein Kooperationsjahr in pflegeheim-finance-context.json (serviceYear).')
    record={'created':item['created'],'rows':parse_pflegeheim(r,f.name,digest,item['created'],care_year)};key=('pflegeheim',care_year);item['kind']='Pflegeheim-Patientenliste'
   elif 'Patientenstatistik für' in t:
    m=re.search(r'Patientenstatistik für das (?:(\d)\. Quartal|(Jahr)) (\d{4})',t)
    if not m: raise ValueError('Zeitraum der Patientenstatistik nicht erkannt.')
    year=int(m[3]);quarter=int(m[1]) if m[1] else None
    ph_scope=bool(re.match(r'^(?:\d+-)?ph[ _-]+leistung',f.stem.casefold()))
    key=('pflegeheim_stats' if ph_scope else 'patients',year,quarter)
    sections={};section=None;total=None
    for line in t.splitlines():
     s=line.strip()
     if s in ['Geschlecht','Alter','Postleitzahl','Überweiser Von','Überweiser Zu','Kasse']:section=s;sections[s]=[]
     p=PRE.match(line)
     if p:
      row={'label':p[1].strip(),'patients':0 if p[2]=='--' else int(p[2]),'serviceRows':0 if p[3]=='--' else int(p[3]),'amount':0 if p[4]=='--' else number(p[4])}
      if row['label']=='Gesamt':total=row
      elif section:sections[section].append(row)
    if not total:raise ValueError('Gesamtsumme fehlt.')
    record={'year':year,'quarter':quarter,'period':'annual' if quarter is None else 'quarter','file':f.name,'sha256':digest,**total,'sections':sections,'created':item['created']}
    item['kind']='Pflegeheim-Leistungsstatistik' if ph_scope else 'Patientenstatistik'
    if ph_scope:
     for dimension in ['Geschlecht','Alter','Kasse']:
      for field in ['patients','serviceRows','amount']:
       if abs(sum(x[field] for x in sections[dimension])-total[field])>.015:raise ValueError(f'Pflegeheim-Summenprüfung: {dimension} / {field}')
   elif 'Auswertung der Leistungen' in t:
    m=re.search(r'Auswertung der Leistungen (\d{2}\.\d{2}\.\d{4}) bis (\d{2}\.\d{2}\.\d{4})',t)
    if not m:raise ValueError('Zeitraum der Leistungen nicht erkannt.')
    year=int(m[1][-4:])
    if m[1]!=f'01.01.{year}' or m[2]!=f'31.12.{year}':raise ValueError('Für Leistungsdetails wird eine Jahresauswertung 01.01.–31.12. benötigt. Teilzeiträume werden separat gemeldet und nicht mit Jahreswerten addiert.')
    key=('services',year,m[1],m[2]);rows=[];total=None
    for line in t.splitlines():
     p=SRE.match(line)
     if p:
      row={'code':p[1].strip(),'amount':number(p[2]),'patientAmount':number(p[3]),'insuranceAmount':number(p[4]),'count':int(p[5])}
      if row['code']=='Summen':total=row
      else:rows.append(row)
    if total is None:raise ValueError('Summenzeile fehlt.')
    for field in ['amount','patientAmount','insuranceAmount','count']:
     if abs(sum(x[field] for x in rows)-total[field])>0.015:raise ValueError(f'Summenprüfung fehlgeschlagen: {field}')
    if any(abs(x['amount']-x['patientAmount']-x['insuranceAmount'])>.015 for x in rows):raise ValueError('Aufteilung stimmt nicht mit Gesamtbetrag überein.')
    record={'year':year,'start':m[1],'end':m[2],'file':f.name,'sha256':digest,'created':item['created'],'rows':rows,'total':total};item['kind']='Leistungen'
   elif t.strip().startswith('Lexikon'):
    key=('lexikon',);rows=[]
    for line in t.splitlines():
     if line.startswith(('Lexikon','Kürzel')) or not line.strip():continue
     code=line.split()[0];price_match=re.search(r'(-?[\d.]+,\d{2})(.*)$',line)
     desc=price_match[2].strip() if price_match else re.split(r'\s{2,}',line.strip())[-1]
     rows.append({'code':code,'description':desc,'currentPrice':number(price_match[1]) if price_match else None})
    record={'file':f.name,'sha256':digest,'created':item['created'],'rows':rows};item['kind']='Lexikon'
   elif 'BIZstatistik: Monats-' in t:
    header=next((l for l in t.splitlines() if l.startswith('Bezeichnung')),'')
    periods=re.findall(r'\d\.Q/\d{2}|20\d{2}',header)
    if not periods:raise ValueError('BIZ-Zeiträume nicht erkannt. Dieses Monatsformat benötigt eine geprüfte Zuordnung.')
    key=('biz',tuple(periods));data={}
    for line in t.splitlines():
     cols=re.split(r'\s{2,}',line.strip())
     if len(cols)<2:continue
     vals=[x for x in cols[1:] if '%' not in x]
     if len(vals)==len(periods):
      try:data[cols[0]]=[number(v) for v in vals]
      except Exception:pass
    record={'file':f.name,'sha256':digest,'created':item['created'],'periods':periods,'data':data};item['kind']='BIZ'
   elif len(t.strip())<40:
    item['kind']='Bild-PDF';unsupported.append({'file':f.name,'reason':'Bild-PDF: benötigt geprüfte Übertragung oder einen Export mit auswählbarem Text.','sha256':digest});record=None;key=None
   elif 'BIZstatistik: Tagesauswertungen' in t:item['kind']='Tagesauswertung';record=None;key=None
   else:unsupported.append({'file':f.name,'reason':'Berichtstyp nicht erkannt.','sha256':digest});record=None;key=None
   if key:
    record.setdefault('sha256',digest)
    item['reportKey']=list(key);item['period']=' / '.join(str(v) for v in key[1:] if v is not None) or 'Aktueller Stand'
    if key in candidates and record['created']==candidates[key]['created']:raise ValueError('Zwei unterschiedliche Versionen haben denselben Erstellungszeitpunkt. Bitte eine eindeutige neue Auswertung exportieren.')
   if item['kind']=='Bank-Umsatzübersicht':item['period']=bank['start']+' – '+bank['end']
   documents.append(item)
   if key and (key not in candidates or record['created']>candidates[key]['created']):candidates[key]=record
  except Exception as ex:errors.append({'file':f.name,'reason':str(ex)})
 ph_stats=[x for k,x in candidates.items() if k[0]=='pflegeheim_stats']
 stats=[x for k,x in candidates.items() if k[0]=='patients'];services=[x for k,x in candidates.items() if k[0]=='services'];biz=[x for k,x in candidates.items() if k[0]=='biz']
 lex=candidates.get(('lexikon',),{'rows':[],'file':'Lexikon fehlt'});lexmap={x['code']:x for x in lex['rows']}
 annualBiz={};quarterBiz={}
 mapping={'Anzahl behandelter Patienten':'patients','Anzahl neuer Patienten':'newPatients','Anzahl Patientensitzungen':'sessions','Kassenanteil Summe':'insuranceAmount','Patientenanteil Summe':'copayment','Privatumsatz':'privateAmount','Patientenumsatz (Patientenanteil+Privat)':'patientAmount','Gesamtumsatz (Kass.ant.+Pat.ant.+Privat)':'amount','noch unverr. Leistungen':'unbilled','Gesamtbetrag off. Planungen':'openPlans','Gesamtbetrag durchgef. Planungen':'completedPlans','Außenstände':'outstanding'}
 for b in biz:
  for i,period in enumerate(b['periods']):
   row={'file':b['file'],'sha256':b['sha256'],'created':b['created']}
   for label,field in mapping.items():row[field]=b['data'].get(label,[None]*len(b['periods']))[i]
   if '.Q/' in period:
    q,y=period.split('.Q/');row.update(year=2000+int(y),quarter=int(q));key=(row['year'],row['quarter'])
    if key not in quarterBiz or b['created']>quarterBiz[key]['created']:quarterBiz[key]=row
   else:
    row.update(year=int(period));key=int(period)
    if key not in annualBiz or b['created']>annualBiz[key]['created']:annualBiz[key]=row
 # Original image-only BIZ report was visually read in full. Bind transcription to its exact hash.
 manual_path=ROOT/'dashboard-tools'/'reviewed-image-biz.json'
 if manual_path.exists():
  manual=json.loads(manual_path.read_text())
  if any(d['sha256']==manual['sha256'] for d in documents):
   for row in manual['rows']:
    key=(row['year'],row['quarter']);existing=quarterBiz.get(key)
    if existing is None or row['created']>existing['created']:quarterBiz[key]=row
   unsupported=[x for x in unsupported if x['sha256']!=manual['sha256']]
  else:errors.append({'file':manual['file'],'reason':'Geprüfte Bildübertragung passt nicht mehr zur Quelldatei.'})
 # The observation cutoff is the BIZ report date, never a future selected 31 December.
 report_dates=[]
 for d in documents:
  if d['kind'] in {'BIZ','Tagesauswertung'}:
   try:
    rr=PdfReader(ROOT/d['file'])
    tt=rr.pages[0].extract_text() or '';m=re.search(r'- (\d{2}\.\d{2}\.\d{4})',tt)
    if m:report_dates.append(datetime.strptime(m[1],'%d.%m.%Y').date())
   except Exception:pass
 cutoff=max(report_dates).isoformat() if report_dates else None
 for s in stats:
  last=f'{s["year"]}-{(s["quarter"] or 4)*3:02d}-'+str([31,30,30,31][(s['quarter'] or 4)-1])
  capture=datetime.strptime(s['created'][:8],'%Y%m%d').date().isoformat()
  s['complete']=last<min(cutoff or capture,capture)
  s['coverageEnd']=min(last,cutoff or capture,capture)
 flatServices=[]
 for s in services:
  capture=datetime.strptime(s['created'][:8],'%Y%m%d').date().isoformat()
  end=datetime.strptime(s['end'],'%d.%m.%Y').date().isoformat()
  s['complete']=end<min(cutoff or capture,capture)
  for row in s['rows']:
   base=re.sub(r'\*.*$','',row['code']);desc=lexmap.get(base,{})
   flatServices.append({**row,'year':s['year'],'baseCode':base,'description':desc.get('description',base),'currentPrice':desc.get('currentPrice'),'group':category(base),'file':s['file'],'start':s['start'],'end':s['end'],'complete':s['complete']})
 discrepancies=[]
 for year in sorted({r['year'] for r in stats}):
  a=next((r for r in stats if r['year']==year and r['quarter'] is None),None);ss=next((r for r in services if r['year']==year),None);b=annualBiz.get(year)
  if a:
   discrepancies.append({'year':year,'patientStats':a['amount'],'serviceList':ss['total']['amount'] if ss else None,'biz':b.get('amount') if b else None,'patientCount':a['patients'],'bizPatientCount':b.get('patients') if b else None})
 files=lambda names:[{'label':x} for x in dict.fromkeys(names)]
 baseSource={'provider':'Vom Nutzer bereitgestellte PDF-Auswertungen','executedAt':now,'caveats':['Keine Verbindung zur Ordinationssoftware; Aktualisierung erfolgt durch PDF-Import.','Mengen sind erfasste Leistungspositionen, keine Patientensitzungen.'],'evidenceFlow':[{'kind':'method','title':'Reproduzieren','detail':'dashboard-tools/prepare_data.py liest die PDF-Tabellen, prüft Summen und wählt je Berichtstyp und Zeitraum die zuletzt erstellte gültige Datei. Keine Addition überlappender Patientenzahlen.'}]}
 queries={}
 def add(qid,rows,names,defs,caveats=[]):
  queries[qid]={'rows':rows,'source':{**baseSource,'evidenceFlow':[dict(step) for step in baseSource['evidenceFlow']],'label':qid.replace('_',' '),'files':files(names),'metricDefinitions':[{'label':label,'definition':definition} for label,definition in defs],'caveats':baseSource['caveats']+caveats}}
 add('patient_periods',[{k:v for k,v in r.items() if k!='sections'} for r in stats],[r['file'] for r in stats],[('Behandelte Personen','Patientenzahl innerhalb genau des ausgewählten Berichtszeitraums. Quartale enthalten wiederkehrende Personen und werden nicht zu einer Jahreszahl addiert.'),('Wert erbrachter Leistungen','Betrag der erfassten Leistungen inklusive Kassen- und Patientenanteil; keine Aussage über Zahlungseingang oder Gewinn.'),('Wert je behandelter Person','Leistungswert geteilt durch Patientenzahl desselben Berichtszeitraums.')],['Das laufende Jahr und Quartal sind nur bis zum Berichtsstand erfasst.'])
 pflege=candidates.get(('pflegeheim',care_year),{}).get('rows',[])
 add('pflegeheim_periods',pflege,[r['file'] for r in pflege],[('Pflegeheim-Liste','Vom Nutzer als Pflegeheim-Kooperation bezeichnete Liste. Eindeutige interne Patientennummern je Jahr bzw. anhand datierter Vi-Leistungen je Quartal. Nur aggregierte Zählungen werden gespeichert; keine Namen, Versicherungsnummern oder Patientenkennungen.'),('Einträge und Personen','Leistungspositionen und Patientenblöcke werden gegen die gedruckten Summen der Liste geprüft.')],['Eine Leistungszeile ohne gedrucktes Datum ist nur im Jahresbetrag enthalten. Quartalszählungen verwenden datierte Leistungen, keine Quartalssummen für den Jahresabzug.','Die Liste belegt keine Einstufung als Neupatient und keine vollständige altersbezogene Zuordnung. BIZ-Neupatienten und Altersverteilung bleiben Gesamtbestände.'])
 add('pflegeheim_service_totals',[{k:v for k,v in r.items() if k!='sections'} for r in ph_stats],[r['file'] for r in ph_stats],[('Pflegeheim-Leistungswert','Vom Nutzer als vollständige Pflegeheim-Auswertung bezeichnete Patientenstatistik (Dateiname beginnt mit „PH Leistung“). Teilmenge der gesamten Jahresauswertung, niemals Ersatz oder zusätzlicher Umsatz.'),('Abgrenzung zur Vi-Liste','Die Vi-Positionen der Pflegeheim-Liste sind im Pflegeheim-Gesamtwert enthalten und werden nicht addiert.')],['Leistungswert ist kein Nachweis über den Zahlungseingang. Keine quartalsweise Verteilung aus einem Jahreswert ableiten.'])
 for ph in ph_stats:
  base=next((r for r in stats if r['year']==ph['year'] and r['quarter']==ph['quarter']),None)
  if base and (ph['amount']>base['amount'] or ph['patients']>base['patients']):raise ValueError('Pflegeheim-Teilmenge überschreitet Gesamtstatistik.')
 adjusted=[]
 for row in queries['patient_periods']['rows']:
  pf=next((p for p in pflege if p['year']==row['year'] and p['quarter']==row['quarter']),None)
  excluded=pf['patients'] if pf else 0
  if excluded>row['patients']:raise ValueError('Pflegeheim-Abzug überschreitet Patientenstatistik.')
  adjusted.append({**row,'reportedPatients':row['patients'],'pflegeheimPatients':excluded,'patients':row['patients']-excluded})
 add('ordination_periods',adjusted,[r['file'] for r in stats]+[r['file'] for r in pflege],[('Personen der Ordination','Originalzahl der Patientenstatistik minus eindeutige Patientenblöcke der bestätigten Pflegeheim-Liste im selben Zeitraum. Andere Jahre werden mangels einer bestätigten Ausschlussliste nicht verändert.'),('Leistungswert und Verhältnis','Geldbeträge bleiben Gesamtwerte einschließlich Pflegeheim. Ein Gesamt-Leistungswert je Person verwendet daher reportedPatients, niemals den bereinigten Nenner patients.')],['Pflegeheim-Patienten werden nach Nutzeranweisung aus den Personenkennzahlen ausgeschlossen. Die Originalzahlen bleiben unter reportedPatients und patient_periods erhalten.','Quartalsabzüge betreffen Personen mit datierten Vi-Leistungen im jeweiligen Quartal; zusätzliche Besuche anderer Art ohne Vi sind aus dieser Liste nicht abgedeckt.','BIZ-Neupatienten, Sitzungen und Altersverteilung sind nicht bereinigt; ein fehlender Abzug anderer Jahre ist kein Beweis, dass dort keine externen Patienten behandelt wurden.'])
 context_file=ROOT/'dashboard-tools/practice-context.json'
 context=json.loads(context_file.read_text()) if context_file.exists() else {'rows':[]}
 queries['practice_context']={'rows':context['rows'],'source':{'provider':'Angaben des Nutzers','label':'Urlaub und Arbeitskapazität','executedAt':now,'files':[],'metricDefinitions':[{'label':'Urlaubswochen','definition':'Vom Nutzer in practice-context.json eingetragene Urlaubswochen je Monat und Quartal. Keine Umrechnung in Arbeitstage oder Arbeitsstunden.'}],'caveats':['Genaue Daten, reguläre Öffnungstage, tatsächliche Arbeitsstunden und eine etwaige Vertretung sind unbekannt.','Urlaub und Arbeitskapazität im Vergleichszeitraum sind meist unbekannt. Daher keine Kennzahlen pro Öffnungstag und keine Aussage über eine bewiesene Produktivitätssteigerung.'],'evidenceFlow':[{'kind':'source','title':'Angaben des Nutzers','detail':'practice-context.json. Die Angabe bleibt beim PDF-Neueinlesen erhalten.'}]}}
 add('biz_patients',list(annualBiz.values())+list(quarterBiz.values()),[b['file'] for b in annualBiz.values()]+[b['file'] for b in quarterBiz.values()],[('Neue Patienten','Vom BIZ-Bericht als neu gezählte Patienten; Definition des Programms nicht weiter dokumentiert.'),('Sitzungen','Patientensitzungen laut BIZ; getrennt von Leistungspositionen.'),('Offene Behandlungspläne','BIZ-Gesamtbetrag offener Planungen; kein gesicherter zukünftiger Umsatz.')],['Die BIZ-Patientenzahlen weichen geringfügig von der Patientenstatistik ab. Nicht miteinander zu einer Retentionquote kombinieren.','Neue und behandelte Patienten aus Jahresberichten sind 2026 nicht mit vollen Vorjahren vergleichbar.','BIZ allein liefert keine individuelle Patientenbindung. Die zusätzlichen anonymisierten Leistungsdetails enthalten stabile Referenzen; tatsächlicher Besuch und Inaktivitätszeitraum müssen für eine Bindungsanalyse definiert werden.'])
 add('service_codes',flatServices,[r['file'] for r in services]+[lex['file']],[('Leistungsgruppen','Analytische Gruppierung der Leistungskürzel (siehe category() in prepare_data.py). Digitale Restaurationen umfassen digital gefertigte Inlays, Onlays und Kronen. BT, Recall sowie PDTP und PDTPF gehören zur Parodontologie; genaue Dauer und Sitzungszahl je Code sind unbekannt. PDTE (Endo-Lasertherapie) wird den Wurzelbehandlungen zugeordnet.'),('Leistungswert','Originalbetrag je Code, nicht aktuelle Lexikonpreise multipliziert mit historischer Menge.'),('Menge','Anzahl erfasster Positionen je Code. Dokumentation, Preisnachlässe und versäumte Termine werden separat geführt.')],['Nur Jahresauswertungen je Leistung vorhanden; keine Aufteilung der Codes nach Quartal.','Preise im Lexikon sind aktuelle Preise; historische Tarifänderungen unbekannt.'])
 demographics=[]
 for r in stats:
  if r['quarter'] is None:
   for dim in ['Alter','Geschlecht']:
    for row in r['sections'].get(dim,[]):demographics.append({'year':r['year'],'dimension':dim,**row,'file':r['file']})
 add('patient_segments',demographics,[r['file'] for r in stats if r['quarter'] is None],[('Patientengruppen','Alters- und Geschlechtsverteilung innerhalb der jeweiligen jährlichen Patientenstatistik.')],['Keine Aussage über individuelle Patientenbindung oder Behandlungsqualität.'])
 add('reconciliation',discrepancies,[r['file'] for r in stats if r['quarter'] is None]+[s['file'] for s in services]+[b['file'] for b in annualBiz.values()],[('Abgleich','Gedruckte Jahressummen der drei Berichtsfamilien. BIZ ist auf ganze Euro gerundet.')],['Abweichungen bleiben sichtbar; Ursachen wie Berichtszeit oder Filter sind nicht bestätigt.'])
 bank_raw=combine(bank_statements)
 bank_rows=[classify(r) for r in bank_raw]
 cooperation_context=care
 for r in bank_rows:
  if r.get('cooperation')=='Pflegeheim':
   r['costServiceYear']=cooperation_context['paymentServiceYears'].get(r['id'])
   r['basis']=f'Nutzer: Kosten der Pflegeheim-Kooperation ({cooperation_context.get("partnerLabel","Partner")}); Leistungsjahr nur für bestätigte Buchungs-IDs, Zahlungsdatum bleibt unverändert.'
   r['cooperationBasis']=cooperation_context['basis'] if r['costServiceYear'] else 'Pflegeheim bestätigt; Leistungsjahr dieser neuen Buchung noch offen.'
 assignment_context=load_bank_assignments()
 bank_rows=apply_bank_assignments(bank_rows,assignment_context)
 coverage=[]
 for account in sorted({s['account'] for s in bank_statements}):
  ss=[s for s in bank_statements if s['account']==account];earliest=min(ss,key=lambda s:s['start']);latest=max(ss,key=lambda s:s['end']);rr=[r for r in bank_raw if r['account']==account]
  if sum(r['amountCents'] for r in rr)!=latest['closingCents']-earliest['openingCents']:raise ValueError('Überlappende Bankexporte lassen sich nicht eindeutig abstimmen. Bisherige Ansicht bleibt erhalten.')
  coverage.append({'account':account,'label':latest['accountLabel'],'start':earliest['start'],'end':latest['end'],'opening':earliest['openingCents']/100,'closing':latest['closingCents']/100,'rows':len(rr),'overlapRemoved':sum(len(s['rows']) for s in ss)-len(rr),'balanceChecks':sum(s['checks'] for s in ss),'files':len(ss)})
 bank_names=[s['file'] for s in bank_statements]
 add('bank_transactions',bank_rows,bank_names,[('Zahlungen','Tatsächlich gebuchte Beträge in EUR nach Buchungsdatum. Positive Beträge sind Eingänge; negative Beträge sind Ausgänge. Keine Gleichsetzung mit Leistungswert oder Gewinn.'),('Zuordnung','Persönliche Empfängerregeln aus bank-rules.json (z. B. Miete, Labor, Fremdleistungen) sind vom Nutzer bestätigt. Zahnärztekammer-Eingänge: Kassenabrechnung; Bareinzahlungen: zuvor bar bezahlte Patientenhonorare, kein zusätzlicher Umsatz neben dem ursprünglichen Honorar. Andere Gruppen sind anhand des Banktexts abgeleitet; unklare Zwecke bleiben sichtbar.'),('Überlappung','Gleiche Buchungen aus überlappenden Exporten werden mit der höchsten beobachteten Häufigkeit je Konto, Buchungs-/Valutadatum, Betrag und normalisiertem vollständigem Text übernommen. Echte gleichlautende Wiederholungen bleiben erhalten.'),('Kartenabrechnung','HOBEX-Eingänge sind netto. TURNOVER minus Gutschrift wird als einbehaltenes Kartenentgelt ausgewiesen und nicht noch einmal zu Bankausgängen addiert.')],['Das Konto enthält private und betriebliche Zahlungen. Ordinationszahlungen sind keine steuerlich geprüften Betriebsausgaben.','Kreditraten enthalten einen unbekannten Tilgungs-/Zinsanteil. Kosten pro einzelner Leistung sind ohne Rechnungs-/Fallverknüpfung nicht berechenbar.','Keine Wachstumsrate aus ungleichen Bankzeiträumen; die Abdeckung steht unter bank_coverage.','Personennamen bei individuellen Eingängen und Löhnen sowie lange persönliche Referenzen sind in der Ansicht reduziert; Originalbelege bleiben erhalten.'])
 queries['bank_transactions']['source']['caveats']=[x for x in queries['bank_transactions']['source']['caveats'] if not x.startswith('Mengen sind')]
 queries['bank_transactions']['source']['evidenceFlow']=[{'kind':'method','title':'Bankauswertung reproduzieren','detail':'dashboard-tools/bank_data.py extrahiert alle Zeilen in ganzzahligen Cent, gleicht aufeinanderfolgende Tagessalden und den Gesamtsaldo ab und führt überlappende Exporte zusammen.'}]
 queries['bank_transactions']['source']['metricDefinitions'].append({'label':'Manuelle Zuordnung','definition':'Im Panel bestätigte Zuordnungen gelten nur für ausgewählte bestehende Buchungs-IDs. Beträge und Originalquellen bleiben unverändert. Zukünftige Zahlungen werden nicht automatisch gleich zugeordnet. Persönlich/betrieblich ist keine steuerliche Prüfung.'})
 queries['bank_transactions']['source']['evidenceFlow'].append({'kind':'source','title':'Zuordnungen aus dem Ordinationspanel','detail':'dashboard-tools/bank-assignments.json speichert ausdrücklich bestätigte bestehende Buchungs-IDs, Kategorien, kurze Notizen und Änderungen. Die automatische Ursprungszuordnung bleibt je Buchung erhalten.'})
 add('bank_assignments',bank_assignment_rows(bank_rows,assignment_context),['dashboard-tools/bank-assignments.json'],[('Gespeicherte Zuordnungen','Explizite Nutzerzuordnung pro stabiler bestehender Bankbuchung. Frühere/automatische Zuordnung und Originalbeschreibung bleiben erhalten. Neue Zahlungen sind nicht umfasst.')])
 add('bank_coverage',coverage,bank_names,[('Bankabdeckung','Ältestes und neuestes gebuchtes Datum. Anfangssaldo wird aus ältestem Tagessaldo minus dessen Buchungen abgeleitet; Schlusssaldo ist gedruckt. Anfangssaldo ist kein zusätzlicher Eingang.')])
 # The association is a subset of existing practice costs, never a second cash flow.
 cooperation_payments=[r for r in bank_rows if r.get('cooperation')=='Pflegeheim' and r['amount']<0]
 cooperation_finance=[]
 for r in ph_stats:
  if r['quarter'] is None:
   yr=r['year'];matched=[p for p in cooperation_payments if p['costServiceYear']==yr];cost=sum(round(-p['amount']*100) for p in matched)/100
   complete=yr in cooperation_context['completeServiceYears']
   overall=next((p for p in stats if p['year']==yr and p['quarter'] is None),None)
   cooperation_finance.append({'kind':'Leistungsjahr','year':yr,'serviceValue':r['amount'],'file':r['file'],'patients':r['patients'],'serviceRows':r['serviceRows'],'totalServiceValue':overall['amount'] if overall else None,'otherPracticeServiceValue':round(overall['amount']-r['amount'],2) if overall else None,'partnerLabel':cooperation_context.get('partnerLabel','Partner'),'partnerPaid':cost,'difference':round(r['amount']*100-cost*100)/100,'payments':len(matched),'servicesCompleteConfirmed':complete,'collectedIncome':None,'status':'Leistungswert minus zugeordnete Partner-Zahlungen; vor weiteren Kosten, kein Zahlungssaldo oder steuerlicher Gewinn'})
 for year in sorted({r['year'] for r in cooperation_payments}):
  rr=[r for r in cooperation_payments if r['year']==year]
  cooperation_finance.append({'kind':'Zahlungsjahr','year':year,'amount':sum(round(-r['amount']*100) for r in rr)/100,'payments':len(rr),'unassignedServiceYear':sum(round(-r['amount']*100) for r in rr if r['costServiceYear'] is None)/100,'status':'Teilmenge der Ordinationsauszahlungen, nach Bankdatum'})
 add('pflegeheim_finance',cooperation_finance,[r['file'] for r in ph_stats]+[r['file'] for r in pflege]+[r['file'] for r in stats if r['quarter'] is None]+bank_names,[('Verknüpfung',cooperation_context.get('basis','')),('Berechnung','Leistungsjahr: vollständiger Leistungswert laut Liste minus erfasste, vom Nutzer demselben Leistungsjahr zugeordnete Partner-Zahlungen, in Cent gerechnet. Weitere Projektkosten nicht vollständig erfasst; kein endgültiger Gewinn. Zahlungsjahr: unverändertes tatsächliches Bankdatum.'),('Keine Doppelzählung','Partner-Zahlungen bleiben unter ihrer Ordinationskategorie. Projektansicht und Zahlungsjahre sind Teilmengen, keine zusätzlichen Kosten. Projektwert bleibt Teil der Gesamtleistungen, keine neue Einnahme.'),('Vollständigkeit','Die vollständige Pflegeheim-Auswertung gilt nur für das bestätigte Leistungsjahr. Die Vi-Liste ist nur eine Teilmenge. Fehlende Bankmonate und zugeordnete Zahlungseingänge bleiben unbekannt. Neue Partner-Buchungen werden als Pflegeheim markiert, aber nicht automatisch einem Leistungsjahr zugeordnet.')],['Das Ergebnis zeigt nur Leistungswert minus bisher belegte Partner-Zahlungen. Andere Kosten wie Material, Personal, Fahrten und Gemeinkosten sowie eventuelle frühere Zahlungen sind nicht vollständig verknüpft.','Die Differenz zwischen Leistungswert und Zahlungen ist kein Nachweis offener Forderungen. Kassen-Sammelzahlungen sind noch nicht projektbezogen verknüpft.'])
 queries['pflegeheim_finance']['source']['caveats']=[x for x in queries['pflegeheim_finance']['source']['caveats'] if not x.startswith('Mengen sind')]
 queries['pflegeheim_finance']['source']['evidenceFlow']=[{'kind':'source','title':'Bestätigung des Nutzers','detail':cooperation_context.get('basis','')},{'kind':'method','title':'Getrennte Zeitachsen und stabile Buchungskennungen','detail':'pflegeheim-finance-context.json verknüpft nur bestätigte Buchungs-IDs mit einem Leistungsjahr. Nach jedem Import erneut aus deduplizierten Bankbuchungen berechnet. Zahlungsjahr bleibt unverändert.'}]
 patient_details=[];patient_summaries=[]
 for key,value in candidates.items():
  if key[0]!='patient_services':continue
  summary=value['summary'];year=summary['year'];ref=next((r for r in stats if r['year']==year and r['quarter'] is None),None)
  patient_summaries.append({**summary,'patientStatsValue':ref['amount'] if ref else None,'patientStatsPatients':ref['patients'] if ref else None,'differenceToPatientStats':round(summary['recordedValue']-ref['amount'],2) if ref else None,'patientStatsFile':ref['file'] if ref else None})
  for row in value['rows']:
   base=re.sub(r'\*.*$','',row['code']);patient_details.append({**row,'group':category(base),'description':lexmap.get(base,{}).get('description',base)})
 patient_names=[r['file'] for r in patient_summaries]
 definitions=[('Rot / Planung','Rote Zeilen sind noch in Planung. PDF-Textfarbe RGB 1,0,0; rote Leistungszeilen werden gegen die gedruckte Zeile Planungen abgestimmt. Keine gesicherten zukünftigen Einnahmen.'),('Nicht rote Leistungszeilen','Schwarze Leistungszeilen werden mit Patienten-Zwischensummen und Privat+Kasse abgestimmt. Die gedruckte Anzahl Einträge ist die Summe der schwarzen und roten Leistungszeilen. Erfasst bedeutet nicht bezahlt. Andere Textfarben in Leistungszeilen führen zu einer Prüfmeldung.'),('Patientenbezug',patient_context['basis']+' Es wird nur eine lokal gesalzene pseudonyme Referenz gespeichert. Keine Namen, Geburts-/Versicherungsdaten, Zahnnummern oder klinischen Notizen im Snapshot.'),('Abgrenzung','Diese Detaildateien sind zusätzliche Sichten auf dieselben Leistungen; keine Addition zu bestehenden Jahres-Leistungswerten, Bankeingängen oder BIZ-Planungssummen. Jahresdateien sind keine Zeitreihe des offenen Planbestands. Über Jahre dürfen Planwerte und Personen nicht ungeprüft addiert werden.'),('Patientenanteil','Der gedruckte Patientenanteil ist in der Kassenposition enthalten; Planwert ist Privat plus Kasse, ohne nochmalige Addition des Patientenanteils.')]
 caveats=['2026 und frühere Dateien können einen anderen Erstellungsstand oder Filter als die bisherige Patientenstatistik haben. Abweichungen werden offengelegt; keine automatische Überschreibung.','Planungswerte sind dokumentierte Beträge, keine Abschlusswahrscheinlichkeit, Terminzusage, Zahlung oder Gewinn. Keine Abwanderungsquote ohne definierte inaktive Zeit.']
 add('patient_service_summary',sorted(patient_summaries,key=lambda r:r['year']),patient_names+[r['patientStatsFile'] for r in patient_summaries if r['patientStatsFile']],definitions,caveats)
 add('patient_service_records',patient_details,patient_names,definitions,caveats)
 for qid in ['patient_service_summary','patient_service_records']:
  queries[qid]['source']['evidenceFlow']=[{'kind':'source','title':'Farbdefinition und stabile Nr durch Nutzer bestätigt','detail':patient_context['basis']},{'kind':'method','title':'Farbtreue und Summenprüfung','detail':'patient_service_data.py liest die echte PDF-Textfarbe zeilenweise, gleicht nicht rote/rote Beträge getrennt mit den gedruckten Summen ab und verwirft Namen und klinische Notizen. Änderungen der Originaldatei erzeugen durch SHA-256 einen neuen Cache.'}]
 apply_practice_scope(queries,ROOT,ph_stats,care)
 active_hashes=set()
 for value in candidates.values():
  digest=value.get('sha256') or value.get('summary',{}).get('sha256')
  if digest:active_hashes.add(digest)
 for doc in documents:
  doc['selection']='Aktiv' if doc['sha256'] in active_hashes or doc['kind'] in ['Bank-Umsatzübersicht','Tagesauswertung','Bild-PDF'] else 'Archiv / ältere Version'
 add('file_inventory',documents,[d['file'] for d in documents],[('Dateien','Eingelesene Originaldateien mit SHA-256 und Erstellungszeit. Originaldateien bleiben unverändert.')])
 previous={}
 if (APP/'src/data.json').exists():previous=json.loads((APP/'src/data.json').read_text())
 snapshot={'id':previous.get('id','ordi-performance-2026'),'surface':'dashboard','title':'Ordinationsüberblick','generatedAt':now,'status':'provided','buildStatus':os.environ.get('ORDI_BUILD_STATUS','creating'),'filters':[],'queries':queries,'observationCutoff':cutoff,'importIssues':errors+unsupported,'careHomeYear':care_year if pflege or ph_stats else None,'userContext':{'digital':'Digital gefertigte Inlays, Onlays und Kronen; genaue Zuordnung der KU-Codes offen.','perio':'BT, Rec und PDT: Parodontologie, Unterschiede in Zeit und Sitzungen.','prices':'Lexikonpreise sind aktuell; historische Änderungen unbekannt.'}}
 if not persist:return snapshot
 out=APP/'src/data.json' if (APP/'src').exists() else ROOT/'dashboard-tools/reviewed-snapshot.json'
 out.write_text(json.dumps(snapshot,ensure_ascii=False,indent=2))
 report_file=ROOT/'bericht/src/data.json'
 if report_file.exists():
  prior_report=json.loads(report_file.read_text())
  report_snapshot={**snapshot,'id':prior_report['id'],'surface':'report','title':('تحلیل عملکرد و گردش حساب مطب' if prior_report.get('title') in [None,'Entwicklung der Ordination'] else prior_report['title']),'report':{'asOf':cutoff,'visibleFilterIds':[]}}
  report_file.write_text(json.dumps(report_snapshot,ensure_ascii=False,indent=2))
 manifest={'generatedAt':now,'files':len(documents),'patients':len(stats),'serviceRows':len(flatServices),'issues':errors+unsupported,'cutoff':cutoff}
 (ROOT/'dashboard-tools/import-status.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
 print(json.dumps(manifest,ensure_ascii=False))
 return snapshot
if __name__=='__main__':build()
