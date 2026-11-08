/**
 * The guard of the one filter rule (docs/specs/31-list-filters.md, director 07.11, step 10в PR 7).
 * - Every list screen draws its filters with FilterBar (the magnifier, one lane, «Фильтры» with the sheet) and nothing of
 *   its own over the list: no ChoiceChips, no Segmented, no search field. An exception is named here with its reason.
 * - A list screen (a route that draws a list of cards) is either in LISTS or in NO_FILTER — a new one fails until it is
 *   put in one of them. Detail screens ([id]), forms (new, edit, import) and the client's page (/p/) are not lists.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve(__dirname, "../src");
const APP = path.join(SRC, "app");
const read = (f: string) => fs.readFileSync(path.join(SRC, f), "utf8");

/** route → the files that draw it (the route file and the screen component it hands over to) */
const LISTS: Record<string, string[]> = {
  clients: ["app/(tabs)/clients.tsx"],
  leads: ["app/(tabs)/leads.tsx"],
  estimates: ["app/estimates.tsx", "features/boards.tsx"],
  invoice: ["app/invoice/index.tsx"],
  jobs: ["app/jobs.tsx"],
  tasks: ["app/tasks.tsx"],
  catalog: ["app/catalog/index.tsx"],
  payments: ["app/payments/index.tsx"],
  plan: ["app/(tabs)/plan.tsx"],
  calls: ["app/calls.tsx", "features/comms/CommsScreen.tsx"],
  money: ["app/money.tsx"],
  "reports/[id]": ["app/reports/[id].tsx"],
};

/** what a list screen may still draw over its list, and why (director 07.11) */
const EXCEPTIONS: Record<string, { pattern: string; count: number; why: string }[]> = {
  "app/(tabs)/plan.tsx": [
    { pattern: "<Segmented", count: 1, why: "exception №1: the views «Лента · День · Неделя · Месяц» in the header — a view, not a filter" },
    { pattern: "<ChoiceChips", count: 1, why: "the days of the week in the Day: moving to a day, not narrowing a list" },
  ],
};

/** list screens with no filter at all, and why (director 07.11: «экраны без фильтров — исключение со списком в стороже») */
const NO_FILTER: Record<string, string> = {
  "company/intake": "«Приём заявок»: the last 50 requests of the journal, held ones first — nothing to narrow",
  "company/payments": "«Онлайн-оплата»: the state of one Stripe account — not a list",
  "company/checklists": "«Чек-листы»: a handful of the company’s templates, nothing to narrow",
  "estimate/templates": "«Шаблоны смет»: a handful of the company’s templates (spec 07 §2: no folders, up to ~30), nothing to narrow",
  team: "«Команда»: a handful of people, nothing to narrow",
  today: "«Требует внимания»: what needs a hand now, already chosen; its period switch is the figures', not a list's",
  triage: "«Требует внимания» (the old address)",
  notifications: "«Уведомления»: unread first, then read",
  messages: "«Сообщения»: one card per person, newest first",
  visits: "the tech's day: today's visits and the week, nothing to narrow",
  "figures/[metric]": "a figure of «Главная»: its list is the figure itself (the period came from the tap)",
  reports: "«Отчёты»: four reports to open, not a list to narrow",
  search: "«Поиск»: the search is the screen",
};

const BANNED = ["<ChoiceChips", "<Segmented"];
const SEARCH_FIELD = /<TextField[^>]*type="search"/g;
const count = (s: string, needle: string | RegExp) => (typeof needle === "string" ? s.split(needle).length - 1 : (s.match(needle) ?? []).length);

function routes(dir = APP, base = ""): { route: string; file: string }[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return routes(path.join(dir, e.name), e.name.startsWith("(") ? base : `${base}${e.name}/`);
    if (!e.name.endsWith(".tsx") || e.name.startsWith("_")) return [];
    return [{ route: `${base}${e.name.replace(/\.tsx$/, "")}`.replace(/\/index$/, ""), file: path.relative(SRC, path.join(dir, e.name)) }];
  });
}
/** a route that draws a list of cards itself or through a list screen component */
const LIST_SIGN = /<CardList|<CardGrid|<EstimatesBoard|<CommsScreen|<MessagesScreen/;
const NOT_A_LIST = (r: string) => /\[[^\]]+\]$/.test(r) && r !== "reports/[id]" && r !== "figures/[metric]" ? true : /(^|\/)(new|edit|import)$/.test(r) || r.startsWith("p/");

describe("the one filter rule over every list (spec 31, PR 7 guard)", () => {
  for (const [route, files] of Object.entries(LISTS)) {
    it(`${route}: FilterBar, nothing of its own over the list`, () => {
      const all = files.map((f) => ({ f, s: read(f) }));
      expect(all.some(({ s }) => s.includes("<FilterBar")), `${route}: draw the filters with FilterBar (src/ui/filterBar.tsx)`).toBe(true);
      for (const { f, s } of all) {
        const allowed = EXCEPTIONS[f] ?? [];
        for (const b of BANNED) {
          const ok = allowed.find((x) => x.pattern === b)?.count ?? 0;
          expect(count(s, b), `${f}: ${b} over a list — use FilterBar, or name the exception in EXCEPTIONS with its reason`).toBe(ok);
        }
        expect(count(s, SEARCH_FIELD), `${f}: a search field of its own — FilterBar has the magnifier (search={…})`).toBe(0);
      }
    });
  }

  it("every list screen is in LISTS or in NO_FILTER", () => {
    const lists = routes()
      .filter(({ route }) => !NOT_A_LIST(route))
      .filter(({ file }) => LIST_SIGN.test(read(file)))
      .map(({ route }) => route);
    const unknown = lists.filter((r) => !(r in LISTS) && !(r in NO_FILTER));
    expect(unknown, "a new list screen: put it in LISTS (FilterBar) or in NO_FILTER with its reason").toEqual([]);
  });

  it("the lists named here exist (a renamed route does not slip out of the guard)", () => {
    const known = new Set(routes().map((x) => x.route));
    for (const r of [...Object.keys(LISTS), ...Object.keys(NO_FILTER)]) expect(known.has(r), `no route «${r}»`).toBe(true);
    for (const f of Object.values(LISTS).flat()) expect(fs.existsSync(path.join(SRC, f)), `no file ${f}`).toBe(true);
  });

  it("a screen without filters has no FilterBar (else it belongs in LISTS)", () => {
    for (const r of Object.keys(NO_FILTER)) {
      const f = routes().find((x) => x.route === r)!.file;
      expect(read(f).includes("<FilterBar"), `${r} draws FilterBar — move it to LISTS`).toBe(false);
    }
  });
});
