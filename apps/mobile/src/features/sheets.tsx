import { useEffect, useState } from "react";
import { Linking, View } from "react-native";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { assigneesOf, canPlan, dayVisits, keepableAssignees } from "@/features/schedule";
import { memberName } from "@/features/team";
import { isoDayKey, todayKey } from "@/features/calendar";
import { sourceName } from "@/features/leads";
import { smsWithBody } from "@/features/sms";
import type { ID } from "@/data/types";
import { useI18n } from "@/i18n";
import { Avatar, Button, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Divider, ListRow } from "@/ui/surfaces";

/** «Назначить»: everyone on a visit (wave П3a). Each person's load on the visit's day, several ticks, «Снять всех». */
export function AssignSheet({ visitId, onClose }: { visitId: ID | null; onClose: () => void }) {
  const { db, assignVisit, online, role } = useStore();
  const { t } = useI18n();
  const toast = useToast();
  // only the office assigns (owner / admin / office ↔ director / dispatcher); sales and techs never see the sheet
  const v = canPlan([role]) ? db.visits.find((x) => x.id === visitId) : undefined;
  const [picked, setPicked] = useState<ID[]>([]);
  // only people at work stay picked: a switched-off or deleted person is not in the list and the server would refuse (S22)
  useEffect(() => setPicked(v ? keepableAssignees(assigneesOf(v), db.members) : []), [visitId]); // eslint-disable-line react-hooks/exhaustive-deps
  const techs = db.members.filter((m) => m.roles.includes("tech") && !m.pending);
  // the day of the visit on the company's calendar (П4b)
  const day = v ? isoDayKey(v.start) : todayKey();
  const toggle = (id: ID) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const save = (ids: ID[]) => {
    if (!visitId) return;
    const undo = assignVisit(visitId, ids);
    onClose();
    const names = ids.map((id) => memberName(db, id, t) ?? "").filter(Boolean).join(", ");
    toast.show(online ? (ids.length ? t("toast.assigned", { name: names }) : t("toast.unassigned")) : t("offline.queued"), undo);
  };
  return (
    <Sheet visible={!!v} onClose={onClose} title={t("plan.assignTo")}>
      <View>
        {techs.map((m, i) => {
          const load = dayVisits(db, m.id, day, visitId ?? undefined).length;
          const on = picked.includes(m.id);
          return (
            <View key={m.id}>
              {i > 0 ? <Divider /> : null}
              <ListRow
                title={`${on ? "✓ " : ""}${m.name}`}
                subtitle={`${m.kind === "sub" ? `${t("plan.sub")} · ` : ""}${load ? t("plan.dayLoad", { n: load }) : t("plan.free")}`}
                left={<Avatar initials={m.initials} sub={m.kind === "sub"} />}
                onPress={() => toggle(m.id)}
              />
            </View>
          );
        })}
      </View>
      <View style={{ gap: space[2] }}>
        <Button label={t("plan.assignSave")} icon="user" variant="primary" full disabled={!v} onPress={() => save(picked)} />
        {v && assigneesOf(v).length ? <Button label={t("plan.unassignAll")} variant="ghost" full onPress={() => save([])} /> : null}
      </View>
    </Sheet>
  );
}

/** Reply to a lead with an editable template (auto-reply text from settings later). */
export function ReplySheet({ leadId, onClose }: { leadId: ID | null; onClose: () => void }) {
  const { db, touchLead, online } = useStore();
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
            {sourceName(db, lead.sourceId)} · {lead.phone}
          </T>
          <T v="body" tone="mut">
            “{lead.message}”
          </T>
          <TextField type="note" value={text} onChangeText={setText} />
          <Button
            label={t("inbox.send")}
            icon="send"
            full
            disabled={!text.trim()}
            onPress={() => {
              // opens Messages with the text; the history gets "SMS" and the reply timer stops
              Linking.openURL(smsWithBody(lead.phone, text)).catch(() => {});
              const undo = touchLead(lead.id, "sms");
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
