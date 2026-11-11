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

def dot_static(cx, cy, r, theme):
    """The one dot of the brand. Dark: plain yellow. Light: yellow inside an ink ring (yellow alone is invisible on light)."""
    ring = 'none' if theme == 'dark' else INK_L
    return f'<circle class="dr" cx="{cx}" cy="{cy}" r="{round(r*1.25)}" fill="{ring}"/><circle cx="{cx}" cy="{cy}" r="{r}" fill="{ACC}"/>'

def dot_live(r):
    """Animated dot: a ring in --ring (dark: the background, light: ink) keeps it visible while it rides over the letter."""
    return f'<circle r="{round(r*1.25)}" fill="var(--ring,#24272D)"/><circle r="{r}" fill="#FBFF00"/>'

def mark_svg(kind, theme):
    cx, cy, r = DOT[kind]
    ink = INK_D if theme == 'dark' else INK_L
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><title>GoRix mark v3 · {kind} · {theme}</title>'
            f'<path fill="{ink}" d="{RING[kind]}"/>{dot_static(cx, cy, r, theme)}</svg>')

# --- ligature: the mark replaces the G of the wordmark glyphs (Onest Bold outlines, font units, baseline y=0)
word = (root / 'brand/gorix-wordmark-dark.svg').read_text()
paths = re.findall(r'<path d="([^"]+)"/>', word)          # G, o, R, i-stem, x
S = 724 / 684                                              # mark height = G height (-716..8)
TX, TY = 36 - 170 * S, -716 - 170 * S
DX = round(36 + 684 * S + 70 - 761)                     # keep a G→o gap of 70 (Onest bold) after the wider square mark
IDOT = (2127 + DX, -660, 90)
VB_W = 2765 + DX

def xf(x, y): return (round(S * x + TX, 1), round(S * y + TY, 1))

def cl_outer(end_x, start_x=600):
    """Centerline of the mark in ligature coordinates (for the travelling dot)."""
    p = [(600, 232), (442, 232)]
    a = lambda *e: e
    pts = []
    x0, y0 = xf(start_x, 232)
    d = f'M{x0} {y0} '
    seq = [('H', 442, 232), ('A', 232, 442), ('V', 232, 582), ('A', 442, 792), ('H', 582, 792), ('A', 792, 582), ('V', 792, 512), ('H', end_x, 512)]
    for c, x, y in seq:
        X, Y = xf(x, y)
        d += (f'A{round(210*S,1)} {round(210*S,1)} 0 0 0 {X} {Y} ' if c == 'A' else f'L{X} {Y} ')
    return d.strip()

def ligature(kind, theme, title):
    ink = INK_D if theme == 'dark' else INK_L
    g = f'<g transform="translate({round(TX,1)} {round(TY,1)}) scale({round(S,5)})"><path d="{RING[kind]}"/></g>'
    rest = ''.join(f'<path d="{d}"/>' for d in paths[1:])
    cx, cy, r = IDOT
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VB_W} 784"><title>{title}</title><g transform="translate(-36 768)">'
            f'<g fill="{ink}">{g}<g transform="translate({DX} 0)">{rest}</g></g>{dot_static(cx, cy, r, theme)}</g></svg>')

COVER = 'M760 232 H442 A210 210 0 0 0 232 442 V582 A210 210 0 0 0 442 792 H582 A210 210 0 0 0 792 582 V512 H{x}'

