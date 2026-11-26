#!/usr/bin/env python3
"""Builds the page «GoRix — было | стало» (26.11.2026) from the photographer's shots.

Shots: `npm run shot -- <route> --theme light|dark --width 390 --repo <worktree at commit>`;
the logs `commit|route|opts|theme|file` are passed as arguments. Images are cropped to 390×844
(the photographer's stamp below is cut off; the commit is in the caption) and saved as jpg.
"""
import html, json, os, sys
from PIL import Image, ImageChops

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(HERE, "img")
os.makedirs(IMG, exist_ok=True)

shots = {}
for log in sys.argv[1:]:
    for line in open(log, encoding="utf8"):
        p = line.rstrip("\n").split("|")
        if len(p) == 5 and p[4].endswith(".png"):
            shots[(p[0], p[1], p[2].strip(), p[3])] = p[4]

def jpg(src, name, crop=True):
    im = Image.open(src).convert("RGB")
    if crop:
        im = im.crop((0, 0, 390, min(844, im.height)))
    out = os.path.join(IMG, name + ".jpg")
    im.save(out, "JPEG", quality=72, optimize=True, progressive=True)
    return "img/" + name + ".jpg"

def same(a, b):
    A = Image.open(a).convert("RGB").crop((0, 0, 390, 844))
    B = Image.open(b).convert("RGB").crop((0, 0, 390, 844))
    return A.size == B.size and ImageChops.difference(A, B).getbbox() is None

# --- what the founder sees -------------------------------------------------
MERGED = [
    dict(id="estimate-25", title="Смета: карточка и редактор по карте аудита",
         what="Карточка сметы без значков-отправок: одно «Показать клиенту», «Позвонить», «Скопировать ссылку» ушла в «⋯». Шторка отправки без отсчёта «Отменить · 5». В редакторе «⋯» без второй «Отправить», «Добавить в каталог» — пункт в «⋯» позиции. Налог «%» сразу ставит ставку прошлой сметы. Клиента меняют только у черновика.",
         prs=[2629, 2631, 2635, 2637, 2639, 2642, 2649, 2666], when="25 ноября, 3:34–12:37",
         before="44e8ad3", after="16195e3",
         screens=[("/estimate/e5", "", "Карточка сметы EST-0005"), ("/estimate/new?id=e6", "", "Редактор сметы EST-0006")]),
    dict(id="estimate-24", title="Смета: редактор 24 ноября",
         what="Способы добавить позицию — плитки 2×2 без «˅», «Вариант» ушёл в «⋯», «депозит» вместо «задаток». Деньги в редакторе всегда с центами. Меню позиции целиком, без «Выше/Ниже». Скрытая позиция — пунктирная рамка и «Скрыто от клиента». «Итого» над клавиатурой, пока печатают в итогах.",
         prs=[2464, 2467, 2481, 2482, 2483], when="24 ноября, 3:30–11:00",
         before="0843b63", after="ad4e002",
         screens=[("/estimate/new?id=e6", "", "Редактор сметы EST-0006")]),
    dict(id="client-contract", title="Карточка клиента: остаток по договору",
         what="Остаток по договору считается одним правилом в карточке клиента и в блоке «Договор».",
         prs=[2492], when="24 ноября, 22:05",
         before="0a6110a", after="f4789f4",
         screens=[("/client/c1", "", "Клиент c1")]),
    dict(id="badges", title="Плашки статусов: «черновик», размер слова, «Просрочен N дн»",
         what="У черновика свой значок, слово на плашке 13 pt, у просроченного счёта — «Просрочен N дн». Дизайн-система 1.42.0.",
         prs=[2539], when="25 ноября, 2:42",
         before="fa15af2", after="44e8ad3",
         screens=[("/finance", "", "Деньги")]),
    dict(id="showcase", title="Витрина дизайн-системы, шаг 1",
         what="Токены снова в списке, тема переключается прямо в витрине, слова не рвутся, подписи «что это и где видно» правдивые, один зазор.",
         prs=[2748], when="25 ноября, 17:38",
         before="05df39f", after="1459c86",
         screens=[("/settings/design-system", "", "Настройки → Дизайн-система"), ("/settings/design-system/base", "", "Витрина → Цвета и текст")]),
    dict(id="list-count", title="Число в заголовке списка",
         what="Число рядом с заголовком «Клиенты» и «Лиды» — сколько строк сейчас на экране, а не всего в базе.",
         prs=[2820], when="25 ноября, 23:46",
         before="ddf1729", after="a2d7445",
         screens=[("/clients", "", "Клиенты"), ("/leads", "", "Лиды")]),
    dict(id="lead-replied", title="Лид после «Ответил»: без «Напомнить про смету»",
         what="Лид ответил, а сметы ещё нет — карточка не зовёт «Напомнить про смету», а ведёт к созданию сметы.",
         prs=[2827], when="26 ноября, 0:26",
         before="c6ca46d", after="bde19c3",
         screens=[("/lead/l3", "", "Лид Tom Becker")]),
    dict(id="large-font", title="Крупный шрифт: подписи быстрых действий целиком",
         what="При самом крупном шрифте подписи под кнопками «Позвонить», «Маршрут»… не переносятся по слогам.",
         prs=[2832], when="26 ноября, 1:29",
         before="bde19c3", after="7b21955",
         screens=[("/client/c1", "--font large", "Клиент c1, шрифт «самый крупный»")]),
    dict(id="profile-role", title="Профиль: роль — поле со списком",
         what="Роль в профиле выбирается полем со списком, а не строкой кнопок, которая не помещалась.",
         prs=[2834], when="26 ноября, 2:42",
         before="196db26", after="517e0b3",
         screens=[("/settings/profile", "", "Профиль и аккаунт")]),
    dict(id="cents", title="Суммы везде с центами: Главная, Деньги, Отчёты",
         what="Все суммы на экранах, в плитках и в PDF клиенту — с центами: $2,800 → $2,800.00, $6,392 → $6,392.36. Округлённых сумм в приложении больше нет.",
         prs=[2904], when="26 ноября, 15:18",
         before="b47f8e9", after="261eab6",
         screens=[("/today", "", "Главная"), ("/finance", "", "Деньги"), ("/reports", "", "Отчёты")]),
]

