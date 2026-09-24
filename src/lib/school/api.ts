import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  AccessError,
  assertActive,
  canActivateWithoutChildren,
  canCreateAssignment,
  canReadGroup,
  canReadMessage,
  canSelfSignupRole,
  canWriteAttendance,
  canWriteGroup,
  isSaturday,
  nextAttendanceStatus,
} from "./access";
import type {
  AssignmentRecord,
  AttendanceRecord,
  CalendarEvent,
  DataRequest,
  DirectoryPerson,
  GroupRecord,
  MessageRecord,
  Profile,
  Role,
  SessionSnapshot,
  StudentRecord,
} from "./types";

const SCHOOL_ID = "badr-mosque";
const SCHOOL_NAME = "Badr Mosque School";
const PAGE = 20;

type ProfileRow = {
  user_id: string;
  school_id: string;
  name: string;
  email: string;
  role: Role;
  status: "pending" | "active" | "rejected";
  language: string;
  requested_child_name: string | null;
  consent_at: string | null;
};

function mapProfile(row: ProfileRow): Profile {
  const language = row.language === "de" || row.language === "ar" ? row.language : "en";
  return {
    userId: row.user_id,
    schoolId: row.school_id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    language,
    requestedChildName: row.requested_child_name,
    consentAt: row.consent_at,
  };
}

function newId(): string {
  return crypto.randomUUID();
}

async function loadProfile(userId: string): Promise<Profile | null> {
  const sql = await getSql();
  const rows = await sql<ProfileRow>`select * from profiles where user_id = ${userId} limit 1`;
  return rows[0] ? mapProfile(rows[0]) : null;
}

async function teacherGroupIds(userId: string): Promise<string[]> {
  const sql = await getSql();
  const rows = await sql<{ id: string }>`select id from class_groups where teacher_id = ${userId}`;
  return rows.map((row) => row.id);
}

async function parentChildIds(userId: string): Promise<string[]> {
  const sql = await getSql();
  const rows = await sql<{ student_id: string }>`
    select student_id from student_parents where parent_user_id = ${userId}
  `;
  return rows.map((row) => row.student_id);
}

async function requireActive(userId: string): Promise<Profile> {
  const profile = await loadProfile(userId);
  assertActive(profile);
  return profile;
}

async function requireAdmin(userId: string): Promise<Profile> {
  const profile = await requireActive(userId);
  if (profile.role !== "admin") throw new AccessError();
  return profile;
}

export const getSessionSnapshot = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<SessionSnapshot> => {
    const sql = await getSql();
    await sql`
      insert into schools (id, name) values (${SCHOOL_ID}, ${SCHOOL_NAME})
      on conflict (id) do nothing
    `;
    const existing = await loadProfile(context.userId);
    if (existing) {
      const admins = await sql<{ n: number }>`
        select count(*)::int as n from profiles where role = 'admin' and status = 'active'
      `;
      if ((admins[0]?.n ?? 0) === 0 && existing.status !== "rejected") {
        await sql`update profiles set role = ${"admin"}, status = ${"active"} where user_id = ${context.userId}`;
      }
      const profile = (await loadProfile(context.userId))!;
      const assignedGroupIds = profile.role === "teacher" || profile.role === "admin"
        ? await teacherGroupIds(context.userId)
        : [];
      const childIds = await parentChildIds(context.userId);
      return {
        profile,
        needsOnboarding: false,
        schoolName: SCHOOL_NAME,
        isAdmin: profile.role === "admin" && profile.status === "active",
        isTeacher: profile.status === "active" && (profile.role === "teacher" || profile.role === "admin"),
        isParent: profile.status === "active" && (childIds.length > 0 || profile.role === "parent"),
        assignedGroupIds,
        childIds,
      };
    }
    const admins = await sql<{ n: number }>`
      select count(*)::int as n from profiles where role = 'admin' and status = 'active'
    `;
    const adminCount = admins[0]?.n ?? 0;
    if (adminCount === 0) {
      const { getSessionUser } = await import("@/lib/auth/verify.server");
      const user = await getSessionUser();
      const email = user?.email || "";
      const name = email.split("@")[0] || "Administrator";
      await sql`
        insert into profiles (user_id, school_id, name, email, role, status, language, consent_at)
        values (${context.userId}, ${SCHOOL_ID}, ${name}, ${email}, ${"admin"}, ${"active"}, ${"en"}, ${new Date().toISOString()})
      `;
      const profile = await loadProfile(context.userId);
      return {
        profile,
        needsOnboarding: false,
        schoolName: SCHOOL_NAME,
        isAdmin: true,
        isTeacher: true,
        isParent: false,
        assignedGroupIds: [],
        childIds: [],
      };
    }
    return {
      profile: null,
      needsOnboarding: true,
      schoolName: SCHOOL_NAME,
      isAdmin: false,
      isTeacher: false,
      isParent: false,
      assignedGroupIds: [],
      childIds: [],
    };
  });

