"""Build the reviewed dashboard and its analytical report from the same snapshots."""
from pathlib import Path
import subprocess,os
from runtime_config import NODE,BUILD
ROOT=Path(__file__).resolve().parent.parent
for project in [ROOT/'dashboard',ROOT/'bericht']:
 if not (project/'src/data.json').exists():continue
 # The dashboard is built from source (customised chart labels); the report uses the prebuilt runtime.
 mode='--source' if project.name=='dashboard' else '--separate-data'
 subprocess.run([str(NODE),str(BUILD),'build','--project-dir',str(project),mode],check=True)
if (ROOT/'bericht/dist/index.html').exists():
 link=ROOT/'dashboard/dist/bericht'
 if link.is_symlink():
  if link.resolve()!=ROOT/'bericht/dist':link.unlink()
 elif link.exists():raise RuntimeError('Das Berichtsziel ist bereits anderweitig belegt.')
 if not link.exists():link.symlink_to('../../bericht/dist',target_is_directory=True)
