// Экспонат II «Кунсткамеры невозможного»: простое число, цифры которого — QR-код.
// Проверка без зависимостей: `node verify.mjs` (Node 18+). Модуль импортируется и в браузере.

const EXPECTED = 'Я простое число.';

const plural = (n, one, few, many) => {
  const d = n % 10, h = n % 100;
  return `${n} ${d === 1 && h !== 11 ? one : d >= 2 && d <= 4 && (h < 12 || h > 14) ? few : many}`;
};

// ───────────── простота (только BigInt) ─────────────

const TRIAL_LIMIT = 10_000;
const SMALL_PRIMES = (() => {
  const composite = new Uint8Array(TRIAL_LIMIT);
  const primes = [];
  for (let i = 2; i < TRIAL_LIMIT; i++) {
    if (composite[i]) continue;
    primes.push(BigInt(i));
    for (let j = i * i; j < TRIAL_LIMIT; j += i) composite[j] = 1;
  }
  return primes;
})();
const MR_PRIME_BASES = SMALL_PRIMES.slice(0, 24); // 2 … 89
const MR_RANDOM_BASES = 16;

function modPow(base, exp, mod) {
  base %= mod;
  if (base < 0n) base += mod;
  const table = [1n]; // окно в 4 бита
  for (let i = 1; i < 16; i++) table.push((table[i - 1] * base) % mod);
  let r = 1n;
  for (const h of exp.toString(16)) {
    r = (r * r) % mod; r = (r * r) % mod; r = (r * r) % mod; r = (r * r) % mod;
    const k = parseInt(h, 16);
    if (k) r = (r * table[k]) % mod;
  }
  return r;
}

/** Сильный тест Миллера — Рабина по основанию a (нечётное n > 3, 2 ≤ a ≤ n − 2). */
export function millerRabin(n, a) {
  const n1 = n - 1n;
  let d = n1, s = 0;
  while ((d & 1n) === 0n) { d >>= 1n; s++; }
  let x = modPow(a, d, n);
  if (x === 1n || x === n1) return true;
  for (let i = 1; i < s; i++) {
    x = (x * x) % n;
    if (x === n1) return true;
    if (x === 1n) return false;
  }
  return false;
}

