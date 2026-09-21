import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ACHIEVEMENTS,
  addDays,
  isScheduled,
  levelFromXp,
  toKey,
  XP_BY_DIFFICULTY,
  type AppState,
  type Completion,
  type CompletionDayState,
  type Habit,
  type ThemeMode,
} from "./habit-types";
import { completionDayKey, deriveCompletionStates } from "./sync-format";

const STORAGE_KEY = "habitquest.v1";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/** Parses a YYYY-MM-DD key into a local Date at midnight. */
function fromKey(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}


function makeSeed(): AppState {
  const today = new Date();
  const habits: Habit[] = [
    { id: "h1", name: "Drink 2L of water", icon: "💧", category: "health", frequency: "daily", days: [], reminder: "09:00", difficulty: "easy", xpReward: 10, timesPerDay: 3, active: true, createdAt: toKey(addDays(today, -120)) },
    { id: "h2", name: "Train for 45 minutes", icon: "🏋️", category: "fitness", frequency: "weekdays", days: [], reminder: "18:30", difficulty: "hard", xpReward: 30, timesPerDay: 1, active: true, createdAt: toKey(addDays(today, -120)) },
    { id: "h3", name: "Read 20 pages", icon: "📖", category: "learning", frequency: "daily", days: [], reminder: "21:30", difficulty: "medium", xpReward: 20, timesPerDay: 1, active: true, createdAt: toKey(addDays(today, -90)) },
    { id: "h4", name: "Meditate 10 minutes", icon: "🧘", category: "mind", frequency: "daily", days: [], reminder: "07:15", difficulty: "easy", xpReward: 10, timesPerDay: 1, active: true, createdAt: toKey(addDays(today, -60)) },
    { id: "h5", name: "Review budget", icon: "💰", category: "finance", frequency: "custom", days: [0], reminder: "11:00", difficulty: "medium", xpReward: 20, timesPerDay: 1, active: true, createdAt: toKey(addDays(today, -45)) },
  ];

  // Deterministic-ish pseudo random so history looks organic but stable per seed run
  let s = 42;
  const rnd = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };

  const completions: Completion[] = [];
  for (let i = 120; i >= 1; i--) {
    const date = addDays(today, -i);
    for (const h of habits) {
      if (!isScheduled(h, date)) continue;
      const rate = i <= 12 ? 0.95 : i < 40 ? 0.78 : 0.62;
      if (rnd() < rate) {
        const at = new Date(date);
        at.setHours(Number(h.reminder.split(":")[0] ?? 12), Number(h.reminder.split(":")[1] ?? 0), 0, 0);
        completions.push({ id: uid(), habitId: h.id, date: toKey(date), at: at.toISOString(), xpEarned: h.xpReward });
      }
    }
  }
  // Today: 2 of the scheduled ones already done
  const todayHabits = habits.filter((h) => isScheduled(h, today));
  todayHabits.slice(0, 2).forEach((h) => {
    completions.push({
      id: uid(),
      habitId: h.id,
      date: toKey(today),
      at: new Date().toISOString(),
      xpEarned: h.xpReward,
    });
  });

  return {
    user: {
      name: "Miguel",
      avatar: "🦊",
      xp: completions.reduce((a, c) => a + c.xpEarned, 0),
      streakFreezes: 2,
      onboarded: true,
      focus: ["fitness", "learning", "mind"],
      theme: "system",
      habitSort: "manual",
      habitView: "list",
    },
    habits,
    completions,
    completionStates: deriveCompletionStates(completions),
  };
}

export function emptyState(): AppState {
  return {
    user: {
      name: "Friend",
      avatar: "🦊",
      xp: 0,
      streakFreezes: 2,
      onboarded: false,
      focus: [],
      theme: "system",
      habitSort: "manual",
      habitView: "list",
    },
    habits: [],
    completions: [],
    completionStates: [],
  };
}

/** Backfills fields added in later versions so old saved data keeps working. */
function migrate(raw: AppState): AppState {
  const base = emptyState();
  return {
    ...base,
    ...raw,
    user: { ...base.user, ...raw.user },
    habits: (raw.habits ?? []).map((h) => ({
      ...h,
      timesPerDay: Number.isFinite(h.timesPerDay) && h.timesPerDay > 0 ? h.timesPerDay : 1,
    })),
    completions: (raw.completions ?? []).map((c) => ({ ...c })),
    completionStates:
      Array.isArray(raw.completionStates) && raw.completionStates.length
        ? raw.completionStates.map((state) => ({
            ...state,
            count: Math.max(0, Math.floor(Number(state.count) || 0)),
          }))
        : deriveCompletionStates(raw.completions ?? []),
  };
}

