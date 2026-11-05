import { useState } from "react";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { NoteSubject } from "@/data/types";
import { useI18n } from "@/i18n";
import { Button, IconButton, Segmented, StatusChip, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { Card, RowView, SectionTitle } from "@/ui/surfaces";

/** Notes on a lead / client / property / job: "team" (everyone) or "only me" (author). Pinned first. */
export function NotesBlock({ subjectType, subjectId, extraSubjects = [] }: { subjectType: NoteSubject; subjectId: string; extraSubjects?: { type: NoteSubject; id: string }[] }) {
  const store = useStore();
  const { db } = store;
  const { t, day, time } = useI18n();
  const toast = useToast();
  const [body, setBody] = useState("");
  const [vis, setVis] = useState<"team" | "private">("team");
  const subjects = [{ type: subjectType, id: subjectId }, ...extraSubjects];
  const notes = db.notes
    .filter((n) => subjects.some((s) => s.type === n.subjectType && s.id === n.subjectId))
    .filter((n) => n.visibility === "team" || n.authorId === db.me)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.at.localeCompare(a.at));
  const add = () => {
    const undo = store.addNote({ subjectType, subjectId, body: body.trim(), visibility: vis });
    setBody("");
    toast.show(store.online ? t("notes.added") : t("offline.queued"), undo);
  };
  return (
    <View style={{ gap: space[2] }}>
      <SectionTitle title={t("notes.title")} right={notes.length ? <T v="caption" tone="mut">{notes.length}</T> : undefined} />
      {notes.map((n) => {
        const author = db.members.find((m) => m.id === n.authorId)?.name;
        const mine = n.authorId === db.me;
        return (
          <Card key={n.id} inner>
            <T v="body">{n.body}</T>
            <RowView style={{ justifyContent: "space-between", alignItems: "center" }}>
              <RowView style={{ flex: 1, flexWrap: "wrap" }}>
                <T v="caption" tone="mut">
                  {[author, `${day(n.at)} ${time(n.at)}`].filter(Boolean).join(" · ")}
                </T>
                {n.visibility === "private" ? <StatusChip status="neutral" label={t("notes.private")} /> : null}
                {n.pinned ? <StatusChip status="info" label={t("notes.pinned")} /> : null}
              </RowView>
              <IconButton icon="star" label={n.pinned ? t("notes.unpin") : t("notes.pin")} active={n.pinned} onPress={() => store.updateNote(n.id, { pinned: !n.pinned })} />
              {mine ? (
                <IconButton icon="trash" label={t("notes.delete")} onPress={() => toast.show(t("notes.deleted"), store.updateNote(n.id, { deleted: true }))} />
              ) : null}
            </RowView>
          </Card>
        );
      })}
      <Card>
        {subjectType === "property" || subjectType === "job" ? (
          <T v="caption" tone="mut">{t("notes.accessHint")}</T>
        ) : null}
        <TextField type="note" value={body} onChangeText={setBody} placeholder={t("notes.placeholder")} />
        <Segmented
          full
          value={vis}
          onChange={setVis}
          items={[
            { key: "team", label: t("notes.team") },
            { key: "private", label: t("notes.private") },
          ]}
        />
        <Button label={t("notes.add")} icon="plus" variant="secondary" full disabled={!body.trim()} onPress={add} />
      </Card>
    </View>
  );
}
