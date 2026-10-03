"""Read-only verification of the complete hosted experimental art pack.

Usage:
    python3 tools/modern-art/verify_hosted.py /private/tmp/hosted-assets.json
    python3 tools/modern-art/verify_hosted.py report.json --url https://example.test

Requests every manifest asset with six workers, without saving asset copies.
Only the requested JSON report is written. A mismatch or failed GET exits 1.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sys
import time
from urllib.error import HTTPError
from urllib.parse import quote, urlsplit
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_URL = 'https://deploy-preview-32--seventh-gun.netlify.app'
DEFAULT_MANIFEST = ROOT / 'art/modern/roster/runtime-manifest.json'


def read_manifest(path: Path) -> tuple[dict, str]:
    raw = path.read_bytes()
    manifest = json.loads(raw)
    files = manifest['files']
    if not files or len(files) != manifest['fileCount']:
        raise ValueError('Manifest fileCount does not match its nonempty files list')
    if sum(row['bytes'] for row in files) != manifest['bytes']:
        raise ValueError('Manifest total bytes does not match its files')
    seen = set()
    for row in files:
        name = row['path']
        parsed = urlsplit(name)
        if (not name or name.startswith('/') or '\\' in name or parsed.scheme or parsed.netloc
                or parsed.query or parsed.fragment or '..' in name.split('/') or name in seen):
            raise ValueError(f'Invalid or duplicate manifest asset path: {name}')
        if not isinstance(row['bytes'], int) or row['bytes'] <= 0:
            raise ValueError(f'Invalid byte count: {name}')
        if not re.fullmatch(r'[0-9a-f]{64}', row['sha256']):
            raise ValueError(f'Invalid SHA-256: {name}')
        seen.add(name)
    return manifest, hashlib.sha256(raw).hexdigest()


def verify(base: str, row: dict, timeout: float) -> dict:
    url = base.rstrip('/') + '/' + quote(row['path'], safe='/')
    result = {'path': row['path'], 'url': url, 'expectedBytes': row['bytes'],
              'expectedSha256': row['sha256'], 'actualBytes': 0, 'actualSha256': None,
              'httpStatus': None, 'ok': False}
    start = time.monotonic()
    try:
        request = Request(url, method='GET', headers={
            'Accept-Encoding': 'identity', 'User-Agent': 'SeventhGun-ExperimentalAssetVerifier/1.0',
        })
        digest = hashlib.sha256()
        with urlopen(request, timeout=timeout) as response:
            result['httpStatus'] = response.status
            result['contentType'] = response.headers.get('Content-Type')
            result['finalUrl'] = response.geturl()
            for chunk in iter(lambda: response.read(256 * 1024), b''):
                digest.update(chunk)
                result['actualBytes'] += len(chunk)
        result['actualSha256'] = digest.hexdigest()
        errors = []
        if result['httpStatus'] != 200:
            errors.append(f"HTTP {result['httpStatus']}")
        if result['actualBytes'] != row['bytes']:
            errors.append(f"byte count {result['actualBytes']} != {row['bytes']}")
        if result['actualSha256'] != row['sha256']:
            errors.append('SHA-256 mismatch')
        result['ok'] = not errors
        if errors:
            result['error'] = '; '.join(errors)
    except HTTPError as error:
        result['httpStatus'] = error.code
        result['error'] = f'HTTP {error.code}: {error.reason}'
        error.close()
    except Exception as error:
        result['error'] = f'{type(error).__name__}: {error}'
    result['elapsedSeconds'] = round(time.monotonic() - start, 3)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('report', type=Path, help='JSON report destination; asset data is not saved')
    parser.add_argument('--url', default=DEFAULT_URL, help=f'Site root (default: {DEFAULT_URL})')
    parser.add_argument('--manifest', type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument('--timeout', type=float, default=45, help='Per-request timeout in seconds (default: 45)')
    args = parser.parse_args()
    parsed = urlsplit(args.url)
    if parsed.scheme not in ('http', 'https') or not parsed.netloc or parsed.query or parsed.fragment:
        parser.error('--url must be an HTTP(S) site root without query or fragment')
    if args.timeout <= 0:
        parser.error('--timeout must be positive')
    if args.report.resolve() == args.manifest.resolve():
        parser.error('The report destination must not overwrite the manifest')
    try:
        manifest, manifest_hash = read_manifest(args.manifest)
    except (OSError, ValueError, KeyError, TypeError) as error:
        parser.error(f'Invalid manifest: {error}')

    started = datetime.now(timezone.utc).isoformat()
    timer = time.monotonic()
    with ThreadPoolExecutor(max_workers=6) as pool:
        files = list(pool.map(lambda row: verify(args.url, row, args.timeout), manifest['files']))
    failed = sum(not row['ok'] for row in files)
    report = {
        'baseUrl': args.url.rstrip('/'), 'startedAt': started,
        'completedAt': datetime.now(timezone.utc).isoformat(),
        'elapsedSeconds': round(time.monotonic() - timer, 3),
        'manifest': str(args.manifest.resolve()), 'manifestSha256': manifest_hash,
        'workers': 6, 'fileCount': len(files), 'matched': len(files) - failed, 'failed': failed,
        'expectedBytes': manifest['bytes'], 'receivedBytes': sum(row['actualBytes'] for row in files),
        'ok': failed == 0, 'files': files,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({key: report[key] for key in ['baseUrl', 'fileCount', 'matched', 'failed',
                                                 'receivedBytes', 'elapsedSeconds', 'ok']}
                     | {'report': str(args.report.resolve())}))
    for row in files:
        if not row['ok']:
            print(f"FAIL {row['path']}: {row['error']}", file=sys.stderr)
    return 1 if failed else 0


if __name__ == '__main__':
    raise SystemExit(main())
