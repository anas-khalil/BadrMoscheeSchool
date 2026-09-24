import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { createEvent, listCalendar } from "@/lib/school/api";
import { useI18n } from "@/lib/school/locale";
import { useSchoolSession } from "@/lib/school/session";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CalendarEvent } from "@/lib/school/types";

export const Route = createFileRoute("/_school/calendar")({ component: CalendarPage });

function CalendarPage() {
  const { t } = useI18n();
  const { snap } = useSchoolSession();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [title, setTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [audience, setAudience] = useState("all");
  const [message, setMessage] = useState("");

  async function refresh() {
    setEvents(await listCalendar());
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await createEvent({ data: { title, eventDate, audience } });
    setTitle("");
    setEventDate("");
    setMessage(t("eventCreated"));
    await refresh();
  }

  return (
    <div className="grid gap-5">
      <Card>
        <h1 className="font-display text-2xl">{t("calendar")}</h1>
        {events.length === 0 ? (
          <p className="mt-4 text-sm text-muted">{t("noRecords")}</p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {events.map((item) => (
              <li key={item.id} className="rounded-md border border-border px-3 py-3">
                <p className="font-medium">{item.title}</p>
                <p className="text-sm text-muted">
                  {item.eventDate} · {item.audience === "all" ? t("allSchool") : item.audience}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {snap?.isAdmin && (
        <Card>
          <h2 className="font-display text-xl">{t("createEvent")}</h2>
          <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={onSubmit}>
            <Label>
              {t("eventTitle")}
              <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </Label>
            <Label>
              {t("eventDate")}
              <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} required />
            </Label>
            <Label>
              {t("eventAudience")}
              <select
                className="h-11 rounded-md border border-border bg-surface px-3 text-sm"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
              >
                <option value="all">{t("allSchool")}</option>
              </select>
            </Label>
            <div className="flex items-end">
              <Button type="submit">{t("createEvent")}</Button>
            </div>
          </form>
          {message && <p className="mt-3 text-sm text-primary">{message}</p>}
        </Card>
      )}
    </div>
  );
}
