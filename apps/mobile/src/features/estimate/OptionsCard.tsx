import { useRef, useState, type ComponentRef } from "react";
import { View } from "react-native";
import { component, size, space } from "@octo/design-tokens";
import type { CustomOption } from "@octo/estimating-engine";
import { useI18n, type DictKey } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, IconButton, Segmented, TextField } from "@/ui/controls";
import { Icon, Press, T } from "@/ui/primitives";
import { Menu, Sheet, useToast, type MenuItem } from "@/ui/overlays";
import { Card, RowView } from "@/ui/surfaces";
import { MAX_OPTIONS, OPTION_NAME_MAX } from "@/features/estimateDoc";

/** the five steps of «?» and the closing «Общее для всех» (DS §8.10) — the e2e reads them by these ids */
export const OPTION_HELP_STEPS = [1, 2, 3, 4, 5] as const;

type MoreKey = "recommend" | "rename" | "delete";

/**
 * «Варианты для клиента» (DS §8.10, spec 39 §11.2.6, prototype v9): a heading and «?». One option — a line and «Добавить
 * вариант». Several — the segments, under them each option's total and «★ рекомендуем» (a press there picks it too, the
 * owner compares without switching), whose list is being edited, «Вариант — копия „…“» (pale at three: it says why) and
 * «Ещё» (recommend, rename, delete). The screen owns the document; this card only says what was asked.
 */
