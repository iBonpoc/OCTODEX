/**
 * A module's place in a core screen (docs/specs/33-gutters-module.md П15.2): the buttons the company's usable modules add
 * here. No module switched on (or the trial over — founder О2) → nothing, the screen is as before. Home is «＋»
 * (nav/Fab.tsx), estimate and job get their place with their first content (C4b, C8).
 */
import { View } from "react-native";
import { router, type Href } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { Button } from "@/ui/controls";
import { placeActions, type ModulePlace, type PlaceCtx } from "./registry";

export function ModulePlaces({ place, ctx }: { place: Exclude<ModulePlace, "home">; ctx: Omit<PlaceCtx, "role"> }) {
  const { db, role } = useStore();
  const { t } = useI18n();
  const actions = placeActions(place, db.company, { ...ctx, role }, undefined, db.moduleData);
  if (!actions.length) return null;
  return (
    <View testID={`module-place-${place}`} style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
      {actions.map((a) => (
        <View key={`${a.module}-${a.id}`} testID={`module-${a.module}-${a.id}`}>
          <Button label={t(a.labelKey)} icon={a.icon} variant="secondary" onPress={() => router.push(a.href as Href)} />
        </View>
      ))}
    </View>
  );
}
