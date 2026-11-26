/**
 * #2657: «Клиент подписал смету {дата}. Ваши правки: Сделать копию · Сбросить» — one hook for both places a refused
 * «клиент подписал, пока ждали сети» shows (the card in «Профиль и аккаунт» and in «Требует внимания»). Only the store's methods
 * (#2659): the copy opens the editor of the new draft (a toast without «Вернуть»: it destroys nothing — director's call D, #2674); «Сбросить»
 * takes the card away, with the toast's «Вернуть» (rule 5: the edits are lost).
 * What each press does — features/signedMeanwhileModel.ts (pure, unit-tested). One hook (one window) per screen (#2715 М3).
 */
import { useRef, type ReactNode } from "react";
import { router, type Href } from "expo-router";
import { useStore } from "@/data/store";
import type { RejectedOp } from "@/data/outboxRejected";
import { canCopyRejectedEstimate } from "@/features/access";
import { useI18n } from "@/i18n";
import { useToast } from "@/ui/overlays";
import { canChooseSignedMeanwhile, runSignedMeanwhileChoice, SIGNED_MEANWHILE_KEYS, type ChoiceDeps } from "./signedMeanwhileModel";

export function useRejectedEstimateChoice(): { dialog: ReactNode; can: (r: RejectedOp) => boolean; mayCopy: (r: RejectedOp) => boolean; choose: (r: RejectedOp) => Promise<void> } {
  const { t } = useI18n();
  const store = useStore();
  const { db, copyRejectedEstimate, dismissRejected, online } = store;
  const toast = useToast();
  const dialog = null;
  const who = { role: store.role, mode: store.mode, me: db.me };
  const mayCopy = (r: RejectedOp) => !r.estimateEdit || canCopyRejectedEstimate(db, who, r.estimateEdit.propertyId);
  const can = (r: RejectedOp) => canChooseSignedMeanwhile(r, mayCopy(r));
  // #2715 М4: what the answer acts on is read after it (the latest render), not from the render that opened the window
  const latest = useRef<() => ChoiceDeps>(() => null as never);
  latest.current = () => ({
    copyRejectedEstimate,
    dismissRejected,
    toast: (text, undo) => toast.show(text, undo),
    open: (id) => router.push(`/estimate/new?id=${id}` as Href),
    online,
    t: (k, p) => t(k as never, p as never),
  });
  // PROTO #2822 вариант А: one press — the copy at once and its editor; no window (the card already says what and why)
  const choose = async (r: RejectedOp) => {
    const est = db.estimates.find((e) => r.href.endsWith(`/${e.id}`));
    runSignedMeanwhileChoice(SIGNED_MEANWHILE_KEYS.copy, r, { ...latest.current(), signedNumber: est?.number });
  };
  return { dialog, can, mayCopy, choose };
}
