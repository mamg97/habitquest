import type { Completion, CompletionDayState, Habit } from "./habit-types";
import type { SyncPayload } from "./sync-types";

export const HABIT_HEADER = [
  "id",
  "name",
  "icon",
  "category",
  "frequency",
  "days",
  "reminder",
  "difficulty",
  "xpReward",
  "timesPerDay",
  "active",
  "archivedAt",
  "createdAt",
];

export const HISTORY_HEADER = ["id", "habitId", "habitName", "date", "at", "xpEarned"];
export const SYNC_STATE_HEADER = ["habitId", "date", "count", "updatedAt"];

/** Google Sheets rejects cells above 50k chars, so long values are chunked. */
const CHUNK = 40000;

export function habitRows(payload: SyncPayload): string[][] {
  return payload.habits.map((h) => [
    h.id,
    h.name,
    h.icon,
    h.category,
    h.frequency,
    (h.days ?? []).join(","),
    h.reminder,
    h.difficulty,
    String(h.xpReward),
    String(h.timesPerDay ?? 1),
    h.active ? "yes" : "no",
    h.archivedAt ?? "",
    h.createdAt,
  ]);
}

export function historyRows(payload: SyncPayload): string[][] {
  const names = new Map(payload.habits.map((h) => [h.id, h.name]));
  return payload.completions.map((c) => [
    c.id,
    c.habitId,
    names.get(c.habitId) ?? "",
    c.date,
    c.at ?? "",
    String(c.xpEarned),
  ]);
}

export function syncStateRows(payload: SyncPayload): string[][] {
  return payload.completionStates.map((state) => [
    state.habitId,
    state.date,
    String(Math.max(0, Math.floor(state.count))),
    state.updatedAt,
  ]);
}

export function metaRows(payload: SyncPayload): string[][] {
  const user = (payload.user ?? {}) as Record<string, unknown>;
  const { photo, ...rest } = user as { photo?: string };
  const rows: string[][] = [
    ["key", "value"],
    ["user", JSON.stringify(rest)],
    ["updatedAt", payload.updatedAt],
  ];
  if (typeof photo === "string" && photo) {
    for (let i = 0; i < photo.length; i += CHUNK) {
      rows.push(["photo", photo.slice(i, i + CHUNK)]);
    }
  }
  return rows;
}

/** Rebuilds the user object from Meta rows (key/value pairs). */
export function parseMetaRows(rows: unknown[][]): {
  user?: SyncPayload["user"] | undefined;
  updatedAt: string;
} {
  let user: Record<string, unknown> | undefined;
  let updatedAt = "";
  let photo = "";
  for (const row of rows) {
    const k = String(row?.[0] ?? "");
    const v = String(row?.[1] ?? "");
    if (k === "user" && v) {
      try {
        user = JSON.parse(v) as Record<string, unknown>;
      } catch {
        /* ignore malformed meta */
      }
    }
    if (k === "updatedAt") updatedAt = v;
    if (k === "photo") photo += v;
  }
  if (user && photo) user["photo"] = photo;
  return { user: user as SyncPayload["user"] | undefined, updatedAt };
}

export function completionDayKey(value: Pick<Completion, "habitId" | "date">) {
  return `${value.habitId}|${value.date}`;
}

function legacyCompletionTimestamp(completion: Completion) {
  if (completion.at) return completion.at;
  return `${completion.date}T12:00:00.000Z`;
}

/** Builds an initial LWW state from legacy History rows. */
export function deriveCompletionStates(completions: Completion[]): CompletionDayState[] {
  const grouped = new Map<string, CompletionDayState>();
  for (const completion of completions) {
    const key = completionDayKey(completion);
    const current = grouped.get(key);
    const timestamp = legacyCompletionTimestamp(completion);
    if (!current) {
      grouped.set(key, {
        habitId: completion.habitId,
        date: completion.date,
        count: 1,
        updatedAt: timestamp,
      });
      continue;
    }
    current.count += 1;
    if (timestamp > current.updatedAt) current.updatedAt = timestamp;
  }
  return [...grouped.values()];
}

type CompletionStateLike = {
  habits: Habit[];
  completions: Completion[];
  completionStates?: CompletionDayState[] | undefined;
};

function normalizedCompletionStates(state: CompletionStateLike) {
  const map = new Map<string, CompletionDayState>();
  for (const derived of deriveCompletionStates(state.completions)) {
    map.set(completionDayKey(derived), derived);
  }
  for (const explicit of state.completionStates ?? []) {
    if (!explicit.habitId || !explicit.date || !explicit.updatedAt) continue;
    map.set(completionDayKey(explicit), {
      ...explicit,
      count: Math.max(0, Math.floor(Number(explicit.count) || 0)),
    });
  }
  return map;
}

function completionsForDay(state: CompletionStateLike, key: string) {
  return state.completions
    .filter((completion) => completionDayKey(completion) === key)
    .sort((a, b) => legacyCompletionTimestamp(a).localeCompare(legacyCompletionTimestamp(b)));
}

