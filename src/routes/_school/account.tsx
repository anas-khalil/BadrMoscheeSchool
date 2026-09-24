import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { exportChildData, listDataRequests, listStudents, requestChildDeletion, resolveDataRequest } from "@/lib/school/api";
import { useI18n } from "@/lib/school/locale";
import { useSchoolSession } from "@/lib/school/session";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { DataRequest, StudentRecord } from "@/lib/school/types";

export const Route = createFileRoute("/_school/account")({ component: AccountPage });

function AccountPage() {
  const { t } = useI18n();
  const { snap } = useSchoolSession();
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [requests, setRequests] = useState<DataRequest[]>([]);
  const [payload, setPayload] = useState("");
  const [message, setMessage] = useState("");

  async function refresh() {
    const [roster, dataRequests] = await Promise.all([listStudents(), listDataRequests()]);
    setStudents(roster);
    setRequests(dataRequests);
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="grid gap-5">
      <Card>
        <h1 className="font-display text-2xl">{t("privacyTitle")}</h1>
        <p className="mt-3 text-pretty text-sm text-muted">{t("privacyBody")}</p>
      </Card>
      <Card>
        <h2 className="font-display text-xl">{t("children")}</h2>
        {students.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{t("noRecords")}</p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {students.map((student) => (
              <li key={student.id} className="flex flex-col gap-2 rounded-md border border-border px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span>{student.name}</span>
                <span className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      const result = await exportChildData({ data: student.id });
                      setPayload(result.payload);
                      setMessage(t("exportReady"));
                      await refresh();
                    }}
                  >
                    {t("exportChild")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    onClick={async () => {
                      await requestChildDeletion({ data: student.id });
                      setMessage(t("deleteRequested"));
                      await refresh();
                    }}
                  >
                    {t("deleteChild")}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {message && <p className="mt-3 text-sm text-primary">{message}</p>}
        {payload && (
          <pre className="mt-4 max-h-64 overflow-auto rounded-md bg-bg p-3 text-xs">{payload}</pre>
        )}
      </Card>
      {snap?.isAdmin && (
        <Card>
          <h2 className="font-display text-xl">{t("dataRequests")}</h2>
          {requests.length === 0 ? (
            <p className="mt-3 text-sm text-muted">{t("noRecords")}</p>
          ) : (
            <ul className="mt-4 grid gap-3">
              {requests.map((item) => (
                <li key={item.id} className="flex flex-col gap-2 rounded-md border border-border px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    <strong>
                      {item.kind} · {item.studentName || "—"}
                    </strong>
                    <span className="block text-sm text-muted">{item.status}</span>
                  </span>
                  {item.status === "open" && (
                    <span className="flex gap-2">
                      <Button type="button" size="sm" onClick={() => void resolveDataRequest({ data: { id: item.id, action: "fulfill" } }).then(refresh)}>
                        {t("fulfill")}
                      </Button>
                      <Button type="button" size="sm" variant="secondary" onClick={() => void resolveDataRequest({ data: { id: item.id, action: "deny" } }).then(refresh)}>
                        {t("deny")}
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
