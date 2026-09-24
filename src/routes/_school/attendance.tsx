import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { listAttendance, listGroups, saveAttendance } from "@/lib/school/api";
import { useI18n } from "@/lib/school/locale";
import { useSchoolSession } from "@/lib/school/session";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AttendanceRecord, GroupRecord } from "@/lib/school/types";
import type { Msg } from "@/lib/school/i18n";

export const Route = createFileRoute("/_school/attendance")({ component: AttendancePage });

function AttendancePage() {
  const { t } = useI18n();
  const { snap } = useSchoolSession();
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [groupId, setGroupId] = useState("");
  const [sessionDate, setSessionDate] = useState("");
  const [present, setPresent] = useState<string[]>([]);
  const [late, setLate] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [viewGroup, setViewGroup] = useState<string | null>(null);
  const [viewDate, setViewDate] = useState<string | null>(null);

  const selected = groups.find((group) => group.id === groupId);

  async function refresh() {
    const [classGroups, attendance] = await Promise.all([listGroups(), listAttendance({ data: { page: 0 } })]);
    setGroups(classGroups);
    setRecords(attendance.records);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    try {
      await saveAttendance({
        data: {
          groupId,
          sessionDate,
          marks: selected.studentIds.map((studentId) => ({
            studentId,
            present: present.includes(studentId) || late.includes(studentId),
            late: late.includes(studentId),
          })),
        },
      });
      setMessage(t("attendanceSaved"));
      setPresent([]);
      setLate([]);
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t("saturdayOnly"));
    }
  }

  const summary = useMemo(() => {
    const byGroup = new Map<string, { name: string; days: Map<string, AttendanceRecord[]> }>();
    for (const group of groups) {
      byGroup.set(group.id, { name: `${group.subject} · ${group.level}`, days: new Map() });
    }
    for (const record of records) {
      const current = byGroup.get(record.groupId) || { name: record.groupId, days: new Map() };
      const day = current.days.get(record.sessionDate) || [];
      day.push(record);
      current.days.set(record.sessionDate, day);
      byGroup.set(record.groupId, current);
    }
    return [...byGroup.entries()].map(([id, value]) => ({
      id,
      name: value.name,
      days: [...value.days.entries()].map(([date, dayRecords]) => ({
        date,
        present: dayRecords.filter((item) => item.status !== "absent").length,
        total: dayRecords.length,
        records: dayRecords,
      })),
    }));
  }, [groups, records]);

  const parentByChild = useMemo(() => {
    const map = new Map<string, AttendanceRecord[]>();
    for (const record of records) {
      const list = map.get(record.studentId) || [];
      list.push(record);
      map.set(record.studentId, list);
    }
    return [...map.entries()];
  }, [records]);

  return (
    <div className="grid gap-5">
      {snap?.isTeacher && (
        <Card>
          <h1 className="font-display text-2xl">{t("markAttendance")}</h1>
          <form className="mt-4 grid gap-4" onSubmit={onSubmit}>
            <div className="grid gap-3 sm:grid-cols-2">
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
                {t("attendanceDate")}
                <Input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} required />
              </Label>
            </div>
            <div className="grid gap-2">
              {!groupId ? (
                <p className="text-sm text-muted">{t("selectGroupFirst")}</p>
              ) : selected?.studentIds.length === 0 ? (
                <p className="text-sm text-muted">{t("noStudentsInGroup")}</p>
              ) : (
                selected?.studentIds.map((studentId, index) => (
                  <label key={studentId} className="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-3">
                    <input
                      type="checkbox"
                      checked={present.includes(studentId)}
                      onChange={(e) =>
                        setPresent((current) => (e.target.checked ? [...current, studentId] : current.filter((id) => id !== studentId)))
                      }
                    />
                    <span className="flex-1">{selected.studentNames[index]}</span>
                    <label className="flex items-center gap-2 text-sm text-muted">
                      <input
                        type="checkbox"
                        checked={late.includes(studentId)}
                        onChange={(e) =>
                          setLate((current) => (e.target.checked ? [...current, studentId] : current.filter((id) => id !== studentId)))
                        }
                      />
                      {t("late")}
                    </label>
                  </label>
                ))
              )}
            </div>
            <Button type="submit">{t("saveAttendance")}</Button>
          </form>
          {message && <p className="mt-3 text-sm text-primary">{message}</p>}
        </Card>
      )}

      {snap?.isParent && !snap.isAdmin && (
        <Card>
          <h1 className="font-display text-2xl">{t("attendanceSummary")}</h1>
          {parentByChild.length === 0 ? (
            <p className="mt-3 text-sm text-muted">{t("noAttendanceData")}</p>
          ) : (
            parentByChild.map(([studentId, days]) => (
              <div key={studentId} className="mt-4">
                <p className="font-medium">{days[0]?.studentName}</p>
                <ul className="mt-2 grid gap-2">
                  {days.map((day) => (
                    <li key={day.id} className="rounded-md border border-border px-3 py-2 text-sm">
                      {day.sessionDate} · {t(day.status as Msg)}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </Card>
      )}

      {(snap?.isAdmin || snap?.isTeacher) && (
        <Card>
          <h2 className="font-display text-xl">{t("attendanceSummary")}</h2>
          {summary.length === 0 ? (
            <p className="mt-3 text-sm text-muted">{t("noAttendanceData")}</p>
          ) : !viewGroup ? (
            <ul className="mt-4 grid gap-2">
              {summary.map((group) => {
                const presentCount = group.days.reduce((sum, day) => sum + day.present, 0);
                const total = group.days.reduce((sum, day) => sum + day.total, 0);
                const pct = total ? Math.round((presentCount / total) * 100) : 0;
                return (
                  <li key={group.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-3">
                    <span>
                      <strong>{group.name}</strong>
                      <span className="block text-sm text-muted">{pct}%</span>
                    </span>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setViewGroup(group.id)}>
                      {t("open")}
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : !viewDate ? (
            <div className="mt-4">
              <Button type="button" variant="ghost" onClick={() => setViewGroup(null)}>
                {t("back")}
              </Button>
              <ul className="mt-3 grid gap-2">
                {summary
                  .find((group) => group.id === viewGroup)
                  ?.days.map((day) => (
                    <li key={day.date} className="flex items-center justify-between rounded-md border border-border px-3 py-3">
                      <span>
                        {day.date} · {day.present}/{day.total}
                      </span>
                      <Button type="button" variant="secondary" size="sm" onClick={() => setViewDate(day.date)}>
                        {t("open")}
                      </Button>
                    </li>
                  ))}
              </ul>
            </div>
          ) : (
            <div className="mt-4">
              <Button type="button" variant="ghost" onClick={() => setViewDate(null)}>
                {t("back")}
              </Button>
              <ul className="mt-3 grid gap-2">
                {summary
                  .find((group) => group.id === viewGroup)
                  ?.days.find((day) => day.date === viewDate)
                  ?.records.map((record) => (
                    <li key={record.id} className="rounded-md border border-border px-3 py-2 text-sm">
                      {record.studentName} · {t(record.status as Msg)}
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
