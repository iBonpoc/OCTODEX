/**
 * #2657: «Клиент подписал версию от {дата}. Ваши правки: Сделать копию · Сбросить» — one hook for both places a refused
 * «клиент подписал, пока ждали сети» shows (the card in «Профиль и аккаунт» and in «Требует внимания»). Only the store's methods
 * (#2659): the copy opens the editor of the new draft; «Сбросить» takes the card away; both with the toast's «Вернуть» (rule 5).
 */
import type { ReactNode } from "react";
import { router, type Href } from "expo-router";
import { useStore } from "@/data/store";
import type { RejectedOp } from "@/data/outboxRejected";
import { useI18n } from "@/i18n";
import { useConfirm } from "@/ui/confirmDialog";
import { useToast } from "@/ui/overlays";
import { canChooseSignedMeanwhile, signedMeanwhileAsk, SIGNED_MEANWHILE_KEYS } from "./rejectedEstimateChoice";

export function useRejectedEstimateChoice(): { dialog: ReactNode; can: (r: RejectedOp) => boolean; choose: (r: RejectedOp) => Promise<void> } {
  const { t, day } = useI18n();
  const { db, copyRejectedEstimate, dismissRejected } = useStore();
  const toast = useToast();
  const [dialog, ask] = useConfirm();
  const choose = async (r: RejectedOp) => {
    // the day the client signed — from the estimate the card is about (href `/estimate/<id>`)
    const est = db.estimates.find((e) => r.href.endsWith(`/${e.id}`));
    const at = est?.approval?.at;
    const key = await ask(signedMeanwhileAsk((k, p) => t(k as never, p as never), at ? day(at) : ""));
    if (key === SIGNED_MEANWHILE_KEYS.copy) {
      const made = copyRejectedEstimate(r.id);
      if (!made) return;
      toast.show(t("est.rej.choice.copied"), made.undo);
      router.push(`/estimate/new?id=${made.estimateId}` as Href);
    } else if (key === SIGNED_MEANWHILE_KEYS.reset) {
      toast.show(t("sync.rejected.dismissed"), dismissRejected(r.id));
    }
  };
  return { dialog, can: canChooseSignedMeanwhile, choose };
}
