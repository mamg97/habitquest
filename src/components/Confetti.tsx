import { useEffect, useMemo, useState } from "react";

const COLORS = [
  "bg-primary",
  "bg-success",
  "bg-accent",
  "bg-cat-fitness",
  "bg-cat-social",
  "bg-cat-creativity",
];

export function Confetti({ count = 60, duration = 2200 }: { count?: number; duration?: number }) {
  const [alive, setAlive] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setAlive(false), duration);
    return () => clearTimeout(t);
  }, [duration]);

  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        dx: `${(Math.random() - 0.5) * 220}px`,
        delay: Math.random() * 400,
        dur: 1400 + Math.random() * 900,
        size: 6 + Math.random() * 8,
        color: COLORS[i % COLORS.length],
        round: Math.random() > 0.5,
      })),
    [count],
  );

  if (!alive) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-hidden>
      {pieces.map((p) => (
        <span
          key={p.id}
          className={`absolute top-0 ${p.color} ${p.round ? "rounded-full" : "rounded-[2px]"}`}
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 1.4,
            // @ts-expect-error custom property
            "--dx": p.dx,
            animation: `confetti-fall ${p.dur}ms cubic-bezier(0.2,0.6,0.4,1) ${p.delay}ms forwards`,
          }}
        />
      ))}
    </div>
  );
}
