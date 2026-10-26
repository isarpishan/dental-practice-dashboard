import React from 'react';
import {DataComponent,DataTable,EvidenceChart,ReportSection,RichNarrative,useDataApp} from '../../data-app-public.jsx';
import {analysis,sum,ratio,growth,careHomeYear} from './analysis.js';
import {bankScope,bankStats,bankGroups} from '../shared/bank-model.js';
import {PdfExportButton} from './PdfExportButton.jsx';
import {PlanningSection} from './PlanningSection.jsx';
import './report.css';
import './ordi-report.css';
const n=v=>v==null?'نامشخص':new Intl.NumberFormat('fa-IR',{maximumFractionDigits:0}).format(v);
const yr=v=>new Intl.NumberFormat('fa-IR',{useGrouping:false,maximumFractionDigits:0}).format(v);
const money=v=>v==null?'دادهٔ کافی نداریم':`${n(v)} یورو`;
const pct=v=>v==null?'نامشخص':new Intl.NumberFormat('fa-IR',{style:'percent',maximumFractionDigits:1}).format(Math.abs(v));
const move=v=>v==null?'نامشخص':`${pct(v)} ${v>=0?'افزایش':'کاهش'}`;
const day=s=>s?new Intl.DateTimeFormat('fa-IR-u-ca-gregory',{year:'numeric',month:'long',day:'numeric'}).format(new Date(s+'T12:00:00')):'نامشخص';
const spec={showXAxisLabel:false,showYAxisLabel:false,startAtZero:true,stackable:false,valueDecimals:0};
const groupFa={'Zahnersatz & Reparaturen':'پروتز و تعمیرات','Weitere Leistungen':'سایر خدمات','Parodontologie & Laser':'پریودنتولوژی و لیزر','Mundhygiene & Zahnstein':'بهداشت دهان و جرم‌گیری','Röntgen':'رادیوگرافی','Chirurgie & Nachbehandlung':'جراحی و مراقبت پس از آن','Preisnachlässe':'تخفیف‌ها','Digitale Restaurationen':'ترمیم‌های دیجیتال','Dokumentation':'مستندسازی','Versäumte Termine':'نوبت‌های ازدست‌رفته','Wurzelbehandlungen':'درمان ریشه','Füllungen & Aufbauten':'ترمیم و بازسازی','Implantate & Implantatkronen':'ایمپلنت و تاج ایمپلنت'};
const bucketFa={'Ordination':'پرداخت‌های شناسایی‌شدهٔ مطب','Privat':'پرداخت‌های شخصی','Finanzierung':'اقساط و تأمین مالی','Zu prüfen':'کاربرد نیازمند بررسی','Steuern / SV offen':'مالیات با نوعِ باز','Bankkosten':'کارمزد و بهرهٔ بانکی','Vermögensanlage':'سرمایه‌گذاری و هزینهٔ آن'};
const catFa={'Chirurgische Fremdleistungen':'خدمات جراح همکار','Kassenabrechnung / Leistungskontrolle':'کنترل و تکمیل ثبت خدمات بیمه','Coaching / Praxisentwicklung':'کوچینگ و توسعهٔ مطب','Techniker / Labor':'تکنسین و لابراتوار','Dentalbedarf / Medizin / Technik':'تجهیزات و ملزومات دندان‌پزشکی','Löhne / Gehälter':'حقوق پرداختی','Personalabgaben':'پرداخت‌های مرتبط با پرسنل','Ordinationsmiete':'اجارهٔ مطب','Steuerberatung / Buchhaltung':'حسابداری و مشاورهٔ مالیاتی','Werbung / Verzeichnisse':'تبلیغات و فهرست‌های تجاری','Praxissoftware / IT':'نرم‌افزار و فناوری مطب','Fortbildung / Berufsbeiträge':'آموزش و حق عضویت حرفه‌ای','Berufsversicherung':'بیمهٔ حرفه‌ای'};
export function ReportContent(){
 const shell=useDataApp();const {queries,appTitle,setAppTitle,canEdit,mode}=shell;const a=analysis(queries);
 const {current,previous,latest,bc,bp,quarterChanges,groups,codes,emerging}=a;
 if(!current||!previous)return <article className='report-content ordi-report-fa' dir='rtl'><RichNarrative id='report-missing' value='برای مقایسهٔ سالانه، دست‌کم دو گزارش کامل سالانه لازم است.'/></article>;
 const fy=current.year,py=previous.year,ly=latest.year,fyFa=yr(fy),pyFa=yr(py),lyFa=yr(ly);
 const cy=careHomeYear(queries),cyFa=cy?yr(cy):null,careShown=cy!=null&&[fy,py,ly].includes(cy);
 const monthFa=new Intl.DateTimeFormat('fa-IR-u-ca-gregory',{month:'long',year:'numeric'});
 const annualScope=a.annual.filter(r=>[fy,py].includes(r.year)),quarterScope=a.quarters.flatMap(r=>[r.a,r.b]),serviceScope=a.c.filter(r=>[fy,py].includes(r.year)),latestScope=a.c.filter(r=>[ly,fy].includes(r.year));
 const per=ratio(current.amount,current.patients),prevPer=ratio(previous.amount,previous.patients),worst=[...quarterChanges].sort((x,y)=>x.Veränderung-y.Veränderung)[0];
 const bankYears=[...new Set((queries.bank_transactions?.rows??[]).map(r=>r.year))].sort((x,y)=>y-x),by=bankYears[0],bs=by?bankScope(queries,by,'annual'):null,b=bankStats(bs?.rows??[]),coverage=queries.bank_coverage?.rows??[];
 const spending=bankGroups(bs?.rows??[],'bucket').map(g=>({بخش:bucketFa[g.label]??g.label,مبلغ:g.amount}));
 const practiceGroups=bankGroups((bs?.rows??[]).filter(r=>r.bucket==='Ordination'),'category').map(g=>({دسته:catFa[g.label]??g.label,پرداخت:g.amount,تعداد:g.count}));
 const vacationRows=(queries.practice_context?.rows??[]).filter(r=>r.year===ly&&r.vacationWeeks>0),vacationWeeks=sum(vacationRows,'vacationWeeks');
 const vacationQuarters=[...new Set(vacationRows.map(r=>r.quarter))],vacationQ=quarterChanges.filter(r=>vacationQuarters.includes(Number(r.Quartal.slice(1))));
 const vacationText=vacationRows.length?`طبق توضیح شما، ${vacationRows.map(r=>`در **${monthFa.format(new Date(r.year,r.month-1,1))}** ${n(r.vacationWeeks)} هفته`).join('، ')} مرخصی داشته‌اید؛ جمعاً **${n(vacationWeeks)} هفته**. ${vacationQ.map(q=>`در فصل ${n(Number(q.Quartal.slice(1)))}، تعداد افراد مطب ${n(q.Personen)} در برابر ${n(q.PersonenVorjahr)} در سال قبل بوده است. `).join('')}این وضعیت باید در تفسیر عملکرد لحاظ شود؛ اما بدون تاریخ دقیق مرخصی، ساعات و روزهای کاری، وضعیت جانشینی و مرخصی‌های سال قبل، افزایش بهره‌وری را ثابت نمی‌کند و نرخ به‌ازای روز کاری محاسبه نشده است. مرخصی فقط تغییرات همان فصل را توضیح می‌دهد.`:'';
 const summary=`## نتیجهٔ مقایسهٔ خود مطب

${careShown?`**همهٔ مقایسه‌های بیماران و خدمات در این گزارش، سال ${cyFa} را بدون همکاری Pflegeheim در نظر می‌گیرند. مبلغ و تعداد افراد از یک جامعه‌اند.**`:'**مبلغ و تعداد افراد در همهٔ مقایسه‌ها از یک جامعه‌اند.**'}

- **سال ${fyFa}:** ارزش خدمات خود مطب **${money(current.amount)}** و تعداد افراد **${n(current.patients)}** است. نسبت به ${pyFa}، مبلغ ${move(growth(current.amount,previous.amount))} و تعداد افراد ${move(growth(current.patients,previous.patients))} داشته است.
- **فصل‌های کامل ${lyFa}:** رقم‌های هر فصل با همان فصل سال قبل، پس از تفکیک کامل مقایسه شده‌اند. تغییر مبلغ خدمات و تعداد افراد را جدا بررسی می‌کنیم؛ افزایش مبلغ الزاماً جذب بیمار یا افزایش سود نیست.
- **پول حساب:** ${by?`تا ${day(bs.coveredEnd)}، تفاوت ورود و خروج حساب ${money(b.net)} است. بخش بانک طبق انتخاب شما بدون تغییر مانده؛ حساب شخصی و مطب و تمام پرداخت‌های واقعی را پوشش می‌دهد.`:'گردش حساب قابل بررسی نداریم.'}

${careShown?`برای ${cyFa}، آمار بیمار جدید و جلسات BIZ بدون این همکاری هنوز موجود نیست. این فیلدها در مقایسه خالی می‌مانند؛ افراد همکاری را خودکار از «بیماران جدید» یا «جلسات» کم نکرده‌ایم. تفکیک کل سال و همکاری در [Jahresübersicht ${cy}](/?tab=years&focus=${encodeURIComponent(JSON.stringify({year:String(cy)}))}) قابل مشاهده است.`:''}`;
 const bankText=by?`## پولِ حساب چه می‌گوید؟

در بازهٔ **${day(bs.coveredStart)} تا ${day(bs.coveredEnd)}**، جمع ورود پول **${money(b.incoming)}** و جمع خروج پول **${money(b.outgoing)}** بوده است. پس حساب به‌اندازهٔ **${money(b.net)}** تغییر کرده؛ این تغییر را با ماندهٔ نهایی حساب یا سود اشتباه نگیریم.

از خروجی‌ها، فعلاً **${money(b.practice)}** به پرداخت‌های مطب نسبت داده شده است. این گروه بر پایهٔ توضیح شما یا شرح بانکی ساخته شده و هنوز صورت کامل هزینه‌های مطب نیست. پرداخت‌های شخصی **${money(b.private)}** و اقساط/تأمین مالی **${money(b.financing)}** جدا هستند. **${money(b.unassigned)}** خروجی هنوز کاربرد مشخصی ندارد؛ **${money(b.tax)}** مالیات نیز برای تعیین نوع و ارتباطش با مطب به بررسی نیاز دارد.

گیرندگانی که در فایل قواعد بانکی (bank-rules.json) تأیید کرده‌اید، مثل اجاره، لابراتوار یا خدمات همکاران، طبق همان قواعد در گروه مطب یا شخصی قرار گرفته‌اند.

از ورودی‌ها، **${money(b.recognizedIncome)}** به‌عنوان وصول حرفه‌ای از بیمه، کارت، حوالهٔ حق‌الزحمه، واریز نقدی بیماران یا کمک‌هزینه شناسایی شده است. منشأ **${money(b.unclearIncome)}** باقی‌مانده هنوز به‌طور کامل روشن نیست. بنابراین تمام ورودی حساب را «درآمد مطب» حساب نکرده‌ام.

**واریزهای Zahnärztekammer پول دریافتی از بیمه** و **واریزهای نقدی، پولی است که بیماران قبلاً نقد پرداخت کرده‌اند**. واریز این پول به بانک، درآمد تازه‌ای علاوه بر همان پرداخت بیمار نیست و دوباره به ارزش خدمات اضافه نشده است. تاریخ بانکی، زمان واریز را نشان می‌دهد؛ تاریخ دریافت نقد از بیمار و تاریخ درمان می‌تواند متفاوت باشد.

دو فایل بانکی هم‌پوشانی داشتند؛ ${n(coverage.reduce((s,r)=>s+r.overlapRemoved,0))} ردیف تکراریِ خروجی بانک دوباره شمرده نشده است. سالی که دادهٔ بانکی آن ناقص است با سال کامل مقایسه نمی‌شود.`:'';
 const bankMeaning=`## این اعداد برای تصمیم‌گیری چه معنایی دارند؟

**فعلاً نمی‌توانیم بگوییم مطب چقدر سود کرده است.** اگر همهٔ خروجی بانک را هزینهٔ مطب فرض کنیم، هزینه را بزرگ‌تر از واقع نشان می‌دهیم؛ اگر فقط پرداخت‌های شناسایی‌شده را کم کنیم، بعضی هزینه‌های واقعیِ هنوز نامشخص را کنار می‌گذاریم.

بزرگ‌ترین دسته‌های شناسایی‌شدهٔ مطب در جدول زیر دیده می‌شوند. هزینهٔ تکنسین و لابراتوار، ملزومات/تجهیزات، حقوق، پرداخت‌های پرسنلی و اجاره را می‌توان جدا بررسی کرد. پرداخت به یک فروشندهٔ تجهیزات هنوز به ما نمی‌گوید خرید مصرفی بوده یا دستگاه؛ برای این تفاوت، فاکتور لازم است.

**هزینهٔ هر درمان هنوز قابل محاسبه نیست.** گردش حساب، پرداخت به فروشنده را نشان می‌دهد و گزارش خدمات، درمان‌های ثبت‌شده را. بدون اتصال فاکتور یا کار لابراتوار به پرونده/درمان، تقسیم هزینه بر خدمات می‌تواند گمراه‌کننده باشد.

در بخش مالی داشبورد می‌توانید سال، فصل یا ماه، سپس بخش پرداخت و دستهٔ هزینه را انتخاب کنید. کلیک روی فروشنده یا تراکنش، جزئیات و محل آن در PDF را نشان می‌دهد. «محل» در این مرحله طرف حساب و شرح ثبت‌شدهٔ بانک است؛ نشانیِ محل تسویهٔ کارت، لزوماً محل واقعی خرید نیست.`;
 const annualText=`## سال‌های کامل با مبنای یکسان

ارزش خدمات خود مطب از **${money(previous.amount)}** در ${pyFa} به **${money(current.amount)}** در ${fyFa} رسیده است: **${move(growth(current.amount,previous.amount))}**.

تعداد افراد از **${n(previous.patients)}** به **${n(current.patients)}** رسیده: **${move(growth(current.patients,previous.patients))}**. متوسط ارزش خدمات به‌ازای هر نفر با مبلغ و تعدادِ همان جامعه محاسبه می‌شود: **${money(per)}** در برابر **${money(prevPer)}**.

این ارقام ارزش خدمات ثبت‌شده‌اند، نه وصول وجه یا سود. سال ناقص را با کل سال برای نتیجه‌گیری دربارهٔ رشد مقایسه نمی‌کنیم.`;
 const quarterText=`## فصل‌های مشابه

${quarterChanges.map(r=>`- **فصل ${n(Number(r.Quartal.slice(1)))}:** مبلغ خود مطب در ${lyFa}، **${money(r.Leistungswert)}** در برابر **${money(r.Vorjahr)}** در ${fyFa} است (${move(r.WertänderungProzent/100)}). افراد: **${n(r.Personen)}** در برابر **${n(r.PersonenVorjahr)}** (${move(r.PersonenänderungProzent/100)}).`).join('\n')}

${careShown?`کسرهای فصل‌های ${cyFa} از تمام خدمات ثبت‌شدهٔ همان افراد همکاری به دست آمده‌اند؛ محدود به کد Vi نیستند. `:''}جمع تعداد افراد فصل‌ها را برابر تعداد افراد سال نمی‌گیریم. فصل ناقص در نرخ رشد فصل‌های کامل وارد نشده است.`;

 const acquisition=`## بیمار جدید و ماندگاری

${careShown?`برای سال ${cyFa}، خروجی BIZ با محدودهٔ خود مطب بدون همکاری خارجی هنوز نداریم. بنابراین تعداد بیماران جدید، جلسات و نسبت جذب بیمار برای این سال در مقایسه‌ها **نامشخص** است. ارقام کل BIZ جایگزین این مقادیر نشده‌اند.`:'تعداد بیماران جدید و جلسات از گزارش BIZ همان سال‌ها آمده است.'}

شماره‌های داخلی ثابت به‌صورت ناشناس برای پیگیری افراد موجودند. برای تشخیص بیمار ازدست‌رفته، باید تعریف مراجعهٔ واقعی و مدت بی‌مراجعه‌ماندن مشخص شود. برنامهٔ قرمز، مراجعهٔ انجام‌شده یا درآمد قطعی نیست.`;
 const groupText=`## تغییر ارزش خدمات به تفکیک حوزه

${careShown?`این مبالغ برای سال ${cyFa} پس از کسر ردیف‌های شناسایی‌شدهٔ همکاری خارجی‌اند. جمع ردیف‌های کسرشده دقیقاً با گزارش مستقل آن همکاری برابر است؛ `:''}قیمت امروز Lexikon برای بازسازی گذشته استفاده نشده است.

${groups.filter(g=>Math.abs(g.Veränderung)>0).slice(0,5).map(g=>`- **${groupFa[g.Bereich]??g.Bereich}:** ${money(g.Aktuell)} در برابر ${money(g.Vorjahr)}؛ ${move(growth(g.Aktuell,g.Vorjahr))}.`).join('\n')}

مقدار ثبت‌شدهٔ یک ردیف خدمت همیشه برابر تعداد واحدهای آن در گزارش کدها نیست.${careShown?` برای کدهای درگیر در تفکیک ${cyFa}، تعداد واحدها و سهم بیمار/بیمه بدون خروجی جداگانه قابل تأیید نیست و خالی مانده است.`:''}`;
 const emergingText=`## خدمات دیجیتال و پریودنتولوژی، بخش‌های قابل پیگیری‌اند

در ${lyFa} تا تاریخ گزارش، برای **ترمیم‌های دیجیتال** ${money(emerging[0].Bisher)} ثبت شده؛ کل ${fyFa} ${money(emerging[0].GanzesVorjahr)} بوده است. این گروه شامل اینلی، آنلی و تاج‌هایی است که به‌روش دیجیتال ساخته شده‌اند.

برای **پریودنتولوژی و لیزر**، ${money(emerging[1].Bisher)} ثبت شده؛ کل ${fyFa} ${money(emerging[1].GanzesVorjahr)} بوده است. BT، Recall و کدهای پریودنتولوژی در این گروه‌اند؛ PDTE (لیزر اندو) جزو درمان ریشه حساب شده است.

این دو بازه هم‌اندازه نیستند؛ نرخ رشد سالانه از آن‌ها نساخته‌ام. می‌توان گفت وزن ثبت‌شدهٔ این حوزه‌ها قابل توجه شده است، ولی بدون زمان درمان و هزینه‌های متصل به هر کار، سودآورتر بودنشان معلوم نیست. قیمت‌های فعلی Lexikon هم برای محاسبهٔ گذشته به کار نرفته‌اند.`;
 const next=`## پیشنهاد نهایی

۱. مبلغ و تعداد افرادِ خود مطب را با همان محدوده در سال و فصل مشابه دنبال کنید.${careShown?` مبالغ ${cyFa} در این گزارش از همکاری خارجی جدا شده‌اند.`:''}

۲. مبلغ خدمات، افراد و تعداد جلسات را یک شاخص واحد ندانید.${careShown?` برای ${cyFa}، خروجی BIZ بدون همکاری و گزارش کدها با سهم بیمار/بیمه و تعداد واحدها هنوز لازم است.`:''}

۳. افت یا رشد افراد را از مبلغ خدمات جدا بررسی کنید. اثر نوع درمان، تعرفه، ساعات کار و مرخصی از این جمع‌ها به‌تنهایی ثابت نمی‌شود.

۴. گردش حساب فعلاً طبق انتخاب شما کامل و بدون تغییر است. سود مطب از تفاوت ورود و خروج حساب به‌تنهایی به دست نمی‌آید؛ هزینه‌های شخصی، اقساط، کاربردهای نامشخص و زمان پرداخت‌ها باید جدا بررسی شوند.

۵. برای نرخ بازگشت یا ریزش بیمار، تعریف مراجعه و مدت بی‌مراجعه‌ماندن را مشخص کنید. برنامهٔ درمانی را به‌جای مراجعهٔ انجام‌شده نشمارید.`;
 const qMoney=quarterChanges.map(r=>({فصل:`فصل ${n(Number(r.Quartal.slice(1)))}`,[fyFa]:r.Vorjahr,[lyFa]:r.Leistungswert})),qPeople=quarterChanges.map(r=>({فصل:`فصل ${n(Number(r.Quartal.slice(1)))}`,[fyFa]:r.PersonenVorjahr,[lyFa]:r.Personen}));
 const yearRows=a.annual.map(r=>({سال:yr(r.year),ارزش:r.amount,افراد:r.patients,هرنفر:ratio(r.amount,r.patients),وضعیت:r.complete?'گزارش سالانه':`تا ${day(r.coverageEnd)}`}));
 const newRows=[bp,bc].filter(r=>r&&r.newPatients!=null&&r.patients!=null).map(r=>({سال:yr(r.year),جدید:r.newPatients,کل:r.patients}));
 return <article className='report-content ordi-report ordi-report-fa' dir='rtl' lang='fa' aria-label='تحلیل نهایی عملکرد و گردش حساب مطب'>
  <header className='report-hero'><h1 data-data-app-title contentEditable={canEdit&&mode==='edit'} suppressContentEditableWarning onBlur={canEdit&&mode==='edit'?e=>setAppTitle(e.currentTarget.textContent.trim()||appTitle):undefined}>{appTitle}</h1></header>
  <PdfExportButton/>
  <ReportSection id='analysis-summary' queryId='ordination_periods' queryIds={['ordination_periods','bank_transactions','practice_context']} sourceRowsByQuery={{ordination_periods:[...annualScope,...quarterScope],bank_transactions:bs?.rows??[],practice_context:vacationRows}} title='نتیجهٔ اصلی' showHeading={false}><RichNarrative id='analysis-summary-body' value={summary}/></ReportSection>
  {by&&<>
   <ReportSection id='analysis-bank' queryId='bank_transactions' queryIds={['bank_transactions','bank_coverage']} sourceRowsByQuery={{bank_transactions:bs.rows,bank_coverage:coverage}} title='پول حساب' showHeading={false}><RichNarrative id='analysis-bank-body' value={bankText}/></ReportSection>
   <div className='report-evidence-ltr' dir='ltr'><EvidenceChart variant='plain' id='analysis-bank-spending' queryId='bank_transactions' title={`خروج پول در ${yr(by)} تا تاریخ گزارش`} rows={spending} sourceRows={bs.rows.filter(r=>r.amount<0)} height={330} spec={{...spec,type:'horizontalBar',x:'بخش',y:'مبلغ',currency:'EUR'}}/></div>
   <ReportSection id='analysis-bank-meaning' queryId='bank_transactions' title='تفسیر هزینه‌ها' sourceRows={bs.rows} showHeading={false}><RichNarrative id='analysis-bank-meaning-body' value={bankMeaning}/></ReportSection>
   <DataComponent variant='plain' id='analysis-bank-cost-table' queryId='bank_transactions' title={`پرداخت‌های شناسایی‌شدهٔ مطب در ${yr(by)}`} kind='table' displayRows={practiceGroups} sourceRows={bs.rows.filter(r=>r.bucket==='Ordination'&&r.amount<0)}><DataTable label='دسته‌های پرداخت مطب' rows={practiceGroups} searchable={false} columns={[{field:'دسته',label:'دسته'},{field:'پرداخت',label:'پرداخت',renderCell:money},{field:'تعداد',label:'تعداد پرداخت',renderCell:n}]}/></DataComponent>
  </>}
  <ReportSection id='analysis-annual' queryId='ordination_periods' title='مقایسهٔ سالانه' sourceRows={a.annual} showHeading={false}><RichNarrative id='analysis-annual-body' value={annualText}/></ReportSection>
  <DataComponent variant='plain' id='analysis-year-table' queryId='ordination_periods' title='سال‌ها کنار هم' kind='table' displayRows={yearRows} sourceRows={a.annual}><DataTable label='مقایسهٔ سال‌ها' rows={yearRows} searchable={false} columns={[{field:'سال',label:'سال'},{field:'ارزش',label:'ارزش خدمات',renderCell:money},{field:'افراد',label:'افراد مطب',renderCell:n},{field:'هرنفر',label:'برای هر نفر مطب',renderCell:money},{field:'وضعیت',label:'وضعیت'}]}/></DataComponent>
  <ReportSection id='analysis-quarters' queryId='ordination_periods' queryIds={['ordination_periods','practice_context']} title='فصل‌های مشابه' sourceRowsByQuery={{ordination_periods:quarterScope,practice_context:vacationRows}} showHeading={false}><RichNarrative id='analysis-quarters-body' value={quarterText}/></ReportSection>
  {quarterChanges.length>0&&<div className='report-evidence-ltr' dir='ltr'><EvidenceChart variant='plain' id='analysis-quarter-money' queryId='ordination_periods' title={`ارزش خدمات در فصل‌های مشابه ${fyFa} و ${lyFa}`} rows={qMoney} sourceRows={quarterScope} height={290} spec={{...spec,type:'bar',x:'فصل',y:fyFa,fields:[fyFa,lyFa],currency:'EUR',showLegend:true}}/><EvidenceChart variant='plain' id='analysis-quarter-people' queryId='ordination_periods' title={`تعداد افراد مطب در فصل‌های مشابه ${fyFa} و ${lyFa}`} rows={qPeople} sourceRows={quarterScope} height={290} spec={{...spec,type:'bar',x:'فصل',y:fyFa,fields:[fyFa,lyFa],showLegend:true}}/></div>}
  {vacationRows.length>0&&<ReportSection id='analysis-vacation-context' queryId='practice_context' title='مرخصی و تفسیر فصل سوم' sourceRows={vacationRows} showHeading={false}><RichNarrative id='analysis-vacation-body' value={vacationText}/></ReportSection>}
  <PlanningSection queries={queries}/>
  <ReportSection id='analysis-new-patients' queryId='ordination_biz_patients' queryIds={['ordination_biz_patients','ordination_patient_service_summary']} title='بیماران جدید و ماندگاری' sourceRowsByQuery={{ordination_biz_patients:[bp,bc].filter(Boolean),ordination_patient_service_summary:queries.ordination_patient_service_summary?.rows??[]}} showHeading={false}><RichNarrative id='analysis-new-body' value={acquisition}/></ReportSection>
  {newRows.length>0&&<div className='report-evidence-ltr' dir='ltr'><EvidenceChart variant='plain' id='analysis-acquisition-chart' queryId='ordination_biz_patients' title='بیماران جدید و کل افراد طبق BIZ، سال‌های دارای تفکیک معتبر' rows={newRows} sourceRows={[bp,bc]} height={290} spec={{...spec,type:'bar',x:'سال',y:'جدید',fields:['جدید','کل'],showLegend:true}}/></div>}
  <ReportSection id='analysis-groups' queryId='ordination_service_codes' title='رشد و افت خدمات' sourceRows={serviceScope} showHeading={false}><RichNarrative id='analysis-groups-body' value={groupText}/></ReportSection>
  <div className='report-evidence-ltr' dir='ltr'><EvidenceChart variant='plain' id='analysis-contributions' queryId='ordination_service_codes' title={`سهم گروه‌ها در تغییر ارزش خدمات ${fyFa} نسبت به ${pyFa}`} rows={groups.map(g=>({گروه:groupFa[g.Bereich]??g.Bereich,تغییر:g.Veränderung}))} sourceRows={serviceScope} height={470} spec={{...spec,type:'horizontalBar',x:'گروه',y:'تغییر',currency:'EUR',colorBySign:true}}/></div>
  <DataComponent variant='plain' id='analysis-code-table' queryId='ordination_service_codes' title='کدهایی که ارزش بررسی دارند' kind='table' displayRows={codes} sourceRows={serviceScope}><DataTable label='کدهای منتخب خدمات' rows={codes} searchable={false} columns={[{field:'Kürzel',label:'کد',renderCell:v=><bdi>{v}</bdi>},{field:'Vorjahr',label:pyFa,renderCell:money},{field:'Aktuell',label:fyFa,renderCell:money},{field:'PositionenVorjahr',label:`تعداد ${pyFa}`,renderCell:n},{field:'Positionen',label:`تعداد ${fyFa}`,renderCell:n}]}/></DataComponent>
  {ly!==fy&&<ReportSection id='analysis-emerging' queryId='ordination_service_codes' title='حوزه‌های قابل پیگیری' sourceRows={latestScope} showHeading={false}><RichNarrative id='analysis-emerging-body' value={emergingText}/></ReportSection>}
  <ReportSection id='analysis-recommendations' queryId='ordination_periods' queryIds={['ordination_periods','bank_transactions','ordination_service_codes','ordination_biz_patients','practice_context','ordination_patient_service_summary']} sourceRowsByQuery={{ordination_patient_service_summary:queries.ordination_patient_service_summary?.rows??[],ordination_periods:quarterScope,bank_transactions:bs?.rows??[],ordination_service_codes:latestScope,ordination_biz_patients:[bp,bc].filter(Boolean),practice_context:vacationRows}} title='پیشنهاد نهایی' showHeading={false}><RichNarrative id='analysis-recommendations-body' value={next}/></ReportSection>
  <ReportSection id='analysis-limits' queryId='reconciliation' title='محدودیت و برگشت به داشبورد' sourceRows={queries.reconciliation.rows} showHeading={false}><RichNarrative id='analysis-limits-body' value={`## نکتهٔ آخر دربارهٔ اعتبار مقایسه‌ها\n\nگزارش‌های بیماران، خدمات و BIZ همیشه دقیقاً یک جمع ندارند؛ اختلاف‌ها در داشبورد مشخص‌اند. مبلغ‌های قدیمی از خود گزارش‌ها آمده‌اند و با قیمت امروز Lexikon بازسازی نشده‌اند. اعداد گرد شدهٔ این متن، جای مبلغ دقیق در دادهٔ منبع را نمی‌گیرند.\n\n[بازکردن بخش درآمد و هزینه در داشبورد](/?tab=finance) · [مشاهدهٔ جداگانهٔ سال‌ها](/?tab=years)`}/></ReportSection>
 </article>;
}
