#!/usr/bin/env node
/**
 * verify.mjs — независимая проверка русской панграмматической автограммы.
 *
 *   node verify.mjs   читает autogram.txt рядом с этим файлом и печатает отчёт;
 *                     код выхода 0 — все 33 утверждения верны, 1 — нет.
 *
 * Без зависимостей. parseClaims, countLetters, verifyText, parseNumeral, nounForm
 * и formatReport — чистые функции без Node API, работают и в браузере.
 */

export const ALPHABET = Object.freeze([...'абвгдеёжзийклмнопрстуфхцчшщъыьэюя']);

const HUNDREDS = new Map([['сто', 100]]);
const TENS = new Map([
  ['двадцать', 20], ['тридцать', 30], ['сорок', 40], ['пятьдесят', 50],
  ['шестьдесят', 60], ['семьдесят', 70], ['восемьдесят', 80], ['девяносто', 90],
]);
const TEENS = new Map([
  ['десять', 10], ['одиннадцать', 11], ['двенадцать', 12], ['тринадцать', 13], ['четырнадцать', 14],
  ['пятнадцать', 15], ['шестнадцать', 16], ['семнадцать', 17], ['восемнадцать', 18], ['девятнадцать', 19],
]);
// Только женский род: «одна/одну», «две».
const UNITS = new Map([
  ['одна', 1], ['одну', 1], ['две', 2], ['три', 3], ['четыре', 4],
  ['пять', 5], ['шесть', 6], ['семь', 7], ['восемь', 8], ['девять', 9],
]);
const NOUNS = ['буква', 'буквы', 'букву', 'букв'];

const NUM_WORD = [...HUNDREDS.keys(), ...TENS.keys(), ...TEENS.keys(), ...UNITS.keys()].join('|');
// \b в JS не понимает кириллицу, поэтому левая граница — через lookbehind.
const CLAIM_RE = new RegExp(
  `(?<![а-яё])((?:(?:${NUM_WORD})\\s+)+)(${NOUNS.join('|')})\\s+«([^»]*)»`,
  'giu',
);

/**
 * Числительное женского рода (1–199) → { value, grammaticalCase } или null.
 * grammaticalCase: 'nom' для «одна», 'acc' для «одну», иначе null (формы совпадают).
 */
export function parseNumeral(words) {
  const w = words.map((s) => s.toLowerCase());
  let i = 0;
  let value = 0;
  let grammaticalCase = null;
  if (HUNDREDS.has(w[i])) value += HUNDREDS.get(w[i++]);
  if (TEENS.has(w[i])) {
    value += TEENS.get(w[i++]);
  } else {
    if (TENS.has(w[i])) value += TENS.get(w[i++]);
    if (UNITS.has(w[i])) {
      if (w[i] === 'одна') grammaticalCase = 'nom';
      if (w[i] === 'одну') grammaticalCase = 'acc';
      value += UNITS.get(w[i++]);
    }
  }
  return i === w.length && value > 0 ? { value, grammaticalCase } : null;
}

/** Правильная форма слова «буква» после числа n: буква/букву, буквы, букв. */
export function nounForm(n, grammaticalCase = 'nom') {
  const d = n % 10;
  const h = n % 100;
  if (d === 1 && h !== 11) return grammaticalCase === 'acc' ? 'букву' : 'буква';
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return 'буквы';
  return 'букв';
}

/** Все утверждения вида «<числительное> <буква|буквы|букв|букву> «x»» в порядке появления. */
export function parseClaims(text) {
  const claims = [];
  for (const m of text.matchAll(CLAIM_RE)) {
    const words = m[1].trim().split(/\s+/);
    const parsed = parseNumeral(words);
    claims.push({
      letter: m[3],
      number: parsed ? parsed.value : NaN,
      phrase: m[0],
      index: m.index,
      words,
      noun: m[2].toLowerCase(),
      grammaticalCase: parsed ? parsed.grammaticalCase : null,
    });
  }
  return claims;
}

/** Число вхождений каждой из 33 букв, без учёта регистра; «е» и «ё» — разные буквы. */
export function countLetters(text) {
  const counts = Object.fromEntries(ALPHABET.map((l) => [l, 0]));
  for (const ch of text.toLowerCase()) {
    if (Object.hasOwn(counts, ch)) counts[ch] += 1;
  }
  return counts;
}

