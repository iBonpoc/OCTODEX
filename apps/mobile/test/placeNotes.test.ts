import { describe, expect, it } from "vitest";
import type { Note } from "@/data/types";
import { placeNotesOf } from "@/features/client/placeNotes";

const n = (id: string, o: Partial<Note> = {}): Note => ({ id, subjectType: "property", subjectId: "p1", body: id, visibility: "team", pinned: false, authorId: "m-a", at: "2026-11-20T10:00:00Z", ...o });

describe("placeNotesOf — the notes on a place's card (#3068)", () => {
  it("someone else's private note is never shown; mine is", () => {
    const got = placeNotesOf([n("team"), n("theirs", { visibility: "private", authorId: "m-b" }), n("mine", { visibility: "private", authorId: "m-me" })], "p1", "m-me").map((x) => x.id);
    expect(got).toContain("team");
    expect(got).toContain("mine");
    expect(got).not.toContain("theirs");
  });
  it("only this place's notes, not the deleted ones", () => {
    const got = placeNotesOf([n("here"), n("other", { subjectId: "p2" }), n("client", { subjectType: "customer" }), { ...n("gone"), deletedAt: "2026-11-21T00:00:00Z" } as Note], "p1", "m-me").map((x) => x.id);
    expect(got).toEqual(["here"]);
  });
  it("the pinned first, then the newest", () => {
    const got = placeNotesOf([n("old", { at: "2026-11-01T00:00:00Z" }), n("new", { at: "2026-11-25T00:00:00Z" }), n("pin", { pinned: true, at: "2026-10-01T00:00:00Z" })], "p1", "m-me").map((x) => x.id);
    expect(got).toEqual(["pin", "new", "old"]);
  });
});
