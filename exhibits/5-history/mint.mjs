#!/usr/bin/env node
// Creates a git commit whose hash starts with a chosen prefix (by default the next number in the
// sequence 0000000, 0000001, ...), using mint.c to search for an invisible whitespace nonce.
//
//   git add ... && node exhibits/5-history/mint.mjs --subject "Title" [--body-file f] [--trailer "K: v"] [--prefix 0000042]
//
// The staged index becomes the commit's tree; HEAD (or the unborn branch) is moved to the new commit.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const all = (name) => args.flatMap((a, i) => (a === name ? [args[i + 1]] : []));
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const NONCE = '\x01'.repeat(32);

// 1. The miner, compiled once into the temp directory.
const src = new URL('mint.c', import.meta.url);
const bin = path.join(os.tmpdir(), 'kunstkamera-mint');
if (!fs.existsSync(bin) || fs.statSync(bin).mtimeMs < fs.statSync(src).mtimeMs) {
  execFileSync('cc', ['-O3', '-pthread', '-o', bin, src.pathname, '-lcrypto'], { stdio: 'inherit' });
}

// 2. The commit object, with a placeholder where the nonce goes (end of the last message line).
let parent = null;
try { parent = git('rev-parse', '--verify', '-q', 'HEAD'); } catch { /* unborn branch: root commit */ }
const depth = parent ? Number(git('rev-list', '--count', '--first-parent', 'HEAD')) : 0;
const prefix = opt('--prefix', String(depth).padStart(7, '0'));
const subject = opt('--subject');
if (!subject) throw new Error('--subject is required');
const bodyFile = opt('--body-file');
const body = bodyFile ? fs.readFileSync(bodyFile, 'utf8').trim() : '';
const trailers = all('--trailer');
const who = `${git('config', 'user.name')} <${git('config', 'user.email')}>`;
const when = `${opt('--time', Math.floor(Date.now() / 1000))} +0000`;
const message = subject + (body ? `\n\n${body}` : '') + NONCE + (trailers.length ? `\n\n${trailers.join('\n')}` : '') + '\n';
const object =
  `tree ${git('write-tree')}\n` + (parent ? `parent ${parent}\n` : '') +
  `author ${who} ${when}\ncommitter ${who} ${when}\n\n${message}`;

// 3. Search, store, verify, move the branch.
const tmp = path.join(os.tmpdir(), `kunstkamera-object-${process.pid}`);
fs.writeFileSync(tmp, object);
const run = spawnSync(bin, [prefix, tmp, String(opt('--threads', os.availableParallelism()))], { maxBuffer: 1 << 24 });
fs.unlinkSync(tmp);
if (run.status !== 0) throw new Error(`miner failed: ${run.stderr}`);
const filled = run.stdout;
const stats = JSON.parse(run.stderr.toString());
const sha = execFileSync('git', ['hash-object', '-t', 'commit', '-w', '--stdin'], { input: filled, encoding: 'utf8' }).trim();
if (!sha.startsWith(prefix)) throw new Error(`miner returned ${sha}, expected prefix ${prefix}`);
git('update-ref', '-m', `mint: ${subject}`, 'HEAD', sha, ...(parent ? [parent] : []));
const nonce = filled.toString('latin1').match(/[ \t]{32}(?=\n)/)[0];
console.log(`${sha}  ${subject}`);
console.log(`  nonce ${[...nonce].map((ch) => (ch === ' ' ? '·' : '→')).join('')}  ` +
  `${(stats.attempts / 1e6).toFixed(0)}M attempts, ${stats.seconds.toFixed(1)} s, ${(stats.rate / 1e6).toFixed(1)}M/s`);
