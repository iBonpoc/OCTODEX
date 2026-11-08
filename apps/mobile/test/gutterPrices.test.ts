/** Цены модуля Gutters в прайсе компании (docs/specs/33-gutters-settings.md П22.10, M7d): поиск позиции, тестовые позиции без дублей, $ под рисунком. */
import { describe, expect, it } from "vitest";
import { computeGutterParts, type PartQty } from "@octo/estimating-engine";
import type { CatalogItem } from "../src/data/types";
import { TEST_RATES } from "../src/modules/gutters/canvas/testRates";
import {
  bindable, bindItem, findItem, LABOR_PARTS, laborRows, listPreview, matchAttrs, matchKey, materialRows, missingItems, sampleJob, stableItemId, testPriceCents,
} from "../src/modules/gutters/prices";
import { uuidV5 } from "../src/modules/gutters/uuid5";

const item = (o: Partial<CatalogItem>): CatalogItem => ({ id: "i", kind: "material", name: "x", unit: "ft", priceCents: 100, ...o });
const name = (p: PartQty) => `${p.attrs.part ?? p.attrs.work ?? p.key} (тест)`;
const C = "11111111-1111-4111-8111-111111111111";

describe("какие свойства важны по виду детали", () => {
  const rows = materialRows({});
  const byPart = (part: string) => rows.find((r) => matchAttrs(r.part).part === part)!;
  it("у желоба — что он и цвет; у крепления — без цвета; у работы — работа и этаж", () => {
    expect(matchAttrs(byPart("gutter").part)).toEqual({ part: "gutter", profile: "k", size: "5", material: "aluminum", gauge: ".027", finish: "painted", color: "white" });
    const h = matchAttrs(byPart("hanger").part);
    expect(h.color).toBeUndefined();
    expect(h).toMatchObject({ part: "hanger", profile: "k", size: "5" });
    expect(matchAttrs(LABOR_PARTS[1]!)).toEqual({ work: "install", story: "2" });
  });
  it("заглушка левая и правая — одна позиция (side не важен)", () => {
    const caps = computeGutterParts(sampleJob({})).parts.filter((p) => p.attrs.part === "end_cap");
    expect(caps.map((p) => p.attrs.side).sort()).toEqual(["L", "R"]);
    expect(new Set(caps.map(matchKey)).size).toBe(1);
    expect(rows.filter((r) => matchAttrs(r.part).part === "end_cap")).toHaveLength(1);
  });
  it("даунспот и желоб без part у движка получают его по ключу: позиция заглушки не находится для желоба", () => {
    const g = byPart("gutter").part;
    const cap = item({ id: "cap", unit: "ft", attributes: { ...matchAttrs(g), part: "end_cap" } });
    expect(findItem([cap], g)).toBeUndefined();
    expect(matchAttrs(byPart("downspout").part).part).toBe("downspout");
  });
  it("образец работы: только то, за что платит клиент (без рулона, палок, заклёпок), без работы", () => {
    expect(rows.every((r) => r.part.use !== "purchase" && r.part.kind === "material")).toBe(true);
    expect(rows.map((r) => matchAttrs(r.part).part)).toEqual(expect.arrayContaining(["gutter", "end_cap", "hanger", "downspout", "elbow", "outlet", "extension"]));
    expect(laborRows().map((r) => r.part.attrs.work)).toEqual(["install", "install", "install", "install", "downspout", "downspout", "downspout", "downspout", "corner_cut", "tearoff", "tile"]);
  });
  it("образец — по умолчаниям компании: K6 медь → строки K6 медь; метод угла strip → угол strip", () => {
    const raw = { run: { profile: "k", size: "6", material: "copper" }, rules: { corner: "strip" } };
    const g = materialRows(raw).find((r) => matchAttrs(r.part).part === "gutter")!;
    expect(matchAttrs(g.part)).toMatchObject({ size: "6", material: "copper" });
    expect(sampleJob(raw).corners.every((c) => c.method === "strip")).toBe(true);
  });
});

describe("поиск позиции", () => {
  const p = LABOR_PARTS[0]!; // install, story 1, ft
  it("по свойствам и той же единице; лишние свойства позиции не мешают, ближайшая первой", () => {
    const a = item({ id: "a", kind: "labor", attributes: { work: "install", story: "1", note: "x" } });
    const b = item({ id: "b", kind: "labor", attributes: { work: "install", story: "1" } });
    expect(findItem([a, b], p)?.id).toBe("b");
    expect(findItem([item({ id: "c", unit: "ea", attributes: { work: "install", story: "1" } })], p)).toBeUndefined();
    expect(findItem([item({ id: "d", unit: " FT ", attributes: { work: "Install", story: "1" } })], p)?.id).toBe("d");
    expect(findItem([item({ id: "e", attributes: { work: "install", story: "2" } })], p)).toBeUndefined();
  });
  it("набор (kit) не цена детали", () => {
    expect(findItem([item({ kind: "kit", attributes: { work: "install", story: "1" } })], p)).toBeUndefined();
  });
  it("«Привязать» — только к позиции без свойств и той же единицы; привязка пишет свойства детали", () => {
    const free = item({ id: "f" });
    const taken = item({ id: "t", attributes: { work: "tearoff" } });
    expect(bindable([free, taken, item({ id: "u", unit: "ea" })], p).map((x) => x.id)).toEqual(["f"]);
    const bound = bindItem(free, p);
    expect(bound).toEqual({ ...free, attributes: { work: "install", story: "1" } });
    expect(findItem([bound], p)?.id).toBe("f");
  });
});

