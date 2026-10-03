"""Record the complete experimental runtime pack without modifying its assets."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
files = []
for path in sorted((ROOT / 'public/modern').rglob('*')):
    if path.is_file():
        data = path.read_bytes()
        files.append({'path': str(path.relative_to(ROOT / 'public')),
                      'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
result = {'fileCount': len(files), 'bytes': sum(item['bytes'] for item in files),
          'note': 'Complete public/modern pack, before transport compression. Editable sources and review images excluded.',
          'files': files}
(ROOT / 'art/modern/roster/runtime-manifest.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({key: value for key, value in result.items() if key != 'files'}))
