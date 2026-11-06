/**
 * Wave 7б-2 (docs/specs/03 §12, Б1): consent, the points of the open visit screen, and what the office sees.
 * No background, no push: a point is taken at a step change and every 5 min while the visit screen is open.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, View } from "react-native";
import { useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import { space, size } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { Visit } from "@/data/types";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, ChoiceChips } from "@/ui/controls";
import { Icon, T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Card, RowView } from "@/ui/surfaces";
import { usePersistentState } from "@/data/persist";
import { assigneesOf, isSharingStep, lastPoint, LOCATION_OFF, nearAddress, officeLines, SEND_EVERY_MS, shouldAskConsent, shouldShare } from "./location";

/** asked once per person and company on this device; afterwards the person changes it in «My settings» */
export const askedKey = (companyId: string | undefined, me: string) => `octo.locationAsked.v1:${companyId ?? "demo"}:${me}`;
function useAsked() {
  const { db } = useStore();
  return usePersistentState<boolean>(askedKey(db.company?.id, db.me), false);
}

/** ON with a toast that tells the result: «on» with «Отменить», or the refusal (the step itself is never touched) */
function useSwitchOn() {
  const { setLocationConsent } = useStore();
  const toast = useToast();
  const { t } = useI18n();
  return () => {
    const change = setLocationConsent(true);
    void change.done.then((ok) => toast.show(t(ok ? "loc7b.agreed" : "loc7b.failed"), ok ? change.undo : undefined));
  };
}

/** the question before the first «On the way» on my own visit: `ask(then)` runs `then` right away when there is
 *  nothing to ask; the step goes whatever the answer, and the consent never takes the step back */
export function useConsentQuestion(v: Visit | undefined) {
  const { db, online } = useStore();
  const toast = useToast();
  const { t } = useI18n();
  const [asked, setAsked, ready] = useAsked();
  const switchOn = useSwitchOn();
  const [pending, setPending] = useState<null | (() => void)>(null);
  const ask = (then: () => void) => {
    if (ready && v && shouldAskConsent(db.location, asked, v, db.me)) setPending(() => then);
    else then();
  };
  const answer = (on: boolean) => {
    const then = pending;
    setPending(null);
    then?.();
    // offline: not now (switching on goes only online); asked again next time
    if (on && !online) toast.show(t("loc7b.needOnline"));
    else if (on) switchOn();
    if (!on || online) setAsked(true);
  };
  const sheet = <LocationConsentSheet visible={pending !== null} onAnswer={answer} />;
  return { ask, sheet };
}

export function LocationConsentSheet({ visible, onAnswer }: { visible: boolean; onAnswer: (on: boolean) => void }) {
  const { t } = useI18n();
  return (
    <Sheet visible={visible} onClose={() => onAnswer(false)} title={t("loc7b.noticeTitle")}>
      <View style={{ gap: space[3] }}>
        <T v="body">{t("loc7b.notice")}</T>
        <Button label={t("loc7b.agree")} full onPress={() => onAnswer(true)} />
        <Button label={t("loc7b.notNow")} variant="ghost" full onPress={() => onAnswer(false)} />
      </View>
    </Sheet>
  );
}

/** «My settings → Location»: only when the company allows it; turning it off deletes the points (toast with Undo) */
export function LocationSetting() {
  const { db, setLocationConsent, online } = useStore();
  const toast = useToast();
  const { t } = useI18n();
  const [, setAsked] = useAsked();
  const switchOn = useSwitchOn();
  const loc = db.location ?? LOCATION_OFF;
  if (!loc.allowed) return null;
  return (
    <Card>
      <T v="heading">{t("loc7b.title")}</T>
      <T v="caption" tone="mut">
        {t("loc7b.hint")}
      </T>
      <ChoiceChips
        value={loc.on ? "on" : "off"}
        onChange={(k) => {
          const on = k === "on";
          if (on === loc.on) return;
          if (on && !online) return toast.show(t("loc7b.needOnline"));
          setAsked(true);
          if (on) return switchOn();
          // off goes through the queue; «Отменить» while it waits keeps it on (offline the undo needs no server)
          toast.show(t("loc7b.stopped"), setLocationConsent(false).undo);
        }}
        items={[
          { key: "off", label: t("loc7b.off") },
          { key: "on", label: t("loc7b.on") },
        ]}
      />
    </Card>
  );
}

