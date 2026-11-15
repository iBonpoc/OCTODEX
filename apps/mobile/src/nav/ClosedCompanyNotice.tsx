/**
 * 7а-3 «в» (docs/specs/22 §3.6, founder 07.11): once per closed company, at the start, a sheet says why there is no
 * company — without it the person silently worked in the demo (store: no company → demo). Not over sign-in, the
 * company setup (it has the card itself), the client page and the legal texts.
 */
import { useHeldSheet } from "@/ui/heldSheet";
import { useEffect, useState } from "react";
import { usePathname } from "expo-router";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/cloud/auth";
import { CLOSED_SEEN_KEY, closedDay, parseSeen, unseenClosed } from "@/features/closedCompany";
import { useI18n } from "@/i18n";
import { Button } from "@/ui/controls";
import { Sheet } from "@/ui/overlays";
import { T } from "@/ui/primitives";

const QUIET = /^\/(auth|p|legal)(\/|$)/;

export function ClosedCompanyNotice() {
  const auth = useAuth();
  const { t } = useI18n();
  const path = usePathname();
  const [seen, setSeen] = useState<string[] | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(CLOSED_SEEN_KEY)
      .then((v) => setSeen(parseSeen(v)))
      .catch(() => setSeen([]));
  }, []);
  // the consent gate goes first (it covers the app while it asks)
  const open = !!auth.session && !auth.company && seen !== null && auth.legal !== "first" && auth.legal !== "changed" && !QUIET.test(path);
  const next = open ? unseenClosed(auth.closedCompanies, seen)[0] : undefined;
  const held = useHeldSheet(next ?? null);
  const shown = held.value;
  if (!shown) return null;
  const done = () => {
    const all = [...(seen ?? []), shown.companyId];
    setSeen(all);
    void AsyncStorage.setItem(CLOSED_SEEN_KEY, JSON.stringify(all)).catch(() => {});
  };
  return (
    <Sheet visible={held.visible} onExited={held.onExited} onClose={done} title={t("fr9.closed.title", { company: shown.name })}>
      <View testID="closed-notice" style={{ gap: space[3] }}>
        <T v="body" tone="mut">
          {t("fr9.closed.text", { date: closedDay(shown.closedAt) })}
        </T>
        <Button label={t("fr9.closed.ok")} variant="primary" full onPress={done} />
      </View>
    </Sheet>
  );
}
