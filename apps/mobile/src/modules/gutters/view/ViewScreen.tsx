/**
 * «Просмотр замера» (founder 09.11, #698 #699 #700 #707; spec 33 П20.25): after «Готово» on the canvas — the drawing whole
 * (only to look at), what it is made of (gutters, corners, downspouts, parts), the total with «тестовые цены», the
 * «примерно — промерьте» note (only here and in the PDF), the estimates of this measurement and one main action by its
 * state: link it → make the estimate → open it / move the drawing's changes into it. «Править чертёж» goes back to the
 * canvas. Reads the store only (offline: the same). A technician sees the drawing and the list, never money (the
 * total, the estimates, the estimate action — canSeeClientMoney).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { computeGutterParts, type PartQty } from "@octo/estimating-engine";
import { drawingPrint as DP, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n, type DictKey } from "@/i18n";
import { tFor } from "@/i18n/translate";
import { canSeeClientMoney } from "@/features/clients";
import { EstimateListCard } from "@/features/listCards";
import { moduleHref } from "@/modules/registry";
import { Button, StatusChip } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { Card, CardList, RowView, Screen } from "@/ui/surfaces";
import { blueprint, sheetPage } from "./blueprint";
import { DocSheet } from "@/features/DocPagesView";
import { ftIn } from "../canvas/format";
import { fromElements } from "../canvas/model";
import { gutterData, measurementOf } from "../data";
import { clientLangOf, estimateAction, makeEstimate, ofMeasurement, pageIdOf } from "../estimateLink";
import { toMeasurement } from "../geometry";
import { listPreview, partName } from "../prices";
import { readRules, toRulesOverride } from "../settings";
import { LinkSheet } from "../draw/LinkSheet";
import { measureSpec } from "./spec";
import { drawingPdfHtml, drawingPdfName } from "./drawingPdf";
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
    <Screen title={t("mod.gutters.view.title")} subtitle={lead?.name ?? addr?.address} back={back}>
      <MeasurementView key={mid} mid={mid} estimate={params.estimate === "1"} from={params.from} />
    </Screen>
  );
}

/**
 * The body of «Просмотр замера»: the screen above and the 1280 panel of «Замеры». `estimate` — «Смета из замера» /
 * «Обновить из замера» came with estimate=1: done once; `from` — "draw": «Править чертёж» goes back to that canvas.
 */
