import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { RedirectToSignIn, UserButton } from "@/lib/auth/gates";
import { SchoolShell } from "@/components/school/shell";
import { OnboardingForm } from "@/components/school/onboarding";
import { useSchoolSession } from "@/lib/school/session";
import { useI18n } from "@/lib/school/locale";
import { LangSwitch } from "@/components/school/lang-switch";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_school")({
  component: SchoolLayout,
});

function SchoolLayout() {
  const { t } = useI18n();
  const { user, isPending, snap, reload } = useSchoolSession();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  if (isPending) {
    return (
      <div className="grid min-h-screen place-items-center bg-bg">
        <div className="h-24 w-64 animate-pulse rounded-xl bg-bg-subtle" />
      </div>
    );
  }

  if (!user) {
    if (pathname === "/") return <Outlet />;
    return <RedirectToSignIn />;
  }

  if (snap?.needsOnboarding) {
    return (
      <div className="min-h-screen bg-bg text-fg">
        <OnboardingForm onDone={reload} />
      </div>
    );
  }

  if (snap?.profile?.status === "pending" || snap?.profile?.status === "rejected") {
    return (
      <div className="min-h-screen bg-bg text-fg">
        <header className="flex items-center justify-end gap-3 px-4 py-4">
          <LangSwitch />
          <UserButton />
        </header>
        <div className="mx-auto max-w-lg px-4 py-20">
          <Card>
            <p className="text-xs font-medium uppercase tracking-wide text-primary">{t("pending")}</p>
            <h1 className="mt-2 font-display text-2xl">{t("appTitle")}</h1>
            <p className="mt-3 text-sm text-muted">
              {snap.profile.status === "rejected" ? t("rejectedNote") : t("pendingNote")}
            </p>
          </Card>
        </div>
      </div>
    );
  }

  return <SchoolShell />;
}
