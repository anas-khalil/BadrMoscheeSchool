import type { AccountStatus, AttendanceStatus, Profile, Role } from "./types";

export class AccessError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "AccessError";
  }
}

export function assertActive(profile: Profile | null): asserts profile is Profile {
  if (!profile) throw new AccessError("Not signed in");
  if (profile.status === "pending") throw new AccessError("Account pending approval");
  if (profile.status === "rejected") throw new AccessError("Account rejected");
  if (profile.status !== "active") throw new AccessError("Forbidden");
}

export function canSelfSignupRole(role: Role): boolean {
  return role === "parent" || role === "teacher";
}

export function bootstrapRole(existingAdminCount: number): Role {
  return existingAdminCount === 0 ? "admin" : "parent";
}

export function inferRoleFromEmail(_email: string | null | undefined): Role | null {
  return null;
}

export function canReadStudent(opts: {
  actor: Profile;
  studentId: string;
  teacherGroupIds: string[];
  studentGroupIds: string[];
  parentChildIds: string[];
}): boolean {
  const { actor, studentId, teacherGroupIds, studentGroupIds, parentChildIds } = opts;
  if (actor.role === "admin") return true;
  if (actor.role === "parent") return parentChildIds.includes(studentId);
  if (actor.role === "teacher") {
    return studentGroupIds.some((id) => teacherGroupIds.includes(id));
  }
  return false;
}

export function canReadGroup(opts: { actor: Profile; groupId: string; teacherGroupIds: string[] }): boolean {
  if (opts.actor.role === "admin") return true;
  if (opts.actor.role === "teacher") return opts.teacherGroupIds.includes(opts.groupId);
  return false;
}

export function canWriteGroup(actor: Profile): boolean {
  return actor.role === "admin";
}

export function canWriteAttendance(opts: {
  actor: Profile;
  groupId: string;
  teacherGroupIds: string[];
  sessionDate: string;
}): boolean {
  if (!isSaturday(opts.sessionDate)) return false;
  if (opts.actor.role === "admin") return true;
  if (opts.actor.role === "teacher") return opts.teacherGroupIds.includes(opts.groupId);
  return false;
}

export function isSaturday(isoDate: string): boolean {
  const parts = isoDate.split("-").map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (!year || !month || !day) return false;
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return date.getUTCDay() === 6;
}

export function canReadAttendance(opts: {
  actor: Profile;
  studentId: string;
  groupId: string;
  teacherGroupIds: string[];
  parentChildIds: string[];
}): boolean {
  if (opts.actor.role === "admin") return true;
  if (opts.actor.role === "teacher") return opts.teacherGroupIds.includes(opts.groupId);
  if (opts.actor.role === "parent") return opts.parentChildIds.includes(opts.studentId);
  return false;
}

export function canCreateAssignment(opts: {
  actor: Profile;
  groupId: string;
  teacherGroupIds: string[];
}): boolean {
  if (opts.actor.role === "admin") return true;
  if (opts.actor.role === "teacher") return opts.teacherGroupIds.includes(opts.groupId);
  return false;
}

export function canReadMessage(opts: { actorId: string; senderId: string; recipientId: string }): boolean {
  return opts.actorId === opts.senderId || opts.actorId === opts.recipientId;
}

export function canRewriteMessageBody(): boolean {
  return false;
}

export function canApproveAccounts(actor: Profile): boolean {
  return actor.role === "admin" && actor.status === "active";
}

export function canActivateWithoutChildren(role: Role): boolean {
  return role === "teacher";
}

export function parentLinkReplaceAll(): boolean {
  return false;
}

export function allowedProfileSelfEditKeys(): ReadonlySet<string> {
  return new Set(["name", "language"]);
}

export function canSelfEditField(field: string): boolean {
  return allowedProfileSelfEditKeys().has(field);
}

export function directoryIncludesEmail(actor: Profile): boolean {
  return actor.role === "admin";
}

export function canMessage(opts: {
  actor: Profile;
  recipientRole: Role;
  recipientId: string;
  allowedRecipientIds: string[];
}): boolean {
  if (opts.actor.userId === opts.recipientId) return false;
  return opts.allowedRecipientIds.includes(opts.recipientId);
}

export function nextAttendanceStatus(
  present: boolean,
  late: boolean,
): AttendanceStatus {
  if (late) return "late";
  if (present) return "present";
  return "absent";
}

export function statusRank(status: AccountStatus): number {
  if (status === "active") return 2;
  if (status === "pending") return 1;
  return 0;
}
