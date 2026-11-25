/**
 * #2657 (хвост #2478): по карточке отказа «клиент подписал, пока ждали сети» — окно «Сделать копию / Сбросить»
 * (ConfirmDialog, DS Б3). Чистая модель окна и её поведение (источники: docs/notes/review-v2/founder-answers-1.md:467 (В3),
 * estimate-audit/decisions.md:9 (C11), k1-2381-stage0.md §11). Проверка К2 #2674: Б1–Б5.
 */
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { canChooseSignedMeanwhile, runSignedMeanwhileChoice, signedMeanwhileAsk, SIGNED_MEANWHILE_KEYS } from "../src/features/signedMeanwhileModel";
import { rejectedHint } from "../src/features/attention";
import { localUndo } from "../src/data/undo";
import type { RejectedOp } from "../src/data/outboxRejected";
import { ru } from "../src/i18n/ru";
import { en } from "../src/i18n/en";
import { es } from "../src/i18n/es";

const t = (k: string, p?: Record<string, unknown>) => (p ? `${k}:${JSON.stringify(p)}` : k);
const base = { id: "r1", kind: "estimate.save", what: "estimate", href: "/estimate/e1", at: 0, reason: "estimate_signed_meanwhile" } as unknown as RejectedOp;
const edit = { title: "T", customerId: "c1", propertyId: "p1", doc: {} } as never;
const src = (f: string) => fs.readFileSync(path.join(__dirname, "..", "src", f), "utf8");

describe("окно «Клиент подписал» (#2657)", () => {
  it("предлагается только отказу «подписал, пока ждали сети» с сохранёнными правками", () => {
    expect(canChooseSignedMeanwhile({ ...base, estimateEdit: edit }, true)).toBe(true);
    expect(canChooseSignedMeanwhile(base, true)).toBe(false); // «Не подписывать — изменить»: правок нет
    expect(canChooseSignedMeanwhile({ ...base, reason: "estimate_total_mismatch", estimateEdit: edit }, true)).toBe(false);
  });
  it("Б2: тому, кому новую смету на этом объекте создать нельзя, копию не предлагаем (только «Сбросить» остаётся у карточки)", () => {
    expect(canChooseSignedMeanwhile({ ...base, estimateEdit: edit }, false)).toBe(false);
  });
  it("слова: заголовок с днём подписи или без него, «Сделать копию» (главное), «Сбросить», путь назад", () => {
    const a = signedMeanwhileAsk(t, "Nov 20");
    expect(a.title).toContain("est.rej.choice.title");
    expect(a.title).toContain("Nov 20");
    expect(a.text).toContain("est.rej.choice.text");
    expect(signedMeanwhileAsk(t, "").title).toBe("est.rej.choice.titleNoDate");
    expect(a.actions.map((x) => [x.key, x.tone])).toEqual([[SIGNED_MEANWHILE_KEYS.copy, "primary"], [SIGNED_MEANWHILE_KEYS.reset, undefined], [SIGNED_MEANWHILE_KEYS.later, "cancel"]]);
    expect(a.actions.every((x) => !!x.testID)).toBe(true);
  });
});

describe("Б1: «Вернуть» после «Сделать копию» закрывает редактор копии", () => {
  const deps = () => {
    const calls: string[] = [];
    const undo = localUndo(() => void calls.push("undo"));
    return {
      calls, undo,
      d: {
        copyRejectedEstimate: vi.fn((_id: string) => ({ estimateId: "new1", undo }) as { estimateId: string; undo: typeof undo } | null),
        dismissRejected: vi.fn(() => undo),
        toast: vi.fn((_: string, u?: unknown) => void (u && calls.push("toast+undo"))),
        open: vi.fn((id: string) => void calls.push(`open:${id}`)),
        back: vi.fn(() => void calls.push("back")),
        online: true,
        t,
      },
    };
  };
  it("копия: тост с «Вернуть», редактор копии открыт; «Вернуть» откатывает копию и закрывает редактор", () => {
    const { d, calls } = deps();
    runSignedMeanwhileChoice(SIGNED_MEANWHILE_KEYS.copy, base, d);
    expect(calls).toEqual(["toast+undo", "open:new1"]);
    const wrapped = d.toast.mock.calls[0]![1] as () => unknown;
    wrapped();
    expect(calls).toEqual(["toast+undo", "open:new1", "undo", "back"]);
  });
  it("Б2: стор не сделал копию (null) — ни тоста, ни перехода в пустой редактор", () => {
    const { d, calls } = deps();
    d.copyRejectedEstimate = vi.fn(() => null);
    runSignedMeanwhileChoice(SIGNED_MEANWHILE_KEYS.copy, base, d);
    expect(calls).toEqual([]);
  });
  it("М2: без сети тост «Без сети. Сохранено, отправится позже»", () => {
    const { d } = deps();
    d.online = false;
    runSignedMeanwhileChoice(SIGNED_MEANWHILE_KEYS.copy, base, d);
    expect(d.toast.mock.calls[0]![0]).toBe("offline.queued");
  });
  it("сброс: тост «Правки сброшены» с «Вернуть», редактор не открывается; «Позже» ничего не делает", () => {
    const { d, calls } = deps();
    runSignedMeanwhileChoice(SIGNED_MEANWHILE_KEYS.reset, base, d);
    expect(d.toast.mock.calls[0]![0]).toBe("est.rej.choice.resetDone");
    expect(calls).toEqual(["toast+undo"]);
    const again = deps();
    runSignedMeanwhileChoice(SIGNED_MEANWHILE_KEYS.later, base, again.d);
    runSignedMeanwhileChoice(null, base, again.d);
    expect(again.calls).toEqual([]);
  });
});

describe("Б3: подсказка карточки с правками говорит про копию, а не «откройте смету»", () => {
  it("карточка с правками — своя подсказка; без правок — прежняя; «Понятно» на такой карточке не рисуется", () => {
    expect(rejectedHint({ ...base, estimateEdit: edit } as never, "director")).toBe("est.rej.choice.why");
    expect(rejectedHint(base as never, "director")).toBe("est.rej.signedMeanwhileWhy");
    // «Понятно» on a card that keeps edits says «Сбросить» (and its toast «Правки сброшены») — both places
    for (const f of ["features/StuckOps.tsx", "app/(tabs)/triage.tsx"]) {
      expect(src(f), f).toContain("est.rej.choice.reset");
      expect(src(f), f).toContain("est.rej.choice.resetDone");
    }
    expect(src("app/(tabs)/triage.tsx")).toMatch(/rejChoice\.can\(rej\)/);
  });
});

describe("Б4: текст окна не обещает того, чего копия не делает", () => {
  it("в RU/EN/ES нет слов про замер/measurement — перенос связи решает зона данных (этап 0 §11)", () => {
    for (const d of [ru, en, es] as Record<string, string>[]) {
      expect(d["est.rej.choice.text"]).not.toMatch(/замер|measure|medici/i);
    }
  });
  it("М1: испанский — на «usted»", () => {
    expect((es as Record<string, string>)["est.rej.choice.text"]).toMatch(/^Sus cambios/);
  });
});

describe("Б5: витрина «Окна» показывает ConfirmDialog из трёх кнопок", () => {
  it("в Windows.tsx есть пример с primary, обычной и cancel", () => {
    const w = src("features/showcase/Windows.tsx");
    expect(w).toContain("showcase-confirm3");
    expect(w).toContain('tone: "primary"');
  });
});
