import { useRef, useState, type ComponentRef } from "react";
import { router, type Href } from "expo-router";
import { Linking } from "react-native";
import { useStore, visitContext } from "@/data/store";
import { useI18n } from "@/i18n";
import { attentionHref, buildAttention, type AttentionItem } from "@/features/attention";
import { canOpen } from "@/nav/roles";
import { AttentionRows } from "@/features/AttentionCards";
import { subjectOf } from "@/features/attentionPeople";
import { telHref } from "@/features/contactLinks";
import { AssignSheet, ReplySheet, useTick } from "@/features/sheets";
import { Button, StatusChip } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Menu, Sheet, useToast } from "@/ui/overlays";
import { DateField } from "@/ui/dateField";
import { Card, CardList, Divider, Empty, ListRow, RowView, Screen, SectionTitle } from "@/ui/surfaces";
import { View } from "react-native";
import { localUndo } from "@/data/undo";
import { SNOOZE_DAYS, canSnoozeTo, pickMin, snoozeDay, snoozeUntil } from "@/features/attentionSnooze";
import type { DayKey } from "@/features/zone";
import { waitParams } from "@/features/shortTime";

/** Dispatcher home: one item at a time, most urgent first; resolve with one tap or snooze. */
export default function Triage() {
  useTick();
  const { t, money, dayOf } = useI18n();
  const { db, role, rejectedOps, dismissRejected, online, reviewVisitMissed, mode, snoozeAttention } = useStore();
  const toast = useToast();
  const [snoozed, setSnoozed] = useState<string[]>([]);
  const [reply, setReply] = useState<string | null>(null);
  const [assign, setAssign] = useState<string | null>(null);
  const all = buildAttention(db, role, undefined, { rejected: rejectedOps, mode }).filter((x) => !snoozed.includes(x.id));
  const cur = all[0];
  // the top card also shows how to reach the client and how many other reasons this client has (spec 06, PR7)
  const curSubject = cur ? subjectOf(db, cur) : {};
  const curC = curSubject.customerId ? db.customers.find((c) => c.id === curSubject.customerId) : undefined;
  const curL = curSubject.leadId ? db.leads.find((l) => l.id === curSubject.leadId) : undefined;
  const curProp = curC ? db.properties.find((x) => x.customerId === curC.id) : undefined;
  const curWho = cur && (curC || curL) ? { phone: curC?.phone ?? curL?.phone, addr: curProp ? `${curProp.address}, ${curProp.city}` : curL?.address } : undefined;
  const curMore = cur ? all.filter((x) => x !== cur && JSON.stringify(subjectOf(db, x)) === JSON.stringify(curSubject) && (curSubject.customerId || curSubject.leadId)).length : 0;

  // #2097: «Позже» — put the reason off until a day, for the whole company (the server keeps it; back by itself that day)
  const laterRef = useRef<ComponentRef<typeof View>>(null);
  const [laterAt, setLaterAt] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  // #2123: «Выбрать дату…» — a day of one's own in a sheet (DateField, DS А7); only a day after the company's today
  const [pickFor, setPickFor] = useState<AttentionItem | null>(null);
  const [pickDay, setPickDay] = useState<DayKey | null>(null);
  const later = (it: AttentionItem, day: DayKey) => {
    if (!canSnoozeTo(day)) return;
    const undo = snoozeAttention(it.id, snoozeUntil(day));
    toast.show(online ? t("triage.laterSaved", { date: dayOf(day) }) : t("offline.queued"), undo);
  };
  const snooze = (it: AttentionItem, msg: string) => {
    setSnoozed((s) => [...s, it.id]);
    toast.show(msg, localUndo(() => setSnoozed((s) => s.filter((x) => x !== it.id))));
  };

  const actions = (it: AttentionItem) => {
    switch (it.kind) {
      case "lead":
        return <Button label={t("inbox.reply")} icon="send" onPress={() => setReply(it.refId)} />;
      case "leadIdle":
        return <Button label={t("lead.open")} icon="chevronRight" onPress={() => router.push(`/lead/${it.refId}`)} />;
      case "leadOrphan":
        return <Button label={t("fr7.handOver")} icon="user" onPress={() => router.push(attentionHref(it))} />;
      case "taskOrphan":
        return <Button label={t("lead.open")} icon="chevronRight" onPress={() => router.push(attentionHref(it))} />;
      // #2048: the job done with money not invoiced — open the job, where its «Выставить остаток» is
      case "jobNotInvoiced":
        return <Button label={t("att.notInvoicedOpen")} icon="invoice" onPress={() => router.push(attentionHref(it))} />;
      case "schedule":
        return <Button label={t("sch.title")} icon="calendar" onPress={() => router.push(`/job/schedule?jobId=${it.refId}`)} />;
      // #2066 «Клиента не было дома»: plan the visit again (a job — its planning; an inspection — its lead)
      case "visitNoShow":
        return <Button label={t("sch.title")} icon="calendar" onPress={() => router.push(attentionHref(it) as Href)} />;
      case "unassigned":
        return <Button label={t("triage.assign")} icon="user" onPress={() => setAssign(it.refId)} />;
      // a money change the server refused (docs/specs/23 §3): open the record it was about
      // and «Понятно» takes it away (docs/specs/23 §3; the toast's «Отменить» puts it back, rule 5)
      case "rejected":
        return (
          <>
            {canOpen(role, attentionHref(it)) ? <Button label={t("sync.rejected.open")} icon="chevronRight" onPress={() => router.push(attentionHref(it) as Href)} /> : null}
            <Button label={t("sync.rejected.ok")} icon="check" variant="secondary" onPress={() => toast.show(t("sync.rejected.dismissed"), dismissRejected(it.refId))} />
          </>
        );
      // «Не сделано» on a finished visit (docs/specs/08 §8): open it, or «Просмотрено» with «Отменить» 5 s
      case "visitMissed":
        return (
          <>
            <Button label={t("lead.open")} icon="chevronRight" onPress={() => router.push(attentionHref(it) as Href)} />
            <Button label={t("chk2b.reviewed")} icon="check" variant="secondary" onPress={() => toast.show(online ? t("chk2b.reviewedToast") : t("offline.queued"), reviewVisitMissed(it.refId))} />
          </>
        );
      case "late": {
        const v = db.visits.find((x) => x.id === it.refId);
        const href = v ? telHref(visitContext(db, v).customer?.phone) : null;
        return href ? <Button label={t("visit.call")} icon="phone" onPress={() => Linking.openURL(href)} /> : null;
      }
      default:
        return <Button label={t("triage.remind")} icon="bell" onPress={() => snooze(it, t("toast.reminded", { name: it.name }))} />;
    }
  };

  return (
    <Screen title={t("triage.title")} help={t("help.triage")} hintKey="triage" fab="home" home>
      {!cur ? (
        <Empty icon="check" title={t("triage.done")} hint={t("triage.doneHint")} />
      ) : (
        <Card status={cur.status}>
          <RowView style={{ justifyContent: "space-between" }}>
            <T v="caption" tone="mut" tabular>
              {t("triage.of", { i: 1, n: all.length })}
            </T>
            <StatusChip status={cur.status} label={t(cur.chip, waitParams(cur.params, t))} />
          </RowView>
          {/* a reason with no client or lead (a refused money change): its own words as the title */}
          <View testID={`triage-top-${cur.id}`}>
            <T v="title">{cur.name || t(cur.label, waitParams(cur.params, t))}</T>
          </View>
          <T v="body" tone="mut">
            {cur.name ? t(cur.label, waitParams(cur.params, t)) : cur.kind === "rejected" ? t(cur.hint ?? "sync.rejected.hint") : ""}
          </T>
          {curWho ? (
            <T v="body" tone="mut">
              {[curWho.phone, curWho.addr, curMore ? t("card.moreReasons", { n: curMore }) : ""].filter(Boolean).join(" · ")}
            </T>
          ) : null}
          {cur.amountCents ? (
            <T v="heading" tabular>
              {money(cur.amountCents)}
            </T>
          ) : null}
          <RowView style={{ flexWrap: "wrap" }}>
            {actions(cur)}
            <View ref={laterRef} collapsable={false} testID="triage-later">
              <Button
                label={t("triage.later")}
                variant="secondary"
                onPress={() => laterRef.current?.measureInWindow((x: number, y: number, w: number, h: number) => setLaterAt({ x, y, w, h }))}
              />
            </View>
          </RowView>
        </Card>
      )}
      {all.length > 1 ? (
        <>
          <SectionTitle title={t("today.attention")} />
          {/* the rest of the queue: one reason per card, each opens its record (spec 06: the triage queue stays «one at a time») */}
          <AttentionRows items={all.slice(1)} />
        </>
      ) : null}
      <Menu
        visible={!!laterAt && !!cur}
        anchor={laterAt}
        title={t("triage.laterTitle")}
        items={[
          ...SNOOZE_DAYS.map((x) => ({ key: x.key as string, label: t(`triage.later.${x.key}`, { date: dayOf(snoozeDay(x.days)) }), testID: `triage-later-${x.key}` })),
          { key: "pick", label: t("triage.later.pick"), testID: "triage-later-pick" },
        ]}
        onSelect={(k) => {
          setLaterAt(null);
          if (!cur) return;
          if (k === "pick") {
            setPickDay(null);
            setPickFor(cur);
            return;
          }
          later(cur, snoozeDay(SNOOZE_DAYS.find((x) => x.key === k)!.days));
        }}
        onClose={() => setLaterAt(null)}
      />
      <Sheet visible={!!pickFor} onClose={() => setPickFor(null)} title={t("triage.pickTitle")}>
        <DateField label={t("triage.pickDate")} value={pickDay} onChange={setPickDay} min={pickMin()} quick={false} testID="triage-pick-date" />
        <Button
          label={t("triage.pickDo")}
          variant="primary"
          full
          disabled={!pickDay || !canSnoozeTo(pickDay)}
          testID="triage-pick-do"
          onPress={() => {
            if (pickFor && pickDay) later(pickFor, pickDay);
            setPickFor(null);
          }}
        />
      </Sheet>
      <ReplySheet leadId={reply} onClose={() => setReply(null)} />
      <AssignSheet visitId={assign} onClose={() => setAssign(null)} />
    </Screen>
  );
}
