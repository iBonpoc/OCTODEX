import { useRef } from "react";
import * as ImagePicker from "expo-image-picker";
import { madeHere } from "./photoUri";
import { prepPicked, type PickedPhoto } from "@/data/photoShrink";
import { useI18n } from "@/i18n";
import { useToast } from "@/ui/overlays";

/**
 * Taking a photo for the app (moved out of PhotoStrip for #3085, its behaviour unchanged): the camera when allowed, else the
 * library (DS А12 З26 — the permission sheet is still to come); the photo made anew once here (#642), the original never sent
 * (#1558) — `onAdd` gets the new file; one that could not be made anew yet goes to `onAddPreparing`, or (none) a toast says to
 * add it again. A second tap while the photo is being made smaller does nothing (no second picker, no photo twice).
 */
export function usePhotoPick(onAdd?: (uri: string, small?: true) => void, onAddPreparing?: (p: Extract<PickedPhoto, { preparing: unknown }>) => void) {
  const { t } = useI18n();
  const toast = useToast();
  const busy = useRef(false);
  const pickOne = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync().catch(() => null);
    const res =
      perm?.granted
        ? await ImagePicker.launchCameraAsync({ quality: 1 }).catch(() => null)
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 }).catch(() => null);
    if (!res || res.canceled) return;
    const got = await prepPicked(res);
    if (!got) return;
    if ("uri" in got) {
      madeHere(got.uri);
      onAdd?.(got.uri, got.small);
    } else if (onAddPreparing) {
      madeHere(got.preparing.uri);
      onAddPreparing(got);
    } else toast.show(t("photoUp.prep.notAdded"));
  };
  return async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      await pickOne();
    } finally {
      busy.current = false;
    }
  };
}
