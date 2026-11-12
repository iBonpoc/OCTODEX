#!/usr/bin/env python3
"""Builds usage-preview.html (usage-map.md) from the brand SVGs.
Run: python3 tools-gen-usage-preview.py design/brand-gorix-draft"""
import re, sys, pathlib

root = pathlib.Path(sys.argv[1])

def svg(rel, color=True):
    s = (root / rel).read_text()
    s = re.sub(r'<title>.*?</title>', '', s)
    s = re.sub(r' width="\d+" height="\d+"', '', s, count=1)
    if color:
        for c in ('#F2F3F5', '#15161A', '#FBFF00', '#575C68'):
            s = s.replace(f'fill="{c}"', 'fill="currentColor"')
    return s

def v3(n): return svg(f'v3/{n}', color=False).replace('#F2F3F5', 'currentColor').replace('class="dr"', 'class="dr" style="fill:var(--dring)"')
MARK = svg('v4/gr-mark-dark.svg', color=False).replace('#F2F3F5', 'currentColor')
GR = svg('v4/gr-dark.svg', color=False).replace('#F2F3F5', 'currentColor')
GR_L = svg('v4/gr-light.svg', color=False)
GR_S = svg('v4/gr-small-light.svg', color=False)
IC_T = svg('v4/gr-icon-tinted.svg', color=False)
IC_M = svg('v4/gr-icon-mono.svg', color=False)
MARK_BOLD = v3('mark-bold-dark.svg')
LOGO = v3('logo-calm-dark.svg')
LOGO_BOLD = v3('logo-bold-dark.svg')
GO_BTN = svg('v3/go-button-dark.svg', color=False).replace('fill="#F2F3F5"', 'fill="currentColor"')
GO_ICON = svg('v3/go-icon.svg', color=False)
def app_icon(mark, bg='#0B0C0F', ink='#F2F3F5', dot='#FBFF00'):
    inner = mark.replace('<svg ', '<svg width="1024" height="1024" ', 1).replace('currentColor', ink).replace('#FBFF00', dot)
    return f'<svg viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="{bg}"/>{inner}</svg>'
WORD = svg('brand/gorix-wordmark-dark.svg')
LOGO_V = svg('brand/gorix-logo-vertical-dark.svg')
MADE = svg('brand/made-with-gorix.svg')
ICONS = {'light': app_icon(MARK), 'dark': app_icon(MARK), 'tinted': app_icon(MARK, '#000000', '#FFFFFF', '#FFFFFF')}
REFINE = [('Сейчас', svg('brand/gorix-mark-ink-dark.svg', color=False).replace('#F2F3F5', 'currentColor')),
          ('A1 · точка с зазором', svg('directions/A-route-refine/a1-gap.svg', color=False).replace('#F2F3F5', 'currentColor')),
          ('A2 · зазор + жёлтая точка', svg('directions/A-route-refine/a2-gap-acc-dot.svg', color=False).replace('#F2F3F5', 'currentColor').replace('#FBFF00', 'var(--dot)')),
          ('A3 · зазор + косой срез', svg('directions/A-route-refine/a3-gap-cut.svg', color=False).replace('#F2F3F5', 'currentColor'))]
DIRS = [('A · Маршрут G', svg('directions/A-route/mark-on-dark.svg', color=False)),
        ('B · Печать GR', svg('directions/B-monogram/mark-on-dark.svg', color=False)),
        ('C · Отвес', svg('directions/C-plumb/mark-on-dark.svg', color=False))]
MOTION = {k: re.sub(r'<title>.*?</title>', '', (root / f'v3/{f}.svg').read_text()) for k, f in [('intro', 'intro-calm'), ('morph', 'intro-to-gr-calm'), ('quick', 'quick-calm'), ('loading', 'loading-calm'), ('success', 'success-calm')]}

def phone(inner, theme):
    return f'<div class="ph t-{theme}"><div class="scr">{inner}</div></div>'

def fig(html, title, cap, w=200):
    return f'<figure style="width:{w}px">{html}<figcaption><b>{title}</b>{cap}</figcaption></figure>'

def icon(path_d, size):
    return f'<svg viewBox="0 0 24 24" class="oi" style="width:{size}px;height:{size}px"><path d="{path_d}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'

P_CLIENT = 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c1.5-4 4.5-6 8-6s6.5 2 8 6'
P_SEARCH = 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4'
P_CLOUD = 'M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 7 18zM4 4l16 16'
ICO_OK = '<svg viewBox="0 0 24 24" class="oi ok" style="width:36px;height:36px"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="var(--bg)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'

