import { View } from "react-native";
import { component, radius, size, space, statusIcon, type StatusName } from "@octo/design-tokens";
import { useDevice, useTheme } from "@/theme/ThemeProvider";
import { Button, IconButton } from "./controls";
import { Icon, T } from "./primitives";

/**
 * A screen's state (DS Б9, §15.3; #957, #1426): «Модуль не подключён — только просмотр», «Нет в прайсе: 24». Not the result
 * of an action (that is a toast) and not a chip on every card: one state — one banner, under the header, over the content.
 * The tone's icon + the words (rule 2), a title, an optional hint, at most one action (secondary); «✕» only on `info`.
 * The order of urgency across banners (Н-62) is not here yet: a screen shows the one it needs.
 */
export function Banner({
  tone,
  title,
  hint,
  action,
  onClose,
  closeLabel,
  testID,
}: {
  tone: Exclude<StatusName, "neutral">;
  title: string;
  hint?: string;
  /** the one thing to do about it */
  action?: { label: string; onPress: () => void };
  /** only an info banner may be closed (§15.3) */
  onClose?: () => void;
  closeLabel?: string;
  testID?: string;
}) {
  const { c } = useTheme();
  const { device } = useDevice();
  const side = device !== "phone";
  const btn = action ? (
    <View testID={testID ? `${testID}-action` : undefined} style={side ? undefined : { alignSelf: "flex-start" }}>
      <Button label={action.label} variant="secondary" size="sm" onPress={action.onPress} />
    </View>
  ) : null;
  return (
    <View
      testID={testID}
      accessibilityRole="summary"
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: space[3],
        padding: space[3],
        borderRadius: radius.inner,
        borderWidth: component.hairline,
        borderColor: c.status[tone].fill,
        backgroundColor: c.surf,
      }}
    >
      <View testID={testID ? `${testID}-icon` : undefined}>
        <Icon name={statusIcon[tone]} s={size.iconMd} color={c.status[tone].text} />
      </View>
      <View style={{ flex: 1, gap: space[1] }}>
        <T v="body" w="semibold">
          {title}
        </T>
        {hint ? (
          <T v="caption" tone="mut">
            {hint}
          </T>
        ) : null}
        {btn && !side ? <View style={{ paddingTop: space[1] }}>{btn}</View> : null}
      </View>
      {btn && side ? <View style={{ alignSelf: "center" }}>{btn}</View> : null}
      {tone === "info" && onClose ? <IconButton icon="close" label={closeLabel ?? title} onPress={onClose} /> : null}
    </View>
  );
}
