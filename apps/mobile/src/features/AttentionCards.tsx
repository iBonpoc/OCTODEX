/**
 * «Требует внимания»: «people» rows 56 for the Overviews (prototype v2, template OverviewScreen) and one-reason cards for
 * the «Triage» queue (docs/specs/06-list-cards.md). Also the shared parts of the two Overviews — the header icons, «＋», the
 * greeting and «В пути» (today.tsx — the office's «Главная», visits.tsx — the tech's «Мой день»). Reasons come from attention.ts (shared, read only); grouping — attentionPeople.
 * Verbs only for reasons that have an existing action (reply, assign, call, schedule); every row opens its own record.
 */
import { useState } from "react";
import { Linking, View } from "react-native"; // ds-allow: layout only
import { router, type Href } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { visitContext } from "@/data/selectors";
import { canRetry } from "@/data/photoUpload";
import { useI18n } from "@/i18n";
import { attentionHref, type AttentionItem } from "./attention";
import { attentionPeople, subjectOf } from "./attentionPeople";
import { AssignSheet, ReplySheet } from "./sheets";
import { cleanPhone } from "./contactLinks";
import { enRouteSms } from "./jobHistory";
import { useConsentQuestion } from "./LocationParts";
import { smsWithBody } from "./sms";
import { formatDayKey, minuteIn } from "./zone";
import { headDay, todayKey } from "./calendar";
import { useFabItems } from "@/nav/Fab";
import { useSearchIcon } from "@/nav/HeaderIcons";
import { unreadCount } from "@/nav/notices";
import type { Visit } from "@/data/types";
import { useDevice } from "@/theme/ThemeProvider";
import { GroupRow } from "@/ui/groupedList";
import { haptics } from "@/ui/haptics";
import { ListCard } from "@/ui/listCard";
import { useToast } from "@/ui/overlays";
import type { IconKey } from "@/ui/primitives";
import type { CreateAction, IconAction } from "@/ui/templates/types";
import { waitParams } from "./shortTime";
import { qv } from "@/features/qdraft/qv";
import { useConfirm } from "@/ui/confirmDialog";

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
        // ЧЕРНОВИК #2093 (`?qv=a`): одно действие словом — «Перенести»; затем «Сообщить клиенту новое время»
        return { label: qv() === "a" ? "Перенести выезд" : t("sch.title"), onPress: () => router.push(attentionHref(it)) };
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

/** the icon of a reason's verb on a 56 row (П6: an icon with its words for VoiceOver, the words also in the row's line) */
const VERB_ICON: Partial<Record<AttentionItem["kind"], IconKey>> = {
  lead: "message",
  unassigned: "user",
  schedule: "calendar",
  visitNoShow: "calendar",
  late: "phone",
  visitMissed: "check",
  photoFailed: "refresh",
};

/** one person of «Требует действия» as it stands on the Overview: who, the worst reason, the debt; the verb */
export interface AttentionLine {
  key: string;
  name: string;
  /** the worst reason in words (icon + word: the row's StatusPill) */
  reason: string;
  status: AttentionItem["status"];
  chip: string;
  debt?: string;
  lead: boolean;
  verb?: { label: string; onPress: () => void };
  open: () => void;
}

/**
 * «Требует действия» of the Overview (template OverviewScreen, BUILD-SPEC §2.1; LAYOUT-RULES §3): one 56 row per person — the
 * initials, the name, the worst reason, on the right the debt or the reason's StatusPill and its verb as an icon. The template
 * shows three; `lines` also gives the NowCard its step when the day has no visits («Ответить Kevin»).
 */
export function useAttentionNow(items: AttentionItem[]) {
  const { db, role } = useStore();
  const { t, money } = useI18n();
  const { verb, sheets } = useAttentionVerbs();
  const office = role !== "tech";
  const lines: AttentionLine[] = attentionPeople(db, items).map((p) => {
    const c = p.customerId ? db.customers.find((x) => x.id === p.customerId) : undefined;
    const l = p.leadId ? db.leads.find((x) => x.id === p.leadId) : undefined;
    const worst = p.items[0]!;
    const name = c?.name ?? l?.name ?? (worst.name || t(worst.label, waitParams(worst.params, t)));
    const more = p.items.length > 1 ? ` · ${t("card.reasons", { n: p.items.length })}` : "";
    return {
      key: p.key,
      name,
      // the chip's short words («Ждёт ответа 22 мин»), not the sentence that names the person again (П7)
      reason: `${t(worst.chip, waitParams(worst.params, t))}${more}`,
      status: worst.status,
      chip: t(worst.chip, waitParams(worst.params, t)),
      debt: office && p.debtCents > 0 ? money(p.debtCents) : undefined,
      lead: !!l,
      verb: verb(worst),
      open: () => router.push(c ? `/client/${c.id}` : l ? `/lead/${l.id}` : attentionHref(worst)),
    };
  });
  const iconOf = (k: string) => VERB_ICON[attentionPeople(db, items).find((p) => p.key === k)?.items[0]?.kind ?? "overdue"];
  const rows = lines.map((x, i) => {
    const icon = iconOf(x.key);
    return (
      <GroupRow
        key={x.key}
        testID={`attention-now-${i}`}
        title={x.name}
        subtitle={x.reason}
        lead={{ initials: initials(x.name) }}
        // the reason is the line under the name (words, rule 2 — no colour alone); a pill beside it would say it twice (П7)
        // and leave the name four letters on 390
        value={x.debt}
        actions={x.verb && icon ? [{ icon, a11y: `${x.verb.label} ${x.name}`, onPress: x.verb.onPress, testID: `attention-now-${i}-verb` }] : []}
        onPress={x.open}
      />
    );
  });
  return { lines, rows, sheets };
}

