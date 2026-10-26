from pathlib import Path
import subprocess,plistlib,tempfile,struct
ROOT=Path(__file__).resolve().parent.parent
app=ROOT/'Ordinationspanel.app';contents=app/'Contents';mac=contents/'MacOS';resources=contents/'Resources'
mac.mkdir(parents=True,exist_ok=True);resources.mkdir(exist_ok=True)
subprocess.run(['/usr/bin/swiftc','-module-cache-path','/private/tmp/ordi-panel-swift-cache',str(ROOT/'dashboard-tools/LocalPanel.swift'),'-o',str(mac/'Ordinationspanel')],check=True)
info={'CFBundleName':'Ordinationspanel','CFBundleDisplayName':'Ordinationspanel','CFBundleIdentifier':'at.ordi.local-panel','CFBundleVersion':'1','CFBundleShortVersionString':'1.0','CFBundleExecutable':'Ordinationspanel','CFBundlePackageType':'APPL','CFBundleIconFile':'AppIcon','LSMinimumSystemVersion':'13.0','NSHighResolutionCapable':True,'NSHumanReadableCopyright':'Lokales Ordinationspanel'}
(contents/'Info.plist').write_bytes(plistlib.dumps(info))
with tempfile.TemporaryDirectory(prefix='ordi-icons-') as tmp:
 icons=Path(tmp)/'AppIcon.iconset'
 subprocess.run([str(mac/'Ordinationspanel'),'--make-icons',str(icons)],check=True)
 chunks=[]
 for size,kind in [(128,b'ic07'),(256,b'ic08'),(512,b'ic09'),(1024,b'ic10')]:
  png=(icons/('icon_512x512@2x.png' if size==1024 else f'icon_{size}x{size}.png')).read_bytes()
  chunks.append(kind+struct.pack('>I',len(png)+8)+png)
 body=b''.join(chunks);(resources/'AppIcon.icns').write_bytes(b'icns'+struct.pack('>I',len(body)+8)+body)
subprocess.run(['/usr/bin/codesign','--force','--sign','-',str(app)],check=True,capture_output=True)
print(app)
