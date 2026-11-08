/**
 * «Ещё → Поставщики» (docs/specs/36 §7): the company's suppliers as cards. Owner, admin, office only (nav/roles.ts;
 * the server reads none for the tech and sales). Active ones by default, the archive one tap away.
 */
import { useMemo, useState } from "react";
import { router } from "expo-router";
import { useStore } from "@/data/store";
import type { Supplier } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { itemsOfSupplier, sortedSuppliers, suppliersOf } from "@/features/suppliers";
import { Button } from "@/ui/controls";
import { FilterBar } from "@/ui/filterBar";
import { filterStoreKey } from "@/ui/filterBarRules";
import { usePersistentState } from "@/data/persist";
import { CardList, Empty, Screen } from "@/ui/surfaces";
import { CardGrid, ListCard } from "@/ui/listCard";
import { useDevice } from "@/theme/ThemeProvider";

type Lane = "active" | "archived";

export default function Suppliers() {
  const { db } = useStore();
  const { t } = useI18n();
  const { device } = useDevice();
  const [q, setQ] = useState("");
  // spec 31 §6 п.7: the lane is kept on this device; the search is not
  const [kept, setLane] = usePersistentState<Lane>(`${filterStoreKey("suppliers")}.lane`, "active");
  const lane: Lane = kept === "archived" ? "archived" : "active";
  const back = () => (router.canGoBack() ? router.back() : router.replace("/more"));
  const all = suppliersOf(db);
  const list = useMemo(
    () =>
      sortedSuppliers(all.filter((x) => (lane === "active" ? x.active : !x.active))).filter(
        (x) => !q.trim() || [x.name, x.contactName, x.phone, x.accountNumber].some((w) => (w ?? "").toLowerCase().includes(q.trim().toLowerCase())),
      ),
    [all, lane, q],
  );
  const card = (s: Supplier) => {
    const n = itemsOfSupplier(db, s.id).length;
    return (
      <ListCard
        key={s.id}
        testID={`sup-card-${s.id}`}
        title={s.name}
        lead={{ kind: "icon", icon: "truck" }}
        status={s.active ? undefined : { tone: "neutral", label: t("sup.archived") }}
        facts={{
          by: s.contactName,
          phone: s.phone,
          terms: s.terms ? (s.terms === "custom" && s.termsNote ? s.termsNote : t(`sup.terms.${s.terms}` as DictKey)) : undefined,
          lines: t("sup.items", { n }),
          addr: s.address,
        }}
        contact={{ phone: s.phone, email: s.email }}
        onPress={() => router.push(`/suppliers/${s.id}`)}
      />
    );
  };
  return (
    <Screen
      title={t("sup.title")}
      back={back}
      help={t("sup.help")}
      right={<Button label={t("sup.new")} icon="plus" size="sm" variant="secondary" onPress={() => router.push("/suppliers/new")} />}
    >
      <FilterBar<Lane>
        search={{ value: q, onChange: setQ, placeholder: t("sup.search") }}
        value={lane}
        onChange={setLane}
        items={[
          { key: "active", label: t("sup.f.active"), count: all.filter((x) => x.active).length },
          { key: "archived", label: t("sup.f.archived"), count: all.filter((x) => !x.active).length },
        ]}
      />
      {list.length === 0 ? (
        <Empty icon="truck" title={lane === "active" ? t("sup.empty") : t("sup.emptyArchived")} />
      ) : device === "phone" ? (
        <CardList>{list.map(card)}</CardList>
      ) : (
        <CardGrid>{list.map(card)}</CardGrid>
      )}
    </Screen>
  );
}
