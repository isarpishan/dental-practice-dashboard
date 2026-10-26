"""Read bank PDF exports with exact cents, overlap-aware deduplication and balance checks."""
from pathlib import Path
from decimal import Decimal
from datetime import datetime
from collections import defaultdict, Counter
import re, hashlib, unicodedata, json
from pypdf import PdfReader

# Personal payee rules (names, landlords, partners) live in a local, git-ignored file.
# See bank-rules.example.json for the format.
RULES_PATH=Path(__file__).resolve().parent/'bank-rules.json'
def load_rules(path=RULES_PATH):
 return json.loads(path.read_text()) if path.exists() else {'ownerNames':[],'rules':[]}
RULES=load_rules()
def rule_matches(rule,payee,text):
 payee=payee.casefold();text=text.casefold()
 if rule.get('payee') and not all(t.casefold() in payee for t in rule['payee']):return False
 if rule.get('text') and not all(t.casefold() in text for t in rule['text']):return False
 if rule.get('any') and not any(t.casefold() in text for t in rule['any']):return False
 return bool(rule.get('payee') or rule.get('text') or rule.get('any'))
def personal_rule(payee,text,amount):
 for rule in RULES.get('rules',[]):
  direction=rule.get('direction','out')
  if (direction=='out' and amount>=0) or (direction=='in' and amount<=0):continue
  if rule_matches(rule,payee,text):return rule
 return None

DATE=r'\d{2}\.\d{2}\.\d{4}'
MONEY=r'-?[\d.]+,\d{2}'
TX=re.compile(rf'^\s*\d+\s+({DATE})\s+(.*?)\s+({DATE})\s+({MONEY})\s+EUR\s*$')
BAL=re.compile(rf'^\s*({DATE})\s+({MONEY})\s+EUR\s*$')
def cents(s):return int(Decimal(s.replace('.','').replace(',','.'))*100)
def iso(s):return datetime.strptime(s,'%d.%m.%Y').date().isoformat()
def norm(s):return re.sub(r'\s+','',unicodedata.normalize('NFKC',s)).casefold()
def parse_bank(path):
 reader=PdfReader(path);texts=[p.extract_text(extraction_mode='layout') or '' for p in reader.pages]
 all_text='\n'.join(texts)
 if 'Umsatzübersicht' not in all_text or 'Buchungsdatum' not in all_text:return None
 iban=re.search(r'IBAN:\s*([A-Z]{2}\d+)',texts[0])
 if not iban:raise ValueError('Bankkonto nicht erkannt.')
 account=hashlib.sha256(iban[1].encode()).hexdigest()[:12]
 rows=[];balances=[];current=None;unparsed=[]
 for page,text in enumerate(texts,1):
  for line in text.splitlines():
   t=TX.match(line);b=BAL.match(line)
   if t:
    current={'date':iso(t[1]),'valueDate':iso(t[3]),'payee':t[2].strip(),'amountCents':cents(t[4]),'detailParts':[],'page':page};rows.append(current)
   elif b:balances.append({'date':iso(b[1]),'balanceCents':cents(b[2]),'page':page});current=None
   elif line.strip().startswith(('Dieser Ausdruck','Bei Fragen','Gedruckt am:')):current=None
   elif re.match(r'^\s*\d+\s+'+DATE,line):unparsed.append({'page':page,'line':line.strip()})
   elif current and line.strip() and not any(x in line for x in ['Umsatzübersicht','IBAN:','BIC/SWIFT','Bezeichnung:','Buchungsdatum']):current['detailParts'].append(line.strip())
 for r in rows:r['details']=' '.join(r.pop('detailParts'))
 if not rows or unparsed:raise ValueError(f'Bankzeilen nicht vollständig lesbar: {len(unparsed)}')
 bydate=defaultdict(int)
 for r in rows:bydate[r['date']]+=r['amountCents']
 unique={b['date']:b['balanceCents'] for b in balances};dates=sorted(unique)
 errors=[]
 for older,newer in zip(dates,dates[1:]):
  difference=unique[newer]-unique[older]-bydate[newer]
  if difference:errors.append({'date':newer,'differenceCents':difference})
 if errors:raise ValueError(f'Banksalden stimmen nicht mit Buchungen überein: {errors[:5]}')
 first=dates[0];last=dates[-1];opening=unique[first]-bydate[first]
 if unique[last]-opening!=sum(r['amountCents'] for r in rows):raise ValueError('Bank-Gesamtabgleich fehlgeschlagen.')
 digest=hashlib.sha256(path.read_bytes()).hexdigest()
 for r in rows:r.update({'account':account,'file':path.name,'sha256':digest})
 return {'file':path.name,'sha256':digest,'pages':len(texts),'account':account,'accountLabel':f'Ordinationskonto · …{iban[1][-4:]}','start':first,'end':last,'openingCents':opening,'closingCents':unique[last],'checks':len(dates)-1,'rows':rows,'balances':balances}

