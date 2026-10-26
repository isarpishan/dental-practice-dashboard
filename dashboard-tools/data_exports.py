"""Local table exports and checksummed data backups. No external services."""
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
from collections import defaultdict
import csv,io,json,hashlib,zipfile,os
from import_store import backup_database,history
ROOT=Path(__file__).resolve().parent.parent
BACKUPS=ROOT/'Sicherungen'
def stamp():return datetime.now(ZoneInfo('Europe/Vienna')).strftime('%Y%m%d-%H%M%S-%f')
def snapshot():return json.loads((ROOT/'dashboard/src/data.json').read_text())
def check_version(payload):
 data=snapshot()
 if payload.get('snapshotVersion')!=data['generatedAt']:raise ValueError('Die Daten wurden inzwischen aktualisiert. Bitte die Ansicht neu öffnen.')
 if data.get('buildStatus')!='complete':raise ValueError('Die Ansicht wird gerade bearbeitet. Bitte danach erneut versuchen.')
 return data
def safe_cell(value):
 if value is None:return ''
 if isinstance(value,bool):return 'ja' if value else 'nein'
 if isinstance(value,(int,float)):return str(value).replace('.',',')
 if isinstance(value,(dict,list)):value=json.dumps(value,ensure_ascii=False)
 value=str(value)
 return "'"+value if value.lstrip().startswith(('=','+','-','@','\t','\r')) else value
def csv_bytes(rows):
 columns=list(dict.fromkeys(key for row in rows for key in row))
 out=io.StringIO(newline='');writer=csv.writer(out,delimiter=';',lineterminator='\r\n');writer.writerow(columns)
 for row in rows:writer.writerow([safe_cell(row.get(key)) for key in columns])
 return ('\ufeff'+out.getvalue()).encode('utf-8')
def table_export(data):
 datasets={'Ordinationspatienten':data['queries']['ordination_periods']['rows'],'Original_Patientenstatistik':data['queries']['patient_periods']['rows'],'BIZ_Ordination':data['queries']['ordination_biz_patients']['rows'],'BIZ_Original_Gesamtbestand':data['queries']['biz_patients']['rows'],'Leistungen':data['queries']['ordination_service_codes']['rows'],'Leistungen_Original':data['queries']['service_codes']['rows'],'Altersverteilung_Ordination':data['queries']['ordination_patient_segments']['rows'],'Bankbuchungen':data['queries']['bank_transactions']['rows'],'Bankabdeckung':data['queries']['bank_coverage']['rows'],'Pflegeheim_Abzug':data['queries']['pflegeheim_periods']['rows'],'Urlaub':data['queries']['practice_context']['rows'],'Berichtsabgleich':data['queries']['reconciliation']['rows']}
 datasets['Patienten_Leistungsdetails']=[r for r in data['queries'].get('patient_service_records',{}).get('rows',[]) if not r.get('pflegeheimExcluded')]
 datasets['Patienten_Leistungsdetails_Original']=data['queries'].get('patient_service_records',{}).get('rows',[])
 datasets['Patienten_Planungssummen']=data['queries'].get('ordination_patient_service_summary',{}).get('rows',[])
 datasets['Patienten_Planungssummen_Original']=data['queries'].get('patient_service_summary',{}).get('rows',[])
 datasets['Pflegeheim_Vollstaendiger_Abzug']=data['queries']['pflegeheim_exclusion']['rows']
 datasets['Quelldateien']=data['queries']['file_inventory']['rows']
 datasets['Importhistorie']=history()['runs']
 datasets['Manuelle_Bankzuordnungen']=data['queries'].get('bank_assignments',{}).get('rows',[])
 datasets['Pflegeheim_Leistungsstatistik']=data['queries']['pflegeheim_service_totals']['rows']
 datasets['Pflegeheim_Finanzen']=data['queries']['pflegeheim_finance']['rows']
 datasets['Pflegeheim_Zahlungen']=[r for r in datasets['Bankbuchungen'] if r.get('cooperation')=='Pflegeheim']
 costs=defaultdict(lambda:{'amountCents':0,'payments':0})
 for row in datasets['Bankbuchungen']:
  if row['amount']>=0:continue
  key=(row['year'],row['bucket'],row['category']);costs[key]['amountCents']+=round(-row['amount']*100);costs[key]['payments']+=1
 datasets['Kostenkategorien']=[{'year':year,'bucket':bucket,'category':category,'outgoing':r['amountCents']/100,'payments':r['payments']} for (year,bucket,category),r in sorted(costs.items())]
 info={'format':'ordi-tables-v1','generatedAt':data['generatedAt'],'observationCutoff':data['observationCutoff'],'rows':{name:len(rows) for name,rows in datasets.items()},'sources':{name:q['source'] for name,q in data['queries'].items()}}
 readme='''ORDINATION – TABELLENEXPORT
CSV-Dateien: UTF-8 mit BOM, Semikolon, Dezimalkomma. In Excel oder Numbers öffnen/importieren.
Der Export enthält alle verfügbaren Jahre und Zeiträume, unabhängig von den Bildschirmfiltern.
Leere Zellen sind unbekannte Werte, keine Null. Personen mehrerer Quartale nicht zu Jahreszahlen addieren.
Ordinationspatienten enthält einen etwaigen Pflegeheim-Abzug; reportedPatients ist die Originalzahl.
Im Kooperationsjahr (falls konfiguriert): Betrag, Personen, Alter und Leistungsdetails ohne Pflegeheim.
BIZ_Ordination lässt im Kooperationsjahr unbekannte Werte leer; kein pauschaler Abzug von neuen Patienten oder Sitzungen.
Original-Dateien sind ausdrücklich gekennzeichnet und enthalten Gesamtwerte.
Mengeneinheiten und Patienten-/Kassenanteile betroffener Codes im Kooperationsjahr bleiben unbekannt.
Bankbuchungen bleiben unverändert; Bankeingänge sind keine zusätzlichen Leistungen.
Pflegeheim_Finanzen trennt Leistungsjahr und Zahlungsjahr. Leistungsjahr: nur ausdrücklich bestätigte Partner-Zahlungen. Differenz vor weiteren Kosten, kein endgültiger Gewinn. Zugeordnete Eingänge offen.
Pflegeheim_Zahlungen ist eine Teilmenge von Bankbuchungen, niemals zusätzlich zu Gesamtkosten addieren.
Patienten_Leistungsdetails trennt rot/geplant von nicht rot/erfasst, mit lokal anonymisierter Patientenreferenz.
Planungen sind keine Einnahmen. Detailwerte nicht zusätzlich zu den bestehenden Leistungswerten oder BIZ-Planungen addieren.
Kostenkategorien summiert Bankausgänge nach Jahr, Bereich und Kategorie. Das ist kein Gewinn.
Bankzeiträume siehe Bankabdeckung. Metadaten.json enthält Quellen und Definitionen.
Texte, die als Tabellenformel interpretiert werden könnten, erhalten ein führendes Apostroph.
CSV-Export ist zum Weiterarbeiten; zum Einlesen in das Panel bitte die unterstützten Original-PDFs verwenden.
'''
 out=io.BytesIO()
 with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED) as archive:
  for name,rows in datasets.items():archive.writestr(name+'.csv',csv_bytes(rows))
  archive.writestr('Metadaten.json',json.dumps(info,ensure_ascii=False,indent=2));archive.writestr('Liesmich.txt',readme)
 return out.getvalue()
