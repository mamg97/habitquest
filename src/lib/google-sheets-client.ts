import type { Completion, Habit } from "./habit-types";
import {
  HABIT_HEADER,
  HISTORY_HEADER,
  habitRows,
  historyRows,
  metaRows,
  parseMetaRows,
} from "./sync-format";
import { HABIT_SHEET, HISTORY_SHEET, META_SHEET, type SyncPayload } from "./sync-types";

const SHEETS_API = "https://sheets.googleapis.com/v4";
const GOOGLE_IDENTITY_SCRIPT = "https://accounts.google.com/gsi/client";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const DEFAULT_GOOGLE_CLIENT_ID =
  "137310587054-pvtskadkd7gpgm2r1024i10hmi9qapcs.apps.googleusercontent.com";

export const GOOGLE_CLIENT_ID_KEY = "habitquest.google.client-id.v1";
const GOOGLE_ACCESS_TOKEN_KEY = "habitquest.google.access-token.v1";
const TOKEN_EXPIRY_SAFETY_MS = 60_000;

type StoredGoogleAccessToken = {
  accessToken: string;
  expiresAt: number;
};

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

type GoogleTokenClient = {
  requestAccessToken: (options?: { prompt?: string }) => void;
};

type GoogleCodeClient = {
  requestCode: () => void;
};

type GoogleCodeResponse = {
  code?: string;
  error?: string;
  error_description?: string;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initCodeClient: (config: {
            client_id: string;
            scope: string;
            ux_mode: "popup";
            callback: (response: GoogleCodeResponse) => void;
          }) => GoogleCodeClient;
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: GoogleTokenResponse) => void;
          }) => GoogleTokenClient;
          revoke: (accessToken: string, done?: () => void) => void;
        };
      };
    };
  }
}

let identityScriptPromise: Promise<void> | null = null;

export function getStoredGoogleClientId() {
  const fromBuild = String(import.meta.env["VITE_GOOGLE_CLIENT_ID"] ?? "").trim();
  if (fromBuild) return fromBuild;
  try {
    return window.localStorage.getItem(GOOGLE_CLIENT_ID_KEY)?.trim() || DEFAULT_GOOGLE_CLIENT_ID;
  } catch {
    return DEFAULT_GOOGLE_CLIENT_ID;
  }
}

export function storeGoogleClientId(clientId: string) {
  try {
    const clean = clientId.trim();
    if (clean) window.localStorage.setItem(GOOGLE_CLIENT_ID_KEY, clean);
    else window.localStorage.removeItem(GOOGLE_CLIENT_ID_KEY);
  } catch {
    /* ignore unavailable storage */
  }
}

export function getStoredGoogleAccessToken(): string | null {
  try {
    const raw = window.localStorage.getItem(GOOGLE_ACCESS_TOKEN_KEY);
    if (!raw) return null;

    const stored = JSON.parse(raw) as StoredGoogleAccessToken;
    if (
      !stored?.accessToken ||
      !Number.isFinite(stored.expiresAt) ||
      stored.expiresAt <= Date.now() + TOKEN_EXPIRY_SAFETY_MS
    ) {
      window.localStorage.removeItem(GOOGLE_ACCESS_TOKEN_KEY);
      return null;
    }

    return stored.accessToken;
  } catch {
    return null;
  }
}

export function storeGoogleAccessToken(accessToken: string, expiresInSeconds = 3600) {
  try {
    const expiresAt = Date.now() + Math.max(60, expiresInSeconds) * 1000;
    window.localStorage.setItem(
      GOOGLE_ACCESS_TOKEN_KEY,
      JSON.stringify({ accessToken, expiresAt } satisfies StoredGoogleAccessToken),
    );
  } catch {
    /* ignore unavailable storage */
  }
}

export function storeGoogleAccessTokenUntil(accessToken: string, expiresAt: number | null) {
  try {
    const safeExpiry =
      Number.isFinite(expiresAt) && Number(expiresAt) > Date.now()
        ? Number(expiresAt)
        : Date.now() + 55 * 60 * 1000;
    window.localStorage.setItem(
      GOOGLE_ACCESS_TOKEN_KEY,
      JSON.stringify({ accessToken, expiresAt: safeExpiry } satisfies StoredGoogleAccessToken),
    );
  } catch {
    /* ignore unavailable storage */
  }
}