describe("создать позиции сразу — тестовые цены, без дублей", () => {
  const rows = [...materialRows({}), ...laborRows()];
  it("каждая — тестовая (placeholder), цена в целых центах из TEST_RATES, свойства детали", () => {
    const made = missingItems(C, rows, [], name);
    expect(made.length).toBe(rows.length);
    for (const it of made) {
      expect(it.placeholder).toBe(true);
      expect(Number.isSafeInteger(it.priceCents) && it.priceCents >= 0).toBe(true);
      expect(it.attributes && Object.keys(it.attributes).length).toBeTruthy();
    }
    const inst = made.find((x) => x.attributes?.work === "install" && x.attributes.story === "1")!;
    expect(inst).toMatchObject({ kind: "labor", unit: "ft", priceCents: TEST_RATES["labor.ft"] });
    expect(testPriceCents({ section: "nope" as never, unit: "ea" })).toBe(0);
    // a material opens in the core's editor with the same price (cost × no tax × no markup)
    const gut = made.find((x) => x.attributes?.part === "gutter")!;
    expect(gut).toMatchObject({ kind: "material", unit: "ft", priceCents: TEST_RATES["gutter.ft"], costCents: TEST_RATES["gutter.ft"], vendorTaxBps: 0, markupBps: 0 });
  });
  it("второе нажатие: всё найдено — ничего; найдено частично — только недостающие", () => {
    const made = missingItems(C, rows, [], name);
    expect(missingItems(C, rows, made, name)).toEqual([]);
    expect(missingItems(C, rows, made.slice(3), name).map((x) => x.id)).toEqual(made.slice(0, 3).map((x) => x.id));
  });
  it("id один и тот же на любом телефоне; у другой компании — другой; формат UUID", () => {
    const a = missingItems(C, rows, [], name).map((x) => x.id);
    const b = missingItems(C, rows, [], () => "другое имя").map((x) => x.id);
    expect(b).toEqual(a);
    expect(new Set(a).size).toBe(a.length);
    const other = missingItems("22222222-2222-4222-8222-222222222222", rows, [], name).map((x) => x.id);
    expect(other.some((id) => a.includes(id))).toBe(false);
    for (const id of a) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(stableItemId(C, "x")).toBe(stableItemId(C, "x"));
    expect(stableItemId(C, "x")).not.toBe(stableItemId(C, "y"));
    // uuid v5 of (company id, «gutters:» + the part key) — the director's rule
    expect(stableItemId(C, "k")).toBe(uuidV5(C, "gutters:k"));
    // demo data: the company id is not a UUID — still a v5 UUID, still per company
    expect(stableItemId("demo", "k")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5/);
    expect(stableItemId("demo", "k")).not.toBe(stableItemId("demo2", "k"));
  });
  it("uuid v5 — эталон RFC: www.example.com в пространстве DNS", () => {
    expect(uuidV5("6ba7b810-9dad-11d1-80b4-00c04fd430c8", "www.example.com")).toBe("2ed6657d-e927-568b-95e1-2665a8aea6a2");
    expect(uuidV5("6ba7b811-9dad-11d1-80b4-00c04fd430c8", "http://www.ietf.org/rfc/rfc4122.txt")).toBe(uuidV5("6ba7b811-9dad-11d1-80b4-00c04fd430c8", "http://www.ietf.org/rfc/rfc4122.txt"));
    // a long name (several SHA-1 blocks) and non-ASCII
    expect(uuidV5(C, "ж".repeat(200))).toMatch(/^[0-9a-f-]{36}$/);
    expect(() => uuidV5("nope", "x")).toThrow();
  });
  it("позиция с этим id уже на телефоне (переименована, перепривязана) — не создаётся снова", () => {
    const [first] = missingItems(C, rows, [], name);
    const renamed = { ...first!, name: "Моя", attributes: { other: "1" } };
    expect(missingItems(C, rows, [renamed], name).some((x) => x.id === first!.id)).toBe(false);
  });
});

describe("$ под рисунком из прайса компании", () => {
  const parts = computeGutterParts(sampleJob({})).parts;
  it("без прайса — как раньше (тестовые ставки), «тестовые цены» видно", () => {
    const r = listPreview(parts, []);
    expect(r.listed).toBe(0);
    expect(r.test).toBe(true);
  });
  it("все детали в прайсе настоящими ценами — сумма из прайса, без «тестовые»", () => {
    const rows = [...materialRows({}), ...laborRows()];
    const real = missingItems(C, rows, [], name).map((it) => ({ ...it, placeholder: false, priceCents: 1234 }));
    const r = listPreview(parts, real);
    const client = parts.filter((p) => p.use !== "purchase");
    expect(r.listed).toBe(client.length);
    expect(r.test).toBe(false);
    // Σ qty × 1234, decimal, half up
    expect(r.totalCents).toBe(Math.round(client.reduce((s, p) => s + Number(p.qty) * 1234, 0)));
  });
  it("в прайсе тестовая позиция — «тестовые цены» остаются", () => {
    const made = missingItems(C, [...materialRows({}), ...laborRows()], [], name);
    expect(listPreview(parts, made).test).toBe(true);
  });
});
