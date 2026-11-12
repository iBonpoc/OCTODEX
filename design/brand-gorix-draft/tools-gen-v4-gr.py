#!/usr/bin/env python3
"""GR monogram drafts (v4, 12.11.2026): same stroke and corners as the route G, straight G terminal (no Gatorade-like slant).
Run: python3 tools-gen-v4-gr.py design/brand-gorix-draft"""
import sys, pathlib
root = pathlib.Path(sys.argv[1]) / 'v4'
SW, ACC, BG = 112, '#FBFF00', '#0B0C0F'
T, B, MID = 288, 736, 512           # centerlines: top, bottom, bar / R bowl bottom
def rr(r): return f'{r} {r} 0 0 0'
def rcw(r): return f'{r} {r} 0 0 1'

def shared():
    """A: G and R share one stem; the G bar runs through the stem and becomes the bottom of the R bowl — one route."""
    gl, st, br, rc, rb = 200, 600, 800, 170, 112
    g = f'M480 {T} H{gl+rc} A{rr(rc)} {gl} {T+rc} V{B-rc} A{rr(rc)} {gl+rc} {B} H{st-rc} A{rr(rc)} {st} {B-rc} V{T}'
    bowl = f'M{st} {T} H{br-rb} A{rcw(rb)} {br} {T+rb} V{MID-rb} A{rcw(rb)} {br-rb} {MID} H460'
    leg = f'<path d="M{br-120} {MID-SW/2} L{br+28} {B+SW/2} H{br-100} L{br-240} {MID-SW/2} Z"/>'
    return [g, bowl], leg, (370, MID, 58)

def pair():
    """B: two letters side by side, same stroke, gap between them."""
    gl, gr_, rc = 150, 470, 150
    rs, rbx, rb = 600, 840, 112
    g = f'M{gr_-40} {T} H{gl+rc} A{rr(rc)} {gl} {T+rc} V{B-rc} A{rr(rc)} {gl+rc} {B} H{gr_-rc+40} A{rr(rc-40)} {gr_} {B-rc+40} V{MID} H{gr_-90}'
    r = f'M{rs} {B+SW/2} V{T} H{rbx-rb} A{rcw(rb)} {rbx} {T+rb} V{MID-rb} A{rcw(rb)} {rbx-rb} {MID} H{rs}'
    leg = f'<path d="M{rbx-130} {MID-SW/2} L{rbx+30} {B+SW/2} H{rbx-90} L{rbx-250} {MID-SW/2} Z"/>'
    return [g, r], leg, (300, MID, 50)

def mark(kind, ink, bg=None, dot_ring=None):
    paths, leg, (cx, cy, r) = shared() if kind == 'shared' else pair()
    bgr = f'<rect width="1024" height="1024" fill="{bg}"/>' if bg else ''
    ring = f'<circle cx="{cx}" cy="{cy}" r="{round(r*1.25)}" fill="{dot_ring}"/>' if dot_ring else ''
    p = ''.join(f'<path d="{d}"/>' for d in paths)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"><title>GoRix GR monogram v4 · {kind}</title>{bgr}'
            f'<g fill="none" stroke="{ink}" stroke-width="{SW}" stroke-linejoin="round">{p}</g><g fill="{ink}">{leg}</g>{ring}<circle cx="{cx}" cy="{cy}" r="{r}" fill="{ACC}"/></svg>')

files = {}
for k in ('shared', 'pair'):
    files[f'gr-{k}-icon.svg'] = mark(k, '#F2F3F5', BG)
    files[f'gr-{k}-dark.svg'] = mark(k, '#F2F3F5')
    files[f'gr-{k}-light.svg'] = mark(k, '#15161A', dot_ring='#15161A')
root.mkdir(exist_ok=True)
for n, s in files.items(): (root / n).write_text(s)
print('wrote', len(files))
