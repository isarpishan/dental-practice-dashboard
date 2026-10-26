// Convert the verified authored report into document blocks; never render app chrome.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import crypto from 'node:crypto';
const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const compiler=require(path.join(root,'.local-runtime/data-plugin/assets/data-app-runtime/compiler.cjs'));
const project=path.join(root,'bericht'),snapshot=JSON.parse(fs.readFileSync(path.join(project,'src/data.json')));
const manifest=JSON.parse(fs.readFileSync(path.join(project,'dist/data-app-build.json')));
const html=fs.readFileSync(path.join(project,'dist/index.html'));
if(crypto.createHash('sha256').update(html).digest('hex')!==manifest.html.sha256)throw Error('Compiled report verification failed.');
const sidecar=JSON.parse(fs.readFileSync(path.join(project,'dist',`snapshot.${manifest.snapshot.sha256}.json`)));
if(JSON.stringify(snapshot)!==JSON.stringify(sidecar))throw Error('Report data is newer than its compiled preview. Refresh the report first.');
const presentation=process.argv[2]?JSON.parse(fs.readFileSync(process.argv[2])):{};
const hidden=new Set(presentation.hiddenBlockIds??[]),edits=presentation.narrativeEdits??{},titles=presentation.componentTitles??{};
const jsx=(type,props)=>({type,props:props??{}}),cache=new Map();
const publicApi=Object.fromEntries(['DataComponent','DataTable','EvidenceChart','ReportSection','RichNarrative'].map(x=>[x,x]));
publicApi.useDataApp=()=>({queries:snapshot.queries,appTitle:presentation.title||snapshot.title,canEdit:false,mode:'view'});
function load(file){
 if(file.endsWith('.css'))return{};
 if(file.endsWith('/PdfExportButton.jsx'))return{PdfExportButton:()=>null};
 if(cache.has(file))return cache.get(file).exports;
 const module={exports:{}};cache.set(file,module);
 const code=compiler.transform(fs.readFileSync(file,'utf8'),{filePath:file});
 const localRequire=id=>{
  if(id==='react/jsx-runtime')return{jsx,jsxs:jsx,Fragment:'fragment'};
  if(id==='react')return{__esModule:true,default:{createElement:(type,props,...children)=>jsx(type,{...props,children})}};
  if(id.endsWith('data-app-public.jsx'))return publicApi;
  const target=path.resolve(path.dirname(file),id);if(!target.startsWith(path.join(project,'src/content')+path.sep))throw Error('Unsupported document import.');return load(target);
 };
 new vm.Script(`(function(require,module,exports){${code}\n})`,{filename:file}).runInThisContext()(localRequire,module,module.exports);
 return module.exports;
}
const text=value=>value==null||typeof value==='boolean'?'':Array.isArray(value)?value.map(text).join(''):typeof value==='object'?text(value.props?.children):String(value);
const blocks=[];const used=new Set();
function visit(node,parent={}){
 if(node==null||typeof node==='boolean')return;if(Array.isArray(node)){node.forEach(x=>visit(x,parent));return;}if(typeof node!=='object')return;
 const p=node.props??{};if(p.id&&hidden.has(p.id))return;
 if(typeof node.type==='function'){visit(node.type(p),parent);return;}
 for(const id of p.queryIds??[p.queryId])if(id)used.add(id);
 if(node.type==='RichNarrative'){blocks.push({kind:'narrative',id:p.id,markdown:edits[p.id]??p.value});return;}
 if(node.type==='EvidenceChart'){
  const override=presentation.chartOverrides?.[p.id]??{};const spec={...p.spec,...override};
  const state=presentation.chartStates?.[p.id]??{};
  const fields=spec.fields??[spec.y];
  const hiddenSeries=state.hiddenSeries??[];
  spec.fields=fields.filter(f=>!hiddenSeries.includes(f));
  if(!['bar','horizontalBar'].includes(spec.type))throw Error('This PDF currently supports the report’s bar charts. Restore a bar chart before exporting.');
  blocks.push({kind:'chart',id:p.id,title:titles[p.id]??p.title,spec,rows:p.rows});return;
 }
 if(node.type==='DataTable'){
  blocks.push({kind:'table',title:parent.title??p.label,columns:p.columns.map(c=>c.label??c.field),rows:p.rows.map(row=>p.columns.map(c=>text(c.renderCell?c.renderCell(row[c.field],row):row[c.field])))});return;
 }
 visit(p.children,node.type==='DataComponent'?{title:titles[p.id]??p.title}:parent);
}
visit(load(path.join(project,'src/content/report/ReportContent.jsx')).ReportContent());
const sources=[...used].filter(id=>snapshot.queries[id]?.source).map(id=>({id,files:snapshot.queries[id].source.files?.map(f=>f.label.replace(/AT\d{18,24}/g,'[Konto]'))??[]}));
process.stdout.write(JSON.stringify({title:presentation.title||snapshot.title,asOf:snapshot.report?.asOf??snapshot.observationCutoff,generatedAt:snapshot.generatedAt,snapshotSha256:manifest.snapshot.sha256,blocks,sources}));