def empty(ic, title, phrase='', btn='', kind='primary'):
    b = f'<span class="b {kind}">{btn}</span>' if btn else ''
    p = f'<p class="ep">{phrase}</p>' if phrase else ''
    return f'<div class="empty">{ic}<b class="et">{title}</b>{p}{b}</div>'

TABS = '<div class="tb"><span class="on">Главная</span><span>План</span><span>Чаты</span><span>Клиенты</span><span>Ещё</span></div>'
FAB = '<span class="fab">＋</span>'
HEAD = '<div class="lh"><b>Клиенты</b></div><div class="fb">Все · Активные · Архив</div>'

def list_screen(body, theme, fab=True):
    return phone(HEAD + body + (FAB if fab else '') + TABS, theme)

def placements():
    out = []
    for th in ('dark', 'light'):
        out.append(fig(phone(f'<div class="center"><span class="lg" style="width:150px">{LOGO}</span></div>', th),
                       f'Заставка · {"тёмная" if th == "dark" else "светлая"}',
                       'конечный кадр анимации = полный логотип; он же статичная системная заставка'))
    login = lambda logo, note: phone(f'<div class="login">{logo}<div class="in">Email</div><div class="in">Пароль</div><span class="b primary full">Войти</span></div>', 'dark')
    out.append(fig(login(f'<span class="lg" style="width:150px">{LOGO}</span>', ''), 'Вход', 'полный логотип над формой'))
    out.append(fig(f'<div class="wide t-light"><div class="scr"><div class="side"><span class="mk" style="width:40px">{GR}</span><i></i><i></i><i></i><i></i></div><div class="lst"><div class="fb">Все · Активные</div><div class="cardr"></div><div class="cardr"></div></div></div></div>',
                   'Меню слева · 820+', 'знак GR (высота 24) сверху меню; нажатие → «О приложении»', 300))
    out.append(fig(phone(f'<div class="about"><span class="lg" style="width:140px">{LOGO}</span><p>Версия 1.0.0 · сборка 1072</p><p>hello@gorix.app</p><p>Политика · Условия</p></div>', 'dark'),
                   '«О приложении»', 'полный логотип, статично'))
    out.append(fig(phone(empty(f'<span class="mk" style="width:80px">{GR}</span>', 'Страницы нет', 'Возможно, ссылка устарела', 'На главную', 'secondary'), 'light'),
                   '«Страницы нет»', 'знак GR (высота 48)'))
    out.append(fig(phone(f'<div class="pp"><div class="co">ACME Gutters</div><b>Estimate #1042</b><div class="cardr"></div><div class="cardr"></div><span class="b primary full">Sign estimate</span><span class="made" style="width:120px">{MADE}</span></div>', 'light'),
                   'Страница клиента /p/', 'сверху логотип подрядчика; внизу «Made with GoRix» (бесплатный тариф)'))
    out.append(fig(f'<div class="pdf"><div class="co">ACME Gutters</div><b>Estimate #1042</b><div class="ln"></div><div class="ln"></div><div class="ln s"></div><div class="tot">Total $2,850.00</div><span class="made" style="width:110px">{MADE}</span></div>',
                   'Низ PDF', 'логотип подрядчика; «Made with GoRix» от 7 pt'))
    for k, nm in (('light', 'обычная'), ('dark', 'тёмная'), ('tinted', 'тонированная')):
        bg = {'light': 'linear-gradient(160deg,#cfe0ff,#f3e6d8)', 'dark': 'linear-gradient(160deg,#1c2433,#0b0c0f)', 'tinted': 'linear-gradient(160deg,#5a3b2a,#1a120d)'}[k]
        tint = ' tint' if k == 'tinted' else ''
        apps = ''.join('<span class="app"></span>' for _ in range(7))
        out.append(fig(f'<div class="home" style="background:{bg}">{apps}<span class="app me{tint}">{ICONS[k]}</span><span class="app"></span></div>',
                       f'Иконка iPhone · {nm}', 'знак отдельно — только где мало места'))
    return ''.join(out)

