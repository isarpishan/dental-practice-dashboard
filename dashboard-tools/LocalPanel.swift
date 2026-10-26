import AppKit
import Foundation
import CoreGraphics
import ImageIO

let root=Bundle.main.bundleURL.deletingLastPathComponent()
let homeURL=URL(string:"http://127.0.0.1:4187/")!

func health()->[String:Any]? {
 let semaphore=DispatchSemaphore(value:0);var result:[String:Any]?
 var request=URLRequest(url:homeURL.appendingPathComponent("api/ordi/status"));request.timeoutInterval=1
 URLSession.shared.dataTask(with:request){data,response,error in
  if let data=data,let value=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any]{result=value}
  semaphore.signal()
 }.resume()
 _=semaphore.wait(timeout:.now()+1.5);return result
}

class PanelDelegate:NSObject,NSApplicationDelegate {
 var window:NSWindow!,status:NSTextField!,server:Process?,quitting=false
 func applicationDidFinishLaunching(_ notification:Notification){
  let menu=NSMenu();let appItem=NSMenuItem();menu.addItem(appItem)
  let appMenu=NSMenu();appMenu.addItem(withTitle:"Ordinationspanel beenden",action:#selector(NSApplication.terminate(_:)),keyEquivalent:"q");appItem.submenu=appMenu;NSApp.mainMenu=menu
  window=NSWindow(contentRect:NSRect(x:0,y:0,width:470,height:285),styleMask:[.titled,.closable,.miniaturizable],backing:.buffered,defer:false);window.title="Ordinationspanel";window.center();window.isReleasedWhenClosed=false
  let view=window.contentView!
  func text(_ label:String,_ y:CGFloat,_ size:CGFloat,_ bold:Bool=false)->NSTextField{
   let field=NSTextField(labelWithString:label);field.frame=NSRect(x:28,y:y,width:414,height:28);field.font=bold ? .boldSystemFont(ofSize:size):.systemFont(ofSize:size);view.addSubview(field);return field
  }
  _=text("Ihre Ordination im Überblick",232,21,true)
  status=text("Lokales Panel wird gestartet …",197,13);status.textColor = .secondaryLabelColor
  func button(_ title:String,_ x:CGFloat,_ y:CGFloat,_ action:Selector){
   let b=NSButton(title:title,target:self,action:action);b.bezelStyle = .rounded;b.frame=NSRect(x:x,y:y,width:202,height:36);view.addSubview(b)
  }
  button("Dashboard öffnen",24,143,#selector(openDashboard));button("Dateien & Exporte",243,143,#selector(openData))
  button("Analysebericht / PDF",24,97,#selector(openReport));button("Datenordner öffnen",243,97,#selector(openFolder))
  _=text("Dieses Fenster darf geschlossen werden; das Panel läuft weiter.",53,11)
  _=text("Zum Beenden im Menü „Ordinationspanel beenden“ wählen.",32,11)
  window.makeKeyAndOrderFront(nil);NSApp.activate(ignoringOtherApps:true)
  DispatchQueue.global(qos:.userInitiated).async {self.startServer()}
 }
 func startServer(){
  do {
   if let existing=health(){
    guard existing["applicationId"] as? String == "at.ordi.local-panel" else{throw NSError(domain:"Ordi",code:1,userInfo:[NSLocalizedDescriptionKey:"Der lokale Anschluss 4187 wird bereits von einem anderen Programm verwendet."])}
   }else{
    let python=root.appendingPathComponent(".local-runtime/python/bin/python3"),script=root.appendingPathComponent("dashboard-tools/serve.py")
    guard FileManager.default.isExecutableFile(atPath:python.path),FileManager.default.fileExists(atPath:script.path) else{throw NSError(domain:"Ordi",code:2,userInfo:[NSLocalizedDescriptionKey:"Bitte die App im vollständigen Projektordner behalten. Die lokalen Programmdateien fehlen."])}
    let state=root.appendingPathComponent(".local-state");try FileManager.default.createDirectory(at:state,withIntermediateDirectories:true)
    let log=state.appendingPathComponent("server.log");FileManager.default.createFile(atPath:log.path,contents:nil)
    let logHandle=try FileHandle(forWritingTo:log)
    let process=Process();process.executableURL=python;process.arguments=[script.path,"--port","4187"];process.currentDirectoryURL=root
    var environment=ProcessInfo.processInfo.environment;environment["PATH"]=root.appendingPathComponent(".local-runtime/node/bin").path+":/usr/bin:/bin";environment["PYTHONDONTWRITEBYTECODE"]="1";environment["PYTHONUTF8"]="1";environment.removeValue(forKey:"PYTHONHOME");environment.removeValue(forKey:"PYTHONPATH");process.environment=environment
    process.standardOutput=logHandle;process.standardError=logHandle;server=process;try process.run()
    var ready=false
    for _ in 0..<40 {
     if health()?["applicationId"] as? String == "at.ordi.local-panel" {ready=true;break}
     if !process.isRunning{break};Thread.sleep(forTimeInterval:0.2)
    }
    if !ready{throw NSError(domain:"Ordi",code:3,userInfo:[NSLocalizedDescriptionKey:"Das Panel konnte nicht gestartet werden. Im Datenordner unter .local-state/server.log steht das Startprotokoll."])}
   }
   DispatchQueue.main.async{self.status.stringValue="Bereit · lokal auf diesem Mac · ohne Internet";self.openDashboard()}
  }catch{
   DispatchQueue.main.async{self.status.stringValue="Start nicht möglich";let alert=NSAlert();alert.messageText="Ordinationspanel";alert.informativeText=error.localizedDescription;alert.runModal()}
  }
 }
 @objc func openDashboard(){NSWorkspace.shared.open(homeURL)}
 @objc func openData(){NSWorkspace.shared.open(URL(string:"?tab=data",relativeTo:homeURL)!.absoluteURL)}
 @objc func openReport(){NSWorkspace.shared.open(homeURL.appendingPathComponent("bericht/"))}
 @objc func openFolder(){NSWorkspace.shared.open(root)}
 func applicationShouldHandleReopen(_ sender:NSApplication,hasVisibleWindows flag:Bool)->Bool {window.makeKeyAndOrderFront(nil);return true}
 func applicationShouldTerminate(_ sender:NSApplication)->NSApplication.TerminateReply {
  if health()?["busy"] as? Bool == true {let alert=NSAlert();alert.messageText="Es werden gerade Daten verarbeitet";alert.informativeText="Bitte warten Sie, bis das Einlesen oder der Export abgeschlossen ist.";alert.runModal();return .terminateCancel}
  quitting=true;if let server=server,server.isRunning{server.terminate();server.waitUntilExit()};return .terminateNow
 }
}

if CommandLine.arguments.count==3 && CommandLine.arguments[1]=="--make-icons" {
 let folder=URL(fileURLWithPath:CommandLine.arguments[2]);try FileManager.default.createDirectory(at:folder,withIntermediateDirectories:true)
 for size in [16,32,64,128,256,512,1024] {
  let s=CGFloat(size),space=CGColorSpaceCreateDeviceRGB()
  let bitmap=CGContext(data:nil,width:size,height:size,bitsPerComponent:8,bytesPerRow:size*4,space:space,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue)!
  bitmap.setFillColor(CGColor(srgbRed:0.10,green:0.35,blue:0.39,alpha:1));bitmap.addPath(CGPath(roundedRect:CGRect(x:s*0.04,y:s*0.04,width:s*0.92,height:s*0.92),cornerWidth:s*0.19,cornerHeight:s*0.19,transform:nil));bitmap.fillPath()
  bitmap.setFillColor(CGColor(gray:1,alpha:1));for (i,h) in [0.24,0.40,0.58].enumerated(){bitmap.addPath(CGPath(roundedRect:CGRect(x:s*(0.23+Double(i)*0.20),y:s*0.20,width:s*0.14,height:s*h),cornerWidth:s*0.025,cornerHeight:s*0.025,transform:nil));bitmap.fillPath()}
  let data=NSMutableData(),destination=CGImageDestinationCreateWithData(data,"public.png" as CFString,1,nil)!;CGImageDestinationAddImage(destination,bitmap.makeImage()!,nil);CGImageDestinationFinalize(destination);let png=data as Data
  for base in [16,32,128,256,512]{if size==base{try png.write(to:folder.appendingPathComponent("icon_\(base)x\(base).png"))};if size==base*2{try png.write(to:folder.appendingPathComponent("icon_\(base)x\(base)@2x.png"))}}
 }
}else{
 let application=NSApplication.shared;application.setActivationPolicy(.regular);let delegate=PanelDelegate();application.delegate=delegate;application.run()
}
