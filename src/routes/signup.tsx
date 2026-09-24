import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { GROK_PROVIDERS, authClient, authEnabled, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { completeOnboarding } from "@/lib/school/api";
import { useI18n } from "@/lib/school/locale";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LangSwitch } from "@/components/school/lang-switch";
import type { Role } from "@/lib/school/types";

export const Route = createFileRoute("/signup")({ component: SignupPage });

function SignupPage() {
  const { t, locale } = useI18n();
  const { user, isPending } = useCurrentUserState();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("parent");
  const [childName, setChildName] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (isPending) return <div className="min-h-screen bg-bg" />;
  if (user) return <Navigate to="/" />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!consent) {
      setError(t("consentRequired"));
      return;
    }
    setBusy(true);
    try {
      const result = await authClient.signUp.email({ email, password, name });
      if (result.error) throw new Error(result.error.message);
      await completeOnboarding({
        data: { name, role, childName, consent, language: locale },
      });
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? `${t("authError")} ${err.message}` : t("authError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg text-fg">
      <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16">
        <div className="flex justify-end">
          <LangSwitch />
        </div>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-primary">{t("signup")}</p>
          <h1 className="mt-2 font-display text-3xl">{t("appTitle")}</h1>
          <p className="mt-2 text-sm text-muted">{t("signupNote")}</p>
          {authEnabled && (
            <div className="mt-6 grid gap-2">
              {GROK_PROVIDERS.map((provider) => (
                <Button
                  key={provider.providerId}
                  type="button"
                  variant="secondary"
                  onClick={() => void signIn(provider.providerId, { callbackURL: "/" })}
                >
                  {t("continueWith")} {provider.label}
                </Button>
              ))}
            </div>
          )}
          <form className="mt-6 grid gap-4" onSubmit={onSubmit}>
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
            <Label>
              {t("name")}
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </Label>
            {role === "parent" && (
              <Label>
                {t("studentName")}
                <Input value={childName} onChange={(e) => setChildName(e.target.value)} required />
              </Label>
            )}
            <Label>
              {t("email")}
              <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Label>
            <Label>
              {t("password")}
              <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </Label>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-1 size-4" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>
                {t("consentLabel")}{" "}
                <Link to="/privacy" className="underline">
                  {t("privacyTitle")}
                </Link>
              </span>
            </label>
            {error && (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? t("loading") : t("createAccount")}
            </Button>
          </form>
          <Link to="/login" className="mt-6 block text-center text-sm text-primary underline">
            {t("switchToLogin")}
          </Link>
        </Card>
      </div>
    </div>
  );
}
