import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { canSeeClientLink } from "@/features/estimateSign";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { haptics } from "@/ui/haptics";
import { component, motion, space, size } from "@octo/design-tokens";
import { LINE_GROUPS, activeLines, countedSections, discountBps, ppmToPctText, sectionSubtotals, taxRatePpm, type TaxSettings, type EstimateSection, type CustomLine, type CustomOption, type DepositSetting, type LineGroup } from "@octo/estimating-engine";
import { useStore } from "@/data/store";
import { canMakeEstimateAt, canSeeEstimate } from "@/features/access";
import type { CatalogItem, EstimateDoc, EstimateTemplate } from "@/data/types";
import { canEditEstimateTemplates, clearedCosts, editedTemplate, fromTemplate, pickableTemplates, templateForEdit, templateFromCents } from "@/features/estimateTemplate";
import { useI18n, type DictKey } from "@/i18n";
import { MAX_OPTIONS, linesFromCatalog, newLine, cloneOption, costComplete, estimateTitle, exemptDoc, hasContent, lineMarks, newDoc, optionTotals, shownQty, uid } from "@/features/estimateDoc";
import { LineMarks } from "@/features/LineMarks";
import { ClientPicker, itemPrice, kindLabel } from "@/features/estimatePickers";
import { LineRow, rowFieldId, type RowAction, type RowApi } from "@/features/estimate/LineRow";
import { useRowView } from "@/features/estimate/rowView";
import { SortableList, type DropResult } from "@/features/SortableList";
import type { Drop } from "@/features/sortable";
import { swipes } from "@/features/estimate/swipeState";
import { SectionHeader, type SectionAction, type SectionApi } from "@/features/estimate/SectionHeader";
import { canAddSection, addSection, deleteSection, layoutByKind, moveLine, moveSection, putBack, layoutUndo, renameSection, sameLayout, shiftLine, viewRows, type Opt } from "@/features/sectionLayout";
import { applyPatch, catalogOffer, clearLine, settleOpenRow, dropLine, duplicateLine, isBlank, leaveDecision, replaceLine, restoreDeleted, restoreLine, rowProblems, setHidden } from "@/features/estimateRows";
import { FieldError, useRequiredForm, useScreenScroll } from "@/ui/requiredForm";
import { ActionBar } from "@/ui/actionBar";
import { useReducedMotion } from "react-native-reanimated";
import { useDevice, useTheme } from "@/theme/ThemeProvider";
import { PickerSheet } from "@/ui/pickerSheet";
import { Labeled, MoneyField, PctField, RatePctField } from "@/features/fields";
import { isPartialTax, lastTaxRatePpm, taxChange, wholeTax, type TaxDiff } from "@/features/estimateTax";
import { Avatar, Button, Segmented, StatusChip, TextField, Toggle } from "@/ui/controls";
import { Icon, Press, T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Card, Divider, Empty, Grid, ListRow, RowView, Screen, SectionTitle } from "@/ui/surfaces";
import { draftCtx, draftSnapshot, draftsKey, findDraft, nextDrafts, removeDraft, useEstimateDrafts, type EstimateDraft } from "@/features/estimateDraft";
import { useAuth } from "@/cloud/auth";
import { localUndo, withAfter } from "@/data/undo";

type SettingKind = "discount" | "tax" | "deposit" | null;
const initials = (n: string) => n.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

/**
 * Estimate builder for any trade, laid out like Jobber / Housecall Pro quotes:
 * client → title → one list of line items (catalog or custom) → totals with discount, tax, deposit → message → send.
 * Type of a line (service / labor / material) only drives which lines are taxed.
 */
export default function EstimateBuilderScreen() {
  const { mode, db, role } = useStore();
  const auth = useAuth();
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id?: string }>();
  // the person's drafts (#760): read before the builder starts, so a draft is its first state, not a later jump. The
  // company from the sign-in, like the store's cache key — never from the cache, which may not have it yet (#859 №3)
  const key = draftsKey(mode === "cloud", auth.company?.companyId, auth.userId);
  const drafts = useEstimateDrafts(key ?? `${"octo.drafts.v1."}unknown`);
  // not the tech's estimate (#868, director's review of #1134 Б2): no access, as on the estimate itself — not its lines
  if (id && db.estimates.some((e) => e.id === id) && !canSeeEstimate(db, { role, mode, me: db.me }, id))
    return (
      <Screen title={t("ue.newTitle")}>
        <Empty icon="invoice" title={t("mny.noAccess")} testID="no-access" />
      </Screen>
    );
  if (!key || !drafts.ready) return <Screen title={t("ue.newTitle")}>{null}</Screen>;
  return <EstimateBuilder key={key} drafts={drafts} />;
}

type Params = { id?: string; customerId?: string; propertyId?: string; leadId?: string; template?: string; editTemplate?: string };

