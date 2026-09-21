import { createFileRoute } from "@tanstack/react-router";
import {
  Camera,
  Download,
  Flame,
  Monitor,
  Moon,
  RotateCcw,
  Shield,
  Sun,
  Trophy,
  Upload,
  X,
} from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { SyncCard } from "@/components/SyncCard";
import { ProgressBar, SectionTitle } from "@/components/ui-bits";
import { useHabits } from "@/lib/habit-store";
import { exportStateToXlsx, importXlsxIntoState } from "@/lib/habit-xlsx";
import { ACHIEVEMENTS, type ThemeMode } from "@/lib/habit-types";


export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile & achievements — HabitQuest" },
      {
        name: "description",
        content:
          "Your level, XP, streak record, streak freezes and the achievements you've unlocked on HabitQuest.",
      },
      { property: "og:title", content: "Profile & achievements — HabitQuest" },
      {
        property: "og:description",
        content: "Track your level, trophies and streak protection.",
      },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const {
    state,
    importData,
    level,
    streak,
    longestStreak,
    unlockedAchievements,
    achievementProgress,
    setUser,
    reset,
    loadSample,
  } = useHabits();

  const unlockedCount = Object.values(unlockedAchievements).filter(Boolean).length;
  const fileRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    try {
      exportStateToXlsx(state);
      toast.success("Data exported to XLSX");
    } catch {
      toast.error("Could not export your data");
    }
  };

  const handleImport = async (file: File) => {
    try {
      const res = await importXlsxIntoState(file, state);
      importData({ habits: res.habits, completions: res.completions });
      toast.success(
        `Imported ${res.newCompletions} entries and ${res.newHabits} habits` +
          (res.skipped ? ` · ${res.skipped} rows skipped` : ""),
      );
    } catch {
      toast.error("That file could not be read. Use the exported template.");
    }
  };

  const handlePhoto = (file: File) => {
    if (file.size > 4_000_000) {
      toast.error("That image is too big (max 4 MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setUser({ photo: String(reader.result) });
      toast.success("Profile photo updated");
    };
    reader.onerror = () => toast.error("Could not read that image");
    reader.readAsDataURL(file);
  };

  return (
    <AppShell>
      <h1 className="text-2xl">Profile</h1>

      <section className="card-soft mt-5 p-6 text-center">
        <div className="relative mx-auto w-24">
          {state.user.photo ? (
            <img
              src={state.user.photo}
              alt="Your profile"
              loading="lazy"
              className="size-24 rounded-full object-cover"
            />
          ) : (
            <span className="grid size-24 place-items-center rounded-full bg-primary-soft text-5xl">
              {state.user.avatar}
            </span>
          )}
          <button
            type="button"
            onClick={() => photoRef.current?.click()}
            aria-label="Upload profile photo"
            className="btn-pop absolute -bottom-1 -right-1 grid size-9 place-items-center rounded-full bg-primary text-primary-foreground"
          >
            <Camera className="size-4" />
          </button>
          {state.user.photo ? (
            <button
              type="button"
              onClick={() => setUser({ photo: undefined })}
              aria-label="Remove profile photo"
              className="btn-pop absolute -bottom-1 -left-1 grid size-9 place-items-center rounded-full bg-muted"
            >
              <X className="size-4" />
            </button>
          ) : null}
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) handlePhoto(file);
            }}
          />
        </div>

        <input
          value={state.user.name}
          onChange={(e) => setUser({ name: e.target.value })}
          aria-label="Your name"
          className="mt-4 w-full rounded-2xl bg-transparent text-center text-2xl font-extrabold outline-none focus:bg-muted"
        />
        <p className="mt-1 text-sm font-extrabold text-primary">Level {level.level}</p>
        <div className="mt-4">
          <ProgressBar value={level.progress} />
          <p className="mt-1.5 text-xs font-bold text-muted-foreground">
            {state.user.xp.toLocaleString()} / {level.nextLevelXp.toLocaleString()} XP
          </p>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          <Mini icon={<Flame className="size-4 text-flame" />} value={`${streak}`} label="Streak" />
          <Mini icon={<Trophy className="size-4 text-accent" />} value={`${longestStreak}`} label="Best" />
          <Mini icon={<Shield className="size-4 text-primary" />} value={`${state.user.streakFreezes}`} label="Freezes" />
        </div>
      </section>

      <section className="mt-8">
        <SectionTitle hint={`×${state.user.streakFreezes} left`}>Streak freeze</SectionTitle>
        <div className="card-soft flex items-start gap-4 p-5">
          <span className="text-3xl">🛡️</span>
          <p className="text-sm font-semibold text-muted-foreground">
            Miss a day and a freeze is used automatically — your streak survives instead of
            resetting. You earn one freeze for every 7-day streak, up to 3.
          </p>
        </div>
      </section>

      <section className="mt-8">
        <SectionTitle hint={`${unlockedCount}/${ACHIEVEMENTS.length}`}>Achievements</SectionTitle>
        {unlockedCount === 0 ? (
          <div className="card-soft mb-3 px-6 py-8 text-center">
            <div className="text-4xl">🏆</div>
            <h3 className="mt-2 text-lg">Your trophy cabinet is waiting.</h3>
            <p className="text-sm font-semibold text-muted-foreground">
              Complete your first habit to unlock one.
            </p>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          {ACHIEVEMENTS.map((a) => {
            const unlocked = unlockedAchievements[a.id];
            const value = achievementProgress[a.id] ?? 0;
            return (
              <article
                key={a.id}
                className={`card-soft p-4 ${unlocked ? "" : "opacity-55 grayscale"}`}
              >
                <span className="text-3xl">{a.icon}</span>
                <h3 className="mt-2 truncate text-base font-extrabold">{a.name}</h3>
                <p className="mt-0.5 text-xs font-semibold text-muted-foreground">{a.description}</p>
                {!unlocked ? (
                  <>
                    <ProgressBar className="mt-3 h-2" value={value / a.target} />
                    <p className="mt-1 text-[11px] font-extrabold text-muted-foreground">
                      {value}/{a.target}
                    </p>
                  </>
                ) : (
                  <p className="mt-3 text-[11px] font-extrabold uppercase tracking-wide text-success">
                    Unlocked
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-8">
        <SectionTitle hint={state.user.theme}>Appearance</SectionTitle>
        <div className="card-soft grid grid-cols-3 gap-2 p-2">
          {(
            [
              { key: "light", label: "Light", icon: <Sun className="size-5" /> },
              { key: "dark", label: "Dark", icon: <Moon className="size-5" /> },
              { key: "system", label: "System", icon: <Monitor className="size-5" /> },
            ] as { key: ThemeMode; label: string; icon: React.ReactNode }[]
          ).map((opt) => {
            const active = state.user.theme === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setUser({ theme: opt.key })}
                aria-pressed={active}
                className={`btn-pop flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border-2 text-xs font-extrabold ${
                  active
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-transparent bg-muted text-muted-foreground"
                }`}
              >
                {opt.icon}
                {opt.label}
              </button>
            );
          })}
        </div>
      </section>

      <SyncCard />





      <section className="mt-8">
        <SectionTitle hint="XLSX">Your data</SectionTitle>
        <div className="card-soft divide-y divide-border p-2">
          <button
            type="button"
            onClick={handleExport}
            className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 text-left text-sm font-extrabold hover:bg-muted"
          >
            <Download className="size-5 text-primary" /> Download habits & history (.xlsx)
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 text-left text-sm font-extrabold hover:bg-muted"
          >
            <Upload className="size-5 text-success" /> Import history from .xlsx
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void handleImport(file);
            }}
          />
        </div>
        <p className="mt-2 px-2 text-xs font-semibold text-muted-foreground">
          The file has a <strong>Habits</strong> sheet and a <strong>History</strong> sheet
          (date, habitId, habitName, xpEarned). Importing merges rows — duplicates are ignored.
        </p>
      </section>

      <section className="mt-8">
        <SectionTitle>Settings</SectionTitle>
        <div className="card-soft divide-y divide-border p-2">
          <button
            type="button"
            onClick={loadSample}
            className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 text-left text-sm font-extrabold hover:bg-muted"
          >
            <RotateCcw className="size-5 text-muted-foreground" /> Reload sample journey
          </button>
          <button
            type="button"
            onClick={reset}
            className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 text-left text-sm font-extrabold text-destructive hover:bg-destructive/10"
          >
            <RotateCcw className="size-5" /> Start from scratch
          </button>
        </div>
      </section>
    </AppShell>
  );
}

function Mini({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-2xl bg-muted px-2 py-3">
      <div className="flex items-center justify-center gap-1.5 text-lg font-extrabold">
        {icon}
        {value}
      </div>
      <p className="mt-0.5 text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
