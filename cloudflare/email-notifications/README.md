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


## Private assignment attachments (Cloudflare R2)

The same Worker also serves private assignment-file operations. Create an R2 bucket named `badr-school-assignment-files` with EU jurisdiction and Western Europe location. You can create it with `npx wrangler r2 bucket create badr-school-assignment-files --jurisdiction eu --location weur`. R2 jurisdiction is immutable after bucket creation. The `ASSIGNMENT_FILES` binding is configured in `wrangler.toml`; no new Worker secrets are required. Deploy this Worker after creating the bucket and binding.

The application sends Firebase ID tokens to the Worker. The Worker checks the active Firestore account, assignment, group membership, and parent-to-child links before allowing upload, download, attachment removal, or assignment deletion. Files are streamed through authenticated Worker endpoints; the bucket is not public and no permanent download URLs are stored or exposed. Uploads are limited to five files per assignment, 10 MB per file, with PDF, DOCX, XLSX, JPG, and PNG content-type and file-signature validation.

The assignment email queue remains the existing `assignment-parent` notification type. The Worker sends the Arabic and German descriptions in the existing email notification; attachments are accessed after sign-in in the application and are not emailed as public links.


## Automated deployment from GitHub

The repository workflow `.github/workflows/deploy-cloudflare-worker.yml` deploys this Worker when files under `cloudflare/email-notifications/` change on `main`. It can also be started manually from **Actions → Deploy Cloudflare Worker → Run workflow**.

Add these repository Actions secrets under **Settings → Secrets and variables → Actions**:

- `CLOUDFLARE_API_TOKEN`: a Cloudflare API token for the account that owns this Worker and R2 bucket. It needs `Workers R2 Storage Read` and `Workers R2 Storage Write` for bucket verification/creation, plus `Workers Scripts Write` to deploy the existing Worker. Wrangler authentication may also require `Account Settings Read`, `User Details Read`, and `User Memberships Read`.
- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID that owns the Worker and bucket.

Create the token in Cloudflare's dashboard and restrict it to the relevant account. Do not put the token in source code, commit it, or send it in chat.

The workflow first attempts to create `badr-school-assignment-files` with EU jurisdiction and the `weur` location hint. If the bucket already exists, it verifies that it is available in the EU jurisdiction before continuing. It then deploys the Worker using this directory's `wrangler.toml`. The bucket remains private; the workflow does not enable `r2.dev` or a public custom domain.

The workflow does not change the existing GitHub Pages deployment or the Worker notification queue. Existing Worker secrets (Resend and Firebase credentials) are managed separately in Cloudflare and are not copied into GitHub Actions.