motions = [
    ('intro', '(а) Появление — заставка', 'Движется: буква G открывается вдоль своего пути, точка едет впереди → точка встаёт внутри G → выезжает «oRix» → точка перелетает и садится над «i». Буква с первого кадра та же, что в логотипе.',
     'Где: заставка. Полная — только при первом запуске и после обновления приложения. Обычный запуск — короткий вход на GR (600 мс), а если данные уже в телефоне — сразу первый экран, без заставки.', 'durBrand = 1600 мс: G 650, пауза, перелёт к «i» 600 (будет токеном). Конечный кадр = полный логотип = статичная системная заставка, поэтому скачка нет.', 'Без движения: сразу полный логотип.', ''),
    ('loading', '(б) Ожидание', 'Движется: на знаке GR жёлтая точка в тёмном ободке едет по контуру G по кругу — ободок не даёт ей слиться с буквой. Буква стоит, не вращается.',
     'Где: только полноэкранные ожидания (первая загрузка после входа, подготовка PDF). Появляется через 300 мс.', 'Цикл 1600 мс (durBrand), в концах пути точка гаснет и проявляется за 120 мс — без скачка. Рядом всегда слово «Загружаем…»; 10 с без ответа — «Не получилось · Повторить».', 'Без движения: знак с точкой и слово «Загружаем…».', 'Загружаем…'),
    ('success', '(в) Готово', 'Движется: на знаке GR, начало как у заставки — точка рисует ту же G и встаёт внутри; потом растёт, становится зелёной и в ней прорисовывается галочка.',
     'Где: одно место — конец настройки новой компании. Один раз.', '1200 мс, тот же темп буквы, что у заставки.', 'Без движения: зелёная галочка и слово.', 'Компания готова'),
]
no_anim = ['Загрузка списка → 300 мс ничего, потом скелетон', 'Кнопка в загрузке → маленький индикатор в кнопке', '«Потянуть, чтобы обновить» → системный индикатор',
           'Сохранено, отправлено, оплата принята → тост и вибрация', 'Списки, карточки, формы, шторки, меню, вкладки, шапка → ничего',
           '«О приложении», вход, «Страницы нет» → статичный знак', 'Страница клиента, PDF, письма → статично']

