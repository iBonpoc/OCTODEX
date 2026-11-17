/**
 * «Компания → Модули → Gutters → Цены и прайс» (docs/specs/33-gutters-settings.md П22.10, M7d).
 * Labor prices (founder О4: labor on its own lines — install by storey, a downspout by storey, a cut corner, tear-off,
 * tile) and the parts of a job of the company's defaults, each found in the company's price list by its properties
 * (catalogMatch) — or «not in the price list» with «Создать» (a TEST price, rule 9) and «Привязать» (an item of the list
 * without properties). «Создать позиции сразу» makes all the missing ones: test prices, never twice (catalog.save
 * onlyNew, fixed ids). A price is changed in a sheet (spec 53 §6.3: the card, then «Сохранить» — QuickPriceSheet of the core,
 * cost and markup as in the core's item editor); the full editor (/catalog/<id>) is one tap further.
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
import { catalogUnitPrice } from "@/features/estimateDoc";
import { useI18n, type DictKey } from "@/i18n";
import { moduleState } from "@/modules/registry";
import { useDevice } from "@/theme/ThemeProvider";
import { Banner } from "@/ui/banner";
import { Button } from "@/ui/controls";
import { CardGrid, ListCard, ListCardHeader } from "@/ui/listCard";
import { useToast, Sheet } from "@/ui/overlays";
import { T } from "@/ui/primitives";
import { CardList, ListRow, Screen } from "@/ui/surfaces";
import { bindable, bindItem, findItem, laborRows, materialRows, missingItems, partName, type PriceRow, priceFromOtherDegree } from "../prices";
import { withAfter } from "@/data/undo";
import { QuickPriceSheet } from "@/features/QuickPriceSheet";
import { quickSheetKey } from "@/features/quickPrice";
import { useHeldSheet } from "@/ui/heldSheet";
import { seeCosts } from "@/features/access";
import { transitionGroups, transitionWrites } from "./groups";
import { TransitionSheet } from "./TransitionSheet";

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
  /** spec 53 §6.3 (53-1): the price of a found item in a sheet — two taps (a kit keeps the full editor) */
  const [quickId, setQuickId] = useState<string | null>(null);
  // held while the sheet goes out (DS Б1, #1163); an item deleted meanwhile (another phone) — the sheet goes out
  const quick = useHeldSheet(quickId ? catalog.find((x) => x.id === quickId) ?? null : null);

  /** the item's name in the app's language at the moment it is made: company data from then on (the owner renames it) */
  const nameOf = (p: PartQty): string => partName(t, p);
  const missing = useMemo(() => missingItems(companyId, [...labor, ...parts], catalog, nameOf), [companyId, labor, parts, catalog, t]); // eslint-disable-line react-hooks/exhaustive-deps

  /** ids made from this page and not taken back: a second press before the page redraws makes nothing and never puts
   *  an empty «Отменить» in place of the first one's (review M7d №2, rule 5) */
  const made = useRef(new Set<string>());
  const make = (items: CatalogItem[]) => {
    const fresh = items.filter((it) => !made.current.has(it.id));
    if (!fresh.length) return;
    fresh.forEach((it) => made.current.add(it.id));
    const undo = store.saveCatalogItems(fresh, { onlyNew: true });
    // too late (false): the items stay made — a second press must not make them again (#1244)
    toast.show(store.online ? t(k("made"), { n: fresh.length }) : t("offline.queued"), withAfter(undo, () => fresh.forEach((it) => made.current.delete(it.id))));
  };
  // «Одна цена на все цвета» (#1913 PR3): the company's coloured items gathered into price groups once; done by who sees our costs
  const groups = useMemo(() => (active ? transitionGroups(catalog) : []), [active, catalog]);
  const canGroup = staff && seeCosts(store.db, store.role, store.mode);
  const [pgOpen, setPgOpen] = useState(false);
  const doGroups = (choice: Record<string, number>) => {
    setPgOpen(false);
    const sees = seeCosts(store.db, store.role, store.mode);
    // the source of each group first: it starts the group with its price, the others join it (they take its price — store and server)
    const undos = groups.flatMap((g) => transitionWrites(g, choice[g.key] ?? g.suggested, sees).map((it) => store.saveCatalogItem(it)));
    toast.show(store.online ? t("mod.gutters.pg.done", { n: groups.length }) : t("offline.queued"), store.undoTogether(undos));
  };
  const bind = (it: CatalogItem, row: PriceRow) => {
    setBindFor(null);
    const undo = store.saveCatalogItem(bindItem(it, row.part));
    toast.show(store.online ? t(k("bound")) : t("offline.queued"), undo);
  };

  /** «Монтаж водостока · эт 1»: the storey's number never wraps away from its word (design review #1426, 820) */
  const keep = (x: string) => x.replace(/ · /g, "\u00a0· ").replace(/ (\d+)$/, "\u00a0$1");
  const desktop = device === "desktop";
  const card = (row: PriceRow) => {
    // a part priced only by another degree's elbow (§2.7) is shown missing here: the company prices its own
    const it = priceFromOtherDegree(catalog, row.part) ? undefined : findItem(catalog, row.part);
    const title = keep(it ? it.name : nameOf(row.part));
    const unit = row.part.unit;
    if (it) {
      return (
        <ListCard
          key={row.key}
          testID={`gpr-${it.placeholder ? "test" : "found"}-${row.part.key}`}
          title={title}
          lead={{ kind: "icon", icon: row.part.kind === "labor" ? "wrench" : "box" }}
          value={`${money(catalogUnitPrice(it))} / ${unit}`}
          // #1873 (the founder 16.11: «Везде убираем… Нигде нет её. Надписи этой»): a sample price is a price like any other —
          // no mark; the testID keeps the state for the tests only
          status={{ tone: "ok", label: t(k("found")) }}
          density={desktop ? "row" : "rich"}
          edge={null}
          onPress={ro ? undefined : () => (it.kind === "kit" ? router.push(`/catalog/${it.id}`) : setQuickId(it.id))}
        />
      );
    }
    return (
      <ListCard
        key={row.key}
        testID={`gpr-miss-${row.part.key}`}
        title={title}
        lead={{ kind: "icon", icon: row.part.kind === "labor" ? "wrench" : "box" }}
        value={`— / ${unit}`}
        density={desktop ? "row" : "rich"}
        // «нет в прайсе» is said once, by the banner above with its number (#1426: 24 same chips were a wall); the card shows «—»
        edge={null}
        // no «Создать с тестовой ценой» on every row (#1426, the director's look at the shots: the banner's «Создать позиции сразу»
        // is the same action 24 times over); one row is made from its card: a tap opens the sheet with that action (DS Б9)
        onPress={ro ? undefined : () => setBindFor(row)}
      />
    );
  };
  // DS §5.5: from 1280 a list is rows (ListCard «row» under its header), a grid only on the tablet (design review #1426)
  const list = (rows: PriceRow[]) =>
    desktop ? (
      <>
        <ListCardHeader title={t(k("colItem"))} columns={[]} value={t(k("colPrice"))} />
        <CardList>{rows.map(card)}</CardList>
      </>
    ) : device === "phone" ? (
      <CardList>{rows.map(card)}</CardList>
    ) : (
      <CardGrid>{rows.map(card)}</CardGrid>
    );
  const binds = bindFor ? bindable(catalog, bindFor.part) : [];

  return (
    <Screen title={t(k("title"))} back={back} subtitle={t("mod.gutters.title")}>
      <View style={{ gap: space[4] }} testID="gpr-screen">
        <T v="body" tone="mut">{t(k("intro"))}</T>
        {/* the screen's state — ONE banner, the most urgent (DS Б9, §15.3; #1426): off → read only; not staff → ask; missing → the
            number and «Создать позиции сразу»; all there → said once, with the test prices still to set */}
        {!active ? (
          <Banner
            tone="warn"
            testID="gpr-locked"
            title={t("mod.gutters.set.locked")}
            hint={t(k("lockedHint"))}
            action={store.role === "director" ? { label: t("mod.gutters.draw.connect"), onPress: () => router.push("/company/modules") } : undefined}
          />
        ) : !staff ? (
          <Banner tone="info" testID="gpr-ro" title={t(k("askOffice"))} />
        ) : groups.length && !canGroup ? (
          // the transition is the owner's or the office's (it moves prices with our costs): the others are told who does it
          <Banner tone="info" testID="gpr-pg-ask" title={t("mod.gutters.pg.askOwner")} />
        ) : groups.length ? (
          <Banner tone="info" testID="gpr-pg" title={t("mod.gutters.pg.banner", { n: groups.length })} hint={t("mod.gutters.pg.bannerHint")} action={{ label: t("mod.gutters.pg.open"), onPress: () => setPgOpen(true) }} />
        ) : missing.length ? (
          <Banner tone="warn" testID="gpr-missing-n" title={t(k("missingN"), { n: missing.length })} hint={t(k("makeHint"))} action={{ label: t(k("makeAll"), { n: missing.length }), onPress: () => make(missing) }} />
        ) : (
          // everything is in the price list (#1873: sample prices carry no mark)
          <Banner tone="ok" testID="gpr-all-found" title={t(k("allFound"))} />
        )}

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

      <TransitionSheet visible={pgOpen && canGroup && groups.length > 0} groups={groups} onClose={() => setPgOpen(false)} onDone={doGroups} />
      <QuickPriceSheet key={quickSheetKey(quick.opening, quick.value)} item={quick.value} visible={quick.visible} onExited={quick.onExited} onClose={() => setQuickId(null)} />
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
