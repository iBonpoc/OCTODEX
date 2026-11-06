/**
 * «Первые шаги» on the owner's Главная (docs/specs/13 §3.11 п.2, 19 §2 п.2). Pure — unit-tested in test/firstSteps.test.ts.
 * Only what works (Apple 2.1): «Импорт клиентов» and «Оплаты онлайн» come with their screens; «Установить на телефон» — only
 * in the browser, and only while the app is not opened from the home screen.
 */
import type { DB, Role } from "@/data/types";
import type { DictKey } from "@/i18n";
import { stepDone } from "./companySetup";

export type FirstStepId = "profile" | "job" | "team" | "install";
export interface FirstStep {
  id: FirstStepId;
  label: DictKey;
  done: boolean;
  /** a screen to open; undefined = the card shows how (install) */
  href?: string;
}

export interface Where {
  /** running in a browser (react-native-web) */
  web: boolean;
  /** opened from the home screen (display-mode: standalone) */
  standalone: boolean;
}

/** the steps the owner sees; [] = the card is not shown */
export function firstSteps(db: DB, role: Role, where: Where): FirstStep[] {
  const c = db.company;
  if (role !== "director" || !c) return [];
  // the document header (S0): name, phone, license, logo
  const profile = stepDone(c, "profile", db.serviceCategories) && stepDone(c, "contacts") && stepDone(c, "licenses") && stepDone(c, "brand");
  const steps: FirstStep[] = [
    { id: "profile", label: "first.profile", done: profile, href: "/company/profile?wizard=1" },
    { id: "job", label: "first.job", done: db.jobs.length > 0, href: "/job/new" },
    { id: "team", label: "first.team", done: db.members.filter((m) => !m.pending).length > 1, href: "/team" },
  ];
  if (where.web) steps.push({ id: "install", label: "first.install", done: where.standalone });
  return steps;
}

/** the card disappears when everything is done (or the owner hid it) */
export const firstStepsLeft = (steps: FirstStep[]) => steps.filter((s) => !s.done).length;

/** «Чем вы занимаетесь?»: a preset matches the search anywhere in its name, any case; an empty search shows all */
export const tradeMatches = (label: string, q: string) => !q.trim() || label.toLowerCase().includes(q.trim().toLowerCase());

/** the directions to add: the picked presets in their order, then the own name («Другое») if any */
export function pickTrades(picked: readonly string[], own: string): { seedKey?: string; name?: string }[] {
  const out: { seedKey?: string; name?: string }[] = [...new Set(picked)].map((seedKey) => ({ seedKey }));
  if (own.trim()) out.push({ name: own.trim() });
  return out;
}