css = '''
:root{--page:#181A1E;--bg:#24272D;--ink:#F2F3F5;--mut:#CDD1DA;--surf:rgba(255,255,255,.07);--surf2:rgba(255,255,255,.11);--bd:rgba(255,255,255,.14);--acc:#FBFF00;--on-acc:#0B0C0F;--ok:#9CF0A8;--mk:#FBFF00;--dot:#FBFF00;--dring:none;--ring:#24272D;--bgc:#24272D;--i:#F2F3F5;color-scheme:dark}
@media (prefers-color-scheme:light){:root:not([data-theme="dark"]){--page:#DDD9D2;--bg:#EFEBE5;--ink:#15161A;--mut:#575C68;--surf:rgba(255,255,255,.62);--surf2:rgba(255,255,255,.85);--bd:rgba(20,22,30,.1);--ok:#176428;--mk:#15161A;--dot:#15161A;--dring:#15161A;--ring:#15161A;--bgc:#EFEBE5;--i:#15161A;color-scheme:light}}
:root[data-theme="light"]{--page:#DDD9D2;--bg:#EFEBE5;--ink:#15161A;--mut:#575C68;--surf:rgba(255,255,255,.62);--surf2:rgba(255,255,255,.85);--bd:rgba(20,22,30,.1);--ok:#176428;--mk:#15161A;--dot:#15161A;--dring:#15161A;--ring:#15161A;--bgc:#EFEBE5;--i:#15161A;color-scheme:light}
.t-dark,.t-light{color:var(--ink)}
.t-dark{--bg:#24272D;--ink:#F2F3F5;--mut:#CDD1DA;--surf:rgba(255,255,255,.07);--surf2:rgba(255,255,255,.11);--bd:rgba(255,255,255,.14);--ok:#9CF0A8;--mk:#FBFF00;--dot:#FBFF00;--dring:none;--ring:#24272D;--bgc:#24272D;--i:#F2F3F5}
.t-light{--bg:#EFEBE5;--ink:#15161A;--mut:#575C68;--surf:rgba(255,255,255,.62);--surf2:rgba(255,255,255,.85);--bd:rgba(20,22,30,.1);--ok:#176428;--mk:#15161A;--dot:#15161A;--dring:#15161A;--ring:#15161A;--bgc:#EFEBE5;--i:#15161A}
.t-dark .gx{--gx-ink:#F2F3F5!important;--gx-brand:#FBFF00!important}.t-light .gx{--gx-ink:#15161A!important;--gx-brand:#15161A!important}
*{box-sizing:border-box}body{margin:0;background:var(--page);color:var(--ink);font:15px/1.45 -apple-system,system-ui,Segoe UI,sans-serif}
main{max-width:760px;margin:0 auto;padding:16px 16px 64px}h1{font-size:24px;margin:8px 0 4px}h2{font-size:19px;margin:32px 0 8px}h3{font-size:16px;margin:20px 0 6px}p{color:var(--mut);margin:4px 0 10px}
.seg{display:inline-flex;background:var(--surf);border:1px solid var(--bd);border-radius:999px;padding:3px;gap:2px;flex-wrap:wrap}
.seg button{font:inherit;font-size:13px;color:var(--ink);background:none;border:0;border-radius:999px;padding:6px 12px;min-height:32px}
.seg button[aria-pressed="true"]{background:var(--acc);color:var(--on-acc)}
.q{background:var(--surf);border:1px solid var(--bd);border-radius:20px;padding:12px 16px;margin:12px 0}.q li{color:var(--ink);margin:4px 0}.q small{color:var(--mut)}
.row{display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;scroll-snap-type:x mandatory}.row>figure{scroll-snap-align:start}
figure{margin:0;flex:none}figcaption{font-size:12.5px;color:var(--mut);margin-top:6px}figcaption b{color:var(--ink);display:block;font-size:13.5px}
.ph{width:200px;height:400px;border-radius:30px;padding:7px;background:#0B0C0F}.scr{position:relative;height:100%;border-radius:24px;overflow:hidden;background:var(--bg);color:var(--ink);padding:14px 12px;font-size:11px;display:flex;flex-direction:column;gap:8px}
.center{flex:1;display:flex;align-items:center;justify-content:center}.mk,.lg,.made{display:inline-block;color:var(--ink)}.mk.splash{color:var(--mk)}.mk svg,.lg svg,.made svg{display:block;width:100%;height:auto}.made{color:var(--mut);margin:auto auto 0}
.login{flex:1;display:flex;flex-direction:column;gap:8px;justify-content:center;align-items:center}.in{width:100%;height:30px;border:1px solid var(--bd);border-radius:10px;background:var(--surf);color:var(--mut);padding:6px 8px}
.b{display:inline-block;border-radius:999px;padding:6px 14px;font-weight:600;font-size:11px;text-align:center}.b.primary{background:var(--acc);color:var(--on-acc)}.b.secondary{background:var(--surf2);border:1px solid var(--bd)}.b.ghost{color:var(--ink);text-decoration:underline}.full{width:100%}
.lh{font-size:15px}.fb{font-size:10px;color:var(--mut);border:1px solid var(--bd);border-radius:999px;padding:4px 8px}.cardr{height:40px;border-radius:14px;background:var(--surf);border:1px solid var(--bd)}
.tb{position:absolute;left:10px;right:10px;bottom:10px;height:40px;border-radius:999px;background:var(--surf2);border:1px solid var(--bd);display:flex;justify-content:space-around;align-items:center;font-size:8.5px;color:var(--mut)}.tb .on{color:var(--ink);font-weight:700}
.fab{position:absolute;right:12px;bottom:60px;width:34px;height:34px;border-radius:999px;background:var(--surf2);border:1px solid var(--bd);display:flex;align-items:center;justify-content:center;font-size:16px}
.about{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}.about p{font-size:10px;margin:0}
.pp{flex:1;display:flex;flex-direction:column;gap:8px}.co{font-weight:800;font-size:12px;border:1px dashed var(--bd);border-radius:8px;padding:6px;text-align:center}
.pdf{width:200px;height:260px;background:#fff;color:#15161A;border-radius:6px;padding:14px;display:flex;flex-direction:column;gap:6px;font-size:10px;--mut:#575C68;--ink:#15161A;--bd:rgba(20,22,30,.15)}.ln{height:8px;background:#e8e6e1;border-radius:3px}.ln.s{width:60%}.tot{text-align:right;font-weight:700}
.home{width:200px;padding:16px;border-radius:30px;display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.app{aspect-ratio:1;border-radius:22%;background:rgba(255,255,255,.22)}.app.me{overflow:hidden;background:none}.app svg{display:block;width:100%;height:100%}.app.tint svg{filter:sepia(1) saturate(2.2) hue-rotate(-12deg) brightness(.95)}
.mot{display:grid;grid-template-columns:1fr;gap:12px;border:1px solid var(--bd);border-radius:20px;padding:12px;margin:10px 0;align-items:start;background:var(--bg)}
.mot .vis{display:flex;flex-direction:column;align-items:center;gap:6px}.mot .vis svg{width:72px;height:72px;display:block}.mot .w{font-size:11px;color:var(--ink);text-align:center}.mot h3{margin:0 0 4px;font-size:15px}.mot p{margin:2px 0;font-size:13px}.mot .mv{color:var(--ink)}
.mot button{font:inherit;font-size:12px;color:var(--ink);background:var(--surf2);border:1px solid var(--bd);border-radius:999px;padding:4px 10px;min-height:28px}
body.rm .gx *{animation:none!important}body.rm .gx-load .run{stroke-dasharray:none!important;stroke-dashoffset:0!important}body.rm .gx-load .p{opacity:1!important}
ul.no{padding-left:18px}ul.no li{color:var(--ink);margin:4px 0;font-size:14px}
.empty{display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;margin:22px 8px 0}.oi{color:var(--mut)}.oi.ok{color:var(--ok)}.et{font-size:13px}.ep{font-size:10.5px;margin:0}
.wide{width:300px;height:190px;border-radius:12px;padding:5px;background:#0B0C0F}.wide .scr{border-radius:8px;flex-direction:row;padding:8px;gap:6px}.wide .side{width:44px;border-right:1px solid var(--bd);display:flex;flex-direction:column;gap:8px;align-items:center}.wide .side i{width:28px;height:6px;border-radius:3px;background:var(--surf2)}.wide .lst{flex:1;display:flex;flex-direction:column;gap:6px}.wide .pnl{width:70px;border-left:1px solid var(--bd)}
.marks{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.mc{border:1px solid var(--bd);border-radius:18px;padding:10px;background:var(--bg)}.mc .big{width:96px;color:var(--ink);margin:0 auto}.mc .big svg{display:block;width:100%;height:auto}
.mc .sm{display:flex;gap:10px;align-items:flex-end;justify-content:center;margin-top:8px;color:var(--ink)}.mc .sm span svg{display:block;width:100%;height:auto}.mc b{display:block;font-size:12.5px;text-align:center;margin-top:6px}
.dirs{display:flex;gap:12px}.dirs figure{width:100px}.dirs .ic{width:100px;height:100px;border-radius:22px;overflow:hidden}.dirs .ic svg{display:block;width:100%;height:100%}
.note{font-size:13px;color:var(--mut)}.ic2{display:inline-block;overflow:hidden}.ic2 svg{display:block;width:100%;height:auto}
.strip{display:flex;gap:8px;align-items:center;background:var(--surf2);border:1px solid var(--bd);border-radius:12px;padding:8px 12px;font-size:13px;color:var(--ink)}
.mot .vis svg,.frame svg{width:100%;height:auto}.mot .vis>div{width:200px;max-width:100%}
.gx3.still .draw,.gx3.still .fill,.gx3.still .word{animation:none!important}
'''

