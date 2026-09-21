import { Link, useRouterState } from "@tanstack/react-router";
import { BarChart3, Home, ListChecks, User } from "lucide-react";
import type { ReactNode } from "react";

const TABS = [
  { to: "/", label: "Today", icon: Home },
  { to: "/habits", label: "Habits", icon: ListChecks },
  { to: "/progress", label: "Progress", icon: BarChart3 },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto min-h-screen w-full max-w-[520px] bg-background pb-28 shadow-[0_0_60px_-30px_rgba(0,0,0,0.35)] sm:max-w-[560px]">
        <main className="px-5 pt-6">{children}</main>
      </div>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur"
      >
        <ul className="mx-auto grid max-w-[520px] grid-cols-4 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 sm:max-w-[560px]">
          {TABS.map((tab) => {
            const active = tab.to === "/" ? pathname === "/" : pathname.startsWith(tab.to);
            const Icon = tab.icon;
            return (
              <li key={tab.to}>
                <Link
                  to={tab.to}
                  className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-extrabold uppercase tracking-wide transition-colors ${
                    active
                      ? "bg-primary-soft text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className={`size-6 ${active ? "stroke-[2.6]" : "stroke-[2]"}`} />
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
