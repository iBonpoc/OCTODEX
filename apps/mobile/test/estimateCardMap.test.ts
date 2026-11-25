/**
 * Карточка сметы по принятой карте (estimate-audit/MAP.md п.4, #2640): под шапкой только безопасные значки
 * «Изменить» · «PDF» · «Показать клиенту» — ничего не уходит клиенту одним нажатием; «Позвонить» — второй кнопкой.
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
  });
  it("ряд: Изменить · PDF · Показать клиенту; «Показать клиенту» одно — в «⋯» его нет", () => {
    expect(row.indexOf("est-act-edit")).toBeLessThan(row.indexOf("est-act-pdf"));
    expect(row.indexOf("est-act-pdf")).toBeLessThan(row.indexOf("est-act-client"));
    expect(src).toContain('x.key !== "client"');
    expect((ru as Record<string, string>)["ue.openClient"]).toBe("Показать клиенту");
  });
  it("«Скопировать ссылку» (#2652): пункт «⋯» только у отправленной и дальше, с токеном, без отзыва; копирует, а не отправляет", () => {
    expect(src).toContain('testID: "est-act-copy-link"');
    expect(src).toMatch(/e\.token && !e\.linkRevokedAt && e\.status !== "draft" && e\.status !== "declined"/);
    expect(src).toContain("est.menu.copyLinkFail");
    expect(src).toContain("copyText(clientLink(e.token))");
    expect((ru as Record<string, string>)["est.menu.copyLink"]).toBe("Скопировать ссылку");
  });
  it("«Позвонить» — второе действие отправленной сметы (по DS объекта — в «⋯»), звонок — tel:", () => {
    expect(src).toContain('testID: "est-call"');
    expect(src).toContain("tel:${phone.replace(");
    expect(src).toContain("const second = callSecond ?? signSecond");
  });
});