// Детерминированные «случайные» основания: SplitMix64, засеянный младшими битами n.
function randomBases(n, count) {
  let s = BigInt.asUintN(64, n ^ 0x5eed_c0de_2026n);
  const next = () => {
    s = BigInt.asUintN(64, s + 0x9e3779b97f4a7c15n);
    let z = s;
    z = BigInt.asUintN(64, (z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n);
    z = BigInt.asUintN(64, (z ^ (z >> 27n)) * 0x94d049bb133111ebn);
    return z ^ (z >> 31n);
  };
  const words = Math.ceil(n.toString(2).length / 64) + 1;
  return Array.from({ length: count }, () => {
    let r = 0n;
    for (let i = 0; i < words; i++) r = (r << 64n) | next();
    return 2n + (r % (n - 3n));
  });
}

function jacobi(a, n) {
  a %= n;
  if (a < 0n) a += n;
  let t = 1;
  while (a !== 0n) {
    while ((a & 1n) === 0n) {
      a >>= 1n;
      const r = n & 7n;
      if (r === 3n || r === 5n) t = -t;
    }
    [a, n] = [n, a];
    if ((a & 3n) === 3n && (n & 3n) === 3n) t = -t;
    a %= n;
  }
  return n === 1n ? t : 0;
}

function isqrt(n) {
  if (n < 2n) return n;
  let x = 1n << BigInt((n.toString(2).length + 1) >> 1);
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

/** Сильный тест Люка с параметрами Селфриджа (метод A): P = 1, Q = (1 − D)/4. Нечётное n > 2. */
export function strongLucas(n) {
  const root = isqrt(n);
  if (root * root === n) return false; // для квадратов подходящего D не существует
  let D = 5n;
  for (;;) {
    const j = jacobi(D, n);
    if (j === -1) break;
    if (j === 0 && (D < 0n ? -D : D) !== n) return false;
    D = D > 0n ? -(D + 2n) : 2n - D;
  }
  const mod = (x) => { x %= n; return x < 0n ? x + n : x; };
  const half = (x) => ((x & 1n) ? (x + n) >> 1n : x >> 1n);
  const Q = mod((1n - D) / 4n), Dm = mod(D);
  let d = n + 1n, s = 0;
  while ((d & 1n) === 0n) { d >>= 1n; s++; }
  let U = 1n, V = 1n, Qk = Q; // U_1, V_1, Q^1
  const bits = d.toString(2);
  for (let i = 1; i < bits.length; i++) {
    U = (U * V) % n; // удвоение индекса
    V = mod(V * V - 2n * Qk);
    Qk = (Qk * Qk) % n;
    if (bits[i] === '1') { // +1 к индексу
      [U, V] = [half(mod(U + V)), half(mod(Dm * U + V))];
      Qk = (Qk * Q) % n;
    }
  }
  if (U === 0n || V === 0n) return true;
  for (let r = 1; r < s; r++) {
    V = mod(V * V - 2n * Qk);
    if (V === 0n) return true;
    Qk = (Qk * Qk) % n;
  }
  return false;
}

/**
 * Пробное деление, Миллер — Рабин по 24 первым простым и 16 псевдослучайным основаниям,
 * сильный тест Люка (вместе с основанием 2 — полный BPSW). Работает и в браузере.
 * Необязательный log({ ok, text, ms }) получает отчёт по каждому этапу.
 */
export function isProbablePrime(n, log = () => {}) {
  n = BigInt(n);
  const stage = (test) => {
    const t = performance.now();
    const [ok, text] = test();
    log({ ok, text, ms: performance.now() - t });
    return ok;
  };
  if (n < 2n) return false;
  let decided = null;
  const trialOk = stage(() => {
    for (const p of SMALL_PRIMES) {
      if (p * p > n) { decided = true; return [true, `n < ${TRIAL_LIMIT}², пробное деление доказывает простоту`]; }
      if (n % p === 0n) { decided = n === p; return [decided, decided ? 'n — малое простое' : `делится на ${p}`]; }
    }
    return [true, `пробное деление на ${SMALL_PRIMES.length} простых < ${TRIAL_LIMIT.toLocaleString('ru-RU')}: делителей нет`];
  });
  if (decided !== null) return trialOk;
  return (
    stage(() => [MR_PRIME_BASES.every((a) => millerRabin(n, a)),
      `Миллер — Рабин: ${plural(MR_PRIME_BASES.length, 'первое простое основание', 'первых простых основания', 'первых простых оснований')} (2…${MR_PRIME_BASES.at(-1)})`]) &&
    stage(() => [randomBases(n, MR_RANDOM_BASES).every((a) => millerRabin(n, a)),
      `Миллер — Рабин: ${MR_RANDOM_BASES} детерминированных псевдослучайных оснований`]) &&
    stage(() => [strongLucas(n), 'сильный тест Люка (Селфридж); с основанием 2 это полный BPSW'])
  );
}

// ───────────── QR-код из цифр ─────────────

const isDark = (ch) => ch === '8' || ch === '9';

// Версии 1–6: [проверочных байт на блок, [блоков, байт данных в блоке], …]
const BLOCKS = {
  1: { L: [7, [1, 19]], M: [10, [1, 16]], Q: [13, [1, 13]], H: [17, [1, 9]] },
  2: { L: [10, [1, 34]], M: [16, [1, 28]], Q: [22, [1, 22]], H: [28, [1, 16]] },
  3: { L: [15, [1, 55]], M: [26, [1, 44]], Q: [18, [2, 17]], H: [22, [2, 13]] },
  4: { L: [20, [1, 80]], M: [18, [2, 32]], Q: [26, [2, 24]], H: [16, [4, 9]] },
  5: { L: [26, [1, 108]], M: [24, [2, 43]], Q: [18, [2, 15], [2, 16]], H: [22, [2, 11], [2, 12]] },
  6: { L: [18, [2, 68]], M: [16, [4, 27]], Q: [24, [4, 19]], H: [28, [4, 15]] },
};
const MASKS = [
  (i, j) => (i + j) % 2 === 0,
  (i, j) => i % 2 === 0,
  (i, j) => j % 3 === 0,
  (i, j) => (i + j) % 3 === 0,
  (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
  (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
  (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
  (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0,
];

function formatCodeword(data) { // 5 бит → 15 бит BCH(15,5) с маской 0x5412
  let rem = data << 10;
  for (let i = 14; i >= 10; i--) if (rem & (1 << i)) rem ^= 0x537 << (i - 10);
  return ((data << 10) | rem) ^ 0x5412;
}

const GF_EXP = new Uint8Array(512), GF_LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  GF_EXP[i] = GF_EXP[i + 255] = x;
  GF_LOG[x] = i;
  x = (x << 1) ^ (x & 0x80 ? 0x11d : 0);
}
const gfMul = (a, b) => (a && b ? GF_EXP[GF_LOG[a] + GF_LOG[b]] : 0);

function syndromesAreZero(codewords, ecCount) { // корни порождающего многочлена: α^0 … α^(ec−1)
  for (let i = 0; i < ecCount; i++) {
    let s = 0;
    for (const c of codewords) s = gfMul(s, GF_EXP[i]) ^ c;
    if (s !== 0) return false;
  }
  return true;
}

const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

function decodeBytes(bytes, eci) {
  const u8 = Uint8Array.from(bytes);
  if (eci === 3) return [String.fromCharCode(...u8), 'ISO-8859-1'];
  if (eci === 20) return [new TextDecoder('shift_jis').decode(u8), 'Shift_JIS'];
  try {
    return [new TextDecoder('utf-8', { fatal: true }).decode(u8), 'UTF-8'];
  } catch {
    return [String.fromCharCode(...u8), 'ISO-8859-1'];
  }
}

function parsePayload(data, version) {
  let pos = 0;
  const total = data.length * 8;
  const read = (n) => {
    let v = 0;
    for (let i = 0; i < n; i++, pos++) v = v * 2 + ((data[pos >> 3] >> (7 - (pos & 7))) & 1);
    return v;
  };
  const wide = version >= 10;
  let text = '', eci = null;
  const segments = [];
  while (pos + 4 <= total) {
    const mode = read(4);
    if (mode === 0) break;
    if (mode === 0b0111) {
      const b = read(8);
      eci = b < 0x80 ? b : b < 0xc0 ? ((b & 0x3f) << 8) | read(8) : ((b & 0x1f) << 16) | read(16);
      segments.push(`ECI ${eci}`);
    } else if (mode === 0b0100) {
      const count = read(wide ? 16 : 8);
      const bytes = Array.from({ length: count }, () => read(8));
      const [s, enc] = decodeBytes(bytes, eci);
      text += s;
      segments.push(`байтовый режим, ${count} байт ${enc}${eci === null ? ' без ECI' : ''}`);
    } else if (mode === 0b0001) {
      let count = read(version >= 27 ? 14 : wide ? 12 : 10);
      segments.push(`цифровой режим, ${count} симв.`);
      for (; count >= 3; count -= 3) text += String(read(10)).padStart(3, '0');
      if (count) text += String(read(count === 2 ? 7 : 4)).padStart(count, '0');
    } else if (mode === 0b0010) {
      let count = read(version >= 27 ? 13 : wide ? 11 : 9);
      segments.push(`буквенно-цифровой режим, ${count} симв.`);
      for (; count >= 2; count -= 2) { const v = read(11); text += ALNUM[Math.floor(v / 45)] + ALNUM[v % 45]; }
      if (count) text += ALNUM[read(6)];
    } else {
      throw new Error(`режим ${mode.toString(2).padStart(4, '0')} не поддерживается`);
    }
  }
  return { text, segments };
}

/**
 * Проверяет, что строки цифр — QR-код (тёмные = 8/9, светлые = 1/7), и читает его.
 * Возвращает { ok, details: [{ ok, text }], version, ecLevel, mask, message }.
 */
export function checkQR(lines) {
  const details = [];
  const check = (ok, text) => { details.push({ ok, text }); return ok; };
  const result = (extra = {}) => ({ ok: details.every((d) => d.ok), details, ...extra });

  const N = lines.length;
  if (!check(N > 0 && lines.every((l) => l.length === N),
    `${plural(N, 'строка', 'строки', 'строк')}, в каждой ${plural(N, 'цифра', 'цифры', 'цифр')}`)) return result();
  const bad = lines.join('').replace(/[1789]/g, '');
  const V = (N - 17) / 4;
  check(bad === '', bad === '' ? 'только цифры 1, 7, 8, 9' : `посторонние символы: ${JSON.stringify(bad.slice(0, 10))}`);
  if (!check(Number.isInteger(V) && V >= 1 && V <= 40, `размер ${N} × ${N} соответствует QR версии ${V}`)) return result();
  const dark = (r, c) => isDark(lines[r][c]);
  const all = (cells, want) => cells.every(([r, c]) => dark(r, c) === want);
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

  const finderOk = [[0, 0], [0, N - 7], [N - 7, 0]].every(([r0, c0]) =>
    range(0, 6).every((dr) => range(0, 6).every((dc) =>
      dark(r0 + dr, c0 + dc) === (Math.max(Math.abs(dr - 3), Math.abs(dc - 3)) !== 2))));
  check(finderOk, 'три поисковых узора 7 × 7: тёмная рамка, светлое кольцо, тёмное ядро 3 × 3');
  const separators = range(0, 7).flatMap((i) => [[7, i], [i, 7], [7, N - 1 - i], [i, N - 8], [N - 8, i], [N - 1 - i, 7]]);
  check(all(separators, false), 'светлые разделители вокруг поисковых узоров');
  const timingOk = range(8, N - 9).every((i) => dark(6, i) === (i % 2 === 0) && dark(i, 6) === (i % 2 === 0));
  check(timingOk, 'синхронизирующие полосы в 7-й строке и 7-м столбце чередуются');

  if (V > 6) {
    check(false, `версия ${V}: встроенный декодер читает только версии 1–6`);
    return result({ version: V });
  }
  const a = N - 7;
  const alignOk = V === 1 || range(-2, 2).every((dr) => range(-2, 2).every((dc) =>
    dark(a + dr, a + dc) === (Math.max(Math.abs(dr), Math.abs(dc)) !== 1)));
  check(alignOk && dark(N - 8, 8), V === 1 ? 'обязательный тёмный модуль на месте' : 'выравнивающий узор 5 × 5 и обязательный тёмный модуль на месте');

  const readBits = (cells) => cells.reduce((v, [r, c]) => (v << 1) | (dark(r, c) ? 1 : 0), 0);
  const copy1 = readBits([[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]]);
  const copy2 = readBits([...range(1, 7).map((i) => [N - i, 8]), ...range(0, 7).map((i) => [8, N - 8 + i])]);
  const format = range(0, 31).find((d) => formatCodeword(d) === copy1);
  if (!check(format !== undefined && formatCodeword(format) === copy2, 'служебная информация (обе копии, код BCH) корректна')) return result({ version: V });
  const ecLevel = ['M', 'L', 'H', 'Q'][format >> 3], mask = format & 7;
  details.at(-1).text = `служебная информация (обе копии, код BCH): коррекция ${ecLevel}, маска ${mask}`;

  const isFunction = (r, c) => (r < 9 && c < 9) || (r < 9 && c >= N - 8) || (r >= N - 8 && c < 9) ||
    r === 6 || c === 6 || (V >= 2 && Math.abs(r - a) <= 2 && Math.abs(c - a) <= 2);
  const bits = [];
  for (let right = N - 1, up = true; right >= 1; right -= 2, up = !up) {
    if (right === 6) right = 5;
    for (let i = 0; i < N; i++) {
      const r = up ? N - 1 - i : i;
      for (const c of [right, right - 1]) if (!isFunction(r, c)) bits.push(dark(r, c) !== MASKS[mask](r, c) ? 1 : 0);
    }
  }
  const [ec, ...groups] = BLOCKS[V][ecLevel];
  const blocks = groups.flatMap(([count, len]) => Array.from({ length: count }, () => ({ len, data: [], ecc: [] })));
  const total = blocks.reduce((s, b) => s + b.len + ec, 0);
  const codewords = Array.from({ length: total }, (_, k) => bits.slice(8 * k, 8 * k + 8).reduce((v, b) => (v << 1) | b, 0));
  let k = 0;
  for (let i = 0; i < Math.max(...blocks.map((b) => b.len)); i++) for (const b of blocks) if (i < b.len) b.data.push(codewords[k++]);
  for (let i = 0; i < ec; i++) for (const b of blocks) b.ecc.push(codewords[k++]);
  const rsOk = blocks.every((b) => syndromesAreZero([...b.data, ...b.ecc], ec));
  check(rsOk, `Рид — Соломон: ${plural(total, 'кодовое слово', 'кодовых слова', 'кодовых слов')} (${ec * blocks.length} проверочных) — ${rsOk ? 'ошибок нет' : 'есть ошибки'}`);

  try {
    const { text, segments } = parsePayload(blocks.flatMap((b) => b.data), V);
    check(true, `сообщение (${segments.join('; ')}): «${text}»`);
    return result({ version: V, ecLevel, mask, message: text });
  } catch (e) {
    check(false, `не удалось прочитать данные: ${e.message}`);
    return result({ version: V, ecLevel, mask });
  }
}

// ───────────── отчёт ─────────────

async function readPrimeText() {
  const url = new URL('prime.txt', import.meta.url);
  if (url.protocol === 'file:') {
    const { readFile } = await import('node:fs/promises');
    return readFile(url, 'utf8');
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** Полная проверка prime.txt рядом с модулем. Возвращает { ok, lines } — строки отчёта. */
export async function verify() {
  const out = [];
  let ok = true;
  const mark = (good, text, ms) => {
    ok &&= good;
    out.push(`${good ? '✓' : '✗'} ${text}${ms === undefined ? '' : ` — ${ms < 10 ? ms.toFixed(1) : Math.round(ms)} мс`}`);
  };
  const started = performance.now();
  let raw;
  try {
    raw = await readPrimeText();
  } catch (e) {
    mark(false, `не удалось прочитать prime.txt: ${e.message}`);
    return { ok, lines: out };
  }
  const lines = raw.replace(/\s+$/, '').split(/\r?\n/);
  const digits = lines.join('');
  out.push('Экспонат II «Кунсткамеры невозможного»: простое число, цифры которого — QR-код');
  out.push(`prime.txt: ${plural(digits.length, 'цифра', 'цифры', 'цифр')} (${plural(lines.length, 'строка', 'строки', 'строк')})`, '');

  out.push('QR-код из цифр (8 и 9 — тёмные модули, 1 и 7 — светлые)');
  const qr = checkQR(lines);
  for (const d of qr.details) mark(d.ok, d.text);
  if (qr.message !== undefined) mark(qr.message === EXPECTED, `текст совпадает с ожидаемым «${EXPECTED}»`);

  out.push('', 'Простота (BigInt, без библиотек)');
  let prime = false;
  if (/^[1-9]\d*$/.test(digits)) prime = isProbablePrime(BigInt(digits), (s) => mark(s.ok, s.text, s.ms));
  else mark(false, 'prime.txt не является десятичным числом');
  ok &&= prime;

  const edits = [...digits].flatMap((ch, i) => (ch === '7' || ch === '9')
    ? [`${ch} (строка ${Math.floor(i / lines.length) + 1}, столбец ${(i % lines.length) + 1})`] : []);
  out.push('');
  mark(ok, ok ? `ИТОГ: число вероятно простое и само говорит «${EXPECTED}»` : 'ИТОГ: проверка не пройдена');
  out.push(`  отличий от «чистого» числа из одних 8 и 1: ${edits.length} — ${edits.join(', ')}`);
  out.push('  строгое доказательство — ECPP-сертификат: gp -q verify_cert.gp');
  out.push(`  время: ${Math.round(performance.now() - started)} мс`);
  return { ok, lines: out };
}

if (typeof process !== 'undefined' && process.versions?.node && process.argv[1]) {
  const [{ pathToFileURL }, { realpathSync }] = await Promise.all([import('node:url'), import('node:fs')]);
  let main = '';
  try { main = pathToFileURL(realpathSync(process.argv[1])).href; } catch {}
  if (import.meta.url === main) {
    const { ok, lines } = await verify();
    console.log(lines.join('\n'));
    process.exitCode = ok ? 0 : 1;
  }
}
