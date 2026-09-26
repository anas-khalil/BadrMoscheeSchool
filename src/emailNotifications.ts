import { addDoc, collection } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';

export type NotificationType =
  | 'parent-approved'
  | 'teacher-approved'
  | 'student-level-assigned'
  | 'student-group-assigned'
  | 'teacher-group-assigned'
  | 'teacher-group-removed'
  | 'assignment-parent'
  | 'calendar-announcement'
  | 'message'
  | 'new-registration';

type Locale = 'en' | 'de' | 'ar';

type QueueNotification = {
  type: NotificationType;
  user: User | null;
  db: Firestore;
  targetUserId?: string;
  assignmentId?: string;
  eventId?: string;
  messageId?: string;
  groupId?: string;
  studentId?: string;
  subject?: string;
  level?: string;
  previousTeacherId?: string;
  actorRole?: 'parent' | 'teacher';
};

export async function queueEmailNotification(notification: QueueNotification): Promise<void> {
  if (!notification.user) return;

  const now = new Date();
  const sendAfter = new Date(now.getTime() + (notification.type === 'message' ? 2 * 60 * 1000 : 0));

  await addDoc(collection(notification.db, 'emailNotifications'), {
    type: notification.type,
    actorUserId: notification.user.uid,
    ...(notification.targetUserId ? { targetUserId: notification.targetUserId } : {}),
    ...(notification.assignmentId ? { assignmentId: notification.assignmentId } : {}),
    ...(notification.eventId ? { eventId: notification.eventId } : {}),
    ...(notification.messageId ? { messageId: notification.messageId } : {}),
    ...(notification.groupId ? { groupId: notification.groupId } : {}),
    ...(notification.studentId ? { studentId: notification.studentId } : {}),
    ...(notification.subject ? { subject: notification.subject } : {}),
    ...(notification.level ? { level: notification.level } : {}),
    ...(notification.previousTeacherId ? { previousTeacherId: notification.previousTeacherId } : {}),
    ...(notification.actorRole ? { actorRole: notification.actorRole } : {}),
    createdAt: now.toISOString(),
    sendAfter: sendAfter.toISOString()
  });
}

// Password reset is intentionally handled by Firebase Authentication rather than
// the transactional email Worker. Firebase provides the secure one-time action code.
export type { Locale };
