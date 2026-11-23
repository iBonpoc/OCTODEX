import { View } from "react-native";
import { component, radius, space } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * A dashed frame laid over a row that is left out of what the client sees (DS §8.3: a hidden estimate line; founder 23.11 — audit
 * MAP §12 п.6: «пунктирная рамка вокруг всей позиции + глаз перечёркнут + „Скрыто от клиента“, текст бледнее»). Not a status colour:
 * `bdField` dashes, `selectedBorder` wide, `radius.inner` corners, inset `space[1]` from the row's edge (inside the group card's own
 * corners). It never takes a press. Always with the row's own word «Скрыто от клиента» and the crossed eye — the frame alone says
 * nothing to a screen reader.
 */
export function DashedFrame({ testID }: { testID?: string }) {
  const { c } = useTheme();
  return (
    <View
      testID={testID}
      pointerEvents="none"
      style={{ position: "absolute", left: space[1], right: space[1], top: space[1], bottom: space[1], borderRadius: radius.inner, borderWidth: component.selectedBorder, borderStyle: "dashed", borderColor: c.bdField }}
    />
  );
}
