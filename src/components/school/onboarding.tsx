import { useState, type FormEvent } from "react";
import { completeOnboarding } from "@/lib/school/api";
import { useI18n } from "@/lib/school/locale";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LangSwitch } from "./lang-switch";
import type { Role } from "@/lib/school/types";
import { Link } from "@tanstack/react-router";

export function OnboardingForm({ onDone }: { onDone: () => void }) {
  const { t, locale } = useI18n();
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("parent");
  const [childName, setChildName] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!consent) {
      setError(t("consentRequired"));
      return;
    }
    setBusy(true);
    try {
      await completeOnboarding({
        data: { name, role, childName, consent, language: locale },
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("authError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <div className="mb-6 flex justify-end">
        <LangSwitch />
      </div>
      <Card>
        <h1 className="font-display text-2xl">{t("onboardingTitle")}</h1>
        <p className="mt-2 text-sm text-muted">{t("onboardingText")}</p>
        <form className="mt-6 grid gap-4" onSubmit={onSubmit}>
          <Label>
            {t("name")}
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Label>
          <Label>
            {t("accountType")}
            <select
              className="h-11 rounded-md border border-border bg-surface px-3 text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              <option value="parent">{t("parent")}</option>
              <option value="teacher">{t("teacher")}</option>
            </select>
          </Label>
          {role === "parent" && (
            <Label>
              {t("studentName")}
              <Input value={childName} onChange={(e) => setChildName(e.target.value)} required />
            </Label>
          )}
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1 size-4"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              {t("consentLabel")}{" "}
              <Link to="/privacy" className="underline">
                {t("privacyTitle")}
              </Link>
            </span>
          </label>
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" disabled={busy}>
            {busy ? t("loading") : t("continue")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
