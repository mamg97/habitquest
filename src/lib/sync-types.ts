import type { Completion, Habit, AppState } from "./habit-types";

/** The slice of app state that lives in the user's spreadsheet. */
export type SyncPayload = {
  habits: Habit[];
  completions: Completion[];
  user: AppState["user"];
  /** ISO timestamp of the last local change included in this payload. */
  updatedAt: string;
};

export type SyncStatus = {
  signedIn: boolean;
  connected: boolean;
  spreadsheetId: string | null;
  spreadsheetUrl: string | null;
  spreadsheetTitle: string | null;
  lastSyncedAt: string | null;
};

export const HABIT_SHEET = "Habits";
export const HISTORY_SHEET = "History";
export const META_SHEET = "Meta";
