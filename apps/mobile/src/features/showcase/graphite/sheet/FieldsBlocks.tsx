/**
 * «Поля» on the sheet (#2292, spec 63 §2.3): «Как сейчас» is `TextField` / `NumberField` / `DateField` of «Наряда» as they are;
 * «Вариант 1» (label over the field, 44) and «Вариант 2» (label inside, 56) are `GrTextField`. Everything types: the mask of the
 * phone, the money format on leaving, the error under the field with its icon and word. «Обязательное» and «Выключено» are small
 * switches of the block.
 */
import { useState } from "react";
import { View } from "react-native";
import { graphite } from "@octo/design-tokens";
import { space } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { Labeled } from "@/features/fields";
import { addDays, todayKey, type DayKey } from "@/features/calendar";
import { DateField } from "@/ui/dateField";
import { TextField } from "@/ui/controls";
import { formatPhoneUS } from "@/ui/inputFormat";
import { NumberField } from "@/ui/numberField";
import { formatCents, parseCents } from "@/ui/numberInput";
import { T } from "@/ui/primitives";
import { phoneDigits } from "../Controls";
import { GrTextField } from "../Fields";
import { Block, StateSwitch } from "./Block";

const SP = graphite.space;

function NoState() {
  const { t } = useI18n();
  return (
    <T v="caption" tone="mut">
      {t("ds.gr.sheet.noState")}
    </T>
  );
}

/** the value of every sample is its own: «Как сейчас», «Вариант 1», «Вариант 2» are typed separately */
const useThree = (init = "") => [useState(init), useState(init), useState(init)] as const;
/** which samples were left once (the error shows after leaving the field) */
const useLeft = () => [useState(false), useState(false), useState(false)] as const;

function TextBlock() {
  const { t } = useI18n();
  const vals = useThree();
  const left = useLeft();
  const [required, setRequired] = useState(false);
  const [off, setOff] = useState(false);
  const err = (i: 0 | 1 | 2) => (required && left[i][0] && !vals[i][0].trim() ? t("ds.gr.fld.required") : undefined);
  return (
    <Block
      id="ftext"
      title={t("ds.gr.fld.text")}
      note={t("ds.gr.fld.textNote")}
      controls={
        <View>
          <StateSwitch id="gr-ftext-required" label={t("ds.gr.fld.requiredSw")} value={required} onChange={setRequired} />
          <StateSwitch id="gr-ftext-disabled" label={t("ds.gr.sheet.disabled")} value={off} onChange={setOff} />
        </View>
      }
      now={
        <View style={{ gap: space[1] }}>
          <Labeled label={t("ds.gr.fld.name")}>
            <TextField type="name" label={t("ds.gr.fld.name")} placeholder={t("ds.gr.row1")} value={vals[0][0]} onChangeText={vals[0][1]} error={err(0)} onBlurText={() => left[0][1](true)} testID="gr-ftext-now-input" />
          </Labeled>
          {off ? <NoState /> : null}
        </View>
      }
      variants={([1, 2] as const).map((v) => (
        <GrTextField key={v} variant={v} label={t("ds.gr.fld.name")} placeholder={t("ds.gr.row1")} value={vals[v][0]} onChangeText={vals[v][1]} error={err(v)} disabled={off} onBlurText={() => left[v][1](true)} testID={`gr-ftext-v${v}-input`} />
      ))}
    />
  );
}

function PhoneBlock() {
  const { t } = useI18n();
  const vals = useThree();
  const left = useLeft();
  const [off, setOff] = useState(false);
  const err = (i: 0 | 1 | 2) => {
    const n = phoneDigits(vals[i][0]).length;
    return left[i][0] && n > 0 && n < 10 ? t("ds.gr.phoneErr") : undefined;
  };
  return (
    <Block
      id="fphone"
      title={t("ds.gr.phone")}
      note={t("ds.gr.fld.phoneNote")}
      controls={
        <View>
          <StateSwitch id="gr-fphone-disabled" label={t("ds.gr.sheet.disabled")} value={off} onChange={setOff} />
        </View>
      }
      now={
        <View style={{ gap: space[1] }}>
          <Labeled label={t("ds.gr.phone")}>
            <TextField type="phone" label={t("ds.gr.phone")} placeholder={t("ds.gr.phonePh")} icon="phone" value={vals[0][0]} onChangeText={vals[0][1]} error={err(0)} onBlurText={() => left[0][1](true)} testID="gr-fphone-now-input" />
          </Labeled>
          {off ? <NoState /> : null}
        </View>
      }
      variants={([1, 2] as const).map((v) => (
        <GrTextField key={v} kind="phone" variant={v} label={t("ds.gr.phone")} placeholder={t("ds.gr.phonePh")} value={vals[v][0]} onChangeText={(s) => vals[v][1](formatPhoneUS(s))} error={err(v)} disabled={off} onBlurText={() => left[v][1](true)} testID={`gr-fphone-v${v}-input`} />
      ))}
    />
  );
}