def combine(statements):
 """Retain the maximum observed multiplicity, rather than dropping equal real bookings."""
 grouped=defaultdict(list)
 for s in statements:
  local=defaultdict(list)
  for r in s['rows']:
   key=(r['account'],r['date'],r['valueDate'],r['amountCents'],norm(r['payee']),norm(r['details']))
   local[key].append(r)
  for key,rows in local.items():grouped[key].append(rows)
 out=[]
 for key,versions in grouped.items():
  selected=max(versions,key=len)
  for i,row in enumerate(selected):
   origins=[{'file':v[i]['file'],'page':v[i]['page'],'sha256':v[i]['sha256']} for v in versions if len(v)>i]
   out.append({**row,'id':hashlib.sha256(json.dumps([key,i],ensure_ascii=False).encode()).hexdigest()[:20],'sources':origins})
 out.sort(key=lambda r:(r['date'],r['id']),reverse=True)
 return out

def safe_text(text):
 text=re.sub(r'\b[A-Z]{2}\d{2}(?:\s?\d){10,30}\b','[IBAN ausgeblendet]',text)
 text=re.sub(r'\b\d{10,}\b','[Referenz ausgeblendet]',text)
 return text

def classify(row):
 """Purpose is a reviewed interpretation, never an invoice/tax or profit finding."""
 p=row['payee'];d=row['details'];text=(p+' '+d).casefold();amount=row['amountCents']
 bucket='Zu prüfen';category='Sonstige Zahlung';status='Zweck offen';basis='Aus dem Banktext ist der Zweck nicht ausreichend erkennbar.';merchant=p
 def assign(b,c,why,confirmed=False):
  nonlocal bucket,category,status,basis
  bucket=b;category=c;basis=why;status='Vom Nutzer bestätigt' if confirmed else 'Aus Buchung abgeleitet'
 if amount==0:assign('Hinweis','Bankmitteilung','Nullbuchung: keine Zahlung.')
 elif amount>0:
  if 'hobex' in text:assign('Betrieblicher Eingang','Kartenzahlungen (netto)','HOBEX-Kartenabrechnung; Gutschrift nach einbehaltenen Entgelten.');merchant='HOBEX'
  elif 'landeszahn' in text:assign('Betrieblicher Eingang','Kassenabrechnungen','Eingänge der Landeszahnärztekammer werden als Auszahlungen aus der Kassenabrechnung gewertet.');merchant='Landeszahnärztekammer'
  elif 'arbeitsmarktförd' in text:assign('Betrieblicher Eingang','Förderungen','Arbeitsmarktförderung laut Banktext.');merchant='Arbeitsmarktförderung'
  elif 'sb beheb' in text:assign('Betrieblicher Eingang','Patientenhonorare (bar eingezahlt)','Bareinzahlungen werden als zuvor bar bezahlte Patientenhonorare gewertet. Das Bankdatum zeigt die Einzahlung; kein zusätzlicher Leistungsumsatz und kein Nachweis des Barzahlungsdatums.');merchant='Patientenhonorare · Bareinzahlung'
  elif re.search(r'honorar|heilkostenplan|pat\.?\s*nr|anzahlung|rechnung|\b(?:25|26)/\d|\bhn\b|\brn\s*\d|prothese|inlay|behandlung|implantat',d,re.I):assign('Betrieblicher Eingang','Honorarüberweisungen laut Text','Honorar-/Behandlungsbezug im Buchungstext; nicht mit einer konkreten Leistungszeile verknüpft.');merchant='Honorarüberweisung'
  else:category='Sonstiger Eingang – Herkunft offen'
 elif (rule:=personal_rule(p,p+' '+d,amount)):
  assign(rule['bucket'],rule['category'],rule.get('basis','Vom Nutzer bestätigte Zuordnung.'),rule.get('confirmed',True))
  if rule.get('merchant'):merchant=rule['merchant']
 elif 'privat' in d.casefold() and any(name.casefold() in p.casefold() for name in RULES.get('ownerNames',[])):assign('Privat','Privatentnahmen','Buchung ist ausdrücklich mit Privat bezeichnet.');merchant='Privatentnahme'
 elif 'kreditrate' in text:assign('Finanzierung','Kreditraten','Kreditrate laut Banktext; Tilgung und Zinsen sind nicht aufgeteilt.');merchant='Kreditrate'
 elif any(x in text for x in ['leasing','finance']):assign('Finanzierung','Finanzierung / Leasing – Vertrag offen','Finanzierungsanbieter laut Banktext; Vertragszweck und Tilgungsanteil noch offen.')
 elif p.casefold()=='effekten' or 'kauf depot' in text:assign('Vermögensanlage','Wertpapierkauf','Wertpapierkauf laut Banktext; separat von Ordinationskosten.')
 elif 'finanzamt' in text:
  if 'lohnsteuer' in text or 'dienstgeberbeitrag' in text:assign('Ordination','Personalabgaben','Lohnsteuer/Dienstgeberbeitrag laut Zahlungszweck.')
  else:assign('Steuern / SV offen','Steuerzahlungen – Art prüfen','Finanzamtzahlung: persönliche Einkommensteuer oder anderer Steuerzweck; kein pauschaler Ordinationsaufwand.')
 elif re.search(r'\blohn\s*\d|\bgehalt\b',d,re.I):assign('Ordination','Löhne / Gehälter','Lohn/Gehalt im Zahlungszweck.');merchant='Personalzahlung'
 elif 'österreichische gesundheitskasse' in p.casefold() and 'einzug bzr' in text:assign('Ordination','Personalabgaben','ÖGK-Einzug mit Beitragszeitraum im Zahlungszweck.')
 elif any(x in text for x in ['sozialvers','svs.at']):category='Sozialversicherung – Zweck offen';basis='Personen-/Vertragsbezug muss für das gemischte Konto geklärt werden.'
 elif any(x in text for x in ['steuerberat','wirtschaftstreuhand','buchhaltung']):assign('Ordination','Steuerberatung / Buchhaltung','Steuerberatung/Buchhaltung laut Banktext.')
 elif any(x in text for x in ['softdent','power dent','powerdent','henry schein one','thieme compliance']):assign('Ordination','Praxissoftware / IT','Praxissoftware-/IT-Anbieter laut Banktext.')
 elif any(x in text for x in ['minilu','bredent','nobel biocare','plandent','proimplants','straumann','straummsn','straumanngroup','henry schein dental','ustomed','ormco','medentical','medizintechnik','medical infrastructure','pharmabog','profimed','basiq dental','altec dental','zauchner','dentalprodukte','cad/cam','nsk europe','sprintray']):assign('Ordination','Dentalbedarf / Medizin / Technik','Dental-/Medizintechnikbezug im Empfänger oder Buchungstext; Verbrauchsmaterial und Anlagegut ohne Rechnung nicht getrennt.')
 elif 'apotheke' in text:category='Apotheke – Zweck offen';basis='Apothekenzahlung; persönlicher oder betrieblicher Bezug noch offen.'
 elif any(x in text for x in ['fortbildungsinstitut','parodontologie','interessenverband']):assign('Ordination','Fortbildung / Berufsbeiträge','Berufsbezogene Fortbildung oder Mitgliedschaft laut Banktext.')
 elif 'ärzterechtsschutz' in text:assign('Ordination','Berufsversicherung','Ärzterechtsschutz im Zahlungszweck.')
 elif any(x in text for x in ['rechtsanw','landesgericht']):category='Recht / Gericht – Zweck offen'
 elif 'versicherung' in text:category='Versicherungen – Vertrag offen'
 elif any(x in text for x in ['energie','strom','gas ']):category='Energie – Objekt offen';basis='Objekt/Adresse im Banktext; Zuordnung privat/Ordination noch nicht bestätigt.'
 elif any(x in text for x in ['telekom','t-mobile','magenta','mobilfunk']):category='Telefon / Internet – Nutzung offen'
 elif p in ['Abschluss','Gebühren','Kartengebühr','Prolongationsgebühr']:assign('Bankkosten','Bankgebühren / Zinsen','Gesamte Bankbelastung laut Buchung; bei Abschluss enthaltene Zinsen/Entgelte nicht getrennt.')
 elif p=='Depotgebühr':assign('Vermögensanlage','Depotgebühren','Gebühr für das Wertpapierdepot laut Buchungstext.')
 # Normalize card merchants, without inventing a physical location from a clearing address.
 if any(x in p.casefold() for x in ['bezahlen im internet','mobile pos']):
  for term,label in [('sprintray','SprintRay'),('amzn','Amazon'),('amazon','Amazon'),('media markt','MediaMarkt'),('tankstelle','Tankstelle'),('apotheke','Apotheke')]:
   if term in text:merchant=label;break
  else:
   m=re.search(r'D1\s+(.+?)(?:\s+\d{4,6}|\.\.\.|$)',d);merchant=m[1].strip() if m else p
  if amount>0:category='Onlineeingang – Zweck offen'
  elif any(x in text for x in ['tankstelle','omv']):category='Fahrzeug / Tanken – Zweck offen'
  elif 'amzn' in text or 'amazon' in text or 'media markt' in text:category='Onlinekauf – Zweck offen'
 public={k:v for k,v in row.items() if k not in ['details','payee','amountCents']}
 # Private patients' names and personal references are not needed for cost exploration.
 incoming_person=amount>0 and bucket not in ['Betrieblicher Eingang']
 if (amount>0 and category=='Honorarüberweisungen laut Text') or incoming_person:
  public_payee=f'Zahlende Person · {hashlib.sha256(norm(p).encode()).hexdigest()[:6]}' if 'sb beheb' not in text and 'sozialvers' not in text else p
  if merchant in [p,'Honorarüberweisung']:merchant='Honorarüberweisung' if bucket=='Betrieblicher Eingang' else 'Sonstiger Eingang'
  public_details='Personenbezogener Eingang; Beschreibung im Originalbeleg.'
 elif merchant=='Personalzahlung':public_payee='Personalzahlung';public_details=safe_text(d)
 else:public_payee=p;public_details=safe_text(d)
 result={**public,'amount':amount/100,'payee':public_payee,'details':public_details,'merchant':merchant,'bucket':bucket,'category':category,'classification':status,'basis':basis,'direction':'Eingang' if amount>0 else 'Ausgang' if amount<0 else 'Hinweis','review':bucket in ['Zu prüfen','Steuern / SV offen'] or 'offen' in category,'year':int(row['date'][:4]),'month':row['date'][:7]}
 rule=personal_rule(p,p+' '+d,amount) if amount<0 else None
 if rule and rule.get('cooperation'):
  result.update(cooperation=rule['cooperation'],costServiceYear=None,cooperationBasis='Vom Nutzer als Kosten der Kooperation bestätigt; Zahlungsdatum ist kein Nachweis des Leistungsjahrs.')
 if 'hobex' in p.casefold() and amount>0:
  m=re.search(r'TURNOVER\s+('+MONEY+')',d)
  if m:
   gross=cents(m[1]);result.update(cardGross=gross/100,cardFees=(gross-amount)/100)
 return result

