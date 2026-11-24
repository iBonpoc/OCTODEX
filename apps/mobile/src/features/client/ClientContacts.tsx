/**
 * The client's contacts panel of the one header's «⌄» (docs/design/visual-v2.html «⌄ в свёрнутой»: «Панель контактов 4 × 48 поверх
 * контента»): one row 48 each — the client's phones (call · SMS), his mail, the first address (route), then the other people
 * («Tom Mitchell · супруг · (626) 555-0144», call). Rows of the one list (`GroupRow`), nothing of its own; the sheets and the
 * rest of «Сведения» stay in the panel that opens in place (`ClientDetails`).
 * testIDs: `client-contacts`, `client-contact-phone-<i>`, `client-contact-mail`, `client-contact-address`, `client-contact-person-<id>`.
 */
import { Linking } from "react-native";
import { peopleOf } from "@/data/people";
import type { Customer, Person, Property } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { useDialThenAsk } from "@/features/comms/dial";
import { mailtoHref } from "@/features/contactLinks";
import { propertyTitle } from "@/features/properties";
import { GroupRow, ListGroup } from "@/ui/groupedList";
import type { ClientFacts } from "./ClientSections";

const initials = (n: string) => n.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
const PHONE_KEY: Record<string, DictKey> = { mobile: "phone.mobile", home: "phone.home", work: "phone.work", other: "phone.other" };

export function ClientContacts({ c, f, onCall, onSms, onRoute }: { c: Customer; f: ClientFacts; onCall: (p: Person, number: string) => void; onSms: (p: Person) => void; onRoute: (p: Property) => void }) {
  const { t } = useI18n();
  const dial = useDialThenAsk();
  const [me, ...others] = peopleOf(c);
  const place = f.r.properties[0];
  const mail = me?.emails[0];
  return (
    <ListGroup testID="client-contacts">
      {(me?.phones ?? []).map((ph, i) => (
        <GroupRow
          key={`ph${i}`}
          testID={`client-contact-phone-${i}`}
          lead={{ icon: "phone" }}
          title={ph.number}
          subtitle={t(PHONE_KEY[ph.label] ?? "phone.other")}
          actions={[
            { icon: "phone", a11y: `${t("client.call")} ${me.name || c.name}: ${ph.number}`, testID: `client-contact-call-${i}`, onPress: () => dial(ph.number, () => onCall(me, ph.number)) },
            ...(ph.label === "mobile" ? [{ icon: "sms" as const, a11y: `${t("cc.sms")} ${me.name || c.name}: ${ph.number}`, testID: `client-contact-sms-${i}`, onPress: () => onSms(me) }] : []),
          ]}
        />
      ))}
      {mail ? (
        <GroupRow
          testID="client-contact-mail"
          lead={{ icon: "mail" }}
          title={mail.address}
          subtitle={t("co.email")}
          onPress={() => {
            const u = mailtoHref(mail.address);
            if (u) Linking.openURL(u).catch(() => {});
          }}
        />
      ) : null}
      {place ? (
        <GroupRow
          testID="client-contact-address"
          lead={{ icon: "pin" }}
          title={propertyTitle(place)}
          subtitle={[place.city, place.label].filter(Boolean).join(" · ")}
          onPress={() => onRoute(place)}
        />
      ) : null}
      {others.map((p) => {
        const ph = p.phones[0];
        return (
          <GroupRow
            key={p.id}
            testID={`client-contact-person-${p.id}`}
            lead={{ initials: initials(p.name || c.name) }}
            title={p.name || c.name}
            subtitle={[t(`person.role.${p.role}` as DictKey), ph?.number].filter(Boolean).join(" · ")}
            actions={ph ? [{ icon: "phone", a11y: `${t("client.call")} ${p.name}: ${ph.number}`, testID: `client-contact-person-call-${p.id}`, onPress: () => dial(ph.number, () => onCall(p, ph.number)) }] : []}
          />
        );
      })}
    </ListGroup>
  );
}
