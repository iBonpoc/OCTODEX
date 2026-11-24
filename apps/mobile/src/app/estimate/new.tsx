import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { canSeeClientLink } from "@/features/estimateSign";
import { View, type ViewStyle } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { haptics } from "@/ui/haptics";
import { component, motion, radius, rhythm, space, spaceHalf, size } from "@octo/design-tokens";
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
import { autoGroups, canAddSection, addSection, deleteSection, foldForDrag, layoutByKind, moveLine, moveSection, putBack, layoutUndo, renameSection, sameLayout, shiftLine, viewRows, type Opt } from "@/features/sectionLayout";
import { applyPatch, catalogOffer, clearLine, settleOpenRow, dropLine, duplicateLine, isBlank, isHidden, leaveDecision, nextSeries, replaceLine, restoreDeleted, type DeleteSeries, restoreLine, rowProblems, setHidden } from "@/features/estimateRows";
import { FieldError, useRequiredForm, useScreenScroll } from "@/ui/requiredForm";
import { MainStep } from "@/ui/mainStep";
import { CreateButton, MoreButton } from "@/ui/templates/parts";
import type { MainAction } from "@/ui/templates";
import { estimateStatusView } from "@/features/estimateStatus";
import { useReducedMotion } from "react-native-reanimated";
import { useDevice, useTheme } from "@/theme/ThemeProvider";
import { PickerSheet } from "@/ui/pickerSheet";
import { Labeled, MoneyField, PctField, RatePctField } from "@/features/fields";
import { MONEY_MODES, TAX_MODES, depositFor, depositMode, discountFor, discountMode, remember, type ModeMemo, type TotalsMode } from "@/features/estimate/totalsModes";
import { ModeRow } from "@/ui/modeRow";
import { isPartialTax, lastTaxRatePpm, taxChange, wholeTax, type TaxDiff } from "@/features/estimateTax";
import { Button, IconButton, StatusChip, TextField } from "@/ui/controls";
import { CountPill, FigureRow } from "@/ui/figures";
import type { IconKey } from "@/ui/primitives";
import { dayKeyIn } from "@/features/zone";
import { dayOffsetOf, todayKey } from "@/features/calendar";
import { GroupHead, GroupRow, ListGroup, useGroupEdge } from "@/ui/groupedList";
import { foldStart, foldStep, type FoldState } from "@/ui/totalFold";
import { ButtonPair } from "@/ui/pairs";
import { useDayWord } from "@/features/useDayWord";
import { Icon, Press, T } from "@/ui/primitives";
import { HelpButton, Menu, Sheet, useToast, type MenuItem } from "@/ui/overlays";
import { Card, Divider, Empty, Grid, ListRow, RowView, Screen, SectionTitle, useFooterShown } from "@/ui/surfaces";
import { draftCtx, draftSnapshot, draftsKey, findDraft, isEditCtx, nextDrafts, removeDraft, restoreDraftOnDevice, useDraftEditorOpen, useEstimateDrafts, type EstimateDraft } from "@/features/estimateDraft";
import { useConfirm } from "@/ui/confirmDialog";
import { doneAction, gateAtOpen, gateBeforeSave, markOf, takeMine } from "@/features/estimate/editSession";
import { useAuth } from "@/cloud/auth";
import { NO_UNDO, localUndo, withAfter } from "@/data/undo";
import { StatusNote } from "@/ui/statusNote";

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
  // #2381 review 4: while an editor is open it owns the drafts list — a draft put back by an undo waits until it closes
  useDraftEditorOpen();
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
  // #2381: a saved estimate's edit found on the phone (the app closed by chance, «×» left them): the screen opens ON the edits
  const fromEdit = existing && draft && isEditCtx(ctx) ? draft : undefined;
  const [customerId, setCustomerId] = useState(fromEdit?.customerId ?? existing?.customerId ?? draft?.customerId ?? params.customerId);
  const [propertyId, setPropertyId] = useState(fromEdit?.propertyId ?? existing?.propertyId ?? draft?.propertyId ?? params.propertyId);
  /** #2381: the estimate's `savedAt` when its edit began (kept in the draft): the conflict is «the store's savedAt ≠ this» */
  const [baseSavedAt, setBaseSavedAt] = useState<string | undefined>(() => (existing ? (fromEdit ? fromEdit.baseSavedAt : markOf(existing)) : undefined));
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
        fromEdit
        ? (JSON.parse(JSON.stringify(fromEdit.doc)) as EstimateDoc)
        : existing.doc ? (JSON.parse(JSON.stringify(existing.doc)) as EstimateDoc) : newDoc(db.company?.estimate.depositBps)
      : tplEdit
        ? templateForEdit(tplEdit, keep)
        : withNewTerms(draft?.doc ?? fromTpl?.doc ?? newDoc(db.company?.estimate.depositBps), draft?.customerId ?? params.customerId),
  );
  const [title, setTitle] = useState(fromEdit ? fromEdit.title : existing?.doc ? existing.title : draft?.title ?? tplEdit?.name ?? given?.name ?? "");
  const [cur, setCur] = useState(() => Math.max(0, doc.options.findIndex((o) => o.recommended)));
  // the open row of the list (DS §8.3: one open; it closes and keeps what is typed when another opens, «Новая позиция»,
  // «Из каталога», a finger starts to scroll or the estimate is saved); the focus it takes when it opens
  const [openId, setOpenId] = useState<string | null>(null);
  // «Кратко / Подробно» of the folded rows — the device remembers it (DS §8.3)
  const [rowLook, setRowLook] = useRowView();
  const groupEdge = useGroupEdge();
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
  const [clientPicker, setClientPicker] = useState(!customerId && !startOpen && !tplEdit && !draft);
  // every CHANGE of a new estimate is kept on the phone; opening it (a template's lines and name) is not a change
  // (#859 №1); nothing worth keeping — no draft (#760)
  const keyOfDrafts = drafts.key;
  const setDrafts = drafts.setList;
  const held = { estimateId, customerId, propertyId, title, doc, templateId, checkPrice, wantCatalog };
  const [opened, setOpened] = useState(() => ({ snapshot: draftSnapshot(held), restored: !!draft }));
  useEffect(() => {
    if (!ctx) return;
    const d: EstimateDraft = { ctx, at: new Date().toISOString(), estimateId, customerId, propertyId, title, doc, templateId, checkPrice, wantCatalog, ...(isEditCtx(ctx) ? { baseSavedAt } : {}) };
    setDrafts((list) => nextDrafts(list, d, opened, Date.now()), keyOfDrafts);
  }, [ctx, estimateId, customerId, propertyId, title, doc, templateId, checkPrice, wantCatalog, opened, setDrafts, keyOfDrafts, baseSavedAt]);
  /** #2381: there are edits not saved («Отменить» shows only then — founder 21.11): this place's draft is on the phone */
  const dirty = !!ctx && !tplEdit && drafts.list.some((x) => x.ctx === ctx);
  const [dialog, ask] = useConfirm();
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
  // the totals' switch «% · Выкл. · $» (DS §8.7а); a value turned off reads «—»
  const modeLabel = (k: TotalsMode) => ({ key: k, label: k === "pct" ? "%" : k === "fixed" ? "$" : t("ue.off") });
  const moneyModes = MONEY_MODES.map(modeLabel);
  const taxModes = TAX_MODES.map(modeLabel);
  const DASH = "—";
  // what «%» / «$» had before «Выкл.» in this editor (CRM review): back to it brings the value back
  const discMemo = useRef<ModeMemo<NonNullable<typeof s.discount>>>({});
  const depMemo = useRef<ModeMemo<DepositSetting>>({});
  // the field of the row whose «%» / «$» was just picked takes the focus, its text selected (one tap to typing)
  const [rowFocus, setRowFocus] = useState<{ row: string; n: number }>({ row: "", n: 0 });
  const focusTotals = (row: string, k: TotalsMode) => k !== "off" && setRowFocus((f) => ({ row, n: f.n + 1 }));
  const focusOf = (row: string) => (rowFocus.row === row ? rowFocus.n : undefined);
  const [badRate, setBadRate] = useState(false);
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
  // #2387 С2 — the lead's call (22.11: «А, капсула», as the founder chose in q72): scrolled down, «Итого» folds into the capsule;
  // at the page's end the whole card «Итого · Готово» again (foldStep with `max`) — the capsule never lies over the totals at rest
  const [fold, setFold] = useState<FoldState>(foldStart);
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
  /** #2381: the edit of a saved estimate as it was saved (theirs taken, or «Сбросить правки»): the screen shows the store's estimate */
  const resetToSaved = () => {
    const live = db.estimates.find((e) => e.id === estimateId);
    if (!live) return;
    const fresh = { estimateId, customerId: live.customerId, propertyId: live.propertyId, title: live.doc ? live.title : "", doc: live.doc ? (JSON.parse(JSON.stringify(live.doc)) as EstimateDoc) : newDoc(db.company?.estimate.depositBps), templateId: live.templateId, checkPrice: [] as string[] };
    dropDraft();
    setDraft(undefined);
    setOpened({ snapshot: draftSnapshot(fresh), restored: false });
    setBaseSavedAt(markOf(live));
    setDoc(fresh.doc);
    setCur(Math.max(0, fresh.doc.options.findIndex((o) => o.recommended)));
    setTitle(fresh.title);
    setCustomerId(fresh.customerId);
    setPropertyId(fresh.propertyId);
    setTemplateId(fresh.templateId);
    setCheckPrice([]);
    setWantCatalog([]);
  };
  /** Р2: «Оставить черновик» of a signed estimate — the screen shows the estimate AS SAVED (signed: its lines and total), the edits
   *  stay on the phone and the line says so; nothing of the draft is drawn as if it were the estimate */
  const [keptAside, setKeptAside] = useState(false);
  const keepAside = () => {
    const live = db.estimates.find((e) => e.id === estimateId);
    if (!live) return;
    const fresh = { estimateId, customerId: live.customerId, propertyId: live.propertyId, title: live.doc ? live.title : "", doc: live.doc ? (JSON.parse(JSON.stringify(live.doc)) as EstimateDoc) : newDoc(db.company?.estimate.depositBps), templateId: live.templateId, checkPrice: [] as string[] };
    // the draft list is not touched: «restored» keeps this place's draft as it is (nextDrafts)
    setOpened({ snapshot: draftSnapshot(fresh), restored: true });
    setKeptAside(true);
    setDoc(fresh.doc);
    setCur(Math.max(0, fresh.doc.options.findIndex((o) => o.recommended)));
    setTitle(fresh.title);
    setCustomerId(fresh.customerId);
    setPropertyId(fresh.propertyId);
    setTemplateId(fresh.templateId);
    // (Б-1 of review 3: every part of the held state as in the snapshot — a «проверить цену» or «в каталог» of the edit left on the
    // screen made the screen differ from the snapshot, and the draft was overwritten with the signed estimate)
    setCheckPrice([]);
    setWantCatalog([]);
    toast.show(t("k1.kept"));
  };
  /** Б-2 of review 3 (rule 5): «Сбросить правки» of an estimate kept aside — asked in the window first */
  const dropKept = async () => {
    const k = await ask({ title: t("k1.cancelQ"), text: t("k1.dropKeptText"), actions: [{ key: "back", label: t("k1.back"), tone: "cancel", testID: "k1-kept-reset-no" }, { key: "yes", label: t("k1.reset"), tone: "danger", testID: "k1-kept-reset-yes" }], testID: "k1-kept-reset-ask" });
    if (k !== "yes") return;
    dropDraft();
    setKeptAside(false);
  };
  /** «Отменить» (founder 21.11: «отменяет все мои действия» · «Отменить спрашивает подтверждение — да»): the window in the middle
   *  (DS Б3); yes — the edits on the phone go, the estimate stays as saved (a new one is not made), the screen closes */
  const cancelEdits = async () => {
    const k = await ask({
      title: t("k1.cancelQ"),
      text: existing ? t("k1.cancelText") : t("k1.cancelTextNew"),
      actions: [{ key: "back", label: t("k1.keepEditing"), tone: "cancel", testID: "k1-cancel-no" }, { key: "yes", label: t("k1.cancelYes"), tone: "danger", testID: "k1-cancel-yes" }],
      testID: "k1-cancel-ask",
    });
    if (k !== "yes") return;
    dropDraft();
    back();
  };
  /** «×» of a saved estimate with edits (founder 21.11: «когда выхожу, я могу их отменить»): save, take them back, or stay.
   *  A new estimate leaves as before — its draft waits on the phone (#760). */
  const close = async (proceed: () => void = back) => {
    if (!(existing && dirty)) return proceed();
    const k = await ask({
      title: t("k1.closeQ"),
      text: t("k1.closeText"),
      actions: [{ key: "save", label: t("proto.est.done"), tone: "primary", testID: "k1-close-save" }, { key: "drop", label: t("k1.cancelYes"), tone: "danger", testID: "k1-close-drop" }, { key: "back", label: t("k1.keepEditing"), tone: "cancel", testID: "k1-close-back" }],
      testID: "k1-close-ask",
    });
    if (k === "save") void save(false);
    else if (k === "drop") {
      dropDraft();
      proceed();
    }
  };
  /** «Сделать копию с правками» (#2381 §11 п.2): a NEW estimate from the edits — the same client and property, no lead (it is won),
   *  no template; the edit's draft goes only once the copy is in; «Отменить» on the toast takes the copy out and the draft back */
  const copyWithEdits = (clean: EstimateDoc, cust: { id: string; name: string }, prop: { id: string }) => {
    const id = uid();
    const was = drafts.list.find((x) => x.ctx === ctx);
    // Р8: the copy is a NEW estimate — the company's Terms in its client's language (termsForNew), not the signed one's
    const doc2: EstimateDoc = { ...clean, terms: store.estimateTerms({ customerId: cust.id }).text };
    const undo = store.saveEstimate({ id, customerId: cust.id, propertyId: prop.id, doc: doc2, title: title.trim() || estimateTitle(doc2, t("ue.title")) });
    if (undo === NO_UNDO) return void toast.show(t("k1.refused"));
    dropDraft();
    // the editor is closed by the time «Отменить» is pressed: the edit goes back to the device straight (not through this screen's list)
    toast.show(t("k1.copied"), withAfter(undo, () => void (was && restoreDraftOnDevice(keyOfDrafts, was))));
    router.replace(`/estimate/${id}`);
  };
  /** #2381: «Сохранено» is never said where the edits did not go in; the edits stay on the phone (spec §10–11, review 2) */
  const askSigned = async (clean: EstimateDoc, cust: { id: string; name: string }, prop: { id: string }) => {
    const k = await ask({ title: t("k1.signedQ"), text: t("k1.signedText"), actions: [{ key: "copy", label: t("k1.copy"), tone: "primary", testID: "k1-signed-copy" }, { key: "keep", label: t("k1.keepDraft"), tone: "cancel", testID: "k1-signed-keep" }], testID: "k1-signed-ask" });
    if (k === "copy") copyWithEdits(clean, cust, prop);
    else keepAside();
  };
  const askMissing = async (clean: EstimateDoc, cust: { id: string; name: string } | undefined, prop: { id: string } | undefined) => {
    const k = await ask({ title: t("k1.missingQ"), text: t("k1.missingText"), actions: [...(cust && prop ? [{ key: "copy", label: t("k1.copyNew"), tone: "primary" as const, testID: "k1-missing-copy" }] : []), { key: "reset", label: t("k1.reset"), tone: "danger", testID: "k1-missing-reset" }, { key: "back", label: t("k1.back"), tone: "cancel", testID: "k1-missing-back" }], testID: "k1-missing-ask" });
    if (k === "copy" && cust && prop) copyWithEdits(clean, cust, prop);
    else if (k === "reset") {
      dropDraft();
      back();
    }
  };
  /** what stands between «Готово» and the save — editSession.gateBeforeSave; "go" — save */
  const checkBeforeSave = async (clean: EstimateDoc, cust: { id: string; name: string }, prop: { id: string }, answered?: "await"): Promise<"go" | "stop"> => {
    const live = db.estimates.find((e) => e.id === estimateId);
    const g = gateBeforeSave({ isEdit: isEditCtx(ctx), live, base: baseSavedAt, dirty, storeLoaded: store.companyLoaded });
    // the question answered already («Сохранить и снять подпись» at the opening): not asked a second time (review 3)
    if (g === "go" || (g === "await" && answered === "await")) return "go";
    if (g === "wait") {
      toast.show(t("k1.wait"));
      return "stop";
    }
    if (g === "missing") {
      await askMissing(clean, cust, prop);
      return "stop";
    }
    if (g === "signed") {
      await askSigned(clean, cust, prop);
      return "stop";
    }
    if (g === "await") {
      const k = await ask({ title: t("k1.awaitQ"), text: t("k1.awaitText"), actions: [{ key: "save", label: t("k1.saveUnsign"), tone: "danger", testID: "k1-await-save" }, { key: "copy", label: t("k1.copy"), testID: "k1-await-copy" }, { key: "back", label: t("k1.back"), tone: "cancel", testID: "k1-await-back" }], testID: "k1-await-ask" });
      if (k === "copy") copyWithEdits(clean, cust, prop);
      return k === "save" ? "go" : "stop";
    }
    const k = await ask({ title: t("k1.conflictQ"), text: live?.savedAt ? t("k1.conflictText", { time: time(live.savedAt) }) : undefined, actions: [{ key: "mine", label: t("k1.mine"), tone: "primary", testID: "k1-conflict-mine" }, { key: "theirs", label: t("k1.theirs"), testID: "k1-conflict-theirs" }, { key: "back", label: t("k1.back"), tone: "cancel", testID: "k1-conflict-back" }], testID: "k1-conflict-ask" });
    if (k === "theirs") resetToSaved();
    // Р4: only «Мои правки» goes on; «Назад» and Esc stay with the edits, nothing saved
    return takeMine(k) ? "go" : "stop";
  };
  const save = async (send: boolean, answered?: "await") => {
    // Р1 (spec §4 п.2): a saved estimate with no edits — «Готово» only closes (nothing written: «sent» and its time stay); «Отправить»
    // goes to the send of the estimate as it is. An estimate kept aside (signed, «Оставить черновик») is shown as saved — closes too
    // stale: what a save would write differs from the saved document (the client became tax exempt since — e2e 72)
    const stale = !!existing?.doc && !!customer && JSON.stringify(exemptDoc(existing.doc, customer.taxExempt)) !== JSON.stringify(existing.doc);
    if (existing && (keptAside || doneAction({ existing: true, dirty, stale, status: existing.status }) === "close")) {
      if (send && canSeeClientLink(store.role)) return void router.replace(`/estimate/${estimateId}?send=1`);
      return void back();
    }
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
    const clean: EstimateDoc = exemptDoc({ ...docWith(settled.option), options: docWith(settled.option).options.map((o) => ({ ...o, lines: activeLines(o.lines).filter((l) => !isBlank(l)) })) }, customer.taxExempt);
    // #2381: signed meanwhile, or saved on another phone — asked first; nothing is lost («стоп» keeps the edits on the phone)
    if ((await checkBeforeSave(clean, customer, property, answered)) === "stop") {
      savingRef.current = false;
      return;
    }
    haptics.success();
    const catalogUndos = writeCatalog(settled.newItems);
    const undo = store.saveEstimate({
      id: estimateId, customerId: customer.id, propertyId: property.id, doc: clean, leadId: params.leadId, templateId,
      title: title.trim() || estimateTitle(clean, t("ue.title")),
    });
    // #2381 (review 1 №1): the store refused (signed, no right) — the edits stay on the phone, never «Сохранено»
    if (undo === NO_UNDO) {
      for (const u of catalogUndos) u();
      savingRef.current = false;
      return void toast.show(t("k1.refused"));
    }
    // saved: the store holds it now. «Отменить» on the toast takes the saved estimate back out of the store; the builder
    // is closed by then, so its content does not come back as a draft (#860)
    dropDraft();
    const saved = store.online ? t("ue.saved", { name: customer.name }) : t("offline.queued");
    // the estimate and its new price-list items: all of them go back or none (the director's 4th review Б2)
    toast.show(settled.newItems.length ? `${saved} · ${t("est.row.catalogAdded")}` : saved, store.undoTogether([...catalogUndos, undo]));
    router.replace(`/estimate/${estimateId}${send && canSeeClientLink(store.role) ? "?send=1" : ""}`);
  };

  /** #2381 §11 п.1: opened with the edits of an estimate that got signed meanwhile, saved on another phone or deleted — asked ONCE
   *  (the draft never hangs on for good); a store not loaded yet (Р5) — asked once it is */
  const askedAtOpen = useRef(false);
  useEffect(() => {
    if (askedAtOpen.current || !isEditCtx(ctx) || !draft) return;
    const live = db.estimates.find((e) => e.id === estimateId);
    const g = gateAtOpen({ hasEditDraft: true, live, base: draft.baseSavedAt, storeLoaded: store.companyLoaded });
    if (g === "wait") return; // the store comes: this runs again
    askedAtOpen.current = true;
    if (g === "go") return;
    const cust = db.customers.find((x) => x.id === customerId);
    const prop = db.properties.find((x) => x.id === propertyId);
    const clean = (): EstimateDoc => exemptDoc({ ...doc, options: doc.options.map((o) => ({ ...o, lines: activeLines(o.lines).filter((l) => !isBlank(l)) })) }, !!cust?.taxExempt);
    void (async () => {
      if (g === "missing") return void askMissing(clean(), cust, prop);
      if (g === "signed" || g === "await") {
        const k = await ask({
          title: g === "signed" ? t("k1.signedQ") : t("k1.awaitQ"),
          text: g === "signed" ? t("k1.signedText") : t("k1.awaitText"),
          actions: [
            ...(g === "await" ? [{ key: "save", label: t("k1.saveUnsign"), tone: "danger" as const, testID: "k1-open-unsign" }] : []),
            { key: "copy", label: t("k1.copy"), tone: "primary", testID: "k1-open-copy" },
            { key: "reset", label: t("k1.reset"), tone: g === "signed" ? "danger" : undefined, testID: "k1-open-reset" },
            { key: "keep", label: t("k1.keepDraft"), tone: "cancel", testID: "k1-open-keep" },
          ],
          testID: "k1-open-signed",
        });
        if (k === "reset") resetToSaved();
        else if (k === "copy" && cust && prop) copyWithEdits(clean(), cust, prop);
        else if (k === "save") void save(false, "await");
        else keepAside();
        return;
      }
      const k = await ask({
        title: t("k1.conflictQ"),
        text: live?.savedAt ? t("k1.conflictText", { time: time(live.savedAt) }) : undefined,
        actions: [{ key: "mine", label: t("k1.mine"), tone: "primary", testID: "k1-open-mine" }, { key: "theirs", label: t("k1.theirs"), testID: "k1-open-theirs" }],
        testID: "k1-open-conflict",
      });
      if (k === "theirs") resetToSaved();
      // mine: the edits go on, made over the version now in the store — «Готово» does not ask again for the same change
      else if (takeMine(k) && live) setBaseSavedAt(markOf(live));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.companyLoaded]);

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
  const view = useMemo(() => withLooseTarget(viewRows(layoutOpt, foldForDrag(layoutOpt, collapsedIds, holdSection)), !!lifted?.startsWith("l:")), [layoutOpt, collapsedIds, holdSection, lifted]);
  // the first line on the list: the swipe hint plays on it
  const firstLineId = view.find((r): r is Extract<typeof r, { type: "line" }> => r.type === "line")?.line.id;
  const secTotals = useMemo(() => sectionSubtotals(layoutOpt, s), [layoutOpt, s]);
  const hasGroups = (layoutOpt.sections ?? []).length > 0;
  const totalById = new Map(act.map((l, i) => [l.id, totals.lineTotals[i] ?? 0] as const));

  /** sending is the office's (#1113): «Сохранить и отправить» is in «⋯» — the bar's one step is «Готово» (BUILD-SPEC §2.7, LAYOUT-RULES П3) */
  const canSend = canSeeClientLink(store.role);
  // «сохранено 8:19» (visual v2 №5): the version's own save mark; another day — the day
  // (an estimate saved before the mark existed: the time it was sent — the type's own fallback)
  const savedIso = existing?.doc?.savedAt ?? existing?.savedAt ?? existing?.sentAt;
  const dw = useDayWord();
  // #2363 F46 (founder 21.11): «сохранено 8:19» today, «сохранено вчера» the day before, else «сохранено пт, 19 нояб.» — no «позавчера»
  // #2363 F33: saved after it went to the client — the client has not seen these edits
  const changedAfterSend = !!existing && existing.status !== "draft" && !!existing.sentAt && !!savedIso && savedIso > existing.sentAt;
  const savedWord = savedIso
    ? t("px3.est.saved", { time: dayKeyIn(savedIso) === todayKey() ? time(savedIso) : dw(savedIso, true) })
    : undefined;
  // the pinned bar's ONE main step (direction 20.11 §3, the founder 21.11 #2350: «большая кнопка всегда светится, перекрывает» —
  // so one compact row «Итого ˅ $… · кнопка по словам»): no line yet — «Добавить позицию» (the price list when there is one, else
  // a line of its own); lines — «Готово» (saves and opens the estimate: send, sign, deposit are there). Always active: a press with
  // something missing says what (DS §11 п.3).
  const firstLine = !signed && !hasContent(doc);
  const addFirst = () => (db.catalog.length ? openCatalog() : addNew());
  // #2387 (CRM review: «одни слова — два разных действия»): the empty estimate's step says what it does — «Из каталога» when there is one
  const step: MainAction = firstLine ? { label: db.catalog.length ? t("px3.est.fromCatalog") : t("px3.est.newLine"), onPress: addFirst, testID: "est-bar-add" } : { label: t("proto.est.done"), onPress: () => void save(false), testID: "ue-save" };
  // «Итого ˅ $…» (DS §8.9, #1362): a press opens what the total is made of (a sheet over the bar, not a plate growing under the thumb)
  // visual v2 №5: «Итого ⌄ $772.36 налог $14.52» — the sum with cents (the engine's fmtUsd), the tax after it when there is one
  // founder 21.11 (С5: «шторку убрать, разбор суммы только в карточке внизу», #2387): the bar's «Итого» is a figure, not a button —
  // the breakdown («если клиент включит всё», «Только для вас») is the totals card's, on every width
  const total = { label: t("ue.total"), value: rowSum(totals.total), sub: totals.tax ? t("px3.est.tax", { sum: rowSum(totals.tax) }) : undefined, testID: "est-bar-total" };
  // where the screen has no pinned bar (820/1280) the same row stands after the totals (as EditorScreen does)
  const barShown = useFooterShown();
  // (there the totals card says «Итого» already — the row is the button only, П7)
  // #2363 q72 (founder 21.11, вариант А): scrolled down, the «Итого» card folds into the capsule on the right; up 8 pt, the top, or a
  // tap opens it (ui/totalFold.ts). An open total panel («Итого ˅») never folds under the finger
  // #2381 (founder 21.11: «внизу „Готово“. И „Отменить“» · «Отменить видно, только когда есть правки — да»)
  const cancelStep: MainAction | null = dirty && !signed && !firstLine ? { label: t("k1.cancel"), onPress: () => void cancelEdits(), testID: "k1-cancel" } : null;
  const stepRow = tplEdit ? null : <MainStep placement="bar" main={step} aside={cancelStep} total={barShown ? total : null} folded={fold.folded && option.lines.length > 0} onUnfold={() => setFold({ folded: false, anchor: Number.MAX_SAFE_INTEGER })} foldAdd={signed ? undefined : { a11y: t("px3.est.newLine"), onPress: () => addNew(), testID: "est-fold-add" }} />;
  const onAdd = (k: string) => {
    if (k === "new") addNew();
    else if (k === "catalog") openCatalog();
    else if (k === "template") openTemplates();
    else if (k === "option") addOption();
    else if (k === "section") addSectionBtn();
    else if (k === "layout") layoutBtn();
  };
  // founder 23.11 (audit MAP wave 1 п.6, picture n09): the ways to add are four buttons over the lines, two by two — [«＋ Позиция» ·
  // «＋ Раздел»] / [«Каталог» · «Шаблон»] — one press each, no «˅» menu (a hidden way is not found); «＋ Вариант» is in «⋯»
  const addGrid = signed ? null : (
    <View testID="est-add-grid" style={{ gap: space[2], alignSelf: "stretch" }}>
      <ButtonPair
        main={{ label: t("est.row.addShort"), icon: "plus", variant: "secondary", accessibilityLabel: t("px3.est.newLine"), onPress: () => addNew() }}
        second={{ label: t("est2.add.section"), icon: "plus", variant: "secondary", accessibilityLabel: t("est.sec.addSectionMenu"), onPress: () => onAdd("section") }}
        ids={{ main: "est-add-new", second: "est-add-section" }}
      />
      <ButtonPair
        main={{ label: t("cat.title"), icon: "catalog", variant: "secondary", accessibilityLabel: t("px3.est.fromCatalog"), onPress: openCatalog }}
        second={tplEdit ? null : { label: t("px3.est.template"), icon: "template", variant: "secondary", accessibilityLabel: t("ds.rows.fromTemplate"), onPress: openTemplates }}
        ids={{ main: "est-add-catalog", second: "est-from-template" }}
      />
    </View>
  );
  /** «⋯» of the editor: rare things — send now, the layout of the list, how the rows read, the client's screen */
  const moreList = [
    // the same words as the header's round «Отправить» (CRM review: one action, one name); in «⋯» it stays for the empty
    // estimate too — pressed with no line it says what is missing (spec 308)
    ...(canSend ? [{ key: "send", label: existing && existing.status !== "draft" ? t("r1.est.sendChanges") : t("proto.est.saveSend"), icon: "send" as const, testID: "ue-save-send" }] : []),
    ...(!signed && option.lines.length ? [{ key: "layout", label: t("est.sec.layout"), icon: "menu" as const, testID: "est-group-by-kind" }] : []),
    // «＋ Вариант» (Good / Better / Best) — a rare way to add, in «⋯» (the four buttons over the lines are the common ones)
    ...(!signed && !tplEdit && doc.options.length < MAX_OPTIONS ? [{ key: "option", label: t("est.var.add"), icon: "copy" as const, testID: "est-add-option" }] : []),
    ...(option.lines.length ? [{ key: "rows", label: t("proto.est.rowsFull"), icon: "menu" as const, selected: rowLook === "full", testID: "est-row-view" }] : []),
    { key: "client", label: t("est.client.on"), icon: "eye" as const, selected: clientScreen, testID: "est-menu-client" },
  ];
  const onMore = (k: string) => {
    if (k === "send") void save(true);
    else if (k === "layout") layoutBtn();
    else if (k === "rows") setRowLook(rowLook === "full" ? "brief" : "full");
    else if (k === "option") addOption();
    else toggleClientScreen(!clientScreen);
  };

  return (
    <Screen onScrollY={(y, max) => setFold((f) => { if (lifted) return f; /* a row is carried: the bar under the finger never changes */ const n = foldStep(f, y, undefined, max); return n.folded === f.folded && n.anchor === f.anchor ? f : n; })} onScrollBegin={() => {
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
      onLeave={(proceed) => void close(proceed)}
      hintKey="estimate-builder"
      // founder 21.11 («5 открытых»: «Отправить — не внизу редактора, а вверху сметы… здесь работаем с позициями», #2379): the send is a
      // round 40 of the header before «⋯» (as «＋ · ⋯» of every header); the bottom keeps the lines' buttons and «Итого / Готово»
      right={tplEdit ? undefined : (
        <RowView gap={space[2]}>
          {canSend && !signed && option.lines.length > 0 ? (
            <View testID="est-send-top">
              <IconButton icon="send" label={existing && existing.status !== "draft" ? t("r1.est.sendChanges") : t("proto.est.saveSend")} onPress={() => void save(true)} />
            </View>
          ) : null}
          <MoreButton items={moreList} onMore={onMore} a11y={t("est.actions")} testID="est-menu" />
        </RowView>
      )}
      footer={barShown && stepRow ? stepRow : undefined}
    >
      <RevealOnTick tick={revealTick} target={missing === "client" ? clientRef : linesRef} />
      {clientScreen ? (
        <View testID="est-client-off" style={{ alignSelf: "flex-start" }}>
          <Button label={t("est.client.off")} icon="eye" variant="secondary" onPress={() => toggleClientScreen(false)} />
        </View>
      ) : null}
      {/* #2363 F33: no line over the estimate that pushes everything down — the header line says «изменена после отправки» */}
      {/* #2381: the phone refused to keep the edits (full storage) — said, with the way out («Готово» saves them) */}
      {drafts.writeFailed ? (
        <View testID="k1-write-failed">
          <RowView>
            <Icon name="alert" s={size.iconSm} color={c.status.warn.text} />
            <T v="caption" tone="warn" style={{ flex: 1, minWidth: 0 }}>
              {t("k1.writeFailed")}
            </T>
          </RowView>
        </View>
      ) : null}
      {/* #2381: a saved estimate with edits on the phone — said in one line; «Отменить» takes them back (asked first) */}
      {/* Р2: a signed estimate shown as saved; the edits kept aside on the phone — said, with the way to drop them */}
      {keptAside ? (
        <View testID="k1-kept">
          <RowView>
            <Icon name="note" s={size.iconSm} />
            <T v="caption" tone="mut" style={{ flex: 1, minWidth: 0 }}>
              {t("k1.keptLine")}
            </T>
            <View testID="k1-kept-reset">
              <Button label={t("k1.reset")} variant="ghost" onPress={() => void dropKept()} />
            </View>
          </RowView>
        </View>
      ) : null}
      {/* not while the phone fails to keep them: «уже хранится на телефоне» would contradict the warning above (code review of #2423) */}
      {existing && dirty && !signed && !keptAside && !drafts.writeFailed ? (
        <View testID="k1-unsaved">
          <RowView>
            <Icon name="note" s={size.iconSm} />
            {/* founder 23.11 (#2423: «несохранённые правки — что это значит? Там должен быть знак вопроса»; audit MAP §6): the words say
                what it is, «?» right after them explains Готово / Отменить (DS Б7) */}
            <T v="caption" tone="mut" numberOfLines={1} style={{ flexShrink: 1, minWidth: 0 }}>
              {t("k1.unsaved")}
            </T>
            <HelpButton title={t("k1.unsaved")} text={t("k1.unsavedHelp")} testID="k1-unsaved-help" />
          </RowView>
        </View>
      ) : null}
      {draft && !existing ? (
        <View testID="est-draft">
          {/* a hint in one line, the way out beside it (not a card) */}
          <RowView>
            <Icon name="note" s={size.iconSm} />
            <T v="caption" tone="mut" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
              {t("proto.est.draftBack")}
            </T>
            <View testID="est-draft-restart">
              <Button label={t("est.draft.restart")} variant="ghost" onPress={() => setAskRestart(true)} />
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
          {/* #2387 + founder 21.11 (q3: «кнопки над списком — 40», a row with words): the group title «Позиции 7» as every group's
              (GroupHead), the sections and a template as quiet icons on its right; under it «＋ Новая позиция · Из каталога» — a ButtonPair of
              two secondary 40 (the screen's one yellow stays «Готово» of the bar) */}
          <View testID="est-items-head" style={{ marginTop: space[3], gap: rhythm.headGap }}>
            <GroupHead title={t("ue.items")} count={act.length ? act.length : undefined} countTestID="est-items-count" />
            {option.lines.length === 0 ? null : addGrid}
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
                action={addGrid ?? undefined}
              />
            ) : null}
          {/* the lines' card only when there are lines: the empty state is its own card, never a card in a card */}
          {/* #2363 (founder 21.11: «разделители групп некрасиво, непонятно»; both design reviews): with groups each group is a card of
              its own — the rows draw the card (the ground, the first/last corners), the group's title stands OVER it with its sum; one
              list still, so a line drags from group to group */}
          {/* (code review: a section added to an empty estimate must show — the list is there once it has a section, lines or not) */}
          <ListFrame empty={option.lines.length === 0 && !(option.sections ?? []).length} missing={missing === "lines"}>
            <SortableList
              // #2387: the lines of a group are ONE card (ui/groupedList `useGroupEdge`), the inset hairline between them is the list's
              rowLook={(r, i) => groupLook(view, r, i, groupEdge)}
              rowRule={(r, i) => (r.type === "line" && view[i - 1]?.type === "line" ? space[4] : null)}
              // #2424: a hidden line's dashed frame goes around the whole line, its «≡» too
              rowFrame={(r) => r.type === "line" && isHidden(r.line)}
              rows={view}
              openKey={openId ? `l:${openId}` : renamingId ? `s:${renamingId}` : null}
              locked={signed}
              onDrop={dropRow}
              onHold={setHoldSection}
              onLift={setLifted}
              // the open row folds first (the whole list folds): a wrong one stays, says why (the errors, the scroll) and the drag does
              // not start — never silently (code review of «б»)
              beforeBegin={() => leaveRow(false)}
              // #2363 (founder 21.11: «не вижу, как перетаскивать»; DS §8.3): every folded line shows its «≡»; a hold still drags too
              onHoldStill={(k) => setMenuAsk((m) => ({ id: k.replace(/^l:/, ""), n: m.n + 1 }))}
              renderRow={(r, i) =>

              r.type === "section" ? (
                <View key={`s-${r.section.id}`}>
                  {i > 0 && !hasGroups ? <Divider /> : null}
                  <SectionHeader
                    gapAbove={hasGroups && i > 0}
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
                <View key="unsectioned" testID="est-sec-loose" style={hasGroups && i > 0 ? { paddingTop: space[3] } : undefined}>
                  {i > 0 && !hasGroups ? <Divider /> : null}
                  <T v="caption" tone="mut" w="semibold">
                    {t("est.sec.loose")}
                  </T>
                </View>
              ) : (
                <View key={r.line.id} style={{ paddingLeft: r.depth === 1 ? space[4] : 0 }}>
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
                    frame={false}
                  />
                </View>
              )
              }
            />
          </ListFrame>
          {missing === "lines" ? <FieldError text={t("ue.empty")} testID="ue-missing-lines" /> : null}
          </View>
        </View>

        <View style={{ gap: space[3] }}>
          {/* #2387: the totals are a group of GroupRows (one look with Деньги and a client): the word, the figure on the right, «›» where it opens */}
          <ListGroup inset={space[4]} testID="est-totals">
            <GroupRow title={t("ue.subtotal")} value={money(totals.subtotal)} />
            {/* founder 23.11 (MAP §12 п.8, DS §8.7а): Скидка / Налог / Депозит — one line each: the word · [% · Выкл. · $] · the value ·
                the sum, set right in the row (no sheet); applies at once */}
            <ModeRow
              title={t("ue.discount")}
              modes={moneyModes}
              mode={discountMode(s.discount)}
              off="off"
              onMode={(k) => {
                discMemo.current = remember(discMemo.current, s.discount);
                setSettings({ discount: discountFor(k, s.discount, discMemo.current) });
                focusTotals("discount", k);
              }}
              field={
                s.discount?.kind === "pct" ? (
                  <View testID="est-discount-pct"><PctField unit a11yLabel={t("ue.discount")} focusNow={focusOf("discount")} bps={discountBps(s.discount.value)} onChange={(b) => setSettings({ discount: { kind: "pct", value: String(Math.min(b, 10000) / 10000) } })} /></View>
                ) : s.discount?.kind === "fixed" ? (
                  <View testID="est-discount-fixed"><MoneyField unit a11yLabel={t("ue.discount")} focusNow={focusOf("discount")} cents={s.discount.cents} onChange={(c) => setSettings({ discount: { kind: "fixed", cents: c } })} /></View>
                ) : undefined
              }
              sum={!s.discount ? DASH : totals.discount ? `−${money(totals.discount)}` : money(0)}
              locked={signed}
              testID="est-discount-row"
            />
            <ModeRow
              title={t("ue.tax")}
              modes={taxModes}
              mode={s.tax.enabled && !exempt ? "pct" : "off"}
              off="off"
              onMode={(k) => {
                if (k === "pct") changeTax({ enabled: true });
                else setSettings({ tax: { ...s.tax, enabled: false } });
                focusTotals("tax", k);
              }}
              field={
                partialTax ? (
                  <T v="caption" tone="mut">{`${ppmToPctText(taxRatePpm(s.tax))}%`}</T>
                ) : (
                  <View testID="est-tax-rate"><RatePctField unit a11yLabel={t("ue.taxRate")} focusNow={focusOf("tax")} onBad={setBadRate} ppm={taxRatePpm(s.tax)} onChange={(p) => setSettings({ tax: wholeTax(s.tax, { ratePpm: Math.min(p, 1_000_000) }) })} /></View>
                )
              }
              sum={s.tax.enabled && !exempt ? money(totals.tax) : DASH}
              locked={signed || exempt}
              testID="est-tax-row"
              note={
                exempt ? (
                  <View testID="est-tax-exempt"><T v="caption" tone="mut">{t("ue.taxExemptClient")}</T></View>
                ) : signed ? (
                  // a signed estimate: the rows do not change — said once, under the tax (CRM review: «не говорят почему»)
                  <View testID="est-totals-signed"><T v="caption" tone="mut">{t("ue.taxSigned")}</T></View>
                ) : s.tax.enabled && badRate ? (
                  // the field is too narrow for its hint: the hint goes under the row
                  <FieldError text={t("ue.taxRateHint")} testID="est-tax-bad" />
                ) : s.tax.enabled && partialTax ? (
                  <View testID="est-tax-partial" style={{ gap: space[2] }}>
                    <T v="caption" tone="mut">{t("ue.taxPartial")}</T>
                    <Button label={t("ue.taxWhole")} variant="secondary" full onPress={() => changeTax({})} />
                  </View>
                ) : s.tax.enabled && lastRate !== null && lastRate !== taxRatePpm(s.tax) ? (
                  <View testID="est-tax-last" style={{ alignSelf: "flex-start" }}>
                    <Button label={t("ue.taxLast", { rate: ppmToPctText(lastRate) })} variant="ghost" onPress={() => setSettings({ tax: wholeTax(s.tax, { ratePpm: lastRate }) })} />
                  </View>
                ) : null
              }
            />
            {/* the total once (П7): in the pinned bar on a phone, here only where there is no bar (820/1280) */}
            {barShown ? null : (
              <View style={{ paddingHorizontal: space[4] }}>
                <RowView style={{ justifyContent: "space-between", minHeight: component.listRow.h }}>
                  <T v="title">{t("ue.total")}</T>
                  <T v="display" tabular>
                    {money(totals.total)}
                  </T>
                </RowView>
              </View>
            )}
            <ModeRow
              title={t("ue.deposit")}
              modes={moneyModes}
              mode={depositMode(s.deposit)}
              off="off"
              onMode={(k) => {
                depMemo.current = remember(depMemo.current, s.deposit);
                setSettings({ deposit: depositFor(k, s.deposit, depMemo.current) });
                focusTotals("deposit", k);
              }}
              field={
                s.deposit.kind === "pct" ? (
                  <View testID="est-deposit-pct"><PctField unit a11yLabel={t("ue.deposit")} focusNow={focusOf("deposit")} bps={s.deposit.bps} onChange={(b) => setSettings({ deposit: { kind: "pct", bps: Math.min(b, 10000) } })} /></View>
                ) : s.deposit.kind === "fixed" ? (
                  <View testID="est-deposit-fixed"><MoneyField unit a11yLabel={t("ue.deposit")} focusNow={focusOf("deposit")} cents={s.deposit.cents} onChange={(c) => setSettings({ deposit: { kind: "fixed", cents: c } })} /></View>
                ) : undefined
              }
              sum={s.deposit.kind === "none" ? DASH : money(totals.deposit)}
              locked={signed}
              testID="est-deposit-row"
            />
            {totals.depositOverCaLimit ? <View style={{ padding: space[4] }}><CaWarn limitCents={totals.caDepositLimit} testID="est-ca-warn" /></View> : null}
            {/* from 820 (no panel): «если клиент включит всё на выбор» and «Только для вас» here; a phone has them in the panel's «Итого ˅» */}
            {totalRows.client.some((r) => r.key === "ifAll") || totalRows.own.length ? (
              <View style={{ padding: space[4] }}>
                <TotalsBreakdown client={totalRows.client.filter((r) => r.key === "ifAll")} own={totalRows.own} testID="est-card-breakdown" />
              </View>
            ) : null}
          </ListGroup>
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
      {/* the question of the tax (an old estimate taxed by kind: turning it on changes the client's sum) — the one sheet of the
          totals; the values themselves are set in their rows (DS §8.7а) */}
      <Sheet visible={taxAsk !== null} onClose={() => setTaxAsk(null)} title={taxAsk ? t("ue.taxAskTitle") : undefined}>
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
        </View>
      </Sheet>
      {dialog}
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

    </Screen>
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


/** the lines' frame: no card of its own — the rows draw their group's card (`groupLook`); a missing list is framed in `bad` */
function ListFrame({ empty, missing, children }: { empty: boolean; missing: boolean; children: ReactNode }) {
  const { c } = useTheme();
  return <View style={{ gap: 0, ...(empty ? { display: "none" } : null), ...(missing ? { borderWidth: component.hairline, borderColor: c.status.bad.fill, borderRadius: radius.card } : null) }}>{children}</View>;
}

/** #2387: a line of a group takes the group card's edge (ui/groupedList) — its ground and the corners of the first and the last line */
function groupLook(view: readonly { type: string }[], r: { type: string }, i: number, edge: (first: boolean, last: boolean) => ViewStyle): ViewStyle | undefined {
  // the gap over a group's title (not the first row) is the title row's own top margin — the whole row (with its «⠿») moves down,
  // so the handle stands on the title's line (design review: «ручка выше „⋯“»); the drag measures a row by what it draws
  if (r.type !== "line") return i > 0 && r.type === "section" ? { marginTop: space[3] } : undefined;
  return edge(view[i - 1]?.type !== "line", view[i + 1]?.type !== "line");
}
