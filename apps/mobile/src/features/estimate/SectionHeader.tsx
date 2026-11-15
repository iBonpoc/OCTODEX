import { memo, useEffect, useState } from "react";
import { View } from "react-native";
import { size, space } from "@octo/design-tokens";
import type { EstimateSection } from "@octo/estimating-engine";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { IconButton, TextField } from "@/ui/controls";
import { Menu, type MenuItem } from "@/ui/overlays";
import { Icon, Press, T } from "@/ui/primitives";
import { useScreenScroll } from "@/ui/requiredForm";
import { RowView } from "@/ui/surfaces";
import { useRef, type ComponentRef } from "react";

/**
 * The heading of a section of the estimate (DS §8.5): the title, the total on the right, «˅» to fold it, «⋯». Folded it reads
 * «Крыша · Позиций: 5 · $2,340.00». The title is renamed in place (a field in the heading). The screen owns what the actions do.
 */
export type SectionAction = "rename" | "addSub" | "addHere" | "catalogHere" | "delete";

export interface SectionApi {
  toggle: (id: string) => void;
  action: (id: string, a: SectionAction) => void;
  /** the new title of the section; empty — it stays as it was */
  rename: (id: string, title: string) => void;
}

export interface SectionHeaderProps {
  section: EstimateSection;
  depth: 0 | 1;
  /** the words shown: the person's title, a kind's name from the dictionary, or «Без названия» */
  title: string;
  total: string;
  lineCount: number;
  collapsed: boolean;
  renaming: boolean;
  /** a signed estimate: the heading can be folded, nothing else (no «⋯», no rename) */
  locked?: boolean;
  api: SectionApi;
}

function SectionHeaderView(p: SectionHeaderProps) {
  const { t } = useI18n();
  const { c } = useTheme();
  const s = p.section;
  const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [draft, setDraft] = useState(s.title ?? "");
  const moreRef = useRef<ComponentRef<typeof View>>(null);
  const rootRef = useRef<ComponentRef<typeof View>>(null);
  const scroll = useScreenScroll();
  const [ready, setReady] = useState(false);
  // opening the rename: the draft is the title as it stands now (not as it was when the heading first drew), the heading is
  // brought into view FIRST and the field is made after (a field that takes the focus out of sight makes the browser scroll,
  // and the scroll closes the keyboard and the field — #1241)
  useEffect(() => {
    if (!p.renaming) return void setReady(false);
    setDraft(s.title ?? "");
    const node = rootRef.current;
    if (!node || !scroll) return void setReady(true);
    let live = true;
    scroll.scrollToNode(node, space[8], false, () => live && setReady(true));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.renaming]);
  const isModule = s.kind === "module";
  const items: MenuItem<SectionAction>[] = [
    { key: "rename", label: t("est.sec.rename"), icon: "pencil", testID: `est-sec-act-rename-${s.id}` },
    ...(isModule ? [] : ([
      ...(p.depth === 0 ? [{ key: "addSub" as const, label: t("est.sec.addSub"), icon: "plus" as const, testID: `est-sec-act-addSub-${s.id}` }] : []),
      { key: "addHere" as const, label: t("est.sec.addHere"), icon: "plus" as const, testID: `est-sec-act-addHere-${s.id}` },
      { key: "catalogHere" as const, label: t("est.sec.catalogHere"), icon: "search" as const, testID: `est-sec-act-catalogHere-${s.id}` },
    ] as MenuItem<SectionAction>[])),
    { key: "delete", label: t("est.sec.delete"), icon: "trash", destructive: true, testID: `est-sec-act-delete-${s.id}` },
  ];
  const commit = () => p.api.rename(s.id, draft);
  return (
    <View ref={rootRef} collapsable={false} testID={`est-section-${s.id}`} style={{ paddingLeft: p.depth === 1 ? space[4] : 0, paddingVertical: space[1] }} accessibilityRole="header">
      <RowView style={{ minHeight: size.rowMin }}>
        {p.renaming && ready ? (
          <View style={{ flex: 1, gap: space[1] }}>
            <TextField type="title" value={draft} onChangeText={setDraft} placeholder={t("est.sec.nameLabel")} label={t("est.sec.nameLabel")} autoFocus selectOnFocus onSubmit={commit} onBlurText={commit} testID={`est-sec-name-${s.id}`} />
            <T v="caption" tone="mut">
              {t("est.sec.nameHint")}
            </T>
          </View>
        ) : (
          <Press onPress={() => p.api.toggle(s.id)} visibleHeight={size.rowMin} accessibilityRole="button" accessibilityLabel={t("est.sec.toggle")} accessibilityState={{ expanded: !p.collapsed }} containerStyle={{ flex: 1 }} testID={`est-sec-toggle-${s.id}`}>
            <RowView style={{ minHeight: size.rowMin }}>
              <Icon name={p.collapsed ? "chevronRight" : "chevronDown"} s={size.iconSm} color={c.mut} />
              <View style={{ flex: 1 }}>
                <T v="body" w="semibold" numberOfLines={1}>
                  {p.title}
                </T>
                {p.collapsed ? (
                  <T v="caption" tone="mut" numberOfLines={1}>
                    {t("est.sec.count", { n: p.lineCount })}
                  </T>
                ) : null}
              </View>
              <T v="body" tabular w="semibold">
                {p.total}
              </T>
            </RowView>
          </Press>
        )}
        {p.locked ? null : (
          <View ref={moreRef} collapsable={false} testID={`est-sec-menu-${s.id}`}>
            <IconButton icon="more" label={t("est.sec.menu")} onPress={() => moreRef.current?.measureInWindow((x: number, y: number, w: number, h: number) => setAnchor({ x, y, w, h }))} />
          </View>
        )}
      </RowView>
      <Menu visible={!!anchor} anchor={anchor} items={items} onSelect={(a) => p.api.action(s.id, a)} onClose={() => setAnchor(null)} />
    </View>
  );
}

export const SectionHeader = memo(SectionHeaderView);
