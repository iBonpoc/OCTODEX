/**
 * «Одна цена на все цвета» (#1913 PR3; spec 33-gutters-price-key §4.4 п.2, §7а п.3): the once-only transition of the company's coloured
 * items to price groups. The parts whose colours cost the same already — one line with their number; a part whose colours differ — its
 * colours and prices «было», and the price it will have: a menu, the suggested one first with WHY it is suggested (most colours have it /
 * it was changed last, its day). «Сделать одну цену» writes every group (the source first, the others join it: the store and the server
 * give them its price); one «Отменить» for all of it (rule 5). Only the core's components (rule 29).
 */
import { useEffect, useState } from "react";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import type { PartQty } from "@octo/estimating-engine";
import type { CatalogItem } from "@/data/types";
import { catalogUnitPrice } from "@/features/estimateDoc";
import { useI18n, type DictKey } from "@/i18n";
import { Button } from "@/ui/controls";
import { Sheet } from "@/ui/overlays";
import { T } from "@/ui/primitives";
import { SelectField } from "@/ui/selectField";
import { FieldGroup } from "@/ui/surfaces";
import { useColorLabel } from "../draw/AttrPanel";
import { partName } from "../prices";
import { groupAttrs, type TransitionGroup, type Why } from "./groups";

const k = (s: string) => `mod.gutters.pg.${s}` as DictKey;

/** the part of a group in words, without its colour: «5″ K-Style Gutter · Painted · .027 · Aluminum» (the module's words) */
export function groupName(t: Parameters<typeof partName>[0], it: CatalogItem): string {
  const { part, ...attrs } = groupAttrs(it.attributes ?? {});
  return partName(t, { key: part ?? "", kind: "material", unit: it.unit, attrs, qty: "1", section: "", use: "estimate" } as unknown as PartQty);
}

export function TransitionSheet({ visible, groups, onClose, onDone }: { visible: boolean; groups: TransitionGroup[]; onClose: () => void; onDone: (choice: Record<string, number>) => void }) {
  const { t, money, day } = useI18n();
  const colorLabel = useColorLabel();
  // the person's choice per group: the suggested one until changed
  const [choice, setChoice] = useState<Record<string, number>>({});
  useEffect(() => {
    if (visible) setChoice({});
  }, [visible]);
  const same = groups.filter((g) => g.options.length === 1);
  const differ = groups.filter((g) => g.options.length > 1);
  const priceOf = (g: TransitionGroup, i: number) => {
    const src = g.items.find((x) => x.id === g.options[i]!.sourceId)!;
    return `${money(catalogUnitPrice(src))} / ${src.unit}`;
  };
  const colours = (g: TransitionGroup, i: number) =>
    g.options[i]!.itemIds.map((id) => colorLabel(g.items.find((x) => x.id === id)?.attributes?.color ?? "")).join(", ");
  const whyText = (w: Why) => (w.k === "most" ? t(k("whyMost"), { n: w.n, of: w.of }) : w.k === "real" ? t(k("whyReal")) : w.k === "last" ? (w.at ? t(k("whyLast"), { d: day(w.at) }) : t(k("whyFirst"))) : "");
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t(k("title"))}
      footer={<View testID="gpr-pg-do"><Button label={t(k("do"))} size="bar" full onPress={() => onDone(choice)} /></View>}
    >
      <View style={{ gap: space[4] }} testID="gpr-pg-sheet">
        <T v="body" tone="mut">{t(k("intro"))}</T>
        {same.length ? (
          <View testID="gpr-pg-same"><T v="body">{t(k("sameN"), { n: same.length })}</T></View>
        ) : null}
        {differ.map((g) => {
          const pick = choice[g.key] ?? g.suggested;
          return (
            <FieldGroup key={g.key} title={groupName(t, g.items[0]!)} testID={`gpr-pg-${g.key.slice(-16)}`}>
              {/* «было» in one line: «Белый $8 / ft · Коричневый $9 / ft» (the spec's «было → станет»: the field under it is «станет») */}
              <T v="caption" tone="mut">{g.options.map((_, i) => `${colours(g, i)} ${priceOf(g, i)}`).join(" · ")}</T>
              <SelectField
                label={t(k("price"))}
                testID={`gpr-pg-pick-${g.key.slice(-16)}`}
                items={g.options.map((_, i) => ({ key: String(i), label: `${priceOf(g, i)} · ${colours(g, i)}` }))}
                value={String(pick)}
                onChange={(v) => setChoice((c) => ({ ...c, [g.key]: Number(v) }))}
              />
              {/* why this one is offered (§7а п.3): never a silent «the lower» or «the last» */}
              {pick === g.suggested ? <T v="caption" tone="mut">{whyText(g.why)}</T> : <T v="caption" tone="mut">{t(k("yours"))}</T>}
            </FieldGroup>
          );
        })}
      </View>
    </Sheet>
  );
}
