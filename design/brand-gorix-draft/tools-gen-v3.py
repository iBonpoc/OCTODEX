#!/usr/bin/env python3
"""GoRix v3 assets (HANDOFF.md «v3»): ligature «[G]oRix», calm/bold marks, «Кнопка Go» sketch, three mark animations.
Run: python3 tools-gen-v3.py design/brand-gorix-draft  → writes v3/*.svg"""
import re, sys, pathlib

root = pathlib.Path(sys.argv[1]); out = root / 'v3'; out.mkdir(exist_ok=True)
INK_D, INK_L, ACC, ON_ACC, OK = '#F2F3F5', '#15161A', '#FBFF00', '#0B0C0F', '#7CE08A'

# --- marks (1024 box). Ring = the path of the G; the dot travels and is drawn separately.
RING = {
    'calm': 'M660 170 H442 A272 272 0 0 0 170 442 V582 A272 272 0 0 0 442 854 H582 A272 272 0 0 0 854 582 V450 H640 V574 H730 V582 '
            'A148 148 0 0 1 582 730 H442 A148 148 0 0 1 294 582 V442 A148 148 0 0 1 442 294 H660 Z',   # v4: top end straight (no Gatorade-like slant)
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

def intro(kind, to_gr=False, M=2000):
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
    if to_gr:   # v4: after the logo is shown, «o», «i», «x» go, R slides to the G, the dot goes back into the G → GR mark
        o, R_, ist, x_ = paths[1:5]
        rest = f'<g class="fo"><path d="{o}"/><path d="{ist}"/><path d="{x_}"/></g><g class="mr"><path d="{R_}"/></g>'
    ease = 'keyTimes="0;1" calcMode="spline" keySplines=".4 0 .6 1"'
    css_gr, morph, open_all, close_all = '', '', '<g>', '</g>'
    if to_gr:
        mdx = GR_RDX - DX                                     # R: from its place in the word to its place in GR
        shift = round(VB_W / 2 + 36 - (GR_BOX[0] + GR_BOX[2] / 2))   # keep the result centred
        gx, gy = xf(DOT[kind][0], 512)
        css_gr = (f'.gx3 .fo{{animation:gx3fo 250ms ease-in {M}ms forwards}}.gx3 .mr{{animation:gx3mr 550ms cubic-bezier(.4,0,.2,1) {M+100}ms forwards}}'
                  f'.gx3 .all{{animation:gx3all 600ms cubic-bezier(.4,0,.2,1) {M+100}ms forwards}}'
                  f'@keyframes gx3fo{{to{{opacity:0}}}}@keyframes gx3mr{{to{{transform:translateX({mdx}px)}}}}@keyframes gx3all{{to{{transform:translateX({shift}px)}}}}')
        morph = (f'<animateMotion begin="{M+100}ms" dur="600ms" fill="freeze" keyTimes="0;1" calcMode="spline" keySplines=".4 0 .2 1" '
                 f'path="M{cx} {cy} C{cx - 300} {cy} {gx + 300} {gy - 150} {gx} {gy}"/>'
                 f'<animateTransform attributeName="transform" type="scale" additive="sum" values="1;{round(DOT[kind][2] * S / r, 3)}" begin="{M+100}ms" dur="600ms" fill="freeze"/>')
        open_all = '<g class="all">'
    title = 'GoRix splash v4 · logo 1600 ms, then GoRix → GR (from 2000 ms, 700 ms)' if to_gr else 'GoRix splash v3.1 · 1600 ms, final frame = logo'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VB_W} 784" class="gx3"><title>{title}</title>'
            '<style>.gx3 .ink{fill:var(--i,#F2F3F5)}.gx3 .cover{fill:none;stroke:var(--bgc,#24272D);stroke-width:180;stroke-dasharray:1000 1000;'
            'animation:gx3un 650ms cubic-bezier(.4,0,.6,1) forwards}.gx3 .word{clip-path:inset(0 100% 0 0);animation:gx3word 450ms cubic-bezier(.2,.8,.2,1) 800ms forwards}'
            '@keyframes gx3un{to{stroke-dashoffset:-1000}}@keyframes gx3word{to{clip-path:inset(0 0 0 -2000px)}}' + css_gr + '</style>'
            f'<g transform="translate(-36 768)">{open_all}<g class="ink"><g transform="{tf}"><path d="{RING[kind]}"/><path class="cover" pathLength="1000" d="{COVER.format(x=endx)}"/></g>'
            f'<g class="word"><g transform="translate({DX} 0)">{rest}</g></g></g>'
            f'<g>{dot_live(r)}<animateMotion dur="650ms" fill="freeze" {ease} path="{head}"/>'
            f'<animateMotion begin="800ms" dur="600ms" fill="freeze" keyTimes="0;1" calcMode="spline" keySplines=".45 0 .35 1" path="{jump}"/>'
            f'<animateTransform attributeName="transform" type="scale" additive="sum" values="1;1.25;1" begin="1400ms" dur="200ms" fill="freeze"/>{morph}</g>{close_all}</g></svg>')

