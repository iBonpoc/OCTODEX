import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { canSeeClientLink } from "@/features/estimateSign";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { haptics } from "@/ui/haptics";
import { component, motion, space, spaceHalf, size } from "@octo/design-tokens";
import { LINE_GROUPS, activeLines, countedSections, discountBps, ppmToPctText, sectionSubtotals, taxRatePpm, type TaxSettings, type EstimateSection, type CustomLine, type CustomOption, type DepositSetting, type LineGroup } from "@octo/estimating-engine";
import { useStore } from "@/data/store";
import { canMakeEstimateAt, canSeeEstimate, keepCosts, seeCosts as seesCosts } from "@/features/access";
import type { CatalogItem, EstimateDoc, EstimateTemplate } from "@/data/types";
import { appendTemplate, canEditEstimateTemplates, clearedCosts, editedTemplate, fromTemplate, removeAppended, pickableTemplates, templateForEdit, templateFromCents } from "@/features/estimateTemplate";
import { useI18n, type DictKey } from "@/i18n";
import { MAX_OPTIONS, linesFromCatalog, newLine, cloneOption, nextOptionName, recommend, withoutOption, costComplete, estimateTitle, exemptDoc, hasContent, lineMarks, newDoc, optionTotals, shownQty, uid } from "@/features/estimateDoc";
import { LineMarks } from "@/features/LineMarks";
import { ClientPicker, itemPrice, kindLabel } from "@/features/estimatePickers";
import { LineRow, rowFieldId, type RowAction, type RowApi } from "@/features/estimate/LineRow";
import { useRowView } from "@/features/estimate/rowView";
import { rowSum } from "@/features/estimate/rowLine";
import { swipeHintDue, useSwipeHint } from "@/features/estimate/swipeHint";
import { SortableList, type DropResult } from "@/features/SortableList";
import { withLooseTarget, type Drop } from "@/features/sortable";
import { swipes } from "@/features/estimate/swipeState";
import { SectionHeader, type SectionAction, type SectionApi } from "@/features/estimate/SectionHeader";
import { OptionsCard } from "@/features/estimate/OptionsCard";
import { TotalsBreakdown } from "@/features/estimate/TotalsBreakdown";
import { allOptionalFor, totalsRows } from "@/features/estimate/totalsRows";
import { CaWarn } from "@/features/estimate/CaWarn";
import { NotesTerms } from "@/features/estimate/NotesTerms";
import { isSignedEstimate } from "@/features/estimate/notesTerms";
import { docLanguageFor } from "@/data/people";
import { autoGroups, canAddSection, addSection, deleteSection, layoutByKind, moveLine, moveSection, putBack, layoutUndo, renameSection, sameLayout, shiftLine, viewRows, type Opt } from "@/features/sectionLayout";
import { applyPatch, catalogOffer, clearLine, settleOpenRow, dropLine, duplicateLine, isBlank, leaveDecision, nextSeries, replaceLine, restoreDeleted, type DeleteSeries, restoreLine, rowProblems, setHidden } from "@/features/estimateRows";
import { FieldError, useRequiredForm, useScreenScroll } from "@/ui/requiredForm";
import { MainStep } from "@/ui/mainStep";
import { CreateButton, MoreButton } from "@/ui/templates/parts";
import type { MainAction } from "@/ui/templates";
import { estimateStatusView } from "@/features/estimateStatus";
import { useReducedMotion } from "react-native-reanimated";
import { useDevice, useTheme } from "@/theme/ThemeProvider";
import { PickerSheet } from "@/ui/pickerSheet";
import { Labeled, MoneyField, PctField, RatePctField } from "@/features/fields";
import { isPartialTax, lastTaxRatePpm, taxChange, wholeTax, type TaxDiff } from "@/features/estimateTax";
import { Button, IconButton, Segmented, StatusChip, TextField, Toggle } from "@/ui/controls";
import { CountPill, FigureRow } from "@/ui/figures";
import type { IconKey } from "@/ui/primitives";
import { dayKeyIn } from "@/features/zone";
import { dayOffsetOf, todayKey } from "@/features/calendar";
import { Icon, Press, T } from "@/ui/primitives";
import { Menu, Sheet, useToast, type MenuItem } from "@/ui/overlays";
import { Card, Divider, Empty, Grid, ListRow, RowView, Screen, SectionTitle, useFooterShown } from "@/ui/surfaces";
import { draftCtx, draftSnapshot, draftsKey, findDraft, nextDrafts, removeDraft, useEstimateDrafts, type EstimateDraft } from "@/features/estimateDraft";
import { useAuth } from "@/cloud/auth";
import { localUndo, withAfter } from "@/data/undo";
import { StatusNote } from "@/ui/statusNote";

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

type Params = { id?: string; customerId?: string; propertyId?: string; leadId?: string; template?: string; editTemplate?: string; pick?: string };

