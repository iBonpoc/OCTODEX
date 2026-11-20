/**
 * The language of a Gutters document (founder 18.11, #2158: «Рабочий чертёж почему-то на русском… сохранилось всё на
 * русском»; rule 7: the app's language is never the document's):
 * - the client's (the drawing for the client) — the client's language (`clientLangOf`: person → client → lead → company);
 * - the crew's (the cut, the shop drawings) — the crew member's when the app knows it (it does not yet: no language of a
 *   team member), else the company's document language (en in the US);
 * - the supplier's (the order) — en: a US supplier.
 */
import type { DB } from "@/data/types";
import type { DocLang } from "@/i18n/translate";
import { clientLangOf } from "./estimateLink";
import type { MeasurementRow } from "./canvas/model";

export type GutterDocFor = "client" | "crew" | "supplier";

export function gutterDocLang(db: DB, m: Pick<MeasurementRow, "leadId" | "propertyId">, forWhom: GutterDocFor): DocLang {
  if (forWhom === "client") return clientLangOf(db, m);
  if (forWhom === "supplier") return "en";
  return db.company?.docLanguage ?? "en";
}
