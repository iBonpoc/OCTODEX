import type { CustomOption, CustomSettings, LineGroup } from "@octo/estimating-engine";

/**
 * Local domain types (subset of docs/04-domain-model.md v0.3.1).
 * Same shape the Supabase/PowerSync layer will provide in wave 5. Money is integer cents.
 */
/** sales (wave П3a security check): the office without planning — leads, estimates, clients; does not move, assign or cancel visits */
export type Role = "tech" | "dispatcher" | "director" | "sales";
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
  /** wave 7-2 (S21): the invitation behind a pending person (cloud: public.invitations) and when its link stops working */
  invitationId?: ID;
  expiresAt?: string;
  /** wave 7-2: switched off by the owner/admin (membership «disabled») — kept only in `DB.disabledMembers` */
  disabled?: boolean;
  /* ---- signing for the company (docs/specs/07 §2.2 А, wave E2a) ---- */
  /** may sign contracts for the company (everyone by default; the owner can take it away) */
  canSignContracts?: boolean;
  /** shown under the signature: "Technician" */
  title?: string;
  /** CA home improvement salesperson registration number */
  hisNumber?: string;
  /** E2b-2: the company owner (the only one who gives or takes the right to sign); absent in demo data → a director counts */
  isOwner?: boolean;
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
  /** wave П-1 (13 §5): the parts of the name (server: first_name, last_name, company_name); name stays the shown one */
  firstName?: string;
  lastName?: string;
  companyName?: string;
  /** address for invoices when it is not the property (server: billing_address_*); absent = the property address */
  billing?: BillingAddress;
  /** wave П-2a: no sales tax on this client's new documents (server: tax_exempt; signed ones never change) */
  taxExempt?: boolean;
  /** certificate number or reason */
  taxExemptNote?: string;
}
export interface BillingAddress {
  line1: string;
  line2?: string;
  unit?: string;
  city: string;
  state?: string;
  zip?: string;
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
  /** wave П-1: where it is on the map (server: geo_lat / geo_lng), for the map and «distance from me»; absent = unknown */
  geo?: { lat: number; lng: number };
}

/** unscheduled: client signed, the contractor has not picked a date yet (not in the plan) */
/** an inspection is a visit, not a job: no "lead" / "estimate" statuses (docs/specs/03 §4.4) */
export const JOB_STATUSES = ["unscheduled", "scheduled", "in_progress", "done"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export interface Job {
  id: ID;
  propertyId: ID;
  title: string;
  status: JobStatus;
  amountCents: number;
  estimateId?: ID;
  /** direction of the business (docs/specs/11-trade.md): from the estimate when the job is made */
  serviceCategoryId?: ID;
  /** wave П-1 (13 §5, 15-flows §3.1): JOB-0001 from the server; absent until the job is synced («New job»).
   *  title is the job's own name only — the number is never put in it */
  number?: string;
  /** the client of the job (server: jobs.customer_id); absent in old saved data → through the property */
  customerId?: ID;
  description?: string;
  /** a job type of the company (JobType); absent = not set (old jobs) */
  jobTypeId?: ID;
  /** wave П-2a: tags of the job (the company's Tag list, server: job_tags) */
  tagIds?: ID[];
  /** wave П-2a: tax of a job without an estimate (server: jobs.tax_enabled / tax_rate_bps); an exempt client → off */
  taxEnabled?: boolean;
  taxRateBps?: number;
}

/** A line of a job made without an estimate (wave П-2a, server: job_line_items). The server owns the totals:
 *  totalCents = floor(qty × price + 0.5), the job's amountCents = @octo/estimating-engine jobLinesTotals. */
export interface JobLineItem {
  id: ID;
  jobId: ID;
  position: number;
  name: string;
  description?: string;
  catalogItemId?: ID;
  /** decimal as text ("2.5"), as in estimate lines */
  quantity: string;
  unitPriceCents: number;
  taxable: boolean;
  totalCents: number;
}

/** The company's list of job types (13 §3.4 п. 8, server: job_types): a preset (seedKey, translated in the app) or an
 *  own name; archived ones stay for old jobs. Not a status. */
export const JOB_TYPE_SEED_KEYS = ["install", "repair", "service", "warranty", "other"] as const;
export type JobTypeSeedKey = (typeof JOB_TYPE_SEED_KEYS)[number];
export interface JobType {
  id: ID;
  seedKey?: JobTypeSeedKey;
  name?: string;
  position: number;
  archivedAt?: string;
}

/** A file's record (server: public.files). The photos of a visit (Visit.photos) are a view on the same rows. */
export type FileKind = "photo" | "receipt" | "signature" | "drawing" | "document";
export interface FileItem {
  id: ID;
  kind: FileKind;
  jobId?: ID;
  visitId?: ID;
  customerId?: ID;
  stage?: "before" | "during" | "after" | "other";
  storageKey?: string;
  at: string;
}

export type VisitStep = "scheduled" | "en_route" | "on_site" | "working" | "signed" | "paid" | "done";
/** the steps a job visit walks through on site (an inspection ends with "done", docs/specs/03 §4.1) */
export const VISIT_STEPS: VisitStep[] = ["scheduled", "en_route", "on_site", "working", "signed", "paid"];
/** every status of a visit the story map lists (docs/15-story-map.md §5): the steps, "done" and "cancelled" */
export const VISIT_STATUSES = [...VISIT_STEPS, "done", "cancelled"] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];
export type VisitKind = "inspection" | "install" | "service" | "follow_up";
/** why a visit was cancelled (docs/specs/03 §4.1); "no_show" = the client was not home */
export const CANCEL_REASONS = ["client_cancelled", "no_show", "reschedule_later", "we_cancelled", "other"] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];
/** a visit the office cancelled: the visit as it was + why and when */
export type CancelledVisit = Visit & { cancelReason: CancelReason; cancelText?: string; cancelledAt: string };

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
  /** the job of the visit; an inspection has none (docs/specs/03 §3.1) */
  jobId?: ID;
  /** the first person on the visit (kept for the screens that show one name); always assigneeIds[0] ?? null */
  techId: ID | null;
  /** everyone on the visit (docs/specs/03 §7.4, wave П3a; server: visit_assignees). Missing in old saved data → [techId] */
  assigneeIds?: ID[];
  /** the note for the tech from the visit form (server: visits.notes, wave П3b) */
  note?: string;
  start: string; // ISO
  durationMin: number;
  step: VisitStep;
  scope: string[];
  checklist: ChecklistItem[];
  photos: Photo[];
  amountDueCents: number;
  signature?: string; // SVG path data
  payment?: { method: PaymentMethod; amountCents: number; at: string };
  /** when the tech left (step «on the way»), phone time (docs/specs/03 П3c; server: visits.en_route_at). «Late» itself is computed (features/schedule.ts lateKind) */
  enRouteAt?: string;
  /** the visit ended without the client's payment step: completed or no-show on the server (cancelled visits are not loaded) */
  closed?: boolean;
  /** the property of the visit (docs/specs/03 §3.1, migration 20261105280000); an inspection has it without a job */
  propertyId?: ID;
  /** the lead of an inspection */
  leadId?: ID;
  kind?: VisitKind;
  /** when the office sent the client the time (SMS / email opened from «Сообщить клиенту?», docs/specs/03 §7.1) */
  customerNotifiedAt?: string;
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
  /** direction of the business (docs/specs/11-trade.md): the company's only one by default */
  serviceCategoryId?: ID;
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
  subjectType: "lead" | "customer" | "job" | "estimate" | "property";
  subjectId: ID;
  title: string;
  dueAt?: string;
  assigneeId?: ID;
  doneAt?: string;
  /** wave П-2b (13 §3.7): a task with a time shows in the Plan; end needs a start (server: tasks_time_order) */
  startsAt?: string;
  endsAt?: string;
  allDay?: boolean;
  description?: string;
}

