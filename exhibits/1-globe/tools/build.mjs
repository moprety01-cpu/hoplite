// Builds globe.js from globe.src.js + land-120x60.txt and proves the 24-hour cycle.
// Usage: node exhibits/1-globe/tools/build.mjs [--out path]
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

const tools = new URL('./', import.meta.url);
const outArg = process.argv.indexOf('--out');
const out = outArg > 0 ? new URL(process.argv[outArg + 1], `file://${process.cwd()}/`) : new URL('../globe.js', import.meta.url);
const LAND = process.env.LAND || '█'; // land is drawn with this character; it is stripped before eval

// 1. World map -> run-length string. Runs alternate sea/land; one char per run (43..91 = "+".."["),
//    longer runs are split with a zero-length run of the other kind. The alphabet has no "*",
//    so "/*" and "*/" can never appear inside the map.
const rows = fs.readFileSync(new URL('land-120x60.txt', tools), 'utf8').trim().split('\n');
const bits = [...rows.join('')].map((ch) => (ch === '#' ? 1 : 0));
const runs = [];
let cur = 0, len = 0;
for (const b of bits) {
  if (b === cur) len++;
  else { runs.push(len); cur = b; len = 1; }
}
runs.push(len);
let map = '';
for (let r of runs) {
  for (; r > 48; r -= 48) map += String.fromCharCode(43 + 48, 43);
  map += String.fromCharCode(43 + r);
}

// 2. Readable source -> whitespace-free code.
const code = fs.readFileSync(new URL('globe.src.js', tools), 'utf8')
  .split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('')
  .replace(/\s/g, '')
  .split('%MAP%').join(map)
  .split('LANDCODE').join(String(LAND.codePointAt(0)));
for (const bad of ['`', '\\', '${', '/*', '*/', LAND]) {
  if (code.includes(bad)) throw new Error(`code contains forbidden ${JSON.stringify(bad)}`);
}

// 3. Run a program the way node would, capturing what it prints.
const run = (text) => {
  let printed = null;
  vm.runInNewContext(text, { console: { log: (s) => { printed = s; } } });
  if (typeof printed !== 'string') throw new Error('program printed nothing');
  return printed + '\n';
};
const strip = (text) => text.slice(text.indexOf('`') + 1, text.lastIndexOf('`')).replace(/\s/g, '').split(LAND).join('');

// A crude seed showing hour 23; one run turns it into the real hour-0 globe.
const seed = 'eval(c=`' + code + '/**/`.replace(/[\\s' + LAND + ']/g,\'\'))';
const frames = [run(seed)];
for (let h = 1; h <= 24; h++) frames.push(run(frames[h - 1]));

// 4. Proofs.
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);
if (frames[24] !== frames[0]) throw new Error('the 24-hour cycle does not close');
const stats = frames.slice(0, 24).map((f, h) => {
  const body = strip(f);
  const own = body.slice(0, body.indexOf('/*'));
  if (own !== code.replace(/^A=\d+/, 'A=' + h)) throw new Error(`hour ${h}: code mismatch`);
  const lines = f.split('\n');
  return { h, sha: sha(f), lines: lines.length - 1, width: Math.max(...lines.map((l) => [...l].length)), ocean: body.length, padding: body.length - own.length - 4 };
});
fs.writeFileSync(out, frames[0]);
console.log(`code: ${code.length} chars (map ${map.length}); padding min ${Math.min(...stats.map((s) => s.padding))}, max ${Math.max(...stats.map((s) => s.padding))}`);
if (process.env.TABLE) console.table(stats);
console.log('cycle closes: frame 24 === frame 0; wrote', out.pathname);
