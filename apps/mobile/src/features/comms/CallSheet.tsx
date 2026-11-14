import { useRef, useState, type ReactNode } from "react";
import { useHeldSheet } from "@/ui/heldSheet";
import { View } from "react-native";
import { component, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { CallInput, CallOutcome } from "@/data/types";
import { useI18n } from "@/i18n";
import { Button, ChoiceChips, IconButton, Stepper, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Sheet, useToast, SheetScroll } from "@/ui/overlays";
import { Divider, ListRow } from "@/ui/surfaces";
import { CALL_OUTCOME, CALL_OUTCOMES, callPlaces, callPlacesAtClient, callReady, peopleOfSubject } from "./comms";

/**
 * «Записать звонок» (docs/specs/20 §5, §7; 13 §2.1.1): to whom (a lead or a client; the technician — his job or lead),
 * the person, the outcome — required, nothing is preselected (the server counts a call without one as answered),
 * minutes, a note. Opened from «＋» of «Звонки» (no subject: asks «к чему») and after «Позвонить» on a client.
 * We never record the call itself (CIPA §632): only what the person writes down.
 */
export type CallPreset = Partial<Pick<CallInput, "subjectType" | "subjectId" | "contactId">> & {
  /** «Позвонить» on this client: the technician with several jobs there picks among them (20 §6-4) */
  customerId?: string;
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: space[1] }}>
      <T v="caption" tone="mut">
        {label}
      </T>
      {children}
    </View>
  );
}

export function CallSheet({ preset, onClose }: { preset: CallPreset | null; onClose: () => void }) {
  const h = useHeldSheet(preset);
  if (!h.value) return null;
  const p = h.value;
  return <CallSheetBody key={`${p.subjectType ?? ""}-${p.subjectId ?? ""}-${p.contactId ?? ""}-${h.opening}`} preset={p} visible={h.visible} onExited={h.onExited} onClose={onClose} />;
}

function CallSheetBody({ preset, onClose, visible, onExited }: { preset: CallPreset; onClose: () => void; visible: boolean; onExited: () => void }) {
  const store = useStore();
  const { db, role } = store;
  const { t } = useI18n();
  const toast = useToast();
  const [place, setPlace] = useState<CallPreset>(preset);
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState<CallOutcome | undefined>(undefined);
  const [minutes, setMinutes] = useState(0);
  const [note, setNote] = useState("");
  const all = callPlaces(db, role);
  const chosen = place.subjectType && place.subjectId ? all.find((x) => x.subjectType === place.subjectType && x.subjectId === place.subjectId) : undefined;
  const people = place.subjectType && place.subjectId ? peopleOfSubject(db, place.subjectType, place.subjectId) : [];
  // one person: the call is with them; several: the one picked (or none)
  const contactId = place.contactId ?? (people.length === 1 ? people[0]!.id : undefined);
  const draft: Partial<CallInput> = { subjectType: place.subjectType, subjectId: place.subjectId, contactId, outcome, durationMin: minutes || undefined, note: note.trim() || undefined };
  const ok = callReady(draft);
  // from a client: only its jobs of the technician and his leads there (no search); else everything he may write to
  const atClient = preset.customerId && !preset.subjectId ? callPlacesAtClient(db, role, preset.customerId) : [];
  const places = chosen ? [] : atClient.length ? atClient : callPlaces(db, role, query).slice(0, 20);
  const kind = (k: CallInput["subjectType"]) => t(k === "lead" ? "w6.task.kind.lead" : k === "job" ? "w6.task.kind.job" : "w6.task.kind.customer");

  // a double tap on «Сохранить» writes one call, never two (the sheet closes after the first)
  const saved = useRef(false);
  const save = () => {
    if (saved.current || !callReady(draft)) return;
    saved.current = true;
    const undo = store.logCall(draft);
    toast.show(store.online ? t(draft.outcome === "answered" ? "w6.call.savedYes" : "w6.call.savedNo") : t("offline.queued"), undo);
    onClose();
  };

  return (
    <Sheet visible={visible} onExited={onExited} onClose={onClose} title={t("w6.call.title")} dirty={!!outcome || !!note.trim() || minutes > 0} onSave={ok ? save : undefined}>
      <View style={{ gap: space[3] }}>
        <Field label={t("w6.call.to")}>
          {chosen ? (
            <ListRow
              title={chosen.label}
              subtitle={kind(chosen.subjectType)}
              right={!preset.subjectId ? <IconButton icon="close" label={t("w6.task.subjectChange")} onPress={() => setPlace((x) => (atClient.length ? { contactId: x.contactId } : {}))} /> : undefined}
            />
          ) : (
            <View style={{ gap: space[2] }} testID="call-places">
              {atClient.length ? null : (
                <TextField type="search" icon="search" value={query} onChangeText={setQuery} placeholder={t(role === "tech" ? "w6.call.toSearchTech" : "w6.call.toSearch")} />
              )}
              <SheetScroll style={{ maxHeight: component.sheetListMax }} keyboardShouldPersistTaps="handled">
                {places.length === 0 ? (
                  <T v="caption" tone="mut">{t("w6.task.subjectNone")}</T>
                ) : (
                  places.map((p, i) => (
                    <View key={`${p.subjectType}-${p.subjectId}`}>
                      {i > 0 ? <Divider /> : null}
                      <ListRow title={p.label} subtitle={kind(p.subjectType)} onPress={() => setPlace((x) => ({ subjectType: p.subjectType, subjectId: p.subjectId, ...(atClient.length ? { contactId: x.contactId } : {}) }))} />
                    </View>
                  ))
                )}
              </SheetScroll>
            </View>
          )}
        </Field>
        {people.length > 1 ? (
          <Field label={t("w6.call.person")}>
            <ChoiceChips<string> value={place.contactId ?? ""} onChange={(id) => setPlace((x) => ({ ...x, contactId: id }))} items={people.map((p) => ({ key: p.id, label: p.name }))} />
          </Field>
        ) : null}
        <Field label={t("w6.call.outcome")}>
          <ChoiceChips<CallOutcome> value={outcome ?? ("" as CallOutcome)} onChange={setOutcome} items={CALL_OUTCOMES.map((o) => ({ key: o, label: t(CALL_OUTCOME[o].label) }))} />
          {!outcome ? <T v="caption" tone="mut">{t("w6.call.outcomeHint")}</T> : null}
        </Field>
        <Stepper label={t("w6.call.minutes")} unit={t("sch.min")} value={minutes} step={1} min={0} max={240} onChange={setMinutes} />
        <Field label={t("w6.call.note")}>
          <TextField type="note" value={note} onChangeText={setNote} placeholder={t("w6.call.notePh")} />
        </Field>
        <Button label={t("w6.call.save")} icon="check" variant="primary" full disabled={!ok} onPress={save} />
      </View>
    </Sheet>
  );
}
