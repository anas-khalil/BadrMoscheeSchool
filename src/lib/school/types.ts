export type Locale = "en" | "de" | "ar";
export type Role = "admin" | "teacher" | "parent";
export type AccountStatus = "pending" | "active" | "rejected";
export type AttendanceStatus = "present" | "absent" | "late";

export type Profile = {
  userId: string;
  schoolId: string;
  name: string;
  email: string;
  role: Role;
  status: AccountStatus;
  language: Locale;
  requestedChildName: string | null;
  consentAt: string | null;
};

export type DirectoryPerson = {
  id: string;
  name: string;
  role: Role;
  email?: string;
};

export type StudentRecord = {
  id: string;
  name: string;
  parentIds: string[];
  groupIds: string[];
};

export type GroupRecord = {
  id: string;
  subject: string;
  level: string;
  teacherId: string | null;
  teacherName: string;
  weeklySchedule: string;
  studentIds: string[];
  studentNames: string[];
};

export type AttendanceRecord = {
  id: string;
  groupId: string;
  studentId: string;
  studentName: string;
  sessionDate: string;
  status: AttendanceStatus;
};

export type AssignmentRecord = {
  id: string;
  groupId: string;
  groupName: string;
  title: string;
  description: string;
  dueDate: string | null;
  createdAt: string;
  unread: boolean;
};

export type MessageRecord = {
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  body: string;
  createdAt: string;
  unread: boolean;
};

export type CalendarEvent = {
  id: string;
  title: string;
  eventDate: string;
  audience: string;
};

export type DataRequest = {
  id: string;
  kind: "export" | "delete";
  studentId: string | null;
  studentName: string | null;
  status: "open" | "fulfilled" | "denied";
  payload: string | null;
  createdAt: string;
};

export type SessionSnapshot = {
  profile: Profile | null;
  needsOnboarding: boolean;
  schoolName: string;
  isAdmin: boolean;
  isTeacher: boolean;
  isParent: boolean;
  assignedGroupIds: string[];
  childIds: string[];
};
