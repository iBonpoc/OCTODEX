/**
 * Карта кнопок редактора сметы (estimate-audit/MAP.md п.5 «⋯ редактора», #2403): каждое действие — в одном месте.
 * «Отправить» — главная кнопка нижней панели (#2935), в шапке и в «⋯» его нет; слова «Показать клиенту», «Позиции подробно», «Разложить по типам».
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ru } from "../src/i18n/ru";

const src = fs.readFileSync(path.join(__dirname, "..", "src", "app", "estimate", "new.tsx"), "utf8");
const more = src.slice(src.indexOf("const moreList = ["), src.indexOf("const onMore = "));
const tr = ru as Record<string, string>;

describe("«⋯» редактора сметы — одно действие в одном месте (#2403)", () => {
  it("«Отправить» нет в «⋯» и в шапке: оно — главная внизу (#2935, «как у Джобер»)", () => {
    expect(more).not.toContain("ue-save-send");
    expect(more).not.toContain("r1.est.sendChanges");
    expect(src).not.toContain('testID="est-send-top"');
    expect(src).not.toContain('icon="send"');
    expect(src).toContain('testID: "est-bar-send"');
  });
  it("слова карты: Показать клиенту · Позиции подробно · Разложить по типам", () => {
    expect(tr["est.client.on"]).toBe("Показать клиенту");
    expect(tr["proto.est.rowsFull"]).toBe("Позиции подробно");
    expect(tr["est.sec.layout"]).toBe("Разложить по типам");
  });
});
