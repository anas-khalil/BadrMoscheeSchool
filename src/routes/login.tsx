import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { GROK_PROVIDERS, authClient, authEnabled, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { requestPasswordHelp } from "@/lib/school/api";
import { useI18n } from "@/lib/school/locale";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LangSwitch } from "@/components/school/lang-switch";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const { t } = useI18n();
  const { user, isPending } = useCurrentUserState();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpNote, setHelpNote] = useState("");
  const [helpDone, setHelpDone] = useState("");

  if (isPending) return <div className="min-h-screen bg-bg" />;
  if (user) return <Navigate to="/" />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) throw new Error(result.error.message);
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? `${t("authError")} ${err.message}` : t("authError"));
    } finally {
      setBusy(false);
    }
  }

  async function sendHelp(event: FormEvent) {
    event.preventDefault();
    await requestPasswordHelp({ data: { email, note: helpNote } });
    setHelpDone(t("helpSent"));
  }

  return (
    <div className="min-h-screen bg-bg text-fg">
      <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16">
        <div className="flex justify-end">
          <LangSwitch />
        </div>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-primary">{t("login")}</p>
          <h1 className="mt-2 font-display text-3xl">{t("appTitle")}</h1>
          <p className="mt-2 text-sm text-muted">{t("loginHint")}</p>
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
          <p className="mt-6 text-xs uppercase tracking-wide text-muted">{t("orEmail")}</p>
          <form className="mt-3 grid gap-4" onSubmit={onSubmit}>
            <Label>
              {t("email")}
              <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Label>
            <Label>
              {t("password")}
              <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </Label>
            {error && (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? t("loading") : t("signIn")}
            </Button>
          </form>
          <button type="button" className="mt-4 text-sm text-primary underline" onClick={() => setHelpOpen(true)}>
            {t("forgotPassword")}
          </button>
          {helpOpen && (
            <form className="mt-4 grid gap-3 border-t border-border pt-4" onSubmit={sendHelp}>
              <p className="text-sm text-muted">{t("forgotHelp")}</p>
              <Label>
                {t("email")}
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </Label>
              <Label>
                {t("description")}
                <Input value={helpNote} onChange={(e) => setHelpNote(e.target.value)} />
              </Label>
              <Button type="submit" variant="secondary">
                {t("sendHelpRequest")}
              </Button>
              {helpDone && <p className="text-sm text-primary">{helpDone}</p>}
            </form>
          )}
          <Link to="/signup" className="mt-6 block text-center text-sm text-primary underline">
            {t("switchToSignup")}
          </Link>
        </Card>
      </div>
    </div>
  );
}