export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { name: string; role: Role; childName: string; consent: boolean; language: string }) => input)
  .handler(async ({ context, data }) => {
    if (!data.consent) throw new Error("Consent required");
    if (!canSelfSignupRole(data.role)) throw new AccessError("Admin cannot be self-assigned");
    const sql = await getSql();
    const existing = await loadProfile(context.userId);
    if (existing) return existing;
    if (data.role === "parent" && !data.childName.trim()) throw new Error("Child name required");
    const { getSessionUser } = await import("@/lib/auth/verify.server");
    const user = await getSessionUser();
    const name = data.name.trim() || user?.email?.split("@")[0] || "Member";
    const email = user?.email || "";
    const language = data.language === "de" || data.language === "ar" ? data.language : "en";
    const admins = await sql<{ n: number }>`
      select count(*)::int as n from profiles where role = 'admin' and status = 'active'
    `;
    const isFirst = (admins[0]?.n ?? 0) === 0;
    const role = isFirst ? "admin" : data.role;
    const status = isFirst ? "active" : "pending";
    await sql`
      insert into profiles (
        user_id, school_id, name, email, role, status, language, requested_child_name, consent_at
      ) values (
        ${context.userId}, ${SCHOOL_ID}, ${name}, ${email}, ${role}, ${status}, ${language},
        ${data.role === "parent" ? data.childName.trim() : null}, ${new Date().toISOString()}
      )
    `;
    return (await loadProfile(context.userId))!;
  });

export const updateMyLanguage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((language: string) => language)
  .handler(async ({ context, data }) => {
    const language = data === "de" || data === "ar" ? data : "en";
    const sql = await getSql();
    await sql`update profiles set language = ${language} where user_id = ${context.userId}`;
  });

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const profile = await requireActive(context.userId);
    const sql = await getSql();
    const assigned = await teacherGroupIds(context.userId);
    const childIds = await parentChildIds(context.userId);
    const teachers = await sql<{ n: number }>`
      select count(*)::int as n from profiles
      where school_id = ${profile.schoolId} and role = 'teacher' and status = 'active'
    `;
    let studentCount = 0;
    let groupCount = 0;
    if (profile.role === "admin") {
      const students = await sql<{ n: number }>`select count(*)::int as n from students where school_id = ${profile.schoolId}`;
      const groups = await sql<{ n: number }>`select count(*)::int as n from class_groups where school_id = ${profile.schoolId}`;
      studentCount = students[0]?.n ?? 0;
      groupCount = groups[0]?.n ?? 0;
    } else if (profile.role === "teacher") {
      groupCount = assigned.length;
      if (assigned.length) {
        const rows = await sql<{ n: number }>`
          select count(distinct student_id)::int as n from group_students
          where group_id in (select id from class_groups where teacher_id = ${context.userId})
        `;
        studentCount = rows[0]?.n ?? 0;
      }
    } else {
      studentCount = childIds.length;
      const rows = await sql<{ n: number }>`
        select count(distinct group_id)::int as n from group_students
        where student_id in (select student_id from student_parents where parent_user_id = ${context.userId})
      `;
      groupCount = rows[0]?.n ?? 0;
    }
    const unreadMessages = await sql<{ n: number }>`
      select count(*)::int as n from messages m
      where m.recipient_id = ${context.userId}
        and not exists (select 1 from message_reads r where r.message_id = m.id and r.user_id = ${context.userId})
    `;
    let unreadAssignments = 0;
    if (profile.role === "parent") {
      const rows = await sql<{ n: number }>`
        select count(*)::int as n from assignments a
        where a.group_id in (
          select group_id from group_students
          where student_id in (select student_id from student_parents where parent_user_id = ${context.userId})
        )
        and not exists (select 1 from assignment_reads r where r.assignment_id = a.id and r.user_id = ${context.userId})
      `;
      unreadAssignments = rows[0]?.n ?? 0;
    } else if (profile.role === "teacher") {
      const rows = await sql<{ n: number }>`
        select count(*)::int as n from assignments a
        where a.teacher_id = ${context.userId}
          and not exists (select 1 from assignment_reads r where r.assignment_id = a.id and r.user_id = ${context.userId})
      `;
      unreadAssignments = rows[0]?.n ?? 0;
    } else {
      const rows = await sql<{ n: number }>`
        select count(*)::int as n from assignments a
        where a.school_id = ${profile.schoolId}
          and not exists (select 1 from assignment_reads r where r.assignment_id = a.id and r.user_id = ${context.userId})
      `;
      unreadAssignments = rows[0]?.n ?? 0;
    }
    return {
      teachers: teachers[0]?.n ?? 0,
      students: studentCount,
      groups: groupCount,
      unreadMessages: unreadMessages[0]?.n ?? 0,
      unreadAssignments,
    };
  });

