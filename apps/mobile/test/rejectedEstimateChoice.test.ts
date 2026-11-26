/**
 * #2657 (хвост #2478): по карточке отказа «клиент подписал, пока ждали сети» — окно «Сделать копию / Сбросить»
 * (ConfirmDialog, DS Б3). Чистая модель окна и её поведение (источники: docs/notes/review-v2/founder-answers-1.md:467 (В3),
 * estimate-audit/decisions.md:9 (C11), k1-2381-stage0.md §11). Проверка К2 #2674: Б1–Б5 (Б1 решён вариантом D руководителя: у копии «Вернуть» убран).
 */
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { canChooseSignedMeanwhile, chooseSignedMeanwhile, runSignedMeanwhileChoice, signedMeanwhileAsk, SIGNED_MEANWHILE_KEYS, type ChoiceDeps } from "../src/features/signedMeanwhileModel";
import { buildAttention, rejectedHint } from "../src/features/attention";
import type { DB, Role } from "../src/data/types";
import { makeSeed } from "../src/data/seed";
import { localUndo } from "../src/data/undo";
import { canCopyRejectedEstimate } from "../src/features/access";
import { REJECTED_KEEP_MS, type RejectedOp } from "../src/data/outboxRejected";
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

describe("Б1 (D): «Сделать копию» ничего не разрушает — тост «Копия готова» БЕЗ «Вернуть», сразу редактор копии", () => {
  const deps = () => {
    const calls: string[] = [];
    const undo = localUndo(() => void calls.push("undo"));
    let cards = 1;
    return {
      calls, undo,
      d: {
        // the store takes the card with the copy: a second press finds none (null) — one copy only
        copyRejectedEstimate: vi.fn((_id: string) => (cards-- > 0 ? ({ estimateId: "new1", undo }) : null) as { estimateId: string; undo: typeof undo } | null),
        dismissRejected: vi.fn(() => undo),
        toast: vi.fn((_: string, u?: unknown) => void calls.push(u ? "toast+undo" : "toast")),
        open: vi.fn((id: string) => void calls.push(`open:${id}`)),
        online: true,
        t,
      },
    };
  };
  it("копия: тост БЕЗ «Вернуть», потом редактор копии (онлайн копия уже на сервере — откатывать нечем)", () => {
    const { d, calls } = deps();
    runSignedMeanwhileChoice(SIGNED_MEANWHILE_KEYS.copy, base, d);
    expect(calls).toEqual(["toast", "open:new1"]);
    expect(d.toast.mock.calls[0]![0]).toBe("est.rej.choice.copied");
    expect(d.toast.mock.calls[0]![1]).toBeUndefined();
  });
  it("двойное «Сделать копию»: одна копия, один редактор", () => {
    const { d, calls } = deps();
    runSignedMeanwhileChoice(SIGNED_MEANWHILE_KEYS.copy, base, d);
    runSignedMeanwhileChoice(SIGNED_MEANWHILE_KEYS.copy, base, d);
    expect(d.copyRejectedEstimate).toHaveBeenCalledTimes(2);
    expect(calls).toEqual(["toast", "open:new1"]);
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
  it("сброс: тост «Правки сброшены» с «Вернуть» (там правки теряются, откат локальный), редактор не открывается; «Позже» ничего не делает", () => {
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

describe("Б2′: право на копию — по назначению, а не по режиму (в облаке canMakeEstimateAt у мастера всегда true)", () => {
  // the clock is fixed (rule 19): «now» goes into the check, the visit is dated by its `start` (the server's app.tech_visit_counts)
  const NOW = Date.UTC(2026, 10, 25, 18, 0, 0);
  const visit = (start: string, over: Record<string, unknown> = {}) => ({ id: "v1", propertyId: "p1", jobId: "j1", assigneeIds: ["me"], status: "scheduled", start, ...over });
  const mk = (v: Record<string, unknown>, job: Record<string, unknown> = {}) => ({ visits: [v], jobs: [{ id: "j1", propertyId: "p1", status: "scheduled", ...job }], leads: [] }) as never;
  const tech = (me: string) => ({ role: "tech" as const, mode: "cloud" as const, me });
  it("мастер в облаке: свой выезд на объекте → можно; чужой выезд, другой объект, выезд старше 14 дней, работа сделана → нельзя; офис — всегда", () => {
    const own = mk(visit("2026-11-25T15:00:00Z"));
    expect(canCopyRejectedEstimate(own, tech("me"), "p1", NOW)).toBe(true);
    expect(canCopyRejectedEstimate(own, tech("someone-else"), "p1", NOW)).toBe(false);
    expect(canCopyRejectedEstimate(own, tech("me"), "p9", NOW)).toBe(false);
    expect(canCopyRejectedEstimate(mk(visit("2026-11-01T15:00:00Z")), tech("me"), "p1", NOW)).toBe(false); // 24 days ago
    expect(canCopyRejectedEstimate(mk(visit("2026-11-25T15:00:00Z"), { status: "done" }), tech("me"), "p1", NOW)).toBe(false);
    expect(canCopyRejectedEstimate(own, { role: "director", mode: "cloud", me: "x" }, "p9", NOW)).toBe(true);
  });
  it("Ж1: «Требует внимания» — мастеру без права подсказка whyOffice, директору why (связка buildAttention → rejectedHint)", () => {
    const seed = makeSeed();
    const own = { ...seed, me: "me", jobs: [{ id: "j1", propertyId: "p1", status: "scheduled" }], visits: [visit("2026-11-25T15:00:00Z", { photos: [] })] } as unknown as DB;
    const other = { ...own, me: "other" } as DB;
    const rej = { ...base, at: "2026-11-24T10:00:00Z", estimateEdit: edit } as RejectedOp;
    const hintOf = (db: DB, role: Role) => buildAttention(db, role, NOW, { rejected: [rej] }).find((i) => i.kind === "rejected");
    expect(hintOf(other, "tech")?.hint).toBe("est.rej.choice.whyOffice"); // not assigned at p1
    expect(hintOf(own, "tech")?.hint).toBe("est.rej.choice.why"); // his own visit at p1
    expect(hintOf(other, "director")?.hint).toBe("est.rej.choice.why");
    // Ж4: the card says until when the phone keeps the edits (30 days after the refusal)
    expect(hintOf(other, "director")?.hintUntil).toBe(Date.parse("2026-11-24T10:00:00Z") + REJECTED_KEEP_MS);
  });
  it("подсказка карточки без права на копию не зовёт к копии, а говорит, что копию сделает офис", () => {
    expect(rejectedHint({ ...base, estimateEdit: edit } as never, "tech", false)).toBe("est.rej.choice.whyOffice");
    expect(rejectedHint({ ...base, estimateEdit: edit } as never, "tech", true)).toBe("est.rej.choice.why");
  });
  it("Б1: подсказка без права не обещает копию от офиса — правки только на этом телефоне, нужно назначение на объект (RU/EN/ES)", () => {
    expect((ru as Record<string, string>)["est.rej.choice.whyOffice"]).toMatch(/только на этом телефоне/);
    expect((ru as Record<string, string>)["est.rej.choice.whyOffice"]).toMatch(/назначить/);
    expect((ru as Record<string, string>)["est.rej.choice.whyOffice"]).not.toMatch(/может сделать/);
    expect((en as Record<string, string>)["est.rej.choice.whyOffice"]).toMatch(/only on this phone/);
    expect((en as Record<string, string>)["est.rej.choice.whyOffice"]).toMatch(/assign/);
    expect((en as Record<string, string>)["est.rej.choice.whyOffice"]).not.toMatch(/can make/);
    expect((es as Record<string, string>)["est.rej.choice.whyOffice"]).toMatch(/solo en este teléfono/);
    expect((es as Record<string, string>)["est.rej.choice.whyOffice"]).toMatch(/asigne/);
    expect((es as Record<string, string>)["est.rej.choice.whyOffice"]).not.toMatch(/puede hacer/);
  });
  it("М4: заголовок без даты — «до ваших правок»", () => {
    expect((ru as Record<string, string>)["est.rej.choice.titleNoDate"]).toBe("Клиент подписал смету до ваших правок");
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

describe("#2715: хвосты проверки #2674", () => {
  const dict = (d: unknown) => d as Record<string, string>;
  it("Ж6: кнопки окна — те же слова, что окно того же случая в редакторе (k1.copy / k1.reset), RU/EN/ES; кнопка карточки — «Сделать копию…» (не «Сохранить»: правки и так на телефоне — проверка дизайна #2715)", () => {
    for (const d of [ru, en, es].map(dict)) {
      expect(d["est.rej.choice.copy"]).toBe(d["k1.copy"]);
      expect(d["est.rej.choice.reset"]).toBe(d["k1.reset"]);
    }
    expect(dict(ru)["est.rej.choice.open"]).toBe("Сделать копию…");
    for (const d of [ru, en, es].map(dict)) expect(d["est.rej.choice.open"]).not.toMatch(/Сохран|Save|Guard/);
    // the title no longer says «не сохранены» beside the hint «сохранены здесь» (review of #2674, Ж4 А)
    expect(dict(ru)["est.rej.signedMeanwhile"]).toMatch(/в смету они не попали/);
  });
  it("Ж7: после копии тост называет смету и следующий шаг — отправить клиенту; номер неизвестен — прежний тост", () => {
    const toast = vi.fn();
    const d = { copyRejectedEstimate: () => ({ estimateId: "n1", undo: localUndo(() => {}) }), dismissRejected: () => localUndo(() => {}), toast, open: () => {}, online: true, t, signedNumber: "EST-0006" } as ChoiceDeps;
    runSignedMeanwhileChoice(SIGNED_MEANWHILE_KEYS.copy, base, d);
    expect(toast.mock.calls[0]![0]).toBe('est.rej.choice.copiedOf:{"n":"EST-0006"}');
    for (const x of [ru, en, es].map(dict)) expect(x["est.rej.choice.copiedOf"]).toContain("{n}");
    expect(dict(ru)["est.rej.choice.copiedOf"]).toMatch(/отправьте/);
  });
  it("М4: что делать, читается ПОСЛЕ ответа в окне — сеть пропала, пока окно было открыто → тост «без сети»", async () => {
    let answer: (k: string | null) => void = () => {};
    const ask = () => new Promise<string | null>((res) => (answer = res));
    const toast = vi.fn();
    let online = true;
    const deps = () => ({ copyRejectedEstimate: () => ({ estimateId: "n1", undo: localUndo(() => {}) }), dismissRejected: () => localUndo(() => {}), toast, open: () => {}, online, t }) as ChoiceDeps;
    const done = chooseSignedMeanwhile(ask, signedMeanwhileAsk(t, ""), base, deps);
    online = false; // the network went while the window was open
    answer(SIGNED_MEANWHILE_KEYS.copy);
    await done;
    expect(toast.mock.calls[0]![0]).toBe("offline.queued");
  });
  it("Ж5 + находка «Разбор дел»: в «Требует внимания» главная (жёлтая) — выбор по правкам, «Открыть» при ней серая; в профиле (список карточек) — первая, но серая: один жёлтый на экран (DS §3.1 п.4); значка копии нет", () => {
    // the tag of a Button up to its `/>` (the guard oneAccent.test.ts counts a Button with no `variant` as the filled one)
    const tag = (f: string, needle: string) => {
      const s = src(f);
      const at = s.lastIndexOf("<Button", s.indexOf(needle));
      return s.slice(at, s.indexOf("/>", s.indexOf(needle)));
    };
    const tri = "app/(tabs)/triage.tsx";
    expect(tag(tri, "rejected-choose-"), "triage: главная").not.toMatch(/\bvariant=/);
    expect(tag(tri, '"sync.rejected.open"')).toMatch(/variant=/);
    expect(src(tri)).toMatch(/rejChoice\.can\(rej\) \? "secondary" : undefined/);
    expect(tag("features/StuckOps.tsx", "rejected-choose-"), "профиль: серая").toMatch(/variant="secondary"/);
    for (const f of [tri, "features/StuckOps.tsx"]) expect(tag(f, "rejected-choose-"), f).not.toMatch(/icon="copy"/);
  });
  it("М3: в профиле одно окно на экран — хук выбора в StuckOps, а не в каждой карточке", () => {
    const s = src("features/StuckOps.tsx");
    expect(s.match(/useRejectedEstimateChoice\(\)/g)?.length).toBe(1);
    expect(s.match(/\{choice\.dialog\}/g)?.length).toBe(1);
    const card = s.slice(s.indexOf("function RejectedCard"), s.indexOf("export function StuckOps"));
    expect(card).not.toMatch(/useRejectedEstimateChoice\(\)|choice\.dialog/);
  });
});
