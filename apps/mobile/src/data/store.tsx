/**
 * App store. Two modes, same interface for every screen:
 *  - demo:  local test data (reseeded each day), nothing leaves the device;
 *  - cloud: signed in with a company — data comes from the OCTODEX database (src/cloud/repo.ts),
 *           every change is applied locally at once and sent through a persisted outbox (src/cloud/ops.ts).
 * Every mutation returns `undo` for the 5-second "Undo" toast (DS rule 10). In cloud mode an op is sent
 * only after that window, so Undo simply drops it from the outbox.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as Crypto from "expo-crypto";
import { motion } from "@octo/design-tokens";
import { useAuth } from "@/cloud/auth";
import { appRoles, loadCompanyDB } from "@/cloud/repo";
import { effectiveRole } from "@/nav/roles";
import { applyOp, renewSession, sendVisitPoint, type Op, type OutboxItem } from "@/cloud/ops";
import { callNext, callOp, leadTouchNext, leadTouchOp, messageNext, messageOp, type LeadTouch } from "@/features/comms/contactEvents";
import { keepLast, stepPending } from "@/features/location";
import { changeConsent, withConsent, type ConsentChange } from "@/features/locationConsent";
import { leadCols, type LeadPatch } from "@/cloud/leadCols";
import { leadStatusToDb } from "@/cloud/statusMap";

/** app lead status → public.leads.status */
const dbStatus = (s: LeadStatus): string => leadStatusToDb[s];
import { makeSeed } from "./seed";
import { normalizeDB } from "./normalize";
import { cleanPeople, leadPeopleOf, mainContact, nextClientNumber } from "./people";
import { findJob, jobOfEstimate, nextJobNumber } from "./jobs";
import { withNewJob, type NewJobInput } from "@/features/newJob";
import { lineChangeRefusal, lineSaveUndo, taxBefore, withJobLine, withJobTax, withoutJobLine } from "@/features/jobLines";
import { jobStatusAfterSchedule, jobStatusAfterStep, withJobDone } from "@/features/jobDone";
import { applyCustomerPatch, type CustomerPatch } from "./customerPatch";
import { statusAfterManualWin } from "@/features/clientRows";
import { inheritCategory } from "@/features/serviceCategories";
import { rescheduled, canCancel, canReschedule, hasPlannedInspection, jobRollsBack, leadRollsBack, stepChange, withAssignees } from "@/features/schedule";
import { cityLine, splitGateCodes, withGateCodes } from "@/features/properties";
import { clientDoc, newToken, summarize } from "@/features/estimateDoc";
import { canCountersign, canEditMember, canGrantSign, canManageLink, clientSigned, companyDeclined, companySigned, reopened, savedSignature, validUntilFor } from "@/features/estimateSign";
import { acceptPayment } from "@octo/estimating-engine";
import { deviceGeneration, onDeviceForgotten, todayKey, usePersistentState } from "./persist";
import { backoffMs, classify, isStuck, MAX_TRIES, maybeOpOnly, needsSignIn, STUCK_RETRY_MS } from "./outboxRetry";
import { dependentsOf, isMoneyOp, madeOnQueue, nextToSend, waitingFor } from "./outboxDeps";
import { leavingSummary, MONEY_KINDS } from "./syncLink";
import { REJECTED_KEY, rejectedMine, rejectedOf, type RejectedOp } from "./outboxRejected";
import type { DictKey } from "@/i18n";
import { onAppActive } from "./appActive";
import { adoptLegacy, mineOf, OUTBOX_KEY, othersOf, sameOwner, unsentOf, type OwnedItem } from "./outboxOwner";
export { mineOf, type OwnedItem } from "./outboxOwner";
import { companyToday, setZone } from "@/features/zone";
import { eventProblems } from "@/features/planFeed";
import {
  type CalendarEvent,
  type MemberPrefs,
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
} from "./types";

