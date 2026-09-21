import { Cloud, CloudOff, ExternalLink, Link2, LogOut, RefreshCw, Save, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import { SectionTitle } from "@/components/ui-bits";
import { useSheetSync } from "@/lib/sheet-sync-store";

export function SyncCard() {
  const {
    clientId,
    configured,
    status,
    busy,
    syncing,
    saveClientId,
    signIn,
    signOut,
    disconnect,
    linkSheet,
    syncNow,
  } = useSheetSync();

  const [oauthClientId, setOauthClientId] = useState(clientId);
  const [url, setUrl] = useState("");

  useEffect(() => setOauthClientId(clientId), [clientId]);

  const saveOAuth = () => {
    saveClientId(oauthClientId);
  };

  return (
    <section className="mt-8">
      <SectionTitle hint={status.spreadsheetId ? "Linked" : "Off"}>Google Sheets sync</SectionTitle>
      <div className="card-soft space-y-3 p-4">
        {!configured ? (
          <>
            <p className="text-sm font-semibold text-muted-foreground">
              HabitQuest now connects directly to Google. Add your Google OAuth web client ID once;
              it is stored only in this browser and is not a secret.
            </p>
            <label className="flex items-center gap-2 rounded-2xl bg-muted px-3">
              <Settings2 className="size-4 shrink-0 text-muted-foreground" />
              <input
                value={oauthClientId}
                onChange={(event) => setOauthClientId(event.target.value)}
                placeholder="123456789-abc.apps.googleusercontent.com"
                aria-label="Google OAuth client ID"
                className="min-h-12 w-full bg-transparent text-sm font-bold outline-none"
              />
            </label>
            <button
              type="button"
              onClick={saveOAuth}
              disabled={!oauthClientId.trim()}
              className="btn-pop flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-extrabold uppercase tracking-wide text-primary-foreground disabled:opacity-60"
            >
              <Save className="size-5" /> Save client ID
            </button>
          </>
        ) : !status.signedIn ? (
          <>
            <p className="text-sm font-semibold text-muted-foreground">
              Connect your Google account. HabitQuest requests access only to Google Sheets and keeps
              the access token in memory.
            </p>
            <button
              type="button"
              onClick={() => void signIn()}
              disabled={busy}
              className="btn-pop flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-extrabold uppercase tracking-wide text-primary-foreground disabled:opacity-60"
            >
              <Cloud className="size-5" /> Connect Google
            </button>
            <button
              type="button"
              onClick={() => saveClientId("")}
              className="btn-pop min-h-10 w-full rounded-2xl bg-muted px-3 text-xs font-extrabold text-muted-foreground"
            >
              Change OAuth client ID
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-extrabold text-success">Google connected</p>
              <button
                type="button"
                onClick={() => void signOut()}
                className="btn-pop flex min-h-10 items-center gap-1.5 rounded-2xl bg-muted px-3 text-xs font-extrabold text-muted-foreground"
              >
                <LogOut className="size-4" /> Sign out
              </button>
            </div>

            {status.spreadsheetId ? (
              <>
                {status.spreadsheetUrl ? (
                  <a
                    href={status.spreadsheetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-h-12 items-center gap-2 rounded-2xl bg-muted px-3 text-sm font-extrabold"
                  >
                    <ExternalLink className="size-4 shrink-0 text-primary" />
                    <span className="truncate">{status.spreadsheetTitle || "Open spreadsheet"}</span>
                  </a>
                ) : null}

                <button
                  type="button"
                  onClick={() => void syncNow()}
                  disabled={syncing}
                  className="btn-pop flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-extrabold uppercase tracking-wide text-primary-foreground disabled:opacity-60"
                >
                  <RefreshCw className={`size-5 ${syncing ? "animate-spin" : ""}`} />
                  {syncing ? "Syncing..." : "Sync now"}
                </button>

                <button
                  type="button"
                  onClick={() => void disconnect()}
                  disabled={busy}
                  className="btn-pop flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl text-xs font-extrabold text-destructive disabled:opacity-60"
                >
                  <CloudOff className="size-4" /> Unlink this sheet from this browser
                </button>

                <p className="text-xs font-semibold text-muted-foreground">
                  Unlinking never deletes the Google Sheet.
                  {status.lastSyncedAt
                    ? ` Last sync: ${new Date(status.lastSyncedAt).toLocaleString("en-US")}`
                    : ""}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-muted-foreground">
                  Paste the URL of your existing <strong>HabitQuest Data</strong> sheet. HabitQuest
                  reads it before any write, so a fresh browser cannot overwrite your history with
                  an empty state.
                </p>

                <label className="flex items-center gap-2 rounded-2xl bg-muted px-3">
                  <Link2 className="size-4 shrink-0 text-muted-foreground" />
                  <input
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    aria-label="Spreadsheet link"
                    className="min-h-12 w-full bg-transparent text-sm font-bold outline-none"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void linkSheet(url)}
                  disabled={busy || !url.trim()}
                  className="btn-pop flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-extrabold uppercase tracking-wide text-primary-foreground disabled:opacity-60"
                >
                  <Link2 className="size-5" /> Use this existing sheet
                </button>
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
