import { useI18n } from "@/i18n";
import { StatusNote } from "@/ui/statusNote";

/**
 * «Выше лимита CA для home improvement» under the deposit (#1377): a warning colour is always an icon and a word
 * (rule 2, DS §3.1 п.2) — StatusNote; nothing is blocked, the owner decides.
 */
export function CaWarn({ limitCents, testID }: { limitCents: number; testID: string }) {
  const { t, money } = useI18n();
  return (
    <StatusNote tone="warn" testID={testID}>
      {t("ue.caWarn", { limit: money(limitCents) })}
    </StatusNote>
  );
}
