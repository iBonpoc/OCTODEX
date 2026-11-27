import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// #3058: the list says of an estimate the same word as its header — «Изменена после отправки» comes from estimateView(e), not from
// the bare status (a changed estimate is a draft again, and the status alone would say nothing or «Отправлена»)
const src = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

describe("estimate word in the lists (#3058)", () => {
  it("the estimates list row reads estimateView(e)", () => {
    expect(src("src/features/boards.tsx")).toMatch(/const view = estimateView\(e\)/);
  });
  it("the estimate list card reads estimateView(e), not estimateStatusView(e.status)", () => {
    const s = src("src/features/listCards.tsx");
    expect(s).toMatch(/estimateView\(e\)/);
    expect(s).not.toMatch(/estimateStatusView\(e\.status\)/);
  });
});
