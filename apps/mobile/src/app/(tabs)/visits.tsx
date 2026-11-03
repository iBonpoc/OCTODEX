import { useI18n } from "@/i18n";
import { useStore } from "@/data/store";
import { VisitCard, sortByStart, todayVisits } from "@/features/visits";
import { Empty, Grid, Screen, SectionTitle } from "@/ui/surfaces";

/** Technician home: today's visits in order, then the rest of the week. */
export default function Visits() {
  const { t, day } = useI18n();
  const { db } = useStore();
  const today = todayVisits(db, db.me);
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  const later = db.visits.filter((v) => v.techId === db.me && new Date(v.start) > now).sort(sortByStart);
  return (
    <Screen title={t("visits.title")} help={t("help.visits")} subtitle={`${day(new Date().toISOString())} · ${t("visits.count", { n: today.length })}`}>
      {today.length === 0 ? (
        <Empty icon="calendar" title={t("visits.empty")} hint={t("visits.emptyHint")} />
      ) : (
        <Grid>
          {today.map((v) => (
            <VisitCard key={v.id} v={v} />
          ))}
        </Grid>
      )}
      {later.length > 0 ? (
        <>
          <SectionTitle title={t("visits.later")} />
          <Grid>
            {later.map((v) => (
              <VisitCard key={v.id} v={v} />
            ))}
          </Grid>
        </>
      ) : null}
    </Screen>
  );
}