if __name__=='__main__':
 root=Path(__file__).resolve().parent.parent
 ss=[parse_bank(p) for p in sorted(root.glob('umsaetze*.pdf'))];ss=[s for s in ss if s]
 rows=combine(ss)
 (root/'tmp/bank/parsed.json').write_text(json.dumps({'statements':[{k:v for k,v in s.items() if k!='rows'} for s in ss],'rows':rows},ensure_ascii=False,indent=2))
 print(json.dumps([{'file':s['file'],'rows':len(s['rows']),'start':s['start'],'end':s['end'],'checks':s['checks'],'net':sum(r['amountCents'] for r in s['rows'])/100} for s in ss],indent=2))
 print('Unique rows',len(rows),'overlap removed',sum(len(s['rows']) for s in ss)-len(rows))
 for year in sorted({r['date'][:4] for r in rows}):
  rr=[r for r in rows if r['date'].startswith(year)];print(year,'in',sum(r['amountCents'] for r in rr if r['amountCents']>0)/100,'out',sum(-r['amountCents'] for r in rr if r['amountCents']<0)/100)
 profile=defaultdict(lambda:{'amountCents':0,'count':0,'examples':[]})
 for r in rows:
  key=('IN ' if r['amountCents']>0 else 'OUT ')+r['payee'];g=profile[key];g['amountCents']+=r['amountCents'];g['count']+=1
  if len(g['examples'])<3:g['examples'].append(r['details'])
 (root/'tmp/bank/counterparties.json').write_text(json.dumps(dict(sorted(profile.items(),key=lambda x:abs(x[1]['amountCents']),reverse=True)),ensure_ascii=False,indent=2))