js = '''
const r=document.documentElement;document.querySelectorAll('#theme button').forEach(b=>b.onclick=()=>{document.querySelectorAll('#theme button').forEach(x=>x.setAttribute('aria-pressed',x===b));const t=b.dataset.t;if(t)r.dataset.theme=t;else delete r.dataset.theme;});
document.querySelectorAll('#rm button').forEach(b=>b.onclick=()=>{document.querySelectorAll('#rm button').forEach(x=>x.setAttribute('aria-pressed',x===b));document.body.classList.toggle('rm',b.dataset.rm==='1');});
function freeze(svg,t){try{svg.pauseAnimations();svg.setCurrentTime(t/1000)}catch(e){}svg.getAnimations({subtree:true}).forEach(a=>{a.pause();a.currentTime=t});}
function still(){const rm=document.body.classList.contains('rm');document.querySelectorAll('.mot svg').forEach(s=>{if(rm){freeze(s,1600)}else{try{s.unpauseAnimations()}catch(e){}}});}
document.querySelectorAll('[data-replay]').forEach(b=>b.onclick=()=>{const v=document.getElementById(b.dataset.replay);v.innerHTML=v.innerHTML;still();});
document.querySelectorAll('#rm button').forEach(b=>b.addEventListener('click',still));
document.getElementById('slow').onclick=function(){const b=this,v=document.getElementById('m-launch');b.setAttribute('aria-pressed','true');v.innerHTML=v.innerHTML;const s=v.querySelector('svg'),t0=performance.now();(function f(){const e=(performance.now()-t0)/3;freeze(s,Math.min(e,1600));if(e<1600)requestAnimationFrame(f);else b.setAttribute('aria-pressed','false')})();};
document.querySelectorAll('.frame').forEach(f=>freeze(f.querySelector('svg'),+f.dataset.t));
'''