/** Полная проверка: { ok, rows, errors, claims, counts, totalLetters }. */
export function verifyText(text) {
  const claims = parseClaims(text);
  const counts = countLetters(text);
  const errors = [];

  if (/\d/.test(text)) errors.push('В тексте есть цифры: все числа должны быть записаны словами.');
  if (/[a-z]/i.test(text)) errors.push('В тексте есть латинские буквы.');

  for (const q of text.matchAll(/«[^»]*»/g)) {
    const covered = claims.some((c) => q.index >= c.index && q.index < c.index + c.phrase.length);
    if (!covered) errors.push(`Не удалось разобрать утверждение перед ${q[0]} (позиция ${q.index}).`);
  }

  const cases = new Set();
  for (const c of claims) {
    if (!ALPHABET.includes(c.letter)) {
      errors.push(`В кавычках должна стоять одна строчная русская буква: «${c.phrase}».`);
    }
    if (!Number.isInteger(c.number)) {
      errors.push(`Неправильное числительное «${c.words.join(' ')}» в «${c.phrase}».`);
      continue;
    }
    if (c.grammaticalCase) cases.add(c.grammaticalCase);
    const expected = nounForm(c.number, c.grammaticalCase ?? 'nom');
    if (c.noun !== expected) {
      errors.push(`Несогласованная форма: «${c.words.join(' ')} ${c.noun}» — нужно «${expected}».`);
    }
  }
  if (cases.size > 1) errors.push('Смешаны падежи: «одна буква» и «одну букву» в одном предложении.');

  let prev = -1;
  for (const c of claims) {
    const pos = ALPHABET.indexOf(c.letter);
    if (pos !== -1 && pos <= prev) {
      errors.push(`Нарушен алфавитный порядок или повтор: «${c.letter}» после «${ALPHABET[prev]}».`);
    }
    prev = Math.max(prev, pos);
  }
  for (const letter of ALPHABET) {
    if (!claims.some((c) => c.letter === letter)) errors.push(`Нет утверждения о букве «${letter}».`);
  }

  const rows = ALPHABET.map((letter) => {
    const c = claims.find((x) => x.letter === letter);
    const claimed = c ? c.number : null;
    const formOk = Boolean(c) && Number.isInteger(c.number) &&
      c.noun === nounForm(c.number, c.grammaticalCase ?? 'nom');
    return {
      letter,
      claimed,
      actual: counts[letter],
      ok: claimed === counts[letter] && formOk,
      formOk,
      phrase: c ? c.phrase : null,
      index: c ? c.index : -1,
    };
  });

  const totalLetters = Object.values(counts).reduce((a, b) => a + b, 0);
  const ok = errors.length === 0 && rows.every((r) => r.ok);
  return { ok, rows, errors, claims, counts, totalLetters };
}

const center = (s, w) => {
  const str = String(s);
  const left = Math.floor((w - str.length) / 2);
  return ' '.repeat(Math.max(0, left)) + str + ' '.repeat(Math.max(0, w - str.length - left));
};

/** Текстовый отчёт на русском для результата verifyText (плюс поле text, если есть). */
export function formatReport(result) {
  const out = [];
  if (result.text) out.push('Предложение:', '', `  ${result.text}`, '');
  const widths = [7, 10, 15, 3];
  const line = (l, m, r) => l + widths.map((w) => '─'.repeat(w)).join(m) + r;
  out.push(line('┌', '┬', '┐'));
  out.push('│' + ['буква', 'заявлено', 'на самом деле', ''].map((h, i) => center(h, widths[i])).join('│') + '│  в тексте');
  out.push(line('├', '┼', '┤'));
  for (const r of result.rows) {
    const claimed = r.claimed === null ? '—' : Number.isNaN(r.claimed) ? '?' : r.claimed;
    const cells = [r.letter, claimed, r.actual, r.ok ? '✓' : '✗'];
    const words = r.phrase ? r.phrase.replace(/\s*«[^»]*»$/, '') : '';
    out.push('│' + cells.map((c, i) => center(c, widths[i])).join('│') + '│  ' + words);
  }
  out.push(line('└', '┴', '┘'));
  const good = result.rows.filter((r) => r.ok).length;
  out.push('', `Утверждений верно: ${good} из ${ALPHABET.length}. Всего букв в предложении: ${result.totalLetters}.`);
  if (result.ok) {
    out.push('✓ Всё сходится: предложение точно перечисляет собственные буквы.');
  } else {
    out.push('✗ Проверка не пройдена:');
    for (const e of result.errors) out.push(`  • ${e}`);
    for (const r of result.rows.filter((x) => !x.ok && x.claimed !== null && x.formOk)) {
      out.push(`  • «${r.letter}»: заявлено ${r.claimed}, на самом деле ${r.actual}.`);
    }
  }
  return out.join('\n');
}

/** Читает autogram.txt рядом с модулем (файл в Node, fetch в браузере) и проверяет его. */
export async function verify() {
  const url = new URL('autogram.txt', import.meta.url);
  let raw;
  if (url.protocol === 'file:') {
    const { readFile } = await import('node:fs/promises');
    raw = await readFile(url, 'utf8');
  } else {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`не удалось загрузить ${url}: HTTP ${res.status}`);
    raw = await res.text();
  }
  const text = raw.replace(/^\uFEFF/, '').trim();
  return { text, ...verifyText(text) };
}

if (typeof process !== 'undefined' && Array.isArray(process.argv) && process.argv[1]) {
  const { pathToFileURL } = await import('node:url');
  if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
      const result = await verify();
      console.log(formatReport(result));
      process.exitCode = result.ok ? 0 : 1;
    } catch (err) {
      console.error(`Ошибка: ${err.message}`);
      process.exitCode = 1;
    }
  }
}
