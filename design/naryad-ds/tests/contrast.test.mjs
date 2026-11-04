// Тест контраста. Запуск: node tests/contrast.test.mjs
// Читает tokens/theme.css и tokens/status.css, считает WCAG 2.1 для текста по реальным фонам «Стекла».
// Падает с кодом 1, если любое сочетание ниже порога.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const theme = readFileSync(join(root, 'tokens/theme.css'), 'utf8');
const status = readFileSync(join(root, 'tokens/status.css'), 'utf8');
const MIN = 4.5;

const block = (css, sel) => { const m = css.match(new RegExp(sel.replace(/[[\]"]/g, '\\$&') + '\\s*\\{([\\s\\S]*?)\\}(?=\\s*\\[|\\s*$|\\s*:root)')); return m ? m[1] : ''; };
const vars = (css) => Object.fromEntries([...css.matchAll(/--([\w-]+)\s*:\s*([^;}]+)/g)].map(m => [m[1], m[2].trim()]));
const hex = (h) => { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const rgba = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (m) { const a = m[1].split(',').map(Number); return { c: a.slice(0, 3), a: a[3] ?? 1 }; } return { c: hex(s), a: 1 }; };
const over = (top, bot) => { const t = rgba(top); return t.c.map((v, i) => v * t.a + bot[i] * (1 - t.a)); };
const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

let failed = 0, checked = 0;
const fail = (m) => { failed++; console.error('FAIL', m); };

for (const th of ['dark', 'light']) {
  const t = vars(block(theme, `[data-theme="${th}"]`)), s = vars(block(status, `[data-theme="${th}"]`)), st = vars(status.split('[data-theme')[0]);
  if (!t.bg || !t.ink || !t.mut) { fail(`${th}: нет токенов bg/ink/mut`); continue; }
  const glows = [...(t.glow || '').matchAll(/radial-gradient\([^)]*?(rgba\([^)]+\))/g)].map(m => rgba(m[1]));
  const grounds = [['page', hex(t.page)], ['bg', hex(t.bg)], ...glows.map((g, i) => [`glow${i + 1}`, over(`rgba(${g.c.join(',')},${g.a})`, hex(t.bg))])];
  for (const [gn, gb] of grounds) {
    for (const [ln, key] of [['surf', 'surf'], ['surf2', 'surf2'], ['ov', 'ov']]) {
      const surf = over(t[key], gb);
      const pairs = [['ink', t.ink], ['mut', t.mut], ...['ok', 'info', 'warn', 'bad'].map(k => ['st-' + k + '-text', s['st-' + k + '-text']])];
      for (const [name, col] of pairs) { if (!col) { fail(`${th}: нет ${name}`); continue; } checked++; const r = cr(hex(col), surf); if (r < MIN) fail(`${th} ${name} на ${ln} над ${gn}: ${r.toFixed(2)} < ${MIN}`); }
    }
  }
  for (const k of ['ok', 'info', 'warn', 'bad']) { checked++; const r = cr(hex('#0B0C0F'), hex(st['st-' + k])); if (r < MIN) fail(`тёмный текст на заливке ${k}: ${r.toFixed(2)}`); }
  checked++; const ra = cr(hex(t['on-acc'] || '#0B0C0F'), hex(t.acc || '#FBFF00')); if (ra < MIN) fail(`текст на акценте: ${ra.toFixed(2)}`);
}
console.log(`контраст: проверено ${checked}, ошибок ${failed}`);
process.exit(failed ? 1 : 0);