/** An event or a day off (wave П-2b, server: calendar_events). userId absent = the whole company (an event only).
 *  The office sees all; a tech sees his own and the company's. Not a status. */
export type CalendarEventKind = "event" | "time_off";
export interface CalendarEvent {
  id: ID;
  kind: CalendarEventKind;
  userId?: ID;
  title?: string;
  description?: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
}

/** The company's own field of a client or a job (wave П-2b, 13 §3.10, server: custom_fields). */
export const CUSTOM_FIELD_TYPES = ["text", "long_text", "number", "checkbox", "select", "date", "file", "multiselect"] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];
export interface CustomField {
  id: ID;
  entity: "customer" | "job";
  label: string;
  type: CustomFieldType;
  /** choices of a list (select / multiselect) */
  options: string[];
  group?: string;
  searchable: boolean;
  position: number;
  archivedAt?: string;
}
/** A value: string (text, long_text, select, date YYYY-MM-DD, file id), number, boolean, or string[] (multiselect). */
export type CustomFieldValueData = string | number | boolean | string[];
export interface CustomFieldValue {
  id: ID;
  fieldId: ID;
  entityId: ID;
  value: CustomFieldValueData;
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
  /** wave П-1: the person the call / message was with (a contact of the client or the lead), and which way it went */
  contactId?: ID;
  direction?: "in" | "out";
}

/** awaiting_countersign: the client signed remotely, an employee has not signed for the company yet (docs/specs/07 §4, S8b) */
export const ESTIMATE_STATUSES = ["draft", "sent", "awaiting_countersign", "approved", "declined"] as const;
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
  /* ---- company signature (docs/specs/07 §3.2, wave E2a) ---- */
  /** ids the job and the deposit invoice will get when the company signs (offline: the same ids on the phone and the server) */
  jobId?: ID;
  invoiceId?: ID;
  /** on site: the employee whose device the client signed on (signature record, security-check 05.11) */
  deviceUserId?: ID;
}

