#!/usr/bin/env python3
"""Builds design/brand-gorix-draft/usage-preview.html from the brand SVGs (usage-map.md)."""
import re, sys, pathlib

root = pathlib.Path(sys.argv[1])
def svg(rel, color=True):
    s = (root / rel).read_text()
    s = re.sub(r'<title>.*?</title>', '', s)
    s = re.sub(r' width="\d+" height="\d+"', '', s, count=1)
    if color:
        s = s.replace('fill="#F2F3F5"', 'fill="currentColor"').replace('fill="#15161A"', 'fill="currentColor"') \
             .replace('fill="#FBFF00"', 'fill="currentColor"').replace('fill="#575C68"', 'fill="currentColor"')
    return s

MARK = svg('brand/gorix-mark-ink-dark.svg')
MARK_ACC = svg('brand/gorix-mark-acc.svg', color=False)
LOGO_H = svg('brand/gorix-logo-horizontal-dark.svg')
LOGO_V = svg('brand/gorix-logo-vertical-dark.svg')
MADE = svg('brand/made-with-gorix.svg')
ICON = svg('icon/app-icon-1024.svg', color=False)
MOTION = {k: (root / f'motion/gorix-{k}.svg').read_text().replace('width="1024" height="1024" ', '') for k in ['intro', 'loading', 'success', 'pending']}
MOTION = {k: re.sub(r'<title>.*?</title>', '', v) for k, v in MOTION.items()}

def phone(inner, cls=''):
    return f'<div class="ph {cls}"><div class="scr">{inner}</div></div>'

def empty(icon, title, phrase, btn, kind='primary'):
    b = f'<span class="b {kind}">{btn}</span>' if btn else ''
    p = f'<p class="ep">{phrase}</p>' if phrase else ''
    return f'<div class="empty">{icon}<b class="et">{title}</b>{p}{b}</div>'

ICO_CLIENT = '<svg viewBox="0 0 24 24" class="oi"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
ICO_OK = '<svg viewBox="0 0 24 24" class="oi ok"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="var(--bg)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
LISTHEAD = '<div class="lh"><b>Клиенты</b><span class="plus">＋</span></div><div class="fb">Все · Активные · Архив</div>'

def list_empty(theme):
    return phone(LISTHEAD + empty(ICO_CLIENT, 'Клиентов пока нет', 'Клиент появится, когда вы добавите его или превратите лид в клиента', 'Добавить клиента') + '<div class="tabs">Сегодня · Клиенты · Сметы · Ещё</div>', 'force-' + theme)

placements = [
    ('Заставка запуска', 'только знак, без слова · фон текущей темы · анимация (а) один раз', phone(f'<div class="center"><span class="mk acc" style="width:76px">{MARK_ACC}</span></div>', 'force-dark')),
    ('Вход', 'логотип со словом над формой · ширина 160 · цвет ink', phone(f'<div class="login"><span class="lg" style="width:160px">{LOGO_H}</span><div class="in">Email</div><div class="in">Пароль</div><span class="b primary full">Войти</span></div>', 'force-dark')),
    ('Рабочие экраны', 'бренда нет · в шапке только текст версии', phone('<div class="ver">GoRix v1.0.0 · 1072 · 11 нояб.</div>' + LISTHEAD + '<div class="cardr"></div><div class="cardr"></div><div class="cardr"></div><div class="tabs">Сегодня · Клиенты · Сметы · Ещё</div>', 'force-dark')),
    ('«О приложении»', 'вертикальный логотип 96 · статично', phone(f'<div class="about"><span class="lg" style="width:96px">{LOGO_V}</span><p>Версия 1.0.0 · сборка 1072</p><p>hello@gorix.app</p><p>Политика · Условия</p></div>', 'force-dark')),
    ('Страница клиента /p/', 'сверху логотип подрядчика · внизу «Made with GoRix» (если включено)', phone('<div class="pp"><div class="co">ACME Gutters</div><b>Estimate #1042</b><div class="cardr"></div><div class="cardr"></div><span class="b primary full">Sign estimate</span>' + f'<span class="made" style="width:120px">{MADE}</span></div>', 'force-light')),
    ('PDF сметы', 'логотип подрядчика · внизу «Made with GoRix» от 7 pt', '<div class="pdf"><div class="co">ACME Gutters</div><b>Estimate #1042</b><div class="ln"></div><div class="ln"></div><div class="ln s"></div><div class="tot">Total $2,850.00</div>' + f'<span class="made" style="width:110px">{MADE}</span></div>'),
    ('Иконка на iPhone', 'знак на фоне · без слова', f'<div class="home">' + ''.join('<span class="app"></span>' for _ in range(7)) + f'<span class="app me">{ICON}</span><span class="app"></span></div>'),
]