def intro(kind):
    """Splash, 1200 ms (proposed token motion.durBrand). One G shape all the way (the real filled letter is uncovered along its
    path — no swap of shapes). 0–650 the letter appears along its path and the dot rides at the head; 650–750 the dot rests inside
    the G; 700–1000 «oRix» slides out; 750–1050 the dot jumps over to the «i»; 1050–1200 it lands. Final frame = the logo."""
    cx, cy, r = IDOT
    endx = DOT[kind][0]
    sx, sy = xf(endx, 512)
    head = cl_outer(endx, 760)
    jump = f'M{sx} {sy} C{sx + 250} {sy - 250} {cx - 350} {cy - 220} {cx} {cy}'
    tf = f'translate({round(TX,1)} {round(TY,1)}) scale({round(S,5)})'
    rest = ''.join(f'<path d="{d}"/>' for d in paths[1:])
    ease = 'keyTimes="0;1" calcMode="spline" keySplines=".4 0 .6 1"'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VB_W} 784" class="gx3"><title>GoRix splash v3.1 · 1200 ms, final frame = logo</title>'
            '<style>.gx3 .ink{fill:var(--i,#F2F3F5)}.gx3 .cover{fill:none;stroke:var(--bgc,#24272D);stroke-width:180;stroke-dasharray:1000 1000;'
            'animation:gx3un 650ms cubic-bezier(.4,0,.6,1) forwards}.gx3 .word{clip-path:inset(0 100% 0 0);animation:gx3word 300ms cubic-bezier(.2,.8,.2,1) 700ms forwards}'
            '@keyframes gx3un{to{stroke-dashoffset:-1000}}@keyframes gx3word{to{clip-path:inset(0 0 0 0)}}</style>'
            f'<g transform="translate(-36 768)"><g class="ink"><g transform="{tf}"><path d="{RING[kind]}"/><path class="cover" pathLength="1000" d="{COVER.format(x=endx)}"/></g>'
            f'<g class="word"><g transform="translate({DX} 0)">{rest}</g></g></g>'
            f'<g>{dot_live(r)}<animateMotion dur="650ms" fill="freeze" {ease} path="{head}"/>'
            f'<animateMotion begin="750ms" dur="300ms" fill="freeze" keyTimes="0;1" calcMode="spline" keySplines=".2 .8 .2 1" path="{jump}"/>'
            f'<animateTransform attributeName="transform" type="scale" additive="sum" values="1;1.25;1" begin="1050ms" dur="150ms" fill="freeze"/></g></g></svg>')

def loading(kind):
    """Waiting: the dot (with its ring, so it never melts into the letter) rides the contour of the G; the letter never rotates.
    Loop 1800 = motion.skeletonCycle; shown after spinnerDelayMs 300."""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><title>GoRix waiting v3.1 · loop 1800 ms, after spinnerDelayMs 300</title>'
            f'<path fill="var(--i,#F2F3F5)" d="{RING[kind]}"/><g>{dot_live(72)}'
            f'<animateMotion dur="1800ms" repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines=".45 0 .55 1" path="{CL.format(x=DOT[kind][0])}"/></g></svg>')

def success(kind):
    """Done: the dot rides to its place, flashes, becomes the green «ok» check (always with the word). 510 = durFast + durSlow."""
    cx, cy, r = DOT[kind]
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><title>GoRix done v3.1 · 510 ms; always with the word</title>'
            f'<path fill="var(--i,#F2F3F5)" d="{RING[kind]}"/><g><circle r="{round(r*1.25)}" fill="var(--ring,#24272D)"/><circle r="{r}" fill="#FBFF00">'
            f'<animate attributeName="r" values="{r};{round(r*1.5)};{round(r*1.2)}" begin="300ms" dur="210ms" fill="freeze"/>'
            f'<animate attributeName="fill" values="#FBFF00;{OK}" begin="380ms" dur="130ms" fill="freeze"/></circle>'
            f'<path d="M-46 4 l32 32 l62 -66" fill="none" stroke="{ON_ACC}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round" opacity="0">'
            f'<set attributeName="opacity" to="1" begin="420ms" fill="freeze"/></path>'
            f'<animateMotion dur="300ms" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".2 .8 .2 1" path="{CL.format(x=cx)}"/></g></svg>')

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
    'mark-calm-dark.svg': mark_svg('calm', 'dark'), 'mark-calm-light.svg': mark_svg('calm', 'light'),
    'mark-bold-dark.svg': mark_svg('bold', 'dark'), 'mark-bold-light.svg': mark_svg('bold', 'light'),
    'logo-calm-dark.svg': ligature('calm', 'dark', 'GoRix logo v3 · calm · dark'), 'logo-calm-light.svg': ligature('calm', 'light', 'GoRix logo v3 · calm · light'),
    'logo-bold-dark.svg': ligature('bold', 'dark', 'GoRix logo v3 · bold · dark'), 'logo-bold-light.svg': ligature('bold', 'light', 'GoRix logo v3 · bold · light'),
    'intro-calm.svg': intro('calm'), 'intro-bold.svg': intro('bold'),
    'loading-calm.svg': loading('calm'), 'success-calm.svg': success('calm'),
    'go-button-dark.svg': go_button(INK_D, 'Кнопка Go · dark (sketch)'), 'go-button-light.svg': go_button(INK_L, 'Кнопка Go · light (sketch)'),
    'go-icon.svg': go_icon(),
}
for n, s in files.items():
    (out / n).write_text(s)
print('wrote', len(files), 'files; DX', DX, 'S', round(S, 4))