def mark_cards(theme):
    cards = []
    for name, s in REFINE:
        sm = ''.join(f'<span style="width:{px}px">{s}</span>' for px in (32, 24, 16))
        cards.append(f'<div class="mc t-{theme}"><div class="big">{s}</div><div class="sm">{sm}</div><b>{name}</b></div>')
    return ''.join(cards)

out = ['<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
       '<title>GoRix — размещение и движение</title><style>', css, '</style></head><body><main>',
       '<h1>GoRix: где бренд, анимации, пустые экраны</h1><p>Итоговый вариант v4, 12.11.2026 · по <code>usage-map.md</code> и дизайн-системе «Наряд». Цвет бренда — главный жёлтый приложения (acc), отдельного цвета нет.</p>',
       '<div class="seg" id="theme"><button aria-pressed="true">Как в системе</button><button data-t="dark" aria-pressed="false">Тёмная</button><button data-t="light" aria-pressed="false">Светлая</button></div>',
       '<div class="q"><b>Решено (12.11):</b> знак — <b>GR</b> из букв логотипа (наша G + R шрифта логотипа, плотнее); у G прямой верхний конец, без косого среза (не похоже на Gatorade); направление — «Маршрут с точкой». Цвет = жёлтый приложения; фон иконки почти чёрный; «Made with GoRix» — на бесплатном тарифе. <small>Нравится или откатить — скажите.</small></div>',
       '<h2>Как выглядит запуск приложения</h2><p>Один приём на весь бренд: <b>жёлтая точка едет по пути и приезжает</b>. Точка буквы G = точка над «i» = точка в анимациях.</p>',
       f'<div class="mot t-dark" style="display:block"><div id="m-launch" style="max-width:340px;margin:8px auto">{MOTION["intro"]}</div><div style="text-align:center"><button data-replay="m-launch">Ещё раз</button> <button id="slow" aria-pressed="false">Медленно ×3</button></div></div>',
       '<div class="row" id="frames">' + ''.join(f'<figure style="width:170px"><div class="t-dark frame" data-t="{t}" style="background:var(--bg);border-radius:14px;padding:14px">{MOTION["intro"]}</div><figcaption><b>{t} мс</b>{c}</figcaption></figure>' for t, c in [(250, 'буква открывается, точка впереди'), (700, 'G готова, точка внутри'), (800, 'точка выезжает из G'), (1100, 'точка летит, выезжает «oRix»'), (1600, 'точка над «i» — конец')]) + '</div>',
       '<h2>Из GoRix в GR</h2><p>После заставки логотип сворачивается в знак: «o», «i» и «x» уходят, R подъезжает к G, а точка с «i» возвращается внутрь G. Получается знак GR — тот же, что на иконке.</p>',
       f'<div class="mot t-dark" style="display:block"><div id="m-morph" style="max-width:340px;margin:8px auto">{MOTION["morph"]}</div><div style="text-align:center"><button data-replay="m-morph">Ещё раз</button></div></div>',
       '<div class="row">' + ''.join(f'<figure style="width:170px"><div class="t-dark frame" data-t="{t}" style="background:var(--bg);border-radius:14px;padding:14px">{MOTION["morph"]}</div><figcaption><b>{t} мс</b>{c}</figcaption></figure>' for t, c in [(1600, 'логотип готов'), (1850, '«o», «i», «x» уходят, R едет к G, точка летит назад'), (2100, 'точка почти в G'), (2200, 'знак GR — конец')]) + '</div>',
       '<p class="note"><b>Где:</b> если после заставки данные ещё грузятся, логотип сворачивается в GR, и точка сразу переходит в ожидание (едет по G). Так заставка и ожидание — одно движение. Ещё — ролики и сайт. <b>Время:</b> логотип держится 150 мс, сворачивание 450 мс: уходят «o», «i», «x», R подъезжает к G, точка дугой над R возвращается в G (всего 2,2 с от начала, только при первом запуске и если данные ещё грузятся). Экран готов раньше — сразу растворяемся в первый экран, не ждём конца. Без движения — сразу знак GR.</p>',
       '<h2>Обычный запуск — 600 мс</h2><p>Полную заставку видят только при первом запуске и после обновления. В обычный запуск, пока данные грузятся, сразу виден знак GR, и точка за 600 мс доезжает по G на своё место. Данные уже в телефоне — сразу первый экран, без анимации.</p>',
       f'<div class="mot t-dark" style="display:block"><div id="m-quick" style="max-width:200px;margin:8px auto">{MOTION["quick"]}</div><div style="text-align:center"><button data-replay="m-quick">Ещё раз</button></div></div>',
       '<h2>Полный логотип</h2><p>Знак и есть первая буква — без двойной «G». Высота и толщина как у букв. Отдельно (иконка, фавикон, меню слева) — знак <b>GR</b>: те же G и R, что в слове.</p>',
       f'<div class="marks"><div class="mc t-dark"><div class="lg" style="width:100%">{LOGO}</div><b>тёмная тема</b></div><div class="mc t-light"><div class="lg" style="width:100%">{LOGO}</div><b>светлая тема</b></div></div>',
       '<p class="note"><b>Где точка:</b> в логотипе — над «i» (туда она приезжает в заставке); в знаке GR — внутри G, на конце пути. Это одна и та же точка. Точка везде жёлтая; на светлом у неё ободок цвета ink, чтобы жёлтый был виден.</p>',
       '<h3>Знак GR</h3>',
       f'<div class="marks"><div class="mc t-dark"><div class="lg" style="width:100%">{GR}</div><b>тёмная</b></div><div class="mc t-light"><div class="lg" style="width:100%">{GR_L}</div><b>светлая</b></div></div>',
       f'<h3>Иконка: 120 · 60 · 40 · 29 · 20</h3><div class="row" style="align-items:flex-end">' + ''.join(f'<span class="ic2" style="width:{px}px;border-radius:{round(px*.22)}px">{ICONS["dark"]}</span>' for px in (120, 60, 40, 29, 20)) + '</div>',
       f'<h3>Варианты иконки</h3><div class="row" style="align-items:flex-end"><figure style="width:96px"><span class="ic2" style="width:96px;border-radius:21px">{ICONS["dark"]}</span><figcaption><b>обычная</b>iOS и Android</figcaption></figure><figure style="width:96px"><span class="ic2" style="width:96px;border-radius:21px">{IC_T}</span><figcaption><b>тонированная</b>iOS, один цвет</figcaption></figure><figure style="width:96px"><span class="ic2" style="width:96px;border-radius:48px;background:#3a4a5c">{IC_M}</span><figcaption><b>одноцветная</b>Android, тема</figcaption></figure></div>',
       f'<h3>Мелко на светлом (24 px и меньше)</h3><div class="row" style="align-items:center"><span class="t-light" style="display:inline-block;padding:10px;border-radius:10px;background:var(--bg)"><span class="ic2" style="width:40px">{GR_S}</span></span><span class="t-light" style="display:inline-block;padding:10px;border-radius:10px;background:var(--bg)"><span class="ic2" style="width:28px">{GR_S}</span></span></div><p class="note">На светлом фоне при 24 px и меньше (меню, фавикон) точка цвета ink, без жёлтого: жёлтый в ободке там превращается в соринку. Жёлтая точка — на иконке, заставке, в ожидании и на крупном знаке.</p>',
       '<p class="note">Скругления и толщина у G и R — как в слове GoRix. Зазор между G и R — как в слове (70): плотнее (30) буквы слипались на 20–29 px. Точка в знаке крупнее (r 85). «Кнопка Go» и силуэты «спокойный/смелый» сняты: выбран знак GR, у G прямой конец.</p>']
