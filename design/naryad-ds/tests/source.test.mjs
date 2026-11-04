// Тест исходников. Запуск: node tests/source.test.mjs
// Проверяет, что оба файла (прототип и дизайн-система) следуют правилам, которые видны в коде:
// иконки вместо надписей у контактных действий, подписи у иконок-кнопок, шрифты и размеры из токенов,
// нет смешанных стилей «объект + литерал», у полей и иконок есть подписи.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = ['Наряд CRM.dc.html', 'Наряд Design System.dc.html'];
const SCALE = new Set(['28', '20', '15', '13', '11.5', '10.5']);
const ICON_ONLY = ['Позвонить', 'SMS', 'Почта', 'Написать', 'Маршрут', 'Квитанция', 'Скопировать ссылку', 'Отложить'];
let failed = 0, checked = 0;
const ok = (c, m) => { checked++; if (!c) { failed++; console.error('FAIL', m); } };

for (const f of files) {
  const t = readFileSync(join(root, f), 'utf8');
  const tpl = t.slice(t.indexOf('<x-dc'), t.indexOf('</x-dc>'));
  // 1. контактные действия только иконкой
  for (const m of tpl.matchAll(/<button\b[^>]*>\s*([^<>{}]+?)\s*<\/button>/g)) ok(!ICON_ONLY.includes(m[1].trim()), `${f}: кнопка с текстом «${m[1].trim()}» должна быть иконкой`);
  // 2. иконка-кнопка без текста имеет aria-label
  for (const m of tpl.matchAll(/<button\b([^>]*)>\s*<svg\b(?:(?!<\/button>)[\s\S])*?<\/svg>\s*<\/button>/g)) ok(/aria-label=/.test(m[1]), `${f}: иконка-кнопка без aria-label: ${m[1].slice(0, 70)}`);
  // 2б. кнопка без текста с пустым span внутри (переключатель) имеет aria-label
  for (const m of tpl.matchAll(/<button\b([^>]*)>\s*<span\b[^>]*><\/span>\s*<\/button>/g)) ok(/aria-label=/.test(m[1]), `${f}: переключатель без aria-label: ${m[1].slice(0, 70)}`);
  // 3. шрифты только из шкалы
  for (const m of t.matchAll(/font-size:\s*([\d.]+)px/g)) ok(SCALE.has(m[1]), `${f}: font-size ${m[1]}px вне шкалы`);
  for (const m of t.matchAll(/fontSize: ([\d.]+)(?=[,\s}])/g)) ok(SCALE.has(m[1]), `${f}: fontSize ${m[1]} вне шкалы`);
  ok(!/\d{3} [\d.]+px Onest/.test(t), `${f}: шрифт Onest вписан в font, нужен var(--font)`);
  ok(!/font-family:Onest/.test(t), `${f}: font-family вписан`);
  // 4. нет смешанных стилей
  ok(!/style="\{\{[^}]*\}\};[^"]*"/.test(tpl), `${f}: стиль «{{ x }};литерал» не раскрывается средой`);
  // 5. svg скрыты или подписаны
  for (const m of tpl.matchAll(/<svg\b([^>]*)>/g)) ok(/aria-hidden|role=|aria-label/.test(m[1]), `${f}: svg без aria-hidden: ${m[1].slice(0, 60)}`);
  // 6. поля подписаны
  for (const m of tpl.matchAll(/<(input|textarea|select)\b([^>]*)>/g)) ok(/aria-label=|type="range"/.test(m[2]), `${f}: поле без aria-label: ${m[2].slice(0, 60)}`);
  // 7. язык
  ok(/documentElement\.lang = 'ru'/.test(t), `${f}: не выставляется lang=ru`);
  // 8. плавающая кнопка не крупнее
  ok(!/(width|height): 52/.test(t.replace(/\/\/[^\n]*/g, '')) || f.includes('Design'), `${f}: размер 52`);
  // 9. токены размеров заведены в корне
  for (const v of ['--hit-min', '--control-sm', '--control-md', '--control-lg', '--fs-body', '--space-2', '--font']) ok(t.includes(`'${v}'`), `${f}: нет ${v} в корневых переменных`);
}
// 11. отступы только из шкалы (4, 8, 12, 16, 20, 24, 32; до 3 px оптические, больше 32 свободно)
const SP = new Set([4, 8, 12, 16, 20, 24, 32]);
const badSp = (n) => n > 3 && n <= 32 && !SP.has(n);
for (const f of files) {
  const t = readFileSync(join(root, f), 'utf8');
  const ci = t.indexOf('class Component extends DCLogic');
  for (const m of t.slice(0, ci).matchAll(/ style="([^"{}]*)"/g)) for (const d of m[1].matchAll(/(?:^|;)\s*(gap|row-gap|column-gap|padding(?:-(?:top|bottom|left|right))?|margin(?:-(?:top|bottom|left|right))?)\s*:\s*([^;]+)/g)) {
    if (/calc|%|var\(|-\d/.test(d[2])) continue;
    for (const n of d[2].matchAll(/(\d+)px/g)) ok(!badSp(+n[1]), f + ': ' + d[1] + ': ' + n[1] + 'px вне шкалы отступов');
  }
  const code = t.slice(ci);
  for (const m of code.matchAll(/(?:^|[\s{,])(gap|rowGap|columnGap|padding|paddingTop|paddingBottom|paddingLeft|paddingRight|margin|marginTop|marginBottom|marginLeft|marginRight): ('[^']*'|\d+)(?=[,\s}])/g)) {
    const v = m[2]; if (/calc|%|var\(|-\d/.test(v)) continue;
    for (const n of v.matchAll(/(\d+)(?:px)?/g)) ok(!badSp(+n[1]), f + ': ' + m[1] + ': ' + n[1] + ' вне шкалы отступов');
  }
  // 12. цвета и тени из токенов
  ok(!/boxShadow: '[^']*rgba/.test(code), f + ': boxShadow с вписанным rgba, нужен токен --shadow-*');
  ok(!/box-shadow:[^;'"]*rgba/.test(t.slice(0, ci)), f + ': box-shadow с вписанным rgba в шаблоне');
  ok(!/color: '#fff'/i.test(code) && !/(?<!'--btn-apple-bg': )dark \? '#FFFFFF' : '#000000'/.test(code), f + ': цвет текста вписан, нужен токен');
}
// 10. базовые кнопки прототипа берут размеры из токенов
const crm = readFileSync(join(root, files[0]), 'utf8');
for (const k of ['pill', 'solid', 'ghost', 'round']) {
  const line = (crm.match(new RegExp('const ' + k + ' = \\{[^\\n]*')) || [''])[0];
  ok(line.length > 0, `прототип: нет определения ${k}`);
  ok(/var\(--hit-min\)/.test(line), `прототип: ${k} не использует --hit-min`);
  ok(!/(height|width): (mob \? )?\d/.test(line), `прототип: ${k} с числовым размером`);
  ok(!/Onest/.test(line.replace(/var\(--font\)/g, '')), `прототип: ${k} с вписанным шрифтом`);
}
console.log(`исходники: проверено ${checked}, ошибок ${failed}`);
process.exit(failed ? 1 : 0);
