import type { User } from 'firebase/auth';

type Locale = 'en' | 'de' | 'ar';

type ParentApprovedEmail = {
  recipientEmail: string;
  recipientName: string;
  locale: Locale;
};

type EmailNotificationResult = {
  sent: boolean;
  skipped?: boolean;
};

const workerUrl = import.meta.env.VITE_EMAIL_NOTIFICATION_WORKER_URL as string | undefined;

export async function sendParentApprovedEmail(
  user: User | null,
  notification: ParentApprovedEmail
): Promise<EmailNotificationResult> {
  if (!workerUrl || !user) {
    return { sent: false, skipped: true };
  }

  const token = await user.getIdToken();
  const response = await fetch(workerUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      type: 'parent-approved',
      recipientEmail: notification.recipientEmail,
      recipientName: notification.recipientName,
      locale: notification.locale
    })
  });

  if (!response.ok) {
    return { sent: false };
  }

  return { sent: true };
}
