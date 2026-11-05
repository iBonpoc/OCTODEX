import { View } from "react-native";
import { isAssigned, isOpenVisit } from "@/features/schedule";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { radius, space, component, size } from "@octo/design-tokens";
import { isToday, useStore } from "@/data/store";
import { useI18n, type DictKey } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon, Press, T, type IconKey } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";

interface Action {
  key: string;
  label: DictKey;
  icon: IconKey;
}
/** Only what works now: a voice note appears when it works (docs/specs/13 §2.4) — no «coming in wave N». */
const ACTIONS: Action[] = [
  { key: "photo", label: "quick.photo", icon: "camera" },
  { key: "lead", label: "quick.lead", icon: "user" },
  { key: "estimate", label: "quick.estimate", icon: "invoice" },
  { key: "receipt", label: "quick.receipt", icon: "wallet" },
];

/** Center "＋": photo, lead, estimate, receipt (docs/10-build-plan.md §3). */
export function QuickActions({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { c } = useTheme();
  const { db, addPhoto } = useStore();
  const toast = useToast();

  const takePhoto = async () => {
    onClose();
    // the photo belongs to today's open visit; without one say so instead of silently doing nothing (13 §2.4)
    if (!db.visits.some((v) => isAssigned(v, db.me) && isToday(v.start) && isOpenVisit(v))) {
      toast.show(t("nav.photoNoVisit"));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 }).catch(() => null);
    if (!res || res.canceled) return;
    const visit = db.visits.find((v) => isAssigned(v, db.me) && isToday(v.start) && isOpenVisit(v));
    if (!visit) return;
    const kind = visit.step === "working" || visit.step === "signed" ? "after" : "before";
    const undo = addPhoto(visit.id, kind, res.assets[0]?.uri);
    toast.show(t("toast.photo"), undo);
  };

  const newEstimate = () => {
    onClose();
    const visit = db.visits.find((v) => isAssigned(v, db.me) && isToday(v.start) && isOpenVisit(v));
    const job = db.jobs.find((j) => j.id === visit?.jobId);
    const prop = db.properties.find((p) => p.id === job?.propertyId);
    router.push(prop ? `/estimate/new?customerId=${prop.customerId}&propertyId=${prop.id}` : "/estimate/new");
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={t("quick.title")}>
      <View style={{ gap: space[2] }}>
        {ACTIONS.map((a) => {
          return (
            <Press
              key={a.key}
              onPress={a.key === "photo" ? takePhoto : a.key === "estimate" ? newEstimate : a.key === "receipt" ? () => { onClose(); router.push("/expense/new"); } : a.key === "lead" ? () => { onClose(); router.push("/lead/new"); } : undefined}
              accessibilityRole="button"
              accessibilityLabel={t(a.label)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: space[3],
                minHeight: size.rowMax,
                paddingHorizontal: space[3],
                borderRadius: radius.inner,
                backgroundColor: c.in,
                borderWidth: 1,
                borderColor: c.bd,
              }}
            >
              <View
                style={{
                  width: component.dockBtn,
                  height: component.dockBtn,
                  borderRadius: radius.pill,
                  backgroundColor: c.acc,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name={a.icon} s={size.iconMd} color={c.onAcc} />
              </View>
              <View style={{ flex: 1 }}>
                <T v="body" w="semibold">
                  {t(a.label)}
                </T>
              </View>
            </Press>
          );
        })}
      </View>
    </Sheet>
  );
}
