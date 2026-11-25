/**
 * #2657 (хвост #2478, спека 65 §3.5, С7): the window over a refused «клиент подписал, пока правки ждали сети» — pure, no React.
 * The signature stays; the edits wait as a card: «Сделать копию» (a new draft, store.copyRejectedEstimate) or «Сбросить»
 * (store.dismissRejected, the toast's «Вернуть» puts it back). A ConfirmDialog (DS Б3), the step chosen on purpose is `primary`.
 */
import type { ConfirmAsk } from "@/ui/confirmLayout";
import type { RejectedOp } from "@/data/outboxRejected";
import { withAfter, type GuardedUndo } from "@/data/undo";

export const SIGNED_MEANWHILE_KEYS = { copy: "copy", reset: "reset", later: "later" } as const;

/** the window is for a refused save that kept its edits; «Не подписывать — изменить» (estimate.reopen) has none to copy.
 *  `mayMake`: the person may make an estimate at that place (a tech — only where assigned): else a copy would be refused by the
 *  store and the edits lost — no window then, the card keeps only «Сбросить» (#2674 Б2) */
export const canChooseSignedMeanwhile = (r: RejectedOp, mayMake: boolean): boolean => r.reason === "estimate_signed_meanwhile" && !!r.estimateEdit && mayMake;


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

type Toast = (text: string, undo?: GuardedUndo) => void;
export interface ChoiceDeps {
  copyRejectedEstimate: (rejectedId: string) => { estimateId: string; undo: GuardedUndo } | null;
  dismissRejected: (rejectedId: string) => GuardedUndo;
  toast: Toast;
  /** the editor of the new draft */
  open: (estimateId: string) => void;
  /** closes the editor of the copy (its «Вернуть» removed the draft it shows, #2674 Б1) */
  back: () => void;
  online: boolean;
  t: (key: string) => string;
}

/** what a press in the window does (pure, unit-tested). «Позже» (or the way back) — nothing. */
export function runSignedMeanwhileChoice(key: string | null, r: RejectedOp, d: ChoiceDeps): void {
  if (key === SIGNED_MEANWHILE_KEYS.copy) {
    const made = d.copyRejectedEstimate(r.id);
    // the store made nothing (no right here, no edits): no «copy is ready» and no empty editor
    if (!made) return;
    // «Вернуть» takes the draft away — the editor that shows it goes too, else its «Сохранить» would make it again
    d.toast(d.online ? d.t("est.rej.choice.copied") : d.t("offline.queued"), withAfter(made.undo, d.back));
    d.open(made.estimateId);
  } else if (key === SIGNED_MEANWHILE_KEYS.reset) {
    d.toast(d.t("est.rej.choice.resetDone"), d.dismissRejected(r.id));
  }
}
