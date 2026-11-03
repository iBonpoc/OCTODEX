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
}

export type LeadSource = "Thumbtack" | "Yelp" | "Google" | "Website" | "Referral";

export interface Customer {
  id: ID;
  name: string;
  phone: string;
  email?: string;
  source: LeadSource;
  /** positive = customer owes us */
  balanceCents: number;
}

export interface Property {
  id: ID;
  customerId: ID;
  address: string;
  city: string;
  stories: number;
}

export type JobStatus = "lead" | "estimate" | "scheduled" | "in_progress" | "done";
export interface Job {
  id: ID;
  propertyId: ID;
  title: string;
  status: JobStatus;
  amountCents: number;
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

export type LeadStatus = "new" | "replied" | "booked" | "lost";
export interface Lead {
  id: ID;
  name: string;
  phone: string;
  city: string;
  address?: string;
  source: LeadSource;
  receivedAt: string;
  message: string;
  status: LeadStatus;
}

export type EstimateStatus = "draft" | "sent" | "approved" | "declined";
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
  /** deposit invoice for an approved estimate */
  kind?: "deposit" | "final";
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
  customers: Customer[];
  properties: Property[];
  jobs: Job[];
  visits: Visit[];
  leads: Lead[];
  estimates: Estimate[];
  invoices: Invoice[];
  expenses: Expense[];
}
