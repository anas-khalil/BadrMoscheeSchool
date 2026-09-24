-- Badr Mosque School schema. One school, role-scoped rows.
-- Access is enforced in server functions (never trust a client-sent user id).

create table if not exists schools (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  user_id text primary key,
  school_id text not null references schools (id),
  name text not null,
  email text not null,
  role text not null check (role in ('admin', 'teacher', 'parent')),
  status text not null check (status in ('pending', 'active', 'rejected')),
  language text not null default 'en',
  requested_child_name text,
  consent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists profiles_school_status_idx on profiles (school_id, status);
create index if not exists profiles_school_role_status_idx on profiles (school_id, role, status);

create table if not exists students (
  id text primary key,
  school_id text not null references schools (id),
  name text not null,
  created_at timestamptz not null default now()
);

create index if not exists students_school_idx on students (school_id);

create table if not exists student_parents (
  student_id text not null references students (id) on delete cascade,
  parent_user_id text not null references profiles (user_id) on delete cascade,
  primary key (student_id, parent_user_id)
);

create index if not exists student_parents_parent_idx on student_parents (parent_user_id);

create table if not exists class_groups (
  id text primary key,
  school_id text not null references schools (id),
  subject text not null,
  level text not null,
  teacher_id text references profiles (user_id) on delete set null,
  weekly_schedule text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists class_groups_school_idx on class_groups (school_id);
create index if not exists class_groups_teacher_idx on class_groups (teacher_id);

create table if not exists group_students (
  group_id text not null references class_groups (id) on delete cascade,
  student_id text not null references students (id) on delete cascade,
  primary key (group_id, student_id)
);

create index if not exists group_students_student_idx on group_students (student_id);

create table if not exists attendance (
  id text primary key,
  school_id text not null references schools (id),
  group_id text not null references class_groups (id) on delete cascade,
  student_id text not null references students (id) on delete cascade,
  session_date date not null,
  status text not null check (status in ('present', 'absent', 'late')),
  teacher_id text not null,
  created_at timestamptz not null default now(),
  unique (group_id, student_id, session_date)
);

create index if not exists attendance_group_date_idx on attendance (group_id, session_date);
create index if not exists attendance_student_idx on attendance (student_id);

create table if not exists assignments (
  id text primary key,
  school_id text not null references schools (id),
  group_id text not null references class_groups (id) on delete cascade,
  teacher_id text not null,
  title text not null,
  description text not null default '',
  due_date date,
  created_at timestamptz not null default now()
);

create index if not exists assignments_group_idx on assignments (group_id);

create table if not exists assignment_reads (
  assignment_id text not null references assignments (id) on delete cascade,
  user_id text not null,
  primary key (assignment_id, user_id)
);

create table if not exists messages (
  id text primary key,
  school_id text not null references schools (id),
  sender_id text not null,
  recipient_id text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_participant_idx on messages (recipient_id, created_at desc);
create index if not exists messages_sender_idx on messages (sender_id, created_at desc);

create table if not exists message_reads (
  message_id text not null references messages (id) on delete cascade,
  user_id text not null,
  primary key (message_id, user_id)
);

create table if not exists calendar_events (
  id text primary key,
  school_id text not null references schools (id),
  title text not null,
  event_date date not null,
  audience text not null default 'all',
  created_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists calendar_events_school_date_idx on calendar_events (school_id, event_date);

create table if not exists data_requests (
  id text primary key,
  school_id text not null references schools (id),
  requester_id text not null,
  student_id text,
  kind text not null check (kind in ('export', 'delete')),
  status text not null default 'open' check (status in ('open', 'fulfilled', 'denied')),
  payload text,
  created_at timestamptz not null default now()
);

create table if not exists password_help (
  id text primary key,
  school_id text not null references schools (id),
  email text not null,
  note text not null default '',
  status text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now()
);