motions = [
    ('intro', '(а) Появление', 'Где: заставка запуска.', 'Когда: один раз за холодный запуск и только если данных нет в телефоне (первый вход, вход после выхода). Есть данные — экран сразу, без заставки.', '900 мс (durChart). Экран готов раньше — не ждём.', 'Без движения: знак сразу целиком.', ''),
    ('loading', '(б) Ожидание', 'Где: только полноэкранные ожидания — первая загрузка компании после входа и подготовка PDF к просмотру.', 'Когда: появляется через 300 мс ожидания (spinnerDelayMs), крутится, пока ждём; 10 с без ответа — «Не получилось · Повторить».', 'Цикл 1250 мс.', 'Без движения: знак и слово «Загружаем…».', 'Загружаем…'),
    ('success', '(в) Готово', 'Где: одно место — конец настройки новой компании.', 'Когда: один раз. Остальные успехи — тост и вибрация, без знака.', '510 мс.', 'Без движения: зелёная точка с галочкой и слово.', 'Компания готова'),
    ('pending', '(г) Ждёт отправки', 'Где: полоса «Нет сети», знак 20 px перед словами.', 'Когда: пока нет сети и есть неотправленное.', 'Цикл 1800 мс.', 'Без движения: пунктир и пустая точка.', 'Ждёт отправки · 3'),
]

no_anim = ['Загрузка списка → 300 мс ничего, потом скелетон', 'Кнопка в загрузке → маленький индикатор в кнопке', '«Потянуть, чтобы обновить» → системный индикатор',
           'Сохранено, отправлено, оплата принята → тост и вибрация', 'Списки, карточки, формы, шторки, меню, вкладки, шапка → ничего', '«О приложении», вход, «Страницы нет» → статичный знак',
           'Страница клиента, PDF, письма → статично']

