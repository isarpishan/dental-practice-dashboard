import React,{useState} from 'react';
import {Button,Section} from '../../data-app-public.jsx';
export function DataExports({snapshot}){
 const [busy,setBusy]=useState(''),[message,setMessage]=useState('');
 async function download(kind){
  setBusy(kind);setMessage('Datei wird vorbereitet …');
  try{
   const response=await fetch(`/api/ordi/${kind}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({snapshotVersion:snapshot.generatedAt})});
   if(!response.ok){const result=await response.json();throw new Error(result.error||'Export fehlgeschlagen.');}
   const filename=response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1]||'Ordi-Daten.zip';
   const file=await response.blob(),url=URL.createObjectURL(file),link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);setMessage('Download bereit. Die ZIP-Datei enthält die exportierten Dateien.');
  }catch(error){setMessage(error.message);}finally{setBusy('');}
 }
 return <Section id='data-export-heading' title='Daten mitnehmen & sichern'>
  <div className='ordi-import-box'>
   <p>Tabellen für Excel oder Numbers herunterladen, den persischen PDF-Bericht öffnen oder die Originaldateien und geprüften Daten sichern.</p>
   <div className='ordi-actions'><Button disabled={Boolean(busy)} onClick={()=>download('export-tables')}>{busy==='export-tables'?'Tabellen werden erstellt …':'Tabellen für Excel / CSV'}</Button><Button disabled={Boolean(busy)} onClick={()=>download('backup')}>{busy==='backup'?'Sicherung wird erstellt …':'Datensicherung herunterladen'}</Button><a href='/bericht/' target='_blank' rel='noreferrer'>تحلیل فارسی / PDF-Bericht</a></div>
   <p className='ordi-note'>Der Tabellenexport umfasst alle verfügbaren Jahre und Zeiträume, unabhängig von den Bildschirmfiltern. CSV-Dateien sind zum Weiterarbeiten; neue Daten werden über Original-PDFs eingelesen.</p>
   <details className='ordi-disclosure'><summary>Wie werden meine Daten gesichert?</summary><p className='ordi-note'>Beim Start und vor dem Einlesen geänderter Daten wird eine neue Datensicherung im Ordner „Sicherungen“ angelegt. Unveränderte Daten erhalten keine doppelte Sicherung. Enthalten sind Original-PDFs, geprüfte Daten, Analysen und Zuordnungsregeln. Browser-Ansichtseinstellungen sind nicht enthalten. Für eine vollständige Kopie der Anwendung den gesamten Projektordner behalten.</p></details>
   {message&&<p role='status' className='ordi-status'>{message}</p>}
  </div>
 </Section>;
}
