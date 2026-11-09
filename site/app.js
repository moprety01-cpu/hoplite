// Кунсткамера невозможного — the exhibition hall. Every check on this page runs in the visitor's browser,
// using the same verification modules as `node verify.mjs`.
import { parseClaims, countLetters, ALPHABET } from '../exhibits/3-autogram/verify.mjs';
import { checkQR } from '../exhibits/2-prime/verify.mjs';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (n) => Math.round(n).toLocaleString('ru-RU');
const kb = (n) => (n < 1024 ? `${n} Б` : `${(n / 1024).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} КБ`);
const get = async (url, as = 'text') => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r[as]();
};
const sha256 = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))]
  .map((b) => b.toString(16).padStart(2, '0')).join('');
const plural = (n, one, few, many) =>
  n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many;

// The GitHub repository behind this page (taken from the Pages address, so a fork shows its own history).
const GH = (() => {
  const m = location.hostname.match(/^([\w-]+)\.github\.io$/i);
  const repo = m && location.pathname.split('/')[1];
  return m && repo ? { owner: m[1], repo } : { owner: 'moprety01-cpu', repo: 'hoplite' };
})();
for (const a of document.querySelectorAll('a[data-gh]')) {
  a.href = `https://github.com/${GH.owner}/${GH.repo}${a.dataset.gh ? `/blob/HEAD/${a.dataset.gh}` : ''}`;
}
$('#clone-cmd').textContent = `git clone https://github.com/${GH.owner}/${GH.repo}.git kunstkamera\ncd kunstkamera && node verify.mjs`;

function whenVisible(el, onChange) {
  new IntersectionObserver((entries) => onChange(entries.some((e) => e.isIntersecting)), { rootMargin: '120px' }).observe(el);
}
function fail(el, e) {
  el.innerHTML = `<span class="bad">Не получилось загрузить экспонат: ${esc(e.message)}.</span>` +
    (location.protocol === 'file:' ? ' Откройте музей через веб-сервер, например: <code>python3 -m http.server</code>.' : '');
}

// ── I. The globe that prints itself ──────────────────────────────────────────────
const hourOf = (t) => Number(t.slice(t.indexOf('`') + 1).replace(/[\s█]/g, '').match(/^A=(\d+);/)[1]);
const paintGlobe = (t) => esc(t)
  .replace(/█+/g, (m) => `<b>${' '.repeat(m.length)}</b>`)
  .replace(/[А-Яа-яЁё·]+(?:-[А-Яа-яЁё·]+)*/g, (m) => `<i>${m}</i>`);

async function globe() {
  const view = $('#globe-view'), clock = $('#globe-clock'), status = $('#globe-status'), toggle = $('#globe-toggle');
  let first;
  try { first = await get('exhibits/1-globe/globe.js'); } catch (e) { return fail(view, e); }
  const firstHash = await sha256(first);
  const worker = new Worker('site/globe-worker.js');
  const next = (text) => new Promise((resolve) => { worker.onmessage = (e) => resolve(e.data); worker.postMessage(text); });
  let text = first, run = 0, playing = !matchMedia('(prefers-reduced-motion: reduce)').matches, visible = false;

  const show = async () => {
    view.innerHTML = paintGlobe(text);
    clock.textContent = `${String(hourOf(text)).padStart(2, '0')}:00`;
    if (run === 0) status.textContent = 'исходный файл globe.js';
    else if (run % 24 === 0 && (await sha256(text)) === firstHash) {
      status.innerHTML = `запуск №${run} · <strong>✓ совпал с исходным файлом байт в байт</strong>`;
    } else status.textContent = `запуск №${run} — вывод запуска №${run - 1}`;
  };
  const setPlaying = (on) => {
    playing = on;
    toggle.textContent = on ? '❚❚' : '▶';
    toggle.setAttribute('aria-label', on ? 'Пауза' : 'Пуск');
  };
  toggle.addEventListener('click', () => setPlaying(!playing));
  setPlaying(playing);
  whenVisible(view, (v) => { visible = v; });
  await show();
  for (;;) {
    if (!playing || !visible || document.hidden) { await sleep(150); continue; }
    const r = await next(text);
    if (r.error) { status.textContent = `ошибка выполнения: ${r.error}`; return; }
    text = r.out;
    run++;
    await show();
    await sleep(run % 24 === 0 ? 2800 : 450);
  }
}

