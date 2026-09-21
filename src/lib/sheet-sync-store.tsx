import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { useHabits } from "./habit-store";
import {
  createHabitQuestSpreadsheet,
  extractSpreadsheetId,
  getSpreadsheetMeta,
  getStoredGoogleClientId,
  readSheetState,
  requestGoogleAccessToken,
  revokeGoogleAccessToken,
  storeGoogleClientId,
  writeSheetState,
} from "./google-sheets-client";
import { mergeStates, threeWayMerge } from "./sync-format";
import type { SyncPayload, SyncStatus } from "./sync-types";

const PUSH_DEBOUNCE_MS = 2500;
const POLL_MS = 45000;
const STATUS_KEY = "habitquest.google-sheet.v1";

type SyncCtx = {
  clientId: string;
  configured: boolean;
  status: SyncStatus;
  busy: boolean;
  syncing: boolean;
  saveClientId: (clientId: string) => void;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  disconnect: () => Promise<void>;
  createSheet: (title?: string) => Promise<void>;
  linkSheet: (url: string) => Promise<void>;
  syncNow: () => Promise<void>;
};

const Ctx = createContext<SyncCtx | null>(null);

function snapshot(payload: SyncPayload) {
  return JSON.stringify({
    habits: payload.habits,
    completions: payload.completions,
    user: payload.user,
  });
}

type BaseState = {
  habits: SyncPayload["habits"];
  completions: SyncPayload["completions"];
};

function baseKey(spreadsheetId: string) {
  return `habitquest:syncbase:${spreadsheetId}`;
}

