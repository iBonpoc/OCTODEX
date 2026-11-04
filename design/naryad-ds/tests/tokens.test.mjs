// Тест токенов и правил. Запуск: node tests/tokens.test.mjs
// Проверяет, что обязательные токены есть, размеры соответствуют правилам, а в файлах нет запрещённого.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(root, p), 'utf8');
let failed = 0, checked = 0;
const ok = (cond, msg) => { checked++; if (!cond) { failed++; console.error('FAIL', msg); } };

for (const f of ['tokens/theme.css', 'tokens/status.css', 'tokens/foundation.css', 'tokens/icons.json', 'tokens/Tokens.swift', 'styles.css', 'CLAUDE.md', 'HANDOFF.md', 'CHECKLIST.md', 'CONTRAST.md']) ok(existsSync(join(root, f)), `нет файла ${f}`);

const theme = rd('tokens/theme.css'), found = rd('tokens/foundation.css'), status = rd('tokens/status.css');
for (const v of ['--acc', '--on-acc', '--r', '--ri', '--blur', '--blurov', '--bg', '--ink', '--mut', '--surf', '--surf2', '--in', '--bd', '--ov']) ok(theme.includes(v + ':'), `нет токена ${v} в theme.css`);
for (const v of ['--fs-display', '--fs-title', '--fs-heading', '--fs-body', '--fs-caption', '--fs-micro', '--control-sm', '--control-md', '--control-lg', '--hit-min', '--tabbar-h', '--safe-bottom', '--statusbar-h', '--dur-fast', '--ease-spring', '--space-1', '--space-8', '--shadow-pop', '--scrim']) ok(found.includes(v + ':'), `нет токена ${v} в foundation.css`);
for (const v of ['--st-ok:', '--st-info:', '--st-warn:', '--st-bad:', '--st-ok-text:', '--st-bad-text:']) ok(status.includes(v), `нет ${v} в status.css`);

const num = (name) => parseFloat((found.match(new RegExp(name + ':\\s*([\\d.]+)px')) || [])[1]);
ok(num('--hit-min') >= 44, 'зона нажатия меньше 44');
ok(num('--control-lg') <= 36, 'кнопка выше 36');
ok(num('--control-md-phone') <= 36, 'видимая кнопка на телефоне выше 36');ok(num('--field-phone') >= 44, 'поле на телефоне ниже 44');ok(num('--fab') <= 36, 'плавающая кнопка выше 36');
ok(num('--fs-micro') >= 10.5 && num('--fs-body') >= 13, 'шрифт меньше допустимого');
ok(num('--tabbar-h') === 56 && num('--safe-bottom') === 34 && num('--statusbar-h') === 44, 'нижняя панель, безопасная зона или строка статуса изменены');

ok(!/data-style=|matte|soft/i.test(theme), 'в theme.css остались стили «матовый» или «мягкий»');
const icons = JSON.parse(rd('tokens/icons.json')).icons;
ok(Object.keys(icons).length >= 30, 'иконок меньше 30');
for (const k of ['phone', 'pin', 'message', 'sms', 'mail', 'camera', 'mic', 'calendar', 'home', 'search', 'bell', 'route', 'copy', 'undo', 'trash', 'invoice', 'clock', 'close']) ok(!!icons[k], `нет иконки ${k}`);
ok(/Color\(hex: 0xFBFF00\)/.test(rd('tokens/Tokens.swift')), 'в Tokens.swift нет акцента');
ok(/9CF0A8/.test(rd('tokens/Tokens.swift')) && /9CF0A8/i.test(status), 'цвет статуса в Tokens.swift не совпадает с status.css');
ok(/CDD1DA/i.test(theme) && /CDD1DA/i.test(rd('tokens/Tokens.swift')), '--mut в Tokens.swift не совпадает с theme.css');
console.log(`токены: проверено ${checked}, ошибок ${failed}`);
process.exit(failed ? 1 : 0);