/** the tech's own visit screen: sends points while it is open and the visit is under way; says when it does */
export function useVisitLocation(v: Visit, geo?: { lat: number; lng: number }) {
  const { db, recordVisitPoint } = useStore();
  const sharing = shouldShare(db.location, v, db.me);
  const [denied, setDenied] = useState(false);
  const busy = useRef(false);
  // the step the screen last sent a point for: a point at a new step is «status_change», on opening — «foreground»
  const lastStep = useRef<string | null>(null);
  // the store's functions are new on every render: keep the latest in a ref, so the focus effect runs only when the
  // visit, its step or the consent change (otherwise a point → a render → a new effect → a point … without end)
  const send = useRef({ recordVisitPoint, me: db.me });
  send.current = { recordVisitPoint, me: db.me };
  useFocusEffect(
    useCallback(() => {
      if (!sharing) return;
      const take = async (source: "status_change" | "foreground") => {
        // never from a hidden tab or a phone in the background (the web keeps timers running there)
        if (AppState.currentState !== "active" || (typeof document !== "undefined" && document.visibilityState === "hidden")) return;
        if (busy.current) return;
        busy.current = true;
        try {
          const perm = await Location.requestForegroundPermissionsAsync();
          if (perm.status !== "granted") return setDenied(true);
          setDenied(false);
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const { recordVisitPoint: record, me } = send.current;
          record(
            { visitId: v.id, userId: me, lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy ?? undefined, at: new Date().toISOString() },
            source,
          );
        } catch {
          // no fix (indoors, timeout): the next tick tries again; nothing to tell the tech
        } finally {
          busy.current = false;
        }
      };
      void take(lastStep.current !== null && lastStep.current !== v.step ? "status_change" : "foreground");
      lastStep.current = v.step;
      const timer = setInterval(() => void take("foreground"), SEND_EVERY_MS);
      const sub = AppState.addEventListener("change", (s) => s === "active" && void take("foreground"));
      return () => {
        clearInterval(timer);
        sub.remove();
      };
    }, [sharing, v.id, v.step]),
  );
  const mine = sharing ? lastPoint(db.visitPoints, v.id, db.me) : null;
  return { sharing, denied, near: sharing && nearAddress(v.step, mine, geo) };
}

/** a small line on the tech's screen while points go out */
export function SharingBadge({ denied }: { denied: boolean }) {
  const { t } = useI18n();
  const { c } = useTheme();
  return (
    <RowView gap={space[1]}>
      <Icon name={denied ? "alert" : "pin"} s={size.iconSm} color={denied ? c.status.warn.text : c.mut} />
      <T v="caption" tone={denied ? "warn" : "mut"} style={{ flex: 1 }}>
        {t(denied ? "loc7b.denied" : "loc7b.sharing")}
      </T>
    </RowView>
  );
}

/** the office on an open visit: «Mike · 2.1 mi from the address · 3 min ago» per person on it */
export function OfficeLocation({ v, geo }: { v: Visit; geo?: { lat: number; lng: number } }) {
  const { db } = useStore();
  const { t } = useI18n();
  const { c } = useTheme();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const loc = db.location ?? LOCATION_OFF;
  if (!loc.allowed || !isSharingStep(v.step)) return null;
  const lines = officeLines(db, v, geo, now);
  const nameOf = (id: string) => db.members.find((m) => m.id === id)?.name ?? "—";
  // the visit's step in words: «В пути» before the address, «На месте» once there (the server: en_route / on_site)
  const step = t(v.step === "en_route" ? "st.en_route" : "st.on_site").toLocaleLowerCase();
  const silent = assigneesOf(v).filter((id) => !lines.some((l) => l.userId === id) && (id === db.me ? !loc.on : db.members.find((m) => m.id === id)?.sharesLocation === false));
  if (!lines.length && !silent.length) return null;
  return (
    <Card>
      {lines.map((l) => (
        <RowView key={l.userId} gap={space[1]}>
          <Icon name="pin" s={size.iconSm} color={c.mut} />
          <T v="body" tone={l.stale ? "mut" : undefined} style={{ flex: 1 }}>
            {l.stale
              ? t("loc7b.officeStale", { who: nameOf(l.userId), min: l.minutesAgo })
              : l.miles
                ? t("loc7b.office", { who: nameOf(l.userId), step, mi: l.miles, min: l.minutesAgo })
                : t("loc7b.officeNoGeo", { who: nameOf(l.userId), step, min: l.minutesAgo })}
          </T>
        </RowView>
      ))}
      {silent.map((id) => (
        <T key={id} v="caption" tone="mut">
          {t("loc7b.officeOff", { who: nameOf(id) })}
        </T>
      ))}
    </Card>
  );
}

/** the tech's part of the visit screen: the «sharing» line and, near the address, the hint right above «On site» */
export function TechLocation({ v, geo }: { v: Visit; geo?: { lat: number; lng: number } }) {
  const { t } = useI18n();
  const { c } = useTheme();
  const { sharing, denied, near } = useVisitLocation(v, geo);
  if (!sharing) return null;
  return (
    <>
      <SharingBadge denied={denied} />
      {near ? (
        <RowView gap={space[1]}>
          <Icon name="check" s={size.iconSm} color={c.status.ok.text} />
          <T v="heading" style={{ flex: 1 }}>
            {t("loc7b.near")}
          </T>
        </RowView>
      ) : null}
    </>
  );
}