def backup_files():
 paths=[p for p in (ROOT/'Leistungsaufstellung').glob('**/*.pdf') if p.is_file()]+[p for p in ROOT.glob('*.pdf') if p.is_file()]+[p for p in (ROOT/'Eingang').glob('**/*.pdf') if p.is_file()]
 for app in ['dashboard','bericht']:
  p=ROOT/app/'src/data.json'
  if p.exists():paths.append(p)
  paths.extend(p for p in (ROOT/app/'src/content').rglob('*') if p.is_file() and not p.is_symlink())
 paths.extend(p for p in (ROOT/'dashboard-tools').iterdir() if p.is_file() and p.suffix in ['.py','.json','.mjs','.swift'])
 paths.extend(ROOT/name for name in ['dashboard/src/charting/CategoryAxisTick.jsx', 'dashboard/src/charting/ChartRenderer.jsx', 'dashboard/src/theme.css', 'dashboard/protected-runtime.json', 'dashboard/package.json', 'dashboard/package-lock.json'] if (ROOT/name).is_file())
 paths.extend(p for p in ROOT.glob('*.md') if p.is_file())
 return sorted(set(paths))
def create_backup(reason='manual'):
 BACKUPS.mkdir(exist_ok=True);files=backup_files()
 entries=[{'path':str(p.relative_to(ROOT)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]
 database=backup_database()
 database_entry={'path':'.local-state/ordination.sqlite3','bytes':len(database),'sha256':hashlib.sha256(database).hexdigest()}
 entries.append(database_entry)
 fingerprint=hashlib.sha256(json.dumps(entries,sort_keys=True).encode()).hexdigest()
 index=BACKUPS/'letzte-sicherung.json'
 if index.exists():
  previous=json.loads(index.read_text());old=BACKUPS/previous['filename']
  if previous.get('fingerprint')==fingerprint and old.is_file():return old
 path=BACKUPS/f'Ordi-Datensicherung-{stamp()}.zip';partial=path.with_suffix('.partial')
 manifest={'format':'ordi-backup-v1','createdAt':datetime.now(ZoneInfo('Europe/Vienna')).isoformat(timespec='seconds'),'reason':reason,'fingerprint':fingerprint,'files':entries,'includesBrowserAppearance':False}
 with zipfile.ZipFile(partial,'w',compression=zipfile.ZIP_DEFLATED) as archive:
  for item,p in zip(entries,files):archive.write(p,item['path'])
  archive.writestr(database_entry['path'],database)
  archive.writestr('Sicherungsmanifest.json',json.dumps(manifest,ensure_ascii=False,indent=2))
  archive.writestr('Wiederherstellung.txt','Datensicherung der Original-PDFs, geprüften Daten, Analyseinhalte und Zuordnungsregeln.\nFür eine Wiederherstellung zuerst in einen neuen Ordner entpacken, niemals die einzige Kopie überschreiben. Die Original-PDFs können im Panel wieder eingelesen werden. practice-context.json und die Zuordnungsregeln sind unter dashboard-tools enthalten.\nZum Erhalt der gesamten Anwendung zusätzlich den vollständigen Projektordner kopieren. Die lokale Laufzeit und die Programme sind in dieser Datensicherung nicht enthalten. Browser-Ansichtseinstellungen sind nicht enthalten.\n')
 os.replace(partial,path)
 index.write_text(json.dumps({'filename':path.name,'createdAt':manifest['createdAt'],'fingerprint':fingerprint},indent=2))
 return path
def last_backup():
 p=BACKUPS/'letzte-sicherung.json'
 return json.loads(p.read_text()) if p.exists() else None
