/**
 * #1606: once, right after the first sign-in without a name (a code sign-in): «Как вас зовут?». «Сохранить» writes it
 * (store.setMyName — at once, offline through the queue), «Позже» leaves it; either way it is not asked again on this device.
 * Not over sign-in, the company setup, the client page and the legal texts; the consent gate goes first.
 */
import { useEffect, useState } from "react";
import { usePathname } from "expo-router";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/cloud/auth";
import { useStore } from "@/data/store";
import { NAME_ASKED_KEY, nameDue, parseAsked } from "@/features/nameAsk";
import { useI18n } from "@/i18n";
import { Button, TextField } from "@/ui/controls";
import { useHeldSheet } from "@/ui/heldSheet";
import { Sheet, useToast } from "@/ui/overlays";
import { T } from "@/ui/primitives";

const QUIET = /^\/(auth|p|f|legal)(\/|$)/;

export function NameAsk() {
  const auth = useAuth();
  const { t } = useI18n();
  const { db, mode, setMyName } = useStore();
  const toast = useToast();
  const path = usePathname();
  const [asked, setAsked] = useState<string[] | null>(null);
  const [name, setName] = useState("");
  useEffect(() => {
    AsyncStorage.getItem(NAME_ASKED_KEY)
      .then((v) => setAsked(parseAsked(v)))
      .catch(() => setAsked([]));
  }, []);
  const mine = db.members.find((m) => m.id === db.me)?.name;
  const due = mode === "cloud" && !!auth.session && !!auth.company && auth.legal !== "first" && auth.legal !== "changed" && !QUIET.test(path) && nameDue({ userId: auth.userId, name: mine, asked });
  const held = useHeldSheet(due ? (auth.userId as string) : null);
  if (!held.value) return null;
  const close = () => {
    const all = [...(asked ?? []), held.value as string];
    setAsked(all);
    void AsyncStorage.setItem(NAME_ASKED_KEY, JSON.stringify(all)).catch(() => {});
  };
  const save = () => {
    const undo = setMyName(name);
    close();
    toast.show(t("profile.name.saved"), undo);
  };
  return (
    <Sheet visible={held.visible} onExited={held.onExited} onClose={close} title={t("profile.name.ask")}>
      <View testID="name-ask" key={held.opening} style={{ gap: space[3] }}>
        <T v="body" tone="mut">
          {t("profile.name.hint")}
        </T>
        <TextField type="name" label={t("profile.name.label")} value={name} onChangeText={setName} onSubmit={name.trim() ? save : undefined} testID="name-ask-field" />
        <Button testID="name-ask-save" label={t("profile.name.save")} icon="check" variant="primary" full onPress={save} />
        <Button testID="name-ask-later" label={t("profile.name.later")} variant="ghost" full onPress={close} />
      </View>
    </Sheet>
  );
}