type Undo = () => void;
/** an undo that may be refused (the job lines' rules): false = refused, nothing changed */
export type GuardedUndo = () => boolean;
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
  dismissRejected: (id: ID) => void;
  refresh: () => Promise<void>;
  loading: boolean;
  advanceVisit: (id: ID) => Undo;
  addPhoto: (visitId: ID, kind: "before" | "after", uri?: string) => Undo;
  toggleCheck: (visitId: ID, itemId: ID) => Undo;
  removePhoto: (visitId: ID, photoId: ID) => Undo;
  /** extra checklist item added on site by the tech */
  addCheckItem: (visitId: ID, label: string) => Undo;
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
  /** progress (by stage) or final balance invoice for a job */
  issueInvoice: (jobId: ID, kind: "progress" | "final", amountCents: number, title: string) => Undo;
  /** create or update a universal estimate (draft) */
  saveEstimate: (e: { id: ID; customerId: ID; propertyId: ID; title: string; doc: EstimateDoc; leadId?: ID }) => Undo;
  /** client + property for an estimate from a lead (creates a prospect card the first time) */
  leadEstimateTarget: (leadId: ID) => { customerId: ID; propertyId: ID; undo: Undo } | null;
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
  setJobTax: (jobId: ID, tax: { taxEnabled: boolean; taxRateBps: number }) => GuardedUndo;
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
  readNotices: () => void;
  /** invite a person (demo: added as pending; cloud: email invites come with the email service) */
  inviteMember: (m: { name: string; email?: string; phone?: string; roles: Role[]; kind: "employee" | "sub" }) => Undo;
  /** wave 7-2 (S21), demo: cancel an invitation / switch a person off or back on (the cloud goes through cloud/team.ts) */
  revokeInvite: (id: ID) => Undo;
  setMemberDisabled: (id: ID, disabled: boolean) => Undo;
  /** company profile (owner/admin in the cloud) */
  saveCompany: (patch: Partial<Omit<Company, "id" | "licenses" | "contacts">>) => Undo;
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
    invoices: d.invoices.map((i) =>
      i.id === p.invoiceId
        ? { ...i, paidCents: i.paidCents + p.amountCents, method: p.method, paidAt: i.paidCents + p.amountCents >= i.totalCents ? p.at : i.paidAt }
        : i,
    ),
  };
}
/** Fresh ids for options/lines when a sent estimate is edited (the sent version stays immutable in the database). */
const reId = (doc: EstimateDoc): EstimateDoc => ({
  ...doc,
  options: doc.options.map((o) => ({ ...o, id: uid(), lines: o.lines.map((l) => ({ ...l, id: uid() })) })),
});
const costsOf = (doc: EstimateDoc): Record<string, number> =>
  Object.fromEntries(doc.options.flatMap((o) => o.lines.filter((l) => l.unitCostCents !== undefined).map((l) => [l.id, l.unitCostCents!])));

