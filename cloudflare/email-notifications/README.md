# Badr School email notifications

This Cloudflare Worker sends transactional notifications through Resend using `admin@badrschule.com`.

## Required secrets

Set these Worker secrets before deployment:

```
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put FIREBASE_PROJECT_ID
npx wrangler secret put ADMIN_UIDS
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON
```

`ADMIN_UIDS` is a comma-separated list of Firebase Auth UIDs that are allowed to request legacy direct notification emails.

`FIREBASE_SERVICE_ACCOUNT_JSON` is the complete Firebase Admin SDK service-account JSON. It is used only by the Worker to read the Firestore notification queue and recipient data. Never commit this JSON to GitHub or expose it to the React application.

## Deployment

```
npx wrangler deploy
```

The Worker has a Cron Trigger that runs every minute. Cloudflare Cron Triggers invoke the Worker scheduled handler on the configured schedule. The one-minute delay also provides batching for message notifications.

## Notification queue

The React application writes authorized records to the Firestore `emailNotifications` collection. The Worker resolves the recipient from Firebase and sends the email through Resend.

Current queued notification types:

- parent-approved
- teacher-approved
- student-level-assigned
- student-group-assigned
- teacher-group-assigned
- teacher-group-removed
- assignment-parent
- calendar-announcement
- message
- new-registration

Messages are intentionally delayed by two minutes. Multiple messages for the same recipient during that window are combined into one email.

Password reset is handled directly by Firebase Authentication rather than this Worker.

The Resend domain `badrschule.com` must remain verified.
