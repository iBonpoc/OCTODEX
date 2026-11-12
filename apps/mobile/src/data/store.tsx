/**
 * App store. Two modes, same interface for every screen:
 *  - demo:  local test data (reseeded each day), nothing leaves the device;
 *  - cloud: signed in with a company — data comes from the OCTODEX database (src/cloud/repo.ts),
 *           every change is applied locally at once and sent through a persisted outbox (src/cloud/ops.ts).
 * Every mutation returns `undo` for the 5-second "Undo" toast (DS rule 10). In cloud mode an op is sent
 * only after that window, so Undo simply drops it from the outbox.
 */
import { applyRefund, type RefundError } from "@/features/payments/refund";
import { applyAdvance, type AdvanceError } from "@/features/payments/advance";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as Crypto from "expo-crypto";
import { motion } from "@octo/design-tokens";
import { useAuth } from "@/cloud/auth";
import { appRoles, loadCompanyDB, loadCompanyModule, loadCostHistory, loadPriceHistory } from "@/cloud/repo";
import { effectiveRole } from "@/nav/roles";
import { applyOp, catalogCostChange, renewSession, sendVisitPoint, type Op, type OutboxItem } from "@/cloud/ops";
import { callNext, callOp, leadTouchNext, leadTouchOp, messageNext, messageOp, type LeadTouch } from "@/features/comms/contactEvents";
import { defaultLeadAssignee } from "@/features/leadAssignee";
import { keepLast, stepPending } from "@/features/location";
import { changeConsent, withConsent, type ConsentChange } from "@/features/locationConsent";
import { leadCols, type LeadPatch } from "@/cloud/leadCols";
import { canMakeEstimateAt, leadEstimatePropertyId } from "@/features/access";
import { signTotalFor } from "@/cloud/legacyTotals";
import { leadStatusToDb } from "@/cloud/statusMap";

/** app lead status → public.leads.status */
const dbStatus = (s: LeadStatus): string => leadStatusToDb[s];
import { makeSeed } from "./seed";
import { normalizeDB } from "./normalize";
import { cleanPeople, docLanguageFor, leadPeopleOf, mainContact, nextClientNumber } from "./people";
import { tFor } from "@/i18n/translate";
import { findJob, jobOfEstimate, nextJobNumber } from "./jobs";
import { visitDueCents } from "@/features/visitDue";
import { withNewJob, type NewJobInput } from "@/features/newJob";
import { lineChangeRefusal, lineSaveUndo, taxBefore, withJobLine, withJobTax, withoutJobLine, type JobTaxSet } from "@/features/jobLines";
import { jobStatusAfterSchedule, jobStatusAfterStep, withJobDone } from "@/features/jobDone";
import { applyCustomerPatch, type CustomerPatch } from "./customerPatch";
import { statusAfterManualWin } from "@/features/clientRows";
import { inheritCategory } from "@/features/serviceCategories";
import { rescheduled, canCancel, canReschedule, hasPlannedInspection, jobRollsBack, leadRollsBack, stepChange, withAssignees } from "@/features/schedule";
import { cityLine, splitGateCodes, withGateCodes } from "@/features/properties";
import { docForSave, newToken, normalizeDoc, storedDoc, summarize } from "@/features/estimateDoc";
import { contractInvoice, contractInvoices, voidRefusal, withTaxSplit, type VoidRefusal } from "@/features/contractInvoice";
import { canCountersign, canEditMember, canGrantSign, canManageLink, canSignDraftOnSite, clientSigned, companyDeclined, companySigned, reopened, savedSignature, validUntilFor } from "@/features/estimateSign";
import { acceptPayment, sumCents, visitPayment } from "@octo/estimating-engine";
import { markNotDuplicateDb, mergeCustomersDb } from "@/features/clientDuplicates";
import { deviceGeneration, flushAllWriters, onDeviceForgotten, todayKey, usePersistentState } from "./persist";
import { cloudCacheKey, isNewCacheKey, othersCaches, othersCopies } from "./cacheKey";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { backoffMs, classify, isModuleInactive, isUnknownOp, isRowConflict, isStuck, MAX_TRIES, maybeOpOnly, needsSignIn, STUCK_RETRY_MS } from "./outboxRetry";
import { dependentsOf, isMoneyOp, madeOnQueue, nextToSend, waitingFor } from "./outboxDeps";
import { leavingSummary, MONEY_KINDS } from "./syncLink";
import { dropModuleOps, dropSettingsOps, dropTemplateOps, templateRejected, freshRejected, moduleRejected, REJECTED_KEY, rejectedMine, rejectedOf, rejectedOthers, settingsRejected, type RejectedOp } from "./outboxRejected";
import type { DictKey } from "@/i18n";
import { onAppActive, onAppLeave } from "./appActive";
import { adoptLegacy, mineOf, onSharedForget, OUTBOX_KEY, othersOf, sameOwner, unsentOf, type OwnedItem } from "./outboxOwner";
import { unsentIn as unsentInOf, withoutUnsentIn } from "@/features/closedCompany";
export { mineOf, type OwnedItem } from "./outboxOwner";
import { companyToday, setZone } from "@/features/zone";
import { eventProblems } from "@/features/planFeed";
import { enabledLocally, keepModuleData, moduleActive, moduleDef, modulePurchaseLines } from "@/modules/registry";
import { cleanCatalogItem } from "@/features/catalogExtras";
import { sameValue, undoOwn } from "@/data/undoOwn";
import { cleanCardFields, itemForSave, localPriceEntries, mergePriceHistory } from "@/features/catalogCard";
import { canEditOrders, canMove, canReceive, draftsForJob, linesEditable, openDraft, statusAfterReceive } from "@/features/purchaseOrders";
import { canSeeSuppliers, cleanSupplier, cleanSupplierLink, itemsOfSupplier, itemsWithOtherTax, keepCostHistory, localHistoryEntry, mergeHistory } from "@/features/suppliers";
import { coalesceAt, coalesced } from "./outboxCoalesce";
import {
  type CalendarEvent,
  type MemberPrefs,
  type PushGroup,
  type VisitPoint,
  MEMBER_PREFS_DEFAULT,
  type CatalogItem,
  type Company,
  type CompanyContact,
  type CompanyLicense,
  type DB,
  type Estimate,
  type EstimateApproval,
  type EstimateDoc,
  type Expense,
  type Lead,
  type LostReason,
  type Note,
  type Payment,
  type ID,
  type PaymentMethod,
  type QueuedAction,
  type Role,
  type Visit,
  type VisitStep,
  type Task,
  type Source,
  type LeadStatus,
  type CallOutcome,
  type CallInput,
  type MessageInput,
  type LeadTouchKind,
  type LeadInterest,
  type CustomerStatus,
  type Person,
  type Property,
  type Tag,
  ServiceCategory,
  CancelReason,
  JobLineItem,
  type ChecklistItem,
  type ChecklistItemKind,
  type ChecklistTemplate,
  type EstimateTemplate,
  type ChecklistVisitKind,
  type NaReason,
  type VisitSettings,
  type Supplier,
  type PurchaseOrder,
} from "./types";
import { cleanEstimateTemplate, canEditEstimateTemplates } from "@/features/estimateTemplate";
import { canAddItem, canAttachPhoto, canEditTemplates, canEditVisitItems, canEditVisitSettings, canRemoveItem, canReview, canSetRequired, canSkip, canTick, checklistFor, cleanTemplate, cleanText, itemKind, itemRequired, itemsFromTemplate, jobServices, moveItem, PHOTOS_PER_ITEM_MAX, photoStageOf, snapshotPhotoMins, templatesOfActiveModules, visitSettingsOf } from "@/features/checklist";

type Undo = () => void;
/** an undo that may be refused: false = too late, nothing changed (the toast says so); undefined = nothing to take back
 *  (the server already dropped the action — the toast just closes, as before #1244: the director's review, remark 2) */
export type GuardedUndo = () => boolean | undefined;

/**
 * What an undo would do now, without doing it (the director's review of #1244, remark 1): the store's value after it and
 * the rest of its work (the queue, the outbox) — or why not: "done" (already taken back), "dead" (the server dropped the
 * action: nothing to take back), null (changed since: too late). Kept for every undo mutate and undoTogether make, so a
 * screen's undo of several actions is all or nothing (DS §15.2 «Полуотката не бывает»).
 */
type UndoPlan = (cur: DB) => { value: DB; commit: () => void } | "done" | "dead" | null;
const undoPlans = new WeakMap<object, UndoPlan>();

/** the plan of undos in the order they were made: the last first, each on what the one after it left; a function the
 *  store did not make (a screen's own reset, a «nothing to undo», a reverse op) runs after, when all of them went back —
 *  one that throws does not stop the rest, and the toast still closes (the director's 3rd review, remark 2). None of the
 *  store's own parts left to take back (all dead, or only such functions) — undefined: nothing happens (remark 3). A part
 *  already taken back on its own (its own toast) — false: the rest is not taken back after it (remark 4). */
function planTogether(undos: readonly unknown[]): UndoPlan {
  return (cur) => {
    let value = cur;
    const commits: (() => void)[] = [];
    const others: (() => unknown)[] = [];
    let live = 0;
    for (const u of [...undos].reverse()) {
      if (typeof u !== "function") continue;
      const plan = undoPlans.get(u);
      if (!plan) {
        others.push(u as () => unknown);
        continue;
      }
      const r = plan(value);
      if (r === "dead") continue;
      if (r === "done" || r === null) return r;
      value = r.value;
      commits.push(r.commit);
      live++;
    }
    if (!live) return "dead";
    return {
      value,
      commit: () => {
        commits.forEach((f) => f());
        for (const f of others) {
          try {
            f();
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn("[undo] a part not made by the store failed", e);
          }
        }
      },
    };
  };
}

/** tests only: an action's result is already what the store will show — normalizeDB changes nothing in it (Б3) */
function assertNormalized(label: string, next: DB, mode: "demo" | "cloud") {
  const shown = normalizeDB(next, mode) as unknown as Record<string, unknown>;
  const raw = next as unknown as Record<string, unknown>;
  const off = Object.keys(shown).filter((k) => !sameValue(shown[k], raw[k]));
  if (off.length) throw new Error(`mutate «${label}»: normalizeDB changes ${off.join(", ")} — «Отменить» would see a conflict`);
}
export type Mode = "demo" | "cloud";
export type Link = "ok" | "offline" | "server";
export interface StuckOp {
  id: ID;
  kind: string;
  since: string;
  /** the ops that wait for it now (they go when it goes) */
  waiting: number;
  /** the ops that leave with it on «Отменить изменение…»: they need what it makes (docs/specs/23 §3) */
  leaving: number;
  /** what leaves with it, by kind, and whether money is among it (the confirmation names it, review #259) */
  leavingKinds: { key: DictKey; n: number }[];
  leavingMoney: boolean;
  /** being sent right now: «Повторить» / «Отменить изменение…» wait */
  sending: boolean;
}
/** when and who for an estimate visit */
export interface BookAt {
  /** the id of the new visit, when the caller needs it (the form shows «Сообщить клиенту?» for it) */
  visitId?: ID;
  start: string;
  durationMin: number;
  techId: ID | null;
  /** everyone on the visit (wave П3a); without it — [techId] */
  assigneeIds?: ID[];
  note?: string;
}
/** the people of a new visit: the list, or the one tech of old callers */
const peopleOf = (at: { techId: ID | null; assigneeIds?: ID[] }): ID[] => [...new Set(at.assigneeIds ?? (at.techId ? [at.techId] : []))];
const isOpenLeadStatus = (s: LeadStatus) => s !== "won" && s !== "lost" && s !== "declined";

