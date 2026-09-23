# Badr Moschee School

A responsive, multi-language school management web app for Badr Moschee Arabic School in Aschaffenburg. It is designed for approximately 50 students, 6-7 teachers, and 40-50 parent accounts.

## Project status

The core application is implemented and validated locally. It includes role-aware Firebase authentication, pending account approval, parent/student linking, groups, teacher assignments, Saturday attendance, admin attendance reporting, calendar events, in-app messaging, Arabic RTL, and PWA support.

The frontend is a static Vite application. Firebase Authentication and Firestore provide the backend; no Cloud Functions, Storage, email, SMS, or push notification services are used.

## Features

- Multi-role dashboards for admin, teacher, and parent
- English, German, and Arabic localization with RTL switching
- Firebase Authentication + Firestore-only backend within the free Spark plan
- Installable PWA shell with offline-first caching for previously loaded data
- In-app inbox for messages, announcements, and absence notices
- Academic calendar and school-wide reporting views
- Privacy notice, parental consent flow, and child data export/deletion support

## Tech stack

- React + TypeScript + Vite
- Firebase Auth + Firestore
- GitHub Pages static hosting
- PWA support via Vite PWA plugin

## Local development

1. Install Node.js LTS.
2. In the project folder run:

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env.local` and add the Firebase Web App config values:

   ```env
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=...
   VITE_FIREBASE_PROJECT_ID=...
   VITE_FIREBASE_STORAGE_BUCKET=...
   VITE_FIREBASE_MESSAGING_SENDER_ID=...
   VITE_FIREBASE_APP_ID=...
   ```

4. Run validation:

   ```bash
   npm run lint
   npm run build
   ```

5. Run locally:

   ```bash
   npm run dev
   ```

6. Deploy the Firestore rules:

   ```bash
   npx firebase-tools login
   npx firebase-tools use badrmoscheeschool
   npx firebase-tools deploy --only firestore:rules
   ```

The local Firebase config is intentionally stored in `.env.local`, which is ignored by Git. Firebase Web App configuration is safe to ship in a browser application; Firestore security rules and Authentication are the actual access controls.

## Firebase setup

### Authentication
- Enable Email/Password sign-in
- Set up allowed domains for your deployment
- Use Firestore rules described in `firestore.rules`
- Register the local development domain `localhost` and the GitHub Pages domain in Authentication settings when required

### Firestore
- Create the project in a European region such as `europe-west3`
- Use the rules below to restrict access by role and child ownership
- Create the database in Production mode, then deploy `firestore.rules`

### Security model

Security depends on Firestore rules because the Firebase API key is public. Rules must enforce:

- Teachers can only access groups they teach
- Parents can only see records for their own children
- Admins are the only role able to create or modify user roles, level assignments, and groups
- Self-registered accounts remain `pending` until an admin approves them

The first admin must be created in Firebase Authentication, then its matching `users/{uid}` document must be set manually to `role: "admin"` and `status: "active"`. After that, admins can approve accounts in the app.

### First-time data setup

1. Create or approve teacher accounts.
2. Create student records from **Admin → Groups**, or from a pending parent request.
3. Create a group and select its teacher and students.
4. The group automatically updates the teacher's `assignedGroupIds` and each student's `groupMemberships`.
5. Teachers can then select a group and Saturday date in **Attendance**.

## Firestore rules summary

- `users`: only admins may update roles and status flags
- `students`: parents can read only their linked child records; teachers can read only students in their groups
- `groups`: only admins can create/edit group assignments
- `attendance`: teachers can read/write for their groups; parents can read only own-child attendance
- `assignments`: teacher create/update within assigned groups; parents can read for linked children
- `messages`: participants and thread-based read/write restrictions
- `announcements`: administrative broadcast audience logic enforced by role checks

## Working workflows

- Parent signup records the requested child name for admin review.
- Admins can create student records, create groups, select teachers, and select students by name.
- Group creation updates both the teacher's `assignedGroupIds` and each student's `groupMemberships`.
- Teachers select a group and Saturday date, then mark present and late students with checkboxes. Unchecked students are recorded absent.
- Admins see attendance percentage by group and expandable per-student history.
- Authenticated users can send participant-scoped in-app messages with unread metadata.

## Deployment

### GitHub Pages

This can be deployed as a static app using the Vite build output in the `dist/` folder.

- Build: `npm run build`
- Publish the contents of `dist/` as the site artifact

The included GitHub Actions workflow builds and deploys the static site. GitHub Pages should be configured to allow the workflow to deploy Pages artifacts.

The Vite base path is relative (`./`), so the app works when served from a repository project URL such as `https://OWNER.github.io/REPOSITORY/`.

### Firebase Hosting

A minimal `firebase.json` can be used to deploy the `dist/` output and serve the app as a SPA.

## Spark plan compatibility

This design remains within Firebase Spark (free) constraints:

- No Cloud Functions
- No Storage bucket usage
- No third-party email/SMS providers
- All notifications stay as Firestore documents and are queried in-app
- Reads/writes are intentionally limited and paginated for small-school scale

## Compliance

- Privacy notice and consent flow must appear in signup and within the parent dashboard
- Parent/admin can request child data export or deletion
- All personal student data remains in Firestore under EU region controls

## Seed data

A sample script is included at `scripts/seed-sample-data.js` and can be used to insert demo users, students, groups, and assignments into Firestore.

The seed script requires a Firebase Admin service-account JSON file at `scripts/firebase-service-account.json` and the `firebase-admin` package. Never commit that JSON file; it is intentionally ignored by Git.

## Notes

The production build and preview have been validated locally. Firebase-backed workflows additionally require the real project configuration, deployed rules, authenticated users, and corresponding Firestore documents described above.

## Repository safety

- Never commit `.env.local`.
- Never commit `scripts/firebase-service-account.json`.
- Do not put Firebase Admin credentials in the frontend.
- Review Firestore rules before production deployment.
