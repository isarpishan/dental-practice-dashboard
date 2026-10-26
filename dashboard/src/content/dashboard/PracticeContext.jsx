import React from 'react';
import {DataComponent} from '../../data-app-public.jsx';
// Shows vacation weeks entered in dashboard-tools/practice-context.json for the selected years.
export function PracticeContext({queries,year,baseline,tab}){
 const shown=tab==='years'?[year]:[year,baseline];
 const rows=(queries.practice_context?.rows??[]).filter(r=>shown.includes(r.year)&&r.vacationWeeks>0).sort((a,b)=>a.year-b.year||a.month-b.month);
 if(!rows.length)return null;
 const month=new Intl.DateTimeFormat('de-AT',{month:'long',year:'numeric'});
 const quarters=[...new Set(rows.map(r=>`Q${r.quarter} ${r.year}`))].join(', ');
 return <DataComponent id='practice-vacation-context' queryId='practice_context' title={`Urlaub: ${quarters}`} variant='plain' kind='custom' displayRows={rows} sourceRows={rows}>
  <p className='ordi-note' data-reviewed-rows>{rows.map(r=>`${month.format(new Date(r.year,r.month-1,1))}: ${r.vacationWeeks} ${r.vacationWeeks===1?'Woche':'Wochen'} Urlaub`).join(' · ')}. Insgesamt {rows.reduce((s,r)=>s+r.vacationWeeks,0)} eingetragene Urlaubswochen. Die Kennzahlen bleiben Kalenderquartale; es wurde keine Bereinigung pro Arbeitstag vorgenommen.</p>
  <details className='ordi-disclosure'><summary>Was bedeutet das für den Vergleich?</summary><p className='ordi-note'>Die Urlaubsangabe stammt vom Nutzer. Für einen Vergleich pro Öffnungstag fehlen genaue Urlaubsdaten, Arbeitszeiten, mögliche Vertretung und die entsprechenden Angaben des Vergleichsjahrs. Urlaub erklärt nur Veränderungen im selben Quartal.</p></details>
 </DataComponent>;
}
