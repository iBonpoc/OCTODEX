/**
 * What «Компания → Модули» shows for one module (docs/specs/33-gutters-module.md П15.4 C2b): the status chip (icon + word,
 * rule 2) and the one main action. Founder О1–О2: «Подключить» the first time starts the 7-day trial; after it «Подключить»
 * is a payment — step «Оплаты», not yet: the button is off with «Оплата — скоро».
 */
import type { StatusName } from "@octo/design-tokens";
import type { DictKey } from "@/i18n";
import { moduleState, type CompanyModule } from "./registry";

export interface ModuleView {
  status: StatusName;
  label: DictKey;
  /** {n} of the label: days of the trial left */
  n?: number;
  /** start — the trial (module_enable); resume — on again, the trial still runs; pay — the trial is over (step «Оплаты») */
  main: "start" | "resume" | "pay" | null;
  /** «Отключить»: nothing is deleted, «Отменить» 5 s */
  canDisable: boolean;
  /** the trial is over and unpaid: drafts open, nothing is saved */
  locked: boolean;
}

export function moduleView(cm: CompanyModule | undefined, now = Date.now()): ModuleView {
  const st = moduleState(cm, now);
  switch (st.access) {
    case "trial":
      return { status: "info", label: "mod.st.trial", n: st.daysLeft, main: null, canDisable: true, locked: false };
    case "paid":
      return { status: "ok", label: "mod.st.paid", main: null, canDisable: true, locked: false };
    case "expired":
      return { status: "warn", label: "mod.st.expired", main: "pay", canDisable: true, locked: true };
    case "off": {
      if (!st.trialUsed) return { status: "neutral", label: "mod.st.off", main: "start", canDisable: false, locked: false };
      const paid = !!cm?.paidUntil && Date.parse(cm.paidUntil) > now;
      const trialLeft = !!cm?.trialEndsAt && Date.parse(cm.trialEndsAt) > now;
      return { status: "neutral", label: "mod.st.disabled", main: paid || trialLeft ? "resume" : "pay", canDisable: false, locked: false };
    }
  }
}
