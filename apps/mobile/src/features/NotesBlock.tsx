import { useRef, useState } from "react";
import { View } from "react-native";
import { size, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { NoteSubject } from "@/data/types";
import { useI18n } from "@/i18n";
import { IconButton, StatusChip, TextField } from "@/ui/controls";
import { Icon, T } from "@/ui/primitives";
import { useTheme } from "@/theme/ThemeProvider";
import { Menu, useToast } from "@/ui/overlays";
import { Card, RowView, SectionTitle } from "@/ui/surfaces";
import { memberName } from "@/features/team";

/** Notes on a lead / client / property / job: "team" (everyone) or "only me" (author). Pinned first. */
export function NotesBlock({ subjectType, subjectId, extraSubjects = [] }: { subjectType: NoteSubject; subjectId: string; extraSubjects?: { type: NoteSubject; id: string }[] }) {
  const store = useStore();
  const { db } = store;
  const { t, day, time } = useI18n();
  const toast = useToast();
  const { c } = useTheme();
  const [body, setBody] = useState("");
  const [vis, setVis] = useState<"team" | "private">("team");
  // «Кто видит» opens its menu at the composer (the icon lives inside the field)
  const composer = useRef<React.ComponentRef<typeof View>>(null);
  const [visAt, setVisAt] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const visName = vis === "team" ? t("notes.team") : t("notes.private");
  // #3072 (design + crm review): pin and delete — one «⋯» per note (no trash beside the pin to miss); «Удалить» red and last, «Вернуть»
  const moreRefs = useRef<Record<string, React.ComponentRef<typeof View> | null>>({});
  const [moreAt, setMoreAt] = useState<{ id: string; box: { x: number; y: number; w: number; h: number } } | null>(null);
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
      {/* #3072 (crm review): the composer over the notes, as Jobber / HCP «Add note» — not under the whole feed */}
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
      {notes.map((n) => {
        const author = memberName(db, n.authorId, t);
        return (
          <Card key={n.id} inner>
            <T v="body">{n.body}</T>
            <RowView style={{ justifyContent: "space-between", alignItems: "center" }}>
              <RowView style={{ flex: 1, flexWrap: "wrap" }}>
                {/* «закреплена» is not a status (rule 2): a quiet pin and the word in the note's own line, not a blue chip */}
                {n.pinned ? <Icon name="pushpin" s={size.iconSm} color={c.mut} /> : null}
                <T v="caption" tone="mut">
                  {[n.pinned ? t("notes.pinned") : null, author, `${day(n.at)} ${time(n.at)}`].filter(Boolean).join(" · ")}
                </T>
                {n.visibility === "private" ? <StatusChip status="neutral" label={t("notes.private")} /> : null}
              </RowView>
              <View ref={(r) => { moreRefs.current[n.id] = r; }} collapsable={false} testID={`note-more-${n.id}`}>
                <IconButton
                  icon="more"
                  label={`${t("lead.more")}: ${n.body.slice(0, 40)}`}
                  onPress={() => moreRefs.current[n.id]?.measureInWindow((x: number, y: number, w: number, h: number) => setMoreAt({ id: n.id, box: { x, y, w, h } }))}
                />
              </View>
            </RowView>
          </Card>
        );
      })}
      <Menu<"pin" | "delete">
        visible={!!moreAt}
        anchor={moreAt?.box ?? null}
        items={(() => {
          const n = notes.find((x) => x.id === moreAt?.id);
          if (!n) return [];
          return [
            { key: "pin" as const, label: n.pinned ? t("notes.unpin") : t("notes.pin"), icon: "pushpin" as const, testID: "note-menu-pin" },
            ...(n.authorId === db.me ? [{ key: "delete" as const, label: t("notes.delete"), icon: "trash" as const, destructive: true, ownAsk: true, testID: "note-menu-delete" }] : []),
          ];
        })()}
        onSelect={(k) => {
          const n = notes.find((x) => x.id === moreAt?.id);
          setMoreAt(null);
          if (!n) return;
          if (k === "pin") store.updateNote(n.id, { pinned: !n.pinned });
          else toast.show(t("notes.deleted"), store.updateNote(n.id, { deleted: true }));
        }}
        onClose={() => setMoreAt(null)}
      />
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
