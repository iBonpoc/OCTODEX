import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n, type DictKey } from "@/i18n";
import { activeCategories, nameTaken } from "@/features/serviceCategories";
import { TRADES } from "@/features/companySetup";
import { pickTrades, tradeMatches } from "@/features/firstSteps";
import { Button, MultiChips, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Card, Screen, SectionTitle } from "@/ui/surfaces";

type Trade = (typeof TRADES)[number];

/**
 * First run, step 1 (docs/specs/13 §3.11 п.1, 19 §2 п.1): «Чем вы занимаетесь?» — the company's directions
 * (docs/specs/11-trade.md) with a search and «Другое» (own name). Skippable; the same list lives in Настройки компании → Направления.
 */
export default function TradeStep() {
  const store = useStore();
  const { t } = useI18n();
  const list = store.db.serviceCategories;
  const have = new Set(activeCategories(list).map((c) => c.seedKey).filter(Boolean));
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Trade[]>([]);
  const [own, setOwn] = useState("");
  const label = (k: Trade) => t(`trade.${k}` as DictKey);
  const presets = TRADES.filter((k) => k !== "other" && !have.has(k));
  const shown = presets.filter((k) => picked.includes(k) || tradeMatches(label(k), q));
  const ownName = own.trim();
  const ownTaken = !!ownName && nameTaken(list, ownName, undefined, t);
  const next = () => router.replace("/company/profile?wizard=1");
  const save = () => {
    const add = pickTrades(picked, ownTaken ? "" : ownName);
    for (const c of add) store.saveServiceCategory(c);
    next();
  };
  return (
    <Screen title={t("first.trade.title")} subtitle={t("first.trade.hint")}>
      <View testID="trade-step" style={{ gap: space[3] }}>
        <TextField type="search" value={q} onChangeText={setQ} placeholder={t("first.trade.search")} icon="search" />
        <Card>
          {shown.length ? (
            <MultiChips<Trade> value={picked} onChange={setPicked} items={shown.map((k) => ({ key: k, label: label(k) }))} />
          ) : (
            <T v="caption" tone="mut">
              {t("first.trade.none")}
            </T>
          )}
        </Card>
        <Card>
          <SectionTitle title={t("trade.other")} />
          <TextField type="title" value={own} onChangeText={setOwn} placeholder={t("dir.ownPlaceholder")} />
          {ownTaken ? (
            <T v="caption" tone="warn">
              {`⚠ ${t("dir.taken")}`}
            </T>
          ) : null}
          <T v="caption" tone="mut">
            {t("co.tradesNote")}
          </T>
        </Card>
        <Button label={t("first.trade.next")} icon="check" full disabled={!picked.length && (!ownName || ownTaken)} onPress={save} />
        <Button label={t("co.skip")} variant="ghost" full onPress={next} />
      </View>
    </Screen>
  );
}