export function OptionsCard(p: {
  options: CustomOption[];
  curId: string;
  /** each option's total, cents (the engine's, as the panel counts it) */
  totals: Record<string, number>;
  /** a signed estimate: the options are shown, not changed */
  locked?: boolean;
  onPick: (id: string) => void;
  onCopy: () => void;
  onRecommend: (id: string, on: boolean) => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const { t, money } = useI18n();
  const { c } = useTheme();
  const toast = useToast();
  const [help, setHelp] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const moreRef = useRef<ComponentRef<typeof View>>(null);
  const cur = p.options.find((o) => o.id === p.curId) ?? p.options[0]!;
  const many = p.options.length > 1;
  const full = p.options.length >= MAX_OPTIONS;

  const items: MenuItem<MoreKey>[] = [
    { key: "recommend", label: t(cur.recommended ? "est.var.recommendOff" : "est.var.recommend", { name: cur.name }), icon: "star", selected: !!cur.recommended, testID: "est-var-act-recommend" },
    { key: "rename", label: t("est.var.rename", { name: cur.name }), icon: "pencil", testID: "est-var-act-rename" },
    { key: "delete", label: t("est.var.delete", { name: cur.name }), icon: "trash", destructive: true, testID: "est-var-act-delete" },
  ];
  const onMore = (k: MoreKey) => {
    setMenu(null);
    if (k === "recommend") {
      p.onRecommend(cur.id, !cur.recommended);
      if (!cur.recommended) toast.show(t("est.var.recommendedToast", { name: cur.name }));
    } else if (k === "rename") setRenaming(cur.name);
    else p.onDelete();
  };
  // a name the client reads: not empty, not another option's (two «Good» side by side), at most OPTION_NAME_MAX characters
  const commitRename = () => {
    const name = Array.from((renaming ?? "").trim()).slice(0, OPTION_NAME_MAX).join("").trim();
    if (!name) return;
    if (p.options.some((o) => o.id !== cur.id && o.name.trim().toLowerCase() === name.toLowerCase())) return void toast.show(t("est.var.nameTaken", { name }));
    p.onRename(name);
    setRenaming(null);
  };

  return (
    <View testID="est-variants">
      <Card>
        <RowView>
          <T v="heading" style={{ flex: 1 }}>
            {t("est.var.title")}
          </T>
          <View testID="est-var-help">
            <IconButton icon="help" label={t("est.var.help")} tone="plain" onPress={() => setHelp(true)} />
          </View>
        </RowView>
        {!many ? (
          <>
            <T v="caption" tone="mut">
              {t("est.var.one")}
            </T>
            {p.locked ? null : (
              <View testID="est-var-add" style={{ alignSelf: "flex-start" }}>
                <Button label={t("est.var.add")} icon="copy" variant="secondary" onPress={p.onCopy} />
              </View>
            )}
          </>
        ) : (
          <>
            <Segmented radio full label={t("est.var.pick")} testID="est-var-seg" value={cur.id} onChange={p.onPick} items={p.options.map((o) => ({ key: o.id, label: o.name || "—" }))} />
            <RowView style={{ gap: space[1], alignItems: "stretch" }}>
              {p.options.map((o) => (
                <View key={o.id} style={{ flex: 1 }}>
                  <Press
                    onPress={() => p.onPick(o.id)}
                    visibleHeight={size.hitMin}
                    accessibilityRole="button"
                    accessibilityLabel={`${o.name}: ${money(p.totals[o.id] ?? 0)}`}
                    testID={`est-var-total-${o.id}`}
                  >
                    <View style={{ minHeight: size.hitMin, alignItems: "center", justifyContent: "center" }}>
                      <T v="body" w={o.id === cur.id ? "semibold" : undefined} tone={o.id === cur.id ? "ink" : "mut"} tabular center>
                        {money(p.totals[o.id] ?? 0)}
                      </T>
                    </View>
                  </Press>
                  {o.recommended ? (
                    // «★ рекомендуем» — a checkbox with the option's name (DS §8.10): a press takes the mark off
                    <Press
                      onPress={p.locked ? undefined : () => p.onRecommend(o.id, false)}
                      visibleHeight={size.hitMin}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: true, disabled: !!p.locked }}
                      accessibilityLabel={`${t("est.var.recommended")}: ${o.name}`}
                      testID={`est-var-rec-${o.id}`}
                    >
                      <RowView style={{ gap: space[1], justifyContent: "center", minHeight: size.hitMin }}>
                        <Icon name="star" s={size.iconXs} color={c.mut} />
                        <T v="caption" tone="mut">
                          {t("est.var.recommended")}
                        </T>
                      </RowView>
                    </Press>
                  ) : null}
                </View>
              ))}
            </RowView>
            <T v="caption" tone="mut">
              {t("est.var.editing", { name: cur.name })}
            </T>
            {p.locked ? null : (
              <RowView style={{ flexWrap: "wrap" }}>
                {full ? (
                  // three already: the button is pale and does not copy; a press says why (DS §8.10)
                  <View testID="est-var-copy-max" style={{ opacity: component.dimOpacity }}>
                    <Button label={t("est.var.copy", { name: cur.name })} icon="copy" variant="ghost" size="sm" accessibilityLabel={`${t("est.var.copy", { name: cur.name })}. ${t("est.var.max")}`} onPress={() => toast.show(t("est.var.max"))} />
                  </View>
                ) : (
                  <View testID="est-var-copy">
                    <Button label={t("est.var.copy", { name: cur.name })} icon="copy" variant="ghost" size="sm" onPress={p.onCopy} />
                  </View>
                )}
                <View ref={moreRef} collapsable={false} testID="est-var-more">
                  <Button label={t("est.var.more")} icon="more" variant="ghost" size="sm" accessibilityLabel={t("est.var.menu", { name: cur.name })} onPress={() => moreRef.current?.measureInWindow((x: number, y: number, w: number, h: number) => setMenu({ x, y, w, h }))} />
                </View>
              </RowView>
            )}
          </>
        )}
      </Card>
      <Menu visible={!!menu} anchor={menu} items={items} title={t("est.var.menu", { name: cur.name })} onSelect={onMore} onClose={() => setMenu(null)} />
      <Sheet visible={help} onClose={() => setHelp(false)} title={t("est.var.help")}>
        <View testID="est-var-help-sheet" style={{ gap: space[3] }}>
          {OPTION_HELP_STEPS.map((n) => (
            <View key={n} testID={`est-var-step-${n}`} style={{ gap: space[1] }}>
              <T v="body" w="semibold">
                {t(`est.var.step${n}` as DictKey)}
              </T>
              <T v="caption" tone="mut">
                {t(`est.var.step${n}Text` as DictKey)}
              </T>
            </View>
          ))}
          <View testID="est-var-common" style={{ gap: space[1] }}>
            <T v="body" w="semibold">
              {t("est.var.common")}
            </T>
            <T v="caption" tone="mut">
              {t("est.var.commonText")}
            </T>
          </View>
          <Button label={t("common.gotIt")} icon="check" full onPress={() => setHelp(false)} />
        </View>
      </Sheet>
      <Sheet visible={renaming !== null} onClose={() => setRenaming(null)} title={t("est.var.renameTitle")}>
        <View testID="est-var-rename" style={{ gap: space[3] }}>
          <TextField type="title" value={renaming ?? ""} onChangeText={setRenaming} placeholder={t("est.var.renameTitle")} />
          <View testID="est-var-rename-done">
            <Button label={t("ue.doneLine")} icon="check" full disabled={!(renaming ?? "").trim()} onPress={commitRename} />
          </View>
        </View>
      </Sheet>
    </View>
  );
}
