"""Aggregate the user-designated Pflegeheim list without retaining patient identities."""
from collections import defaultdict
from decimal import Decimal
import re

def parse_pflegeheim(reader,filename,digest,created,year):
 texts=[p.extract_text() or '' for p in reader.pages]
 title=re.search(r'Leistungsaufstellung für das Jahr (\d{4}) - (\d+) Einträge',texts[0])
 if not title or int(title[1])!=year:raise ValueError(f'Pflegeheim-Zuordnung ist nur für die bestätigte Liste {year} freigegeben.')
 header=re.compile(r'^.+?\s+([MWX])\s+(\d+)\s+(\S+)\s+\d{2}(?:\s|$)')
 service=re.compile(r'^\s*(?:(\d{2}\.\d{2}\.\d{2})\s+)?[^\n]*?\bVi\s+.*?\s+([\d.]+,\d{2})\s+(?:ÖGK|BVA|SVS|KFA)')
 amount=lambda s:Decimal(s.replace('.','').replace(',','.'))
 records={};current=None;entries=0;undated=0;quarter_ids=defaultdict(set);subtotal_count=0
 for page in texts:
  for line in page.splitlines():
   m=header.match(line)
   if m:
    current=m[2]
    if current in records:raise ValueError('Patientennummer erscheint mehrfach als eigener Block.')
    records[current]={'amount':Decimal(0),'count':0};continue
   m=service.match(line)
   if m:
    if current is None:raise ValueError('Pflegeheim-Leistung ohne zugeordneten Patientenblock.')
    entries+=1;records[current]['count']+=1;records[current]['amount']+=amount(m[2])
    if m[1]:
     if m[1][-2:]!=str(year)[-2:]:raise ValueError(f'Datum außerhalb {year}.')
     quarter_ids[(int(m[1][3:5])-1)//3+1].add(current)
    else:undated+=1
   elif line.startswith('Privat:'):
    totals=re.search(r'Privat:\s*([\d.]+,\d{2})\s+Kasse:\s*([\d.]+,\d{2})',line)
    if not totals or current is None or records[current]['amount']!=amount(totals[1])+amount(totals[2]):raise ValueError(f'Pflegeheim-Summenprüfung, Block {subtotal_count+1}: berechnet {records.get(current,{}).get("amount")}, gedruckt {totals.groups() if totals else None}.')
    subtotal_count+=1
   elif re.match(r'^\d{2}\.\d{2}\.\d{2}\s',line):raise ValueError('Nicht erkannte Pflegeheim-Leistungszeile.')
 total=re.search(r'Patienten:\s*(\d+)\s+Privat:\s*([\d.]+,\d{2})\s+Kasse:\s*([\d.]+,\d{2})',texts[-1])
 total_amount=sum((x['amount'] for x in records.values()),Decimal(0))
 if not total or len(records)!=int(total[1]) or subtotal_count!=len(records) or entries!=int(title[2]) or total_amount!=amount(total[2])+amount(total[3]):raise ValueError('Pflegeheim-Liste stimmt nicht mit gedruckten Gesamtsummen überein.')
 base={'year':year,'file':filename,'sha256':digest,'created':created}
 return [{**base,'quarter':None,'patients':len(records),'serviceRows':entries,'amount':float(total_amount),'undatedServiceRows':undated}]+[{**base,'quarter':q,'patients':len(quarter_ids[q])} for q in range(1,5)]