export function StoreProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const company = auth.session ? auth.company : null;
  const mode: Mode = company && auth.userId ? "cloud" : "demo";
  const cacheKey = mode === "cloud" ? `octo.cloud.v1.${company!.companyId}` : "octo.db.v5";

  // Demo data is reseeded each new day (dates are relative to "today"). Cloud data is a cache of the server.
  const [saved, setSaved, dbReady] = usePersistentState<{ day: string; db: DB }>(
    cacheKey,
    () => (mode === "cloud" ? { day: "cloud", db: emptyDB(auth.userId ?? "") } : { day: todayKey(), db: makeSeed() }),
    {
      validate: (v) =>
        Array.isArray(v?.db?.visits) && Array.isArray(v?.db?.expenses) && (mode === "cloud" ? v.day === "cloud" : v.day === todayKey()),
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
  const [savedRole, setRole, roleReady] = usePersistentState<Role>("octo.role.v1", "director");
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
  const [queue, setQueue, queueReady] = usePersistentState<QueuedAction[]>("octo.queue.v1", []);
  const [outbox, setOutbox, outboxReady] = usePersistentState<OwnedItem[]>(OUTBOX_KEY, []);
  // money changes the server refused (docs/specs/23 §3): kept until «Понятно»
  const [rejected, setRejected, rejectedReady] = usePersistentState<RejectedOp[]>(REJECTED_KEY, []);
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
  const outboxReadyRef = useRef(outboxReady);
  outboxReadyRef.current = outboxReady;
  const forgetOnLoad = useRef<{ userId: string | null } | null>(null);
  useEffect(() => {
    if (!outboxReady || !forgetOnLoad.current) return;
    const { userId } = forgetOnLoad.current;
    forgetOnLoad.current = null;
    setOutbox((prev) => (outboxRef.current = othersOf(prev, userId)));
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
      if (stale(gen) || modeRef.current !== "cloud" || cacheKeyRef.current !== `octo.cloud.v1.${company.companyId}`) return;
      if (!pendingLive()) setDb(next);
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
  useEffect(
    () =>
      onDeviceForgotten((_wiped, info) => {
        wipedKey.current = cacheKeyRef.current;
        // the outbox keeps other people's ops (rule 6): only the deleted person's go (and old ones without an owner).
        // The deleted person comes with the wipe: the sign-in may already be gone from the store (review #240 №2)
        // told by the wipe (even «not known» = null: never the person signed in now, review #244), else the sign-in
        const me = "userId" in info ? (info.userId ?? null) : (whoRef.current?.userId ?? null);
        if (!outboxReadyRef.current) forgetOnLoad.current = { userId: me };
        // a functional update: the latest outbox, also one that is set but not yet rendered
        setOutbox((prev) => (outboxRef.current = othersOf(prev, me)));
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
          if (!maybeOpOnly(e)) setSyncError(msg);
          // no answer, or the server's «not now» (5xx, 429, an expired sign-in…): not a try — the op stays as it is,
          // the next send waits longer (review #244)
          if (classify(e) !== "refusal") {
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
          if (item.tries + 1 >= MAX_TRIES) {
            // Will never succeed: drop it and reload the truth from the server. A money change is not dropped
            // silently: it stays as «не записано на сервере» until the person says «Понятно» (docs/specs/23 §3)
            outboxRef.current = outboxRef.current.filter((x) => x.id !== item.id);
            dropped = true;
            const rej = rejectedOf(item, msg, Date.now());
            if (rej) setRejected((prev) => [...prev.filter((x) => x.id !== rej.id), rej]);
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

  /* ---------- mutations ---------- */
  /** Apply locally; in cloud mode record the op; return undo. */
  const mutate = useCallback(
    (label: string, fn: (d: DB) => DB, op?: Op): Undo => {
      const prev = dbRef.current;
      const next = fn(prev);
      dbRef.current = next;
      setDb(next);
      let qid: string | null = null;
      let oid: string | null = null;
      if (modeRef.current === "cloud" && op) {
        oid = uid();
        // an upsert that cannot tell «new» by itself: what it makes is what was not on the phone before (outboxDeps)
        const made = madeOnQueue(op, prev);
        outboxRef.current = [
          ...outboxRef.current,
          { id: oid, op, at: new Date().toISOString(), tries: 0, ...(whoRef.current ? { owner: whoRef.current } : {}), ...(made ? { made } : {}) },
        ];
        setOutbox(outboxRef.current);
      } else if (!onlineRef.current) {
        qid = uid();
        setQueue((q) => [...q, { id: qid!, label, at: new Date().toISOString() }]);
      }
      return () => {
        dbRef.current = prev;
        setDb(prev);
        if (qid) setQueue((q) => q.filter((x) => x.id !== qid));
        if (oid) {
          outboxRef.current = outboxRef.current.filter((x) => x.id !== oid);
          setOutbox(outboxRef.current);
        }
      };
    },
    [setDb, setQueue, setOutbox],
  );

  const patchVisit = (d: DB, id: ID, fn: (v: Visit) => Visit): DB => ({
    ...d,
    visits: d.visits.map((v) => (v.id === id ? fn(v) : v)),
  });
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
      { k: "payment.record", id: payment.id, invoiceId, customerId: inv.customerId, amountCents: amount, method, reference: payment.reference },
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
  const dismissRejected = (id: ID) => setRejected((prev) => prev.filter((x) => x.id !== id));
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
      const propertyId = l.propertyId ?? d0.properties.find((p) => p.customerId === l.customerId)?.id;
      if (propertyId) return { customerId: l.customerId, propertyId, undo: () => {} };
    }
    const ids = { customerId: uid(), contactId: uid(), propertyId: uid() };
    const now = new Date().toISOString();
    const undo = mutate(
      "lead.prospect",
      (d) => ({
        ...d,
        // the lead's people become the client's (S3; the server moves them the same way, app.move_lead_people)
        customers: [...d.customers, { id: ids.customerId, name: l.name, phone: l.phone, email: l.email, sourceId: l.sourceId, balanceCents: 0, status: "prospect", people: clientPeopleFromLead(l, ids.contactId) }],
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
      syncError,
      stuckOps,
      retryOp,
      discardOp,
      rejectedOps,
      dismissRejected,
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
      addPhoto: (visitId, kind, uri) => {
        const id = uid();
        const v = dbRef.current.visits.find((x) => x.id === visitId);
        return mutate(
          "photo.add",
          (d) => patchVisit(d, visitId, (x) => ({ ...x, photos: [...x.photos, { id, kind, uri }] })),
          v ? { k: "photo.add", id, visitId, jobId: v.jobId, stage: kind, uri } : undefined,
        );
      },
      toggleCheck: (visitId, itemId) => {
        const v = dbRef.current.visits.find((x) => x.id === visitId);
        const checklist = (v?.checklist ?? []).map((c) => (c.id === itemId ? { ...c, done: !c.done } : c));
        return mutate("check.toggle", (d) => patchVisit(d, visitId, (x) => ({ ...x, checklist })), { k: "visit.checklist", visitId, checklist });
      },
      removePhoto: (visitId, photoId) =>
        mutate("photo.remove", (d) => patchVisit(d, visitId, (x) => ({ ...x, photos: x.photos.filter((p) => p.id !== photoId) })), { k: "photo.remove", id: photoId }),
      addCheckItem: (visitId, label) => {
        const v = dbRef.current.visits.find((x) => x.id === visitId);
        const checklist = [...(v?.checklist ?? []), { id: uid(), label, done: false }];
        return mutate("check.add", (d) => patchVisit(d, visitId, (x) => ({ ...x, checklist })), { k: "visit.checklist", visitId, checklist });
      },
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
        return mutate(
          "visit.pay",
          (d) => {
            const next = patchVisit(d, visitId, (x) => ({ ...x, step: "paid", payment: { method, amountCents: x.amountDueCents, at: now } }));
            return {
              ...next,
              // paying does not close the job: «Работа выполнена?» goes to the office (S10, 17-job §4)
              invoices: customerId
                ? [
                    ...next.invoices,
                    { id: invoiceId, customerId, jobId: v.jobId!, totalCents: v.amountDueCents, paidCents: v.amountDueCents, dueDate: now, paidAt: now, method, kind: "final" },
                  ]
                : next.invoices,
            };
          },
          v.amountDueCents > 0 && customerId
            ? { k: "visit.pay", visitId, jobId: v.jobId!, customerId, invoiceId, paymentId, amountCents: v.amountDueCents, method, dueDate: companyToday(Date.parse(now)) }
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
        const undoVisit = mutate(
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
                note: at.note?.trim() || undefined, scope: [l.message].filter((x): x is string => !!x), checklist: [], photos: [], amountDueCents: 0,
              },
            ],
          }),
          {
            k: "visit.inspection", leadId: id, propertyId: target.propertyId, visitId: ids.visitId, start: at.start, durationMin: at.durationMin,
            techId: peopleOf(at)[0] ?? null, assigneeIds: peopleOf(at), note: at.note?.trim() || undefined, scope: [l.message].filter((x): x is string => !!x),
          },
        );
        return () => {
          undoVisit();
          target.undo();
        };
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
        const undo = mutate(
          "visit.inspection",
          (d) => ({
            ...d,
            visits: [...d.visits, { id, propertyId, kind: "inspection", techId: people[0] ?? null, assigneeIds: people, start: at.start, durationMin: at.durationMin, step: "scheduled", note, scope, checklist: [], photos: [], amountDueCents: 0 }],
          }),
          { k: "visit.inspection", propertyId, visitId: id, start: at.start, durationMin: at.durationMin, techId: people[0] ?? null, assigneeIds: people, note, scope },
        );
        return { id, undo };
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
        // new leads go to the owner by default (founder 04.11); the creator is remembered (a tech keeps seeing his lead)
        const owner = d0.members.find((m) => m.roles.includes("director"))?.id ?? d0.me;
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
        return mutate("estimate.add", (d) => ({ ...d, estimates: [...d.estimates, { ...e, id, serviceCategoryId }] }), {
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
      issueInvoice: (jobId, kind, amountCents, title) => {
        const d0 = dbRef.current;
        const job = d0.jobs.find((j) => j.id === jobId);
        const customerId = job ? d0.properties.find((p) => p.id === job.propertyId)?.customerId : undefined;
        if (!job || !customerId || amountCents <= 0) return () => {};
        const id = uid();
        const now = new Date().toISOString();
        return mutate(
          "invoice.issue",
          (d) => ({
            ...d,
            invoices: [
              ...d.invoices,
              { id, customerId, jobId, kind, title, totalCents: amountCents, paidCents: 0, dueDate: now, sentAt: now, number: modeRef.current === "demo" ? nextInvoiceNumber(d) : undefined },
            ],
          }),
          { k: "invoice.issue", id, jobId, customerId, kind, title, totalCents: amountCents, dueDate: companyToday(Date.parse(now)) },
        );
      },
      sendEstimate: (id, tk) => {
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
      saveEstimate: ({ id, customerId, propertyId, title, doc: doc0, leadId: leadId0 }) => {
        const prev = dbRef.current.estimates.find((e) => e.id === id);
        if (prev?.status === "approved") return () => {};
        const doc = prev && prev.status !== "draft" ? reId(doc0) : doc0;
        const sum = summarize(doc);
        const versionId = uid();
        return mutate(
          "estimate.save",
          (d) => {
            const next: Estimate = {
              ...(prev ?? {}),
              id, customerId, propertyId, title, doc, status: "draft", ...sum, leadId: leadId0 ?? prev?.leadId,
              // «don't sign — change it»: the client signs the new version again (the old signature stays on the server)
              ...(prev?.status === "awaiting_countersign" ? { approval: undefined, signature: undefined } : {}),
              sentAt: prev?.status === "draft" ? prev.sentAt : undefined,
              // a new estimate takes the direction of its lead / client / company (S16); an existing one keeps its own
              serviceCategoryId: prev ? prev.serviceCategoryId : inheritCategory(d, { kind: "estimate", leadId: leadId0, customerId }),
            };
            return { ...d, estimates: prev ? d.estimates.map((e) => (e.id === id ? next : e)) : [...d.estimates, next] };
          },
          { k: "estimate.save", id, versionId, customerId, propertyId, leadId: leadId0 ?? prev?.leadId, title, doc: clientDoc(doc), costs: costsOf(doc), totalCents: sum.totalCents, depositCents: sum.depositCents, marginPct: sum.marginPct },
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
        return mutate("estimate.approve", (d) => clientSigned(d, id, a, ids, now, token), {
          k: "estimate.approve", id, token, optionId: a.optionId, addonIds: a.addonIds, signer: a.signerName, svg: a.signature, channel: a.channel, jobId: ids.jobId, invoiceId: ids.invoiceId,
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
          (d) => companySigned(d, id, { userId: d.me, signature: svg, method: saved ? "saved" : "drawn", title: saved?.title }, ids, now, (x) => (modeRef.current === "demo" ? nextInvoiceNumber(x) : undefined), (x) => (modeRef.current === "demo" ? nextJobNumber(x) : undefined)),
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
              ? [...d.customers, { id: ids.customerId, name: l.name, phone: l.phone, email: l.email, sourceId: l.sourceId, balanceCents: 0, status: "active", people: clientPeopleFromLead(l, ids.contactId) }]
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
      saveCatalogItem: (it) =>
        mutate(
          "catalog.save",
          (d) => ({ ...d, catalog: d.catalog.some((x) => x.id === it.id) ? d.catalog.map((x) => (x.id === it.id ? it : x)) : [...d.catalog, it] }),
          { k: "catalog.save", item: it },
        ),
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
        const paidDeposit = e?.depositPaidAt ? e.depositCents ?? 0 : 0;
        const due = Math.max(0, job.amountCents - paidDeposit);
        const end = new Date(new Date(sch.start).getTime() + sch.durationMin * 60_000).toISOString();
        return mutate(
          "job.schedule",
          (d) => ({
            ...d,
            // a second visit does not take a job that is going back to «scheduled» (S10, 15-flows §1.15)
            jobs: d.jobs.map((j) => (j.id === jobId ? { ...j, status: jobStatusAfterSchedule(j.status) } : j)),
            visits: [
              ...d.visits,
              { id: visitId, jobId, techId: peopleOf(sch)[0] ?? null, assigneeIds: peopleOf(sch), start: sch.start, durationMin: sch.durationMin, allDay: sch.allDay ? true : undefined, step: "scheduled", note, scope, checklist: [], photos: [], amountDueCents: due },
            ],
            notices: d.notices.map((n) => (n.jobId === jobId ? { ...n, read: true } : n)),
          }),
          { k: "job.schedule", jobId, visitId, start: sch.start, end, techId: peopleOf(sch)[0] ?? null, assigneeIds: peopleOf(sch), note, scope, allDay: !!sch.allDay },
        );
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
        !canCountersign(dbRef.current, dbRef.current.me) ? () => {} : mutate(
          "estimate.sign",
          (d) => ({
            ...d,
            estimates: d.estimates.map((e) =>
              // E2a: the client's signature waits for the company's (S8 → S8b), also for a legacy quick estimate
              e.id === id && e.status !== "approved" ? { ...e, status: "awaiting_countersign", signature: path, sentAt: e.sentAt ?? new Date().toISOString() } : e,
            ),
          }),
          { k: "estimate.sign", id, svg: path, signer: dbRef.current.customers.find((c) => c.id === dbRef.current.estimates.find((x) => x.id === id)?.customerId)?.name ?? "Client" },
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
              { id: invoiceId, customerId: e.customerId, jobId, totalCents: e.depositCents!, paidCents: e.depositCents!, dueDate: now, paidAt: now, method, kind: "deposit", title: "Deposit" },
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
    [db, mode, company, role, online, link, pendingQueue.length, unsentAll, outbox, rejected, sendingId, syncError, loading, mutate, setRole, setQueue, refresh, flush],
  );

  if (!auth.ready || !dbReady || !roleReady || !queueReady || !outboxReady || !rejectedReady) return null;

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore outside StoreProvider");
  return v;
}

export { isToday, isOverdue, visitContext, minutesSince, daysSince, customerBalance, jobProfit } from "./selectors";
