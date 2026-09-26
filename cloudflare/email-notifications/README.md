# Badr School email notifications

This Cloudflare Worker sends transactional notifications through Resend using `admin@badrschule.com` as the sender and reply-to address.

## Required secrets

Set these Worker secrets before deployment:

```bash
wrangler secret put RESEND_API_KEY
wrangler secret put FIREBASE_PROJECT_ID
wrangler secret put ADMIN_UIDS
```

`ADMIN_UIDS` is a comma-separated list of Firebase Auth UIDs that are allowed to request notification emails.

## Deploy

From this directory:

```bash
npx wrangler deploy
```

The Resend domain `badrschule.com` must remain verified, and the Resend API key must never be committed to GitHub or exposed in the React application.

## Current notification

`POST /` with a Firebase ID token in `Authorization: Bearer <token>` and:

```json
{
  "type": "parent-approved",
  "recipientEmail": "parent@example.com",
  "recipientName": "Parent Name",
  "locale": "en"
}
```

The Worker sends from `Badr Mosque School <admin@badrschule.com>` with `Reply-To: admin@badrschule.com`.
