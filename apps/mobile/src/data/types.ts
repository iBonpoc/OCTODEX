import type { CustomOption, CustomSettings, LineGroup } from "@octo/estimating-engine";

/**
 * Local domain types (subset of docs/04-domain-model.md v0.3.1).
 * Same shape the Supabase/PowerSync layer will provide in wave 5. Money is integer cents.
 */
export type Role = "tech" | "dispatcher" | "director";
export type ID = string;

export interface Member {
  id: ID;
  name: string;
  initials: string;
  kind: "employee" | "sub";
  roles: Role[];
  email?: string;
  phone?: string;
  /** invited, has not joined yet */
  pending?: boolean;
}

/**
 * Where leads come from — the company's own list (founder 04.11): a marketplace (Thumbtack, Yelp…), ads, a person
 * (friend, contractor Kolya…) or own channels (website, repeat client, referral). Hidden, never deleted, once it has leads.
 */
export type SourceKind = "marketplace" | "ads" | "person" | "own";
export const SOURCE_KINDS: SourceKind[] = ["marketplace", "ads", "person", "own"];
export interface Source {
  id: ID;
  name: string;
  kind: SourceKind;
  /** a person source: how to reach them; optionally an existing client */
  phone?: string;
  email?: string;
  customerId?: ID;
  note?: string;
  active: boolean;
  system?: boolean;
  position?: number;
}

/** prospect: has an estimate but has not signed yet (not in the main client list); archived / do_not_service: closed */
export const CUSTOMER_STATUSES = ["prospect", "active", "archived", "do_not_service"] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];
export interface Customer {
  id: ID;
  /** CLT-0001, assigned by the server (demo: by the app) */
  number?: string;
  name: string;
  /** cached main phone / email of the main person (search, duplicates, quick call) */
  phone: string;
  email?: string;
  sourceId: ID;
  /** positive = customer owes us */
  balanceCents: number;
  status?: CustomerStatus;
  /** why the client is "do not service" */
  statusReason?: string;
  /** people of the client, each with several phones and emails (docs/specs/04 §3.2) */
  people?: Person[];
  tagIds?: ID[];
}

/** A person of a client or a lead: one shape for both (agreed with the leads chat, 05.11.2026). */
export type PersonRole = "main" | "spouse" | "assistant" | "tenant" | "property_manager" | "accountant" | "other";
export interface PersonPhone {
  number: string;
  label: PhoneLabel;
  primary?: boolean;
}
export interface PersonEmail {
  address: string;
  primary?: boolean;
}
export interface Person {
  id: ID;
  name: string;
  role: PersonRole;
  phones: PersonPhone[];
  emails: PersonEmail[];
  language?: import("@/i18n/translate").DocLang;
}

/** Company tag on clients (VIP, Regular…): neutral, never coloured (colour is only for statuses). */
export interface Tag {
  id: ID;
  name: string;
  active: boolean;
  position: number;
  system?: boolean;
}

export const PROPERTY_KINDS = ["single_family", "multi_family", "commercial", "hoa_common"] as const;
export type PropertyKind = (typeof PROPERTY_KINDS)[number];
export interface Property {
  id: ID;
  customerId: ID;
  /** street line (line1) */
  address: string;
  /** shown line: "City, ST zip" (built from place when it is known) */
  city: string;
  stories: number;
  /** C2 (docs/specs/04 §3): apartment / suite, the city / state / zip apart, a label ("Home", "Rental"), the kind */
  unit?: string;
  place?: { city: string; state?: string; zip?: string };
  label?: string;
  kind?: PropertyKind;
  /** dog, side gate, parking — whoever sees the property sees these */
  accessNotes?: string;
  /** office always; a tech only on the day of their visit and the day before (server: app.can_see_gate_code) */
  gateCode?: string;
  /** people of the property: links to the client's people (tenant, property manager) */
  contactIds?: ID[];
}

