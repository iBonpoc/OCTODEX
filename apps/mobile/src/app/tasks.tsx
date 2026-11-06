import { useState } from "react";
import { useStore } from "@/data/store";
import type { Task } from "@/data/types";
import { useI18n } from "@/i18n";
import { ChoiceChips, ProgressBar, Segmented, TextField, Button } from "@/ui/controls";
import { CardList, Empty, Screen } from "@/ui/surfaces";
import { ListCard } from "@/ui/listCard";
import { useToast } from "@/ui/overlays";
import { TaskSheet, type TaskDraft } from "@/features/tasks/TaskSheet";
import { memberName } from "@/features/team";
import {
  defaultTaskScope, filterTasks, matchTask, SUBJECT_KIND, TASK_STATE, taskCounts, taskProgress, taskState, taskSubject, taskWhen, tasksOf,
  type TaskFilter, type TaskScope,
} from "@/features/tasks/tasks";

const FILTERS: TaskFilter[] = ["open", "overdue", "done"];

/** «Задачи» (docs/specs/13 §3.7, 20 §7): progress, search, filters, one card per task with «Выполнено». */
export default function Tasks() {
  const store = useStore();
  const { db, role } = store;
  const { t, day, time } = useI18n();
  const toast = useToast();
  const [scope, setScope] = useState<TaskScope>(defaultTaskScope(role));
  const [filter, setFilter] = useState<TaskFilter>("open");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<TaskDraft | null>(null);
  const now = Date.now();
  const mine = tasksOf(db, scope);
  const progress = taskProgress(mine);
  const counts = taskCounts(mine, now);
  const list = filterTasks(mine, filter, now).filter((x) => matchTask(db, x, q));
  const newTask = () => setEdit({ subjectType: "customer", subjectId: "", title: "", assigneeId: db.me });

  const toggle = (x: Task) => {
    const r = store.saveTask({ ...x, doneAt: x.doneAt ? undefined : new Date().toISOString() });
    toast.show(t(x.doneAt ? "task.reopened" : "task.doneToast"), r.undo);
  };
  const card = (x: Task) => {
    const st = TASK_STATE[taskState(x, now)];
    const s = taskSubject(db, x);
    const who = memberName(db, x.assigneeId, t);
    const when = taskWhen(x);
    return (
      <ListCard
        key={x.id}
        testID={`task-${x.id}`}
        title={x.title}
        when={when ? (x.allDay && x.startsAt ? day(x.startsAt) : `${day(when)} · ${time(when)}`) : t("task.noDate")}
        lead={{ kind: "icon", icon: x.doneAt ? "check" : "clock", tone: st.tone }}
        status={{ tone: st.tone, label: t(st.label) }}
        tags={[s.label ? `${t(SUBJECT_KIND[s.kind])}: ${s.label}` : "", ...(who ? [who] : [])].filter(Boolean)}
        action={{ label: t(x.doneAt ? "task.undo" : "w6.task.doneBtn"), icon: x.doneAt ? "undo" : "check", onPress: () => toggle(x) }}
        onPress={() => setEdit(x)}
      />
    );
  };

  return (
    <Screen
      title={t("task.title")}
      subtitle={t("w6.task.progress", { n: progress.total, pct: progress.pct })}
      fab="tasks"
      fabOn={{ task: newTask }}
    >
      {progress.total ? <ProgressBar value={progress.done} max={progress.total} label={t("w6.task.progressA11y", { done: progress.done, n: progress.total })} /> : null}
      <Segmented<TaskScope>
        value={scope}
        onChange={setScope}
        items={[
          { key: "mine", label: t("w6.task.mine") },
          { key: "all", label: t("w6.task.all") },
        ]}
      />
      <TextField type="search" value={q} onChangeText={setQ} placeholder={t("w6.task.search")} icon="search" />
      <ChoiceChips<TaskFilter> value={filter} onChange={setFilter} items={FILTERS.map((f) => ({ key: f, label: `${t(`w6.task.f.${f}`)} · ${counts[f]}` }))} />
      {list.length === 0 ? (
        <Empty
          icon="check"
          title={t(q.trim() ? "w6.task.emptySearch" : filter === "done" ? "w6.task.emptyDone" : "task.none")}
          hint={q.trim() || filter === "done" ? undefined : t("w6.task.emptyHint")}
          action={!q.trim() && filter !== "done" ? <Button label={t("task.new")} icon="plus" variant="secondary" onPress={newTask} /> : undefined}
        />
      ) : (
        <CardList>{list.map(card)}</CardList>
      )}
      <TaskSheet value={edit} onClose={() => setEdit(null)} />
    </Screen>
  );
}