export function clearStoredGoogleAccessToken() {
  try {
    window.localStorage.removeItem(GOOGLE_ACCESS_TOKEN_KEY);
  } catch {
    /* ignore unavailable storage */
  }
}

async function loadGoogleIdentityScript() {
  if (window.google?.accounts?.oauth2) return;
  if (identityScriptPromise) return identityScriptPromise;

  identityScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GOOGLE_IDENTITY_SCRIPT}"]`,
    );

    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Google Identity failed to load.")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.src = GOOGLE_IDENTITY_SCRIPT;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Identity failed to load."));
    document.head.appendChild(script);
  });

  return identityScriptPromise;
}

export async function requestGoogleAccessToken(clientId: string) {
  if (!clientId.trim()) throw new Error("Add your Google OAuth client ID first.");
  await loadGoogleIdentityScript();

  return new Promise<string>((resolve, reject) => {
    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2) {
      reject(new Error("Google Identity is unavailable."));
      return;
    }

    const tokenClient = oauth2.initTokenClient({
      client_id: clientId.trim(),
      scope: GOOGLE_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(
            new Error(
              response.error_description ||
                response.error ||
                "Google did not return an access token.",
            ),
          );
          return;
        }
        storeGoogleAccessToken(response.access_token, response.expires_in);
        resolve(response.access_token);
      },
    });

    tokenClient.requestAccessToken({ prompt: "" });
  });
}

export function revokeGoogleAccessToken(accessToken: string | null) {
  clearStoredGoogleAccessToken();
  if (!accessToken) return;
  window.google?.accounts?.oauth2?.revoke(accessToken);
}

async function sheetsFetch<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  if (init?.body) headers.set("Content-Type", "application/json");

  const response = await fetch(`${SHEETS_API}${path}`, { ...init, headers });
  const text = await response.text();

  if (!response.ok) {
    let message = text || response.statusText;
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } };
      message = parsed.error?.message || message;
    } catch {
      /* keep raw response */
    }
    throw new Error(`Google Sheets API ${response.status}: ${message}`);
  }

  return (text ? JSON.parse(text) : {}) as T;
}