export function MeasurementView({ mid, estimate: autoEstimate, from }: { mid: string; estimate?: boolean; from?: string }) {
  const store = useStore();
  const { t, money, lang } = useI18n();
  const toast = useToast();
  const g = gutterData(store.db);
  const found = mid ? measurementOf(g, mid) : null;
  const m = found?.m ?? null;
  const elements = found?.elements;
  const drawing = useMemo(() => fromElements(elements ?? []), [elements]);
  const settings = store.db.company?.modules?.gutters?.settings;
  const rules = useMemo(() => ({ over: toRulesOverride(settings), corner: readRules(settings).corner }), [settings]);
  const parts = useMemo<PartQty[]>(() => (drawing.runs.length ? computeGutterParts(toMeasurement(drawing, { method: rules.corner }), rules.over).parts : []), [drawing, rules]);
  const spec = useMemo(() => measureSpec(drawing, parts), [drawing, parts]);
  const preview = useMemo(() => (parts.length ? listPreview(parts, store.db.catalog) : null), [parts, store.db.catalog]);
  const money$ = canSeeClientMoney(store.role);
  const action = m ? estimateAction(store.db, m, drawing.runs.length > 0) : ({ kind: "none" } as const);
  const estimates = m ? store.db.estimates.filter((e) => e.doc?.options?.some((o) => o.lines.some((l) => ofMeasurement(l, m.id)))) : [];
  const [linkOpen, setLinkOpen] = useState(false);

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
    const company = companyForPortal(store.db, store.companyName ?? "OCTODEX");
    const page = drawing.runs.length
      ? sheetPage(
          pageIdOf(m.id),
          tc("mod.gutters.pdf.title"),
          // one sheet for the phone (/p/) and the paper: built for the narrow one (pageW), the PDF scales it up
          blueprint(drawing, tc, { company: company.name, address: placeText(), date: docDay(new Date().toISOString(), company.timezone), rough: m.accuracy !== "tape" }, DP.pageW),
        )
      : undefined;
    const r = makeEstimate(store, { m, elements: elements ?? [], parts, catalog: store.db.catalog, name: (p) => partName(tc, p), fallbackTitle: tc("mod.gutters.title"), ...(page ? { page } : {}) });
    if (!r.ok) {
      busy.current = false;
      toast.show(t(r.reason === "noClient" ? "mod.gutters.est.noClient" : r.reason === "signed" ? "mod.gutters.est.signed" : "mod.gutters.est.off"));
      return;
    }
    toast.show(t(r.updated ? "mod.gutters.est.updated" : "mod.gutters.est.made"), r.undo);
    router.push(`/estimate/new?id=${encodeURIComponent(r.estimateId)}` as Href);
  };
  // «Смета из замера» (the lead) and «Обновить из замера» (the estimate's note) come here with estimate=1: done once
  const auto = useRef(!!autoEstimate);
  useEffect(() => {
    if (!auto.current || !m || !money$) return;
    auto.current = false;
    if (action.kind === "make" || action.kind === "update" || action.kind === "open") doEstimate();
  });

  // «чертёж как на бумаге» (founder 10.11, #739): a drawing sheet, not the canvas — the same one the PDFs carry
  const [w, setW] = useState(0);
  const sheet = useMemo(() => {
    if (!drawing.runs.length || !w) return null;
    const company = companyForPortal(store.db, store.companyName ?? "OCTODEX");
    return blueprint(drawing, t, {
      company: company.name,
      address: placeText(),
      date: docDay(new Date().toISOString(), company.timezone),
      rough: m?.accuracy !== "tape",
    }, w);
  }, [drawing, t, m, store.db, store.companyName, w]);

  /** a word of the dictionary, or the value itself when the company named it its own way (a colour of its own) */
  const word = (key: string, raw: string) => {
    const v = t(key as DictKey);
    return v === key ? raw : v;
  };
  const unit = (u: string) => word(`mod.gutters.view.u.${u}`, u);
  const kindWord = (k: string) => t(k === "in" ? "mod.gutters.draw.cornerIn" : k === "out" ? "mod.gutters.draw.cornerOut" : "mod.gutters.draw.cornerBay");

  if (!m) return <View testID="view-not-found"><T tone="mut">{t("mod.gutters.view.notFound")}</T></View>;
  const lead = m.leadId ? store.db.leads.find((l) => l.id === m.leadId) : undefined;
  const addr = m.propertyId ? store.db.properties.find((p) => p.id === m.propertyId) : undefined;
  const rough = m.accuracy !== "tape";
  // «Чертёж в PDF» (#509): the client's — no prices, in the client's language; the crew's — the cut, in the app's
  const who = lead?.name ?? (addr ? store.db.customers.find((c) => c.id === addr.customerId)?.name : undefined);
  const pdf = (kind: "client" | "crew") => {
    const company = companyForPortal(store.db, store.companyName ?? "OCTODEX");
    const docLang = kind === "client" ? clientLangOf(store.db, m) : lang;
    const tt = kind === "client" ? tFor(docLang) : t;
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
    });
    saveEstimatePdf(html, drawingPdfName(kind, tt, who)).catch((e) => toast.show(t("portal.error", { msg: String(e?.message ?? e) })));
  };

  return (
    <>
      <View testID="view-screen" style={{ gap: space[4] }}>
        {/* the drawing whole — to look at only: no gestures, nothing to tap */}
        <View testID="view-drawing" pointerEvents="none" onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}>
          {sheet ? <DocSheet sheet={sheet} testID="view-svg" /> : null}
        </View>
        {!drawing.runs.length ? (
          <View testID="view-empty"><T tone="mut">{t("mod.gutters.view.empty")}</T></View>
        ) : null}
        {rough && drawing.runs.length ? (
          <View testID="view-rough"><StatusChip status="warn" label={t("mod.gutters.view.rough")} soft /></View>
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
          {drawing.runs.length ? (
            <RowView style={{ gap: space[2], flexWrap: "wrap" }}>
              <View testID="view-pdf-client"><Button label={t("mod.gutters.view.pdfClient")} icon="invoice" variant="secondary" onPress={() => pdf("client")} /></View>
              <View testID="view-pdf-crew"><Button label={t("mod.gutters.view.pdfCrew")} icon="invoice" variant="secondary" onPress={() => pdf("crew")} /></View>
            </RowView>
          ) : null}
          <View testID="view-edit"><Button label={t("mod.gutters.view.edit")} icon="pencil" variant="secondary" onPress={edit} /></View>
        </View>

        {money$ && preview ? (
          <Card style={{ gap: space[1] }}>
            <View testID="view-total" style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space[2] }}>
              <T v="caption" tone="mut">{t("mod.gutters.draw.moneyCaption")}</T>
              <T v="heading" w="bold" tabular>{money(preview.totalCents)}</T>
            </View>
            {preview.test ? <View testID="view-test-prices"><StatusChip status="info" label={t("mod.gutters.draw.test")} soft /></View> : null}
            <T v="micro" tone="mut">{t("mod.gutters.draw.totalNote")}</T>
          </Card>
        ) : null}

        {spec.runs.length ? (
          <Card style={{ gap: space[2] }}>
            <T v="heading" w="semibold">{t("mod.gutters.view.runs")}</T>
            {spec.runs.map((r) => (
              <View key={r.id} testID={`view-run-${r.n}`} style={{ gap: space[1] }}>
                <RowView style={{ justifyContent: "space-between", gap: space[2] }}>
                  <T v="body" w="semibold">{t("mod.gutters.draw.cutRun", { n: r.n })}</T>
                  <T v="caption" tone="mut">{[t("mod.gutters.story", { n: r.story }), `${word(`mod.gutters.attr.p.${r.profile}`, r.profile)} ${r.size}″`, r.color ? word(`mod.gutters.attr.c.${r.color}`, r.color) : null].filter(Boolean).join(" · ")}</T>
                </RowView>
                <T v="body" tabular>{t("mod.gutters.view.runLine", { back: ftIn(r.backIn), front: ftIn(r.frontIn) })}</T>
              </View>
            ))}
          </Card>
        ) : null}

        {spec.corners.length ? (
          <Card style={{ gap: space[2] }}>
            <T v="heading" w="semibold">{t("mod.gutters.view.corners")}</T>
            {spec.corners.map((c) => (
              <View key={c.id} testID={`view-corner-${c.id}`} style={{ gap: space[1] }}>
                <T v="body" w="semibold">{t("mod.gutters.view.cornerTitle", { k: kindWord(c.kind), deg: c.angleDeg })}</T>
                {c.runs.map((x) => (
                  <T key={x.n} v="caption" tabular>{t("mod.gutters.view.cornerRun", { n: x.n, back: ftIn(x.backIn), front: ftIn(x.frontIn) })}</T>
                ))}
              </View>
            ))}
          </Card>
        ) : null}

        {spec.ds.length ? (
          <Card style={{ gap: space[2] }}>
            <T v="heading" w="semibold">{t("mod.gutters.view.ds")}</T>
            {spec.ds.map((d) => (
              <View key={d.id} testID={`view-ds-${d.n}`}>
                <RowView style={{ justifyContent: "space-between", gap: space[2] }}>
                  <T v="body" w="semibold">{`${t("mod.gutters.ds", { n: d.n })} · ${t("mod.gutters.story", { n: d.story })} · ${d.size}`}</T>
                  <T v="caption" tone="mut">{t("mod.gutters.view.dsLine", { e: d.elbows, o: d.offsets })}</T>
                </RowView>
              </View>
            ))}
          </Card>
        ) : null}

        {spec.parts.length ? (
          <Card style={{ gap: space[1] }}>
            <View testID="view-parts"><T v="heading" w="semibold">{t("mod.gutters.view.parts")}</T></View>
            {spec.parts.map((p) => (
              <RowView key={p.key} style={{ justifyContent: "space-between", gap: space[2] }}>
                <T v="caption" style={{ flexShrink: 1 }}>{partName(t, p)}</T>
                <T v="caption" tabular>{`${Number(p.qty)} ${unit(p.unit)}`}</T>
              </RowView>
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
      <LinkSheet visible={linkOpen} onClose={() => setLinkOpen(false)} measurementId={m.id} />
    </>
  );
}
