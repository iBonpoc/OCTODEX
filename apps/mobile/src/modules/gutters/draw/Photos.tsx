/**
 * Photos of a measurement or of one drawn element (docs/specs/33-gutters-screens.md П21.10 M5d). The core's photo strip
 * (camera on a phone, a file on the web); a photo goes through the module's queue (photo.add → files.measurement_id /
 * element_id) and is on the phone at once. Removing → «Отменить» 5 s (rule 5). `readOnly` — the module does not save
 * (founder О2: after the trial drafts open for reading): the photos are shown, nothing is added or removed. A photo
 * from the server shows as an icon, like a visit's photo.
 */
import { View } from "react-native";
import * as Crypto from "expo-crypto";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { PhotoStrip } from "@/features/PhotoStrip";
import { useI18n } from "@/i18n";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { addPhoto, photosOf, removePhoto } from "../data";

export function MeasurePhotos({ measurementId, elementId, testID, onRemoved, readOnly }: { measurementId: string; elementId?: string; testID: string; readOnly?: boolean; /** a sheet that holds the strip closes: the toast with «Отменить» is under it otherwise */ onRemoved?: () => void }) {
  const store = useStore();
  const toast = useToast();
  const { t } = useI18n();
  const title = t(elementId ? "mod.gutters.photo.element" : "mod.gutters.photo.measurement");
  const photos = photosOf(store.db, measurementId, elementId).map((f) => ({ id: f.id, kind: "before" as const, uri: f.uri }));
  const add = (uri?: string) => {
    addPhoto(store, { id: Crypto.randomUUID(), measurementId, elementId, uri, at: new Date().toISOString() });
  };
  const remove = (id: string) => {
    const undo = removePhoto(store, id);
    onRemoved?.();
    if (typeof undo === "function") toast.show(t("photo.deleted"), undo as () => void);
  };
  return (
    <View style={{ gap: space[2] }} testID={testID}>
      <T v="caption" tone="mut" w="semibold">{`${title} · ${photos.length}`}</T>
      <PhotoStrip photos={photos} onAdd={readOnly ? undefined : add} onRemove={readOnly ? undefined : remove} title={title} />
    </View>
  );
}