export function extractSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/(?:e\/)?([\w-]{20,})/);
  if (match?.[1]) return match[1];
  if (/^[\w-]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

export type SpreadsheetMeta = {
  spreadsheetId: string;
  spreadsheetUrl: string;
  properties: { title: string };
  sheets: { properties: { title: string } }[];
};

export async function getSpreadsheetMeta(accessToken: string, id: string) {
  return sheetsFetch<SpreadsheetMeta>(
    accessToken,
    `/spreadsheets/${encodeURIComponent(id)}?fields=spreadsheetId,spreadsheetUrl,properties.title,sheets.properties.title`,
  );
}

async function ensureSheets(accessToken: string, id: string, existing: string[]) {
  const missing = [HABIT_SHEET, HISTORY_SHEET, META_SHEET].filter(
    (title) => !existing.includes(title),
  );
  if (!missing.length) return;

  await sheetsFetch(accessToken, `/spreadsheets/${encodeURIComponent(id)}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: missing.map((title) => ({ addSheet: { properties: { title } } })),
    }),
  });
}

type ValueRange = { range?: string; values?: unknown[][] };

function toObjects(valueRange: ValueRange | undefined): Record<string, string>[] {
  const values = valueRange?.values ?? [];
  const [header, ...rows] = values;
  if (!header) return [];
  const keys = header.map((value) => String(value ?? "").trim());

  return rows.map((row) => {
    const obj: Record<string, string> = {};
    keys.forEach((key, index) => {
      obj[key] = row[index] === undefined || row[index] === null ? "" : String(row[index]);
    });
    return obj;
  });
}

export async function readSheetState(
  accessToken: string,
  id: string,
): Promise<SyncPayload | null> {
  const params = new URLSearchParams({ majorDimension: "ROWS" });
  params.append("ranges", HABIT_SHEET);
  params.append("ranges", HISTORY_SHEET);
  params.append("ranges", META_SHEET);

  const result = await sheetsFetch<{ valueRanges?: ValueRange[] }>(
    accessToken,
    `/spreadsheets/${encodeURIComponent(id)}/values:batchGet?${params.toString()}`,
  );
  const ranges = result.valueRanges ?? [];

  const habits: Habit[] = toObjects(ranges[0]).map((row) => ({
    id: row["id"] || Math.random().toString(36).slice(2, 10),
    name: row["name"] ?? "",
    icon: row["icon"] || "⭐",
    category: row["category"] || "personal",
    frequency: (row["frequency"] as Habit["frequency"]) || "daily",
    days: (row["days"] ?? "")
      .split(/[,;\s]+/)
      .map(Number)
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
    reminder: row["reminder"] || "09:00",
    difficulty: (row["difficulty"] as Habit["difficulty"]) || "easy",
    xpReward: Number(row["xpReward"]) || 10,
    timesPerDay: Math.max(1, Number(row["timesPerDay"]) || 1),
    active: (row["active"] ?? "yes").toLowerCase() !== "no",
    archivedAt: row["archivedAt"] || undefined,
    createdAt: row["createdAt"] || new Date().toISOString().slice(0, 10),
  }));

  const completions: Completion[] = toObjects(ranges[1])
    .filter((row) => row["habitId"] && row["date"])
    .map((row) => ({
      id: row["id"] || Math.random().toString(36).slice(2, 10),
      habitId: row["habitId"]!,
      date: row["date"]!,
      at: row["at"] || undefined,
      xpEarned: Number(row["xpEarned"]) || 0,
    }));

  const { user, updatedAt } = parseMetaRows(ranges[2]?.values ?? []);

  if (!habits.length && !completions.length && !user) return null;

  return {
    habits,
    completions,
    user: user as SyncPayload["user"],
    updatedAt: updatedAt || new Date(0).toISOString(),
  };
}

export async function writeSheetState(
  accessToken: string,
  id: string,
  payload: SyncPayload,
) {
  if (!payload.habits.length && !payload.completions.length) {
    throw new Error("HabitQuest blocked an attempt to overwrite the sheet with an empty state.");
  }

  const meta = await getSpreadsheetMeta(accessToken, id);
  await ensureSheets(
    accessToken,
    id,
    meta.sheets.map((sheet) => sheet.properties.title),
  );

  const habits = [HABIT_HEADER, ...habitRows(payload)];
  const history = [HISTORY_HEADER, ...historyRows(payload)];
  const metadata = metaRows(payload);

  await sheetsFetch(accessToken, `/spreadsheets/${encodeURIComponent(id)}/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      valueInputOption: "RAW",
      data: [
        { range: `${HABIT_SHEET}!A1`, values: habits },
        { range: `${HISTORY_SHEET}!A1`, values: history },
        { range: `${META_SHEET}!A1`, values: metadata },
      ],
    }),
  });

  await sheetsFetch(accessToken, `/spreadsheets/${encodeURIComponent(id)}/values:batchClear`, {
    method: "POST",
    body: JSON.stringify({
      ranges: [
        `${HABIT_SHEET}!A${habits.length + 1}:Z`,
        `${HISTORY_SHEET}!A${history.length + 1}:Z`,
        `${META_SHEET}!A${metadata.length + 1}:Z`,
      ],
    }),
  });
}

export async function createHabitQuestSpreadsheet(
  accessToken: string,
  title = "HabitQuest Data",
) {
  return sheetsFetch<SpreadsheetMeta>(accessToken, "/spreadsheets", {
    method: "POST",
    body: JSON.stringify({
      properties: { title },
      sheets: [HABIT_SHEET, HISTORY_SHEET, META_SHEET].map((sheetTitle) => ({
        properties: { title: sheetTitle },
      })),
    }),
  });
}


export async function requestGoogleAuthorizationCode(clientId: string) {
  if (!clientId.trim()) throw new Error("Add your Google OAuth client ID first.");
  await loadGoogleIdentityScript();

  return new Promise<string>((resolve, reject) => {
    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2) {
      reject(new Error("Google Identity is unavailable."));
      return;
    }

    const codeClient = oauth2.initCodeClient({
      client_id: clientId.trim(),
      scope: GOOGLE_SCOPE,
      ux_mode: "popup",
      callback: (response) => {
        if (response.error || !response.code) {
          reject(
            new Error(
              response.error_description ||
                response.error ||
                "Google did not return an authorization code.",
            ),
          );
          return;
        }
        resolve(response.code);
      },
    });

    codeClient.requestCode();
  });
}
