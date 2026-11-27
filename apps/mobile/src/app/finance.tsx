import { Redirect } from "expo-router";

/**
 * «Деньги» is ONE screen (#3025, founder 26.11: «нажимаю кнопку меню Деньги — одна вкладка… нажимаю „Все“ — другая вкладка Деньги
 * с другим видом»; crm review 27.11): the tab opens the lists «Сметы · Счета · Оплаты» on «Счета» (/invoice). The overview that
 * stood here repeated «Главная»'s figures («Должны», «Получено сегодня») — gone; an old link /finance comes to the same screen.
 */
export default function Finance() {
  return <Redirect href="/invoice" />;
}
