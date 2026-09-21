import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Flame, LayoutGrid, List, Plus, RefreshCw, Sparkles, Zap } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Confetti } from "@/components/Confetti";
import { CircleRing, ProgressBar, SectionTitle, StatPill, categoryOf } from "@/components/ui-bits";
import { useHabits } from "@/lib/habit-store";
import { useSheetSync } from "@/lib/sheet-sync-store";
import type { Habit } from "@/lib/habit-types";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Today — HabitQuest | Turn habits into a daily quest" },
      {
        name: "description",
        content:
          "See today's habit journey, complete one-tap actions, earn XP and keep your streak alive with HabitQuest.",
      },
      { property: "og:title", content: "Today — HabitQuest" },
      {
        property: "og:description",
        content: "Complete daily habits, earn XP and level up your streak.",
      },
    ],
  }),
  component: TodayPage,
});

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/** Friendly label for a YYYY-MM-DD key: Today, Yesterday or the full date. */
function dayLabel(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(date.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }),
  });
}


function TodayPage() {
  const {
    ready,
    state,
    todayHabits,
    todayCounts,
    completedToday,
    level,
    streak,
    toggleHabit,
    selectedDate,
    isToday,
    goToPreviousDay,
    goToNextDay,
    goToToday,
    setUser,
  } = useHabits();

  const navigate = useNavigate();
  const { status: syncStatus, syncing, syncNow, signIn } = useSheetSync();
  const [celebrate, setCelebrate] = useState(false);
  const [levelUp, setLevelUp] = useState<number | null>(null);
  const [floating, setFloating] = useState<{ id: string; xp: number } | null>(null);
  const prevLevel = useRef<number | null>(null);
  const prevAllDone = useRef<boolean | null>(null);


  useEffect(() => {
    if (ready && !state.user.onboarded) navigate({ to: "/onboarding" });
  }, [ready, state.user.onboarded, navigate]);

  const view = state.user.habitView ?? "list";

  const total = todayHabits.length;
  const done = todayHabits.filter((h) => completedToday.has(h.id)).length;
  const allDone = total > 0 && done === total;

  useEffect(() => {
    if (!ready) return;
    if (prevLevel.current !== null && level.level > prevLevel.current) {
      setLevelUp(level.level);
      setCelebrate(true);
    }
    prevLevel.current = level.level;
  }, [level.level, ready]);

  useEffect(() => {
    if (!ready) return;
    if (prevAllDone.current === false && allDone && isToday) setCelebrate(true);
    prevAllDone.current = allDone;
  }, [allDone, ready, isToday]);


  useEffect(() => {
    if (!celebrate) return;
    const t = setTimeout(() => setCelebrate(false), 2400);
    return () => clearTimeout(t);
  }, [celebrate]);

  if (!ready) {
    return (
      <AppShell>
        <div className="space-y-4">
          <div className="h-28 animate-pulse rounded-3xl bg-muted" />
          <div className="h-24 animate-pulse rounded-3xl bg-muted" />
          <div className="h-24 animate-pulse rounded-3xl bg-muted" />
        </div>
      </AppShell>
    );
  }

  const handleToggle = (id: string, xp: number, wasDone: boolean) => {
    toggleHabit(id);
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(wasDone ? 25 : [12, 30, 18]);
    } else if (typeof document !== "undefined") {
      // iOS Safari no soporta navigator.vibrate: usamos un input "switch"
      // oculto (iOS 17.4+) para disparar la respuesta háptica del sistema.
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("switch", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      input.style.pointerEvents = "none";
      document.body.appendChild(input);
      input.click();
      setTimeout(() => input.remove(), 300);
    }
    if (!wasDone) {
      setFloating({ id, xp });
      setTimeout(() => setFloating(null), 950);
    }
  };

  const pending = todayHabits.filter((h) => !completedToday.has(h.id));
  const finished = todayHabits.filter((h) => completedToday.has(h.id));


  return (
    <AppShell>
      {celebrate ? <Confetti /> : null}

      <header className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-muted-foreground">
            {greeting()}, {state.user.name} 👋
          </p>
          <h1 className="mt-1 truncate text-2xl">Level {level.level}</h1>
        </div>
        <button
          type="button"
          onClick={() => void (syncStatus.signedIn ? syncNow() : signIn())}
          disabled={syncing}
          aria-label={syncStatus.signedIn ? "Sync habits now" : "Connect Google to sync"}
          title={syncStatus.signedIn ? "Sync now" : "Connect Google"}
          className="btn-pop grid size-11 shrink-0 place-items-center rounded-2xl border border-border bg-card text-primary disabled:opacity-50"
        >
          <RefreshCw className={`size-5 ${syncing ? "animate-spin" : ""}`} />
        </button>
        <Link
          to="/profile"
          aria-label="Open profile"
          className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-full bg-primary-soft text-2xl"
        >
          {state.user.photo ? (
            <img
              src={state.user.photo}
              alt="Your profile"
              loading="lazy"
              className="size-14 object-cover"
            />
          ) : (
            state.user.avatar
          )}

        </Link>
      </header>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <StatPill tone="flame" icon={<Flame className="size-4 animate-flame" />} label={`${streak} day streak`} />
        <StatPill tone="primary" icon={<Zap className="size-4" />} label={`${state.user.xp.toLocaleString()} XP`} />
        <StatPill tone="accent" icon={<span>🛡️</span>} label={`×${state.user.streakFreezes}`} />
      </div>

      <div className="mt-3">
        <ProgressBar value={level.progress} />
        <p className="mt-1.5 text-xs font-bold text-muted-foreground">
          {level.currentLevelXp} / {level.levelSpan} XP to Level {level.level + 1}
        </p>
      </div>

      <div className="mt-6 flex items-center gap-2">
        <button
          type="button"
          onClick={goToPreviousDay}
          aria-label="Previous day"
          className="btn-pop grid size-12 shrink-0 place-items-center rounded-2xl border-2 border-border bg-card"
        >
          <ChevronLeft className="size-5" />
        </button>
        <button
          type="button"
          onClick={goToToday}
          disabled={isToday}
          className={`btn-pop min-h-12 min-w-0 flex-1 rounded-2xl border-2 px-3 text-sm font-extrabold ${
            isToday ? "border-border bg-card" : "border-primary bg-primary-soft text-primary"
          }`}
        >
          <span className="block truncate">{dayLabel(selectedDate)}</span>
          {!isToday ? (
            <span className="block text-[11px] font-bold uppercase tracking-wide">
              Tap to go back to today
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={goToNextDay}
          disabled={isToday}
          aria-label="Next day"
          className="btn-pop grid size-12 shrink-0 place-items-center rounded-2xl border-2 border-border bg-card disabled:opacity-40"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      <section className="mt-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <SectionTitle hint={total ? `${total - done} left` : undefined}>
            {isToday ? "Today's journey" : "That day's journey"}
          </SectionTitle>
          <button
            type="button"
            aria-label={view === "list" ? "Switch to compact grid view" : "Switch to list view"}
            onClick={() => setUser({ habitView: view === "list" ? "compact" : "list" })}
            className="grid size-10 shrink-0 place-items-center rounded-xl border-2 border-border text-muted-foreground hover:border-primary hover:text-primary"
          >
            {view === "list" ? <LayoutGrid className="size-5" /> : <List className="size-5" />}
          </button>
        </div>


        {total === 0 ? (
          <div className="card-soft px-6 py-10 text-center">
            <div className="text-5xl">🌱</div>
            <h3 className="mt-3 text-xl">Your journey starts here.</h3>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              Create your first habit and start earning XP.
            </p>
            <Link
              to="/habits"
              className="btn-pop mt-5 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-primary px-6 text-sm font-extrabold uppercase tracking-wide text-primary-foreground"
            >
              <Plus className="size-5" /> Create habit
            </Link>
          </div>
        ) : (
          <>
            {pending.length > 0 ? (
              <ol className={view === "compact" ? "grid grid-cols-2 gap-2" : "relative space-y-3 pl-2"}>
                {view === "list" ? (
                  <span
                    className="absolute bottom-6 left-[2.05rem] top-6 -z-0 w-1 rounded-full bg-muted"
                    aria-hidden
                  />
                ) : null}
                {pending.map((habit) => (
                  <HabitRow
                    key={habit.id}
                    habit={habit}
                    isDone={false}
                    compact={view === "compact"}
                    count={todayCounts.get(habit.id) ?? 0}
                    floating={floating}
                    onToggle={handleToggle}
                  />
                ))}
              </ol>
            ) : null}

            {finished.length > 0 ? (
              <div className={pending.length ? (view === "compact" ? "mt-4" : "mt-7") : ""}>
                <p className={view === "compact"
                  ? "mb-1.5 px-1 text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground"
                  : "mb-2 px-2 text-xs font-extrabold uppercase tracking-wide text-muted-foreground"}>
                  Completed · {finished.length}
                </p>
                <ol className={view === "compact" ? "grid grid-cols-2 gap-2" : "space-y-3 pl-2"}>
                  {finished.map((habit) => (
                    <HabitRow
                      key={habit.id}
                      habit={habit}
                      isDone
                      compact={view === "compact"}
                      count={todayCounts.get(habit.id) ?? 0}
                      floating={floating}
                      onToggle={handleToggle}
                    />
                  ))}
                </ol>
              </div>
            ) : null}
          </>
        )}

      </section>

      {total > 0 ? (
        <section className="mt-8">
          <SectionTitle>Daily progress</SectionTitle>
          <div className="card-soft flex items-center gap-5 p-5">
            <CircleRing progress={total ? done / total : 0}>
              <span className="text-lg font-extrabold">
                {done}/{total}
              </span>
            </CircleRing>
            <div className="min-w-0 flex-1">
              {allDone ? (
                <>
                  <h3 className="text-lg">🎉 Daily mission complete!</h3>
                  <p className="mt-1 text-sm font-semibold text-muted-foreground">
                    You&apos;re {level.levelSpan - level.currentLevelXp} XP closer to Level{" "}
                    {level.level + 1}.
                  </p>
                </>
              ) : (
                <>
                  <h3 className="text-lg">{total - done} to go</h3>
                  <p className="mt-1 text-sm font-semibold text-muted-foreground">
                    Finish today to keep your {streak}-day streak alive.
                  </p>
                </>
              )}
              <ProgressBar className="mt-3" tone="success" value={total ? done / total : 0} />
            </div>
          </div>
        </section>
      ) : null}

      {levelUp !== null ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/60 p-6">
          <div className="card-soft animate-pop-in w-full max-w-sm p-8 text-center">
            <Sparkles className="mx-auto size-12 text-accent" />
            <p className="mt-3 text-sm font-extrabold uppercase tracking-[0.2em] text-primary">
              Level up!
            </p>
            <h2 className="mt-1 text-4xl">Level {levelUp}</h2>
            <p className="mt-2 text-sm font-semibold text-muted-foreground">
              New goal: {level.levelSpan} XP to the next level.
            </p>
            <button
              type="button"
              onClick={() => setLevelUp(null)}
              className="btn-pop mt-6 min-h-12 w-full rounded-2xl bg-primary text-sm font-extrabold uppercase tracking-wide text-primary-foreground"
            >
              Keep going
            </button>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

function HabitRow({
  habit,
  isDone,
  compact,
  count,
  floating,
  onToggle,
}: {
  habit: Habit;
  isDone: boolean;
  compact: boolean;
  count: number;
  floating: { id: string; xp: number } | null;
  onToggle: (id: string, xp: number, wasDone: boolean) => void;
}) {
  const cat = categoryOf(habit.category);
  const target = Math.max(1, habit.timesPerDay ?? 1);

  if (compact) {
    return (
      <li>
        <button
          type="button"
          onClick={() => onToggle(habit.id, habit.xpReward, isDone)}
          aria-pressed={isDone}
          className={`btn-pop flex min-h-[5.25rem] w-full flex-col items-stretch rounded-2xl border p-2.5 text-left ${
            isDone ? "border-success bg-success-soft" : "border-border bg-card hover:border-primary"
          }`}
        >
          <span className="flex items-start gap-2">
            <span
              className={`relative grid size-9 shrink-0 place-items-center rounded-xl text-lg ${
                isDone ? "bg-success text-success-foreground" : "bg-muted"
              }`}
            >
              {isDone ? <Check className="size-5 animate-pop-in stroke-[3]" /> : habit.icon}
              {floating?.id === habit.id ? (
                <span className="animate-xp-float absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-extrabold text-success">
                  +{floating.xp} XP
                </span>
              ) : null}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={`block line-clamp-2 text-xs font-extrabold leading-tight ${
                  isDone ? "text-muted-foreground line-through" : ""
                }`}
              >
                {habit.name}
              </span>
            </span>
            <span
              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-extrabold ${
                isDone ? "bg-success text-success-foreground" : "bg-accent/30 text-accent-foreground"
              }`}
            >
              +{habit.xpReward}
            </span>
          </span>
          <span className="mt-auto flex items-center gap-1 overflow-hidden whitespace-nowrap pt-1.5 text-[9px] font-bold text-muted-foreground">
            <span className="truncate" style={{ color: `var(--${cat.color})` }}>
              {cat.icon} {cat.label}
            </span>
            {target > 1 ? (
              <>
                <span>·</span>
                <span className={isDone ? "text-success" : "text-primary"}>
                  {Math.min(count, target)}/{target}
                </span>
              </>
            ) : null}
          </span>
        </button>
      </li>
    );
  }

  return (
    <li className="relative z-10">
      <button
        type="button"
        onClick={() => onToggle(habit.id, habit.xpReward, isDone)}
        aria-pressed={isDone}
        className={`btn-pop flex w-full items-center gap-4 rounded-3xl border-2 p-3.5 text-left ${
          isDone ? "border-success bg-success-soft" : "border-border bg-card hover:border-primary"
        }`}
      >
        <span
          className={`relative grid size-14 shrink-0 place-items-center rounded-2xl text-2xl ${
            isDone ? "bg-success text-success-foreground" : "bg-muted"
          }`}
        >
          {isDone ? <Check className="size-8 animate-pop-in stroke-[3]" /> : habit.icon}
          {floating?.id === habit.id ? (
            <span className="animate-xp-float absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-sm font-extrabold text-success">
              +{floating.xp} XP
            </span>
          ) : null}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-base font-extrabold ${
              isDone ? "text-muted-foreground line-through" : ""
            }`}
          >
            {habit.name}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs font-bold text-muted-foreground">
            <span style={{ color: `var(--${cat.color})` }}>
              {cat.icon} {cat.label}
            </span>
            <span>·</span>
            <span>{habit.reminder}</span>
            {target > 1 ? (
              <>
                <span>·</span>
                <span className={isDone ? "text-success" : "text-primary"}>
                  {Math.min(count, target)}/{target}
                </span>
              </>
            ) : null}
          </span>
        </span>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold ${
            isDone ? "bg-success text-success-foreground" : "bg-accent/30 text-accent-foreground"
          }`}
        >
          +{habit.xpReward}
        </span>
      </button>
    </li>
  );
}

