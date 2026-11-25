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
export function LegalAgree({
  on,
  onChange,
  error = false,
  testID = "legal-agree",
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  /** a main button was pressed without the tick: the box is framed `status.bad` (DS §11 п.3) */
  error?: boolean;
  testID?: string;
}) {
  const { t } = useI18n();
  const { c } = useTheme();
  // a document link: a visible underlined word, its own tap (it does not tick the box)
  const link = (doc: "terms" | "privacy", label: string, full: string) => (
    <Press testID={`${testID}-${doc}`} onPress={() => router.push(legalHref(doc))} visibleHeight={component.checkbox.size} accessibilityRole="link" accessibilityLabel={full}>
      <T v="caption" w="semibold" style={{ textDecorationLine: "underline" }}>
        {label}
      </T>
    </Press>
  );
  return (
    // space[6] between the sentence and the links: the tick's and the links' 44-high touch boxes (11 px over and under
    // their 22-px marks) never meet (review PR-1)
    <View style={{ gap: space[6] }}>
      {/* the box AND the sentence toggle (as a <label> on the web, as in iOS) — the sentence names both documents in
          full (clickwrap); the links stand on their own line, apart: their touch boxes never overlap (DS §17 п.6) */}
      <Press
        testID={testID}
        onPress={() => onChange(!on)}
        visibleHeight={component.checkbox.size}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: on }}
        accessibilityLabel={t("legal.agree.a11y")}
        {...({ "aria-checked": on } as object)}
        style={{ flexDirection: "row", alignItems: "flex-start", gap: space[2] }}
      >
        <View
          style={{
            width: component.checkbox.size,
            height: component.checkbox.size,
            borderRadius: component.checkbox.radius,
            borderWidth: component.checkbox.border,
            borderColor: on ? c.acc : error ? c.status.bad.fill : c.mut,
            backgroundColor: on ? c.acc : "transparent",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {on ? <Icon name="check" s={size.iconSm} color={c.onAcc} /> : null}
        </View>
        <View style={{ flex: 1 }}>
          <T v="caption">{t("legal.agree.a11y")}</T>
        </View>
      </Press>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[4], paddingLeft: component.checkbox.size + space[2] }}>
        {link("terms", t("legal.agree.termsLink"), t("legal.terms.title"))}
        {link("privacy", t("legal.agree.privacyLink"), t("legal.privacy.title"))}
      </View>
    </View>
  );
}