/* ---------- Company signature on the contract (docs/specs/07 §2.2 А, §3, wave E2a) ---------- */
/** An employee signs for the company in their own name: "Alex Kim, Technician, for Acme". */
export interface EstimateCountersign {
  userId: ID;
  signerName: string;
  signerTitle?: string;
  /** CA home improvement salesperson registration, printed on the contract */
  his?: string;
  signature: string;
  at: string;
  method: "drawn" | "saved";
}
/** An employee's own saved signature: a new one replaces the old, the old stays in history. */
export interface MemberSignature {
  id: ID;
  userId: ID;
  svg: string;
  name: string;
  title?: string;
  createdAt: string;
  revokedAt?: string;
}
export interface Estimate {
  id: ID;
  /** direction of the business (docs/specs/11-trade.md): from the lead, else the client's latest, else the only one */
  serviceCategoryId?: ID;
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
  /* ---- wave E2a (docs/specs/07 §3.1) ---- */
  /** the company's signature: with the client's it makes the contract (approved) */
  countersign?: EstimateCountersign;
  /** YYYY-MM-DD: an unsigned estimate's link works until this day (founder 05.11: 7 days by default) */
  validUntil?: string;
  /** the client link was revoked (director / office); the next send makes a new one */
  linkRevokedAt?: string;
  /** E2b: why the company declined after the client signed (shown in the app, never to the client) */
  declinedText?: string;
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

/** visit.late — computed in the app for the office (docs/specs/03 П3c), never stored and not in the server notifications.kind */
export type NoticeKind = "estimate.viewed" | "estimate.approved" | "estimate.client_signed" | "deposit.paid" | "invoice.paid" | "visit.late";
export interface Notice {
  id: ID;
  kind: NoticeKind;
  estimateId?: ID;
  jobId?: ID;
  /** wave П-1: invoice.paid / deposit.paid lead to the invoice (server: notifications.invoice_id) */
  invoiceId?: ID;
  customer: string;
  /** visit.late: the visit, the tech, why late, and the time shown (left at, or the start) */
  visitId?: ID;
  tech?: string;
  late?: "en_route" | "not_left";
  lateAt?: string;
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
  /** before docs/specs/11-trade.md: directions as text (read once by normalize; now `DB.serviceCategories`) */
  trades?: string[];
  brand: { logo?: string; color?: string };
  insurance: { cglCarrier?: string; cglPolicy?: string; wcCarrier?: string; wcPolicy?: string; wcExempt?: boolean };
  /** where the client sends a cancellation (CA 3-day right) */
  cancelEmail?: string;
  /** lead thresholds set by the company (features/leadSettings.ts fills the gaps with defaults) */
  leadSettings?: Partial<import("@/features/leadSettings").LeadSettings>;
  /** schedule settings (docs/specs/03 §6.1, П4a; features/scheduleSettings.ts fills the gaps with defaults) */
  scheduleSettings?: Partial<import("@/features/scheduleSettings").ScheduleSettings>;
  /** working hours by weekday (companies.business_hours; missing = Mon–Sat 8:00–18:00) */
  businessHours?: Partial<import("@/features/scheduleSettings").BusinessHours>;
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
  /** before tax (server: invoices.subtotal_cents) — «revenue» in reports (PRD 14 §7, wave 8) */
  subtotalCents?: number;
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
  /** who took it (server: payments.received_by = users.id) — «collected by person» (wave 8) */
  receivedBy?: ID;
  /** already taken off amountCents (amountCents is net); > 0 = partially refunded (wave 8) */
  refundedCents?: number;
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

/** A direction of the business: a preset (seedKey, translated) or the company's own name. Never deleted, only archived. */
export interface ServiceCategory {
  id: ID;
  seedKey?: string;
  name?: string;
  position: number;
  archivedAt?: string;
}

export interface DB {
  me: ID;
  members: Member[];
  sources: Source[];
  tags: Tag[];
  /** wave 7-2 (S21): people switched off — not in `members` (no pickers, no assignment), shown on «Команда» only */
  disabledMembers?: Member[];
  /** cancelled visits (docs/specs/03 §5.2): out of the Plan and the day, kept in the lead's feed with the reason */
  cancelledVisits?: CancelledVisit[];
  /** wave П-1: cancelled jobs (server: jobs.status = cancelled) are not in `jobs`; kept here so invoices and the
   *  history can still name them */
  cancelledJobs?: Job[];
  /** wave П-1: the company's job types (absent in old saved data → []) */
  jobTypes?: JobType[];
  /** wave П-1: file records (absent in old saved data → []) */
  files?: FileItem[];
  /** wave П-2a: lines of jobs without an estimate (absent in old saved data → []) */
  jobLines?: JobLineItem[];
  /** wave П-2b: events and days off; own fields and their values (absent in old saved data → []) */
  calendarEvents?: CalendarEvent[];
  customFields?: CustomField[];
  customFieldValues?: CustomFieldValue[];
  /** directions of the business of the company (docs/specs/11-trade.md); archived ones stay for history */
  serviceCategories: ServiceCategory[];
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
  /** employees' saved signatures (wave E2a); absent in old saved data */
  memberSignatures?: MemberSignature[];
}
