import React from 'react';
import {DataComponent,DataTable,MetricCard,Section} from '../../data-app-public.jsx';
const euro=v=>v==null?'Noch nicht zugeordnet':new Intl.NumberFormat('de-AT',{style:'currency',currency:'EUR'}).format(v);
const day=s=>new Intl.DateTimeFormat('de-AT').format(new Date(s+'T12:00:00'));
export function PflegeheimValueSplit({queries,year,careYear}){
 const rows=(queries.pflegeheim_finance?.rows??[]).filter(r=>r.kind==='Leistungsjahr'&&r.year===year),a=rows[0];
 if(year!==careYear||!a)return null;
 const counts=(queries.ordination_periods?.rows??[]).find(r=>r.year===year&&r.quarter===null);
 const display=[{Bereich:'Gesamt einschließlich Pflegeheim',Betrag:a.totalServiceValue,Personen:counts?.reportedPatients??null},{Bereich:'Davon Pflegeheim',Betrag:a.serviceValue,Personen:a.patients},{Bereich:'Ordination ohne Pflegeheim',Betrag:a.otherPracticeServiceValue,Personen:counts?.patients??null}];
 return <DataComponent id='year-pflegeheim-value-split' queryId='pflegeheim_finance' queryIds={['pflegeheim_finance','ordination_periods']} sourceRowsByQuery={{pflegeheim_finance:rows,ordination_periods:counts?[counts]:[]}} variant='card' title={`${year}: Leistungswert und Personen mit gleicher Abgrenzung`} kind='table' displayRows={display}>
  <DataTable label='Leistungswert getrennt' rows={display} searchable={false} columns={[{field:'Bereich',label:'Bereich'},{field:'Betrag',label:'Leistungswert',renderCell:euro},{field:'Personen',label:'Personen',renderCell:v=>v==null?'Nicht verfügbar':new Intl.NumberFormat('de-AT').format(v)}]}/>
  <p className='ordi-note'>Pflegeheim ist im Gesamtbetrag enthalten. Gesamt minus Pflegeheim ergibt die übrige Ordination. Die beiden PDF-Auswertungen werden getrennt eingelesen; keine Addition und kein Ersatz des Jahresgesamtwerts.</p>
 </DataComponent>;
}
export function PflegeheimFinance({queries,year,careYear,onPaymentSelect}){
 const summaries=queries.pflegeheim_finance?.rows??[],annual=summaries.filter(r=>r.kind==='Leistungsjahr'&&r.year===year);
 if(year!==careYear||!annual.length)return null;
 const payments=(queries.bank_transactions?.rows??[]).filter(r=>r.cooperation==='Pflegeheim'&&r.amount<0);
 const years=summaries.filter(r=>r.kind==='Zahlungsjahr');
 return <section aria-label='Pflegeheim Kooperation'>
 {annual.map(a=><React.Fragment key={a.year}>
  <Section id='pflegeheim-finance-heading' title={`Pflegeheim ${a.year}: Leistungen und Kosten ${a.partnerLabel??'Partner'}`} columns={3}>
   <MetricCard id='ph-service-value' queryId='pflegeheim_finance' variant='card' title='Erfasste Pflegeheim-Leistungen' value={euro(a.serviceValue)} displayRows={[a]} sourceRows={[a]} description={`${a.patients} Personen · ${a.serviceRows} Leistungspositionen. Teil des Jahresgesamtwerts, kein zusätzlicher Umsatz.`}/>
   <MetricCard id='ph-partner-cost' queryId='pflegeheim_finance' variant='card' title={`${a.partnerLabel??'Partner'} für Arbeiten ${a.year}`} value={euro(a.partnerPaid)} displayRows={[a]} sourceRows={[a]} description={`${a.payments} erfasste Zahlungen. Leistungsjahr laut Ihrer Bestätigung; das Zahlungsdatum kann später liegen.`}/>
   <MetricCard id='ph-remaining' queryId='pflegeheim_finance' variant='card' title='Nach Partner-Kosten, vor weiteren Kosten' value={euro(a.difference)} displayRows={[a]} sourceRows={[a]} description='Leistungswert minus zugeordnete Partner-Zahlungen. Weitere Material-, Personal-, Fahrt- und Gemeinkosten fehlen; kein endgültiger Gewinn.'/>
  </Section>
  <p className='ordi-note'>Diese Projektansicht umfasst das Leistungsjahr {a.year}. Die tatsächlichen Zahlungsdaten bleiben erhalten. Pflegeheim-Eingänge sind aus den Sammelzahlungen der Kasse noch nicht einzeln zugeordnet. Die Vi-Liste ist nur ein Teil der Leistungen; maßgeblich ist die vollständige PH-Auswertung.</p>
 </React.Fragment>)}
 <details className='ordi-disclosure'><summary>Partner-Zahlungen und Zahlungsjahre ansehen</summary>
  <DataComponent id='ph-payment-years' queryId='pflegeheim_finance' variant='plain' title='Wann wurde der Partner bezahlt?' kind='table' displayRows={years} sourceRows={years}><DataTable label='Pflegeheim-Zahlungsjahre' rows={years} searchable={false} columns={[{field:'year',label:'Zahlungsjahr'},{field:'amount',label:'Ausbezahlt',renderCell:euro},{field:'payments',label:'Zahlungen'},{field:'unassignedServiceYear',label:'Leistungsjahr noch offen',renderCell:euro}]}/></DataComponent>
  <DataComponent id='ph-payment-details' queryId='bank_transactions' variant='plain' title='Bestätigte Pflegeheim-Auszahlungen' kind='table' displayRows={payments} sourceRows={payments}><DataTable label='Partner-Auszahlungen' rows={payments} rowKey='id' searchable={false} columns={[{field:'date',label:'Bankdatum',renderCell:day},{field:'merchant',label:'Empfänger'},{field:'amount',label:'Bankbetrag',renderCell:euro},{field:'costServiceYear',label:'Arbeit für Jahr',renderCell:v=>v??'Noch offen'}]} onRowSelect={onPaymentSelect} rowActionLabel={r=>`Beleg vom ${day(r.date)}`}/></DataComponent>
  <p className='ordi-note'>Alle Zahlungen bleiben auch unter ihrer Ordinationskategorie enthalten; sie werden nicht doppelt addiert. Fehlende Bankmonate sind keine Nullwerte. Neue Partner-Buchungen erhalten erst nach Bestätigung ein Leistungsjahr.</p>
 </details>
 </section>;
}
