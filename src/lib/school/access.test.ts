import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bootstrapRole,
  canActivateWithoutChildren,
  canCreateAssignment,
  canReadAttendance,
  canReadGroup,
  canReadMessage,
  canReadStudent,
  canRewriteMessageBody,
  canSelfEditField,
  canSelfSignupRole,
  canWriteAttendance,
  canWriteGroup,
  directoryIncludesEmail,
  inferRoleFromEmail,
  isSaturday,
  nextAttendanceStatus,
  parentLinkReplaceAll,
} from "./access.ts";
import type { Profile } from "./types.ts";

function profile(partial: Partial<Profile> & Pick<Profile, "userId" | "role">): Profile {
  return {
    schoolId: "badr",
    name: "Test",
    email: "test@example.com",
    status: "active",
    language: "en",
    requestedChildName: null,
    consentAt: "2026-01-01",
    ...partial,
  };
}

describe("self-signup", () => {
  it("allows parent and teacher only", () => {
    assert.equal(canSelfSignupRole("parent"), true);
    assert.equal(canSelfSignupRole("teacher"), true);
    assert.equal(canSelfSignupRole("admin"), false);
  });

  it("makes the first user admin and never infers role from email", () => {
    assert.equal(bootstrapRole(0), "admin");
    assert.equal(bootstrapRole(1), "parent");
    assert.equal(inferRoleFromEmail("admin@badrschool.de"), null);
    assert.equal(inferRoleFromEmail("teacher.ali@school.de"), null);
  });
});

describe("student reads", () => {
  const admin = profile({ userId: "a1", role: "admin" });
  const teacher = profile({ userId: "t1", role: "teacher" });
  const parent = profile({ userId: "p1", role: "parent" });

  it("lets a parent read only their children", () => {
    assert.equal(
      canReadStudent({
        actor: parent,
        studentId: "s1",
        teacherGroupIds: [],
        studentGroupIds: ["g1"],
        parentChildIds: ["s1"],
      }),
      true,
    );
    assert.equal(
      canReadStudent({
        actor: parent,
        studentId: "s2",
        teacherGroupIds: [],
        studentGroupIds: ["g1"],
        parentChildIds: ["s1"],
      }),
      false,
    );
  });

  it("lets a teacher read students in their groups via membership, not email", () => {
    assert.equal(
      canReadStudent({
        actor: teacher,
        studentId: "s1",
        teacherGroupIds: ["g1"],
        studentGroupIds: ["g1"],
        parentChildIds: [],
      }),
      true,
    );
    assert.equal(
      canReadStudent({
        actor: teacher,
        studentId: "s2",
        teacherGroupIds: ["g1"],
        studentGroupIds: ["g2"],
        parentChildIds: [],
      }),
      false,
    );
  });

  it("lets admin read any student", () => {
    assert.equal(
      canReadStudent({
        actor: admin,
        studentId: "s9",
        teacherGroupIds: [],
        studentGroupIds: [],
        parentChildIds: [],
      }),
      true,
    );
  });
});

describe("groups and attendance", () => {
  const admin = profile({ userId: "a1", role: "admin" });
  const teacher = profile({ userId: "t1", role: "teacher" });
  const parent = profile({ userId: "p1", role: "parent" });

  it("restricts group writes to admin and group reads to assigned teachers", () => {
    assert.equal(canWriteGroup(admin), true);
    assert.equal(canWriteGroup(teacher), false);
    assert.equal(canReadGroup({ actor: teacher, groupId: "g1", teacherGroupIds: ["g1"] }), true);
    assert.equal(canReadGroup({ actor: teacher, groupId: "g2", teacherGroupIds: ["g1"] }), false);
    assert.equal(canReadGroup({ actor: parent, groupId: "g1", teacherGroupIds: [] }), false);
  });

  it("only accepts Saturdays and assigned groups for attendance writes", () => {
    assert.equal(isSaturday("2026-09-26"), true);
    assert.equal(isSaturday("2026-09-25"), false);
    assert.equal(
      canWriteAttendance({
        actor: teacher,
        groupId: "g1",
        teacherGroupIds: ["g1"],
        sessionDate: "2026-09-26",
      }),
      true,
    );
    assert.equal(
      canWriteAttendance({
        actor: teacher,
        groupId: "g1",
        teacherGroupIds: ["g1"],
        sessionDate: "2026-09-25",
      }),
      false,
    );
    assert.equal(
      canWriteAttendance({
        actor: teacher,
        groupId: "g2",
        teacherGroupIds: ["g1"],
        sessionDate: "2026-09-26",
      }),
      false,
    );
  });

  it("lets parents read only their child's attendance", () => {
    assert.equal(
      canReadAttendance({
        actor: parent,
        studentId: "s1",
        groupId: "g1",
        teacherGroupIds: [],
        parentChildIds: ["s1"],
      }),
      true,
    );
    assert.equal(
      canReadAttendance({
        actor: parent,
        studentId: "s2",
        groupId: "g1",
        teacherGroupIds: [],
        parentChildIds: ["s1"],
      }),
      false,
    );
  });

  it("maps checkbox state without losing late", () => {
    assert.equal(nextAttendanceStatus(true, true), "late");
    assert.equal(nextAttendanceStatus(true, false), "present");
    assert.equal(nextAttendanceStatus(false, false), "absent");
  });
});

describe("messages and directory", () => {
  it("allows participants to read and forbids rewriting the body", () => {
    assert.equal(canReadMessage({ actorId: "u1", senderId: "u1", recipientId: "u2" }), true);
    assert.equal(canReadMessage({ actorId: "u2", senderId: "u1", recipientId: "u2" }), true);
    assert.equal(canReadMessage({ actorId: "u3", senderId: "u1", recipientId: "u2" }), false);
    assert.equal(canRewriteMessageBody(), false);
  });

  it("hides emails from non-admins", () => {
    assert.equal(directoryIncludesEmail(profile({ userId: "a1", role: "admin" })), true);
    assert.equal(directoryIncludesEmail(profile({ userId: "t1", role: "teacher" })), false);
    assert.equal(directoryIncludesEmail(profile({ userId: "p1", role: "parent" })), false);
  });
});

describe("approvals and profile edits", () => {
  it("requires a child for parent activation and keeps multi-child links", () => {
    assert.equal(canActivateWithoutChildren("teacher"), true);
    assert.equal(canActivateWithoutChildren("parent"), false);
    assert.equal(parentLinkReplaceAll(), false);
  });

  it("blocks self-edits of role, status, and child links", () => {
    assert.equal(canSelfEditField("name"), true);
    assert.equal(canSelfEditField("language"), true);
    assert.equal(canSelfEditField("role"), false);
    assert.equal(canSelfEditField("status"), false);
    assert.equal(canSelfEditField("linkedChildIds"), false);
  });

  it("lets teachers post assignments only in their groups", () => {
    const teacher = profile({ userId: "t1", role: "teacher" });
    assert.equal(canCreateAssignment({ actor: teacher, groupId: "g1", teacherGroupIds: ["g1"] }), true);
    assert.equal(canCreateAssignment({ actor: teacher, groupId: "g2", teacherGroupIds: ["g1"] }), false);
  });
});
