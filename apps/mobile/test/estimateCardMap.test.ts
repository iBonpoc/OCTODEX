/**
 * Карточка сметы (estimate-audit/MAP.md п.4, #2640; ряд пересобран по слову основателя #2994 — #2995/#2997): под шапкой ряд как у
 * всех объектов — Позвонить · SMS · Почта · PDF; ничего не уходит клиенту одним нажатием (SMS/Почта открывают приложение телефона).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ru } from "../src/i18n/ru";

const src = fs.readFileSync(path.join(__dirname, "..", "src", "features", "EstimateCard.tsx"), "utf8");
const row = src.slice(src.indexOf("const iconActions: IconRowItem[] = ["), src.indexOf("const moreList: MoreAction"));

describe("карточка сметы: значки под шапкой (#2640)", () => {
  it("значков, что шлют сразу (SMS, почта, ссылка), нет", () => {
    for (const bad of ["est-act-sms", "est-act-email", "quick.go"]) expect(src, bad).not.toContain(bad);
    // the old «Ссылка» icon (it sent at once) — exact: «est-act-copy-link» is the menu item of #2652
    expect(src).not.toMatch(/est-act-copy(?!-link)/);
  });
  it("ряд (#2995/#2997, слово основателя #2994): Позвонить · SMS · Почта · PDF; «Изменить» и «Показать клиенту» — в «⋯»", () => {
    const at = (id: string) => row.indexOf(id);
    expect(at("est-call")).toBeGreaterThan(-1);
    expect(at("est-call")).toBeLessThan(at("est-client-sms"));
    expect(at("est-client-sms")).toBeLessThan(at("est-client-mail"));
    expect(at("est-client-mail")).toBeLessThan(at("est-act-pdf"));
    for (const id of ["est-act-edit", "est-act-client"]) expect(row, id).not.toContain(id);
    // SMS и Почта открывают приложение телефона клиенту — смету они не шлют (MAP §4: ничего не уходит одним нажатием)
    expect(src).toContain("const sms = smsHref(customer?.phone)");
    expect(src).toContain("const mail = mailtoHref(customer?.email)");
    expect(src).toContain('actions.filter((x) => x.key !== "pdf")');
    expect((ru as Record<string, string>)["ue.openClient"]).toBe("Показать клиенту");
  });
  it("«Скопировать ссылку» (#2652): пункт «⋯» только у отправленной и дальше, с токеном, без отзыва; копирует, а не отправляет", () => {
    expect(src).toContain('testID: "est-act-copy-link"');
    expect(src).toMatch(/e\.token && !e\.linkRevokedAt && e\.status !== "draft" && e\.status !== "declined"/);
    expect(src).toContain("est.menu.copyLinkFail");
    expect(src).toContain("copyText(clientLink(e.token))");
    expect((ru as Record<string, string>)["est.menu.copyLink"]).toBe("Скопировать ссылку");
  });
  it("«Позвонить» — значок ряда (звонок — tel:), не вторая кнопка", () => {
    expect(row).toContain('testID: "est-call"');
    expect(row).toContain("open(`tel:${tel}`)");
    expect(src).not.toContain("callSecond");
  });
});
