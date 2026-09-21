import type { ReactNode } from "react";
import { CATEGORIES } from "@/lib/habit-types";

export function ProgressBar({
  value,
  className = "",
  tone = "primary",
}: {
  value: number;
  className?: string;
  tone?: "primary" | "success" | "accent";
}) {
  const bg =
    tone === "success" ? "bg-success" : tone === "accent" ? "bg-accent" : "bg-primary";
  return (
    <div
      className={`h-4 w-full overflow-hidden rounded-full bg-muted ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(value * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full ${bg} transition-[width] duration-700 ease-out`}
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
      />
    </div>
  );
}

export function StatPill({
  icon,
  label,
  tone = "muted",
}: {
  icon: ReactNode;
  label: string;
  tone?: "muted" | "flame" | "accent" | "primary";
}) {
  const tones = {
    muted: "bg-muted text-foreground",
    flame: "bg-flame/15 text-flame",
    accent: "bg-accent/25 text-accent-foreground",
    primary: "bg-primary-soft text-primary",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-extrabold ${tones[tone]}`}
    >
      {icon}
      {label}
    </span>
  );
}

export function SectionTitle({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: string | undefined;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="text-xs font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
        {children}
      </h2>
      {hint ? <span className="text-xs font-bold text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

export function categoryOf(key: string) {
  return CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[9]!;
}

export function CircleRing({
  progress,
  size = 92,
  children,
}: {
  progress: number;
  size?: number;
  children?: ReactNode;
}) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} className="fill-none stroke-muted" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="fill-none stroke-success transition-[stroke-dashoffset] duration-700"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, progress)))}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}