NO_SHOT = [
    ("Окно «Клиент подписал версию от …»: «Сделать копию» / «Сбросить», главная кнопка, тост с номером", [2674, 2825, 2836],
     "Открывается только когда сервер отказал правке, пока ждали сети — в демо его не вызвать."),
    ("Тост «Вернуть» вместо «Отменить» во всём приложении", [2756], "Тост живёт 5 секунд после действия; слово сменилось, вид тот же."),
    ("Gutters: окно gutter — «Gutter № N», длина без «Применить», «фут + дюйм | мм», строки Elbow/Offset, «Закрыть | Сохранить», рулетка не прыгает",
     [2465, 2475, 2484, 2493, 2513, 2632, 2662], "Окно открывается после рисования на холсте; фотограф пока не умеет рисовать."),
    ("«Разбор дел» → «Позже» → «Выбрать дату…»", [2257], "Шторка внутри «Требует внимания»."),
    ("Поведение без нового вида: свайп «назад» не теряет правки, Esc в окне вопроса, список 1280, тексты ошибок денег на EN/ES, фото и файлы",
     [2891, 2818, 2816, 2886, 1703, 1691], "Вид экранов не меняется."),
]

PENDING = [
    dict(id="header", title="Шапка экранов: одни правила на всех экранах", pr=2922,
         what="Заголовок называет то, что открыто; «Назад» без обрезки; число в заголовке списка уходит в чип «Все N»; «＋ Новая позиция» — круг «＋»; приветствие «Главной» строкой над заголовком. Изменились 19 экранов.",
         state="Принята основателем (#2935), ждёт влития после #2920.",
         before="main", after="gorix-header",
         screens=[("/today", "", "Главная"), ("/clients", "", "Клиенты"), ("/invoice", "", "Счета")]),
    dict(id="contrast", title="«Повышение контраста», пунктир, цифра на кружке «Лиды»", pr=2920,
         what="Включено «Повышение контраста» в iPhone — серые и жёлтые слова темнеют до 7:1, для работы на солнце. Обычный вид почти не меняется: пунктир открытого пункта заметнее, цифра на кружке «Лиды» 11 → 12.",
         state="Ждёт проверки; на снимках — обычный вид, без «Повышения контраста». Переключатель — в прототипе: https://claude.ai/artifact/5nXsj23mMxSBgVJXpZb96m",
         before="main", after="gorix-stage3",
         screens=[("/today", "", "Главная, кружок «Лиды» внизу")]),
    dict(id="new-client", title="«⊕ Новый клиент» в выборе клиента новой сметы", pr=2931,
         what="Клиента нет в поиске — первой строкой «⊕ Новый клиент». Набранное («12 Oak St») переходит в нужное поле формы, после «Создать» — обратно в ту же смету.",
         state="Ждёт влития. Снимки из PR: слева как сейчас, в середине и справа — как будет.",
         ready=[("2931-390-light-before-after.png", "2931-390-dark-before-after.png", "Шторка «Клиент», поиск «12 Oak St»")]),
    dict(id="totals-390", title="Итоги сметы на узком телефоне", pr=None, issue=2954,
         what="На 390 слово стоит рядом со своей суммой, переключатель «% · Выкл · $» — со своим полем, «＋» — в последней строке.",
         state="Прототип в ветке fix/2954-narrow-rows, PR ещё нет. Снимки из ветки: слева как сейчас, справа как будет.",
         ready=[("2954-390-light-totals-before-after.png", "2954-390-dark-totals-before-after.png", "Итоги сметы"),
                ("2954-390-light-form-before-after.png", "2954-390-dark-form-before-after.png", "Повторяющиеся значения в форме")]),
]

