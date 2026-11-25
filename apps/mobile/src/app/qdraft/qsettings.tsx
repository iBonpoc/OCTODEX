// ЧЕРНОВИК для документа вопросов основателю (#2552): «Настройки приложения» как должно быть по ДС §12.3.
// Только src/ui и токены; данные — константы. Не для влития.
import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { component, space } from "@octo/design-tokens";
import { Screen, SectionTitle } from "@/ui/surfaces";
import { ListGroup, GroupRow } from "@/ui/groupedList";
import { SelectField } from "@/ui/selectField";
import { ToggleRow } from "@/ui/toggleRow";
import { StatusNote } from "@/ui/statusNote";
import { BrandLogo } from "@/ui/brand";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";

export default function QSettings() {
  const toast = useToast();
  const [theme, setTheme] = useState<"system" | "dark" | "light">("system");
  const [lang, setLang] = useState<"ru" | "en" | "es">("ru");
  const [vib, setVib] = useState(true);
  const [done, setDone] = useState(false);
  const [loc, setLoc] = useState(true);
  const [push, setPush] = useState(false);
  const [pLeads, setPLeads] = useState(true);
  const [pPaid, setPPaid] = useState(true);
  const [off, setOff] = useState(false);
  return (
    <Screen title="Настройки приложения" back={() => router.back()}>
      <SectionTitle title="Вид и язык" />
      <ListGroup inset={space[4]}>
        <View style={{ padding: space[3], gap: space[2] }}>
          <SelectField label="Тема" value={theme} onChange={setTheme} items={[{ key: "system", label: "Как в системе" }, { key: "dark", label: "Тёмная" }, { key: "light", label: "Светлая" }]} />
          <SelectField label="Язык" value={lang} onChange={setLang} items={[{ key: "ru", label: "Русский" }, { key: "en", label: "English" }, { key: "es", label: "Español" }]} />
        </View>
        <View style={{ paddingHorizontal: space[4] }}>
          <ToggleRow label="Вибрация" caption="Лёгкий отклик на нажатия" value={vib} onChange={setVib} />
        </View>
      </ListGroup>
      <SectionTitle title="План" />
      <ListGroup inset={space[4]}>
        <View style={{ paddingHorizontal: space[4] }}>
          <ToggleRow label="Показывать выполненные" caption="Сделанные выезды остаются в Плане" value={done} onChange={setDone} />
        </View>
      </ListGroup>
      <SectionTitle title="Местоположение" />
      <ListGroup inset={space[4]}>
        <View style={{ paddingHorizontal: space[4] }}>
          <ToggleRow label="Делиться во время выезда" caption="Только от «В пути» до «Готово»" value={loc} onChange={setLoc} />
        </View>
      </ListGroup>
      <SectionTitle title="Уведомления" />
      <ListGroup inset={space[4]}>
        <View style={{ paddingHorizontal: space[4] }}>
          <ToggleRow label="На этом телефоне" value={push} onChange={setPush} />
        </View>
        <View style={{ padding: space[4], gap: space[2] }}>
          <StatusNote tone="warn">Уведомления запрещены в настройках телефона</StatusNote>
        </View>
        <GroupRow compact title="Открыть настройки телефона" chevron onPress={() => undefined} />
      </ListGroup>
      <SectionTitle title="Что присылать" />
      <ListGroup inset={space[4]}>
        <View style={{ paddingHorizontal: space[4] }}>
          <ToggleRow label="Новые лиды" value={pLeads} onChange={setPLeads} />
        </View>
        <View style={{ paddingHorizontal: space[4] }}>
          <ToggleRow label="Оплаты" value={pPaid} onChange={setPPaid} />
        </View>
      </ListGroup>
      <SectionTitle title="Подсказки" />
      <ListGroup inset={space[4]}>
        <GroupRow compact title="Показать подсказки снова" onPress={() => toast.show("Подсказки покажутся снова")} />
      </ListGroup>
      <SectionTitle title="О приложении" />
      <ListGroup inset={space[4]}>
        <View style={{ alignItems: "center", gap: space[2], paddingVertical: space[4] }}>
          <BrandLogo width={component.brand.about} />
          <T v="caption" tone="mut" tabular>
            Версия 1.0.0 · сборка 2549
          </T>
        </View>
        <GroupRow compact title="Проверить обновление" chevron onPress={() => undefined} />
        <GroupRow compact title="Условия использования" subtitle="Редакция Nov 20, 2026" chevron onPress={() => undefined} />
        <GroupRow compact title="Политика конфиденциальности" subtitle="Редакция Nov 20, 2026" chevron onPress={() => undefined} />
        <GroupRow compact title="Помощь" chevron onPress={() => undefined} />
        <GroupRow compact title="Дизайн-система" chevron onPress={() => undefined} />
      </ListGroup>
      <SectionTitle title="Для проверки" />
      <ListGroup inset={space[4]}>
        <View style={{ paddingHorizontal: space[4] }}>
          <ToggleRow label="Работа без сети" value={off} onChange={setOff} />
        </View>
        <GroupRow compact title="Сбросить примеры" onPress={() => toast.show("Примеры сброшены")} />
      </ListGroup>
      <T v="caption" tone="mut">
        Только в демо: проверить, как приложение работает без сети.
      </T>
    </Screen>
  );
}
