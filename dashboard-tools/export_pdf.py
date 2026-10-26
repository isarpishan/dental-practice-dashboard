"""Export the verified local report, using its current reviewed snapshot."""
from pathlib import Path
from pypdf import PdfReader
import json,subprocess,tempfile,io
from runtime_config import NODE

ROOT=Path(__file__).resolve().parent.parent

def export_pdf(presentation):
 if not isinstance(presentation,dict):raise ValueError('درخواست دانلود معتبر نیست.')
 snapshot=json.loads((ROOT/'bericht/src/data.json').read_text())
 if presentation.get('snapshotVersion')!=snapshot['generatedAt']:
  raise ValueError('داده‌ها به‌روزرسانی شده‌اند. صفحه را تازه کنید و دوباره PDF بگیرید.')
 if snapshot.get('buildStatus')!='complete':raise ValueError('به‌روزرسانی گزارش هنوز تمام نشده است.')
 for key in ('narrativeEdits','chartOverrides','chartStates'):
  if not isinstance(presentation.get(key,{}),dict):raise ValueError('تنظیمات گزارش معتبر نیست.')
 if not isinstance(presentation.get('hiddenBlockIds',[]),list):raise ValueError('تنظیمات گزارش معتبر نیست.')
 binary=ROOT/'dashboard-tools/bin/ordi-report-pdf'
 if not binary.exists():raise RuntimeError('ابزار ساخت PDF پیدا نشد. لطفاً پوشهٔ گزارش را کامل نگه دارید.')
 with tempfile.TemporaryDirectory(prefix='ordi-pdf-') as temp:
  folder=Path(temp);settings=folder/'presentation.json';settings.write_text(json.dumps(presentation,ensure_ascii=False))
  result=subprocess.run([str(NODE),str(ROOT/'dashboard-tools/report_pdf_data.mjs'),str(settings)],capture_output=True,timeout=30)
  if result.returncode:raise RuntimeError('نسخهٔ گزارش قابل خروجی گرفتن نیست. صفحه را تازه کنید؛ اگر نمودار را تغییر داده‌اید، نوع میله‌ای را انتخاب کنید.')
  document=folder/'report.json';document.write_bytes(result.stdout);output=folder/'report.pdf'
  result=subprocess.run([str(binary),str(document),str(output)],capture_output=True,timeout=30)
  if result.returncode or not output.exists():raise RuntimeError('ساخت PDF انجام نشد. دوباره تلاش کنید.')
  content=output.read_bytes();reader=PdfReader(io.BytesIO(content))
  if not reader.pages or not all(page.extract_text() for page in reader.pages):raise RuntimeError('فایل PDF کامل ساخته نشد. دوباره تلاش کنید.')
  return content