export const listDirectory = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<DirectoryPerson[]> => {
    const profile = await requireActive(context.userId);
    const sql = await getSql();
    const includeEmail = profile.role === "admin";
    if (profile.role === "admin") {
      const rows = await sql<{ user_id: string; name: string; role: Role; email: string }>`
        select user_id, name, role, email from profiles
        where school_id = ${profile.schoolId} and status = 'active' and user_id <> ${context.userId}
        order by name
      `;
      return rows.map((row) => ({
        id: row.user_id,
        name: row.name,
        role: row.role,
        email: includeEmail ? row.email : undefined,
      }));
    }
    if (profile.role === "teacher") {
      const rows = await sql<{ user_id: string; name: string; role: Role }>`
        select distinct p.user_id, p.name, p.role
        from profiles p
        where p.school_id = ${profile.schoolId}
          and p.status = 'active'
          and p.user_id <> ${context.userId}
          and (
            p.role in ('admin', 'teacher')
            or p.user_id in (
              select sp.parent_user_id from student_parents sp
              join group_students gs on gs.student_id = sp.student_id
              join class_groups g on g.id = gs.group_id
              where g.teacher_id = ${context.userId}
            )
          )
        order by p.name
      `;
      return rows.map((row) => ({ id: row.user_id, name: row.name, role: row.role }));
    }
    const rows = await sql<{ user_id: string; name: string; role: Role }>`
      select distinct p.user_id, p.name, p.role
      from profiles p
      where p.school_id = ${profile.schoolId}
        and p.status = 'active'
        and p.user_id <> ${context.userId}
        and (
          p.role = 'admin'
          or p.user_id in (
            select g.teacher_id from class_groups g
            join group_students gs on gs.group_id = g.id
            join student_parents sp on sp.student_id = gs.student_id
            where sp.parent_user_id = ${context.userId} and g.teacher_id is not null
          )
        )
      order by p.name
    `;
    return rows.map((row) => ({ id: row.user_id, name: row.name, role: row.role }));
  });

export const listPending = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const rows = await sql<ProfileRow>`
      select * from profiles where school_id = ${SCHOOL_ID} and status = 'pending' order by created_at
    `;
    return rows.map(mapProfile);
  });

export const listStudents = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<StudentRecord[]> => {
    const profile = await requireActive(context.userId);
    const sql = await getSql();
    let rows: { id: string; name: string }[] = [];
    if (profile.role === "admin") {
      rows = await sql`select id, name from students where school_id = ${profile.schoolId} order by name`;
    } else if (profile.role === "teacher") {
      rows = await sql`
        select distinct s.id, s.name
        from students s
        join group_students gs on gs.student_id = s.id
        join class_groups g on g.id = gs.group_id
        where g.teacher_id = ${context.userId}
        order by s.name
      `;
    } else {
      rows = await sql`
        select s.id, s.name
        from students s
        join student_parents sp on sp.student_id = s.id
        where sp.parent_user_id = ${context.userId}
        order by s.name
      `;
    }
    const result: StudentRecord[] = [];
    for (const row of rows) {
      const parents = await sql<{ parent_user_id: string }>`
        select parent_user_id from student_parents where student_id = ${row.id}
      `;
      const groups = await sql<{ group_id: string }>`
        select group_id from group_students where student_id = ${row.id}
      `;
      result.push({
        id: row.id,
        name: row.name,
        parentIds: parents.map((item) => item.parent_user_id),
        groupIds: groups.map((item) => item.group_id),
      });
    }
    return result;
  });

export const createStudent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { name: string; parentId?: string }) => input)
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const name = data.name.trim();
    if (!name) throw new Error("Name required");
    const sql = await getSql();
    const id = newId();
    await sql`insert into students (id, school_id, name) values (${id}, ${SCHOOL_ID}, ${name})`;
    if (data.parentId) {
      await sql`
        insert into student_parents (student_id, parent_user_id)
        values (${id}, ${data.parentId})
        on conflict do nothing
      `;
    }
    return { id, name };
  });

