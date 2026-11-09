// Checks exhibit V: kunstkamera.png is a valid PNG, a web page and a valid ZIP archive at the same time.
// Usage: node exhibits/4-chimera/verify.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';

const plural = (n, one, few, many) =>
  `${n} ${n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many}`;

export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function readPng(buf) {
  if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('нет сигнатуры PNG');
  const chunks = [];
  for (let p = 8; ;) {
    const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (zlib.crc32(buf.subarray(p + 4, p + 8 + len)) !== buf.readUInt32BE(p + 8 + len)) throw new Error(`битая контрольная сумма чанка ${type}`);
    chunks.push({ type, data, start: p, end: p + 12 + len });
    p += 12 + len;
    if (type === 'IEND') return { chunks, end: p };
  }
}

export function readZip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('нет конца ZIP-каталога');
  const count = buf.readUInt16LE(eocd + 10), cdOffset = buf.readUInt32LE(eocd + 16);
  const comment = buf.toString('utf8', eocd + 22, eocd + 22 + buf.readUInt16LE(eocd + 20));
  const entries = [];
  for (let i = 0, p = cdOffset; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('битый центральный каталог');
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20), size = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const at = buf.readUInt32LE(p + 42), name = buf.toString('utf8', p + 46, p + 46 + nlen);
    if (buf.readUInt32LE(at) !== 0x04034b50) throw new Error(`${name}: локальный заголовок не на месте`);
    const start = at + 30 + buf.readUInt16LE(at + 26) + buf.readUInt16LE(at + 28);
    const raw = buf.subarray(start, start + csize);
    const data = method === 8 ? zlib.inflateRawSync(raw) : raw;
    if (data.length !== size || zlib.crc32(data) !== crc) throw new Error(`${name}: CRC не сходится`);
    entries.push({ name, size, data });
    p += 46 + nlen + xlen + clen;
  }
  return { entries, comment };
}

export async function verify() {
  const file = new URL('kunstkamera.png', import.meta.url);
  const buf = fs.readFileSync(file);
  const lines = [];
  let ok = true;
  const check = (cond, yes, no) => { lines.push(cond ? `✓ ${yes}` : `✗ ${no}`); ok &&= !!cond; };
  try {
    const { chunks, end } = readPng(buf);
    const ihdr = chunks[0].data;
    check(chunks[0].type === 'IHDR' && chunks.some((c) => c.type === 'IDAT'),
      `PNG: картинка ${ihdr.readUInt32BE(0)}×${ihdr.readUInt32BE(4)}, ${plural(chunks.length, 'чанк', 'чанка', 'чанков')}, все контрольные суммы верны`, 'PNG повреждён');
    const html = chunks.find((c) => c.type === 'htMl');
    const page = html && html.data.toString('utf8');
    check(page && /^<html/.test(page) && page.endsWith('<plaintext>') && !buf.subarray(0, html.start + 8).includes(0x3c),
      `HTML: страница (${plural(page.length, 'символ', 'символа', 'символов')}) спрятана в чанке htMl сразу после заголовка`, 'HTML-страница не найдена');
    const { entries, comment } = readZip(buf);
    const zipStart = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]), end);
    check(entries.length > 0 && zipStart === end,
      `ZIP: архив начинается сразу после конца картинки; ${plural(entries.length, 'файл', 'файла', 'файлов')}, все CRC32 сходятся`, 'ZIP повреждён');
    lines.push(`  комментарий архива: «${comment}»`);
    try {
      const repo = new URL('../../', import.meta.url);
      const current = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: repo, encoding: 'utf8' })
        .split('\0').filter((f) => f && f !== 'exhibits/4-chimera/kunstkamera.png' && fs.existsSync(new URL(f, repo)));
      const packed = new Map(entries.map((e) => [e.name.replace(/^kunstkamera\//, ''), e.data]));
      const changed = current.filter((f) => !packed.has(f) || !packed.get(f).equals(fs.readFileSync(new URL(f, repo))));
      lines.push(changed.length === 0 && packed.size === current.length
        ? '  архив совпадает с текущими файлами репозитория'
        : `  (архив снят с более ранней версии музея: отличий — ${plural(changed.length + Math.max(0, packed.size - current.length), 'файл', 'файла', 'файлов')})`);
    } catch { /* not a git checkout: skip the comparison */ }
  } catch (e) {
    check(false, '', e.message);
  }
  return { ok, lines };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { ok, lines } = await verify();
  console.log('Экспонат IV · Картинка, которая на самом деле архив\n' + lines.map((l) => '  ' + l).join('\n'));
  process.exit(ok ? 0 : 1);
}
