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
import { Button, IconButton } from "./controls";
import { RowView } from "./surfaces";
import { T } from "./primitives";

export function ListPanel({ title, onOpen, onClose, children }: { title: string; onOpen: () => void; onClose: () => void; children: ReactNode }) {
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
        {children}
      </ScrollView>
    </View>
  );
}