// ── II. The prime that talks ─────────────────────────────────────────────────────
async function prime() {
  const qr = $('#qr'), log = $('#prime-log');
  let lines;
  try { lines = (await get('exhibits/2-prime/prime.txt')).trim().split('\n'); } catch (e) { return fail(log, e); }
  const digits = lines.join('');
  let changed = 0;
  qr.innerHTML = [...digits].map((d) => {
    const dark = d === '8' || d === '9', odd = d === '9' || d === '7';
    changed += odd;
    return `<span class="${dark ? 'd' : 'l'}${odd ? ' x' : ''}">${d}</span>`;
  }).join('');
  $('#prime-changes').textContent = { 1: 'одна', 2: 'две', 3: 'три', 4: 'четыре' }[changed] || changed;
  $('#prime-digits').textContent = digits;
  $('#qr-diff').addEventListener('change', (e) => qr.classList.toggle('diff', e.target.checked));

  let started = false;
  whenVisible(qr, (v) => {
    if (!v || started) return;
    started = true;
    const out = [];
    const say = (cls, s) => { out.push(`<span class="${cls}">${esc(s)}</span>`); log.innerHTML = out.join('\n'); };
    const decoded = checkQR(lines);
    say(decoded.ok ? 'ok' : 'bad', decoded.ok
      ? `✓ ваш браузер прочитал QR-код прямо из цифр: «${decoded.message}»`
      : '✗ QR-код из цифр не читается');
    say('', `… проверяю простоту числа из ${digits.length} цифр`);
    const worker = new Worker('site/prime-worker.js', { type: 'module' });
    const t0 = performance.now();
    worker.onmessage = ({ data }) => {
      if (data.stage) say(data.stage.ok ? 'ok' : 'bad', `${data.stage.ok ? '✓' : '✗'} ${data.stage.text} — ${fmt(data.stage.ms)} мс`);
      if ('result' in data) {
        out.splice(1, 1);
        say(data.result ? 'hi' : 'bad', data.result
          ? `Простое. Вероятность ошибки после этих тестов меньше 10⁻²⁴ (а строгое доказательство — в сертификате). ${fmt(performance.now() - t0)} мс.`
          : 'Составное?! Так не должно быть.');
        worker.terminate();
      }
    };
    worker.postMessage(digits);
  });
}