/** unscheduled: client signed, the contractor has not picked a date yet (not in the plan) */
export const JOB_STATUSES = ["lead", "estimate", "unscheduled", "scheduled", "in_progress", "done"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export interface Job {
  id: ID;
  propertyId: ID;
  title: string;
  status: JobStatus;
  amountCents: number;
  estimateId?: ID;
}

export type VisitStep = "scheduled" | "en_route" | "on_site" | "working" | "signed" | "paid";
export const VISIT_STEPS: VisitStep[] = ["scheduled", "en_route", "on_site", "working", "signed", "paid"];

export interface ChecklistItem {
  id: ID;
  label: string;
  done: boolean;
}

export interface Photo {
  id: ID;
  kind: "before" | "after";
  uri?: string;
}

export type PaymentMethod = "card" | "cash" | "check" | "zelle";

export interface Visit {
  id: ID;
  jobId: ID;
  techId: ID | null;
  start: string; // ISO
  durationMin: number;
  step: VisitStep;
  scope: string[];
  checklist: ChecklistItem[];
  photos: Photo[];
  amountDueCents: number;
  signature?: string; // SVG path data
  payment?: { method: PaymentMethod; amountCents: number; at: string };
  late?: boolean;
}

/**
 * Funnel: new → replied ("in touch") → booked (estimate visit) → estimate_sent → won (client).
 * Closed: lost (the client decided) or declined (we decided) — always with a reason; both can be reopened.
 */
export const LEAD_STATUSES = ["new", "replied", "booked", "estimate_sent", "won", "lost", "declined"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const LEAD_FUNNEL: LeadStatus[] = ["new", "replied", "booked", "estimate_sent", "won"];
/** the client decided */
export const LOST_REASONS = ["no_response", "chose_competitor", "price_too_high", "not_ready_timing", "other"] as const;
/** we decided */
export const DECLINE_REASONS = ["not_profitable", "service_not_offered", "out_of_service_area", "junk_spam", "duplicate", "other"] as const;
export type LostReason = (typeof LOST_REASONS)[number] | (typeof DECLINE_REASONS)[number];
export type PhoneLabel = "mobile" | "home" | "work" | "other";
export type ContactWay = "call" | "sms" | "email";
export type Timeframe = "asap" | "this_week" | "this_month" | "flexible" | "date";
export type ContactRole = "spouse" | "tenant" | "property_manager" | "owner" | "other";
export interface LeadContact {
  id: ID;
  name: string;
  role: ContactRole;
  phone?: string;
  email?: string;
}
export interface Lead {
  id: ID;
  name: string;
  phone: string;
  /** before wave L2 part 2 (read only; now a phone of the main person) */
  phone2?: string;
  phone2Label?: PhoneLabel;
  email?: string;
  preferredContact?: ContactWay;
  /** client documents and messages in this language */
  language?: import("@/i18n/translate").DocLang;
  /** job address */
  address?: string;
  city: string;
  state?: string;
  zip?: string;
  sourceId: ID;
  /** what the client asked for: a service from the catalog and/or own words */
  serviceItemId?: ID;
  service?: string;
  timeframe?: Timeframe;
  timeframeDate?: string;
  budgetCents?: number;
  /** what this lead cost (0 by default; Thumbtack later via webhook). Never shown to techs. */
  costCents?: number;
  receivedAt: string;
  message: string;
  status: LeadStatus;
  /** who works the lead (owner by default) */
  assigneeId?: ID;
  createdBy?: ID;
  /** first call / SMS / email / "I replied" — stops the reply timer */
  firstResponseAt?: string;
  /** before wave L2 part 2: extra people with one phone / email (read only; now in `people`) */
  contacts?: LeadContact[];
  /** people of the lead, each with several phones and emails (docs/14 §2, Р12); the first is the lead itself.
   *  `phone` / `email` above are the main person's primary ones, kept for search and lists. */
  people?: Person[];
  /** set when a prospect card / client exists for this lead */
  customerId?: ID;
  propertyId?: ID;
  wonVia?: "approval" | "deposit" | "manual";
  lostReason?: LostReason;
  lostReasonText?: string;
  /** last change by the contractor */
  lastActivityAt?: string;
  /** LEA-0001 — the server assigns it; a new lead made offline gets a provisional one */
  number?: string;
  /** owner's gut feeling after talking (docs/14 Р9) */
  interest?: LeadInterest;
  /** "call me in 3 months": hidden from open lists until this date; not a status (Р10) */
  snoozedUntil?: string;
  snoozeReason?: string;
  /** unanswered calls in a row — reset by a real conversation (Р13) */
  callAttempts?: number;
  /** our last call / SMS / email / marketplace reply */
  lastOutboundAt?: string;
  /** the client's last message (filled once inbound messages arrive) */
  lastInboundAt?: string;
  /** "Remind" was sent — starts the "lost or wait?" countdown */
  remindedAt?: string;
  /** "wait more" answer to "lost or wait?" — ask again after this date */
  askAgainAt?: string;
  archivedAt?: string;
}
export const LEAD_INTERESTS = ["hot", "warm", "cold"] as const;
export type LeadInterest = (typeof LEAD_INTERESTS)[number];
/** what happened on a call from the lead card */
export type CallOutcome = "answered" | "no_answer" | "voicemail";

/** A to-do with a date on a lead, client, job or estimate ("next step"). */
export interface Task {
  id: ID;
  subjectType: "lead" | "customer" | "job" | "estimate";
  subjectId: ID;
  title: string;
  dueAt?: string;
  assigneeId?: ID;
  doneAt?: string;
}

/** History line: contact attempts, status changes, assignment, edits. Notes, estimates and visits join the timeline from their own tables. */
export type ActivityKind = "call" | "sms" | "email" | "marketplace" | "reply" | "status" | "assigned" | "edited";
export interface Activity {
  id: ID;
  subjectType: "lead" | "customer" | "job" | "estimate";
  subjectId: ID;
  kind: ActivityKind;
  body?: string;
  /** status change: from → to; assignment: member id */
  meta?: Record<string, string>;
  at: string;
  actorId: ID;
}

export const ESTIMATE_STATUSES = ["draft", "sent", "approved", "declined"] as const;
export type EstimateStatus = (typeof ESTIMATE_STATUSES)[number];

/** Universal estimate content (trade-agnostic): options → lines in groups, add-ons, discount, tax, deposit. */
export interface EstimateDoc {
  options: CustomOption[];
  settings: CustomSettings;
  /** note to the client (scope, terms) */
  note?: string;
}

/** What the client chose and signed (on site or on the client page). */
export interface EstimateApproval {
  optionId: string;
  addonIds: string[];
  signerName: string;
  signature: string;
  at: string;
  channel: "on_site" | "portal";
  totalCents: number;
  depositCents: number;
}
export interface Estimate {
  id: ID;
  customerId: ID;
  propertyId: ID;
  title: string;
  totalCents: number;
  status: EstimateStatus;
  sentAt?: string;
  approvedAt?: string;
  /** client-visible lines of the chosen option (hidden BOM lines stay in the engine) */
  lines?: { name: string; qty: string; totalCents: number; optional?: boolean }[];
  depositCents?: number;
  marginPct?: string | null;
  signature?: string;
  depositPaidAt?: string;
  /** the lead this estimate was made from */
  leadId?: ID;
  /** universal estimate content; absent in old quick estimates */
  doc?: EstimateDoc;
  /** secret part of the client link /p/<token> */
  token?: string;
  number?: string;
  viewedAt?: string;
  approval?: EstimateApproval;
}

/** Company catalog: services, labor, materials and kits (docs/04-domain-model.md CatalogItem). */
export type CatalogKind = LineGroup | "kit";
export interface CatalogItem {
  id: ID;
  kind: CatalogKind;
  name: string;
  description?: string;
  unit: string;
  /** client price per unit (service/labor: typed; material: cost × (1 + vendor tax) × (1 + markup)) */
  priceCents: number;
  /** purchase price per unit without supplier tax */
  costCents?: number;
  vendor?: string;
  vendorTaxBps?: number;
  markupBps?: number;
  /** kit: items with quantities */
  components?: { itemId: ID; qty: string }[];
  /** test price (founder rule: real prices never in code) */
  placeholder?: boolean;
}

export type NoticeKind = "estimate.viewed" | "estimate.approved" | "deposit.paid" | "invoice.paid";
export interface Notice {
  id: ID;
  kind: NoticeKind;
  estimateId?: ID;
  jobId?: ID;
  customer: string;
  totalCents?: number;
  depositCents?: number;
  at: string;
  read?: boolean;
}

/* ---------- Company profile (wave 7, docs/13 §2) ---------- */
export type EntityType = "llc" | "corporation" | "sole_proprietor" | "partnership" | "other";
export type LicenseKind = "cslb" | "city_business" | "his" | "other";
export interface CompanyLicense {
  id: ID;
  kind: LicenseKind;
  number: string;
  classes: string[];
  expiresOn?: string; // YYYY-MM-DD
  onDocuments: boolean;
}
/** People the client sees on documents (not app users; one person can be both). */
export interface CompanyContact {
  id: ID;
  name: string;
  title?: string;
  phone?: string;
  email?: string;
  isPrimary: boolean;
  onDocuments: boolean;
}
export interface Address {
  line1: string;
  city: string;
  state: string;
  zip: string;
}
export interface Company {
  id: ID;
  /** name on file (legal) is legalName; name = what the app and clients see */
  name: string;
  dba?: string;
  legalName?: string;
  entityType?: EntityType;
  /** only owner/admin read it */
  ein?: string;
  phone?: string;
  email?: string;
  website?: string;
  address: Address;
  mailingAddress?: Address;
  timezone: string;
  /** language of what goes to clients when the client's own is not known (en in the US); docLanguageFor decides */
  docLanguage?: import("@/i18n/translate").DocLang;
  trades: string[];
  brand: { logo?: string; color?: string };
  insurance: { cglCarrier?: string; cglPolicy?: string; wcCarrier?: string; wcPolicy?: string; wcExempt?: boolean };
  /** where the client sends a cancellation (CA 3-day right) */
  cancelEmail?: string;
  /** lead thresholds set by the company (features/leadSettings.ts fills the gaps with defaults) */
  leadSettings?: Partial<import("@/features/leadSettings").LeadSettings>;
  estimate: { validDays: number; depositBps: number | null; terms?: string };
  payment: { zelle?: string; checkPayableTo?: string };
  licenses: CompanyLicense[];
  contacts: CompanyContact[];
  /** onboarding steps the owner chose to skip */
  skipped: string[];
}

export type NoteSubject = "lead" | "customer" | "property" | "job" | "estimate";
export interface Note {
  id: ID;
  subjectType: NoteSubject;
  subjectId: ID;
  body: string;
  visibility: "team" | "private";
  pinned: boolean;
  authorId: ID;
  at: string;
}

export interface Invoice {
  id: ID;
  customerId: ID;
  jobId: ID;
  totalCents: number;
  paidCents: number;
  dueDate: string;
  paidAt?: string;
  method?: PaymentMethod;
  /** deposit → progress (by stage) → final balance; each takes partial payments */
  kind?: "deposit" | "progress" | "final";
  number?: string;
  /** what the client sees: "Deposit", "Progress: rough-in", "Final balance" */
  title?: string;
  sentAt?: string;
}

/** One payment = one receipt (number RCT-… assigned by the server; locally in demo). */
export interface Payment {
  id: ID;
  invoiceId: ID;
  customerId: ID;
  amountCents: number;
  method: PaymentMethod;
  at: string;
  receiptNumber?: string;
  /** check number, Zelle confirmation… */
  reference?: string;
}

export type ExpenseCategory = "materials" | "fuel" | "dump" | "tools" | "other";
export interface Expense {
  id: ID;
  jobId: ID | null;
  vendor: string;
  category: ExpenseCategory;
  amountCents: number;
  at: string;
  receiptUri?: string;
  /** who paid; reimbursements later */
  memberId: ID;
}

export interface QueuedAction {
  id: ID;
  label: string;
  at: string;
}

export interface DB {
  me: ID;
  members: Member[];
  sources: Source[];
  tags: Tag[];
  tasks: Task[];
  activities: Activity[];
  customers: Customer[];
  properties: Property[];
  jobs: Job[];
  visits: Visit[];
  leads: Lead[];
  estimates: Estimate[];
  invoices: Invoice[];
  expenses: Expense[];
  catalog: CatalogItem[];
  notices: Notice[];
  company: Company | null;
  notes: Note[];
  payments: Payment[];
}
