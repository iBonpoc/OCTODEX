/**
 * DS §12.13 «Шапка» (#2841, founder 26.11: one header on every screen). The header's word rules, pure:
 * - «‹» says the parent's title; one longer than BACK_MAX letters is said by its kind word, never cut with «…»;
 * - a list's big title is its menu word, no number (the number is in the chip «Все N» or the line under the title);
 * - review design/crm: a property — the street, the city a whole line under it; a visit — «Выезд · <day>», the hours, the tech
 *   and the client a whole line under it; «Пригласить» on «Команда» keeps its word; an editor's title is its kind word;
 *   every «＋» says its action to VoiceOver.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BACK_MAX, backLabel, visitHeadLine, visitHeadTitle } from "../src/ui/templates/templateRules";
import { propertyHead } from "../src/features/properties";
import type { Property } from "../src/data/types";
import { ru } from "../src/i18n/ru";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("#2841 the back label", () => {
  it("a short parent title stays as it is", () => {
    expect(backLabel("Sarah Mitchell", "/client/c1")).toEqual({ label: "Sarah Mitchell" });
    expect(backLabel("Клиенты", "/clients")).toEqual({ label: "Клиенты" });
  });
  it("a long one becomes the parent's kind word, by the parent's address", () => {
    const long = "Bathroom remodel: vanity, toilet, tile";
    expect(long.length).toBeGreaterThan(BACK_MAX);
    expect(backLabel(long, "/job/j1")).toEqual({ kind: "job" });
    expect(backLabel(long, "/estimate/e5")).toEqual({ kind: "estimate" });
    expect(backLabel(long, "/invoice/i5")).toEqual({ kind: "invoice" });
    expect(backLabel(long, "/client/c1")).toEqual({ kind: "client" });
  });
  it("an unknown parent keeps its label (no wrong word)", () => {
    expect(backLabel("A very long name of something else", "/company/profile")).toEqual({ label: "A very long name of something else" });
  });
});

describe("#2841 titles", () => {
  it("a list title has no number", () => {
    const s = read("src/ui/templates/ListScreen.tsx");
    expect(s).toMatch(/const title = p\.title;/);
    expect(s).not.toMatch(/count\?: number/);
  });
  it("a document is named by its kind and number (#2843 (а))", () => {
    expect(read("src/features/invoice/InvoiceCard.tsx")).toMatch(/title: `\$\{t\("inv\.title"\)\} \$\{number\}`/);
    expect(read("src/features/EstimateCard.tsx")).toMatch(/t\("est\.detail"\)\} \$\{e\.number\}/);
    expect(read("src/app/receipt/[id].tsx")).toMatch(/t\("rcpt\.title"\)\} \$\{p\.receiptNumber\}/);
  });
  it("no word button in a header: «＋» is a round HeaderButton", () => {
    for (const f of ["src/app/catalog/index.tsx", "src/app/purchase-orders/index.tsx", "src/app/money.tsx", "src/app/suppliers/index.tsx"]) {
      const s = read(f);
      expect(s, f).toMatch(/right=\{[^}]*<HeaderButton icon="plus"/s);
      expect(s, f).not.toMatch(/right=\{[^\n]*<Button label=/);
    }
  });
  it("Д-шапка-6 exception: «Пригласить» on «Команда» is the main action, said with its word", () => {
    const s = read("src/app/team.tsx");
    expect(s).toMatch(/right=\{[^\n]*<Button label=\{t\("team\.invite"\)\}/);
    expect(s).not.toMatch(/HeaderButton/);
  });
  it("Д-шапка-4: an editor's title is its kind word, the name is in the field below — never twice", () => {
    expect(read("src/app/catalog/[id].tsx")).toMatch(/title=\{found \? t\("cat\.edit"\) : t\("cat\.new"\)\}/);
    expect(read("src/app/suppliers/[id].tsx")).toMatch(/title=\{found \? t\("sup\.edit"\) : t\("sup\.new"\)\}/);
    expect(read("src/app/catalog/[id].tsx")).not.toMatch(/found\.name \|\|/);
    expect(read("src/app/suppliers/[id].tsx")).not.toMatch(/found\.name \|\|/);
  });
});

describe("#2841 object headers (review design/crm)", () => {
  const prop = (x: Partial<Property>) => ({ id: "p1", customerId: "c1", address: "", city: "", ...x }) as Property;
  it("a property: the street is the title, «City, ST zip» a whole line under it", () => {
    expect(propertyHead(prop({ address: "1420 Oak Grove Ave", city: "Pasadena, CA 91103" }))).toEqual({ title: "1420 Oak Grove Ave", subtitle: "Pasadena, CA 91103" });
    expect(propertyHead(prop({ address: "", city: "Pasadena, CA 91103" }))).toEqual({ title: "Pasadena, CA 91103", subtitle: undefined });
  });
  it("the property screen has no column right of the rule (no head.sub)", () => {
    const s = read("src/app/property/[id].tsx");
    expect(s).toMatch(/subtitle=\{propertyHead\(p\)\.subtitle\}/);
    expect(s).not.toMatch(/head=\{\{ kind: "object", sub:/);
  });
  it("a visit: «Выезд · <day>»; the hours, the tech and the client a whole line under it", () => {
    expect(visitHeadTitle("Выезд", "Fri, Nov 6")).toBe("Выезд · Fri, Nov 6");
    expect(visitHeadLine(["8:30–12:30", "Alex", "Sarah Mitchell", undefined])).toBe("8:30–12:30 · Alex · Sarah Mitchell");
    expect(visitHeadLine(["8:30–12:30", undefined, "Sarah Mitchell"])).toBe("8:30–12:30 · Sarah Mitchell");
    const s = read("src/app/visit/[id].tsx");
    expect(s).toMatch(/title: visitHeadTitle\(t\("visit\.title"\), day\(v\.start\)\)/);
    expect(s).toMatch(/subtitle=\{headLine\}/);
    expect(s).not.toMatch(/sub=\{headSub\}/);
  });
});

describe("#2841 the number is on every list screen", () => {
  it("Лиды: the first chip is «Все N»", () => {
    expect(read("src/app/(tabs)/leads.tsx")).toMatch(/const n = c === "archive" \? 0 : pass\[c\]\(\)\.length;/);
  });
  it("Задачи (no chips): the count is the line under the title", () => {
    expect(read("src/app/tasks.tsx")).toMatch(/subtitle=\{t\("task\.openN", \{ n: openN \}\)\}/);
    expect(read("src/ui/templates/ListScreen.tsx")).toMatch(/subtitle=\{p\.subtitle\}/);
  });
  it("Заказы поставщикам: the lanes carry their counts", () => {
    expect(read("src/app/purchase-orders/index.tsx")).toMatch(/label: t\("po\.f\.open"\), count:/);
  });
});

describe("#2841 «＋» says its action", () => {
  it("every header «＋» label is an action word, not the object alone", () => {
    const keys = ["fab.a11y.clients", "fab.a11y.tasks", "fab.a11y.plan", "fab.a11y.calls", "fab.a11y.messages", "money.newExpense", "cat.new", "po.new", "sup.new"] as const;
    for (const k of keys) expect(ru[k], k).toMatch(/^(Нов|Добав|Создать)/);
    expect(read("src/nav/Fab.tsx")).toMatch(/fab\.a11y\.\$\{p\.set\}/);
    expect(read("src/app/money.tsx")).toMatch(/label=\{t\("money\.newExpense"\)\}/);
  });
});