/** «В пути» from the Overview — the same step as on the visit (BUILD-SPEC §2.6, #2352): the location question first, then
 *  the step (with «Отменить», rule 5) and the SMS to the client with the time; offline — the queue says so */
export function useEnRoute(v: Visit | undefined) {
  const store = useStore();
  const { t, time } = useI18n();
  const toast = useToast();
  const consent = useConsentQuestion(v);
  const go = () => {
    if (!v) return;
    consent.ask(() => {
      haptics.medium();
      toast.show(store.online ? t("proto.visit.enRouteDone") : t("offline.queued"), store.advanceVisit(v.id));
      const tel = cleanPhone(visitContext(store.db, v).customer?.phone);
      if (tel) Linking.openURL(smsWithBody(tel, enRouteSms(store.db, visitContext(store.db, v).customer?.id, time(v.start)))).catch(() => {});
    });
  };
  return { go, sheet: consent.sheet };
}

/** the header of an Overview (BUILD-SPEC §1 HeaderActions, Greeting): sync (only with something unsent or no network; the queue
 *  as its badge) · search · the bell (the office; unread as its badge); the profile is the Greeting's avatar on 390 (→ «Ещё»), on
 *  820/1280 it is at the bottom of the side menu; «＋» — the role's «Главная» set as a Menu at the button */
export function useHomeHeader() {
  const { db, role, queue, online } = useStore();
  const { t, lang } = useI18n();
  const search = useSearchIcon();
  const { wide } = useDevice();
  const n = unreadCount(db, role);
  const icons: IconAction[] = [
    ...(queue.length || !online
      ? [
          {
            icon: (online ? "cloudUp" : "wifiOff") as IconKey,
            a11y: online ? t("proto.home.sync", { n: queue.length }) : t("proto.home.offline", { n: queue.length }),
            onPress: () => router.push("/settings/profile"),
            testID: "home-sync",
            badge: queue.length ? { n: queue.length, tone: "warn" as const } : undefined,
          },
        ]
      : []),
    search,
    ...(role !== "tech" ? [{ icon: "bell" as IconKey, a11y: n ? t("nav.bellNew", { n }) : t("nav.bell"), onPress: () => router.push("/notifications"), testID: "home-bell", badge: n ? { n, dot: true } : undefined }] : []),
  ];
  const me = db.members.find((m) => m.id === db.me);
  const loc = lang === "en" ? "en-US" : lang === "es" ? "es-US" : "ru-RU";
  const greeting = {
    initials: initials(me?.name ?? "") || "·",
    text: useGreeting(),
    date: headDay(todayKey(), lang), // #2363 F27: «Пт, 20 ноября» — one date line with the Plan
    // the folded header's small title (visual-v2 «Корень вкладки — Главная», кадр 3): «Сегодня, 20 нояб.»
    mini: t("hdr.today", { d: formatDayKey(todayKey(), { day: "numeric", month: "short" }, loc) }),
    // 820/1280: the profile is at the bottom of the side menu — the avatar there is not a second door
    onAvatar: wide ? undefined : () => router.push("/more"),
    avatarLabel: t("nav.profile"),
  };
  // the home set AND what the company's usable modules add (a module's quick action, docs/specs/33 П15.2) — as the old «＋» (Fab.tsx)
  const items = useFabItems({ set: "home" }).filter((x) => x.href);
  const create: CreateAction | undefined = items.length
    ? { a11y: t("nav.create"), items: items.map((x) => ({ key: x.id, label: t(x.label), icon: x.icon, testID: `fab-${x.id}` })) }
    : undefined;
  const onCreate = (key: string) => {
    const href = items.find((x) => x.id === key)?.href;
    if (href) router.push(href as Href);
  };
  return { icons, create, onCreate, greeting };
}