export const listGroups = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<GroupRecord[]> => {
    const profile = await requireActive(context.userId);
    const sql = await getSql();
    const assigned = await teacherGroupIds(context.userId);
    type GroupRow = {
      id: string;
      subject: string;
      level: string;
      teacher_id: string | null;
      weekly_schedule: string;
    };
    let rows: GroupRow[] = [];
    if (profile.role === "admin") {
      rows = await sql`select id, subject, level, teacher_id, weekly_schedule from class_groups where school_id = ${profile.schoolId} order by subject, level`;
    } else if (profile.role === "teacher") {
      rows = await sql`select id, subject, level, teacher_id, weekly_schedule from class_groups where teacher_id = ${context.userId} order by subject`;
    } else {
      rows = await sql`
        select distinct g.id, g.subject, g.level, g.teacher_id, g.weekly_schedule
        from class_groups g
        join group_students gs on gs.group_id = g.id
        join student_parents sp on sp.student_id = gs.student_id
        where sp.parent_user_id = ${context.userId}
        order by g.subject
      `;
    }
    const teachers = await sql<{ user_id: string; name: string }>`
      select user_id, name from profiles where school_id = ${profile.schoolId} and role in ('teacher', 'admin')
    `;
    const teacherName = new Map(teachers.map((item) => [item.user_id, item.name]));
    const result: GroupRecord[] = [];
    for (const row of rows) {
      if (profile.role === "teacher" && !canReadGroup({ actor: profile, groupId: row.id, teacherGroupIds: assigned })) {
        continue;
      }
      const members = await sql<{ student_id: string; name: string }>`
        select s.id as student_id, s.name
        from group_students gs join students s on s.id = gs.student_id
        where gs.group_id = ${row.id}
        order by s.name
      `;
      result.push({
        id: row.id,
        subject: row.subject,
        level: row.level,
        teacherId: row.teacher_id,
        teacherName: (row.teacher_id && teacherName.get(row.teacher_id)) || "",
        weeklySchedule: row.weekly_schedule,
        studentIds: members.map((item) => item.student_id),
        studentNames: members.map((item) => item.name),
      });
    }
    return result;
  });

export const saveGroup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    id?: string;
    subject: string;
    level: string;
    teacherId: string;
    weeklySchedule: string;
    studentIds: string[];
  }) => input)
  .handler(async ({ context, data }) => {
    const profile = await requireAdmin(context.userId);
    if (!canWriteGroup(profile)) throw new AccessError();
    const sql = await getSql();
    const id = data.id?.trim() || newId();
    const existing = await sql<{ teacher_id: string | null }>`select teacher_id from class_groups where id = ${id}`;
    if (existing[0]) {
      await sql`
        update class_groups
        set subject = ${data.subject}, level = ${data.level}, teacher_id = ${data.teacherId || null},
            weekly_schedule = ${data.weeklySchedule}
        where id = ${id}
      `;
    } else {
      await sql`
        insert into class_groups (id, school_id, subject, level, teacher_id, weekly_schedule)
        values (${id}, ${SCHOOL_ID}, ${data.subject}, ${data.level}, ${data.teacherId || null}, ${data.weeklySchedule})
      `;
    }
    await sql`delete from group_students where group_id = ${id}`;
    for (const studentId of data.studentIds) {
      await sql`insert into group_students (group_id, student_id) values (${id}, ${studentId}) on conflict do nothing`;
    }
    return { id };
  });

export const deleteGroup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    await sql`delete from class_groups where id = ${data}`;
  });

export const reviewAccount = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { userId: string; action: "approve" | "reject"; studentIds: string[] }) => input)
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const rows = await sql<ProfileRow>`select * from profiles where user_id = ${data.userId}`;
    const target = rows[0] ? mapProfile(rows[0]) : null;
    if (!target) throw new Error("Account not found");
    if (data.action === "reject") {
      await sql`update profiles set status = ${"rejected"} where user_id = ${data.userId}`;
      return;
    }
    if (target.role === "parent" && !canActivateWithoutChildren("parent")) {
      let ids = data.studentIds.filter(Boolean);
      if (ids.length === 0 && target.requestedChildName) {
        const created = newId();
        await sql`insert into students (id, school_id, name) values (${created}, ${SCHOOL_ID}, ${target.requestedChildName})`;
        ids = [created];
      }
      if (ids.length === 0) throw new Error("Child required");
      for (const studentId of ids) {
        await sql`
          insert into student_parents (student_id, parent_user_id)
          values (${studentId}, ${data.userId})
          on conflict do nothing
        `;
      }
    }
    await sql`update profiles set status = ${"active"} where user_id = ${data.userId}`;
  });

export const saveAttendance = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    groupId: string;
    sessionDate: string;
    marks: { studentId: string; present: boolean; late: boolean }[];
  }) => input)
  .handler(async ({ context, data }) => {
    const profile = await requireActive(context.userId);
    const assigned = await teacherGroupIds(context.userId);
    if (!canWriteAttendance({
      actor: profile,
      groupId: data.groupId,
      teacherGroupIds: assigned,
      sessionDate: data.sessionDate,
    })) {
      throw new AccessError(isSaturday(data.sessionDate) ? "Forbidden" : "Saturday only");
    }
    const sql = await getSql();
    for (const mark of data.marks) {
      const status = nextAttendanceStatus(mark.present, mark.late);
      const id = newId();
      await sql`
        insert into attendance (id, school_id, group_id, student_id, session_date, status, teacher_id)
        values (${id}, ${SCHOOL_ID}, ${data.groupId}, ${mark.studentId}, ${data.sessionDate}, ${status}, ${context.userId})
        on conflict (group_id, student_id, session_date)
        do update set status = excluded.status, teacher_id = excluded.teacher_id
      `;
    }
  });

