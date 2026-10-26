import React,{useMemo} from 'react';
import {DataComponent,DataTable,EvidenceChart,MetricCard,Section,Dropdown,Filters} from '../../data-app-public.jsx';
const euro=v=>v==null?'Nicht verfügbar':new Intl.NumberFormat('de-AT',{style:'currency',currency:'EUR'}).format(v);
const number=v=>new Intl.NumberFormat('de-AT').format(v);
const PLANNED='Geplant (rot)',RECORDED='Erfasst (nicht rot)';
const day=v=>v?new Intl.DateTimeFormat('de-AT').format(new Date(v+'T12:00:00')):'Ohne Datum';
export function PatientPlanning({queries,viewFocus,update,explain}){
 const summary=queries.ordination_patient_service_summary?.rows??[],all=queries.patient_service_records?.rows??[];
 const years=summary.map(r=>r.year).sort((a,b)=>b-a);
 const year=years.includes(Number(viewFocus.year))?Number(viewFocus.year):years[0];
 const status=['Geplant (rot)','Erfasst (nicht rot)','Alle Einträge'].includes(viewFocus.status)?viewFocus.status:'Geplant (rot)';
 const chartId=`planning-groups-${status===PLANNED?'planned':status===RECORDED?'recorded':'all'}`;
 const chartFields=status==='Alle Einträge'?[RECORDED,PLANNED]:[status];
 const annual=summary.find(r=>r.year===year);
 const yearRows=useMemo(()=>all.filter(r=>r.year===year&&!r.pflegeheimExcluded),[all,year]);
 const recordedPeople=useMemo(()=>new Set(yearRows.filter(r=>r.status==='Erfasst (nicht rot)').map(r=>r.patientRef)).size,[yearRows]);
 const rows=useMemo(()=>yearRows.filter(r=>status==='Alle Einträge'||r.status===status),[yearRows,status]);
 const {groups,people}=useMemo(()=>{
  const groups=new Map(),people=new Map();
  for(const r of rows){
   const g=groups.get(r.group)??{Bereich:r.group,cents:0,plannedCents:0,recordedCents:0,Positionen:0};const cents=Math.round(r.amount*100);g.cents+=cents;if(r.status===PLANNED)g.plannedCents+=cents;else if(r.status===RECORDED)g.recordedCents+=cents;g.Positionen++;groups.set(r.group,g);
   const p=people.get(r.patientRef)??{patientRef:r.patientRef,Patient:`Patient ${r.patientRef.slice(0,8).toUpperCase()}`,cents:0,Positionen:0,LetztesDatum:null};p.cents+=Math.round(r.amount*100);p.Positionen++;if(r.date&&(!p.LetztesDatum||r.date>p.LetztesDatum))p.LetztesDatum=r.date;people.set(r.patientRef,p);
  }
  return {groups:[...groups.values()].map(g=>({...g,Wert:g.cents/100,[PLANNED]:g.plannedCents/100,[RECORDED]:g.recordedCents/100})).sort((a,b)=>b.Wert-a.Wert),people:[...people.values()].map(p=>({...p,Wert:p.cents/100})).sort((a,b)=>b.Wert-a.Wert)};
 },[rows]);
 if(!annual)return <p className='ordi-notice'>Noch keine geprüfte Leistungsaufstellung mit farblich erkennbaren Planungen vorhanden. Original-PDFs im Ordner „Leistungsaufstellung“ ergänzen und unter „Dateien & Aktualisieren“ neu einlesen.</p>;
 const chartRows=groups.map(g=>({Bereich:g.Bereich,...Object.fromEntries(chartFields.map(field=>[field,g[field]]))}));
 const columns=[{field:'date',label:'Datum',renderCell:day},{field:'code',label:'Kürzel'},{field:'description',label:'Leistung'},{field:'amount',label:'Wert',renderCell:euro},{field:'status',label:'Status'},{field:'page',label:'PDF-Seite'}];
 const controls=<div className='ordi-filter-controls'><Dropdown label='Jahresdatei' showLabel value={String(year)} choices={years.map(String)} onChange={v=>update('year',v)}/><Dropdown label='Einträge zeigen' showLabel value={status} choices={['Geplant (rot)','Erfasst (nicht rot)','Alle Einträge']} onChange={v=>update('status',v)}/></div>;
 return <>
  <Filters sticky queries={queries} filters={[]} values={{}} onChange={()=>{}} trailingControls={controls}/>
  <Section id='planning-summary' title={`Leistungsaufstellung ${year}: Planung getrennt betrachten`} columns={3}>
   <MetricCard id='planning-value' queryId='ordination_patient_service_summary' variant='card' title='Noch geplant · rot' value={euro(annual.plannedValue)} sourceRows={[annual]} displayRows={[annual]} description={`${number(annual.plannedRows)} rote Leistungspositionen. Kein gesicherter Umsatz, Zahlungseingang oder Gewinn.`}/>
   <MetricCard id='planning-people' queryId='ordination_patient_service_summary' variant='card' title='Personen mit roten Einträgen (gesamt)' value={number(annual.patientsWithPlans)} sourceRows={[annual]} displayRows={[annual]} description='Unterschiedliche interne Patientennummern mit mindestens einer roten Leistungsposition in dieser Jahresdatei.'/>
   <MetricCard id='planning-recorded' queryId='ordination_patient_service_summary' variant='card' title='Erfasste Einträge · nicht rot' value={euro(annual.recordedValue)} sourceRows={[annual]} displayRows={[annual]} description={`${number(annual.recordedRows)} Positionen laut Detaildatei. Erfasst bedeutet nicht bezahlt; bereits in anderen Berichten enthalten.`}/>
  </Section>
  <p className='ordi-note'>Ordinationsbestand der jeweiligen Jahresdatei; eine bestätigte externe Kohorte ist ausgeschlossen. Die Karten und Einzelzeilen verwenden dieselbe Abgrenzung. Der Statusfilter steuert die Ansichten darunter. Rote Einträge bleiben laut Ihrer Erklärung in Planung und werden nicht zu den bestehenden Leistungswerten oder BIZ-Planungen addiert. Die Jahresdateien sind keine Zeitreihe des offenen Planbestands.</p>
  <p className='ordi-note' data-reviewed-rows>Personen mit erfassten, nicht roten Einträgen: {number(recordedPeople)}. Alle Personen einschließlich reiner Planung: {number(annual.patients)}. Nur geplante Personen: {number(annual.patients-recordedPeople)}. Die Jahres-Patientenstatistik zählt {number(annual.patientStatsPatients)} Personen.</p>
  {(annual.differenceToPatientStats!==0||recordedPeople!==annual.patientStatsPatients)&&<p className='ordi-notice' data-reviewed-rows>Abweichender Bericht: Erfasste Leistungen dieser Detaildatei: {euro(annual.recordedValue)}; Jahres-Patientenstatistik: {euro(annual.patientStatsValue)}. Betragsdifferenz: {euro(annual.differenceToPatientStats)}. Unterschiedliche Erstellungsstände oder Filter sind mögliche, noch nicht bestätigte Erklärungen. Die bestehende Jahresstatistik wurde nicht ersetzt.</p>}
  <Section id='planning-groups-heading' title={`${status} · welche Leistungen?`}>
   <EvidenceChart key={chartId} id={chartId} queryId='patient_service_records' variant='card' title={`${status} · Wert nach Leistungsbereich · ${year}`} rows={chartRows} sourceRows={rows} height={Math.max(280,groups.length*(chartFields.length===2?50:34))} chartOptions={{getMarkActions:({row,field})=>[{label:'Positionen dieses Bereichs ansehen',onSelect:()=>explain(row.Bereich,`${chartFields.includes(field)?field:status} aus der Jahresdatei ${year}.`,rows.filter(r=>r.group===row.Bereich&&(!chartFields.includes(field)||r.status===field)),[{field:'patientRef',label:'Anonyme Referenz',renderCell:v=>`Patient ${v.slice(0,8).toUpperCase()}`},...columns])}]}} spec={{type:'horizontalBar',x:'Bereich',y:chartFields[0],fields:chartFields,colorBySign:false,colors:{[PLANNED]:'var(--negative)',[RECORDED]:'var(--chart-1)'},currency:'EUR',valueDecimals:2,showXAxisLabel:false,showYAxisLabel:false,startAtZero:true,showLegend:chartFields.length===2}}>
    <p className='ordi-note'>Geplant und erfasst haben im Diagrammeditor eigene Farben. Die drei Statusansichten speichern ihre Diagrammeinstellungen getrennt.</p>
   </EvidenceChart>
  </Section>
  <Section id='planning-patients-heading' title={`${status} · Personen und Einzelpositionen`}>
   <DataComponent id='planning-patients' queryId='patient_service_records' variant='card' title='Patienten anonym ansehen' kind='table' displayRows={people} sourceRows={rows}>
    <DataTable label='Anonyme Patienten und Leistungen' rows={people} rowKey='patientRef' columns={[{field:'Patient',label:'Anonyme Referenz'},{field:'Wert',label:`Wert · ${status}`,renderCell:euro},{field:'Positionen',label:'Positionen'},{field:'LetztesDatum',label:'Letztes Zeilendatum',renderCell:day}]} onRowSelect={r=>explain(r.Patient,`Alle Positionen dieser Person aus der Jahresdatei ${year}, einschließlich erfasster und geplanter Einträge. Quelle: ${annual.file}. Keine Namen oder klinischen Notizen in dieser Ansicht.`,yearRows.filter(x=>x.patientRef===r.patientRef).sort((a,b)=>Number(b.status===(status==='Alle Einträge'?'Geplant (rot)':status))-Number(a.status===(status==='Alle Einträge'?'Geplant (rot)':status))||(b.date??'').localeCompare(a.date??'')),columns)} rowActionLabel={r=>`Positionen für ${r.Patient} ansehen`}/>
   </DataComponent>
   <p className='ordi-note'>Die Referenz bleibt bei derselben internen Patientennummer über die Jahre gleich. Ein Wechsel zwischen Jahresdateien beweist allein weder eine neue Patientengewinnung noch eine Abwanderung. PDF-Seiten dienen zur Kontrolle im lokal gespeicherten Original.</p>
  </Section>
  <details className='ordi-disclosure'><summary>Welche Beträge sind bereits enthalten?</summary><p className='ordi-note'>Planungswert = Privat + Kasse aus der gedruckten Planungssumme. Der dort genannte Patientenanteil ist ein Teil der Kassenposition und wird nicht zusätzlich addiert. Material, Personal und weitere Kosten sind hier nicht abgezogen. Nicht rote Positionen werden gegen die gedruckten Patienten-Zwischensummen und den Jahresgesamtbetrag geprüft.</p></details>
 </>;
}
