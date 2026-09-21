export type Difficulty = "easy" | "medium" | "hard";
export type Frequency = "daily" | "weekdays" | "custom";

export type CategoryKey =
  | "fitness"
  | "learning"
  | "mind"
  | "work"
  | "finance"
  | "health"
  | "sleep"
  | "creativity"
  | "social"
  | "personal";

export type Category = {
  key: string;
  label: string;
  icon: string;
  /** css color token name suffix, see styles.css --cat-* */
  color: string;
};

export const CATEGORIES: Category[] = [
  { key: "fitness", label: "Fitness", icon: "🏃", color: "cat-fitness" },
  { key: "learning", label: "Learning", icon: "📚", color: "cat-learning" },
  { key: "mind", label: "Mind", icon: "🧠", color: "cat-mind" },
  { key: "work", label: "Work", icon: "💼", color: "cat-work" },
  { key: "finance", label: "Finance", icon: "💰", color: "cat-finance" },
  { key: "health", label: "Health", icon: "🥗", color: "cat-health" },
  { key: "sleep", label: "Sleep", icon: "😴", color: "cat-sleep" },
  { key: "creativity", label: "Creativity", icon: "🎨", color: "cat-creativity" },
  { key: "social", label: "Social", icon: "👥", color: "cat-social" },
  { key: "personal", label: "Personal", icon: "🌱", color: "cat-personal" },
];

export const XP_BY_DIFFICULTY: Record<Difficulty, number> = {
  easy: 10,
  medium: 20,
  hard: 30,
};

export type Habit = {
  id: string;
  name: string;
  icon: string;
  category: string;
  frequency: Frequency;
  /** 0 = Sunday ... 6 = Saturday, used when frequency === custom */
  days: number[];
  reminder: string;
  difficulty: Difficulty;
  xpReward: number;
  /** How many times per day it must be completed. */
  timesPerDay: number;
  /** false = archived: keeps history, disappears from the daily check. */
  active: boolean;
  /** YYYY-MM-DD when it was archived. */
  archivedAt?: string | undefined;
  createdAt: string;
};

export type Completion = {
  id: string;
  habitId: string;
  /** YYYY-MM-DD */
  date: string;
  /** ISO timestamp of the exact moment it was checked. */
  at?: string | undefined;
  xpEarned: number;
};


export type Achievement = {
  id: string;
  name: string;
  description: string;
  icon: string;
  target: number;
  metric: "completions" | "streak" | "perfectWeek" | "morning" | "night";
};

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first-step", name: "First Step", description: "Complete your first habit.", icon: "🏆", target: 1, metric: "completions" },
  { id: "on-fire", name: "On Fire", description: "Reach a 7-day streak.", icon: "🔥", target: 7, metric: "streak" },
  { id: "unstoppable", name: "Unstoppable", description: "Reach a 30-day streak.", icon: "🌋", target: 30, metric: "streak" },
  { id: "century", name: "Century", description: "Complete 100 habits.", icon: "💯", target: 100, metric: "completions" },
  { id: "early-bird", name: "Early Bird", description: "Complete a morning habit 7 times.", icon: "🌅", target: 7, metric: "morning" },
  { id: "night-owl", name: "Night Owl", description: "Complete a night habit 7 times.", icon: "🌙", target: 7, metric: "night" },
  { id: "perfect-week", name: "Perfect Week", description: "Complete every scheduled habit for 7 days.", icon: "⚡", target: 7, metric: "perfectWeek" },
  { id: "half-k", name: "Half Grand", description: "Complete 500 habits.", icon: "🚀", target: 500, metric: "completions" },
];

export type ThemeMode = "system" | "light" | "dark";
export type HabitSort = "manual" | "alpha" | "created" | "category" | "streak";
export type HabitView = "list" | "compact";

export type User = {
  name: string;
  avatar: string;
  /** Data URL of the uploaded profile photo, if any. */
  photo?: string | undefined;
  xp: number;
  streakFreezes: number;
  onboarded: boolean;
  focus: string[];
  theme: ThemeMode;
  /** Google Sheets / XLSX URL used as the data source. */
  sheetUrl?: string | undefined;
  habitSort: HabitSort;
  habitView: HabitView;
};


export type AppState = {
  user: User;
  habits: Habit[];
  completions: Completion[];
};

/** Cumulative XP required to reach a level (index 0 = level 1). */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  // 100, 250, 500, 850, 1300 ... progressive growth
  let total = 0;
  let step = 100;
  for (let i = 2; i <= level; i++) {
    total += step;
    step += 50;
  }
  return total;
}

export function levelFromXp(xp: number) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const current = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return {
    level,
    currentLevelXp: xp - current,
    levelSpan: next - current,
    nextLevelXp: next,
    progress: Math.min(1, (xp - current) / (next - current)),
  };
}

export function toKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(d: Date, n: number) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

export function isScheduled(habit: Habit, date: Date) {
  if (!habit.active) return false;
  const day = date.getDay();
  if (habit.frequency === "daily") return true;
  if (habit.frequency === "weekdays") return day >= 1 && day <= 5;
  return habit.days.includes(day);
}
