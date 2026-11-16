import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { component, radius, size, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n, type DictKey } from "@/i18n";
import { activeCategories, nameTaken } from "@/features/serviceCategories";
import { TRADES } from "@/features/companySetup";
import { pickTrades, tradeMatches } from "@/features/firstSteps";
import { Button, TextField } from "@/ui/controls";
import { CheckRows } from "@/ui/checkRows";
import { Icon, T } from "@/ui/primitives";
import { FieldGroup, ListRow, Screen } from "@/ui/surfaces";
import { StatusNote } from "@/ui/statusNote";
import { FieldAnchor, FieldError, useRequiredForm } from "@/ui/requiredForm";
import { useTheme } from "@/theme/ThemeProvider";

type Trade = (typeof TRADES)[number];

/**
 * First run, step 1 (docs/specs/13 §3.11 п.1, 19 §2 п.1): «Чем вы занимаетесь?» — the company's directions
 * (docs/specs/11-trade.md): a search, a list with flags (not chips, #1797) and «＋ Своё направление» (own name). Skippable; the same list lives in Настройки компании → Направления.
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
  /** something to save: a trade picked, or an own one that is not taken */
  const ready = picked.length > 0 || (!!ownName && !ownTaken);
  /** «Продолжить» is never pale: with nothing chosen the words stand under the directions, the scroll goes to them (DS §11 п.3) */
  const form = useRequiredForm();
  const tradeField = form.field("trade");
  const { c } = useTheme();
  const next = () => router.replace("/company/profile?wizard=1");
  const save = () => {
    const add = pickTrades(picked, ownTaken ? "" : ownName);
    for (const c of add) store.saveServiceCategory(c);
    next();
  };
  const submit = () => form.submit(ready ? [] : [{ id: "trade", text: t("form.req.trade") }], save);
  /** «＋ Своё направление»: the field for an own name opens (with the search words, if they matched nothing) and takes the focus */
  const [ownOpen, setOwnOpen] = useState(false);
  const [ownFocus, setOwnFocus] = useState(0);
  const qName = q.trim();
  const openOwn = () => {
    if (qName && !own.trim()) setOwn(qName);
    setOwnOpen(true);
    setOwnFocus((n) => n + 1);
  };
  return (
    <Screen form title={t("first.trade.title")} subtitle={t("first.trade.hint")}>
      <View testID="trade-step" style={{ gap: space[3] }}>
        <TextField type="search" value={q} onChangeText={setQ} placeholder={t("first.trade.search")} icon="search" />
        {/* the directions are the field: a list with flags, not wrapping chips (DS §А1в/§А4, #1797); the card's own frame turns
            status.bad, the words under it (DS §11 п.3) */}
        <FieldAnchor field={tradeField} style={{ gap: space[1] }}>
          {shown.length ? null : (
            <T v="caption" tone="mut">
              {t("first.trade.none")}
            </T>
          )}
          <View style={tradeField.error ? { borderRadius: radius.card, borderWidth: 1, borderColor: c.status.bad.fill } : undefined}>
            <CheckRows<Trade>
              testID="trade-list"
              value={picked}
              onChange={(v) => {
                setPicked(v);
                if (v.length) form.field("trade").clear();
              }}
              items={shown.map((k) => ({ key: k, label: label(k) }))}
              footer={
                ownOpen || ownName ? null : (
                  <ListRow
                    title={qName && !shown.length ? t("first.trade.addQ", { q: qName }) : t("first.trade.addOwn")}
                    left={<Icon name="plus" s={size.iconSm} color={c.ink} />}
                    chevron={false}
                    minHeight={component.rowOption}
                    onPress={openOwn}
                  />
                )
              }
            />
          </View>
          <FieldError text={tradeField.error} testID={`${tradeField.testID}-error`} />
        </FieldAnchor>
        {ownOpen || ownName ? (
        <FieldGroup title={t("first.trade.addOwn")} testID="trade-own">
          <TextField
            type="title"
            value={own}
            onChangeText={(v) => {
              setOwn(v);
              if (v.trim() && !nameTaken(list, v.trim(), undefined, t)) form.field("trade").clear();
            }}
            placeholder={t("dir.ownPlaceholder")}
            focusNow={ownFocus || undefined}
          />
          {ownTaken ? (
            <StatusNote tone="warn">{t("dir.taken")}</StatusNote>
          ) : null}
          <T v="caption" tone="mut">
            {t("co.tradesNote")}
          </T>
        </FieldGroup>
        ) : null}
        {/* the main button is always there to press (DS §11 п.3, #1728): with nothing chosen the words stand under the directions */}
        <Button label={t("first.trade.next")} icon="check" full testID="trade-next" onPress={submit} />
        <Button label={t("co.skip")} variant="ghost" full onPress={next} />
      </View>
    </Screen>
  );
}