function EstimateBuilder({ drafts }: { drafts: ReturnType<typeof useEstimateDrafts> }) {
  const params = useLocalSearchParams<Params>();
  const store = useStore();
  const { db } = store;
  const { t, money, time, day } = useI18n();
  const toast = useToast();
  const existing = params.id ? db.estimates.find((e) => e.id === params.id) : undefined;
  // a new estimate opened from the same place as an unfinished one: it goes on (#760, audit Q-01)
  const ctx = draftCtx(params);
  const [draft, setDraft] = useState(() => findDraft(drafts.list, ctx, Date.now(), (id) => db.estimates.some((e) => e.id === id)));
  const [estimateId] = useState(() => existing?.id ?? draft?.estimateId ?? uid());
  const [customerId, setCustomerId] = useState(existing?.customerId ?? draft?.customerId ?? params.customerId);
  const [propertyId, setPropertyId] = useState(existing?.propertyId ?? draft?.propertyId ?? params.propertyId);
  // E3 (S5t): a template to start from — given by the templates screen, or picked in «С чего начать?»
  const seeCosts = seesCosts(db, store.role, store.mode);
  // #1837: what a write carries — a template's costs the phone holds go into the estimate (and back) unless the server
  // said «no»; what is SHOWN is seeCosts (review №1: an unknown flag must not drop them for good)
  const keep = keepCosts(db);
  const templates = pickableTemplates(db.estimateTemplates ?? []);
  const given = !existing && params.template ? templates.find((x) => x.id === params.template) : undefined;
  // §12 №10: the builder edits a template's lines (no client; «Сохранить шаблон») — the director and the office only
  // fixed when the screen opens: a template archived meanwhile (a sync) must not turn this into a new estimate (security check №2)
  const [tplEdit] = useState(() => (!existing && !given && params.editTemplate && canEditEstimateTemplates(store.role) ? templates.find((x) => x.id === params.editTemplate) : undefined));
  const [fromTpl] = useState(() => (given ? fromTemplate(given.doc, db.catalog, given.costs ?? {}, keep, !!given.module) : null));
  const [templateId, setTemplateId] = useState<string | undefined>(draft ? draft.templateId : given?.id);
  const [checkPrice, setCheckPrice] = useState<string[]>(draft?.checkPrice ?? fromTpl?.checkPrice ?? []);
  // lines that were hidden and came priced (a template line took the catalog price): shown to the client again — the mark stays until the row is opened
  const [unhiddenIds, setUnhiddenIds] = useState<string[]>(() => fromTpl?.unhidden ?? []);
  // «Сохранить в каталог» chosen on rows (by line id); done when the row folds with a right line
  const [wantCatalog, setWantCatalog] = useState<string[]>(() => draft?.wantCatalog ?? []);
  // «Сметы → ＋ → Из шаблона…» (DS §8.13): the sheet opens on the templates themselves (no «Пустая смета»), even with none
  const askedTemplates = params.pick === "templates" && !existing && !given && !tplEdit;
  // a draft is open: the template is ADDED to it (what is typed is never lost), as from the editor (code review)
  const [startOpen, setStartOpen] = useState(() => askedTemplates || (!existing && !draft && !given && !tplEdit && templates.length > 0));
  /** the sheet is a list of templates only: asked for («Из шаблона…»), not the first «С чего начать?» */
  const [pickOnly, setPickOnly] = useState(askedTemplates);
  /** the lines that came from a template, in order: «Кол-во» of each, «›» to the next (DS §8.13 «загрузил и меняю количество») */
  const [qtyChain, setQtyChain] = useState<string[]>([]);
  /** what to do once «С чего начать?» has gone (the cursor into «Кол-во»), and whether it was opened from the editor */
  const afterStart = useRef<(() => void) | null>(null);
  const startInEditor = useRef(askedTemplates && !!draft);
  /** …or once the client is chosen, when the template was picked before the client («Сметы → ＋ → Из шаблона…») */
  const afterClient = useRef<(() => void) | null>(null);
  /** #1304: a new estimate starts with the company's Terms in its client's language (a template never carries them, spec 40 §7);
   *  an estimate already saved keeps what it has — an old one without the key goes on showing the default (no key added) */
  /** the lead the estimate is for: its own (opened by id), or the one it is made from — /p/, the PDF and the card read the same */
  const leadOf = existing?.leadId ?? params.leadId;
  const withNewTerms = (d: EstimateDoc, cid: string | undefined): EstimateDoc =>
    d.terms === undefined ? { ...d, terms: store.estimateTerms({ customerId: cid, leadId: leadOf }).text } : d;
  const [doc, setDoc] = useState<EstimateDoc>(() =>
    existing
      ? // an estimate saved already never gets the key here (one without a doc — an older phone's — starts empty, no Terms)
        existing.doc ? (JSON.parse(JSON.stringify(existing.doc)) as EstimateDoc) : newDoc(db.company?.estimate.depositBps)
      : tplEdit
        ? templateForEdit(tplEdit, keep)
        : withNewTerms(draft?.doc ?? fromTpl?.doc ?? newDoc(db.company?.estimate.depositBps), draft?.customerId ?? params.customerId),
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
  /** a row is carried: the whole list is short rows («Кратко»), «Без раздела» is a place to drop (DS §14.6) */
  const [lifted, setLifted] = useState<string | null>(null);
  // the swipe hint of the first three estimates on the device (DS §8.11): once per opening, on the first line
  const swipeHint = useSwipeHint();
  const reduceMotion = useReducedMotion();
  const [hintDone, setHintDone] = useState(false);
  const hintPlayed = swipeHint.played;
  const onHintPlayed = useCallback(() => {
    setHintDone(true);
    hintPlayed();
  }, [hintPlayed]);
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
    const fresh = { estimateId, customerId: params.customerId, propertyId: params.propertyId, title: given?.name ?? "", doc: withNewTerms(fromHere, params.customerId), templateId: given?.id, checkPrice: fromTpl?.checkPrice ?? [] };
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
    setPickOnly(false);
    // asked from the editor («Из шаблона…», «⋯»): closing it is only closing — the client is chosen in the editor
    const inEditor = startInEditor.current;
    startInEditor.current = false;
    // from the editor (or onto a draft) a template only ADDS: the sections, the note, the tax, the discount and the empty options
    // typed before stay (DS §8.13 «набранное не теряется»; code review: the empty editor replaced them)
    if (x && (inEditor || hasContent(doc))) return void addTemplate(x, hasContent(doc));
    if (x) {
      const r = fromTemplate(x.doc, db.catalog, x.costs ?? {}, keep, !!x.module);
      const ci = Math.max(0, r.doc.options.findIndex((o) => o.recommended));
      // the estimate's Terms stay: a template never carries them (spec 40 §7)
      setDoc(doc.terms !== undefined ? { ...r.doc, terms: doc.terms } : r.doc);
      setCur(ci);
      setTemplateId(x.id);
      setCheckPrice(r.checkPrice);
      setUnhiddenIds(r.unhidden);
      if (!title.trim()) setTitle(x.name);
      toast.show(r.checkPrice.length ? t("est.tpl.checkPrice", { n: r.checkPrice.length }) : t("est.tpl.applied", { name: x.name }));
      focusChain(activeLines(r.doc.options[ci]?.lines ?? []).map((l) => l.id), !customerId && !inEditor);
    }
    if (!customerId && !inEditor) {
      // the client is asked next: the cursor goes into «Кол-во» once that sheet has gone too
      afterStart.current = null;
      setClientPicker(true);
    }
  };
  /** «Кол-во» of the first line of `ids` takes the cursor (the row opens in place); `ids` is the «›» chain */
  const focusChain = (ids: string[], afterClientPick = false) => {
    setQtyChain(ids);
    const first = ids[0];
    if (!first) return;
    // after the sheet has gone: a field focused under a leaving sheet loses the cursor (as the catalog picker does)
    const go = () => {
      setFocusRow({ id: first, field: "qty" });
      setOpenId(first);
    };
    if (afterClientPick) afterClient.current = go;
    else afterStart.current = go;
  };
  const customer = db.customers.find((c) => c.id === customerId);
  const property = db.properties.find((p) => p.id === propertyId) ?? db.properties.find((p) => p.customerId === customerId);
  const option = doc.options[Math.min(cur, doc.options.length - 1)]!;
  // #2363 q75 (founder 21.11: «по видам, автоматически»): an option with no sections of its own and lines of two kinds or more is
  // SHOWN in groups by kind («Материалы · Работа · Услуги», DS §8.5) — a view, not data: the document, the PDF and /p/ do not change
  // until the person moves a row or a section (then the grouping becomes the option's own sections, with «Вернуть»)
  const grouped = useMemo(() => autoGroups(option), [option]);
  const layoutOpt = grouped ?? option;
  // a tax-exempt client: no sales tax on the estimate (the server refuses it, П-2a)
  const exempt = !!customer?.taxExempt;
  const counted = useMemo(() => exemptDoc(doc, exempt), [doc, exempt]);
  const totals = useMemo(() => optionTotals(counted, option), [counted, option]);
  // «Если клиент включит всё на выбор — итог $Y» (#1362): the engine's totals with the add-ons ticked (rule 8)
  const signedNow = isSignedEstimate(existing);
  const allOptional = useMemo(() => allOptionalFor(counted, option, signedNow), [counted, option, signedNow]);
  // each option's total under the segments (DS §8.10): the owner compares them without switching
  const optionSums = useMemo(() => Object.fromEntries(counted.options.map((o) => [o.id, optionTotals(counted, o).total])), [counted]);
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
  const deleted = useRef<DeleteSeries | null>(null);
  const removeLine = (id: string) => {
    const index = option.lines.findIndex((l) => l.id === id);
    const line = option.lines[index];
    if (!line) return;
    setOption((o) => ({ ...o, lines: dropLine(o.lines, id) }));
    setOpenId((cur) => (cur === id ? null : cur));
    // a series of deletions is ONE toast «Удалено позиций: N · Вернуть» (DS §15.2): while it is on screen, a new one adds to it
    const prev = deleted.current;
    const series = nextSeries(prev, !!prev && toast.showing(prev.toast), option.id, { line, index });
    const text = series.length === 1 ? t("est.row.deleted") : t("est2.row.deletedN", { n: series.length });
    const undo = localUndo(() => {
      deleted.current = null;
      setOption((o) => ({ ...o, lines: restoreDeleted(o.lines, series) }));
    });
    deleted.current = { toast: toast.show(text, undo, { grow: series.length > 1 ? prev?.toast : undefined }), optionId: option.id, items: series };
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
    const option = layoutOpt; // the shown layout: a move makes the auto groups the option's own
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
    const option = layoutOpt; // the shown layout: a move makes the auto groups the option's own
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
    const option = layoutOpt; // the shown layout: a move makes the auto groups the option's own
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
  /** «›» in «Кол-во» of a line that came from a template: the next one opens with the cursor in its «Кол-во» */
  const nextQty = (id: string) => {
    if (!leaveRow()) return;
    // the next one was deleted meanwhile: the row only closes
    if (!option.lines.some((l) => l.id === id)) return;
    setFocusRow({ id, field: "qty" });
    setOpenId(id);
  };
  const latest = useRef({ openRow, leaveRow, patchLine, rowAction, openInCatalog, sectionAction, nextQty, doMove });
  latest.current = { openRow, leaveRow, patchLine, rowAction, openInCatalog, sectionAction, nextQty, doMove };
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
      nextQty: (id) => latest.current.nextQty(id),
      // «⋯ → Выше / Ниже»: the same move as the sheet's «Выше» / «Ниже» (its «Вернуть»)
      shift: (id, dir) => latest.current.doMove(id, dir < 0 ? "__up__" : "__down__"),
    }),
    [],
  );
  // «Варианты для клиента» (DS §8.10): the copy goes after the open row is settled (a wrong row speaks and stays)
  const addOption = () => {
    if (doc.options.length >= MAX_OPTIONS) return void toast.show(t("est.var.max"));
    if (!leaveRow()) return;
    const id = option.id;
    const name = nextOptionName(doc.options);
    // the copy is made from the document as the settled row leaves it (a blank row gone, a catalog link on its line):
    // the updater runs after leaveRow's own, so `d` holds the settled option
    setDoc((d) => {
      if (d.options.length >= MAX_OPTIONS) return d;
      const from = d.options.find((o) => o.id === id);
      return from ? { ...d, options: [...d.options, cloneOption(from, name)] } : d;
    });
    setCur(doc.options.length);
    toast.show(t("est.var.copied", { name, from: option.name }));
  };
  const removeOption = () => {
    if (doc.options.length < 2) return;
    if (!leaveRow()) return;
    const id = option.id;
    const at = doc.options.findIndex((o) => o.id === id);
    // «Вернуть» puts back only this option at its place; the edits made since stay (DS §15.2)
    let removed: CustomOption | null = null;
    setDoc((d) => {
      const o = d.options.find((x) => x.id === id);
      if (!o || d.options.length < 2) return d;
      removed = o;
      return { ...d, options: withoutOption(d.options, id).options };
    });
    setCur(withoutOption(doc.options, id).cur);
    toast.show(t("est.var.deleted"), localUndo(() => {
      const back = removed;
      if (!back) return;
      setDoc((d) => {
        if (d.options.length >= MAX_OPTIONS || d.options.some((x) => x.id === back.id)) return d;
        const i = Math.min(at, d.options.length);
        return { ...d, options: [...d.options.slice(0, i), back, ...d.options.slice(i)] };
      });
      setCur(at);
    }));
  };
  /** «Из шаблона…» (the empty editor) and «⋯ → Добавить из шаблона…»: the open row settles first, then the list of templates */
  const openTemplates = () => {
    if (!leaveRow()) return;
    startInEditor.current = true;
    setPickOnly(true);
    setStartOpen(true);
  };
  /**
   * «Добавить из шаблона…» into a typed estimate (DS §8.13): only adds — the lines at the end, sections as sections, options by
   * number; «Добавлено позиций: N · Вернуть» takes out only what came (the edits since stay); «Кол-во» of the first that came
   */
  const addTemplate = (x: EstimateTemplate, typed: boolean) => {
    const r = fromTemplate(x.doc, db.catalog, x.costs ?? {}, keep, !!x.module);
    const a = appendTemplate(doc, r.doc, cur);
    const before = doc.options.length;
    setDoc(a.doc);
    setCheckPrice((ids) => [...ids, ...r.checkPrice]);
    setUnhiddenIds((ids) => [...ids, ...r.unhidden]);
    const n = a.added.lineIds.length;
    const words = [
      typed ? t("est.tplIn.added", { n }) : t("est.tpl.applied", { name: x.name }),
      // a line whose catalog item is gone came at the template's price: say so here too (code review)
      ...(r.checkPrice.length ? [t("est.tpl.checkPrice", { n: r.checkPrice.length })] : []),
      ...(a.added.skipped.length ? [t("est.tplIn.skipped", { names: a.added.skipped.join(", ") })] : []),
    ].join(" · ");
    if (!typed) {
      // nothing was typed: no «Вернуть» — nothing to give back but the template itself (DS §8.13); it names the estimate
      if (!templateId) setTemplateId(x.id);
      if (!title.trim()) setTitle(x.name);
      toast.show(words);
    } else
      toast.show(
        words,
        localUndo(() => {
          const gone = new Set(a.added.lineIds);
          setDoc((d) => removeAppended(d, a.added));
          setCur((c) => Math.min(c, Math.max(0, before - 1)));
          setQtyChain([]);
          setCheckPrice((ids) => ids.filter((x) => !gone.has(x)));
          setUnhiddenIds((ids) => ids.filter((x) => !gone.has(x)));
          setFocusRow((f) => (f && gone.has(f.id) ? null : f));
          setOpenId((o) => (o && gone.has(o) ? null : o));
        }),
      );
    focusChain(a.added.chain);
  };
  const pickOption = (id: string) => {
    const i = doc.options.findIndex((o) => o.id === id);
    if (i < 0 || i === cur || !leaveRow()) return;
    setCur(i);
  };
  const setRecommended = (id: string, on: boolean) => setDoc((d) => ({ ...d, options: recommend(d.options, id, on) }));
  const renameOption = (name: string) => setOption((o) => ({ ...o, name }));
  /** «Экран для клиента» (DS §8.3): cost, profit, the spend of hidden lines and «Только для вас» go from the screen */
  const [clientScreen, setClientScreen] = useState(false);
  /** «Итого ˅» of the phone's panel: open or folded (the screen's own state, not remembered) */
  const [totalOpen, setTotalOpen] = useState(false);
  /** a folded line asked to show its menu (SortableList onHoldStill): its id and a counter, each ask opens it once */
  const [menuAsk, setMenuAsk] = useState<{ id: string; n: number }>({ id: "", n: 0 });
  const totalRows = totalsRows({ totals, allOptional, own: seeCosts && !clientScreen, costKnown: costComplete(option) });
  const toggleClientScreen = (on: boolean) => {
    setClientScreen(on);
    toast.show(t(on ? "est.client.onToast" : "est.client.offToast"));
  };

  // #1138: a tech saves a new estimate only where the server lets him (estimates_insert — a property he works at)
  // a signed estimate: its rows do not open (DS §8.3)
  // one rule with the card, /p/ and the PDF: a signature on it, or a status after signing (review of #1376)
  const signed = isSignedEstimate(existing);
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
    const next = editedTemplate(live, tplDoc, keep, name);
    if (!next) {
      toast.show(t("est.tpl.cannot"));
      return;
    }
    // the server checks the same: over the version this screen opened on, else «не сохранено» (row_version_conflict)
    const catalogUndos = writeCatalog(settled.newItems);
    const undo = store.saveEstimateTemplate(next, { baseRowVersion: tplEdit.rowVersion, clearCosts: clearedCosts(live, tplDoc, keep) });
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
  const view = useMemo(() => withLooseTarget(viewRows(layoutOpt, new Set(holdSection ? [...collapsedIds, holdSection] : collapsedIds)), !!lifted?.startsWith("l:")), [layoutOpt, collapsedIds, holdSection, lifted]);
  // the first line on the list: the swipe hint plays on it
  const firstLineId = view.find((r): r is Extract<typeof r, { type: "line" }> => r.type === "line")?.line.id;
  const secTotals = useMemo(() => sectionSubtotals(layoutOpt, s), [layoutOpt, s]);
  const totalById = new Map(act.map((l, i) => [l.id, totals.lineTotals[i] ?? 0] as const));
  const taxValue = !s.tax.enabled ? t("ue.off") : partialTax ? `${ppmToPctText(taxRatePpm(s.tax))}% · ${t("ue.taxPartialShort")}` : `${ppmToPctText(taxRatePpm(s.tax))}%`;
  const discValue = !s.discount ? t("ue.add") : s.discount.kind === "pct" ? `${discountBps(s.discount.value) / 100}%` : money(s.discount.cents);
  const depValue = s.deposit.kind === "none" ? t("ue.none") : s.deposit.kind === "pct" ? `${s.deposit.bps / 100}% · ${money(totals.deposit)}` : money(totals.deposit);

  /** sending is the office's (#1113): «Сохранить и отправить» is in «⋯» — the bar's one step is «Готово» (BUILD-SPEC §2.7, LAYOUT-RULES П3) */
  const canSend = canSeeClientLink(store.role);
  // «сохранено 8:19» (visual v2 №5): the version's own save mark; another day — the day
  // (an estimate saved before the mark existed: the time it was sent — the type's own fallback)
  const savedIso = existing?.doc?.savedAt ?? existing?.savedAt ?? existing?.sentAt;
  // #2363 F46 (founder 21.11): «сохранено 8:19» today, «сохранено вчера» the day before, else «сохранено пт, 19 нояб.» — no «позавчера»
  // #2363 F33: saved after it went to the client — the client has not seen these edits
  const changedAfterSend = !!existing && existing.status !== "draft" && !!existing.sentAt && !!savedIso && savedIso > existing.sentAt;
  const savedWord = savedIso
    ? t("px3.est.saved", { time: dayKeyIn(savedIso) === todayKey() ? time(savedIso) : dayOffsetOf(dayKeyIn(savedIso)) === -1 ? t("proto.client.yesterday").toLocaleLowerCase() : day(savedIso) })
    : undefined;
  // the pinned bar's ONE main step (direction 20.11 §3, the founder 21.11 #2350: «большая кнопка всегда светится, перекрывает» —
  // so one compact row «Итого ˅ $… · кнопка по словам»): no line yet — «Добавить позицию» (the price list when there is one, else
  // a line of its own); lines — «Готово» (saves and opens the estimate: send, sign, deposit are there). Always active: a press with
  // something missing says what (DS §11 п.3).
  const firstLine = !signed && !hasContent(doc);
  const addFirst = () => (db.catalog.length ? openCatalog() : addNew());
  const step: MainAction = firstLine ? { label: t("ue.addItem"), onPress: addFirst, testID: "est-bar-add" } : { label: t("proto.est.done"), onPress: () => save(false), testID: "ue-save" };
  // «Итого ˅ $…» (DS §8.9, #1362): a press opens what the total is made of (a sheet over the bar, not a plate growing under the thumb)
  // visual v2 №5: «Итого ⌄ $772.36 налог $14.52» — the sum with cents (the engine's fmtUsd), the tax after it when there is one
  const total = { label: t("ue.total"), value: rowSum(totals.total), sub: totals.tax ? t("px3.est.tax", { sum: rowSum(totals.tax) }) : undefined, onPress: () => setTotalOpen((o) => !o), open: totalOpen, testID: "est-bar-total" };
  // where the screen has no pinned bar (820/1280) the same row stands after the totals (as EditorScreen does)
  const barShown = useFooterShown();
  // (there the totals card says «Итого» already — the row is the button only, П7)
  const stepRow = tplEdit ? null : <MainStep placement="bar" main={step} total={barShown ? total : null} />;
  /** «слои» (visual v2 №5): the sections and the options of the list */
  const layerItems = [
    ...(!signed ? [{ key: "section", label: t("est.sec.addSectionMenu"), icon: "plus" as const, testID: "est-add-section" }] : []),
    ...(!signed && !tplEdit && doc.options.length < MAX_OPTIONS ? [{ key: "option", label: t("est.var.add"), icon: "copy" as const, testID: "est-add-option" }] : []),
    ...(!signed && option.lines.length ? [{ key: "layout", label: t("est.sec.layout"), icon: "menu" as const, testID: "est-layers-layout" }] : []),
  ];
  const onAdd = (k: string) => {
    if (k === "new") addNew();
    else if (k === "catalog") openCatalog();
    else if (k === "template") openTemplates();
    else if (k === "option") addOption();
    else if (k === "section") addSectionBtn();
    else if (k === "layout") layoutBtn();
  };
  /** «⋯» of the editor: rare things — send now, the layout of the list, how the rows read, the client's screen */
  const moreList = [
    ...(canSend ? [{ key: "send", label: t("proto.est.saveSend"), icon: "send" as const, testID: "ue-save-send" }] : []),
    ...(!signed && option.lines.length ? [{ key: "layout", label: t("est.sec.layout"), icon: "menu" as const, testID: "est-group-by-kind" }] : []),
    ...(option.lines.length ? [{ key: "rows", label: t("proto.est.rowsFull"), icon: "menu" as const, selected: rowLook === "full", testID: "est-row-view" }] : []),
    { key: "client", label: t("est.client.on"), icon: "eye" as const, selected: clientScreen, testID: "est-menu-client" },
  ];
  const onMore = (k: string) => {
    if (k === "send") save(true);
    else if (k === "layout") layoutBtn();
    else if (k === "rows") setRowLook(rowLook === "full" ? "brief" : "full");
    else toggleClientScreen(!clientScreen);
  };

  return (
    <Screen onScrollBegin={() => {
      swipes.closeOpen();
      // the finger that starts this scroll went down a moment ago; an older touch (a tap on a field) does not count
      const inOpen = Date.now() - touchInOpen.current < motion.durSlow * 3;
      touchInOpen.current = 0;
      // the page scrolls from a finger on the open row (to its lower fields): the row stays open; anywhere else it folds
      if (!inOpen) void leaveRow(true);
    }}
      // the Editor template's places (EditorScreen keeps no `onScrollBegin` — the open row must fold on a scroll, DS §8.3: the screen
      // stands them itself): «‹» left, «⋯» the last on the right, the step pinned at the bottom in one compact row
      testID="estimate-editor"
      // the one header's editor kind (visual-v2 «Редактор»): «×» · «Смета EST-0006» + the state line («Черновик сохраняется сам · Демо») · «⋯»
      head={{ kind: "editor" }}
      title={tplEdit ? t("est.tpl.editTitle") : existing ? [t("ue.title"), existing.number].filter(Boolean).join(" ") : t("ue.newTitle")}
      // visual v2 №5: «Черновик · сохранено 8:19» (the version's own save time), «Демо» joins it in the header; no «?» by the title
      subtitle={tplEdit ? undefined : existing ? [t(estimateStatusView(existing.status).l), changedAfterSend ? t("r1.est.changedAfterSend") : null, savedWord].filter(Boolean).join(" · ") : t("proto.est.autosave")}
      back={back}
      hintKey="estimate-builder"
      right={tplEdit ? undefined : <MoreButton items={moreList} onMore={onMore} a11y={t("est.actions")} testID="est-menu" />}
      footer={barShown && stepRow ? stepRow : undefined}
    >
      <RevealOnTick tick={revealTick} target={missing === "client" ? clientRef : linesRef} />
      {clientScreen ? (
        <View testID="est-client-off" style={{ alignSelf: "flex-start" }}>
          <Button label={t("est.client.off")} icon="eye" variant="secondary" size="sm" onPress={() => toggleClientScreen(false)} />
        </View>
      ) : null}
      {/* #2363 F33: no line over the estimate that pushes everything down — the header line says «изменена после отправки» */}
      {draft ? (
        <View testID="est-draft">
          {/* a hint in one line, the way out beside it (not a card) */}
          <RowView>
            <Icon name="note" s={size.iconSm} />
            <T v="caption" tone="mut" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
              {t("proto.est.draftBack")}
            </T>
            <View testID="est-draft-restart">
              <Button label={t("est.draft.restart")} variant="ghost" size="sm" onPress={() => setAskRestart(true)} />
            </View>
          </RowView>
        </View>
      ) : null}
      <Grid>
        <View style={{ gap: space[3] }}>
          {tplEdit ? (
            <View testID="est-tpl-editing">
              <T v="caption" tone="mut">{t("est.tpl.editHint")}</T>
            </View>
          ) : (
          <View ref={clientRef} collapsable={false} style={{ gap: space[1] }} testID="est-client">
          {/* visual v2 №5: «LA Linda Alvarez / 2207 Ocean Park Blvd, Santa Monica ›» — the row card «цифры справа» with the pastel initials */}
          <FigureRow
            testID="est-client-card"
            title={customer?.name ?? t("ue.pickClient")}
            line={property ? [property.address, property.city.split(",")[0]].filter(Boolean).join(", ") : undefined}
            avatar={customer ? { initials: initials(customer.name), name: customer.name } : undefined}
            icon={customer ? undefined : "user"}
            tone={missing === "client" ? "warn" : undefined}
            onPress={() => setClientPicker(true)}
          />
          {missing === "client" ? <FieldError text={t("ue.pickClient")} testID="ue-missing-client" /> : null}
          </View>
          )}
          <View testID="ue-title">
            {/* the label over the field (LAYOUT-RULES «Редактор»): «Название» */}
            <Labeled label={tplEdit ? t("est.tpl.name") : t("proto.est.titleLabel")}>
              <TextField plate type="title" value={title} onChangeText={setTitle} placeholder={tplEdit ? t("est.tpl.name") : t("ue.jobTitle")} />
            </Labeled>
          </View>

          {/* one option: nothing to choose — «Вариант» is in «＋» of the lines; several: the segments and their totals (DS §8.10) */}
          {doc.options.length > 1 ? (
          <OptionsCard
            options={doc.options}
            curId={option.id}
            totals={optionSums}
            locked={signed}
            clientScreen={clientScreen}
            onPick={pickOption}
            onCopy={addOption}
            onRecommend={setRecommended}
            onRename={renameOption}
            onDelete={removeOption}
          />
          ) : null}

          {/* «Позиции · 7» and ONE «＋» (wireframes-v2 №9): the ways to add are its menu; «Кратко / Подробно» is in «⋯» */}
          {/* visual v2 №5: «Позиции  7» and the round 32 on the right — the catalog (the measured things), sections and options,
              a template, «＋» a new line (the ways to add as buttons, not a menu: one press each) */}
          <View testID="est-items-head" style={{ marginTop: space[3] }}>
          <RowView gap={space[2]}>
            <T v="heading" numberOfLines={1}>
              {t("ue.items")}
            </T>
            {act.length ? <CountPill n={act.length} testID="est-items-count" /> : null}
            <View style={{ flex: 1 }} />
            {signed ? null : (
              <>
                {/* #2363 (founder 21.11): «＋» first — a new line is the commonest; then the catalog, the sections, a template */}
                <View testID="est-add-new">
                  <IconButton size="card" icon="plus" label={t("px3.est.newLine")} onPress={() => addNew()} />
                </View>
                <View testID="est-add-catalog">
                  <IconButton size="card" icon="catalog" label={t("px3.est.fromCatalog")} onPress={openCatalog} />
                </View>
                <MenuIcon icon="layers" label={t("px3.est.layout")} items={layerItems} onSelect={onAdd} testID="est-add-layers" />
                {!tplEdit ? (
                  <View testID={hasContent(doc) ? "est-menu-template" : "est-from-template"}>
                    <IconButton size="card" icon="doc" label={t("px3.est.template")} onPress={openTemplates} />
                  </View>
                ) : null}
              </>
            )}
          </RowView>
          </View>
          <View ref={linesRef} collapsable={false} style={{ gap: space[1] }}>
          {option.lines.length === 0 ? (
              // #2363 (founder 21.11: «Позиций пока нет — блок некрасивый»): DS §13 «Пусто — данных нет вообще» — the object's icon,
              // the words, one line why, and the two ways to add (secondary: the screen's main action is the bar below)
              <Empty
                testID="est-empty"
                icon="estimate"
                title={t("est.row.empty")}
                hint={signed ? undefined : t("r1.est.emptyHint")}
                action={signed ? undefined : (
                  <RowView gap={space[2]} style={{ flexWrap: "wrap", justifyContent: "center" }}>
                    <View testID="est-empty-new">
                      <Button label={t("px3.est.newLine")} icon="plus" variant="secondary" onPress={() => addNew()} />
                    </View>
                    <View testID="est-empty-catalog">
                      <Button label={t("px3.est.fromCatalog")} icon="catalog" variant="secondary" onPress={openCatalog} />
                    </View>
                  </RowView>
                )}
              />
            ) : null}
          {/* the lines' card only when there are lines: the empty state is its own card, never a card in a card */}
          <Card style={{ paddingVertical: 0, paddingHorizontal: space[3] + spaceHalf.hair, gap: 0, ...(option.lines.length === 0 ? { display: "none" } : null), ...(missing === "lines" ? { borderColor: c.status.bad.fill } : null) }}>
            <SortableList
              rows={view}
              openKey={openId ? `l:${openId}` : renamingId ? `s:${renamingId}` : null}
              locked={signed}
              onDrop={dropRow}
              onHold={setHoldSection}
              onLift={setLifted}
              // the open row folds first (the whole list folds): a wrong one stays, says why (the errors, the scroll) and the drag does
              // not start — never silently (code review of «б»)
              beforeBegin={() => leaveRow(false)}
              // visual v2 №5: folded lines without «≡» (taken by their body); a finger's hold let go in place opens the row's menu
              quietLines
              onHoldStill={(k) => setMenuAsk((m) => ({ id: k.replace(/^l:/, ""), n: m.n + 1 }))}
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
                    clientScreen={clientScreen}
                    qtyNext={qtyChain.includes(r.line.id) ? qtyChain[qtyChain.indexOf(r.line.id) + 1] : undefined}
                    form={rowForm}
                    api={rowApi}
                    locked={signed}
                    noHide={!!tplEdit}
                    unhiddenMark={unhiddenIds.includes(r.line.id)}
                    catalog={openId === r.line.id && store.role !== "tech" ? catalogStateOf(r.line) : undefined}
                    autoFocus={focusRow?.id === r.line.id ? focusRow.field : undefined}
                    checkPrice={checkPrice.includes(r.line.id)}
                    view={lifted ? "brief" : rowLook}
                    swipeHint={!hintDone && !signed && !lifted && !!swipeHint.state && swipeHintDue(swipeHint.state, reduceMotion) && r.line.id === firstLineId}
                    onSwipeHintPlayed={onHintPlayed}
                    onTouchOpen={openId === r.line.id ? markTouchInOpen : undefined}
                    menuAsk={menuAsk.id === r.line.id ? menuAsk.n : 0}
                  />
                </View>
              )
              }
            />
          </Card>
          {missing === "lines" ? <FieldError text={t("ue.empty")} testID="ue-missing-lines" /> : null}
          </View>
        </View>

        <View style={{ gap: space[3] }}>
          <Card>
            <SumRow label={t("ue.subtotal")} value={money(totals.subtotal)} />
            <Divider />
            <SumRow label={t("ue.discount")} value={totals.discount ? `−${money(totals.discount)}` : discValue} onPress={signed ? undefined : () => setSetting("discount")} />
            <Divider />
            <SumRow label={t("ue.tax")} value={totals.tax ? `${money(totals.tax)} · ${taxValue}` : taxValue} onPress={signed ? undefined : () => setSetting("tax")} />
            <Divider />
            {/* the total once (П7): in the pinned bar on a phone, here only where there is no bar (820/1280) */}
            {barShown ? null : (
              <>
                <RowView style={{ justifyContent: "space-between", minHeight: size.hitMin }}>
                  <T v="title">{t("ue.total")}</T>
                  <T v="display" tabular>
                    {money(totals.total)}
                  </T>
                </RowView>
                <Divider />
              </>
            )}
            <SumRow label={t("ue.deposit")} value={depValue} onPress={signed ? undefined : () => setSetting("deposit")} testID="est-deposit-row" />
            {totals.depositOverCaLimit ? <CaWarn limitCents={totals.caDepositLimit} testID="est-ca-warn" /> : null}
            {/* the same as «Итого ˅» of the phone's panel: «если клиент включит всё на выбор» and «Только для вас» (DS §8.9) */}
            {/* from 820 (no panel): the same «если включит» and «Только для вас» here; a phone has them in the panel's «Итого ˅» */}
            {wide && (totalRows.client.some((r) => r.key === "ifAll") || totalRows.own.length) ? (
              <>
                <Divider />
                <TotalsBreakdown client={totalRows.client.filter((r) => r.key === "ifAll")} own={totalRows.own} testID="est-card-breakdown" />
              </>
            ) : null}
          </Card>
          <NotesTerms
            doc={doc}
            company={db.company}
            lang={docLanguageFor(db, { customerId, leadId: leadOf })}
            onNote={(v: string) => setDoc((d) => ({ ...d, note: v }))}
            onTerms={(v: string) => setDoc((d) => ({ ...d, terms: v }))}
            noTerms={!!tplEdit}
            locked={signed}
            signed={signed}
          />
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
              {/* the tech saves; the office sends (#1113, DS §8.9) */}
              {canSend ? null : <View testID="est-bar-office"><T v="caption" tone="mut" numberOfLines={1}>{t("est2.bar.officeSends")}</T></View>}
              {/* a phone: the step is the pinned bar (Screen footer); from 820 — here, in the column of the totals */}
              {barShown ? null : stepRow}
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
            .map((x) => ({ key: x.id, label: x.name, subtitle: `${t(kindLabel(x.kind))} · ${money(itemPrice(x, db.catalog))} / ${x.unit}` })),
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
                <View testID="est-deposit-pct">
                  <PctField bps={s.deposit.bps} onChange={(b) => setSettings({ deposit: { kind: "pct", bps: Math.min(b, 10000) } })} />
                </View>
              ) : s.deposit.kind === "fixed" ? (
                <MoneyField cents={s.deposit.cents} onChange={(c) => setSettings({ deposit: { kind: "fixed", cents: c } })} />
              ) : null}
              <SumRow label={t("ue.deposit")} value={money(totals.deposit)} />
              {totals.depositOverCaLimit ? <CaWarn limitCents={totals.caDepositLimit} testID="est-ca-warn-sheet" /> : null}
            </>
          ) : null}
          {/* the sheet only closes: quiet — the screen's one yellow is «Готово» of the bar (oneAccent) */}
          <Button label={t("common.gotIt")} icon="check" variant="secondary" full onPress={() => setSetting(null)} />
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
      <Sheet
        visible={startOpen}
        onClose={() => start(null)}
        title={t("est.tpl.start")}
        onExited={() => {
          const next = afterStart.current;
          afterStart.current = null;
          // two frames on: the web gives the focus back to what opened the sheet («⋯», «Из шаблона…») right after it is gone —
          // the row opened before that would lose the cursor in «Кол-во»
          if (next) requestAnimationFrame(() => requestAnimationFrame(next));
        }}
      >
        <View testID="est-start" style={{ gap: space[1] }}>
          {pickOnly ? null : (
            <View testID="est-start-blank">
              <ListRow title={t("est.tpl.blank")} subtitle={t("est.tpl.blankHint")} left={<Icon name="plus" />} onPress={() => start(null)} />
            </View>
          )}
          {/* asked for templates and there are none: say how one is made (DS §8.13, §13) */}
          {pickOnly && !templates.length ? <Empty icon="doc" title={t("est.tpl.empty")} hint={t("est.tpl.emptyHint")} testID="est-start-none" /> : null}
          {templates.map((x, i) => (
            <View key={x.id} testID={`est-start-${x.id}`}>
              {pickOnly && i === 0 ? null : <Divider />}
              <ListRow
                title={x.name}
                subtitle={`${t("est.tpl.options", { n: x.doc.options.length })} · ${t("est.tpl.from", { sum: money(templateFromCents(x.doc, db.catalog)) })}`}
                left={<Icon name="doc" />}
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
          // a new estimate: Terms nobody touched follow the new client's language; an edited text stays (spec 40 §4)
          // (a draft saved before too — spec 40 §2.5, map S5: Terms of a draft follow its client; a sent one keeps its text)
          if ((!existing || existing.status === "draft") && !tplEdit && cid !== customerId && doc.terms !== undefined)
            setDoc((d) => ({ ...d, terms: store.estimateTermsOnClientChange(d.terms, { from: { customerId, leadId: leadOf }, to: { customerId: cid, leadId: leadOf } }) }));
          setCustomerId(cid);
          setPropertyId(pid);
          setClientPicker(false);
        }}
        onExited={() => {
          const next = afterClient.current;
          afterClient.current = null;
          // two frames on, as after «С чего начать?»: the web gives the focus back to the opener right after a sheet is gone
          if (next) requestAnimationFrame(() => requestAnimationFrame(next));
        }}
      />
      {/* «Итого ˅» of the bar: what the total is made of — «если клиент включит всё на выбор», «Только для вас» (DS §8.9, #1362) */}
      <Sheet visible={totalOpen && !tplEdit} onClose={() => setTotalOpen(false)} title={`${t("ue.total")} ${money(totals.total)}`}>
        <TotalsBreakdown panel client={totalRows.client.filter((r) => r.key !== "total")} own={totalRows.own} testID="est-bar-breakdown" />
      </Sheet>
    </Screen>
  );
}

function SumRow({ label, value, onPress, testID }: { label: string; value: string; onPress?: () => void; testID?: string }) {
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
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={label} testID={testID}>
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

/** a round 32 of a card that opens a Menu at itself (visual v2 №5 «слои»): IconButton + Menu of src/ui */
function MenuIcon({ icon, label, items, onSelect, testID }: { icon: IconKey; label: string; items: MenuItem<string>[]; onSelect: (k: string) => void; testID: string }) {
  const ref = useRef<ComponentRef<typeof View>>(null);
  const [at, setAt] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  if (!items.length) return null;
  return (
    <View ref={ref} collapsable={false} testID={testID}>
      <IconButton size="card" icon={icon} label={label} onPress={() => ref.current?.measureInWindow((x: number, y: number, w: number, h: number) => setAt({ x, y, w, h }))} />
      <Menu visible={!!at} anchor={at} items={items} onSelect={onSelect} onClose={() => setAt(null)} />
    </View>
  );
}