function mergeCompletionTruth(
  a: CompletionStateLike,
  b: CompletionStateLike,
  habits: Habit[],
): { completions: Completion[]; completionStates: CompletionDayState[] } {
  const statesA = normalizedCompletionStates(a);
  const statesB = normalizedCompletionStates(b);
  const keys = new Set([...statesA.keys(), ...statesB.keys()]);
  const habitById = new Map(habits.map((habit) => [habit.id, habit]));

  const completionStates: CompletionDayState[] = [];
  const completions: Completion[] = [];

  for (const key of keys) {
    const sa = statesA.get(key);
    const sb = statesB.get(key);

    let chosen: CompletionDayState;
    let source: CompletionStateLike;

    if (!sa && sb) {
      chosen = sb;
      source = b;
    } else if (sa && !sb) {
      chosen = sa;
      source = a;
    } else if (sa && sb && sb.updatedAt >= sa.updatedAt) {
      chosen = sb;
      source = b;
    } else if (sa) {
      chosen = sa;
      source = a;
    } else {
      continue;
    }

    const normalized = {
      ...chosen,
      count: Math.max(0, Math.floor(Number(chosen.count) || 0)),
    };
    completionStates.push(normalized);

    if (normalized.count === 0) continue;

    const sourceRows = completionsForDay(source, key);
    const kept = sourceRows.slice(0, normalized.count);
    completions.push(...kept);

    if (kept.length < normalized.count) {
      const habit = habitById.get(normalized.habitId);
      const xp = habit?.xpReward ?? 0;
      for (let index = kept.length; index < normalized.count; index++) {
        completions.push({
          id: `sync-${normalized.habitId}-${normalized.date}-${index + 1}`,
          habitId: normalized.habitId,
          date: normalized.date,
          at: normalized.updatedAt,
          xpEarned: xp,
        });
      }
    }
  }

  const known = new Set(habits.map((habit) => habit.id));
  return {
    completionStates: completionStates
      .filter((state) => known.size === 0 || known.has(state.habitId))
      .sort((x, y) =>
        x.date === y.date
          ? x.habitId.localeCompare(y.habitId)
          : x.date.localeCompare(y.date),
      ),
    completions: completions
      .filter((completion) => known.size === 0 || known.has(completion.habitId))
      .sort((x, y) =>
        legacyCompletionTimestamp(x).localeCompare(legacyCompletionTimestamp(y)),
      ),
  };
}

/**
 * Last-write-wins merge.
 *
 * Habits still use the globally newer payload for conflicting records.
 * Completion state is resolved independently for each habit+day using the
 * latest mark/unmark action timestamp. count=0 is a tombstone, so an older
 * completion on another device cannot resurrect an explicit unmark.
 */
export function mergeStates(
  a: {
    habits: Habit[];
    completions: Completion[];
    completionStates?: CompletionDayState[] | undefined;
    updatedAt: string;
  },
  b: {
    habits: Habit[];
    completions: Completion[];
    completionStates?: CompletionDayState[] | undefined;
    updatedAt: string;
  },
): { habits: Habit[]; completions: Completion[]; completionStates: CompletionDayState[] } {
  const [older, newer] = a.updatedAt <= b.updatedAt ? [a, b] : [b, a];

  const habits = new Map<string, Habit>();
  for (const habit of older.habits) habits.set(habit.id, habit);
  for (const habit of newer.habits) habits.set(habit.id, habit);

  const mergedHabits = [...habits.values()];
  const completionTruth = mergeCompletionTruth(a, b, mergedHabits);

  return {
    habits: mergedHabits,
    ...completionTruth,
  };
}

type StateLike = {
  habits: Habit[];
  completions: Completion[];
  completionStates?: CompletionDayState[] | undefined;
};

/**
 * Three-way merge against the last state this device synced with the sheet.
 *
 * Habit edits/deletes use the base snapshot. Completion state does not rely on
 * absence anymore: it uses explicit per-day LWW state, including count=0
 * tombstones, so the latest action on any device wins.
 */
export function threeWayMerge(
  base: StateLike,
  local: StateLike,
  remote: StateLike,
): { habits: Habit[]; completions: Completion[]; completionStates: CompletionDayState[] } {
  const baseH = new Map(base.habits.map((habit) => [habit.id, habit]));
  const localH = new Map(local.habits.map((habit) => [habit.id, habit]));
  const habits = new Map(remote.habits.map((habit) => [habit.id, habit]));

  for (const [id, habit] of localH) {
    const original = baseH.get(id);
    if (!original || JSON.stringify(original) !== JSON.stringify(habit)) habits.set(id, habit);
  }

  for (const id of baseH.keys()) {
    if (!localH.has(id)) habits.delete(id);
  }

  const mergedHabits = [...habits.values()];
  const completionTruth = mergeCompletionTruth(local, remote, mergedHabits);

  return {
    habits: mergedHabits,
    ...completionTruth,
  };
}