HEAD = {"main": "29a9ba2", "gorix-header": "54180b5", "gorix-stage3": "494ff3d"}
SHOTS_DIR = "/root/GoRix/notes/screens"

def find(commit, route, opts, theme):
    f = shots.get((commit, route, opts, theme))
    if f and os.path.exists(f):
        return f
    # shots made before the logs (e.g. the first profile shot)
    slug = route.strip("/").replace("/", "_").replace("?", "_").replace("=", "_") or "index"
    c = HEAD.get(commit, commit)
    cand = os.path.join(SHOTS_DIR, c, f"{slug}__{theme}-390-ru-director{'-large' if 'large' in opts else ''}__{c}.png")
    return cand if os.path.exists(cand) else None

def slugify(s):
    return "".join(ch if ch.isalnum() else "-" for ch in s).strip("-")

cards, dropped, missing = [], [], []
def pairs_for(item):
    out = []
    for route, opts, label in item["screens"]:
        th = {}
        for theme in ("light", "dark"):
            b, a = find(item["before"], route, opts, theme), find(item["after"], route, opts, theme)
            if not (b and a):
                missing.append(f'{item["id"]} {route} {theme}')
                continue
            th[theme] = (b, a)
        if not th:
            continue
        if all(same(*v) for v in th.values()):
            dropped.append(f'{item["id"]} {route}')
            continue
        o = {"label": label}
        for theme, (b, a) in th.items():
            base = f'{item["id"]}-{slugify(route)}-{theme}'
            o[theme] = [jpg(b, base + "-was"), jpg(a, base + "-now")]
        out.append(o)
    return out

data = {"merged": [], "pending": []}
for it in MERGED:
    ps = pairs_for(it)
    if ps:
        data["merged"].append({k: it[k] for k in ("id", "title", "what", "prs", "when", "before", "after")} | {"pairs": ps})
    else:
        NO_SHOT.insert(0, (it["title"], it["prs"], "На демо-экране разницы в пикселях нет — изменение видно в другом состоянии."))
for it in PENDING:
    o = {k: it.get(k) for k in ("id", "title", "pr", "issue", "what", "state", "before", "after")}
    if "ready" in it:
        o["combo"] = []
        for lf, df, label in it["ready"]:
            o["combo"].append({"label": label,
                               "light": jpg(os.path.join(HERE, "ready", lf), "pend-" + lf[:-4], crop=False),
                               "dark": jpg(os.path.join(HERE, "ready", df), "pend-" + df[:-4], crop=False)})
    else:
        o["pairs"] = pairs_for(it)
    data["pending"].append(o)
data["noshot"] = [{"title": t, "prs": p, "why": w} for t, p, w in NO_SHOT]

tpl = open(os.path.join(HERE, "page.template.html"), encoding="utf8").read()
page = tpl.replace("/*DATA*/null", json.dumps(data, ensure_ascii=False))
open(os.path.join(HERE, "index.html"), "w", encoding="utf8").write(page)
print("merged cards:", len(data["merged"]), "pending:", len(data["pending"]))
print("dropped (no pixel diff):", dropped)
print("missing:", missing)