type Ctx = {
  ready: boolean;
  state: AppState;
  today: string;
  /** Day currently being edited (YYYY-MM-DD). Defaults to today. */
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  goToPreviousDay: () => void;
  goToNextDay: () => void;
  goToToday: () => void;
  isToday: boolean;
  todayHabits: Habit[];
  /** habitId -> times completed on the selected day */
  todayCounts: Map<string, number>;
  completedToday: Set<string>;

  level: ReturnType<typeof levelFromXp>;
  streak: number;
  longestStreak: number;
  toggleHabit: (habitId: string) => void;
  addHabit: (h: Omit<Habit, "id" | "createdAt">) => void;
  updateHabit: (id: string, patch: Partial<Habit>) => void;
  setArchived: (id: string, archived: boolean) => void;
  deleteHabit: (id: string) => void;
  reorderHabits: (newOrder: string[]) => void;
  setUser: (patch: Partial<AppState["user"]>) => void;
  unlockedAchievements: Record<string, boolean>;
  achievementProgress: Record<string, number>;
  reset: () => void;
  loadSample: () => void;
  importData: (data: {
    habits: Habit[];
    completions: Completion[];
    completionStates?: CompletionDayState[] | undefined;
  }) => void;
};

const HabitContext = createContext<Ctx | null>(null);

