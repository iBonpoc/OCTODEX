import { useEffect, useRef } from "react";
import { AccessibilityInfo, Platform, View } from "react-native";
import { component, radius, size, space, statusIcon, type StatusName } from "@octo/design-tokens";
import { useDevice, useTheme } from "@/theme/ThemeProvider";
import { useI18n } from "@/i18n";
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
  /** the «✕»'s name for the screen reader; «Скрыть» by default */
  closeLabel?: string;
  testID?: string;
}) {
  const { c } = useTheme();
  const { device } = useDevice();
  const { t } = useI18n();
  const side = device !== "phone";
  // the tone is said, not only drawn (rule 2 for the screen reader): «Предупреждение. Модуль не подключён…»
  const toneWord = t(`ui.banner.tone.${tone}`);
  // a change of the screen's state is said once (Б9): VoiceOver / TalkBack hear it; the web reads the live region
  const said = useRef(title);
  useEffect(() => {
    if (said.current === title) return;
    said.current = title;
    if (Platform.OS !== "web") AccessibilityInfo.announceForAccessibility(`${toneWord}. ${title}`);
  }, [title, toneWord]);
  const btn = action ? (
    <View testID={testID ? `${testID}-action` : undefined} style={side ? undefined : { alignSelf: "flex-start" }}>
      {/* rule 3: 36 on the phone, 28 from 820 */}
      <Button label={action.label} variant="secondary" size={side ? "sm" : "phone"} onPress={action.onPress} />
    </View>
  ) : null;
  return (
    <View
      testID={testID}
      accessibilityRole="summary"
      accessibilityLiveRegion="polite"
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
        {/* the tone's word for the screen reader only: kept in the layout but clipped to a hairline */}
        <View style={{ position: "absolute", width: component.hairline, height: component.hairline, overflow: "hidden" }}>
          <T v="caption">{toneWord}</T>
        </View>
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
      {tone === "info" && onClose ? (
        <View testID={testID ? `${testID}-close` : undefined} style={side ? { alignSelf: "center" } : undefined}>
          <IconButton icon="close" tone="plain" label={closeLabel ?? t("ui.banner.close")} onPress={onClose} />
        </View>
      ) : null}
    </View>
  );
}
