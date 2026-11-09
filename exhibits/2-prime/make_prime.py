#!/usr/bin/env python3
"""Exhibit II of «Кунсткамера невозможного»: a prime whose digits form a QR code.

Deterministically regenerates prime.txt and qr.svg next to this file:

    python3 make_prime.py           # needs segno, gmpy2
    python3 make_prime.py --check   # also decodes raster renders (needs Pillow, zxing-cpp)

Rules: every dark module becomes 8 (or 9), every light module 1 (or 7), so the
colour class of each digit always matches the QR. The "pure" number uses only
8/1. Distances k = 0, 1, 2, ... (edits 8→9, 1→7) are searched exhaustively and
the numerically smallest prime at the first k that has one is kept.
"""
import itertools
import sys
import time
from pathlib import Path

import gmpy2
import segno

TEXT = "Я простое число."
HERE = Path(__file__).resolve().parent
QUIET = 4  # quiet zone, modules
CELL = 10  # SVG user units per module
# Inks stay within 24 luma levels of their cell (ZXing HybridBinarizer's
# MIN_DYNAMIC_RANGE): stronger inks get resolved as strokes at >=14 px/module
# and the module-centre sample lands on the glyph, breaking the scan.
DARK, DARK_INK = "#111111", "#282828"
LIGHT, LIGHT_INK = "#f3efe4", "#dfd9ca"
FONT = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'DejaVu Sans Mono', monospace"


def qr_matrix():
    # segno would encode Cyrillic as Shift_JIS unless UTF-8 is forced.
    # mask=5 is segno's own choice for this text, pinned for reproducibility.
    qr = segno.make(TEXT, encoding="utf-8", eci=False, version=2, error="L",
                    boost_error=False, mask=5, micro=False)
    assert (qr.version, qr.error, qr.mask, qr.mode) == (2, "L", 5, "byte")
    return [[bool(m) for m in row] for row in qr.matrix]  # no quiet zone


def find_prime(pure):
    n = len(pure)
    base = gmpy2.mpz(pure)
    step = [gmpy2.mpz(1 if d == "8" else 6) * gmpy2.mpz(10) ** (n - 1 - i)
            for i, d in enumerate(pure)]
    forced = [n - 1] if pure[-1] == "8" else []  # an even number is never prime
    free = [i for i in range(n) if i not in forced]
    tested, t0 = 0, time.perf_counter()
    for k in range(len(forced), n + 1):
        hits = []
        for combo in itertools.combinations(free, k - len(forced)):
            cand = base + sum((step[i] for i in (*forced, *combo)), gmpy2.mpz(0))
            tested += 1
            if gmpy2.is_prime(cand):  # trial division + BPSW (GMP)
                hits.append(cand)
        if hits:
            stats = dict(distance=k, tested=tested, primes_at_distance=len(hits),
                         seconds=round(time.perf_counter() - t0, 2))
            return str(min(hits)), stats


def to_svg(lines):
    n = len(lines)
    size = (n + 2 * QUIET) * CELL
    runs = []
    for r, row in enumerate(lines):
        c = 0
        for dark, grp in itertools.groupby(row, key=lambda ch: ch in "89"):
            w = len(list(grp))
            if dark:
                runs.append(f"M{(c + QUIET) * CELL} {(r + QUIET) * CELL}h{w * CELL}v{CELL}h-{w * CELL}z")
            c += w
    xs = " ".join(str((c + QUIET) * CELL + CELL // 2) for c in range(n))
    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" '
        f'viewBox="0 0 {size} {size}" role="img" aria-label="QR: {TEXT}">',
        f'<rect width="{size}" height="{size}" fill="{LIGHT}" shape-rendering="crispEdges"/>',
        f'<path fill="{DARK}" shape-rendering="crispEdges" d="{"".join(runs)}"/>',
        f'<g font-family="{FONT}" font-size="7" text-anchor="middle">',
    ]
    # One <text> per row keeps the digits selectable/copyable as the number itself.
    for r, row in enumerate(lines):
        spans = "".join(
            f'<tspan fill="{DARK_INK if dark else LIGHT_INK}">{"".join(grp)}</tspan>'
            for dark, grp in itertools.groupby(row, key=lambda ch: ch in "89"))
        out.append(f'<text x="{xs}" y="{(r + QUIET) * CELL + 7.5:g}">{spans}</text>')
    out.append("</g>\n</svg>\n")
    return "\n".join(out)


def render(lines, px, digits=True, blur=0.0):
    from PIL import Image, ImageDraw, ImageFilter, ImageFont
    size = (len(lines) + 2 * QUIET) * px
    img = Image.new("RGB", (size, size), LIGHT)
    draw = ImageDraw.Draw(img)
    font = ImageFont.truetype("DejaVuSansMono.ttf", max(1, round(px * 0.7)))
    for r, row in enumerate(lines):
        for c, ch in enumerate(row):
            x, y, dark = (c + QUIET) * px, (r + QUIET) * px, ch in "89"
            if dark:
                draw.rectangle([x, y, x + px - 1, y + px - 1], fill=DARK)
            if digits:
                draw.text((x + px / 2, y + px / 2), ch, font=font, anchor="mm",
                          fill=DARK_INK if dark else LIGHT_INK)
    return img.filter(ImageFilter.GaussianBlur(blur * px)) if blur else img


def check(lines):
    import zxingcpp
    ok = True
    cases = [("classes only", 8, False, 0)] + [(f"digits {px}px", px, True, 0) for px in (4, 8, 16, 24, 40, 64)]
    cases += [("digits 8px blur 0.3", 8, True, 0.3), ("digits 16px blur 0.4", 16, True, 0.4)]
    for name, px, digits, blur in cases:
        img = render(lines, px, digits, blur)
        # try_downscale=False mimics single-scale decoders such as Java ZXing.
        for label, kw in (("", {}), (", no downscale", {"try_downscale": False})):
            texts = [b.text for b in zxingcpp.read_barcodes(img, **kw)]
            good = texts == [TEXT]
            ok &= good
            print(f"  {'✓' if good else '✗'} {name}{label}: {texts}")
    return ok


def main():
    matrix = qr_matrix()
    n = len(matrix)
    pure = "".join("8" if m else "1" for row in matrix for m in row)
    digits, stats = find_prime(pure)
    lines = [digits[i:i + n] for i in range(0, n * n, n)]
    assert all((a in "89") == (b == "8") for a, b in zip(digits, pure))
    (HERE / "prime.txt").write_text("\n".join(lines) + "\n")
    (HERE / "qr.svg").write_text(to_svg(lines))
    changes = [(i // n, i % n, a, b) for i, (a, b) in enumerate(zip(pure, digits)) if a != b]
    print(f"{n}x{n} = {n * n} digits; search: {stats}")
    print("changes (row, col, from, to), 0-based:", changes)
    if "--check" in sys.argv and not check(lines):
        sys.exit(1)


if __name__ == "__main__":
    main()
