/*
 * search.c — поиск русской панграмматической автограммы: предложения, которое
 * словами называет точное число вхождений каждой из 33 букв алфавита в нём самом.
 *
 * Сборка:  gcc -O3 -march=native -o search search.c
 * Запуск:  ./search list                                  — показать шаблоны
 *          ./search <шаблоны> <seed> [млн_шагов] [режим]   — искать
 *            шаблоны: номер, список через запятую («0,4,9») или all
 *            режим:   minconf (по умолчанию) | robinson
 *
 * Результат в autogram.txt — шаблон 0, seed 1:
 *   «В этом предложении ровно X букв «а», Y букв «б», …, W букв «ю» и Z букв «я».»
 *   ./search 0 1 40   → FOUND … step=38924364 (≈6 с при ~7 млн шагов/с).
 *   seed 2 и 3 независимо приходят к тому же предложению.
 *
 * Модель. Пусть x[i] — заявленное число i-й буквы. Фактические счётчики
 *   a = B + Σ_i W[x[i]],
 * где B — буквы шаблона плюс 33 буквы в кавычках, W[n] — буквы фразы
 * «<числительное n> <буква|буквы|букв>». Ищем неподвижную точку x = a
 * локальным поиском min-conflicts с шумом и рестартами (или «робинсонизацией»
 * Салоуза). Поиск детерминирован: зависит только от шаблона, seed и режима.
 */
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#define L 33
#define MAXN 200

static const char *ALPHA[L] = {"а", "б", "в", "г", "д", "е", "ё", "ж", "з", "и", "й",
                               "к", "л", "м", "н", "о", "п", "р", "с", "т", "у", "ф",
                               "х", "ц", "ч", "ш", "щ", "ъ", "ы", "ь", "э", "ю", "я"};

typedef struct {
    const char *prefix, *sep, *last, *suffix;
    int acc; /* 1: винительный падеж («одну букву») */
} Tpl;

static const Tpl TPL[] = {
    /*  0 */ {"В этом предложении ровно ", ", ", " и ", ".", 0},
    /*  1 */ {"В этом предложении ", ", ", " и ", ".", 0},
    /*  2 */ {"В этой фразе ровно ", ", ", " и ", ".", 0},
    /*  3 */ {"В этой фразе ", ", ", " и ", ".", 0},
    /*  4 */ {"Здесь ровно ", ", ", " и ", ".", 0},
    /*  5 */ {"В данном предложении ровно ", ", ", " и ", ".", 0},
    /*  6 */ {"В этом предложении ровно ", ", ", ", а также ", ".", 0},
    /*  7 */ {"В этом предложении ", ", ", ", а также ", ".", 0},
    /*  8 */ {"В предложении, которое вы читаете, ровно ", ", ", " и ", ".", 0},
    /*  9 */ {"Проверьте сами: в этом предложении ровно ", ", ", " и ", ".", 0},
    /* 10 */ {"В этом предложении ровно ", ", ", " и ", " — можете проверить.", 0},
    /* 11 */ {"Можете проверить: в этом предложении ровно ", ", ", " и ", ".", 0},
    /* 12 */ {"Это предложение содержит ровно ", ", ", " и ", ".", 1},
    /* 13 */ {"Это предложение содержит ", ", ", " и ", ".", 1},
    /* 14 */ {"Эта фраза содержит ровно ", ", ", " и ", ".", 1},
    /* 15 */ {"Эта фраза содержит ", ", ", " и ", ".", 1},
    /* 16 */ {"В этом предложении можно насчитать ровно ", ", ", " и ", ".", 1},
    /* 17 */ {"Это предложение содержит ровно ", ", ", ", а также ", ".", 1},
    /* 18 */ {"Проверьте сами: это предложение содержит ровно ", ", ", " и ", ".", 1},
    /* 19 */ {"В этом предложении вы насчитаете ровно ", ", ", " и ", ".", 1},
    /* 20 */ {"Здесь ровно ", ", ", ", а также ", ".", 0},
    /* 21 */ {"В этой фразе ровно ", ", ", ", а также ", ".", 0},
    /* 22 */ {"Эта фраза содержит ровно ", ", ", ", а также ", ".", 1},
    /* 23 */ {"В этом предложении ровно ", ", ", " и ", " — проверьте сами.", 0},
};
#define NTPL ((int)(sizeof TPL / sizeof TPL[0]))

/* ---------- буквы ---------- */

static int letter_index(uint32_t cp) {
    if (cp >= 0x410 && cp <= 0x42F) cp += 0x20; /* А–Я → а–я */
    if (cp == 0x401) cp = 0x451;                 /* Ё → ё */
    if (cp == 0x451) return 6;
    if (cp >= 0x430 && cp <= 0x435) return (int)(cp - 0x430);
    if (cp >= 0x436 && cp <= 0x44F) return (int)(cp - 0x430 + 1);
    return -1;
}