css = '''
:root{--page:#181A1E;--bg:#24272D;--ink:#F2F3F5;--mut:#CDD1DA;--surf:rgba(255,255,255,.07);--surf2:rgba(255,255,255,.11);--bd:rgba(255,255,255,.14);--acc:#FBFF00;--on-acc:#0B0C0F;--ok:#9CF0A8;color-scheme:dark}
@media (prefers-color-scheme:light){:root:not([data-theme="dark"]){--page:#DDD9D2;--bg:#EFEBE5;--ink:#15161A;--mut:#575C68;--surf:rgba(255,255,255,.62);--surf2:rgba(255,255,255,.85);--bd:rgba(20,22,30,.1);--ok:#176428;color-scheme:light}}
:root[data-theme="light"]{--page:#DDD9D2;--bg:#EFEBE5;--ink:#15161A;--mut:#575C68;--surf:rgba(255,255,255,.62);--surf2:rgba(255,255,255,.85);--bd:rgba(20,22,30,.1);--ok:#176428;color-scheme:light}
.force-dark{--bg:#24272D;--ink:#F2F3F5;--mut:#CDD1DA;--surf:rgba(255,255,255,.07);--surf2:rgba(255,255,255,.11);--bd:rgba(255,255,255,.14);--ok:#9CF0A8}
.force-light{--bg:#EFEBE5;--ink:#15161A;--mut:#575C68;--surf:rgba(255,255,255,.62);--surf2:rgba(255,255,255,.85);--bd:rgba(20,22,30,.1);--ok:#176428}
.force-dark .gx{--gx-ink:#F2F3F5!important;--gx-brand:#FBFF00!important}.force-light .gx{--gx-ink:#15161A!important;--gx-brand:#15161A!important}
*{box-sizing:border-box}body{margin:0;background:var(--page);color:var(--ink);font:15px/1.45 -apple-system,system-ui,Segoe UI,sans-serif}
main{max-width:760px;margin:0 auto;padding:16px 16px 64px}h1{font-size:24px;margin:8px 0 4px}h2{font-size:19px;margin:32px 0 8px}p{color:var(--mut);margin:4px 0 10px}
.seg{display:inline-flex;background:var(--surf);border:1px solid var(--bd);border-radius:999px;padding:3px;gap:2px;flex-wrap:wrap}
.seg button{font:inherit;font-size:13px;color:var(--ink);background:none;border:0;border-radius:999px;padding:6px 12px;min-height:32px}
.seg button[aria-pressed="true"]{background:var(--acc);color:var(--on-acc)}
.q{background:var(--surf);border:1px solid var(--bd);border-radius:20px;padding:12px 16px;margin:12px 0}.q li{color:var(--ink);margin:4px 0}.q small{color:var(--mut)}
.row{display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;scroll-snap-type:x mandatory}.row>figure{scroll-snap-align:start}
figure{margin:0;flex:none;width:200px}figcaption{font-size:12.5px;color:var(--mut);margin-top:6px}figcaption b{color:var(--ink);display:block;font-size:13.5px}
.ph{width:200px;height:400px;border-radius:30px;padding:7px;background:#0B0C0F}.scr{position:relative;height:100%;border-radius:24px;overflow:hidden;background:var(--bg);color:var(--ink);padding:14px 12px;font-size:11px;display:flex;flex-direction:column;gap:8px}
.center{flex:1;display:flex;align-items:center;justify-content:center}.mk,.lg,.made{display:inline-block;color:var(--ink)}.mk svg,.lg svg,.made svg{display:block;width:100%;height:auto}.made{color:var(--mut);margin:auto auto 0}
.login{flex:1;display:flex;flex-direction:column;gap:8px;justify-content:center;align-items:center}.in{width:100%;height:30px;border:1px solid var(--bd);border-radius:10px;background:var(--surf);color:var(--mut);padding:6px 8px}
.b{display:inline-block;border-radius:999px;padding:6px 14px;font-weight:600;font-size:11px;min-height:24px;text-align:center}.b.primary{background:var(--acc);color:var(--on-acc)}.b.secondary{background:var(--surf2);border:1px solid var(--bd)}.b.ghost{color:var(--ink);text-decoration:underline}.full{width:100%}
.ver{font-size:9px;color:var(--mut)}.lh{display:flex;justify-content:space-between;align-items:center;font-size:15px}.plus{width:24px;height:24px;border-radius:999px;background:var(--surf2);display:flex;align-items:center;justify-content:center}
.fb{font-size:10px;color:var(--mut);border:1px solid var(--bd);border-radius:999px;padding:4px 8px}.cardr{height:46px;border-radius:14px;background:var(--surf);border:1px solid var(--bd)}
.tabs{margin-top:auto;font-size:9px;color:var(--mut);text-align:center;border-top:1px solid var(--bd);padding-top:8px}
.about{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}.about p{font-size:10px;margin:0}
.pp{flex:1;display:flex;flex-direction:column;gap:8px}.co{font-weight:800;font-size:12px;border:1px dashed var(--bd);border-radius:8px;padding:6px;text-align:center}
.pdf{width:200px;height:260px;background:#fff;color:#15161A;border-radius:6px;padding:14px;display:flex;flex-direction:column;gap:6px;font-size:10px;--mut:#575C68;--bd:rgba(20,22,30,.15)}.ln{height:8px;background:#e8e6e1;border-radius:3px}.ln.s{width:60%}.tot{text-align:right;font-weight:700}
.home{width:200px;padding:16px;border-radius:30px;background:linear-gradient(160deg,#3b4a6b,#1d2333);display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.app{aspect-ratio:1;border-radius:22%;background:rgba(255,255,255,.18)}.app.me{overflow:hidden;background:none}.app svg{display:block;width:100%;height:100%}
.mot{display:grid;grid-template-columns:96px 1fr;gap:12px;background:var(--surf);border:1px solid var(--bd);border-radius:20px;padding:12px;margin:10px 0;align-items:start}
.mot .vis{display:flex;flex-direction:column;align-items:center;gap:6px}.mot .vis svg{width:72px;height:72px;display:block}.mot .w{font-size:11px;color:var(--ink);text-align:center}.mot h3{margin:0 0 4px;font-size:15px}.mot p{margin:2px 0;font-size:13px}
.mot button{font:inherit;font-size:12px;color:var(--ink);background:var(--surf2);border:1px solid var(--bd);border-radius:999px;padding:4px 10px;min-height:28px}
body.rm .gx *{animation:none!important}body.rm .gx-load .run{stroke-dasharray:none!important;stroke-dashoffset:0!important}body.rm .gx-load .p{opacity:1!important}
ul.no{padding-left:18px}ul.no li{color:var(--ink);margin:4px 0;font-size:14px}
.empty{display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;margin:24px 8px 0}.oi{width:24px;height:24px;color:var(--mut)}.oi.ok{color:var(--ok)}.et{font-size:13px}.ep{font-size:10.5px;margin:0}
.wide{width:300px;height:190px;border-radius:12px;padding:5px;background:#0B0C0F}.wide .scr{border-radius:8px;flex-direction:row;padding:8px;gap:6px}.wide .side{width:40px;border-right:1px solid var(--bd)}.wide .lst{flex:1;display:flex;flex-direction:column}.wide .pnl{width:70px;border-left:1px solid var(--bd)}
.note{font-size:13px;color:var(--mut)}
'''

