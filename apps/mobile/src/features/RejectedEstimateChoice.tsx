/**
 * #2657: «Клиент подписал смету {дата}. Ваши правки: Сделать копию · Сбросить» — one hook for both places a refused
 * «клиент подписал, пока ждали сети» shows (the card in «Профиль и аккаунт» and in «Требует внимания»). Only the store's methods
 * (#2659): the copy opens the editor of the new draft; «Сбросить» takes the card away; both with the toast's «Вернуть» (rule 5).
 * What each press does — features/signedMeanwhileModel.ts (pure, unit-tested).
 */
import type { ReactNode } from "react";
import { router, type Href } from "expo-router";
import { useStore } from "@/data/store";
import type { RejectedOp } from "@/data/outboxRejected";
import { canMakeEstimateAt } from "@/features/access";
import { useI18n } from "@/i18n";
import { useConfirm } from "@/ui/confirmDialog";
import { useToast } from "@/ui/overlays";
import { canChooseSignedMeanwhile, runSignedMeanwhileChoice, signedMeanwhileAsk } from "./signedMeanwhileModel";

export function useRejectedEstimateChoice(): { dialog: ReactNode; can: (r: RejectedOp) => boolean; choose: (r: RejectedOp) => Promise<void> } {
  const { t, day } = useI18n();
  const store = useStore();
  const { db, copyRejectedEstimate, dismissRejected, online } = store;
  const toast = useToast();
  const [dialog, ask] = useConfirm();
  const who = { role: store.role, mode: store.mode, me: db.me };
  const can = (r: RejectedOp) => canChooseSignedMeanwhile(r, !!r.estimateEdit && canMakeEstimateAt(db, who, r.estimateEdit.propertyId));
  const choose = async (r: RejectedOp) => {
    // the day the client signed — from the estimate the card is about (href `/estimate/<id>`)
    const est = db.estimates.find((e) => r.href.endsWith(`/${e.id}`));
    const at = est?.approval?.at;
    const key = await ask(signedMeanwhileAsk((k, p) => t(k as never, p as never), at ? day(at) : ""));
    runSignedMeanwhileChoice(key, r, {
      copyRejectedEstimate,
      dismissRejected,
      toast: (text, undo) => toast.show(text, undo),
      open: (id) => router.push(`/estimate/new?id=${id}` as Href),
      online,
      t: (k) => t(k as never),
    });
  };
  return { dialog, can, choose };
}
