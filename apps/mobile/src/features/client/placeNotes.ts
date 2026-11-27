/**
 * #3068: the notes of a place on its card in «Объекты» — the ones the viewer may read (the team's and his own private ones, the rule
 * of NotesBlock), not deleted, the pinned first, then the newest. Pure (no react-native): test/placeNotes.test.ts.
 */
import type { Note } from "@/data/types";

export function placeNotesOf(notes: Note[], propertyId: string, me: string): Note[] {
  return notes
    .filter((x) => x.subjectType === "property" && x.subjectId === propertyId && !(x as { deletedAt?: string }).deletedAt && (x.visibility === "team" || x.authorId === me))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.at.localeCompare(a.at));
}