GR_RDX, GR_BOX = -604, (16, -736, 1363, 764)   # v4.1 «плотнее»: R of the logo font next to the G (tools-gen-v4-gr.py, v4/gr-layout.json)

def gr_wrap(svg_1024):
    """Put a 1024-box G animation next to the logo R: the waiting/done animations live on the GR mark."""
    head, inner = re.match(r'(<svg[^>]*>)(.*)</svg>', svg_1024, re.S).groups()
    title = re.search(r'<title>.*?</title>', inner).group(0); inner = inner.replace(title, '')
    cls = re.search(r'class="([^"]+)"', head)
    c = f' class="{cls.group(1)}"' if cls else ''
    x, y, w, h = GR_BOX
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {w} {h}"{c}>{title.replace("v3.1", "v4 GR")}'
            f'<g transform="translate({round(TX,1)} {round(TY,1)}) scale({round(S,5)})">{inner}</g>'
            f'<path fill="var(--i,#F2F3F5)" transform="translate({GR_RDX} 0)" d="{paths[2]}"/></svg>')

def loading(kind):
    """Waiting: the dot (with its ring, so it never melts into the letter) rides the contour of the G; the letter never rotates.
    Loop 1800 = motion.skeletonCycle; shown after spinnerDelayMs 300."""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><title>GoRix waiting v3.1 · loop 1800 ms, after spinnerDelayMs 300</title>'
            f'<path fill="var(--i,#F2F3F5)" d="{RING[kind]}"/><g>{dot_live(72)}'
            f'<animateMotion dur="1800ms" repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines=".45 0 .55 1" path="{CL.format(x=DOT[kind][0])}"/></g></svg>')

def success(kind):
    """Done — the same start as the splash: the dot draws the same G (650 ms, same easing), rests inside it,
    then grows, turns green «ok» and shows the check. Total 1200 ms. Always with the word."""
    cx, cy, r = DOT[kind]
    r = 72
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" class="gx3s"><title>GoRix done v3.1 · 1200 ms; always with the word</title>'
            '<style>.gx3s .cover{fill:none;stroke:var(--bgc,#24272D);stroke-width:180;stroke-dasharray:1000 1000;animation:gx3sun 650ms cubic-bezier(.4,0,.6,1) forwards}'
            '@keyframes gx3sun{to{stroke-dashoffset:-1000}}</style>'
            f'<path fill="var(--i,#F2F3F5)" d="{RING[kind]}"/><path class="cover" pathLength="1000" d="{COVER.format(x=cx)}"/>'
            f'<g><circle r="{round(r*1.25)}" fill="var(--ring,#24272D)"><animate attributeName="r" values="{round(r*1.25)};{round(r*1.9)};{round(r*1.6)}" begin="800ms" dur="250ms" fill="freeze"/></circle>'
            f'<circle r="{r}" fill="#FBFF00"><animate attributeName="r" values="{r};{round(r*1.6)};{round(r*1.35)}" begin="800ms" dur="250ms" fill="freeze"/>'
            f'<animate attributeName="fill" values="#FBFF00;{OK}" begin="900ms" dur="200ms" fill="freeze"/></circle>'
            f'<path d="M-46 4 l32 32 l62 -66" fill="none" stroke="{ON_ACC}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1">'
            f'<animate attributeName="stroke-dashoffset" values="1;0" begin="1000ms" dur="200ms" fill="freeze"/></path>'
            f'<animateMotion dur="650ms" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".4 0 .6 1" path="{CL.replace("M600 232", "M760 232").format(x=cx)}"/></g></svg>')

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
    'intro-calm.svg': intro('calm'), 'intro-to-gr-calm.svg': intro('calm', True), 'intro-bold.svg': intro('bold'),
    'loading-calm.svg': gr_wrap(loading('calm')), 'success-calm.svg': gr_wrap(success('calm')),
    'go-button-dark.svg': go_button(INK_D, 'Кнопка Go · dark (sketch)'), 'go-button-light.svg': go_button(INK_L, 'Кнопка Go · light (sketch)'),
    'go-icon.svg': go_icon(),
}
for n, s in files.items():
    (out / n).write_text(s)
print('wrote', len(files), 'files; DX', DX, 'S', round(S, 4))
