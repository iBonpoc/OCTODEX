/**
 * A module's place in a core screen (docs/specs/33-gutters-module.md П15.2): the buttons the company's usable modules add
 * here. No module switched on (or the trial over — founder О2) → nothing, the screen is as before. Home is «＋»
 * (nav/Fab.tsx), estimate and job get their place with their first content (C4b, C8).
 */
import { useRef, useState } from "react";
import { View } from "react-native";
import { router, type Href } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { Button } from "@/ui/controls";
import { Sheet } from "@/ui/overlays";
import { T } from "@/ui/primitives";
import { ListRow } from "@/ui/surfaces";
import { placeActions, type ModuleAction, type ModulePlace, type PlaceCtx } from "./registry";

export function ModulePlaces({ place, ctx }: { place: Exclude<ModulePlace, "home">; ctx: Omit<PlaceCtx, "role"> }) {
  const { db, role } = useStore();
  const { t } = useI18n();
  const actions = placeActions(place, db.company, { ...ctx, role }, undefined, db.moduleData);
  // #2271: the action whose choice sheet is open, the line said instead of a transition, the href to go to once the sheet is gone
  const [picking, setPicking] = useState<(ModuleAction & { module: string }) | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const goAfter = useRef<string | null>(null);
  if (!actions.length) return null;
  const press = (a: ModuleAction & { module: string }) => {
    if (a.noteKey) return setNote(`${a.module}-${a.id}`);
    setNote(null);
    if (a.pick) return setPicking(a);
    router.push(a.href as Href);
  };
  const noted = actions.find((a) => `${a.module}-${a.id}` === note);
  return (
    <View style={{ gap: space[2] }}>
      <View testID={`module-place-${place}`} style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
        {actions.map((a) => (
          <View key={`${a.module}-${a.id}`} testID={`module-${a.module}-${a.id}`}>
            <Button label={t(a.labelKey)} icon={a.icon} variant="secondary" onPress={() => press(a)} />
          </View>
        ))}
      </View>
      {noted?.noteKey ? (
        <View testID={`module-${noted.module}-${noted.id}-note`}>
          <T v="caption" tone="mut">{t(noted.noteKey)}</T>
        </View>
      ) : null}
      {/* one transition: a row closes the sheet, the screen opens once it is gone (a push under a leaving sheet jumps on iPhone) */}
      <Sheet
        visible={!!picking}
        title={picking?.pick ? t(picking.pick.titleKey) : undefined}
        onClose={() => setPicking(null)}
        onExited={() => {
          const href = goAfter.current;
          goAfter.current = null;
          if (href) router.push(href as Href);
        }}
      >
        {picking?.pick?.items.map((it) => (
          <View key={it.id} testID={`module-${picking.module}-${picking.id}-pick-${it.id}`}>
            <ListRow title={it.title} subtitle={it.subtitle} lines={2} onPress={() => { goAfter.current = it.href; setPicking(null); }} />
          </View>
        ))}
      </Sheet>
    </View>
  );
}