js = '''
const r=document.documentElement;document.querySelectorAll('#theme button').forEach(b=>b.onclick=()=>{document.querySelectorAll('#theme button').forEach(x=>x.setAttribute('aria-pressed',x===b));const t=b.dataset.t;if(t)r.dataset.theme=t;else delete r.dataset.theme;});
document.querySelectorAll('#rm button').forEach(b=>b.onclick=()=>{document.querySelectorAll('#rm button').forEach(x=>x.setAttribute('aria-pressed',x===b));document.body.classList.toggle('rm',b.dataset.rm==='1');});
document.querySelectorAll('[data-replay]').forEach(b=>b.onclick=()=>{const v=document.getElementById(b.dataset.replay);v.innerHTML=v.innerHTML;});
'''

out = ['<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
       '<title>GoRix — размещение и движение</title><style>', css, '</style></head><body><main>',
       '<h1>GoRix: где бренд, анимации, пустые экраны</h1><p>Черновик 11.11.2026 · по <code>usage-map.md</code> и дизайн-системе «Наряд». Знак — направление «Маршрут G»; места не зависят от выбора направления.</p>',
       '<div class="seg" id="theme"><button aria-pressed="true">Как в системе</button><button data-t="dark" aria-pressed="false">Тёмная</button><button data-t="light" aria-pressed="false">Светлая</button></div>',
       '<div class="q"><b>Нужно ваше решение:</b><ol><li>Знак: «Маршрут G» или горилла? <small>рекомендую «Маршрут G»</small></li><li>Цвет: жёлтый как в приложении или лайм? <small>рекомендую жёлтый</small></li><li>Фон иконки: почти чёрный или графит? <small>рекомендую почти чёрный</small></li><li>«Made with GoRix» внизу PDF и страницы клиента — включено по умолчанию с выключателем у компании? <small>рекомендую: включено на бесплатном тарифе</small></li></ol></div>',
       '<h2>1. Где виден бренд</h2><p>Бренд — там, где приложение говорит от своего имени. В рабочих экранах знака нет. Клиент подрядчика видит логотип подрядчика. Листайте вбок →</p><div class="row">']
for title, cap, html in placements:
    out.append(f'<figure>{html}<figcaption><b>{title}</b>{cap}</figcaption></figure>')
out.append('</div><p class="note">Нигде больше: ни на кнопках, ни в списках, ни в SMS. Пуш — только иконка, её ставит система.</p>')
out.append('<h2>2. Анимации знака: где и когда</h2><div class="seg" id="rm"><button data-rm="0" aria-pressed="true">С движением</button><button data-rm="1" aria-pressed="false">Уменьшенное движение</button></div>')
for k, t, where, when, dur, rm, word in motions:
    w = f'<span class="w">{word}</span>' if word else ''
    out.append(f'<div class="mot force-dark" style="background:var(--bg)"><div class="vis"><div id="m-{k}">{MOTION[k]}</div>{w}<button data-replay="m-{k}">Ещё раз</button></div><div><h3>{t}</h3><p>{where}</p><p>{when}</p><p><b>{dur}</b></p><p>{rm}</p></div></div>')
