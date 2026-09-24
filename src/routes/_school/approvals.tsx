import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { closePasswordHelp, listPasswordHelp, listPending, listStudents, reviewAccount } from "@/lib/school/api";
import { useI18n } from "@/lib/school/locale";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Profile, StudentRecord } from "@/lib/school/types";
import type { Msg } from "@/lib/school/i18n";

export const Route = createFileRoute("/_school/approvals")({ component: ApprovalsPage });

function ApprovalsPage() {
  const { t } = useI18n();
  const [pending, setPending] = useState<Profile[]>([]);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [help, setHelp] = useState<{ id: string; email: string; note: string }[]>([]);
  const [message, setMessage] = useState("");

  async function refresh() {
    const [accounts, roster, requests] = await Promise.all([listPending(), listStudents(), listPasswordHelp()]);
    setPending(accounts);
    setStudents(roster);
    setHelp(requests);
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="grid gap-5">
      <Card>
        <h1 className="font-display text-2xl">{t("pendingAccounts")}</h1>
        {message && <p className="mt-2 text-sm text-primary">{message}</p>}
        {pending.length === 0 ? (
          <p className="mt-4 text-sm text-muted">{t("noPending")}</p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {pending.map((account) => (
              <li key={account.userId} className="flex flex-col gap-3 rounded-md border border-border px-3 py-3">
                <span>
                  <strong>
                    {account.name} · {t(account.role as Msg)}
                  </strong>
                  <span className="block text-sm text-muted">{account.email}</span>
                  {account.requestedChildName && (
                    <span className="block text-sm text-muted">
                      {t("requestedChild")}: {account.requestedChildName}
                    </span>
                  )}
                </span>
                {account.role === "parent" && (
                  <select
                    className="h-11 rounded-md border border-border bg-surface px-3 text-sm"
                    value={links[account.userId] || ""}
                    onChange={(e) => setLinks((current) => ({ ...current, [account.userId]: e.target.value }))}
                  >
                    <option value="">{t("studentName")}</option>
                    {students.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.name}
                      </option>
                    ))}
                  </select>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={async () => {
                      try {
                        await reviewAccount({
                          data: {
                            userId: account.userId,
                            action: "approve",
                            studentIds: links[account.userId] ? [links[account.userId]] : [],
                          },
                        });
                        setMessage(t("approved"));
                        await refresh();
                      } catch {
                        setMessage(t("mustLinkChild"));
                      }
                    }}
                  >
                    {t("approve")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    onClick={async () => {
                      if (!window.confirm(t("confirmReject"))) return;
                      await reviewAccount({ data: { userId: account.userId, action: "reject", studentIds: [] } });
                      setMessage(t("rejectedAccount"));
                      await refresh();
                    }}
                  >
                    {t("reject")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <h2 className="font-display text-xl">{t("helpRequests")}</h2>
        {help.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{t("noHelp")}</p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {help.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-3">
                <span>
                  <strong>{item.email}</strong>
                  <span className="block text-sm text-muted">{item.note}</span>
                </span>
                <Button type="button" size="sm" variant="secondary" onClick={() => void closePasswordHelp({ data: item.id }).then(refresh)}>
                  {t("fulfill")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
