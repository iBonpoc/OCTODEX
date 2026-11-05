import { useState } from "react";
import { Linking, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { space, component, size } from "@octo/design-tokens";
import { jobProfit, useStore, visitContext } from "@/data/store";
import type { PaymentMethod } from "@/data/types";
import { useI18n } from "@/i18n";
import { WhenWho } from "@/features/VisitForm";
import { canPlan } from "@/features/schedule";
import { useTheme } from "@/theme/ThemeProvider";
import { STEP_LABELS, stepIndex, visitStatus } from "@/features/visits";
import { SignaturePad } from "@/features/SignaturePad";
import { PhotoStrip } from "@/features/PhotoStrip";
import { Button, IconButton, Segmented, StatusChip, Steps, TextField } from "@/ui/controls";
import { Icon, Press, T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { Card, Empty, RowView, Screen, SectionTitle } from "@/ui/surfaces";

const haptic = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

/** Technician visit flow: En route → On site → Work (photos, checklist) → Signature → Payment. Works offline. */
export default function VisitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const { db } = store;
  const { t, time, money } = useI18n();
  const { c } = useTheme();
  const toast = useToast();
  const [method, setMethod] = useState<PaymentMethod>("card");
  const [extra, setExtra] = useState("");
  const v = db.visits.find((x) => x.id === id);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));

  if (!v)
    return (
      <Screen title={t("visit.title")} back={back}>
        <Empty icon="alert" title={t("clients.empty")} />
      </Screen>
    );

  const { job, property, customer } = visitContext(db, v);
  const st = visitStatus(v);
  const idx = stepIndex(v.step);
  const before = v.photos.filter((p) => p.kind === "before");
  const after = v.photos.filter((p) => p.kind === "after");
  const left = v.checklist.filter((x) => !x.done).length;
  const queuedHint = () => (store.online ? undefined : t("offline.queued"));
  // «Перенести / Отменить»: the office only (owner / admin / office ↔ director / dispatcher), like cancel_visit on the server
  const office = canPlan([store.role]);

  const advance = (msg: string) => {
    haptic();
    const undo = store.advanceVisit(v.id);
    toast.show(queuedHint() ?? msg, undo);
  };
  const removePhoto = (photoId: string) => toast.show(queuedHint() ?? t("photo.deleted"), store.removePhoto(v.id, photoId));
  const addItem = () => {
    const label = extra.trim();
    if (!label) return;
    toast.show(queuedHint() ?? t("check.added"), store.addCheckItem(v.id, label));
    setExtra("");
  };
  const tel = customer?.phone.replace(/[^\d+]/g, "");
  const addr = property ? encodeURIComponent(`${property.address}, ${property.city}`) : "";

  return (
    <Screen title={customer?.name ?? t("visit.title")} back={back} subtitle={`${time(v.start)} · ${job?.title ?? ""}`}>
      <Card>
        <RowView style={{ justifyContent: "space-between" }}>
          <StatusChip status={st.status} label={t(st.label)} />
          {v.amountDueCents > 0 ? (
            <T v="title" tabular>
              {money(v.amountDueCents)}
            </T>
          ) : null}
        </RowView>
        <Steps labels={STEP_LABELS.map((k) => t(k))} current={idx} />
        <RowView gap={space[1]}>
          <Icon name="pin" s={size.iconSm} color={c.mut} />
          <T v="body" tone="mut" style={{ flex: 1 }}>
            {[property?.address, property?.city].filter(Boolean).join(", ")} · {t("visit.stories", { n: property?.stories ?? 1 })}
          </T>
        </RowView>
        <RowView>
          <IconButton icon="phone" label={t("visit.call")} onPress={() => tel && Linking.openURL(`tel:${tel}`)} />
          <IconButton icon="message" label={t("visit.message")} onPress={() => tel && Linking.openURL(`sms:${tel}`)} />
          <IconButton icon="navigate" label={t("visit.navigate")} onPress={() => Linking.openURL(`https://maps.apple.com/?daddr=${addr}`)} />
          {customer && property ? (
            <Button
              label={t("quick.estimate")}
              icon="invoice"
              variant="secondary"
              onPress={() => router.push(`/estimate/new?customerId=${customer.id}&propertyId=${property.id}`)}
            />
          ) : null}
        </RowView>
      </Card>

      {office ? <WhenWho visitId={v.id} /> : null}

      {/* the note for the tech from the visit form (docs/specs/03 §7.3, wave П3b): everyone on the visit sees it */}
      {v.note ? (
        <Card>
          <T v="heading">{t("lead.book.note")}</T>
          <T v="body">{v.note}</T>
        </Card>
      ) : null}

      <Card>
        <T v="heading">{t("visit.scope")}</T>
        {v.scope.map((s) => (
          <RowView key={s} gap={space[2]} style={{ alignItems: "flex-start" }}>
            <T v="body" tone="mut">
              •
            </T>
            <T v="body" style={{ flex: 1 }}>
              {s}
            </T>
          </RowView>
        ))}
      </Card>

      {v.checklist.length > 0 && (v.step === "scheduled" || v.step === "en_route" || v.step === "on_site") ? (
        <Card>
          <RowView style={{ justifyContent: "space-between" }}>
            <T v="heading">{t("visit.checklist")}</T>
            <T v="caption" tone="mut">
              {t("check.preview", { n: v.checklist.length })}
            </T>
          </RowView>
          {v.checklist.map((item) => (
            <T key={item.id} v="body" tone="mut">
              ○ {item.label}
            </T>
          ))}
        </Card>
      ) : null}

      {/* Step actions */}
      {v.step === "scheduled" ? (
        <Button label={t("step.en_route")} icon="navigate" full onPress={() => advance(t("visit.etaSent"))} />
      ) : null}
      {v.step === "en_route" ? (
        <Button label={t("step.on_site")} icon="pin" full onPress={() => advance(t("toast.step", { step: t("step.on_site") }))} />
      ) : null}

      {v.step === "on_site" || v.step === "working" ? (
        <Card>
          <T v="heading">{t("visit.photosBefore")}</T>
          <PhotoStrip
            photos={before}
            onAdd={(uri) => toast.show(queuedHint() ?? t("toast.photo"), store.addPhoto(v.id, "before", uri))}
            onRemove={removePhoto}
          />
          {v.step === "on_site" && v.kind === "inspection" ? (
            // an inspection ends on site with "Done": no work, signature or payment (S10, docs/specs/03 §4.1)
            <Button label={t("st.done")} icon="check" full onPress={() => advance(t("toast.step", { step: t("st.done") }))} />
          ) : null}
          {v.step === "on_site" && v.kind !== "inspection" ? (
            <>
              {before.length === 0 ? (
                <T v="caption" tone="warn">
                  {t("visit.needPhotos")}
                </T>
              ) : null}
              <Button
                label={t("visit.next", { step: t("step.working") })}
                full
                disabled={before.length === 0}
                onPress={() => advance(t("toast.step", { step: t("step.working") }))}
              />
            </>
          ) : null}
        </Card>
      ) : null}

      {v.step === "working" ? (
        <>
            <Card>
              <RowView style={{ justifyContent: "space-between" }}>
                <T v="heading">{t("visit.checklist")}</T>
                <T v="caption" tone={left ? "mut" : "ok"}>
                  {left ? t("visit.checklistLeft", { n: left }) : "✓"}
                </T>
              </RowView>
              {v.checklist.map((item) => (
                <Press
                  key={item.id}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    store.toggleCheck(v.id, item.id);
                  }}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: item.done }}
                  accessibilityLabel={item.label}
                  style={{ flexDirection: "row", alignItems: "center", gap: space[3], minHeight: size.hitMin }}
                >
                  <View
                    style={{
                      width: component.checkbox.size,
                      height: component.checkbox.size,
                      borderRadius: component.checkbox.radius,
                      borderWidth: component.checkbox.border,
                      borderColor: item.done ? c.status.ok.fill : c.bd,
                      backgroundColor: item.done ? c.status.ok.fill : "transparent",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {item.done ? <Icon name="check" s={size.iconSm} color={c.status.ok.on} /> : null}
                  </View>
                  <T v="body" tone={item.done ? "mut" : "ink"} style={{ flex: 1, textDecorationLine: item.done ? "line-through" : "none" }}>
                    {item.label}
                  </T>
                </Press>
              ))}
              <RowView>
                <View style={{ flex: 1 }}>
                  <TextField type="text" value={extra} onChangeText={setExtra} placeholder={t("check.addPlaceholder")} icon="plus" />
                </View>
                <Button label={t("check.add")} size="sm" variant="secondary" disabled={!extra.trim()} onPress={addItem} />
              </RowView>
            </Card>
          <Card>
            <T v="heading">{t("visit.photosAfter")}</T>
            <PhotoStrip photos={after} onAdd={(uri) => toast.show(queuedHint() ?? t("toast.photo"), store.addPhoto(v.id, "after", uri))} onRemove={removePhoto} />
          </Card>
          {left > 0 ? (
            <T v="caption" tone="warn">
              {t("visit.needChecklist")}
            </T>
          ) : null}
          <SectionTitle title={t("step.sign")} />
          <Card>
            {left > 0 ? (
              <T v="body" tone="mut">
                {t("visit.needChecklist")}
              </T>
            ) : (
              <SignaturePad
                onConfirm={(path) => {
                  haptic();
                  toast.show(queuedHint() ?? t("toast.step", { step: t("step.pay") }), store.signVisit(v.id, path));
                }}
              />
            )}
          </Card>
        </>
      ) : null}

      {v.step === "signed" ? (
        <Card>
          <T v="caption" tone="mut">
            {t("visit.amountDue")}
          </T>
          <T v="display" tabular>
            {money(v.amountDueCents)}
          </T>
          <T v="caption" tone="mut">
            {t("visit.method")}
          </T>
          <Segmented
            full
            value={method}
            onChange={setMethod}
            items={[
              { key: "card", label: t("visit.payCard") },
              { key: "cash", label: t("visit.payCash") },
              { key: "check", label: t("visit.payCheck") },
              { key: "zelle", label: t("visit.payZelle") },
            ]}
          />
          <Button
            label={t("visit.recordPayment")}
            icon="dollar"
            full
            onPress={() => {
              haptic();
              const undo = store.payVisit(v.id, method);
              toast.show(queuedHint() ?? t("toast.paid", { amount: money(v.amountDueCents) }), undo);
            }}
          />
        </Card>
      ) : null}

      {v.step === "paid" || v.step === "done" ? (
        <Card status="ok">
          <RowView>
            <Icon name="check" color={c.status.ok.text} />
            <T v="heading" tone="ok">
              {t("visit.completed")}
            </T>
          </RowView>
          <T v="body" tone="mut">
            {t("visit.completedHint")}
          </T>
          {job ? (() => {
            const p = jobProfit(db, job.id);
            return (
              <View style={{ gap: space[1] }}>
                <RowView style={{ justifyContent: "space-between" }}>
                  <T v="body" tone="mut">{t("job.profit")}</T>
                  <T v="heading" tabular tone={p.profit >= 0 ? "ok" : "bad"}>
                    {money(p.profit)}{p.marginPct !== null ? ` · ${p.marginPct}%` : ""}
                  </T>
                </RowView>
                <T v="caption" tone="mut">
                  {t("job.revenue")} {money(p.revenue)} − {t("job.expenses")} {money(p.expenses)}. {t("job.laborNote")}
                </T>
              </View>
            );
          })() : null}
          {v.payment ? (
            <T v="body" tabular>
              {money(v.payment.amountCents)} · {t(`visit.pay${v.payment.method[0].toUpperCase()}${v.payment.method.slice(1)}` as "visit.payCard")}
            </T>
          ) : null}
        </Card>
      ) : null}
    </Screen>
  );
}
