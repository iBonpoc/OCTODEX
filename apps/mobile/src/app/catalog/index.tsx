import { useMemo, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useStore } from "@/data/store";
import type { CatalogItem, CatalogKind } from "@/data/types";
import { useI18n } from "@/i18n";
import { kindLabel } from "@/features/estimatePickers";
import { Button, ChoiceChips, TextField } from "@/ui/controls";
import { CardList, Empty, Screen } from "@/ui/surfaces";
import { CardGrid, ListCard } from "@/ui/listCard";
import type { IconKey } from "@/ui/primitives";
import { T } from "@/ui/primitives";
import { useDevice } from "@/theme/ThemeProvider";
import { space } from "@octo/design-tokens";
import { catalogItemEconomics } from "@/features/estimateDoc";

const KINDS: (CatalogKind | "all")[] = ["all", "service", "labor", "material", "kit"];
const KIND_ICON: Record<CatalogKind, IconKey> = { service: "route", labor: "clock", material: "box", kit: "checklist" };

/** Company catalog: services, labor, materials and kits used in estimates. */
export default function Catalog() {
  const { db, role } = useStore();
  const { t, money } = useI18n();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<CatalogKind | "all">("all");
  const back = () => (router.canGoBack() ? router.back() : router.replace("/more"));
  const items = useMemo(
    () =>
      db.catalog
        .filter((x) => kind === "all" || x.kind === kind)
        .filter((x) => !q.trim() || x.name.toLowerCase().includes(q.trim().toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [db.catalog, q, kind],
  );
  const canEdit = role !== "tech";
  const { device } = useDevice();
  // groups by kind only when «All» is chosen (otherwise the chip already says the kind)
  const groups = KINDS.filter((k): k is CatalogKind => k !== "all").map((k) => [k, items.filter((x) => x.kind === k)] as const).filter(([, xs]) => xs.length);
  const card = (it: CatalogItem) => {
    // money only through the estimates chat's function (engine inside); the tech sees the selling price, never cost or margin (spec 06 §7.6)
    const eco = catalogItemEconomics(it, db.catalog);
    const loss = eco.marginPct !== null && eco.marginPct.startsWith("-");
    const tax = it.vendorTaxBps ? t("card.vendorTax", { pct: (it.vendorTaxBps / 100).toString() }) : "";
    return (
      <ListCard
        key={it.id}
        title={it.name}
        lead={{ kind: "icon", icon: KIND_ICON[it.kind] }}
        value={`${money(eco.priceCents)} / ${it.unit}`}
        signs={canEdit && loss ? [{ tone: "bad", label: t("card.sign.loss") }] : undefined}
        edge={canEdit && loss ? "bad" : null}
        tags={[t(kindLabel(it.kind)), ...(it.placeholder ? [t("cat.placeholder")] : [])]}
        facts={{
          supplier: it.vendor ? [it.vendor, tax].filter(Boolean).join(" · ") : undefined,
          lines: it.kind === "kit" && it.components?.length ? t("card.kitItems", { n: it.components.length }) : undefined,
          desc: it.description,
        }}
        // both tiles always, «—» when unknown: rows of equal height on the tablet grid
        figures={canEdit ? [
          { label: t("card.fig.cost"), value: eco.costCents === null ? "—" : money(eco.costCents) },
          { label: t("card.fig.margin"), value: eco.marginPct === null ? "—" : `${eco.marginPct}%`, tone: loss ? "bad" : undefined },
        ] : undefined}
        onPress={canEdit ? () => router.push(`/catalog/${it.id}`) : undefined}
      />
    );
  };

  return (
    <Screen
      title={t("cat.title")}
      back={back}
      help={t("cat.help")}
      hintKey="catalog"
      right={canEdit ? <Button label={t("cat.new")} icon="plus" size="sm" variant="secondary" onPress={() => router.push(`/catalog/new${kind !== "all" ? `?kind=${kind}` : ""}`)} /> : undefined}
    >
      <TextField type="search" value={q} onChangeText={setQ} placeholder={t("ue.catalogSearch")} icon="search" />
      <ChoiceChips value={kind} onChange={setKind} items={KINDS.map((k) => ({ key: k, label: t(kindLabel(k)) }))} />
      {items.length === 0 ? (
        <Empty icon="note" title={t("cat.empty")} />
      ) : (
        <>
          {groups.map(([k, xs]) => (
            <View key={k} style={{ gap: space[2] }}>
              {kind === "all" ? <T v="caption" w="semibold" tone="mut">{`${t(kindLabel(k))} · ${xs.length}`}</T> : null}
              {/* the catalog is not a queue: cards on a grid on tablet (2) and desktop (3), tiles stay visible */}
              {device === "phone" ? <CardList>{xs.map(card)}</CardList> : <CardGrid>{xs.map(card)}</CardGrid>}
            </View>
          ))}
        </>
      )}
    </Screen>
  );
}
