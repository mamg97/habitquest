import * as XLSX from "xlsx";
import type {
  AppState,
  Completion,
  CompletionDayState,
  Difficulty,
  Frequency,
  Habit,
} from "./habit-types";
import { XP_BY_DIFFICULTY } from "./habit-types";

import {
  HABIT_HEADER,
  HISTORY_HEADER,
  SYNC_STATE_HEADER,
  deriveCompletionStates,
  habitRows,
  historyRows,
  metaRows,
  syncStateRows,
} from "./sync-format";
import { HABIT_SHEET, HISTORY_SHEET, META_SHEET, SYNC_STATE_SHEET } from "./sync-types";

/** Exports the same three-sheet format used by the Google Sheets sync. */
export function exportStateToXlsx(state: AppState, filename = "habitquest-data.xlsx") {
  const payload = {
    habits: state.habits,
    completions: [...state.completions].sort((a, b) =>
      (a.at ?? a.date).localeCompare(b.at ?? b.date),
    ),
    completionStates:
      state.completionStates?.length > 0
        ? state.completionStates
        : deriveCompletionStates(state.completions),
    user: state.user,
    updatedAt: new Date().toISOString(),
  };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([HABIT_HEADER, ...habitRows(payload)]),
    HABIT_SHEET,
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([HISTORY_HEADER, ...historyRows(payload)]),
    HISTORY_SHEET,
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(metaRows(payload)), META_SHEET);
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([SYNC_STATE_HEADER, ...syncStateRows(payload)]),
    SYNC_STATE_SHEET,
  );
  XLSX.writeFile(wb, filename);
}


function str(v: unknown) {
  return v === undefined || v === null ? "" : String(v).trim();
}

