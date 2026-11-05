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
import { useI18n } from "@/i18n";
import { attentionHref, type AttentionItem } from "./attention";
import { attentionPeople, subjectOf } from "./attentionPeople";
import { AssignSheet, ReplySheet } from "./sheets";
import { Button } from "@/ui/controls";
import { CardGrid, ListCard } from "@/ui/listCard";
import { useDevice } from "@/theme/ThemeProvider";

const initials = (n: string) => n.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

export function useAttentionVerbs() {
  const { db } = useStore();
  const { t } = useI18n();
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
      case "late": {
        const v = db.visits.find((x) => x.id === it.refId);
        const phone = v ? visitContext(db, v).customer?.phone?.replace(/[^\d+]/g, "") : undefined;
        return phone ? { label: t("visit.call"), onPress: () => void Linking.openURL(`tel:${phone}`).catch(() => undefined) } : undefined;
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

/** «Today»: one card per client (a lead without a client — its own card) with all reasons; the first `max` people. */
export function AttentionPeople({ items, max }: { items: AttentionItem[]; max: number }) {
  const { db, role } = useStore();
  const { t, money } = useI18n();
  const { device } = useDevice();
  const { verb, sheets } = useAttentionVerbs();
  const office = role !== "tech";
  const people = attentionPeople(db, items);
  const shown = people.slice(0, max);
  const card = (p: (typeof people)[number]) => {
    const c = p.customerId ? db.customers.find((x) => x.id === p.customerId) : undefined;
    const l = p.leadId ? db.leads.find((x) => x.id === p.leadId) : undefined;
    const props = c ? db.properties.filter((x) => x.customerId === c.id) : [];
    const name = c?.name ?? l?.name ?? p.items[0]!.name;
    const addr = props[0] ? `${props[0].address}, ${props[0].city}` : l?.address ? [l.address, l.city].filter(Boolean).join(", ") : undefined;
    const worst = p.items[0]!;
    // several properties: each reason says which address it is about
    const addrOf = (it: AttentionItem) => {
      if (props.length < 2) return undefined;
      const job = db.jobs.find((j) => j.id === it.refId) ?? db.jobs.find((j) => j.id === db.invoices.find((i) => i.id === it.refId)?.jobId);
      const pid = job?.propertyId ?? db.estimates.find((e) => e.id === it.refId)?.propertyId;
      return props.find((x) => x.id === pid)?.address;
    };
    return (
      <ListCard
        key={p.key}
        title={name}
        when={t("card.reasons", { n: p.items.length })}
        lead={{ kind: "initials", text: initials(name), dashed: !!l }}
        value={office && p.debtCents > 0 ? money(p.debtCents) : undefined}
        valueLabel={office && p.debtCents > 0 ? t("client.owes") : undefined}
        // one chip — the worst reason; the edge only for warn / bad (an «info» reason has none)
        status={{ tone: worst.status, label: t(worst.chip, worst.params) }}
        edge={worst.status === "bad" || worst.status === "warn" ? worst.status : null}
        facts={{ phone: c?.phone ?? l?.phone, addr }}
        reasons={p.items.map((it) => ({
          key: it.id,
          tone: it.status,
          text: t(it.label, it.params),
          detail: [addrOf(it), office && it.kind !== "overdue" && it.amountCents ? money(it.amountCents) : undefined].filter(Boolean).join(" · ") || undefined,
          onPress: () => router.push(attentionHref(it)),
          action: verb(it),
        }))}
        contact={{ phone: c?.phone ?? l?.phone, email: c?.email ?? l?.email, addr }}
        onPress={() => router.push(c ? `/client/${c.id}` : `/lead/${l?.id ?? worst.refId}`)}
      />
    );
  };
  return (
    <View style={{ gap: space[2] }}>
      {device === "phone" ? <View style={{ gap: space[2] }}>{shown.map(card)}</View> : <CardGrid cols={device === "desktop" ? 2 : undefined}>{shown.map(card)}</CardGrid>}
      {people.length > max ? <Button label={t("card.morePeople", { n: people.length - max })} variant="secondary" size="sm" onPress={() => router.push("/triage")} /> : null}
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
        const name = who?.name ?? lead?.name ?? it.name;
        return (
          <ListCard
            key={it.id}
            title={t(it.label, it.params)}
            when={name}
            lead={{ kind: "initials", text: initials(name), dashed: !!lead }}
            value={office && it.amountCents ? money(it.amountCents) : undefined}
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
