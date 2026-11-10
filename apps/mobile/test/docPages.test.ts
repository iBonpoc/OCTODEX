/**
 * «Страницы-вложения» of an estimate (spec 33 П24.7, S6g; security-check of stage 0). One rule on the phone and on the
 * server: the examples of test/fixtures/docPages.json are checked here against clientPages / pagesProblem and in db T165
 * against app.doc_pages / app.doc_pages_problem — a change of a rule changes the file, both sides go red.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
vi.mock("expo-print", () => ({}));
vi.mock("expo-sharing", () => ({}));
vi.mock("expo-clipboard", () => ({}));
vi.mock("@/cloud/client", () => ({ supabase: {} }));
vi.mock("@/config/backend", () => ({ WEB_APP_URL: "https://example.test" }));
import { clientPages, pagesHtml, pagesProblem, withSendablePages, PAGE_LIMITS } from "../src/features/docPages";
import { clientDoc, DEFAULT_SETTINGS } from "../src/features/estimateDoc";
import { estimateHtml } from "../src/features/estimatePdf";
import { portalFromEstimate } from "../src/cloud/portal";
import { makeSeed } from "../src/data/seed";
import type { Estimate, EstimateDoc } from "../src/data/types";
import fx from "./fixtures/docPages.json";

describe("pages = the server's (T165)", () => {
  it.each(fx.cases)("$name", (c) => {
    expect(clientPages(c.in)).toEqual(c.out);
    expect(pagesProblem(c.in)).toBe(c.problem);
  });
  it("3001 shapes: the first 3000 drawn, writing refused (built here and in T165, too long for the file)", () => {
    const items = Array.from({ length: 3001 }, (_, i) => ({ t: "r", x: i % 100, y: 0, w: 1, h: 1 }));
    const pages = [{ id: "p", title: "P", w: 10, h: 10, items }];
    expect(clientPages(pages)[0]!.items).toHaveLength(PAGE_LIMITS.items);
    expect(pagesProblem(pages)).toBe("shape");
  });
  it("too big for the app: refused by size before the server", () => {
    const items = Array.from({ length: 3000 }, () => ({ t: "x", x: 1, y: 1, s: "w".repeat(200), fs: 11 }));
    expect(pagesProblem([{ id: "p", title: "P", w: 10, h: 10, items }])).toBe("size");
  });
});

const good = fx.cases[0]!.in as unknown[];

describe("the PDF draws only what passes, every text escaped", () => {
  it("a good page: a new sheet, the title, the shapes, the note and the table", () => {
    const h = pagesHtml(good);
    expect(h).toContain("break-before:page");
    expect(h).toContain("<h2>Drawing</h2>");
    expect(h.match(/<line /g)).toHaveLength(2);
    expect(h).toContain('stroke-dasharray="4 4"');
    expect(h).toContain("<circle ");
    expect(h).toContain("<path d=");
    expect(h).toContain("<rect ");
    expect(h).toContain(">12′ 4″</text>");
    expect(h).toContain('text-anchor="start"');
    expect(h).toContain("Measured roughly");
    expect(h).toContain("<th>Length</th>");
  });
  it("markup in a text or a colour never gets out", () => {
    const h = pagesHtml([
      {
        id: 'x"><script>',
        title: "<img src=x onerror=alert(1)>",
        note: "</p><script>alert(2)</script>",
        w: 10,
        h: 10,
        items: [
          { t: "x", x: 1, y: 1, s: "</text><script>alert(3)</script>", fs: 11 },
          { t: "l", x1: 0, y1: 0, x2: 1, y2: 1, sw: 1, ink: 'red" onload="alert(4)' },
          { t: "c", cx: 1, cy: 1, r: 1, sw: 1, fill: "paper", onload: "alert(5)" },
        ],
        head: ["<b>"],
        rows: [["<i>"]],
      },
    ]);
    expect(h).not.toMatch(/<script|<img|<i>|onload="/);
    expect(h).not.toContain("alert(4)");
    expect(h).toContain("&lt;/text&gt;&lt;script&gt;");
  });
  it("no pages — nothing", () => {
    expect(pagesHtml(undefined)).toBe("");
    expect(pagesHtml([])).toBe("");
  });
});

const doc = (pages?: unknown): EstimateDoc =>
  ({
    options: [{ id: "o1", name: "A", lines: [{ id: "l1", group: "labor", name: "Work", quantity: "1", unit: "ea", unitPriceCents: 1000 }] }],
    settings: { ...DEFAULT_SETTINGS, deposit: { kind: "none" } },
    ...(pages !== undefined ? { pages } : {}),
  }) as unknown as EstimateDoc;

describe("the estimate and its pages", () => {
  it("clientDoc passes the pages as the server does; none — no key", () => {
    expect(clientDoc(doc(good)).pages).toEqual(fx.cases[0]!.out);
    expect("pages" in clientDoc(doc())).toBe(false);
    expect("pages" in clientDoc(doc([{ id: "bad" }]))).toBe(false);
  });
  it("the estimate PDF has the page after the signatures; an old estimate without pages — as before", () => {
    const db = makeSeed();
    const c = db.customers[0]!;
    const e: Estimate = { id: "eP", customerId: c.id, propertyId: db.properties.find((p) => p.customerId === c.id)!.id, title: "T", totalCents: 1000, status: "sent", number: "EST-1", doc: doc(good) };
    db.estimates = [...db.estimates, e];
    const h = estimateHtml(portalFromEstimate(db, e, "Acme"), { lang: "en" });
    expect(h).toContain("<h2>Drawing</h2>");
    expect(h.indexOf("<h2>Drawing</h2>")).toBeGreaterThan(h.indexOf('class="sigs"'));
    const old = { ...e, id: "eQ", doc: doc() };
    db.estimates = [...db.estimates, old];
    expect(estimateHtml(portalFromEstimate(db, old, "Acme"), { lang: "en" })).not.toContain("attach");
  });
  it("to the server: pages it would refuse are left out, the estimate goes; good pages go as they are", () => {
    const five = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, title: "P", w: 1, h: 1, items: [] }));
    expect("pages" in withSendablePages(doc(five))).toBe(false);
    expect(withSendablePages(doc(good)).pages).toBe(good);
    const none = doc();
    expect(withSendablePages(none)).toBe(none);
  });
});
