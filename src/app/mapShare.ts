// Browser share helpers: deflate-raw, hash URLs, clipboard. Not in src/sim/.
import { stripCosmetics, type MapBlueprint } from '../sim/blueprint';
import {
  COMPRESS_AFTER, FLAG_COMPRESSED, decodeBlueprint, encodeBlueprint,
  packBlueprint, unpackBlueprint, unwrapEncoded, wrapEncoded,
} from '../sim/mapcodec';

export const SHARE_PREFIX = 'SGMAP.v1.';

async function streamTransform(
  Ctor: typeof CompressionStream | typeof DecompressionStream,
  format: CompressionFormat,
  data: Uint8Array,
): Promise<Uint8Array> {
  const stream = new Ctor(format);
  const writer = stream.writable.getWriter();
  await writer.write(data);
  await writer.close();
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  let len = 0;
  for (const c of chunks) len += c.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') return data;
  return streamTransform(CompressionStream, 'deflate-raw', data);
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('DecompressionStream is not available');
  }
  return streamTransform(DecompressionStream, 'deflate-raw', data);
}

export function parseMapHash(hash: string): string | null {
  if (!hash.startsWith('#m=')) return null;
  let code = hash.slice(3);
  try { code = decodeURIComponent(code); } catch { /* keep raw */ }
  code = code.trim();
  return code.startsWith(SHARE_PREFIX) ? code : null;
}

export function shareUrlFromCode(code: string, origin?: string): string {
  const base = origin ?? (typeof location !== 'undefined' ? location.origin : '');
  return `${base}/#m=${code}`;
}

export function encodeShareCodeSync(bp: MapBlueprint): string {
  return encodeBlueprint(stripCosmetics(bp));
}

export async function encodeShareCode(bp: MapBlueprint): Promise<string> {
  const stripped = stripCosmetics(bp);
  const { flags, body } = packBlueprint(stripped);
  let outFlags = flags;
  let outBody = body;
  if (body.length > COMPRESS_AFTER && typeof CompressionStream !== 'undefined') {
    const compressed = await deflateRaw(body);
    outBody = compressed;
    outFlags |= FLAG_COMPRESSED;
  }
  return wrapEncoded(outFlags, outBody);
}

export async function decodeShareCode(code: string): Promise<MapBlueprint> {
  const { flags, body } = unwrapEncoded(code);
  let raw = body;
  if (flags & FLAG_COMPRESSED) {
    raw = await inflateRaw(body);
  }
  return unpackBlueprint(flags, raw);
}

export function decodeShareCodeSync(code: string): MapBlueprint {
  return decodeBlueprint(code);
}

export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch { /* fall through */ }
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
