/**
 * «Компания → Модули → Gutters → Цены и прайс» (docs/specs/33-gutters-settings.md П22.10, M7d).
 * Labor prices (founder О4: labor on its own lines — install by storey, a downspout by storey, a cut corner, tear-off,
 * tile) and the parts of a job of the company's defaults, each found in the company's price list by its properties
 * (catalogMatch) — or «not in the price list» with «Создать» (a TEST price, rule 9) and «Привязать» (an item of the list
 * without properties). «Создать позиции сразу» makes all the missing ones: test prices, never twice (catalog.save
 * onlyNew, fixed ids). A price is changed in the core's item editor (/catalog/<id>): one editor, cost and markup as everywhere.
 * The director and the office (catalog rights, staff) change them; only while the module is active (founder О2).
 * Every object is a card (rule 12); the bind picker in a sheet lists rows.
 */
import { useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import type { PartQty } from "@octo/estimating-engine";
import { useStore } from "@/data/store";
import type { CatalogItem } from "@/data/types";
import { attributesLine } from "@/features/catalogMatch";
import { catalogUnitPrice } from "@/features/estimateDoc";
import { useI18n, type DictKey } from "@/i18n";
import { moduleState } from "@/modules/registry";
import { useDevice } from "@/theme/ThemeProvider";
import { Button, StatusChip } from "@/ui/controls";
import { CardGrid, ListCard } from "@/ui/listCard";
import { useToast, Sheet } from "@/ui/overlays";
import { T } from "@/ui/primitives";
import { Card, CardList, ListRow, Screen } from "@/ui/surfaces";
import { bindable, bindItem, findItem, laborRows, materialRows, matchAttrs, missingItems, PART_WORDS, WORK_WORDS, type PriceRow } from "../prices";

const k = (s: string) => `mod.gutters.pr.${s}` as DictKey;
export default function GutterPricesScreen() {
  const store = useStore();
  const { t, money } = useI18n();
  const toast = useToast();
  const { device } = useDevice();
  const cm = store.db.company?.modules?.gutters;
  const raw = cm?.settings;
  const access = moduleState(cm).access;
  const active = access === "trial" || access === "paid";
  // the price list's writers (catalog_items: app.is_staff — owner, admin, office, sales; the core's /catalog: all but a tech)
  const staff = store.role !== "tech";
  const ro = !staff || !active;
  const catalog = store.db.catalog;
  const companyId = store.db.company?.id ?? "demo";
  const back = () => (router.canGoBack() ? router.back() : router.replace("/company/modules"));

  const labor = useMemo(() => laborRows(), []);
  const parts = useMemo(() => materialRows(raw), [raw]);
  const [bindFor, setBindFor] = useState<PriceRow | null>(null);

  /** the item's name in the app's language at the moment it is made: company data from then on (the owner renames it) */
  const nameOf = (p: PartQty): string => {
    if (p.kind === "labor") {
      const w = p.attrs.work ?? "";
      const word = WORK_WORDS.has(w) ? t(k(`w.${w}`)) : w;
      return p.attrs.story ? `${word} · ${t("mod.gutters.story", { n: p.attrs.story })}` : word;
    }
    const { part, ...rest } = matchAttrs(p);
    const word = part && PART_WORDS.has(part) ? t(k(`p.${part}`)) : part ?? p.key;
    const line = attributesLine(rest);
    return line ? `${word} · ${line}` : word;
  };
  const missing = useMemo(() => missingItems(companyId, [...labor, ...parts], catalog, nameOf), [companyId, labor, parts, catalog, t]); // eslint-disable-line react-hooks/exhaustive-deps

  /** ids made from this page and not taken back: a second press before the page redraws makes nothing and never puts
   *  an empty «Отменить» in place of the first one's (review M7d №2, rule 5) */
  const made = useRef(new Set<string>());
  const make = (items: CatalogItem[]) => {
    const fresh = items.filter((it) => !made.current.has(it.id));
    if (!fresh.length) return;
    fresh.forEach((it) => made.current.add(it.id));
    const undo = store.saveCatalogItems(fresh, { onlyNew: true });
    toast.show(store.online ? t(k("made"), { n: fresh.length }) : t("offline.queued"), () => {
      fresh.forEach((it) => made.current.delete(it.id));
      undo();
    });
  };
  const bind = (it: CatalogItem, row: PriceRow) => {
    setBindFor(null);
    const undo = store.saveCatalogItem(bindItem(it, row.part));
    toast.show(store.online ? t(k("bound")) : t("offline.queued"), undo);
  };

  const card = (row: PriceRow) => {
    const it = findItem(catalog, row.part);
    const title = it ? it.name : nameOf(row.part);
    const unit = row.part.unit;
    if (it) {
      return (
        <ListCard
          key={row.key}
          testID={`gpr-${it.placeholder ? "test" : "found"}-${row.part.key}`}
          title={title}
          lead={{ kind: "icon", icon: row.part.kind === "labor" ? "clock" : "box" }}
          value={`${money(catalogUnitPrice(it))} / ${unit}`}
          status={it.placeholder ? { tone: "warn", label: t(k("testPrice")) } : { tone: "ok", label: t(k("found")) }}
          edge={null}
          onPress={ro ? undefined : () => router.push(`/catalog/${it.id}`)}
        />
      );
    }
    const own = missing.find((m) => findItem([m], row.part));
    return (
      <ListCard
        key={row.key}
        testID={`gpr-miss-${row.part.key}`}
        title={title}
        lead={{ kind: "icon", icon: row.part.kind === "labor" ? "clock" : "box" }}
        value={`— / ${unit}`}
        status={{ tone: "warn", label: t(k("missing")) }}
        edge={null}
        action={ro || !own ? undefined : { label: t(k("makeOne")), icon: "plus", onPress: () => make([own]) }}
        onPress={ro ? undefined : () => setBindFor(row)}
      />
    );
  };
  const list = (rows: PriceRow[]) => (device === "phone" ? <CardList>{rows.map(card)}</CardList> : <CardGrid>{rows.map(card)}</CardGrid>);
  const binds = bindFor ? bindable(catalog, bindFor.part) : [];

  return (
    <Screen title={t(k("title"))} back={back} subtitle={t("mod.gutters.title")}>
      <View style={{ gap: space[4] }} testID="gpr-screen">
        <T v="body" tone="mut">{t(k("intro"))}</T>
        {!active ? (
          <View testID="gpr-locked">
            <StatusChip status="warn" label={t("mod.gutters.set.locked")} />
          </View>
        ) : !staff ? (
          <View testID="gpr-ro">
            <StatusChip status="info" label={t(k("askOffice"))} />
          </View>
        ) : null}

        <View testID="gpr-make-all">
          <Card>
            <View testID={missing.length ? "gpr-missing-n" : "gpr-all-found"}>
              <T v="heading">{missing.length ? t(k("missingN"), { n: missing.length }) : t(k("allFound"))}</T>
            </View>
            <T v="caption" tone="mut">{t(k("makeHint"))}</T>
            {!ro && missing.length ? (
              <View testID="gpr-make-all-btn">
                <Button label={t(k("makeAll"), { n: missing.length })} icon="plus" variant="primary" onPress={() => make(missing)} />
              </View>
            ) : null}
          </Card>
        </View>

        <View style={{ gap: space[2] }} testID="gpr-labor">
          <T v="heading">{t(k("labor"))}</T>
          <T v="caption" tone="mut">{t(k("laborHint"))}</T>
          {list(labor)}
        </View>
        <View style={{ gap: space[2] }} testID="gpr-parts">
          <T v="heading">{t(k("parts"))}</T>
          <T v="caption" tone="mut">{t(k("partsHint"))}</T>
          {list(parts)}
        </View>
      </View>

      <Sheet visible={!!bindFor} onClose={() => setBindFor(null)} title={bindFor ? nameOf(bindFor.part) : ""}>
        <View style={{ gap: space[3] }} testID="gpr-bind">
          <T v="caption" tone="mut">{t(k("bindHint"))}</T>
          {bindFor
            ? (() => {
                const own = missing.find((m) => findItem([m], bindFor.part));
                return own ? (
                  <View testID="gpr-bind-make">
                    <Button
                      label={t(k("makeOne"))}
                      icon="plus"
                      variant="secondary"
                      onPress={() => {
                        setBindFor(null);
                        make([own]);
                      }}
                    />
                  </View>
                ) : (
                  <T v="caption" tone="mut">{t(k("madeBefore"))}</T>
                );
              })()
            : null}
          {binds.length ? (
            binds.map((it) => (
              <View key={it.id} testID={`gpr-bind-${it.id}`}>
                <ListRow title={it.name} subtitle={`${money(catalogUnitPrice(it))} / ${it.unit}`} onPress={() => bindFor && bind(it, bindFor)} />
              </View>
            ))
          ) : (
            <T v="caption" tone="mut">{t(k("bindNone"))}</T>
          )}
        </View>
      </Sheet>
    </Screen>
  );
}
