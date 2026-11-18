/**
 * «Просмотр замера» (founder 09.11, #698 #699 #700 #707; spec 33 П20.25): after «Готово» on the canvas — the drawing whole
 * (only to look at), what it is made of (gutters, corners, downspouts, parts), the total with «тестовые цены», the
 * «примерно — промерьте» note (only here and in the PDF), the estimates of this measurement and one main action by its
 * state: link it → make the estimate → open it / move the drawing's changes into it. «Править чертёж» goes back to the
 * canvas. Reads the store only (offline: the same). A technician sees the drawing and the list, never money (the
 * total, the estimates, the estimate action — canSeeClientMoney).
 */
import { APP_NAME } from "@/config/product";
import { useEffect, useMemo, useRef, useState, type ElementRef, type ReactNode, type RefObject } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { computeGutterParts, type PartQty } from "@octo/estimating-engine";
import { component, drawingPrint as DP, layout, radius, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useDevice, useTheme } from "@/theme/ThemeProvider";
import { useI18n, type DictKey } from "@/i18n";
import { tFor } from "@/i18n/translate";
import { canSeeClientMoney } from "@/features/clients";
import { EstimateListCard } from "@/features/listCards";
import { moduleActive, moduleHref } from "@/modules/registry";
import { Button, StatusChip } from "@/ui/controls";
import { Banner } from "@/ui/banner";
import { Icon, T } from "@/ui/primitives";
import { HelpButton, Menu, useToast } from "@/ui/overlays";
import { Card, CardList, Divider, ListRow, RowView, Screen } from "@/ui/surfaces";
import { NotFound } from "@/ui/emptyStates";
import { blueprint, sheetPage } from "./blueprint";
import { DocSheet } from "@/features/DocPagesView";
import { gutterDocLang } from "../docLang";
import { fmtLen } from "../canvas/format";
import { fromElements } from "../canvas/model";
import { gutterData, KEY, measurementOf } from "../data";
import { clientLangOf, estimateAction, estimateOfMeasurement, makeEstimate, ofMeasurement, pageIdOf } from "../estimateLink";
import { CardHead } from "./CardHead";
import { MeasurePhotos } from "../draw/Photos";
import { toMeasurement } from "../geometry";
import { dsLine, listPreview, PART_WORDS, partName, partQty, partView, sizeText } from "../prices";
import { readLenFormat, readRules, toRulesOverride } from "../settings";
import { LinkSheet } from "../draw/LinkSheet";
import { dsNumbers, dsTotals, measureSpec, partGroups } from "./spec";
import { drawingPdfHtml, drawingPdfName } from "./drawingPdf";
import { shopFileName, shopHtml, shopJob, shopPagePt, shopSheets, type ShopPaper } from "./shop";
import { saveShopPdf } from "./shop/savePdf";
import { companyForPortal } from "@/cloud/portal";
import { docDay } from "@/features/docPdf";
import { saveEstimatePdf } from "@/features/estimatePdf";

/** the drawing's box: as tall as three quarters of its width */

/**
 * «Просмотр замера» on its own route (390, 820, «⤢ Открыть»): the screen around the body. On 1280 «Замеры» shows the
 * same body in its ListPanel (spec 33 П25.3 А).
 */
export default function ViewScreen() {
  const store = useStore();
  const { t } = useI18n();
  const params = useLocalSearchParams<{ m?: string; estimate?: string; from?: string }>();
  const mid = typeof params.m === "string" ? params.m : "";
  const m = mid ? measurementOf(gutterData(store.db), mid)?.m : undefined;
  const lead = m?.leadId ? store.db.leads.find((l) => l.id === m.leadId) : undefined;
  const addr = m?.propertyId ? store.db.properties.find((p) => p.id === m.propertyId) : undefined;
  const back = () => (router.canGoBack() ? router.back() : router.replace(moduleHref("gutters", "list") as Href));
  return (
    <Screen title={t("mod.gutters.view.title")} subtitle={lead?.name ?? addr?.address} back={back} help={t("mod.gutters.view.help")}>
      <MeasurementView key={mid} mid={mid} estimate={params.estimate === "1"} from={params.from} onGone={back} />
    </Screen>
  );
}

