import { scheduleSettingsOf } from "@/features/scheduleSettings";
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { haptics } from "@/ui/haptics";
import { component, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { ID } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { uid } from "@/features/estimateDoc";
import { Labeled } from "@/features/fields";
import { canCreateJob, canDateNewJob, servable } from "@/features/newJob";
import { ServiceCategoryRow } from "@/features/ServiceCategoryPicker";
import { NotifySheet, useVisitForm, VisitFormFields } from "@/features/VisitForm";
import { Button, ChoiceChips, Segmented, StatusChip, TextField } from "@/ui/controls";
import { Sheet, useToast } from "@/ui/overlays";
import { T } from "@/ui/primitives";
import { Card, Divider, Empty, ListRow, RowView, Screen, SectionTitle } from "@/ui/surfaces";

const NEW = "__new";

/**
 * «Новая работа» — one form (S17; docs/specs/17-job.md §7.3, 13 §3.5): client (pick or new) → address (a property of
 * the client or a new one) → name, type, direction, description → «Назначить позже» or a date (the same visit form and
 * «Сообщить клиенту?» as S9). Sales: only «Назначить позже». Offline: queued, «Новая работа» until the number comes.
 */
export default function NewJob() {
  const params = useLocalSearchParams<{ customerId?: string; propertyId?: string }>();
  const store = useStore();
  const { db } = store;
  const { t } = useI18n();
  const toast = useToast();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/jobs"));
  const f = useVisitForm({ durationMin: scheduleSettingsOf(db.company).jobMin });

  const preset = db.customers.find((c) => c.id === params.customerId && servable(c));
  const [customerId, setCustomerId] = useState<ID | typeof NEW | undefined>(preset?.id);
  const [propertyId, setPropertyId] = useState<ID | typeof NEW | undefined>(
    preset ? (db.properties.find((p) => p.id === params.propertyId && p.customerId === preset.id)?.id ?? db.properties.find((p) => p.customerId === preset.id)?.id) : undefined,
  );
  const [picker, setPicker] = useState(false);
  const [q, setQ] = useState("");
  // a new client (13 §3.3: name and one way to reach; the address of the job is the first property)
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const types = (db.jobTypes ?? []).filter((x) => !x.archivedAt).sort((a, b) => a.position - b.position);
  const [jobTypeId, setJobTypeId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<ID | undefined>();
  const dating = canDateNewJob(store.role);
  const [when, setWhen] = useState<"later" | "date">("later");
  const [notifyId, setNotifyId] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  // one tap = one job: the button stays off once saved (a double tap made two clients and two jobs)
  const [saved, setSaved] = useState(false);

  const newClient = customerId === NEW;
  const newAddress = newClient || propertyId === NEW;
  const client = newClient ? undefined : db.customers.find((c) => c.id === customerId);
  const props = client ? db.properties.filter((p) => p.customerId === client.id) : [];
  const rows = useMemo(
    () =>
      db.customers
        .filter(servable)
        .filter((c) => !q.trim() || `${c.name} ${c.phone} ${db.properties.filter((p) => p.customerId === c.id).map((p) => p.address).join(" ")}`.toLowerCase().includes(q.trim().toLowerCase()))
        .slice(0, 50),
    [db.customers, db.properties, q],
  );

  if (!canCreateJob(store.role))
    return (
      <Screen title={t("job3.newJob")} back={back}>
        <Empty icon="wrench" title={t("job3.new.noRight")} />
      </Screen>
    );

  const phoneOk = phone.replace(/\D/g, "").length >= 7;
  const clientOk = newClient ? name.trim().length >= 2 && (phoneOk || email.includes("@")) : !!client;
  const addressOk = newAddress ? !!address.trim() : !!propertyId;
  const titleOk = !!title.trim() && title.trim().length <= 200;
  const dateOk = when === "later" || !f.past;
  const ok = clientOk && addressOk && titleOk && dateOk && !saved;

  const save = () => {
    if (!ok) return;
    setSaved(true);
    haptics.success();
    const undos: (() => void)[] = [];
    let cid = client?.id;
    let pid = newAddress ? undefined : (propertyId as ID);
    if (newClient) {
      const sourceId = db.sources.find((x) => x.active && x.name === "Referral")?.id ?? db.sources[0]?.id ?? "";
      const r = store.addCustomer({ name: name.trim(), phone: phone.trim(), email: email.trim() || undefined, sourceId, address: address.trim(), city: city.trim() });
      undos.push(r.undo);
      cid = r.id;
      pid = r.propertyId;
    } else if (newAddress && cid) {
      pid = uid();
      undos.push(store.saveProperty({ id: pid, customerId: cid, address: address.trim(), city: city.trim(), stories: 1 }));
    }
    if (!cid || !pid) return;
    const job = store.addJob({ customerId: cid, propertyId: pid, title, description, jobTypeId: jobTypeId || undefined, serviceCategoryId: categoryId });
    undos.push(job.undo);
    // «Отменить» takes back everything this form made and leaves the job's screen (it would show an empty job)
    const undoAll = () => {
      undos.reverse().forEach((u) => u());
      setNotifyId(null);
      setCreatedId(null);
      setSaved(false);
      router.replace("/job/new");
    };
    if (dating && when === "date") {
      const visitId = uid();
      undos.push(store.scheduleJob(job.id, { ...f.value, visitId }));
      toast.show(store.online ? t("job3.new.created") : t("offline.queued"), undoAll);
      setCreatedId(job.id);
      setNotifyId(visitId);
      return;
    }
    toast.show(store.online ? t("job3.new.created") : t("offline.queued"), undoAll);
    router.replace(`/job/${job.id}`);
  };

  const missing: DictKey | null = !clientOk ? "job3.new.needClient" : !addressOk ? "job3.new.needAddress" : !titleOk ? "job3.new.needTitle" : null;

  return (
    <Screen title={t("job3.newJob")} back={back}>
      <SectionTitle title={t("job3.new.client")} />
      {client ? (
        <Card>
          <RowView style={{ justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <T v="heading">{client.name}</T>
              {client.phone ? (
                <T v="caption" tone="mut">
                  {client.phone}
                </T>
              ) : null}
            </View>
            <Button label={t("job3.new.change")} size="sm" variant="ghost" onPress={() => setPicker(true)} />
          </RowView>
        </Card>
      ) : newClient ? (
        <Card>
          <Labeled label={t("lead.name")}>
            <TextField type="name" value={name} onChangeText={setName} placeholder={t("lead.name")} icon="user" />
          </Labeled>
          <Labeled label={t("co.phone")}>
            <TextField type="phone" value={phone} onChangeText={setPhone} placeholder="(555) 555-0100" icon="phone" />
          </Labeled>
          <Labeled label={t("co.email")}>
            <TextField type="email" value={email} onChangeText={setEmail} placeholder="client@example.com" icon="message" />
          </Labeled>
          <Button label={t("job3.new.pickInstead")} size="sm" variant="ghost" onPress={() => setPicker(true)} />
        </Card>
      ) : (
        <RowView style={{ flexWrap: "wrap" }}>
          <Button label={t("job3.new.pick")} icon="search" variant="secondary" onPress={() => setPicker(true)} />
          <Button label={t("job3.new.newClient")} icon="plus" variant="ghost" onPress={() => setCustomerId(NEW)} />
        </RowView>
      )}

      {customerId ? (
        <>
          <SectionTitle title={t("job3.new.address")} />
          {!newClient ? (
            <ChoiceChips
              items={[...props.map((p) => ({ key: p.id, label: p.address })), { key: NEW, label: t("job3.new.newAddress") }]}
              value={(propertyId ?? "") as string}
              onChange={(k) => setPropertyId(k)}
            />
          ) : null}
          {newAddress ? (
            <Card>
              <Labeled label={t("co.street")}>
                <TextField type="street" value={address} onChangeText={setAddress} placeholder={t("co.street")} icon="pin" />
              </Labeled>
              <Labeled label={t("co.city")}>
                <TextField type="city" value={city} onChangeText={setCity} placeholder="Pasadena, CA 91103" />
              </Labeled>
            </Card>
          ) : null}
        </>
      ) : null}

      <SectionTitle title={t("job3.new.job")} />
      <Card>
        <Labeled label={t("job3.new.title")}>
          <View testID="job-new-title">
            <TextField type="title" value={title} onChangeText={setTitle} placeholder={t("job3.new.titlePh")} />
          </View>
        </Labeled>
        {types.length ? (
          <Labeled label={t("job3.type")}>
            <ChoiceChips
              items={types.map((x) => ({ key: x.id, label: x.name ?? (x.seedKey ? t(`job3.jt.${x.seedKey}` as DictKey) : "") }))}
              value={jobTypeId}
              onChange={setJobTypeId}
            />
          </Labeled>
        ) : null}
        <Labeled label={t("job3.desc")}>
          <TextField type="note" value={description} onChangeText={setDescription} placeholder={t("job3.desc")} />
        </Labeled>
      </Card>
      <ServiceCategoryRow value={categoryId} onChange={setCategoryId} />

      {dating ? (
        <>
          <SectionTitle title={t("job3.schedule")} />
          <Segmented
            full
            value={when}
            onChange={setWhen}
            items={[
              { key: "later", label: t("job3.new.later") },
              { key: "date", label: t("job3.new.date") },
            ]}
          />
          {when === "date" ? <VisitFormFields f={f} /> : null}
        </>
      ) : (
        <T v="caption" tone="mut">
          {t("job3.new.salesLater")}
        </T>
      )}

      {missing ? <StatusChip status="neutral" label={t(missing)} soft /> : null}
      <Button label={t("job3.new.create")} icon="check" variant="primary" full disabled={!ok} onPress={save} />

      <Sheet visible={picker} onClose={() => setPicker(false)} title={t("job3.new.pick")}>
        <View style={{ gap: space[3] }}>
          <TextField type="search" value={q} onChangeText={setQ} placeholder={t("job3.new.search")} icon="search" />
          <Button
            label={t("job3.new.newClient")}
            icon="plus"
            variant="ghost"
            onPress={() => {
              setCustomerId(NEW);
              setPropertyId(undefined);
              setPicker(false);
            }}
          />
          <ScrollView style={{ maxHeight: component.sheetListMax }} keyboardShouldPersistTaps="handled">
            {rows.length === 0 ? <StatusChip status="neutral" label={t("clients.empty")} /> : null}
            {rows.map((c, i) => {
              const ps = db.properties.filter((p) => p.customerId === c.id);
              return (
                <View key={c.id}>
                  {i > 0 ? <Divider /> : null}
                  <ListRow
                    title={c.name}
                    subtitle={[c.phone, ps[0]?.address].filter(Boolean).join(" · ")}
                    onPress={() => {
                      setCustomerId(c.id);
                      setPropertyId(ps[0]?.id ?? NEW);
                      setPicker(false);
                    }}
                  />
                </View>
              );
            })}
          </ScrollView>
        </View>
      </Sheet>
      <NotifySheet
        visitId={notifyId}
        onClose={() => {
          setNotifyId(null);
          if (createdId) router.replace(`/job/${createdId}`);
        }}
      />
    </Screen>
  );
}