function EstimateBuilder({ drafts }: { drafts: ReturnType<typeof useEstimateDrafts> }) {
  const params = useLocalSearchParams<Params>();
  const store = useStore();
  const { db } = store;
  const { t, money } = useI18n();
  const toast = useToast();
  const existing = params.id ? db.estimates.find((e) => e.id === params.id) : undefined;
  // a new estimate opened from the same place as an unfinished one: it goes on (#760, audit Q-01)
  const ctx = draftCtx(params);
  const [draft, setDraft] = useState(() => findDraft(drafts.list, ctx, Date.now(), (id) => db.estimates.some((e) => e.id === id)));
  const [estimateId] = useState(() => existing?.id ?? draft?.estimateId ?? uid());
  const [customerId, setCustomerId] = useState(existing?.customerId ?? draft?.customerId ?? params.customerId);
  const [propertyId, setPropertyId] = useState(existing?.propertyId ?? draft?.propertyId ?? params.propertyId);
  // E3 (S5t): a template to start from — given by the templates screen, or picked in «С чего начать?»
  const seeCosts = db.costsVisible ?? store.role !== "tech";
  const templates = pickableTemplates(db.estimateTemplates ?? []);
  const given = !existing && params.template ? templates.find((x) => x.id === params.template) : undefined;
  // §12 №10: the builder edits a template's lines (no client; «Сохранить шаблон») — the director and the office only
  // fixed when the screen opens: a template archived meanwhile (a sync) must not turn this into a new estimate (security check №2)
  const [tplEdit] = useState(() => (!existing && !given && params.editTemplate && canEditEstimateTemplates(store.role) ? templates.find((x) => x.id === params.editTemplate) : undefined));
  const [fromTpl] = useState(() => (given ? fromTemplate(given.doc, db.catalog, given.costs ?? {}, seeCosts, !!given.module) : null));
  const [templateId, setTemplateId] = useState<string | undefined>(draft ? draft.templateId : given?.id);
  const [checkPrice, setCheckPrice] = useState<string[]>(draft?.checkPrice ?? fromTpl?.checkPrice ?? []);
  // lines that were hidden and came priced (a template line took the catalog price): shown to the client again — the mark stays until the row is opened
  const [unhiddenIds, setUnhiddenIds] = useState<string[]>(() => fromTpl?.unhidden ?? []);
  // «Сохранить в каталог» chosen on rows (by line id); done when the row folds with a right line
  const [wantCatalog, setWantCatalog] = useState<string[]>(() => draft?.wantCatalog ?? []);
  const [startOpen, setStartOpen] = useState(() => !existing && !draft && !given && !tplEdit && templates.length > 0);
  const [doc, setDoc] = useState<EstimateDoc>(() =>
    existing?.doc ? (JSON.parse(JSON.stringify(existing.doc)) as EstimateDoc) : tplEdit ? templateForEdit(tplEdit, seeCosts) : draft?.doc ?? fromTpl?.doc ?? newDoc(db.company?.estimate.depositBps),
  );
  const [title, setTitle] = useState(existing?.doc ? existing.title : draft?.title ?? tplEdit?.name ?? given?.name ?? "");
  const [cur, setCur] = useState(() => Math.max(0, doc.options.findIndex((o) => o.recommended)));
  // the open row of the list (DS §8.3: one open; it closes and keeps what is typed when another opens, «Новая позиция»,
  // «Из каталога», a finger starts to scroll or the estimate is saved); the focus it takes when it opens
  const [openId, setOpenId] = useState<string | null>(null);
  // «Кратко / Подробно» of the folded rows — the device remembers it (DS §8.3)
  const [rowLook, setRowLook] = useRowView();
  // a finger went down on the open row: a scroll that starts there leaves it open (DS §8.3, spec §11 п.5)
  const touchInOpen = useRef(0);
  const [focusRow, setFocusRow] = useState<{ id: string; field: "name" | "qty" } | null>(null);
  const [picker, setPicker] = useState<"add" | { replace: string } | { addTo: string } | null>(null);
  // sections (DS §8.5): the folded ones are the phone's own state; the one being renamed in place; the row to move (its sheet)
  const [collapsedIds, setCollapsedIds] = useState<string[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [holdSection, setHoldSection] = useState<string | null>(null);
  const [moveFor, setMoveFor] = useState<string | null>(null);
  const rowForm = useRequiredForm();
  // what a pick in the catalog sheet opens next (a row with the cursor in it) waits until the sheet is gone: the web would give the
  // focus back to the button that opened it
  const afterPicker = useRef<(() => void) | null>(null);
  // number fields of the open row that hold text which is not a number (the line keeps the last right value): "<line>:<field>"
  const badFields = useRef(new Set<string>());
  const [setting, setSetting] = useState<SettingKind>(null);
  const [clientPicker, setClientPicker] = useState(!customerId && !startOpen && !tplEdit && !draft);
  // every CHANGE of a new estimate is kept on the phone; opening it (a template's lines and name) is not a change
  // (#859 №1); nothing worth keeping — no draft (#760)
  const keyOfDrafts = drafts.key;
  const setDrafts = drafts.setList;
  const held = { estimateId, customerId, propertyId, title, doc, templateId, checkPrice, wantCatalog };
  const [opened, setOpened] = useState(() => ({ snapshot: draftSnapshot(held), restored: !!draft }));
  useEffect(() => {
    if (!ctx) return;
    const d: EstimateDraft = { ctx, at: new Date().toISOString(), estimateId, customerId, propertyId, title, doc, templateId, checkPrice, wantCatalog };
    setDrafts((list) => nextDrafts(list, d, opened, Date.now()), keyOfDrafts);
  }, [ctx, estimateId, customerId, propertyId, title, doc, templateId, checkPrice, wantCatalog, opened, setDrafts, keyOfDrafts]);
  const dropDraft = () => {
    if (ctx) setDrafts((list) => removeDraft(list, ctx), keyOfDrafts);
  };
  /** «Начать заново» (after «Удалить черновик?» — rule 5: a confirmation, no undo across screens, #859): the builder as
   *  if just opened from here, the draft goes */
  const [askRestart, setAskRestart] = useState(false);
  const restart = () => {
    setAskRestart(false);
    const fromHere = fromTpl ? (JSON.parse(JSON.stringify(fromTpl.doc)) as EstimateDoc) : newDoc(db.company?.estimate.depositBps);
    const fresh = { estimateId, customerId: params.customerId, propertyId: params.propertyId, title: given?.name ?? "", doc: fromHere, templateId: given?.id, checkPrice: fromTpl?.checkPrice ?? [] };
    setDraft(undefined);
    setOpened({ snapshot: draftSnapshot(fresh), restored: false });
    setDoc(fresh.doc);
    setCur(Math.max(0, fresh.doc.options.findIndex((o) => o.recommended)));
    setTitle(fresh.title);
    setCustomerId(fresh.customerId);
    setPropertyId(fresh.propertyId);
    setTemplateId(fresh.templateId);
    setCheckPrice(fresh.checkPrice);
    setWantCatalog([]);
    // no next sheet here: one over the leaving «Удалить черновик?» never shows on iPhone (#743) — the client and a
    // template are picked from the builder itself
  };
  const start = (x: EstimateTemplate | null) => {
    setStartOpen(false);
    if (x) {
      const r = fromTemplate(x.doc, db.catalog, x.costs ?? {}, seeCosts, !!x.module);
      setDoc(r.doc);
      setCur(Math.max(0, r.doc.options.findIndex((o) => o.recommended)));
      setTemplateId(x.id);
      setCheckPrice(r.checkPrice);
      setUnhiddenIds(r.unhidden);
      if (!title.trim()) setTitle(x.name);
      toast.show(r.checkPrice.length ? t("est.tpl.checkPrice", { n: r.checkPrice.length }) : t("est.tpl.applied", { name: x.name }));
    }
    if (!customerId) setClientPicker(true);
  };

  const customer = db.customers.find((c) => c.id === customerId);
  const property = db.properties.find((p) => p.id === propertyId) ?? db.properties.find((p) => p.customerId === customerId);
  const option = doc.options[Math.min(cur, doc.options.length - 1)]!;
  // a tax-exempt client: no sales tax on the estimate (the server refuses it, П-2a)
  const exempt = !!customer?.taxExempt;
  const counted = useMemo(() => exemptDoc(doc, exempt), [doc, exempt]);
  const totals = useMemo(() => optionTotals(counted, option), [counted, option]);
  const s = counted.settings;
  const partialTax = isPartialTax(doc.settings.tax);
  const lastRate = lastTaxRatePpm(db.estimates, existing?.id);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));

  const setOption = (fn: (o: CustomOption) => CustomOption) =>
    setDoc((d) => ({ ...d, options: d.options.map((o) => (o.id === option.id ? fn(o) : o)) }));
  // the tax of an old estimate set «by kind»: turning it on / converting it to the whole amount changes the client's sum — ask first
  const [taxAsk, setTaxAsk] = useState<{ tax: TaxSettings; diffs: TaxDiff[] } | null>(null);
  const changeTax = (patch: { enabled?: boolean; ratePpm?: number }) => {
    if (signed) return;
    const ch = taxChange(doc, patch);
    if (ch.ask) return setTaxAsk({ tax: ch.tax, diffs: ch.ask });
    setSettings({ tax: ch.tax });
  };
  const setSettings = (patch: Partial<EstimateDoc["settings"]>) => setDoc((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  const patchLine = (id: string, patch: Partial<CustomLine>) => {
    // a price typed into a hidden line shows it again, and the person is told (the founder's #1100); no «Отменить»: erase the price and hide again
    const was = option.lines.find((l) => l.id === id);
    if (was && applyPatch(was, patch).unhidden) toast.show(t("est.row.unhiddenToast"));
    setOption((o) => ({ ...o, lines: o.lines.map((l) => (l.id === id ? applyPatch(l, patch).line : l)) }));
    if (unhiddenIds.includes(id)) setUnhiddenIds((ids) => ids.filter((x) => x !== id));
  };
  // «Отменить» of an action takes back THAT action only (a row edited since stays as edited)
  const deleted = useRef<{ toast: number; items: { line: CustomLine; index: number }[] } | null>(null);
  const removeLine = (id: string) => {
    const index = option.lines.findIndex((l) => l.id === id);
    const line = option.lines[index];
    if (!line) return;
    setOption((o) => ({ ...o, lines: dropLine(o.lines, id) }));
    setOpenId((cur) => (cur === id ? null : cur));
    // a series of deletions is ONE toast «Удалено позиций: N · Вернуть» (DS §15.2): while it is on screen, a new one adds to it
    const prev = deleted.current;
    const series = prev && toast.showing(prev.toast) ? [...prev.items, { line, index }] : [{ line, index }];
    const text = series.length === 1 ? t("est.row.deleted") : t("est2.row.deletedN", { n: series.length });
    const undo = localUndo(() => {
      deleted.current = null;
      setOption((o) => ({ ...o, lines: restoreDeleted(o.lines, series) }));
    });
    deleted.current = { toast: toast.show(text, undo, { grow: prev?.toast }), items: series };
  };
  // what is wrong in the open row now: the line's own data and the number fields that hold text which is not a number
  const problemsOf = (l: CustomLine) => {
    const out = rowProblems(l).map((p) => ({ id: rowFieldId(l.id, p.id), text: t(p.key) }));
    const more: [("qty" | "price" | "cost"), DictKey][] = [["qty", "est.row.needQty"], ["price", "est.row.needPrice"], ["cost", "est.row.needCost"]];
    for (const [f, key] of more) {
      const id = rowFieldId(l.id, f);
      if (badFields.current.has(`${l.id}:${f}`) && !out.some((x) => x.id === id)) out.push({ id, text: t(key) });
    }
    return out;
  };
  // the open row closes (and keeps what is typed) — unless something in it is wrong: then the errors, the scroll to the first,
  // the vibration, and it stays open (DS §8.3). `quiet` (a finger starts to scroll): nothing of that — the page must be able
  // to scroll; a row with an error just stays open. A row with nothing typed in it disappears without a trace.
  // The open row is asked to close: ONE pure step (`settleOpenRow`) gives the option as the closed row leaves it — a blank row
  // gone, «Сохранить в каталог» done (the thing made, the link on the line). The screen and «Сохранить» both go through it,
  // so what is saved is what is shown, and the link is in the saved estimate.
  const settleNow = (quiet: boolean) => {
    const open = option.lines.find((x) => x.id === openId);
    const problems = open ? problemsOf(open) : [];
    const r = settleOpenRow(option, { openId, wantCatalog, costsVisible: seeCosts, catalog: db.catalog, problems: problems.length, quiet, newId: uid });
    // a wrong row speaks (the errors, the scroll, the vibration) — but not when a finger only starts to scroll
    if (r.decision === "stay-loud") rowForm.submit(problems, () => {});
    return r;
  };
  const docWith = (o: CustomOption): EstimateDoc => ({ ...doc, options: doc.options.map((x) => (x.id === o.id ? o : x)) });
  // «Отменить» takes out exactly the things this action made (not the whole store: that would undo the server's read and
  // other edits) — each save's own undo, all of them with the estimate or none (#1244, DS §15.2)
  const writeCatalog = (items: CatalogItem[]) => items.map((i) => store.saveCatalogItem(i));
  const leaveRow = (quiet = false): boolean => {
    const r = settleNow(quiet);
    if (!r.closed) return false;
    if (r.option !== option) setOption(() => r.option);
    setWantCatalog(r.wantCatalog);
    setOpenId(null);
    if (r.newItems.length) {
      const back = store.undoTogether(writeCatalog(r.newItems));
      const ids = new Set(r.newItems.map((i) => i.id));
      // too late for one of them: the lines keep their items
      toast.show(
        t("est.row.catalogAdded"),
        withAfter(back, () => setOption((o) => ({ ...o, lines: o.lines.map((x) => (x.catalogItemId && ids.has(x.catalogItemId) ? { ...x, catalogItemId: undefined } : x)) }))),
      );
    }
    return true;
  };
  const openRow = (id: string) => {
    if (signed) return;
    if (id === openId) return void leaveRow();
    if (!leaveRow()) return;
    setFocusRow(null);
    setOpenId(id);
  };
  const addNew = (sectionId?: string) => {
    if (!leaveRow()) return;
    const l = newLine("service", { unit: "ea", ...(sectionId ? { sectionId } : {}) });
    if (sectionId) setCollapsedIds((c) => c.filter((x) => x !== sectionId));
    setOption((o) => ({ ...o, lines: [...o.lines, l] }));
    setFocusRow({ id: l.id, field: "name" });
    setOpenId(l.id);
  };
  const openCatalog = () => {
    if (leaveRow()) setPicker("add");
  };
  const fromCatalog = (itemId: string) => {
    const it = db.catalog.find((x) => x.id === itemId);
    if (!it || picker === null) return;
    const target = typeof picker === "object" && "replace" in picker ? picker.replace : null;
    const addTo = typeof picker === "object" && "addTo" in picker ? picker.addTo : undefined;
    const made = linesFromCatalog(it, db.catalog).map((l) => (addTo ? { ...l, sectionId: addTo } : l));
    setPicker(null);
    if (target) {
      const old = option.lines.find((x) => x.id === target);
      if (!old || !made[0]) return;
      setOption((o) => ({ ...o, lines: o.lines.map((x) => (x.id === target ? replaceLine(x, made[0]!) : x)) }));
      // the price was to be checked — it is a new thing now; it is in the catalog already, nothing to save there; a hidden row that takes a price is shown again
      setCheckPrice((ids) => ids.filter((x) => x !== target));
      setWantCatalog((ids) => ids.filter((x) => x !== target));
      if (old.clientVisible === false && replaceLine(old, made[0]!).clientVisible === undefined) toast.show(t("est.row.unhiddenToast"));
      toast.show(t("est.row.replaced"), localUndo(() => setOption((o) => ({ ...o, lines: restoreLine(o.lines, old) }))));
      return;
    }
    setOption((o) => ({ ...o, lines: [...o.lines, ...made] }));
    // one thing — open, the focus in the quantity; a kit comes folded
    if (made.length === 1) {
      const id = made[0]!.id;
      afterPicker.current = () => {
        setFocusRow({ id, field: "qty" });
        setOpenId(id);
      };
    }
  };
  const clearRow = (id: string) => {
    const old = option.lines.find((x) => x.id === id);
    if (!old) return;
    setOption((o) => ({ ...o, lines: o.lines.map((x) => (x.id === id ? clearLine(x) : x)) }));
    setCheckPrice((ids) => ids.filter((x) => x !== id));
    setWantCatalog((ids) => ids.filter((x) => x !== id));
    setPicker(null);
    afterPicker.current = () => {
      setFocusRow({ id, field: "name" });
      setOpenId(id);
    };
    toast.show(t("est.row.replaced"), localUndo(() => setOption((o) => ({ ...o, lines: restoreLine(o.lines, old) }))));
  };
  const rowAction = (id: string, a: RowAction) => {
    if (a === "delete") return removeLine(id);
    if (a === "replace") return setPicker({ replace: id });
    if (a === "move") return setMoveFor(id);
    if (a === "hide" || a === "show") {
      if (signed || tplEdit) return;
      const r = setHidden(option.lines, id, a);
      if (r === "needZero") return void toast.show(t("est.row.hideNeedZero"));
      setOption((o) => {
        const next = setHidden(o.lines, id, a);
        return next === "needZero" ? o : { ...o, lines: next };
      });
      return;
    }
    const d = duplicateLine(option.lines, id);
    if (!d) return;
    setOption((o) => ({ ...o, lines: duplicateLine(o.lines, id, () => d.copyId)?.lines ?? o.lines }));
    toast.show(t("est.row.duplicated"), localUndo(() => setOption((o) => ({ ...o, lines: dropLine(o.lines, d.copyId) }))));
  };
  /* ---- sections (DS §8.5): every change undoes itself only (the layout it changed), never the whole document ---- */
  const secTitle = (x: EstimateSection) => x.title ?? (x.kind && x.kind !== "module" ? t(`est.sec.${x.kind}` as DictKey) : t("est.sec.untitled"));
  // «Вернуть» takes back this change only (what the person did to the layout meanwhile stays — #1227, #1231, #1241)
  const showUndo = (text: DictKey, before: Opt, after: Opt) => {
    const restore = layoutUndo(before, after);
    toast.show(t(text), localUndo(() => setOption((o) => restore(o))));
  };
  const addSectionBtn = (parentId?: string) => {
    if (signed || !leaveRow()) return;
    const r = addSection(option, { parentId });
    if (!r) return void toast.show(t("est.sec.limit"));
    setOption(() => r.option);
    setCollapsedIds((c) => c.filter((x) => x !== parentId));
    setRenamingId(r.id);
  };
  const layoutBtn = () => {
    if (signed || !leaveRow()) return;
    const next = layoutByKind(option);
    if (!next) return void toast.show(t(canAddSection(option) ? "est.sec.nothingToLay" : "est.sec.limit"));
    setOption(() => next);
    showUndo("est.sec.laidOut", option, next);
  };
  const sectionAction = (id: string, a: SectionAction) => {
    if (signed) return;
    if (a === "rename") return setRenamingId(id);
    if (a === "addSub") return addSectionBtn(id);
    if (a === "addHere") return addNew(id);
    if (a === "catalogHere") return leaveRow() ? setPicker({ addTo: id }) : undefined;
    const next = deleteSection(option, id);
    setOption(() => next);
    showUndo("est.sec.deleted", option, next);
  };
  const doMove = (lineId: string, key: string) => {
    if (signed) return setMoveFor(null);
    const index = option.lines.findIndex((l) => l.id === lineId);
    const line = option.lines[index];
    if (!line) return;
    // the open document only (not saved yet): the screen's own state
    const back = localUndo(() => setOption((o) => putBack(o, lineId, { sectionId: line.sectionId, index })));
    setMoveFor(null);
    if (key === "__up__" || key === "__down__") {
      const dir = key === "__up__" ? -1 : 1;
      const next = shiftLine(option, lineId, dir);
      if (next === option) return;
      setOption(() => next);
      return void toast.show(t("est.sec.moved"), localUndo(() => setOption((o) => shiftLine(o, lineId, (dir * -1) as -1 | 1))));
    }
    const r = moveLine(option, lineId, { sectionId: key === "__none__" ? undefined : key });
    // only a real refusal speaks; «moved» is said only after a move
    if (!r.ok) return r.reason === "module" || r.reason === "moduleLine" ? void toast.show(t("est.sec.moduleBlocked")) : undefined;
    setOption(() => r.option);
    toast.show(t("est.sec.moved"), back);
  };
  /** a row was let go in the list (DS §14.6): the line or the section lands where the bar stood; «Вернуть» takes back this move only */
  const dropRow = (d: Drop): DropResult => {
    if (signed) return "same";
    const refuse = (why: string): DropResult => {
      toast.show(t("est.sec.moduleBlocked"));
      void why;
      return "refused";
    };
    if (d.kind === "line") {
      const index = option.lines.findIndex((l) => l.id === d.id);
      const line = option.lines[index];
      if (!line) return "same";
      const r = moveLine(option, d.id, d.to);
      if (!r.ok) return r.reason === "module" || r.reason === "moduleLine" ? refuse(r.reason) : "same";
      // it came to the same order (the drop at the end of its own section, a slot just above itself…): not a move
      if (sameLayout(option, r.option)) return "same";
      setOption(() => r.option);
      toast.show(t("est.sec.moved"), localUndo(() => setOption((o) => putBack(o, d.id, { sectionId: line.sectionId, index }))));
      return "moved";
    }
    const all = option.sections ?? [];
    const was = all.find((x) => x.id === d.id);
    const r = moveSection(option, d.id, d.to);
    if (!r.ok) return r.reason === "module" ? refuse(r.reason) : "same";
    if (!was || sameLayout(option, r.option)) return "same";
    setOption(() => r.option);
    // «Вернуть» puts this section (with its subsections) back before the one that stood after its family — nothing else changes
    const family = new Set([d.id, ...all.filter((x) => x.parentId === d.id).map((x) => x.id)]);
    const next = all.slice(all.findIndex((x) => x.id === d.id) + 1).find((x) => !family.has(x.id) && (x.parentId ?? undefined) === (was.parentId ?? undefined));
    toast.show(t("est.sec.moved"), localUndo(() => setOption((o) => {
      const back = moveSection(o, d.id, { parentId: was.parentId, beforeId: next?.id });
      return back.ok ? back.option : o;
    })));
    return "moved";
  };
  // the rows are memoised: they get ONE object whose functions never change and always call the latest ones
  const openInCatalog = (id: string) => {
    const cid = option.lines.find((l) => l.id === id)?.catalogItemId;
    if (cid) router.push(`/catalog/${cid}`);
  };
  const latest = useRef({ openRow, leaveRow, patchLine, rowAction, openInCatalog, sectionAction });
  latest.current = { openRow, leaveRow, patchLine, rowAction, openInCatalog, sectionAction };
  const sectionApi = useMemo<SectionApi>(
    () => ({
      // folding a section closes the open row first: a wrong row speaks and stays, the section does not fold over it
      toggle: (id) => {
        if (!latest.current.leaveRow()) return;
        setCollapsedIds((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
      },
      action: (id, a) => latest.current.sectionAction(id, a),
      rename: (id, title) => {
        setOption((o) => renameSection(o, id, title));
        setRenamingId(null);
      },
    }),
    [],
  );
  const markTouchInOpen = useMemo(() => () => {
    touchInOpen.current = Date.now();
  }, []);
  const rowApi = useMemo<RowApi>(
    () => ({
      open: (id) => latest.current.openRow(id),
      close: () => void latest.current.leaveRow(),
      change: (id, patch) => latest.current.patchLine(id, patch),
      action: (id, a) => latest.current.rowAction(id, a),
      bad: (id, field, bad) => void (bad ? badFields.current.add(`${id}:${field}`) : badFields.current.delete(`${id}:${field}`)),
      wantCatalog: (id, on) => setWantCatalog((ids) => (on ? [...ids.filter((x) => x !== id), id] : ids.filter((x) => x !== id))),
      openInCatalog: (id) => latest.current.openInCatalog(id),
    }),
    [],
  );
  const addOption = () => {
    if (doc.options.length >= MAX_OPTIONS) return;
    const o = cloneOption(option, doc.options.length);
    setDoc((d) => ({ ...d, options: [...d.options, o] }));
    setCur(doc.options.length);
  };
  const removeOption = () => {
    if (doc.options.length < 2) return;
    const prev = doc;
    setDoc((d) => ({ ...d, options: d.options.filter((o) => o.id !== option.id) }));
    setCur(0);
    toast.show(t("ue.optionRemoved"), localUndo(() => setDoc(prev)));
  };
  const setRecommended = (on: boolean) =>
    setDoc((d) => ({ ...d, options: d.options.map((o) => ({ ...o, recommended: o.id === option.id ? on : on ? false : o.recommended })) }));

  // #1138: a tech saves a new estimate only where the server lets him (estimates_insert — a property he works at)
  // a signed estimate: its rows do not open (DS §8.3)
  const signed = !!existing && (existing.status === "awaiting_countersign" || existing.status === "approved");
  const mayHere = !!existing || canMakeEstimateAt(db, { role: store.role, mode: store.mode, me: db.me }, property?.id);
  const ok = !!customer && !!property && hasContent(doc);
  /** what a press of «Сохранить» found missing (shown under it, the page scrolls there) and the nudge for the scroll */
  const [missing, setMissing] = useState<null | "client" | "lines">(null);
  const [revealTick, setRevealTick] = useState(0);
  const clientRef = useRef<ComponentRef<typeof View>>(null);
  const linesRef = useRef<ComponentRef<typeof View>>(null);
  // each hint goes when ITS thing is there (the client chosen, a line made), not only when everything is
  useEffect(() => {
    if (missing === "client" && customer && property) setMissing(null);
    if (missing === "lines" && hasContent(doc)) setMissing(null);
  }, [missing, customer, property, doc]);
  /** a second press while the first one saves (the buttons are always active) does nothing: no second estimate write, no second catalog item */
  const savingRef = useRef(false);
  const { wide } = useDevice();
  const { c } = useTheme();
  const save = (send: boolean) => {
    // #1138: the main button stays active (DS §11 п.3, the director's review of #1169): where the tech may not make one, it says why
    if (!mayHere) return void toast.show(t("est.tech.notHere"));
    // something is missing (no client, no line): the button is not off — it says what and takes the person there (DS §11 п.3, Р10)
    if (!customer || !property || !hasContent(doc)) {
      setMissing(!customer || !property ? "client" : "lines");
      setRevealTick((n) => n + 1);
      haptics.warning();
      return;
    }
    // the open row settles first: a wrong one keeps the screen; a right one folds — and the thing it sends to the catalog is
    // in the document that is saved (the link), and «Отменить» of the save takes the thing out as well
    const settled = settleNow(false);
    if (!settled.closed) return;
    if (savingRef.current) return;
    savingRef.current = true;
    haptics.success();
    const clean: EstimateDoc = exemptDoc({ ...docWith(settled.option), options: docWith(settled.option).options.map((o) => ({ ...o, lines: activeLines(o.lines).filter((l) => !isBlank(l)) })) }, customer.taxExempt);
    const catalogUndos = writeCatalog(settled.newItems);
    const undo = store.saveEstimate({
      id: estimateId, customerId: customer.id, propertyId: property.id, doc: clean, leadId: params.leadId, templateId,
      title: title.trim() || estimateTitle(clean, t("ue.title")),
    });
    // saved: the store holds it now. «Отменить» on the toast takes the saved estimate back out of the store; the builder
    // is closed by then, so its content does not come back as a draft (#860)
    dropDraft();
    const saved = store.online ? t("ue.saved", { name: customer.name }) : t("offline.queued");
    // the estimate and its new price-list items: all of them go back or none (the director's 4th review Б2)
    toast.show(settled.newItems.length ? `${saved} · ${t("est.row.catalogAdded")}` : saved, store.undoTogether([...catalogUndos, undo]));
    router.replace(`/estimate/${estimateId}${send && canSeeClientLink(store.role) ? "?send=1" : ""}`);
  };

  const saveTemplate = () => {
    if (!tplEdit) return;
    // onto the template as it is NOW (another phone's rename or archive since the screen opened stays theirs)
    const live = (db.estimateTemplates ?? []).find((x) => x.id === tplEdit.id);
    if (!live || live.archivedAt) {
      toast.show(t("est.tpl.editArchived"));
      return;
    }
    // changed on another phone since this screen opened (the phone already read it): not over theirs (§12.7)
    if (tplEdit.rowVersion !== undefined && live.rowVersion !== tplEdit.rowVersion) {
      toast.show(t("est.tpl.editConflict"));
      return;
    }
    const name = title.trim() === tplEdit.name ? live.name : title.trim();
    // the open row first (a wrong number keeps it open), a row with nothing typed in it is not part of the template
    const settled = settleNow(false);
    if (!settled.closed) return;
    const tplDoc: EstimateDoc = { ...docWith(settled.option), options: docWith(settled.option).options.map((o) => ({ ...o, lines: o.lines.filter((l) => !isBlank(l)) })) };
    const next = editedTemplate(live, tplDoc, seeCosts, name);
    if (!next) {
      toast.show(t("est.tpl.cannot"));
      return;
    }
    // the server checks the same: over the version this screen opened on, else «не сохранено» (row_version_conflict)
    const catalogUndos = writeCatalog(settled.newItems);
    const undo = store.saveEstimateTemplate(next, { baseRowVersion: tplEdit.rowVersion, clearCosts: clearedCosts(live, tplDoc, seeCosts) });
    // «Отменить» (rule 5): the edit waits on the phone while the toast is up (SEND_AFTER_MS) — taken out of the queue
    toast.show(store.online ? t("est.tpl.saved", { name: next.name }) : t("offline.queued"), store.undoTogether([...catalogUndos, undo]));
    router.replace("/estimate/templates");
  };

  // the open row's place in the catalog (not for the tech): linked, or the choice and what the engine says of it
  const catalogStateOf = (l: CustomLine) => {
    const linked = !!l.catalogItemId && db.catalog.some((x) => x.id === l.catalogItemId);
    const offer = catalogOffer(l, seeCosts);
    return { linked, want: wantCatalog.includes(l.id), offer: offer.state, reason: offer.state === "refused" ? offer.reason : undefined };
  };
  const act = activeLines(option.lines);
  // the sum of each line by its id, once (not `indexOf` for every row: that is n² for a long estimate)
  // a section that is carried folds while it is held (its lines go with it)
  const view = useMemo(() => viewRows(option, new Set(holdSection ? [...collapsedIds, holdSection] : collapsedIds)), [option, collapsedIds, holdSection]);
  const secTotals = useMemo(() => sectionSubtotals(option, s), [option, s]);
  const totalById = new Map(act.map((l, i) => [l.id, totals.lineTotals[i] ?? 0] as const));
  const taxValue = !s.tax.enabled ? t("ue.off") : partialTax ? `${ppmToPctText(taxRatePpm(s.tax))}% · ${t("ue.taxPartialShort")}` : `${ppmToPctText(taxRatePpm(s.tax))}%`;
  const discValue = !s.discount ? t("ue.add") : s.discount.kind === "pct" ? `${discountBps(s.discount.value) / 100}%` : money(s.discount.cents);
  const depValue = s.deposit.kind === "none" ? t("ue.none") : s.deposit.kind === "pct" ? `${s.deposit.bps / 100}% · ${money(totals.deposit)}` : money(totals.deposit);

  /** «Сохранить и отправить» (the office: sending is theirs, #1113) and «Сохранить»: always active — a press with something missing says what */
  // the pinned bar: in one row, «Сохранить» 2 : 3 «Сохранить и отправить», 44 high; the tech has one «Сохранить» across (DS §8.9)
  const canSend = canSeeClientLink(store.role);
  const sendButton = (bar: boolean) => (canSend ? <View testID="ue-save-send"><Button label={t("ue.saveSend")} icon="send" size={bar ? "bar" : undefined} full onPress={() => save(true)} /></View> : null);
  const saveButton = (bar: boolean) => (
    <View testID="ue-save">
      <Button label={t("ue.save")} icon="check" size={bar ? "bar" : undefined} variant={canSend ? "secondary" : "primary"} full onPress={() => save(false)} />
    </View>
  );
  const saveButtons = (
    <>
      {sendButton(false)}
      {saveButton(false)}
    </>
  );

  return (
    <Screen onScrollBegin={() => {
      swipes.closeOpen();
      // the finger that starts this scroll went down a moment ago; an older touch (a tap on a field) does not count
      const inOpen = Date.now() - touchInOpen.current < motion.durSlow * 3;
      touchInOpen.current = 0;
      // the page scrolls from a finger on the open row (to its lower fields): the row stays open; anywhere else it folds
      if (!inOpen) void leaveRow(true);
    }} title={tplEdit ? t("est.tpl.editTitle") : existing ? t("ue.title") : t("ue.newTitle")} back={back} help={t("ue.help")} hintKey="estimate-builder" footer={tplEdit ? undefined : (
      <ActionBar testID="est-actionbar" summary={(
        <View style={{ gap: space[1] }}>
          <RowView style={{ justifyContent: "space-between" }}><T v="body" tone="mut">{t("ue.total")}</T><T v="body" w="semibold" tabular>{money(totals.total)}</T></RowView>
          {/* the tech saves; the office sends (#1113, DS §8.9) */}
          {canSend ? null : <View testID="est-bar-office"><T v="caption" tone="mut">{t("est2.bar.officeSends")}</T></View>}
        </View>
      )} second={canSend ? saveButton(true) : undefined} main={canSend ? sendButton(true) : saveButton(true)} />
    )}>
      <RevealOnTick tick={revealTick} target={missing === "client" ? clientRef : linesRef} />
      {existing && existing.status !== "draft" ? (
        <T v="caption" tone="warn">
          {t("ue.editSentNote")}
        </T>
      ) : null}
      {draft ? (
        <View testID="est-draft">
          <Card>
            <RowView>
              <Icon name="note" s={size.iconSm} />
              <T v="caption" tone="mut" style={{ flex: 1 }}>
                {t("est.draft.restored")}
              </T>
              <View testID="est-draft-restart">
                <Button label={t("est.draft.restart")} variant="secondary" onPress={() => setAskRestart(true)} />
              </View>
            </RowView>
          </Card>
        </View>
      ) : null}
      <Grid>
        <View style={{ gap: space[3] }}>
          {tplEdit ? (
            <View testID="est-tpl-editing">
              <T v="caption" tone="mut">{t("est.tpl.editHint")}</T>
            </View>
          ) : (
          <View ref={clientRef} collapsable={false} style={{ gap: space[1] }}>
          <Card onPress={() => setClientPicker(true)} accessibilityLabel={t("est.for")} style={missing === "client" ? { borderColor: c.status.bad.fill } : undefined}>
            <RowView>
              {customer ? <Avatar initials={initials(customer.name)} /> : <Icon name="user" />}
              <View style={{ flex: 1 }}>
                <T v="body" w="semibold">
                  {customer?.name ?? t("ue.pickClient")}
                </T>
                {property ? (
                  <T v="caption" tone="mut">
                    {property.address}, {property.city}
                  </T>
                ) : null}
              </View>
              <Icon name="chevronRight" s={size.iconSm} />
            </RowView>
          </Card>
          {missing === "client" ? <FieldError text={t("ue.pickClient")} testID="ue-missing-client" /> : null}
          </View>
          )}
          <View testID="ue-title">
            <TextField type="title" value={title} onChangeText={setTitle} placeholder={tplEdit ? t("est.tpl.name") : t("ue.jobTitle")} icon="note" />
          </View>

          {doc.options.length > 1 ? (
            <Card>
              <Segmented full value={option.id} onChange={(id) => setCur(doc.options.findIndex((o) => o.id === id))} items={doc.options.map((o) => ({ key: o.id, label: o.name || "—" }))} />
              <TextField type="title" value={option.name} onChangeText={(v) => setOption((o) => ({ ...o, name: v }))} placeholder={t("ue.optionName")} />
              <RowView style={{ minHeight: size.hitMin }}>
                <T v="body" style={{ flex: 1 }}>
                  {t("ue.recommended")}
                </T>
                <Toggle label={t("ue.recommended")} on={!!option.recommended} onChange={setRecommended} />
              </RowView>
              <Button label={t("ue.removeOption")} icon="trash" variant="ghost" size="sm" onPress={removeOption} />
            </Card>
          ) : null}

          <SectionTitle title={t("ue.items")} right={act.length ? <T v="caption" tone="mut">{act.length}</T> : undefined} />
          {option.lines.length ? (
            <View testID="est-row-view">
              <Segmented<"brief" | "full"> full label={t("est2.view.label")} value={rowLook} onChange={setRowLook} items={[{ key: "brief", label: t("est2.view.brief") }, { key: "full", label: t("est2.view.full") }]} />
            </View>
          ) : null}
          <View ref={linesRef} collapsable={false} style={{ gap: space[1] }}>
          <Card style={missing === "lines" ? { borderColor: c.status.bad.fill } : undefined}>
            {option.lines.length === 0 ? (
              <View testID="est-empty">
                <T v="body" tone="mut">
                  {t("est.row.empty")}
                </T>
              </View>
            ) : null}
            <SortableList
              rows={view}
              openKey={openId ? `l:${openId}` : renamingId ? `s:${renamingId}` : null}
              locked={signed}
              onDrop={dropRow}
              onHold={setHoldSection}
              beforeBegin={(r) => r.type !== "section" || leaveRow(true)}
              renderRow={(r, i) =>

              r.type === "section" ? (
                <View key={`s-${r.section.id}`}>
                  {i > 0 ? <Divider /> : null}
                  <SectionHeader
                    section={r.section}
                    depth={r.depth}
                    title={secTitle(r.section)}
                    total={money(secTotals.bySection[r.section.id] ?? 0)}
                    lineCount={r.lineCount}
                    collapsed={r.collapsed}
                    renaming={renamingId === r.section.id}
                    locked={signed}
                    api={sectionApi}
                  />
                </View>
              ) : r.type === "unsectioned" ? (
                <View key="unsectioned" testID="est-sec-loose">
                  {i > 0 ? <Divider /> : null}
                  <T v="caption" tone="mut" w="semibold">
                    {t("est.sec.loose")}
                  </T>
                </View>
              ) : (
                <View key={r.line.id} style={{ paddingLeft: r.depth === 1 ? space[4] : 0 }}>
                  {i > 0 ? <Divider /> : null}
                  <LineRow
                    line={r.line}
                    open={openId === r.line.id}
                    total={totalById.get(r.line.id) ?? 0}
                    costsVisible={seeCosts}
                    form={rowForm}
                    api={rowApi}
                    locked={signed}
                    noHide={!!tplEdit}
                    unhiddenMark={unhiddenIds.includes(r.line.id)}
                    catalog={openId === r.line.id && store.role !== "tech" ? catalogStateOf(r.line) : undefined}
                    autoFocus={focusRow?.id === r.line.id ? focusRow.field : undefined}
                    checkPrice={checkPrice.includes(r.line.id)}
                    view={rowLook}
                    onTouchOpen={openId === r.line.id ? markTouchInOpen : undefined}
                  />
                </View>
              )
              }
            />
          </Card>
          {missing === "lines" ? <FieldError text={t("ue.empty")} testID="ue-missing-lines" /> : null}
          </View>
          <RowView>
            <View style={{ flex: 1 }} testID="est-add-new">
              <Button label={t("est.row.addNew")} icon="plus" variant="secondary" full onPress={() => addNew()} />
            </View>
            <View style={{ flex: 1 }} testID="est-add-catalog">
              <Button label={t("est.row.addCatalog")} icon="search" variant="secondary" full onPress={openCatalog} />
            </View>
          </RowView>
          {signed ? null : (
            <RowView>
              <View style={{ flex: 1 }} testID="est-group-by-kind">
                <Button label={t("est.sec.layout")} variant="ghost" full onPress={layoutBtn} />
              </View>
              <View style={{ flex: 1 }} testID="est-add-section">
                <Button label={`＋ ${t("est.sec.addSection")}`} variant="ghost" full onPress={() => addSectionBtn()} />
              </View>
            </RowView>
          )}
        </View>

        <View style={{ gap: space[3] }}>
          <Card>
            <SumRow label={t("ue.subtotal")} value={money(totals.subtotal)} />
            <Divider />
            <SumRow label={t("ue.discount")} value={totals.discount ? `−${money(totals.discount)}` : discValue} onPress={signed ? undefined : () => setSetting("discount")} />
            <Divider />
            <SumRow label={t("ue.tax")} value={totals.tax ? `${money(totals.tax)} · ${taxValue}` : taxValue} onPress={signed ? undefined : () => setSetting("tax")} />
            <Divider />
            <RowView style={{ justifyContent: "space-between", minHeight: size.hitMin }}>
              <T v="title">{t("ue.total")}</T>
              <T v="display" tabular>
                {money(totals.total)}
              </T>
            </RowView>
            <Divider />
            <SumRow label={t("ue.deposit")} value={depValue} onPress={signed ? undefined : () => setSetting("deposit")} />
            {totals.depositOverCaLimit ? (
              <T v="caption" tone="warn">
                {t("ue.caWarn", { limit: money(totals.caDepositLimit) })}
              </T>
            ) : null}
            {totals.cost > 0 && store.role !== "tech" ? (
              <T v="caption" tone="mut">
                {costComplete(option) ? t("ue.margin", { p: totals.marginPct ?? "0", cost: money(totals.cost) }) : t("ue.costPartial", { cost: money(totals.cost) })}
              </T>
            ) : null}
            {option.lines.some((l) => l.optional) ? (
              <T v="caption" tone="mut">
                {t("ue.addonsNote")}
              </T>
            ) : null}
          </Card>
          {doc.options.length < MAX_OPTIONS ? (
            <View style={{ gap: space[1] }}>
              <Button label={t("ue.addOption")} icon="plus" variant="ghost" size="sm" onPress={addOption} />
              {doc.options.length === 1 ? (
                <T v="caption" tone="mut">
                  {t("ue.optionsHint")}
                </T>
              ) : null}
            </View>
          ) : null}
          <TextField type="note" value={doc.note ?? ""} onChangeText={(v) => setDoc((d) => ({ ...d, note: v }))} placeholder={t("ue.note")} />
          {tplEdit ? (
            <View testID="est-tpl-save">
              <Button label={t("est.tpl.saveTemplate")} icon="check" full disabled={!title.trim()} onPress={saveTemplate} />
            </View>
          ) : (
            <>
              {!mayHere && property ? (
                <View testID="ue-not-here">
                  <T v="caption" tone="mut">
                    {t("est.tech.notHere")}
                  </T>
                </View>
              ) : null}
              {/* a phone: the buttons are in the pinned bar (Screen footer); from 820 — here, in the column of the totals */}
              {wide ? saveButtons : null}
            </>
          )}
        </View>
      </Grid>

      <Sheet visible={picker !== null && db.catalog.length === 0} onClose={() => setPicker(null)} title={t("est.row.pickTitle")}>
        <View testID="est-catalog-empty" style={{ gap: space[3] }}>
          <T v="body" tone="mut">
            {t("est.row.emptyCatalog")}
          </T>
          <Button
            label={t("est.row.openCatalog")}
            icon="search"
            variant="secondary"
            onPress={() => {
              setPicker(null);
              router.push("/catalog");
            }}
          />
        </View>
      </Sheet>
      <PickerSheet<string>
        visible={picker !== null && db.catalog.length > 0}
        title={picker !== null && typeof picker === "object" && "replace" in picker ? t("est.row.replaceTitle") : t("est.row.pickTitle")}
        items={[
          ...(picker !== null && typeof picker === "object" && "replace" in picker ? [{ key: "__clear__", label: t("est.row.clear") }] : []),
          ...[...db.catalog]
            .filter((x) => !(picker !== null && typeof picker === "object" && "replace" in picker) || x.kind !== "kit")
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((x) => ({ key: x.id, label: x.name, subtitle: `${t(kindLabel(x.kind))} · ${money(itemPrice(x, db.catalog))} / ${x.unit}${x.placeholder ? ` · ${t("cat.placeholder")}` : ""}` })),
        ]}
        value={null}
        onSelect={(k) => (k === "__clear__" && typeof picker === "object" && picker && "replace" in picker ? clearRow(picker.replace) : fromCatalog(k))}
        onClose={() => setPicker(null)}
        onExited={() => {
          const next = afterPicker.current;
          afterPicker.current = null;
          next?.();
        }}
        testID="est-catalog-picker"
      />
      <PickerSheet<string>
        visible={moveFor !== null}
        title={t("est.sec.moveTitle")}
        items={[
          { key: "__up__", label: t("est.sec.moveUp") },
          { key: "__down__", label: t("est.sec.moveDown") },
          // the sections as the list counts them (a broken or past-the-limit one is not offered); a subsection with its parent
          ...countedSections(option).filter((x) => x.kind !== "module").map((x) => {
            const parent = x.parentId ? option.sections?.find((y) => y.id === x.parentId) : undefined;
            return { key: x.id, label: parent ? `${secTitle(parent)} > ${secTitle(x)}` : secTitle(x) };
          }),
          { key: "__none__", label: t("est.sec.moveNone") },
        ]}
        value={null}
        onSelect={(k) => moveFor && doMove(moveFor, k)}
        onClose={() => setMoveFor(null)}
        testID="est-move-picker"
      />
      {/* the question of the tax is a PAGE of this sheet (one window at a time: a second Modal does not show on iOS, #743) */}
      <Sheet
        visible={setting !== null}
        onClose={() => {
          setTaxAsk(null);
          setSetting(null);
        }}
        title={taxAsk ? t("ue.taxAskTitle") : setting ? t(`ue.${setting}` as DictKey) : undefined}
        onBack={taxAsk ? () => setTaxAsk(null) : undefined}
      >
        <View style={{ gap: space[3] }}>
          {taxAsk ? (
            <View testID="est-tax-ask" style={{ gap: space[3] }}>
              {taxAsk.diffs.map((d, i) => (
                <T key={i} v="body" tone="mut">
                  {taxAsk.diffs.length > 1 ? t("ue.taxAskOption", { name: d.name, was: money(d.was), will: money(d.will) }) : t("ue.taxAskBody", { was: money(d.was), will: money(d.will) })}
                </T>
              ))}
              <View testID="est-tax-ask-yes">
                <Button label={t("ue.taxAskYes")} full onPress={() => { setSettings({ tax: taxAsk.tax }); setTaxAsk(null); }} />
              </View>
              <View testID="est-tax-ask-no">
                <Button label={t("ue.taxAskNo")} variant="secondary" full onPress={() => setTaxAsk(null)} />
              </View>
            </View>
          ) : null}
          {!taxAsk && setting === "discount" ? (
            <>
              <Segmented
                full
                value={s.discount ? s.discount.kind : "none"}
                onChange={(k) => setSettings({ discount: k === "none" ? null : k === "pct" ? { kind: "pct", value: "0.05" } : { kind: "fixed", cents: 0 } })}
                items={[
                  { key: "none", label: t("ue.none") },
                  { key: "pct", label: "%" },
                  { key: "fixed", label: "$" },
                ]}
              />
              {s.discount?.kind === "pct" ? (
                <PctField bps={discountBps(s.discount.value)} onChange={(b) => setSettings({ discount: { kind: "pct", value: String(Math.min(b, 10000) / 10000) } })} />
              ) : s.discount?.kind === "fixed" ? (
                <MoneyField cents={s.discount.cents} onChange={(c) => setSettings({ discount: { kind: "fixed", cents: c } })} />
              ) : null}
            </>
          ) : null}
          {!taxAsk && setting === "tax" ? (
            <>
              <RowView style={{ minHeight: size.hitMin }}>
                <T v="body" style={{ flex: 1 }}>
                  {t("ue.taxOn")}
                </T>
                {/* a client without tax: the switch is pale and says why (the server refuses tax for them, П-2a) */}
                <View testID="est-tax-toggle">
                  <Toggle label={t("ue.tax")} on={s.tax.enabled} disabled={exempt || signed} onChange={(on) => (on ? changeTax({ enabled: true }) : setSettings({ tax: { ...s.tax, enabled: false } }))} />
                </View>
              </RowView>
              <T v="caption" tone="mut">
                {exempt ? t("ue.taxExemptClient") : signed ? t("ue.taxSigned") : t("ue.taxHint")}
              </T>
              {s.tax.enabled && !exempt && !signed ? (
                partialTax ? (
                  <View testID="est-tax-partial" style={{ gap: space[2] }}>
                    <T v="caption" tone="mut">
                      {t("ue.taxPartial")}
                    </T>
                    <Button label={t("ue.taxWhole")} variant="secondary" full onPress={() => changeTax({})} />
                  </View>
                ) : (
                  <>
                    <Labeled label={t("ue.taxRate")}>
                      <View testID="est-tax-rate">
                        <RatePctField ppm={taxRatePpm(s.tax)} onChange={(p) => setSettings({ tax: wholeTax(s.tax, { ratePpm: Math.min(p, 1_000_000) }) })} />
                      </View>
                    </Labeled>
                    {lastRate !== null && lastRate !== taxRatePpm(s.tax) ? (
                      <View testID="est-tax-last">
                        <Button label={t("ue.taxLast", { rate: ppmToPctText(lastRate) })} variant="ghost" onPress={() => setSettings({ tax: wholeTax(s.tax, { ratePpm: lastRate }) })} />
                      </View>
                    ) : null}
                  </>
                )
              ) : null}
            </>
          ) : null}
          {!taxAsk && setting === "deposit" ? (
            <>
              <Segmented
                full
                value={s.deposit.kind}
                onChange={(k) => setSettings({ deposit: (k === "pct" ? { kind: "pct", bps: 1000 } : k === "fixed" ? { kind: "fixed", cents: 0 } : { kind: "none" }) as DepositSetting })}
                items={[
                  { key: "pct", label: t("ue.depositPct") },
                  { key: "fixed", label: t("ue.depositUsd") },
                  { key: "none", label: t("ue.none") },
                ]}
              />
              {s.deposit.kind === "pct" ? (
                <PctField bps={s.deposit.bps} onChange={(b) => setSettings({ deposit: { kind: "pct", bps: Math.min(b, 10000) } })} />
              ) : s.deposit.kind === "fixed" ? (
                <MoneyField cents={s.deposit.cents} onChange={(c) => setSettings({ deposit: { kind: "fixed", cents: c } })} />
              ) : null}
              <SumRow label={t("ue.deposit")} value={money(totals.deposit)} />
              {totals.depositOverCaLimit ? (
                <T v="caption" tone="warn">
                  {t("ue.caWarn", { limit: money(totals.caDepositLimit) })}
                </T>
              ) : null}
            </>
          ) : null}
          <Button label={t("common.gotIt")} icon="check" full onPress={() => setSetting(null)} />
        </View>
      </Sheet>
      <Sheet visible={askRestart} onClose={() => setAskRestart(false)} title={t("est.draft.ask")}>
        <View testID="est-draft-ask" style={{ gap: space[3] }}>
          <T v="body" tone="mut">{t("est.draft.askHint")}</T>
          <View testID="est-draft-delete">
            <Button label={t("est.draft.delete")} icon="close" variant="danger" full onPress={restart} />
          </View>
          <View testID="est-draft-keep">
            <Button label={t("common.cancel")} variant="secondary" full onPress={() => setAskRestart(false)} />
          </View>
        </View>
      </Sheet>
      {/* «С чего начать?» (spec 07 §7.4): a choice menu in a sheet — rows (rule 12) */}
      <Sheet visible={startOpen} onClose={() => start(null)} title={t("est.tpl.start")}>
        <View testID="est-start" style={{ gap: space[1] }}>
          <View testID="est-start-blank">
            <ListRow title={t("est.tpl.blank")} subtitle={t("est.tpl.blankHint")} left={<Icon name="plus" />} onPress={() => start(null)} />
          </View>
          {templates.map((x) => (
            <View key={x.id} testID={`est-start-${x.id}`}>
              <Divider />
              <ListRow
                title={x.name}
                subtitle={`${t("est.tpl.options", { n: x.doc.options.length })} · ${t("est.tpl.from", { sum: money(templateFromCents(x.doc, db.catalog)) })}`}
                left={<Icon name="copy" />}
                onPress={() => start(x)}
              />
            </View>
          ))}
        </View>
      </Sheet>
      <ClientPicker
        visible={clientPicker}
        onClose={() => setClientPicker(false)}
        onPick={(cid, pid) => {
          setCustomerId(cid);
          setPropertyId(pid);
          setClientPicker(false);
        }}
      />
    </Screen>
  );
}

function SumRow({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  const row = (
    <RowView style={{ justifyContent: "space-between", minHeight: size.hitMin }}>
      <T v="body" tone="mut">
        {label}
      </T>
      <RowView gap={space[1]}>
        <T v="body" tabular>
          {value}
        </T>
        {onPress ? <Icon name="chevronRight" s={size.iconSm} /> : null}
      </RowView>
    </RowView>
  );
  return onPress ? (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      {row}
    </Press>
  ) : (
    row
  );
}


/** the page scrolls to the thing a press of «Сохранить» found missing (the screen's scroll is for its children: this is one) */
function RevealOnTick({ tick, target }: { tick: number; target: React.RefObject<ComponentRef<typeof View> | null> }) {
  const scroll = useScreenScroll();
  const reduce = useReducedMotion();
  useEffect(() => {
    if (tick > 0 && target.current && scroll) scroll.scrollToNode(target.current, space[6], !reduce);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);
  return null;
}
