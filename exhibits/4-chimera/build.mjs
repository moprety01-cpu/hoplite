// Exhibit V: builds kunstkamera.png — a single file that is a PNG image, an HTML page and a ZIP archive.
//
//   PNG  reads the file from the start: signature, IHDR, ..., IEND. Unknown ancillary chunks are skipped.
//   HTML is stored in a private ancillary chunk "htMl" right after IHDR. A browser shows it if the file is
//        renamed to .html: the few binary bytes before it are hidden by CSS, everything after it is
//        swallowed by a hidden <plaintext> element.
//   ZIP  reads the file from the end: the archive (the whole museum) is appended after IEND, with
//        offsets counted from the start of the file, so unzip sees a perfectly normal archive.
//
// Usage: node exhibits/4-chimera/build.mjs   (needs google-chrome to draw the poster; without it the
//        picture of the current kunstkamera.png is reused and only the page and the archive are rebuilt)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { readPng, readZip, PNG_SIGNATURE } from './verify.mjs';

const here = new URL('./', import.meta.url);
const root = new URL('../../', import.meta.url);
const TARGET = 'exhibits/4-chimera/kunstkamera.png';
const target = new URL(TARGET, root);

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const chunk = (type, data) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([head.subarray(4), data])));
  return Buffer.concat([head, data, crc]);
};

// 1. The picture: a poster with the globe from exhibit II, drawn by headless Chrome.
function poster() {
  const globe = fs.readFileSync(new URL('exhibits/1-globe/globe.js', root), 'utf8').trimEnd()
    .split('\n').map((line) => esc(line)
      .replace(/█+/g, (m) => `<b>${' '.repeat(m.length)}</b>`)
      .replace(/[А-Яа-яЁё·]+(?:[-·][А-Яа-яЁё·]+)*/g, (m) => `<i>${m}</i>`))
    .join('\n');
  const html = fs.readFileSync(new URL('poster.html', here), 'utf8').replace('%GLOBE%', globe);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chimera-'));
  fs.writeFileSync(path.join(dir, 'poster.html'), html);
  const sandbox = process.getuid?.() === 0 ? ['--no-sandbox'] : []; // Chrome refuses to run as root otherwise
  execFileSync('google-chrome', ['--headless=new', ...sandbox, '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--window-size=1200,1600', `--screenshot=${dir}/poster.png`, `file://${dir}/poster.html`], { stdio: 'ignore' });
  return fs.readFileSync(path.join(dir, 'poster.png'));
}
function picture() {
  try { return poster(); } catch (e) {
    if (!fs.existsSync(target)) throw e;
    console.warn('google-chrome unavailable, reusing the picture of the current file');
    const old = fs.readFileSync(target);
    const { chunks } = readPng(old);
    return Buffer.concat([PNG_SIGNATURE, ...chunks.filter((c) => c.type !== 'htMl').map((c) => old.subarray(c.start, c.end))]);
  }
}

// 2. The archive: every file of the repository (tracked or new, respecting .gitignore) except this one.
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' })
  .split('\0').filter((f) => f && f !== TARGET && fs.existsSync(new URL(f, root))).sort();
const DOS_TIME = 12 << 11, DOS_DATE = ((2026 - 1980) << 9) | (11 << 5) | 9; // 2026-11-09 12:00, fixed => reproducible
function zip(base) {
  const local = [], central = [];
  let offset = 0;
  for (const name of files) {
    const data = fs.readFileSync(new URL(name, root));
    const packed = zlib.deflateRawSync(data, { level: 9 });
    const deflate = packed.length < data.length;
    const body = deflate ? packed : data;
    const fname = Buffer.from('kunstkamera/' + name, 'utf8');
    const crc = zlib.crc32(data);
    const fields = (sig, extra) => {
      const b = Buffer.alloc(extra ? 46 : 30);
      let p = 0;
      const u32 = (v) => { b.writeUInt32LE(v >>> 0, p); p += 4; };
      const u16 = (v) => { b.writeUInt16LE(v, p); p += 2; };
      u32(sig);
      if (extra) u16(0x0314);                  // made by: Unix, spec 2.0
      u16(20); u16(0x0800); u16(deflate ? 8 : 0); u16(DOS_TIME); u16(DOS_DATE);
      u32(crc); u32(body.length); u32(data.length); u16(fname.length); u16(0);
      if (extra) { u16(0); u16(0); u16(0); u32(0o100644 << 16); u32(base + offset); }
      return b;
    };
    local.push(fields(0x04034b50, false), fname, body);
    central.push(fields(0x02014b50, true), fname);
    offset += 30 + fname.length + body.length;
  }
  const cd = Buffer.concat(central);
  const comment = Buffer.from('This archive is also a PNG picture and a web page. Kunstkamera of the Impossible.');
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(base + offset, 16);
  end.writeUInt16LE(comment.length, 20);
  return Buffer.concat([...local, cd, end, comment]);
}

// 3. The page, assembled into the PNG right after IHDR.
const list = files.map((f) => `<li>${esc(f)}</li>`).join('');
const page = fs.readFileSync(new URL('page.html', here), 'utf8')
  .replace('%COUNT%', String(files.length)).replace('%FILES%', list).trimEnd() + '<plaintext>';
const png = picture();
const { chunks } = readPng(png);
if (chunks[0].type !== 'IHDR') throw new Error('IHDR must come first');
const parts = [PNG_SIGNATURE, png.subarray(chunks[0].start, chunks[0].end), chunk('htMl', Buffer.from(page, 'utf8'))];
for (const c of chunks.slice(1)) if (c.type !== 'htMl') parts.push(png.subarray(c.start, c.end));
const image = Buffer.concat(parts);
const before = image.subarray(0, PNG_SIGNATURE.length + 25 + 8);
if (before.includes(0x3c) || before.includes(0x26)) throw new Error('binary prefix contains "<" or "&"; change the poster size by a pixel');
const result = Buffer.concat([image, zip(image.length)]);
fs.writeFileSync(target, result);
readZip(result); // sanity: parses and checks every CRC
console.log(`${TARGET}: ${result.length} bytes = PNG ${image.length} (page ${page.length} chars) + ZIP of ${files.length} files`);
