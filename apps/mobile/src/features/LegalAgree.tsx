import { View } from "react-native";
import { router } from "expo-router";
import { component, size, space } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon, Press, T } from "@/ui/primitives";
import { legalHref } from "./legal";

/**
 * The clickwrap tick (7а-1; docs/legal/01 §3.5, Berman v. Freedom Financial): an empty box, the words say that ticking it
 * is the agreement, the documents are visible underlined links. Only the box toggles (a tap on a link opens the
 * document, it does not tick). Local here until a shared Checkbox exists in src/ui (docs/specs/19 §5.5 q.3).
 */
export function LegalAgree({ on, onChange, testID = "legal-agree" }: { on: boolean; onChange: (v: boolean) => void; testID?: string }) {
  const { t } = useI18n();
  const { c } = useTheme();
  // a document link inside the sentence: a visible underlined word, its own tap (it does not tick the box)
  const link = (doc: "terms" | "privacy", label: string) => (
    <Press testID={`${testID}-${doc}`} onPress={() => router.push(legalHref(doc))} visibleHeight={component.checkbox.size} accessibilityRole="link" accessibilityLabel={label}>
      <T v="caption" w="semibold" style={{ textDecorationLine: "underline" }}>
        {label}
      </T>
    </Press>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space[2] }}>
      <Press
        testID={testID}
        onPress={() => onChange(!on)}
        visibleHeight={component.checkbox.size}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: on }}
        accessibilityLabel={t("legal.agree.a11y")}
        {...({ "aria-checked": on } as object)}
        style={{ alignItems: "center", justifyContent: "center" }}
      >
        <View
          style={{
            width: component.checkbox.size,
            height: component.checkbox.size,
            borderRadius: component.checkbox.radius,
            borderWidth: component.checkbox.border,
            borderColor: on ? c.acc : c.mut,
            backgroundColor: on ? c.acc : "transparent",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {on ? <Icon name="check" s={size.iconSm} color={c.onAcc} /> : null}
        </View>
      </Press>
      <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: space[1] }}>
        <T v="caption">{t("legal.agree.pre")}</T>
        {link("terms", t("legal.terms.title"))}
        <T v="caption">{t("legal.agree.and")}</T>
        {link("privacy", t("legal.privacy.title"))}
      </View>
    </View>
  );
}
