#!/usr/bin/env node
// Кунсткамера невозможного: checks all five exhibits. No dependencies, Node.js 22+.
// Usage: node verify.mjs
import * as globe from './exhibits/1-globe/verify.mjs';
import * as prime from './exhibits/2-prime/verify.mjs';
import * as autogram from './exhibits/3-autogram/verify.mjs';
import * as chimera from './exhibits/4-chimera/verify.mjs';
import * as history from './exhibits/5-history/verify.mjs';

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (line) => !tty ? line : line
  .replace(/^(\s*)✓/, '$1\x1b[32m✓\x1b[0m')
  .replace(/^(\s*)✗/, '$1\x1b[31m✗\x1b[0m');
const gold = (s) => (tty ? `\x1b[33m${s}\x1b[0m` : s);

const exhibits = [
  ['I', 'Глобус, который печатает сам себя', () => globe.verify()],
  ['II', 'Простое число, которое говорит', async () => {
    const r = await prime.verify();
    return { ok: r.ok, lines: r.lines.filter((l) => l && !l.startsWith('Экспонат')) };
  }],
  ['III', 'Предложение, которое пересчитало себя', async () => {
    const r = await autogram.verify();
    const good = r.rows.filter((row) => row.ok).length;
    const pairs = r.rows.map((row) => `${row.letter}${row.actual}`).join(' ');
    return {
      ok: r.ok,
      lines: [`${r.ok ? '✓' : '✗'} верных утверждений: ${good} из 33, всего букв: ${r.totalLetters}`, `    ${pairs}`, ...r.errors.map((e) => `✗ ${e}`)],
    };
  }],
  ['IV', 'Картинка, которая на самом деле архив', () => chimera.verify()],
  ['V', 'История, которой не может быть', () => history.verify()],
];

console.log(gold('КУНСТКАМЕРА НЕВОЗМОЖНОГО') + ' · проверка всех экспонатов\n');
let passed = 0;
for (const [no, title, check] of exhibits) {
  const t0 = performance.now();
  let result;
  try { result = await check(); } catch (e) { result = { ok: false, lines: [`✗ ${e.message}`] }; }
  passed += result.ok;
  console.log(`${gold(no.padStart(3))} · ${title}  (${Math.round(performance.now() - t0)} мс)`);
  for (const line of result.lines) console.log(paint('      ' + line));
  console.log();
}
console.log(passed === exhibits.length
  ? `Все ${exhibits.length} экспонатов на месте: невозможное подтверждено.`
  : `Не прошли проверку: ${exhibits.length - passed} из ${exhibits.length}.`);
process.exit(passed === exhibits.length ? 0 : 1);