out.append('<p>На экране одновременно не больше одной анимации знака.</p><h3>Где анимации знака НЕТ</h3><ul class="no">' + ''.join(f'<li>{x}</li>' for x in no_anim) + '</ul>')
out.append('<h2>3. Пустые экраны</h2><p>Пустота говорит про объект, а не про бренд: значок объекта, заголовок, одна фраза, одна кнопка. Обе темы:</p><div class="row">')
out.append(f'<figure>{list_empty("dark")}<figcaption><b>Данных нет · тёмная</b>значок объекта + «Добавить»</figcaption></figure>')
out.append(f'<figure>{list_empty("light")}<figcaption><b>Данных нет · светлая</b>то же</figcaption></figure>')
out.append('<figure>' + phone(LISTHEAD + empty('', 'В этом отборе пусто', '', 'Сбросить фильтр', 'ghost'), 'force-dark') + '<figcaption><b>Фильтр ничего не дал</b>только текст и «Сбросить фильтр»</figcaption></figure>')
out.append('<figure>' + phone(LISTHEAD + empty('', 'Ничего не нашлось по „Смит“', 'Найдено во „Все“ · 2', 'Показать', 'secondary'), 'force-light') + '<figcaption><b>Поиск ничего не дал</b>только текст; подсказка про «Все»</figcaption></figure>')
out.append('<figure>' + phone('<div class="lh"><b>Сегодня</b></div>' + empty(f'<span class="mk" style="width:48px">{MARK}</span>', 'Начнём с первого клиента', 'Добавьте клиента — дальше смета, работа и оплата', 'Добавить клиента') + '<div class="tabs">Сегодня · Клиенты · Сметы · Ещё</div>', 'force-dark') + '<figcaption><b>Новая компания</b>одно из трёх мест, где вместо значка знак GoRix (48)</figcaption></figure>')
out.append('<figure>' + phone(empty(f'<span class="mk" style="width:48px">{MARK}</span>', 'Страницы нет', '', 'На главную', 'secondary'), 'force-light') + '<figcaption><b>«Страницы нет»</b>знак GoRix; третье место — первый запуск без сети</figcaption></figure>')
out.append('<figure>' + phone('<div class="lh"><b>Требует внимания</b></div>' + empty(ICO_OK, 'Всё сделано', 'Новые дела появятся здесь', ''), 'force-dark') + '<figcaption><b>«Требует внимания» пусто</b>это хорошо: значок «готово» и слово, без кнопки</figcaption></figure>')
out.append('</div><h3>Ширины</h3><p>390 — на всю колонку · 820 — по центру над двумя колонками · 1280 — по центру списка, слева от панели карточки. Блок не шире 560.</p><div class="row">')
out.append('<figure style="width:300px"><div class="wide force-dark"><div class="scr"><div class="side"></div><div class="lst"><div class="fb">Все · Активные</div>' + empty(ICO_CLIENT, 'Клиентов пока нет', '', 'Добавить клиента') + '</div><div class="pnl"></div></div></div><figcaption><b>1280 · тёмная</b>пустое — по центру области списка</figcaption></figure>')
out.append('<figure style="width:300px"><div class="wide force-light"><div class="scr"><div class="side"></div><div class="lst"><div class="fb">Все · Активные</div>' + empty(ICO_CLIENT, 'Клиентов пока нет', '', 'Добавить клиента') + '</div></div></div><figcaption><b>820 · светлая</b>по центру над двумя колонками</figcaption></figure>')
out.append('</div><h2>4. Кнопки</h2><p>Бренд на кнопках не используется: ни знака, ни своего цвета, ни своих форм. Главная кнопка — жёлтая, высота 36, зона нажатия 44 (дизайн-система §7). Вариант 44 для закреплённой панели ждёт вашего решения по снимкам.</p>')
out.append('<h2>Открыто, решает не дизайн</h2><p>Имя «Gorix» в App Store занято (нужно «GoRix: Contractor App»). Товарный знак — проверка юристом до заявки в App Store.</p>')
out.append('</main><script>' + js + '</script></body></html>')
(root / 'usage-preview.html').write_text(''.join(out))
print('ok', len(''.join(out)))