out.append(f'<h2>1. Где виден бренд</h2><p>Бренд — там, где приложение говорит от своего имени. В рабочих экранах знака нет. Клиент подрядчика видит логотип подрядчика. Листайте вбок →</p><div class="row">{placements()}</div>')
out.append('<p class="note">Нигде больше: ни на кнопках, ни в списках, ни в SMS. Пуш — только иконка, её ставит система.</p>')
out.append('<h2>2. Анимации знака: три, где и когда</h2><div class="seg" id="rm"><button data-rm="0" aria-pressed="true">С движением</button><button data-rm="1" aria-pressed="false">Уменьшенное движение</button></div>')
for k, t, moves, where, dur, rm, word in motions:
    w = f'<span class="w">{word}</span>' if word else ''
    out.append(f'<div class="mot t-dark"><div class="vis"><div id="m-{k}">{MOTION[k]}</div>{w}<button data-replay="m-{k}">Ещё раз</button></div><div><h3>{t}</h3><p class="mv">{moves}</p><p>{where}</p><p><b>{dur}</b></p><p>{rm}</p></div></div>')
out.append('<h3>Полоса «Нет сети» — без знака</h3><p>Рабочий экран, бренду там не место: обычный значок «Наряда» и слова, без анимации.</p><div class="strip t-dark"><svg viewBox="0 0 24 24" style="width:18px;height:18px"><path d="M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 7 18zM12 15V10M9.5 12.5 12 10l2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Нет сети · Ждёт отправки · 3</span></div>')
out.append('<p>На экране одновременно не больше одной анимации знака.</p><h3>Где анимации знака НЕТ</h3><ul class="no">' + ''.join(f'<li>{x}</li>' for x in no_anim) + '</ul>')
out.append('<h2>3. Пустые экраны</h2><p>Пустота говорит про объект, а не про бренд. Размер значка: 24 мелковат, предлагаю 36 (новый токен <code>component.emptyIcon</code>), цвет mut:</p><div class="row">')
out.append(fig(list_screen(empty(icon(P_CLIENT, 24), 'Клиентов пока нет', 'Клиент появится, когда вы добавите его или превратите лид в клиента', 'Добавить клиента'), 'dark'), 'Значок 24 · было', 'мелко рядом с заголовком'))
for th in ('dark', 'light'):
    out.append(fig(list_screen(empty(icon(P_CLIENT, 36), 'Клиентов пока нет', 'Клиент появится, когда вы добавите его или превратите лид в клиента', 'Добавить клиента'), th), f'Значок 36 · {"тёмная" if th == "dark" else "светлая"}', 'рекомендую'))