// ── III. The sentence that counted itself ────────────────────────────────────────
async function autogram() {
  const box = $('#autogram-text'), hint = $('#autogram-hint'), tally = $('#autogram-tally');
  let text;
  try { text = (await get('exhibits/3-autogram/autogram.txt')).trim(); } catch (e) { return fail(box, e); }
  const claims = parseClaims(text);
  const counts = countLetters(text);
  const wrapLetters = (s) => [...s].map((ch) => {
    const l = ch.toLowerCase();
    return Object.hasOwn(counts, l) ? `<span class="x" data-l="${l}">${ch}</span>` : esc(ch);
  }).join('');
  let html = '', at = 0;
  for (const c of claims) {
    html += wrapLetters(text.slice(at, c.index));
    html += `<span class="c" tabindex="0" data-l="${c.letter}">${wrapLetters(c.phrase)}</span>`;
    at = c.index + c.phrase.length;
  }
  box.innerHTML = html + wrapLetters(text.slice(at));

  const byLetter = Object.fromEntries(claims.map((c) => [c.letter, c]));
  const light = (l) => {
    box.querySelectorAll('.hl, .on').forEach((el) => el.classList.remove('hl', 'on'));
    if (!l) { hint.innerHTML = 'Наведите на любое «сколько букв» — и все эти буквы подсветятся.'; return; }
    box.querySelectorAll(`.x[data-l="${l}"]`).forEach((el) => el.classList.add('hl'));
    box.querySelector(`.c[data-l="${l}"]`)?.classList.add('on');
    const claim = byLetter[l];
    hint.innerHTML = `«${l}»: обещано <b>${claim.number}</b> · найдено <b>${counts[l]}</b> ${claim.number === counts[l] ? '✓' : '✗'}`;
  };
  for (const el of box.querySelectorAll('.c')) {
    el.addEventListener('mouseenter', () => light(el.dataset.l));
    el.addEventListener('focus', () => light(el.dataset.l));
    el.addEventListener('click', () => light(el.dataset.l));
  }
  box.addEventListener('mouseleave', () => light(null));

  const good = ALPHABET.filter((l) => byLetter[l]?.number === counts[l]).length;
  tally.innerHTML = ALPHABET.map((l) =>
    `<div class="${byLetter[l]?.number === counts[l] ? 'ok' : 'bad'}" data-l="${l}"><b>${l}</b>${counts[l]}</div>`).join('');
  tally.insertAdjacentHTML('afterend',
    `<p class="live">Ваш браузер только что пересчитал все ${Object.values(counts).reduce((a, b) => a + b, 0)} букв: верны ${good} утверждений из 33.</p>`);
  for (const el of tally.children) el.addEventListener('mouseenter', () => light(el.dataset.l));
  tally.addEventListener('mouseleave', () => light(null));
}

