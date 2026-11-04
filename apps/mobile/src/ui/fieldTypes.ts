import type { TextInputProps } from "react-native";
import { formatCard, formatCardExp, formatDateUS, formatEIN, formatPhoneUS, formatState, formatZip } from "./inputFormat";

/**
 * What the field holds. The type picks the keyboard, iOS/Android autofill, capitalization, autocorrect,
 * the return key and US formatting while typing. Every field must have a type (design-system guard).
 */
export type FieldType =
  | "text" | "title" | "note" | "search"
  | "name" | "company" | "jobTitle"
  | "phone" | "email" | "url" | "password" | "newPassword" | "code"
  | "street" | "city" | "state" | "zip"
  | "money" | "number" | "integer" | "percent"
  | "ein" | "cardNumber" | "cardExp" | "cardCvc" | "color"
  | "identifier" | "unit" | "date";

type KB = TextInputProps["keyboardType"];
type Spec = {
  kb?: KB;
  ac?: TextInputProps["autoComplete"];
  tc?: TextInputProps["textContentType"];
  cap?: TextInputProps["autoCapitalize"];
  correct?: boolean;
  ret?: TextInputProps["returnKeyType"];
  fmt?: (s: string) => string;
  max?: number;
  multiline?: boolean;
  secure?: boolean;
};
export const FIELD: Record<FieldType, Spec> = {
  text: { cap: "sentences" },
  title: { cap: "sentences" },
  note: { cap: "sentences", multiline: true, ret: "default" },
  search: { cap: "none", correct: false, ret: "search", ac: "off" },
  name: { cap: "words", correct: false, ac: "name", tc: "name" },
  company: { cap: "words", correct: false, ac: "organization", tc: "organizationName" },
  jobTitle: { cap: "words", ac: "organization-title", tc: "jobTitle" },
  phone: { kb: "phone-pad", ac: "tel", tc: "telephoneNumber", cap: "none", correct: false, fmt: formatPhoneUS },
  email: { kb: "email-address", ac: "email", tc: "emailAddress", cap: "none", correct: false },
  url: { kb: "url", ac: "url", tc: "URL", cap: "none", correct: false },
  password: { ac: "current-password", tc: "password", cap: "none", correct: false, secure: true },
  newPassword: { ac: "new-password", tc: "newPassword", cap: "none", correct: false, secure: true },
  code: { kb: "number-pad", ac: "one-time-code", tc: "oneTimeCode", cap: "none", correct: false, max: 8 },
  street: { cap: "words", correct: false, ac: "address-line1", tc: "streetAddressLine1" },
  city: { cap: "words", correct: false, ac: "postal-address-locality", tc: "addressCity" },
  state: { cap: "characters", correct: false, ac: "postal-address-region", tc: "addressState", fmt: formatState },
  zip: { kb: "number-pad", ac: "postal-code", tc: "postalCode", cap: "none", correct: false, fmt: formatZip },
  money: { kb: "decimal-pad", cap: "none", correct: false, ret: "done" },
  number: { kb: "decimal-pad", cap: "none", correct: false, ret: "done" },
  integer: { kb: "number-pad", cap: "none", correct: false, ret: "done" },
  percent: { kb: "decimal-pad", cap: "none", correct: false, ret: "done" },
  ein: { kb: "number-pad", cap: "none", correct: false, fmt: formatEIN },
  cardNumber: { kb: "number-pad", ac: "cc-number", tc: "creditCardNumber", cap: "none", correct: false, fmt: formatCard },
  cardExp: { kb: "number-pad", ac: "cc-exp", cap: "none", correct: false, fmt: formatCardExp },
  cardCvc: { kb: "number-pad", ac: "cc-csc", cap: "none", correct: false, max: 4 },
  color: { cap: "none", correct: false, max: 7 },
  /** license / policy / check numbers, class codes: as typed, upper case, no autocorrect */
  identifier: { cap: "characters", correct: false },
  /** ea, sq ft, hr */
  unit: { cap: "none", correct: false, max: 12 },
  /** MM/DD/YYYY */
  date: { kb: "number-pad", cap: "none", correct: false, fmt: formatDateUS },
};
export const fieldSpec = (t: FieldType) => FIELD[t];
