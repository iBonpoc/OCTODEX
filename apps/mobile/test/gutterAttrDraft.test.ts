/**
 * Окно gutter / downspout правит копию (#1858, спека 33-gutters-windows §3.17 е; DS §7.3 исключение Gutters): выбор меняет
 * только копию, «Сохранить» пишет её в рисунок одним шагом «Назад», «Закрыть» / «Не сохранять» не пишут ничего.
 * Старый замер открывается и считается так же: копия без правок — тот же рисунок, та же смета.
 */
import { describe, expect, it } from "vitest";
import { computeGutterParts } from "@octo/estimating-engine";
import { changeRun, hangerKitsFor } from "../src/modules/gutters/canvas/attrs";
import { pushHistory, putRunAttrs, setRunAttrs, undo } from "../src/modules/gutters/canvas/edit";
import { DEFAULT_DS_ATTRS, DEFAULT_RUN_ATTRS } from "../src/modules/gutters/canvas/model";
import { runLengthIn, toMeasurement, type Drawing } from "../src/modules/gutters/geometry";
import { applyDraft, draftChanges, draftLengthIn, draftOf, isDirty, patchDraft, setDraftLen } from "../src/modules/gutters/draw/attrDraft";

const run = { id: "r1", a: [0, 0] as [number, number], b: [260.5, 0] as [number, number], lengthIn: 260.5, attrs: { ...DEFAULT_RUN_ATTRS } };
const ds = { ...DEFAULT_DS_ATTRS, id: "d1", runId: "r1", atIn: 120 };
const D: Drawing = { runs: [run], downspouts: [ds] };
const parts = (d: Drawing) => JSON.stringify(computeGutterParts(toMeasurement(d)).parts.map((p) => [p.key, p.qty.toString()]));

describe("копия окна", () => {
  it("открыли и закрыли: не изменено, «Сохранить» отдаёт тот же рисунок — старый замер считается так же", () => {
    for (const id of ["r1", "d1"]) {
      const dr = draftOf(D, id)!;
      expect(isDirty(D, dr)).toBe(false);
      const out = applyDraft(D, dr);
      expect(out.bad).toBe(false);
      expect(out.drawing).toBe(D);
      expect(parts(out.drawing)).toBe(parts(D));
    }
  });
  it("длина в полях: ft · in · шестнадцатые, как на рисунке", () => {
    const dr = draftOf(D, "r1")!;
    expect(dr.kind === "run" && dr.len).toEqual({ ft: "21", inc: "8", e16: 8 });
    expect(draftLengthIn(dr)).toBe(260.5);
  });
  it("выбор меняет только копию: рисунок не тронут, пока нет «Сохранить»; «Не сохранять» не пишет ничего", () => {
    const before = JSON.stringify(D);
    let dr = draftOf(D, "r1")!;
    dr = patchDraft(dr, { color: "brown" });
    dr = setDraftLen(dr, { ft: "30", inc: "0", e16: 0 });
    expect(isDirty(D, dr)).toBe(true);
    expect(draftChanges(D, dr)).toEqual({ attrs: true, length: true });
    // «Не сохранять» / «Закрыть» — копия просто выброшена: рисунок тот же объект и та же запись
    expect(JSON.stringify(D)).toBe(before);
    expect(D.runs[0]!.attrs.color).toBe(DEFAULT_RUN_ATTRS.color);
  });
  it("«Сохранить»: и цвет, и длина — одним рисунком, один шаг «Назад» возвращает оба", () => {
    let dr = draftOf(D, "r1")!;
    dr = patchDraft(dr, { color: "brown" });
    dr = setDraftLen(dr, { ft: "30", inc: "0", e16: 0 });
    const { drawing, bad } = applyDraft(D, dr);
    expect(bad).toBe(false);
    expect(drawing.runs[0]!.attrs.color).toBe("brown");
    expect(runLengthIn(drawing.runs[0]!)).toBe(360);
    // its downspout «как у желоба» follows the colour, as on a choice before (setRunAttrs)
    expect(drawing.downspouts[0]!.color).toBe("brown");
    const h = pushHistory({ past: [], future: [] }, D);
    expect(undo(h, drawing)?.d).toBe(D);
  });
  it("длина не числом: не сохраняется ничего, окно говорит «bad»", () => {
    let dr = draftOf(D, "r1")!;
    dr = patchDraft(dr, { color: "brown" });
    dr = setDraftLen(dr, { inc: "14" });
    expect(isDirty(D, dr)).toBe(true);
    const out = applyDraft(D, dr);
    expect(out.bad).toBe(true);
    expect(out.drawing).toBe(D);
  });
  it("поля поменяли и вернули как было — не изменено (вопроса «Сохранить изменения?» нет)", () => {
    let dr = draftOf(D, "r1")!;
    dr = setDraftLen(dr, { ft: "2" });
    dr = setDraftLen(dr, { ft: "21" });
    expect(isDirty(D, dr)).toBe(false);
    // the same length written another way (8.5″ in the inches field): no change either
    expect(isDirty(D, setDraftLen(draftOf(D, "r1")!, { inc: "8.5", e16: 0 }))).toBe(false);
  });
  it("правила зависимых полей — на копии: новый профиль берёт свой размер; после «Сохранить» то же, что выбор по одному", () => {
    let dr = draftOf(D, "r1")!;
    dr = patchDraft(dr, { profile: "half_round" });
    const direct = setRunAttrs(D, "r1", { profile: "half_round" });
    expect(applyDraft(D, dr).drawing.runs[0]!.attrs).toEqual(direct.runs[0]!.attrs);
  });
  it("край крыши, потом кронштейны: кронштейны, выбранные вторыми, не сбрасывает «Сохранить»", () => {
    const kits = hangerKitsFor("k");
    let dr = draftOf(D, "r1")!;
    dr = patchDraft(dr, { mount: "rafter" });
    const other = kits.find((k) => dr.kind === "run" && k !== dr.attrs.hanger)!;
    dr = patchDraft(dr, { hanger: other });
    const saved = applyDraft(D, dr).drawing.runs[0]!.attrs;
    expect(saved.mount).toBe("rafter");
    expect(saved.hanger).toBe(other);
    // the old path (setRunAttrs with the whole set) would put the mount's default kit back — why putRunAttrs exists
    expect(changeRun(D.runs[0]!.attrs, saved).hanger).not.toBe(other);
  });
  it("водосток: копия, «Сохранить» — его форма; id, линия и место те же", () => {
    let dr = draftOf(D, "d1")!;
    dr = patchDraft(dr, { shape: "round" });
    expect(D.downspouts[0]!.shape).toBe(DEFAULT_DS_ATTRS.shape);
    const next = applyDraft(D, dr).drawing;
    expect(next.downspouts[0]).toMatchObject({ id: "d1", runId: "r1", atIn: 120, shape: "round", size: "3" });
  });
  it("putRunAttrs: те же атрибуты в другом порядке ключей — тот же рисунок", () => {
    const shuffled = Object.fromEntries(Object.entries(D.runs[0]!.attrs).reverse()) as typeof run.attrs;
    expect(putRunAttrs(D, "r1", shuffled)).toBe(D);
  });
  it("элемента нет на рисунке (удалён «Назад», пока окно открыто): копии нет, «Сохранить» не пишет", () => {
    expect(draftOf(D, "nope")).toBeNull();
    const dr = patchDraft(draftOf(D, "r1")!, { color: "brown" });
    const gone: Drawing = { runs: [], downspouts: [] };
    expect(isDirty(gone, dr)).toBe(false);
    expect(applyDraft(gone, dr).drawing).toBe(gone);
  });
});

