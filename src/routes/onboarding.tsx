import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { useHabits } from "@/lib/habit-store";
import { CATEGORIES, XP_BY_DIFFICULTY, type Difficulty } from "@/lib/habit-types";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Get started — HabitQuest" },
      {
        name: "description",
        content:
          "Pick your focus areas and your first habits. Three quick steps and your daily quest is ready.",
      },
      { property: "og:title", content: "Get started — HabitQuest" },
      {
        property: "og:description",
        content: "Build better habits by turning small actions into lasting progress.",
      },
    ],
  }),
  component: Onboarding,
});

const FOCUS = [
  "fitness",
  "learning",
  "health",
  "work",
  "mind",
  "personal",
  "finance",
  "creativity",
];

type Suggestion = {
  name: string;
  icon: string;
  category: string;
  difficulty: Difficulty;
  reminder: string;
};

const SUGGESTIONS: Suggestion[] = [
  { name: "Drink 2L of water", icon: "💧", category: "health", difficulty: "easy", reminder: "09:00" },
  { name: "Exercise 30 minutes", icon: "🏋️", category: "fitness", difficulty: "hard", reminder: "18:30" },
  { name: "Read 20 pages", icon: "📖", category: "learning", difficulty: "medium", reminder: "21:30" },
  { name: "Meditate 10 minutes", icon: "🧘", category: "mind", difficulty: "easy", reminder: "07:15" },
  { name: "Sleep 8 hours", icon: "😴", category: "sleep", difficulty: "medium", reminder: "23:00" },
  { name: "Study 45 minutes", icon: "📚", category: "learning", difficulty: "hard", reminder: "17:00" },
  { name: "Journal", icon: "✍️", category: "creativity", difficulty: "easy", reminder: "22:00" },
  { name: "Track spending", icon: "💰", category: "finance", difficulty: "easy", reminder: "20:00" },
];

const SLIDES = [
  { emoji: "🚀", title: "Build better habits.", body: "One tap a day. That's the whole game." },
  {
    emoji: "📈",
    title: "Turn small actions into lasting progress.",
    body: "Earn XP, level up and grow a streak worth protecting.",
  },
];

function Onboarding() {
  const navigate = useNavigate();
  const { setUser, addHabit, state } = useHabits();
  const [step, setStep] = useState(0);
  const [focus, setFocus] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState(state.user.name === "Friend" ? "" : state.user.name);

  const toggle = (list: string[], set: (v: string[]) => void, key: string) =>
    set(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

  const finish = () => {
    SUGGESTIONS.filter((s) => picked.includes(s.name)).forEach((s) =>
      addHabit({
        name: s.name,
        icon: s.icon,
        category: s.category,
        frequency: "daily",
        days: [],
        reminder: s.reminder,
        difficulty: s.difficulty,
        xpReward: XP_BY_DIFFICULTY[s.difficulty],
        timesPerDay: 1,
        active: true,

      }),
    );
    setUser({ onboarded: true, focus, name: name.trim() || "Friend" });
    navigate({ to: "/" });
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[520px] flex-col px-6 py-10">
      <div className="mb-8 flex gap-2" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`h-2 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`}
          />
        ))}
      </div>

      {step < 2 ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="text-7xl">{SLIDES[step]!.emoji}</div>
          <h1 className="mt-6 text-3xl text-balance-tight">{SLIDES[step]!.title}</h1>
          <p className="mt-3 text-base font-semibold text-muted-foreground">{SLIDES[step]!.body}</p>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="flex-1">
          <h1 className="text-3xl text-balance-tight">Choose what you want to improve.</h1>
          <p className="mt-2 text-sm font-semibold text-muted-foreground">Pick one or more.</p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            {FOCUS.map((key) => {
              const cat = CATEGORIES.find((c) => c.key === key)!;
              const on = focus.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggle(focus, setFocus, key)}
                  className={`btn-pop min-h-20 rounded-3xl border-2 p-3 text-left text-base font-extrabold ${
                    on ? "border-primary bg-primary-soft text-primary" : "border-border bg-card"
                  }`}
                >
                  <span className="block text-2xl">{cat.icon}</span>
                  {cat.label}
                </button>
              );
            })}
          </div>
          <label
            htmlFor="yourname"
            className="mt-7 block text-xs font-extrabold uppercase tracking-widest text-muted-foreground"
          >
            What should we call you?
          </label>
          <input
            id="yourname"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="mt-2 min-h-14 w-full rounded-2xl border-2 border-border bg-background px-4 text-base font-bold outline-none focus:border-primary"
          />
        </div>
      ) : null}

      {step === 3 ? (
        <div className="flex-1">
          <h1 className="text-3xl text-balance-tight">What habits do you want to start with?</h1>
          <p className="mt-2 text-sm font-semibold text-muted-foreground">
            Start with 3–5. You can always add more later.
          </p>
          <div className="mt-6 space-y-3">
            {SUGGESTIONS.map((s) => {
              const on = picked.includes(s.name);
              return (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => toggle(picked, setPicked, s.name)}
                  className={`flex min-h-16 w-full items-center gap-3 rounded-3xl border-2 px-4 text-left ${
                    on ? "border-primary bg-primary-soft" : "border-border bg-card"
                  }`}
                >
                  <span className="text-2xl">{s.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-extrabold">{s.name}</span>
                    <span className="text-xs font-bold text-muted-foreground">
                      +{XP_BY_DIFFICULTY[s.difficulty]} XP · {s.reminder}
                    </span>
                  </span>
                  <span
                    className={`grid size-8 shrink-0 place-items-center rounded-full border-2 ${
                      on ? "border-primary bg-primary text-primary-foreground" : "border-border"
                    }`}
                  >
                    {on ? <Check className="size-5 stroke-[3]" /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="sticky bottom-4 mt-8">
        <button
          type="button"
          disabled={(step === 2 && focus.length === 0) || (step === 3 && picked.length === 0)}
          onClick={() => (step === 3 ? finish() : setStep(step + 1))}
          className="btn-pop inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-extrabold uppercase tracking-wide text-primary-foreground disabled:opacity-40"
        >
          {step === 3 ? "Start my quest" : "Continue"} <ArrowRight className="size-5" />
        </button>
      </div>
    </div>
  );
}
