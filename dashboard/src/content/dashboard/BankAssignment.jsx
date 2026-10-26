import React,{useEffect,useState} from 'react';
import {Button,DataTable,Dialog,Dropdown} from '../../data-app-public.jsx';
const euro=v=>new Intl.NumberFormat('de-AT',{style:'currency',currency:'EUR'}).format(v);
const date=v=>new Date(v+'T12:00:00').toLocaleDateString('de-AT');
const buckets=['Ordination','Privat','Finanzierung','Steuern / SV offen','Bankkosten','Vermögensanlage','Zu prüfen'];
const defaults={'Ordination':'Sonstige Ordinationsausgaben','Privat':'Sonstige private Ausgaben','Finanzierung':'Finanzierung / Aufteilung offen','Steuern / SV offen':'Steuerart / Zuordnung offen','Bankkosten':'Bankgebühren / Zinsen','Vermögensanlage':'Vermögensanlage','Zu prüfen':'Zweck noch offen'};
const categoryChoices={'Ordination':['Dentalbedarf / Material','Technik / Geräte','Techniker / Labor','Ordinationsmiete','Energie / Betriebskosten','Telefon / Internet','Praxissoftware / IT','Löhne / Gehälter','Fortbildung / Berufsbeiträge','Werbung / Verzeichnisse','Berufsversicherung','Sonstige Ordinationsausgaben'],'Privat':['Private Wohnungsmiete','Privatentnahmen','Private Einkäufe','Private Versicherungen','Private Mobilität','Sonstige private Ausgaben']};
const amount=rows=>rows.reduce((sum,r)=>sum+Math.round(Math.abs(r.amount)*100),0)/100;
function AllocationForm({row,rows,busy,result,onSave,onBack}){
 const [bucket,setBucket]=useState(row.bucket),[category,setCategory]=useState(row.category),[scope,setScope]=useState('single'),[note,setNote]=useState(row.assignmentNote||'');
 const matching=rows.filter(r=>r.amount<0&&r.payee===row.payee&&r.merchant===row.merchant),affected=scope==='single'?[row]:matching;
 const categories=[...new Set([...(categoryChoices[bucket]||[defaults[bucket]]),...(row.bucket===bucket?[row.category]:[])])];
 const disabled=busy||Boolean(result);
 const save=action=>onSave({transactionId:row.id,action,scope:action==='reset'?'single':scope,bucket,category,note,expectedCount:action==='reset'?1:affected.length});
 return <div className='ordi-allocation'>
  <Button variant='ghost' onClick={onBack} disabled={busy||Boolean(result)}>Zur Buchungsliste</Button>
  <p className='ordi-finding'>{row.merchant} · <span className='ordi-money-out'>{euro(-row.amount)}</span></p>
  <p>{date(row.date)} · Bisher: <strong>{row.bucket} / {row.category}</strong></p>
  <details className='ordi-disclosure'><summary>Originalbeschreibung und bisherige Zuordnung</summary><p className='ordi-body'>{row.details}</p><p className='ordi-note'>{row.basis}</p><p className='ordi-note'>Original: {row.sources.map(s=>`${s.file}, Seite ${s.page}`).join(' / ')}</p></details>
  <div className='ordi-allocation-fields'>
   <Dropdown label='Privat oder Ordination?' showLabel value={bucket} choices={buckets} choiceLabels={{Ordination:'Ordination – für die Praxis',Privat:'Privat – persönlich','Zu prüfen':'Zu prüfen – noch unklar'}} onChange={v=>{setBucket(v);setCategory(defaults[v]);}} disabled={disabled}/>
   <Dropdown label='Kategorie' showLabel value={category} choices={categories} onChange={setCategory} disabled={disabled}/>
   <Dropdown label='Für welche Zahlungen?' showLabel value={scope} choices={matching.length>1?['single','existingPayee']:['single']} choiceLabels={{single:'Nur diese Buchung',existingPayee:`Alle bisherigen Zahlungen an diesen Empfänger (${matching.length})`}} onChange={setScope} disabled={disabled}/>
   <label className='ordi-allocation-note'>Kurze Notiz (optional)<input value={note} maxLength={300} disabled={disabled} onChange={e=>setNote(e.target.value)} placeholder='Wofür war die Zahlung?'/></label>
  </div>
  <div className='ordi-allocation-preview' data-reviewed-rows>
   <strong>{affected.length} {affected.length===1?'Buchung':'Buchungen'} · {euro(amount(affected))}</strong>
   <p>Nach dem Speichern: <strong>{bucket} / {category}</strong>.</p>
   {scope==='existingPayee'&&<><p>{row.merchant} · {date(affected.map(r=>r.date).sort()[0])} bis {date(affected.map(r=>r.date).sort().at(-1))}. Gilt für die bereits vorhandenen Buchungen aller Bankjahre. Neue zukünftige Zahlungen sind nicht umfasst.</p><details className='ordi-disclosure'><summary>Betroffene Zahlungen vor dem Speichern ansehen</summary><DataTable label='Betroffene Zahlungen' rows={affected} columns={[{field:'date',label:'Datum',renderCell:date},{field:'merchant',label:'Empfänger'},{field:'amount',label:'Betrag',renderCell:v=>euro(-v)},{field:'bucket',label:'Bisheriger Bereich'}]} rowKey='id'/></details></>}
  </div>
  <p className='ordi-note'>Bei gemischter oder unklarer Nutzung „Zu prüfen“ wählen. Kreditraten bleiben unter Finanzierung, solange Tilgung und Zinsen nicht getrennt sind. Die Kontosummen und Originalbuchungen ändern sich durch die Zuordnung nicht.</p>
  {!result&&<div className='ordi-actions'><Button onClick={()=>save('assign')} disabled={busy||!category}>{busy?'Wird gespeichert …':'Zuordnung speichern'}</Button>{row.manualAssignment&&<Button variant='ghost' onClick={()=>save('reset')} disabled={busy}>Nur diese Buchung zurücksetzen</Button>}</div>}
 </div>;
}
export function BankAssignment({open,selected,onSelect,onClose,rows,reviewRows,snapshot}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[result,setResult]=useState(null);
 useEffect(()=>{setMessage('');setResult(null);},[open,selected?.id]);
 async function save(payload){
  setBusy(true);setMessage('Zuordnung wird gespeichert und die Auswertung aktualisiert …');
  try{const response=await fetch('/api/ordi/bank-allocation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,snapshotVersion:snapshot.generatedAt})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Zuordnung konnte nicht gespeichert werden.');setResult(data);setMessage(data.message);}catch(error){setMessage(error.message);}finally{setBusy(false);}
 }
 return <Dialog open={open} onClose={()=>{if(!busy)onClose();}} title='Privat oder Ordination zuordnen' expanded>
  {selected?<AllocationForm key={selected.id} row={selected} rows={rows} busy={busy} result={result} onSave={save} onBack={()=>onSelect(null)}/>:<>
   <p className='ordi-body'>Eine Zahlung auswählen und ihren Zweck festlegen. Diese Liste enthält die offenen Zuordnungen des gewählten Bankzeitraums.</p>
   <DataTable label='Offene Bankzuordnungen' rows={reviewRows} rowKey='id' columns={[{field:'date',label:'Datum',renderCell:date},{field:'merchant',label:'Empfänger / Händler'},{field:'amount',label:'Auszahlung',renderCell:v=><span className='ordi-money-out'>{euro(-v)}</span>},{field:'category',label:'Bisherige Kategorie'}]} onRowSelect={onSelect} rowActionLabel={r=>`${r.merchant} vom ${date(r.date)} zuordnen`}/>
   {!reviewRows.length&&<p>Keine offenen Zuordnungen in diesem Zeitraum. Bereits zugeordnete Auszahlungen können Sie unten in der Kostenliste öffnen und ändern.</p>}
  </>}
  {message&&<p role='status' className='ordi-status'>{message}</p>}
  {result&&<Button onClick={()=>window.location.reload()}>Aktualisierte Ansicht öffnen</Button>}
 </Dialog>;
}