describe("чертёж изменился, пока копия открыта (ревью #1858 №1)", () => {
  it("угол выбран сразу, пока в копии цвет: «Сохранить» пишет цвет и не возвращает старый угол", () => {
    let dr = draftOf(D, "r1")!;
    dr = patchDraft(dr, { color: "brown" });
    const now = setRunAttrs(D, "r1", { cornerMethod: { a: "prefab" } });
    const saved = applyDraft(now, dr, D).drawing.runs[0]!.attrs;
    expect(saved.color).toBe("brown");
    expect(saved.cornerMethod).toEqual({ a: "prefab" });
  });
  it("конец линии перетащили, пока в копии цвет: длина остаётся новой, «введённой» не становится", () => {
    let dr = draftOf(D, "r1")!;
    dr = patchDraft(dr, { color: "brown" });
    const dragged: Drawing = { ...D, runs: [{ ...run, b: [300, 0] as [number, number], lengthIn: undefined }] };
    const out = applyDraft(dragged, dr, D).drawing;
    expect(out.runs[0]!.attrs.color).toBe("brown");
    expect(out.runs[0]!.b).toEqual([300, 0]);
    expect(out.runs[0]!.lengthIn).toBeUndefined();
  });
  it("длину ввели в окне, пока чертёж менялся: пишется введённая", () => {
    const dr = setDraftLen(draftOf(D, "r1")!, { ft: "30", inc: "0", e16: 0 });
    const now = setRunAttrs(D, "r1", { cornerMethod: { a: "prefab" } });
    expect(runLengthIn(applyDraft(now, dr, D).drawing.runs[0]!)).toBe(360);
  });
  it("копия убрала поле (без покраски), чертёж его не трогал: поле убрано", () => {
    let dr = draftOf(D, "r1")!;
    dr = patchDraft(dr, { finish: "mill" });
    const saved = applyDraft(D, dr, D).drawing.runs[0]!.attrs;
    expect(saved.finish).toBe("mill");
    expect(saved.color).toBeUndefined();
  });
});