// ── IV. The picture that is an archive ───────────────────────────────────────────
async function chimera() {
  const map = $('#chimera-map'), links = $('#chimera-links'), list = $('#chimera-files');
  let buf;
  try { buf = new Uint8Array(await get('exhibits/4-chimera/kunstkamera.png', 'arrayBuffer')); } catch (e) { return fail(map, e); }
  const dv = new DataView(buf.buffer);
  const latin = (a, b) => String.fromCharCode(...buf.subarray(a, b));
  // PNG, read from the start.
  const chunks = [];
  let p = 8;
  while (p < buf.length) {
    const len = dv.getUint32(p), type = latin(p + 4, p + 8);
    chunks.push({ type, len, start: p, end: p + 12 + len });
    p += 12 + len;
    if (type === 'IEND') break;
  }
  const pngEnd = p, html = chunks.find((c) => c.type === 'htMl');
  // ZIP, read from the end.
  let eocd = buf.length - 22;
  while (eocd > 0 && dv.getUint32(eocd, true) !== 0x06054b50) eocd--;
  const entries = [];
  for (let i = 0, q = dv.getUint32(eocd + 16, true); i < dv.getUint16(eocd + 10, true); i++) {
    const nlen = dv.getUint16(q + 28, true);
    entries.push({ name: new TextDecoder().decode(buf.subarray(q + 46, q + 46 + nlen)).replace(/^kunstkamera\//, ''), size: dv.getUint32(q + 24, true) });
    q += 46 + nlen + dv.getUint16(q + 30, true) + dv.getUint16(q + 32, true);
  }
  const pixels = pngEnd - html.end - 0;
  const seg = (cls, bytes, label) => `<div class="${cls}" style="flex:${Math.sqrt(bytes)}" title="${kb(bytes)}">${label}</div>`;
  map.innerHTML =
    seg('png', html.start, 'PNG') + seg('html', html.len, 'HTML') + seg('png', pixels, 'PNG: пиксели') + seg('zip', buf.length - pngEnd, 'ZIP');
  map.insertAdjacentHTML('afterend', `<p class="bytemap-legend">${kb(buf.length)}: заголовок PNG ${html.start} Б → страница ${kb(html.len)} в чанке htMl → пиксели ${kb(pixels)} в ${chunks.filter((c) => c.type === 'IDAT').length} чанках IDAT → ZIP-архив ${kb(buf.length - pngEnd)} (${entries.length} ${plural(entries.length, 'файл', 'файла', 'файлов')}). Ширина полос — по корню из размера, иначе страницу не было бы видно.</p>`);

  const url = URL.createObjectURL(new Blob([buf], { type: 'application/octet-stream' }));
  links.innerHTML = ['png', 'html', 'zip'].map((ext) => `<a class="button" href="${url}" download="kunstkamera.${ext}">скачать как .${ext}</a>`).join('');
  $('#chimera-zip-summary').textContent = `что внутри архива (${entries.length} ${plural(entries.length, 'файл', 'файла', 'файлов')})`;
  list.innerHTML = entries.map((e) => `<li>${esc(e.name)} <span>${kb(e.size)}</span></li>`).join('');
}

// ── V. The history that cannot be ────────────────────────────────────────────────
async function history() {
  const log = $('#history-log');
  try {
    const commits = (await get(`https://api.github.com/repos/${GH.owner}/${GH.repo}/commits?per_page=100`, 'json')).reverse();
    log.innerHTML = commits.map(({ sha, commit }) => {
      const subject = commit.message.split('\n')[0].trim();
      const nonce = commit.message.match(/[ \t]{32}(?=\n|$)/)?.[0];
      const minted = /^000\d{4}/.test(sha);
      return `<li class="${minted ? '' : 'plain'}"><span class="sha"><b>${sha.slice(0, 7)}</b>${sha.slice(7, 16)}…</span>` +
        `<span class="subj">${esc(subject)}</span>` +
        (nonce ? `<span class="nonce">невидимое: ${[...nonce].map((c) => (c === ' ' ? '·' : '→')).join('')}</span>` : '') + '</li>';
    }).join('');
  } catch (e) {
    log.innerHTML = `<li><span class="muted">GitHub сейчас не отдал историю (${esc(e.message)}). Посмотрите её сами: <code>git log --oneline</code> или вкладка Commits на GitHub.</span></li>`;
  }
}

function miner() {
  const form = $('#miner-form'), out = $('#miner-log');
  let worker = null;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    worker?.terminate();
    worker = new Worker('site/sha1-worker.js');
    const text = $('#miner-name').value.trim() || 'Кунсткамера', zeros = Number($('#miner-zeros').value);
    const expected = 16 ** zeros;
    out.textContent = `Перебираю «${text} 1», «${text} 2», … ищу SHA-1, начинающийся с ${zeros} нулей (в среднем ${fmt(expected)} попыток).`;
    worker.onmessage = ({ data }) => {
      const rate = data.n / (data.ms / 1000);
      if (!data.hash) { out.textContent = `${fmt(data.n)} попыток… (${fmt(rate)} в секунду)`; return; }
      const seven = 16 ** 7 / rate;
      out.innerHTML =
        `<span class="ok">✓ «${esc(text)} ${data.nonce}»</span> → <span class="hi">${data.hash.slice(0, zeros)}</span>${data.hash.slice(zeros)}\n` +
        `${fmt(data.n)} попыток за ${data.ms < 1000 ? `${fmt(data.ms)} мс` : `${(data.ms / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} с`}.\n` +
        `Семь нулей потребовали бы в среднем 268 млн попыток — у вашего браузера это примерно ${seven < 120 ? `${fmt(seven)} с` : `${fmt(seven / 60)} мин`}. ` +
        'Станок музея (mint.c) тратит на коммит около 15 секунд: он хеширует один и тот же коммит, меняя только невидимый хвост.';
      worker.terminate();
    };
    worker.postMessage({ text, zeros });
  });
}

for (const exhibit of [globe, prime, autogram, chimera, history, miner]) {
  Promise.resolve().then(exhibit).catch((e) => console.error(exhibit.name, e));
}
