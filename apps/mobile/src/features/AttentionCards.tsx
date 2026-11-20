/**
 * «Требует внимания» on list cards (10а PR7, docs/specs/06-list-cards.md): «people» cards for «Today» and
 * one-reason cards for the «Triage» queue. Reasons come from attention.ts (shared, read only); grouping — attentionPeople.
 * Verbs only for reasons that have an existing action (reply, assign, call, schedule); every row opens its own record.
 */
import { useState } from "react";
import { Linking, View } from "react-native"; // ds-allow: layout only
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { visitContext } from "@/data/selectors";
import { canRetry } from "@/data/photoUpload";
import { useI18n } from "@/i18n";
import { attentionHref, type AttentionItem } from "./attention";
import { attentionPeople, subjectOf } from "./attentionPeople";
import { AssignSheet, ReplySheet } from "./sheets";
import { Button } from "@/ui/controls";
import { ListCard } from "@/ui/listCard";
import { useToast } from "@/ui/overlays";

const initials = (n: string) => n.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

export function useAttentionVerbs() {
  const { db, online, reviewVisitMissed, retryPhoto, undoTogether } = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const [reply, setReply] = useState<string | null>(null);
  const [assign, setAssign] = useState<string | null>(null);
  /** the verb of a reason, only where an action already exists; otherwise the row itself opens the record */
  const verb = (it: AttentionItem): { label: string; onPress: () => void } | undefined => {
    switch (it.kind) {
      case "lead":
        return { label: t("inbox.reply"), onPress: () => setReply(it.refId) };
      case "unassigned":
        return { label: t("triage.assign"), onPress: () => setAssign(it.refId) };
      case "schedule":
        return { label: t("sch.title"), onPress: () => router.push(`/job/schedule?jobId=${it.refId}`) };
      // #2066 «Клиента не было дома»: plan it again (a job — its planning; an inspection — its lead)
      case "visitNoShow":
        return { label: t("sch.title"), onPress: () => router.push(attentionHref(it)) };
      case "late": {
        const v = db.visits.find((x) => x.id === it.refId);
        const phone = v ? visitContext(db, v).customer?.phone?.replace(/[^\d+]/g, "") : undefined;
        return phone ? { label: t("visit.call"), onPress: () => void Linking.openURL(`tel:${phone}`).catch(() => undefined) } : undefined;
      }
      // «Просмотрено» (docs/specs/08 §8): the card goes, the items stay «not done» in the visit's history; «Отменить» 5 s
      case "visitMissed":
        return { label: t("chk2b.reviewed"), onPress: () => toast.show(online ? t("chk2b.reviewedToast") : t("offline.queued"), reviewVisitMissed(it.refId)) };
      // #1431: the photos of the visit whose file is still on this phone are sent again (another phone's — nothing to send)
      case "photoFailed": {
        const ps = db.visits.find((x) => x.id === it.refId)?.photos.filter(canRetry) ?? [];
        return ps.length
          ? { label: t("photoUp.retry"), onPress: () => toast.show(online ? t("photoUp.retried") : t("offline.queued"), undoTogether(ps.map((p) => retryPhoto(it.refId, p.id)))) }
          : undefined;
      }
      default:
        return undefined;
    }
  };
  const sheets = (
    <>
      <ReplySheet leadId={reply} onClose={() => setReply(null)} />
      <AssignSheet visitId={assign} onClose={() => setAssign(null)} />
    </>
  );
  return { verb, sheets };
}

/**
 * «Today», redesign #2344 (К6 п.3): one light card per person — the name, the worst reason with its one verb, the debt.
 * No phone line and no row of contact buttons here (they are on the person's own card); the rest of the queue is «Все» → Triage.
 */
export function AttentionNow({ items, max }: { items: AttentionItem[]; max: number }) {
  const { db, role } = useStore();
  const { t, money } = useI18n();
  const { verb, sheets } = useAttentionVerbs();
  const office = role !== "tech";
  const people = attentionPeople(db, items).slice(0, max);
  return (
    <View style={{ gap: space[2] }}>
      {people.map((p) => {
        const c = p.customerId ? db.customers.find((x) => x.id === p.customerId) : undefined;
        const l = p.leadId ? db.leads.find((x) => x.id === p.leadId) : undefined;
        const worst = p.items[0]!;
        const name = c?.name ?? l?.name ?? (worst.name || t(worst.label, worst.params));
        const debt = office && p.debtCents > 0 ? money(p.debtCents) : undefined;
        return (
          <ListCard
            key={p.key}
            testID="attention-now"
            title={name}
            when={p.items.length > 1 ? t("card.reasons", { n: p.items.length }) : undefined}
            lead={{ kind: "initials", text: initials(name), dashed: !!l }}
            value={debt}
            valueLabel={debt ? t("client.owes") : undefined}
            edge={worst.status === "bad" || worst.status === "warn" ? worst.status : null}
            density="regular"
            // the worst reason only: icon + words + its verb (rule 2); the others are counted in «when»
            reasons={[{ key: worst.id, tone: worst.status, text: t(worst.label, worst.params), onPress: () => router.push(attentionHref(worst)), action: verb(worst) }]}
            onPress={() => router.push(c ? `/client/${c.id}` : l ? `/lead/${l.id}` : attentionHref(worst))}
          />
        );
      })}
      {sheets}
    </View>
  );
}

/** «Triage»: the rest of the queue — one reason per card, every card opens its record (it did not before). */
export function AttentionRows({ items }: { items: AttentionItem[] }) {
  const { db, role } = useStore();
  const { t, money } = useI18n();
  const { verb, sheets } = useAttentionVerbs();
  const office = role !== "tech";
  return (
    <View style={{ gap: space[2] }}>
      {items.map((it) => {
        const s = subjectOf(db, it);
        const who = s.customerId ? db.customers.find((c) => c.id === s.customerId) : undefined;
        const lead = s.leadId ? db.leads.find((x) => x.id === s.leadId) : undefined;
        // a reason with no client or lead (a refused money change): its status word, not empty initials
        const name = who?.name ?? lead?.name ?? (it.name || t(it.chip, it.params));
        return (
          <ListCard
            key={it.id}
            title={t(it.label, it.params)}
            when={name}
            lead={{ kind: "initials", text: initials(name), dashed: !!lead }}
            // a refused change is the person's own money: its amount for every role, as on top of «Разобрать» (review #263 №8)
            value={(office || it.kind === "rejected") && it.amountCents ? money(it.amountCents) : undefined}
            status={{ tone: it.status, label: t(it.chip, it.params) }}
            edge={it.status === "bad" || it.status === "warn" ? it.status : null}
            facts={{ phone: who?.phone ?? lead?.phone }}
            contact={{ phone: who?.phone ?? lead?.phone }}
            action={verb(it)}
            density="regular"
            onPress={() => router.push(attentionHref(it))}
          />
        );
      })}
      {sheets}
    </View>
  );
}
