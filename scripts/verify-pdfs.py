import json
from pathlib import Path
from pypdf import PdfReader
root = Path(__file__).resolve().parents[1]
texts = {}
for path in sorted((root / 'samples').glob('*.pdf')):
    reader = PdfReader(path)
    texts[path.name] = '\n'.join(page.extract_text() or '' for page in reader.pages)
assert 'Grand Total: 4500.00' in texts['aster-inv-1048.pdf']
assert not texts['northstar-scan.pdf'].strip(), 'Scan must require OCR'
print(json.dumps(texts))
