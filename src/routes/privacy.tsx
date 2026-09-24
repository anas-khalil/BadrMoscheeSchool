import { createFileRoute, Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/school/locale";
import { Card } from "@/components/ui/card";
import { LangSwitch } from "@/components/school/lang-switch";

export const Route = createFileRoute("/privacy")({ component: PrivacyPage });

function PrivacyPage() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-bg text-fg">
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="mb-6 flex items-center justify-between">
          <Link to="/" className="text-sm text-primary underline">
            {t("back")}
          </Link>
          <LangSwitch />
        </div>
        <Card>
          <h1 className="font-display text-3xl">{t("privacyTitle")}</h1>
          <p className="mt-4 text-pretty text-muted">{t("privacyBody")}</p>
        </Card>
      </div>
    </div>
  );
}
