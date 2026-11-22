/**
 * #1662 (audit decision 15.11): signing out with something the phone alone has asks first — «Не отправлено: N». N = the cloud's
 * unsent changes (the outbox) + my estimate drafts not saved (countUnsentDrafts: a draft that never reached an estimate is
 * unsent too): two lines (features/signOutAsk.ts). «Подождать» (the default) leaves the window and stays signed in, nothing is
 * erased; «Выйти и стереть» (drafts to erase) signs out and takes my drafts with the company's data (signOut({ wipeDrafts: true })),
 * with only the queue it is a plain «Выйти» (the queue stays on the phone). Nothing unsent — no window. Nothing is erased
 * without this choice.
 */
import { useState } from "react";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { useAuth } from "@/cloud/auth";
import { countUnsentDrafts } from "@/cloud/signOutWipe";
import { useStore } from "@/data/store";
import { draftsKey } from "@/features/estimateDraft";
import { signOutPlan, type SignOutPlan } from "@/features/signOutAsk";
import { useI18n } from "@/i18n";
import { Button } from "@/ui/controls";
import { Sheet } from "@/ui/overlays";
import { T } from "@/ui/primitives";

export function useSignOutAsk(): { ask: () => void; sheet: React.ReactNode } {
  const auth = useAuth();
  const { t } = useI18n();
  const { db, unsentAll, mode, companyLoaded } = useStore();
  const [plan, setPlan] = useState<SignOutPlan | null>(null);
  const [open, setOpen] = useState(false);
  const ask = () => {
    const me = auth.userId;
    void (async () => {
      // #2381 Ж1: an edit of an estimate gone from THIS company's loaded store is not asked about (it stays on the phone — never dropped without asking, rule 5; «Выйти и стереть» erases all as always)
      const here = draftsKey(mode === "cloud", auth.company?.companyId, me);
      const drafts = me ? await countUnsentDrafts(me, undefined, undefined, (id) => db.estimates.some((e) => e.id === id), (k, id) => companyLoaded && k === here && !db.estimates.some((e) => e.id === id)) : 0;
      const next = signOutPlan(unsentAll, drafts);
      if (!next.ask) return void auth.signOut();
      setPlan(next);
      setOpen(true);
    })();
  };
  const sheet = (
    <Sheet visible={open} onClose={() => setOpen(false)} title={t("signout.title")}>
      <View testID="signout-ask" style={{ gap: space[3] }}>
        {plan && plan.queue > 0 ? (
          <View testID="signout-queue">
            <T v="body">{t("signout.queue", { n: plan.queue })}</T>
          </View>
        ) : null}
        {plan && plan.drafts > 0 ? (
          <View testID="signout-drafts">
            <T v="body">{t("signout.drafts", { n: plan.drafts })}</T>
          </View>
        ) : null}
        <Button testID="signout-wait" label={t("signout.wait")} icon="clock" variant="primary" full onPress={() => setOpen(false)} />
        <Button
          testID="signout-exit"
          label={plan?.exit === "wipe" ? t("signout.wipe") : t("signout.leave")}
          variant="secondary"
          full
          onPress={() => {
            setOpen(false);
            void (plan?.exit === "wipe" ? auth.signOut({ wipeDrafts: true }) : auth.signOut());
          }}
        />
      </View>
    </Sheet>
  );
  return { ask, sheet };
}