function loadBase(spreadsheetId: string): BaseState | null {
  try {
    const raw = window.localStorage.getItem(baseKey(spreadsheetId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BaseState;
    if (!Array.isArray(parsed?.habits) || !Array.isArray(parsed?.completions)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveBase(spreadsheetId: string, payload: SyncPayload) {
  try {
    window.localStorage.setItem(
      baseKey(spreadsheetId),
      JSON.stringify({ habits: payload.habits, completions: payload.completions }),
    );
  } catch {
    /* ignore unavailable storage */
  }
}

function loadStatus(): SyncStatus {
  try {
    const raw = window.localStorage.getItem(STATUS_KEY);
    if (!raw) {
      return {
        signedIn: false,
        connected: false,
        spreadsheetId: null,
        spreadsheetUrl: null,
        spreadsheetTitle: null,
        lastSyncedAt: null,
      };
    }
    const saved = JSON.parse(raw) as Partial<SyncStatus>;
    return {
      signedIn: false,
      connected: Boolean(saved.spreadsheetId),
      spreadsheetId: saved.spreadsheetId ?? null,
      spreadsheetUrl: saved.spreadsheetUrl ?? null,
      spreadsheetTitle: saved.spreadsheetTitle ?? null,
      lastSyncedAt: saved.lastSyncedAt ?? null,
    };
  } catch {
    return {
      signedIn: false,
      connected: false,
      spreadsheetId: null,
      spreadsheetUrl: null,
      spreadsheetTitle: null,
      lastSyncedAt: null,
    };
  }
}

function persistStatus(status: SyncStatus) {
  try {
    window.localStorage.setItem(
      STATUS_KEY,
      JSON.stringify({
        spreadsheetId: status.spreadsheetId,
        spreadsheetUrl: status.spreadsheetUrl,
        spreadsheetTitle: status.spreadsheetTitle,
        lastSyncedAt: status.lastSyncedAt,
      }),
    );
  } catch {
    /* ignore unavailable storage */
  }
}

function hasData(payload: SyncPayload) {
  return payload.habits.length > 0 || payload.completions.length > 0;
}

export function SheetSyncProvider({ children }: { children: ReactNode }) {
  const { ready, state, importData, setUser } = useHabits();
  const [clientId, setClientId] = useState(() => getStoredGoogleClientId());
  const [status, setStatus] = useState<SyncStatus>(() => loadStatus());
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const accessTokenRef = useRef<string | null>(null);
  const pulledRef = useRef(false);
  const remoteSnapshotRef = useRef<string | null>(null);
  const localChangedAtRef = useRef<string>(new Date(0).toISOString());

  const updateStatus = useCallback((patch: Partial<SyncStatus>) => {
    setStatus((previous) => {
      const next = { ...previous, ...patch };
      persistStatus(next);
      return next;
    });
  }, []);

  const saveClientId = useCallback((value: string) => {
    const clean = value.trim();
    storeGoogleClientId(clean);
    setClientId(clean);
    if (!clean) {
      revokeGoogleAccessToken(accessTokenRef.current);
      accessTokenRef.current = null;
      setStatus((previous) => ({ ...previous, signedIn: false }));
      pulledRef.current = false;
      remoteSnapshotRef.current = null;
    }
  }, []);

  const buildPayload = useCallback(
    (): SyncPayload => ({
      habits: state.habits,
      completions: state.completions,
      user: state.user,
      updatedAt: localChangedAtRef.current,
    }),
    [state],
  );

  const applyRemote = useCallback(
    (payload: SyncPayload) => {
      importData({ habits: payload.habits, completions: payload.completions });
      if (payload.user) {
        const { xp: _xp, ...rest } = payload.user;
        setUser(rest);
      }
      localChangedAtRef.current = payload.updatedAt;
      remoteSnapshotRef.current = snapshot(payload);
    },
    [importData, setUser],
  );

  const pushPayload = useCallback(
    async (payload: SyncPayload, spreadsheetId: string) => {
      const accessToken = accessTokenRef.current;
      if (!accessToken) throw new Error("Reconnect Google before saving.");
      if (!hasData(payload)) return;

      setSyncing(true);
      try {
        await writeSheetState(accessToken, spreadsheetId, payload);
        remoteSnapshotRef.current = snapshot(payload);
        saveBase(spreadsheetId, payload);
        updateStatus({ lastSyncedAt: payload.updatedAt });
      } finally {
        setSyncing(false);
      }
    },
    [updateStatus],
  );

  const syncFromSheet = useCallback(
    async (spreadsheetId: string, { silent = true }: { silent?: boolean } = {}) => {
      const accessToken = accessTokenRef.current;
      if (!accessToken) throw new Error("Reconnect Google before syncing.");

      setSyncing(true);
      try {
        const remote = await readSheetState(accessToken, spreadsheetId);
        const local = buildPayload();

        if (!remote) {
          throw new Error(
            "This sheet contains no HabitQuest data. Automatic overwrite was blocked.",
          );
        }

        const remoteSnap = snapshot(remote);
        if (remoteSnap === snapshot(local)) {
          remoteSnapshotRef.current = remoteSnap;
          localChangedAtRef.current = remote.updatedAt;
          saveBase(spreadsheetId, remote);
          updateStatus({ lastSyncedAt: remote.updatedAt });
          if (!silent) toast.success("HabitQuest is up to date");
          return;
        }

        const base = loadBase(spreadsheetId);
        let mergedPayload: SyncPayload;

        if (!base && !hasData(local)) {
          // Fresh browser/domain: the existing Google Sheet wins completely.
          mergedPayload = remote;
        } else {
          const merged = base
            ? threeWayMerge(base, local, remote)
            : mergeStates(
                {
                  habits: local.habits,
                  completions: local.completions,
                  updatedAt: local.updatedAt,
                },
                {
                  habits: remote.habits,
                  completions: remote.completions,
                  updatedAt: remote.updatedAt,
                },
              );

          const remoteIsNewer = remote.updatedAt >= local.updatedAt;
          mergedPayload = {
            habits: merged.habits,
            completions: merged.completions,
            user: remoteIsNewer ? (remote.user ?? local.user) : local.user,
            updatedAt: new Date().toISOString(),
          };
        }

        applyRemote(mergedPayload);
        saveBase(spreadsheetId, mergedPayload);
        updateStatus({ lastSyncedAt: mergedPayload.updatedAt });

        if (snapshot(mergedPayload) !== remoteSnap) {
          await pushPayload(mergedPayload, spreadsheetId);
        }

        if (!silent) toast.success("Synced with your Google Sheet");
      } finally {
        setSyncing(false);
      }
    },
    [applyRemote, buildPayload, pushPayload, updateStatus],
  );

  const signIn = useCallback(async () => {
    if (!clientId) {
      toast.error("Add your Google OAuth client ID first");
      return;
    }

    setBusy(true);
    try {
      const accessToken = await requestGoogleAccessToken(clientId);
      accessTokenRef.current = accessToken;
      setStatus((previous) => ({ ...previous, signedIn: true }));

      if (status.spreadsheetId) {
        pulledRef.current = false;
        remoteSnapshotRef.current = null;
        await syncFromSheet(status.spreadsheetId, { silent: false });
        pulledRef.current = true;
      } else {
        toast.success("Google connected");
      }
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Could not connect Google");
    } finally {
      setBusy(false);
    }
  }, [clientId, status.spreadsheetId, syncFromSheet]);

  const signOut = useCallback(async () => {
    revokeGoogleAccessToken(accessTokenRef.current);
    accessTokenRef.current = null;
    pulledRef.current = false;
    remoteSnapshotRef.current = null;
    setStatus((previous) => ({ ...previous, signedIn: false }));
  }, []);

  const disconnect = useCallback(async () => {
    pulledRef.current = false;
    remoteSnapshotRef.current = null;
    updateStatus({
      connected: false,
      spreadsheetId: null,
      spreadsheetUrl: null,
      spreadsheetTitle: null,
      lastSyncedAt: null,
    });
    toast.success("Sheet unlinked from this browser. The Google Sheet was not deleted.");
  }, [updateStatus]);

  const createSheet = useCallback(
    async (title?: string) => {
      const accessToken = accessTokenRef.current;
      if (!accessToken) {
        toast.error("Connect Google first");
        return;
      }

      setBusy(true);
      try {
        const created = await createHabitQuestSpreadsheet(
          accessToken,
          title?.trim() || "HabitQuest Data",
        );

        const nextStatus: Partial<SyncStatus> = {
          connected: true,
          spreadsheetId: created.spreadsheetId,
          spreadsheetUrl: created.spreadsheetUrl,
          spreadsheetTitle: created.properties.title,
          lastSyncedAt: null,
        };
        updateStatus(nextStatus);
        pulledRef.current = true;
        remoteSnapshotRef.current = null;

        const payload = buildPayload();
        if (hasData(payload)) {
          payload.updatedAt = new Date().toISOString();
          localChangedAtRef.current = payload.updatedAt;
          await pushPayload(payload, created.spreadsheetId);
        }

        toast.success("New HabitQuest sheet created");
      } catch (error) {
        console.error(error);
        toast.error(error instanceof Error ? error.message : "Could not create the sheet");
      } finally {
        setBusy(false);
      }
    },
    [buildPayload, pushPayload, updateStatus],
  );

  const linkSheet = useCallback(
    async (input: string) => {
      const accessToken = accessTokenRef.current;
      if (!accessToken) {
        toast.error("Connect Google first");
        return;
      }

      const spreadsheetId = extractSpreadsheetId(input);
      if (!spreadsheetId) {
        toast.error("Paste a valid Google Sheets URL or spreadsheet ID");
        return;
      }

      setBusy(true);
      try {
        const meta = await getSpreadsheetMeta(accessToken, spreadsheetId);
        updateStatus({
          connected: true,
          spreadsheetId: meta.spreadsheetId,
          spreadsheetUrl: meta.spreadsheetUrl,
          spreadsheetTitle: meta.properties.title,
          lastSyncedAt: null,
        });

        pulledRef.current = false;
        remoteSnapshotRef.current = null;
        await syncFromSheet(meta.spreadsheetId, { silent: false });
        pulledRef.current = true;
      } catch (error) {
        console.error(error);
        toast.error(error instanceof Error ? error.message : "Could not link that sheet");
      } finally {
        setBusy(false);
      }
    },
    [syncFromSheet, updateStatus],
  );

  const syncNow = useCallback(async () => {
    if (!status.spreadsheetId) {
      toast.error("Link your HabitQuest sheet first");
      return;
    }

    try {
      await syncFromSheet(status.spreadsheetId, { silent: false });
      pulledRef.current = true;
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Could not sync with your sheet");
    }
  }, [status.spreadsheetId, syncFromSheet]);

  const localSnap = ready ? snapshot(buildPayload()) : "";

  useEffect(() => {
    if (
      !ready ||
      !pulledRef.current ||
      !status.signedIn ||
      !status.spreadsheetId ||
      !accessTokenRef.current
    ) {
      return;
    }
    if (localSnap === remoteSnapshotRef.current) return;

    localChangedAtRef.current = new Date().toISOString();
    const timer = window.setTimeout(() => {
      const payload = buildPayload();
      void pushPayload(payload, status.spreadsheetId!).catch((error) => {
        console.error(error);
        toast.error(error instanceof Error ? error.message : "Could not save to your sheet");
      });
    }, PUSH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [buildPayload, localSnap, pushPayload, ready, status.signedIn, status.spreadsheetId]);

  useEffect(() => {
    if (!status.signedIn || !status.spreadsheetId) return;

    const tick = () => {
      if (document.visibilityState !== "visible" || !accessTokenRef.current) return;
      void syncFromSheet(status.spreadsheetId!, { silent: true }).catch((error) => {
        console.error(error);
      });
    };

    const interval = window.setInterval(tick, POLL_MS);
    window.addEventListener("focus", tick);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", tick);
    };
  }, [status.signedIn, status.spreadsheetId, syncFromSheet]);

  const value = useMemo<SyncCtx>(
    () => ({
      clientId,
      configured: Boolean(clientId),
      status,
      busy,
      syncing,
      saveClientId,
      signIn,
      signOut,
      disconnect,
      createSheet,
      linkSheet,
      syncNow,
    }),
    [
      busy,
      clientId,
      createSheet,
      disconnect,
      linkSheet,
      saveClientId,
      signIn,
      signOut,
      status,
      syncNow,
      syncing,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSheetSync() {
  const context = useContext(Ctx);
  if (!context) throw new Error("useSheetSync must be used inside SheetSyncProvider");
  return context;
}
