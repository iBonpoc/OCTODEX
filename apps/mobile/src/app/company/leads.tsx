/**
 * «Ещё → Компания → Лиды» (docs/14-leads-spec.md §6.1, §6.4): whom new leads go to (companies.lead_default_assignee_id).
 * Only the director changes it (the office sees it, spec 26 §3; in the database owner / admin, companies_update).
 * The choice is used while the person is at work; otherwise new leads go to the owner (features/leadAssignee.ts).
 * Saved at once from the sheet, like a lead's own «Кто ведёт»: on the phone at once, offline into the queue, «Отменить».
 */
import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useStore } from "@/data/store";
import type { ID, Member } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { companyOwner, leadAssigneeChoices } from "@/features/leadAssignee";
import { INSPECTION_NO_ESTIMATE_RANGE, leadSettingsOf } from "@/features/leadSettings";
import { Avatar, Button, ReadOnly, StatusChip, Stepper } from "@/ui/controls";
import { Icon, T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Card, Divider, Empty, ListRow, Screen } from "@/ui/surfaces";

export default function CompanyLeads() {
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const c = store.db.company;
  const back = () => (router.canGoBack() ? router.back() : router.replace("/company"));
  // spec 26 §3 (07.11): the office sees the company settings, only the director changes them
  const ro = store.role !== "director";
  if (!c) {
    return (
      <Screen title={t("co.leads.title")} back={back}>
        <Empty icon="home2" title={t("co.none")} />
      </Screen>
    );
  }
  const people = leadAssigneeChoices(store.db.members);
  const ownerId = companyOwner(store.db.members, store.db.me);
  const owner = store.db.members.find((m) => m.id === ownerId);
  const chosen = people.find((m) => m.id === c.leadDefaultAssigneeId);
  const roles = (m: Member) => m.roles.map((r) => t(`role.${r}` as DictKey)).join(" · ");
  const pick = (id: ID | null) => {
    setOpen(false);
    if (id === (chosen?.id ?? null)) return;
    const undo = store.saveCompany({ leadDefaultAssigneeId: id });
    toast.show(store.online ? t("co.saved") : t("offline.queued"), undo);
  };
  // «Осмотр прошёл — сметы нет» after N working days (docs/specs/03 §13.5): saved at once, like the choice above
  const noEstDays = leadSettingsOf(c).inspectionNoEstimateDays;
  const setNoEstDays = (v: number) => {
    if (v === noEstDays) return;
    const undo = store.saveCompany({ leadSettings: { ...(c.leadSettings ?? {}), inspectionNoEstimateDays: v } });
    toast.show(store.online ? t("co.saved") : t("offline.queued"), undo);
  };

  return (
    <Screen title={t("co.leads.title")} back={back} subtitle={t("schs.who")}>
      {ro ? <StatusChip status="info" label={t("fix.co.readOnly")} soft /> : null}
      <Card>
        <T v="heading">{t("co.leads.assignee")}</T>
        <T v="caption" tone="mut">{t("co.leads.assigneeHint")}</T>
        <View testID="lead-default-current">
          {chosen ? (
            <ListRow title={chosen.name} subtitle={roles(chosen)} left={<Avatar initials={chosen.initials} />} />
          ) : (
            <ListRow
              title={t("co.leads.owner")}
              subtitle={owner ? t("co.leads.ownerNow", { name: owner.name }) : undefined}
              left={owner ? <Avatar initials={owner.initials} /> : undefined}
            />
          )}
        </View>
        {ro ? null : (
          <View testID="lead-default-change">
            <Button label={t("co.leads.change")} icon="user" variant="secondary" onPress={() => setOpen(true)} />
          </View>
        )}
      </Card>

      <Card>
        <T v="heading">{t("visitP2.set.title")}</T>
        <T v="caption" tone="mut">{t("visitP2.set.hint")}</T>
        <View testID="no-estimate-days">
          <ReadOnly value={ro}>
            <Stepper label={t("visitP2.set.days")} value={noEstDays} min={INSPECTION_NO_ESTIMATE_RANGE.min} max={INSPECTION_NO_ESTIMATE_RANGE.max} onChange={setNoEstDays} />
          </ReadOnly>
        </View>
      </Card>

      <Sheet visible={open} onClose={() => setOpen(false)} title={t("co.leads.assignee")}>
        <View>
          <View testID="lead-default-owner">
            <ListRow
              title={t("co.leads.owner")}
              subtitle={owner ? t("co.leads.ownerNow", { name: owner.name }) : undefined}
              right={!chosen ? <Icon name="check" /> : undefined}
              onPress={() => pick(null)}
            />
          </View>
          {people.map((m) => (
            <View key={m.id} testID={`lead-default-${m.id}`}>
              <Divider />
              <ListRow
                title={m.name}
                subtitle={roles(m)}
                left={<Avatar initials={m.initials} />}
                right={m.id === chosen?.id ? <Icon name="check" /> : undefined}
                onPress={() => pick(m.id)}
              />
            </View>
          ))}
        </View>
      </Sheet>
    </Screen>
  );
}
