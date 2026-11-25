/** Numbers guard (#2099): a PR never takes a migration version, an e2e number or a T number another one has or was given. */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
type In = {
  added: string[]; baseMigrations: string[]; headMigrations: string[]; headSpecs: string[];
  rlsAddedLines: string[]; baseTests: number[]; reservedMd: string; body: string | undefined;
};
const { decide, reserved, testsOf } = require("../../../scripts/numbersGuard.cjs") as {
  decide: (x: In) => { ok: boolean; problems: string[]; notes: string[] };
  reserved: (md: string) => { kind: string; from: bigint; to: bigint; task?: number }[];
  testsOf: (t: string) => number[];
};

const RES = `| Что | Номер | Задача |
|---|---|---|
| migration | 20261117320000 | #2066 |
| migration | 20261117370000–20261117420000 | #2075 |
| e2e | 488 | #2000 |
| e2e | 482–497 | — |
| T | 363–365 | #2080 |`;
const base: In = {
  added: [],
  baseMigrations: ["20261117260000", "20261117270000"],
  headMigrations: ["20261117260000", "20261117270000"],
  headSpecs: ["apps/mobile/e2e/specs/470-gutters-price-transition.cjs", "apps/mobile/e2e/cloud/specs/102-cloud-sign-in.cjs"],
  rlsAddedLines: [],
  baseTests: [1, 2, 362],
  reservedMd: RES,
  body: "Refs #1777",
};
const mig = (v: string) => `supabase/migrations/${v}_x.sql`;
const withMig = (v: string, o: Partial<In> = {}): In => ({ ...base, added: [mig(v)], headMigrations: [...base.headMigrations, v], ...o });
const withSpec = (p: string, o: Partial<In> = {}): In => ({ ...base, added: [p], headSpecs: [...base.headSpecs, p], ...o });

describe("миграции", () => {
  it("новая версия позже последней в main и свободная — зелёный", () => {
    expect(decide(withMig("20261118010000")).ok).toBe(true);
  });
  it("та же версия у двух миграций — красный", () => {
    const r = decide({ ...withMig("20261118010000"), headMigrations: [...base.headMigrations, "20261118010000", "20261118010000"] });
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toMatch(/уже есть у другой миграции/);
  });
  it("версия раньше или равна последней в main — красный (db push не примет, CHECKS §9 №9)", () => {
    expect(decide(withMig("20261117250000")).problems.join()).toMatch(/не позже последней миграции main/);
    expect(decide(withMig("20261117270000")).ok).toBe(false);
  });
  it("номер, зарезервированный за другой задачей (в том числе внутри диапазона), — красный; за своей (Refs) — зелёный", () => {
    expect(decide(withMig("20261117320000")).problems.join()).toMatch(/зарезервирован за #2066/);
    expect(decide(withMig("20261117380000")).problems.join()).toMatch(/зарезервирован за #2075/);
    expect(decide(withMig("20261117320000", { body: "Closes #2066" })).ok).toBe(true);
    // not a PR (no body): only told
    const local = decide(withMig("20261117320000", { body: undefined }));
    expect(local.ok).toBe(true);
    expect(local.notes.join()).toMatch(/#2066/);
  });
});

describe("e2e-спеки", () => {
  it("номер уже у другой спеки (и в облачных) — красный; свободный — зелёный", () => {
    expect(decide(withSpec("apps/mobile/e2e/specs/470-other.cjs")).problems.join()).toMatch(/номер 470 уже у/);
    expect(decide(withSpec("apps/mobile/e2e/specs/102-other.cjs")).ok).toBe(false);
    expect(decide(withSpec("apps/mobile/e2e/specs/498-free.cjs")).ok).toBe(true);
    // a task's browser + cloud pair added by one PR shares its number (as e2e 472); an older cloud spec's number is taken
    const pair = ["apps/mobile/e2e/specs/498-x.cjs", "apps/mobile/e2e/cloud/specs/498-cloud-x.cjs"];
    expect(decide({ ...base, added: pair, headSpecs: [...base.headSpecs, ...pair] }).ok).toBe(true);
    const two = ["apps/mobile/e2e/specs/498-x.cjs", "apps/mobile/e2e/specs/498-y.cjs"];
    expect(decide({ ...base, added: two, headSpecs: [...base.headSpecs, ...two] }).ok).toBe(false);
  });
  it("зарезервированный за другой задачей — красный; строка без задачи («—») не держит", () => {
    expect(decide(withSpec("apps/mobile/e2e/specs/488-x.cjs")).problems.join()).toMatch(/#2000/);
    expect(decide(withSpec("apps/mobile/e2e/specs/488-x.cjs", { body: "Closes #2000" })).ok).toBe(true);
    expect(decide(withSpec("apps/mobile/e2e/specs/490-x.cjs")).ok).toBe(true);
  });
});

describe("T-номера core_rls.sql", () => {
  it("новый заголовок с номером, который есть в main, — красный; продолжение (cont.) — нет; новый свободный — зелёный", () => {
    expect(decide({ ...base, rlsAddedLines: ["-- T362: another test"] }).problems.join()).toMatch(/T362» уже есть в main/);
    expect(decide({ ...base, rlsAddedLines: ["-- T362 (cont.): more of it", "-- T2 (more)"] }).ok).toBe(true);
    expect(decide({ ...base, rlsAddedLines: ["-- T400: new", "select 1;", "-- T400: same test, second header"] }).ok).toBe(true);
  });
  it("зарезервированный за другой задачей — красный", () => {
    expect(decide({ ...base, rlsAddedLines: ["-- T364: x"] }).problems.join()).toMatch(/#2080/);
  });
  it("номера теста из файла: заголовки и диапазоны", () => {
    expect(testsOf("-- T1. x\n-- T23–T25, y\n--T7\nselect")).toEqual([1, 23, 24, 25, 7]);
  });
});

describe("RESERVED.md в репозитории", () => {
  it("читается: есть строки миграций с задачами, диапазон читается целиком", () => {
    const md = fs.readFileSync(path.join(__dirname, "../../../supabase/migrations/RESERVED.md"), "utf8");
    const rows = reserved(md);
    expect(rows.filter((r) => r.kind === "migration" && r.task).length).toBeGreaterThan(0);
    for (const r of rows) expect(r.from <= r.to).toBe(true);
  });
});
