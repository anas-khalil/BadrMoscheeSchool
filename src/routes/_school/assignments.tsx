import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { createAssignment, listAssignments, listGroups, markAssignmentRead } from "@/lib/school/api";
import { useI18n } from "@/lib/school/locale";
import { useSchoolSession } from "@/lib/school/session";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AssignmentRecord, GroupRecord } from "@/lib/school/types";

export const Route = createFileRoute("/_school/assignments")({ component: AssignmentsPage });

function AssignmentsPage() {
  const { t } = useI18n();
  const { snap } = useSchoolSession();
  const [items, setItems] = useState<AssignmentRecord[]>([]);
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [groupId, setGroupId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [message, setMessage] = useState("");

  async function refresh() {
    const [assignments, classGroups] = await Promise.all([listAssignments(), listGroups()]);
    setItems(assignments);
    setGroups(classGroups);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await createAssignment({ data: { groupId, title, description, dueDate } });
    setTitle("");
    setDescription("");
    setDueDate("");
    setMessage(t("assignmentCreated"));
    await refresh();
  }

  return (
    <div className="grid gap-5">
      <Card>
        <h1 className="font-display text-2xl">{t("assignments")}</h1>
        <ul className="mt-4 grid gap-3">
          {items.length === 0 ? (
            <li className="text-sm text-muted">{t("noRecords")}</li>
          ) : (
            items.map((item) => (
              <li key={item.id} className="rounded-md border border-border px-3 py-3">
                <p className="font-medium">
                  {item.title}
                  {item.unread ? " · •" : ""}
                </p>
                <p className="text-sm text-muted">
                  {item.groupName}
                  {item.dueDate ? ` · ${item.dueDate}` : ""}
                </p>
                <p className="mt-1 text-sm">{item.description}</p>
                {item.unread && (
                  <Button
                    className="mt-2"
                    size="sm"
                    variant="secondary"
                    type="button"
                    onClick={() => void markAssignmentRead({ data: item.id }).then(refresh)}
                  >
                    {t("markRead")}
                  </Button>
                )}
              </li>
            ))
          )}
        </ul>
      </Card>
      {snap?.isTeacher && (
        <Card>
          <h2 className="font-display text-xl">{t("createAssignment")}</h2>
          <form className="mt-4 grid gap-3" onSubmit={onSubmit}>
            <Label>
              {t("group")}
              <select
                className="h-11 rounded-md border border-border bg-surface px-3 text-sm"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                required
              >
                <option value="">{t("group")}</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.subject} · {group.level}
                  </option>
                ))}
              </select>
            </Label>
            <Label>
              {t("assignmentTitle")}
              <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </Label>
            <Label>
              {t("dueDate")}
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Label>
            <Label>
              {t("description")}
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </Label>
            <Button type="submit">{t("createAssignment")}</Button>
          </form>
          {message && <p className="mt-3 text-sm text-primary">{message}</p>}
        </Card>
      )}
    </div>
  );
}
