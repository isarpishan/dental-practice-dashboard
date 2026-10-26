import React from 'react';
import {MetricCard,Section,Button} from '../../data-app-public.jsx';
import {rate,periodLabels} from './ordi-model.js';
const euro=v=>v==null?'Nicht verfügbar':new Intl.NumberFormat('de-AT',{style:'currency',currency:'EUR'}).format(v);
const number=v=>v==null?'Nicht verfügbar':new Intl.NumberFormat('de-AT').format(v);
export function CurrentQuarter({row,explain}){
 if(!row)return <p className='ordi-notice'>Noch keine vollständige Quartalsauswertung vorhanden.</p>;
 const label=`${periodLabels[`q${row.quarter}`]} ${row.year}`;
 const people=row.patients;
 const metrics=[
  {id:'overview-current-value',title:'Wert unserer Leistungen',value:row.amount,format:euro,text:'Wert der erfassten Leistungen im letzten vollständigen Quartal. Das ist kein Gewinn und kein Nachweis von Zahlungseingängen.'},
  {id:'overview-current-people',title:'Behandelte Personen',value:people,format:number,text:'Personen der Ordination aus der Quartalsauswertung. Für Betrag und Personen gilt dieselbe bereinigte Abgrenzung. Eine Person kann in mehreren Quartalen vorkommen.'},
  {id:'overview-current-perperson',title:'Leistungswert je Person',value:rate(row.amount,people),format:euro,text:'Leistungswert des Quartals geteilt durch die Anzahl der behandelten Personen. Beide Werte stammen aus demselben Quartal und derselben Abgrenzung.'}
 ];
 return <section className='ordi-current-quarter' aria-label='Aktuelles Quartal'>
  <Section id='overview-current-heading' title={`Aktuell: ${label}`} columns={3} spacing='none'>
   {metrics.map(m=><MetricCard key={m.id} id={m.id} queryId='ordination_periods' variant='card' title={m.title} value={m.format(m.value)} displayRows={[{Zeitraum:label,Kennzahl:m.title,Wert:m.value}]} sourceRows={[row]} description={`${m.text} Die Vergleichsauswahl darunter verändert diese aktuelle Ansicht nicht.`}>
    <Button variant='ghost' onClick={()=>explain(m.title,`${label}. ${m.text}`,[{label,value:m.value}],[{field:'label',label:'Quartal'},{field:'value',label:m.title,renderCell:m.format}])}>Einfach erklärt</Button>
   </MetricCard>)}
  </Section>
  <p className='ordi-note'>Letztes vollständig erfasstes Quartal. Diese Werte aktualisieren sich mit neuen vollständigen Quartalsberichten; die Vergleichsauswahl darunter gilt nur für die folgenden Vergleiche.</p>
 </section>;
}
