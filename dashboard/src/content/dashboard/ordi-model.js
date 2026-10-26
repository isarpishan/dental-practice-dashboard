export const n = value => value == null || !Number.isFinite(Number(value)) ? null : Number(value);
export const sum = (rows,key) => rows.length && rows.every(r=>n(r[key])!==null) ? rows.reduce((a,r)=>a+Number(r[key]),0) : null;
export const rate = (value,base) => n(value)!==null && n(base)>0 ? value/base : null;
export const change = (value,base) => n(value)!==null && n(base)>0 ? (value-base)/base : null;
export const total = (rows,key) => rows.reduce((a,r)=>a+(n(r[key])??0),0);
export const periodLabels = {q1:'1. Quartal',q2:'2. Quartal',q3:'3. Quartal',q4:'4. Quartal',jansep:'Jänner–September',annual:'Ganzes Jahr'};
export function selectPeriod(rows,year,period){
 year=Number(year);
 if(period==='jansep'){
  const selected=rows.filter(r=>r.year===year&&[1,2,3].includes(r.quarter));
  if(selected.length!==3)return null;
  return {year,quarter:null,period,amount:sum(selected,'amount'),serviceRows:sum(selected,'serviceRows'),patients:null,complete:selected.every(r=>r.complete),file:selected.map(r=>r.file).join(' · '),sourceRows:selected,coverageEnd:selected.at(-1)?.coverageEnd};
 }
 const selected=rows.find(r=>r.year===year&&(period==='annual'?r.quarter===null:r.quarter===Number(period.slice(1))));
 return selected?{...selected,sourceRows:[selected]}:null;
}
export function selectBiz(rows,year,period){
 year=Number(year);
 if(period==='jansep'){
  const selected=rows.filter(r=>r.year===year&&[1,2,3].includes(r.quarter));
  return selected.length===3?{year,patients:null,newPatients:sum(selected,'newPatients'),sessions:sum(selected,'sessions'),sourceRows:selected}:null;
 }
 const r=rows.find(r=>r.year===year&&(period==='annual'?r.quarter==null:r.quarter===Number(period.slice(1))));
 return r?{...r,sourceRows:[r]}:null;
}
export const comparable = (a,b) => Boolean(a&&b&&a.complete&&b.complete&&a.year!==b.year);
export function serviceRows(rows,year,baseline,group='all'){
 const a=rows.filter(r=>r.year===Number(year)), b=rows.filter(r=>r.year===Number(baseline));
 const codes=[...new Set([...a,...b].map(r=>r.baseCode))];
 return codes.map(code=>{
  const current=a.filter(r=>r.baseCode===code),previous=b.filter(r=>r.baseCode===code),ref=current[0]??previous[0];
  return {code,description:ref.description,group:ref.group,amount:total(current,'amount'),previous:total(previous,'amount'),patientAmount:sum(current,'patientAmount'),insuranceAmount:sum(current,'insuranceAmount'),count:sum(current,'count'),previousCount:sum(previous,'count'),delta:total(current,'amount')-total(previous,'amount'),currentPrice:ref.currentPrice};
 }).filter(r=>group==='all'||r.group===group).sort((a,b)=>b.amount-a.amount);
}
export function serviceGroups(rows){
 const groups=[...new Set(rows.map(r=>r.group))];
 return groups.map(group=>({group,amount:total(rows.filter(r=>r.group===group),'amount'),previous:total(rows.filter(r=>r.group===group),'previous'),delta:total(rows.filter(r=>r.group===group),'delta'),count:sum(rows.filter(r=>r.group===group),'count')}));
}
// Year of a confirmed care-home cooperation that is excluded from practice comparisons (null if none).
export const careHomeYear = queries => (queries?.pflegeheim_exclusion?.rows??[]).find(r=>r.quarter==null)?.year ?? null;
export const nonTreatment = new Set(['Dokumentation','Preisnachlässe','Versäumte Termine']);
