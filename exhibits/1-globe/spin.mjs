#!/usr/bin/env node
// Spins globe.js in the terminal. Nothing is precomputed: every frame on screen is literally what the
// previous frame printed when it was run by node. Ctrl+C to stop.
// Usage: node exhibits/1-globe/spin.mjs [file]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { hourOf } from './verify.mjs';

const first = fs.readFileSync(process.argv[2] || new URL('globe.js', import.meta.url), 'utf8');
const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (text) => !tty ? text : text
  .replace(/[^\s█А-Яа-яЁё·]+/g, (m) => `\x1b[38;5;75m${m}`)
  .replace(/█+/g, (m) => `\x1b[38;5;108m${m}`)
  .replace(/[А-Яа-яЁё·-]{2,}/g, (m) => `\x1b[38;5;221m${m}`) + '\x1b[0m';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

process.on('SIGINT', () => { process.stdout.write('\x1b[0m\x1b[?25h\n'); process.exit(0); });
if (tty) process.stdout.write('\x1b[?25l');
let text = first;
for (let run = 0; ; run++) {
  const h = hourOf(text);
  const note = run > 0 && text === first ? '  ✓ цикл замкнулся: файл совпал с исходным байт в байт' : '';
  process.stdout.write((tty ? '\x1b[H\x1b[2J' : '\n') + paint(text) + `\n  ${String(h).padStart(2, '0')}:00 · запуск №${run}${note}\n`);
  const r = spawnSync(process.execPath, ['-'], { input: text, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  text = r.stdout;
  await sleep(note ? 1500 : 120);
}
