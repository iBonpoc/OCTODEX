/**
 * «Графит» — поля ввода (#2292, spec 63 §2.3). One text field with two looks (`variant`, the number of the showcase sheet):
 * 1 — the package: the label over the field, 44 high; 2 — the label inside the field, 56 high (a row's height).
 * Rest / focus / error / switched off. The field's fill is not the panel's, its edge ≥ 3:1 (package rule 7); the error is an
 * icon + a word under the field (never colour alone). Heights are the package's three: 44 / 52 / 56.
 */
import { useState } from "react";
import { TextInput, View } from "react-native";
import { graphite } from "@octo/design-tokens";
import { GrStatus } from "./Controls";
import { GrText, useGr } from "./theme";

const S = graphite.size;
const R = graphite.radius;
const SP = graphite.space;

export type GrFieldKind = "text" | "phone" | "note" | "money";

const KEYBOARD = { text: "default", phone: "phone-pad", note: "default", money: "decimal-pad" } as const;

export function GrTextField({
  label,
  value,
  onChangeText,
  kind = "text",
  variant = 1,
  error,
  disabled,
  placeholder,
  prefix,
  testID,
  onBlurText,
}: {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  kind?: GrFieldKind;
  variant?: 1 | 2;
  /** the word under the field; it also colours the frame */
  error?: string;
  disabled?: boolean;
  placeholder?: string;
  /** a unit in front of the text («$») */
  prefix?: string;
  /** the input; its error line is `<testID>-err` */
  testID?: string;
  /** the person left the field (the form checks or formats the value) */
  onBlurText?: (v: string) => void;
}) {
  const { g, name } = useGr();
  const [focus, setFocus] = useState(false);
  const note = kind === "note";
  const inside = variant === 2;
  const input = (
    <TextInput
      testID={testID}
      value={value}
      onChangeText={onChangeText}
      onFocus={() => setFocus(true)}
      onBlur={() => {
        setFocus(false);
        onBlurText?.(value);
      }}
      editable={!disabled}
      multiline={note}
      keyboardType={KEYBOARD[kind]}
      textContentType={kind === "phone" ? "telephoneNumber" : undefined}
      autoComplete={kind === "phone" ? "tel" : undefined}
      keyboardAppearance={name}
      placeholder={placeholder}
      placeholderTextColor={g.text2}
      selectionColor={g.focus}
      accessibilityLabel={label}
      aria-invalid={error ? true : undefined}
      style={{
        fontFamily: graphite.font.family.regular,
        fontSize: graphite.font.size.sub,
        color: g.text,
        fontVariant: ["tabular-nums"],
        minHeight: note ? S.row * 2 : S.control,
        paddingVertical: 0,
        textAlignVertical: note ? "top" : "center",
        flex: 1,
      }}
    />
  );
  return (
    <View style={{ gap: SP[1] }}>
      {inside ? null : (
        <GrText v="caption" tone="text2">
          {label}
        </GrText>
      )}
      <View
        style={{
          minHeight: note ? S.row * 2 + SP[2] : inside ? S.row : S.control,
          borderRadius: R.control,
          borderWidth: focus ? S.focus : S.edge,
          borderColor: error ? g.bad : focus ? g.focus : g.fieldEdge,
          backgroundColor: g.fieldBg,
          justifyContent: "center",
          paddingHorizontal: SP[3],
          paddingVertical: note || inside ? SP[2] : 0,
          opacity: disabled ? graphite.state.disabledDim : undefined,
        }}
      >
        {inside ? (
          <GrText v="micro" tone="text2">
            {label}
          </GrText>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center", gap: SP[1] }}>
          {prefix ? <GrText v="sub">{prefix}</GrText> : null}
          {input}
        </View>
      </View>
      {error ? <GrStatus tone="bad" label={error} testID={testID ? `${testID}-err` : undefined} /> : null}
    </View>
  );
}
