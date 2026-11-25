/**
 * #2657 (хвост #2478): по карточке отказа «клиент подписал, пока ждали сети» — окно «Сделать копию / Сбросить»
 * (ConfirmDialog, DS Б3). Чистая модель окна и её подключение (карточка в «Профиль и аккаунт» и «Требует внимания»).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { canChooseSignedMeanwhile, signedMeanwhileAsk, SIGNED_MEANWHILE_KEYS } from "../src/features/rejectedEstimateChoice";
import type { RejectedOp } from "../src/data/outboxRejected";

const t = (k: string, p?: Record<string, unknown>) => (p ? `${k}:${JSON.stringify(p)}` : k);
const base = { id: "r1", kind: "estimate.save", what: "estimate", href: "/estimate/e1", at: 0, reason: "estimate_signed_meanwhile" } as unknown as RejectedOp;
const edit = { title: "T", customerId: "c1", propertyId: "p1", doc: {} } as never;

describe("окно «Клиент подписал» (#2657)", () => {
  it("предлагается только отказу «подписал, пока ждали сети» с сохранёнными правками", () => {
    expect(canChooseSignedMeanwhile({ ...base, estimateEdit: edit })).toBe(true);
    expect(canChooseSignedMeanwhile(base)).toBe(false); // «Не подписывать — изменить»: правок нет
    expect(canChooseSignedMeanwhile({ ...base, reason: "estimate_total_mismatch", estimateEdit: edit })).toBe(false);
  });
  it("слова: дата подписи, «Сделать копию» (главное), «Сбросить», путь назад; копия — без связи с замером", () => {
    const a = signedMeanwhileAsk(t, "Nov 20");
    expect(a.title).toContain("est.rej.choice.title");
    expect(a.title).toContain("Nov 20");
    expect(a.text).toContain("est.rej.choice.text");
    expect(a.actions.map((x) => [x.key, x.tone])).toEqual([[SIGNED_MEANWHILE_KEYS.copy, "primary"], [SIGNED_MEANWHILE_KEYS.reset, undefined], [SIGNED_MEANWHILE_KEYS.later, "cancel"]]);
    expect(a.actions.every((x) => !!x.testID)).toBe(true);
  });
  it("подключено в обоих местах и зовёт методы стора (#2659)", () => {
    const src = (f: string) => fs.readFileSync(path.join(__dirname, "..", "src", f), "utf8");
    expect(src("features/StuckOps.tsx")).toContain("useRejectedEstimateChoice");
    expect(src("app/(tabs)/triage.tsx")).toContain("useRejectedEstimateChoice");
    const hook = src("features/RejectedEstimateChoice.tsx");
    expect(hook).toContain("copyRejectedEstimate(");
    expect(hook).toContain("dismissRejected(");
  });
});
