import React,{useState} from 'react';
import {Button,useDataApp} from '../../data-app-public.jsx';

export function PdfExportButton(){
 const shell=useDataApp();const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[failed,setFailed]=useState(false);
 async function download(){
  setBusy(true);setMessage('در حال آماده‌کردن گزارش…');setFailed(false);
  try{
   const response=await fetch('/api/ordi/report-pdf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({snapshotVersion:shell.snapshot.generatedAt,title:shell.appTitle,narrativeEdits:shell.narrativeEdits,hiddenBlockIds:[...shell.hiddenBlockIds],chartOverrides:shell.chartOverrides,chartStates:shell.chartStates})});
   if(!response.ok){const error=await response.json();throw new Error(error.error||'ساخت PDF انجام نشد. دوباره تلاش کنید.');}
   const file=await response.blob();if(file.type!=='application/pdf')throw new Error('فایل PDF دریافت نشد. دوباره تلاش کنید.');
   const url=URL.createObjectURL(file),link=document.createElement('a');link.href=url;link.download='Ordi-Analyse-FA.pdf';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
   setMessage('PDF آماده شد؛ فایل دانلود شده را باز کنید.');
  }catch(error){setMessage(error.message||'ارتباط با گزارش برقرار نشد. صفحه را تازه کنید و دوباره تلاش کنید.');setFailed(true);}
  finally{setBusy(false);}
 }
 const editing=shell.mode==='edit',updating=shell.snapshot.buildStatus!=='complete';
 return <div className='ordi-pdf-export'>
  <Button variant='primary' onClick={download} disabled={busy||editing||updating}>{busy?'در حال ساخت PDF…':'دانلود PDF تحلیل'}</Button>
  <span className='ordi-pdf-caption'>متن فارسی، نمودارها و همهٔ ردیف‌های جدول‌ها</span>
  {(message||editing||updating)&&<p role={failed?'alert':'status'}>{message||(editing?'برای دانلود، ابتدا حالت نمایش گزارش را انتخاب کنید.':'گزارش در حال به‌روزرسانی است.')}</p>}
 </div>;
}
