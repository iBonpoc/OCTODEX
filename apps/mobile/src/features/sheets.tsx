import { useEffect, useState } from "react";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { isToday, useStore } from "@/data/store";
import type { ID } from "@/data/types";
import { useI18n } from "@/i18n";
import { Avatar, Button, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Divider, ListRow } from "@/ui/surfaces";

/** Assign a visit to an employee or a subcontractor. Shows each person's load today. */
export function AssignSheet({ visitId, onClose }: { visitId: ID | null; onClose: () => void }) {
  const { db, assignVisit, online } = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const techs = db.members.filter((m) => m.roles.includes("tech"));
  return (
    <Sheet visible={!!visitId} onClose={onClose} title={t("plan.assignTo")}>
      <View>
        {techs.map((m, i) => {
          const load = db.visits.filter((v) => v.techId === m.id && isToday(v.start)).length;
          return (
            <View key={m.id}>
              {i > 0 ? <Divider /> : null}
              <ListRow
                title={m.name}
                subtitle={`${m.kind === "sub" ? `${t("plan.sub")} · ` : ""}${load ? t("visits.count", { n: load }) : t("plan.free")}`}
                left={<Avatar initials={m.initials} sub={m.kind === "sub"} />}
                onPress={() => {
                  if (!visitId) return;
                  const undo = assignVisit(visitId, m.id);
                  onClose();
                  toast.show(online ? t("toast.assigned", { name: m.name }) : t("offline.queued"), undo);
                }}
              />
            </View>
          );
        })}
      </View>
    </Sheet>
  );
}

/** Reply to a lead with an editable template (auto-reply text from settings later). */
export function ReplySheet({ leadId, onClose }: { leadId: ID | null; onClose: () => void }) {
  const { db, replyLead, online } = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const lead = db.leads.find((l) => l.id === leadId);
  const [text, setText] = useState(t("inbox.autoReply"));
  useEffect(() => setText(t("inbox.autoReply")), [leadId, t]);
  return (
    <Sheet visible={!!lead} onClose={onClose} title={lead ? `${t("inbox.reply")}: ${lead.name}` : ""}>
      {lead ? (
        <View style={{ gap: space[3] }}>
          <T v="caption" tone="mut">
            {lead.source} · {lead.phone}
          </T>
          <T v="body" tone="mut">
            “{lead.message}”
          </T>
          <TextField value={text} onChangeText={setText} multiline />
          <Button
            label={t("inbox.send")}
            icon="send"
            full
            disabled={!text.trim()}
            onPress={() => {
              const undo = replyLead(lead.id);
              onClose();
              toast.show(online ? t("toast.replied", { name: lead.name }) : t("offline.queued"), undo);
            }}
          />
        </View>
      ) : null}
    </Sheet>
  );
}

/** Re-render every 30 s so "waiting N min" timers stay live. */
export function useTick(ms = 30_000) {
  const [, set] = useState(0);
  useEffect(() => {
    const h = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(h);
  }, [ms]);
}