/** «через 10 мин» on the NowCard: only while the start is less than two hours away */
export function startsIn(start: string, now: number, t: (k: "proto.home.inMin" | "proto.home.inH", p: { n: number }) => string): string | undefined {
  const m = Math.round((Date.parse(start) - now) / 60_000);
  if (m <= 0 || m >= 120) return undefined;
  return m < 60 ? t("proto.home.inMin", { n: m }) : t("proto.home.inH", { n: Math.round(m / 60) });
}

/** «Доброе утро, Алекс»: the part of the company's day and the first name (Greeting, BUILD-SPEC §1) */
export function useGreeting() {
  const { db } = useStore();
  const { t } = useI18n();
  const me = db.members.find((m) => m.id === db.me);
  const name = (me?.name ?? "").split(/\s+/)[0] ?? "";
  const m = minuteIn(Date.now());
  const key = m < 12 * 60 ? "proto.home.hello.morning" : m < 18 * 60 ? "proto.home.hello.day" : "proto.home.hello.evening";
  return name ? t(key, { name }) : t("nav.home");
}

/** «Triage»: the rest of the queue — one reason per card, every card opens its record (it did not before). */
export function AttentionRows({ items }: { items: AttentionItem[] }) {
  const { db, role } = useStore();
  const { t, money } = useI18n();
  const { verb, sheets } = useAttentionVerbs();
  const office = role !== "tech";
  const toast = useToast();
  const [dialog, ask] = useConfirm();
  // ЧЕРНОВИК #1832 (`?qv=m`): владельцу — просьба о согласии на цену ниже наценки; решает в окне, может открыть смету
  const qEst = qv() === "m" ? db.estimates.find((e) => e.id === "e6") : undefined;
  const qWho = qEst ? db.customers.find((c) => c.id === qEst.customerId)?.name ?? "" : "";
  // the lines under the least markup (draft: 20 % over the cost): what is missing to it, and the markup they have
  const qLines = (qEst?.doc?.options ?? []).flatMap((o) => o.lines).filter((l) => !!l.unitCostCents && (l.unitPriceCents ?? 0) * 100 < l.unitCostCents! * 120);
  const short = Math.round(qLines.reduce((a, l) => a + (l.unitCostCents! * 1.2 - (l.unitPriceCents ?? 0)) * Number(l.quantity || 0), 0));
  const markPct = qLines.length ? Math.round(((qLines[0]!.unitPriceCents ?? 0) / qLines[0]!.unitCostCents! - 1) * 100) : 0;
  const decide = async () => {
    const k = await ask({
      title: "Разрешить цену ниже наценки?",
      text: `${qEst?.number ?? ""} · ${qWho}. Просит Ivan Sokolov.\nНе хватает ${money(short)} · наценка ${markPct} % вместо 20 %. Согласие — только на эту цену.`,
      actions: [
        { key: "yes", label: "Разрешить", tone: "primary", testID: "q-allow" },
        { key: "open", label: "Открыть смету", testID: "q-open" },
        { key: "no", label: "Не разрешать", tone: "cancel", testID: "q-deny" },
      ],
    });
    if (k === "open" && qEst) router.push(`/estimate/new?id=${qEst.id}`);
    if (k === "yes") toast.show("Разрешено: продавец может отправить смету");
  };
  return (
    <View style={{ gap: space[2] }}>
      {qEst ? (
        <View testID="att-q1832">
          <ListCard
            title={`${qEst.number ?? ""} · цена ниже наценки`}
            when={qWho}
            lead={{ kind: "initials", text: initials(qWho) }}
            status={{ tone: "warn", label: "Ждёт согласия" }}
            edge="warn"
            action={{ label: "Разрешить цену", onPress: () => void decide() }}
            density="regular"
            onPress={() => void decide()}
          />
        </View>
      ) : null}
      {dialog}
      {items.map((it) => {
        const s = subjectOf(db, it);
        const who = s.customerId ? db.customers.find((c) => c.id === s.customerId) : undefined;
        const lead = s.leadId ? db.leads.find((x) => x.id === s.leadId) : undefined;
        // a reason with no client or lead (a refused money change): its status word, not empty initials
        const name = who?.name ?? lead?.name ?? (it.name || t(it.chip, waitParams(it.params, t)));
        return (
          <ListCard
            key={it.id}
            title={t(it.label, waitParams(it.params, t))}
            when={name}
            lead={{ kind: "initials", text: initials(name), dashed: !!lead }}
            // a refused change is the person's own money: its amount for every role, as on top of «Разобрать» (review #263 №8)
            value={(office || it.kind === "rejected") && it.amountCents ? money(it.amountCents) : undefined}
            status={{ tone: it.status, label: t(it.chip, waitParams(it.params, t)) }}
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
