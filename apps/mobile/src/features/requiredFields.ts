/**
 * Registry of the forms with required fields (DS §11 п.3–4, spec Р10). One rule everywhere: the main button is always
 * enabled; pressing it with a wrong required field shows the error under EVERY such field and scrolls to the first
 * (`useRequiredForm` in ui/requiredForm.tsx). `todo` = still the old way (disabled button); the guard
 * test/requiredFields.test.ts reads this list, so a new form cannot slip in unregistered.
 */
export type RequiredFormStatus = "done" | "todo";
export interface RequiredForm {
  /** the screen file under src/app, with the route it serves */
  file: string;
  route: string;
  status: RequiredFormStatus;
  /** the required fields, by the id they carry in `form.field(id)` */
  fields: string[];
}

export const REQUIRED_FORMS: RequiredForm[] = [
  { file: "lead/new.tsx", route: "/lead/new", status: "done", fields: ["phone", "name", "source"] },
  { file: "expense/new.tsx", route: "/expense/new", status: "done", fields: ["amount"] },
  { file: "suppliers/[id].tsx", route: "/suppliers/[id]", status: "done", fields: ["name", "email"] },
  { file: "client/edit.tsx", route: "/client/edit", status: "todo", fields: [] },
  { file: "job/new.tsx", route: "/job/new", status: "todo", fields: [] },
  { file: "job/schedule.tsx", route: "/job/schedule", status: "todo", fields: [] },
  { file: "client/import.tsx", route: "/client/import", status: "todo", fields: [] },
  { file: "company/checklist/[id].tsx", route: "/company/checklist/[id]", status: "todo", fields: [] },
  { file: "settings/delete-account.tsx", route: "/settings/delete-account", status: "todo", fields: [] },
  { file: "catalog/[id].tsx", route: "/catalog/[id]", status: "todo", fields: [] },
  { file: "company/[section].tsx", route: "/company/[section]", status: "todo", fields: [] },
  // the estimate editor is the exception of DS §12.8: its own rules (РС-4)
  { file: "estimate/new.tsx", route: "/estimate/new", status: "todo", fields: [] },
];
