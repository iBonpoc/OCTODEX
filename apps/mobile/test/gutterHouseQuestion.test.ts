import { describe, expect, it } from "vitest";
import { houseQuestion, houseSides, type DrawnRun, type Drawing, type P } from "../src/modules/gutters/geometry";
import { addRun, answerHouse, flipFace } from "../src/modules/gutters/canvas/edit";

/** #854 (audit G-01): an open line gets its first corner → the canvas asks «is the house on this side?» once. */

const attrs = { profile: "k" as const, size: "6", material: "alu_032", color: "white", story: 1, hanger: "hidden" as const };
const r = (id: string, a: P, b: P, o: Partial<DrawnRun> = {}): DrawnRun => ({ id, a, b, attrs, ...o });
const ft = (n: number) => n * 12;
const d = (runs: DrawnRun[]): Drawing => ({ runs, downspouts: [] });

const open2 = () => d([r("a", [0, 0], [ft(20), 0]), r("b", [ft(20), 0], [ft(20), ft(15)])]);

describe("houseQuestion: only an open line with a corner nobody answered", () => {
  it("one straight run, or two runs straight on: no corner, no question", () => {
    expect(houseQuestion(d([r("a", [0, 0], [ft(20), 0])]))).toBeNull();
    expect(houseQuestion(d([r("a", [0, 0], [ft(20), 0]), r("b", [ft(20), 0], [ft(40), 0])]))).toBeNull();
  });
  it("an open line with its first corner: asked (about its first run)", () => {
    expect(houseQuestion(open2())).toBe("a");
    expect(houseQuestion(d([r("a", [0, 0], [ft(20), 0]), r("b", [ft(20), 0], [ft(20), ft(15)]), r("c", [ft(20), ft(15)], [ft(40), ft(15)])]))).toBe("a");
  });
  it("a closed outline is never asked (the area says the side exactly)", () => {
    const box = d([r("a", [0, 0], [ft(20), 0]), r("b", [ft(20), 0], [ft(20), ft(15)]), r("c", [ft(20), ft(15)], [0, ft(15)]), r("d", [0, ft(15)], [0, 0])]);
    expect(houseQuestion(box)).toBeNull();
  });
  it("two lines apart: one question while either is open and unanswered; unrelated runs on another storey do not join", () => {
    const x = d([...open2().runs, r("p", [ft(100), 0], [ft(120), 0]), r("q", [ft(120), 0], [ft(120), ft(10)])]);
    expect(houseQuestion(x)).toBe("a");
    const y = answerHouse(x, "a", true);
    expect(houseQuestion(y)).toBe("p");
    expect(houseQuestion(answerHouse(y, "p", false))).toBeNull();
    const st2 = d([r("a", [0, 0], [ft(20), 0]), r("b", [ft(20), 0], [ft(20), ft(15)], { attrs: { ...attrs, story: 2 } })]);
    expect(houseQuestion(st2)).toBeNull(); // they never meet: no corner
  });
  it("a side turned by hand (flipFace) is an answer too — never asked", () => {
    expect(houseQuestion(flipFace(open2(), "a"))).toBeNull();
  });
  it("a gutter drawn on to an answered line takes its side and the question does not come back", () => {
    const answered = answerHouse(open2(), "a", true);
    const longer = addRun(answered, "c", [ft(20), ft(15)], [ft(40), ft(15)], attrs);
    expect(houseQuestion(longer)).toBeNull();
  });
});

describe("answerHouse: yes keeps the side drawn and writes it, no turns the whole line", () => {
  const before = (x: Drawing) => x.runs.map((q) => houseSides(x)(q));
  it("yes: the sides do not change, every run now has its own", () => {
    const x = open2();
    const y = answerHouse(x, "a", true);
    expect(before(y)).toEqual(before(x));
    expect(y.runs.every((q) => q.houseSide)).toBe(true);
    expect(houseQuestion(y)).toBeNull();
  });
  it("no: every run's side is the other one, and the question is gone", () => {
    const x = open2();
    const y = answerHouse(x, "a", false);
    expect(before(y)).toEqual(before(x).map((s) => (s === "L" ? "R" : "L")));
    expect(houseQuestion(y)).toBeNull();
  });
  it("an unknown run changes nothing", () => {
    const x = open2();
    expect(answerHouse(x, "nope", true)).toBe(x);
  });
});
