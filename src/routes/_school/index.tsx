import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getDashboard, seedSampleSchool } from "@/lib/school/api";
import { useI18n } from "@/lib/school/locale";
import { useSchoolSession } from "@/lib/school/session";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LangSwitch } from "@/components/school/lang-switch";
import { SignedOut } from "@/lib/auth/gates";

export const Route = createFileRoute("/_school/")({ component: HomePage });

function HomePage() {
  const { user } = useSchoolSession();
  if (!user) return <Landing />;
  return <Dashboard />;
}

function Landing() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <p className="font-display text-lg">{t("appTitle")}</p>
        <LangSwitch />
      </header>
      <main className="mx-auto grid max-w-3xl place-items-center px-4 py-20 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">{t("appTitle")}</p>
        <h1 className="mt-4 font-display text-4xl leading-tight tracking-tight md:text-5xl">{t("welcomeTitle")}</h1>
        <p className="mx-auto mt-4 max-w-xl text-muted">{t("welcomeText")}</p>
        <SignedOut>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild>
              <Link to="/login">{t("login")}</Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link to="/signup">{t("signup")}</Link>
            </Button>
          </div>
        </SignedOut>
        <p className="mt-10 max-w-lg text-sm text-muted">
          {t("privacyBody").slice(0, 180)}…{" "}
          <Link to="/privacy" className="underline">
            {t("privacyTitle")}
          </Link>
        </p>
      </main>
    </div>
  );
}

function Dashboard() {
  const { t } = useI18n();
  const { snap, reload } = useSchoolSession();
  const [counts, setCounts] = useState({ students: 0, teachers: 0, groups: 0, unreadMessages: 0, unreadAssignments: 0 });
  const [message, setMessage] = useState("");

  useEffect(() => {
    void getDashboard().then(setCounts).catch(() => undefined);
  }, []);

  async function seed() {
    const result = await seedSampleSchool();
    setMessage(result.seeded ? t("seedDone") : t("seedDone"));
    const next = await getDashboard();
    setCounts(next);
    reload();
  }

  return (
    <div className="grid gap-5">
      <Card className="bg-primary text-primary-fg">
        <p className="text-xs uppercase tracking-wide opacity-80">{t("signedInAs")}</p>
        <h1 className="mt-2 font-display text-3xl">{snap?.profile?.name || snap?.profile?.email}</h1>
        <p className="mt-1 text-sm opacity-80">{snap?.schoolName}</p>
        {snap?.isAdmin && (
          <div className="mt-6 grid grid-cols-3 gap-3">
            <Stat value={counts.teachers} label={t("teachers")} />
            <Stat value={counts.students} label={t("students")} />
            <Stat value={counts.groups} label={t("groups")} />
          </div>
        )}
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-3xl font-medium tabular-nums">{counts.unreadMessages}</p>
          <p className="text-sm text-muted">{t("unreadMessages")}</p>
        </Card>
        <Card>
          <p className="text-3xl font-medium tabular-nums">{counts.unreadAssignments}</p>
          <p className="text-sm text-muted">{t("unreadAssignments")}</p>
        </Card>
      </div>
      {snap?.isAdmin && (
        <Card>
          <h2 className="font-display text-xl">{t("emptyDashboard")}</h2>
          <div className="mt-4">
            <Button type="button" onClick={() => void seed()}>
              {t("seedSchool")}
            </Button>
          </div>
          {message && <p className="mt-3 text-sm text-primary">{message}</p>}
        </Card>
      )}
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-md bg-primary-fg/10 px-3 py-3">
      <p className="text-2xl font-medium tabular-nums">{value}</p>
      <p className="text-xs opacity-80">{label}</p>
    </div>
  );
}