function normalizeDate(v: unknown): string | null {
  if (typeof v === "number") {
    const parsed = XLSX.SSF.parse_date_code(v);
    if (!parsed) return null;
    return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const s = str(v);
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return null;
}

export type ImportResult = {
  habits: Habit[];
  completions: Completion[];
  completionStates: CompletionDayState[];
  newHabits: number;
  newCompletions: number;
  skipped: number;
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function pick(row: Record<string, unknown>, keys: string[]) {
  const lower: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) lower[k.toLowerCase().trim()] = v;
  for (const k of keys) {
    const v = lower[k];
    if (v !== undefined && str(v) !== "") return v;
  }
  return undefined;
}

/** Merges a parsed workbook into the current state (non destructive). */
function mergeWorkbook(wb: XLSX.WorkBook, state: AppState): ImportResult {


  const habits: Habit[] = state.habits.map((h) => ({ ...h }));
  const byId = new Map(habits.map((h) => [h.id, h]));
  const byName = new Map(habits.map((h) => [h.name.toLowerCase(), h]));
  let newHabits = 0;

  const habitSheetName = wb.SheetNames.find((n) => n.toLowerCase().includes("habit"));
  if (habitSheetName) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[habitSheetName]!);
    for (const row of rows) {
      const name = str(pick(row, ["name", "nombre", "habit", "habito", "hábito"]));
      if (!name) continue;
      const existing =
        (str(pick(row, ["id"])) && byId.get(str(pick(row, ["id"])))) ||
        byName.get(name.toLowerCase());
      if (existing) continue;
      const difficultyRaw = str(pick(row, ["difficulty", "dificultad"])).toLowerCase();
      const difficulty: Difficulty =
        difficultyRaw === "hard" || difficultyRaw === "difícil" || difficultyRaw === "dificil"
          ? "hard"
          : difficultyRaw === "medium" || difficultyRaw === "media"
            ? "medium"
            : "easy";
      const freqRaw = str(pick(row, ["frequency", "frecuencia"])).toLowerCase();
      const frequency: Frequency =
        freqRaw === "weekdays" ? "weekdays" : freqRaw === "custom" ? "custom" : "daily";
      const habit: Habit = {
        id: str(pick(row, ["id"])) || uid(),
        name,
        icon: str(pick(row, ["icon", "icono"])) || "⭐",
        category: str(pick(row, ["category", "categoria", "categoría"])).toLowerCase() || "personal",
        frequency,
        days: str(pick(row, ["days", "dias", "días"]))
          .split(/[,;\s]+/)
          .map((d) => Number(d))
          .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
        reminder: str(pick(row, ["reminder", "recordatorio"])) || "09:00",
        difficulty,
        xpReward: Number(pick(row, ["xpreward", "xp"])) || XP_BY_DIFFICULTY[difficulty],
        timesPerDay: Math.max(1, Number(pick(row, ["timesperday", "vecesaldia", "veces"])) || 1),
        active: str(pick(row, ["active", "activo"])).toLowerCase() !== "no",
        createdAt: normalizeDate(pick(row, ["createdat", "creado"])) ?? normalizeDate(new Date())!,
      };
      habits.push(habit);
      byId.set(habit.id, habit);
      byName.set(habit.name.toLowerCase(), habit);
      newHabits++;
    }
  }

  const completions: Completion[] = state.completions.map((c) => ({ ...c }));
  const seen = new Set(completions.map((c) => `${c.habitId}|${c.date}|${c.at ?? ""}`));
  let newCompletions = 0;
  let skipped = 0;

  const histSheets = wb.SheetNames.filter(
    (n) =>
      n !== habitSheetName &&
      n.toLowerCase() !== "meta" &&
      n.toLowerCase() !== SYNC_STATE_SHEET.toLowerCase(),
  );
  for (const sheetName of histSheets) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName]!);
    for (const row of rows) {
      const date = normalizeDate(pick(row, ["date", "fecha", "day", "dia", "día"]));
      const idRaw = str(pick(row, ["habitid", "habit_id", "id"]));
      const nameRaw = str(pick(row, ["habitname", "habit", "name", "nombre", "hábito", "habito"]));
      const habit = (idRaw && byId.get(idRaw)) || byName.get(nameRaw.toLowerCase());
      if (!date || !habit) {
        skipped++;
        continue;
      }
      const at = normalizeAt(date, pick(row, ["at", "timestamp", "time", "hora", "datetime"]));
      const key = `${habit.id}|${date}|${at ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const xp = Number(pick(row, ["xpearned", "xp"]));
      completions.push({
        id: uid(),
        habitId: habit.id,
        date,
        at,
        xpEarned: Number.isFinite(xp) && xp > 0 ? xp : habit.xpReward,
      });
      newCompletions++;
    }
  }


  let completionStates = deriveCompletionStates(completions);
  const syncStateSheetName = wb.SheetNames.find(
    (name) => name.toLowerCase() === SYNC_STATE_SHEET.toLowerCase(),
  );
  if (syncStateSheetName) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[syncStateSheetName]!);
    const parsed = rows
      .map((row) => ({
        habitId: str(pick(row, ["habitid", "habit_id"])),
        date: normalizeDate(pick(row, ["date", "fecha"])) ?? "",
        count: Math.max(0, Math.floor(Number(pick(row, ["count", "conteo"])) || 0)),
        updatedAt: str(pick(row, ["updatedat", "updated_at", "timestamp"])),
      }))
      .filter((state) => state.habitId && state.date && state.updatedAt);
    if (parsed.length) completionStates = parsed;
  }

  return { habits, completions, completionStates, newHabits, newCompletions, skipped };
}

/** Builds an ISO timestamp from a date key plus a time/timestamp cell. */
function normalizeAt(date: string, v: unknown): string | undefined {
  if (v === undefined || v === null || str(v) === "") return undefined;
  if (typeof v === "number") {
    // Excel serial: fractional part is the time of day.
    const frac = v % 1;
    const totalSeconds = Math.round(frac * 86400);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return new Date(`${date}T${pad(h)}:${pad(m)}:${pad(s)}`).toISOString();
  }
  const raw = str(v);
  const iso = new Date(raw);
  if (raw.includes("T") && !Number.isNaN(iso.getTime())) return iso.toISOString();
  const t = raw.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (t) {
    const d = new Date(`${date}T${pad(Number(t[1]))}:${t[2]}:${t[3] ?? "00"}`);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  if (!Number.isNaN(iso.getTime())) return iso.toISOString();
  return undefined;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Merges an uploaded workbook file into the current state. */
export async function importXlsxIntoState(file: File, state: AppState): Promise<ImportResult> {
  const buf = await file.arrayBuffer();
  return mergeWorkbook(XLSX.read(buf, { type: "array" }), state);
}

/** Turns a Google Sheets URL into a downloadable XLSX export URL when possible. */
export function normalizeSheetUrl(url: string): string {
  const trimmed = url.trim();
  const m = trimmed.match(/docs\.google\.com\/spreadsheets\/d\/(?:e\/)?([\w-]+)/);
  if (!m) return trimmed;
  if (trimmed.includes("/e/")) {
    return `https://docs.google.com/spreadsheets/d/e/${m[1]}/pub?output=xlsx`;
  }
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=xlsx`;
}

/** Fetches a published sheet (XLSX or CSV) and merges it into the current state. */
export async function importSheetUrlIntoState(url: string, state: AppState): Promise<ImportResult> {
  const res = await fetch(normalizeSheetUrl(url));
  if (!res.ok) throw new Error(`Sheet request failed (${res.status})`);
  const buf = await res.arrayBuffer();
  return mergeWorkbook(XLSX.read(buf, { type: "array" }), state);
}
