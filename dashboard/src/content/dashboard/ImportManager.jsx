import React,{useEffect,useRef,useState} from 'react';
import {Button,Section} from '../../data-app-public.jsx';
const value=v=>v==null?'—':new Intl.NumberFormat('de-AT',{maximumFractionDigits:2}).format(v);
export function ImportManager({snapshot}){
 const input=useRef(null);const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[plan,setPlan]=useState(null),[result,setResult]=useState(null),[history,setHistory]=useState(null);
 useEffect(()=>{let alive=true;fetch('/api/ordi/import-history').then(r=>{if(!r.ok)throw new Error();return r.json();}).then(r=>{if(alive)setHistory(r);}).catch(()=>{if(alive)setHistory({unavailable:true});});return()=>{alive=false;};},[]);
 async function request(route,payload){const response=await fetch('/api/ordi/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await response.json();if(!response.ok)throw new Error(data.error||'Prüfung fehlgeschlagen.');return data;}
 async function check(selected=[]){
  setBusy(true);setMessage('Dateien und Berichtszeiträume werden geprüft …');setPlan(null);setResult(null);
  try{
   const files=await Promise.all(selected.map(async f=>({name:f.name,data:await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=reject;r.readAsDataURL(f);})})));
   const data=await request('preview',{snapshotVersion:snapshot.generatedAt,files});setPlan(data);setMessage(data.canApply?'Vorschau bereit. Die angezeigten Zahlen sind noch nicht übernommen.':'Prüfung erforderlich. Es wurden keine Zahlen übernommen.');
  }catch(error){setMessage(error.message);}finally{setBusy(false);if(input.current)input.current.value='';}
 }
 async function apply(){setBusy(true);setMessage('Geprüfte Daten werden gespeichert …');try{const data=await request('import-apply',{token:plan.token});setResult(data);setPlan(null);setMessage(data.message);}catch(error){setMessage(error.message);}finally{setBusy(false);}}
 async function discard(){setBusy(true);try{await request('import-cancel',{token:plan.token});setPlan(null);setMessage('Prüfung verworfen. Die bisherigen Daten bleiben erhalten.');}catch(error){setMessage(error.message);}finally{setBusy(false);}}
 return <>
  <Section id='file-import-header' title='Dateien prüfen & übernehmen' spacing='none'>
   <div className='ordi-import-box'>
    <p>Neue Auswertungen auswählen oder PDFs im Projektordner / „Eingang“ ablegen. Zuerst die Vorschau prüfen, danach übernehmen. Originale und frühere Datenstände bleiben erhalten.</p>
    <div className='ordi-actions'><Button onClick={()=>input.current?.click()} disabled={busy}>PDFs auswählen & prüfen</Button><Button onClick={()=>check()} disabled={busy}>Ordner prüfen</Button><input ref={input} type='file' accept='.pdf,application/pdf' multiple hidden onChange={e=>check(Array.from(e.target.files??[]))}/></div>
    <p className='ordi-note'>Ein neuer Jahresstand ersetzt den älteren Stand derselben Auswertung; die beiden werden nicht addiert. Überlappende Bankbuchungen werden einzeln abgeglichen. Neue Monats-, Termin- und CSV-/Excel-Formate benötigen zuerst einen geprüften Musterexport.</p>
    {message&&<p role='status' className='ordi-status'>{message}</p>}
    {plan&&<div className='ordi-import-preview' data-reviewed-rows='false'>
     <h3>Vorschau – noch nicht gespeichert</h3>
     <p>Berichtsstand danach: {plan.cutoff?new Date(plan.cutoff).toLocaleDateString('de-AT'):'Unbekannt'} · {plan.datasetChanges?.length||0} geänderte Datenbereiche.</p>
     {plan.files.length>0?<div className='ordi-import-scroll'><table className='ordi-import-table'><caption>Dateien und Verwendung nach der Übernahme</caption><thead><tr><th>Datei</th><th>Inhalt / Zeitraum</th><th>Verwendung</th></tr></thead><tbody>{plan.files.map((r,i)=><tr key={i}><td>{r.file}</td><td>{r.kind}<br/>{r.period}</td><td>{r.action}</td></tr>)}</tbody></table></div>:<p>Keine neuen Quelldateien gefunden.</p>}
     {plan.issues.length>0&&<div className='ordi-import-issues' role='alert'><p>Diese Dateien müssen zuerst geklärt werden. Der gesamte Import bleibt gesperrt.</p><ul>{plan.issues.map((r,i)=><li key={i}>{r.file}: {r.reason}</li>)}</ul></div>}
     {plan.changes.length>0?<div className='ordi-import-scroll'><table className='ordi-import-table'><caption>Änderung der Kennzahlen nach der Übernahme</caption><thead><tr><th>Kennzahl</th><th>Bisher</th><th>Danach</th><th>Änderung</th></tr></thead><tbody>{plan.changes.map(r=><tr key={r.metric}><td>{r.metric}</td><td>{value(r.before)}</td><td>{value(r.after)}</td><td>{r.difference>0?'+':''}{value(r.difference)}</td></tr>)}</tbody></table></div>:<p>Keine Änderung der geprüften Patienten-, Leistungs-, Planungs- und Bankkennzahlen.</p>}
     <p className='ordi-note'>Personenzahlen mehrerer Monate oder Quartale werden nicht zu Jahrespersonen addiert. Leistungen, Planungen und Bankzahlungen bleiben getrennte Größen.</p>
     <div className='ordi-actions'><Button onClick={apply} disabled={busy||!plan.canApply||snapshot.buildStatus!=='complete'}>Geprüfte Daten übernehmen</Button><Button onClick={discard} disabled={busy}>Vorschau verwerfen</Button></div>
    </div>}
    {result&&<><ul>{result.notes.map((n,i)=><li key={i}>{n}</li>)}</ul><Button onClick={()=>window.location.reload()}>Aktualisierte Ansicht öffnen</Button></>}
   </div>
  </Section>
  <Section id='import-history-heading' title='Gespeicherte Datenstände'>
   <div className='ordi-import-box'>
    {!history?<p>Datenbank wird geprüft …</p>:history.unavailable?<p>Die Importhistorie ist gerade nicht erreichbar. Bitte das Ordinationspanel neu starten.</p>:<><p>{history.sources} eindeutige Quelldateien · {history.database}. Zahlen, Quellen und Zuordnungsregeln werden gemeinsam gespeichert.</p><details className='ordi-disclosure'><summary>Letzte Datenstände ansehen</summary><div className='ordi-import-scroll'><table className='ordi-import-table'><caption>Letzte 20 gespeicherte Datenstände</caption><thead><tr><th>Gespeichert</th><th>Anlass</th><th>Berichtsstand</th></tr></thead><tbody>{history.runs.map(r=><tr key={r.id}><td>{new Date(r.createdAt).toLocaleString('de-AT')}</td><td>{r.reason}</td><td>{r.cutoff||'Unbekannt'}</td></tr>)}</tbody></table></div></details></>}
    <p className='ordi-note'>Die Datensicherung enthält auch diese Datenbank und ihre Historie. Unklare Angaben werden nicht geschätzt. Arbeitszeiten folgen nach Prüfung des Terminexports.</p>
   </div>
  </Section>
 </>;
}
