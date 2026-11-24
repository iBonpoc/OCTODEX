/**
 * #1669 (continuing #1633): the person was REMOVED from a company (the server confirmed it) and changes made there are still on
 * this phone — the server accepts none of them now. A sheet at the start, whether or not the person has another company (the
 * closed-company card, features/ClosedCompany.tsx, is only for a person with none). It says how many; «Оставить» closes it
 * (they stay on the phone, it comes back next start), «Убрать…» asks first (rule 5: they cannot come back) and then drops
 * them (store.dropUnsentIn). Not over sign-in, the company setup, the client page and the legal texts.
 */
import { useState } from "react";
import { usePathname } from "expo-router";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { useAuth } from "@/cloud/auth";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { Button } from "@/ui/controls";
import { useHeldSheet } from "@/ui/heldSheet";
import { Sheet, useToast } from "@/ui/overlays";
import { T } from "@/ui/primitives";

const QUIET = /^\/(auth|p|f|legal)(\/|$)/;

export function RemovedCompanyNotice() {
  const auth = useAuth();
  const { t } = useI18n();
  const { unsentRemoved, dropUnsentIn } = useStore();
  const toast = useToast();
  const path = usePathname();
  // told this run (kept on the phone): not again until the next start
  const [later, setLater] = useState<string[]>([]);
  const [sure, setSure] = useState(false);
  // one of them is being sent right now: nothing removed
  const [busy, setBusy] = useState(false);
  const open = !!auth.session && auth.legal !== "first" && auth.legal !== "changed" && !QUIET.test(path);
  const next = open ? unsentRemoved.find((r) => !later.includes(r.companyId)) : undefined;
  const held = useHeldSheet(next ?? null);
  const shown = held.value;
  if (!shown) return null;
  const keep = () => {
    setSure(false);
    setBusy(false);
    setLater((l) => [...l, shown.companyId]);
  };
  const drop = () => {
    const ok = dropUnsentIn(shown.companyId);
    setSure(false);
    setBusy(!ok);
    if (ok) toast.show(t("rm.dropped"));
  };
  return (
    <Sheet visible={held.visible} onExited={held.onExited} onClose={keep} title={t("rm.title")}>
      <View testID="removed-notice" key={held.opening} style={{ gap: space[3] }}>
        <View testID={`removed-unsent-${shown.companyId}`}>
          <T v="body">{t("rm.text", { n: shown.n })}</T>
        </View>
        {busy ? <T v="caption">{t("sync.stuck.busy")}</T> : null}
        {!sure ? (
          <>
            <Button testID="removed-keep" label={t("rm.keep")} variant="primary" full onPress={keep} />
            <Button testID="removed-drop" label={t("rm.drop")} icon="trash" variant="secondary" full onPress={() => (setBusy(false), setSure(true))} />
          </>
        ) : (
          <>
            <T v="body" w="semibold">
              {t("rm.sure", { n: shown.n })}
            </T>
            <Button testID="removed-drop-yes" label={t("rm.yes")} icon="trash" variant="secondary" full onPress={drop} />
            <Button testID="removed-drop-no" label={t("rm.no")} variant="ghost" full onPress={() => setSure(false)} />
          </>
        )}
      </View>
    </Sheet>
  );
}
