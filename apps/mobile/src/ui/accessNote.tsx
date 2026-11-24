import { View } from "react-native";
import { radius, size, space } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon, T } from "./primitives";
import { accessNoteSaid, accessNoteShown } from "./accessNoteRules";

/**
 * AccessNote — how to get to the object (BUILD-SPEC §1; the visit screen, the job's and the client's Обзор): ALWAYS the first line of
 * the content. Fill `status.warn.fill`, `radius.inner`, padding 12; on top «ключ» 20 and the label 12 semibold in capitals
 * `status.warn.text` («ДОСТУП»); the note 15 `ink`; the code 17 bold tabular («#4471»). A code not open yet (`locked`) is not drawn —
 * the line 13 `mut` says when it opens («Код откроется в день выезда»). A pinned note (`pinned`, «видят мастера») stands under it with
 * the pin. Nothing to say — nothing drawn (`accessNoteShown`). Not pressable: it is read, not done (the code is said digit by digit).
 * testIDs: `<testID>`, `-code`, `-locked`, `-pinned`.
 */
export function AccessNote({ label, text, code, codeWord, locked, pinned, testID }: {
  /** «Доступ» — the word on the fill (the colour never speaks alone, rule 2) */
  label: string;
  /** «Ворота сбоку, собака во дворе» */
  text?: string;
  /** «#4471» */
  code?: string;
  /** what the screen reader says before the code: «Код» */
  codeWord: string;
  /** the code is held back — why («Код откроется в день выезда»); the code itself is not drawn then */
  locked?: string;
  /** the pinned note of the object («📌 видят мастера»: its text) */
  pinned?: string;
  testID?: string;
}) {
  const { c } = useTheme();
  if (!accessNoteShown({ text, code, locked, pinned })) return null;
  const tone = c.status.warn;
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={accessNoteSaid(label, { text, code, locked, pinned }, codeWord)}
      style={{ backgroundColor: tone.fill, borderRadius: radius.inner, padding: space[3], gap: space[2] }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
        <Icon name="key" s={size.iconMd} color={tone.text} />
        <T v="micro" w="semibold" style={{ color: tone.text, textTransform: "uppercase", flex: 1 }} numberOfLines={1}>
          {label}
        </T>
      </View>
      {text ? <T v="body">{text}</T> : null}
      {locked ? (
        <View testID={testID ? `${testID}-locked` : undefined} style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
          <Icon name="lock" s={size.iconSm} color={c.mut} />
          <T v="caption" tone="mut" style={{ flex: 1 }}>
            {locked}
          </T>
        </View>
      ) : code ? (
        <View testID={testID ? `${testID}-code` : undefined}>
          <T v="heading" w="bold" tabular>
            {code}
          </T>
        </View>
      ) : null}
      {pinned ? (
        <View testID={testID ? `${testID}-pinned` : undefined} style={{ flexDirection: "row", alignItems: "flex-start", gap: space[2] }}>
          <Icon name="pin" s={size.iconSm} color={c.ink} />
          <T v="caption" style={{ flex: 1 }}>
            {pinned}
          </T>
        </View>
      ) : null}
    </View>
  );
}
