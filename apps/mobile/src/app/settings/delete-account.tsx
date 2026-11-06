import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useAuth } from "@/cloud/auth";
import { useI18n } from "@/i18n";
import { Button, StatusChip, TextField, Toggle } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Card, Divider, ListRow, RowView, Screen, SectionTitle } from "@/ui/surfaces";
import { accountErrorKey, CONFIRM_WORD, deleteBlock, normalizeWord, wordOk, type AccountErrorKey, type OwnedCompany } from "@/features/deleteAccount";
import { deleteAccount, myLastOwnerCompanies, sendDeleteCode, transferOwnership, verifyDeleteCode } from "@/cloud/account";

/**
 * «Мои настройки» → «Удалить аккаунт» (wave 7а-2b, story map S22; docs/specs/19 §6.10–§6.12; Apple 5.1.1(v)).
 * One column: what goes and what stays → the code from the email (a fresh sign-in) → the companies where I am the last
 * owner (hand over now, or close with the account) → the word → «Удалить навсегда» (asks first). Never queued: without
 * the network every action says «Нужна сеть». The demo shows the screen and explains that there is no account.
 */
export default function DeleteAccount() {
  const { t, lang } = useI18n();
  const { online, queue, mode } = useStore();
  const auth = useAuth();
  const toast = useToast();
  const account = !!auth.session;
  // only the cloud's unsent changes block it (signed in without a company the store is «demo»: its queue never goes out)
  const unsent = mode === "cloud" ? queue.length : 0;
  const email = auth.email ?? "";

  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [fresh, setFresh] = useState(false);
  const [word, setWord] = useState("");
  const [companies, setCompanies] = useState<OwnedCompany[] | null>(null);
  const [closing, setClosing] = useState<Record<string, boolean>>({});
  const [transfer, setTransfer] = useState<{ co: OwnedCompany; to?: { id: string; name: string } } | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null); // the company the server named
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false); // the server did not settle it: «Повторить удаление» (§6.12)
  // one action at a time: `busy` disables the buttons only after a render — two quick taps would both go (review №4)
  const lock = useRef(false);
  const once = (fn: () => Promise<unknown>) => async () => {
    if (lock.current) return;
    lock.current = true;
    try {
      await fn();
    } finally {
      lock.current = false;
    }
  };

  const say = (k: AccountErrorKey) => toast.show(t(k));
  const needNet = () => {
    if (online) return true;
    toast.show(t("acct.needNet"));
    return false;
  };

  const loadCompanies = useCallback(async () => {
    if (!auth.userId) return;
    try {
      setCompanies(await myLastOwnerCompanies(auth.userId));
    } catch (e) {
      say(accountErrorKey((e as Error).message));
    }
  }, [auth.userId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (account && online) void loadCompanies();
  }, [account, online, loadCompanies]);

  const undecided = (companies ?? []).filter((c) => !closing[c.companyId]).length;
  const block = deleteBlock({ account, unsent, fresh, wordOk: wordOk(word, lang), undecided });

  const getCode = once(async () => {
    if (!needNet()) return;
    if (!account) return toast.show(t("acct.demoNoAccount"));
    setBusy(true);
    const err = await sendDeleteCode(email);
    setBusy(false);
    if (err) return say(accountErrorKey(err));
    setCodeSent(true);
    toast.show(t("acct.code.sent", { email }));
  });
  const checkCode = once(async () => {
    if (!needNet()) return;
    setBusy(true);
    const err = await verifyDeleteCode(email, code);
    setBusy(false);
    // a wrong or old code — «Код не подошёл»; no network or a rate limit — their own words (review №3)
    if (err) {
      const k = accountErrorKey(err);
      return say(k === "acct.err.failed" || k === "acct.err.signIn" ? "acct.err.code" : k);
    }
    setFresh(true);
    void loadCompanies();
  });
  const doTransfer = once(async () => {
    if (!transfer?.to || !needNet()) return;
    setBusy(true);
    try {
      await transferOwnership(transfer.co.companyId, transfer.to.id);
      toast.show(t("acct.co.transferred", { person: transfer.to.name, name: transfer.co.name }));
      setTransfer(null);
      await auth.reloadMemberships();
      await loadCompanies();
    } catch (e) {
      const k = accountErrorKey((e as Error).message);
      if (k === "acct.err.fresh") setFresh(false);
      say(k);
    } finally {
      setBusy(false);
    }
  });
  const doDelete = once(async () => {
    setSure(false);
    if (!needNet()) return;
    setBusy(true);
    setFailed(false);
    const closeCompanies = (companies ?? []).filter((c) => closing[c.companyId]).map((c) => c.companyId);
    const out = await deleteAccount(normalizeWord(word), closeCompanies);
    setBusy(false);
    if (out.ok) {
      // LegalGate takes the person to the sign-in screen and says «Аккаунт удалён»
      auth.setAccountDeleted(true);
      return;
    }
    if (out.key === "acct.err.retry" || out.key === "acct.err.network") setFailed(true);
    if (out.key === "acct.err.fresh") setFresh(false);
    if (out.key === "acct.err.lastOwner") {
      setBlocked(out.companyId ?? null);
      void loadCompanies();
    }
    say(out.key);
  });

  return (
    <Screen title={t("acct.title")} back={() => (router.canGoBack() ? router.back() : router.replace("/settings"))}>
      {!account ? (
        <Card status="info">
          <View testID="acct-demo">
            <T v="body">{t("acct.demo")}</T>
          </View>
        </Card>
      ) : null}

      <SectionTitle title={t("acct.gone.title")} />
      <Card>
        <View testID="acct-gone" style={{ gap: space[1] }}>
          {(["name", "signIn", "prefs", "location", "notes"] as const).map((k) => (
            <T key={k} v="body">· {t(`acct.gone.${k}`)}</T>
          ))}
        </View>
      </Card>
      <SectionTitle title={t("acct.kept.title")} />
      <Card>
        <View testID="acct-kept" style={{ gap: space[1] }}>
          {(["work", "history", "signed", "consent", "contact", "calendar"] as const).map((k) => (
            <T key={k} v="body">· {t(`acct.kept.${k}`)}</T>
          ))}
          <T v="caption" tone="mut">{t("acct.kept.provider")}</T>
        </View>
      </Card>

      {unsent > 0 ? (
        <Card status="warn">
          <RowView>
            <StatusChip status="warn" label={t("acct.unsentChip")} />
            <T v="body" style={{ flex: 1 }}>{t("acct.unsent", { n: unsent })}</T>
          </RowView>
        </Card>
      ) : null}

      <SectionTitle title={t("acct.code.title")} />
      <Card>
        {fresh ? (
          <RowView>
            <StatusChip status="ok" label={t("acct.code.ok")} />
          </RowView>
        ) : (
          <>
            <T v="caption" tone="mut">{t("acct.code.hint", { email: email || "—" })}</T>
            <Button label={t("acct.code.send")} icon="mail" variant="secondary" disabled={busy || unsent > 0} onPress={getCode} />
            <TextField type="code" value={code} onChangeText={setCode} placeholder={t("acct.code.placeholder")} label={t("acct.code.placeholder")} />
            <Button label={t("acct.code.check")} icon="check" variant="secondary" disabled={!account || !codeSent || code.trim().length < 6 || busy} onPress={checkCode} />
          </>
        )}
      </Card>

      {companies?.length ? (
        <>
          <SectionTitle title={t("acct.co.title")} />
          {companies.map((co) => (
            <Card key={co.companyId} status={blocked === co.companyId ? "warn" : undefined}>
              <View testID="acct-company" style={{ gap: space[2] }}>
                <T v="body" w="semibold">{t("acct.co.last", { name: co.name })}</T>
                {co.admins.length ? (
                  <Button label={t("acct.co.transfer")} icon="user" variant="secondary" disabled={!fresh || busy} onPress={() => setTransfer({ co })} />
                ) : (
                  <T v="caption" tone="mut">{t("acct.co.noAdmins")}</T>
                )}
                <RowView style={{ justifyContent: "space-between" }}>
                  <T v="body" style={{ flex: 1 }}>{t("acct.co.close")}</T>
                  <Toggle label={t("acct.co.close")} on={!!closing[co.companyId]} onChange={(v) => setClosing((x) => ({ ...x, [co.companyId]: v }))} />
                </RowView>
                {closing[co.companyId] ? <T v="caption" tone="warn">{t(co.others ? "acct.co.closeHint" : "acct.co.closeHintAlone", { n: co.others })}</T> : null}
              </View>
            </Card>
          ))}
        </>
      ) : null}

      <SectionTitle title={t("acct.word.title", { word: CONFIRM_WORD[lang] })} />
      <Card>
        <TextField type="text" value={word} onChangeText={setWord} placeholder={CONFIRM_WORD[lang]} label={t("acct.word.title", { word: CONFIRM_WORD[lang] })} />
        {failed ? (
          // asked already; the answer was lost — the same deletion once more (the server answers «repeat» if it is done)
          <Button label={t("acct.retry")} icon="sync" variant="danger" full disabled={busy} onPress={doDelete} />
        ) : (
          <Button label={t("acct.delete")} icon="trash" variant="danger" full disabled={block !== null || busy} onPress={() => needNet() && setSure(true)} />
        )}
      </Card>

      {/* «Передать компанию»: choose an admin (rows), then a question — it cannot be undone (rule 5) */}
      <Sheet visible={!!transfer} onClose={() => setTransfer(null)} title={transfer ? t("acct.co.transferTo", { name: transfer.co.name }) : undefined}>
        {transfer && !transfer.to ? (
          <View>
            {transfer.co.admins.map((a, i) => (
              <View key={a.id}>
                {i > 0 ? <Divider /> : null}
                <ListRow title={a.name} onPress={() => setTransfer({ ...transfer, to: a })} />
              </View>
            ))}
          </View>
        ) : transfer?.to ? (
          <View testID="acct-transfer-sure" style={{ gap: space[2] }}>
            <T v="body">{t("acct.co.transferSure", { name: transfer.co.name, person: transfer.to.name })}</T>
            <Button label={t("acct.co.transferYes")} icon="user" variant="danger" full disabled={busy} onPress={doTransfer} />
            <Button label={t("common.cancel")} variant="ghost" full onPress={() => setTransfer(null)} />
          </View>
        ) : null}
      </Sheet>

      <Sheet visible={sure} onClose={() => setSure(false)} title={t("acct.sure.title")}>
        <View testID="acct-delete-sure" style={{ gap: space[2] }}>
          <T v="body">{t("acct.sure.text")}</T>
          {(companies ?? []).filter((c) => closing[c.companyId]).map((c) => (
            <T key={c.companyId} v="body" tone="warn">{t(c.others ? "acct.sure.closes" : "acct.sure.closesAlone", { name: c.name, n: c.others })}</T>
          ))}
          <Button label={t("acct.sure.yes")} icon="trash" variant="danger" full disabled={busy} onPress={doDelete} />
          <Button label={t("common.cancel")} variant="ghost" full onPress={() => setSure(false)} />
        </View>
      </Sheet>
    </Screen>
  );
}