out.append(fig(list_screen(empty(icon(P_SEARCH, 36), 'В этом отборе пусто', 'Измените отбор или сбросьте его', 'Сбросить фильтр', 'ghost'), 'dark'), 'Ничего не найдено', 'без жёлтой кнопки, «Сбросить фильтр»'))
out.append(fig(list_screen(empty(icon(P_CLOUD, 36), 'Не получилось загрузить', 'Нет сети. Данные с телефона показаны, новые подтянутся сами', 'Повторить', 'secondary'), 'light'), 'Нет сети / не загрузилось', '«Повторить», без жёлтой кнопки'))
out.append(fig(phone('<div class="lh"><b>Главная</b></div>' + empty(f'<span class="mk" style="width:80px">{GR}</span>', 'Начнём с первого клиента', 'Дальше — смета, работа и оплата', 'Добавить клиента') + TABS, 'dark'), 'Новая компания', 'одно из трёх мест со знаком GoRix (48)'))
out.append(fig(phone('<div class="lh"><b>Требует внимания</b></div>' + empty(ICO_OK, 'Всё сделано', 'Новые дела появятся здесь') + TABS, 'light'), '«Требует внимания» пусто', 'это хорошо: значок «готово» и слово'))
out.append('</div><p class="note">Нижняя панель — как в приложении: «Главная · План · Чаты · Клиенты · Ещё», «＋» плавает справа над панелью.</p>')
out.append('<h3>Ширины</h3><p>390 — на всю колонку · 820 — по центру над двумя колонками · 1280 — по центру списка, слева от панели карточки. Блок не шире 560.</p><div class="row">')
out.append(fig('<div class="wide t-dark"><div class="scr"><div class="side"><i></i><i></i><i></i></div><div class="lst"><div class="fb">Все · Активные</div>' + empty(icon(P_CLIENT, 28), 'Клиентов пока нет', '', 'Добавить клиента') + '</div><div class="pnl"></div></div></div>', '1280 · тёмная', 'по центру области списка', 300))
out.append(fig('<div class="wide t-light"><div class="scr"><div class="side"><i></i><i></i><i></i></div><div class="lst"><div class="fb">Все · Активные</div>' + empty(icon(P_CLIENT, 28), 'Клиентов пока нет', '', 'Добавить клиента') + '</div></div></div>', '820 · светлая', 'по центру над двумя колонками', 300))
out.append('</div><h2>4. Кнопки</h2><p>Бренд на кнопках не используется: ни знака, ни своего цвета, ни своих форм. Главная кнопка — жёлтая, высота 36, зона нажатия 44 (дизайн-система §7). Вариант 44 для закреплённой панели ждёт вашего решения по снимкам.</p>')
out.append('<h2>Открыто, решает не дизайн</h2><p>Имя «Gorix» в App Store занято (нужно «GoRix: Contractor App»). Товарный знак — проверка юристом до заявки в App Store.</p>')
out.append('</main><script>' + js + '</script></body></html>')
(root / 'usage-preview.html').write_text(''.join(out))
print('ok', len(''.join(out)))
