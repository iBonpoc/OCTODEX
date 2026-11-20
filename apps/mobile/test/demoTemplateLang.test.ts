/**
 * #1223: the demo company's checklist template comes in the app's language when the demo starts (as a module's starter,
 * registry StarterChecklist), not in English in a Russian interface. Ids stay the same in every language.
 */
import { describe, expect, it } from "vitest";
import { demoTemplate, makeSeed } from "../src/data/seed";

describe("the demo checklist template in the app's language (#1223)", () => {
  it("ru: the template and the job visits' items are Russian", () => {
    const db = makeSeed("ru");
    const tpl = (db.checklistTemplates ?? []).find((x) => x.id === "tpl-job")!;
    expect(tpl.name).toBe("Каждый выезд на работу");
    expect(tpl.items.map((i) => i.label)).toEqual(["Защитить пол и мебель", "Согласовать объём работ с клиентом", "Убрать рабочее место", "Пройти по работе с клиентом"]);
    const v1 = db.visits.find((v) => v.id === "v1")!;
    expect(v1.checklist.map((c) => c.label)).toEqual(tpl.items.map((i) => i.label));
    expect(v1.checklist.every((c) => c.templateName === "Каждый выезд на работу")).toBe(true);
    expect(JSON.stringify(db.checklistTemplates)).not.toMatch(/Every job visit|Protect floors/);
  });
  it("es and en: their own words; the ids are the same in every language", () => {
    expect(demoTemplate("es").name).toBe("Cada visita de trabajo");
    expect(demoTemplate("en").items[0]!.label).toBe("Protect floors and furniture");
    const ids = (l: "ru" | "en" | "es") => demoTemplate(l).items.map((i) => i.id);
    expect(ids("ru")).toEqual(["tpl-job-i0", "tpl-job-i1", "tpl-job-i2", "tpl-job-i3"]);
    expect(ids("es")).toEqual(ids("ru"));
    expect(ids("en")).toEqual(ids("ru"));
  });
});
