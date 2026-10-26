import React,{useMemo,useState} from 'react';
import {DataComponent,DataTable,Section,Dropdown,Filters,Dialog,Button} from '../../data-app-public.jsx';
import {patientTracking,originalPdf} from '../shared/patient-tracking.js';
const num=v=>new Intl.NumberFormat('de-AT').format(v);
const day=v=>v?new Intl.DateTimeFormat('de-AT').format(new Date(v+'T12:00:00')):'Nicht vorhanden';
const euro=v=>new Intl.NumberFormat('de-AT',{style:'currency',currency:'EUR'}).format(v);
function PdfLink({row}){return <a className='ordi-tracking-pdf' href={originalPdf(row)} target='_blank' rel='noreferrer' title={`Original-PDF, Seite ${row.page}`} aria-label={`Original-PDF für ${row.reference??'diesen Eintrag'}, Seite ${row.page} öffnen`}>PDF öffnen</a>;}
export function PatientTracking({queries,viewFocus,shell}){
 const records=queries.patient_service_records?.rows??[];
 const years=useMemo(()=>[...new Set(records.map(r=>r.year))].sort((a,b)=>a-b),[records]);
 const targets=years.slice(1),year=targets.includes(Number(viewFocus.year))?Number(viewFocus.year):targets.at(-1);
 const bases=years.filter(y=>y<year),baseline=bases.includes(Number(viewFocus.baseline))?Number(viewFocus.baseline):bases.at(-1);
 const model=useMemo(()=>patientTracking(records,baseline,year),[records,baseline,year]);
 const group=['missing','both','current-only','all'].includes(viewFocus.group)?viewFocus.group:'missing';
 const rows=useMemo(()=>model.rows.filter(r=>group==='all'||r.group===group),[model,group]);
 const [selected,setSelected]=useState(null);
 const change=next=>{setSelected(null);shell.setDashboardFocus?.({...viewFocus,year:String(year),baseline:String(baseline),...next});};
 const annual=queries.ordination_periods?.rows.find(r=>r.year===year&&r.quarter===null);
 const targetLabel=`${year}${annual?.complete?'':' bisher'}`;
 const captions={missing:`${baseline} erfasst, ${targetLabel} ohne Eintrag`,both:`In ${baseline} und ${year} erfasst`,'current-only':`${targetLabel} erfasst, ${baseline} ohne Eintrag`,all:'Alle Personen der beiden Jahre'};
 const detailRows=selected?(model.people.get(selected.patientRef)?.records??[]):[];
 const detailSorted=useMemo(()=>[...detailRows].sort((a,b)=>(b.date??'').localeCompare(a.date??'')||b.year-a.year),[detailRows]);
 if(years.length<2)return <p className='ordi-notice'>Zum Wiederfinden derselben Personen fehlen Leistungsaufstellungen aus mindestens zwei Jahren mit stabilen anonymen Referenzen.</p>;
 const controls=<div className='ordi-filter-controls'><Dropdown label='Ausgangsjahr' showLabel value={String(baseline)} choices={bases.map(String)} onChange={v=>change({baseline:v})}/><Dropdown label='Späteres Jahr' showLabel value={String(year)} choices={targets.map(String)} onChange={v=>{const y=Number(v);change({year:v,baseline:String(baseline<y?baseline:years.filter(x=>x<y).at(-1))});}}/></div>;
 const columns=[{field:'reference',label:'Anonyme Referenz',renderCell:v=>v.replace(/^Patient /,'')},{field:'baseline',label:String(baseline),renderCell:v=>v?'Erfasst':'Kein Eintrag'},{field:'current',label:targetLabel,renderCell:v=>v?'Erfasst':'Kein Eintrag'},{field:'lastDate',label:'Zuletzt erfasst',renderCell:day},{field:'adminOnlyBaseline',label:'Hinweis',renderCell:v=>v?`${baseline}: nur Verwaltungspositionen`:'—'},{field:'page',label:'PDF',renderCell:(_v,r)=><PdfLink row={r}/>}];
 return <>
  <Filters sticky queries={queries} filters={[]} values={{}} onChange={()=>{}} trailingControls={controls}/>
  {!annual?.complete&&<p className='ordi-notice'>{year} ist nur bis {day(annual?.coverageEnd)} erfasst. „Ohne Eintrag“ bedeutet bisher nicht wiedergefunden und beweist keine dauerhafte Abwanderung.</p>}
  <DataComponent id='tracking-roster' queryId='patient_service_records' variant='card' title='Patientenliste direkt im Panel filtern' kind='table' displayRows={rows} sourceRows={model.own}>
   <p className='ordi-tracking-cohort' data-reviewed-rows><strong>{num(model.baselineCount)}</strong> Referenzen in {baseline} · Vergleich mit {targetLabel}. Die Buttons wählen die Liste darunter.</p>
   <div className='ordi-tracking-groups' role='group' aria-label='Patientenverlauf filtern'>{['missing','both','current-only','all'].map(key=><button key={key} type='button' aria-pressed={group===key} className={`ordi-tracking-choice${group===key?' is-selected':''}`} onClick={()=>change({group:key})}><span>{captions[key]}</span><strong>{num(model.counts[key])}</strong></button>)}</div>
   <p className='ordi-note'>Auf eine Referenz klicken, um ihre Einträge aus allen verfügbaren Jahren zu sehen. „PDF“ öffnet die passende Seite im lokalen Original.</p>
   <DataTable key={`${baseline}-${year}-${group}`} label={captions[group]} rows={rows} columns={columns} rowKey='patientRef' onRowSelect={setSelected} rowActionLabel={r=>`Verlauf für ${r.reference} ansehen`}/>
  </DataComponent>
  <Section id='tracking-method-section' spacing='content'><DataComponent id='tracking-method' queryId='patient_service_records' variant='card' title='Welche Personen können wir nachverfolgen?' kind='custom' sourceRows={model.own} displayRows={[{Kennzahl:'Referenzen mit nicht roten Einträgen in allen Jahresdateien',Personen:model.recorded},{Kennzahl:'Zusätzlich ausschließlich geplante Referenzen',Personen:model.plannedOnly}]}>
   <p className='ordi-body' data-reviewed-rows><strong>{num(model.recorded)}</strong> unterschiedliche Referenzen mit nicht roten Einträgen über alle vorhandenen Jahresdateien; zusätzlich <strong>{num(model.plannedOnly)}</strong> ausschließlich mit Planungen. Diese Planungen sind in der Liste oben nicht als erfasste Personen enthalten.</p>
   <p className='ordi-note'>Nicht rote Einträge können auch Dokumentation, Preisnachlässe oder versäumte Termine sein. Personen mit ausschließlich solchen Positionen im Ausgangsjahr sind in der Liste gekennzeichnet. Die Zuordnung sagt nichts über einen sicher durchgeführten Besuch, dauerhaft verlorene oder erstmals gewonnene Patienten. Ein Kooperationsjahr verwendet ausschließlich die Ordination ohne externe Kooperation; andere Jahre bleiben unverändert.</p>
  </DataComponent></Section>
  <Dialog open={!!selected} onClose={()=>setSelected(null)} title={selected?`${selected.reference} · Verlauf`:''} expanded>
   {selected&&<DataComponent id='tracking-person-detail' queryId='patient_service_records' kind='table' title='Einträge und Originalbelege' displayRows={detailSorted} sourceRows={detailSorted}>
    <p className='ordi-note'>Nicht rote Erfassungen und rote Planungen stehen getrennt in der Statusspalte. Die Referenz ist über die Jahre dieselbe; das Original-PDF enthält die Zuordnung in der Ordinationssoftware.</p>
    <DataTable label='Einträge dieser Referenz' rows={detailSorted} columns={[{field:'year',label:'Jahr'},{field:'date',label:'Datum',renderCell:day},{field:'code',label:'Kürzel'},{field:'description',label:'Leistung'},{field:'status',label:'Status'},{field:'amount',label:'Wert',renderCell:euro},{field:'page',label:'Beleg',renderCell:(_v,r)=><PdfLink row={r}/>}]} />
    <Button onClick={()=>setSelected(null)}>Schließen</Button>
   </DataComponent>}
  </Dialog>
 </>;
}
