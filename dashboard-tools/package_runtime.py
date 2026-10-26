"""Bundle unchanged installed runtimes for this Mac's local application."""
from pathlib import Path
import shutil,json,hashlib,os
ROOT=Path(__file__).resolve().parent.parent;target=ROOT/'.local-runtime'
# Point these at your local Codex runtime and Data plugin installation if they live elsewhere.
source=Path(os.environ.get('CODEX_RUNTIME_DIR',Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies'))
plugin=Path(os.environ.get('DATA_PLUGIN_DIR',Path.home()/'.codex/plugins/cache/openai-curated-remote/data-analytics/1.0.11'))
target.mkdir(exist_ok=True)
if not (target/'python').exists():
 shutil.copytree(source/'python',target/'python',symlinks=True,ignore=shutil.ignore_patterns('site-packages','__pycache__'))
 packages=target/'python/lib/python3.12/site-packages';packages.mkdir(parents=True)
 original=source/'python/lib/python3.12/site-packages'
 for path in original.glob('pypdf*'):
  if path.is_dir():shutil.copytree(path,packages/path.name,ignore=shutil.ignore_patterns('__pycache__'))
if not (target/'node/bin/node').exists():
 (target/'node/bin').mkdir(parents=True);shutil.copy2(source/'node/bin/node',target/'node/bin/node')
 for name in ['LICENSE','README.md']:
  if (source/'node'/name).exists():shutil.copy2(source/'node'/name,target/'node'/name)
if not (target/'data-plugin').exists():shutil.copytree(plugin,target/'data-plugin',symlinks=True,ignore=shutil.ignore_patterns('__pycache__','.DS_Store'))
manifest={'nodeSha256':hashlib.sha256((target/'node/bin/node').read_bytes()).hexdigest(),'dataPluginVersion':'1.0.11','purpose':'Pinned unchanged local application dependencies; no network or Codex session required.'}
(target/'dependencies.json').write_text(json.dumps(manifest,indent=2))
print('Local Python, pypdf, Node and unchanged verified build runtime bundled.')