export const listAttendance = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { page?: number } | undefined) => input ?? {})
  .handler(async ({ context, data }): Promise<{ records: AttendanceRecord[]; page: number; total: number }> => {
    const profile = await requireActive(context.userId);
    const sql = await getSql();
    const page = Math.max(0, data.page ?? 0);
    const offset = page * PAGE;
    type Row = {
      id: string;
      group_id: string;
      student_id: string;
      student_name: string;
      session_date: string;
      status: AttendanceRecord["status"];
    };
    let rows: Row[] = [];
    let total = 0;
    if (profile.role === "admin") {
      const count = await sql<{ n: number }>`select count(*)::int as n from attendance where school_id = ${profile.schoolId}`;
      total = count[0]?.n ?? 0;
      rows = await sql`
        select a.id, a.group_id, a.student_id, s.name as student_name, a.session_date::text as session_date, a.status
        from attendance a join students s on s.id = a.student_id
        where a.school_id = ${profile.schoolId}
        order by a.session_date desc, s.name
        limit ${PAGE} offset ${offset}
      `;
    } else if (profile.role === "teacher") {
      const count = await sql<{ n: number }>`
        select count(*)::int as n from attendance a
        join class_groups g on g.id = a.group_id
        where g.teacher_id = ${context.userId}
      `;
      total = count[0]?.n ?? 0;
      rows = await sql`
        select a.id, a.group_id, a.student_id, s.name as student_name, a.session_date::text as session_date, a.status
        from attendance a
        join students s on s.id = a.student_id
        join class_groups g on g.id = a.group_id
        where g.teacher_id = ${context.userId}
        order by a.session_date desc, s.name
        limit ${PAGE} offset ${offset}
      `;
    } else {
      const count = await sql<{ n: number }>`
        select count(*)::int as n from attendance a
        join student_parents sp on sp.student_id = a.student_id
        where sp.parent_user_id = ${context.userId}
      `;
      total = count[0]?.n ?? 0;
      rows = await sql`
        select a.id, a.group_id, a.student_id, s.name as student_name, a.session_date::text as session_date, a.status
        from attendance a
        join students s on s.id = a.student_id
        join student_parents sp on sp.student_id = a.student_id
        where sp.parent_user_id = ${context.userId}
        order by a.session_date desc
        limit ${PAGE} offset ${offset}
      `;
    }
    return {
      page,
      total,
      records: rows.map((row) => ({
        id: row.id,
        groupId: row.group_id,
        studentId: row.student_id,
        studentName: row.student_name,
        sessionDate: row.session_date,
        status: row.status,
      })),
    };
  });

export const listAssignments = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<AssignmentRecord[]> => {
    const profile = await requireActive(context.userId);
    const sql = await getSql();
    type Row = {
      id: string;
      group_id: string;
      subject: string;
      level: string;
      title: string;
      description: string;
      due_date: string | null;
      created_at: string;
      unread: boolean;
    };
    let rows: Row[] = [];
    if (profile.role === "admin") {
      rows = await sql`
        select a.id, a.group_id, g.subject, g.level, a.title, a.description,
               a.due_date::text as due_date, a.created_at::text as created_at,
               not exists(select 1 from assignment_reads r where r.assignment_id = a.id and r.user_id = ${context.userId}) as unread
        from assignments a join class_groups g on g.id = a.group_id
        where a.school_id = ${profile.schoolId}
        order by a.created_at desc
        limit ${PAGE}
      `;
    } else if (profile.role === "teacher") {
      rows = await sql`
        select a.id, a.group_id, g.subject, g.level, a.title, a.description,
               a.due_date::text as due_date, a.created_at::text as created_at,
               not exists(select 1 from assignment_reads r where r.assignment_id = a.id and r.user_id = ${context.userId}) as unread
        from assignments a join class_groups g on g.id = a.group_id
        where g.teacher_id = ${context.userId}
        order by a.created_at desc
        limit ${PAGE}
      `;
    } else {
      rows = await sql`
        select distinct a.id, a.group_id, g.subject, g.level, a.title, a.description,
               a.due_date::text as due_date, a.created_at::text as created_at,
               not exists(select 1 from assignment_reads r where r.assignment_id = a.id and r.user_id = ${context.userId}) as unread
        from assignments a
        join class_groups g on g.id = a.group_id
        join group_students gs on gs.group_id = a.group_id
        join student_parents sp on sp.student_id = gs.student_id
        where sp.parent_user_id = ${context.userId}
        order by a.created_at desc
        limit ${PAGE}
      `;
    }
    return rows.map((row) => ({
      id: row.id,
      groupId: row.group_id,
      groupName: `${row.subject} · ${row.level}`,
      title: row.title,
      description: row.description,
      dueDate: row.due_date,
      createdAt: row.created_at,
      unread: Boolean(row.unread),
    }));
  });

