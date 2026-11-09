// Checks exhibit II: globe.js prints the next hour of itself, and 24 runs later it is itself again.
// Usage: node exhibits/1-globe/verify.mjs
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const hourOf = (text) => Number(text.slice(text.indexOf('`') + 1).replace(/[\s█]/g, '').match(/^A=(\d+);/)[1]);

export async function verify() {
  const original = fs.readFileSync(new URL('globe.js', import.meta.url), 'utf8');
  const lines = [];
  const seen = new Set([sha(original)]);
  let text = original;
  for (let run = 1; run <= 24; run++) {
    // Exactly what `node globe.js` does: the program reads nothing and only prints.
    const r = spawnSync(process.execPath, ['-'], { input: text, encoding: 'utf8' });
    if (r.status !== 0 || !r.stdout) return { ok: false, lines: [...lines, `✗ запуск №${run} упал: ${r.stderr.trim()}`] };
    const rows = r.stdout.trimEnd().split('\n');
    if (rows.length !== 40 || rows.some((row) => [...row].length > 88) || !r.stdout.startsWith('eval(c=`')) {
      return { ok: false, lines: [...lines, `✗ запуск №${run}: вывод не похож на глобус 88×40`] };
    }
    if (hourOf(r.stdout) !== (hourOf(text) + 1) % 24) return { ok: false, lines: [...lines, `✗ запуск №${run}: час не сдвинулся`] };
    text = r.stdout;
    if (run < 24) seen.add(sha(text));
  }
  lines.push(`✓ 24 запуска подряд: каждый вывод — работающая программа, сдвинутая на 1 час (все ${seen.size} кадра различны)`);
  const ok = text === original;
  lines.push(ok
    ? `✓ 24-й вывод совпал с globe.js байт в байт (sha256 ${sha(original).slice(0, 16)}…)`
    : '✗ 24-й вывод отличается от globe.js');
  return { ok: ok && seen.size === 24, lines };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { ok, lines } = await verify();
  console.log('Экспонат I · Глобус, который печатает сам себя\n' + lines.map((l) => '  ' + l).join('\n'));
  process.exit(ok ? 0 : 1);
}
