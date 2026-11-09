// Checks exhibit V: the commits of this repository are numbered 0000000, 0000001, ... by their own SHA-1.
// Every hash is recomputed here from the raw commit object, so nothing is taken on git's word.
// Usage: node exhibits/5-history/verify.mjs
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const repo = new URL('../../', import.meta.url);
const git = (...args) => execFileSync('git', args, { cwd: repo, maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] });

export async function verify() {
  let shas;
  try {
    shas = git('rev-list', '--reverse', '--topo-order', '--no-merges', 'HEAD').toString().trim().split('\n');
  } catch {
    return { ok: false, lines: ['✗ здесь нет git-истории: скачайте музей через git clone, а не архивом'] };
  }
  const lines = [];
  if (git('rev-parse', '--is-shallow-repository').toString().trim() === 'true') {
    lines.push('! история обрезана (shallow clone) — выполните git fetch --unshallow');
  }
  let run = 0;
  for (const sha of shas) {
    const body = git('cat-file', 'commit', sha);
    const real = crypto.createHash('sha1').update(`commit ${body.length}\0`).update(body).digest('hex');
    if (real !== sha) return { ok: false, lines: [...lines, `✗ ${sha}: SHA-1 не сходится с содержимым`] };
    const want = String(run).padStart(7, '0');
    if (!sha.startsWith(want)) break;
    const subject = body.toString().split('\n\n')[1].split('\n')[0].trim();
    const nonce = body.toString('latin1').match(/[ \t]{32}(?=\n)/)?.[0] ?? '';
    lines.push(`✓ ${sha.slice(0, 7)}${sha.slice(7, 12)}…  ${subject}`);
    if (nonce) lines.push(`    невидимый хвост: ${[...nonce].map((c) => (c === ' ' ? '·' : '→')).join('')}`);
    run++;
  }
  const rest = shas.length - run;
  lines.push(run >= 2
    ? `✓ ${run} коммитов подряд пронумерованы собственными хешами; SHA-1 каждого пересчитан заново.`
    : '✗ последовательность 0000000, 0000001, … не найдена');
  lines.push(`  шанс получить такую цепочку случайно: 1 к 2^${28 * run} (каждый номер — 1 к 268 435 456)`);
  if (rest > 0) lines.push(`  после неё ещё ${rest} обычных коммитов — их хеши никто не подбирал`);
  return { ok: run >= 2, lines };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { ok, lines } = await verify();
  console.log('Экспонат V · История, которой не может быть\n' + lines.map((l) => '  ' + l).join('\n'));
  process.exit(ok ? 0 : 1);
}
