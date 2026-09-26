# Badr Moschee School

A responsive, multilingual school-management web application for the Badr Moschee Arabic & Quran School in Aschaffenburg, Germany. The system provides separate workflows for administrators, teachers, and parents and supports English, German, and Arabic (RTL).

## Overview

The project is a static React/TypeScript Progressive Web App (PWA). Firebase Authentication and Cloud Firestore provide authentication, application data, and authorization through Firestore Security Rules. The frontend is statically hosted and served through the project's Cloudflare-managed domain.

Transactional email is handled outside the browser by a Cloudflare Worker and Resend. Email requests are written to a Firestore `emailNotifications` queue; the Worker processes the queue on a one-minute Cron Trigger. This keeps API credentials out of the frontend and avoids requiring Firebase Cloud Functions.

The application is designed for the current scale of the school (roughly 50 students, 6–7 teachers, and 40–50 parent accounts) while keeping the data model and role structure extensible.

## Features

### Authentication and accounts

- Firebase Email/Password authentication.
- Parent and teacher self-registration.
- New registrations remain `pending` until approved by an administrator.
- Admin, Teacher, and Parent roles.
- Role-specific dashboards and navigation.
- Password-reset emails through Firebase Authentication.
- Parent/student linking.
- Administrator approval and account-management workflows.

### Multilingual UI

- English, German, and Arabic.
- Arabic right-to-left (RTL) layout.
- Localized navigation, forms, buttons, validation messages, status messages, and notification content.
- Responsive layouts for desktop, tablet, and mobile screens.

### Admin management

Administrators can manage:

- Parent and teacher registrations and approvals.
- Students and parent relationships.
- Arabic and Quran levels.
- Groups/classes.
- Teacher-to-group assignments.
- Student-to-group assignments.
- Calendar events and school announcements.
- Attendance reporting.
- Assignments/homework.
- In-app messaging.
- School-wide notification workflows.

### Teacher workflows

Teachers can:

- View their assigned groups and students.
- Record Saturday attendance.
- Mark students present, absent, or late.
- Post assignments/homework to a group.
- Communicate with parents and administrators.
- Receive notifications when assigned to or removed from groups.

### Parent workflows

Parents can:

- View their linked children.
- View relevant group/academic information.
- View assignments for their children.
- View permitted attendance information.
- Receive school announcements.
- Communicate with teachers and administrators.
- Receive important account, assignment, and communication emails.

### Students, levels, and groups

Students are separate Firestore records and can be linked to one or more parents. Groups contain student and teacher relationships. Group changes synchronize the corresponding teacher/student membership fields used by the application and its security model.

Arabic and Quran levels can be managed independently so that a child can be placed at a different level for each subject.

### Attendance

Attendance is designed around the school's Saturday classes. Teachers select an assigned group and date, then record present, absent, or late status. Administrators can review group attendance percentages and student history. Parents can access attendance information for their own linked children subject to Firestore Rules.

### Assignments / homework

Teachers can post assignments to groups, including title, description, teacher, group, and due-date information. Parents see assignments relevant to their children. A new assignment can also generate a transactional email notification for the affected parent.

### Calendar and announcements

Administrators can create school calendar events and broadcast announcements. Calendar/announcement data is available through the appropriate role-based views, and administrative announcements can generate email notifications.

### In-app messaging

Authenticated users can exchange participant-scoped messages according to role and access rules. Messaging includes unread metadata and supports administrator, teacher, and parent communication workflows.

## Transactional email notifications

The project currently supports email notifications for:

1. Parent account approval.
2. Teacher account approval.
3. Password reset through Firebase Authentication.
4. Child assigned an Arabic level.
5. Child assigned a Quran level.
6. Child assigned to a group/teacher.
7. Teacher assigned to a group.
8. Teacher removed from a group.
9. Homework/assignment assigned to a child.
10. Calendar/school announcements.
11. In-app messages.
12. New parent registration → administrators.
13. New teacher registration → administrators.

### Message batching

