import type { Role } from "@/data/types";

/**
 * #2075 (roles decision В9, audit of roles #2064): the money of a contract is the office's — the director and the
 * dispatcher. Sales and the tech see the statement and the lines of a job, but issue no invoice («Выставить остаток»,
 * «Счёт на этап») and change no line or tax of a job (its contract total). The server refuses the same
 * (invoices_insert/update, job_line_items_insert/update, t13_job_tax_rights — migration 20261117360000, db T414–T416).
 */
export const canBill = (role: Role) => role === "director" || role === "dispatcher";
/** the lines and the tax of a job make its contract total — the same people as billing */
export const canEditJobMoney = canBill;