function computeStreaks(state: AppState) {
  const byDate = new Map<string, number>();
  for (const c of state.completions) byDate.set(c.date, (byDate.get(c.date) ?? 0) + 1);

  const now = new Date();
  let current = 0;
  for (let i = 0; i < 400; i++) {
    const d = addDays(now, -i);
    const has = (byDate.get(toKey(d)) ?? 0) > 0;
    if (has) current++;
    else if (i === 0) continue; // today not done yet doesn't break the streak
    else break;
  }

  let longest = 0;
  let run = 0;
  for (let i = 400; i >= 0; i--) {
    const has = (byDate.get(toKey(addDays(now, -i))) ?? 0) > 0;
    run = has ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return { current, longest: Math.max(longest, current) };
}

function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const prefersDark =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const dark = mode === "dark" || (mode === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", !!dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

function freshInstallState(): AppState {
  const state = emptyState();
  return {
    ...state,
    user: { ...state.user, onboarded: true },
  };
}

export function HabitProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => freshInstallState());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setState(migrate(JSON.parse(raw) as AppState));
      else setState(freshInstallState());
    } catch {
      setState(freshInstallState());
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state, ready]);

  const theme = state.user.theme;
  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system" || typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const today = toKey(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(() => toKey(new Date()));
  const isToday = selectedDate === today;

  const shiftDay = useCallback((n: number) => {
    setSelectedDate((prev) => toKey(addDays(fromKey(prev), n)));
  }, []);
  const goToPreviousDay = useCallback(() => shiftDay(-1), [shiftDay]);
  const goToNextDay = useCallback(() => shiftDay(1), [shiftDay]);
  const goToToday = useCallback(() => setSelectedDate(toKey(new Date())), []);

  const todayHabits = useMemo(
    () => state.habits.filter((h) => isScheduled(h, fromKey(selectedDate))),
    [state.habits, selectedDate],
  );

  const todayCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of state.completions) {
      if (c.date === selectedDate) m.set(c.habitId, (m.get(c.habitId) ?? 0) + 1);
    }
    return m;
  }, [state.completions, selectedDate]);

  const completedToday = useMemo(() => {
    const set = new Set<string>();
    for (const h of state.habits) {
      const target = Math.max(1, h.timesPerDay ?? 1);
      if ((todayCounts.get(h.id) ?? 0) >= target) set.add(h.id);
    }
    return set;
  }, [state.habits, todayCounts]);

  /** One tap updates the selected day and records an explicit LWW action timestamp. */
  const toggleHabit = useCallback(
    (habitId: string) => {
      setState((prev) => {
        const key = selectedDate;
        const habit = prev.habits.find((h) => h.id === habitId);
        if (!habit) return prev;

        const target = Math.max(1, habit.timesPerDay ?? 1);
        const todays = prev.completions.filter((c) => c.habitId === habitId && c.date === key);
        const actionAt = new Date().toISOString();
        const stateKey = `${habitId}|${key}`;
        const stateMap = new Map(
          (prev.completionStates ?? deriveCompletionStates(prev.completions)).map((state) => [
            completionDayKey(state),
            state,
          ]),
        );

        if (todays.length >= target) {
          const removedXp = todays.reduce((sum, completion) => sum + completion.xpEarned, 0);
          const ids = new Set(todays.map((completion) => completion.id));
          stateMap.set(stateKey, {
            habitId,
            date: key,
            count: 0,
            updatedAt: actionAt,
          });

          return {
            ...prev,
            user: { ...prev.user, xp: Math.max(0, prev.user.xp - removedXp) },
            completions: prev.completions.filter((completion) => !ids.has(completion.id)),
            completionStates: [...stateMap.values()],
          };
        }

        const now = new Date();
        const at =
          key === toKey(now)
            ? now
            : (() => {
                const date = fromKey(key);
                date.setHours(12, 0, 0, 0);
                return date;
              })();

        const nextCount = todays.length + 1;
        stateMap.set(stateKey, {
          habitId,
          date: key,
          count: nextCount,
          updatedAt: actionAt,
        });

        return {
          ...prev,
          user: { ...prev.user, xp: prev.user.xp + habit.xpReward },
          completions: [
            ...prev.completions,
            {
              id: uid(),
              habitId,
              date: key,
              at: at.toISOString(),
              xpEarned: habit.xpReward,
            },
          ],
          completionStates: [...stateMap.values()],
        };
      });
    },
    [selectedDate],
  );


  const addHabit = useCallback((h: Omit<Habit, "id" | "createdAt">) => {
    setState((prev) => ({
      ...prev,
      habits: [...prev.habits, { ...h, id: uid(), createdAt: toKey(new Date()) }],
    }));
  }, []);

  const updateHabit = useCallback((id: string, patch: Partial<Habit>) => {
    setState((prev) => ({
      ...prev,
      habits: prev.habits.map((h) =>
        h.id === id
          ? { ...h, ...patch, xpReward: patch.difficulty ? XP_BY_DIFFICULTY[patch.difficulty] : h.xpReward }
          : h,
      ),
    }));
  }, []);

  const setArchived = useCallback((id: string, archived: boolean) => {
    setState((prev) => ({
      ...prev,
      habits: prev.habits.map((h): Habit =>
        h.id === id
          ? { ...h, active: !archived, archivedAt: archived ? toKey(new Date()) : undefined }
          : h,
      ),
    }));
  }, []);


  const deleteHabit = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      habits: prev.habits.filter((h) => h.id !== id),
      completions: prev.completions.filter((c) => c.habitId !== id),
      completionStates: prev.completionStates.filter((state) => state.habitId !== id),
    }));
  }, []);

  const reorderHabits = useCallback((newOrder: string[]) => {
    setState((prev) => {
      const byId = new Map(prev.habits.map((h) => [h.id, h]));
      const reordered = newOrder.map((id) => byId.get(id)).filter((h): h is Habit => !!h);
      const remaining = prev.habits.filter((h) => !newOrder.includes(h.id));
      return { ...prev, habits: [...reordered, ...remaining] };
    });
  }, []);

  const setUser = useCallback((patch: Partial<AppState["user"]>) => {
    setState((prev) => ({ ...prev, user: { ...prev.user, ...patch } }));
  }, []);

  const { current: streak, longest: longestStreak } = useMemo(
    () => computeStreaks(state),
    [state],
  );

  const { unlockedAchievements, achievementProgress } = useMemo(() => {
    const totals = state.completions.length;
    const habitById = new Map(state.habits.map((h) => [h.id, h]));
    let morning = 0;
    let night = 0;
    for (const c of state.completions) {
      const h = habitById.get(c.habitId);
      if (!h) continue;
      const hour = c.at ? new Date(c.at).getHours() : Number(h.reminder.split(":")[0] ?? 12);
      if (hour < 10) morning++;
      if (hour >= 20) night++;
    }
    // perfect week: consecutive days where all scheduled habits were done
    const done = new Map<string, Set<string>>();
    for (const c of state.completions) {
      if (!done.has(c.date)) done.set(c.date, new Set());
      done.get(c.date)!.add(c.habitId);
    }
    let perfectRun = 0;
    for (let i = 1; i <= 60; i++) {
      const d = addDays(new Date(), -i);
      const sched = state.habits.filter((h) => isScheduled(h, d));
      const set = done.get(toKey(d)) ?? new Set();
      if (sched.length > 0 && sched.every((h) => set.has(h.id))) perfectRun++;
      else break;
    }

    const progress: Record<string, number> = {};
    const unlocked: Record<string, boolean> = {};
    for (const a of ACHIEVEMENTS) {
      const value =
        a.metric === "completions"
          ? totals
          : a.metric === "streak"
            ? Math.max(streak, longestStreak)
            : a.metric === "morning"
              ? morning
              : a.metric === "night"
                ? night
                : perfectRun;
      progress[a.id] = Math.min(value, a.target);
      unlocked[a.id] = value >= a.target;
    }
    return { unlockedAchievements: unlocked, achievementProgress: progress };
  }, [state, streak, longestStreak]);

  const value: Ctx = {
    ready,
    state,
    today,
    selectedDate,
    setSelectedDate,
    goToPreviousDay,
    goToNextDay,
    goToToday,
    isToday,

    todayHabits,
    todayCounts,
    completedToday,
    level: levelFromXp(state.user.xp),
    streak,
    longestStreak,
    toggleHabit,
    addHabit,
    updateHabit,
    setArchived,
    deleteHabit,
    reorderHabits,
    setUser,
    unlockedAchievements,
    achievementProgress,
    reset: () => setState(emptyState()),
    loadSample: () => setState(makeSeed()),
    importData: ({ habits, completions, completionStates }) =>
      setState((prev) => ({
        ...prev,
        habits,
        completions,
        completionStates:
          completionStates && completionStates.length
            ? completionStates
            : deriveCompletionStates(completions),
        user: { ...prev.user, xp: completions.reduce((a, c) => a + c.xpEarned, 0) },
      })),
  };

  return <HabitContext.Provider value={value}>{children}</HabitContext.Provider>;
}

export function useHabits() {
  const ctx = useContext(HabitContext);
  if (!ctx) throw new Error("useHabits must be used inside HabitProvider");
  return ctx;
}
