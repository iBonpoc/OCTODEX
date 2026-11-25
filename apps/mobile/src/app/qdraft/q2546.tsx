// ЧЕРНОВИК (#2546): «Настройки» в сборке магазина — тот же экран, без строки «Дизайн-система». Не для влития.
import { useState } from "react";
import { router } from "expo-router";
import { Screen, SectionTitle, Card } from "@/ui/surfaces";
import { Segmented, ChoiceChips, Button } from "@/ui/controls";
import { T } from "@/ui/primitives";

export default function Q2546() {
  const [theme, setTheme] = useState<"system" | "dark" | "light">("system");
  const [lang, setLang] = useState<"ru" | "en" | "es">("ru");
  const [done, setDone] = useState<"hide" | "show">("hide");
  return (
    <Screen title="Настройки приложения" back={() => router.back()}>
      <SectionTitle title="Вид и язык" />
      <Card>
        <T v="heading">Тема</T>
        <Segmented full value={theme} onChange={setTheme} items={[{ key: "system", label: "Как в системе" }, { key: "dark", label: "Тёмная" }, { key: "light", label: "Светлая" }]} />
      </Card>
      <Card>
        <T v="heading">Язык</T>
        <Segmented full value={lang} onChange={setLang} items={[{ key: "ru", label: "Русский" }, { key: "en", label: "English" }, { key: "es", label: "Español" }]} />
      </Card>
      <SectionTitle title="План" />
      <Card>
        <T v="heading">Показывать выполненные</T>
        <T v="caption" tone="mut">Сделанные выезды остаются в Плане</T>
        <ChoiceChips value={done} onChange={setDone} items={[{ key: "hide", label: "Скрывать выполненные" }, { key: "show", label: "Показывать выполненные" }]} />
      </Card>
      <Card>
        <T v="heading">Подсказки</T>
        <T v="caption" tone="mut">Подсказки на экранах можно показать снова</T>
        <Button label="Показать подсказки снова" icon="help" variant="secondary" onPress={() => undefined} />
      </Card>
    </Screen>
  );
}
