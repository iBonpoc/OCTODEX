import json, glob, os, re, sys
import numpy as np
from PIL import Image

OUT = sys.argv[1]

def parse(c):
    if not c: return None
    c = c.strip()
    m = re.match(r'rgba?\(([^)]+)\)', c)
    if m:
        p = [x for x in re.split(r'[ ,/]+', m.group(1)) if x]
        r, g, b = [float(x) for x in p[:3]]
        a = float(p[3]) if len(p) > 3 else 1.0
        return (r, g, b, a)
    m = re.match(r'color\(srgb ([^)]+)\)', c)
    if m:
        p = [x for x in re.split(r'[ /]+', m.group(1)) if x]
        r, g, b = [float(x) * 255 for x in p[:3]]
        a = float(p[3]) if len(p) > 3 else 1.0
        return (r, g, b, a)
    return None

def lin(v):
    v = np.asarray(v, dtype=float) / 255.0
    return np.where(v <= 0.04045, v / 12.92, ((v + 0.055) / 1.055) ** 2.4)

def lum(rgb):
    l = lin(rgb)
    return 0.2126 * l[..., 0] + 0.7152 * l[..., 1] + 0.0722 * l[..., 2]

def cr(l1, l2):
    hi = np.maximum(l1, l2); lo = np.minimum(l1, l2)
    return (hi + 0.05) / (lo + 0.05)

def hexc(rgb):
    return '#%02x%02x%02x' % tuple(int(round(max(0, min(255, x)))) for x in rgb[:3])

def crop(img, r, pad=0):
    x, y, w, h = r
    H, W = img.shape[:2]
    x0, y0 = int(max(0, np.floor(x - pad))), int(max(0, np.floor(y - pad)))
    x1, y1 = int(min(W, np.ceil(x + w + pad))), int(min(H, np.ceil(y + h + pad)))
    if x1 <= x0 or y1 <= y0: return None
    return img[y0:y1, x0:x1, :3].reshape(-1, 3)

results = {}
for jf in sorted(glob.glob(os.path.join(OUT, '*.json'))):
    if jf.endswith('results.json'): continue
    d = json.load(open(jf))
    cfg = d['cfg']; cid = cfg['id']
    A = np.asarray(Image.open(os.path.join(OUT, cid + '__A.png')).convert('RGB')).astype(float)
    B = np.asarray(Image.open(os.path.join(OUT, cid + '__B.png')).convert('RGB')).astype(float)
    fails = []; n_text = 0; small_text = []
    for t in d['texts']:
        bgp = [crop(B, r) for r in t['rects']]
        bgp = [p for p in bgp if p is not None and len(p)]
        if not bgp: continue
        bgp = np.concatenate(bgp)
        fgp = np.concatenate([p for p in (crop(A, r) for r in t['rects']) if p is not None])
        bg = np.median(bgp, axis=0)
        bgl = lum(bg)
        col = parse(t['color']) if t.get('insvg') else parse(t.get('fill')) if t.get('fill') and parse(t.get('fill')) and parse(t.get('fill'))[3] > 0 else parse(t['color'])
        # pixel-measured: near-ink pixels
        pc = cr(lum(fgp), bgl)
        pix = float(np.percentile(pc, 98)) if len(pc) else None
        if t.get('gt') or col is None:
            ratio = pix; fg = None; method = 'pixel'
        else:
            a = col[3] * t['o']
            fg = np.array(col[:3]) * a + bg * (1 - a)
            ratio = float(cr(lum(fg), bgl)); method = 'computed'
            # worst-case over busy backgrounds
        worst = float(np.percentile(cr(lum(fg), lum(bgp)), 5)) if fg is not None else None
        n_text += 1
        large = t['fs'] >= 24 or (t['fs'] >= 18.66 and t['fw'] >= 700)
        thr = 3.0 if large else 4.5
        if cfg['w'] == 390 and t['fs'] < 12: small_text.append((t['t'], t['fs']))
        if ratio is not None and ratio < thr:
            fails.append(dict(d=t['d'], t=t['t'], fs=t['fs'], fw=t['fw'], fg=hexc(fg) if fg is not None else 'grad', col=t['color'], o=round(t['o'], 2), bg=hexc(bg), ratio=round(ratio, 2), worst=round(worst, 2) if worst else None, pix=round(pix, 2) if pix else None, thr=thr, method=method))
    # icons
    ifails = []
    for ic in d['icons']:
        bgp = crop(B, ic['r']); fgp = crop(A, ic['r'])
        if bgp is None: continue
        bg = np.median(bgp, axis=0)
        r = float(np.percentile(cr(lum(fgp), lum(bg)), 97))
        if r < 3: ifails.append(dict(d=ic['d'], t=ic['t'], bg=hexc(bg), ratio=round(r, 2)))
    # controls boundary
    cfails = []; bfails = []
    for c in d['controls']:
        if c.get('inlineLink'): continue
        x, y, w, h = c['r']
        if w < 8 or h < 8: continue
        ring = [crop(A, (x - 5, y + h * .3, 3, h * .4)), crop(A, (x + w + 2, y + h * .3, 3, h * .4)), crop(A, (x + w * .3, y - 5, w * .4, 3)), crop(A, (x + w * .3, y + h + 2, w * .4, 3))]
        ring = [p for p in ring if p is not None and len(p)]
        if not ring: continue
        sur = np.median(np.concatenate(ring), axis=0)
        edges = [crop(A, (x + .5, y + h * .3, 1.5, h * .4)), crop(A, (x + w - 2, y + h * .3, 1.5, h * .4)), crop(A, (x + w * .3, y + .5, w * .4, 1.5)), crop(A, (x + w * .3, y + h - 2, w * .4, 1.5))]
        best = 1.0
        for e in edges:
            if e is not None and len(e): best = max(best, float(cr(lum(np.median(e, axis=0)), lum(sur))))
        inner = crop(B, (x + w * .2, y + h * .25, w * .6, h * .5))
        if inner is not None and len(inner): best = max(best, float(cr(lum(np.median(inner, axis=0)), lum(sur))))
        item = dict(d=c['d'], t=c['t'], kind=c['kind'], sur=hexc(sur), ratio=round(best, 2), w=round(w), h=round(h))
        if best < 3:
            (cfails if c['kind'] in ('field', 'switch', 'checkbox', 'radio', 'slider', 'range') else bfails).append(item)
    taps = []
    if cfg['w'] == 390:
        for c in d['taps']:
            if c.get('inlineLink'): continue
            x, y, w, h = c['r']
            if w < 44 or h < 44: taps.append(dict(d=c['d'], t=c['t'], w=round(w), h=round(h)))
    results[cid] = dict(cfg=cfg, n_text=n_text, fails=fails, icon_fails=ifails, ctrl_fails=cfails, btn_boundary=bfails, taps=taps, n_taps=len(d['taps']), small_text=small_text)
    print(cid, 'text', n_text, 'fail', len(fails), 'icon', len(ifails), 'ctrl', len(cfails), 'btnb', len(bfails), 'taps<44', len(taps), 'small', len(small_text))
json.dump(results, open(os.path.join(OUT, 'results.json'), 'w'), ensure_ascii=False, indent=1)
