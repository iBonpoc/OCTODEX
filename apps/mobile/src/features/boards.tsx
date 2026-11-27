/** «Сметы» (a section of its own, spec 31 §7а): estimates as cards with the list filters. Invoices — /invoice. */
import { type StatusName } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { DB, Estimate, EstimateStatus } from "@/data/types";
import { ESTIMATE_GROUPS, estimateGroup, type EstimateFilter } from "@/features/listGroups";
import { useI18n, type DictKey } from "@/i18n";
import { estimateStatusView } from "@/features/estimateStatus";
import { canSeeEstimate } from "@/features/access";
import { estimateSigns } from "@/features/listSigns";
import { estimateListAmount } from "@/features/estimateDoc";
import { initialsOf } from "@/features/invoice/moneySummary";
import { router } from "expo-router";
import { shortAddress } from "@/features/shortAddress";
import { telHref } from "@/features/contactLinks";
import { openContact } from "@/ui/listCard";
import type { GroupRowProps } from "@/ui/groupedList";

/** status chip of an estimate — the one place for it (lists, client and property documents) */
export const estView: Record<EstimateStatus, { s: StatusName; l: DictKey; d?: true }> = {
  draft: estimateStatusView("draft"),
  sent: estimateStatusView("sent"),
  awaiting_countersign: estimateStatusView("awaiting_countersign"),
  approved: estimateStatusView("approved"),
  declined: estimateStatusView("declined"),
};

/** the lane of «Сметы» (spec 31 §7): the open ones first, then the closed, «Все» last */

/** the search of «Сметы»: the client's name, the number, the title of the work, the address of the property */
export function matchEstimate(db: DB, e: Estimate, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const client = db.customers.find((c) => c.id === e.customerId);
  const prop = db.properties.find((p) => p.id === e.propertyId);
  return [client?.name, e.number, e.title, prop?.address, prop?.city].some((x) => (x ?? "").toLowerCase().includes(needle));
}

/** how many closed estimates «Готово» shows before «Все ›» (the list stays short: the open ones are the work) */
export const DONE_SHOWN = 5;

/**
 * «Деньги → Сметы» of prototype v2 (#2350, BUILD-SPEC §2.9, wireframes-v2 №8): the estimates the role may see, as the groups and
 * rows of the List template — «Нужно действие · Черновики · Ждём клиента · Готово» (an empty group is not drawn), each row the
 * client's initials, the name, «работа · что с ней» and the sum once. The search narrows every group; «Готово» shows the last
 * `DONE_SHOWN` until «Все ›». A swipe right opens the estimate (no swipe left: the store has no deleting with «Отменить», rule 5).
 */
export function useEstimateList(q: string, allDone: boolean, onAllDone: () => void) {
  const { db, role, mode } = useStore();
  const { t, money, day, moneyWhole } = useI18n();
  const now = Date.now();
  const list = db.estimates
    .filter((e) => canSeeEstimate(db, { role, mode, me: db.me }, e.id))
    .filter((e) => matchEstimate(db, e, q))
    .map((e) => ({ e, g: estimateGroup(e, now) }))
    .sort((a, b) => (b.e.sentAt ?? b.e.approvedAt ?? "").localeCompare(a.e.sentAt ?? a.e.approvedAt ?? ""));
  const groups = ESTIMATE_GROUPS.map((g) => {
    const rows = list.filter((x) => x.g === g).map((x) => x.e);
    const cut = g === "done" && !allDone && !q.trim() && rows.length > DONE_SHOWN;
    return {
      key: g,
      title: `${t(`card.group.${g}` as DictKey)} · ${rows.length}`,
      rows: cut ? rows.slice(0, DONE_SHOWN) : rows,
      all: cut ? { label: t("proto.money.all"), onPress: onAllDone } : undefined,
    };
  });
  const row = (e: Estimate): GroupRowProps & { key: string } => {
    const c = db.customers.find((x) => x.id === e.customerId);
    const prop = db.properties.find((x) => x.id === e.propertyId);
    const sign = estimateSigns(e, now)[0];
    const amount = estimateListAmount(e);
    // what is with it now, once: the sign («Без ответа 6 дн»), else the last event, else its status word
    // an estimate waiting for OUR signature says so first: it is in «Нужно действие» for that, not for how long it was silent
    const what = e.status === "awaiting_countersign"
      ? t(estView[e.status].l)
      : sign
      ? t(sign.key, sign.params)
      : e.approval
        ? `${t(estView[e.status].l)} ${day(e.approval.at)}`
        : e.viewedAt
          ? t("ue.viewed", { date: day(e.viewedAt) })
          : e.sentAt
            ? `${t("st.sent")} ${day(e.sentAt)}`
            : e.status === "draft"
              ? undefined // the group «Черновики» says it (review #3038)
              : t(estView[e.status].l);
    return {
      key: e.id,
      testID: `est-row-${e.id}`,
      title: c?.name ?? "—",
      // #3018 (founder #3017: «знаю его по адресу»): 1 — the client · the number; 2 — the address of the work; 3 — what is with it · the
      // work; the sum on the right, big (a money list, design/crm review)
      // the number is the server's (tg_assign_number on insert): a draft not yet synced (and the demo's seed) has none yet — say so,
      // never a blank (founder #3018: «номер должен быть»; the numbering itself — #3019)
      refNo: e.number || undefined, // under the lead (#3046): no number yet — nothing there (the numbering — #3019)
      subtitle: prop ? shortAddress(prop.address, prop.city) : undefined,
      addressLine: true,
      extra: [what, e.title].filter(Boolean).join(" · ") || undefined,
      // #3038 «одно правило с клиентом»: the sum in the name's line (valueTop), the number under it on line 2
      valueTop: true,
      // #3038 (review: «смете без ответа и просроченному счёту звонок нужнее всего»): the call on the right, as the client's
      actions: telHref(c?.phone) ? [{ icon: "phone" as const, a11y: `${t("client.call")} ${c?.name ?? ""}`, onPress: () => openContact({ kind: "call", icon: "phone", url: telHref(c?.phone)!, value: c?.phone ?? "" }), testID: `est-call-${e.id}` }] : undefined,
      lead: { initials: initialsOf(c?.name) },
      value: amount.from ? t("card.fromAmount", { amount: moneyWhole(amount.cents) }) : moneyWhole(amount.cents),
      onPress: () => router.push(`/estimate/${e.id}`),
      swipe: { left: [{ key: "open", label: t("swipe.open"), icon: "eye", full: true, onPress: () => router.push(`/estimate/${e.id}`), testID: `est-swipe-${e.id}` }] },
    };
  };
  return { groups, row, count: list.length };
}
