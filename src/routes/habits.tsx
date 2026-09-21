import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Archive,
  ArchiveRestore,
  Flame,
  GripVertical,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { SectionTitle, categoryOf } from "@/components/ui-bits";
import { useHabits } from "@/lib/habit-store";
import {
  CATEGORIES,
  XP_BY_DIFFICULTY,
  type Difficulty,
  type Frequency,
  type Habit,
  type HabitSort,
  type HabitView,
} from "@/lib/habit-types";

export const Route = createFileRoute("/habits")({
  head: () => ({
    meta: [
      { title: "Your habits — HabitQuest" },
      {
        name: "description",
        content:
          "Create, edit, archive or delete habits. Pick category, frequency, times per day, reminder and difficulty.",
      },
      { property: "og:title", content: "Your habits — HabitQuest" },
      {
        property: "og:description",
        content: "Design the habit set that levels you up every day.",
      },
    ],
  }),
  component: HabitsPage,
});

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];
const FREQS: { key: Frequency; label: string }[] = [
  { key: "daily", label: "Every day" },
  { key: "weekdays", label: "Weekdays" },
  { key: "custom", label: "Custom" },
];
const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const SORTS: { key: HabitSort; label: string }[] = [
  { key: "manual", label: "Manual order" },
  { key: "alpha", label: "A → Z" },
  { key: "created", label: "Newest first" },
  { key: "category", label: "By group" },
  { key: "streak", label: "Most completed" },
];

