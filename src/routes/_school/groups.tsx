import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { createStudent, deleteGroup, linkMeAsParent, listDirectory, listGroups, listStudents, saveGroup } from "@/lib/school/api";
import { useI18n } from "@/lib/school/locale";
import { useSchoolSession } from "@/lib/school/session";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DirectoryPerson, GroupRecord, StudentRecord } from "@/lib/school/types";

export const Route = createFileRoute("/_school/groups")({ component: GroupsPage });

function GroupsPage() {
  const { t } = useI18n();
  const { snap } = useSchoolSession();
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [teachers, setTeachers] = useState<DirectoryPerson[]>([]);
  const [newStudent, setNewStudent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [subject, setSubject] = useState("Quran");
  const [level, setLevel] = useState("Preparatory");
  const [teacherId, setTeacherId] = useState("");
  const [schedule, setSchedule] = useState("");
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  async function refresh() {
    const [classGroups, directory, roster] = await Promise.all([listGroups(), listDirectory(), listStudents()]);
    setGroups(classGroups);
    setTeachers(directory.filter((item) => item.role === "teacher" || item.role === "admin"));
    setStudents(roster);
  }

  useEffect(() => {
    void refresh();
  }, []);

  function reset() {
    setEditingId(null);
    setSubject("Quran");
    setLevel("Preparatory");
    setTeacherId("");
    setSchedule("");
    setStudentIds([]);
  }

  function startEdit(group: GroupRecord) {
    setEditingId(group.id);
    setSubject(group.subject);
    setLevel(group.level);
    setTeacherId(group.teacherId || "");
    setSchedule(group.weeklySchedule);
    setStudentIds(group.studentIds);
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    await saveGroup({
      data: {
        id: editingId || undefined,
        subject,
        level,
        teacherId,
        weeklySchedule: schedule,
        studentIds,
      },
    });
    setMessage(editingId ? t("groupUpdated") : t("groupCreated"));
    reset();
    await refresh();
  }

  return (
    <div className="grid gap-5">
      <Card>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={async (event) => {
            event.preventDefault();
            await createStudent({ data: { name: newStudent } });
            setNewStudent("");
            setMessage(t("studentCreated"));
            await refresh();
          }}
        >
          <Label className="flex-1">
            {t("studentName")}
            <Input value={newStudent} onChange={(e) => setNewStudent(e.target.value)} required />
          </Label>
          <Button type="submit" variant="secondary">
            {t("createStudent")}
          </Button>
        </form>
        {message && <p className="mt-3 text-sm text-primary">{message}</p>}
      </Card>

      <Card>
        <h1 className="font-display text-2xl">{t("existingGroups")}</h1>
        {groups.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{t("noGroups")}</p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {groups.map((group) => (
              <li key={group.id} className="flex flex-col gap-3 rounded-md border border-border px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  <strong>
                    {group.subject} · {group.level}
                  </strong>
                  <span className="block text-sm text-muted">
                    {group.teacherName} · {group.weeklySchedule}
                  </span>
                  <span className="block text-sm text-muted">{group.studentNames.join(", ") || "—"}</span>
                </span>
                <span className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="secondary" onClick={() => startEdit(group)}>
                    {t("edit")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      if (window.confirm(t("confirmDeleteGroup"))) {
                        void deleteGroup({ data: group.id }).then(refresh);
                      }
                    }}
                  >
                    {t("deleteAction")}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="font-display text-xl">{editingId ? t("updateGroup") : t("createGroup")}</h2>
        <form className="mt-4 grid gap-3" onSubmit={onSave}>
          <Label>
            {t("subject")}
            <select className="h-11 rounded-md border border-border bg-surface px-3 text-sm" value={subject} onChange={(e) => setSubject(e.target.value)}>
              <option value="Quran">{t("quran")}</option>
              <option value="Arabic">{t("arabic")}</option>
              <option value="Religion">{t("religion")}</option>
            </select>
          </Label>
          <Label>
            {t("level")}
            <select className="h-11 rounded-md border border-border bg-surface px-3 text-sm" value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="Preparatory">{t("preparatory")}</option>
              <option>1</option>
              <option>2</option>
              <option>3</option>
            </select>
          </Label>
          <Label>
            {t("teacher")}
            <select className="h-11 rounded-md border border-border bg-surface px-3 text-sm" value={teacherId} onChange={(e) => setTeacherId(e.target.value)} required>
              <option value="">{t("teacher")}</option>
              {snap?.profile && (
                <option value={snap.profile.userId}>
                  {snap.profile.name} · {snap.profile.email}
                </option>
              )}
              {teachers
                .filter((teacher) => teacher.id !== snap?.profile?.userId)
                .map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.name}
                  {teacher.email ? ` · ${teacher.email}` : ""}
                </option>
              ))}
            </select>
          </Label>
          <fieldset className="rounded-md border border-border p-3">
            <legend className="px-1 text-sm font-medium">{t("students")}</legend>
            {students.length === 0 ? (
              <p className="text-sm text-muted">{t("noRecords")}</p>
            ) : (
              students.map((student) => (
                <label key={student.id} className="flex items-center gap-2 py-1 text-sm">
                  <input
                    type="checkbox"
                    checked={studentIds.includes(student.id)}
                    onChange={(e) =>
                      setStudentIds((current) => (e.target.checked ? [...current, student.id] : current.filter((id) => id !== student.id)))
                    }
                  />
                  {student.name}
                  <button
                    type="button"
                    className="ms-auto text-xs text-primary underline"
                    onClick={() => void linkMeAsParent({ data: student.id }).then(refresh)}
                  >
                    {t("linkAsParent")}
                  </button>
                </label>
              ))
            )}
          </fieldset>
          <Label>
            {t("schedule")}
            <Input value={schedule} onChange={(e) => setSchedule(e.target.value)} />
          </Label>
          <div className="flex gap-2">
            <Button type="submit">{editingId ? t("updateGroup") : t("createGroup")}</Button>
            {editingId && (
              <Button type="button" variant="secondary" onClick={reset}>
                {t("cancelEdit")}
              </Button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}
