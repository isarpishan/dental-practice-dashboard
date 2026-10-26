from pathlib import Path
import tempfile,json,hashlib
from source_documents import resolve_document
with tempfile.TemporaryDirectory() as directory:
 root=Path(directory);(root/'dashboard/src').mkdir(parents=True)
 source=root/'original.pdf';source.write_bytes(b'%PDF-test-original')
 digest=hashlib.sha256(source.read_bytes()).hexdigest()
 snapshot=root/'dashboard/src/data.json'
 def catalog(file):snapshot.write_text(json.dumps({'queries':{'file_inventory':{'rows':[{'sha256':digest,'file':file}]}}}))
 def rejected(value):
  try:resolve_document(value,root)
  except ValueError:return
  raise AssertionError('Uncatalogued or changed document was accepted')
 catalog('original.pdf');assert resolve_document(digest,root)==source.resolve()
 rejected('../original.pdf');rejected('a'*64)
 source.write_bytes(b'changed');rejected(digest)
 catalog('../outside.pdf');rejected(digest)
 with tempfile.TemporaryDirectory() as other:
  external=Path(other)/'external.pdf';external.write_bytes(b'%PDF-test-original');(root/'link.pdf').symlink_to(external);catalog('link.pdf');rejected(digest)
print('Original PDF resolution verified: catalog, exact hash, changed file, invalid references and path/symlink boundaries.')
