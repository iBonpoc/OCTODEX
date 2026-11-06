import { useCallback, useMemo, useState } from "react";
import { Platform, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams, type Href } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n, type DictKey } from "@/i18n";
import { SEARCH_GROUPS, hitCount, searchAll, type Hit, type SearchGroup, type Why } from "@/features/search";
import { Button, TextField } from "@/ui/controls";
import { ListCard } from "@/ui/listCard";
import { CardList, Empty, Screen, SectionTitle } from "@/ui/surfaces";
import type { IconKey } from "@/ui/primitives";

/** per group on the first screen; «Показать все» opens the rest (15-flows §3.2) */
const SEARCH_PER_GROUP = 3;

const GROUP: Record<SearchGroup, { label: DictKey; icon: IconKey }> = {
  clients: { label: "nav.search.g.clients", icon: "users" },
  leads: { label: "nav.search.g.leads", icon: "inbox" },
  properties: { label: "nav.search.g.properties", icon: "pin" },
  jobs: { label: "nav.search.g.jobs", icon: "wrench" },
  estimates: { label: "nav.search.g.estimates", icon: "invoice" },
  invoices: { label: "nav.search.g.invoices", icon: "wallet" },
  payments: { label: "nav.search.g.payments", icon: "wallet" },
};

/**
 * «Искать везде» (docs/specs/15-flows.md §1.7, §3.2; 13 v2 §2.2): one field, the hits by group (3 each, «Показать все»),
 * each card says why it was found and opens its object. The local database — works offline. The technician: only his own.
 * On 820/1280 the key «/» opens it from any screen (root _layout).
 */
export default function Search() {
  const { t } = useI18n();
  const { db, role } = useStore();
  const params = useLocalSearchParams<{ q?: string }>();
  const [q, setQ] = useState(params.q ?? "");
  const [open, setOpen] = useState<Partial<Record<SearchGroup, boolean>>>({});
  const res = useMemo(() => searchAll(db, q, role), [db, q, role]);
  const total = hitCount(res);
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
  const card = (h: Hit) => (
    <ListCard
      key={`${h.group}-${h.id}`}
      testID="search-hit"
      title={h.title || h.number || "—"}
      when={[h.subtitle, why(h.why)].filter(Boolean).join(" · ")}
      lead={{ kind: "icon", icon: GROUP[h.group].icon }}
      facts={{ num: h.number }}
      status={h.closed ? { tone: "neutral", label: t("nav.search.closed") } : undefined}
      onPress={() => router.push(h.href as Href)}
    />
  );
  return (
    <Screen title={t("nav.search")} subtitle={t("nav.search.hint")}>
      <View testID="search-field">
        <TextField type="search" value={q} onChangeText={setQ} placeholder={t("nav.search.placeholder")} label={t("nav.search")} icon="search" />
      </View>
      {q.trim() && !total ? <Empty icon="search" title={t("nav.search.empty", { q: q.trim() })} hint={t("nav.search.emptyHint")} /> : null}
      {SEARCH_GROUPS.filter((g) => res[g].length).map((g) => {
        const hits = res[g];
        const shown = open[g] ? hits : hits.slice(0, SEARCH_PER_GROUP);
        return (
          <View key={g} testID={`search-group-${g}`} style={{ gap: space[2] }}>
            <SectionTitle title={`${t(GROUP[g].label)} · ${hits.length}`} />
            <CardList>{shown.map(card)}</CardList>
            {hits.length > shown.length ? (
              <Button label={t("nav.search.showAll", { n: hits.length })} variant="ghost" size="sm" onPress={() => setOpen((o) => ({ ...o, [g]: true }))} />
            ) : null}
          </View>
        );
      })}
    </Screen>
  );
}
