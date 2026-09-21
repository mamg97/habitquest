import type { Completion, Habit } from "./habit-types";
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

function completionKey(c: Completion) {
  return `${c.habitId}|${c.date}|${c.at ?? ""}`;
}

/**
 * Union merge of two states: nothing is ever lost, whichever device is newer
 * wins for records that exist on both sides.
 */
export function mergeStates(
  a: { habits: Habit[]; completions: Completion[]; updatedAt: string },
  b: { habits: Habit[]; completions: Completion[]; updatedAt: string },
): { habits: Habit[]; completions: Completion[] } {
  const [older, newer] = a.updatedAt <= b.updatedAt ? [a, b] : [b, a];

  const habits = new Map<string, Habit>();
  for (const h of older.habits) habits.set(h.id, h);
  for (const h of newer.habits) habits.set(h.id, h);

  const completions = new Map<string, Completion>();
  for (const c of [...older.completions, ...newer.completions]) {
    completions.set(c.id, c);
  }
  // Drop duplicates that share the same habit/date/time but different ids.
  const byKey = new Map<string, Completion>();
  for (const c of completions.values()) {
    const k = completionKey(c);
    if (!byKey.has(k)) byKey.set(k, c);
  }

  return {
    habits: [...habits.values()],
    completions: [...byKey.values()].sort((x, y) =>
      (x.at ?? x.date).localeCompare(y.at ?? y.date),
    ),
  };
}

type StateLike = { habits: Habit[]; completions: Completion[] };

/**
 * Three-way merge against the last state this device synced with the sheet.
 *
 * The sheet (remote) is the source of truth: rows edited or deleted by hand in
 * the spreadsheet win. Only changes this device made *after* the last sync
 * (additions, edits, deletions) are replayed on top of the remote version.
 */
export function threeWayMerge(
  base: StateLike,
  local: StateLike,
  remote: StateLike,
): { habits: Habit[]; completions: Completion[] } {
  const baseH = new Map(base.habits.map((h) => [h.id, h]));
  const localH = new Map(local.habits.map((h) => [h.id, h]));
  const habits = new Map(remote.habits.map((h) => [h.id, h]));

  for (const [id, h] of localH) {
    const b = baseH.get(id);
    // Added locally, or edited locally since the last sync -> keep local.
    if (!b || JSON.stringify(b) !== JSON.stringify(h)) habits.set(id, h);
  }
  // Deleted locally since the last sync -> remove.
  for (const id of baseH.keys()) if (!localH.has(id)) habits.delete(id);

  const baseC = new Map(base.completions.map((c) => [c.id, c]));
  const localC = new Map(local.completions.map((c) => [c.id, c]));
  const completions = new Map(remote.completions.map((c) => [c.id, c]));

  for (const [id, c] of localC) {
    const b = baseC.get(id);
    if (!b || JSON.stringify(b) !== JSON.stringify(c)) completions.set(id, c);
  }
  for (const id of baseC.keys()) if (!localC.has(id)) completions.delete(id);

  // Drop duplicates that share the same habit/date/time but different ids.
  const byKey = new Map<string, Completion>();
  for (const c of completions.values()) {
    const k = completionKey(c);
    if (!byKey.has(k)) byKey.set(k, c);
  }
  // Never keep history pointing at habits that no longer exist anywhere.
  const known = new Set(habits.keys());
  return {
    habits: [...habits.values()],
    completions: [...byKey.values()]
      .filter((c) => known.size === 0 || known.has(c.habitId))
      .sort((x, y) => (x.at ?? x.date).localeCompare(y.at ?? y.date)),
  };
}
