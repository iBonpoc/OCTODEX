// Collect text/icon/control geometry + colors and two screenshots (normal / text-hidden) per config.
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const DIR = '/home/user/OCTODEX/design';
const OUT = process.argv[2];
const only = process.argv[3] ? process.argv[3].split(',') : null;
fs.mkdirSync(OUT, { recursive: true });

const pages = fs.readdirSync(DIR).filter(f => f.endsWith('.html'));
const LAB = 'daylight-glass-direction.html';
const configs = [];
for (const p of pages) {
  const variants = p === LAB ? ['copper', 'daylight', 'blueprint', 'dusk', 'clear', 'components'] : [null];
  for (const v of variants) for (const theme of ['light', 'dark']) for (const w of [1300, 390]) {
    const id = `${p.replace('.html', '')}${v ? '__' + v : ''}__${theme}__${w}`;
    if (only && !only.some(o => id.includes(o))) continue;
    configs.push({ id, page: p, variant: v, theme, w });
  }
}

const KILL = `*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;animation-iteration-count:1!important;transition-duration:0s!important;transition-delay:0s!important;caret-color:transparent!important}
.octo-theme-fab{display:none!important}`;
const HIDE = `*,*::before,*::after{-webkit-text-fill-color:transparent!important;text-shadow:none!important;text-decoration-color:transparent!important}
::placeholder{color:transparent!important;-webkit-text-fill-color:transparent!important}
[data-gt]{background-image:none!important;background-color:transparent!important}
[data-ico]{opacity:0!important}
svg text,svg tspan{fill:transparent!important;stroke:transparent!important}`;

async function setTheme(page, cfg) {
  await page.evaluate(({ mode, lab }) => {
    const root = document.documentElement;
    if (lab) {
      root.setAttribute('data-theme', mode);
      const b = document.getElementById(mode === 'light' ? 'm-light' : 'm-dark');
      if (b) b.click();
      return;
    }
    const map = { light: ['#m-light', '#th-p', '#t-light', '[data-theme-btn="light"]'], dark: ['#m-dark', '#th-g', '#t-dark', '[data-theme-btn="dark"]'] };
    let c = null;
    for (const s of map[mode]) { const e = document.querySelector(s); if (e && !e.classList.contains('octo-theme-fab')) { c = e; break; } }
    if (!c) { for (const b of document.querySelectorAll('button')) { if (!b.classList.contains('octo-theme-fab') && b.textContent.replace(/\s+/g, ' ').trim() === (mode === 'light' ? 'Светлая' : 'Тёмная')) { c = b; break; } } }
    if (c) c.click();
    if (root.getAttribute('data-theme') !== mode) root.setAttribute('data-theme', mode);
  }, { mode: cfg.theme, lab: cfg.page === LAB });
}

