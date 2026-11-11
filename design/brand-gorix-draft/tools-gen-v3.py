#!/usr/bin/env python3
"""GoRix v3 assets (HANDOFF.md «v3»): ligature «[G]oRix», calm/bold marks, «Кнопка Go» sketch, three mark animations.
Run: python3 tools-gen-v3.py design/brand-gorix-draft  → writes v3/*.svg"""
import re, sys, pathlib

root = pathlib.Path(sys.argv[1]); out = root / 'v3'; out.mkdir(exist_ok=True)
INK_D, INK_L, ACC, ON_ACC, OK = '#F2F3F5', '#15161A', '#FBFF00', '#0B0C0F', '#7CE08A'

# --- marks (1024 box). Ring = the path of the G; the dot travels and is drawn separately.
RING = {
    'calm': 'M730 170 H442 A272 272 0 0 0 170 442 V582 A272 272 0 0 0 442 854 H582 A272 272 0 0 0 854 582 V450 H640 V574 H730 V582 '
            'A148 148 0 0 1 582 730 H442 A148 148 0 0 1 294 582 V442 A148 148 0 0 1 442 294 H600 Z',
    'bold': 'M600 170 H442 A272 272 0 0 0 170 442 V582 A272 272 0 0 0 442 854 H582 A272 272 0 0 0 854 582 V450 H690 V574 H730 V582 '
            'A148 148 0 0 1 582 730 H442 A148 148 0 0 1 294 582 V442 A148 148 0 0 1 442 294 H600 L716 232 Z',
}
DOT = {'calm': (530, 512, 70), 'bold': (560, 512, 82)}
CL = 'M600 232 H442 A210 210 0 0 0 232 442 V582 A210 210 0 0 0 442 792 H582 A210 210 0 0 0 792 582 V512 H{x}'

def mark_svg(kind, ink, dot):
    cx, cy, r = DOT[kind]
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><title>GoRix mark v3 · {kind}</title>'
            f'<path fill="{ink}" d="{RING[kind]}"/><circle cx="{cx}" cy="{cy}" r="{r}" fill="{dot}"/></svg>')

# --- ligature: the mark replaces the G of the wordmark glyphs (Onest Bold outlines, font units, baseline y=0)
word = (root / 'brand/gorix-wordmark-dark.svg').read_text()
paths = re.findall(r'<path d="([^"]+)"/>', word)          # G, o, R, i-stem, x
S = 724 / 684                                              # mark height = G height (-716..8)
TX, TY = 36 - 170 * S, -716 - 170 * S
DX = round(36 + 684 * S + 70 - 761)                     # keep a G→o gap of 70 (Onest bold) after the wider square mark
IDOT = (2127 + DX, -660, 90)
VB_W = 2765 + DX

def xf(x, y): return (round(S * x + TX, 1), round(S * y + TY, 1))

def cl_outer(end_x):
    """Centerline of the mark in ligature coordinates (for the travelling dot)."""
    p = [(600, 232), (442, 232)]
    a = lambda *e: e
    pts = []
    x0, y0 = xf(600, 232)
    d = f'M{x0} {y0} '
    seq = [('H', 442, 232), ('A', 232, 442), ('V', 232, 582), ('A', 442, 792), ('H', 582, 792), ('A', 792, 582), ('V', 792, 512), ('H', end_x, 512)]
    for c, x, y in seq:
        X, Y = xf(x, y)
        d += (f'A{round(210*S,1)} {round(210*S,1)} 0 0 0 {X} {Y} ' if c == 'A' else f'L{X} {Y} ')
    return d.strip()

def ligature(kind, ink, dot, title):
    g = f'<g transform="translate({round(TX,1)} {round(TY,1)}) scale({round(S,5)})"><path d="{RING[kind]}"/></g>'
    rest = ''.join(f'<path d="{d}"/>' for d in paths[1:])
    cx, cy, r = IDOT
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VB_W} 784"><title>{title}</title><g transform="translate(-36 768)">'
            f'<g fill="{ink}">{g}<g transform="translate({DX} 0)">{rest}</g></g><circle cx="{cx}" cy="{cy}" r="{r}" fill="{dot}"/></g></svg>')

