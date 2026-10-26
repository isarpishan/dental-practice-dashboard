import React from 'react';
import {DataComponent,DataTable} from '../../data-app-public.jsx';
export function PflegeheimAdjustment({queries,year}){
 const rows=(queries.ordination_periods?.rows??[]).filter(r=>r.year===year).sort((a,b)=>(a.quarter??0)-(b.quarter??0));
 const annual=rows.find(r=>r.quarter===null);if(!annual?.pflegeheimPatients)return null;
 const numbers=new Intl.NumberFormat('de-AT'),euro=new Intl.NumberFormat('de-AT',{style:'currency',currency:'EUR'});
 return <DataComponent id='pflegeheim-adjustment' queryId='ordination_periods' variant='plain' title={`Pflegeheim ${year} getrennt zählen`} kind='table' sourceRows={rows} displayRows={rows}>
  <p className='ordi-note' data-reviewed-rows><strong>{year}: {numbers.format(annual.reportedPatients)} insgesamt − {numbers.format(annual.pflegeheimPatients)} Pflegeheim = {numbers.format(annual.patients)} Personen der Ordination.</strong> Die Jahreskarten unten zeigen auch den Leistungswert ohne Pflegeheim. Die Quartalsansicht zeigt ebenfalls beide Kennzahlen ohne Pflegeheim; die übrigen Dashboard-Vergleiche verwenden weiterhin die jeweils beschriftete Abgrenzung.</p>
  <details className='ordi-disclosure'><summary>Originalzahl und Abzug je Zeitraum ansehen</summary>
   <DataTable label={`Pflegeheim-Abzug ${year}`} rows={rows} searchable={false} columns={[{field:'quarter',label:String(year),renderCell:q=>q===null?'Ganzes Jahr':`Q${q}`},{field:'reportedPatients',label:'Original'},{field:'pflegeheimPatients',label:'Pflegeheim'},{field:'patients',label:'Ordination'}]}/>
   <p className='ordi-note' data-reviewed-rows>{numbers.format(annual.pflegeheimPatients)} eindeutige Patientenblöcke; die nicht roten Detailzeilen sind mit {euro.format(annual.pflegeheimAmount)} vollständig gegen die Pflegeheim-Statistik abgestimmt. Quartale zählen Personen mit allen datierten erfassten Leistungen dieser Kohorte, nicht nur Vi; die Jahreszahl ist keine Summe der Quartale. Für andere Jahre liegt keine bestätigte Ausschlussliste vor. Die Altersverteilung wird mit der vollständigen PH-Statistik bereinigt. BIZ-Neupatienten und Sitzungen bleiben {year} mangels passendem Export offen.</p>
  </details>
 </DataComponent>;
}
