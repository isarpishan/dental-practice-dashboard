import React, {useState,useRef,useMemo} from 'react';
import {DataComponent,DataTable,EvidenceChart,MetricCard,Section,SectionHeader,SortableRegion,SortableItem,Dropdown,Button,Dialog,Filters,useDataApp,useDashboardTabs} from '../../data-app-public.jsx';
import {periodLabels,selectPeriod,selectBiz,comparable,change,rate,total,sum,serviceRows,serviceGroups,nonTreatment,careHomeYear} from './ordi-model.js';
import './ordi.css';
import {PflegeheimAdjustment} from './PflegeheimAdjustment.jsx';
import {PracticeContext} from './PracticeContext.jsx';
import {DataExports} from './DataExports.jsx';
import {ImportManager} from './ImportManager.jsx';
import {YearOverview} from './YearOverview.jsx';
import {CurrentQuarter} from './CurrentQuarter.jsx';
import {FinanceView} from './FinanceView.jsx';
import {PatientPlanning} from './PatientPlanning.jsx';
import {PatientTracking} from './PatientTracking.jsx';

const euro=(v,d=0)=>v==null?'Nicht verfügbar':new Intl.NumberFormat('de-AT',{style:'currency',currency:'EUR',maximumFractionDigits:typeof d==='number'?d:0}).format(v);
const num=v=>v==null?'Nicht verfügbar':new Intl.NumberFormat('de-AT',{maximumFractionDigits:0}).format(v);
const percent=v=>v==null?'—':new Intl.NumberFormat('de-AT',{style:'percent',maximumFractionDigits:1,signDisplay:'exceptZero'}).format(v);
const signed=v=>v==null?'—':`${v>0?'+':''}${num(v)}`;
const date=s=>s?new Intl.DateTimeFormat('de-AT').format(new Date(s)):'unbekannt';
const tone=v=>v==null||v===0?'neutral':v>0?'positive':'negative';
const tabs=[{id:'finance',label:'Einnahmen & Ausgaben',filterIds:[],focusFields:['year','period','bucket','category']},{id:'dashboard',label:'Überblick',filterIds:[],focusFields:['year','baseline','period']},{id:'years',label:'Jahresübersicht',filterIds:[],focusFields:['year']},{id:'patients',label:'Patienten',filterIds:[],focusFields:['year','baseline','period']},{id:'services',label:'Leistungen',filterIds:[],focusFields:['year','baseline','group']},{id:'planning',label:'Behandlungen & Planung',filterIds:[],focusFields:['year','status']},{id:'tracking',label:'Patientenverlauf',filterIds:[],focusFields:['year','baseline','group']},{id:'data',label:'Dateien & Aktualisieren',filterIds:[],focusFields:[]}];
const chartBase={showXAxisLabel:false,showYAxisLabel:false,startAtZero:true,showLegend:true,stackable:false,valueDecimals:0};
const moneyCols=[{field:'label',label:'Zeitraum'},{field:'value',label:'Wert',renderCell:v=>euro(v,2)}];

