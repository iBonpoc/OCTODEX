import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { Button } from "./controls";
import { T } from "./primitives";

/**
 * The unsaved-changes question (DS Б1, Б3; §7.3): the heading, a line, and the answers in a column — the safe one on top.
 * `words="default"` — every sheet: «Сохранить» (`primary`, only with `onSave`), «Не сохранять» (the red word), «Отмена».
 * `words="back"` — the property windows of a trade module (DS §7.3 exception, #1857/#1858): «Сохранить» (`primary`),
 * «Не сохранять» (`ghost`), «Назад»; each visible 44 (`size="bar"`, as the pinned action bar).
 * Drawn by `Sheet` (its `dirty` question) and by `UnsavedDialog` (a window of a module that is not a Sheet, 820+).
 */
export function UnsavedAsk({
  onSave,
  onDiscard,
  onBack,
  text,
  words = "default",
}: {
  onSave?: () => void;
  onDiscard: () => void;
  onBack: () => void;
  /** the line under the heading (default «Вы что-то изменили в этом окне.») */
  text?: string;
  words?: "default" | "back";
}) {
  const { t } = useI18n();
  const back = words === "back";
  const size = back ? "bar" : "phone";
  return (
    <View style={{ gap: space[3] }} accessibilityLiveRegion="polite" testID="unsaved-ask">
      <T v="heading">{t("sheet.unsavedTitle")}</T>
      <T v="body" tone="mut">
        {text ?? t("sheet.unsavedText")}
      </T>
      {onSave ? <Button testID="unsaved-save" label={t("ue.save")} size={size} full onPress={onSave} /> : null}
      <Button
        testID="unsaved-discard"
        label={t("sheet.discard")}
        variant={back ? "ghost" : "secondary"}
        tone={back ? undefined : "bad"}
        size={size}
        full
        onPress={onDiscard}
      />
      <Button testID="unsaved-back" label={back ? t("common.back") : t("common.cancel")} variant="ghost" size={size} full onPress={onBack} />
    </View>
  );
}
