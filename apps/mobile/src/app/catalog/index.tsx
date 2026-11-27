import { useMemo, useState } from "react";
import { usableItems } from "@/features/catalogMatch";
import { seeCosts } from "@/features/access";
import { router } from "expo-router";
import { useStore } from "@/data/store";
import type { CatalogItem, CatalogKind } from "@/data/types";
import { useI18n } from "@/i18n";
import { kindLabel } from "@/features/estimatePickers";
import { Button } from "@/ui/controls";
import { FilterBar } from "@/ui/filterBar";
import { filterStoreKey } from "@/ui/filterBarRules";
import { usePersistentState } from "@/data/persist";
import { Empty, Screen } from "@/ui/surfaces";
import { GroupedList, GroupRow, ListGroup } from "@/ui/groupedList";
import type { IconKey } from "@/ui/primitives";
import { catalogItemEconomics } from "@/features/estimateDoc";
import { supplierName } from "@/features/suppliers";

const KINDS: (CatalogKind | "all")[] = ["all", "service", "labor", "material", "kit"];
const KIND_ICON: Record<CatalogKind, IconKey> = { service: "route", labor: "clock", material: "box", kit: "checklist" };

/** Company catalog: services, labor, materials and kits used in estimates. */
export default function Catalog() {
  const { db, role, mode } = useStore();
  const { t, money } = useI18n();
  const [q, setQ] = useState("");
  // spec 31 §6 п.7: the kind is kept on this device for this list; the search is not
  const [keptKind, setKind] = usePersistentState<CatalogKind | "all">(`${filterStoreKey("catalog")}.kind`, "all");
  const kind = KINDS.includes(keptKind) ? keptKind : "all";
  const back = () => (router.canGoBack() ? router.back() : router.replace("/more"));
  const items = useMemo(
    () =>
      // #2227: an item another took over (mergedInto) is kept for its estimates, never listed
      usableItems(db.catalog)
        .filter((x) => kind === "all" || x.kind === kind)
        .filter((x) => !q.trim() || x.name.toLowerCase().includes(q.trim().toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [db.catalog, q, kind],
  );
  const canEdit = role !== "tech";
  // #1837: the cost, the margin and «в убыток» only for who sees our costs (the server's app.can_view_costs), not by role
  const costs = seeCosts(db, role, mode);
  // groups by kind only when «All» is chosen (otherwise the chip already says the kind)
  const groups = KINDS.filter((k): k is CatalogKind => k !== "all").map((k) => [k, items.filter((x) => x.kind === k)] as const).filter(([, xs]) => xs.length);
  /**
   * Lists B (#2992): an item is a row of its kind's group (rule 12) — the kind's icon · the name, «поставщик · себестоимость · маржа»
   * (only what is known: no «Себестоимость —» tiles in every card) · on the right the price per unit; a loss — «В убыток» under it.
   */
  const row = (it: CatalogItem) => {
    // money only through the estimates chat's function (engine inside); the tech sees the selling price, never cost or margin (spec 06 §7.6)
    const eco = catalogItemEconomics(it, db.catalog);
    const loss = eco.marginPct !== null && eco.marginPct.startsWith("-");
    const tax = it.vendorTaxBps ? t("card.vendorTax", { pct: (it.vendorTaxBps / 100).toString() }) : "";
    const line = [
      // spec 36: the supplier's name from the list, else the old text
      supplierName(db, it) ? [supplierName(db, it), tax].filter(Boolean).join(" · ") : undefined,
      it.kind === "kit" && it.components?.length ? t("card.kitItems", { n: it.components.length }) : undefined,
      costs && eco.costCents !== null ? `${t("card.fig.cost")} ${money(eco.costCents)}` : undefined,
      costs && eco.marginPct !== null ? `${t("card.fig.margin")} ${eco.marginPct}%` : undefined,
      it.description,
    ].filter(Boolean).join(" · ");
    return (
      <GroupRow
        key={it.id}
        testID={`catalog-row-${it.id}`}
        title={it.name}
        subtitle={line || undefined}
        lead={{ icon: KIND_ICON[it.kind] }}
        value={`${money(eco.priceCents)} / ${it.unit}`}
        // a long name («Debris haul-away (pickup load)») takes a second line, never «…» (Д-строка-2)
        wrap
        status={costs && loss ? { status: "bad", label: t("card.sign.loss") } : undefined}
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
      {/* spec 31 (variant Б): the search and one lane of kinds with counts; nothing in the sheet (no «Фильтр» button) */}
      <FilterBar<CatalogKind | "all">
        search={{ value: q, onChange: setQ, placeholder: t("ue.catalogSearch") }}
        value={kind}
        onChange={setKind}
        items={KINDS.map((k) => ({ key: k, label: t(kindLabel(k)), count: k === "all" ? usableItems(db.catalog).length : usableItems(db.catalog).filter((x) => x.kind === k).length }))}
      />
      {items.length === 0 ? (
        <Empty icon="note" title={t("cat.empty")} />
      ) : (
        <GroupedList testID="catalog-list">
          {groups.map(([k, xs]) => (
            // the kind's title only on «Все» (otherwise the chip already says the kind)
            <ListGroup key={k} separate title={kind === "all" ? t(kindLabel(k)) : undefined} count={kind === "all" ? xs.length : undefined} testID={`catalog-group-${k}`}>
              {xs.map(row)}
            </ListGroup>
          ))}
        </GroupedList>
      )}
    </Screen>
  );
}