def intro(kind):
    """Splash: path draws → dot rides it → «oRix» slides out → dot lands over the «i». 900 ms = durChart. Final frame = logo."""
    cx, cy, r = IDOT
    endx = DOT[kind][0]
    ride = cl_outer(endx) + f' C{xf(900,512)[0]} {xf(900,512)[1]} {cx-300} {cy-160} {cx} {cy}'
    g_fill = f'<g transform="translate({round(TX,1)} {round(TY,1)}) scale({round(S,5)})"><path class="fill" d="{RING[kind]}"/><path class="draw" pathLength="1000" fill="none" stroke-width="124" d="{CL.format(x=endx)}"/></g>'
    rest = ''.join(f'<path d="{d}"/>' for d in paths[1:])
    rx = round(xf(854, 0)[0] + 20)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VB_W} 784" class="gx3"><title>GoRix splash v3 · 900 ms, final frame = logo</title>'
            '<style>.gx3{--i:#F2F3F5;--d:#FBFF00}.gx3 .ink{fill:var(--i)}.gx3 .draw{stroke:var(--i);stroke-dasharray:1000;stroke-dashoffset:1000;animation:gx3draw 400ms cubic-bezier(.2,.8,.2,1) forwards}'
            '.gx3 .fill{opacity:0;animation:gx3in 160ms linear 380ms forwards}.gx3 .word{clip-path:inset(0 100% 0 0);animation:gx3word 400ms cubic-bezier(.2,.8,.2,1) 350ms forwards}'
            '@keyframes gx3draw{to{stroke-dashoffset:0}}@keyframes gx3in{to{opacity:1}}@keyframes gx3word{to{clip-path:inset(0 0 0 0)}}'
            '.gx3.still .draw,.gx3.still .fill,.gx3.still .word{animation:none;stroke-dashoffset:0;opacity:1;clip-path:none}</style>'
            f'<g transform="translate(-36 768)"><g class="ink">{g_fill}<g class="word"><g transform="translate({DX} 0)">{rest}</g></g></g>'
            f'<circle r="{r}" fill="var(--d)" cx="0" cy="0"><animateMotion dur="600ms" begin="150ms" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".45 .05 .25 1" path="{ride}"/>'
            f'<animate attributeName="r" values="{r};{round(r*1.3)};{r}" begin="750ms" dur="150ms" fill="freeze"/></circle></g></svg>')

def loading(kind):
    """Waiting: the dot rides the contour of the G around and around; the letter itself never rotates. Loop 1250."""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><title>GoRix waiting v3 · loop 1250 ms, after spinnerDelayMs 300</title>'
            f'<path fill="var(--i,#F2F3F5)" d="{RING[kind]}"/><circle r="64" fill="var(--d,#FBFF00)">'
            f'<animateMotion dur="1250ms" repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines=".45 0 .55 1" path="{CL.format(x=DOT[kind][0])}"/></circle></svg>')

def success(kind):
    """Done: the dot arrives, flashes yellow, becomes the green «ok» check (always with the word). 510 = durFast + durSlow."""
    cx, cy, r = DOT[kind]
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><title>GoRix done v3 · 510 ms; always with the word</title>'
            f'<path fill="var(--i,#F2F3F5)" d="{RING[kind]}"/><g><circle r="{r}" fill="var(--d,#FBFF00)">'
            f'<animateMotion dur="300ms" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".2 .8 .2 1" path="{CL.format(x=cx)}"/>'
            f'<animate attributeName="r" values="{r};{round(r*1.6)};{round(r*1.35)}" begin="300ms" dur="210ms" fill="freeze"/>'
            f'<animate attributeName="fill" values="var(--d,#FBFF00);{OK}" begin="380ms" dur="130ms" fill="freeze"/></circle>'
            f'<path d="M{cx-48} {cy+4} l34 34 l64 -70" fill="none" stroke="{ON_ACC}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round" opacity="0">'
            f'<set attributeName="opacity" to="1" begin="420ms" fill="freeze"/></path></g></svg>')

def go_button(ink, title):
    """Second direction (sketch): «Go» in the yellow pill of the main button + «Rix» in ink."""
    pill = '<rect x="-40" y="-860" width="1420" height="990" rx="495" fill="#FBFF00"/>'
    go = ''.join(f'<path d="{d}"/>' for d in paths[:2])
    rix = ''.join(f'<path d="{d}"/>' for d in paths[2:])
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2900 1000" width="2900" height="1000"><title>{title}</title><g transform="translate(60 880)">{pill}'
            f'<g fill="{ON_ACC}">{go}</g><g fill="{ink}" transform="translate(130 0)">{rix}<circle cx="2127" cy="-660" r="90"/></g></g></svg>')

def go_icon():
    g = paths[0]
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"><title>Кнопка Go · icon sketch</title><rect width="1024" height="1024" fill="#FBFF00"/>'
            f'<g transform="translate(205 822) scale(0.92)" fill="{ON_ACC}"><path d="{g}"/></g></svg>')

files = {
    'mark-calm-dark.svg': mark_svg('calm', INK_D, ACC), 'mark-calm-light.svg': mark_svg('calm', INK_L, INK_L),
    'mark-bold-dark.svg': mark_svg('bold', INK_D, ACC), 'mark-bold-light.svg': mark_svg('bold', INK_L, INK_L),
    'logo-calm-dark.svg': ligature('calm', INK_D, ACC, 'GoRix logo v3 · calm · dark'), 'logo-calm-light.svg': ligature('calm', INK_L, INK_L, 'GoRix logo v3 · calm · light'),
    'logo-bold-dark.svg': ligature('bold', INK_D, ACC, 'GoRix logo v3 · bold · dark'), 'logo-bold-light.svg': ligature('bold', INK_L, INK_L, 'GoRix logo v3 · bold · light'),
    'intro-calm.svg': intro('calm'), 'intro-bold.svg': intro('bold'),
    'loading-calm.svg': loading('calm'), 'success-calm.svg': success('calm'),
    'go-button-dark.svg': go_button(INK_D, 'Кнопка Go · dark (sketch)'), 'go-button-light.svg': go_button(INK_L, 'Кнопка Go · light (sketch)'),
    'go-icon.svg': go_icon(),
}
for n, s in files.items():
    (out / n).write_text(s)
print('wrote', len(files), 'files; DX', DX, 'S', round(S, 4))
