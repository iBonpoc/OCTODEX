import { memo, useEffect, useState } from "react";
import { View } from "react-native";
import { size, space } from "@octo/design-tokens";
import type { EstimateSection } from "@octo/estimating-engine";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { IconButton, TextField } from "@/ui/controls";
import { Menu, type MenuItem } from "@/ui/overlays";
import { Icon, Press, T, type IconKey } from "@/ui/primitives";
import { useScreenScroll } from "@/ui/requiredForm";
import { RowView } from "@/ui/surfaces";
import { GroupHead } from "@/ui/groupedList";
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
  /** #2363: a group title over its card keeps a gap above it (not the first row) */
  gapAbove?: boolean;
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
  // #2403 (CRM map С8): what is added here first, then the section itself, the delete last — it keeps the lines (the label says so)
  const items: MenuItem<SectionAction>[] = [
    { key: "rename", label: t("est.sec.rename"), icon: "pencil", testID: `est-sec-act-rename-${s.id}` },
    ...(!isModule && p.depth === 0 ? [{ key: "addSub" as const, label: t("est.sec.addSub"), icon: "sections" as const, testID: `est-sec-act-addSub-${s.id}` }] : []),
    // «Удалить раздел» — red, the last, with the line that the lines stay (mock #2403)
    { key: "delete", label: t("m2403.secDelete"), hint: t("m2403.secKeep"), icon: "trash", destructive: true, group: true, testID: `est-sec-act-delete-${s.id}` },
  ];
  const commit = () => p.api.rename(s.id, draft);
  return (
    // #2363 (founder 21.11: «разделители групп некрасиво, непонятно»; both design reviews): a top section is the TITLE OVER its card —
    // no band: the chevron, the kind's icon, the word and «· N» on the left, «⋯», the group's sum on the right in the column of the lines' sums
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
          // #2387: the same title as every group of the app (GroupHead): «˅», the kind's icon, the word 17/700 and its CountPill;
          // the group's sum 17/700 on the right in the column of the lines' sums; «⋯» a quiet icon over the lines' trash
          <View style={{ flex: 1, minWidth: 0 }}>
            <GroupHead
              title={p.title}
              icon={p.depth === 0 && s.kind ? KIND_ICON[s.kind] : undefined}
              // founder 21.11 («двоечка наезжает на цифру»): the count only on a folded group (DS §8.5) — an open one shows its lines
              count={p.collapsed ? p.lineCount : undefined}
              value={p.total}
              fold={{ open: !p.collapsed, onToggle: () => p.api.toggle(s.id), label: t("est.sec.toggle"), testID: `est-sec-toggle-${s.id}` }}
              actions={p.locked ? null : (
                // in the column of the lines' trash: by the «⠿» at the right edge, `space[6]` away from the sum
                <View ref={moreRef} collapsable={false} testID={`est-sec-menu-${s.id}`} style={{ marginLeft: space[6], width: size.hitMin, alignItems: "center" }}>
                  <IconButton bare icon="more" label={t("est.sec.menu")} onPress={() => moreRef.current?.measureInWindow((x: number, y: number, w: number, h: number) => setAnchor({ x, y, w, h }))} />
                </View>
              )}
            />
          </View>
        )}
      </RowView>
      <Menu visible={!!anchor} anchor={anchor} items={items} onSelect={(a) => p.api.action(s.id, a)} onClose={() => setAnchor(null)} />
    </View>
  );
}

/** the kind's own icon on a kind section's band (DS §8.5) */
const KIND_ICON: Partial<Record<string, IconKey>> = { material: "box", labor: "wrench", service: "toolbox" };

export const SectionHeader = memo(SectionHeaderView);