export const createAssignment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { groupId: string; title: string; description: string; dueDate: string }) => input)
  .handler(async ({ context, data }) => {
    const profile = await requireActive(context.userId);
    const assigned = await teacherGroupIds(context.userId);
    if (!canCreateAssignment({ actor: profile, groupId: data.groupId, teacherGroupIds: assigned })) {
      throw new AccessError();
    }
    const title = data.title.trim();
    if (!title) throw new Error("Title required");
    const sql = await getSql();
    const id = newId();
    await sql`
      insert into assignments (id, school_id, group_id, teacher_id, title, description, due_date)
      values (${id}, ${SCHOOL_ID}, ${data.groupId}, ${context.userId}, ${title}, ${data.description.trim()}, ${data.dueDate || null})
    `;
  });

export const markAssignmentRead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data }) => {
    await requireActive(context.userId);
    const sql = await getSql();
    await sql`
      insert into assignment_reads (assignment_id, user_id) values (${data}, ${context.userId})
      on conflict do nothing
    `;
  });

export const listMessages = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { page?: number } | undefined) => input ?? {})
  .handler(async ({ context, data }): Promise<{ records: MessageRecord[]; total: number; page: number }> => {
    await requireActive(context.userId);
    const sql = await getSql();
    const page = Math.max(0, data.page ?? 0);
    const offset = page * PAGE;
    const count = await sql<{ n: number }>`
      select count(*)::int as n from messages
      where sender_id = ${context.userId} or recipient_id = ${context.userId}
    `;
    const rows = await sql<{
      id: string;
      sender_id: string;
      sender_name: string;
      recipient_id: string;
      body: string;
      created_at: string;
      unread: boolean;
    }>`
      select m.id, m.sender_id, coalesce(p.name, m.sender_id) as sender_name, m.recipient_id, m.body,
             m.created_at::text as created_at,
             (m.recipient_id = ${context.userId} and not exists (
               select 1 from message_reads r where r.message_id = m.id and r.user_id = ${context.userId}
             )) as unread
      from messages m
      left join profiles p on p.user_id = m.sender_id
      where m.sender_id = ${context.userId} or m.recipient_id = ${context.userId}
      order by m.created_at desc
      limit ${PAGE} offset ${offset}
    `;
    return {
      page,
      total: count[0]?.n ?? 0,
      records: rows
        .filter((row) => canReadMessage({ actorId: context.userId, senderId: row.sender_id, recipientId: row.recipient_id }))
        .map((row) => ({
          id: row.id,
          senderId: row.sender_id,
          senderName: row.sender_name,
          recipientId: row.recipient_id,
          body: row.body,
          createdAt: row.created_at,
          unread: Boolean(row.unread),
        })),
    };
  });

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { recipientIds: string[]; body: string }) => input)
  .handler(async ({ context, data }) => {
    const profile = await requireActive(context.userId);
    const body = data.body.trim();
    if (!body) throw new Error("Message required");
    const directory = await listDirectoryRecipients(profile);
    const allowedIds = new Set(directory.map((item) => item.id));
    const sql = await getSql();
    const unique = [...new Set(data.recipientIds)].filter((id) => allowedIds.has(id) && id !== context.userId);
    if (unique.length === 0) throw new Error("Select a recipient");
    for (const recipientId of unique) {
      const id = newId();
      await sql`
        insert into messages (id, school_id, sender_id, recipient_id, body)
        values (${id}, ${SCHOOL_ID}, ${context.userId}, ${recipientId}, ${body})
      `;
    }
  });