function collector() {
  const out = { texts: [], icons: [], controls: [], taps: [] };
  const W = document.documentElement.clientWidth, H = document.documentElement.scrollHeight;
  const desc = el => {
    const d = e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
    const p = el.parentElement;
    return (p ? d(p) + ' > ' : '') + d(el);
  };
  const visible = el => {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') return false;
      if (e.hidden) return false;
    }
    return true;
  };
  const opac = el => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity); return o; };
  const sx = scrollX, sy = scrollY;
  const rectOK = r => r.width >= 2 && r.height >= 2 && r.right > 0 && r.bottom > 0 && r.left < W && r.top + sy < H;
  const occluded = (el, r) => {
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return false;
    const h = document.elementFromPoint(cx, cy);
    if (!h) return false;
    if (h === el || el.contains(h) || h.contains(el)) return false;
    // allow overlays that are pointer-events none? elementFromPoint already skips them
    return true;
  };
  // clipped by an overflow ancestor?
  const clipped = (el, r) => {
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.overflow !== 'visible' || cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
        const pr = e.getBoundingClientRect();
        if (r.left + r.width / 2 < pr.left || r.left + r.width / 2 > pr.right || r.top + r.height / 2 < pr.top || r.top + r.height / 2 > pr.bottom) return true;
      }
    }
    return false;
  };
  // gradient text marking
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if ((cs.webkitBackgroundClip === 'text' || cs.backgroundClip === 'text')) el.setAttribute('data-gt', '1');
  }
  // texts
  const groups = new Map();
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = tw.nextNode())) {
    if (!n.nodeValue.trim()) continue;
    const el = n.parentElement;
    if (!el || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TITLE'].includes(el.tagName)) continue;
    if (el.closest('.octo-theme-fab')) continue;
    if (el.closest('svg') && !['text', 'tspan', 'textPath'].includes(el.tagName.toLowerCase())) continue;
    const rg = document.createRange(); rg.selectNodeContents(n);
    const rs = [...rg.getClientRects()].filter(rectOK);
    if (!rs.length) continue;
    if (!groups.has(el)) groups.set(el, { rects: [], text: '' });
    const g = groups.get(el); g.rects.push(...rs); g.text += n.nodeValue.replace(/\s+/g, ' ');
  }
  for (const [el, g] of groups) {
    if (!visible(el)) continue;
    const o = opac(el); if (o < 0.05) continue;
    const cs = getComputedStyle(el);
    const insvg = !!el.closest('svg');
    const color = insvg ? cs.fill : cs.color;
    // biggest rect as representative + all
    const rects = g.rects.slice(0, 6).map(r => [r.left + sx, r.top + sy, r.width, r.height]);
    const r0 = g.rects.reduce((a, b) => a.width * a.height > b.width * b.height ? a : b);
    if (clipped(el, r0)) continue;
    if (occluded(el, r0)) continue;
    let gt = false; for (let e = el; e && e.nodeType === 1; e = e.parentElement) if (e.hasAttribute('data-gt')) { gt = true; break; }
    out.texts.push({ d: desc(el), t: g.text.trim().slice(0, 60), color, fill: cs.webkitTextFillColor, o, fs: parseFloat(cs.fontSize), fw: parseInt(cs.fontWeight), rects, gt, insvg, ts: cs.textShadow !== 'none' ? cs.textShadow : null });
  }
  // placeholders
  for (const el of document.querySelectorAll('input[placeholder],textarea[placeholder]')) {
    if (el.value || !visible(el)) continue;
    const r = el.getBoundingClientRect(); if (!rectOK(r)) continue;
    const ps = getComputedStyle(el, '::placeholder');
    out.texts.push({ d: desc(el) + '::placeholder', t: el.placeholder.slice(0, 60), color: ps.color, o: opac(el), fs: parseFloat(ps.fontSize), fw: parseInt(ps.fontWeight), rects: [[r.left + sx + 4, r.top + sy + 2, Math.max(4, r.width - 8), Math.max(4, r.height - 4)]], gt: false, ph: true });
  }
  // interactive
  const sel = 'a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=switch],[role=tab],[role=checkbox],[role=radio],[role=slider],[tabindex]:not([tabindex="-1"]),label[for],summary';
  for (const el of document.querySelectorAll(sel)) {
    if (el.classList.contains('octo-theme-fab') || !visible(el)) continue;
    const r = el.getBoundingClientRect(); if (!rectOK(r)) continue;
    if (opac(el) < 0.05) continue;
    if (clipped(el, r)) continue;
    const cs = getComputedStyle(el);
    const txt = (el.innerText || el.value || '').trim();
    const inlineLink = el.tagName === 'A' && cs.display === 'inline' && el.parentElement && [...el.parentElement.childNodes].some(c => c.nodeType === 3 && c.nodeValue.trim());
    const kind = el.matches('input,select,textarea') ? (el.type === 'checkbox' || el.type === 'radio' || el.type === 'range' ? el.type : 'field') : el.matches('[role=switch],[role=checkbox],[role=radio],[role=slider]') ? el.getAttribute('role') : 'button';
    const item = { d: desc(el), t: (txt || el.getAttribute('aria-label') || el.title || '').slice(0, 40), r: [r.left + sx, r.top + sy, r.width, r.height], kind, inlineLink, ariaLabel: el.getAttribute('aria-label') };
    out.taps.push(item);
    out.controls.push(item);
    // icon-only controls
    const svgs = el.querySelectorAll('svg');
    if (!txt && svgs.length) {
      for (const s of svgs) { const sr = s.getBoundingClientRect(); if (sr.width >= 8 && sr.height >= 8 && sr.width <= 48) { s.setAttribute('data-ico', '1'); out.icons.push({ d: desc(el) + ' svg', t: item.t, r: [sr.left + sx, sr.top + sy, sr.width, sr.height], cr: item.r }); } }
    }
  }
  return out;
}

(async () => {
  const browser = await chromium.launch();
  for (const cfg of configs) {
    const ctx = await browser.newContext({ viewport: { width: cfg.w, height: cfg.w === 390 ? 844 : 900 }, deviceScaleFactor: 1, colorScheme: cfg.theme, isMobile: false, hasTouch: cfg.w === 390 });
    const page = await ctx.newPage();
    const url = 'file://' + path.join(DIR, cfg.page) + (cfg.variant ? '#' + cfg.variant : '');
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    } catch (e) { console.error('goto', cfg.id, e.message); }
    await page.addStyleTag({ content: KILL });
    await setTheme(page, cfg);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    // grow viewport to full height
    let hgt = await page.evaluate(() => document.documentElement.scrollHeight);
    hgt = Math.min(hgt, 14000);
    await page.setViewportSize({ width: cfg.w, height: hgt });
    await page.waitForTimeout(600);
    await setTheme(page, cfg); // some pages re-sync on resize
    await page.waitForTimeout(300);
    const data = await page.evaluate(collector);
    data.cfg = cfg; data.height = hgt; data.sw = await page.evaluate(() => [document.documentElement.scrollWidth, [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 2 && !e.closest('[style*=overflow]')).slice(0, 3).map(e => e.tagName + '.' + e.className)]);
    await page.screenshot({ path: path.join(OUT, cfg.id + '__A.png') });
    const h = await page.addStyleTag({ content: HIDE });
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(OUT, cfg.id + '__B.png') });
    fs.writeFileSync(path.join(OUT, cfg.id + '.json'), JSON.stringify(data));
    console.log(cfg.id, 'texts', data.texts.length, 'taps', data.taps.length, 'icons', data.icons.length, 'h', hgt);
    await ctx.close();
  }
  await browser.close();
})();
