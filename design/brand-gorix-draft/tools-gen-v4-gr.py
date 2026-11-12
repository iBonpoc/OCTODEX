#!/usr/bin/env python3
"""GR monogram v4.1 (12.11.2026): exactly the letters of the GoRix logo — our G mark (straight top end, no Gatorade-like slant)
and the R of the wordmark font (Onest Bold), same scale and gap as in the logo. Run: python3 tools-gen-v4-gr.py design/brand-gorix-draft"""
import re, sys, pathlib
root = pathlib.Path(sys.argv[1]); out = root / 'v4'; out.mkdir(exist_ok=True)
word = (root / 'brand/gorix-wordmark-dark.svg').read_text()
paths = re.findall(r'<path d="([^"]+)"/>', word)                 # G, o, R, i-stem, x
R = paths[2]
G = ('M660 170 H442 A272 272 0 0 0 170 442 V582 A272 272 0 0 0 442 854 H582 A272 272 0 0 0 854 582 V450 H640 V574 H730 V582 '
     'A148 148 0 0 1 582 730 H442 A148 148 0 0 1 294 582 V442 A148 148 0 0 1 442 294 H660 Z')   # calm G, top end cut straight
DOT = (530, 512, 70)
S = 724 / 684; TX, TY = 36 - 170 * S, -716 - 170 * S              # as in the logo (v3)
INK_D, INK_L, ACC, BG = '#F2F3F5', '#15161A', '#FBFF00', '#0B0C0F'

def body(ink, ring, rdx):
    cx, cy, r = DOT
    dot = (f'<circle cx="{cx}" cy="{cy}" r="{round(r*1.25)}" fill="{ring}"/>' if ring else '') + f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{ACC}"/>'
    return (f'<g fill="{ink}"><g transform="translate({TX:.1f} {TY:.1f}) scale({S:.5f})"><path d="{G}"/></g>'
            f'<g transform="translate({rdx} 0)"><path d="{R}"/></g></g>'
            f'<g transform="translate({TX:.1f} {TY:.1f}) scale({S:.5f})">{dot}</g>')

def svg(ink, ring=None, bg=None, rdx=0, box=None, title=''):
    x, y, w, h = box
    b = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{bg}"/>' if bg else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {w} {h}"><title>{title}</title>{b}{body(ink, ring, rdx)}</svg>'

if __name__ == '__main__':
    import json
    cfg = json.loads((out / 'gr-layout.json').read_text())      # measured by the render script: rdx and boxes
    for k, c in cfg.items():
        (out / f'gr-{k}-icon.svg').write_text(svg(INK_D, None, BG, c['rdx'], c['icon'], f'GoRix GR v4.1 · {k} · app icon'))
        (out / f'gr-{k}-dark.svg').write_text(svg(INK_D, None, None, c['rdx'], c['tight'], f'GoRix GR v4.1 · {k} · dark'))
        (out / f'gr-{k}-mark-dark.svg').write_text(svg(INK_D, None, None, c['rdx'], c['icon'], f'GoRix GR v4.1 · {k} · square, no background'))
        (out / f'gr-{k}-light.svg').write_text(svg(INK_L, INK_L, None, c['rdx'], c['tight'], f'GoRix GR v4.1 · {k} · light'))
    print('wrote', 3 * len(cfg))
