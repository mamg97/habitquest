import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Flame, Target, Trophy, Zap } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ProgressBar, SectionTitle } from "@/components/ui-bits";
import { useHabits } from "@/lib/habit-store";
import { addDays, isScheduled, toKey } from "@/lib/habit-types";

export const Route = createFileRoute("/progress")({
  head: () => ({
    meta: [
      { title: "Progress — HabitQuest" },
      {
        name: "description",
        content:
          "Weekly completion, streak records, XP totals and a monthly heatmap of every habit you've completed.",
      },
      { property: "og:title", content: "Progress — HabitQuest" },
      {
        property: "og:description",
        content: "See your streaks, completion rate and habit history at a glance.",
      },
    ],
  }),
  component: ProgressPage,
});

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function ProgressPage() {
  const { state, streak, longestStreak } = useHabits();

  const stats = useMemo(() => {
    const doneByDate = new Map<string, Set<string>>();
    for (const c of state.completions) {
      if (!doneByDate.has(c.date)) doneByDate.set(c.date, new Set());
      doneByDate.get(c.date)!.add(c.habitId);
    }

    const today = new Date();
    const mondayOffset = (today.getDay() + 6) % 7;

    const weekly = WEEK.map((label, i) => {
      const d = addDays(today, i - mondayOffset);
      const scheduled = state.habits.filter((h) => isScheduled(h, d)).length;
      const done = doneByDate.get(toKey(d))?.size ?? 0;
      return {
        label,
        pct: scheduled ? Math.min(1, done / scheduled) : 0,
        future: d > today,
      };
    });

    let scheduledTotal = 0;
    let doneTotal = 0;
    for (let i = 0; i < 90; i++) {
      const d = addDays(today, -i);
      scheduledTotal += state.habits.filter((h) => isScheduled(h, d)).length;
      doneTotal += doneByDate.get(toKey(d))?.size ?? 0;
    }

    const perHabit = state.habits
      .map((h) => {
        let sched = 0;
        for (let i = 0; i < 60; i++) if (isScheduled(h, addDays(today, -i))) sched++;
        const done = state.completions.filter(
          (c) => c.habitId === h.id && c.date >= toKey(addDays(today, -59)),
        ).length;
        return { habit: h, rate: sched ? done / sched : 0 };
      })
      .sort((a, b) => b.rate - a.rate);

    // Weekday-aligned grid: 5 rows ending on the Sunday of the current week.
    const toSunday = 6 - ((today.getDay() + 6) % 7);
    const heat = Array.from({ length: 35 }, (_, i) => {
      const d = addDays(today, toSunday - (34 - i));
      const scheduled = state.habits.filter((h) => isScheduled(h, d)).length;
      const done = doneByDate.get(toKey(d))?.size ?? 0;
      return {
        date: toKey(d),
        day: d.getDate(),
        month: d.toLocaleDateString("en-US", { month: "short" }),
        label: d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }),

        firstOfMonth: d.getDate() === 1,
        future: toKey(d) > toKey(today),
        level: scheduled ? Math.min(1, done / scheduled) : 0,
        done,
      };
    });


    return {
      weekly,
      completionRate: scheduledTotal ? doneTotal / scheduledTotal : 0,
      totalCompletions: state.completions.length,
      best: perHabit[0],
      heat,
    };
  }, [state]);

  return (
    <AppShell>
      <h1 className="text-2xl">Progress</h1>
      <p className="mt-1 text-sm font-semibold text-muted-foreground">
        Your momentum over the last weeks.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <StatCard icon={<Flame className="size-5 text-flame" />} label="Current streak" value={`${streak} days`} />
        <StatCard icon={<Trophy className="size-5 text-accent" />} label="Best streak" value={`${longestStreak} days`} />
        <StatCard
          icon={<Target className="size-5 text-success" />}
          label="Completion rate"
          value={`${Math.round(stats.completionRate * 100)}%`}
        />
        <StatCard
          icon={<Zap className="size-5 text-primary" />}
          label="Total XP"
          value={state.user.xp.toLocaleString()}
        />
      </div>

      <section className="mt-8">
        <SectionTitle hint="this week">Weekly completion</SectionTitle>
        <div className="card-soft flex h-52 items-end justify-between gap-2 p-5">
          {stats.weekly.map((d) => (
            <div key={d.label} className="flex h-full min-w-0 flex-1 flex-col items-center gap-2">
              <div className="flex w-full flex-1 items-end">
                <div className="w-full overflow-hidden rounded-xl bg-muted" style={{ height: "100%" }}>
                  <div className="flex h-full w-full items-end">
                    <div
                      className={`w-full rounded-xl transition-[height] duration-700 ${
                        d.future ? "bg-muted" : d.pct === 1 ? "bg-success" : "bg-primary"
                      }`}
                      style={{ height: `${Math.max(d.pct * 100, 4)}%` }}
                    />
                  </div>
                </div>
              </div>
              <span className="text-[11px] font-extrabold text-muted-foreground">{d.label}</span>
              <span className="text-[11px] font-extrabold">{Math.round(d.pct * 100)}%</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <SectionTitle hint="last 5 weeks">Consistency map</SectionTitle>
        <div className="card-soft p-5">
          <div className="mb-2 grid grid-cols-7 gap-2 text-center text-[10px] font-extrabold uppercase text-muted-foreground">
            {WEEK.map((d) => (
              <span key={d}>{d[0]}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {stats.heat.map((c) => (
              <div
                key={c.date}
                title={`${c.label} — ${c.done} completed`}
                className={`grid aspect-square place-items-center rounded-lg text-[10px] font-extrabold ${
                  c.future ? "opacity-40" : ""
                } ${c.level > 0.5 ? "text-success-foreground" : "text-muted-foreground"}`}
                style={{
                  backgroundColor:
                    c.level === 0
                      ? "var(--muted)"
                      : `color-mix(in oklab, var(--success) ${25 + c.level * 75}%, var(--muted))`,
                }}
              >
                <span className="leading-none">{c.day}</span>
                {c.firstOfMonth ? (
                  <span className="mt-0.5 text-[8px] leading-none opacity-80">{c.month}</span>
                ) : null}
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-end gap-2 text-[11px] font-extrabold text-muted-foreground">
            Less
            {[0, 0.34, 0.67, 1].map((l) => (
              <span
                key={l}
                className="size-3.5 rounded"
                style={{
                  backgroundColor:
                    l === 0
                      ? "var(--muted)"
                      : `color-mix(in oklab, var(--success) ${25 + l * 75}%, var(--muted))`,
                }}
              />
            ))}
            More
          </div>
        </div>
      </section>

      <section className="mt-8">
        <SectionTitle hint="last 60 days">Habit breakdown</SectionTitle>
        <div className="card-soft space-y-4 p-5">
          {state.habits.length === 0 ? (
            <p className="text-sm font-semibold text-muted-foreground">
              No data yet — complete a habit to start your chart.
            </p>
          ) : null}
          {state.habits
            .map((h) => {
              const done = state.completions.filter((c) => c.habitId === h.id).length;
              return { h, done };
            })
            .sort((a, b) => b.done - a.done)
            .map(({ h, done }) => {
              const max = Math.max(...state.completions.map(() => 1), 1);
              const totalTop =
                Math.max(
                  ...state.habits.map(
                    (x) => state.completions.filter((c) => c.habitId === x.id).length,
                  ),
                  1,
                ) * max;
              return (
                <div key={h.id}>
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-sm font-extrabold">
                    <span className="min-w-0 truncate">
                      {h.icon} {h.name}
                    </span>
                    <span className="shrink-0 text-muted-foreground">{done}</span>
                  </div>
                  <ProgressBar value={done / totalTop} tone="success" />
                </div>
              );
            })}
        </div>
      </section>

      {stats.best ? (
        <section className="mt-8">
          <SectionTitle>Strongest habit</SectionTitle>
          <div className="card-soft flex items-center gap-4 p-5">
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-success-soft text-2xl">
              {stats.best.habit.icon}
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-lg">{stats.best.habit.name}</h3>
              <p className="text-sm font-semibold text-muted-foreground">
                {Math.round(stats.best.rate * 100)}% completion rate ·{" "}
                {stats.totalCompletions.toLocaleString()} habits completed overall
              </p>
            </div>
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="card-soft p-4">
      <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-extrabold">{value}</p>
    </div>
  );
}
