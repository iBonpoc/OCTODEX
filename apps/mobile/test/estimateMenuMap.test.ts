/**
 * Карта кнопок редактора сметы (estimate-audit/MAP.md п.5 «⋯ редактора», #2403): каждое действие — в одном месте.
 * «Отправить изменения» — круг ➤ в шапке, в «⋯» его нет; слова «Показать клиенту», «Позиции подробно», «Разложить по типам».
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ru } from "../src/i18n/ru";

const src = fs.readFileSync(path.join(__dirname, "..", "src", "app", "estimate", "new.tsx"), "utf8");
const more = src.slice(src.indexOf("const moreList = ["), src.indexOf("const onMore = "));
const tr = ru as Record<string, string>;

describe("«⋯» редактора сметы — одно действие в одном месте (#2403)", () => {
  it("«Отправить» нет в «⋯»: оно — круг ➤ в шапке", () => {
    expect(more).not.toContain("ue-save-send");
    expect(more).not.toContain("r1.est.sendChanges");
    expect(src).toContain('testID="est-send-top"');
  });
  it("слова карты: Показать клиенту · Позиции подробно · Разложить по типам", () => {
    expect(tr["est.client.on"]).toBe("Показать клиенту");
    expect(tr["proto.est.rowsFull"]).toBe("Позиции подробно");
    expect(tr["est.sec.layout"]).toBe("Разложить по типам");
  });
});