async function listDirectoryRecipients(profile: Profile): Promise<DirectoryPerson[]> {
  const sql = await getSql();
  if (profile.role === "admin") {
    const rows = await sql<{ user_id: string; name: string; role: Role }>`
      select user_id, name, role from profiles
      where school_id = ${profile.schoolId} and status = 'active' and user_id <> ${profile.userId}
    `;
    return rows.map((row) => ({ id: row.user_id, name: row.name, role: row.role }));
  }
  if (profile.role === "teacher") {
    const rows = await sql<{ user_id: string; name: string; role: Role }>`
      select distinct p.user_id, p.name, p.role from profiles p
      where p.status = 'active' and p.user_id <> ${profile.userId}
        and (
          p.role in ('admin', 'teacher')
          or p.user_id in (
            select sp.parent_user_id from student_parents sp
            join group_students gs on gs.student_id = sp.student_id
            join class_groups g on g.id = gs.group_id
            where g.teacher_id = ${profile.userId}
          )
        )
    `;
    return rows.map((row) => ({ id: row.user_id, name: row.name, role: row.role }));
  }
  const rows = await sql<{ user_id: string; name: string; role: Role }>`
    select distinct p.user_id, p.name, p.role from profiles p
    where p.status = 'active' and p.user_id <> ${profile.userId}
      and (
        p.role = 'admin'
        or p.user_id in (
          select g.teacher_id from class_groups g
          join group_students gs on gs.group_id = g.id
          join student_parents sp on sp.student_id = gs.student_id
          where sp.parent_user_id = ${profile.userId} and g.teacher_id is not null
        )
      )
  `;
  return rows.map((row) => ({ id: row.user_id, name: row.name, role: row.role }));
}

export const markMessageRead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data }) => {
    await requireActive(context.userId);
    const sql = await getSql();
    const rows = await sql<{ sender_id: string; recipient_id: string }>`
      select sender_id, recipient_id from messages where id = ${data}
    `;
    const message = rows[0];
    if (!message) return;
    if (!canReadMessage({ actorId: context.userId, senderId: message.sender_id, recipientId: message.recipient_id })) {
      throw new AccessError();
    }
    if (message.recipient_id !== context.userId) return;
    await sql`
      insert into message_reads (message_id, user_id) values (${data}, ${context.userId})
      on conflict do nothing
    `;
  });

export const listCalendar = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<CalendarEvent[]> => {
    await requireActive(context.userId);
    const sql = await getSql();
    const rows = await sql<{ id: string; title: string; event_date: string; audience: string }>`
      select id, title, event_date::text as event_date, audience
      from calendar_events
      where school_id = ${SCHOOL_ID}
      order by event_date desc
      limit ${PAGE}
    `;
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      eventDate: row.event_date,
      audience: row.audience,
    }));
  });

export const createEvent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { title: string; eventDate: string; audience: string }) => input)
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const title = data.title.trim();
    if (!title || !data.eventDate) throw new Error("Title and date required");
    const sql = await getSql();
    const id = newId();
    const audience = data.audience || "all";
    await sql`
      insert into calendar_events (id, school_id, title, event_date, audience, created_by)
      values (${id}, ${SCHOOL_ID}, ${title}, ${data.eventDate}, ${audience}, ${context.userId})
    `;
  });

export const requestPasswordHelp = createServerFn({ method: "POST" })
  .validator((input: { email: string; note: string }) => input)
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    if (!email.includes("@")) throw new Error("Email required");
    const sql = await getSql();
    await sql`insert into schools (id, name) values (${SCHOOL_ID}, ${SCHOOL_NAME}) on conflict (id) do nothing`;
    const id = newId();
    await sql`
      insert into password_help (id, school_id, email, note)
      values (${id}, ${SCHOOL_ID}, ${email}, ${data.note.trim()})
    `;
  });

export const listPasswordHelp = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    return sql<{ id: string; email: string; note: string; status: string; created_at: string }>`
      select id, email, note, status, created_at::text as created_at
      from password_help where school_id = ${SCHOOL_ID} and status = 'open'
      order by created_at desc
    `;
  });

export const closePasswordHelp = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    await sql`update password_help set status = ${"done"} where id = ${data}`;
  });

export const exportChildData = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((studentId: string) => studentId)
  .handler(async ({ context, data }) => {
    const profile = await requireActive(context.userId);
    const childIds = await parentChildIds(context.userId);
    if (profile.role !== "admin" && !childIds.includes(data)) throw new AccessError();
    const sql = await getSql();
    const students = await sql<{ id: string; name: string }>`select id, name from students where id = ${data}`;
    const student = students[0];
    if (!student) throw new Error("Not found");
    const attendance = await sql`select session_date::text as session_date, status, group_id from attendance where student_id = ${data} order by session_date`;
    const groups = await sql`select g.subject, g.level from class_groups g join group_students gs on gs.group_id = g.id where gs.student_id = ${data}`;
    const payload = JSON.stringify({ student, groups, attendance, exportedAt: new Date().toISOString() }, null, 2);
    const id = newId();
    await sql`
      insert into data_requests (id, school_id, requester_id, student_id, kind, status, payload)
      values (${id}, ${SCHOOL_ID}, ${context.userId}, ${data}, ${"export"}, ${"fulfilled"}, ${payload})
    `;
    return { id, payload };
  });

