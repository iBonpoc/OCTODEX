/** DS Б3 (#2381): the confirmation dialog's buttons — two short ones in a row (the way back on the left), else a column (the steps first) */
import { describe, expect, it } from "vitest";
import { confirmLayout } from "../src/ui/confirmLayout";
import { confirmQueue } from "../src/ui/confirmQueue";

describe("ConfirmDialog layout (DS Б3)", () => {
  it("two short: a row, the way back on the left", () => {
    const r = confirmLayout([{ key: "yes", label: "Удалить", tone: "danger" }, { key: "no", label: "Назад", tone: "cancel" }]);
    expect(r.how).toBe("row");
    expect(r.order.map((a) => a.key)).toEqual(["no", "yes"]);
  });
  it("three: a column, the steps first, the way back last", () => {
    const r = confirmLayout([{ key: "back", label: "Отмена", tone: "cancel" }, { key: "mine", label: "Сохранить мои правки", tone: "primary" }, { key: "theirs", label: "Взять их версию" }]);
    expect(r.how).toBe("column");
    expect(r.order.map((a) => a.key)).toEqual(["mine", "theirs", "back"]);
  });
  it("a long label: a column even for two", () => {
    const r = confirmLayout([{ key: "no", label: "Продолжить правку", tone: "cancel" }, { key: "yes", label: "Отменить изменения", tone: "danger" }]);
    expect(r.how).toBe("column");
    expect(r.order[0]!.key).toBe("yes");
  });
});

describe("useConfirm queue (DS Б3, review 1 Ж3)", () => {
  it("the answer comes back; «Назад»/Esc is null", async () => {
    const shown: (string | null)[] = [];
    const q = confirmQueue<string>((x) => shown.push(x));
    const a = q.ask("Q1");
    q.answer("yes");
    expect(await a).toBe("yes");
    const b = q.ask("Q2");
    q.answer(null);
    expect(await b).toBeNull();
    expect(shown).toEqual(["Q1", null, "Q2", null]);
  });
  it("a question over another answers the first null", async () => {
    const q = confirmQueue<string>(() => {});
    const a = q.ask("Q1");
    const b = q.ask("Q2");
    expect(await a).toBeNull();
    q.answer("ok");
    expect(await b).toBe("ok");
  });
  it("the screen gone with a question open: answered null, nothing hangs", async () => {
    const q = confirmQueue<string>(() => {});
    const a = q.ask("Q1");
    q.dispose();
    expect(await a).toBeNull();
  });
});
