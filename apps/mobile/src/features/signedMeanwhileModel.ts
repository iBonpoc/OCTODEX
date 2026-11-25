/**
 * #2657 (хвост #2478, спека 65 §3.5, С7): the window over a refused «клиент подписал, пока правки ждали сети» — pure, no React.
 * The signature stays; the edits wait as a card: «Сделать копию» (a new draft, store.copyRejectedEstimate) or «Сбросить»
 * (store.dismissRejected, the toast's «Вернуть» puts it back). A ConfirmDialog (DS Б3), the step chosen on purpose is `primary`.
 */
import type { ConfirmAsk } from "@/ui/confirmLayout";
import type { RejectedOp } from "@/data/outboxRejected";

export const SIGNED_MEANWHILE_KEYS = { copy: "copy", reset: "reset", later: "later" } as const;

/** the window is for a refused save that kept its edits; «Не подписывать — изменить» (estimate.reopen) has none to copy */
export const canChooseSignedMeanwhile = (r: RejectedOp): boolean => r.reason === "estimate_signed_meanwhile" && !!r.estimateEdit;


/** the question; `signedOn` is the day the client signed (formatted by the caller; none known — the title says it without a day) */
export function signedMeanwhileAsk(t: (key: string, params?: Record<string, unknown>) => string, signedOn: string): ConfirmAsk {
  return {
    testID: "rej-choice",
    title: signedOn ? t("est.rej.choice.title", { date: signedOn }) : t("est.rej.choice.titleNoDate"),
    text: t("est.rej.choice.text"),
    actions: [
      { key: SIGNED_MEANWHILE_KEYS.copy, label: t("est.rej.choice.copy"), tone: "primary", testID: "rej-choice-copy" },
      { key: SIGNED_MEANWHILE_KEYS.reset, label: t("est.rej.choice.reset"), testID: "rej-choice-reset" },
      { key: SIGNED_MEANWHILE_KEYS.later, label: t("est.rej.choice.later"), tone: "cancel", testID: "rej-choice-later" },
    ],
  };
}