/** «1234.5» → «1,234.50» on leaving; a text that is not a sum shows the error */
function MoneyBlock() {
  const { t } = useI18n();
  const [cents, setCents] = useState(123450);
  const texts = [useState(formatCents(123450)), useState(formatCents(123450))] as const;
  const [off, setOff] = useState(false);
  const bad = (i: 0 | 1) => texts[i][0] !== "" && parseCents(texts[i][0]).state === "bad";
  const finish = (i: 0 | 1) => (s: string) => {
    const p = parseCents(s);
    if (p.state === "ok") texts[i][1](formatCents(p.value));
  };
  return (
    <Block
      id="fmoney"
      title={t("ds.gr.fld.money")}
      note={t("ds.gr.fld.moneyNote")}
      controls={
        <View>
          <StateSwitch id="gr-fmoney-disabled" label={t("ds.gr.sheet.disabled")} value={off} onChange={setOff} />
        </View>
      }
      now={
        <View style={{ gap: space[1] }}>
          <NumberField kind="money" label={t("ds.gr.fld.amount")} unitWord={t("ds.fields.moneyWord")} cents={cents} onChange={setCents} testID="gr-fmoney-now-input" />
          {off ? <NoState /> : null}
        </View>
      }
      variants={([1, 2] as const).map((v) => (
        <GrTextField key={v} kind="money" variant={v} prefix="$" label={t("ds.gr.fld.amount")} value={texts[v - 1][0]} onChangeText={texts[v - 1][1]} onBlurText={finish((v - 1) as 0 | 1)} error={bad((v - 1) as 0 | 1) ? t("ds.gr.fld.moneyErr") : undefined} disabled={off} testID={`gr-fmoney-v${v}-input`} />
      ))}
    />
  );
}

function NoteBlock() {
  const { t } = useI18n();
  const vals = useThree();
  const [off, setOff] = useState(false);
  return (
    <Block
      id="fnote"
      title={t("ds.gr.fld.note")}
      note={t("ds.gr.fld.noteNote")}
      controls={
        <View>
          <StateSwitch id="gr-fnote-disabled" label={t("ds.gr.sheet.disabled")} value={off} onChange={setOff} />
        </View>
      }
      now={
        <View style={{ gap: space[1] }}>
          <Labeled label={t("ds.gr.fld.noteLabel")}>
            <TextField type="note" label={t("ds.gr.fld.noteLabel")} placeholder={t("ds.gr.fld.notePh")} value={vals[0][0]} onChangeText={vals[0][1]} testID="gr-fnote-now-input" />
          </Labeled>
          {off ? <NoState /> : null}
        </View>
      }
      variants={([1, 2] as const).map((v) => (
        <GrTextField key={v} kind="note" variant={v} label={t("ds.gr.fld.noteLabel")} placeholder={t("ds.gr.fld.notePh")} value={vals[v][0]} onChangeText={vals[v][1]} disabled={off} testID={`gr-fnote-v${v}-input`} />
      ))}
    />
  );
}

/** the date has no «Вариант»: its Graphite pick lives in a sheet — it comes with the sheets */
function DateBlock() {
  const { t } = useI18n();
  const [date, setDate] = useState<DayKey | null>(() => addDays(todayKey(), 1));
  return (
    <Block
      id="fdate"
      title={t("ds.gr.fld.date")}
      note={t("ds.gr.fld.dateNote")}
      now={<DateField label={t("ds.gr.fld.dateLabel")} value={date} onChange={setDate} testID="gr-fdate-now" />}
      variants={[]}
    />
  );
}

export function FieldsBlocks() {
  return (
    <View style={{ gap: SP[3] }}>
      <TextBlock />
      <PhoneBlock />
      <MoneyBlock />
      <NoteBlock />
      <DateBlock />
    </View>
  );
}
