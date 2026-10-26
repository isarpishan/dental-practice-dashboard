export const bankSum=(rows,field='amount')=>rows.reduce((s,r)=>s+Math.round((r[field]??0)*100),0)/100;
export const bankPeriodLabels={annual:'Jahresstand',jansep:'Jänner–September',q1:'1. Quartal',q2:'2. Quartal',q3:'3. Quartal',q4:'4. Quartal',...Object.fromEntries(Array.from({length:12},(_,i)=>[`m${String(i+1).padStart(2,'0')}`,new Intl.DateTimeFormat('de-AT',{month:'long',timeZone:'UTC'}).format(new Date(Date.UTC(2026,i,1)))]))};
export function bankRange(year,period='annual'){
 const q=/^q([1-4])$/.exec(period),m=/^m(\d{2})$/.exec(period);
 const first=q?(Number(q[1])-1)*3+1:m?Number(m[1]):1,last=q?first+2:m?first:period==='jansep'?9:12;
 const endDay=new Date(Date.UTC(year,last,0)).getUTCDate();
 return {start:`${year}-${String(first).padStart(2,'0')}-01`,end:`${year}-${String(last).padStart(2,'0')}-${endDay}`,first,last};
}
export function bankScope(queries,year,period='annual'){
 const range=bankRange(year,period),coverage=queries.bank_coverage?.rows??[],all=queries.bank_transactions?.rows??[];
 const relevant=coverage.filter(c=>c.start<=range.end&&c.end>=range.start);
 const start=relevant.length?relevant.map(c=>c.start>range.start?c.start:range.start).sort()[0]:null;
 const end=relevant.length?relevant.map(c=>c.end<range.end?c.end:range.end).sort().at(-1):null;
 const rows=all.filter(r=>r.date>=range.start&&r.date<=range.end);
 const partial=!!start&&(start>range.start||end<range.end);
 return {...range,coverage:relevant,coveredStart:start,coveredEnd:end,partial,available:!!start,rows};
}
export function bankStats(rows){
 const out=rows.filter(r=>r.amount<0),inside=rows.filter(r=>r.amount>0);
 const byBucket=b=>-bankSum(out.filter(r=>r.bucket===b));
 return {incoming:bankSum(inside),outgoing:-bankSum(out),net:bankSum(rows),practice:byBucket('Ordination'),private:byBucket('Privat'),financing:byBucket('Finanzierung'),investment:byBucket('Vermögensanlage'),tax:byBucket('Steuern / SV offen'),fees:byBucket('Bankkosten'),unassigned:byBucket('Zu prüfen'),recognizedIncome:bankSum(inside.filter(r=>r.bucket==='Betrieblicher Eingang')),unclearIncome:bankSum(inside.filter(r=>r.bucket!=='Betrieblicher Eingang')),cardFees:bankSum(inside,'cardFees'),count:rows.filter(r=>r.amount!==0).length};
}
export function bankGroups(rows,field,negative=true){
 const map=new Map();for(const r of rows){if(negative?r.amount>=0:r.amount<=0)continue;const key=r[field]??'Unbekannt';if(!map.has(key))map.set(key,[]);map.get(key).push(r);}
 return [...map].map(([label,rr])=>({label,amount:(negative?-1:1)*bankSum(rr),count:rr.length,rows:rr})).sort((a,b)=>b.amount-a.amount);
}
export function bankMonths(scope){
 if(!scope.available)return[];
 const rows=[];for(let m=scope.first;m<=scope.last;m++){
  const key=`${scope.start.slice(0,4)}-${String(m).padStart(2,'0')}`;
  if(key<scope.coveredStart.slice(0,7)||key>scope.coveredEnd.slice(0,7))continue;
  const rr=scope.rows.filter(r=>r.month===key),s=bankStats(rr);
  const partial=(key===scope.coveredStart.slice(0,7)&&!scope.coveredStart.endsWith('-01'))||(key===scope.coveredEnd.slice(0,7)&&scope.coveredEnd<bankRange(Number(key.slice(0,4)),`m${key.slice(5)}`).end);
  rows.push({Monat:['Jän','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'][m-1]+(partial?' (bisher)':''),month:key,Eingänge:s.incoming,Ausgänge:s.outgoing,Netto:s.net});
 }return rows;
}
// Only fully documented calendar months contribute; missing days are never zero-filled.
export function bankMonthlyAverage(scope){
 const months=[];
 for(let m=scope.first;m<=scope.last;m++){
  const range=bankRange(Number(scope.start.slice(0,4)),`m${String(m).padStart(2,'0')}`);
  const covered=scope.coverage.some(c=>c.start<=range.end&&c.end>=range.start);
  const days=Number(range.end.slice(-2));
  const complete=Array.from({length:days},(_,i)=>`${range.start.slice(0,8)}${String(i+1).padStart(2,'0')}`).every(day=>scope.coverage.some(c=>c.start<=day&&c.end>=day));
  const rows=complete?scope.rows.filter(r=>r.date>=range.start&&r.date<=range.end):[];
  months.push({month:range.start.slice(0,7),label:new Intl.DateTimeFormat('de-AT',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(range.start+'T12:00:00Z')),complete,covered,start:range.start,end:range.end,rows,...bankStats(rows)});
 }
 const full=months.filter(m=>m.complete),rows=full.flatMap(m=>m.rows),totals=bankStats(rows),count=full.length;
 return {months,full,rows,count,totals,incoming:count?totals.incoming/count:null,outgoing:count?totals.outgoing/count:null,net:count?totals.net/count:null};
}
export function performanceForBank(queries,year,period,scope){
 if(!scope.available||scope.coveredStart>scope.start)return null;
 const p=(queries.ordination_periods??queries.patient_periods).rows;
 if(period==='annual'){const a=p.find(r=>r.year===year&&r.quarter===null);return a&&a.coverageEnd===scope.coveredEnd?a.amount:null;}
 if(period==='jansep'){const rr=p.filter(r=>r.year===year&&[1,2,3].includes(r.quarter)&&r.complete);return rr.length===3&&scope.coveredEnd>=scope.end?bankSum(rr):null;}
 const q=/^q([1-4])$/.exec(period);if(!q)return null;
 const a=p.find(r=>r.year===year&&r.quarter===Number(q[1]));return a&&a.coverageEnd===scope.coveredEnd?a.amount:null;
}
export function performanceEvidence(queries,year,period,scope){
 if(performanceForBank(queries,year,period,scope)==null)return[];
 return (queries.ordination_periods??queries.patient_periods).rows.filter(r=>r.year===year&&(period==='annual'?r.quarter===null:period==='jansep'?[1,2,3].includes(r.quarter):r.quarter===Number(period.slice(1))));
}