The application intentionally does not send an email for every message when several messages arrive quickly. Message notifications are queued with a short delay and the Cloudflare Worker combines pending messages for the same recipient into a single email.

### Email architecture

```text
React application
       │
       ▼
Firebase Firestore
emailNotifications collection
       │
       │ scheduled processing
       ▼
Cloudflare Worker
       │
       ▼
Resend
       │
       ▼
Recipient email
```

The configured sender/reply address is `admin@badrschule.com`. Resend credentials and Firebase server credentials are stored only as Cloudflare Worker secrets.

The Worker runs every minute using a Cloudflare Cron Trigger. Its source and deployment documentation are in `cloudflare/email-notifications/`.

## Technology stack

### Frontend

- React
- TypeScript
- Vite
- Progressive Web App support
- Responsive UI
- Multilingual localization
- Arabic RTL support

### Backend

- Firebase Authentication
- Cloud Firestore
- Firestore Security Rules

### Infrastructure

- GitHub / GitHub Actions
- Static web hosting
- Cloudflare DNS/custom domain
- Cloudflare Workers
- Cloudflare Cron Triggers
- Resend transactional email

### Development tools

- Node.js / npm
- TypeScript compiler
- Vite build
- Firebase CLI (`firebase-tools`)
- Wrangler
- GitHub Actions CI

## Architecture

```text
                    ┌──────────────────────┐
                    │ Browser / PWA        │
                    │ React + TypeScript    │
                    │ Vite                  │
                    └──────────┬───────────┘
                               │
                 ┌─────────────┴─────────────┐
                 ▼                           ▼
       ┌─────────────────┐          ┌──────────────────┐
       │ Firebase Auth   │          │ Cloud Firestore  │
       │ Accounts/Roles  │          │ App data + rules │
       └─────────────────┘          └────────┬─────────┘
                                             │
                                    emailNotifications
                                             │
                                             ▼
                                   ┌──────────────────┐
                                   │ Cloudflare Worker│
                                   │ every minute     │
                                   └────────┬─────────┘
                                            │
                                            ▼
                                   ┌──────────────────┐
                                   │ Resend           │
                                   │ Email delivery   │
                                   └──────────────────┘
```

The browser never receives the Resend API key or Firebase Admin service-account credentials.

## Firestore data model

Major collections include:

- `users` — user profiles, roles, account status, and relationships.
- `students` — student records, parent relationships, and group memberships.
- `groups` — groups/classes and their teacher/student relationships.
- `assignments` — teacher-created assignments/homework.
- `attendance` — attendance records.
- `messages` — participant-scoped in-app messages.
- `calendarEvents` — calendar events and announcements.
- `emailNotifications` — queued transactional email jobs.
- `directory` — permitted directory information used by the application.

The exact fields may evolve; Firestore Security Rules remain the authoritative access-control layer.

## Security model

Firebase Web configuration is intentionally present in the browser. It is not a secret. Security is provided by Firebase Authentication and Firestore Security Rules.

Rules enforce relationships such as:

- Only administrators can perform administrative role/status and group-management operations.
- Teachers can access students/groups relevant to their assigned groups.
- Parents can access records belonging to their linked children.
- Users can access only permitted message threads.
- Assignment access follows teacher/group and parent/child relationships.
- Self-registered accounts remain pending until administrator approval.

The first administrator is created in Firebase Authentication and then configured in the matching `users/{uid}` document as an active `admin`. After that, administrators can approve registrations in the application.

## Important deployment distinction

There are three separate deployment/configuration layers:

1. **Frontend** — React/Vite application deployment.
2. **Firestore** — Security Rules deployment.
3. **Email Worker** — Cloudflare Worker deployment.

Changing one does not automatically deploy the others.

### Firestore Rules

After changing `firestore.rules`:

```bash
npx firebase-tools login
npx firebase-tools use badrmoscheeschool
npx firebase-tools deploy --only firestore:rules
```

### Cloudflare Worker

From the Worker directory:

```bash
cd cloudflare/email-notifications
npx wrangler deploy
```