function keyOf(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function HabitsPage() {
  const {
    ready,
    state,
    addHabit,
    updateHabit,
    setArchived,
    deleteHabit,
    reorderHabits,
    completedToday,
    setUser,
  } = useHabits();
  const [editing, setEditing] = useState<Habit | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Habit | null>(null);

  const sort = state.user.habitSort ?? "manual";
  const view = state.user.habitView ?? "list";

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  );

  const stats = useMemo(() => {
    const total = new Map<string, number>();
    const first = new Map<string, string>();
    const last = new Map<string, string>();
    for (const c of state.completions) {
      total.set(c.habitId, (total.get(c.habitId) ?? 0) + 1);
      if (!first.has(c.habitId) || c.date < first.get(c.habitId)!) first.set(c.habitId, c.date);
      if (!last.has(c.habitId) || c.date > last.get(c.habitId)!) last.set(c.habitId, c.date);
    }
    return { total, first, last };
  }, [state.completions]);

  const streakFor = (habitId: string) => {
    const dates = new Set(
      state.completions.filter((c) => c.habitId === habitId).map((c) => c.date),
    );
    let n = 0;
    for (let i = 0; i < 400; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      if (dates.has(keyOf(d))) n++;
      else if (i > 0) break;
    }
    return n;
  };

  function SortableHabitCard({
    habit,
    sort,
    renderCard,
  }: {
    habit: Habit;
    sort: HabitSort;
    renderCard: (h: Habit) => React.ReactNode;
  }) {
    const sortable = useSortable({ id: habit.id, disabled: sort !== "manual" });
    const style = {
      transform: CSS.Transform.toString(sortable.transform),
      transition: sortable.transition,
    };

    if (sort !== "manual") {
      return <>{renderCard(habit)}</>;
    }

    return (
      <div
        ref={sortable.setNodeRef}
        style={style}
        className={`relative ${sortable.isDragging ? "opacity-60" : ""}`}
      >
        {renderCard(habit)}
        <div
          {...sortable.attributes}
          {...sortable.listeners}
          role="button"
          aria-label="Drag to reorder"
          className="absolute -left-2 top-1/2 z-10 grid size-11 -translate-y-1/2 cursor-grab place-items-center rounded-xl text-muted-foreground active:cursor-grabbing active:bg-muted"
        >
          <GripVertical className="size-5" />
        </div>
      </div>
    );
  }

  const sorted = useMemo(() => {
    const list = [...state.habits];
    if (sort === "alpha") list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "created") list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    else if (sort === "category")
      list.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    else if (sort === "streak")
      list.sort((a, b) => (stats.total.get(b.id) ?? 0) - (stats.total.get(a.id) ?? 0));
    return list;
  }, [state.habits, sort, stats]);

  const active = sorted.filter((h) => h.active);
  const archived = sorted.filter((h) => !h.active);

  const renderCard = (habit: Habit) => {
    const cat = categoryOf(habit.category);
    const totalDone = stats.total.get(habit.id) ?? 0;

    if (view === "compact") {
      return (
        <button
          key={habit.id}
          type="button"
          onClick={() => setEditing(habit)}
          className={`card-soft flex items-center gap-2 p-3 text-left ${habit.active ? "" : "opacity-60"}`}
        >
          <span
            className="grid size-9 shrink-0 place-items-center rounded-xl text-lg"
            style={{ backgroundColor: `color-mix(in oklab, var(--${cat.color}) 18%, transparent)` }}
          >
            {habit.icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-extrabold">{habit.name}</span>
            <span className="block truncate text-[11px] font-bold text-muted-foreground">
              {totalDone} done · +{habit.xpReward}
            </span>
          </span>
        </button>
      );
    }

    return (
      <article key={habit.id} className={`card-soft p-4 ${habit.active ? "" : "opacity-70"}`}>
        <div className="flex items-center gap-3">
          <span
            className="grid size-12 shrink-0 place-items-center rounded-2xl text-2xl"
            style={{ backgroundColor: `color-mix(in oklab, var(--${cat.color}) 18%, transparent)` }}
          >
            {habit.icon}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-extrabold">{habit.name}</h2>
            <p className="truncate text-xs font-bold text-muted-foreground">
              {cat.icon} {cat.label} ·{" "}
              {habit.frequency === "custom"
                ? habit.days.map((d) => DAY_LABELS[d]).join("")
                : habit.frequency === "daily"
                  ? "Every day"
                  : "Weekdays"}{" "}
              · {habit.reminder}
              {habit.timesPerDay > 1 ? ` · ×${habit.timesPerDay}/day` : ""}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-accent/30 px-2.5 py-1 text-xs font-extrabold text-accent-foreground">
            +{habit.xpReward}
          </span>
        </div>

        {!habit.active ? (
          <p className="mt-3 rounded-2xl bg-muted px-3 py-2 text-xs font-bold text-muted-foreground">
            Archived{habit.archivedAt ? ` on ${habit.archivedAt}` : ""} · history kept
            {stats.first.get(habit.id)
              ? ` (${stats.first.get(habit.id)} → ${stats.last.get(habit.id)})`
              : ""}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-extrabold">
          <span className="inline-flex items-center gap-1 rounded-full bg-flame/15 px-2.5 py-1 text-flame">
            <Flame className="size-3.5" /> {streakFor(habit.id)}d
          </span>
          <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
            {totalDone} done
          </span>
          <span className="rounded-full bg-muted px-2.5 py-1 capitalize text-muted-foreground">
            {habit.difficulty}
          </span>
          {completedToday.has(habit.id) ? (
            <span className="rounded-full bg-success-soft px-2.5 py-1 text-success">Done today</span>
          ) : null}

          <span className="ml-auto flex items-center gap-1">
            <button
              type="button"
              aria-label={habit.active ? `Archive ${habit.name}` : `Restore ${habit.name}`}
              onClick={() => {
                setArchived(habit.id, habit.active);
                toast.success(
                  habit.active
                    ? `${habit.name} archived — history kept, hidden from today`
                    : `${habit.name} is active again`,
                );
              }}
              className="grid size-11 place-items-center rounded-xl text-muted-foreground hover:bg-muted"
            >
              {habit.active ? <Archive className="size-5" /> : <ArchiveRestore className="size-5" />}
            </button>
            <button
              type="button"
              aria-label={`Edit ${habit.name}`}
              onClick={() => setEditing(habit)}
              className="grid size-11 place-items-center rounded-xl text-muted-foreground hover:bg-muted"
            >
              <Pencil className="size-5" />
            </button>
            <button
              type="button"
              aria-label={`Delete ${habit.name}`}
              onClick={() => setConfirmDelete(habit)}
              className="grid size-11 place-items-center rounded-xl text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="size-5" />
            </button>
          </span>
        </div>
      </article>
    );
  };

  const listClass = view === "compact" ? "grid grid-cols-2 gap-2" : "space-y-3";

  function handleDragEnd(event: DragEndEvent) {
    const { active: dragged, over } = event;
    if (!over || dragged.id === over.id) return;
    const oldIndex = active.findIndex((h) => h.id === dragged.id);
    const newIndex = active.findIndex((h) => h.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const newOrder = arrayMove(active.map((h) => h.id), oldIndex, newIndex);
    reorderHabits(newOrder);
  }

  return (
    <AppShell>
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <h1 className="truncate text-2xl">Your habits</h1>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="btn-pop inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-2xl bg-primary px-4 text-sm font-extrabold text-primary-foreground"
        >
          <Plus className="size-5" /> New
        </button>
      </header>

      <div className="mt-4 flex items-center gap-2">
        <label className="sr-only" htmlFor="sort">
          Sort habits
        </label>
        <select
          id="sort"
          value={sort}
          onChange={(e) => setUser({ habitSort: e.target.value as HabitSort })}
          className="min-h-11 flex-1 rounded-2xl border-2 border-border bg-card px-3 text-sm font-extrabold text-foreground outline-none focus:border-primary"
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label={view === "list" ? "Switch to thumbnail view" : "Switch to list view"}
          onClick={() => setUser({ habitView: view === "list" ? "compact" : "list" })}
          className="grid size-11 shrink-0 place-items-center rounded-2xl border-2 border-border text-muted-foreground hover:border-primary hover:text-primary"
        >
          {view === "list" ? <LayoutGrid className="size-5" /> : <List className="size-5" />}
        </button>
      </div>

      {ready && state.habits.length === 0 ? (
        <div className="card-soft mt-8 px-6 py-12 text-center">
          <div className="text-5xl">🌱</div>
          <h2 className="mt-3 text-xl">Your journey starts here.</h2>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">
            Create your first habit and start earning XP.
          </p>
        </div>
      ) : null}

      {active.length ? (
        <section className="mt-6">
          <SectionTitle hint={`${active.length}`}>Active</SectionTitle>
          {sort === "manual" ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis, restrictToParentElement]}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={active.map((h) => h.id)}
                strategy={rectSortingStrategy}
              >
                <div className={listClass}>
                  {active.map((habit) => (
                    <SortableHabitCard key={habit.id} habit={habit} sort={sort} renderCard={renderCard} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className={listClass}>{active.map(renderCard)}</div>
          )}
        </section>
      ) : null}

      {archived.length ? (
        <section className="mt-8">
          <SectionTitle hint={`${archived.length}`}>Archived</SectionTitle>
          <p className="mb-3 text-xs font-semibold text-muted-foreground">
            These no longer appear in your daily check, but every completion stays in your history.
          </p>
          <div className={listClass}>{archived.map(renderCard)}</div>
        </section>
      ) : null}

      {editing ? (
        <HabitEditor
          habit={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(data) => {
            if (editing === "new") addHabit(data);
            else updateHabit(editing.id, data);
            setEditing(null);
          }}
        />
      ) : null}

      {confirmDelete ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/60 p-6">
          <div className="card-soft animate-pop-in w-full max-w-sm p-6 text-center">
            <Trash2 className="mx-auto size-10 text-destructive" />
            <h2 className="mt-3 text-xl">Delete {confirmDelete.name}?</h2>
            <p className="mt-2 text-sm font-semibold text-muted-foreground">
              This also erases its history ({stats.total.get(confirmDelete.id) ?? 0} completions).
              Archive it instead to keep the record.
            </p>
            <button
              type="button"
              onClick={() => {
                setArchived(confirmDelete.id, true);
                setConfirmDelete(null);
                toast.success("Archived — history kept");
              }}
              className="btn-pop mt-5 min-h-12 w-full rounded-2xl bg-primary text-sm font-extrabold uppercase tracking-wide text-primary-foreground"
            >
              Archive instead
            </button>
            <button
              type="button"
              onClick={() => {
                deleteHabit(confirmDelete.id);
                setConfirmDelete(null);
                toast.success("Habit deleted");
              }}
              className="mt-2 min-h-12 w-full rounded-2xl text-sm font-extrabold text-destructive hover:bg-destructive/10"
            >
              Delete forever
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(null)}
              className="mt-1 min-h-12 w-full rounded-2xl text-sm font-extrabold text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

function HabitEditor({
  habit,
  onSave,
  onClose,
}: {
  habit: Habit | null;
  onSave: (h: Omit<Habit, "id" | "createdAt">) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(habit?.name ?? "");
  const [icon, setIcon] = useState(habit?.icon ?? "🏃");
  const [category, setCategory] = useState(habit?.category ?? "fitness");
  const [frequency, setFrequency] = useState<Frequency>(habit?.frequency ?? "daily");
  const [days, setDays] = useState<number[]>(habit?.days ?? [1, 3, 5]);
  const [reminder, setReminder] = useState(habit?.reminder ?? "19:00");
  const [difficulty, setDifficulty] = useState<Difficulty>(habit?.difficulty ?? "medium");
  const [timesPerDay, setTimesPerDay] = useState(habit?.timesPerDay ?? 1);

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-foreground/50 sm:place-items-center">
      <div className="card-soft max-h-[92vh] w-full max-w-[520px] overflow-y-auto rounded-b-none p-6 sm:rounded-b-3xl">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <h2 className="truncate text-xl">
            {habit ? "Edit habit" : "What habit do you want to build?"}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-muted"
          >
            <X className="size-5" />
          </button>
        </div>

        <label className="mt-5 block text-xs font-extrabold uppercase tracking-widest text-muted-foreground">
          Name
        </label>
        <div className="mt-2 flex gap-2">
          <input
            value={icon}
            onChange={(e) => setIcon(e.target.value.slice(0, 2))}
            aria-label="Habit icon"
            className="w-16 rounded-2xl border-2 border-border bg-background px-3 py-3 text-center text-2xl outline-none focus:border-primary"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Run 5 km"
            className="min-w-0 flex-1 rounded-2xl border-2 border-border bg-background px-4 py-3 text-base font-bold outline-none placeholder:text-muted-foreground focus:border-primary"
          />
        </div>

        <label className="mt-5 block text-xs font-extrabold uppercase tracking-widest text-muted-foreground">
          Category
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setCategory(c.key)}
              className={`min-h-11 rounded-2xl border-2 px-3 text-sm font-extrabold ${
                category === c.key ? "border-primary bg-primary-soft text-primary" : "border-border"
              }`}
            >
              {c.icon} {c.label}
            </button>
          ))}
        </div>

        <label className="mt-5 block text-xs font-extrabold uppercase tracking-widest text-muted-foreground">
          Frequency
        </label>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {FREQS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFrequency(f.key)}
              className={`min-h-12 rounded-2xl border-2 text-sm font-extrabold ${
                frequency === f.key ? "border-primary bg-primary-soft text-primary" : "border-border"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {frequency === "custom" ? (
          <div className="mt-3 flex justify-between gap-1.5">
            {DAY_LABELS.map((d, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Toggle day ${i}`}
                onClick={() =>
                  setDays((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]))
                }
                className={`size-11 rounded-full border-2 text-sm font-extrabold ${
                  days.includes(i) ? "border-primary bg-primary text-primary-foreground" : "border-border"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        ) : null}

        <label className="mt-5 block text-xs font-extrabold uppercase tracking-widest text-muted-foreground">
          Times per day
        </label>
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            aria-label="Fewer times per day"
            onClick={() => setTimesPerDay((n) => Math.max(1, n - 1))}
            className="size-12 rounded-2xl border-2 border-border text-xl font-extrabold"
          >
            −
          </button>
          <span className="min-w-14 text-center text-2xl font-extrabold">{timesPerDay}×</span>
          <button
            type="button"
            aria-label="More times per day"
            onClick={() => setTimesPerDay((n) => Math.min(12, n + 1))}
            className="size-12 rounded-2xl border-2 border-border text-xl font-extrabold"
          >
            +
          </button>
          <span className="text-xs font-bold text-muted-foreground">
            Tap the habit {timesPerDay} time{timesPerDay > 1 ? "s" : ""} a day to complete it.
          </span>
        </div>

        <label
          htmlFor="reminder"
          className="mt-5 block text-xs font-extrabold uppercase tracking-widest text-muted-foreground"
        >
          Reminder
        </label>
        <input
          id="reminder"
          type="time"
          value={reminder}
          onChange={(e) => setReminder(e.target.value)}
          className="mt-2 min-h-12 w-full rounded-2xl border-2 border-border bg-background px-4 text-base font-bold outline-none focus:border-primary"
        />

        <label className="mt-5 block text-xs font-extrabold uppercase tracking-widest text-muted-foreground">
          Difficulty
        </label>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDifficulty(d)}
              className={`min-h-14 rounded-2xl border-2 text-sm font-extrabold capitalize ${
                difficulty === d ? "border-primary bg-primary-soft text-primary" : "border-border"
              }`}
            >
              {d}
              <span className="block text-xs font-bold text-muted-foreground">
                +{XP_BY_DIFFICULTY[d]} XP
              </span>
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={!name.trim()}
          onClick={() =>
            onSave({
              name: name.trim(),
              icon,
              category,
              frequency,
              days,
              reminder,
              difficulty,
              xpReward: XP_BY_DIFFICULTY[difficulty],
              timesPerDay,
              active: habit?.active ?? true,
            })
          }
          className="btn-pop mt-7 min-h-14 w-full rounded-2xl bg-primary text-sm font-extrabold uppercase tracking-wide text-primary-foreground disabled:opacity-40"
        >
          {habit ? "Save changes" : "Create habit"}
        </button>
      </div>
    </div>
  );
}
