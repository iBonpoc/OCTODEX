/**
 * #2381 (К1, ревью 2): what the estimate editor does with an edit of a saved estimate — pure, so every rule is a unit test
 * (the screen — e2e 523). Red before the module (no such file), green after; each case names the review point it closes.
 */
import { describe, expect, it } from "vitest";
import { barSteps, doneAction, gateAtOpen, gateBeforeSave, markOf, takeMine } from "../src/features/estimate/editSession";

const est = (status: string, savedAt?: string) => ({ status, doc: savedAt === undefined ? {} : { savedAt } }) as never;

describe("unit:editSession — «Готово»", () => {
  it("Р1: a saved estimate with no edits — «Готово» only closes (nothing written, «sent» untouched)", () => {
    expect(doneAction({ existing: true, dirty: false })).toBe("close");
    expect(doneAction({ existing: true, dirty: true })).toBe("save");
    expect(doneAction({ existing: false, dirty: false })).toBe("save");
  });
  it("Р1 / e2e 72: a DRAFT with no edits but a stale document (the client became tax exempt) — it saves, the tax goes off", () => {
    expect(doneAction({ existing: true, dirty: false, stale: true, status: "draft" })).toBe("save");
  });
  it("№23: a sent or signed estimate only looked at — «Готово» closes though stale: money never changes from a look (sent never → draft)", () => {
    for (const status of ["sent", "viewed", "awaiting_countersign", "approved"]) expect(doneAction({ existing: true, dirty: false, stale: true, status }), status).toBe("close");
  });
  it("Р1: no edits, saved on another phone meanwhile — no conflict asked (it only closes)", () => {
    expect(doneAction({ existing: true, dirty: false })).toBe("close");
  });
});

describe("unit:editSession — what stands before the save", () => {
  it("a new estimate goes", () => expect(gateBeforeSave({ isEdit: false, dirty: true, storeLoaded: true })).toBe("go"));
  it("signed meanwhile → signed; the client signed → await", () => {
    expect(gateBeforeSave({ isEdit: true, live: est("approved", "a"), base: "a", dirty: true, storeLoaded: true })).toBe("signed");
    expect(gateBeforeSave({ isEdit: true, live: est("awaiting_countersign", "a"), base: "a", dirty: true, storeLoaded: true })).toBe("await");
  });
  it("saved on another phone: the mark in the document differs → conflict («≠», never «>»)", () => {
    expect(gateBeforeSave({ isEdit: true, live: est("sent", "b"), base: "a", dirty: true, storeLoaded: true })).toBe("conflict");
    expect(gateBeforeSave({ isEdit: true, live: est("sent", "a"), base: "a", dirty: true, storeLoaded: true })).toBe("go");
  });
  it("Р3/Р5: the estimate not in the store — «missing» only once the store is loaded, else wait (never made again with the same id)", () => {
    expect(gateBeforeSave({ isEdit: true, live: undefined, base: "a", dirty: true, storeLoaded: true })).toBe("missing");
    expect(gateBeforeSave({ isEdit: true, live: undefined, base: "a", dirty: true, storeLoaded: false })).toBe("wait");
  });
  it("Р6: an old estimate without its own mark — the base is \"\" — no false conflict when the server's updated_at moves", () => {
    expect(markOf(est("sent"))).toBe("");
    expect(gateBeforeSave({ isEdit: true, live: est("sent"), base: "", dirty: true, storeLoaded: true })).toBe("go");
  });
  it("an edit's draft without its base (an older build dropped it, rule 16) → conflict, asked", () => {
    expect(gateBeforeSave({ isEdit: true, live: est("sent", "a"), base: undefined, dirty: true, storeLoaded: true })).toBe("conflict");
  });
});

describe("unit:editSession — at the opening", () => {
  it("no edit on the phone — nothing asked", () => expect(gateAtOpen({ hasEditDraft: false, live: est("approved", "a"), base: "a", storeLoaded: true })).toBe("go"));
  it("Р2/Р7: signed or awaiting with edits on the phone — asked; deleted — once loaded", () => {
    expect(gateAtOpen({ hasEditDraft: true, live: est("approved", "a"), base: "a", storeLoaded: true })).toBe("signed");
    expect(gateAtOpen({ hasEditDraft: true, live: est("awaiting_countersign", "a"), base: "a", storeLoaded: true })).toBe("await");
    expect(gateAtOpen({ hasEditDraft: true, live: undefined, base: "a", storeLoaded: true })).toBe("missing");
    expect(gateAtOpen({ hasEditDraft: true, live: undefined, base: "a", storeLoaded: false })).toBe("wait");
  });
});

describe("unit:editSession — the conflict's answer", () => {
  it("Р4: only «Мои правки» is mine; «Назад» / Esc (null) and «Их версию» are not", () => {
    expect(takeMine("mine")).toBe(true);
    expect(takeMine(null)).toBe(false);
    expect(takeMine("back")).toBe(false);
    expect(takeMine("theirs")).toBe(false);
  });
});

describe("unit:editSession — the bar of the editor of a document sent to the client (#2935, «как у Джобер»)", () => {
  const base = { mayShare: true, signed: false, hasLines: true, dirty: false };
  it("sendable: the main one at the bottom is «Отправить», «Готово» the second (red before: «Готово» main, the send a header icon)", () => {
    expect(barSteps(base)).toEqual({ main: "send", second: "done", cancel: null });
  });
  it("sendable with edits: «Отменить» goes into «⋯» (the bar holds «Итого · Готово · Отправить»)", () => {
    expect(barSteps({ ...base, dirty: true })).toEqual({ main: "send", second: "done", cancel: "more" });
  });
  it("the tech (no send, #1113): «Готово» stays the main one, «Отменить» beside it with edits (#2381)", () => {
    expect(barSteps({ ...base, mayShare: false })).toEqual({ main: "done", second: null, cancel: null });
    expect(barSteps({ ...base, mayShare: false, dirty: true })).toEqual({ main: "done", second: null, cancel: "bar" });
  });
  it("signed: no send, no «Отменить» — «Готово» only", () => {
    expect(barSteps({ ...base, signed: true, dirty: true })).toEqual({ main: "done", second: null, cancel: null });
  });
  it("no line yet: the first step adds one (#2387), nothing to send", () => {
    expect(barSteps({ ...base, hasLines: false, dirty: true })).toEqual({ main: "add", second: null, cancel: null });
  });
});