static void count_letters(const char *s, int *cnt) {
    const unsigned char *p = (const unsigned char *)s;
    while (*p) {
        uint32_t cp;
        if (*p < 0x80) cp = *p++;
        else if ((*p & 0xE0) == 0xC0) { cp = ((p[0] & 0x1Fu) << 6) | (p[1] & 0x3Fu); p += 2; }
        else if ((*p & 0xF0) == 0xE0) { cp = ((p[0] & 0x0Fu) << 12) | ((p[1] & 0x3Fu) << 6) | (p[2] & 0x3Fu); p += 3; }
        else { cp = 0; p += 4; }
        int i = letter_index(cp);
        if (i >= 0) cnt[i]++;
    }
}

/* ---------- числительные женского рода ---------- */

static const char *UNITS_NOM[10] = {"", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"};
static const char *UNITS_ACC[10] = {"", "одну", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"};
static const char *TEENS[10] = {"десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать",
                                "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"};
static const char *TENS[10] = {"", "", "двадцать", "тридцать", "сорок", "пятьдесят",
                               "шестьдесят", "семьдесят", "восемьдесят", "девяносто"};

static void numeral(int n, int acc, char *out) {
    out[0] = 0;
    if (n >= 100) { strcat(out, "сто"); n -= 100; if (n) strcat(out, " "); }
    if (n >= 10 && n < 20) { strcat(out, TEENS[n - 10]); return; }
    if (n >= 20) { strcat(out, TENS[n / 10]); if (n % 10) strcat(out, " "); }
    if (n % 10) strcat(out, (acc ? UNITS_ACC : UNITS_NOM)[n % 10]);
}

static const char *noun(int n, int acc) {
    int d = n % 10, h = n % 100;
    if (d == 1 && h != 11) return acc ? "букву" : "буква";
    if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return "буквы";
    return "букв";
}

static void sentence(const Tpl *t, const int *x, char *out) {
    char num[128];
    strcpy(out, t->prefix);
    for (int i = 0; i < L; i++) {
        if (i == L - 1) strcat(out, t->last);
        else if (i) strcat(out, t->sep);
        numeral(x[i], t->acc, num);
        sprintf(out + strlen(out), "%s %s «%s»", num, noun(x[i], t->acc), ALPHA[i]);
    }
    strcat(out, t->suffix);
}

/* ---------- поиск ---------- */

static int B[L], W[MAXN][L], x[L], S[L];
static uint64_t rs;

static uint64_t splitmix(uint64_t *s) {
    uint64_t z = (*s += 0x9E3779B97F4A7C15ULL);
    z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ULL;
    z = (z ^ (z >> 27)) * 0x94D049BB133111EBULL;
    return z ^ (z >> 31);
}
static inline uint64_t rnd64(void) {
    rs ^= rs >> 12; rs ^= rs << 25; rs ^= rs >> 27;
    return rs * 2685821657736338717ULL;
}
static inline uint32_t rndn(uint32_t n) { return (uint32_t)(((rnd64() >> 32) * (uint64_t)n) >> 32); }

static inline void set_val(int j, int v) {
    const int *wo = W[x[j]], *wn = W[v];
    for (int k = 0; k < L; k++) S[k] += wn[k] - wo[k];
    x[j] = v;
}

/* число несовпадений после x[j] := v */
static inline int cost_after(int j, int v) {
    const int *wo = W[x[j]], *wn = W[v];
    int c = 0;
    for (int k = 0; k < L; k++) c += (B[k] + S[k] - wo[k] + wn[k]) != (k == j ? v : x[k]);
    return c;
}

static void restart(void) {
    memset(S, 0, sizeof S);
    for (int k = 0; k < L; k++) {
        x[k] = 1 + (int)rndn(50);
        for (int m = 0; m < L; m++) S[m] += W[x[k]][m];
    }
}

static double now(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return ts.tv_sec + ts.tv_nsec * 1e-9;
}

#define MAXSOL 256
static int sols[MAXSOL][L], nsol;

static void run(int ti, uint64_t seed, uint64_t max_steps, int robinson) {
    const Tpl *t = &TPL[ti];
    char buf[8192], num[128];
    memset(B, 0, sizeof B);
    count_letters(t->prefix, B);
    for (int i = 0; i < L - 2; i++) count_letters(t->sep, B);
    count_letters(t->last, B);
    count_letters(t->suffix, B);
    for (int i = 0; i < L; i++) count_letters(ALPHA[i], B);
    memset(W, 0, sizeof W);
    for (int n = 1; n < MAXN; n++) {
        numeral(n, t->acc, num);
        count_letters(num, W[n]);
        count_letters(noun(n, t->acc), W[n]);
    }
    uint64_t s0 = seed * 1000003ULL + (uint64_t)ti;
    rs = splitmix(&s0) | 1;
    nsol = 0;
    const uint64_t restart_every = 200000; /* шагов без улучшения */
    const uint32_t noise = 150;            /* ‰ случайных ходов в minconf */
    uint64_t last_imp = 0, near = 0;
    int best = L + 1, mis[L], a[L];
    double t0 = now();
    restart();
    for (uint64_t step = 1; step <= max_steps; step++) {
        int nm = 0;
        for (int k = 0; k < L; k++) {
            a[k] = B[k] + S[k];
            if (a[k] != x[k]) mis[nm++] = k;
        }
        if (nm == 0) {
            int dup = 0;
            for (int q = 0; q < nsol && !dup; q++) dup = !memcmp(sols[q], x, sizeof x);
            if (!dup && nsol < MAXSOL) {
                memcpy(sols[nsol++], x, sizeof x);
                sentence(t, x, buf);
                int chk[L] = {0};
                count_letters(buf, chk);
                int ok = !memcmp(chk, x, sizeof x);
                printf("FOUND tpl=%d seed=%llu mode=%s step=%llu time=%.1fs check=%s\n%s\nx:",
                       ti, (unsigned long long)seed, robinson ? "robinson" : "minconf",
                       (unsigned long long)step, now() - t0, ok ? "OK" : "FAIL", buf);
                for (int k = 0; k < L; k++) printf(" %d", x[k]);
                printf("\n");
                fflush(stdout);
            }
            restart(); best = L + 1; last_imp = step;
            continue;
        }
        if (nm == 1) near++;
        if (nm < best) { best = nm; last_imp = step; }
        else if (step - last_imp > restart_every) { restart(); best = L + 1; last_imp = step; continue; }

        if (robinson) {
            int moved = 0;
            for (int q = 0; q < nm; q++) {
                int j = mis[q];
                if (rndn(2) && !(q == nm - 1 && !moved)) continue;
                int lo = x[j] < a[j] ? x[j] : a[j], hi = x[j] < a[j] ? a[j] : x[j];
                int v = lo + (int)rndn((uint32_t)(hi - lo + 1));
                if (v >= MAXN) v = MAXN - 1;
                if (v != x[j]) { set_val(j, v); moved = 1; }
            }
        } else {
            int j, v;
            if (rndn(1000) < noise) {
                j = mis[rndn((uint32_t)nm)];
            } else {
                int bc = L + 1, ties = 0;
                j = mis[0];
                for (int q = 0; q < nm; q++) {
                    int jj = mis[q], vv = a[jj] < MAXN ? a[jj] : MAXN - 1;
                    int c = cost_after(jj, vv);
                    if (c < bc) { bc = c; j = jj; ties = 1; }
                    else if (c == bc && rndn((uint32_t)++ties) == 0) j = jj;
                }
            }
            v = a[j] < MAXN ? a[j] : MAXN - 1;
            set_val(j, v);
        }
    }
    double dt = now() - t0;
    printf("DONE tpl=%d seed=%llu mode=%s steps=%llu time=%.1fs rate=%.2fM/s near1=%llu solutions=%d\n",
           ti, (unsigned long long)seed, robinson ? "robinson" : "minconf",
           (unsigned long long)max_steps, dt, max_steps / dt / 1e6, (unsigned long long)near, nsol);
    fflush(stdout);
}

int main(int argc, char **argv) {
    if (argc < 2 || !strcmp(argv[1], "list")) {
        for (int i = 0; i < NTPL; i++)
            printf("%2d [%s] «%s…%s…%s»\n", i, TPL[i].acc ? "вин" : "им", TPL[i].prefix, TPL[i].last, TPL[i].suffix);
        return 0;
    }
    uint64_t seed = argc > 2 ? strtoull(argv[2], 0, 10) : 1;
    uint64_t steps = (uint64_t)((argc > 3 ? atof(argv[3]) : 50.0) * 1e6);
    int robinson = argc > 4 && !strcmp(argv[4], "robinson");
    int list[NTPL], n = 0;
    if (!strcmp(argv[1], "all")) for (int i = 0; i < NTPL; i++) list[n++] = i;
    else for (char *p = strtok(argv[1], ","); p && n < NTPL; p = strtok(0, ",")) {
        int v = atoi(p);
        if (v >= 0 && v < NTPL) list[n++] = v;
    }
    for (int i = 0; i < n; i++) run(list[i], seed, steps, robinson);
    return 0;
}