/**
 * The body of «Просмотр замера»: the screen above and the 1280 panel of «Замеры». `estimate` — «Смета из замера» /
 * «Обновить из замера» came with estimate=1: asked once (a press writes); `from` — "draw": «Править чертёж» goes back to that canvas.
 */
export function MeasurementView({ mid, estimate: autoEstimate, from, onGone, panel }: { mid: string; estimate?: boolean; from?: string; /** the measurement was deleted from its card */ onGone: () => void; /** in the 1280 panel beside «Замеры»: one column */ panel?: boolean }) {
  const store = useStore();
  const { device } = useDevice();
  const { c } = useTheme();
  const cols = device !== "phone" && !panel;
  const { t, money } = useI18n();
  const toast = useToast();
  const g = gutterData(store.db);
  const found = mid ? measurementOf(g, mid) : null;
  const m = found?.m ?? null;
  const elements = found?.elements;
  const drawing = useMemo(() => fromElements(elements ?? []), [elements]);
  const settings = store.db.company?.modules?.gutters?.settings;
  // #1092: the company's format of lengths — the sheet, the lists, the parts and the PDFs follow it
  const fmt = readLenFormat((settings as { lenFormat?: unknown } | undefined)?.lenFormat);
  const rules = useMemo(() => ({ over: toRulesOverride(settings), corner: readRules(settings).corner }), [settings]);
  const measured = useMemo(() => (drawing.runs.length ? toMeasurement(drawing, { method: rules.corner }) : undefined), [drawing, rules]);
  const parts = useMemo<PartQty[]>(() => (measured ? computeGutterParts(measured, rules.over).parts : []), [measured, rules]);
  const spec = useMemo(() => measureSpec(drawing, parts, { rules: rules.over, ...(measured ? { m: measured } : {}) }), [drawing, parts, rules, measured]);
  const preview = useMemo(() => (parts.length ? listPreview(parts, store.db.catalog) : null), [parts, store.db.catalog]);
  const money$ = canSeeClientMoney(store.role);
  const action = m ? estimateAction(store.db, m, drawing.runs.length > 0) : ({ kind: "none" } as const);
  const estimates = m ? store.db.estimates.filter((e) => e.doc?.options?.some((o) => o.lines.some((l) => ofMeasurement(l, m.id)))) : [];
  const [linkOpen, setLinkOpen] = useState(false);
  // the paper menu of «Рабочие чертежи» (#1349): its button's place. Hooks stand above the «not found» return below —
  // a measurement that goes (deleted, a copy undone) must not change their count
  const shopRef = useRef<ElementRef<typeof View>>(null);
  const [shopAt, setShopAt] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  // «Подробно» (П25.3 Б7): what the drawing is made of — folded; the sheet, the action and the documents come first
  const [details, setDetails] = useState(false);

  // «Править чертёж»: back to the canvas it came from; from a lead or an estimate — the canvas opens
  const edit = () => {
    if (!m) return;
    if (from === "draw" && router.canGoBack()) router.back();
    else router.push(`${moduleHref("gutters", "draw")}?m=${encodeURIComponent(m.id)}` as Href);
  };

  /** one press at a time; the screen is left after a made estimate (a second press would make a second one) */
  const busy = useRef(false);
  /** where it is: the object's address, else the lead's name (the sheet's title block) */
  const placeText = () => {
    const placeAddr = m?.propertyId ? store.db.properties.find((p) => p.id === m.propertyId) : undefined;
    const placeLead = m?.leadId ? store.db.leads.find((l) => l.id === m.leadId) : undefined;
    return placeAddr ? [placeAddr.address, placeAddr.city].filter(Boolean).join(", ") : placeLead?.name;
  };
  const doEstimate = () => {
    if (!m || busy.current) return;
    if (action.kind === "open") return router.push(`/estimate/${action.estimateId}` as Href);
    busy.current = true;
    const tc = tFor(clientLangOf(store.db, m));
    // the drawing as on paper (#739), in the client's language: the estimate's page on /p/ and in its PDF (S6g, #705)
    const company = companyForPortal(store.db, store.companyName ?? APP_NAME);
    const page = drawing.runs.length
      ? sheetPage(
          pageIdOf(m.id),
          tc("mod.gutters.pdf.title"),
          // one sheet for the phone (/p/) and the paper: built for the narrow one (pageW), the PDF scales it up
          blueprint(drawing, tc, { company: company.name, address: placeText(), date: docDay(new Date().toISOString(), company.timezone), rough: m.accuracy !== "tape", fmt }, DP.pageW),
        )
      : undefined;
    const r = makeEstimate(store, { m, elements: elements ?? [], parts, catalog: store.db.catalog, name: (p) => partName(tc, p, fmt), fallbackTitle: tc("mod.gutters.title"), ...(page ? { page } : {}) });
    if (!r.ok) {
      busy.current = false;
      toast.show(t(r.reason === "noClient" ? "mod.gutters.est.noClient" : r.reason === "signed" ? "mod.gutters.est.signed" : r.reason === "notHere" ? "est.tech.notHere" : "mod.gutters.est.off"));
      return;
    }
    toast.show(t(r.updated ? "mod.gutters.est.updated" : "mod.gutters.est.made"), r.undo);
    router.push(`/estimate/new?id=${encodeURIComponent(r.estimateId)}` as Href);
  };
  // «Смета из замера» (the lead) and «Обновить из замера» (the estimate's note) come here with estimate=1. Opening a link never writes:
  // an estimate to open is opened (nothing changes); one to make or update is ASKED — the person presses (the question on top)
  const auto = useRef(!!autoEstimate);
  const [ask, setAsk] = useState(false);
  useEffect(() => {
    if (!auto.current || !m || !money$) return;
    auto.current = false;
    if (action.kind === "open") doEstimate();
    else if (action.kind === "make" || action.kind === "update") setAsk(true);
  });

  // «чертёж как на бумаге» (founder 10.11, #739): a drawing sheet, not the canvas — the same one the PDFs carry
  const [w, setW] = useState(0);
  const sheet = useMemo(() => {
    if (!drawing.runs.length || !w) return null;
    const company = companyForPortal(store.db, store.companyName ?? APP_NAME);
    return blueprint(drawing, t, {
      company: company.name,
      address: placeText(),
      date: docDay(new Date().toISOString(), company.timezone),
      rough: m?.accuracy !== "tape",
      fmt,
    }, w);
  }, [drawing, t, m, store.db, store.companyName, w, fmt]);

  /** a word of the dictionary, or the value itself when the company named it its own way (a colour of its own) */
  const word = (key: string, raw: string) => {
    const v = t(key as DictKey);
    return v === key ? raw : v;
  };
  const kindWord = (k: string) => t(k === "in" ? "mod.gutters.draw.cornerIn" : k === "out" ? "mod.gutters.draw.cornerOut" : "mod.gutters.draw.cornerBay");

  // DS §13 «Не найдено» (#1426): the one screen for every object — the words and the way back to the list (the panel: closes)
  if (!m) {
    const toList = () => (panel ? onGone() : router.replace(moduleHref("gutters", "list") as Href));
    return (
      <View testID="view-not-found">
        <NotFound title={t("mod.gutters.view.notFound")} listLabel={t("mod.gutters.view.toList")} onList={toList} />
      </View>
    );
  }
  const lead = m.leadId ? store.db.leads.find((l) => l.id === m.leadId) : undefined;
  const addr = m.propertyId ? store.db.properties.find((p) => p.id === m.propertyId) : undefined;
  const rough = m.accuracy !== "tape";
  // «Чертёж в PDF» (#509): the client's — no prices, in the client's language; the crew's — the cut, in the app's
  const who = lead?.name ?? (addr ? store.db.customers.find((c) => c.id === addr.customerId)?.name : undefined);
  // the client's document: their estimate when there is one (its PDF carries the drawing's page, P4b) — only to those
  // who see the client's money; else the drawing without prices
  const clientEst = money$ ? estimateOfMeasurement(store.db, m.id) : undefined;
  const clientLang = clientLangOf(store.db, m);
  const pdf = (kind: "client" | "crew") => {
    const company = companyForPortal(store.db, store.companyName ?? APP_NAME);
    // the client's — the client's language, the crew's — the company's (#2158, rule 7: never the app's own)
    const docLang = gutterDocLang(store.db, m, kind);
    const tt = tFor(docLang);
    const html = drawingPdfHtml({
      kind,
      drawing,
      spec,
      t: tt,
      opts: { lang: docLang },
      company,
      who,
      address: addr ? [addr.address, addr.city].filter(Boolean).join(", ") : undefined,
      rough,
      date: docDay(new Date().toISOString(), company.timezone),
      fmt,
    });
    saveEstimatePdf(html, drawingPdfName(kind, tt, who)).catch(() => toast.show(t("err.pdfSave")));
  };

  // «Рабочие чертежи» (#1349): the plan sheets G-1 …, the schedules and the supplier's order — 11 × 17, or the same
  // sheets reduced to Letter; the quantities are the estimate's (`parts`). The crew's are in the app's language, the
  // supplier's order in English (spec 36 №19). A sheet with overlapping labels is still given, with a warning.
  const shop = (kind: "drawings" | "order", paper: ShopPaper) => {
    const company = companyForPortal(store.db, store.companyName ?? APP_NAME);
    // the crew's sheets — the company's language, the supplier's order — en (#2158; spec 36 №19)
    const tt = tFor(gutterDocLang(store.db, m, kind === "order" ? "supplier" : "crew"));
    const r = readRules(settings);
    const set = shopSheets(drawing, {
      t: tt,
      job: shopJob(company, { client: who, address: addr ? [addr.address, addr.city].filter(Boolean).join(", ") : undefined, date: docDay(new Date().toISOString(), company.timezone) }),
      rules: { hangerSpacingIn: r.hangerSpacingIn, hangerExtra: r.hangerExtra, wasteFt: r.wasteFt, dsStickFt: r.dsStickFt, storyFt: r.storyFt, corner: r.corner, engine: rules.over },
      parts,
      fmt,
    });
    const sheets = kind === "order" ? set.order : set.drawings;
    const problems = kind === "order" ? set.orderProblems : set.problems;
    if (problems.length) toast.show(t("mod.gutters.shop.problems", { n: problems.length }));
    saveShopPdf(shopHtml(sheets, shopFileName(tt, kind, who), paper), shopFileName(tt, kind, who), shopPagePt(sheets, paper)).catch(() => toast.show(t("err.pdfSave")));
  };

  return (
    <>
      <Menu
        visible={!!shopAt}
        anchor={shopAt}
        title={t("mod.gutters.shop.paper")}
        items={[
          { key: "ansiB" as const, label: t("mod.gutters.shop.paperB"), testID: "view-shop-paper-ansiB" },
          { key: "letter" as const, label: t("mod.gutters.shop.paperLetter"), testID: "view-shop-paper-letter" },
        ]}
        onSelect={(k) => shop("drawings", k)}
        onClose={() => setShopAt(null)}
      />
      <View testID="view-screen" style={{ gap: space[4] }}>
        <CardHead m={m} drawn={drawing.runs.length > 0} onGone={onGone} />
        {/* 820 / 1280 on its own page: two columns — the sheet and the action on the left, the documents, the photos and
            the rest on the right (П25.3 Б); a phone and the 1280 panel — one column, the same order */}
        <View style={cols ? { flexDirection: "row", alignItems: "flex-start", gap: space[4] } : { gap: space[4] }}>
        <View style={{ gap: space[4], ...(cols ? { flex: 1, minWidth: 0 } : {}) }}>
        {/* came by a link to make / update the estimate: the question on top, above the content (DS Б9) — a press writes */}
        {ask && (action.kind === "make" || action.kind === "update") ? (
          <Banner
            tone="info"
            testID="view-estimate-ask"
            title={t(action.kind === "make" ? "mod.gutters.view.askMake" : "mod.gutters.view.askUpdate")}
            action={{ label: t(action.kind === "make" ? "mod.gutters.est.make" : "mod.gutters.est.update"), onPress: () => { setAsk(false); doEstimate(); } }}
            onClose={() => setAsk(false)}
          />
        ) : null}
        {/* the drawing whole — to look at only: no gestures, nothing to tap */}
        <View testID="view-drawing" pointerEvents="none" onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}>
          {sheet ? <DocSheet sheet={sheet} testID="view-svg" /> : null}
        </View>
        {!drawing.runs.length ? (
          <View testID="view-empty"><T tone="mut">{t("mod.gutters.view.empty")}</T></View>
        ) : null}

        {/* the main action by the state (#699) and «Править чертёж» */}
        <View style={{ gap: space[2] }}>
          {money$ && action.kind === "needLead" ? (
            <View testID="view-action-link"><Button label={t("mod.gutters.view.link")} icon="user" onPress={() => setLinkOpen(true)} /></View>
          ) : null}
          {money$ && (action.kind === "make" || action.kind === "update" || action.kind === "open") ? (
            <View testID={`view-action-${action.kind === "open" && action.signed ? "signed" : action.kind}`} style={{ gap: space[2] }}>
              <Button
                label={t(action.kind === "make" ? "mod.gutters.est.make" : action.kind === "update" ? "mod.gutters.est.update" : "mod.gutters.est.open")}
                icon={action.kind === "open" ? "chevronRight" : "plus"}
                onPress={doEstimate}
              />
              {action.kind === "update" ? (
                <View testID="view-stale"><T v="caption" tone="mut">{t("mod.gutters.view.stale")}</T></View>
              ) : null}
            </View>
          ) : null}
          <View testID="view-edit"><Button label={t("mod.gutters.view.edit")} icon="pencil" variant="secondary" onPress={edit} /></View>
        </View>
        </View>
        <View style={{ gap: space[4], ...(cols ? { flex: 1, minWidth: 0 } : {}) }}>

        {/* «Документы» (П25.3 Б4): one card, a row per reader — the client's (the estimate, else the drawing without
            prices, in the client's language), the crew's (the cut, the app's language). «Отправить» and the history — H3 */}
        {drawing.runs.length ? (
          <View testID="view-docs">
          <Card style={{ gap: space[1] }}>
            <T v="heading" w="semibold">{t("mod.gutters.card.docs")}</T>
            <DocRow
              id="client"
              title={t("mod.gutters.card.docClient")}
              sub={clientEst ? t("mod.gutters.card.docClientEst", { n: clientEst.number ?? "", lang: clientLang.toUpperCase() }) : t("mod.gutters.card.docClientDrawing", { lang: clientLang.toUpperCase() })}
              openTestID="view-pdf-client"
              onOpen={() => (clientEst ? router.push(`/estimate/${clientEst.id}` as Href) : pdf("client"))}
            />
            <DocRow id="crew" title={t("mod.gutters.card.docCrew")} sub={t("mod.gutters.card.docCrewSub", { n: spec.parts.length })} openTestID="view-pdf-crew" onOpen={() => pdf("crew")} />
            {/* one row, the paper is chosen on the press (founder 13.11: «объединить в одну»): 11 × 17, or the same sheets reduced to Letter */}
            <DocRow id="shop" title={t("mod.gutters.shop.doc")} sub={t("mod.gutters.shop.docSize")} openTestID="view-pdf-shop" anchorRef={shopRef} onOpen={() => shopRef.current?.measureInWindow((x: number, y: number, w: number, h: number) => setShopAt({ x, y, w, h }))} />
            <DocRow id="shop-order" title={t("mod.gutters.shop.docOrder")} sub={t("mod.gutters.shop.docOrderSub")} openTestID="view-pdf-shop-order" onOpen={() => shop("order", "letter")} />
          </Card>
          </View>
        ) : null}

        <View testID="view-photos">
          <MeasurePhotos framed measurementId={m.id} testID="view-photo-strip" readOnly={!moduleActive(store.db.company, KEY)} />
        </View>

        {money$ && preview ? (
          <Card style={{ gap: space[1] }}>
            <View testID="view-total" style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space[2] }}>
              <T v="caption" tone="mut">{t("mod.gutters.draw.moneyCaption")}</T>
              <T v="heading" w="bold" tabular>{money(preview.totalCents)}</T>
            </View>
            <T v="micro" tone="mut">{t("mod.gutters.draw.totalNote")}</T>
          </Card>
        ) : null}

        {spec.runs.length ? (
          <View testID="view-details">
            <Button label={t(details ? "mod.gutters.card.detailsHide" : "mod.gutters.card.details")} icon={details ? "chevronRight" : "chevronDown"} variant="ghost" onPress={() => setDetails((x) => !x)} />
          </View>
        ) : null}

        {details && spec.runs.length ? (
          <Card style={{ gap: space[2] }}>
            <T v="heading" w="semibold">{t("mod.gutters.view.runs")}</T>
            {spec.runs.map((r) => (
              <View key={r.id} testID={`view-run-${r.n}`} style={{ gap: space[1] }}>
                <RowView style={{ justifyContent: "space-between", gap: space[2] }}>
                  <T v="body" w="semibold">{t("mod.gutters.view.runN", { n: r.n })}</T>
                  <T v="caption" tone="mut">{[spec.manyStories ? t("mod.gutters.story", { n: r.story }) : null, `${sizeText(r.size)} ${word(`mod.gutters.pr.prof.${r.profile}`, r.profile)}`, r.color ? word(`mod.gutters.attr.c.${r.color}`, r.color) : null].filter(Boolean).join(" · ")}</T>
                </RowView>
                <T v="body">{t("mod.gutters.view.runLine", { back: fmtLen(r.backIn, fmt), front: fmtLen(r.frontIn, fmt) })}</T>
              </View>
            ))}
          </Card>
        ) : null}

        {details && spec.corners.length ? (
          <Card style={{ gap: space[2] }}>
            <T v="heading" w="semibold">{t("mod.gutters.view.corners")}</T>
            {spec.corners.map((c) => (
              <View key={c.id} testID={`view-corner-${c.id}`} style={{ gap: space[1] }}>
                <T v="body" w="semibold">{t("mod.gutters.view.cornerTitle", { k: kindWord(c.kind), deg: c.angleDeg })}</T>
                {c.runs.map((x) => (
                  <T key={x.n} v="caption">{t("mod.gutters.view.cornerRun", { n: x.n, back: fmtLen(x.backIn, fmt), front: fmtLen(x.frontIn, fmt) })}</T>
                ))}
              </View>
            ))}
          </Card>
        ) : null}

        {details && spec.ds.length ? (
          <Card style={{ gap: space[2], ...(cols ? { maxWidth: layout.formMax } : {}) }}>
            <T v="heading" w="semibold">{t("mod.gutters.view.ds")}</T>
            {/* #1800 (founder 16.11: «водостоки — общее количество»): one row per kind of downspout — the supplier's name,
                the total length on the right, how many; below, the elbows by style, the offsets and what is at the feet */}
            {dsTotals(spec.ds).map((g, i) => {
              const v = partView(t, { key: "ds", kind: "material", attrs: { shape: g.shape, size: g.size, ...(g.dsStyle ? { dsStyle: g.dsStyle } : {}), ...(g.material ? { material: g.material } : {}), ...(g.color ? { color: g.color } : {}) } }, fmt);
              const how = [
                dsLine(t, { shape: g.shape, ...(g.bent ? { bent: true } : {}), elbows: g.elbows, offsets: g.offsets }),
                ...g.bottoms.map((b) => `${PART_WORDS.has(b.kind) ? t(`mod.gutters.pr.p.${b.kind}` as DictKey) : word(`mod.gutters.attr.b.${b.kind}`, b.kind)} × ${b.qty}`),
              ].filter(Boolean).join(" · ");
              const n0 = g.ns[0]!;
              return (
                <View key={g.key} testID={`view-ds-${n0}`} style={{ gap: space[2] }}>
                  {i ? <Divider /> : null}
                  <PartLine
                    title={v.title}
                    props={[...v.props, `${dsNumbers(t, g.ns)} · ${partQty(t, { qty: String(g.ns.length), unit: "ea" }, fmt)}`]}
                    more={how ? <View testID={`view-ds-line-${n0}`}><T v="caption" tone="mut" numberOfLines={2}>{how}</T></View> : null}
                    qty={fmtLen(g.lengthIn, fmt)}
                    testID={`view-ds-${n0}`}
                  />
                </View>
              );
            })}
          </Card>
        ) : null}

        {details && spec.parts.length ? (
          <Card style={{ gap: space[5], ...(cols ? { maxWidth: layout.formMax } : {}) }}>
            <View testID="view-parts"><RowView style={{ alignItems: "center", gap: space[2] }}>
              <T v="heading" w="semibold" numberOfLines={1} style={{ flexShrink: 1 }}>{t("mod.gutters.view.parts")}</T>
              {/* the list's «?», right after its title (DS Б7, #1843): what the list is, and what «для заказа» means (#1800) */}
              <HelpButton title={t("mod.gutters.view.parts")} text={t("mod.gutters.view.partsHelp")} testID="view-parts-help" />
            </RowView></View>
            {/* DS §8.14 (#1766): three groups, a name in one line, the properties below, the quantity on its own column */}
            {partGroups(t, spec.parts, fmt).map((g) => (
              <View key={g.key} testID={`view-parts-${g.key}`} style={{ gap: space[2] }}>
                {/* a subgroup stands out (founder 16.11): its own band, the title as a section's, not a grey caption */}
                <RowView style={{ alignItems: "center", gap: space[2], backgroundColor: c.surf2, borderRadius: radius.field, paddingHorizontal: space[2], paddingVertical: space[1] }}>
                  <T v="body" w="semibold" numberOfLines={1} style={{ flexShrink: 1 }}>{g.title}</T>
                  <HelpButton title={g.title} text={g.help} to={{ href: "/module/gutters/settings" }} testID={`view-parts-${g.key}-help`} />
                </RowView>
                {g.rows.map((r, i) => (
                  <View key={r.key} testID={`view-part-${r.key}`} style={{ gap: space[2] }}>
                    {i ? <Divider /> : null}
                    <PartLine title={r.title} props={r.props} qty={r.qty} testID={`view-part-${r.key}`} />
                  </View>
                ))}
              </View>
            ))}
          </Card>
        ) : null}

        {/* the estimates of this measurement (#707): compact cards */}
        {money$ && estimates.length ? (
          <View testID="view-estimates" style={{ gap: space[2] }}>
            <T v="heading" w="semibold">{t("mod.gutters.view.estimates")}</T>
            <CardList>
              {estimates.map((e) => (
                <EstimateListCard key={e.id} e={e} density="compact" />
              ))}
            </CardList>
          </View>
        ) : null}
        </View>
        </View>
      </View>
      <LinkSheet visible={linkOpen} onClose={() => setLinkOpen(false)} measurementId={m.id} />
    </>
  );
}