interface StoreCtx {
  db: DB;
  mode: Mode;
  companyName: string | null;
  role: Role;
  setRole: (r: Role) => void;
  availableRoles: Role[];
  online: boolean;
  /**
   * why nothing goes out (docs/specs/23 §3): «ok»; «offline» — no answer at all (no network, the demo switch);
   * «server» — the network is there, the server answers «not now» (5xx, 429, PGRST002…). `online` is false for both.
   */
  link: Link;
  setOnline: (v: boolean) => number;
  queue: QueuedAction[];
  /** the signed-in person's unsent ops in every company (the account deletion removes them all, review #240 №4) */
  unsentAll: number;
  /** a write to the device was refused (full storage, A-02): «Не сохранено на устройстве» next to «Не отправлено: N» */
  notSavedOnDevice: boolean;
  syncError: string | null;
  /**
   * the person's ops the server keeps answering with an error (docs/specs/23 §3): not dropped, shown as
   * «не отправлено: сервер отвечает ошибкой», tried again every 5 minutes. `waiting` — the ops that wait for it.
   */
  stuckOps: StuckOp[];
  /** «Повторить сейчас» */
  retryOp: (id: ID) => void;
  /** «Отменить изменение…» (after a confirmation): the op and the ops that wait for it leave the phone; then a reload */
  discardOp: (id: ID) => boolean;
  /** the person's money changes the server refused: «не записано на сервере» until «Понятно» (docs/specs/23 §3) */
  rejectedOps: RejectedOp[];
  /** «Понятно»: the toast's «Отменить» puts it back (rule 5) */
  dismissRejected: (id: ID) => Undo;
  /**
   * 7а-3 «в» (docs/specs/22 §3.6): the signed-in person's changes still waiting for a company closed by its owner (the
   * server refuses them now), and «Убрать» them (after a confirmation, rule 5). Other people's ops stay.
   */
  unsentIn: (companyId: ID) => number;
  /** false — one of them is being sent right now: nothing removed */
  dropUnsentIn: (companyId: ID) => boolean;
  refresh: () => Promise<void>;
  loading: boolean;
  advanceVisit: (id: ID) => Undo;
  addPhoto: (visitId: ID, kind: "before" | "after", uri?: string) => Undo;
  toggleCheck: (visitId: ID, itemId: ID) => Undo;
  removePhoto: (visitId: ID, photoId: ID) => Undo;
  /** extra checklist item added on site by the tech (always optional, docs/specs/08 §11.2 №9) */
  addCheckItem: (visitId: ID, label: string) => Undo;
  /* step 14 (docs/specs/08 §10.1): one row per item — a tick and an office edit never overwrite each other */
  /** tick / untick one item (a tick takes a skip off) */
  checkItem: (visitId: ID, itemId: ID, done: boolean) => Undo;
  /** «Пропустить»: the items stay «not done» (not a tick); the reason is optional */
  skipItems: (visitId: ID, itemIds: ID[], reason?: NaReason, text?: string) => Undo;
  /** a photo for a photo item: into the visit's photos (stage by the step) and onto the item, which is then done */
  attachItemPhoto: (visitId: ID, itemId: ID, uri?: string) => Undo;
  /** the office: an item of a visit (required or not) */
  addVisitItem: (visitId: ID, label: string, required: boolean, kind?: ChecklistItemKind) => Undo;
  /** the office (a required one — the director); a tech — only his own optional item. The server checks */
  removeVisitItem: (visitId: ID, itemId: ID) => Undo;
  /** the office before the visit (§7.4, CH3): an item's text and «Обязательный» (off — the director) */
  editVisitItem: (visitId: ID, itemId: ID, patch: { label?: string; required?: boolean }) => Undo;
  /** the office before the visit: «Выше» (-1) / «Ниже» (1) */
  moveVisitItem: (visitId: ID, itemId: ID, dir: -1 | 1) => Undo;
  /** the office before the visit: «Добавить из шаблона» — the template's items as a snapshot (§5, §11.8 №8) */
  addVisitTemplate: (visitId: ID, templateId: ID) => Undo;
  /** «Просмотрено» on the «not done» card */
  reviewVisitMissed: (visitId: ID) => Undo;
  /** a checklist template, whole (new or changed; archive = archivedAt) */
  saveChecklistTemplate: (t: ChecklistTemplate, opts?: { ifNew?: boolean }) => GuardedUndo;
  /** the company's photo rules (owner, admin) */
  setVisitSettings: (patch: Partial<VisitSettings>) => Undo;
  signVisit: (visitId: ID, path: string) => Undo;
  payVisit: (visitId: ID, method: PaymentMethod) => Undo;
  /** "I replied" (no call/SMS from the app): stops the reply timer */
  replyLead: (id: ID) => Undo;
  /** call / SMS / email / marketplace from the card: history line + first response + new → in touch */
  /** SMS / email / marketplace / reply; a call goes only through callResult / logCall with its outcome (20 §3) */
  touchLead: (id: ID, kind: LeadTouchKind) => Undo;
  /** after a call from the card: answered = in touch; no answer / voicemail = one more attempt, the reply timer keeps going */
  callResult: (id: ID, outcome: CallOutcome) => Undo;
  /** wave 6-2: a call on a lead, a client or a job, with its outcome, person, minutes and a note */
  logCall: (c: CallInput) => Undo;
  /** wave 6-3: an SMS / email opened in the phone's app — the event, written at «Отправить» */
  logMessage: (m: MessageInput) => Undo;
  setLeadInterest: (id: ID, interest: LeadInterest | undefined) => Undo;
  /** "call me in 3 months": hidden until the date, keeps its funnel status */
  snoozeLead: (id: ID, until: string, reason?: string) => Undo;
  unsnoozeLead: (id: ID) => Undo;
  /** a reminder went to the client: starts the "lost or wait?" countdown */
  markReminded: (id: ID) => Undo;
  /** S20 (wave 8): «Напомнить» about an invoice — an outgoing SMS / email in the client's feed, linked to the invoice */
  remindInvoice: (invoiceId: ID, channel: "sms" | "email") => Undo;
  /** answer "wait" to "lost or wait?": ask again in N days */
  waitMore: (id: ID, days: number) => Undo;
  updateLead: (id: ID, patch: LeadPatch) => Undo;
  /** lost = the client decided, declined = we decided; reason required ("other" needs text) */
  closeLead: (id: ID, close: "lost" | "declined", reason: LostReason, text?: string) => Undo;
  reopenLead: (id: ID) => Undo;
  assignLead: (id: ID, memberId: ID) => Undo;
  setLeadCost: (id: ID, cents: number) => Undo;
  /** all people of a lead in one save (the first is the lead itself); once the lead has a client, its people are the client's */
  saveLeadPeople: (leadId: ID, people: Person[]) => Undo;
  saveTask: (t: Omit<Task, "id"> & { id?: ID }) => { id: ID; undo: Undo };
  /** an event or a day off of the Plan (wave 5): nothing is saved while eventProblems finds something */
  saveCalendarEvent: (e: Omit<CalendarEvent, "id"> & { id?: ID }) => { id: ID; undo: Undo } | null;
  removeCalendarEvent: (id: ID) => Undo;
  /** wave 7б-1: my personal settings, the same on every device (locally at once, then public.set_my_prefs) */
  setPrefs: (patch: Partial<MemberPrefs>) => Undo;
  /** step 18 P4b: my push switch of one group, the same on every device (locally at once, then public.set_push_kind
   *  through the offline queue — rule 6) */
  setPushKind: (kind: PushGroup, enabled: boolean) => Undo;
  /** spec 33 П15 (C2a): owner / admin switch an add-on module on (the first time — the trial) or off; nothing of the
   *  module is deleted by «off». Locally at once, then module_enable / module_disable through the queue (rule 6). */
  enableModule: (key: string) => Undo;
  disableModule: (key: string) => Undo;
  /** the module's settings; null = not saved: the module is not active (trial over, not paid — founder О2) */
  saveModuleSettings: (key: string, settings: Record<string, unknown>) => Undo | null;
  /** spec 33 П15 C2c: a change of an add-on module — `apply` shows it on the phone at once, the module's handler sends it
   *  (offline — the queue). A newer change with the same coalesceKey replaces a waiting one. null = not saved: the module
   *  is not active (trial over, not paid — founder О2) */
  moduleOp: (module: string, change: { kind: string; payload: Record<string, unknown>; apply: (d: DB) => DB; coalesceKey?: string; made?: string[] }) => Undo | null;
  /** «Отменить» of several actions made together (each the undo a store action returned, in the order they were made):
   *  all of them go back or none — false: too late, nothing changed (DS §15.2) */
  undoTogether: (undos: readonly unknown[]) => GuardedUndo;
  /** wave 7б-2: my consent to share my location (on — only after the notice, online); off forgets my points here.
   *  Changes only the consent: «Отменить» never takes back anything else (features/locationConsent.ts) */
  setLocationConsent: (on: boolean) => ConsentChange;
  /** wave 7б-2: a point of mine on an open visit: kept as the last one and sent at once (never queued) */
  recordVisitPoint: (p: VisitPoint, source: "status_change" | "foreground") => void;
  /** company lead sources: add / edit / hide (sources with leads are never deleted) */
  saveSource: (s: Omit<Source, "id"> & { id?: ID }) => { id: ID; undo: Undo };
  /**
   * Estimate visit for a lead: the date, time, length and tech the person picked (docs/14 §7.3; no "tomorrow 10:00").
   * Reuses the lead's client and property if it already has them (no second client); otherwise makes a prospect first.
   */
  bookLead: (id: ID, at: BookAt) => Undo;
  /** the office cancels a visit before the tech is on site; S4a / S9a roll the lead / job back (docs/specs/03 §4) */
  cancelVisit: (id: ID, reason: CancelReason, text?: string) => Undo;
  /** the office moves a visit (time, length) before the tech is on site; the status does not change */
  rescheduleVisit: (id: ID, start: string, durationMin: number, allDay?: boolean) => Undo;
  /** «+ Осмотр» on a client / property (a returning client wants a new estimate): an inspection without a lead */
  addInspection: (propertyId: ID, at: BookAt) => { id: ID; undo: Undo };
  /** the office sent the client the time (an SMS / email app was opened with the text, or it was copied) */
  markNotified: (visitId: ID) => Undo;
  /** the whole list of people on a visit ([] = «Снять всех»); only before the tech is on site */
  assignVisit: (visitId: ID, userIds: ID[]) => Undo;
  resetDemo: () => Undo;
  addLead: (l: Omit<Lead, "id" | "status" | "receivedAt">) => { id: ID; undo: Undo };
  addEstimate: (e: Omit<Estimate, "id">) => Undo;
  sendEstimate: (id: ID, token?: string) => Undo;
  payInvoice: (id: ID, method: PaymentMethod) => Undo;
  addExpense: (x: Omit<Expense, "id" | "at" | "memberId">) => Undo;
  signEstimate: (id: ID, path: string) => Undo;
  /** fromClient: paid on the client page → unread notice for the office */
  payDeposit: (id: ID, method: PaymentMethod, fromClient?: boolean) => Undo;
  /** any amount up to the invoice balance; every payment is a receipt */
  recordPayment: (invoiceId: ID, amountCents: number, method: PaymentMethod, reference?: string, fromClient?: boolean) => Undo;
  /** 20д: the DEMO's refund only (features/payments/refund.ts applyRefund — the database's rules); in the cloud it does
   *  nothing and says so: there the server refunds (cloud/refund.ts), then refresh(). No undo — money that left is gone;
   *  the sheet asks first (rule 5). null — done, else our word why not. */
  refundPaymentDemo: (paymentId: ID, amountCents: number) => RefundError | null;
  /** spec 35 §4г: the DEMO's apply of a client's advance to an invoice (features/payments/advance.ts applyAdvance — the
   *  database's rules); in the cloud the server applies (cloud/advance.ts), then refresh(). null — done, else our word. */
  applyAdvanceDemo: (advanceId: ID, invoiceId: ID) => AdvanceError | null;
  /** progress (by stage) or final balance invoice for a job */
  /** #865: null — refused, nothing written or queued (above the contract: engine canIssue); the screen says so
   *  (inv.rej.overContract) and shows no «Отменить» */
  issueInvoice: (jobId: ID, kind: "progress" | "final", amountCents: number, title: string) => Undo | null;
  /** В1-5 (#1107): void a sent invoice — director (owner / admin) only, no payment on it, the reason required. The
   *  invoice moves to voidInvoices (no sum counts it); no «Отменить»: the server never lets it back. null — done;
   *  else why not (the screen shows it). Server: tg_invoice_guard (db T197). */
  voidInvoice: (id: ID, reason: string) => VoidRefusal | null;
  /** create or update a universal estimate (draft) */
  saveEstimate: (e: { id: ID; customerId: ID; propertyId: ID; title: string; doc: EstimateDoc; leadId?: ID; templateId?: ID }) => Undo;
  /** E3 (docs/specs/07 §11): an estimate template, whole (new, changed, archived = archivedAt); director and office */
  /** ifNew: a module's starter (fixed id) — added once, never over the office's edits (docs/specs/07 §12 №6) */
  saveEstimateTemplate: (t: EstimateTemplate, opts?: { ifNew?: boolean; baseRowVersion?: number; clearCosts?: string[] }) => GuardedUndo;
  /** client + property for an estimate from a lead (creates a prospect card the first time) */
  leadEstimateTarget: (leadId: ID) => { customerId: ID; propertyId: ID; undo: Undo } | null;
  /** #1138: may the person make a NEW estimate at this property (a tech: only where he works, as the server) */
  mayMakeEstimateAt: (propertyId: ID | undefined) => boolean;
  /** manual "make a client" with a reason (paper contract, verbal, paid…) */
  convertLead: (leadId: ID, reasonText: string) => Undo;
  /** New client entered by hand (not from a lead): active client with one property. */
  addCustomer: (c: { name: string; phone: string; email?: string; sourceId: ID; address: string; city: string }) => { id: ID; propertyId: ID; undo: Undo };
  /** wave П-1: also the name parts and the address for invoices (billing null = same as the property) */
  updateCustomer: (id: ID, patch: CustomerPatch) => Undo;
  /** people of a client (several phones / emails each); the first person is the main one */
  saveCustomerPeople: (id: ID, people: Person[]) => Undo;
  setCustomerTags: (id: ID, tagIds: ID[]) => Undo;
  setCustomerStatus: (id: ID, status: CustomerStatus, reason?: string) => Undo;
  /** step 17 C3 (docs/specs/04 §13): dropId's people, properties, leads, documents and money move to keepId; dropId is
   *  archived and merged. Owner / admin only (server: public.merge_customers). «Отменить» works until the op is sent. */
  mergeCustomers: (keepId: ID, dropId: ID) => Undo;
  /** «Не дубль»: the pair is not shown as a possible duplicate again (customers.not_duplicate_ids of aId) */
  markNotDuplicate: (aId: ID, bId: ID) => Undo;
  /** add or edit a company tag (hiding = active: false; a tag is never deleted) */
  saveTag: (t: Omit<Tag, "id" | "position"> & { id?: ID; position?: number }) => { id: ID; undo: Undo };
  /** directions of the business (docs/specs/11-trade.md): add, rename, reorder, archive / bring back — never delete */
  saveServiceCategory: (c: Partial<Omit<ServiceCategory, "id">> & { id?: ID }) => { id: ID; undo: Undo };
  setJobCategory: (id: ID, serviceCategoryId?: ID) => Undo;
  /** wave 3b «Новая работа» (S17, docs/specs/17-job.md §7.3): a job without an estimate, waiting for a date;
   *  the client and the address exist already (addCustomer / saveProperty first). Server: public.create_job */
  addJob: (x: NewJobInput) => { id: ID; undo: Undo };
  /** wave 3c (S10): «Да, выполнена» / «Завершить работу» — office only, no open visit; server public.complete_job */
  completeJob: (jobId: ID) => Undo;
  /** 3b-2 (17-job §11.1): own lines of a job without an estimate; the job total follows (engine). The screen checks
   *  lineChangeRefusal first; the server refuses the same (t20, t19_job_total_floor). Undo of a removal restores it. */
  /** «Отменить» of these runs the same check (lineChangeRefusal) and returns false when it is refused: nothing changes */
  saveJobLine: (line: Omit<JobLineItem, "totalCents">, isNew: boolean) => GuardedUndo;
  removeJobLine: (id: ID) => GuardedUndo;
  setJobTax: (jobId: ID, tax: JobTaxSet) => GuardedUndo;
  setJobTags: (jobId: ID, tagIds: ID[]) => Undo;
  setJobType: (jobId: ID, jobTypeId: ID | null) => Undo;
  /** for the estimate screen (chat «Сметы и модуль Gutters») */
  setEstimateCategory: (id: ID, serviceCategoryId?: ID) => Undo;
  updateProperty: (id: ID, patch: { address?: string; city?: string }) => Undo;
  /** C2: a property of a client, new or edited (everything but the gate code) */
  saveProperty: (p: Property) => Undo;
  /** C2: the gate code (office only; the server refuses others) */
  setGateCode: (propertyId: ID, code: string) => Undo;
  addNote: (n: Omit<Note, "id" | "at" | "authorId" | "pinned">) => Undo;
  updateNote: (id: ID, patch: { pinned?: boolean; body?: string; deleted?: boolean }) => Undo;
  /** client's choice + signature (on site or on the client page) → awaiting the company's signature (S8, docs/specs/07 §4) */
  approveEstimate: (id: ID, a: Omit<EstimateApproval, "at" | "totalCents" | "depositCents">) => Undo;
  /* ---- wave E2a: the company signs (docs/specs/07 §2.2 А) ---- */
  /** an employee signs for the company in their own name (S8b): approved, lead won, client active, job, deposit invoice */
  countersignEstimate: (id: ID, signature: string | { savedId: ID }) => Undo;
  /** director / office: the client link stops working; the next send makes a new one */
  revokeEstimateLink: (id: ID) => Undo;
  /* ---- wave E2b-1 ---- */
  /** director / office: decline a client-signed estimate, with the reason (the lead does not change) */
  declineCountersign: (id: ID, text: string) => Undo;
  /** director / office: «don't sign — change it» → draft (the client signs the new version again) */
  reopenEstimate: (id: ID, reason: string) => Undo;
  /* ---- wave E2b-2 ---- */
  /** my own saved signature (a new one replaces the old; the old stays in history) */
  saveMySignature: (svg: string, name: string, title?: string) => Undo;
  /** «Команда → Сотрудник»: title, HIS number; the right to sign — owner only */
  updateMember: (id: ID, patch: { title?: string; hisNumber?: string; canSignContracts?: boolean }) => Undo;
  saveCatalogItem: (it: CatalogItem) => Undo;
  removeCatalogItem: (id: ID) => Undo;
  /** spec 36: make or change a supplier (owner / admin / office); null name — nothing */
  saveSupplier: (x: Supplier) => GuardedUndo;
  /** spec 36: archive or bring back a supplier («Отменить» 5 s) */
  setSupplierActive: (id: ID, active: boolean) => GuardedUndo;
  /** spec 36: the supplier's purchase tax into its items that have another one (new estimate lines follow) */
  applySupplierTax: (id: ID) => GuardedUndo;
  /** spec 37: the job's drafts per supplier (an open draft of that supplier is kept, not doubled); the ids to open */
  makeJobOrders: (jobId: ID) => { ids: ID[]; made: number; undo: Undo };
  /** spec 37: a new empty draft (for stock, or a job), or a changed order (lines of a draft / sent order) */
  savePurchaseOrder: (o: PurchaseOrder) => Undo;
  /** spec 37: sent — the supplier's snapshot, a new revision; false — not allowed (no supplier, no lines, a closed order) */
  sendPurchaseOrder: (id: ID) => boolean;
  /** spec 37: cancelled (the screen asks first: it cannot be undone) */
  cancelPurchaseOrder: (id: ID) => void;
  /** spec 37: what came, line by line (the tech of the job or the office); «Отменить» sends what was before */
  receivePurchaseOrder: (id: ID, lines: { id: ID; received: string }[]) => Undo;
  /** spec 36: read the newest history of one item or one supplier from the server (cloud, online, who sees costs) */
  loadCostHistory: (where: { itemId?: ID; supplierId?: ID }) => void;
  /** РС-10: the item's price and markup changes, read when its card opens (only who sees costs; offline — none) */
  loadPriceHistory: (itemId: ID) => void;
  /** several items at once with one «Отменить» («create the items now», docs/specs/33 П16, core K1): each goes as its own
   *  catalog.save through the queue; «Отменить» takes them all back. onlyNew (spec 33 П22.10): an item whose id is on the
   *  phone already is left as it is (no op), and the server inserts only an id it does not have (ON CONFLICT DO NOTHING) */
  saveCatalogItems: (items: CatalogItem[], opts?: { onlyNew?: boolean }) => GuardedUndo;
  readNotices: () => void;
  /** invite a person (demo: added as pending; cloud: email invites come with the email service) */
  inviteMember: (m: { name: string; email?: string; phone?: string; roles: Role[]; kind: "employee" | "sub" }) => Undo;
  /** wave 7-2 (S21), demo: cancel an invitation / switch a person off or back on (the cloud goes through cloud/team.ts) */
  revokeInvite: (id: ID) => Undo;
  setMemberDisabled: (id: ID, disabled: boolean) => Undo;
  /** company profile (owner/admin in the cloud) */
  saveCompany: (patch: Partial<Omit<Company, "id" | "licenses" | "contacts" | "modules">>) => Undo;
  saveLicense: (l: CompanyLicense) => Undo;
  removeLicense: (id: ID) => Undo;
  saveContact: (c: CompanyContact) => Undo;
  removeContact: (id: ID) => Undo;
  /** contractor picks date, time, duration and (optionally) the tech → a visit appears in the plan */
  scheduleJob: (jobId: ID, s: { start: string; durationMin: number; techId: ID | null; assigneeIds?: ID[]; visitId?: ID; note?: string; allDay?: boolean }) => Undo;
}

const Ctx = createContext<StoreCtx | null>(null);
/** UUIDs everywhere: the same id is used on the phone and in the database (offline-created rows). */
const uid = (_p?: string) => Crypto.randomUUID();
const emptyDB = (me: string): DB => ({
  me, members: [], sources: [], tags: [], serviceCategories: [], tasks: [], activities: [], customers: [], properties: [], jobs: [], visits: [], leads: [], estimates: [], invoices: [], expenses: [], catalog: [], notices: [],
  company: null, notes: [], payments: [],
});
const upsert = <T extends { id: string }>(list: T[], it: T): T[] => (list.some((x) => x.id === it.id) ? list.map((x) => (x.id === it.id ? it : x)) : [...list, it]);
/** Next local receipt number (demo); in the cloud the server assigns RCT-… */
const nextReceipt = (d: DB): string => {
  const max = d.payments.reduce((m, p) => Math.max(m, Number(p.receiptNumber?.replace(/\D/g, "") ?? 0)), 100);
  return `RCT-${String(max + 1).padStart(4, "0")}`;
};
const nextInvoiceNumber = (d: DB): string => {
  const max = d.invoices.reduce((m, i) => Math.max(m, Number(i.number?.replace(/\D/g, "") ?? 0)), 100);
  return `INV-${String(max + 1).padStart(4, "0")}`;
};
/** Add a payment to the data and update the invoice (paid, paidAt). */
function withPayment(d: DB, p: Payment, demo: boolean): DB {
  const pay = demo ? { ...p, receiptNumber: p.receiptNumber ?? nextReceipt(d) } : p;
  return {
    ...d,
    payments: [pay, ...d.payments],
    invoices: d.invoices.map((i) => {
      if (i.id !== p.invoiceId) return i;
      // the sum through the engine (rule 8)
      const paid = sumCents([i.paidCents, p.amountCents]);
      return { ...i, paidCents: paid, method: p.method, paidAt: paid >= i.totalCents ? p.at : i.paidAt };
    }),
  };
}
const costsOf = (doc: EstimateDoc): Record<string, number> =>
  Object.fromEntries(doc.options.flatMap((o) => o.lines.filter((l) => l.unitCostCents !== undefined).map((l) => [l.id, l.unitCostCents!])));

/** `readError`: the screen shown when the device did not give back what it keeps (A-01) — from the root layout, so the
 *  store imports no UI; without it nothing is shown (tests) */
