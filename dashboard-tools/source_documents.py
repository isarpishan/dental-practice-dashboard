"""Resolve only unchanged, catalogued PDFs inside this local practice folder."""
from pathlib import Path
import re,json,hashlib
ROOT=Path(__file__).resolve().parent.parent
def resolve_document(digest,root=ROOT):
 if not re.fullmatch('[0-9a-f]{64}',digest):raise ValueError('Ungültige Dokumentreferenz.')
 root=Path(root).resolve()
 snapshot=json.loads((root/'dashboard/src/data.json').read_text())
 entry=next((r for r in snapshot['queries']['file_inventory']['rows'] if r['sha256']==digest),None)
 if not entry:raise ValueError('Dokument ist nicht im geprüften Datenstand enthalten.')
 path=(root/entry['file']).resolve()
 if not path.is_relative_to(root) or path.suffix.lower()!='.pdf' or not path.is_file():raise ValueError('Original-PDF nicht verfügbar.')
 if hashlib.sha256(path.read_bytes()).hexdigest()!=digest:raise ValueError('Original wurde geändert. Bitte zuerst erneut einlesen.')
 return path
