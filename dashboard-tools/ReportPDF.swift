import Foundation
import AppKit
import CoreText
import CoreGraphics

let arguments=CommandLine.arguments
if arguments.count != 3 {fatalError("Expected document JSON and output PDF")}
let data=try Data(contentsOf:URL(fileURLWithPath:arguments[1]))
let doc=try JSONSerialization.jsonObject(with:data) as! [String:Any]
let output=URL(fileURLWithPath:arguments[2])
let pageWidth:CGFloat=595.28,pageHeight:CGFloat=841.89,margin:CGFloat=44,contentWidth:CGFloat=507.28
var media=CGRect(x:0,y:0,width:pageWidth,height:pageHeight)
let metadata=[kCGPDFContextTitle:doc["title"] as! String,kCGPDFContextAuthor:"Ordinationsanalyse",kCGPDFContextSubject:"تحلیل عملکرد و گردش حساب مطب",kCGPDFContextCreator:"Ordinationsbericht PDF"] as CFDictionary
let ctx=CGContext(output as CFURL,mediaBox:&media,metadata)!
var y:CGFloat=0,page=0
let ink=NSColor(calibratedWhite:0.14,alpha:1),muted=NSColor(calibratedWhite:0.42,alpha:1),accent=NSColor(calibratedRed:0.12,green:0.39,blue:0.43,alpha:1)
let fontName="Tahoma"
func font(_ size:CGFloat,_ bold:Bool=false)->NSFont {
 let f=NSFont(name:fontName,size:size) ?? NSFont(name:"Arial",size:size) ?? NSFont.systemFont(ofSize:size)
 return bold ? NSFontManager.shared.convert(f,toHaveTrait:.boldFontMask):f
}
func attrs(_ size:CGFloat=11.5,_ bold:Bool=false,_ color:NSColor=ink,_ rtl:Bool=true)->[NSAttributedString.Key:Any]{
 let p=NSMutableParagraphStyle();p.alignment=rtl ? .right:.left;p.baseWritingDirection=rtl ? .rightToLeft:.leftToRight;p.lineSpacing=4;p.paragraphSpacing=0
 return [.font:font(size,bold),.foregroundColor:color,.paragraphStyle:p]
}
func attributed(_ input:String,_ size:CGFloat=11.5,_ bold:Bool=false,_ color:NSColor=ink,_ rtl:Bool=true)->NSAttributedString {
 let pieces=input.components(separatedBy:"**");let s=NSMutableAttributedString(string:"")
 for (i,p) in pieces.enumerated(){s.append(NSAttributedString(string:p,attributes:attrs(size,bold || i%2==1,color,rtl)))}
 return s
}
func measured(_ a:NSAttributedString,_ width:CGFloat)->CGFloat {
 let f=CTFramesetterCreateWithAttributedString(a);return ceil(CTFramesetterSuggestFrameSizeWithConstraints(f,CFRange(location:0,length:a.length),nil,CGSize(width:width,height:100000),nil).height)+3
}
func draw(_ a:NSAttributedString,_ x:CGFloat,_ top:CGFloat,_ width:CGFloat,_ height:CGFloat){
 let f=CTFramesetterCreateWithAttributedString(a);let p=CGPath(rect:CGRect(x:x,y:pageHeight-top-height,width:width,height:height),transform:nil)
 let frame=CTFramesetterCreateFrame(f,CFRange(location:0,length:0),p,nil);ctx.textMatrix = .identity;CTFrameDraw(frame,ctx)
}
func footer(){
 draw(attributed("گزارش مطب  •  \(page)",8,false,muted),margin,pageHeight-30,contentWidth,16)
}
func newPage(){
 if page>0{footer();ctx.endPDFPage()};ctx.beginPDFPage(nil);page+=1;y=48
 ctx.setFillColor(NSColor.white.cgColor);ctx.fill(media)
 draw(attributed("تحلیل عملکرد و گردش حساب مطب",8,false,muted),margin,19,contentWidth,16)
 ctx.setStrokeColor(NSColor(calibratedWhite:0.86,alpha:1).cgColor);ctx.setLineWidth(0.5);ctx.move(to:CGPoint(x:margin,y:pageHeight-40));ctx.addLine(to:CGPoint(x:pageWidth-margin,y:pageHeight-40));ctx.strokePath()
}
func ensure(_ h:CGFloat){if y+h>pageHeight-48{newPage()}}
func paragraph(_ input:String,_ size:CGFloat=11.5,_ bold:Bool=false,_ color:NSColor=ink){
 if input.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty{return}
 let a=attributed(input,size,bold,color);let h=measured(a,contentWidth);ensure(h+8);draw(a,margin,y,contentWidth,h);y+=h+9
}
func heading(_ title:String){
 let a=attributed(title,15,true,accent);let h=measured(a,contentWidth);ensure(h+70);y+=10;draw(a,margin,y,contentWidth,h);y+=h+12
}
func narrative(_ markdown:String){
 for part in markdown.components(separatedBy:"\n\n"){
  let s=part.trimmingCharacters(in:.whitespacesAndNewlines);if s.isEmpty{continue}
  if s.hasPrefix("[") && s.contains("](/"){continue}
  if s.hasPrefix("## "){heading(String(s.dropFirst(3)))}
  else if s.hasPrefix("- "){for line in s.components(separatedBy:"\n"){paragraph(line.hasPrefix("- ") ? "• "+String(line.dropFirst(2)):line)}}
  else{paragraph(s.replacingOccurrences(of:"\n",with:" "))}
 }
}
func table(_ block:[String:Any]){
 let cols=block["columns"] as! [String],rows=block["rows"] as! [[String]],count=cols.count
 var widths=[CGFloat](repeating:contentWidth/CGFloat(count),count:count)
 if count==3{widths=[contentWidth*0.53,contentWidth*0.29,contentWidth*0.18]}
 if count==5{widths=[contentWidth*0.12,contentWidth*0.23,contentWidth*0.13,contentWidth*0.23,contentWidth*0.29]}
 let tableTitle=block["title"] as? String ?? ""
 var openingHeight=measured(attributed(tableTitle,15,true,accent),contentWidth)+24
 for (index,values) in ([cols]+Array(rows.prefix(1))).enumerated(){
  var rowHeight:CGFloat=28
  for i in 0..<count{rowHeight=max(rowHeight,measured(attributed(values[i],index==0 ? 10:10.5,index==0),widths[i]-12)+12)}
  openingHeight+=rowHeight
 }
 ensure(openingHeight+8);heading(tableTitle)
 func row(_ values:[String],_ header:Bool,_ stripe:Bool){
  var h:CGFloat=28
  for i in 0..<count{h=max(h,measured(attributed(values[i],header ? 10:10.5,header),widths[i]-12)+12)}
  if y+h>pageHeight-48{newPage();if !header{row(cols,true,false)}}
  let background=header ? NSColor(calibratedWhite:0.91,alpha:1):NSColor(calibratedWhite:stripe ? 0.965:1,alpha:1)
  ctx.setFillColor(background.cgColor);ctx.fill(CGRect(x:margin,y:pageHeight-y-h,width:contentWidth,height:h))
  var right=pageWidth-margin
  for i in 0..<count{let x=right-widths[i];draw(attributed(values[i],header ? 10:10.5,header),x+6,y+6,widths[i]-12,h-10);right=x}
  ctx.setStrokeColor(NSColor(calibratedWhite:0.86,alpha:1).cgColor);ctx.move(to:CGPoint(x:margin,y:pageHeight-y-h));ctx.addLine(to:CGPoint(x:pageWidth-margin,y:pageHeight-y-h));ctx.strokePath();y+=h
 }
 row(cols,true,false);for (i,r) in rows.enumerated(){row(r,false,i%2==0)};y+=14
}
let palette=[NSColor(calibratedRed:0.14,green:0.44,blue:0.50,alpha:1),NSColor(calibratedRed:0.81,green:0.39,blue:0.23,alpha:1),NSColor(calibratedRed:0.47,green:0.40,blue:0.63,alpha:1)]
func numeric(_ value:Any?)->Double{(value as? NSNumber)?.doubleValue ?? 0}
func chart(_ block:[String:Any]){
 let spec=block["spec"] as! [String:Any],rows=block["rows"] as! [[String:Any]],xkey=spec["x"] as! String,yk=spec["y"] as! String
 let fields=(spec["fields"] as? [String]) ?? [yk],horizontal=(spec["type"] as? String)=="horizontalBar",currency=spec["currency"] as? String
 let h:CGFloat=horizontal ? max(230,CGFloat(rows.count)*27+36):235
 let title=block["title"] as? String ?? ""
 ensure(h+90);heading(title);let top=y
 let labelWidth:CGFloat=horizontal ? 167:42,plotX=margin+labelWidth,plotW=contentWidth-labelWidth-12
 let dataValues=rows.flatMap{r in fields.map{numeric(r[$0])}},lower=min(0,dataValues.min() ?? 0),upper=max(1,dataValues.max() ?? 1),span=upper-lower
 func px(_ v:Double)->CGFloat{plotX+CGFloat((v-lower)/span)*plotW}
 func valueLabel(_ value:Double)->String{
  let fmt=NumberFormatter();fmt.locale=Locale(identifier:"fa_IR");fmt.maximumFractionDigits=0
  return (fmt.string(from:NSNumber(value:value)) ?? String(value))+(currency != nil ? " یورو":"")
 }
 ctx.setLineWidth(0.5);ctx.setStrokeColor(NSColor(calibratedWhite:0.88,alpha:1).cgColor)
 if horizontal{
  for (i,row) in rows.enumerated(){
   let rowTop=top+CGFloat(i)*27,label=String(describing:row[xkey] ?? ""),v=numeric(row[yk]);let color=(spec["colorBySign"] as? Bool == true && v<0) ? palette[1]:palette[0]
   draw(attributed(label,8.5,false,ink),margin,rowTop+2,labelWidth-9,24)
   let left=min(px(0),px(v)),width=max(0.5,abs(px(v)-px(0)));ctx.setFillColor(color.cgColor);ctx.fill(CGRect(x:left,y:pageHeight-rowTop-18,width:width,height:15))
   let labelString=valueLabel(v);let labelX:CGFloat=v<0 ? max(plotX,px(v)-2):min(px(v)+3,pageWidth-margin-70)
   draw(attributed(labelString,7.5,false,muted,false),labelX,rowTop+18,85,14)
  }
  let zero=px(0);ctx.move(to:CGPoint(x:zero,y:pageHeight-top+2));ctx.addLine(to:CGPoint(x:zero,y:pageHeight-top-CGFloat(rows.count)*27));ctx.strokePath();y=top+CGFloat(rows.count)*27+24
 }else{
  let plotTop=top+9,plotH:CGFloat=173,base=pageHeight-plotTop-plotH,maxV=max(1,dataValues.max() ?? 1)
  if currency != nil{draw(attributed("یورو",8,false,muted),margin,top-12,labelWidth-4,16)}
  for t in 0...4{let value=maxV*Double(t)/4,yy=base+CGFloat(value/maxV)*plotH;ctx.move(to:CGPoint(x:plotX,y:yy));ctx.addLine(to:CGPoint(x:pageWidth-margin,y:yy));ctx.strokePath();let tick=valueLabel(value).replacingOccurrences(of:" یورو",with:"");draw(attributed(tick,7.5,false,muted,false),margin,pageHeight-yy-6,labelWidth-4,16)}
  let groupW=plotW/CGFloat(max(1,rows.count)),barW=min(38,groupW*0.7/CGFloat(max(1,fields.count)))
  for (i,row) in rows.enumerated(){let center=plotX+groupW*(CGFloat(i)+0.5)
   for (j,f) in fields.enumerated(){let v=numeric(row[f]),hh=CGFloat(v/maxV)*plotH;let xx=center-CGFloat(fields.count)*barW/2+CGFloat(j)*barW;ctx.setFillColor(palette[j%palette.count].cgColor);ctx.fill(CGRect(x:xx+1,y:base,width:barW-3,height:hh))}
   draw(attributed(String(describing:row[xkey] ?? ""),9,false,ink),center-groupW/2,plotTop+plotH+6,groupW-3,24)
  }
  var legendRight=pageWidth-margin
  for (j,f) in fields.enumerated(){draw(attributed(f,9,false,ink),legendRight-125,top+215,100,18);ctx.setFillColor(palette[j%palette.count].cgColor);ctx.fill(CGRect(x:legendRight-16,y:pageHeight-top-228,width:9,height:9));legendRight-=145}
  y=top+240
 }
 y+=12
}
newPage()
paragraph(doc["title"] as! String,24,true,ink)
let cutoff=doc["asOf"] as? String ?? ""
paragraph("تاریخ داده‌ها: \(cutoff)  |  مبالغ به یورو",9,false,muted)
y+=10
for block in doc["blocks"] as! [[String:Any]]{
 switch block["kind"] as! String{
 case "narrative":narrative(block["markdown"] as! String)
 case "table":table(block)
 case "chart":chart(block)
 default:break
 }
}
heading("منابع و مبنای محاسبه")
paragraph("این فایل از همان گزارش و داده‌های بررسی‌شدهٔ داشبورد تهیه شده است. مبلغ خدمات، ورود پول، پرداخت‌های شخصی و اقساط جدا نگه داشته شده‌اند. سال ۲۰۲۶ تا تاریخ گزارش کامل نیست. تعداد افراد فصل‌ها به‌عنوان افراد یکتای سال با هم جمع نشده است.",10)
let labels=["patient_service_summary":"جزئیات خدمات و برنامه‌های قرمز","patient_periods":"آمار اصلی بیماران و دوره‌های زمانی","ordination_periods":"آمار بیماران مطب پس از تفکیک Pflegeheim","pflegeheim_periods":"فهرست همکاری Pflegeheim","pflegeheim_finance":"تفکیک مبلغ و هزینه‌های Pflegeheim","biz_patients":"آمار BIZ و بیماران جدید","service_codes":"گزارش خدمات و Lexikon","bank_transactions":"گردش حساب بانکی","bank_coverage":"پوشش گردش حساب","reconciliation":"تطبیق جمع گزارش‌ها"]
var seen=Set<String>()
for s in doc["sources"] as! [[String:Any]]{
 let id=s["id"] as! String;let names=(s["files"] as! [String]).filter{seen.insert($0).inserted}
 if names.isEmpty{continue};paragraph(labels[id] ?? id,10,true)
 for name in names{paragraph(name,8.5,false,muted);y-=9}
}
paragraph("شناسهٔ نسخهٔ داده: "+String((doc["snapshotSha256"] as! String).prefix(16)),8,false,muted)
footer();ctx.endPDFPage();ctx.closePDF()
print("PDF pages: \(page)")