/** a row of «Документы»: who reads it, what it is, «Открыть» (rule 12: rows of one object inside its card) */
/** `anchorRef` — the place of the button, for a menu that opens at it */
function DocRow({ id, title, sub, openTestID, onOpen, anchorRef }: { id: string; title: string; sub: string; openTestID: string; onOpen: () => void; anchorRef?: RefObject<ElementRef<typeof View> | null> }) {
  const { t } = useI18n();
  return (
    <View testID={`view-doc-${id}`}>
      <ListRow
        title={title}
        subtitle={sub}
        left={<Icon name="invoice" />}
        right={<View testID={openTestID} ref={anchorRef} collapsable={false}><Button label={t("mod.gutters.card.open")} variant="secondary" size="sm" onPress={onOpen} /></View>}
      />
    </View>
  );
}

/**
 * A row of «Состав замера» / «Водостоки» (DS §8.14, #1766): the name in one line, the properties grey below (up to two
 * lines), the quantity in its own column — never wrapped, the number and its unit held together.
 */
function PartLine({ title, props, qty, more, testID }: { title: string; props: string[]; qty: string; more?: ReactNode; testID?: string }) {
  return (
    <RowView style={{ alignItems: "flex-start", gap: space[3] }}>
      <View style={{ flex: 1, minWidth: 0, gap: space[1] }}>
        <View testID={testID ? `${testID}-title` : undefined}><T v="body" w="semibold" numberOfLines={1}>{title}</T></View>
        {props.length ? <T v="caption" tone="mut" numberOfLines={2}>{props.join(" · ")}</T> : null}
        {more}
      </View>
      <View testID={testID ? `${testID}-qty` : undefined} style={{ minWidth: component.estRow.qty, flexShrink: 0 }}>
        <T v="body" w="semibold" tabular numberOfLines={1} style={{ textAlign: "right" }}>{qty.replace(/ /g, "\u00a0")}</T>
      </View>
    </RowView>
  );
}
