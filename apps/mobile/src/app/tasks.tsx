import { useState } from "react";
import { useStore } from "@/data/store";
import { usePersistentState } from "@/data/persist";
import type { Task } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { TaskSheet, type TaskDraft } from "@/features/tasks/TaskSheet";
import { memberName } from "@/features/team";
import { defaultTaskScope, matchTask, SUBJECT_KIND, taskSubject, taskWhen, tasksOf, type TaskScope } from "@/features/tasks/tasks";
import { groupTasks, TASK_GROUPS, type TaskGroup } from "@/features/tasks/taskGroups";
import { Button } from "@/ui/controls";
import { filterStoreKey } from "@/ui/filterBarRules";
import { useToast } from "@/ui/overlays";
import { Empty } from "@/ui/surfaces";
import { ListScreen } from "@/ui/templates";

const GROUP_LABEL: Record<TaskGroup, DictKey> = {
  overdue: "task.overdue",
  today: "common.today",
  tomorrow: "common.tomorrow",
  later: "proto.tasks.later",
  noDate: "task.noDate",
  done: "task.doneList",
};

/**
 * Задачи — шаблон «Список» (prototype v2, wireframes-v2 №12, BUILD-SPEC §2.12, object-cards «Задача»): no «0 % готово», no status
 * chips — groups «Просрочено · Сегодня · Завтра · Позже · Без срока» (an empty group is not drawn); a row: what to do, «10:00 · лид
 * Tom Becker · Alex», on the right «✓ Выполнено» (an icon with its VoiceOver word). A swipe right — «Готово» with «Отменить» (5 s);
 * the same on a long press and to VoiceOver. A tap opens the task's sheet (it saves by itself; «Вернуть в работу» there for a done one).
 * «＋» — a new task; «⋯» — «Только мои / Все» and «Показать выполненные» (kept on this device, spec 31 §6 п.7). A tech sees «Мои» first.
 */
export default function Tasks() {
  const store = useStore();
  const { db, role } = store;
  const { t, day, time } = useI18n();
  const toast = useToast();
  const key = filterStoreKey("tasks");
  const [keptScope, setScope] = usePersistentState<TaskScope | null>(`${key}.scope`, null);
  const scope: TaskScope = keptScope ?? defaultTaskScope(role);
  const [showDone, setShowDone] = usePersistentState<boolean>(`${key}.done`, false);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<TaskDraft | null>(null);
  const mine = tasksOf(db, scope).filter((x) => matchTask(db, x, q));
  const by = groupTasks(mine);
  const groups = TASK_GROUPS.filter((g) => g !== "done" || showDone).map((g) => ({ key: g, title: t(GROUP_LABEL[g]), rows: by[g] }));
  const openN = mine.filter((x) => !x.doneAt).length;
  const newTask = () => setEdit({ subjectType: "customer", subjectId: "", title: "", assigneeId: db.me });

  const toggle = (x: Task) => {
    const r = store.saveTask({ ...x, doneAt: x.doneAt ? undefined : new Date().toISOString() });
    toast.show(store.online ? t(x.doneAt ? "task.reopened" : "task.doneToast") : t("offline.queued"), r.undo);
  };
  const row = (x: Task) => {
    const s = taskSubject(db, x);
    const when = taskWhen(x);
    const g = by.today.includes(x) || by.tomorrow.includes(x) ? "near" : "far";
    // «10:00 · лид Tom Becker · Alex»: the hour when the group already says the day, else the day
    const at = when ? (x.allDay && x.startsAt ? day(x.startsAt) : g === "near" ? time(when) : `${day(when)} ${time(when)}`) : undefined;
    const subject = s.label ? `${t(SUBJECT_KIND[s.kind]).toLowerCase()} ${s.label}` : undefined;
    const who = memberName(db, x.assigneeId, t);
    return {
      key: x.id,
      testID: `task-${x.id}`,
      title: x.title,
      subtitle: [at, subject, who].filter(Boolean).join(" · ") || undefined,
      lead: { icon: x.doneAt ? ("check" as const) : ("clock" as const) },
      actions: [
        x.doneAt
          ? { icon: "undo" as const, a11y: `${t("task.undo")}: ${x.title}`, onPress: () => toggle(x), testID: `task-undo-${x.id}` }
          : { icon: "check" as const, a11y: `${t("w6.task.doneBtn")}: ${x.title}`, onPress: () => toggle(x), testID: `task-done-${x.id}` },
      ],
      // #2350: a swipe right marks it done (or brings a done one back) — the same toggle as the button, with «Отменить»
      swipe: { left: [{ key: "done", label: t(x.doneAt ? "swipe.reopen" : "swipe.done"), icon: x.doneAt ? ("undo" as const) : ("check" as const), tone: x.doneAt ? undefined : ("ok" as const), full: true, onPress: () => toggle(x), testID: `task-swipe-${x.id}` }] },
      onPress: () => setEdit(x),
    };
  };
  return (
    <>
      <ListScreen<Task>
        testID="tasks"
        title={t("task.title")}
        count={openN}
        create={{ a11y: t("task.new"), items: [{ key: "task", label: t("task.new"), icon: "check", testID: "tasks-create-new" }] }}
        onCreate={newTask}
        search={{ placeholder: t("w6.task.search"), value: q, onChange: setQ }}
        groups={groups}
        row={row}
        more={[
          { key: "scope", label: t(scope === "mine" ? "proto.tasks.showAll" : "proto.tasks.showMine"), icon: "users", testID: "tasks-more-scope" },
          { key: "done", label: t(showDone ? "proto.tasks.hideDone" : "proto.tasks.showDone"), icon: "check", testID: "tasks-more-done" },
        ]}
        onMore={(k) => (k === "scope" ? setScope(scope === "mine" ? "all" : "mine") : setShowDone(!showDone))}
        empty={
          <Empty
            icon="check"
            title={t(q.trim() ? "w6.task.emptySearch" : "task.none")}
            hint={q.trim() ? undefined : t("w6.task.emptyHint")}
            action={q.trim() ? undefined : <Button testID="tasks-empty-new" label={t("task.new")} icon="plus" variant="secondary" onPress={newTask} />}
          />
        }
      />
      <TaskSheet value={edit} onClose={() => setEdit(null)} />
    </>
  );
}
