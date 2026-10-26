"""Optional care-home (Pflegeheim) cooperation settings. Without the local file the feature is off."""
from pathlib import Path
import json

DEFAULTS={'cooperation':'Pflegeheim','serviceYear':None,'listFile':None,'partnerLabel':'Partner','completeServiceYears':[],'paymentServiceYears':{},'basis':''}

def load_context(root):
 path=Path(root)/'dashboard-tools/pflegeheim-finance-context.json'
 data=json.loads(path.read_text()) if path.exists() else {}
 return {**DEFAULTS,**data}
