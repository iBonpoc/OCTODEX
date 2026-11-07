import { useState } from "react";
import { View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { router, type Href } from "expo-router";
import { component, radius, size, space, z } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon, Press, T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { fabItems, type FabCtx, type FabItem, type FabSet } from "./sections";
import { placeActions } from "@/modules/registry";

/**
 * «＋» of a screen (docs/specs/13 v2 §2.4, §2.5; 13а §9). The set comes from sections.ts (FAB_SETS) by screen and role.
 * Phone: a round button floating bottom-right (the main action, accent). 820/1280: a plain «＋» in the screen's header,
 * «＋ Создать» in the side menu opens the home set. One item = the button does it at once; more = a sheet.
 * Replaces the old QuickActions.
 */
export interface FabProps {
  set: FabSet;
  ctx?: FabCtx;
  /** actions only the screen can do (Plan: «Записать в план» opens its own sheet) */
  on?: Partial<Record<NonNullable<FabItem["act"]>, () => void>>;
}

/** the items this screen offers this role, with the actions the screen did not wire left out */
export function useFabItems({ set, ctx, on }: FabProps): FabItem[] {
  const { role, db } = useStore();
  const core = fabItems(set, role, ctx).filter((it) => !it.act || it.act === "photo" || !!on?.[it.act]);
  if (set !== "home") return core;
  // the home «＋»: what the company's usable modules add («Замерить здесь», docs/specs/33 П15.2); none — as before
  const mods = placeActions("home", db.company, { role }).map((a): FabItem => ({ id: `module.${a.module}.${a.id}`, label: a.labelKey, icon: a.icon, href: a.href }));
  return [...core, ...mods];
}

function useRun({ ctx, on }: Pick<FabProps, "ctx" | "on">) {
  const { t } = useI18n();
  const { db, addPhoto } = useStore();
  const toast = useToast();
  const takePhoto = async (visitId: string) => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 }).catch(() => null);
    if (!res || res.canceled) return;
    const v = db.visits.find((x) => x.id === visitId);
    if (!v) return;
    const kind = v.step === "working" || v.step === "signed" ? "after" : "before";
    toast.show(t("toast.photo"), addPhoto(v.id, kind, res.assets[0]?.uri));
  };
  return (it: FabItem) => {
    if (it.href) router.push(it.href as Href);
    else if (it.act === "photo" && ctx?.visitId) void takePhoto(ctx.visitId);
    else if (it.act) on?.[it.act]?.();
  };
}

/** the sheet with the set's items (also «＋ Создать» in ☰: set "home") */
export function FabSheet({ visible, onClose, ...p }: FabProps & { visible: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { c } = useTheme();
  const items = useFabItems(p);
  const run = useRun(p);
  return (
    <Sheet visible={visible} onClose={onClose} title={t("quick.title")}>
      <View style={{ gap: space[2] }}>
        {items.map((a) => (
          <Press
            key={a.id}
            testID={`fab-${a.id}`}
            onPress={() => {
              onClose();
              run(a);
            }}
            accessibilityRole="button"
            accessibilityLabel={t(a.label)}
            style={{ flexDirection: "row", alignItems: "center", gap: space[3], minHeight: size.rowMax, paddingHorizontal: space[3], borderRadius: radius.inner, backgroundColor: c.in, borderWidth: component.hairline, borderColor: c.bd }}
          >
            <View style={{ width: component.dockBtn, height: component.dockBtn, borderRadius: radius.pill, backgroundColor: c.surf2, alignItems: "center", justifyContent: "center" }}>
              <Icon name={a.icon} s={size.iconMd} color={c.ink} />
            </View>
            <T v="body" w="semibold" style={{ flex: 1 }}>
              {t(a.label)}
            </T>
          </Press>
        ))}
      </View>
    </Sheet>
  );
}

/** the «＋» button: `float` = phone, bottom-right; `header` = 820/1280, in the screen's header. Nothing to offer — no button. */
/** `right`: the screen's right edge — the notch in landscape (docs/specs/32) */
export function Fab({ placement, bottom = 0, right = space[4], ...p }: FabProps & { placement: "float" | "header"; bottom?: number; right?: number }) {
  const { t } = useI18n();
  const { c } = useTheme();
  const items = useFabItems(p);
  const run = useRun(p);
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  const one = items.length === 1 ? items[0]! : undefined;
  const label = one ? t(one.label) : t("nav.create");
  const press = () => (one ? run(one) : setOpen(true));
  const sheet = one ? null : <FabSheet {...p} visible={open} onClose={() => setOpen(false)} />;
  if (placement === "header")
    return (
      <>
        <Press
          testID="fab-header"
          onPress={press}
          visibleHeight={component.button.sm}
          accessibilityRole="button"
          accessibilityLabel={label}
          aria-haspopup={one ? undefined : "dialog"}
          style={{ flexDirection: "row", alignItems: "center", gap: space[2], height: component.button.sm, paddingHorizontal: space[3], borderRadius: radius.pill, backgroundColor: c.surf2, borderWidth: component.hairline, borderColor: c.bd }}
        >
          <Icon name="plus" s={size.iconSm} color={c.ink} />
          <T v="button" numberOfLines={1}>
            {label}
          </T>
        </Press>
        {sheet}
      </>
    );
  return (
    <>
      <View pointerEvents="box-none" style={{ position: "absolute", right, bottom, zIndex: z.fab }}>
        <Press
          testID="fab"
          onPress={press}
          visibleHeight={component.fab}
          accessibilityRole="button"
          accessibilityLabel={label}
          aria-haspopup={one ? undefined : "dialog"}
          style={{ width: component.fab, height: component.fab, borderRadius: radius.pill, backgroundColor: c.acc, alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="plus" s={size.iconMd} color={c.onAcc} />
        </Press>
      </View>
      {sheet}
    </>
  );
}
