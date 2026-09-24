import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { BookOpen, CalendarDays, ClipboardCheck, Inbox, LayoutDashboard, Shield, Users, Lock } from "lucide-react";
import { UserButton } from "@/lib/auth/gates";
import { useI18n } from "@/lib/school/locale";
import { useSchoolSession } from "@/lib/school/session";
import { LangSwitch } from "./lang-switch";
import { Badge } from "@/components/ui/badge";
import type { Msg } from "@/lib/school/i18n";

const NAV: { to: string; key: Msg; icon: typeof LayoutDashboard; admin?: boolean }[] = [
  { to: "/", key: "dashboard", icon: LayoutDashboard },
  { to: "/calendar", key: "calendar", icon: CalendarDays },
  { to: "/messages", key: "messages", icon: Inbox },
  { to: "/attendance", key: "attendance", icon: ClipboardCheck },
  { to: "/assignments", key: "assignments", icon: BookOpen },
  { to: "/approvals", key: "approvals", icon: Shield, admin: true },
  { to: "/groups", key: "groups", icon: Users, admin: true },
  { to: "/account", key: "privacy", icon: Lock },
];

export function SchoolShell() {
  const { t } = useI18n();
  const { snap, isPending } = useSchoolSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAdmin = snap?.isAdmin ?? false;

  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="font-display text-xl font-medium tracking-tight text-balance">{t("appTitle")}</p>
            <p className="text-sm text-muted">{t("tagline")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <LangSwitch />
            {isPending ? <div className="h-8 w-28 animate-pulse rounded-full bg-bg-subtle" /> : <UserButton />}
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-2">
          {snap?.profile && (
            <div className="mb-2 rounded-lg border border-border bg-surface p-3">
              <Badge>{t(snap.profile.role)}</Badge>
              <p className="mt-2 text-sm font-medium">{snap.profile.name || snap.profile.email}</p>
              <p className="text-xs text-muted">{snap.profile.email}</p>
            </div>
          )}
          <nav className="grid gap-1">
            {NAV.filter((item) => !item.admin || isAdmin).map((item) => {
              const active = pathname === item.to;
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex h-11 items-center gap-2 rounded-md px-3 text-sm font-medium ${
                    active ? "bg-primary text-primary-fg" : "text-fg hover:bg-bg-subtle"
                  }`}
                >
                  <Icon className="size-4" />
                  {t(item.key)}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
