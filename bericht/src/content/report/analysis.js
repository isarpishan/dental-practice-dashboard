export const sum=(rows,key)=>rows.reduce((a,r)=>a+(Number.isFinite(r[key])?r[key]:0),0);
export const ratio=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&b>0?a/b:null;
export const growth=(a,b)=>ratio(a-b,b);
// Year of a confirmed care-home cooperation that is excluded from practice comparisons (null if none).
export const careHomeYear=queries=>(queries?.pflegeheim_exclusion?.rows??[]).find(r=>r.quarter==null)?.year??null;
export function analysis(queries){
 const p=queries.ordination_periods?.rows??queries.patient_periods.rows,c=(queries.ordination_service_codes??queries.service_codes).rows,bz=(queries.ordination_biz_patients??queries.biz_patients).rows;
 const annual=p.filter(r=>r.quarter===null).sort((a,b)=>a.year-b.year),full=annual.filter(r=>r.complete);
 const current=full.at(-1),previous=full.at(-2),latest=annual.at(-1);
 const byYear=(year)=>bz.find(r=>r.year===year&&r.quarter==null);
 const bc=byYear(current?.year),bp=byYear(previous?.year);
 const quarters=latest&&current&&latest.year!==current.year?[1,2,3,4].map(q=>({q,a:p.find(r=>r.year===latest.year&&r.quarter===q),b:p.find(r=>r.year===current.year&&r.quarter===q)})).filter(r=>r.a?.complete&&r.b?.complete):[];
 const quarterChanges=quarters.map(({q,a,b})=>({Quartal:`Q${q}`,Jahr:latest.year,Vergleichsjahr:current.year,Leistungswert:a.amount,Vorjahr:b.amount,Veränderung:a.amount-b.amount,Personen:a.patients,PersonenVorjahr:b.patients,Personenänderung:a.patients-b.patients,WertänderungProzent:100*growth(a.amount,b.amount),PersonenänderungProzent:100*growth(a.patients,b.patients)}));
 const serviceCurrent=c.filter(r=>r.year===current?.year),servicePrevious=c.filter(r=>r.year===previous?.year);
 const groupNames=[...new Set([...serviceCurrent,...servicePrevious].map(r=>r.group))];
 const groups=groupNames.map(group=>({Bereich:group,Aktuell:sum(serviceCurrent.filter(r=>r.group===group),'amount'),Vorjahr:sum(servicePrevious.filter(r=>r.group===group),'amount')})).map(r=>({...r,Veränderung:r.Aktuell-r.Vorjahr})).sort((a,b)=>b.Veränderung-a.Veränderung);
 const selectedCodes=['IMPKr','Imp','Total','MG','ECK','Vi','RAB'];
 const codes=selectedCodes.map(code=>{const a=serviceCurrent.find(r=>r.baseCode===code),b=servicePrevious.find(r=>r.baseCode===code);return{Kürzel:code,Leistung:a?.description??b?.description??code,Aktuell:a?.amount??0,Vorjahr:b?.amount??0,Positionen:a?a.count:0,PositionenVorjahr:b?b.count:0,Veränderung:(a?.amount??0)-(b?.amount??0)};});
 const emerging=['Digitale Restaurationen','Parodontologie & Laser'].map(group=>({Bereich:group,Bisher:sum(c.filter(r=>r.year===latest?.year&&r.group===group),'amount'),GanzesVorjahr:sum(c.filter(r=>r.year===current?.year&&r.group===group),'amount')}));
 const qCurrent=sum(quarterChanges,'Leistungswert'),qPrevious=sum(quarterChanges,'Vorjahr');
 return {p,c,bz,annual,current,previous,latest,bc,bp,quarterChanges,quarters,groups,codes,emerging,qCurrent,qPrevious};
}
