from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import tempfile

root = Path(__file__).resolve().parents[1]
destination = root / 'outputs' / 'InvoicePilot.zip'
destination.parent.mkdir(parents=True, exist_ok=True)
folders = ['public', 'src', 'scripts', 'tests', 'drizzle', 'samples', '.openai', 'api', 'supabase']
files = [root / name for name in ['README.md', 'PROJECT-GUIDE.md', 'DEMO-SCRIPT.md', 'TEST-REPORT.md', 'package.json', 'package-lock.json', 'vercel.json', '.vercelignore', '.env.example', 'VERCEL-SETUP.md', '.gitignore', 'START-INVOICEPILOT.cmd', 'RUN.cmd', 'RUN-SUPABASE.cmd']]
for folder in folders:
    files.extend(p for p in (root / folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts)
with ZipFile(destination, 'w', ZIP_DEFLATED, strict_timestamps=False) as archive:
    for file in sorted(files):
        archive.write(file, 'InvoicePilot/' + file.relative_to(root).as_posix())
    # Always ship placeholders, never the local user's filled credentials.
    archive.writestr('InvoicePilot/.env.local', '# Paste your own Supabase project values below. Never commit this file.\nSUPABASE_URL=https://YOUR-PROJECT.supabase.co\nSUPABASE_ANON_KEY=YOUR-LEGACY-ANON-KEY\nSUPABASE_SERVICE_ROLE_KEY=YOUR-LEGACY-SERVICE-ROLE-KEY\n')
with ZipFile(destination) as archive:
    assert archive.testzip() is None
print(str(destination))
print('Verified source package:', len(files), 'files')
