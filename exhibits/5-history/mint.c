// mint.c — finds an invisible whitespace nonce that gives a git object a chosen hash prefix.
//
// Input file: the raw object body ("tree ...\n...author ...\n\nmessage") in which exactly one run of
// NONCE_LEN bytes equal to 0x01 marks the nonce. Every marker byte becomes a space or a tab.
// The "commit <size>\0" header is added here. Output: the object with the nonce filled in, on stdout.
//
// build: cc -O3 -pthread -o mint mint.c -lcrypto
// usage: ./mint <hex-prefix> <object-file> [threads] > filled-object
#define OPENSSL_SUPPRESS_DEPRECATED
#include <openssl/sha.h>
#include <pthread.h>
#include <stdatomic.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#define NONCE_LEN 32

static unsigned char *obj;          // header + body
static size_t obj_len, nonce_at;
static unsigned char want[20], mask[20];
static atomic_int found;
static atomic_ullong attempts;
static uint64_t winner;
static int nthreads;

static void fill(unsigned char *dst, uint64_t bits) {
    for (int i = 0; i < NONCE_LEN; i++) dst[i] = (bits >> i) & 1 ? '\t' : ' ';
}

static void *work(void *arg) {
    uint64_t t = (uintptr_t)arg;
    size_t tail_len = obj_len - nonce_at;
    unsigned char *tail = malloc(tail_len), md[20];
    memcpy(tail, obj + nonce_at, tail_len);
    SHA_CTX base, c;
    SHA1_Init(&base);
    SHA1_Update(&base, obj, nonce_at);   // midstate: everything before the nonce is hashed once
    uint64_t local = 0;
    for (uint64_t i = t; i < (1ULL << NONCE_LEN) && !atomic_load_explicit(&found, memory_order_relaxed); i += nthreads) {
        fill(tail, i);
        c = base;
        SHA1_Update(&c, tail, tail_len);
        SHA1_Final(md, &c);
        int ok = 1;
        for (int k = 0; k < 20 && ok; k++) ok = (md[k] & mask[k]) == want[k];
        if (ok && !atomic_exchange(&found, 1)) winner = i;
        if (++local == 1 << 20) { atomic_fetch_add(&attempts, local); local = 0; }
    }
    atomic_fetch_add(&attempts, local);
    free(tail);
    return NULL;
}

int main(int argc, char **argv) {
    if (argc < 3) { fprintf(stderr, "usage: %s <hex-prefix> <object-file> [threads]\n", argv[0]); return 2; }
    const char *hex = argv[1];
    size_t plen = strlen(hex);
    if (plen == 0 || plen > 40) { fprintf(stderr, "bad prefix\n"); return 2; }
    for (size_t i = 0; i < plen; i++) {
        unsigned v;
        if (sscanf((char[]){hex[i], 0}, "%1x", &v) != 1) { fprintf(stderr, "bad hex\n"); return 2; }
        want[i / 2] |= i % 2 ? v : v << 4;
        mask[i / 2] |= i % 2 ? 0x0f : 0xf0;
    }
    FILE *f = fopen(argv[2], "rb");
    if (!f) { perror(argv[2]); return 2; }
    static unsigned char body[1 << 20];
    size_t body_len = fread(body, 1, sizeof body, f);
    fclose(f);
    unsigned char *m = memchr(body, 1, body_len);
    if (!m || (size_t)(m - body) + NONCE_LEN > body_len) { fprintf(stderr, "no nonce marker\n"); return 2; }
    for (int i = 0; i < NONCE_LEN; i++) if (m[i] != 1) { fprintf(stderr, "short nonce marker\n"); return 2; }
    char head[64];
    int hlen = snprintf(head, sizeof head, "commit %zu", body_len) + 1;  // includes the NUL
    obj_len = hlen + body_len;
    obj = malloc(obj_len);
    memcpy(obj, head, hlen);
    memcpy(obj + hlen, body, body_len);
    nonce_at = hlen + (m - body);

    nthreads = argc > 3 ? atoi(argv[3]) : 4;
    pthread_t th[64];
    struct timespec t0, t1;
    clock_gettime(CLOCK_MONOTONIC, &t0);
    for (int i = 0; i < nthreads; i++) pthread_create(&th[i], NULL, work, (void *)(uintptr_t)i);
    for (int i = 0; i < nthreads; i++) pthread_join(th[i], NULL);
    clock_gettime(CLOCK_MONOTONIC, &t1);
    if (!found) { fprintf(stderr, "nonce space exhausted\n"); return 1; }
    double s = (t1.tv_sec - t0.tv_sec) + (t1.tv_nsec - t0.tv_nsec) / 1e9;
    unsigned long long n = atomic_load(&attempts);
    fprintf(stderr, "{\"attempts\":%llu,\"seconds\":%.2f,\"rate\":%.0f}\n", n, s, n / s);
    fill(obj + nonce_at, winner);
    fwrite(obj + hlen, 1, body_len, stdout);
    return 0;
}
