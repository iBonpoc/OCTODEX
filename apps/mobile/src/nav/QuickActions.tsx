import { View } from "react-native";
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
  /** build wave that delivers it; undefined = works now */
  wave?: number;
  hint?: DictKey;
}
const ACTIONS: Action[] = [
  { key: "voice", label: "quick.voice", icon: "mic", wave: 6, hint: "quick.voiceHint" },
  { key: "photo", label: "quick.photo", icon: "camera" },
  { key: "lead", label: "quick.lead", icon: "user" },
  { key: "estimate", label: "quick.estimate", icon: "invoice" },
  { key: "receipt", label: "quick.receipt", icon: "wallet" },
];

/** Center "＋": voice note, lead, estimate, photo, receipt (docs/10-build-plan.md §3). */
export function QuickActions({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { c } = useTheme();
  const { db, addPhoto } = useStore();
  const toast = useToast();

  const takePhoto = async () => {
    onClose();
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 }).catch(() => null);
    if (!res || res.canceled) return;
    const visit = db.visits.find((v) => v.techId === db.me && isToday(v.start) && v.step !== "paid");
    if (!visit) return;
    const kind = visit.step === "working" || visit.step === "signed" ? "after" : "before";
    const undo = addPhoto(visit.id, kind, res.assets[0]?.uri);
    toast.show(t("toast.photo"), undo);
  };

  const newEstimate = () => {
    onClose();
    const visit = db.visits.find((v) => v.techId === db.me && isToday(v.start) && v.step !== "paid");
    const job = db.jobs.find((j) => j.id === visit?.jobId);
    const prop = db.properties.find((p) => p.id === job?.propertyId);
    router.push(prop ? `/estimate/new?customerId=${prop.customerId}&propertyId=${prop.id}` : "/estimate/new");
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={t("quick.title")}>
      <View style={{ gap: space[2] }}>
        {ACTIONS.map((a) => {
          const disabled = a.wave !== undefined;
          return (
            <Press
              key={a.key}
              disabled={disabled}
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
                  backgroundColor: disabled ? c.surf2 : c.acc,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name={a.icon} s={size.iconMd} color={disabled ? c.ink : c.onAcc} />
              </View>
              <View style={{ flex: 1 }}>
                <T v="body" w="semibold">
                  {t(a.label)}
                </T>
                {disabled ? (
                  <T v="caption" tone="mut">
                    {a.hint ? `${t(a.hint)} · ` : ""}
                    {t("quick.soon", { n: a.wave ?? 0 })}
                  </T>
                ) : null}
              </View>
            </Press>
          );
        })}
      </View>
    </Sheet>
  );
}
