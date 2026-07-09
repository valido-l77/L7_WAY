#!/bin/bash
# Rebuilds THE_EMERALD_TABLET.pdf from THE_EMERALD_TABLET.md.
#
# Why this isn't a plain `pandoc foo.md -o foo.pdf`:
#   - emerald-header.tex maps ~90 special Unicode characters (I Ching
#     hexagrams, alchemical symbols, Hebrew letters, trigrams, zodiac/
#     planet glyphs) to specific installed fonts, since the default
#     LaTeX font has none of them.
#   - Pandoc's LaTeX table writer estimates column widths from raw
#     source markup length (counting $, \sqrt{}, etc.) rather than
#     rendered width, which badly miscalculates for tables mixing plain
#     text with math and causes cells to overlap. table-to-tabular.lua
#     forces natural-width columns instead; the sed/python step below
#     then converts pandoc's longtable output (which can't be resized)
#     to plain tabular wrapped in \resizebox, so any table that's still
#     too wide for the page shrinks to fit instead of overflowing.
#
# Requires: pandoc, tectonic (both via `brew install`), Noto Sans
# Symbols 2 (`brew install --cask font-noto-sans-symbols-2`) for I Ching
# hexagram glyphs. CJK, Hebrew, and other symbol coverage comes from
# fonts already built into macOS (Hiragino Sans, SF Hebrew, Apple
# Symbols).

set -euo pipefail
cd "$(dirname "$0")"

RAW=$(mktemp /tmp/emerald-raw-XXXX.tex)
FIXED=$(mktemp /tmp/emerald-fixed-XXXX.tex)
trap 'rm -f "$RAW" "$FIXED"' EXIT

pandoc THE_EMERALD_TABLET.md -t latex --standalone \
  -H emerald-header.tex \
  --lua-filter=table-to-tabular.lua \
  --toc --toc-depth=2 \
  -V geometry:margin=2.2cm -V fontsize=11pt \
  -V colorlinks=true -V linkcolor=blue \
  -o "$RAW"

python3 - "$RAW" "$FIXED" << 'PYEOF'
import re, sys

with open(sys.argv[1], encoding='utf-8') as f:
    text = f.read()

pattern = re.compile(
    r'\{\\def\\LTcaptype\{none\} % do not increment counter\n'
    r'\\begin\{longtable\}\[\]\{(?P<colspec>[^\n]*)\}\n'
    r'(?P<body>.*?)'
    r'\\end\{longtable\}\n\}',
    re.DOTALL
)

def transform(m):
    colspec = m.group('colspec')
    lines = m.group('body').split('\n')
    out, bottomrule_line = [], None
    for line in lines:
        stripped = line.strip()
        if stripped in ('\\endhead', '\\endfirsthead', '\\endfoot', '\\endlastfoot'):
            continue
        if stripped == '\\bottomrule\\noalign{}' and bottomrule_line is None:
            bottomrule_line = line
            continue
        out.append(line)
    new_body = '\n'.join(out).rstrip('\n')
    if bottomrule_line is not None:
        new_body += '\n' + bottomrule_line
    return (
        '\\resizebox{\\linewidth}{!}{%\n'
        f'\\begin{{tabular}}{{{colspec}}}\n'
        f'{new_body}\n'
        '\\end{tabular}\n}'
    )

new_text, n = pattern.subn(transform, text)
sys.stderr.write(f'Tables converted: {n}\n')
with open(sys.argv[2], 'w', encoding='utf-8') as f:
    f.write(new_text)
PYEOF

tectonic "$FIXED" --outfmt pdf -o .
mv "$(basename "${FIXED%.tex}").pdf" THE_EMERALD_TABLET.pdf

python3 << 'PYEOF'
from pypdf import PdfReader, PdfWriter
r = PdfReader('THE_EMERALD_TABLET.pdf')
w = PdfWriter()
for p in r.pages:
    w.add_page(p)
w.add_metadata({
    '/Title': 'The Emerald Tablet: The Theorem of All Theorems',
    '/Author': 'Alberto Valido Delgado & Claude Opus',
    '/Subject': 'Correspondences between quantum mechanics, the I Ching, Kabbalah, alchemy, astrology, and other traditions',
})
with open('THE_EMERALD_TABLET.pdf', 'wb') as f:
    w.write(f)
print(f'THE_EMERALD_TABLET.pdf: {len(r.pages)} pages')
PYEOF
