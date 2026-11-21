import { useCallback, useMemo, useState } from "react";
import { Platform, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams, type Href } from "expo-router";
import { useStore } from "@/data/store";
import { useI18n, type DictKey } from "@/i18n";
import { SEARCH_GROUPS, hitCount, searchAll, type Hit, type SearchGroup, type Why } from "@/features/search";
import { cleanPhone } from "@/features/contactLinks";
import { useDialThenAsk } from "@/features/comms/dial";
import { Button, ChoiceChips, TextField } from "@/ui/controls";
import { GroupedList, GroupRow, ListGroup } from "@/ui/groupedList";
import type { IconKey } from "@/ui/primitives";
import { Empty, Screen } from "@/ui/surfaces";

/** per group on «Всё»; «Все ›» of the group shows the rest (15-flows §3.2) */
const SEARCH_PER_GROUP = 3;

const GROUP: Record<SearchGroup, { label: DictKey; kind: DictKey; icon: IconKey }> = {
  clients: { label: "nav.search.g.clients", kind: "w6.task.kind.customer", icon: "users" },
  leads: { label: "nav.search.g.leads", kind: "w6.task.kind.lead", icon: "inbox" },
  properties: { label: "nav.search.g.properties", kind: "w6.task.kind.property", icon: "pin" },
  jobs: { label: "nav.search.g.jobs", kind: "w6.task.kind.job", icon: "wrench" },
  estimates: { label: "nav.search.g.estimates", kind: "w6.task.kind.estimate", icon: "invoice" },
  invoices: { label: "nav.search.g.invoices", kind: "proto.search.kind.invoice", icon: "wallet" },
  payments: { label: "nav.search.g.payments", kind: "proto.search.kind.payment", icon: "wallet" },
};

type Scope = "all" | SearchGroup;

/**
 * Поиск — шаблон «Список» (prototype v2, wireframes-v2 №20, BUILD-SPEC §2.15): opened by the search icon of a header, the field at
 * once with the cursor (no icon to tap first — the whole screen is the search), the scopes one strip «Всё · Клиенты · Лиды · Работы ·
 * Сметы · Счета…» (only the ones with hits, with their counts), then the hits as grouped rows: the type icon, the name, «Тип · главное ·
 * почему нашлось»; a client has a call icon right in the row. «Всё» shows 3 per group with «Все ›» (the group's scope); nothing found —
 * «Создать клиента». The local database — works offline; the technician sees only his own (searchAll). On 820/1280 «/» opens it.
 * The ListScreen template keeps its field behind the header icon, so this screen lays out the same parts itself (BUILD-PLAN §3 Э7:
 * a request to поток А2 for `ListScreen search.open`).
 */
export default function Search() {
  const { t } = useI18n();
  const { db, role, mode } = useStore();
  const dial = useDialThenAsk();
  const params = useLocalSearchParams<{ q?: string }>();
  const [q, setQ] = useState(params.q ?? "");
  const [scope, setScope] = useState<Scope>("all");
  const res = useMemo(() => searchAll(db, q, role, mode), [db, q, role, mode]);
  const total = hitCount(res);
  const found = SEARCH_GROUPS.filter((g) => res[g].length);
  const current: Scope = scope !== "all" && !res[scope].length ? "all" : scope;
  // the cursor in the field on arrival (web: after the screen put the focus on its title)
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "web" || typeof document === "undefined") return;
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => (document.querySelector('[data-testid="search-field"] input') as HTMLInputElement | null)?.focus());
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }, []),
  );
  const why = (w: Why): string => {
    if (w.kind === "phone" && w.who) return t("nav.search.why.phoneOf", { who: w.who });
    if (w.kind === "email" && w.who) return t("nav.search.why.emailOf", { who: w.who });
    if (w.kind === "person") return t("nav.search.why.person", { who: w.who ?? "" });
    return t(`nav.search.why.${w.kind}` as DictKey);
  };
  const row = (h: Hit) => {
    const phone = h.group === "clients" ? cleanPhone(db.customers.find((c) => c.id === h.id)?.phone) : "";
    return (
      <GroupRow
        key={`${h.group}-${h.id}`}
        testID="search-hit"
        lead={{ icon: GROUP[h.group].icon }}
        title={h.title || h.number || "—"}
        subtitle={[t(GROUP[h.group].kind), h.title ? h.number : undefined, h.subtitle, why(h.why)].filter(Boolean).join(" · ")}
        status={h.closed ? { status: "neutral", label: t("nav.search.closed") } : undefined}
        actions={phone && !h.closed ? [{ icon: "phone", a11y: `${t("client.call")} ${h.title}`, onPress: () => dial(phone, () => router.push(h.href as Href)), testID: `search-call-${h.id}` }] : undefined}
        onPress={() => router.push(h.href as Href)}
      />
    );
  };
  const shown = current === "all" ? found : [current];
  return (
    <Screen testID="search" title={t("nav.searchTab")}>
      <View testID="search-field">
        <TextField type="search" value={q} onChangeText={setQ} placeholder={t("nav.search.placeholder")} label={t("nav.search")} icon="search" autoFocus />
      </View>
      {found.length > 1 ? (
        <ChoiceChips<Scope>
          layout="strip"
          testID="search-scopes"
          value={current}
          onChange={setScope}
          items={[{ key: "all", label: `${t("proto.search.all")} ${total}` }, ...found.map((g) => ({ key: g, label: `${t(GROUP[g].label)} ${res[g].length}` }))]}
        />
      ) : null}
      {!q.trim() ? (
        <Empty icon="search" title={t("proto.search.start")} hint={t("nav.search.hint")} />
      ) : !total ? (
        <Empty
          icon="search"
          title={t("nav.search.empty", { q: q.trim() })}
          hint={t("nav.search.emptyHint")}
          action={role !== "tech" ? <Button testID="search-new-client" label={t("proto.search.newClient", { q: q.trim() })} icon="plus" variant="secondary" onPress={() => router.push("/client/edit")} /> : undefined}
        />
      ) : (
        <GroupedList testID="search-groups">
            {shown.map((g) => {
              const hits = res[g];
              const cut = current === "all" ? hits.slice(0, SEARCH_PER_GROUP) : hits;
              return (
                <ListGroup
                  key={g}
                  testID={`search-group-${g}`}
                  title={`${t(GROUP[g].label)} · ${hits.length}`}
                  all={hits.length > cut.length ? { label: t("proto.client.all"), onPress: () => setScope(g), testID: `search-all-${g}` } : undefined}
                >
                  {cut.map(row)}
                </ListGroup>
              );
            })}
        </GroupedList>
      )}
    </Screen>
  );
}
