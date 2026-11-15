import * as ImagePicker from "expo-image-picker";
import { madeHere } from "@/features/photoUri";
import { shrinkPicked } from "@/data/photoShrink";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { useToast } from "@/ui/overlays";

/**
 * «Фото» on a visit: the picker, then the photo is made smaller (#642), kept and queued. «До» before the work, «После» once it is
 * working or signed. One place for the visit's pinned panel (DS §8.9) and the «＋» sheet.
 */
export function useVisitPhoto() {
  const { t } = useI18n();
  const { db, addPhoto } = useStore();
  const toast = useToast();
  return async (visitId: string) => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 }).catch(() => null);
    if (!res || res.canceled) return;
    const v = db.visits.find((x) => x.id === visitId);
    if (!v) return;
    const kind = v.step === "working" || v.step === "signed" ? "after" : "before";
    const uri = await shrinkPicked(res);
    if (!uri) return;
    madeHere(uri);
    toast.show(t("toast.photo"), addPhoto(v.id, kind, uri));
  };
}