export function StoreProvider({
  children,
  readError,
}: {
  children: ReactNode;
  /** `salvage` — a broken outbox record: keep its copy and go on (null for a failed read) */
  readError?: (retry: () => void, salvage: (() => void) | null, notSaved: boolean) => ReactNode;
}) {
  const auth = useAuth();
  const company = auth.session ? auth.company : null;
  const mode: Mode = company && auth.userId ? "cloud" : "demo";
  // the cache is the person's in the company (#864): the next person on a shared phone never reads it
  const cacheKey = mode === "cloud" ? cloudCacheKey(company!.companyId, auth.userId!) : "octo.db.v5";

  // Demo data is kept as the person left it, any day — never reseeded silently at midnight (the founder's measurement was
  // wiped that way, 12.11; К1). Only «Сбросить тестовые данные» starts it over (with «Отменить»). Cloud data is a cache
  // of the server.
  const [saved, setSaved, dbReady, dbHealth] = usePersistentState<{ day: string; db: DB }>(
    cacheKey,
    () => (mode === "cloud" ? { day: "cloud", db: emptyDB(auth.userId ?? "") } : { day: todayKey(), db: makeSeed() }),
    {
      // #1189: only the shape — the record is an object of this mode; a list it lacks (an older version's record) is filled
      // by normalizeDB, never a reason to start the demo over (that wiped the person's own records)
      validate: (v) =>
        typeof v?.db === "object" && v.db !== null && !Array.isArray(v.db) && (mode === "cloud" ? v.day === "cloud" : typeof v?.day === "string" && v.day !== "cloud"),
      // an empty start shows an empty company: tried longer before it (#926)
      patient: true,
      // the first start of this version: the older person-less cache is the signed-in person's only when its «me» is
      // theirs — an empty list without the network otherwise (#864, review); another person's is never taken
      ...(mode === "cloud" ? { adopt: { from: `octo.cloud.v1.${company!.companyId}`, ok: (v: { db: DB }) => v.db.me === auth.userId } } : {}),
    },
  );
  // gate codes (C2) stay in memory in the cloud: never written to the cache on the phone (security review of #62)
  const [gateCodes, setGateCodes] = useState<Record<string, string>>({});
  const cacheKeyRef = useRef(cacheKey);
  cacheKeyRef.current = cacheKey;
  // the device was wiped (account deletion, 19 §6.12): no send and no reload until the store holds another key
  // (sign-out → the demo, or the next person's company); every async step also drops its result if the generation moved
  const wipedKey = useRef<string | null>(null);
  const stale = (gen: number) => gen !== deviceGeneration() || wipedKey.current === cacheKeyRef.current;
  const lastKey = useRef(cacheKey);
  if (lastKey.current !== cacheKey) {
    // another key (sign-out, the next person's company): the block of the wiped one is over
    lastKey.current = cacheKey;
    wipedKey.current = null;
  }
  // my cache is read: other people's copies (and the older person-less ones) leave the phone (#864). An older one only
  // once my own key is on the device (taken over from it, or written): never before, or a phone killed now has neither
  useEffect(() => {
    if (!dbReady || mode !== "cloud" || !auth.userId) return;
    const me = auth.userId;
    const mine = cacheKey;
    const myOld = async (k: string) => {
      const raw = await AsyncStorage.getItem(k);
      return raw != null && (JSON.parse(raw) as { db?: { me?: string } }).db?.me === me;
    };
    AsyncStorage.getAllKeys()
      .then(async (ks) => {
        const gone: string[] = [];
        for (const k of othersCaches(ks, me)) if (ks.includes(mine) || isNewCacheKey(k) || !(await myOld(k).catch(() => true))) gone.push(k);
        // their kept copies (#1189) go at once: a snapshot of another person's company is never kept for them (#1260 Б1)
        gone.push(...othersCopies(ks, me));
        return gone;
      })
      .then((gone) => (gone.length ? AsyncStorage.multiRemove(gone) : undefined))
      .catch(() => {}); // not removed now: the next sign-in tries again
  }, [dbReady, mode, auth.userId, cacheKey]);
  const db = useMemo(() => {
    const d = normalizeDB(saved.db, mode);
    return mode === "cloud" ? withGateCodes(d, gateCodes) : d;
  }, [saved.db, mode, gateCodes]);
  // the company's time zone for the whole app (docs/specs/03 П4b): set during render, before any screen reads a day
  setZone(db.company?.timezone);
  const setDb = useCallback(
    (next: DB) => {
      // bound to this render's cache: a late write for the company is dropped after sign-out (19 §6.12)
      if (mode !== "cloud") return setSaved({ day: todayKey(), db: next }, cacheKey);
      if (cacheKeyRef.current !== cacheKey) return;
      const { db: bare, codes } = splitGateCodes(next);
      setGateCodes(codes);
      setSaved({ day: "cloud", db: bare }, cacheKey);
    },
    [setSaved, mode, cacheKey],
  );
  // nothing chosen yet → the first role this person has (owner → director); route-guard fix
  const [savedRole, setRole, roleReady, roleHealth] = usePersistentState<Role>("octo.role.v1", "director");
  const [online, setOnlineState] = useState(true);
  // the cloud: is the server answering (the switch «без сети» is the demo's) — a failed request says no, an answer yes;
  // without it the outbox waits longer and longer and never drops an op (rule 6, cloud e2e 104)
  const [link, setLink] = useState<Link>("ok");
  const reachable = link === "ok";
  const netFails = useRef(0);
  const nextTry = useRef(0);
  const answered = () => {
    netFails.current = 0;
    nextTry.current = 0;
    setLink("ok");
  };
  // a failure with no answer is «no network»; the server's «not now» is «server unavailable» (review #244 №3)
  const failedAs = (e: unknown): Link => (classify(e) === "network" ? "offline" : "server");
  const unreachable = (e: unknown) => {
    netFails.current += 1;
    nextTry.current = Date.now() + backoffMs(netFails.current);
    setLink(failedAs(e));
  };
  // small and only on the phone until sent: written at once, not after 250 ms (rule 6 — a crash right after a change)
  // `strict`: what the phone has only here is never «started fresh» from a broken record — its copy is kept first (A-01)
  const [queue, setQueue, queueReady, queueHealth] = usePersistentState<QueuedAction[]>("octo.queue.v1", [], { immediate: true, strict: true });
  const [outbox, setOutbox, outboxReady, outboxHealth] = usePersistentState<OwnedItem[]>(OUTBOX_KEY, [], { immediate: true, strict: true });
  // money changes the server refused (docs/specs/23 §3): kept until «Понятно»
  const [rejected, setRejected, rejectedReady, rejectedHealth] = usePersistentState<RejectedOp[]>(REJECTED_KEY, [], { immediate: true, strict: true });
  // the device storage (A-01, A-02): a read that failed holds the app on «Повторить»; a refused write is shown
  const health = [dbHealth, roleHealth, queueHealth, outboxHealth, rejectedHealth];
  const notSavedOnDevice = health.some((h) => h.writeFailed);
  // the app is leaving (background, the tab hidden or closed): every state that waits to be written is written now
  useEffect(() => onAppLeave(flushAllWriters), []);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const dbRef = useRef(db);
  dbRef.current = db;
  const onlineRef = useRef(online);
  onlineRef.current = online;
  const outboxRef = useRef(outbox);
  outboxRef.current = outbox;
  // the outbox key is one for the phone: each op knows whose it is, the signed-in person sends only theirs
  // (review #231: after a plain sign-out the next person must never send someone else's ops in their company)
  const who = mode === "cloud" ? { userId: auth.userId!, companyId: company!.companyId } : null;
  const whoRef = useRef(who);
  whoRef.current = who;
  const mine = (items: readonly OwnedItem[]) => mineOf(items, whoRef.current);
  // a wipe that came while the outbox was still loading (the start repeat): applied to what the load brings
  const rejectedReadyRef = useRef(rejectedReady);
  rejectedReadyRef.current = rejectedReady;
  // the people whose refused changes leave once the list is loaded (more than one: an older deletion still to filter, #911)
  const forgetRejectedOnLoad = useRef<(string | null)[] | null>(null);
  useEffect(() => {
    if (!rejectedReady || !forgetRejectedOnLoad.current) return;
    const ids = forgetRejectedOnLoad.current;
    forgetRejectedOnLoad.current = null;
    setRejected((prev) => ids.reduce((l, id) => rejectedOthers(l, id), prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rejectedReady]);
  const outboxReadyRef = useRef(outboxReady);
  outboxReadyRef.current = outboxReady;
  const forgetOnLoad = useRef<(string | null)[] | null>(null);
  useEffect(() => {
    if (!outboxReady || !forgetOnLoad.current) return;
    const ids = forgetOnLoad.current;
    forgetOnLoad.current = null;
    setOutbox((prev) => (outboxRef.current = ids.reduce((l, id) => othersOf(l, id), prev)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outboxReady]);
  // ops of older versions (no owner) belong to the first person signed in once the outbox is loaded (review #240 №3)
  useEffect(() => {
    if (!outboxReady || !who || forgetOnLoad.current) return;
    // a functional update: never over a filter of a wipe that is set but not yet rendered (review #244 №5)
    setOutbox((prev) => {
      const adopted = adoptLegacy(prev, who);
      return (outboxRef.current = adopted === prev ? prev : [...adopted]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outboxReady, who?.userId, who?.companyId]);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const availableRoles: Role[] = mode === "cloud" ? appRoles(company!.role) : ["tech", "dispatcher", "director", "sales"];
  const role = effectiveRole(savedRole, availableRoles);
  useEffect(() => {
    if (savedRole !== role) setRole(role);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, company?.role]);

  /* ---------- server sync ---------- */
  // per op, in memory: when it may be tried again after the server's error that may be its own (docs/specs/23 §3)
  const opPause = useRef(new Map<string, number>());
  /**
   * an op of this person that is not stuck — also one waiting behind a stuck one: its change is only on the phone, a
   * reload would wipe it from the screens (review #259 №4). Only stuck ops left: the server's truth comes back.
   */
  const pendingLive = () => mineOf(outboxRef.current, whoRef.current).some((o) => !o.stuck);
  // the op being sent now: «Отменить изменение…» and «Повторить» wait for its answer (review #259 №5)
  const inFlight = useRef<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  /**
   * a network failure or a refusal ends a run of the server's errors: the 10 minutes count from the next one, and the
   * card «не отправлено» goes (review #259 п.4) — a refused op is the refusals' now: after MAX_TRIES it is dropped
   */
  const clearFails = (id: string) => {
    const cur = outboxRef.current.find((x) => x.id === id);
    if (!cur || (cur.fails == null && cur.failSince == null && !cur.stuck)) return;
    const { fails: _f, failSince: _s, stuck: _st, ...rest } = cur;
    outboxRef.current = outboxRef.current.map((x) => (x.id === id ? rest : x));
    setOutbox(outboxRef.current);
  };
  const failedOnce = (item: OwnedItem, msg: string) => {
    const now = Date.now();
    const cur = outboxRef.current.find((x) => x.id === item.id) ?? item;
    const fails = (cur.fails ?? 0) + 1;
    const failSince = cur.failSince ?? new Date(now).toISOString();
    const stuck = !!cur.stuck || isStuck(failSince, fails, now);
    // the tries (refusals) are not touched: the server did not say «no»
    const next: OwnedItem = { ...cur, fails, failSince, error: msg, ...(stuck ? { stuck: true as const } : {}) };
    outboxRef.current = outboxRef.current.map((x) => (x.id === item.id ? next : x));
    setOutbox(outboxRef.current);
    opPause.current.set(item.id, now + (stuck ? STUCK_RETRY_MS : backoffMs(fails)));
  };
  /** modules whose settings the phone must read again before it saves them (a conflict, review #374 №1) */
  const settingsStale = useRef(new Set<string>());
  /** ops dropped on a conflict: their «Отменить» does nothing (review #374 №2) */
  const deadOps = useRef(new Set<string>());
  /** read one module's row again and take the server's settings and version; until then its settings are not saved */
  const rereadSettings = async (mod: string, cid: string | undefined) => {
    settingsStale.current.add(mod);
    if (!cid) return;
    const row = await loadCompanyModule(cid, mod).catch(() => null);
    const cur = dbRef.current;
    // no answer, or another company signed in meanwhile: the next full read clears it
    if (!row || !cur.company || whoRef.current?.companyId !== cid) return;
    dbRef.current = { ...cur, company: { ...cur.company, modules: { ...cur.company.modules, [mod]: row } } };
    setDb(dbRef.current);
    settingsStale.current.delete(mod);
  };
  const refresh = useCallback(async () => {
    if (modeRef.current !== "cloud" || !company || !auth.userId || !onlineRef.current) return;
    // send pending changes first, then reload — an op the server keeps refusing «for now» (stuck) and what waits for it
    // do not hold the reload (else the phone would never see the server again, docs/specs/23 §3)
    if (pendingLive()) return;
    const gen = deviceGeneration();
    if (stale(gen)) return;
    setLoading(true);
    try {
      const next = await loadCompanyDB(company.companyId, auth.userId);
      // signed out, another company or the device wiped while it loaded: the answer is not for this store (19 §6.12)
      if (stale(gen) || modeRef.current !== "cloud" || cacheKeyRef.current !== cloudCacheKey(company.companyId, auth.userId)) return;
      // a module whose read failed keeps the phone's copy of its data (spec 33 П21.2 №4)
      if (!pendingLive()) {
        // spec 36: the history read on open stays (the full read has none)
        setDb(keepCostHistory(keepModuleData(next, dbRef.current), dbRef.current));
        // the whole company read again: every module's settings are the server's now
        settingsStale.current.clear();
      }
      setSyncError(null);
      answered();
    } catch (e) {
      if (stale(gen)) return;
      if (classify(e) !== "refusal") setLink(failedAs(e));
      setSyncError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [company, auth.userId, setDb]);

  // wave 7б-2: points waiting for their visit's step to reach the server (one per visit, the newest)
  const waitingPoints = useRef<Record<string, { p: VisitPoint; source: "status_change" | "foreground" }>>({});
  const sendPoint = useCallback(
    (p: VisitPoint, source: "status_change" | "foreground") => {
      const gen = deviceGeneration();
      void sendVisitPoint({ ...p, source }).then((r) => {
        // the server no longer takes my points (the company flag went off, I was switched off): stop on the phone too
        if (r === "off" && !stale(gen)) {
          const off = withConsent(dbRef.current, false, dbRef.current.location?.ackAt);
          dbRef.current = off;
          setDb(off);
          void refresh();
        }
      });
    },
    [setDb, refresh],
  );
  // the device was wiped (account deletion): what lives only in memory goes too (19 §6.12)
  /** the deleted person's ops (and ownerless ones) leave the outbox and the refused changes in memory; still loading →
   *  applied to what the load brings, before ownerless ops are adopted */
  const dropPersonOps = (me: string | null) => {
    if (!outboxReadyRef.current) forgetOnLoad.current = [...(forgetOnLoad.current ?? []), me];
    // a functional update: the latest outbox, also one that is set but not yet rendered
    setOutbox((prev) => (outboxRef.current = othersOf(prev, me)));
    // the refused money changes: the deleted person's go, other people's stay (review #263 №2)
    if (!rejectedReadyRef.current) forgetRejectedOnLoad.current = [...(forgetRejectedOnLoad.current ?? []), me];
    setRejected((prev) => rejectedOthers(prev, me));
  };
  // the repeat on start that only filters the shared outbox (#911): nothing else of the person signed in now changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onSharedForget(dropPersonOps), []);
  useEffect(
    () =>
      onDeviceForgotten((_wiped, info) => {
        wipedKey.current = cacheKeyRef.current;
        // the outbox keeps other people's ops (rule 6): only the deleted person's go (and old ones without an owner).
        // The deleted person comes with the wipe: the sign-in may already be gone from the store (review #240 №2)
        // told by the wipe (even «not known» = null: never the person signed in now, review #244), else the sign-in
        const me = "userId" in info ? (info.userId ?? null) : (whoRef.current?.userId ?? null);
        dropPersonOps(me);
        setGateCodes({});
        waitingPoints.current = {};
      }),
    [],
  );
  const sendWaitingPoints = useCallback(() => {
    if (!onlineRef.current) return;
    for (const [visitId, w] of Object.entries(waitingPoints.current)) {
      if (stepPending(mine(outboxRef.current), visitId)) continue;
      const { [visitId]: _sent, ...rest } = waitingPoints.current;
      waitingPoints.current = rest;
      sendPoint(w.p, w.source);
    }
  }, [sendPoint]);
  const flushing = useRef(false);
  const flush = useCallback(async () => {
    // the person and the company this send is for: chosen once, sent to the same, never to whoever is signed in by the
    // time an answer comes (review #240 №1); another person or company signs in meanwhile → the loop stops
    const w = whoRef.current;
    if (flushing.current || modeRef.current !== "cloud" || !w || !onlineRef.current) return;
    if (Date.now() < nextTry.current) return; // no network a moment ago: the pause before the next try
    const gen = deviceGeneration();
    if (stale(gen)) return;
    const still = () => sameOwner(whoRef.current, w);
    flushing.current = true;
    let sentAny = false;
    let dropped = false;
    // an op that got the server's error that may be its own (500, a timeout) waits for its pause; the next op that does
    // not need it goes (docs/specs/23 §3). A second such error in one pass — the server as a whole: the queue pauses
    let probed = false;
    const failedNow = new Set<string>();
    const held = (o: OwnedItem) => failedNow.has(o.id) || (opPause.current.get(o.id) ?? 0) > Date.now();
    try {
      for (;;) {
        // in order; what needs a held op waits; the toast's «Отменить» window first: an undone op never reaches the server
        const item = nextToSend(outboxRef.current, w, held, Date.now());
        if (!item) break;
        inFlight.current = item.id;
        setSendingId(item.id);
        try {
          await applyOp(item.op, w.companyId, w.userId);
          inFlight.current = null;
          setSendingId(null);
          // the device was wiped while it was sent: the outbox is not this person's any more — never write it back
          if (stale(gen)) return;
          sentAny = true;
          probed = false; // the server answered: a later 500 is again maybe that op's alone
          opPause.current.delete(item.id);
          answered();
          outboxRef.current = outboxRef.current.filter((x) => x.id !== item.id);
          setOutbox(outboxRef.current);
          if (!still()) break;
        } catch (e) {
          inFlight.current = null;
          setSendingId(null);
          // a send that fails because the account is gone must not put the deleted person's op back (review #231)
          if (stale(gen)) return;
          const msg = e instanceof Error ? e.message : String(e);
          // the server's error that may be this op's alone (500, a timeout) is told by its card «Не отправлено» in our own
          // words — not again as the server's English text in «Ошибка синхронизации» (cloud e2e 114)
          // module_inactive is told by its own card in our words, not as the server's English text (review M5a)
          if (!maybeOpOnly(e) && !isModuleInactive(e) && !isRowConflict(e)) setSyncError(msg);
          // no answer, or the server's «not now» (5xx, 429, an expired sign-in…): not a try — the op stays as it is,
          // the next send waits longer (review #244)
          if (classify(e) !== "refusal") {
            // an op this build does not know is its own trouble, never the server's: it waits (stuck after 10 minutes),
            // the others go past it — two of them in a pass never read as «server unavailable» (review of #910 №2)
            if (isUnknownOp(e)) {
              failedOnce(item, msg);
              failedNow.add(item.id);
              continue;
            }
            if (needsSignIn(e)) void renewSession();
            if (classify(e) === "network") clearFails(item.id);
            // an op already stuck failing again says nothing new about the server (after a restart every stuck op is
            // tried once: two of them must not read as «server unavailable»)
            const wasStuck = !!outboxRef.current.find((x) => x.id === item.id)?.stuck;
            if (maybeOpOnly(e) && wasStuck) {
              failedOnce(item, msg);
              failedNow.add(item.id);
              continue;
            }
            if (!maybeOpOnly(e) || probed) {
              if (maybeOpOnly(e)) failedOnce(item, msg);
              unreachable(e);
              break;
            }
            // maybe this op's alone: it waits (and after 10 minutes is shown as stuck); try the next op without it
            failedOnce(item, msg);
            probed = true;
            failedNow.add(item.id);
            continue;
          }
          // the server said «no»: a try; the last one drops it (never because of the network)
          clearFails(item.id);
          // the module is not active on the server (trial over — founder О2): all its waiting changes go at once with
          // one card that says what was not saved and where to connect it; the core's ops stay (spec 33 П21.1)
          if (item.op.k === "module.op" && isModuleInactive(e)) {
            const mod = item.op.module;
            const { kept, gone } = dropModuleOps(outboxRef.current, mod, w);
            outboxRef.current = kept;
            for (const g of gone) opPause.current.delete(g.id);
            // the phone's copy of the module's data holds what was just dropped: it goes until the next read (a canvas
            // that saves again then sends its measurement whole — review M5a №4)
            const cur = dbRef.current;
            if (cur.moduleData && mod in cur.moduleData) {
              const { [mod]: _gone, ...rest } = cur.moduleData;
              dbRef.current = { ...cur, moduleData: rest };
              setDb(dbRef.current);
            }
            dropped = true;
            setRejected((prev) => moduleRejected(prev, mod, gone.length, msg, Date.now(), w, moduleDef(mod)?.rejectedKey));
            setOutbox(outboxRef.current);
            continue;
          }
          // the module's settings changed by someone else first: this write and the later ones built on it go now, with
          // one card; the truth is read again (review #372 №1: a later write must not overwrite the other change)
          if (item.op.k === "module.saveSettings" && isRowConflict(e)) {
            const mod = item.op.module;
            const { kept, gone } = dropSettingsOps(outboxRef.current, mod, w);
            outboxRef.current = kept;
            for (const g of gone) {
              opPause.current.delete(g.id);
              // their «Отменить» would put back the phone's copy from before them — settings and a version the server
              // does not have (review #374 №2): it does nothing now
              deadOps.current.add(g.id);
            }
            dropped = true;
            setRejected((prev) => settingsRejected(prev, mod, gone.length, msg, Date.now(), w));
            setOutbox(outboxRef.current);
            // the phone's settings and version of this module are not the server's: no new save until this module is read
            // again — now, not after the whole queue (a live op in it holds the company's reload, review #374 №1)
            void rereadSettings(mod, w?.companyId);
            continue;
          }
          // an estimate template changed on another phone first (spec 07 §12.7): this save and the later ones of the same
          // template go now (each was built on this one's version), one card, the truth read again
          if (item.op.k === "est.template.save" && isRowConflict(e)) {
            const { kept, gone } = dropTemplateOps(outboxRef.current, item.op.template.id, w);
            outboxRef.current = kept;
            for (const g of gone) {
              opPause.current.delete(g.id);
              deadOps.current.add(g.id);
            }
            dropped = true;
            const rej = templateRejected(item, msg, Date.now(), w);
            setRejected((prev) => [...freshRejected(prev, Date.now()).filter((x) => x.id !== rej.id), rej]);
            setOutbox(outboxRef.current);
            continue;
          }
          if (item.tries + 1 >= MAX_TRIES) {
            // Will never succeed: drop it and reload the truth from the server. A money change is not dropped
            // silently: it stays as «не записано на сервере» until the person says «Понятно» (docs/specs/23 §3)
            outboxRef.current = outboxRef.current.filter((x) => x.id !== item.id);
            dropped = true;
            const rej = rejectedOf(item, msg, Date.now(), w, (e as { hint?: unknown } | null)?.hint);
            if (rej) setRejected((prev) => [...freshRejected(prev, Date.now()).filter((x) => x.id !== rej.id), rej]);
          } else {
            outboxRef.current = outboxRef.current.map((x) => (x.id === item.id ? { ...x, tries: item.tries + 1, error: msg } : x));
          }
          setOutbox(outboxRef.current);
          break;
        }
      }
    } finally {
      flushing.current = false;
      sendWaitingPoints();
    }
    // a dropped op left the phone ahead of the server: reload the truth
    if (stale(gen) || !still()) return;
    if ((sentAny && !pendingLive()) || dropped) await refresh();
  }, [setOutbox, setRejected, refresh, sendWaitingPoints]);

  useEffect(() => {
    if (mode !== "cloud") return;
    refresh();
    const tick = setInterval(() => {
      if (mine(outboxRef.current).length) flush();
    }, 1500);
    const poll = setInterval(refresh, 30_000);
    // the network is back (the browser says so): no waiting out the pause — send now
    const back = () => {
      nextTry.current = 0;
      if (mine(outboxRef.current).length) void flush();
    };
    const g = globalThis as { addEventListener?: (t: string, f: () => void) => void; removeEventListener?: (t: string, f: () => void) => void };
    g.addEventListener?.("online", back);
    const offActive = onAppActive(back); // the phone: back in the app
    return () => {
      clearInterval(tick);
      clearInterval(poll);
      g.removeEventListener?.("online", back);
      offActive();
    };
  }, [mode, refresh, flush]);

  /** an undo that runs a plan: the store's value once, then the rest — true; too late — false; nothing to take back —
   *  undefined (the toast just closes) */
  const runnable = useCallback(
    (plan: UndoPlan): GuardedUndo => {
      const undo: GuardedUndo = () => {
        const r = plan(dbRef.current);
        if (r === "dead") return undefined;
        if (r === "done" || r === null) return false;
        dbRef.current = r.value;
        setDb(dbRef.current);
        r.commit();
        return true;
      };
      undoPlans.set(undo, plan);
      return undo;
    },
    [setDb],
  );
  /** «Отменить» of several actions made together (a new client and its name parts, a job and its visit): all of them go
   *  back or none (remark 1 of the director's review of #1244) */
  const undoTogether = useCallback((undos: readonly unknown[]): GuardedUndo => runnable(planTogether(undos)), [runnable]);

  /* ---------- mutations ---------- */
  /** Apply locally; in cloud mode record the op; return undo. */
  const mutate = useCallback(
    (label: string, fn: (d: DB) => DB, op?: Op): GuardedUndo => {
      const prev = dbRef.current;
      const next = fn(prev);
      // the director's review of #1244 Б3: the store shows normalizeDB(next) — a record the action writes that the render
      // fills in (a demo client's number, a source) differs from it at once, and «Отменить» sees a conflict and is dead.
      // Every store test runs every action through this check (test/undoOwnStore.test.ts makes one of each kind)
      if (process.env.NODE_ENV === "test") assertNormalized(label, next, modeRef.current);
      dbRef.current = next;
      setDb(next);
      let qid: string | null = null;
      let oid: string | null = null;
      /** a waiting op this one replaced (module.op coalesceKey): «Отменить» puts it back in its place */
      let replaced: OwnedItem | null = null;
      if (modeRef.current === "cloud" && op) {
        oid = uid();
        // an upsert that cannot tell «new» by itself: what it makes is what was not on the phone before (outboxDeps)
        const made = madeOnQueue(op, prev);
        const item: OwnedItem = { id: oid, op, at: new Date().toISOString(), tries: 0, ...(whoRef.current ? { owner: whoRef.current } : {}), ...(made ? { made } : {}) };
        const at = coalesceAt(outboxRef.current, op, whoRef.current, inFlight.current);
        if (at >= 0) {
          replaced = outboxRef.current[at]!;
          outboxRef.current = outboxRef.current.map((x, i) => (i === at ? coalesced(replaced!, item) : x));
        } else outboxRef.current = [...outboxRef.current, item];
        setOutbox(outboxRef.current);
      } else if (!onlineRef.current) {
        qid = uid();
        setQueue((q) => [...q, { id: qid!, label, at: new Date().toISOString() }]);
      }
      let done = false;
      return runnable((cur) => {
        // a second «Отменить» of the same action: nothing more to take back
        if (done) return "done";
        // dropped by the server as built on a lost base: nothing to take back, the toast just closes (review #374 №2)
        if (oid && deadOps.current.has(oid)) return "dead";
        // already on its way to the server or there (sent, being sent, or folded into a later op): taking it back on the
        // phone only would be undone by the next read — too late (the director's 4th review of #1244)
        if (oid && (inFlight.current === oid || !outboxRef.current.some((x) => x.id === oid))) return null;
        // #1193 п.6: only this action's own changes go back — what came after it (another action, the server's copy) stays;
        // all or nothing: when a part of it was changed since, nothing is taken back and its op stays in the queue (the
        // toast says it is too late — never a half undo, the director's review of #1244 Б2)
        const r = undoOwn(prev, next, cur);
        if (!r.ok) return null;
        return {
          value: r.value,
          commit: () => {
            done = true;
            if (qid) setQueue((q) => q.filter((x) => x.id !== qid));
            if (oid) {
              outboxRef.current = replaced ? outboxRef.current.map((x) => (x.id === oid ? replaced! : x)) : outboxRef.current.filter((x) => x.id !== oid);
              setOutbox(outboxRef.current);
            }
          },
        };
      });
    },
    [runnable, setQueue, setOutbox],
  );

  const patchVisit = (d: DB, id: ID, fn: (v: Visit) => Visit): DB => ({
    ...d,
    visits: d.visits.map((v) => (v.id === id ? fn(v) : v)),
  });
  const patchItems = (d: DB, visitId: ID, itemIds: ID[], fn: (c: ChecklistItem) => ChecklistItem): DB =>
    patchVisit(d, visitId, (v) => ({ ...v, checklist: v.checklist.map((c) => (itemIds.includes(c.id) ? fn(c) : c)) }));
  const customerOfJob = (d: DB, jobId: ID) => {
    const job = findJob(d, jobId);
    return job?.customerId ?? d.properties.find((p) => p.id === job?.propertyId)?.customerId ?? "";
  };

  /** Payment on an invoice (capped at its balance by the engine). Deposit invoice paid → estimate deposit paid. */
  const recordPayment = (invoiceId: ID, amountCents: number, method: PaymentMethod, reference?: string, fromClient?: boolean): Undo => {
    const d0 = dbRef.current;
    const inv = d0.invoices.find((i) => i.id === invoiceId);
    if (!inv) return () => {};
    const amount = acceptPayment(inv, amountCents);
    if (amount <= 0) return () => {};
    const now = new Date().toISOString();
    // who took it (wave 8): the person recording it; a client paying on /p/ is nobody on the team
    const payment: Payment = { id: uid(), invoiceId, customerId: inv.customerId, amountCents: amount, method, at: now, reference: reference?.trim() || undefined, receivedBy: fromClient ? undefined : d0.me };
    const job = findJob(d0, inv.jobId);
    const est = inv.kind === "deposit" && job?.estimateId ? d0.estimates.find((e) => e.id === job.estimateId) : undefined;
    const fullyPaid = inv.paidCents + amount >= inv.totalCents;
    return mutate(
      "payment.record",
      (d) => {
        let next = withPayment(d, payment, modeRef.current === "demo");
        if (fromClient && !est) {
          next = {
            ...next,
            notices: [
              { id: uid(), kind: "invoice.paid", invoiceId: inv.id, jobId: inv.jobId, customer: d.customers.find((c) => c.id === inv.customerId)?.name ?? "", depositCents: amount, totalCents: amount, at: now },
              ...next.notices,
            ],
          };
        }
        if (est && fullyPaid) {
          next = {
            ...next,
            estimates: next.estimates.map((e) => (e.id === est.id ? { ...e, depositPaidAt: now } : e)),
            notices: [
              { id: uid(), kind: "deposit.paid", estimateId: est.id, invoiceId: inv.id, customer: d.customers.find((c) => c.id === est.customerId)?.name ?? "", depositCents: inv.totalCents, at: now, read: !fromClient },
              ...next.notices,
            ],
          };
        }
        return next;
      },
      // sales take no payment on an invoice (13 §4; the database since #868), but the whole deposit of an estimate — yes
      // (17, T73): it goes through the server's deposit function, which pays the balance it knows. The office keeps
      // payment.record (its reference, a part of the deposit)
      est && fullyPaid && job && role === "sales"
        ? {
            k: "estimate.deposit", id: est.id, jobId: job.id, invoiceId, paymentId: payment.id, method, customerId: est.customerId, propertyId: est.propertyId,
            title: est.title, totalCents: est.totalCents, depositCents: est.depositCents ?? inv.totalCents, dueDate: companyToday(Date.parse(now)),
          }
        : { k: "payment.record", id: payment.id, invoiceId, customerId: inv.customerId, amountCents: amount, method, reference: payment.reference },
    );
  };

  // what leaves with a discarded op: by kind; money — also when the op itself is money
  const leavingOf = (self: OwnedItem, gone: OwnedItem[]) => {
    const sum = leavingSummary(gone.map((o) => o.op.k));
    return { leaving: gone.length, leavingKinds: sum.kinds, leavingMoney: [self, ...gone].some((o) => isMoneyOp(o, MONEY_KINDS)) };
  };
  const unsentAll = mode === "cloud" ? unsentOf(outbox, who?.userId ?? null) : 0;
  const stuckOps: StuckOp[] =
    mode === "cloud"
      ? mineOf(outbox, who)
          .filter((o) => o.stuck)
          .map((o) => ({
            id: o.id,
            kind: o.op.k,
            since: o.failSince ?? o.at,
            waiting: waitingFor(outbox, who, o.id),
            ...leavingOf(o, dependentsOf(outbox, who, o.id)),
            sending: sendingId === o.id,
          }))
      : [];
  // «Повторить сейчас»: only its pause goes — it stays «stuck» (and its card stays) until the server takes it
  // (review #259 №2); while it is being sent, nothing to do
  const retryOp = (id: ID) => {
    if (inFlight.current === id) return;
    opPause.current.delete(id);
    nextTry.current = 0;
    void flush();
  };
  const discardOp = (id: ID): boolean => {
    const gone = new Set([id, ...dependentsOf(outboxRef.current, whoRef.current, id).map((o) => o.id)]);
    // one of them is on its way to the server: it would get there although the card says it will not (review #259 №5)
    if (inFlight.current && gone.has(inFlight.current)) return false;
    outboxRef.current = outboxRef.current.filter((x) => !gone.has(x.id));
    setOutbox(outboxRef.current);
    gone.forEach((x) => opPause.current.delete(x));
    // the phone showed the change as done: the server's truth again
    void refresh();
    return true;
  };
  const rejectedOps = mode === "cloud" ? rejectedMine(rejected, who) : [];
  const dismissRejected = (id: ID): Undo => {
    const was = rejected.find((x) => x.id === id);
    setRejected((prev) => prev.filter((x) => x.id !== id));
    return () => {
      if (was) setRejected((prev) => (prev.some((x) => x.id === was.id) ? prev : [...prev, was]));
    };
  };
  const unsentInCompany = (companyId: ID) => unsentInOf(outbox, auth.userId ?? null, companyId).length;
  // like discardOp: refused while one of them is on its way to the server (it would get there although the card says no)
  const dropUnsentIn = (companyId: ID): boolean => {
    const gone = new Set(unsentInOf(outboxRef.current, auth.userId ?? null, companyId).map((o) => o.id));
    if (inFlight.current && gone.has(inFlight.current)) return false;
    outboxRef.current = withoutUnsentIn(outboxRef.current, auth.userId ?? null, companyId);
    setOutbox(outboxRef.current);
    gone.forEach((x) => opPause.current.delete(x));
    return true;
  };
  const pendingQueue: QueuedAction[] =
    mode === "cloud" ? mineOf(outbox, who).map((o) => ({ id: o.id, label: o.op.k, at: o.at })) : queue;

  /** wave 6-2: the change and the op are pure (features/comms/contactEvents.ts); a call always has its outcome */
  const touchLead = (id: ID, t: LeadTouch): Undo => {
    const ids = { activityId: uid(), statusId: uid(), at: new Date().toISOString() };
    return mutate("lead.touch", (d) => leadTouchNext(d, id, t, ids), leadTouchOp(dbRef.current, id, t, ids));
  };

  /** The lead's client and property; makes a prospect client + property the first time (S3). */
  const leadTarget = (leadId: ID): { customerId: ID; propertyId: ID; undo: Undo } | null => {
    const d0 = dbRef.current;
    const l = d0.leads.find((x) => x.id === leadId);
    if (!l) return null;
    if (l.customerId) {
      const propertyId = leadEstimatePropertyId(d0, l);
      if (propertyId) return { customerId: l.customerId, propertyId, undo: () => {} };
    }
    const ids = { customerId: uid(), contactId: uid(), propertyId: uid() };
    const now = new Date().toISOString();
    const undo = mutate(
      "lead.prospect",
      (d) => ({
        ...d,
        // the lead's people become the client's (S3; the server moves them the same way, app.move_lead_people)
        customers: [...d.customers, { id: ids.customerId, number: modeRef.current === "demo" ? nextClientNumber(d) : undefined, name: l.name, phone: l.phone, email: l.email, sourceId: l.sourceId, balanceCents: 0, status: "prospect", people: clientPeopleFromLead(l, ids.contactId) }],
        properties: [...d.properties, { id: ids.propertyId, customerId: ids.customerId, address: l.address ?? "", city: l.city, stories: 1 }],
        leads: d.leads.map((x) => (x.id === leadId ? { ...x, customerId: ids.customerId, propertyId: ids.propertyId, lastActivityAt: now } : x)),
      }),
      { k: "lead.prospect", leadId, ...ids, name: l.name, phone: l.phone, email: l.email, sourceId: l.sourceId, address: l.address ?? "", city: l.city },
    );
    return { customerId: ids.customerId, propertyId: ids.propertyId, undo };
  };

  /** all people of a client in one save (one RPC on the server) */
  const saveCustomerPeople = (id: ID, people: Person[]): Undo => {
    const clean = cleanPeople(people, uid);
    const main = clean[0];
    const phone = main?.phones.find((p) => p.primary)?.number ?? main?.phones[0]?.number ?? "";
    const email = main?.emails.find((e) => e.primary)?.address ?? main?.emails[0]?.address;
    return mutate(
      "customer.people",
      (d) => ({ ...d, customers: d.customers.map((c) => (c.id === id ? { ...c, people: clean, phone, email } : c)) }),
      { k: "customer.people", id, people: clean },
    );
  };

  /** a lead's people for its new client: the main person is the client's main contact (the server merges them, same id) */
  const clientPeopleFromLead = (l: Lead, contactId: ID): Person[] => cleanPeople(leadPeopleOf(l), uid).map((p, i) => (i === 0 ? { ...p, id: contactId } : p));

  /** a plain field change on a lead (same path as "edit lead") */
  const patchLead = (id: ID, patch: LeadPatch): Undo => {
    const l0 = dbRef.current.leads.find((x) => x.id === id);
    return mutate(
      "lead.update",
      (d) => ({ ...d, leads: d.leads.map((x) => (x.id === id ? { ...x, ...patch, lastActivityAt: new Date().toISOString() } : x)) }),
      { k: "lead.update", id, cols: leadCols(patch, l0) },
    );
  };

  const addPhotoFn = (visitId: ID, kind: "before" | "after", uri?: string): Undo => {
    const id = uid();
    const v = dbRef.current.visits.find((x) => x.id === visitId);
    return mutate(
      "photo.add",
      (d) => patchVisit(d, visitId, (x) => ({ ...x, photos: [...x.photos, { id, kind, uri }] })),
      v ? { k: "photo.add", id, visitId, jobId: v.jobId, stage: kind, uri } : undefined,
    );
  };
  /**
   * a checklist change: locally at once; to the server one row's op — or, on a server before the checklist migration
   * (db.checklistLegacy), the old whole list (rule 16). `legacy: false` — nothing the old server could keep.
   */
  const chkMutate = (label: string, visitId: ID, fn: (d: DB) => DB, op: Op, legacy = true): Undo => {
    if (!dbRef.current.checklistLegacy) return mutate(label, fn, op);
    const list = fn(dbRef.current).visits.find((v) => v.id === visitId)?.checklist ?? [];
    return mutate(label, fn, legacy ? { k: "visit.checklist", visitId, checklist: list.map((c) => ({ id: c.id, label: c.label, done: c.done })) } : undefined);
  };
  const visitOf = (visitId: ID) => dbRef.current.visits.find((x) => x.id === visitId);
  /** nothing to take back: the toast just closes */
  const noop: GuardedUndo = () => undefined;
  /** spec 37: an order on the phone and in the queue (header, lines, the lines taken out) */
  const putOrder = (o0: PurchaseOrder, removedLineIds: ID[]): Undo => {
    // the server moves row_version by one per save (a new order: the insert, then the update → 2) — mirrored here so a
    // marking after it is not refused as stale (po_receive p_row_version); unknown stays unknown
    const prev = (dbRef.current.purchaseOrders ?? []).find((x) => x.id === o0.id);
    const o: PurchaseOrder = prev ? (prev.rowVersion !== undefined ? { ...o0, rowVersion: prev.rowVersion + 1 } : o0) : { ...o0, rowVersion: 2 };
    return mutate(
      "po.save",
      (d) => {
        const list = d.purchaseOrders ?? [];
        return { ...d, purchaseOrders: list.some((x) => x.id === o.id) ? list.map((x) => (x.id === o.id ? o : x)) : [o, ...list] };
      },
      { k: "po.save", order: o, removedLineIds },
    );
  };
  /**
   * spec 36: change several price-list items at once (a supplier's tax or its new name) — each a catalog.save with its
   * cost change and the phone's history row; «Отменить» takes them all back from the phone and the queue, or none
   * (#1244 Б1).
   */
  const saveItemsBoth = (pairs: { prev: CatalogItem; next: CatalogItem }[]): GuardedUndo => {
    if (!pairs.length) return noop;
    const go = (from: CatalogItem, to: CatalogItem, at: string) => {
      const hist = dbRef.current.costsVisible === false ? null : localHistoryEntry(from, to, uid(), at);
      return mutate(
        "catalog.save",
        (d) => ({ ...d, catalog: d.catalog.map((c) => (c.id === to.id ? to : c)), ...(hist ? { costHistory: [hist, ...(d.costHistory ?? [])] } : {}) }),
        { k: "catalog.save", item: to, costs: catalogCostChange(from, to) },
      );
    };
    const at = new Date().toISOString();
    // «Отменить» takes back the store's own changes, all or none (the director's 4th review of #1244 Б1): a reverse op
    // wrote each item whole from before and could put back over a price the server brought meanwhile; the ops are still
    // in the queue while the toast is up (SEND_AFTER_MS is longer than it)
    return undoTogether(pairs.map(({ prev, next }) => go(prev, next, at)));
  };
  const checkItemFn = (visitId: ID, itemId: ID, done: boolean): Undo => {
    const v = visitOf(visitId);
    const item = v?.checklist.find((c) => c.id === itemId);
    // a photo item is done by its photo, not by a tick; the server would refuse what the role may not (it holds the queue)
    if (!v || !item || itemKind(item) === "photo" || !canTick(role, v, done)) return noop;
    const at = new Date().toISOString();
    const me = dbRef.current.me;
    return chkMutate(
      "check.toggle",
      visitId,
      (d) => patchItems(d, visitId, [itemId], (c) => (done ? { ...c, done: true, doneBy: me, doneAt: at, na: undefined } : { ...c, done: false, doneBy: undefined, doneAt: undefined })),
      { k: "chk.item.set", visitId, itemIds: [itemId], done, at },
    );
  };
  const addVisitItemFn = (visitId: ID, label: string, required: boolean, kind: ChecklistItemKind = "check"): Undo => {
    const v = visitOf(visitId);
    const text = cleanText(label);
    if (!v || !text || !canAddItem(role, v, required) || v.checklist.length >= 200) return noop;
    const id = uid();
    const position = Math.max(-1, ...v.checklist.map((c, i) => c.position ?? i)) + 1;
    const item: ChecklistItem = { id, label: text, done: false, kind, required, addedBy: dbRef.current.me, position };
    return chkMutate("check.add", visitId, (d) => patchVisit(d, visitId, (x) => ({ ...x, checklist: [...x.checklist, item] })), {
      k: "chk.item.add", item: { id, visitId, position, label: text, kind, required },
    });
  };

  /**
   * The snapshot of the company's templates for a new visit (S4, S9; docs/specs/08 §5, §11.7 №7): items and the photo
   * minimums of their templates. Only the office makes it (a tech does not book; the server would refuse the items).
   */
  const snapshotFor = (kind: ChecklistVisitKind, services: ID[]): { items: ChecklistItem[]; mins?: { before?: number; after?: number } } => {
    const d0 = dbRef.current;
    if (!canEditTemplates(role)) return { items: [] };
    // a module switched off puts nothing into a new visit (#607 review)
    const templates = templatesOfActiveModules(d0.checklistTemplates ?? [], (k) => moduleActive(d0.company, k));
    // 200 items per visit is the server's limit (54000): more would be refused and hold the queue
    const items = checklistFor({ kind, catalogItemIds: services }, templates, () => uid()).slice(0, 200).map((c) => ({ ...c, addedBy: d0.me }));
    return { items, mins: snapshotPhotoMins(items, templates) };
  };
  /** the snapshot's ops after the op that makes the visit: each item waits for the visit (outboxDeps refs) */
  const snapshotOps = (visitId: ID, snap: { items: ChecklistItem[]; mins?: { before?: number; after?: number } }): Undo => {
    if (snap.items.length === 0) return noop;
    const same = (d: DB) => d;
    if (dbRef.current.checklistLegacy) {
      // an old server: the list goes as the old whole array; the minimums stay on the phone
      return mutate("check.snapshot", same, { k: "visit.checklist", visitId, checklist: snap.items.map((c) => ({ id: c.id, label: c.label, done: false })) });
    }
    const undos = snap.items.map((c) =>
      mutate("check.add", same, {
        k: "chk.item.add",
        item: { id: c.id, visitId, position: c.position ?? 0, label: c.label, kind: itemKind(c), required: c.required ?? true, ...(c.hint ? { hint: c.hint } : {}), ...(c.templateId ? { templateId: c.templateId, templateName: c.templateName } : {}) },
      }),
    );
    if (snap.mins) undos.push(mutate("check.mins", same, { k: "chk.visit.mins", visitId, before: snap.mins.before ?? null, after: snap.mins.after ?? null }));
    return undoTogether(undos);
  };

  const value = useMemo<StoreCtx>(
    () => ({
      db,
      mode,
      companyName: company?.companyName ?? null,
      role,
      setRole,
      availableRoles,
      online: online && (mode !== "cloud" || reachable),
      link: !online ? "offline" : mode === "cloud" ? link : "ok",
      queue: pendingQueue,
      unsentAll,
      notSavedOnDevice,
      syncError,
      stuckOps,
      retryOp,
      discardOp,
      rejectedOps,
      dismissRejected,
      unsentIn: unsentInCompany,
      dropUnsentIn,
      refresh,
      loading,
      setOnline: (v) => {
        setOnlineState(v);
        onlineRef.current = v;
        let sent = 0;
        if (v) {
          sent = pendingQueue.length;
          if (mode === "cloud") flush();
          else setQueue([]);
        }
        return sent;
      },
      advanceVisit: (id) => {
        const v = dbRef.current.visits.find((x) => x.id === id);
        // an inspection ends with "done" after "on site" (S10, docs/specs/03 §4.1); a job visit walks VISIT_STEPS
        // «on the way»: the phone time goes with the step, so the offline queue does not move it (docs/specs/03 П3c)
        const { step, at } = stepChange(v, new Date().toISOString());
        return mutate(
          "visit.step",
          (d) => {
            const next = patchVisit(d, id, (x) => ({ ...x, step, enRouteAt: at ?? x.enRouteAt, closed: step === "done" ? true : x.closed }));
            // S10: the first visit «На месте» starts the job (the server: the visit trigger, migration 20261106045000)
            return v?.jobId ? { ...next, jobs: next.jobs.map((j) => (j.id === v.jobId ? { ...j, status: jobStatusAfterStep(j.status, step) } : j)) } : next;
          },
          { k: "visit.step", visitId: id, to: step, ...(at ? { at } : {}) },
        );
      },
      addPhoto: addPhotoFn,
      toggleCheck: (visitId, itemId) => {
        const item = dbRef.current.visits.find((x) => x.id === visitId)?.checklist.find((c) => c.id === itemId);
        return checkItemFn(visitId, itemId, !item?.done);
      },
      checkItem: checkItemFn,
      skipItems: (visitId, itemIds, reason, text) => {
        const v = visitOf(visitId);
        if (!v || !canSkip(role, v)) return noop;
        const ids = itemIds.filter((id) => v.checklist.some((c) => c.id === id));
        if (!ids.length) return noop;
        const at = new Date().toISOString();
        const me = dbRef.current.me;
        const note = cleanText(text) || undefined;
        return chkMutate(
          "check.skip",
          visitId,
          (d) => patchItems(d, visitId, ids, (c) => ({ ...c, done: false, doneBy: undefined, doneAt: undefined, na: { ...(reason ? { reason } : {}), ...(note ? { text: note } : {}), by: me, at } })),
          { k: "chk.item.set", visitId, itemIds: ids, done: false, skipped: true, naReason: reason ?? null, naText: note ?? null, at },
        );
      },
      attachItemPhoto: (visitId, itemId, uri) => {
        const v = visitOf(visitId);
        const item = v?.checklist.find((c) => c.id === itemId);
        if (!v || !item || !canAttachPhoto(role) || (item.photoIds?.length ?? 0) >= PHOTOS_PER_ITEM_MAX) return noop;
        // the photo first: the server takes only a photo of this visit on an item, so the item's op waits behind it
        const undoPhoto = addPhotoFn(visitId, photoStageOf(v), uri);
        const photoId = visitOf(visitId)?.photos.at(-1)?.id;
        if (!photoId) return undoPhoto;
        const at = new Date().toISOString();
        const me = dbRef.current.me;
        const undoItem = chkMutate(
          "check.photo",
          visitId,
          (d) => patchItems(d, visitId, [itemId], (c) => ({ ...c, photoIds: [...(c.photoIds ?? []), photoId], done: true, doneBy: c.done ? c.doneBy : me, doneAt: c.done ? c.doneAt : at, na: undefined })),
          { k: "chk.item.set", visitId, itemIds: [itemId], done: true, addPhotoId: photoId, at },
          // the old server has no photos of items: the photo itself went
          false,
        );
        return undoTogether([undoPhoto, undoItem]);
      },
      addVisitItem: addVisitItemFn,
      removeVisitItem: (visitId, itemId) => {
        const v = visitOf(visitId);
        const item = v?.checklist.find((c) => c.id === itemId);
        if (!v || !item || !canRemoveItem(role, dbRef.current.me, v, item)) return noop;
        return chkMutate("check.remove", visitId, (d) => patchVisit(d, visitId, (x) => ({ ...x, checklist: x.checklist.filter((c) => c.id !== itemId) })), { k: "chk.item.remove", id: itemId, visitId });
      },
      editVisitItem: (visitId, itemId, patch) => {
        const v = visitOf(visitId);
        const item = v?.checklist.find((c) => c.id === itemId);
        if (!v || !item || !canEditVisitItems(role, v)) return noop;
        const label = patch.label === undefined ? undefined : cleanText(patch.label);
        // an empty text or «Обязательный» off by the dispatcher: the server would refuse it and hold the queue
        if (label === "" || (patch.required !== undefined && patch.required !== itemRequired(item) && !canSetRequired(role, patch.required))) return noop;
        const next = { ...(label !== undefined && label !== item.label ? { label } : {}), ...(patch.required !== undefined && patch.required !== itemRequired(item) ? { required: patch.required } : {}) };
        if (!Object.keys(next).length) return noop;
        return chkMutate("check.edit", visitId, (d) => patchItems(d, visitId, [itemId], (c) => ({ ...c, ...next })), { k: "chk.item.edit", id: itemId, visitId, ...next });
      },
      moveVisitItem: (visitId, itemId, dir) => {
        const v = visitOf(visitId);
        if (!v || !canEditVisitItems(role, v)) return noop;
        const moves = moveItem(v.checklist, itemId, dir);
        if (!moves.length) return noop;
        const pos = new Map(moves.map((m) => [m.id, m.position]));
        const apply = (d: DB) =>
          patchVisit(d, visitId, (x) => {
            const list = x.checklist.map((c) => (pos.has(c.id) ? { ...c, position: pos.get(c.id)! } : c));
            return { ...x, checklist: [...list].sort((p, q) => (p.position ?? 0) - (q.position ?? 0)) };
          });
        if (dbRef.current.checklistLegacy) return chkMutate("check.move", visitId, apply, { k: "chk.item.edit", id: itemId, visitId });
        return undoTogether(moves.map((m, i) => mutate("check.move", i === 0 ? apply : (d) => d, { k: "chk.item.edit", id: m.id, visitId, position: m.position })));
      },
      addVisitTemplate: (visitId, templateId) => {
        const d0 = dbRef.current;
        const v = visitOf(visitId);
        const tpl = (d0.checklistTemplates ?? []).find((x) => x.id === templateId);
        if (!v || !tpl || !canEditVisitItems(role, v)) return noop;
        const items = itemsFromTemplate(v, tpl, () => uid()).map((c) => ({ ...c, addedBy: d0.me }));
        if (!items.length) return noop;
        // the template's minimums raise the visit's, never lower them (§3.1)
        const raised = snapshotPhotoMins([...v.checklist, ...items], d0.checklistTemplates ?? []);
        const mins = raised || v.photoMins
          ? { before: Math.max(raised?.before ?? 0, v.photoMins?.before ?? 0) || undefined, after: Math.max(raised?.after ?? 0, v.photoMins?.after ?? 0) || undefined }
          : undefined;
        const minsChanged = !!mins && (mins.before !== v.photoMins?.before || mins.after !== v.photoMins?.after);
        const apply = (d: DB) => patchVisit(d, visitId, (x) => ({ ...x, checklist: [...x.checklist, ...items], ...(minsChanged ? { photoMins: mins } : {}) }));
        if (d0.checklistLegacy) return chkMutate("check.template", visitId, apply, { k: "visit.checklist", visitId, checklist: [] });
        const undos = items.map((c, i) =>
          mutate("check.add", i === 0 ? apply : (d) => d, {
            k: "chk.item.add",
            item: { id: c.id, visitId, position: c.position ?? 0, label: c.label, kind: itemKind(c), required: itemRequired(c), ...(c.hint ? { hint: c.hint } : {}), templateId: tpl.id, templateName: c.templateName },
          }),
        );
        if (minsChanged && mins) undos.push(mutate("check.mins", (d) => d, { k: "chk.visit.mins", visitId, before: mins.before ?? null, after: mins.after ?? null }));
        return undoTogether(undos);
      },
      reviewVisitMissed: (visitId) => {
        // an old server has no «Просмотрено» (and no card: attention.ts) — nothing that would come back after a reload
        if (!visitOf(visitId) || !canReview(role) || dbRef.current.checklistLegacy) return noop;
        const at = new Date().toISOString();
        const me = dbRef.current.me;
        mutate("check.review", (d) => patchVisit(d, visitId, (x) => ({ ...x, checklistReviewedAt: at, checklistReviewedBy: me })), { k: "chk.visit.review", visitId, at });
        // «Отменить» (rule 5): the op may already be on the server (the outbox goes every 1.5 s) — a reverse op, not a
        // take-back of the queue; while both wait they go in order, the last one wins
        return () =>
          void mutate("check.review", (d) => patchVisit(d, visitId, (x) => ({ ...x, checklistReviewedAt: undefined, checklistReviewedBy: undefined })), { k: "chk.visit.review", visitId, at: null });
      },
      saveChecklistTemplate: (t, opts) => {
        const clean = cleanTemplate(t);
        // no name: the server would refuse it; the old server has no templates
        if (!clean || !canEditTemplates(role) || dbRef.current.checklistLegacy) return noop;
        // a starter (ifNew) already on the phone: nothing (a second tap, a second phone's after the next read)
        if (opts?.ifNew && (dbRef.current.checklistTemplates ?? []).some((x) => x.id === clean.id)) return noop;
        return mutate(
          "checklist.template",
          (d) => {
            const list = d.checklistTemplates ?? [];
            return { ...d, checklistTemplates: list.some((x) => x.id === clean.id) ? list.map((x) => (x.id === clean.id ? clean : x)) : [...list, clean] };
          },
          { k: "chk.template.save", template: clean, ...(opts?.ifNew ? { ifNew: true } : {}) },
        );
      },
      setVisitSettings: (patch) => {
        if (!canEditVisitSettings(role) || dbRef.current.checklistLegacy) return noop;
        const settings = visitSettingsOf({ visitSettings: { ...visitSettingsOf(dbRef.current.company), ...patch } });
        return mutate("company.visitSettings", (d) => (d.company ? { ...d, company: { ...d.company, visitSettings: settings } } : d), { k: "company.visitSettings", settings });
      },
      // a photo removed leaves its items too: a photo item without a live photo is «not done» again (itemDone)
      removePhoto: (visitId, photoId) =>
        mutate(
          "photo.remove",
          (d) => patchVisit(d, visitId, (x) => ({
            ...x,
            photos: x.photos.filter((p) => p.id !== photoId),
            checklist: x.checklist.map((c) => (c.photoIds?.includes(photoId) ? { ...c, photoIds: c.photoIds.filter((p) => p !== photoId) } : c)),
          })),
          { k: "photo.remove", id: photoId },
        ),
      addCheckItem: (visitId, label) => addVisitItemFn(visitId, label, false),
      signVisit: (visitId, path) =>
        mutate("visit.sign", (d) => patchVisit(d, visitId, (v) => ({ ...v, signature: path, step: "signed" })), { k: "visit.sign", visitId, svg: path }),
      payVisit: (visitId, method) => {
        const d0 = dbRef.current;
        const v = d0.visits.find((x) => x.id === visitId);
        if (!v) return () => {};
        const invoiceId = uid();
        const paymentId = uid();
        // an inspection (no job) takes no payment
        const customerId = v.jobId ? customerOfJob(d0, v.jobId) : "";
        const now = new Date().toISOString();
        // the amount is the same rule as the server's record_visit_payment (#757, audit A-17 / B-05): the job's final
        // invoice takes its balance; with none, a new final invoice bills what is not yet billed (a deposit off)
        const job = v.jobId ? findJob(d0, v.jobId) : undefined;
        // #1193 п.1: the contract's own invoices (a standalone one is outside the contract) — as the server
        const jobInvoices = v.jobId ? contractInvoices(d0, v.jobId) : [];
        // the same amount the screen showed (features/visitDue.ts) — the money in the tech's hand
        const plan = job ? visitPayment(job.amountCents, jobInvoices) : { amountCents: 0, into: "none" as const, overCents: 0 };
        // the final invoice the engine counted (void ones never reach the phone: repo.ts loads live invoices only)
        const finalInv = plan.into === "final" ? jobInvoices.find((i) => i.kind === "final") : undefined;
        const finalId = finalInv?.id ?? invoiceId;
        // the op always carries a new invoice id: the server uses it only when it makes the final invoice (no final yet)
        return mutate(
          "visit.pay",
          (d) => {
            const next = patchVisit(d, visitId, (x) => ({ ...x, step: "paid", payment: { method, amountCents: plan.amountCents, at: now } }));
            if (!customerId || plan.into === "none" || plan.amountCents <= 0) return next;
            // paying does not close the job: «Работа выполнена?» goes to the office (S10, 17-job §4). The money is a
            // payment with its receipt, as «Принять оплату» (#1103: the invoice was marked paid with no payment — «Получено»
            // and the client's «Оплатил» stayed behind); its id is the op's: the server writes that payment (record_visit_payment)
            const billed =
              plan.into === "final"
                ? next
                : withTaxSplit({ ...next, invoices: [...next.invoices, { id: invoiceId, customerId, jobId: v.jobId!, totalCents: plan.amountCents, paidCents: 0, dueDate: now, method, kind: "final" as const }] }, invoiceId);
            return withPayment(
              billed,
              // the invoice's client, as the server writes it (record_visit_payment, #857 С4) — review of #1103 №3
              { id: paymentId, invoiceId: finalId, customerId: finalInv?.customerId ?? customerId, amountCents: plan.amountCents, method, at: now, receivedBy: d.me },
              modeRef.current === "demo",
            );
          },
          plan.amountCents > 0 && customerId
            ? { k: "visit.pay", visitId, jobId: v.jobId!, customerId, invoiceId, paymentId, amountCents: plan.amountCents, method, dueDate: companyToday(Date.parse(now)) }
            : // nothing to pay: the visit still ends on the server (it stayed open there and the stores drifted)
              { k: "visit.step", visitId, to: "done" },
        );
      },
      replyLead: (id) => touchLead(id, { kind: "reply" }),
      touchLead: (id, kind) => touchLead(id, { kind }),
      callResult: (id, outcome) => touchLead(id, { kind: "call", call: { outcome } }),
      logMessage: (m) => {
        const ids = { activityId: uid(), statusId: uid(), at: new Date().toISOString() };
        return mutate(m.subjectType === "lead" ? "lead.touch" : "activity.message", (d) => messageNext(d, m, ids), messageOp(dbRef.current, m, ids));
      },
      logCall: (c) => {
        const ids = { activityId: uid(), statusId: uid(), at: new Date().toISOString() };
        return mutate(c.subjectType === "lead" ? "lead.touch" : "activity.call", (d) => callNext(d, c, ids), callOp(dbRef.current, c, ids));
      },
      setLeadInterest: (id, interest) => patchLead(id, { interest }),
      snoozeLead: (id, until, reason) => patchLead(id, { snoozedUntil: until, snoozeReason: reason?.trim() || undefined }),
      unsnoozeLead: (id) => patchLead(id, { snoozedUntil: undefined, snoozeReason: undefined }),
      markReminded: (id) => patchLead(id, { remindedAt: new Date().toISOString(), askAgainAt: undefined }),
      remindInvoice: (invoiceId, channel) => {
        const inv = dbRef.current.invoices.find((i) => i.id === invoiceId);
        if (!inv) return () => {};
        const activityId = uid();
        const at = new Date().toISOString();
        return mutate(
          "invoice.remind",
          (d) => ({ ...d, activities: [{ id: activityId, subjectType: "customer", subjectId: inv.customerId, kind: channel, direction: "out", meta: { invoiceId, reminder: "1" }, at, actorId: d.me }, ...d.activities] }),
          { k: "invoice.remind", activityId, customerId: inv.customerId, invoiceId, channel, at },
        );
      },
      waitMore: (id, days) => patchLead(id, { askAgainAt: new Date(Date.now() + days * 86_400_000).toISOString() }),
      updateLead: (id, patch) => {
        const l0 = dbRef.current.leads.find((x) => x.id === id);
        return mutate(
          "lead.update",
          (d) => ({ ...d, leads: d.leads.map((x) => (x.id === id ? { ...x, ...patch, lastActivityAt: new Date().toISOString() } : x)) }),
          { k: "lead.update", id, cols: leadCols(patch, l0) },
        );
      },
      closeLead: (id, close, reason, text) => {
        const activityId = uid();
        const at = new Date().toISOString();
        const from = dbRef.current.leads.find((x) => x.id === id)?.status ?? "new";
        return mutate(
          "lead.close",
          (d) => ({
            ...d,
            leads: d.leads.map((x) => (x.id === id ? { ...x, status: close, lostReason: reason, lostReasonText: text, lastActivityAt: at } : x)),
            activities: [{ id: activityId, subjectType: "lead", subjectId: id, kind: "status", meta: { from, to: close, reason }, at, actorId: d.me }, ...d.activities],
          }),
          { k: "lead.close", leadId: id, status: close, reason, text, activityId, from: dbStatus(from) },
        );
      },
      reopenLead: (id) => {
        const activityId = uid();
        const at = new Date().toISOString();
        const from = dbRef.current.leads.find((x) => x.id === id)?.status ?? "lost";
        return mutate(
          "lead.reopen",
          (d) => ({
            ...d,
            leads: d.leads.map((x) => (x.id === id ? { ...x, status: "replied", lostReason: undefined, lostReasonText: undefined, lastActivityAt: at } : x)),
            activities: [{ id: activityId, subjectType: "lead", subjectId: id, kind: "status", meta: { from, to: "replied" }, at, actorId: d.me }, ...d.activities],
          }),
          { k: "lead.reopen", leadId: id, activityId, from: dbStatus(from) },
        );
      },
      assignLead: (id, memberId) => {
        const activityId = uid();
        const at = new Date().toISOString();
        return mutate(
          "lead.assign",
          (d) => ({
            ...d,
            leads: d.leads.map((x) => (x.id === id ? { ...x, assigneeId: memberId, lastActivityAt: at } : x)),
            activities: [{ id: activityId, subjectType: "lead", subjectId: id, kind: "assigned", meta: { to: memberId }, at, actorId: d.me }, ...d.activities],
          }),
          { k: "lead.assign", leadId: id, userId: memberId, activityId },
        );
      },
      setLeadCost: (id, cents) =>
        mutate("lead.cost", (d) => ({ ...d, leads: d.leads.map((x) => (x.id === id ? { ...x, costCents: cents } : x)) }), { k: "lead.cost", leadId: id, cents }),
      saveLeadPeople: (leadId, people) => {
        const l = dbRef.current.leads.find((x) => x.id === leadId);
        if (!l) return () => {};
        const named = people.map((p, i) => (i === 0 ? { ...p, name: l.name, role: "main" as const } : p));
        if (l.customerId && dbRef.current.customers.some((c) => c.id === l.customerId)) return saveCustomerPeople(l.customerId, named);
        const clean = cleanPeople(named, uid);
        const { phone, email } = mainContact(clean);
        return mutate(
          "lead.people",
          (d) => ({ ...d, leads: d.leads.map((x) => (x.id === leadId ? { ...x, people: clean, phone, email, phone2: undefined, phone2Label: undefined, contacts: undefined } : x)) }),
          { k: "lead.people", id: leadId, people: clean },
        );
      },
      saveTask: (t) => {
        const id = t.id ?? uid();
        const task = { ...t, id };
        const undo = mutate(
          "task.save",
          (d) => ({ ...d, tasks: d.tasks.some((x) => x.id === id) ? d.tasks.map((x) => (x.id === id ? task : x)) : [...d.tasks, task] }),
          { k: "task.save", task },
        );
        return { id, undo };
      },
      saveCalendarEvent: (e) => {
        if (eventProblems(e).length) return null;
        const id = e.id ?? uid();
        const event: CalendarEvent = { ...e, id, title: e.title?.trim() || undefined, description: e.description?.trim() || undefined };
        const isNew = !(dbRef.current.calendarEvents ?? []).some((x) => x.id === id);
        const undo = mutate(
          "calendarEvent.save",
          (d) => {
            const list = d.calendarEvents ?? [];
            return { ...d, calendarEvents: isNew ? [...list, event] : list.map((x) => (x.id === id ? event : x)) };
          },
          { k: "calendarEvent.save", event, isNew },
        );
        return { id, undo };
      },
      setPrefs: (patch) => {
        const prefs: MemberPrefs = { ...MEMBER_PREFS_DEFAULT, ...dbRef.current.prefs, ...patch };
        return mutate("me.prefs", (d) => ({ ...d, prefs }), { k: "me.prefs", prefs });
      },
      setPushKind: (kind, enabled) =>
        mutate("me.pushKind", (d) => ({ ...d, pushPrefs: { ...d.pushPrefs, [kind]: enabled } }), { k: "me.pushKind", kind, enabled }),
      // row_version mirrors the server (an insert is 1, each change +1), so the next saveSettings sends the right base
      enableModule: (key) => {
        const withModule = (d: DB): DB => {
          if (!d.company) return d;
          const cur = d.company.modules?.[key];
          const next = { ...enabledLocally(cur, moduleDef(key)), rowVersion: cur ? cur.rowVersion + 1 : 1 };
          return { ...d, company: { ...d.company, modules: { ...d.company.modules, [key]: next } } };
        };
        return mutate("module.enable", withModule, { k: "module.enable", module: key });
      },
      disableModule: (key) =>
        mutate(
          "module.disable",
          (d) => {
            const cur = d.company?.modules?.[key];
            if (!d.company || !cur) return d;
            return { ...d, company: { ...d.company, modules: { ...d.company.modules, [key]: { ...cur, enabled: false, rowVersion: cur.rowVersion + 1 } } } };
          },
          { k: "module.disable", module: key },
        ),
      undoTogether,
      moduleOp: (module, { kind, payload, apply, coalesceKey, made }) => {
        if (!moduleActive(dbRef.current.company, module)) return null;
        const op: Op = { k: "module.op", module, kind, payload, ...(coalesceKey ? { coalesceKey } : {}), ...(made?.length ? { made } : {}) };
        return mutate(`module.op`, apply, op);
      },
      saveModuleSettings: (key, settings) => {
        const c = dbRef.current.company;
        const cur = c?.modules?.[key];
        // after a conflict, not until this module's settings are read again (review #374 №1)
        if (!c || !cur || !moduleActive(c, key) || settingsStale.current.has(key)) return null;
        return mutate(
          "module.saveSettings",
          (d) => (d.company ? { ...d, company: { ...d.company, modules: { ...d.company.modules, [key]: { ...cur, settings, rowVersion: cur.rowVersion + 1 } } } } : d),
          { k: "module.saveSettings", module: key, settings, baseRowVersion: cur.rowVersion },
        );
      },
      setLocationConsent: (on) => {
        const put = (d: DB) => {
          dbRef.current = d;
          setDb(d);
        };
        const cid = company?.companyId;
        return changeConsent(
          {
            get: () => dbRef.current,
            set: put,
            cloud: modeRef.current === "cloud",
            sendNow: (v) => (cid && auth.userId ? applyOp({ k: "me.location", on: v }, cid, auth.userId) : Promise.reject(new Error("no company"))),
            enqueue: (op) => {
              const oid = uid();
              outboxRef.current = [...outboxRef.current, { id: oid, op, at: new Date().toISOString(), tries: 0, ...(whoRef.current ? { owner: whoRef.current } : {}) }];
              setOutbox(outboxRef.current);
              return () => {
                // only while it waits in the «Отменить» window (it has not left the phone)
                if (!outboxRef.current.some((x) => x.id === oid)) return false;
                outboxRef.current = outboxRef.current.filter((x) => x.id !== oid);
                setOutbox(outboxRef.current);
                return true;
              };
            },
          },
          on,
        );
      },
      recordVisitPoint: (p, source) => {
        const next = { ...dbRef.current, visitPoints: keepLast(dbRef.current.visitPoints, p) };
        dbRef.current = next;
        setDb(next);
        if (modeRef.current !== "cloud") return;
        // the step («on the way») waits in the queue for its «Отменить» window: the server would refuse a point for a
        // visit that is not under way yet — keep the point and send it once the step has left (flush)
        if (stepPending(mine(outboxRef.current), p.visitId) || !onlineRef.current) {
          waitingPoints.current = { ...waitingPoints.current, [p.visitId]: { p, source } };
          return;
        }
        sendPoint(p, source);
      },
      removeCalendarEvent: (id) =>
        mutate("calendarEvent.remove", (d) => ({ ...d, calendarEvents: (d.calendarEvents ?? []).filter((x) => x.id !== id) }), { k: "calendarEvent.remove", id }),
      saveSource: (src) => {
        const id = src.id ?? uid();
        const position = src.position ?? Math.max(0, ...dbRef.current.sources.map((x) => x.position ?? 0)) + 1;
        const source = { ...src, id, position };
        const undo = mutate(
          "source.save",
          (d) => ({ ...d, sources: d.sources.some((x) => x.id === id) ? d.sources.map((x) => (x.id === id ? source : x)) : [...d.sources, source] }),
          { k: "source.save", source },
        );
        return { id, undo };
      },
      bookLead: (id, at) => {
        const l = dbRef.current.leads.find((x) => x.id === id);
        if (!l || !isOpenLeadStatus(l.status)) return () => {};
        // S4 (docs/specs/03 §1): an inspection is a visit of the lead at the property, without a job.
        // One planned inspection at a time (double tap, second booking): reschedule lives in the Plan.
        if (hasPlannedInspection(dbRef.current, l)) return () => {};
        const target = leadTarget(id);
        if (!target) return () => {};
        const ids = { visitId: at.visitId ?? uid() };
        const now = new Date().toISOString();
        const snap = snapshotFor("inspection", []);
        const undoVisit0 = mutate(
          "lead.book",
          (d) => ({
            ...d,
            leads: d.leads.map((x) =>
              x.id === id ? { ...x, status: x.status === "new" || x.status === "replied" ? "booked" : x.status, firstResponseAt: x.firstResponseAt ?? now, lastActivityAt: now } : x,
            ),
            visits: [
              ...d.visits,
              {
                id: ids.visitId, leadId: id, propertyId: target.propertyId, kind: "inspection", techId: peopleOf(at)[0] ?? null, assigneeIds: peopleOf(at), start: at.start, durationMin: at.durationMin, step: "scheduled",
                // the note for the tech is its own field (visits.notes, wave П3b); the lead's message stays the scope
                note: at.note?.trim() || undefined, scope: [l.message].filter((x): x is string => !!x), checklist: snap.items, photos: [], amountDueCents: 0,
                ...(snap.mins ? { photoMins: snap.mins } : {}),
              },
            ],
          }),
          {
            k: "visit.inspection", leadId: id, propertyId: target.propertyId, visitId: ids.visitId, start: at.start, durationMin: at.durationMin,
            techId: peopleOf(at)[0] ?? null, assigneeIds: peopleOf(at), note: at.note?.trim() || undefined, scope: [l.message].filter((x): x is string => !!x),
          },
        );
        return undoTogether([target.undo, undoVisit0, snapshotOps(ids.visitId, snap)]);
      },
      cancelVisit: (id, reason, text) => {
        const d0 = dbRef.current;
        const v = d0.visits.find((x) => x.id === id);
        if (!v || !canCancel(v) || (reason === "other" && !text?.trim())) return () => {};
        const leadBack = leadRollsBack(d0, id);
        const jobBack = jobRollsBack(d0, id);
        return mutate(
          "visit.cancel",
          (d) => ({
            ...d,
            // a cancelled visit leaves the Plan and the day; it stays in the lead's feed with its reason (§5.2)
            visits: d.visits.filter((x) => x.id !== id),
            cancelledVisits: [...(d.cancelledVisits ?? []), { ...v, cancelReason: reason, cancelText: text?.trim() || undefined, cancelledAt: new Date().toISOString() }],
            leads: leadBack ? d.leads.map((l) => (l.id === leadBack ? { ...l, status: "replied" } : l)) : d.leads,
            jobs: jobBack ? d.jobs.map((j) => (j.id === jobBack ? { ...j, status: "unscheduled" } : j)) : d.jobs,
          }),
          { k: "visit.cancel", visitId: id, reason, text: text?.trim() || undefined, leadBack: leadBack ?? undefined, jobBack: jobBack ?? undefined },
        );
      },
      addInspection: (propertyId, at) => {
        const id = at.visitId ?? uid();
        const people = peopleOf(at);
        const scope: string[] = [];
        const note = at.note?.trim() || undefined;
        const snap = snapshotFor("inspection", []);
        const undo0 = mutate(
          "visit.inspection",
          (d) => ({
            ...d,
            visits: [
              ...d.visits,
              { id, propertyId, kind: "inspection", techId: people[0] ?? null, assigneeIds: people, start: at.start, durationMin: at.durationMin, step: "scheduled", note, scope, checklist: snap.items, photos: [], amountDueCents: 0, ...(snap.mins ? { photoMins: snap.mins } : {}) },
            ],
          }),
          { k: "visit.inspection", propertyId, visitId: id, start: at.start, durationMin: at.durationMin, techId: people[0] ?? null, assigneeIds: people, note, scope },
        );
        return { id, undo: undoTogether([undo0, snapshotOps(id, snap)]) };
      },
      markNotified: (visitId) => {
        const at = new Date().toISOString();
        return mutate("visit.notified", (d) => patchVisit(d, visitId, (v) => ({ ...v, customerNotifiedAt: at })), { k: "visit.notified", visitId });
      },
      rescheduleVisit: (id, start, durationMin, allDay) => {
        const v = dbRef.current.visits.find((x) => x.id === id);
        if (!v || !canReschedule(v) || durationMin <= 0) return () => {};
        return mutate("visit.reschedule", (d) => patchVisit(d, id, (x) => rescheduled(x, start, durationMin, allDay)), { k: "visit.reschedule", visitId: id, start, durationMin, allDay: !!allDay });
      },
      addLead: (lead) => {
        const id = uid();
        const d0 = dbRef.current;
        // new leads go to the company's choice while at work, else the owner (founder 04.11; features/leadAssignee.ts);
        // the creator is remembered (a tech keeps seeing his lead)
        const owner = defaultLeadAssignee(d0.company, d0.members, d0.me);
        // provisional number for the screen; the server assigns the real one (it ignores what the app sends)
        const last = Math.max(0, ...d0.leads.map((x) => Number(/^[A-Z]+-(\d+)$/.exec(x.number ?? "")?.[1] ?? 0)));
        const number = `LEA-${String(last + 1).padStart(4, "0")}`;
        const full: Lead = { assigneeId: owner, createdBy: d0.me, ...lead, id, number, status: "new", receivedAt: new Date().toISOString(), serviceCategoryId: inheritCategory(d0, { kind: "lead" }, lead.serviceCategoryId) };
        const { name: _n, phone: _p, city: _c, address: _a, sourceId: _s, message: _m, number: _no, ...rest } = full;
        const undo = mutate("lead.add", (d) => ({ ...d, leads: [full, ...d.leads] }), {
          k: "lead.add", id, name: full.name, phone: full.phone, city: full.city, address: full.address, sourceId: full.sourceId, message: full.message,
          costCents: full.costCents, cols: leadCols(rest as LeadPatch, full),
        });
        return { id, undo };
      },
      assignVisit: (visitId, userIds) => {
        const v = dbRef.current.visits.find((x) => x.id === visitId);
        // people change only before the tech is on site (§4.1; the server refuses the same, public.assign_visit)
        if (!v || !canReschedule(v)) return () => {};
        const list = [...new Set(userIds)];
        return mutate("visit.assign", (d) => patchVisit(d, visitId, (x) => withAssignees(x, list)), { k: "visit.assign", visitId, userIds: list });
      },
      addEstimate: (e) => {
        const id = uid();
        const serviceCategoryId = inheritCategory(dbRef.current, { kind: "estimate", leadId: e.leadId, customerId: e.customerId }, e.serviceCategoryId);
        return mutate("estimate.add", (d) => ({ ...d, estimates: [...d.estimates, { ...e, id, serviceCategoryId, createdBy: d.me }] }), {
          k: "estimate.add", id, versionId: uid(), optionId: uid(), customerId: e.customerId, propertyId: e.propertyId, title: e.title,
          totalCents: e.totalCents, depositCents: e.depositCents, marginPct: e.marginPct ?? null, lines: e.lines ?? [],
        });
      },
      addExpense: (x) => {
        const id = uid();
        return mutate(
          "expense.add",
          (d) => ({ ...d, expenses: [{ ...x, id, at: new Date().toISOString(), memberId: d.me }, ...(d.expenses ?? [])] }),
          { k: "expense.add", id, jobId: x.jobId, vendor: x.vendor, category: x.category, amountCents: x.amountCents },
        );
      },
      payInvoice: (id, method) => {
        const inv = dbRef.current.invoices.find((i) => i.id === id);
        return inv ? recordPayment(id, inv.totalCents - inv.paidCents, method) : () => {};
      },
      recordPayment: (invoiceId, amountCents, method, reference, fromClient) => recordPayment(invoiceId, amountCents, method, reference, fromClient),
      refundPaymentDemo: (paymentId, amountCents) => {
        const r = applyRefund(dbRef.current, paymentId, amountCents, { mode: modeRef.current, appRole: role });
        if (!r.ok) return r.error;
        mutate("payment.refundDemo", (d) => ({ ...d, payments: r.payments, invoices: r.invoices, advances: r.advances }));   // no op: never sent anywhere
        return null;
      },
      applyAdvanceDemo: (advanceId, invoiceId) => {
        const r = applyAdvance(dbRef.current, advanceId, invoiceId, { mode: modeRef.current, appRole: role });
        if (!r.ok) return r.error;
        mutate("payment.advanceDemo", (d) => ({ ...d, payments: r.payments, invoices: r.invoices, advances: r.advances }));   // no op
        return null;
      },
      voidInvoice: (id, reason) => {
        const d0 = dbRef.current;
        const refusal = voidRefusal(d0, id, reason, role);
        if (refusal) return refusal;
        const inv = d0.invoices.find((i) => i.id === id)!;
        const why = reason.trim();
        mutate(
          "invoice.void",
          (d) => {
            const cur = d.invoices.find((i) => i.id === id);
            if (!cur) return d;
            return {
              ...d,
              invoices: d.invoices.filter((i) => i.id !== id),
              voidInvoices: [...(d.voidInvoices ?? []).filter((i) => i.id !== id), { ...cur, status: "void", voidReason: why, voidedAt: new Date().toISOString() }],
            };
          },
          { k: "invoice.void", id, jobId: inv.jobId, reason: why, totalCents: inv.totalCents },
        );
        return null;
      },
      issueInvoice: (jobId, kind, amountCents, title) => {
        const d0 = dbRef.current;
        const job = d0.jobs.find((j) => j.id === jobId);
        const customerId = job ? d0.properties.find((p) => p.id === job.propertyId)?.customerId : undefined;
        if (!job || !customerId || amountCents <= 0) return () => {};
        // #865: never more than the contract (engine canIssue; the server refuses the same from В1-4б); the tax inside the total
        const split = contractInvoice(d0, job, amountCents);
        if (!split) return null;
        const id = uid();
        const now = new Date().toISOString();
        return mutate(
          "invoice.issue",
          (d) => ({
            ...d,
            invoices: [
              ...d.invoices,
              { id, customerId, jobId, kind, title, totalCents: amountCents, ...split, paidCents: 0, dueDate: now, sentAt: now, number: modeRef.current === "demo" ? nextInvoiceNumber(d) : undefined },
            ],
          }),
          { k: "invoice.issue", id, jobId, customerId, kind, title, totalCents: amountCents, dueDate: companyToday(Date.parse(now)) },
        );
      },
      sendEstimate: (id, tk) => {
        // #1113: a tech never sends (the server's send_estimate is the office side's — T142): nothing «sent» on his phone,
        // no link made, nothing queued to be refused
        if (role === "tech") return noop;
        const cur = dbRef.current.estimates.find((e) => e.id === id);
        // a revoked token never comes back (the server refuses it too and makes its own)
        const token = (cur?.linkRevokedAt ? undefined : cur?.token) ?? tk ?? newToken();
        return mutate(
          "estimate.send",
          (d) => {
            const est = d.estimates.find((e) => e.id === id);
            const now = new Date().toISOString();
            return {
              ...d,
              estimates: d.estimates.map((e) =>
                e.id === id
                  ? {
                      ...e, token, status: e.status === "draft" ? "sent" : e.status, sentAt: e.sentAt ?? now,
                      // E2a: every send of a new version gets a fresh "valid until"; a revoked link is replaced by the new token
                      validUntil: e.status === "draft" ? validUntilFor(d.company, new Date(now)) : e.validUntil, linkRevokedAt: undefined,
                    }
                  : e,
              ),
              leads: est?.leadId
                ? d.leads.map((l) => (l.id === est.leadId && (l.status === "new" || l.status === "replied" || l.status === "booked") ? { ...l, status: "estimate_sent", lastActivityAt: now } : l))
                : d.leads,
            };
          },
          { k: "estimate.send", id, token },
        );
      },
      saveEstimateTemplate: (t, opts) => {
        const clean = cleanEstimateTemplate(t);
        // a refusal is never queued (lesson of the director): no name, not the office, a server before the templates
        if (!clean || !canEditEstimateTemplates(role) || dbRef.current.estimateTemplatesMissing) return noop;
        // a starter (ifNew) already on the phone: nothing (a second tap; a second phone's after the next read)
        if (opts?.ifNew && (dbRef.current.estimateTemplates ?? []).some((x) => x.id === clean.id)) return noop;
        const base = opts?.baseRowVersion ?? (opts?.ifNew ? undefined : (dbRef.current.estimateTemplates ?? []).find((x) => x.id === clean.id)?.rowVersion);
        return mutate(
          "estimate.template",
          (d) => {
            const list = d.estimateTemplates ?? [];
            const old = list.find((x) => x.id === clean.id);
            // the server's row_version after this save, as far as the phone can tell (§12.7): an update +1; a new one —
            // insert 1, then the update 2; a starter (insert only, or a revived row) — not known
            // a new one: not known (a cost in it makes the server's own extra update — review №С1) until the next read
            const rowVersion = old?.rowVersion !== undefined ? old.rowVersion + 1 : undefined;
            const { rowVersion: _rv, ...rest } = clean;
            const next = { ...rest, uses: old?.uses ?? clean.uses, lastUsedAt: old?.lastUsedAt ?? clean.lastUsedAt, ...(rowVersion !== undefined ? { rowVersion } : {}) };
            return { ...d, estimateTemplates: old ? list.map((x) => (x.id === clean.id ? next : x)) : [...list, next] };
          },
          {
            k: "est.template.save", template: clean, ...(opts?.ifNew ? { ifNew: true } : {}),
            // every save of a template whose version the phone knows goes over it (rename, archive, «Отменить» too — review
            // №С2); the builder gives the version it opened on
            ...(base !== undefined ? { baseRowVersion: base } : {}),
            ...(opts?.clearCosts?.length ? { clearCosts: opts.clearCosts } : {}),
          },
        );
      },
      saveEstimate: ({ id, customerId, propertyId, title, doc: doc0, leadId: leadId0, templateId: templateId0 }) => {
        const prev = dbRef.current.estimates.find((e) => e.id === id);
        if (prev?.status === "approved") return () => {};
        // #1138: a tech makes a new estimate only where the server lets him (estimates_insert — a property he works at);
        // elsewhere it would vanish behind «нет доступа» after saving (demo) or be refused (cloud)
        if (!prev && !canMakeEstimateAt(dbRef.current, { role, mode, me: dbRef.current.me }, propertyId)) return () => {};
        // as it may be counted and shown (Р3, Р4) before it is counted and saved
        const { doc, linesFrom } = docForSave(prev?.status, normalizeDoc(doc0).doc, uid);
        const sum = summarize(doc);
        const versionId = uid();
        return mutate(
          "estimate.save",
          (d) => {
            const next: Estimate = {
              ...(prev ?? {}),
              id, customerId, propertyId, title, doc, status: "draft", ...sum, leadId: leadId0 ?? prev?.leadId,
              // who made it (the server's created_by: a tech keeps seeing his own, estimates_select — #1138)
              createdBy: prev ? prev.createdBy : d.me,
              // E3: an estimate keeps the template it was made from; a new one from a template counts one use (demo too)
              templateId: prev ? prev.templateId : templateId0,
              // «don't sign — change it»: the client signs the new version again (the old signature stays on the server)
              ...(prev?.status === "awaiting_countersign" ? { approval: undefined, signature: undefined } : {}),
              sentAt: prev?.status === "draft" ? prev.sentAt : undefined,
              // a new estimate takes the direction of its lead / client / company (S16); an existing one keeps its own
              serviceCategoryId: prev ? prev.serviceCategoryId : inheritCategory(d, { kind: "estimate", leadId: leadId0, customerId }),
            };
            const used = !prev && templateId0
              ? { estimateTemplates: (d.estimateTemplates ?? []).map((t) => (t.id === templateId0 ? { ...t, uses: (t.uses ?? 0) + 1, lastUsedAt: new Date().toISOString() } : t)) }
              : {};
            return { ...d, ...used, estimates: prev ? d.estimates.map((e) => (e.id === id ? next : e)) : [...d.estimates, next] };
          },
          { k: "estimate.save", id, versionId, customerId, propertyId, leadId: leadId0 ?? prev?.leadId, templateId: prev ? prev.templateId : templateId0, title, doc: storedDoc(doc), costs: costsOf(doc), ...(linesFrom ? { linesFrom } : {}), totalCents: sum.totalCents, depositCents: sum.depositCents, marginPct: sum.marginPct },
        );
      },
      approveEstimate: (id, a) => {
        const e = dbRef.current.estimates.find((x) => x.id === id);
        if (!e?.doc || e.status === "approved" || e.status === "awaiting_countersign") return () => {};
        // on site the client signs on an employee's device: only someone who may sign contracts (server: the same)
        if (a.channel === "on_site" && !canCountersign(dbRef.current, dbRef.current.me)) return () => {};
        if (a.channel === "on_site") a = { ...a, deviceUserId: dbRef.current.me };
        const token = e.token ?? newToken();
        const ids = { jobId: jobOfEstimate(dbRef.current, id)?.id ?? uid(), invoiceId: uid() };
        const now = new Date().toISOString();
        return mutate("estimate.approve", (d) => withTaxSplit(clientSigned(d, id, a, ids, now, token), ids.invoiceId), {
          k: "estimate.approve", id, token, optionId: a.optionId, addonIds: a.addonIds, signer: a.signerName, svg: a.signature, channel: a.channel, jobId: ids.jobId, invoiceId: ids.invoiceId,
          // #1147: on site, the total the client saw (the option with its add-ons, as summarize counts it — the server the same)
          ...(a.channel === "on_site" ? { totalCents: summarize(e.doc, a).totalCents } : {}),
        });
      },
      countersignEstimate: (id, signature) => {
        const d0 = dbRef.current;
        const e = d0.estimates.find((x) => x.id === id);
        if (!e || e.status !== "awaiting_countersign" || !canCountersign(d0, d0.me)) return () => {};
        const now = new Date().toISOString();
        // the same ids on the phone and the server (the client may have signed on the page: no ids were stored then)
        const ids = { jobId: jobOfEstimate(d0, id)?.id ?? e.approval?.jobId ?? uid(), invoiceId: e.approval?.invoiceId ?? uid() };
        // the saved signature (one tap) or one drawn now (the server saves it as the new own signature)
        const saved = typeof signature === "string" ? undefined : (d0.memberSignatures ?? []).find((s) => s.id === signature.savedId && s.userId === d0.me && !s.revokedAt);
        if (typeof signature !== "string" && !saved) return () => {};
        const svg = typeof signature === "string" ? signature : saved!.svg;
        return mutate(
          "estimate.countersign",
          (d) => withTaxSplit(companySigned(d, id, { userId: d.me, signature: svg, method: saved ? "saved" : "drawn", title: saved?.title }, ids, now, (x) => (modeRef.current === "demo" ? nextInvoiceNumber(x) : undefined), (x) => (modeRef.current === "demo" ? nextJobNumber(x) : undefined)), ids.invoiceId),
          { k: "estimate.countersign", id, svg: saved ? undefined : svg, memberSignatureId: saved?.id, jobId: ids.jobId, invoiceId: ids.invoiceId },
        );
      },
      saveMySignature: (svg, name, title) => {
        if (svg.length < 3 || !name.trim()) return () => {};
        const sig = { id: uid(), userId: dbRef.current.me, svg, name: name.trim(), title: title?.trim() || undefined };
        return mutate("member.signature", (d) => savedSignature(d, sig, new Date().toISOString()), { k: "member.signature", ...sig });
      },
      updateMember: (id, patch) => {
        const d0 = dbRef.current;
        // security-check #98: check the role before applying — offline must not show an edit the server refuses
        if (!d0.members.some((m) => m.id === id) || !canEditMember(d0, d0.me)) return () => {};
        // the right to sign: owner only (the server refuses others too)
        const p = { ...patch, canSignContracts: canGrantSign(d0, d0.me) ? patch.canSignContracts : undefined };
        return mutate(
          "member.update",
          (d) => ({
            ...d,
            members: d.members.map((m) =>
              m.id === id
                ? { ...m, ...(p.title !== undefined ? { title: p.title.trim() || undefined } : {}), ...(p.hisNumber !== undefined ? { hisNumber: p.hisNumber.trim() || undefined } : {}), ...(p.canSignContracts !== undefined ? { canSignContracts: p.canSignContracts } : {}) }
                : m,
            ),
          }),
          { k: "member.update", id, title: p.title, hisNumber: p.hisNumber, canSignContracts: p.canSignContracts },
        );
      },
      declineCountersign: (id, text) => {
        const e = dbRef.current.estimates.find((x) => x.id === id);
        if (!e || e.status !== "awaiting_countersign" || !text.trim() || !canManageLink(dbRef.current, dbRef.current.me)) return () => {};
        return mutate("estimate.decline", (d) => companyDeclined(d, id, text), { k: "estimate.decline", id, text: text.trim() });
      },
      reopenEstimate: (id, reason) => {
        const e = dbRef.current.estimates.find((x) => x.id === id);
        if (!e || e.status !== "awaiting_countersign" || !canManageLink(dbRef.current, dbRef.current.me)) return () => {};
        return mutate("estimate.reopen", (d) => reopened(d, id), { k: "estimate.reopen", id, reason: reason.trim() });
      },
      revokeEstimateLink: (id) => {
        const e = dbRef.current.estimates.find((x) => x.id === id);
        // the server allows the director and the office only (revoke_estimate_link)
        if (!e?.token || e.linkRevokedAt || !canManageLink(dbRef.current, dbRef.current.me)) return () => {};
        const now = new Date().toISOString();
        // the phone keeps the old token marked revoked: the page says "not valid" at once, the next send makes a new one
        return mutate("estimate.revoke", (d) => ({ ...d, estimates: d.estimates.map((x) => (x.id === id ? { ...x, linkRevokedAt: now } : x)) }), {
          k: "estimate.revoke", id,
        });
      },
      leadEstimateTarget: (leadId) => leadTarget(leadId),
      // #1138: may the person make a new estimate at this property (a tech: where he works — estimates_insert); a module
      // asks before it writes anything for an estimate (review of #1169 Б1)
      mayMakeEstimateAt: (propertyId) => canMakeEstimateAt(dbRef.current, { role, mode, me: dbRef.current.me }, propertyId),
      convertLead: (leadId, reasonText) => {
        const d0 = dbRef.current;
        const l = d0.leads.find((x) => x.id === leadId);
        if (!l || l.status === "won") return () => {};
        const ids = { customerId: l.customerId ?? uid(), contactId: uid(), propertyId: l.propertyId ?? uid(), noteId: uid() };
        const needCustomer = !l.customerId;
        const now = new Date().toISOString();
        return mutate(
          "lead.convert",
          (d) => ({
            ...d,
            customers: needCustomer
              ? [...d.customers, { id: ids.customerId, number: modeRef.current === "demo" ? nextClientNumber(d) : undefined, name: l.name, phone: l.phone, email: l.email, sourceId: l.sourceId, balanceCents: 0, status: "active", people: clientPeopleFromLead(l, ids.contactId) }]
              : d.customers.map((c) => (c.id === ids.customerId ? { ...c, status: statusAfterManualWin(c.status) } : c)),
            properties: needCustomer ? [...d.properties, { id: ids.propertyId, customerId: ids.customerId, address: l.address ?? "", city: l.city, stories: 1 }] : d.properties,
            leads: d.leads.map((x) => (x.id === leadId ? { ...x, status: "won", wonVia: "manual", customerId: ids.customerId, propertyId: ids.propertyId, lastActivityAt: now } : x)),
            notes: [{ id: ids.noteId, subjectType: "customer", subjectId: ids.customerId, body: reasonText, visibility: "team", pinned: false, authorId: d.me, at: now }, ...d.notes],
          }),
          {
            k: "lead.convert", leadId, needCustomer, ...ids, name: l.name, phone: l.phone, email: l.email, sourceId: l.sourceId, address: l.address ?? "", city: l.city, note: reasonText,
          },
        );
      },
      addCustomer: (x) => {
        const ids = { customerId: uid(), contactId: uid(), propertyId: uid() };
        const undo = mutate(
          "customer.create",
          (d) => ({
            ...d,
            customers: [
              ...d.customers,
              { id: ids.customerId, number: modeRef.current === "demo" ? nextClientNumber(d) : undefined, name: x.name, phone: x.phone, email: x.email, sourceId: x.sourceId, balanceCents: 0, status: "active" },
            ],
            properties: [...d.properties, { id: ids.propertyId, customerId: ids.customerId, address: x.address, city: x.city, stories: 1 }],
          }),
          { k: "customer.create", ...ids, ...x },
        );
        return { id: ids.customerId, propertyId: ids.propertyId, undo };
      },
      saveCustomerPeople,
      setCustomerTags: (id, tagIds) =>
        mutate("customer.tags", (d) => ({ ...d, customers: d.customers.map((c) => (c.id === id ? { ...c, tagIds } : c)) }), { k: "customer.tags", id, tagIds }),
      setCustomerStatus: (id, status, reason) =>
        mutate(
          "customer.status",
          (d) => ({ ...d, customers: d.customers.map((c) => (c.id === id ? { ...c, status, statusReason: status === "do_not_service" ? reason : undefined } : c)) }),
          { k: "customer.status", id, status, reason: status === "do_not_service" ? reason : undefined },
        ),
      // a repeat (a double tap, the pair already merged / marked) queues nothing: a second op would outlive its «Отменить»
      mergeCustomers: (keepId, dropId) => {
        if (mergeCustomersDb(dbRef.current, keepId, dropId) === dbRef.current) return () => {};
        return mutate("customer.merge", (d) => mergeCustomersDb(d, keepId, dropId), { k: "customer.merge", keepId, dropId });
      },
      markNotDuplicate: (aId, bId) => {
        if (markNotDuplicateDb(dbRef.current, aId, bId) === dbRef.current) return () => {};
        return mutate("customer.notDup", (d) => markNotDuplicateDb(d, aId, bId), { k: "customer.notDup", id: aId, otherId: bId });
      },
      saveServiceCategory: (cat) => {
        const id = cat.id ?? uid();
        const list = dbRef.current.serviceCategories;
        const prev = list.find((x) => x.id === id);
        const position = cat.position ?? prev?.position ?? Math.max(-1, ...list.map((x) => x.position)) + 1;
        const next: ServiceCategory = { ...prev, ...cat, id, position };
        const undo = mutate(
          "serviceCategory.save",
          (d) => ({ ...d, serviceCategories: prev ? d.serviceCategories.map((x) => (x.id === id ? next : x)) : [...d.serviceCategories, next] }),
          { k: "serviceCategory.save", category: next, isNew: !prev },
        );
        return { id, undo };
      },
      addJob: (x) => {
        const id = uid();
        const undo = mutate("job.create", (d) => withNewJob(d, id, x, modeRef.current === "demo"), {
          k: "job.create", id, customerId: x.customerId, propertyId: x.propertyId, title: x.title.trim(),
          description: x.description?.trim() || null, jobTypeId: x.jobTypeId ?? null, serviceCategoryId: x.serviceCategoryId ?? null,
        });
        return { id, undo };
      },
      completeJob: (jobId) => mutate("job.complete", (d) => withJobDone(d, jobId), { k: "job.complete", id: jobId }),
      saveJobLine: (line, isNew) => {
        const back = lineSaveUndo(dbRef.current, line);
        mutate("jobLine.save", (d) => withJobLine(d, line), { k: "jobLine.save", line, isNew });
        // the save may already be on the server: «Отменить» is its own step back (a new line is removed, an edit undone)
        return () => {
          const now = dbRef.current;
          const after = back.k === "remove" ? withoutJobLine(now, back.id) : withJobLine(now, back.line);
          // e.g. an invoice went out after the raise: going back below it is refused here as on the server (t19)
          if (lineChangeRefusal(now, after, line.jobId)) return false;
          if (back.k === "remove") mutate("jobLine.remove", (d) => withoutJobLine(d, back.id), { k: "jobLine.remove", id: back.id });
          else mutate("jobLine.save", (d) => withJobLine(d, back.line), { k: "jobLine.save", line: back.line, isNew: false });
          return true;
        };
      },
      removeJobLine: (id) => {
        const line = (dbRef.current.jobLines ?? []).find((l) => l.id === id);
        if (!line) return () => false;
        mutate("jobLine.remove", (d) => withoutJobLine(d, id), { k: "jobLine.remove", id });
        // the removal may already be on the server: «Отменить» puts the line back as its own step
        return () => {
          if (lineChangeRefusal(dbRef.current, withJobLine(dbRef.current, line), line.jobId)) return false;
          mutate("jobLine.restore", (d) => withJobLine(d, line), { k: "jobLine.restore", id });
          return true;
        };
      },
      setJobTax: (jobId, tax) => {
        const prev = taxBefore(dbRef.current, jobId);
        mutate("job.update", (d) => withJobTax(d, jobId, tax), { k: "job.update", id: jobId, ...tax });
        return () => {
          if (lineChangeRefusal(dbRef.current, withJobTax(dbRef.current, jobId, prev), jobId)) return false;
          mutate("job.update", (d) => withJobTax(d, jobId, prev), { k: "job.update", id: jobId, ...prev });
          return true;
        };
      },
      setJobTags: (jobId, tagIds) => {
        // a tag switched off since cannot be put back (job_tags_insert): «Отменить» leaves it out
        const active = new Set(dbRef.current.tags.filter((x) => x.active).map((x) => x.id));
        const prev = (dbRef.current.jobs.find((j) => j.id === jobId)?.tagIds ?? []).filter((id) => active.has(id));
        const put = (ids: ID[]) => mutate("job.tags", (d) => ({ ...d, jobs: d.jobs.map((j) => (j.id === jobId ? { ...j, tagIds: ids } : j)) }), { k: "job.tags", id: jobId, tagIds: ids });
        put(tagIds);
        return () => void put(prev);
      },
      setJobType: (jobId, jobTypeId) => {
        const prev = dbRef.current.jobs.find((j) => j.id === jobId)?.jobTypeId ?? null;
        const put = (id: ID | null) => mutate("job.type", (d) => ({ ...d, jobs: d.jobs.map((j) => (j.id === jobId ? { ...j, jobTypeId: id ?? undefined } : j)) }), { k: "job.update", id: jobId, jobTypeId: id });
        put(jobTypeId);
        return () => void put(prev);
      },
      setJobCategory: (id, serviceCategoryId) =>
        mutate("job.category", (d) => ({ ...d, jobs: d.jobs.map((j) => (j.id === id ? { ...j, serviceCategoryId } : j)) }), { k: "job.category", id, serviceCategoryId: serviceCategoryId ?? null }),
      setEstimateCategory: (id, serviceCategoryId) =>
        mutate("estimate.category", (d) => ({ ...d, estimates: d.estimates.map((e) => (e.id === id ? { ...e, serviceCategoryId } : e)) }), { k: "estimate.category", id, serviceCategoryId: serviceCategoryId ?? null }),
      saveTag: (tg) => {
        const id = tg.id ?? uid();
        const position = tg.position ?? Math.max(0, ...dbRef.current.tags.map((x) => x.position)) + 1;
        const tag: Tag = { ...tg, id, position };
        const undo = mutate(
          "tag.save",
          (d) => ({ ...d, tags: d.tags.some((x) => x.id === id) ? d.tags.map((x) => (x.id === id ? tag : x)) : [...d.tags, tag] }),
          { k: "tag.save", tag },
        );
        return { id, undo };
      },
      updateCustomer: (id, patch) =>
        mutate("customer.update", (d) => ({ ...d, customers: d.customers.map((c) => (c.id === id ? applyCustomerPatch(c, patch) : c)) }), { k: "customer.update", id, ...patch }),
      saveProperty: (p) => {
        const city = p.place ? cityLine(p.place) : p.city;
        const next: Property = { ...p, city, address: p.address.trim(), unit: p.unit?.trim() || undefined, label: p.label?.trim() || undefined, accessNotes: p.accessNotes?.trim() || undefined };
        const { gateCode: _g, ...row } = next;
        return mutate(
          "property.save",
          (d) => ({
            ...d,
            properties: d.properties.some((x) => x.id === p.id)
              ? d.properties.map((x) => (x.id === p.id ? { ...next, gateCode: x.gateCode } : x))
              : [...d.properties, next],
          }),
          { k: "property.save", property: row },
        );
      },
      setGateCode: (propertyId, code) =>
        mutate(
          "property.gate",
          (d) => ({ ...d, properties: d.properties.map((x) => (x.id === propertyId ? { ...x, gateCode: code.trim() || undefined } : x)) }),
          { k: "property.gate", id: propertyId, code: code.trim() },
        ),
      updateProperty: (id, patch) =>
        mutate("property.update", (d) => ({ ...d, properties: d.properties.map((p) => (p.id === id ? { ...p, ...patch } : p)) }), { k: "property.update", id, ...patch }),
      addNote: (n) => {
        const id = uid();
        const at = new Date().toISOString();
        return mutate("note.add", (d) => ({ ...d, notes: [{ ...n, id, at, authorId: d.me, pinned: false }, ...d.notes] }), { k: "note.add", id, ...n });
      },
      updateNote: (id, patch) =>
        mutate(
          "note.update",
          (d) => ({
            ...d,
            notes: patch.deleted ? d.notes.filter((x) => x.id !== id) : d.notes.map((x) => (x.id === id ? { ...x, ...(patch.pinned !== undefined ? { pinned: patch.pinned } : {}), ...(patch.body !== undefined ? { body: patch.body } : {}) } : x)),
          }),
          { k: "note.update", id, ...patch },
        ),
      // the server's rules for properties first (features/catalogExtras.ts): a bad one never loses the whole save
      saveCatalogItem: (it0) => {
        const prev = dbRef.current.catalog.find((x) => x.id === it0.id);
        // РС-10: the link, the barcode and the direction as the server will keep them (the phone and the server the same)
        const it = cleanCardFields(cleanSupplierLink(cleanCatalogItem(it0)), prev, dbRef.current);
        // 19 §9: only the cost fields changed here go to the server — a phone without costs never erases them
        const costs = catalogCostChange(prev, it);
        // spec 36: the phone's own history row, shown at once (the server writes its own; the next read replaces the list)
        const hist = dbRef.current.costsVisible === false ? null : localHistoryEntry(prev, it, uid(), new Date().toISOString());
        // РС-10: the price and markup change too (the card shows «было → стало» at once, offline as well)
        const now = new Date().toISOString();
        const priceHist = dbRef.current.costsVisible === false ? [] : localPriceEntries(prev, it, uid, now, dbRef.current.me ?? undefined);
        // on the phone: changed now, by me (the server writes its own); in the queue: never these columns
        const local: CatalogItem = { ...it, updatedAt: now, ...(dbRef.current.me ? { updatedBy: dbRef.current.me } : {}), ...(prev ? {} : { createdAt: now, ...(dbRef.current.me ? { createdBy: dbRef.current.me } : {}) }) };
        return mutate(
          "catalog.save",
          (d) => ({
            ...d,
            catalog: d.catalog.some((x) => x.id === it.id) ? d.catalog.map((x) => (x.id === it.id ? local : x)) : [...d.catalog, local],
            ...(hist ? { costHistory: [hist, ...(d.costHistory ?? [])] } : {}),
            ...(priceHist.length ? { priceHistory: [...priceHist, ...(d.priceHistory ?? [])] } : {}),
          }),
          { k: "catalog.save", item: itemForSave(it), costs },
        );
      },
      saveSupplier: (x0) => {
        const x = cleanSupplier(x0);
        const d0 = dbRef.current;
        if (!x || !canSeeSuppliers(role) || d0.suppliersLegacy) return noop;
        const before = (d0.suppliers ?? []).find((y) => y.id === x.id);
        const put = (v: Supplier | undefined) =>
          mutate(
            "supplier.save",
            (d) => {
              const list = d.suppliers ?? [];
              if (!v) return { ...d, suppliers: list.filter((y) => y.id !== x.id) };
              return { ...d, suppliers: list.some((y) => y.id === v.id) ? list.map((y) => (y.id === v.id ? v : y)) : [...list, v] };
            },
            v ? { k: "supplier.save", supplier: v } : undefined,
          );
        const undoSup = put(x);
        // a rename: the name goes into `vendor` of its items too (sales, the tech and old phones read only that; spec 36 §1в)
        const renamed = before && before.name !== x.name
          ? itemsOfSupplier(dbRef.current, x.id).filter((it) => it.vendor !== x.name).map((it) => ({ prev: it, next: { ...it, vendor: x.name } }))
          : [];
        const undoItems = saveItemsBoth(renamed);
        // «Отменить» (rule 5): the supplier and its items' new name, all or none (Б1)
        return undoTogether([undoSup, undoItems]);
      },
      setSupplierActive: (id, active) => {
        const x = (dbRef.current.suppliers ?? []).find((y) => y.id === id);
        if (!x || !canSeeSuppliers(role) || dbRef.current.suppliersLegacy) return noop;
        const next = { ...x, active };
        // «Отменить» (rule 5): its own change back while its op waits in the queue (Б1: no reverse op over others' changes)
        return mutate("supplier.save", (d) => ({ ...d, suppliers: (d.suppliers ?? []).map((y) => (y.id === id ? next : y)) }), { k: "supplier.save", supplier: next });
      },
      makeJobOrders: (jobId) => {
        const d0 = dbRef.current;
        if (!canEditOrders(role) || d0.purchaseOrdersLegacy) return { ids: [], made: 0, undo: noop };
        const groups = draftsForJob(d0, jobId, modulePurchaseLines(d0, jobId), d0.costsVisible !== false);
        const job = d0.jobs.find((j) => j.id === jobId);
        const addr = job ? d0.properties.find((x) => x.id === job.propertyId) : undefined;
        const ids: ID[] = [];
        const undos: Undo[] = [];
        for (const g of groups) {
          const open = openDraft(dbRef.current, jobId, g.supplierId);
          if (open) {
            ids.push(open.id);
            continue;
          }
          const o: PurchaseOrder = {
            id: uid(), status: "draft", revision: 0, fulfillment: "delivery", printPrices: false, createdAt: new Date().toISOString(), jobId,
            ...(g.supplierId ? { supplierId: g.supplierId } : {}),
            ...(addr ? { deliverTo: [addr.address, addr.city].filter(Boolean).join(", ") } : {}),
            lines: g.lines.map((l, i) => ({ ...l, id: uid(), position: i })),
          };
          ids.push(o.id);
          undos.push(putOrder(o, []));
        }
        return { ids, made: undos.length, undo: undoTogether(undos) };
      },
      savePurchaseOrder: (o) => {
        const d0 = dbRef.current;
        if (!canEditOrders(role) || d0.purchaseOrdersLegacy) return noop;
        const prev = (d0.purchaseOrders ?? []).find((x) => x.id === o.id);
        if (prev && !linesEditable(prev) && JSON.stringify(prev.lines) !== JSON.stringify(o.lines)) return noop;
        const removed = (prev?.lines ?? []).filter((l) => !o.lines.some((x) => x.id === l.id)).map((l) => l.id);
        return putOrder({ ...o, lines: o.lines.map((l, i) => ({ ...l, position: i })) }, removed);
      },
      sendPurchaseOrder: (id) => {
        const d0 = dbRef.current;
        const o = (d0.purchaseOrders ?? []).find((x) => x.id === id);
        const sup = o?.supplierId ? (d0.suppliers ?? []).find((x) => x.id === o.supplierId) : undefined;
        if (!o || !sup || !o.lines.length || !canEditOrders(role) || !(o.status === "draft" || o.status === "sent")) return false;
        putOrder({
          ...o, status: "sent", revision: o.revision + 1, sentAt: new Date().toISOString(),
          supplierName: sup.name, supplierPhone: sup.phone, supplierEmail: sup.email, supplierAddress: sup.address,
        }, []);
        return true;
      },
      cancelPurchaseOrder: (id) => {
        const o = (dbRef.current.purchaseOrders ?? []).find((x) => x.id === id);
        if (!o || !canEditOrders(role) || !canMove(o.status, "cancelled")) return;
        putOrder({ ...o, status: "cancelled" }, []);
      },
      receivePurchaseOrder: (id, lines) => {
        const o = (dbRef.current.purchaseOrders ?? []).find((x) => x.id === id);
        if (!o || !canReceive(role) || !["sent", "partially_received", "received"].includes(o.status)) return noop;
        // a received order is changed by the office only (director 08.11, #461 №3; po_receive refuses the tech)
        if (o.status === "received" && !canEditOrders(role)) return noop;
        const apply = (src: PurchaseOrder, ls: { id: ID; received: string }[]) => {
          const next = { ...src, lines: src.lines.map((l) => { const r = ls.find((x) => x.id === l.id); return r ? { ...l, receivedQty: r.received } : l; }) };
          const st = statusAfterReceive(next);
          const done = {
            ...next, status: st, ...(st === "received" ? { receivedAt: new Date().toISOString() } : { receivedAt: undefined }),
            ...(src.rowVersion !== undefined ? { rowVersion: src.rowVersion + 1 } : {}),
          };
          mutate("po.receive", (d) => ({ ...d, purchaseOrders: (d.purchaseOrders ?? []).map((x) => (x.id === id ? done : x)) }), {
            k: "po.receive", id, lines: ls, ...(src.rowVersion !== undefined ? { rowVersion: src.rowVersion } : {}),
          });
        };
        const before = o.lines.filter((l) => lines.some((x) => x.id === l.id)).map((l) => ({ id: l.id, received: l.receivedQty }));
        apply(o, lines);
        // «Отменить» (rule 5): the quantities as they were — the op may already be on the server, a reverse call
        return () => {
          const cur = (dbRef.current.purchaseOrders ?? []).find((x) => x.id === id);
          if (cur) apply(cur, before);
        };
      },
      loadCostHistory: (where) => {
        const cid = whoRef.current?.companyId;
        if (modeRef.current !== "cloud" || !cid || !onlineRef.current || dbRef.current.costsVisible === false) return;
        void loadCostHistory(cid, where)
          .then((rows) => {
            // another company signed in meanwhile: nothing
            if (whoRef.current?.companyId !== cid) return;
            dbRef.current = { ...dbRef.current, costHistory: mergeHistory(dbRef.current, where, rows) };
            setDb(dbRef.current);
          })
          .catch(() => undefined);
      },
      loadPriceHistory: (itemId) => {
        const cid = whoRef.current?.companyId;
        if (modeRef.current !== "cloud" || !cid || !onlineRef.current || dbRef.current.costsVisible === false) return;
        void loadPriceHistory(cid, itemId)
          .then((rows) => {
            if (whoRef.current?.companyId !== cid) return;
            // the item's rows as the server has them now; other items' stay; the phone's own while its save is queued
            const pending = outboxRef.current.some((o) => o.op.k === "catalog.save" && (o.op as { item?: { id?: string } }).item?.id === itemId);
            dbRef.current = { ...dbRef.current, priceHistory: mergePriceHistory(dbRef.current.priceHistory, itemId, rows, pending) };
            setDb(dbRef.current);
          })
          .catch(() => undefined);
      },
      applySupplierTax: (id) => {
        const d0 = dbRef.current;
        const x = (d0.suppliers ?? []).find((y) => y.id === id);
        if (!x || x.taxBps === undefined || !canSeeSuppliers(role) || d0.costsVisible === false) return noop;
        return saveItemsBoth(itemsWithOtherTax(d0, x).map((it) => ({ prev: it, next: { ...it, vendorTaxBps: x.taxBps } })));
      },
      saveCatalogItems: (items, opts) => {
        const onlyNew = !!opts?.onlyNew;
        const fresh = onlyNew ? items.filter((x) => !dbRef.current.catalog.some((c) => c.id === x.id)) : items;
        // РС-10: the card's fields as the server will keep them, the same as one item's save
        const undos = fresh.map((x) => cleanCardFields(cleanCatalogItem(x), dbRef.current.catalog.find((c) => c.id === x.id), dbRef.current)).map((it) => {
          const prev = dbRef.current.catalog.find((x) => x.id === it.id);
          // РС-10: a change of an item there (not onlyNew) shows its price / markup row at once too
          const priceHist = onlyNew || dbRef.current.costsVisible === false ? [] : localPriceEntries(prev, it, uid, new Date().toISOString(), dbRef.current.me ?? undefined);
          return mutate(
            "catalog.save",
            (d) => ({
              ...d,
              catalog: d.catalog.some((x) => x.id === it.id) ? (onlyNew ? d.catalog : d.catalog.map((x) => (x.id === it.id ? it : x))) : [...d.catalog, it],
              ...(priceHist.length ? { priceHistory: [...priceHist, ...(d.priceHistory ?? [])] } : {}),
            }),
            onlyNew
              ? { k: "catalog.save", item: itemForSave(it), onlyNew: true, costs: catalogCostChange(undefined, it) }
              : { k: "catalog.save", item: itemForSave(it), costs: catalogCostChange(prev, it) },
          );
        });
        // all of them or none (DS §15.2)
        return undoTogether(undos);
      },
      removeCatalogItem: (id) => mutate("catalog.remove", (d) => ({ ...d, catalog: d.catalog.filter((x) => x.id !== id) }), { k: "catalog.remove", id }),
      scheduleJob: (jobId, sch) => {
        const d0 = dbRef.current;
        const job = d0.jobs.find((j) => j.id === jobId);
        if (!job) return () => {};
        const e = job.estimateId ? d0.estimates.find((x) => x.id === job.estimateId) : undefined;
        const visitId = sch.visitId ?? uid();
        const opt = e?.doc && e.approval ? e.doc.options.find((o) => o.id === e.approval!.optionId) : undefined;
        const scope0 = opt ? opt.lines.filter((l) => l.name.trim() && (!l.optional || e!.approval!.addonIds.includes(l.id))).map((l) => l.name) : [job.title];
        // the note for the tech is its own field (visits.notes, wave П3b)
        const scope = scope0;
        const note = sch.note?.trim() || undefined;
        // what the visit takes — the one rule of the screens and the server (features/visitDue.ts, #857 №1); the screens
        // read it live, the stored field is only a first value
        const due = visitDueCents(d0, { jobId });
        const end = new Date(new Date(sch.start).getTime() + sch.durationMin * 60_000).toISOString();
        const snap = snapshotFor("work", jobServices(opt, e?.approval?.addonIds ?? [], (d0.jobLines ?? []).filter((l) => l.jobId === jobId)));
        const undo0 = mutate(
          "job.schedule",
          (d) => ({
            ...d,
            // a second visit does not take a job that is going back to «scheduled» (S10, 15-flows §1.15)
            jobs: d.jobs.map((j) => (j.id === jobId ? { ...j, status: jobStatusAfterSchedule(j.status) } : j)),
            visits: [
              ...d.visits,
              { id: visitId, jobId, techId: peopleOf(sch)[0] ?? null, assigneeIds: peopleOf(sch), start: sch.start, durationMin: sch.durationMin, allDay: sch.allDay ? true : undefined, step: "scheduled", note, scope, checklist: snap.items, photos: [], amountDueCents: due, ...(snap.mins ? { photoMins: snap.mins } : {}) },
            ],
            notices: d.notices.map((n) => (n.jobId === jobId ? { ...n, read: true } : n)),
          }),
          { k: "job.schedule", jobId, visitId, start: sch.start, end, techId: peopleOf(sch)[0] ?? null, assigneeIds: peopleOf(sch), note, scope, allDay: !!sch.allDay },
        );
        return undoTogether([undo0, snapshotOps(visitId, snap)]);
      },
      saveCompany: (patch) => {
        const cur = dbRef.current.company;
        if (!cur) return () => {};
        const next = { ...cur, ...patch };
        return mutate("company.save", (d) => ({ ...d, company: next }), { k: "company.save", company: next, einChanged: patch.ein !== undefined, tzChanged: patch.timezone !== undefined });
      },
      saveLicense: (l) =>
        mutate(
          "license.save",
          (d) => (d.company ? { ...d, company: { ...d.company, licenses: upsert(d.company.licenses, l) } } : d),
          { k: "license.save", license: l },
        ),
      removeLicense: (id) =>
        mutate(
          "license.remove",
          (d) => (d.company ? { ...d, company: { ...d.company, licenses: d.company.licenses.filter((x) => x.id !== id) } } : d),
          { k: "license.remove", id },
        ),
      saveContact: (c) =>
        mutate(
          "contact.save",
          (d) =>
            d.company
              ? {
                  ...d,
                  company: {
                    ...d.company,
                    contacts: upsert(d.company.contacts.map((x) => (c.isPrimary && x.id !== c.id ? { ...x, isPrimary: false } : x)), c),
                  },
                }
              : d,
          { k: "contact.save", contact: c },
        ),
      removeContact: (id) =>
        mutate(
          "contact.remove",
          (d) => (d.company ? { ...d, company: { ...d.company, contacts: d.company.contacts.filter((x) => x.id !== id) } } : d),
          { k: "contact.remove", id },
        ),
      inviteMember: (m) => {
        if (modeRef.current !== "demo") return () => {};
        const initials = m.name.split(/\s+/).map((x) => x[0]).slice(0, 2).join("").toUpperCase() || "?";
        const expiresAt = new Date(Date.now() + 7 * 864e5).toISOString();
        return mutate("member.invite", (d) => ({ ...d, members: [...d.members, { id: uid(), ...m, initials, pending: true, expiresAt }] }));
      },
      revokeInvite: (id) => {
        if (modeRef.current !== "demo" || !dbRef.current.members.some((m) => m.id === id && m.pending)) return () => {};
        return mutate("member.revoke", (d) => ({ ...d, members: d.members.filter((m) => m.id !== id) }));
      },
      setMemberDisabled: (id, disabled) => {
        if (modeRef.current !== "demo") return () => {};
        const d0 = dbRef.current;
        const m = d0.members.find((x) => x.id === id && (disabled ? !x.pending : !!x.disabled));
        if (!m || m.id === d0.me) return () => {};
        // the person stays in `members` (old records keep the name); `pending` keeps them out of pickers
        return mutate("member.status", (d) => ({
          ...d,
          members: d.members.map((x) => (x.id !== id ? x : disabled ? { ...x, disabled: true, pending: true } : { ...x, disabled: undefined, pending: undefined })),
        }));
      },
      readNotices: () => {
        const ids = dbRef.current.notices.filter((n) => !n.read).map((n) => n.id);
        if (!ids.length) return;
        mutate("notice.read", (d) => ({ ...d, notices: d.notices.map((n) => ({ ...n, read: true })) }), { k: "notice.read", ids });
      },
      signEstimate: (id, path) =>
        // #1126: a draft only by someone who may send it (the server signs only a sent, locked version)
        !canCountersign(dbRef.current, dbRef.current.me) || !canSignDraftOnSite(role, dbRef.current.estimates.find((x) => x.id === id)?.status ?? "draft") ? () => {} : mutate(
          "estimate.sign",
          (d) => ({
            ...d,
            estimates: d.estimates.map((e) =>
              // E2a: the client's signature waits for the company's (S8 → S8b), also for a legacy quick estimate
              e.id === id && e.status !== "approved" ? { ...e, status: "awaiting_countersign", signature: path, sentAt: e.sentAt ?? new Date().toISOString() } : e,
            ),
          }),
          {
            k: "estimate.sign", id, svg: path, signer: dbRef.current.customers.find((c) => c.id === dbRef.current.estimates.find((x) => x.id === id)?.customerId)?.name ?? "Client",
            sent: dbRef.current.estimates.find((x) => x.id === id)?.status === "sent",
            // #1147: the total the client saw on the phone — the server refuses another (the office changed it meanwhile).
            // Not while this phone's own estimate.add of it is still queued: that op writes its lines' prices as
            // round(total / qty), cents off the phone's total — a refusal that only looks like a change; the door without
            // the total then, as before (#1153 removes that door once no such op is left)
            ...(signTotalFor(dbRef.current.estimates.find((x) => x.id === id), outboxRef.current.some((x) => x.op.k === "estimate.add" && x.op.id === id))),
          },
        ),
      payDeposit: (id, method, fromClient) => {
        const e = dbRef.current.estimates.find((x) => x.id === id);
        if (!e || !e.depositCents) return () => {};
        const job0 = jobOfEstimate(dbRef.current, id);
        const depInv = job0 ? dbRef.current.invoices.find((i) => i.jobId === job0.id && i.kind === "deposit") : undefined;
        if (depInv) return recordPayment(depInv.id, depInv.totalCents - depInv.paidCents, method, undefined, fromClient);
        const now = new Date().toISOString();
        const existingJob = jobOfEstimate(dbRef.current, id);
        const jobId = existingJob?.id ?? uid();
        const invoiceId = uid();
        const paymentId = uid();
        return mutate(
          "estimate.deposit",
          (d) => ({
            ...d,
            estimates: d.estimates.map((x) => (x.id === id ? { ...x, depositPaidAt: now } : x)),
            notices: [
              { id: uid(), kind: "deposit.paid", estimateId: id, invoiceId, customer: d.customers.find((c) => c.id === e.customerId)?.name ?? "", depositCents: e.depositCents, at: now, read: !fromClient },
              ...d.notices,
            ],
            jobs: existingJob ? d.jobs : [...d.jobs, { id: jobId, number: modeRef.current === "demo" ? nextJobNumber(d) : undefined, customerId: e.customerId, propertyId: e.propertyId, title: e.title, status: "unscheduled", amountCents: e.totalCents, estimateId: id, serviceCategoryId: inheritCategory(d, { kind: "job", estimateId: id }) }],
            invoices: [
              ...d.invoices,
              // В1-7б (rule 7): what goes to the client is named in the client's language, not the app's and not English
              { id: invoiceId, customerId: e.customerId, jobId, totalCents: e.depositCents!, paidCents: e.depositCents!, dueDate: now, paidAt: now, method, kind: "deposit", title: tFor(docLanguageFor(d, { customerId: e.customerId }))("path.inv.deposit") },
            ],
            payments: [
              { id: paymentId, invoiceId, customerId: e.customerId, amountCents: e.depositCents!, method, at: now, receiptNumber: modeRef.current === "demo" ? nextReceipt(d) : undefined },
              ...d.payments,
            ],
          }),
          {
            k: "estimate.deposit", id, jobId, invoiceId, paymentId, method, customerId: e.customerId, propertyId: e.propertyId,
            title: e.title, totalCents: e.totalCents, depositCents: e.depositCents, dueDate: companyToday(Date.parse(now)),
          },
        );
      },
      resetDemo: () => (mode === "demo" ? mutate("demo.reset", () => makeSeed()) : () => {}),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, mode, company, role, online, link, pendingQueue.length, unsentAll, notSavedOnDevice, outbox, rejected, sendingId, syncError, loading, mutate, undoTogether, setRole, setQueue, refresh, flush, auth.userId],
  );

  // nothing is written while a state is not loaded: the screen only reads again (A-01)
  if (health.some((h) => h.readError)) {
    const retryAll = () => health.forEach((h) => h.readError && h.retry());
    const broken = health.filter((h) => h.salvage);
    const salvageAll = broken.length ? () => broken.forEach((h) => h.salvage!()) : null;
    // the copy of a broken record was refused (full storage): said on the error screen itself (review of #910, round 2 №1)
    return <>{readError?.(retryAll, salvageAll, broken.some((h) => h.writeFailed)) ?? null}</>;
  }
  if (!auth.ready || !dbReady || !roleReady || !queueReady || !outboxReady || !rejectedReady) return null;

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore outside StoreProvider");
  return v;
}

export { isToday, isOverdue, visitContext, minutesSince, daysSince, customerBalance, jobProfit } from "./selectors";
