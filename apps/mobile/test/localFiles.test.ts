/**
 * unit:localFiles (#1659) — photo and receipt files leave the app's own folders once nothing on the phone names them;
 * never a file outside the app's folders (the person's library, another path), never one a record still names, never a
 * fresh one, never when a record cannot be read or the store could not save.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));

import { asMs, dropPickedCopy, fileName, inAppDir, keptHere, namesIn, setMemoryRecords, SWEEP_MIN_AGE_MS, sweepLocalFiles, sweepSoon, toSweep, type FoundFile, type SweepDeps } from "../src/data/localFiles";

const C = "file:///var/mobile/Containers/Data/Application/AAAA/Library/Caches";
const DIRS = [`${C}/ImagePicker/`, `${C}/ImageManipulator/`];
const now = Date.parse("2026-11-15T12:00:00Z");
const old = now - SWEEP_MIN_AGE_MS - 1;

describe("unit:localFiles — only the app's own folders (#1659)", () => {
  it("a file directly in a photo folder — yes; outside, nested, `..`, the folder itself, the photo library — never", () => {
    expect(inAppDir(`${C}/ImagePicker/1.jpg`, DIRS)).toBe(true);
    expect(inAppDir(`${C}/ImageManipulator/2.jpg`, DIRS)).toBe(true);
    for (const u of [
      `${C}/other/3.jpg`,
      `${C}/ImagePicker/sub/4.jpg`,
      `${C}/ImagePicker/../../Documents/5.jpg`,
      `${C}/ImagePicker/`,
      `${C}/ImagePickerX/6.jpg`,
      "file:///var/mobile/Media/DCIM/100APPLE/IMG_0001.JPG",
      "ph://ABCD-1234/L0/001",
      "content://media/external/images/media/42",
      "blob:https://app/abc",
      "/var/mobile/Containers/Data/Application/AAAA/Library/Caches/ImagePicker/7.jpg",
    ])
      expect(inAppDir(u, DIRS), u).toBe(false);
  });
  it("the picker's copy goes after the shrink only from the picker's folder; the library and a failed shrink — never", () => {
    const remove = vi.fn();
    const d = { dirs: () => DIRS, remove, exists: () => true };
    expect(dropPickedCopy(`${C}/ImagePicker/a.jpg`, `${C}/ImageManipulator/b.jpg`, d)).toBe(true);
    expect(remove).toHaveBeenCalledWith(`${C}/ImagePicker/a.jpg`);
    remove.mockClear();
    expect(dropPickedCopy(`${C}/ImagePicker/a.jpg`, `${C}/ImagePicker/a.jpg`, d)).toBe(false); // the shrink failed: the original is the kept one
    expect(dropPickedCopy("content://media/external/images/media/42", `${C}/ImageManipulator/b.jpg`, d)).toBe(false);
    expect(dropPickedCopy("file:///var/mobile/Media/DCIM/IMG_1.JPG", `${C}/ImageManipulator/b.jpg`, d)).toBe(false);
    expect(dropPickedCopy(`${C}/ImageManipulator/x.jpg`, `${C}/ImageManipulator/b.jpg`, d)).toBe(false); // not the picker's
    expect(dropPickedCopy("blob:https://app/1", "blob:https://app/2", d)).toBe(false); // the web
    expect(remove).not.toHaveBeenCalled();
    expect(dropPickedCopy(`${C}/ImagePicker/a.jpg`, `${C}/ImageManipulator/b.jpg`, { dirs: () => DIRS, remove: () => { throw new Error("busy"); }, exists: () => true })).toBe(false);
  });
});

describe("unit:localFiles — what names a file (#1659)", () => {
  it("names by file name, in any depth; a record that is not JSON — not known", () => {
    const rec = JSON.stringify({ db: { visits: [{ photos: [{ uri: `${C}/ImageManipulator/p%201.jpg` }] }], expenses: [{ receiptUri: "file:///other/prefix/ImageManipulator/r.jpg" }] }, n: 3 });
    expect([...namesIn(rec)!].sort()).toEqual(["p 1.jpg", "r.jpg"]);
    expect(namesIn("not json")).toBeNull();
    expect(fileName("file:///a/b/c.jpg?x=1")).toBe("c.jpg");
  });
  it("named (even under another container path), fresh or without a time — stays; old and named by nothing — goes", () => {
    const f = (n: string, modified: number | null = old): FoundFile => ({ uri: `${C}/ImageManipulator/${n}`, modified });
    const files = [f("named.jpg"), f("fresh.jpg", now - 1000), f("notime.jpg", null), f("orphan.jpg"), { uri: `${C}/other/orphan2.jpg`, modified: old }];
    expect(toSweep(files, new Set(["named.jpg"]), DIRS, now)).toEqual([`${C}/ImageManipulator/orphan.jpg`]);
  });
});

describe("unit:localFiles — the sweep (#1659)", () => {
  const deps = (recs: Record<string, string>, files: string[]) => {
    const left = new Set(files);
    const d: SweepDeps = {
      dirs: () => DIRS,
      list: (dir) => [...left].filter((u) => u.startsWith(dir)).map((uri) => ({ uri, modified: old })),
      remove: (u) => void left.delete(u),
      keys: async () => Object.keys(recs),
      read: async (k) => recs[k] ?? null,
      log: () => {},
    };
    return { d, left };
  };
  const pic = (n: string) => `${C}/ImagePicker/${n}`;
  const man = (n: string) => `${C}/ImageManipulator/${n}`;
  it("what any record names stays — another person's queued photo, a refused one, a draft, a kept copy; the rest goes", async () => {
    const recs = {
      "octo.outbox.v1": JSON.stringify([{ op: { k: "photo.add", uri: man("queued.jpg") }, owner: { userId: "u2" } }]),
      "octo.cloud.v1.c1.u1": JSON.stringify({ db: { visits: [{ photos: [{ uri: man("shown.jpg") }] }] } }),
      "octo.broken.octo.cloud.v1.c1.u1.1": JSON.stringify({ db: { expenses: [{ receiptUri: man("kept.jpg") }] } }),
      "octo.mod.gutters.draft.v1": JSON.stringify({ photos: [{ uri: man("g.jpg") }] }),
      "octo.theme.v1": JSON.stringify("dark"),
    };
    const { d, left } = deps(recs, [man("queued.jpg"), man("shown.jpg"), man("kept.jpg"), man("g.jpg"), man("gone.jpg"), pic("original.jpg")]);
    expect(await sweepLocalFiles(d, now)).toBe(2);
    expect([...left].sort()).toEqual([man("g.jpg"), man("kept.jpg"), man("queued.jpg"), man("shown.jpg")].sort());
  });
  it("a record that cannot be read, or a store that could not save — nothing goes", async () => {
    const a = deps({ "octo.cloud.v1.c1.u1": "{broken" }, [man("x.jpg")]);
    expect(await sweepLocalFiles(a.d, now)).toBe(0);
    expect(a.left.size).toBe(1);
    const off = setMemoryRecords(() => null);
    const b = deps({}, [man("y.jpg")]);
    expect(await sweepLocalFiles(b.d, now)).toBe(0);
    expect(b.left.size).toBe(1);
    off();
  });
  it("what the store holds only in memory names files too", async () => {
    const off = setMemoryRecords(() => [JSON.stringify({ visits: [{ photos: [{ uri: man("unsaved.jpg") }] }] })]);
    const { d, left } = deps({}, [man("unsaved.jpg"), man("orphan.jpg")]);
    expect(await sweepLocalFiles(d, now)).toBe(1);
    expect([...left]).toEqual([man("unsaved.jpg")]);
    off();
  });
  it("the web / no file system, a device that refuses — nothing, never throws", async () => {
    const { d } = deps({}, [man("a.jpg")]);
    expect(await sweepLocalFiles({ ...d, dirs: () => null }, now)).toBe(0);
    expect(await sweepLocalFiles({ ...d, keys: async () => Promise.reject(new Error("busy")) }, now)).toBe(0);
    expect(await sweepLocalFiles({ ...d, list: () => { throw new Error("no dir"); } }, now)).toBe(0);
  });
});

describe("unit:localFiles — review of #1659", () => {
  const man = (n: string) => `${C}/ImageManipulator/${n}`;
  const run = async (recs: Record<string, string>, files: string[]) => {
    const left = new Set(files);
    const d: SweepDeps = {
      dirs: () => DIRS,
      list: (dir) => [...left].filter((u) => u.startsWith(dir)).map((uri) => ({ uri, modified: old })),
      remove: (u) => void left.delete(u),
      keys: async () => Object.keys(recs),
      read: async (k) => recs[k] ?? null,
    };
    return { gone: await sweepLocalFiles(d, now), left };
  };
  it("plain-string records (the last company, a token, a mark) never call the sweep off; a broken photo record does", async () => {
    const plain = { "octo.company.v1.u1": "9f1c-company-uuid", "octo.signoutWipe.v1": "u1", "octo.push.token.v1": "ExponentPushToken[x]" };
    expect((await run(plain, [man("orphan.jpg")])).gone).toBe(1);
    expect((await run({ ...plain, "octo.outbox.v1": "{broken" }, [man("orphan.jpg")])).gone).toBe(0);
    expect((await run({ "octo.mod.gutters.place.v1": "not json" }, [man("o.jpg")])).gone).toBe(0); // a module's record: strict
  });
  it("a file made in this run (an «Отменить» still up, a form not saved) stays until the next start", async () => {
    keptHere(man("this-run.jpg"));
    const { left } = await run({}, [man("this-run.jpg"), man("orphan.jpg")]);
    expect([...left]).toEqual([man("this-run.jpg")]);
  });
  it("a sweep asked while one runs is not lost: it runs right after", async () => {
    let calls = 0;
    let finish!: () => void;
    const first = new Promise<number>((r) => (finish = () => r(0)));
    const sweep = () => (++calls === 1 ? first : Promise.resolve(0));
    sweepSoon(0, sweep);
    await Promise.resolve();
    await Promise.resolve();
    sweepSoon(0, sweep);
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBe(1);
    finish();
    for (let i = 0; i < 6; i++) await Promise.resolve();
    expect(calls).toBe(2);
  });
});

describe("unit:localFiles — the director's review of #1691", () => {
  it("times are ms (expo-file-system 58, iOS and Android); a value in seconds is read as seconds, not 1970", () => {
    expect(asMs(now)).toBe(now);
    expect(asMs(Math.floor(now / 1000))).toBe(Math.floor(now / 1000) * 1000);
    expect(asMs(null)).toBeNull();
    expect(asMs(0)).toBeNull();
    const C2 = `${C}/ImageManipulator/`;
    // a fresh file whose time came in seconds is still fresh (never swept as «old»)
    expect(toSweep([{ uri: `${C2}s.jpg`, modified: Math.floor((now - 1000) / 1000) }], new Set(), DIRS, now)).toEqual([]);
    expect(toSweep([{ uri: `${C2}o.jpg`, modified: Math.floor(old / 1000) }], new Set(), DIRS, now)).toEqual([`${C2}o.jpg`]);
  });
  it("the picker's copy stays when the smaller one is not on the device (or it cannot be told)", () => {
    const remove = vi.fn();
    expect(dropPickedCopy(`${C}/ImagePicker/a.jpg`, `${C}/ImageManipulator/b.jpg`, { dirs: () => DIRS, remove, exists: () => false })).toBe(false);
    expect(dropPickedCopy(`${C}/ImagePicker/a.jpg`, `${C}/ImageManipulator/b.jpg`, { dirs: () => DIRS, remove })).toBe(false);
    expect(dropPickedCopy(`${C}/ImagePicker/a.jpg`, `${C}/ImageManipulator/b.jpg`, { dirs: () => DIRS, remove, exists: () => { throw new Error("busy"); } })).toBe(false);
    expect(remove).not.toHaveBeenCalled();
  });
});