The Worker uses a one-minute Cron Trigger.

## Worker secrets

Required Worker secrets include:

```text
RESEND_API_KEY
FIREBASE_PROJECT_ID
ADMIN_UIDS
FIREBASE_SERVICE_ACCOUNT_JSON
```

`ADMIN_UIDS` contains the Firebase UIDs of administrators who receive registration notifications.

`FIREBASE_SERVICE_ACCOUNT_JSON` is server-side Firebase Admin credentials. It must never be committed to Git or exposed to the frontend.

See `cloudflare/email-notifications/README.md` for Worker-specific configuration.

## Frontend environment variables

Typical `.env.local` values are:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_EMAIL_NOTIFICATION_WORKER_URL=https://<your-worker-domain>/
```

`.env.local` is ignored by Git and must not be committed.

## Local development

Requirements:

- Node.js LTS
- npm
- Firebase project for integration testing
- Firebase CLI for rules deployment
- Wrangler for Worker deployment

Install dependencies:

```bash
npm install
```

Start development:

```bash
npm run dev
```

Validate the application:

```bash
npm run lint
npm run build
```

## CI and pull requests

GitHub Actions validates pull requests before merging. The checks include frontend TypeScript/Vite validation and validation of the Cloudflare Worker configuration using Wrangler's dry-run deployment validation.

Recommended workflow:

1. Create a feature/fix branch.
2. Implement the change.
3. Run lint/build locally.
4. Open a pull request.
5. Wait for CI checks to pass.
6. Review and merge.
7. Deploy Firestore Rules and/or the Worker separately when those components changed.
8. Test the affected production workflow.

## PWA

The application is installable as a Progressive Web App on supported devices. Vite PWA configuration provides the application shell and caching behavior. Firebase-backed data remains protected by Authentication and Firestore Rules.

## Privacy and data protection

The system handles personal information about children, parents, and teachers. The application therefore includes privacy/consent flows and relationship-based access controls.

Important principles include:

- Parents can access their own linked children rather than arbitrary student records.
- Teacher access is limited by group relationships.
- Administrative operations are restricted to administrators.
- Child data export/deletion workflows are supported where implemented.
- Firebase/Firestore can be deployed in an EU region.
- Server credentials and email API keys are kept outside the frontend.

Security-rule changes should always be reviewed carefully because they directly control access to student and family data.

## Repository structure

```text
.
├── src/                         # React/TypeScript application
├── cloudflare/
│   └── email-notifications/     # Cloudflare transactional email Worker
├── scripts/                     # Development/seed utilities
├── firestore.rules              # Firestore authorization rules
├── firebase.json                # Firebase CLI configuration
├── .firebaserc                  # Firebase project configuration
├── package.json                 # Dependencies and scripts
├── vite.config.*                # Vite/PWA configuration
└── .github/workflows/           # CI/deployment workflows
```

## Seed/demo data

A sample data script is available at:

```text
scripts/seed-sample-data.js
```

It may require a Firebase Admin service-account JSON file and `firebase-admin`. Service-account files must remain local and must never be committed.

## Operational checklist

For a frontend-only change:

```bash
npm run lint
npm run build
```

For Firestore Rules changes:

```bash
npx firebase-tools deploy --only firestore:rules
```

For Worker changes:

```bash
cd cloudflare/email-notifications
npx wrangler deploy
```

For notification changes, verify all three components when applicable:

```text
Frontend queueing logic
        +
Firestore permissions/data
        +
Cloudflare Worker processing
        +
Resend configuration
```

## Repository safety

Never commit:

- `.env.local`
- Firebase Admin service-account JSON
- Resend API keys
- Cloudflare Worker secrets
- Passwords or other credentials

Never place Firebase Admin credentials or the Resend API key in frontend code.

## Project status

The core school-management workflows are implemented and tested against the Firebase-backed application and transactional email infrastructure. The architecture is intentionally lightweight and suitable for the current school size while leaving room for additional features and workflows.