export const requestChildDeletion = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((studentId: string) => studentId)
  .handler(async ({ context, data }) => {
    const profile = await requireActive(context.userId);
    const childIds = await parentChildIds(context.userId);
    if (profile.role !== "admin" && !childIds.includes(data)) throw new AccessError();
    const sql = await getSql();
    const id = newId();
    await sql`
      insert into data_requests (id, school_id, requester_id, student_id, kind, status)
      values (${id}, ${SCHOOL_ID}, ${context.userId}, ${data}, ${"delete"}, ${"open"})
    `;
  });

export const listDataRequests = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<DataRequest[]> => {
    const profile = await requireActive(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      kind: "export" | "delete";
      student_id: string | null;
      student_name: string | null;
      status: DataRequest["status"];
      payload: string | null;
      created_at: string;
    }>`
      select r.id, r.kind, r.student_id, s.name as student_name, r.status, r.payload, r.created_at::text as created_at
      from data_requests r
      left join students s on s.id = r.student_id
      where r.school_id = ${SCHOOL_ID}
        and (${profile.role} = 'admin' or r.requester_id = ${context.userId})
      order by r.created_at desc
    `;
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      studentId: row.student_id,
      studentName: row.student_name,
      status: row.status,
      payload: row.payload,
      createdAt: row.created_at,
    }));
  });

export const resolveDataRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; action: "fulfill" | "deny" }) => input)
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const rows = await sql<{ id: string; kind: string; student_id: string | null; status: string }>`
      select id, kind, student_id, status from data_requests where id = ${data.id}
    `;
    const request = rows[0];
    if (!request) return;
    if (data.action === "deny") {
      await sql`update data_requests set status = ${"denied"} where id = ${data.id}`;
      return;
    }
    if (request.kind === "delete" && request.student_id) {
      await sql`delete from students where id = ${request.student_id}`;
    }
    await sql`update data_requests set status = ${"fulfilled"} where id = ${data.id}`;
  });

export const linkMeAsParent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((studentId: string) => studentId)
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    await sql`
      insert into student_parents (student_id, parent_user_id)
      values (${data}, ${context.userId})
      on conflict do nothing
    `;
  });

export const seedSampleSchool = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const existing = await sql<{ n: number }>`select count(*)::int as n from students where school_id = ${SCHOOL_ID}`;
    if ((existing[0]?.n ?? 0) > 0) return { seeded: false };
    const names = ["Amina Hassan", "Yusuf Rahman", "Layla Osman", "Omar Farid"];
    const studentIds: string[] = [];
    for (const name of names) {
      const id = newId();
      studentIds.push(id);
      await sql`insert into students (id, school_id, name) values (${id}, ${SCHOOL_ID}, ${name})`;
    }
    const quranId = newId();
    const arabicId = newId();
    await sql`
      insert into class_groups (id, school_id, subject, level, teacher_id, weekly_schedule)
      values (${quranId}, ${SCHOOL_ID}, ${"Quran"}, ${"Preparatory"}, ${context.userId}, ${"Sat 10:00"})
    `;
    await sql`
      insert into class_groups (id, school_id, subject, level, teacher_id, weekly_schedule)
      values (${arabicId}, ${SCHOOL_ID}, ${"Arabic"}, ${"1"}, ${context.userId}, ${"Sat 11:30"})
    `;
    for (const studentId of studentIds.slice(0, 2)) {
      await sql`insert into group_students (group_id, student_id) values (${quranId}, ${studentId})`;
    }
    for (const studentId of studentIds.slice(2)) {
      await sql`insert into group_students (group_id, student_id) values (${arabicId}, ${studentId})`;
    }
    const saturday = latestSaturday();
    for (const studentId of studentIds.slice(0, 2)) {
      await sql`
        insert into attendance (id, school_id, group_id, student_id, session_date, status, teacher_id)
        values (${newId()}, ${SCHOOL_ID}, ${quranId}, ${studentId}, ${saturday}, ${"present"}, ${context.userId})
      `;
    }
    await sql`
      insert into assignments (id, school_id, group_id, teacher_id, title, description, due_date)
      values (
        ${newId()}, ${SCHOOL_ID}, ${quranId}, ${context.userId},
        ${"Surah Al-Fatiha revision"}, ${"Revise the opening surah with a parent."}, ${nextSaturday(saturday)}
      )
    `;
    await sql`
      insert into calendar_events (id, school_id, title, event_date, audience, created_by)
      values (${newId()}, ${SCHOOL_ID}, ${"Parents evening"}, ${nextSaturday(saturday)}, ${"all"}, ${context.userId})
    `;
    return { seeded: true };
  });

function latestSaturday(): string {
  const now = new Date();
  const day = now.getUTCDay();
  const delta = day === 6 ? 0 : day + 1;
  now.setUTCDate(now.getUTCDate() - delta);
  return now.toISOString().slice(0, 10);
}

function nextSaturday(from: string): string {
  const date = new Date(`${from}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString().slice(0, 10);
}
