import { Cloud, CloudOff, ExternalLink, Link2, LogOut, RefreshCw } from "lucide-react";
import { useState } from "react";
import { SectionTitle } from "@/components/ui-bits";
import { useSheetSync } from "@/lib/sheet-sync-store";

export function SyncCard() {
  const {
    status,
    busy,
    syncing,
    signIn,
    signOut,
    disconnect,
    linkSheet,
    syncNow,
  } = useSheetSync();

  const [url, setUrl] = useState("");

  return (
    <section className="mt-8">
      <SectionTitle hint={status.spreadsheetId ? "Linked" : "Off"}>Google Sheets sync</SectionTitle>
      <div className="card-soft space-y-3 p-4">
        {!status.signedIn ? (
          <>
            <p className="text-sm font-semibold text-muted-foreground">
              Connect Google once. HabitQuest keeps a persistent encrypted session and renews short-lived
              Google access tokens automatically.
            </p>
            <button
              type="button"
              onClick={() => void signIn()}
              disabled={busy}
              className="btn-pop flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-extrabold uppercase tracking-wide text-primary-foreground disabled:opacity-60"
            >
              <Cloud className="size-5" /> Connect Google
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
