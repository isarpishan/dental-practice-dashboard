const administrative=new Set(['Dokumentation','Preisnachlässe','Versäumte Termine']);
export function patientTracking(records,baseline,year){
 const own=records.filter(r=>!r.pflegeheimExcluded),people=new Map();
 for(const r of own){
  let person=people.get(r.patientRef);
  if(!person){person={patientRef:r.patientRef,records:[],actual:[],years:new Set()};people.set(r.patientRef,person);}
  person.records.push(r);
  if(r.status==='Erfasst (nicht rot)'){person.actual.push(r);person.years.add(r.year);}
 }
 const rows=[];let recorded=0,plannedOnly=0;
 for(const person of people.values()){
  if(!person.actual.length){plannedOnly++;continue;}
  recorded++;
  const before=person.years.has(baseline),after=person.years.has(year);
  if(!before&&!after)continue;
  const sorted=person.actual.filter(r=>r.year<=year).sort((a,b)=>(b.date??'').localeCompare(a.date??'')||b.page-a.page);
  const last=sorted[0],baseRows=person.actual.filter(r=>r.year===baseline);
  rows.push({patientRef:person.patientRef,reference:`Patient ${person.patientRef.toUpperCase()}`,baseline:before,current:after,group:before?(after?'both':'missing'):'current-only',lastDate:last.date,file:last.file,page:last.page,sha256:last.sha256,adminOnlyBaseline:before&&baseRows.every(r=>administrative.has(r.group))});
 }
 rows.sort((a,b)=>(b.lastDate??'').localeCompare(a.lastDate??'')||a.patientRef.localeCompare(b.patientRef));
 const counts={all:rows.length,missing:0,both:0,'current-only':0};
 for(const row of rows)counts[row.group]++;
 return {rows,counts,people,own,recorded,plannedOnly,baselineCount:counts.missing+counts.both,currentCount:counts.both+counts['current-only']};
}
export const originalPdf=(r)=>`/api/ordi/source-pdf/${r.sha256}#page=${r.page}`;
