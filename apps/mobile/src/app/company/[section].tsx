import { useState } from "react";
import { Image, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { component, radius, space, size } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { Address, Company, CompanyContact, CompanyLicense, EntityType, LicenseKind } from "@/data/types";
import { DOC_LANG_LABEL, DOC_LANGS, useI18n, type DictKey, type DocLang } from "@/i18n";
import { uid } from "@/features/estimateDoc";
import { Labeled, PctField } from "@/features/fields";
import { SETUP_STEPS, stepHint, stepTitle, type SetupStep } from "@/features/companySetup";
import { tzLabel } from "@/features/scheduleSettings";
import { ServiceCategoryEditor } from "@/features/ServiceCategoryPicker";
import { Button, ChoiceChips, IconButton, ReadOnly, Segmented, StatusChip, Stepper, TextField, Toggle, useReadOnly } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { Card, Empty, RowView, Screen } from "@/ui/surfaces";

const ENTITY: EntityType[] = ["llc", "corporation", "sole_proprietor", "partnership", "other"];
const LIC: LicenseKind[] = ["cslb", "city_business", "his", "other"];
const emptyAddr: Address = { line1: "", city: "", state: "", zip: "" };

/**
 * One section of the company profile. With ?wizard=1 it is a step of the first-run setup:
 * "Save and continue" / "Skip" go to the next step; the last step returns home.
 */
export default function CompanySection() {
  const { section, wizard } = useLocalSearchParams<{ section: SetupStep; wizard?: string }>();
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const c = store.db.company;
  const [draft, setDraft] = useState<Company | null>(c ? (JSON.parse(JSON.stringify(c)) as Company) : null);
  const step = SETUP_STEPS.includes(section) ? section : "profile";
  const idx = SETUP_STEPS.indexOf(step);
  const isWizard = wizard === "1";
  // spec 26 §3 (07.11): the office sees the company settings, only the director changes them
  const ro = store.role !== "director";
  const back = () => (router.canGoBack() ? router.back() : router.replace("/company"));

  if (!c || !draft) {
    return (
      <Screen title={t("co.title")} back={back}>
        <Empty icon="home2" title={t("co.none")} />
      </Screen>
    );
  }
  const set = (p: Partial<Company>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const goNext = () => {
    const next = SETUP_STEPS[idx + 1];
    if (isWizard && next) router.replace(`/company/${next}?wizard=1`);
    else if (isWizard) router.replace("/today");
    else back();
  };
  const save = () => {
    // the time zone and the schedule are saved by «Расписание» (П4a): a section opened before must not roll them back
    const { licenses: _l, contacts: _c, id: _i, timezone: _tz, scheduleSettings: _s, businessHours: _h, ...patch } = draft;
    const undo = store.saveCompany({ ...patch, skipped: draft.skipped.filter((s) => s !== step) });
    toast.show(store.online ? t("co.saved") : t("offline.queued"), undo);
    goNext();
  };
  const skip = () => {
    store.saveCompany({ skipped: Array.from(new Set([...c.skipped, step])) });
    goNext();
  };
  const listSection = step === "contacts" || step === "licenses";

  return (
    <Screen
      title={t(stepTitle(step))}
      back={back}
      subtitle={isWizard ? t("co.stepOf", { i: idx + 1, n: SETUP_STEPS.length }) : undefined}
    >
      {ro ? <StatusChip status="info" label={t("fix.co.readOnly")} soft /> : null}
      <T v="body" tone="mut">
        {t(stepHint(step))}
      </T>
      <ReadOnly value={ro}>

      {step === "profile" ? (
        <Card>
          <Labeled label={t("co.name")}>
            <TextField type="company" value={draft.name} onChangeText={(v) => set({ name: v })} placeholder="Acme Home Services" />
          </Labeled>
          <Labeled label={t("co.legalName")}>
            <TextField type="company" value={draft.legalName ?? ""} onChangeText={(v) => set({ legalName: v })} placeholder="Acme Home Services LLC" />
          </Labeled>
          <Labeled label={t("co.entity")}>
            <ChoiceChips value={draft.entityType ?? ("" as EntityType)} onChange={(v) => set({ entityType: v })} items={ENTITY.map((e) => ({ key: e, label: t(`co.entity.${e}` as DictKey) }))} />
          </Labeled>
          {store.role === "director" ? (
            <Labeled label={t("co.ein")}>
              <TextField type="ein" value={draft.ein ?? ""} onChangeText={(v) => set({ ein: v })} placeholder="12-3456789" />
            </Labeled>
          ) : null}
          <Labeled label={t("co.phone")}>
            <TextField type="phone" value={draft.phone ?? ""} onChangeText={(v) => set({ phone: v })} placeholder="(555) 555-0100" icon="phone" />
          </Labeled>
          <Labeled label={t("co.email")}>
            <TextField type="email" value={draft.email ?? ""} onChangeText={(v) => set({ email: v })} placeholder="office@company.com" icon="message" />
          </Labeled>
          <Labeled label={t("co.website")}>
            <TextField type="url" value={draft.website ?? ""} onChangeText={(v) => set({ website: v })} placeholder="https://" icon="globe" />
          </Labeled>
        </Card>
      ) : null}

      {step === "address" ? (
        <>
          <Card>
            <T v="heading">{t("co.address")}</T>
            <AddressFields value={draft.address} onChange={(a) => set({ address: a })} />
          </Card>
          <Card>
            <RowView style={{ minHeight: size.hitMin }}>
              <T v="body" style={{ flex: 1 }}>
                {t("co.mailingDifferent")}
              </T>
              <Toggle label={t("co.mailingDifferent")} on={!!draft.mailingAddress} onChange={(on) => set({ mailingAddress: on ? { ...emptyAddr } : undefined })} />
            </RowView>
            {draft.mailingAddress ? <AddressFields value={draft.mailingAddress} onChange={(a) => set({ mailingAddress: a })} /> : null}
          </Card>
          {/* the time zone lives in «Расписание» (П4a); here, in the address — a line that leads there */}
          <Card onPress={() => router.push("/company/schedule")} accessibilityLabel={t("schs.title")}>
            <RowView style={{ justifyContent: "space-between" }}>
              <T v="body">{t("schs.tzLine", { tz: tzLabel(c.timezone) })}</T>
              <T v="caption" tone="mut">{t("schs.title")}</T>
            </RowView>
          </Card>
        </>
      ) : null}

      {step === "contacts" ? <ContactsEditor /> : null}
      {step === "licenses" ? <LicensesEditor /> : null}

      {step === "insurance" ? (
        <>
          <Card>
            <T v="heading">{t("co.cgl")}</T>
            <TextField type="company" value={draft.insurance.cglCarrier ?? ""} onChangeText={(v) => set({ insurance: { ...draft.insurance, cglCarrier: v } })} placeholder={t("co.carrier")} />
            <TextField type="identifier" value={draft.insurance.cglPolicy ?? ""} onChangeText={(v) => set({ insurance: { ...draft.insurance, cglPolicy: v } })} placeholder={t("co.policy")} />
          </Card>
          <Card>
            <T v="heading">{t("co.wc")}</T>
            <RowView style={{ minHeight: size.hitMin }}>
              <T v="body" style={{ flex: 1 }}>
                {t("co.wcExempt")}
              </T>
              <Toggle label={t("co.wcExempt")} on={!!draft.insurance.wcExempt} onChange={(on) => set({ insurance: { ...draft.insurance, wcExempt: on } })} />
            </RowView>
            {!draft.insurance.wcExempt ? (
              <>
                <TextField type="company" value={draft.insurance.wcCarrier ?? ""} onChangeText={(v) => set({ insurance: { ...draft.insurance, wcCarrier: v } })} placeholder={t("co.carrier")} />
                <TextField type="identifier" value={draft.insurance.wcPolicy ?? ""} onChangeText={(v) => set({ insurance: { ...draft.insurance, wcPolicy: v } })} placeholder={t("co.policy")} />
              </>
            ) : null}
          </Card>
          <Card>
            <Labeled label={t("co.cancelEmail")}>
              <TextField type="email" value={draft.cancelEmail ?? ""} onChangeText={(v) => set({ cancelEmail: v })} placeholder="office@company.com" />
            </Labeled>
          </Card>
        </>
      ) : null}

      {step === "brand" ? <BrandEditor draft={draft} set={set} /> : null}

      {step === "trades" ? <ServiceCategoryEditor /> : null}

      {step === "documents" ? (
        <>
          <Card>
            <T v="heading">{t("co.docLanguage")}</T>
            <T v="caption" tone="mut">
              {t("co.docLanguageHint")}
            </T>
            <ChoiceChips<DocLang> value={draft.docLanguage ?? "en"} onChange={(v) => set({ docLanguage: v })} items={DOC_LANGS.map((k) => ({ key: k, label: DOC_LANG_LABEL[k] }))} />
          </Card>
          <Card>
            <Stepper label={t("co.validDays")} value={draft.estimate.validDays} min={1} max={180} step={5} onChange={(v) => set({ estimate: { ...draft.estimate, validDays: v } })} />
            <T v="body">{t("co.defaultDeposit")}</T>
            <Segmented
              full
              value={draft.estimate.depositBps === null ? "none" : "pct"}
              onChange={(k) => set({ estimate: { ...draft.estimate, depositBps: k === "none" ? null : 1000 } })}
              items={[
                { key: "pct", label: t("ue.depositPct") },
                { key: "none", label: t("ue.none") },
              ]}
            />
            {draft.estimate.depositBps !== null ? (
              <PctField bps={draft.estimate.depositBps} onChange={(b) => set({ estimate: { ...draft.estimate, depositBps: Math.min(b, 10000) } })} />
            ) : null}
            <TextField type="note" value={draft.estimate.terms ?? ""} onChangeText={(v) => set({ estimate: { ...draft.estimate, terms: v } })} placeholder={t("co.terms")} />
          </Card>
          <Card>
            <T v="heading">{t("co.payment")}</T>
            <TextField type="email" value={draft.payment.zelle ?? ""} onChangeText={(v) => set({ payment: { ...draft.payment, zelle: v } })} placeholder={t("co.zelle")} />
            <TextField type="company" value={draft.payment.checkPayableTo ?? ""} onChangeText={(v) => set({ payment: { ...draft.payment, checkPayableTo: v } })} placeholder={t("co.checkTo")} />
          </Card>
        </>
      ) : null}

      </ReadOnly>
      {ro ? null : listSection ? (
        isWizard ? (
          <Button label={SETUP_STEPS[idx + 1] ? t("co.next") : t("co.finish")} icon="chevronRight" full onPress={goNext} />
        ) : null
      ) : (
        <Button label={isWizard ? (SETUP_STEPS[idx + 1] ? t("co.saveNext") : t("co.finish")) : t("ue.save")} icon="check" full disabled={!draft.name.trim()} onPress={save} />
      )}
      {isWizard && !ro ? <Button label={t("co.skip")} variant="ghost" full onPress={skip} /> : null}
    </Screen>
  );
}

function AddressFields({ value, onChange }: { value: Address; onChange: (a: Address) => void }) {
  const { t } = useI18n();
  const set = (p: Partial<Address>) => onChange({ ...value, ...p });
  return (
    <View style={{ gap: space[2] }}>
      <TextField type="street" value={value.line1} onChangeText={(v) => set({ line1: v })} placeholder={t("co.street")} icon="pin" />
      <TextField type="city" value={value.city} onChangeText={(v) => set({ city: v })} placeholder={t("co.city")} />
      <RowView>
        <View style={{ flex: 1 }}>
          <TextField type="state" value={value.state} onChangeText={(v) => set({ state: v.toUpperCase().slice(0, 2) })} placeholder="CA" />
        </View>
        <View style={{ flex: 2 }}>
          <TextField type="zip" value={value.zip} onChangeText={(v) => set({ zip: v.replace(/[^\d-]/g, "").slice(0, 10) })} placeholder="ZIP" />
        </View>
      </RowView>
    </View>
  );
}

function ContactsEditor() {
  const ro = useReadOnly();
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const list = store.db.company?.contacts ?? [];
  const [edit, setEdit] = useState<CompanyContact | null>(null);
  const blank = (): CompanyContact => ({ id: uid(), name: "", isPrimary: list.length === 0, onDocuments: true });
  return (
    <>
      {list.map((p) =>
        edit?.id === p.id ? null : (
          <Card key={p.id} onPress={() => setEdit({ ...p })} accessibilityLabel={p.name}>
            <RowView style={{ alignItems: "flex-start" }}>
              <View style={{ flex: 1, gap: space[1] }}>
                <T v="body" w="semibold">
                  {p.name}
                  {p.title ? ` · ${p.title}` : ""}
                </T>
                <T v="caption" tone="mut">
                  {[p.phone, p.email].filter(Boolean).join(" · ")}
                </T>
              </View>
              {p.isPrimary ? <StatusChip status="ok" label={t("co.primary")} /> : null}
              {p.onDocuments ? <StatusChip status="neutral" label={t("co.onDocs")} /> : null}
            </RowView>
          </Card>
        ),
      )}
      {edit ? (
        <Card>
          <TextField type="name" value={edit.name} onChangeText={(v) => setEdit({ ...edit, name: v })} placeholder={t("co.personName")} icon="user" />
          <TextField type="jobTitle" value={edit.title ?? ""} onChangeText={(v) => setEdit({ ...edit, title: v })} placeholder={t("co.personTitle")} />
          <TextField type="phone" value={edit.phone ?? ""} onChangeText={(v) => setEdit({ ...edit, phone: v })} placeholder={t("co.phone")} icon="phone" />
          <TextField type="email" value={edit.email ?? ""} onChangeText={(v) => setEdit({ ...edit, email: v })} placeholder={t("co.email")} icon="message" />
          <RowView style={{ minHeight: size.hitMin }}>
            <T v="body" style={{ flex: 1 }}>
              {t("co.primary")}
            </T>
            <Toggle label={t("co.primary")} on={edit.isPrimary} onChange={(on) => setEdit({ ...edit, isPrimary: on })} />
          </RowView>
          <RowView style={{ minHeight: size.hitMin }}>
            <T v="body" style={{ flex: 1 }}>
              {t("co.onDocsLong")}
            </T>
            <Toggle label={t("co.onDocsLong")} on={edit.onDocuments} onChange={(on) => setEdit({ ...edit, onDocuments: on })} />
          </RowView>
          <RowView style={{ justifyContent: "space-between" }}>
            {!ro && list.some((x) => x.id === edit.id) ? (
              <IconButton
                icon="trash"
                label={t("ue.removeLine")}
                onPress={() => {
                  toast.show(t("co.removed", { name: edit.name }), store.removeContact(edit.id));
                  setEdit(null);
                }}
              />
            ) : (
              <Button label={t("common.close")} variant="ghost" size="sm" onPress={() => setEdit(null)} />
            )}
            {ro ? null : <Button
              label={t("ue.save")}
              icon="check"
              disabled={!edit.name.trim()}
              onPress={() => {
                store.saveContact({ ...edit, name: edit.name.trim() });
                setEdit(null);
              }}
            />}
          </RowView>
        </Card>
      ) : ro ? null : (
        <Button label={t("co.addPerson")} icon="plus" variant="secondary" full onPress={() => setEdit(blank())} />
      )}
    </>
  );
}

/** MM/DD/YYYY ↔ YYYY-MM-DD */
const toUs = (iso?: string) => (iso ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}` : "");
const fromUs = (s: string): string | undefined => {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}` : undefined;
};

function LicensesEditor() {
  const ro = useReadOnly();
  const store = useStore();
  const { t, day } = useI18n();
  const toast = useToast();
  const list = store.db.company?.licenses ?? [];
  const [edit, setEdit] = useState<(CompanyLicense & { exp: string; cls: string }) | null>(null);
  const open = (l: CompanyLicense) => setEdit({ ...l, exp: toUs(l.expiresOn), cls: l.classes.join(", ") });
  const expired = (l: CompanyLicense) => !!l.expiresOn && new Date(l.expiresOn).getTime() < Date.now() - 86_400_000;
  return (
    <>
      {list.map((l) =>
        edit?.id === l.id ? null : (
          <Card key={l.id} onPress={() => open(l)} accessibilityLabel={l.number} status={expired(l) ? "bad" : undefined}>
            <RowView style={{ alignItems: "flex-start" }}>
              <View style={{ flex: 1, gap: space[1] }}>
                <T v="body" w="semibold">
                  {t(`co.lic.${l.kind}` as DictKey)} #{l.number}
                </T>
                <T v="caption" tone="mut">
                  {[l.classes.length ? `${t("co.classes")}: ${l.classes.join(", ")}` : "", l.expiresOn ? `${t("co.expires")} ${day(l.expiresOn + "T12:00:00")}` : ""]
                    .filter(Boolean)
                    .join(" · ")}
                </T>
              </View>
              {expired(l) ? <StatusChip status="bad" label={t("co.expired")} /> : l.onDocuments ? <StatusChip status="neutral" label={t("co.onDocs")} /> : null}
            </RowView>
          </Card>
        ),
      )}
      {edit ? (
        <Card>
          <ChoiceChips value={edit.kind} onChange={(k) => setEdit({ ...edit, kind: k })} items={LIC.map((k) => ({ key: k, label: t(`co.lic.${k}` as DictKey) }))} />
          <TextField type="identifier" value={edit.number} onChangeText={(v) => setEdit({ ...edit, number: v })} placeholder={t("co.licNumber")} />
          <TextField type="identifier" value={edit.cls} onChangeText={(v) => setEdit({ ...edit, cls: v })} placeholder={t("co.classesHint")} />
          <TextField type="date" value={edit.exp} onChangeText={(v) => setEdit({ ...edit, exp: v })} placeholder={t("co.expiresHint")} />
          {edit.exp && !fromUs(edit.exp) ? (
            <T v="caption" tone="warn">
              {t("co.dateFormat")}
            </T>
          ) : null}
          <RowView style={{ minHeight: size.hitMin }}>
            <T v="body" style={{ flex: 1 }}>
              {t("co.onDocsLong")}
            </T>
            <Toggle label={t("co.onDocsLong")} on={edit.onDocuments} onChange={(on) => setEdit({ ...edit, onDocuments: on })} />
          </RowView>
          <RowView style={{ justifyContent: "space-between" }}>
            {!ro && list.some((x) => x.id === edit.id) ? (
              <IconButton
                icon="trash"
                label={t("ue.removeLine")}
                onPress={() => {
                  toast.show(t("co.removed", { name: edit.number }), store.removeLicense(edit.id));
                  setEdit(null);
                }}
              />
            ) : (
              <Button label={t("common.close")} variant="ghost" size="sm" onPress={() => setEdit(null)} />
            )}
            {ro ? null : <Button
              label={t("ue.save")}
              icon="check"
              disabled={!edit.number.trim() || (!!edit.exp && !fromUs(edit.exp))}
              onPress={() => {
                const { exp, cls, ...l } = edit;
                store.saveLicense({
                  ...l,
                  number: l.number.trim(),
                  classes: cls.split(/[,\s]+/).map((x) => x.trim().toUpperCase()).filter(Boolean),
                  expiresOn: exp ? fromUs(exp) : undefined,
                });
                setEdit(null);
              }}
            />}
          </RowView>
        </Card>
      ) : ro ? null : (
        <Button
          label={t("co.addLicense")}
          icon="plus"
          variant="secondary"
          full
          onPress={() => setEdit({ id: uid(), kind: "cslb", number: "", classes: [], onDocuments: true, exp: "", cls: "" })}
        />
      )}
    </>
  );
}

function BrandEditor({ draft, set }: { draft: Company; set: (p: Partial<Company>) => void }) {
  const ro = useReadOnly();
  const { t } = useI18n();
  const toast = useToast();
  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 1 }).catch(() => null);
    const uri = res && !res.canceled ? res.assets[0]?.uri : undefined;
    if (!uri) return;
    try {
      // small square logo kept as a data URI in the company profile (shows on the client page and in PDFs)
      const out = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: component.logoPx, height: component.logoPx } }], {
        compress: 0.8,
        format: ImageManipulator.SaveFormat.PNG,
        base64: true,
      });
      if (out.base64) set({ brand: { ...draft.brand, logo: `data:image/png;base64,${out.base64}` } });
    } catch (e) {
      toast.show(t("portal.error", { msg: String((e as Error)?.message ?? e) }));
    }
  };
  const hex = draft.brand.color ?? "";
  const validHex = /^#[0-9a-fA-F]{6}$/.test(hex);
  return (
    <>
      <Card>
        <T v="heading">{t("co.logo")}</T>
        {draft.brand.logo ? (
          <Image source={{ uri: draft.brand.logo }} style={{ width: component.logo, height: component.logo, borderRadius: radius.inner }} accessibilityLabel={t("co.logo")} />
        ) : (
          <T v="caption" tone="mut">
            {t("co.noLogo")}
          </T>
        )}
        {ro ? null : <RowView>
          <Button label={draft.brand.logo ? t("co.changeLogo") : t("co.pickLogo")} icon="camera" variant="secondary" onPress={pick} />
          {draft.brand.logo ? <Button label={t("cat.remove")} variant="ghost" onPress={() => set({ brand: { ...draft.brand, logo: undefined } })} /> : null}
        </RowView>}
      </Card>
      <Card>
        <T v="heading">{t("co.color")}</T>
        <RowView>
          <View style={{ flex: 1 }}>
            <TextField type="color" value={hex} onChangeText={(v) => set({ brand: { ...draft.brand, color: v.trim() || undefined } })} placeholder="#1E6FD9" />
          </View>
          {validHex ? (
            <View style={{ width: component.dockBtn, height: component.dockBtn, borderRadius: radius.pill, backgroundColor: hex }} accessibilityLabel={hex} />
          ) : null}
        </RowView>
        <T v="caption" tone="mut">
          {t("co.colorNote")}
        </T>
      </Card>
    </>
  );
}
