import React,{useState} from 'react';
import {BankAssignment} from './BankAssignment.jsx';
import {DataComponent,DataTable,EvidenceChart,MetricCard,Section,Dropdown,Button,Filters} from '../../data-app-public.jsx';
import {bankSum,bankPeriodLabels,bankScope,bankStats,bankGroups,bankMonths,bankMonthlyAverage,performanceForBank,performanceEvidence} from '../shared/bank-model.js';
const euro=v=>v==null?'Nicht verfügbar':new Intl.NumberFormat('de-AT',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(v);
const money=(v,direction)=> <span className={direction==='in'||(!direction&&v>0)?'ordi-money-in':direction==='out'||(!direction&&v<0)?'ordi-money-out':undefined}>{euro(v)}</span>;
const number=v=>new Intl.NumberFormat('de-AT').format(v);
const date=s=>s?new Intl.DateTimeFormat('de-AT').format(new Date(s+'T12:00:00')):'nicht vorhanden';
const spec={showXAxisLabel:false,showYAxisLabel:false,startAtZero:true,showLegend:false,valueDecimals:2,stackable:false,currency:'EUR'};
export const bankColumns=[{field:'date',label:'Datum',renderCell:date},{field:'merchant',label:'An wen / woher'},{field:'category',label:'Kategorie'},{field:'amount',label:'Betrag',renderCell:v=>money(v)},{field:'bucket',label:'Bereich'}];
export function FinanceView({queries,snapshot,viewFocus,update,explain}){
 const [assignmentOpen,setAssignmentOpen]=useState(false),[assignmentRow,setAssignmentRow]=useState(null);
 const editAssignment=row=>{setAssignmentRow(row);setAssignmentOpen(true);};
 const all=queries.bank_transactions?.rows??[],years=[...new Set(all.map(r=>r.year))].sort((a,b)=>b-a);
 if(!years.length)return <p className='ordi-notice'>Noch keine lesbare Bank-Umsatzübersicht vorhanden. Bitte unter „Dateien & Aktualisieren“ hinzufügen.</p>;
 const year=years.includes(Number(viewFocus.year))?Number(viewFocus.year):years[0],period=bankPeriodLabels[viewFocus.period]?viewFocus.period:'annual';
 const scope=bankScope(queries,year,period),rows=scope.rows,s=bankStats(rows),out=rows.filter(r=>r.amount<0),inside=rows.filter(r=>r.amount>0);
 const average=bankMonthlyAverage(scope),averageBasis=average.count?`${average.count} vollständig belegte ${average.count===1?'Kalendermonat':'Kalendermonate'}: ${average.full.map(m=>m.label).join(', ')}.`:'Noch kein vollständig belegter Kalendermonat in dieser Auswahl.';
 const excluded=average.months.filter(m=>!m.complete&&m.covered).map(m=>m.label);
 const averageExplanation=`Monatsdurchschnitt = Summe der Buchungen aus vollständig belegten Kalendermonaten geteilt durch deren Anzahl. ${averageBasis}${excluded.length?` Nicht berücksichtigt, weil unvollständig: ${excluded.join(', ')}.`:''} Monate ohne Bankdaten werden nicht als Nullmonate gerechnet. Die großen Kontosummen enthalten weiterhin alle Buchungen des ausgewählten Zeitraums, auch aus Teilmonaten. Eine Kontoveränderung ist kein Gewinn.`;
 const averageRows=average.full.map(m=>({Monat:m.label,Eingänge:m.incoming,Ausgänge:m.outgoing,Kontoveränderung:m.net}));
 const showAverage=()=>explain('So entsteht der Monatsdurchschnitt',averageExplanation,averageRows,[{field:'Monat',label:'Vollständiger Monat'},{field:'Eingänge',label:'Eingänge',renderCell:v=>money(v,'in')},{field:'Ausgänge',label:'Ausgänge',renderCell:v=>money(v,'out')},{field:'Kontoveränderung',label:'Kontoveränderung',renderCell:v=>money(v)}]);
 const bucketChoices=['Alle Auszahlungen',...new Set(out.map(r=>r.bucket))];
 const bucket=bucketChoices.includes(viewFocus.bucket)?viewFocus.bucket:'Ordination';
 const scopedBucket=out.filter(r=>bucket==='Alle Auszahlungen'||r.bucket===bucket);
 const categories=['Alle Kategorien',...new Set(scopedBucket.map(r=>r.category))].sort((a,b)=>a==='Alle Kategorien'?-1:b==='Alle Kategorien'?1:a.localeCompare(b,'de'));
 const category=categories.includes(viewFocus.category)?viewFocus.category:'Alle Kategorien';
 const selected=scopedBucket.filter(r=>category==='Alle Kategorien'||r.category===category);
 const selectedGroups=bankGroups(selected,'category'),vendors=bankGroups(selected,'merchant');
 const incomeGroups=bankGroups(inside,'category',false),outGroups=bankGroups(out,'bucket'),months=bankMonths(scope),value=performanceForBank(queries,year,period,scope);
 const showRows=(title,rr,text='Alle Beträge stammen aus dem gewählten Bankzeitraum. Ein Ausgang ist nicht automatisch eine Ordinationsausgabe.')=>explain(title,text,rr,bankColumns,detail);
 const detail=r=>r.amount<0?editAssignment(r):explain(`${date(r.date)} · ${r.merchant}`,`${r.details}\n\nZuordnung: ${r.bucket} · ${r.category}. ${r.basis}${r.cooperationBasis?`\nKooperation: ${r.cooperation}. ${r.cooperationBasis}`:''}\nStatus: ${r.classification}.\nOriginal: ${r.sources.map(s=>`${s.file}, Seite ${s.page}`).join(' / ')}${r.cardFees!=null?`\nKartenbrutto: ${euro(r.cardGross)}; bereits einbehaltene Entgelte: ${euro(r.cardFees)}. Nicht noch einmal als Bankausgang addiert.`:''}`,[{label:'Gebuchter Betrag',value:r.amount}],[{field:'label',label:'Buchung'},{field:'value',label:'Betrag',renderCell:v=>money(v)}]);
 const controls=<div className='ordi-filter-controls'><Dropdown label='Bankjahr' showLabel value={String(year)} choices={years.map(String)} onChange={v=>update('year',v)}/><Dropdown label='Bankzeitraum' showLabel value={period} choices={Object.keys(bankPeriodLabels)} choiceLabels={bankPeriodLabels} onChange={v=>update('period',v)}/><Button onClick={()=>editAssignment(null)}>Privat / Ordination zuordnen</Button></div>;
 return <>
  <BankAssignment open={assignmentOpen} selected={assignmentRow} onSelect={setAssignmentRow} onClose={()=>{setAssignmentOpen(false);setAssignmentRow(null);}} rows={all} reviewRows={out.filter(r=>r.review)} snapshot={snapshot}/>
  <Filters sticky queries={queries} filters={[]} values={{}} onChange={()=>{}} trailingControls={controls}/>
  <div className='ordi-scope'><span>Bankbewegungen · {bankPeriodLabels[period]} {year}</span><span><a href='/bericht/' target='_blank' rel='noreferrer'>تحلیل فارسی / Analysebericht</a></span></div>
  {!scope.available?<p className='ordi-notice'>Für diesen Zeitraum fehlen Bankdaten. Fehlende Monate sind keine Nullwerte. Die vorhandenen Bankzeiträume stehen unter „Dateien & Aktualisieren“.</p>:<>
  <p className='ordi-note'>Erfasst: {date(scope.coveredStart)} bis {date(scope.coveredEnd)}{scope.partial?' · Zeitraum unvollständig':''}. Das Konto enthält Ordinations- und Privatbewegungen. Die Differenz unten ist die Kontoveränderung, kein Gewinn.</p>
  <Section id='finance-top' title='Was tatsächlich über das Konto lief' columns={3}>
   {[['finance-in','Geld eingegangen',s.incoming,inside,average.incoming,'in'],['finance-out','Geld abgeflossen',s.outgoing,out,average.outgoing,'out'],['finance-net','Veränderung auf dem Konto',s.net,rows,average.net,undefined]].map(([id,title,value,rr,monthly,direction])=><MetricCard key={id} id={id} queryId='bank_transactions' queryIds={['bank_transactions','bank_coverage']} variant='card' title={title} value={money(value,direction)} displayRows={[{Kennzahl:title,Betrag:value,Monatsdurchschnitt:monthly,VollständigeMonate:average.count,Durchschnittsmonate:average.full.map(m=>m.month).join(', ')}]} sourceRowsByQuery={{bank_transactions:rr,bank_coverage:scope.coverage}} description={(id==='finance-net'?'Alle Eingänge minus alle Ausgänge, einschließlich privater Zahlungen und Kreditraten.':'Tatsächliche Buchungen im oben gewählten Zeitraum.')+' '+averageExplanation}>
    <p className='ordi-monthly-average' data-reviewed-rows><span>Ø pro Monat</span> <strong>{monthly==null?'Noch nicht verfügbar':money(monthly,direction)}</strong><span className='ordi-monthly-count'>{average.count?`aus ${average.count} ${average.count===1?'vollem Monat':'vollen Monaten'}`:'kein voller Monat vorhanden'}</span></p>
    <Button variant='ghost' onClick={()=>showRows(title,rr)}>Buchungen ansehen</Button>
   </MetricCard>)}
  </Section>
  <p className='ordi-note'>Die Monatsdurchschnitte berücksichtigen nur vollständig belegte Monate der gewählten Auswahl.{excluded.length?` ${excluded.join(', ')} ist noch unvollständig und bleibt im Durchschnitt unberücksichtigt.`:''} <Button variant='ghost' onClick={showAverage}>Berechnung und Monatswerte ansehen</Button></p>
  <Section id='finance-flows' title='Eingänge und Ausgänge auseinanderhalten' columns={2}>
   <EvidenceChart id='finance-income-groups' queryId='bank_transactions' variant='card' title='Woher kam das Geld?' rows={incomeGroups.map(g=>({Kategorie:g.label,Betrag:g.amount}))} sourceRows={inside} height={330} spec={{...spec,type:'horizontalBar',x:'Kategorie',y:'Betrag',colors:{Betrag:'var(--positive)'}}} chartOptions={{getMarkActions:({row})=>[{label:'Diese Eingänge ansehen',onSelect:()=>showRows(row.Kategorie,inside.filter(r=>r.category===row.Kategorie))}]}}/>
   <EvidenceChart id='finance-out-groups' queryId='bank_transactions' variant='card' title='Wohin floss das Geld?' rows={outGroups.map(g=>({Bereich:g.label,Betrag:g.amount}))} sourceRows={out} height={330} spec={{...spec,type:'horizontalBar',x:'Bereich',y:'Betrag',colors:{Betrag:'var(--negative)'}}} chartOptions={{getMarkActions:({row})=>[{label:'Diese Ausgänge ansehen',onSelect:()=>showRows(row.Bereich,out.filter(r=>r.bucket===row.Bereich))}]}}><p className='ordi-note'>„Ordination“ ist nach Ihrer Erläuterung oder dem Banktext zugeordnet. Unklare Zahlungen, private Zahlungen, Steuern und Finanzierung sind separat sichtbar.</p></EvidenceChart>
  </Section>
  <Section id='finance-months' title='Wie sich das Geld über die Monate bewegt'>
   <EvidenceChart id='finance-month-chart' queryId='bank_transactions' variant='card' title='Eingänge und Ausgänge pro Monat' rows={months} sourceRows={rows} height={310} spec={{...spec,type:'bar',x:'Monat',y:'Eingänge',fields:['Eingänge','Ausgänge'],colors:{Eingänge:'var(--positive)',Ausgänge:'var(--negative)'},showLegend:true}}/>
  </Section>
  <Section id='finance-services' title='Leistungen und Geld: zwei verschiedene Blickwinkel'>
   <DataComponent id='finance-performance-bridge' queryId='ordination_periods' queryIds={['ordination_periods','bank_transactions']} sourceRowsByQuery={{ordination_periods:performanceEvidence(queries,year,period,scope),bank_transactions:rows}} variant='card' title='Gleicher Zeitraum, unterschiedliche Bedeutung' kind='custom' displayRows={[{Kennzahl:'Leistungswert der Ordination',Betrag:value},{Kennzahl:'Erkennbare betriebliche Eingänge',Betrag:s.recognizedIncome},{Kennzahl:'Herkunft der übrigen Eingänge offen',Betrag:s.unclearIncome}]}>
    <div className='ordi-readouts' data-reviewed-rows><div><span>Leistungswert der Ordination</span><strong>{euro(value)}</strong></div><div><span>Erkennbare betriebliche Eingänge</span><strong>{money(s.recognizedIncome,'in')}</strong></div><div><span>Übrige Eingänge: Herkunft offen</span><strong>{money(s.unclearIncome,'in')}</strong></div></div>
    <p className='ordi-note'>Kassenabrechnungen und Honorare können frühere Behandlungen betreffen; Förderungen sind zusätzlich enthalten. Bareinzahlungen werden als bar bezahlte Patientenhonorare gewertet. Das Bankdatum zeigt deren Einzahlung. Bankeingänge und Leistungswert werden nicht addiert. Ohne Rechnungszuordnung ergibt die Differenz keine offenen Forderungen. {value==null?'Für den genau gleichen Bankzeitraum liegt kein passender Leistungsbericht vor.':''} Kosten je einzelner Leistung oder Leistungsgruppe bleiben ohne Beleg-/Fallverknüpfung offen.</p>
   </DataComponent>
  </Section>
  <Section id='finance-costs' title='Auszahlungen genauer ansehen'>
   <div className='ordi-filter-controls'><Dropdown label='Auszahlungsbereich' showLabel value={bucket} choices={bucketChoices} onChange={v=>{update('bucket',v);}}/><Dropdown label='Kostenkategorie' showLabel value={category} choices={categories} onChange={v=>update('category',v)}/></div>
   <p className='ordi-finding' data-reviewed-rows>{money(-bankSum(selected),'out')} · {number(selected.length)} Auszahlungen · {bucket}{category!=='Alle Kategorien'?` · ${category}`:''}</p>
   <p className='ordi-note'>Diese beiden Filter gelten nur für die folgenden Kostenansichten. Eine einzelne Auszahlung öffnen, um Privat / Ordination und Kategorie zu ändern. Die Kontosummen oben bleiben der gesamte Bankzeitraum.</p>
   {selected.length?<>
   <EvidenceChart id='finance-cost-category' queryId='bank_transactions' variant='card' title='Auszahlungen nach Kategorie' rows={selectedGroups.map(g=>({Kategorie:g.label,Betrag:g.amount}))} sourceRows={selected} height={Math.max(270,selectedGroups.length*35)} spec={{...spec,type:'horizontalBar',x:'Kategorie',y:'Betrag',colors:{Betrag:'var(--negative)'}}} chartOptions={{getMarkActions:({row})=>[{label:'Buchungen dieser Kategorie',onSelect:()=>showRows(row.Kategorie,selected.filter(r=>r.category===row.Kategorie))}]}}/>
   <DataComponent id='finance-vendors' queryId='bank_transactions' variant='card' title='An wen wurde bezahlt?' kind='table' displayRows={vendors.map(g=>({Empfänger:g.label,Betrag:g.amount,Buchungen:g.count}))} sourceRows={selected}><DataTable label='Zahlungsempfänger' rows={vendors.map(g=>({Empfänger:g.label,Betrag:g.amount,Buchungen:g.count}))} columns={[{field:'Empfänger',label:'Empfänger / Händler'},{field:'Betrag',label:'Bezahlt',renderCell:v=>money(v,'out')},{field:'Buchungen',label:'Buchungen'}]} onRowSelect={r=>showRows(r.Empfänger,selected.filter(x=>x.merchant===r.Empfänger))} rowActionLabel={r=>`Zahlungen an ${r.Empfänger}`}/></DataComponent>
   <DataComponent id='finance-transactions' queryId='bank_transactions' variant='card' title='Einzelne Auszahlungen und Originalbeschreibung' kind='table' displayRows={selected} sourceRows={selected}><DataTable label='Auszahlungen' rows={selected} columns={bankColumns} rowKey='id' onRowSelect={detail} rowActionLabel={r=>`Details vom ${date(r.date)}`}/></DataComponent>
   </>:<p className='ordi-empty'>Für diese Auswahl sind keine Auszahlungen vorhanden.</p>}
  </Section>
  <Section id='finance-open' title='Was die Auswertung noch offenlässt'>
   <DataComponent id='finance-open-values' queryId='bank_transactions' variant='card' title='Zweck und Unterlagen ergänzen' kind='custom' displayRows={[{Kennzahl:'Nicht zugeordnete Ausgänge',Betrag:s.unassigned},{Kennzahl:'Steuerart offen',Betrag:s.tax},{Kennzahl:'Finanzierung, Zweck teilweise offen',Betrag:s.financing},{Kennzahl:'Einbehaltene Kartenentgelte',Betrag:s.cardFees}]} sourceRows={rows}>
    <p className='ordi-body'>Noch nicht zugeordnete Ausgänge: <strong>{money(s.unassigned,'out')}</strong>. Steuerzahlungen mit offenem Zweck: <strong>{money(s.tax,'out')}</strong>. Verträge und Rechnungen entscheiden darüber, welcher Anteil privat, betrieblich, Tilgung oder Anlagegut ist.</p>
    <Button onClick={()=>editAssignment(null)}>Offene Zuordnungen bearbeiten</Button>
    <p className='ordi-note'>HOBEX hat zusätzlich {money(s.cardFees,'out')} Kartenentgelte bereits vor der Gutschrift einbehalten. Diese sind im Nettoeingang enthalten und werden nicht nochmals als Bankausgang addiert. Eine Einlagen-/Privatentnahme- oder Gewinnrechnung lässt sich daraus allein noch nicht abschließen.</p>
   </DataComponent>
  </Section>
  </>}
 </>;
}