export function DashboardContent(){
 const shell=useDataApp();const {snapshot,queries,viewFocus={},setDashboardFocus}=shell;
 const {activeTabId}=useDashboardTabs(tabs);const tab=tabs.some(t=>t.id===activeTabId)?activeTabId:'dashboard';
 const patientRows=queries.ordination_periods?.rows??queries.patient_periods?.rows??[];const bizRows=queries.ordination_biz_patients?.rows??[];const codes=queries.ordination_service_codes?.rows??[];
 const years=[...new Set(patientRows.map(r=>r.year))].sort((a,b)=>b-a);const careYear=careHomeYear(queries);
 const latestComplete=[...patientRows].filter(r=>r.quarter&&r.complete).sort((a,b)=>b.year-a.year||b.quarter-a.quarter)[0];
 const fullYears=years.filter(y=>patientRows.some(r=>r.year===y&&r.quarter===null&&r.complete));
 const defaultYear=tab==='services'?(fullYears[0]??years[0]):(latestComplete?.year??years[0]);
 const year=years.includes(Number(viewFocus.year))?Number(viewFocus.year):defaultYear;
 const baseline=years.includes(Number(viewFocus.baseline))&&Number(viewFocus.baseline)!==year?Number(viewFocus.baseline):(years.find(y=>y<year)??years.find(y=>y!==year));
 const period=periodLabels[viewFocus.period]?viewFocus.period:`q${latestComplete?.quarter??3}`;
 const update=(key,value)=>setDashboardFocus?.({...viewFocus,[key]:String(value)});
 const [detail,setDetail]=useState(null);const close=()=>setDetail(null);
 const a=selectPeriod(patientRows,year,period),b=selectPeriod(patientRows,baseline,period),ba=selectBiz(bizRows,year,period),bb=selectBiz(bizRows,baseline,period);
 const canCompare=comparable(a,b);const scopeRows=[...(a?.sourceRows??[]),...(b?.sourceRows??[])];
 const caption=`${periodLabels[period]} ${year} gegenüber ${baseline}`;
 const explain=(title,text,rows=[],columns=moneyCols,onRowSelect)=>setDetail({title,text,rows,columns,onRowSelect});
 const chooseYear=value=>{const y=Number(value);setDashboardFocus?.({...viewFocus,year:String(y),baseline:String(baseline===y?years.find(x=>x<y)??years.find(x=>x!==y):baseline)});};
 const controls=<div className='ordi-filter-controls'><Dropdown label='Jahr' showLabel value={String(year)} choices={years.map(String)} onChange={chooseYear}/>{tab!=='years'&&<Dropdown label='Vergleich mit' showLabel value={String(baseline)} choices={years.filter(y=>y!==year).map(String)} onChange={v=>update('baseline',Number(v))}/>}{!['services','years'].includes(tab)&&<Dropdown label='Zeitraum' showLabel value={period} choices={Object.keys(periodLabels)} choiceLabels={periodLabels} onChange={v=>update('period',v)}/>}</div>;
 const common={snapshot,queries,patientRows,bizRows,codes,years,year,baseline,period,a,b,ba,bb,canCompare,scopeRows,caption,explain,shell,update,viewFocus,careYear};
 return <div className='ordi-page'>
  {!['data','finance','planning','tracking','dashboard'].includes(tab)&&<Filters sticky queries={queries} filters={[]} values={{}} onChange={()=>{}} trailingControls={controls}/>}
  {!['data','finance','planning','tracking','dashboard'].includes(tab)&&<div className='ordi-scope' data-reviewed-rows><span>{tab==='years'?`Jahresübersicht ${year}`:tab==='services'?`Jahresauswertungen ${year} und ${baseline}`:caption}</span><span>Berichtsstand: {date(snapshot.observationCutoff)} · <a href='/bericht/' target='_blank' rel='noreferrer'>تحلیل فارسی / Analysebericht</a></span></div>}
  {tab==='years'&&careYear&&year===careYear&&<PflegeheimAdjustment queries={queries} year={careYear}/>}
  {['patients','services'].includes(tab)&&careYear&&[year,baseline].includes(careYear)&&<p className='ordi-note'>Vergleichsbasis: {careYear} ausschließlich die Ordination, ohne externe Kooperation. Nicht belegbare Teilwerte bleiben offen.</p>}
  {['years','patients'].includes(tab)&&<PracticeContext queries={queries} year={year} baseline={baseline} tab={tab}/>}
  {tab==='dashboard'&&<>
   <div className='ordi-scope'><span>Letztes vollständiges Quartal</span><span>Berichtsstand: {date(snapshot.observationCutoff)} · <a href='/bericht/' target='_blank' rel='noreferrer'>تحلیل فارسی / Analysebericht</a></span></div>
   <CurrentQuarter row={latestComplete} explain={explain}/>
   <section aria-label='Zeiträume vergleichen' className='ordi-overview-comparisons'>
    <SectionHeader id='overview-compare-heading' title='Zeiträume vergleichen'/>
    <Filters queries={queries} filters={[]} values={{}} onChange={()=>{}} trailingControls={controls}/>
    <div className='ordi-scope' data-reviewed-rows><span>{caption}{careYear&&[year,baseline].includes(careYear)?` · ${careYear}: Ordination ohne externe Kooperation`:''}</span></div>
    <PracticeContext queries={queries} year={year} baseline={baseline} tab={tab}/>
    <Overview {...common}/>
   </section>
  </>}
  {tab==='years'&&<YearOverview {...common}/>}
  {tab==='patients'&&<Patients {...common}/>}
  {tab==='services'&&<Services {...common}/>}
  {tab==='data'&&<FilesView {...common}/>}
  {tab==='finance'&&<FinanceView {...common}/>}
  {tab==='planning'&&<PatientPlanning {...common}/>}
  {tab==='tracking'&&<PatientTracking {...common}/>}
  <Dialog open={!!detail} onClose={close} title={detail?.title??'Details'} expanded={Boolean(detail?.rows?.length)}>
   {detail&&<div className='ordi-detail'><p>{detail.text}</p>{detail.rows.length>0&&<DataTable rows={detail.rows} columns={detail.columns} onRowSelect={detail.onRowSelect} searchable={detail.rows.length>8} label={detail.title}/>}<Button onClick={close}>Schließen</Button></div>}
  </Dialog>
 </div>;
}
function careYearList(queries){const y=careHomeYear(queries);return y?<li>{y}: BIZ-Jahres- und Quartalsauswertungen nur für die Ordination. Neupatienten und Sitzungen bleiben bis dahin unbekannt.</li>:null;}
function Missing({children}){return <p className='ordi-empty'>{children}</p>;}
function PeriodNote({a,b,period}){
 if(!a||!b)return <p className='ordi-notice'>Für diesen Zeitraum fehlt ein Bericht. Fehlende Daten werden nicht als 0 Patienten oder 0 Euro gewertet.</p>;
 if(!comparable(a,b))return <p className='ordi-notice'>Mindestens ein Zeitraum ist noch nicht vollständig. Die bisherigen Werte sind sichtbar; eine Wachstumsrate wäre hier irreführend.</p>;
 if(period==='jansep')return <p className='ordi-note'>Leistungswerte von Jänner bis September sind vergleichbar. Die Anzahl unterschiedlicher Personen lässt sich aus drei Quartalen nicht zusammenzählen.</p>;
 return null;
}
function Metric({id,title,value,previous,allowed,format=num,explainText,queryId='ordination_periods',sourceRows,history,explain,neutral=false,showObservedChange=false,comparisonNote=''}){
 const delta=allowed||showObservedChange?change(value,previous):null;
 const detailText=explainText+(showObservedChange?' Prozentuale Differenz = (ausgewählter Wert − Vergleichswert) / Vergleichswert × 100.':'')+(comparisonNote?' '+comparisonNote:'');
 return <SortableItem id={id} label={title} kind='metric' span={4}><MetricCard id={id} queryId={queryId} title={title} value={format(value)} comparison={delta!=null?percent(delta):showObservedChange?'—':null} deltaTone={neutral?'neutral':tone(delta)} displayRows={[{Zeitraum:'Ausgewählt',Wert:value,...(showObservedChange?{ProzentualeDifferenz:delta,Vergleichshinweis:comparisonNote}: {})},{Zeitraum:'Vergleich',Wert:previous}]} sourceRows={sourceRows} description={detailText} trendValues={history??[]}>
  {comparisonNote&&delta!=null&&<p className='ordi-observed-change-note'>{comparisonNote}</p>}
  {showObservedChange&&previous===0&&<p className='ordi-observed-change-note'>Vergleichswert 0: Prozentänderung nicht definiert.</p>}
  <div className='ordi-metric-explain'><span>{previous!=null?`Vergleich: ${format(previous)}`:'Kein passender Vergleichswert'}</span><Button variant='ghost' onClick={()=>explain(title,detailText,[{label:'Ausgewählt',value},{label:'Vergleich',value:previous}],[{field:'label',label:'Zeitraum'},{field:'value',label:title,renderCell:format}])}>Einfach erklärt</Button></div>
 </MetricCard></SortableItem>;
}
function Overview(c){
 const {a,b,ba,bb,canCompare,scopeRows,caption,year,baseline,period,patientRows,explain,shell}=c;
 const valueChange=canCompare?change(a.amount,b.amount):null,patientChange=canCompare?change(a.patients,b.patients):null;
 const per=rate(a?.amount,a?.patients),prevPer=rate(b?.amount,b?.patients);
 const qrows=[1,2,3,4].map(q=>{const row={Quartal:`Q${q}`};for(const y of [...new Set([baseline,year])].sort()) {const r=patientRows.find(r=>r.year===y&&r.quarter===q);row[String(y)]=r?.complete?r.amount:null;}return row;});
 const prows=[1,2,3,4].map(q=>{const row={Quartal:`Q${q}`};for(const y of [...new Set([baseline,year])].sort()){const r=patientRows.find(r=>r.year===y&&r.quarter===q);row[String(y)]=r?.complete?r.patients:null;}return row;});
 const histRows=patientRows.filter(r=>r.quarter&&[baseline,year].includes(r.year)&&r.complete);
 const fields=[baseline,year].sort().map(String);
 const action=({row})=>row?.Quartal?[{label:'Dieses Quartal vergleichen',onSelect:()=>c.update('period',`q${row.Quartal.slice(1)}`)}]:[];
 let finding='Wählen Sie einen vollständigen Zeitraum für einen fairen Vergleich.';
 if(canCompare&&patientChange!=null)finding=`${signed(a.patients-b.patients)} behandelte Personen (${percent(patientChange)}) und ${percent(valueChange)} Leistungswert gegenüber dem gleichen Zeitraum ${baseline}.`;
 else if(canCompare)finding=`Der Leistungswert ist im vergleichbaren Zeitraum um ${percent(valueChange)} verändert. Die Zahl unterschiedlicher Personen ist für diesen Gesamtzeitraum nicht verfügbar.`;
 const moneyHistory=patientRows.filter(r=>r.year===year&&r.quarter&&r.complete).sort((a,b)=>a.quarter-b.quarter).map(r=>r.amount);
 return <>
  <PeriodNote {...c}/>
  <SortableRegion id='ordi-overview-canvas' variant='canvas' spacing='standard' columns={12} rows={[{id:'overview-metrics',kind:'metrics',items:['ov-money','ov-patients','ov-perperson']},{id:'overview-summary',items:['ov-summary']},{id:'overview-trends',items:['ov-revenue-trend','ov-patient-trend'],header:<SectionHeader id='overview-development' title='Wie entwickeln wir uns?'/>},{id:'overview-details',items:['ov-detail'],header:<SectionHeader id='overview-exact' title='Der ausgewählte Vergleich im Detail'/>}]}>
   <Metric id='ov-money' title='Wert unserer Leistungen' value={a?.amount} previous={b?.amount} allowed={canCompare} format={euro} sourceRows={scopeRows} history={moneyHistory} explain={explain} explainText={`Wert der erfassten Leistungen, einschließlich Kassen- und Patientenanteil${c.careYear?`; ${c.careYear} ohne externe Kooperation`:''}. Das ist weder Gewinn noch bereits eingegangenes Geld. ${caption}.`}/>
   <Metric id='ov-patients' title='Personen der Ordination' value={a?.patients} previous={b?.patients} allowed={canCompare} sourceRows={scopeRows} explain={explain} explainText='Personen der Patientenstatistik, abzüglich einer etwaigen bestätigten Pflegeheim-Liste im selben Zeitraum. Die Originalzahl und der Abzug stehen unter Jahresübersicht. Wer in mehreren Quartalen kommt, darf für ein Jahr nicht mehrfach gezählt werden. Weniger behandelte Personen beweisen noch keine dauerhafte Abwanderung.'/>
   <Metric id='ov-perperson' title='Leistungswert je Person' value={per} previous={prevPer} allowed={canCompare} format={euro} sourceRows={scopeRows} explain={explain} neutral explainText='Leistungswert der Ordination geteilt durch die Personenzahl derselben Abgrenzung. Eine externe Kooperation wird gegebenenfalls in beiden Größen ausgeschlossen. Ein höherer Wert kann unter anderem mit anderen Behandlungen oder Preisen zusammenhängen. Die Ursache ist aus diesen Summen nicht erkennbar.'/>
   <SortableItem id='ov-summary' label='Was bedeutet das?' kind='custom' span={12}><DataComponent variant='card' id='ov-summary' queryId='ordination_periods' title='Was bedeutet das?' kind='custom' displayRows={[{Vergleich:caption,Leistungswert:a?.amount,Personen:a?.patients}]} sourceRows={scopeRows}>
    <p className='ordi-finding' data-reviewed-rows>{finding}</p><div className='ordi-actions'><Button onClick={()=>shell.exploreDashboard?.('years',{focus:{year:String(year)}})}>Einzelnes Jahr ansehen</Button><Button onClick={()=>shell.exploreDashboard?.('patients',{focus:{year:String(year),baseline:String(baseline),period}})}>Patienten genauer ansehen</Button><Button onClick={()=>shell.exploreDashboard?.('services',{focus:{year:String(year),baseline:String(baseline)}})}>Leistungsbereiche ansehen</Button></div>
   </DataComponent></SortableItem>
   <SortableItem id='ov-revenue-trend' kind='chart' label='Leistungswert je Quartal' span={6}><EvidenceChart variant='card' id='ov-revenue-trend' queryId='ordination_periods' title='Leistungswert je Quartal' rows={qrows} sourceRows={histRows} height={260} spec={{...chartBase,type:'bar',x:'Quartal',y:fields[0],fields,currency:'EUR'}} chartOptions={{getMarkActions:action}} description={`Gleiche Quartale ${baseline} und ${year}. Unvollständige Quartale sind im Diagramm ausgespart.`}><p className='ordi-note'>Ganzjahresübersicht der vollständigen Quartale. Die Auswahl oben steuert die Kennzahlen; ein Klick auf einen Balken wählt das Quartal.</p></EvidenceChart></SortableItem>
   <SortableItem id='ov-patient-trend' kind='chart' label='Personen je Quartal' span={6}><EvidenceChart variant='card' id='ov-patient-trend' queryId='ordination_periods' title='Personen je Quartal' rows={prows} sourceRows={histRows} height={260} spec={{...chartBase,type:'bar',x:'Quartal',y:fields[0],fields}} chartOptions={{getMarkActions:action}} description='Patientenzahl je Quartal. Dieselbe Person kann in mehreren Quartalen vorkommen.'/></SortableItem>
   <SortableItem id='ov-detail' kind='table' label='Vergleichszahlen' span={12}><DataComponent variant='card' id='ov-detail' queryId='ordination_periods' title={caption} kind='table' sourceRows={scopeRows} displayRows={[{Kennzahl:'Leistungswert',Ausgewählt:a?.amount,Vergleich:b?.amount},{Kennzahl:'Personen',Ausgewählt:a?.patients,Vergleich:b?.patients},{Kennzahl:'Leistungswert je Person',Ausgewählt:per,Vergleich:prevPer}]}>
    <div className='ordi-comparison-head'><span>Kennzahl</span><span>{year}</span><span>{baseline}</span><span>Veränderung</span></div><div className='ordi-comparison' data-reviewed-rows>{[{label:'Wert unserer Leistungen',v:a?.amount,p:b?.amount,f:euro},{label:'Behandelte Personen',v:a?.patients,p:b?.patients,f:num},{label:'Leistungswert je Person',v:per,p:prevPer,f:euro}].map(r=><button key={r.label} className='ordi-comparison-row' onClick={()=>explain(r.label,caption,[{label:String(year),value:r.v},{label:String(baseline),value:r.p}],[{field:'label',label:'Jahr'},{field:'value',label:r.label,renderCell:r.f}])}><span>{r.label}</span><strong>{r.f(r.v)}</strong><span>{r.f(r.p)}</span><span>{canCompare?percent(change(r.v,r.p)):'—'}</span></button>)}</div>
   </DataComponent></SortableItem>
  </SortableRegion>
 </>;
}
function Patients(c){
 const {a,b,ba,bb,canCompare,scopeRows,year,baseline,period,patientRows,bizRows,queries,explain}=c;
 const bizEvidence=[...(ba?.sourceRows??[]),...(bb?.sourceRows??[])];
 const years=[...new Set(bizRows.filter(r=>r.quarter==null).map(r=>r.year))].sort();
 const newHistory=years.map(y=>{const r=bizRows.find(r=>r.year===y&&r.quarter==null);const current=y===Number(c.snapshot.observationCutoff?.slice(0,4));return {Jahr:`${y}${r?.newPatients==null?' (fehlt)':current?' (bisher)':''}`,'Neue Patienten':r?.newPatients??null,Status:r?.newPatients==null?'Nicht verfügbar: BIZ ohne externe Kooperation fehlt':current?'Bisheriger Jahresstand':'Vollständiges Jahr'};});
 const ageRows=queries.ordination_patient_segments.rows.filter(r=>r.dimension==='Alter'&&[year,baseline].includes(r.year));
 const ages=[...new Set(ageRows.map(r=>r.label))];const ageChart=ages.filter(x=>x!=='Keine Angabe').map(label=>{const row={Altersgruppe:label};for(const y of [baseline,year]){const all=ageRows.filter(r=>r.year===y),ref=all.find(r=>r.label===label);row[`${y} (%)`]=ref?100*ref.patients/total(all,'patients'):null;}return row;});
 const fields=[baseline,year].sort().map(y=>`${y} (%)`);
 const newAllowed=canCompare&&ba?.newPatients!=null&&bb?.newPatients!=null;
 const observedNote=!canCompare&&a&&b?(period==='annual'&&!a.complete&&b.complete?'Bisher vs. ganzes Vergleichsjahr':period==='annual'&&a.complete&&!b.complete?'Ganzes Jahr vs. bisheriges Vergleichsjahr':'Unterschiedliche oder unvollständige Zeiträume'):'';
 return <>
  {observedNote?<p className='ordi-notice'>Die Prozente zeigen die rechnerische Differenz der angezeigten Werte. {year}: {a?.complete?'vollständig':`bisher bis ${date(a?.coverageEnd)}`}; {baseline}: {b?.complete?'vollständig':`bisher bis ${date(b?.coverageEnd)}`}. Bei unterschiedlicher Laufzeit sind sie keine Wachstumsrate für gleich lange Zeiträume.</p>:<PeriodNote {...c}/>}
  <SortableRegion id='ordi-patients-canvas' variant='canvas' spacing='standard' columns={12} rows={[{id:'patients-metrics',kind:'metrics',items:['pt-new','pt-known','pt-sessions']},{id:'patient-retention',items:['pt-retention']},{id:'patient-acquisition',items:['pt-new-history','pt-mix']},{id:'patient-ages',items:['pt-ages'],header:<SectionHeader id='patient-age-header' title='Welche Altersgruppen kommen zu uns?'/>}]}>
   <Metric showObservedChange comparisonNote={observedNote} id='pt-new' title='Neue Patienten laut BIZ' value={ba?.newPatients} previous={bb?.newPatients} allowed={newAllowed} queryId='ordination_biz_patients' sourceRows={bizEvidence} explain={explain} explainText='Neue Patienten laut BIZ-Auswertung. Im Jahr einer externen Kooperation fehlt meist eine Auswertung in der bereinigten Ordinationsabgrenzung; dann bleibt der Wert unbekannt. Fehlen BIZ-Vergleichsberichte, bleibt die Veränderung offen.'/>
   <Metric showObservedChange comparisonNote={observedNote} id='pt-known' title='Personen der Ordination' value={a?.patients} previous={b?.patients} allowed={canCompare} queryId='ordination_periods' sourceRows={scopeRows} explain={explain} explainText='Patientenstatistik abzüglich einer etwaigen Pflegeheim-Liste. Die Neupatientenzahl aus BIZ ist nicht entsprechend aufgeteilt und darf nicht von dieser Zahl abgezogen werden.'/>
   <Metric showObservedChange comparisonNote={observedNote} id='pt-sessions' title='Sitzungen laut BIZ' value={ba?.sessions} previous={bb?.sessions} allowed={canCompare&&ba?.sessions!=null&&bb?.sessions!=null} queryId='ordination_biz_patients' sourceRows={bizEvidence} explain={explain} explainText='Patientensitzungen laut BIZ. Im Jahr einer externen Kooperation fehlt meist eine gesonderte Auswertung der Ordination; dann bleibt der Wert unbekannt. Eine Sitzung kann mehrere Leistungspositionen enthalten.'/>
   <SortableItem id='pt-retention' label='Haben wir Patienten verloren?' kind='custom' span={12}><DataComponent variant='card' id='pt-retention' queryId='ordination_biz_patients' queryIds={['ordination_biz_patients','ordination_patient_service_summary']} title='Haben wir Patienten verloren?' kind='custom' displayRows={[{Kennzahl:'Verlorene Patienten',Wert:null},{Kennzahl:'Zurückgekehrte Patienten',Wert:null}]} sourceRowsByQuery={{ordination_biz_patients:bizEvidence,ordination_patient_service_summary:queries.ordination_patient_service_summary?.rows??[]}}>
    <p className='ordi-finding'>Wiedergefundene Referenzen lassen sich jetzt vergleichen.</p><Button onClick={()=>c.shell.exploreDashboard?.('tracking')}>Patientenverlauf direkt im Panel öffnen</Button><p className='ordi-body'>Die Leistungsaufstellungen enthalten jetzt stabile anonyme Patientenreferenzen und Zeilendaten. Ob eine Person dauerhaft ausbleibt, braucht zusätzlich eine Definition von tatsächlichem Besuch und Inaktivität.</p><details className='ordi-disclosure'><summary>Welche Information fehlt dafür?</summary><p>Die anonymisierten Referenzen sind vorhanden. Geplante Positionen zählen nicht als Besuch. Es muss festgelegt werden, welche nicht roten Einträge einen Besuch darstellen und nach welcher Zeit ohne Besuch eine Person als inaktiv gilt. Ein abgeschlossener Behandlungsfall ist nicht automatisch eine Abwanderung.</p></details>
   </DataComponent></SortableItem>
   <SortableItem id='pt-new-history' label='Neue Patienten nach Jahr' kind='chart' span={6}><EvidenceChart variant='card' id='pt-new-history' queryId='ordination_biz_patients' title='Neue Patienten nach Jahr (BIZ)' rows={newHistory} sourceRows={bizRows.filter(r=>r.quarter==null)} height={260} spec={{...chartBase,type:'bar',x:'Jahr',y:'Neue Patienten',showLegend:false}} chartOptions={{getMarkActions:({row})=>[{label:'Jahreswert erklären',onSelect:()=>explain('Neue Patienten',`${row.Jahr}: ${num(row['Neue Patienten'])} laut BIZ. ${row.Status}.`)}]}}>{c.careYear&&<p className='ordi-notice'>{c.careYear}: Nicht verfügbar. Die BIZ-Auswertung ohne externe Kooperation fehlt. Leer bedeutet unbekannt, nicht 0.</p>}<p className='ordi-note'>{c.careYear?`Benötigt wird die BIZ-Jahresauswertung ${c.careYear} nur für die Ordination. `:''}Die Gesamtzahl der ausgeschlossenen Personen darf nicht von der Neupatientenzahl abgezogen werden. Das laufende Jahr ist nur bis zum jeweiligen Berichtsstand erfasst.</p></EvidenceChart></SortableItem>
   <SortableItem id='pt-mix' label='Was können wir bereits erkennen?' kind='custom' span={6}><DataComponent variant='card' id='pt-mix' queryId='ordination_biz_patients' title='Was können wir bereits erkennen?' kind='custom' displayRows={[{Jahr:year,Neu:ba?.newPatients,BIZ_Personen:ba?.patients,Besuche:ba?.sessions}]} sourceRows={bizEvidence}>
    <div className='ordi-readouts' data-reviewed-rows><div><span>Zum ersten Mal im BIZ gezählt</span><strong>{num(ba?.newPatients)}</strong></div><div><span>Behandelte Personen laut BIZ</span><strong>{num(ba?.patients)}</strong></div><div><span>Besuche laut BIZ</span><strong>{num(ba?.sessions)}</strong></div></div>
    <p className='ordi-note'>Im Jahr einer externen Kooperation fehlen bereinigte BIZ-Neupatienten und Sitzungen. Diese Werte bleiben offen und werden nicht geschätzt. BIZ und Patientenstatistik zählen teilweise unterschiedlich. Die Zahlen werden nicht zur Berechnung einer Bindungsquote vermischt.</p><Button variant='ghost' onClick={()=>explain('Patientenbindung','Eine Veränderung der Gesamtzahl beschreibt die Aktivität der Ordination. Individuelle Abwanderung erfordert einen Vergleich derselben anonymisierten Personen über die Zeit.')}>Warum ist das keine Abwanderungsquote?</Button>
   </DataComponent></SortableItem>
   <SortableItem id='pt-ages' label='Anteil nach Alter' kind='chart' span={12}><EvidenceChart variant='card' id='pt-ages' queryId='ordination_patient_segments' title={`Altersverteilung: Jahresauswertungen ${year} und ${baseline}`} rows={ageChart} sourceRows={ageRows} height={290} spec={{...chartBase,type:'bar',x:'Altersgruppe',y:fields[0],fields}} chartOptions={{getMarkActions:({row})=>[{label:'Altersgruppe erklären',onSelect:()=>explain(`Altersgruppe ${row.Altersgruppe}`,'Anteile innerhalb der jeweiligen Jahresauswertung. Eine andere Altersmischung erklärt allein keine Abwanderung.',[{label:String(year),value:row[`${year} (%)`]},{label:String(baseline),value:row[`${baseline} (%)`]}],[{field:'label',label:'Jahr'},{field:'value',label:'Anteil',renderCell:v=>v==null?'Nicht verfügbar':`${new Intl.NumberFormat('de-AT',{maximumFractionDigits:1}).format(v)} %`}])}]}} description='Anteile innerhalb der jeweiligen Jahrespopulation. Beim laufenden Jahr nur die bisher behandelten Personen. Die Altersverteilung ist jahresbezogen und folgt nicht dem Quartalsfilter.'><p className='ordi-note'>{c.careYear?`${c.careYear} ist um dieselbe externe Kohorte bereinigt. `:''}Unabhängig vom oben gewählten Quartal. Kleine Fallzahlen sind kein Beleg für eine Schwäche.</p></EvidenceChart></SortableItem>
  </SortableRegion>
 </>;
}
function Services(c){
 const {year,baseline,codes,viewFocus,update,queries,explain,snapshot}=c;
 const group=!viewFocus.group||viewFocus.group==='all'?'Alle Bereiche':viewFocus.group;const groups=[...new Set(codes.filter(r=>[year,baseline].includes(r.year)).map(r=>r.group))].sort();
 const allRows=serviceRows(codes,year,baseline),rows=allRows.filter(r=>group==='Alle Bereiche'||r.group===group);
 const sourceRows=codes.filter(r=>[year,baseline].includes(r.year)&&(group==='Alle Bereiche'||r.group===group));
 const annualCurrent=selectPeriod(c.patientRows,year,'annual'),annualPrevious=selectPeriod(c.patientRows,baseline,'annual');
 const hasCurrent=codes.some(r=>r.year===year),hasPrevious=codes.some(r=>r.year===baseline);
 const complete=comparable(annualCurrent,annualPrevious)&&codes.filter(r=>[year,baseline].includes(r.year)).every(r=>r.complete);
 if(!hasCurrent||!hasPrevious)return <Missing>Für { !hasCurrent?year:baseline } fehlt die Auswertung der Leistungen. Bitte den passenden PDF-Bericht unter Dateien & Aktualisieren ergänzen.</Missing>;
 const grouped=serviceGroups(rows).sort((a,b)=>b.amount-a.amount),therapeutic=grouped.filter(g=>!nonTreatment.has(g.group));
 const contributions=therapeutic.map(g=>({Bereich:g.group,Veränderung:g.delta})).sort((a,b)=>b.Veränderung-a.Veränderung);
 const biggestUp=[...therapeutic].filter(g=>g.delta>0).sort((a,b)=>b.delta-a.delta)[0];
 const biggestDown=[...therapeutic].filter(g=>g.delta<0).sort((a,b)=>a.delta-b.delta)[0];
 const serviceAmount=(value,other)=>{const higher=Number.isFinite(value)&&Number.isFinite(other)&&Math.round(value*100)>Math.round(other*100);return <span className={`ordi-service-amount${higher?' ordi-higher-amount':''}`} aria-label={higher?`Höherer Betrag: ${euro(value,2)}`:undefined}>{euro(value,2)}</span>;};
 const codeColumns=[{field:'code',label:'Kürzel'},{field:'description',label:'Leistung'},{field:'amount',label:String(year),renderCell:(v,row)=>serviceAmount(v,row.previous)},{field:'previous',label:String(baseline),renderCell:(v,row)=>serviceAmount(v,row.amount)},{field:'count',label:'Positionen',renderCell:num},...(complete?[{field:'delta',label:'Veränderung',renderCell:v=>`${v>0?'+':''}${euro(v,2)}`,deltaTone:v=>tone(v)}]:[])];
 const selectCode=row=>explain(`${row.code} · ${row.description}`,`Gruppe: ${row.group}. Bereinigter historischer Leistungswert der Ordination. Mengen sowie Patienten-/Kassenanteile betroffener Codes können im Kooperationsjahr ohne passenden Teilbericht fehlen. Der aktuelle Lexikonpreis (${euro(row.currentPrice,2)}) ist nur eine heutige Referenz, keine rückwirkende Neubewertung. Positionen sind keine eindeutigen Patienten.`,[{label:`${year}: Leistungswert`,value:row.amount},{label:`${baseline}: Leistungswert`,value:row.previous},{label:'Aktueller Lexikonpreis',value:row.currentPrice}]);
 const mixRows=therapeutic.map(g=>({Bereich:g.group,[String(year)]:g.amount,[String(baseline)]:g.previous}));
 const fields=[baseline,year].sort().map(String);
 return <>
  <div className='ordi-section-control'><Dropdown label='Leistungsbereich' showLabel value={group} choices={['Alle Bereiche',...groups]} onChange={v=>update('group',v)}/></div>
  {!complete&&<p className='ordi-notice'>Jahreswerte mit unterschiedlicher Laufzeit. Die Beträge bleiben zur Orientierung sichtbar; Gewinner, Rückgänge und Wachstumsraten werden dafür nicht berechnet.</p>}
  {c.careYear&&[year,baseline].includes(c.careYear)&&<p className='ordi-note'>{c.careYear} zeigt ausschließlich die Ordination ohne externe Kooperation. Für betroffene Codes fehlen separat belegte Mengeneinheiten und Patienten-/Kassenanteile; diese Felder bleiben offen. BIZ-Neupatienten und Sitzungen {c.careYear} benötigen ebenfalls einen passenden bereinigten Export.</p>}
  <p className='ordi-note'>Leistungsdetails liegen derzeit nur für ganze ausgewählte Kalenderjahre vor. Ein Vergleich einzelner Leistungen nach Quartal benötigt zusätzliche Exporte.</p>
  <SortableRegion id='ordi-services-canvas' variant='canvas' spacing='standard' columns={12} rows={[{id:'service-key-metrics',kind:'metrics',items:['sv-total','sv-private','sv-insurance']},{id:'service-strength',items:['sv-strength']},{id:'service-mix',items:['sv-mix','sv-delta'],header:<SectionHeader id='service-composition' title='Welche Leistungen tragen zur Entwicklung bei?'/>},{id:'service-rows',items:['sv-table'],header:<SectionHeader id='service-details-header' title='Einzelne Leistungen nachsehen'/>}]}>
   <Metric id='sv-total' title='Erfasster Leistungswert' value={total(rows,'amount')} previous={total(rows,'previous')} allowed={complete} format={euro} queryId='ordination_service_codes' sourceRows={sourceRows} explain={explain} explainText='Summe der ausgewählten Leistungswerte, gegebenenfalls ohne externe Kooperation. Bei Alle Bereiche sind Preisnachlässe und berechnete versäumte Termine enthalten.'/>
   <Metric id='sv-private' title='Von Patienten zu tragen' value={sum(sourceRows.filter(r=>r.year===year),'patientAmount')} previous={sum(sourceRows.filter(r=>r.year===baseline),'patientAmount')} allowed={complete} format={euro} queryId='ordination_service_codes' sourceRows={sourceRows} explain={explain} explainText='Patientenanteil einschließlich privater Leistungen laut Leistungsbericht. Der Betrag beweist keinen Zahlungseingang.'/>
   <Metric id='sv-insurance' title='Von Kassen zu tragen' value={sum(sourceRows.filter(r=>r.year===year),'insuranceAmount')} previous={sum(sourceRows.filter(r=>r.year===baseline),'insuranceAmount')} allowed={complete} format={euro} queryId='ordination_service_codes' sourceRows={sourceRows} explain={explain} explainText='Kassenanteil laut Leistungsbericht. Kein Nachweis, dass das Geld bereits eingegangen ist.'/>
   <SortableItem id='sv-strength' label='Wo gewinnen wir, wo fehlt etwas?' kind='custom' span={12}><DataComponent variant='card' id='sv-strength' queryId='ordination_service_codes' title='Wo gewinnen wir, wo fehlt etwas?' kind='custom' displayRows={grouped} sourceRows={sourceRows}>
    {complete?<div className='ordi-insight-pair' data-reviewed-rows><div><span className='ordi-small'>Größter Zuwachs im Leistungswert</span><p className='ordi-finding'>{biggestUp?.group??'Kein positiver Zuwachs'}</p><strong className='ordi-positive'>{biggestUp?`+${euro(biggestUp.delta)}`:'—'}</strong></div><div><span className='ordi-small'>Größter Rückgang im Leistungswert</span><p className='ordi-finding'>{biggestDown?.group??'Kein Rückgang'}</p><strong className='ordi-negative'>{biggestDown?euro(biggestDown.delta):'—'}</strong></div></div>:<Missing>Für einen fairen Vergleich wählen Sie zwei vollständig erfasste Jahre.</Missing>}
    <details className='ordi-disclosure'><summary>Was sagen diese Stärken und Rückgänge aus?</summary><p>Sie zeigen Beiträge zum erfassten Leistungswert. Sie bewerten weder die Qualität der Behandlung noch den Gewinn. Ohne Kosten, Arbeitszeit und historische Tarife ist die Ursache der Veränderung offen. Eine Verschiebung zwischen ähnlichen Codes kann einen Teil der Entwicklung erklären.</p></details>
   </DataComponent></SortableItem>
   <SortableItem id='sv-mix' label='Leistungswert nach Bereich' kind='chart' span={6}><EvidenceChart variant='card' id='sv-mix' queryId='ordination_service_codes' title='Leistungswert nach Bereich' rows={mixRows} sourceRows={sourceRows} height={380} spec={{...chartBase,type:'horizontalBar',x:'Bereich',y:fields[0],fields,currency:'EUR'}} chartOptions={{getMarkActions:({row})=>[{label:'Leistungen dieses Bereichs ansehen',onSelect:()=>update('group',row.Bereich)}]}}><p className='ordi-note'>Therapeutische Bereiche. Dokumentation, Rabatte und versäumte Termine sind separat in der Tabelle auffindbar.</p></EvidenceChart></SortableItem>
   <SortableItem id='sv-delta' label='Veränderung nach Bereich' kind='chart' span={6}>{complete?<EvidenceChart variant='card' id='sv-delta' queryId='ordination_service_codes' title={`Mehr oder weniger als ${baseline}`} rows={contributions} sourceRows={sourceRows} height={380} spec={{...chartBase,type:'horizontalBar',x:'Bereich',y:'Veränderung',currency:'EUR',showLegend:false,colorBySign:true}} chartOptions={{getMarkActions:({row})=>[{label:'Bereich genauer ansehen',onSelect:()=>update('group',row.Bereich)}]}}/>:<DataComponent variant='card' id='sv-delta' queryId='ordination_service_codes' title='Veränderung nach Bereich' kind='custom' displayRows={[]} sourceRows={sourceRows}><Missing>Für diese beiden Jahre ist die Laufzeit nicht gleich. Deshalb wird hier keine Veränderung als Stärke oder Schwäche ausgewiesen.</Missing></DataComponent>}</SortableItem>
   <SortableItem id='sv-table' label='Leistungsdetails' kind='table' span={12}><DataComponent variant='card' id='sv-table' queryId='ordination_service_codes' title='Leistungsdetails' kind='table' displayRows={rows} sourceRows={sourceRows}><p className='ordi-table-key'><span className='ordi-higher-amount'>Höherer Betrag</span> Blau markiert den größeren Betrag je Zeile. Gleiche Beträge bleiben neutral.</p><DataTable rows={rows} columns={codeColumns} label='Leistungsdetails' onRowSelect={selectCode} rowKey='code' rowActionLabel={r=>`${r.code} erklären`}/></DataComponent></SortableItem>
  </SortableRegion>
 </>;
}
function FilesView({queries,snapshot,explain}){
 const files=queries.file_inventory.rows;const reconciliation=queries.reconciliation.rows;
 const bankCoverage=queries.bank_coverage?.rows??[];
 const quarterDifferences=queries.patient_periods.rows.filter(r=>r.quarter===null).map(a=>{const quarters=queries.patient_periods.rows.filter(r=>r.year===a.year&&r.quarter);return {year:a.year,cents:quarters.length===4?Math.round(total(quarters,'amount')*100)-Math.round(a.amount*100):null};}).filter(r=>r.cents!=null&&r.cents!==0);
 return <>
  <DataExports snapshot={snapshot}/>
  <ImportManager snapshot={snapshot}/>
  <Section id='data-trust-heading' title='Was die Zahlen verlässlich beantworten' columns={2}>
   <DataComponent variant='card' id='data-can-answer' queryId='ordination_periods' title='Bereits möglich' kind='custom' displayRows={[]} sourceRows={queries.ordination_periods.rows}><ul className='ordi-list'><li>Gleiche Quartale und vollständige Jahre vergleichen.</li><li>Mehr oder weniger behandelte Personen erkennen.</li><li>Leistungswerte und Leistungsbereiche vergleichen.</li><li>Neue Patienten dort anzeigen, wo BIZ-Daten in derselben Abgrenzung vorliegen.</li></ul></DataComponent>
   <DataComponent variant='card' id='data-cannot-answer' queryId='ordination_biz_patients' title='Dafür fehlen noch Daten' kind='custom' displayRows={[]} sourceRows={queries.ordination_biz_patients.rows}><ul className='ordi-list'>{careYearList(queries)}<li>Laufendes Jahr: Patientenstatistik, BIZ, Leistungsstatistik und Leistungsaufstellung am selben Tag mit denselben Filtern exportieren, um die abweichenden Beträge zu klären.</li><li>Bank: Vorhandene Abdeckung {bankCoverage.map(r=>`${date(r.start)}–${date(r.end)}`).join(' · ')}. Fehlende Monate werden nicht als null gewertet.</li><li>Verlorene und zurückgekehrte Patienten: Besuchsdefinition und Zeitraum für Inaktivität; anonyme Referenzen liegen jetzt vor.</li><li>Gewinn: vollständige Belege, geklärte Privat-/Betriebsanteile sowie Tilgung, Zinsen und Anlagen.</li><li>Leistung je Arbeitsstunde: Stunden, Team und Schließzeiten.</li><li>Einzelne Leistungen je Quartal: Zeilendatum und Abgrenzung zur bisherigen Leistungsstatistik klären.</li></ul></DataComponent>
  </Section>
  <Section id='reconciliation-heading' title='Unterschiede zwischen Berichten'>
   <DataComponent variant='card' id='data-reconciliation' queryId='reconciliation' title='Jahressummen im Abgleich · Originalberichte' kind='table' displayRows={reconciliation} sourceRows={reconciliation} description='BIZ ist auf ganze Euro gerundet. Die anderen Berichte zeigen Centbeträge. Unterschiedliche Berichtserstellungszeiten oder Filter sind mögliche, nicht bestätigte Erklärungen.'><DataTable label='Jahressummen im Abgleich' rows={reconciliation} searchable={false} columns={[{field:'year',label:'Jahr'},{field:'patientStats',label:'Patientenstatistik',renderCell:v=>euro(v,2)},{field:'serviceList',label:'Leistungsbericht',renderCell:v=>euro(v,2)},{field:'biz',label:'BIZ (gerundet)',renderCell:euro}]} onRowSelect={r=>explain(`Berichtsvergleich ${r.year}`,'Für den Überblick verwenden wir die Patientenstatistik; für Leistungsdetails den Leistungsbericht; für neue Patienten und Sitzungen BIZ. Die Quellen werden nicht stillschweigend angeglichen.',[{label:'Patientenstatistik',value:r.patientStats},{label:'Leistungsbericht',value:r.serviceList},{label:'BIZ',value:r.biz}])}/><p className='ordi-note'>Hier stehen Original-Gesamtberichte vor der Bereinigung. Operative Vergleiche verwenden im Kooperationsjahr ausschließlich die Ordination. BIZ-Beträge sind auf ganze Euro gerundet. Abweichende Berichte werden nicht vermischt.</p>{quarterDifferences.map(r=><p key={r.year} className='ordi-notice' data-reviewed-rows>{r.year}: Die Summe der vier Quartalsberichte weicht um {euro(r.cents/100,2)} vom Jahresbericht ab. Originalwerte bleiben erhalten; dieselben Zeiträume und Filter müssen erneut abgeglichen werden.</p>)}</DataComponent>
  </Section>
  <Section id='source-files-heading' title='Eingelesene Dateien'>
   <DataComponent variant='card' id='data-files' queryId='file_inventory' title={`${files.length} Quelldateien`} kind='table' displayRows={files} sourceRows={files}><DataTable label='Eingelesene Dateien' rows={files} columns={[{field:'file',label:'Datei'},{field:'kind',label:'Inhalt'},{field:'period',label:'Zeitraum'},{field:'selection',label:'Verwendung'},{field:'pages',label:'Seiten'}]} onRowSelect={r=>explain(r.file,`Typ: ${r.kind}. Seiten: ${r.pages}. Original bleibt erhalten. SHA-256: ${r.sha256}`)}/></DataComponent>
  </Section>
  {snapshot.importIssues?.length>0&&<Section id='file-issues-heading' title='Diese Dateien brauchen noch eine Prüfung'><ul>{snapshot.importIssues.map((x,i)=><li key={i}>{x.file}: {x.reason}</li>)}</ul></Section>}
 </>;
}
