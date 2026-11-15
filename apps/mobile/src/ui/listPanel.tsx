/**
 * The open card beside a list on 1280 (docs/specs/06-list-cards.md «Панель 1280»; navigation — nav/listPanel.ts).
 * Width `panelW`, its own scroll, a hairline on the left. Header: the card's name, «⤢ Открыть» (the card on its own
 * screen) and «✕» (closes, as Esc). The body is the same component the card's own screen draws.
 */
import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { component, space } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { useI18n } from "@/i18n";
import { Button, IconButton, StatusChip } from "./controls";
import { RowView } from "./surfaces";
import { T } from "./primitives";
import { OneColumn } from "./listCard";

export function ListPanel({ title, subtitle, outside, actions, onOpen, onClose, children }: {
  title: string;
  subtitle?: string;
  /** the open card is not in the list now (another filter): a neutral mark under the header */
  outside?: boolean;
  /** the card screen's own header actions («Изменить», «＋»): a row under the title */
  actions?: ReactNode;
  onOpen: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const { c } = useTheme();
  const { t } = useI18n();
  return (
    <View testID="list-panel" role="complementary" aria-label={title} style={{ width: component.panelW, borderLeftWidth: component.hairline, borderLeftColor: c.bd }}>
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[3] }}>
        <RowView style={{ justifyContent: "space-between", gap: space[2] }}>
          <View style={{ flexShrink: 1 }}>
            <T v="title" numberOfLines={2}>
              {title}
            </T>
            {subtitle ? (
              <T v="body" tone="mut" numberOfLines={2}>
                {subtitle}
              </T>
            ) : null}
          </View>
          <RowView gap={space[1]} style={{ flexShrink: 0 }}>
            <View testID="list-panel-open">
              <Button label={t("card.panel.open")} icon="expand" variant="ghost" size="sm" onPress={onOpen} />
            </View>
            <View testID="list-panel-close">
              <IconButton icon="close" label={t("card.panel.close")} onPress={onClose} />
            </View>
          </RowView>
        </RowView>
        {/* the card screen's header actions: a row of their own under the title — 360 has no room beside it */}
        {actions ? (
          <View testID="list-panel-actions">
            <RowView gap={space[1]}>{actions}</RowView>
          </View>
        ) : null}
        {outside ? (
          <View testID="list-panel-outside" style={{ alignSelf: "flex-start" }}>
            <StatusChip status="neutral" label={t("card.panel.outside")} />
          </View>
        ) : null}
        {/* 360 is one column: a grid of cards inside never splits a line into letters (#1343 review) */}
        <OneColumn.Provider value={true}>{children}</OneColumn.Provider>
      </ScrollView>
    </View>
  );
}
