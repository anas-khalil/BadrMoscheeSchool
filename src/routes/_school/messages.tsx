import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { listDirectory, listGroups, listMessages, listStudents, markMessageRead, sendMessage } from "@/lib/school/api";
import { useI18n } from "@/lib/school/locale";
import { useSchoolSession } from "@/lib/school/session";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { DirectoryPerson, GroupRecord, MessageRecord, StudentRecord } from "@/lib/school/types";

export const Route = createFileRoute("/_school/messages")({ component: MessagesPage });

function MessagesPage() {
  const { t } = useI18n();
  const { user, snap } = useSchoolSession();
  const [records, setRecords] = useState<MessageRecord[]>([]);
  const [people, setPeople] = useState<DirectoryPerson[]>([]);
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [body, setBody] = useState("");
  const [recipientType, setRecipientType] = useState("teacher");
  const [recipientId, setRecipientId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [status, setStatus] = useState("");

  async function refresh() {
    const [messages, directory, classGroups, roster] = await Promise.all([
      listMessages({ data: { page: 0 } }),
      listDirectory(),
      listGroups(),
      listStudents(),
    ]);
    setRecords(messages.records);
    setPeople(directory);
    setGroups(classGroups);
    setStudents(roster);
  }

  useEffect(() => {
    void refresh();
  }, []);

  const inbox = records.filter((item) => item.recipientId === user?.id);
  const sent = records.filter((item) => item.senderId === user?.id);

  const options = useMemo(() => {
    if (recipientType === "admin") return people.filter((item) => item.role === "admin");
    if (recipientType === "teacher") return people.filter((item) => item.role === "teacher" || item.role === "admin");
    if (recipientType === "parent" || recipientType === "individual") return people.filter((item) => item.role === "parent");
    return people;
  }, [people, recipientType]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    let ids: string[] = [];
    if (recipientType === "everyone") ids = people.map((item) => item.id);
    else if (recipientType === "group") {
      const group = groups.find((item) => item.id === groupId);
      ids = students
        .filter((student) => group?.studentIds.includes(student.id))
        .flatMap((student) => student.parentIds);
    } else if (recipientId) ids = [recipientId];
    await sendMessage({ data: { recipientIds: ids, body } });
    setBody("");
    setStatus(t("messageSent"));
    await refresh();
  }

  return (
    <div className="grid gap-5">
      <Card>
        <h1 className="font-display text-2xl">{t("inbox")}</h1>
        <ul className="mt-4 grid gap-3">
          {inbox.length === 0 ? (
            <li className="text-sm text-muted">{t("noRecords")}</li>
          ) : (
            inbox.map((item) => (
              <li key={item.id} className="rounded-md border border-border px-3 py-3">
                <p className="text-sm font-medium">
                  {item.senderName}
                  {item.unread ? " · •" : ""}
                </p>
                <p className="text-sm text-muted">{item.body}</p>
                {item.unread && (
                  <Button
                    className="mt-2"
                    size="sm"
                    variant="secondary"
                    type="button"
                    onClick={() => void markMessageRead({ data: item.id }).then(refresh)}
                  >
                    {t("markRead")}
                  </Button>
                )}
              </li>
            ))
          )}
        </ul>
      </Card>
      <Card>
        <h2 className="font-display text-xl">{t("sent")}</h2>
        <ul className="mt-4 grid gap-3">
          {sent.length === 0 ? (
            <li className="text-sm text-muted">{t("noRecords")}</li>
          ) : (
            sent.map((item) => (
              <li key={item.id} className="rounded-md border border-border px-3 py-3 text-sm">
                {item.body}
              </li>
            ))
          )}
        </ul>
      </Card>
      <Card>
        <h2 className="font-display text-xl">{t("sendMessage")}</h2>
        <form className="mt-4 grid gap-3" onSubmit={onSubmit}>
          <Label>
            {t("recipientType")}
            <select
              className="h-11 rounded-md border border-border bg-surface px-3 text-sm"
              value={recipientType}
              onChange={(e) => setRecipientType(e.target.value)}
            >
              {snap?.isAdmin && <option value="everyone">{t("everyone")}</option>}
              {snap?.isAdmin && <option value="group">{t("groupRecipient")}</option>}
              <option value="teacher">{t("teacherRecipient")}</option>
              {snap?.isAdmin && <option value="parent">{t("parentRecipient")}</option>}
              {snap?.isTeacher && <option value="individual">{t("individualRecipient")}</option>}
              {snap?.isParent && <option value="admin">{t("admin")}</option>}
            </select>
          </Label>
          {recipientType === "group" ? (
            <Label>
              {t("group")}
              <select
                className="h-11 rounded-md border border-border bg-surface px-3 text-sm"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                required
              >
                <option value="">{t("selectRecipient")}</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.subject} · {group.level}
                  </option>
                ))}
              </select>
            </Label>
          ) : recipientType !== "everyone" ? (
            <Label>
              {t("recipient")}
              <select
                className="h-11 rounded-md border border-border bg-surface px-3 text-sm"
                value={recipientId}
                onChange={(e) => setRecipientId(e.target.value)}
                required
              >
                <option value="">{t("selectRecipient")}</option>
                {options.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                    {person.email ? ` · ${person.email}` : ""}
                  </option>
                ))}
              </select>
            </Label>
          ) : null}
          <Label>
            {t("messageText")}
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} required />
          </Label>
          <Button type="submit">{t("sendMessage")}</Button>
        </form>
        {status && <p className="mt-3 text-sm text-primary">{status}</p>}
      </Card>
    </div>
  );
}
