import { useRef, useState } from "react";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { NoteSubject } from "@/data/types";
import { useI18n } from "@/i18n";
import { IconButton, StatusChip, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Menu, useToast } from "@/ui/overlays";
import { Card, RowView, SectionTitle } from "@/ui/surfaces";
import { memberName } from "@/features/team";

/** Notes on a lead / client / property / job: "team" (everyone) or "only me" (author). Pinned first. */
export function NotesBlock({ subjectType, subjectId, extraSubjects = [] }: { subjectType: NoteSubject; subjectId: string; extraSubjects?: { type: NoteSubject; id: string }[] }) {
  const store = useStore();
  const { db } = store;
  const { t, day, time } = useI18n();
  const toast = useToast();
  const [body, setBody] = useState("");
  const [vis, setVis] = useState<"team" | "private">("team");
  // «Кто видит» opens its menu at the composer (the icon lives inside the field)
  const composer = useRef<React.ComponentRef<typeof View>>(null);
  const [visAt, setVisAt] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const visName = vis === "team" ? t("notes.team") : t("notes.private");
  const subjects = [{ type: subjectType, id: subjectId }, ...extraSubjects];
  const notes = db.notes
    .filter((n) => subjects.some((s) => s.type === n.subjectType && s.id === n.subjectId))
    .filter((n) => n.visibility === "team" || n.authorId === db.me)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.at.localeCompare(a.at));
  const add = () => {
    if (!body.trim()) return;
    const undo = store.addNote({ subjectType, subjectId, body: body.trim(), visibility: vis });
    setBody("");
    toast.show(store.online ? t("notes.added") : t("offline.queued"), undo);
  };
  return (
    <View style={{ gap: space[2] }}>
      <SectionTitle title={t("notes.title")} right={notes.length ? <T v="caption" tone="mut">{notes.length}</T> : undefined} />
      {notes.map((n) => {
        const author = memberName(db, n.authorId, t);
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
              <IconButton icon="pushpin" label={n.pinned ? t("notes.unpin") : t("notes.pin")} active={!!n.pinned} onPress={() => store.updateNote(n.id, { pinned: !n.pinned })} />
              {mine ? (
                <IconButton icon="trash" label={t("notes.delete")} onPress={() => toast.show(t("notes.deleted"), store.updateNote(n.id, { deleted: true }))} />
              ) : null}
            </RowView>
          </Card>
        );
      })}
      {/* a composer, as a message (founder 21.11, #2350: «две кнопки рядом — не нравится… более компактное»): one field; inside it
          on the right «Кто видит» (eye — the team, lock — only me; a menu) and «Добавить» (send); the default stays «team» */}
      {subjectType === "property" || subjectType === "job" || subjectType === "customer" ? (
        <T v="caption" tone="mut">{t("notes.accessHint")}</T>
      ) : null}
      <View ref={composer} collapsable={false}>
        <TextField
          testID="note-composer"
          type="note"
          rows={1}
          value={body}
          onChangeText={setBody}
          placeholder={t("notes.placeholder")}
          label={t("notes.title")}
          action={[
            {
              icon: vis === "team" ? "eye" : "lock",
              label: `${t("notes.visibleTo")}: ${visName}`,
              menu: true,
              testID: "note-visibility-button",
              onPress: () => composer.current?.measureInWindow((x: number, y: number, w: number, h: number) => setVisAt({ x, y, w, h })),
            },
            { icon: "send", label: t("notes.add"), strong: true, disabled: !body.trim(), testID: "note-add", onPress: add },
          ]}
        />
      </View>
      <Menu<"team" | "private">
        visible={!!visAt}
        anchor={visAt}
        title={t("notes.visibleTo")}
        items={[
          { key: "team", label: t("notes.team"), icon: "eye", selected: vis === "team", testID: "note-visibility-team" },
          { key: "private", label: t("notes.private"), icon: "lock", selected: vis === "private", testID: "note-visibility-private" },
        ]}
        onSelect={setVis}
        onClose={() => setVisAt(null)}
      />
    </View>
  );
}
