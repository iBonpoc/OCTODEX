/**
 * Registry of the forms with required fields (DS §11 п.3–4, спека редактора сметы Р10): form → field → testID → error key.
 * One rule everywhere: the main button is always enabled; pressing it with a wrong required field shows the error under
 * EVERY wrong field and scrolls to the first (`useRequiredForm`, ui/requiredForm.tsx).
 *
 * `done` — the form is converted: the guard (test/requiredFields.test.ts) reads its source — every field is bound
 * (`form.field("<id>")`), its error text is the dictionary key `errorKey`, and the form's e2e spec looks for
 * `field-<id>-error`. `exempt` — not a form of required fields (with the reason). `todo` — still the old way (a disabled button); the guard searches ALL of src/app for the old
 * pattern, so a form that is not listed here fails the test, and a listed `todo` that has been converted fails it too
 * (move it to `done`).
 */
export type RequiredFormStatus = "done" | "todo" | "exempt";
export interface RequiredField {
  id: string;
  /** the dictionary key of the text under the field */
  errorKey: string;
}
export interface RequiredForm {
  /** the screen file under src/app, with the route it serves */
  file: string;
  route: string;
  status: RequiredFormStatus;
  /** `exempt` only: why this screen is not a form of required fields */
  why?: string;
  /** `done` only: the required fields */
  fields: RequiredField[];
  /** `done` only: the e2e spec (in e2e/specs) that presses the main button on an empty form */
  e2e?: string;
}

export const fieldTestID = (id: string) => `field-${id}`;

export const REQUIRED_FORMS: RequiredForm[] = [
  {
    file: "lead/new.tsx",
    route: "/lead/new",
    status: "done",
    fields: [
      { id: "phone", errorKey: "form.req.phone" },
      { id: "name", errorKey: "form.req.name" },
      { id: "source", errorKey: "form.req.source" },
    ],
    e2e: "278-required-fields.cjs",
  },
  { file: "expense/new.tsx", route: "/expense/new", status: "done", fields: [{ id: "amount", errorKey: "form.req.amount" }], e2e: "278-required-fields.cjs" },
  {
    file: "suppliers/[id].tsx",
    route: "/suppliers/[id]",
    status: "done",
    fields: [
      { id: "name", errorKey: "form.req.supName" },
      { id: "email", errorKey: "sup.emailBad" },
    ],
    e2e: "278-required-fields.cjs",
  },
  { file: "client/edit.tsx", route: "/client/edit", status: "todo", fields: [] },
  { file: "job/new.tsx", route: "/job/new", status: "todo", fields: [] },
  { file: "job/schedule.tsx", route: "/job/schedule", status: "todo", fields: [] },
  { file: "client/import.tsx", route: "/client/import", status: "todo", fields: [] },
  { file: "company/checklist/[id].tsx", route: "/company/checklist/[id]", status: "todo", fields: [] },
  { file: "settings/delete-account.tsx", route: "/settings/delete-account", status: "todo", fields: [] },
  { file: "catalog/[id].tsx", route: "/catalog/[id]", status: "todo", fields: [] },
  { file: "company/[section].tsx", route: "/company/[section]", status: "todo", fields: [] },
  { file: "team.tsx", route: "/team", status: "todo", fields: [] },
  { file: "purchase-order/[id].tsx", route: "/purchase-order/[id]", status: "todo", fields: [] },
  { file: "f/[token].tsx", route: "/f/[token]", status: "todo", fields: [] },
  { file: "estimate/templates.tsx", route: "/estimate/templates", status: "todo", fields: [] },
  { file: "auth/sign-in.tsx", route: "/auth/sign-in", status: "todo", fields: [] },
  { file: "job/[id].tsx", route: "/job/[id]", status: "exempt", fields: [], why: "the note composer: «Добавить» is off while the note is empty — one optional input, not a form" },
  // the estimate editor is the exception of DS §12.8: its own rules (РС-4)
  { file: "estimate/new.tsx", route: "/estimate/new", status: "exempt", fields: [], why: "the editor: an open row checks itself in place (useRequiredForm for its fields, DS §8.3); the page's main buttons follow in РС-7 (ActionBar)" },
];
