/**
 * #1662 (audit decision 15.11): signing out with something the phone alone has asks first — «Не отправлено: N». N = the cloud's
 * unsent changes (the outbox) + my estimate drafts not saved (countUnsentDrafts: a draft that never reached an estimate is
 * unsent too). «Подождать» (the default) leaves the window and stays signed in: the changes go out by themselves when the
 * network is there, nothing is erased; «Выйти и стереть» signs out and takes my drafts with the rest of the company's data
 * (signOut({ wipeDrafts: true })). Nothing unsent — the plain sign-out, no window. Nothing is erased without this choice.
 */
import { useState } from "react";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { useAuth } from "@/cloud/auth";
import { countUnsentDrafts } from "@/cloud/signOutWipe";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { Button } from "@/ui/controls";
import { Sheet } from "@/ui/overlays";
import { T } from "@/ui/primitives";

export function useSignOutAsk(): { ask: () => void; sheet: React.ReactNode } {
  const auth = useAuth();
  const { t } = useI18n();
  const { db, unsentAll } = useStore();
  const [n, setN] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const ask = () => {
    const me = auth.userId;
    void (async () => {
      const drafts = me ? await countUnsentDrafts(me, undefined, undefined, (id) => db.estimates.some((e) => e.id === id)) : 0;
      const total = unsentAll + drafts;
      if (total === 0) return void auth.signOut();
      setN(total);
      setOpen(true);
    })();
  };
  const sheet = (
    <Sheet visible={open} onClose={() => setOpen(false)} title={t("signout.title", { n: n ?? 0 })}>
      <View testID="signout-ask" style={{ gap: space[3] }}>
        <T v="body" tone="mut">
          {t("signout.text")}
        </T>
        <Button testID="signout-wait" label={t("signout.wait")} icon="clock" variant="primary" full onPress={() => setOpen(false)} />
        <Button
          testID="signout-wipe"
          label={t("signout.wipe")}
          variant="secondary"
          full
          onPress={() => {
            setOpen(false);
            void auth.signOut({ wipeDrafts: true });
          }}
        />
      </View>
    </Sheet>
  );
  return { ask, sheet };
}
