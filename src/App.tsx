import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { createUserWithEmailAndPassword, deleteUser, getAuth, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, type User } from 'firebase/auth';
import { addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, getFirestore, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { registerSW } from 'virtual:pwa-register';
import { queueEmailNotification } from './emailNotifications';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

// A single denied/missing doc must not blank out the rest of a batch fetch.
async function getExistingDocs(collectionName: string, ids: string[]) {
  const settled = await Promise.allSettled(ids.map((id) => getDoc(doc(db, collectionName, id))));
  return settled.flatMap((result) => result.status === 'fulfilled' && result.value.exists() ? [result.value] : []);
}

// Groups attendance docs by group, then by day, so the UI can drill down group -> day -> student.
function buildGroupAttendance(groups: Array<{ id: string; name: string }>, records: Array<{ groupId?: string; studentId?: string; date?: string; status?: string }>, studentNameById: Map<string, string>) {
  return groups.map((group) => {
    const groupRecords = records.filter((record) => record.groupId === group.id);
    const byDate = new Map<string, { date: string; present: number; total: number; records: { studentId: string; studentName: string; status: string }[] }>();
    groupRecords.forEach((record) => {
      const date = record.date || '';
      const day = byDate.get(date) || { date, present: 0, total: 0, records: [] };
      day.total += 1;
      if (record.status === 'present' || record.status === 'late') day.present += 1;
      day.records.push({ studentId: record.studentId || '', studentName: studentNameById.get(record.studentId || '') || record.studentId || '', status: record.status || 'absent' });
      byDate.set(date, day);
    });
    return { groupId: group.id, groupName: group.name, days: [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date)) };
  });
}

type Locale = 'en' | 'de' | 'ar';

type Role = 'admin' | 'teacher' | 'parent';
type Section = 'dashboard' | 'calendar' | 'messages' | 'attendance' | 'assignments' | 'approvals' | 'groups' | 'privacy';

type LiveItem = {
  id: string;
  text: string;
};

type DirectoryUser = {
  id: string;
  name: string;
  email: string;
  role?: Role;
};

type DirectoryStudent = {
  id: string;
  name: string;
  parentIds?: string[];
};

type DirectoryGroup = {
  id: string;
  name: string;
  studentIds: string[];
};

type AttendanceStudent = DirectoryStudent & {
  status?: 'present' | 'absent' | 'late';
};

type AttendanceDayRecord = { studentId: string; studentName: string; status: string };
type AttendanceDay = { date: string; present: number; total: number; records: AttendanceDayRecord[] };
type GroupAttendance = { groupId: string; groupName: string; days: AttendanceDay[] };
type ParentAttendanceEntry = { studentId: string; studentName: string; days: Array<{ date: string; status: string }> };

type MessageRecord = { id: string; senderId: string; senderName: string; text: string; sentAt: string; createdAt: string };

const translations: Record<Locale, Record<string, string>> = {
  en: {
    appTitle: 'Badr Mosque School',
    admin: 'Admin',
    teacher: 'Teacher',
    parent: 'Parent',
    dashboard: 'Dashboard',
    calendar: 'Calendar',
    messages: 'Messages',
    attendance: 'Attendance',
    assignments: 'Assignments',
    privacy: 'Privacy Policy',
    login: 'Login',
    logout: 'Logout',
    language: 'Language',
    offline: 'Offline ready',
    welcome: 'School management dashboard',
    pending: 'Pending approval',
    note: 'This app uses Firebase Firestore only and keeps notifications in-app.',
    loginHint: 'Sign in to access your school dashboard.',
    welcomeTitle: 'Welcome to Badr Mosque School',
    welcomeText: 'Manage attendance, assignments, messages, and school groups in one place.',
    close: 'Close',
    signedInAs: 'Signed in as',
    selected: 'Selected view',
    open: 'Open',
    email: 'Email address',
    password: 'Password',
    signIn: 'Sign in',
    createAccount: 'Create Account',
    switchToSignup: 'Need an account? Sign up',
    switchToLogin: 'Already registered? Sign in',
    authError: 'Unable to complete authentication. Check your details and try again.', forgotPassword: 'Forgot password?', passwordResetSent: 'Password reset email sent.',
    pendingNote: 'Your account is pending admin approval.'
    ,approvals: 'Approvals', groups: 'Groups', pendingParents: 'Pending parent accounts', approve: 'Approve', approved: 'Parent approved', approvalError: 'Could not update this account.', approvalEmailFailed: 'The account was approved, but the email notification could not be sent.', eventTitle: 'Event title', eventDate: 'Event date', eventAudience: 'Audience', allSchool: 'Everyone', createEvent: 'Create event', eventCreated: 'Event created.', group: 'Group', studentId: 'Student ID', studentName: 'Student name', assignmentTitle: 'Assignment title', description: 'Description', dueDate: 'Due date', createAssignment: 'Post assignment', assignmentCreated: 'Assignment posted', attendanceStatus: 'Status', present: 'Present', absent: 'Absent', late: 'Late', saveAttendance: 'Save attendance', attendanceSaved: 'Attendance saved', loginButton: 'Login', signupButton: 'Sign up', chooseAccountType: 'Choose account type', accountType: 'Account type', signupNote: 'All new accounts require admin approval.', accountCreated: 'Account created. Please wait for admin approval.', groupId: 'Group ID', subject: 'Subject', level: 'Level', teacherUid: 'Teacher UID', studentIds: 'Students', schedule: 'Weekly schedule', createGroup: 'Create group', groupCreated: 'Group created and assigned.', attended: 'Attended', markAttendance: 'Mark Saturday attendance', attendanceDate: 'Session date', attendanceSummary: 'Attendance summary', attendanceRate: 'Attendance rate', viewHistory: 'View student history', history: 'History', noAttendanceData: 'No attendance data yet.', saturdayOnly: 'Please choose a Saturday.', messageText: 'Message', sendMessage: 'Send message', noRecords: 'No records yet.', existingGroups: 'Existing groups', noGroups: 'No groups created yet.', edit: 'Edit', deleteAction: 'Delete', updateGroup: 'Update group', groupUpdated: 'Group updated.', groupDeleted: 'Group deleted.', cancelEdit: 'Cancel edit', confirmDeleteGroup: 'Delete this group? This cannot be undone.', sentOn: 'Sent', inbox: 'Inbox', sent: 'Sent', back: 'Back'
    ,createStudent: 'Create student record', studentCreated: 'Student created', requestedChild: 'Requested child', name: 'Full name', students: 'Students', teachers: 'Teachers', unreadMessages: 'Unread messages', unreadAssignments: 'Unread assignments', recipientType: 'Send to', everyone: 'Everyone', groupRecipient: 'Group', teacherRecipient: 'Teacher', parentRecipient: 'Parent', individualRecipient: 'Individual parent', recipient: 'Recipient', selectRecipient: 'Select recipient', messageSent: 'Message sent.'
    ,consentGuardian: 'I confirm that I am the parent or legal guardian of the child being registered.'
    ,consentTeacherRole: 'I confirm that I am a teacher or staff member of the Badr Mosque School.'
    ,consentData: "I consent to my child's name, attendance records, and homework data being stored by Badr Mosque School in Germany for educational administration purposes. I understand I may withdraw this consent at any time by contacting the school."
    ,consentTeacherData: 'I consent to my name and contact details being stored by Badr Mosque School in Germany for educational administration purposes. I understand I may withdraw this consent at any time.'
    ,consentPolicy: 'I have read and understood the Privacy Policy and agree to the Terms of Participation.'
    ,consentRequired: 'All three consent checkboxes are required to create an account.'
    ,privacyTitle: 'Privacy Policy — Datenschutzerklärung'
    ,privacyController: 'Data Controller'
    ,privacyControllerText: 'Badr Mosque Arabic School, Aschaffenburg, Germany. Contact: school administration via the Messages section of this app.'
    ,privacyDataCollected: 'Data Collected'
    ,privacyDataText: "We collect: full name of the child, date of registration, attendance records (present / absent / late per session), homework assignment records, and the parent or guardian's name and email address."
    ,privacyLegalBasis: 'Legal Basis (GDPR)'
    ,privacyLegalText: 'Processing is based on the explicit consent of the parent or legal guardian (GDPR Art. 6(1)(a) and Art. 8). Consent is provided at registration and may be withdrawn at any time without consequences.'
    ,privacyStorage: 'Data Storage'
    ,privacyStorageText: 'All data is stored in Google Firebase Firestore with the data centre located in Frankfurt, Germany (europe-west3 region). Data does not leave the European Union.'
    ,privacyRetention: 'Data Retention'
    ,privacyRetentionText: "Personal data is retained for the duration of the child's enrolment plus a maximum of 6 months after leaving the school. Upon request, data will be permanently deleted."
    ,privacyRights: 'Your Rights (GDPR Art. 15–20)'
    ,privacyRightsText: "You have the right to access, correct, delete, or export your data at any time. You may also withdraw consent without affecting your child's continued participation. Contact the school administration via the Messages section to exercise these rights."
    ,privacyThirdParty: 'Third Parties'
    ,privacyThirdPartyText: 'We use Google Firebase as our technical infrastructure provider (data processor). No data is sold, shared with advertisers, or disclosed to any third party. Google operates under a GDPR-compliant Data Processing Agreement with standard contractual clauses.'
    ,privacyComplaint: 'Right to Lodge a Complaint'
    ,privacyComplaintText: 'You have the right to complain to the Hessian Data Protection Authority (Hessischer Beauftragter für Datenschutz und Informationsfreiheit — HBDI): www.datenschutz.hessen.de · Gustav-Stresemann-Ring 1, 65189 Wiesbaden.'
    ,privacyLastUpdated: 'Last updated: September 2026'
  },
  de: {
    appTitle: 'Badr Moschee Schule',
    admin: 'Admin',
    teacher: 'Lehrer',
    parent: 'Eltern',
    dashboard: 'Dashboard',
    calendar: 'Kalender',
    messages: 'Nachrichten',
    attendance: 'Anwesenheit',
    assignments: 'Aufgaben',
    privacy: 'Datenschutzerklärung',
    login: 'Anmelden',
    logout: 'Abmelden',
    language: 'Sprache',
    offline: 'Offline bereit',
    welcome: 'Schulmanagement-Dashboard',
    pending: 'Genehmigung ausstehend',
    note: 'Diese App verwendet nur Firebase Firestore und hält Benachrichtigungen in der App.',
    loginHint: 'Melden Sie sich an, um Ihr Schuldashboard zu öffnen.',
    welcomeTitle: 'Willkommen bei der Badr Moschee Schule',
    welcomeText: 'Verwalten Sie Anwesenheit, Aufgaben, Nachrichten und Gruppen an einem Ort.',
    close: 'Schließen',
    signedInAs: 'Angemeldet als',
    selected: 'Ausgewählte Ansicht',
    open: 'Öffnen',
    email: 'E-Mail-Adresse',
    password: 'Passwort',
    signIn: 'Anmelden',
    createAccount: 'Konto erstellen',
    switchToSignup: 'Noch kein Konto? Registrieren',
    switchToLogin: 'Bereits registriert? Anmelden',
    authError: 'Anmeldung nicht möglich. Bitte Daten prüfen und erneut versuchen.', forgotPassword: 'Passwort vergessen?', passwordResetSent: 'E-Mail zum Zurücksetzen des Passworts wurde gesendet.',
    pendingNote: 'Ihr Konto wartet auf die Genehmigung durch die Verwaltung.'
    ,approvals: 'Genehmigungen', groups: 'Gruppen', pendingParents: 'Ausstehende Elternkonten', approve: 'Genehmigen', approved: 'Elternkonto genehmigt', approvalError: 'Konto konnte nicht aktualisiert werden.', approvalEmailFailed: 'Das Konto wurde genehmigt, aber die E-Mail-Benachrichtigung konnte nicht gesendet werden.', eventTitle: 'Veranstaltungstitel', eventDate: 'Veranstaltungsdatum', eventAudience: 'Zielgruppe', allSchool: 'Alle', createEvent: 'Veranstaltung erstellen', eventCreated: 'Veranstaltung erstellt.', group: 'Gruppe', studentId: 'Schüler-ID', studentName: 'Name des Schülers', assignmentTitle: 'Aufgabentitel', description: 'Beschreibung', dueDate: 'Fälligkeitsdatum', createAssignment: 'Aufgabe veröffentlichen', assignmentCreated: 'Aufgabe veröffentlicht', attendanceStatus: 'Status', present: 'Anwesend', absent: 'Abwesend', late: 'Verspätet', saveAttendance: 'Anwesenheit speichern', attendanceSaved: 'Anwesenheit gespeichert', loginButton: 'Anmelden', signupButton: 'Registrieren', chooseAccountType: 'Kontotyp auswählen', accountType: 'Kontotyp', signupNote: 'Alle neuen Konten benötigen eine Genehmigung.', accountCreated: 'Konto erstellt. Bitte warten Sie auf die Genehmigung.', groupId: 'Gruppen-ID', subject: 'Fach', level: 'Stufe', teacherUid: 'Lehrer-UID', studentIds: 'Schüler', schedule: 'Wochenplan', createGroup: 'Gruppe erstellen', groupCreated: 'Gruppe erstellt und zugewiesen.', attended: 'Anwesend', markAttendance: 'Samstagsanwesenheit erfassen', attendanceDate: 'Unterrichtsdatum', attendanceSummary: 'Anwesenheitsübersicht', attendanceRate: 'Anwesenheitsquote', viewHistory: 'Schülerverlauf anzeigen', history: 'Verlauf', noAttendanceData: 'Noch keine Anwesenheitsdaten.', saturdayOnly: 'Bitte wählen Sie einen Samstag.'
    ,createStudent: 'Schülerdatensatz erstellen', studentCreated: 'Schüler erstellt', requestedChild: 'Angefragtes Kind', name: 'Vollständiger Name', students: 'Schüler', teachers: 'Lehrer', unreadMessages: 'Ungelesene Nachrichten', unreadAssignments: 'Ungelesene Aufgaben', recipientType: 'Senden an', everyone: 'Alle', groupRecipient: 'Gruppe', teacherRecipient: 'Lehrer', parentRecipient: 'Elternteil', individualRecipient: 'Einzelnen Elternteil', recipient: 'Empfänger', selectRecipient: 'Empfänger auswählen', messageSent: 'Nachricht gesendet.', sendMessage: 'Nachricht senden', noRecords: 'Noch keine Einträge.', existingGroups: 'Bestehende Gruppen', noGroups: 'Noch keine Gruppen erstellt.', edit: 'Bearbeiten', deleteAction: 'Löschen', updateGroup: 'Gruppe aktualisieren', groupUpdated: 'Gruppe aktualisiert.', groupDeleted: 'Gruppe gelöscht.', cancelEdit: 'Bearbeitung abbrechen', confirmDeleteGroup: 'Diese Gruppe löschen? Dies kann nicht rückgängig gemacht werden.', sentOn: 'Gesendet', inbox: 'Posteingang', sent: 'Gesendet', back: 'Zurück'
    ,consentGuardian: 'Ich bestätige, dass ich der Elternteil oder Erziehungsberechtigte des anzumeldenden Kindes bin.'
    ,consentTeacherRole: 'Ich bestätige, dass ich ein Lehrer oder Mitarbeiter der Badr Moschee Schule bin.'
    ,consentData: 'Ich stimme zu, dass Name, Anwesenheitsaufzeichnungen und Hausaufgabendaten meines Kindes von der Badr Moschee Schule in Deutschland zu schulverwaltungszwecken gespeichert werden. Ich weiß, dass ich diese Einwilligung jederzeit widerrufen kann.'
    ,consentTeacherData: 'Ich stimme zu, dass mein Name und meine Kontaktdaten von der Badr Moschee Schule in Deutschland zu schulverwaltungszwecken gespeichert werden. Ich weiß, dass ich diese Einwilligung jederzeit widerrufen kann.'
    ,consentPolicy: 'Ich habe die Datenschutzerklärung gelesen und verstanden und stimme den Teilnahmebedingungen zu.'
    ,consentRequired: 'Alle drei Einwilligungskästchen müssen angekreuzt werden, um ein Konto zu erstellen.'
    ,privacyTitle: 'Datenschutzerklärung'
    ,privacyController: 'Verantwortlicher'
    ,privacyControllerText: 'Arabische Schule der Badr Moschee, Aschaffenburg, Deutschland. Kontakt: Schulverwaltung über den Nachrichtenbereich dieser App.'
    ,privacyDataCollected: 'Erhobene Daten'
    ,privacyDataText: 'Wir erheben: vollständiger Name des Kindes, Anmeldedatum, Anwesenheitsaufzeichnungen (anwesend / abwesend / verspätet je Unterrichtsstunde), Hausaufgabenaufzeichnungen sowie Name und E-Mail-Adresse des Elternteils oder Erziehungsberechtigten.'
    ,privacyLegalBasis: 'Rechtsgrundlage (DSGVO)'
    ,privacyLegalText: 'Die Verarbeitung erfolgt auf Grundlage der ausdrücklichen Einwilligung des Elternteils oder Erziehungsberechtigten (DSGVO Art. 6 Abs. 1 lit. a und Art. 8). Die Einwilligung wird bei der Anmeldung erteilt und kann jederzeit ohne Nachteile widerrufen werden.'
    ,privacyStorage: 'Datenspeicherung'
    ,privacyStorageText: 'Alle Daten werden in Google Firebase Firestore gespeichert. Das Rechenzentrum befindet sich in Frankfurt am Main, Deutschland (Region europe-west3). Die Daten verlassen nicht die Europäische Union.'
    ,privacyRetention: 'Aufbewahrungsdauer'
    ,privacyRetentionText: 'Personenbezogene Daten werden für die Dauer der Schulzugehörigkeit des Kindes sowie maximal 6 Monate nach dem Austritt aufbewahrt und anschließend dauerhaft gelöscht.'
    ,privacyRights: 'Ihre Rechte (DSGVO Art. 15–20)'
    ,privacyRightsText: 'Sie haben das Recht auf Auskunft, Berichtigung, Löschung oder Datenübertragbarkeit Ihrer Daten. Sie können Ihre Einwilligung jederzeit widerrufen, ohne dass dies die Schulzugehörigkeit Ihres Kindes beeinträchtigt. Wenden Sie sich dazu an die Schulverwaltung über den Nachrichtenbereich.'
    ,privacyThirdParty: 'Dritte'
    ,privacyThirdPartyText: 'Wir verwenden Google Firebase als technischen Infrastrukturanbieter (Auftragsverarbeiter). Keine Daten werden verkauft, an Werbetreibende weitergegeben oder an Dritte übermittelt. Google handelt auf Grundlage eines DSGVO-konformen Auftragsverarbeitungsvertrags mit Standardvertragsklauseln.'
    ,privacyComplaint: 'Beschwerderecht'
    ,privacyComplaintText: 'Sie haben das Recht, eine Beschwerde beim Hessischen Beauftragten für Datenschutz und Informationsfreiheit (HBDI) einzureichen: www.datenschutz.hessen.de · Gustav-Stresemann-Ring 1, 65189 Wiesbaden.'
    ,privacyLastUpdated: 'Zuletzt aktualisiert: September 2026'
  },
  ar: {
    appTitle: 'المدرسة العربية بمسجد بدر',
    admin: 'إدارة',
    teacher: 'معلم',
    parent: 'ولي أمر',
    dashboard: 'لوحة التحكم',
    calendar: 'التقويم',
    messages: 'الرسائل',
    attendance: 'الحضور',
    assignments: 'الواجبات',
    privacy: 'سياسة الخصوصية',
    login: 'تسجيل الدخول',
    logout: 'تسجيل الخروج',
    language: 'اللغة',
    offline: 'جاهز دون اتصال',
    welcome: 'لوحة إدارة المدرسة',
    pending: 'بانتظار الموافقة',
    note: 'يستخدم هذا التطبيق Firebase Firestore فقط مع إشعارات داخل التطبيق.',
    loginHint: 'سجل الدخول للوصول إلى لوحة المدرسة.',
    welcomeTitle: 'مرحباً بكم في المدرسة العربية بمسجد بدر',
    welcomeText: 'إدارة الحضور والواجبات والرسائل والمجموعات في مكان واحد.',
    close: 'إغلاق',
    signedInAs: 'تم تسجيل الدخول كـ',
    selected: 'العرض المحدد',
    open: 'فتح',
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    signIn: 'تسجيل الدخول',
    createAccount: 'إنشاء الحساب',
    switchToSignup: 'ليس لديك حساب؟ سجل الآن',
    switchToLogin: 'لديك حساب؟ سجل الدخول',
    authError: 'تعذر تسجيل الدخول. تحقق من البيانات وحاول مرة أخرى.', forgotPassword: 'نسيت كلمة المرور؟', passwordResetSent: 'تم إرسال رسالة إعادة تعيين كلمة المرور.',
    pendingNote: 'حسابك بانتظار موافقة الإدارة.'
    ,approvals: 'الموافقات', groups: 'المجموعات', pendingParents: 'حسابات أولياء الأمور المعلقة', approve: 'موافقة', approved: 'تمت الموافقة على الحساب', approvalError: 'تعذر تحديث الحساب.', approvalEmailFailed: 'تمت الموافقة على الحساب، ولكن تعذر إرسال إشعار البريد الإلكتروني.', eventTitle: 'عنوان الفعالية', eventDate: 'تاريخ الفعالية', eventAudience: 'الجمهور', allSchool: 'الجميع', createEvent: 'إنشاء فعالية', eventCreated: 'تم إنشاء الفعالية.', group: 'المجموعة', studentId: 'معرف الطالب', studentName: 'اسم الطالب', assignmentTitle: 'عنوان الواجب', description: 'الوصف', dueDate: 'تاريخ التسليم', createAssignment: 'نشر الواجب', assignmentCreated: 'تم نشر الواجب', attendanceStatus: 'الحالة', present: 'حاضر', absent: 'غائب', late: 'متأخر', saveAttendance: 'حفظ الحضور', attendanceSaved: 'تم حفظ الحضور', loginButton: 'تسجيل الدخول', signupButton: 'إنشاء حساب', chooseAccountType: 'اختر نوع الحساب', accountType: 'نوع الحساب', signupNote: 'تحتاج جميع الحسابات الجديدة إلى موافقة الإدارة.', accountCreated: 'تم إنشاء الحساب. يرجى انتظار موافقة الإدارة.', groupId: 'معرف المجموعة', subject: 'المادة', level: 'المستوى', teacherUid: 'معرف المعلم', studentIds: 'الطلاب', schedule: 'الجدول الأسبوعي', createGroup: 'إنشاء مجموعة', groupCreated: 'تم إنشاء المجموعة وتعيينها.', attended: 'حاضر', markAttendance: 'تسجيل حضور السبت', attendanceDate: 'تاريخ الحصة', attendanceSummary: 'ملخص الحضور', attendanceRate: 'نسبة الحضور', viewHistory: 'عرض سجل الطالب', history: 'السجل', noAttendanceData: 'لا توجد بيانات حضور بعد.', saturdayOnly: 'يرجى اختيار يوم السبت.'
    ,createStudent: 'إنشاء سجل طالب', studentCreated: 'تم إنشاء الطالب', requestedChild: 'الطفل المطلوب', name: 'الاسم الكامل', students: 'الطلاب', teachers: 'المعلمون', unreadMessages: 'الرسائل غير المقروءة', unreadAssignments: 'الواجبات غير المقروءة', recipientType: 'إرسال إلى', everyone: 'الجميع', groupRecipient: 'مجموعة', teacherRecipient: 'معلم', parentRecipient: 'ولي أمر', individualRecipient: 'ولي أمر محدد', recipient: 'المستلم', selectRecipient: 'اختر المستلم', messageSent: 'تم إرسال الرسالة.', sendMessage: 'إرسال الرسالة', noRecords: 'لا توجد سجلات بعد.', existingGroups: 'المجموعات الحالية', noGroups: 'لم يتم إنشاء أي مجموعات بعد.', edit: 'تعديل', deleteAction: 'حذف', updateGroup: 'تحديث المجموعة', groupUpdated: 'تم تحديث المجموعة.', groupDeleted: 'تم حذف المجموعة.', cancelEdit: 'إلغاء التعديل', confirmDeleteGroup: 'حذف هذه المجموعة؟ لا يمكن التراجع عن هذا.', sentOn: 'أُرسل في', inbox: 'الوارد', sent: 'المرسلة', back: 'رجوع'
    ,consentGuardian: 'أؤكد أنني ولي أمر الطفل المسجَّل أو أحد والديه.'
    ,consentTeacherRole: 'أؤكد أنني معلم أو موظف في المدرسة العربية بمسجد بدر.'
    ,consentData: 'أوافق على تخزين اسم طفلي وسجلات حضوره وبيانات واجباته المدرسية من قِبل المدرسة العربية بمسجد بدر في ألمانيا لأغراض الإدارة التعليمية. أفهم أن بإمكاني سحب هذه الموافقة في أي وقت عبر التواصل مع المدرسة.'
    ,consentTeacherData: 'أوافق على تخزين اسمي وبيانات الاتصال الخاصة بي من قِبل المدرسة العربية بمسجد بدر في ألمانيا لأغراض الإدارة التعليمية. أفهم أن بإمكاني سحب هذه الموافقة في أي وقت.'
    ,consentPolicy: 'لقد قرأت سياسة الخصوصية وفهمتها، وأوافق على شروط المشاركة.'
    ,consentRequired: 'يجب تحديد جميع خانات الموافقة الثلاث لإنشاء حساب.'
    ,privacyTitle: 'سياسة الخصوصية — Datenschutzerklärung'
    ,privacyController: 'المتحكم في البيانات'
    ,privacyControllerText: 'المدرسة العربية بمسجد بدر، أشافنبورغ، ألمانيا. للتواصل: إدارة المدرسة عبر قسم الرسائل في هذا التطبيق.'
    ,privacyDataCollected: 'البيانات المجمَّعة'
    ,privacyDataText: 'نجمع: الاسم الكامل للطفل، وتاريخ التسجيل، وسجلات الحضور (حاضر / غائب / متأخر لكل حصة)، وسجلات الواجبات، واسم ولي الأمر وعنوان بريده الإلكتروني.'
    ,privacyLegalBasis: 'الأساس القانوني (اللائحة الأوروبية GDPR)'
    ,privacyLegalText: 'تستند المعالجة إلى الموافقة الصريحة من ولي الأمر (المادة 6(1)(أ) و8 من لائحة GDPR). تُمنح الموافقة عند التسجيل ويمكن سحبها في أي وقت دون أي عواقب.'
    ,privacyStorage: 'تخزين البيانات'
    ,privacyStorageText: 'تُخزَّن جميع البيانات في Google Firebase Firestore في مركز البيانات المقع في فرانكفورت، ألمانيا (منطقة europe-west3). لا تغادر البيانات الاتحاد الأوروبي.'
    ,privacyRetention: 'مدة الاحتفاظ بالبيانات'
    ,privacyRetentionText: 'تُحتفظ بالبيانات الشخصية طوال فترة التحاق الطفل بالمدرسة وحتى 6 أشهر بعد مغادرته، ثم تُحذف نهائياً عند الطلب أو تلقائياً.'
    ,privacyRights: 'حقوقك (المواد 15–20 من GDPR)'
    ,privacyRightsText: 'يحق لك الاطلاع على بياناتك وتصحيحها وحذفها أو نقلها في أي وقت. يمكنك سحب موافقتك دون التأثير على مشاركة طفلك. تواصل مع إدارة المدرسة عبر قسم الرسائل لممارسة هذه الحقوق.'
    ,privacyThirdParty: 'الأطراف الثالثة'
    ,privacyThirdPartyText: 'نستخدم Google Firebase كمزود تقني للبنية التحتية (معالج البيانات). لا تُباع أي بيانات ولا تُشارك مع المعلنين أو أي طرف ثالث. تعمل Google بموجب اتفاقية معالجة بيانات متوافقة مع لائحة GDPR.'
    ,privacyComplaint: 'حق تقديم شكوى'
    ,privacyComplaintText: 'يحق لك تقديم شكوى إلى مفوض حماية البيانات في ولاية هيسن (Hessischer Beauftragter für Datenschutz und Informationsfreiheit — HBDI): www.datenschutz.hessen.de · Gustav-Stresemann-Ring 1, 65189 Wiesbaden.'
    ,privacyLastUpdated: 'آخر تحديث: سبتمبر 2026'
  }
};

function App() {
  const [locale, setLocale] = useState<Locale>('en');
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>('parent');
  const [activeSection, setActiveSection] = useState<Section>('dashboard');
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [signupRole, setSignupRole] = useState<Role>('parent');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signupStudentName, setSignupStudentName] = useState('');
  const [authError, setAuthError] = useState('');
  const [passwordResetMessage, setPasswordResetMessage] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [consentGuardian, setConsentGuardian] = useState(false);
  const [consentData, setConsentData] = useState(false);
  const [consentPolicy, setConsentPolicy] = useState(false);
  const [profileStatus, setProfileStatus] = useState<'pending' | 'active' | null>(null);
  const [profileName, setProfileName] = useState('');
  const [pendingParents, setPendingParents] = useState<Array<{ id: string; email: string; name: string; role: Role; childId: string; requestedChildName: string; language: Locale }>>([]);
  const [approvalMessage, setApprovalMessage] = useState('');
  const [linkedChildIds, setLinkedChildIds] = useState<string[]>([]);
  const [assignedGroupIds, setAssignedGroupIds] = useState<string[]>([]);
  const [liveItems, setLiveItems] = useState<Partial<Record<Section, LiveItem[]>>>({});
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventMessage, setEventMessage] = useState('');
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [assignmentDescription, setAssignmentDescription] = useState('');
  const [assignmentDueDate, setAssignmentDueDate] = useState('');
  const [assignmentGroupId, setAssignmentGroupId] = useState('');
  const [attendanceDate, setAttendanceDate] = useState('');
  const [attendanceGroupId, setAttendanceGroupId] = useState('');
  const [attendanceStudents, setAttendanceStudents] = useState<AttendanceStudent[]>([]);
  const [attendanceGroupStudentCount, setAttendanceGroupStudentCount] = useState(0);
  const [attendedStudentIds, setAttendedStudentIds] = useState<string[]>([]);
  const [lateStudentIds, setLateStudentIds] = useState<string[]>([]);
  const [groupAttendance, setGroupAttendance] = useState<GroupAttendance[]>([]);
  const [parentAttendance, setParentAttendance] = useState<ParentAttendanceEntry[]>([]);
  const [attendanceViewGroupId, setAttendanceViewGroupId] = useState<string | null>(null);
  const [attendanceViewDate, setAttendanceViewDate] = useState<string | null>(null);
  const [messageRecords, setMessageRecords] = useState<MessageRecord[]>([]);
  const [teacherMessage, setTeacherMessage] = useState('');
  const [recipientType, setRecipientType] = useState<'everyone' | 'group' | 'teacher' | 'parent' | 'individual' | 'admin'>('teacher');
  const [recipientUid, setRecipientUid] = useState('');
  const [recipientGroupId, setRecipientGroupId] = useState('');
  const [messageText, setMessageText] = useState('');
  const [messageStatus, setMessageStatus] = useState('');
  const [groupId, setGroupId] = useState('');
  const [groupSubject, setGroupSubject] = useState('Quran');
  const [groupLevel, setGroupLevel] = useState('Preparatory');
  const [groupTeacherUid, setGroupTeacherUid] = useState('');
  const [groupStudentIds, setGroupStudentIds] = useState<string[]>([]);
  const [groupSchedule, setGroupSchedule] = useState('');
  const [groupMessage, setGroupMessage] = useState('');
  const [newStudentName, setNewStudentName] = useState('');
  const [availableTeachers, setAvailableTeachers] = useState<DirectoryUser[]>([]);
  const [availableStudents, setAvailableStudents] = useState<DirectoryStudent[]>([]);
  const [availableUsers, setAvailableUsers] = useState<DirectoryUser[]>([]);
  const [availableGroups, setAvailableGroups] = useState<Array<{ id: string; name: string; studentIds: string[] }>>([]);
  const [dashboardCounts, setDashboardCounts] = useState({ students: 0, teachers: 0, groups: 0, unreadMessages: 0, unreadAssignments: 0 });
  const [manageableGroups, setManageableGroups] = useState<Array<{ id: string; subject: string; level: string; teacherId: string; teacherName: string; studentIds: string[]; studentNames: string[]; schedule: string }>>([]);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  useEffect(() => {
    const savedLocale = (localStorage.getItem('badr-school-locale') as Locale) || 'en';
    setLocale(savedLocale in translations ? savedLocale : 'en');

    const updateSW = registerSW();

    return () => updateSW && updateSW();
  }, []);

  useEffect(() => {
    if (!user || profileStatus !== 'active') return;
    let cancelled = false;

    const loadDashboardData = async () => {
      try {
        // NOTE: recipient/messaging directory data now comes from the
        // `directory` collection (name + role only), not from a `users`
        // query. Firestore evaluates a *query* against the whole possible
        // result set, and firestore.rules only allows a non-admin to read
        // users/{uid} for their own uid — so `where('status','==','active')`
        // on `users` was silently denied for teachers/parents, leaving
        // availableUsers empty and every non-admin recipient dropdown blank.
        const [directorySnapshot, groupSnapshot, studentSnapshot, messageSnapshot] = await Promise.all([
          getDocs(collection(db, 'directory')).catch(() => ({ docs: [] })),
          role === 'admin' ? getDocs(collection(db, 'groups')).catch(() => ({ docs: [] })) : Promise.all(assignedGroupIds.map((groupId) => getDoc(doc(db, 'groups', groupId)).catch(() => null))),
          role === 'admin'
            ? getDocs(collection(db, 'students')).then((snapshot) => snapshot.docs).catch(() => [])
            : role === 'parent'
              ? getExistingDocs('students', linkedChildIds).catch(() => [])
              : Promise.resolve([]),
          getDocs(query(collection(db, 'messages'), where('participants', 'array-contains', user.uid))).catch(() => ({ docs: [] })),
        ]);
        if (cancelled) return;

        const users = directorySnapshot.docs.map((item) => ({
          id: item.id,
          name: item.data().name || item.id,
          email: '',
          role: item.data().role as Role
        }));
        const groupDocs = Array.isArray(groupSnapshot) ? groupSnapshot.filter((item) => item && item.exists()) : groupSnapshot.docs;
        const groups: DirectoryGroup[] = groupDocs.map((item) => ({
          id: item!.id,
          name: `${item!.data()?.subject || 'Group'} · ${item!.data()?.level || ''}`,
          studentIds: item!.data()?.studentIds || []
        }));
        const parentGroups = new Map<string, DirectoryGroup>();
        if (role === 'parent' && Array.isArray(studentSnapshot)) {
          studentSnapshot.filter((item) => item.exists()).forEach((item) => {
            (item.data()?.groupMemberships || []).forEach((membership: { groupId: string; subject?: string; level?: string }) => {
              const current = parentGroups.get(membership.groupId) || { id: membership.groupId, name: `${membership.subject || 'Group'} · ${membership.level || ''}`, studentIds: [] };
              parentGroups.set(membership.groupId, { ...current, studentIds: [...new Set([...current.studentIds, item.id])] });
            });
          });
        }
        const accessibleGroups: DirectoryGroup[] = role === 'teacher'
          ? groups.filter((group) => assignedGroupIds.includes(group.id))
          : role === 'parent' ? [...parentGroups.values()] : groups;
        let studentDocs = Array.isArray(studentSnapshot) ? studentSnapshot.filter((item) => item.exists()) : [];
        if (role === 'teacher') {
          const studentIds = [...new Set(accessibleGroups.flatMap((group) => group.studentIds))];
          studentDocs = await getExistingDocs('students', studentIds);
        }
        const directoryStudents = studentDocs.map((item) => ({ id: item.id, name: item.data()?.name || item.id, parentIds: item.data()?.parentIds || [] }));
        setAvailableStudents(directoryStudents);
        const accessibleStudentIds = role === 'parent'
          ? linkedChildIds
          : role === 'teacher'
            ? [...new Set(accessibleGroups.flatMap((group) => group.studentIds))]
            : directoryStudents.map((item) => item.id);
        const assignmentSnapshots = role === 'admin'
          ? [await getDocs(collection(db, 'assignments'))]
          : await Promise.all(accessibleGroups.map((group) => getDocs(query(collection(db, 'assignments'), where('groupId', '==', group.id)))));
        const accessibleAssignments = assignmentSnapshots.flatMap((snapshot) => snapshot.docs).filter((item) => {
          const data = item.data();
          return role === 'admin' || (role === 'teacher' ? assignedGroupIds.includes(data.groupId) : accessibleStudentIds.includes(data.studentId) || accessibleGroups.some((group) => group.id === data.groupId));
        });

        setDashboardCounts({
          students: role === 'parent' ? linkedChildIds.length : accessibleStudentIds.length,
          teachers: users.filter((item) => item.role === 'teacher').length,
          groups: accessibleGroups.length,
          unreadMessages: messageSnapshot.docs.filter((item) => item.data().unreadFor?.includes(user.uid) || (item.data().unread === true && item.data().senderId !== user.uid)).length,
          unreadAssignments: accessibleAssignments.filter((item) => item.data().unread === true).length
        });
        setAvailableUsers(users.filter((item) => item.id !== user.uid && item.role));
        setAvailableGroups(accessibleGroups);
      } catch {
        if (!cancelled) setDashboardCounts({ students: 0, teachers: 0, groups: 0, unreadMessages: 0, unreadAssignments: 0 });
      }
    };

    void loadDashboardData();
    return () => { cancelled = true; };
  }, [assignedGroupIds, linkedChildIds, profileStatus, role, user]);

  const handleAuthentication = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError('');

    // Consent is required for new account creation
    if (authMode === 'signup' && (!consentGuardian || !consentData || !consentPolicy)) {
      setAuthError(t.consentRequired);
      return;
    }

    setIsAuthenticating(true);
    let createdUser: User | null = null;

    try {
      if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        // Every self-signup remains pending until an admin approves it.
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        createdUser = credential.user;
        await setDoc(doc(db, 'users', credential.user.uid), {
          uid: credential.user.uid,
          email,
          name: signupName.trim(),
          role: signupRole,
          status: 'pending',
          language: locale,
          consentGiven: true,
          consentDate: new Date().toISOString(),
          ...(signupRole === 'parent' ? { linkedChildIds: [], requestedChildName: signupStudentName.trim() } : {}),
          ...(signupRole === 'teacher' ? { assignedGroupIds: [] } : {}),
          createdAt: new Date().toISOString()
        });
        await queueEmailNotification({
          type: 'new-registration',
          user: credential.user,
          db,
          actorRole: signupRole
        });
      }
      setEmail('');
      setPassword('');
      setSignupName('');
      setSignupStudentName('');
      setSignupRole('parent');
      setConsentGuardian(false);
      setConsentData(false);
      setConsentPolicy(false);
      setAuthMode('login');
      if (authMode === 'signup') setAuthError(t.accountCreated);
      setIsLoginOpen(false);
    } catch (error) {
      if (createdUser) {
        try {
          await deleteUser(createdUser);
        } catch {
          // The original Firebase error is more useful than a cleanup failure.
        }
      }
      const firebaseError = error as { code?: string };
      setAuthError(firebaseError.code ? `${t.authError} (${firebaseError.code})` : t.authError);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const signOut = () => {
    setUser(null);
    void auth.signOut();
  };

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
    document.title = translations[locale].appTitle;
    localStorage.setItem('badr-school-locale', locale);
  }, [locale]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setProfileStatus(null);
        return;
      }

      void getDoc(doc(db, 'users', currentUser.uid)).then(async (profileSnapshot) => {
        const profile = profileSnapshot.data();
        const nextRole = profile?.role || (currentUser.email?.includes('teacher') ? 'teacher' : currentUser.email?.includes('admin') ? 'admin' : 'parent');
        setRole(nextRole as Role);
        setProfileStatus(profile?.status === 'active' ? 'active' : 'pending');
        setProfileName(profile?.name || '');
        setLinkedChildIds(profile?.linkedChildIds || []);
        setAssignedGroupIds(profile?.assignedGroupIds || []);

        if (nextRole === 'admin') {
          const pendingSnapshot = await getDocs(query(collection(db, 'users'), where('status', '==', 'pending')));
          setPendingParents(pendingSnapshot.docs.map((pendingDoc) => ({
            id: pendingDoc.id,
            email: pendingDoc.data().email || '',
            name: pendingDoc.data().name || pendingDoc.data().email || 'Parent',
            role: pendingDoc.data().role || 'parent',
            childId: '',
            requestedChildName: pendingDoc.data().requestedChildName || '',
            language: (pendingDoc.data().language || 'en') as Locale
          })));
          const [teacherSnapshot, studentSnapshot] = await Promise.all([
            getDocs(query(collection(db, 'users'), where('role', '==', 'teacher'), where('status', '==', 'active'))),
            getDocs(collection(db, 'students'))
          ]);
          setAvailableTeachers(teacherSnapshot.docs.map((teacherDoc) => ({
            id: teacherDoc.id,
            name: teacherDoc.data().name || teacherDoc.data().email || teacherDoc.id,
            email: teacherDoc.data().email || ''
          })));
          setAvailableStudents(studentSnapshot.docs.map((studentDoc) => ({
            id: studentDoc.id,
            name: studentDoc.data().name || studentDoc.id
          })));
        }
      }).catch(() => setProfileStatus('pending'));
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || profileStatus !== 'active' || activeSection === 'dashboard' || activeSection === 'approvals') return;

    let cancelled = false;
    const loadSection = async () => {
      setIsLoadingData(true);
      try {
        let snapshots;
        if (activeSection === 'calendar') {
          snapshots = [await getDocs(collection(db, 'calendarEvents'))];
        } else if (activeSection === 'messages') {
          snapshots = [await getDocs(query(collection(db, 'messages'), where('participants', 'array-contains', user.uid)))];
        } else {
          const collectionName = activeSection === 'assignments' ? 'assignments' : 'attendance';
          let identifiers = role === 'parent' ? linkedChildIds : assignedGroupIds;
          let field = role === 'parent' ? 'studentId' : 'groupId';
          if (role === 'parent' && activeSection === 'assignments') {
            const childSnapshots = await getExistingDocs('students', linkedChildIds);
            identifiers = [...new Set(childSnapshots.flatMap((snapshot) => (snapshot.data()?.groupMemberships || []).map((membership: { groupId: string }) => membership.groupId)))];
            field = 'groupId';
          }
          snapshots = role === 'admin'
            ? [await getDocs(collection(db, collectionName))]
            : identifiers.length === 0
            ? []
            : await Promise.all(identifiers.map((identifier) => {
              return getDocs(query(collection(db, collectionName), where(field, '==', identifier)));
            }));
        }

        if (cancelled) return;
        const sentLabel = translations[locale].sentOn;
        if (activeSection === 'messages') {
          const records = snapshots.flatMap((snapshot) => snapshot.docs.map((item) => {
            const data = item.data();
            return {
              id: item.id,
              senderId: data.senderId || '',
              senderName: data.senderName || data.senderId || 'User',
              text: data.text || data.body || '',
              createdAt: data.createdAt || '',
              sentAt: data.createdAt ? new Date(data.createdAt).toLocaleString(locale) : ''
            };
          })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          setMessageRecords(records);
        }
        // Assignments now surface who posted them and which group they
        // belong to. `data.teacherId` matches the signed-in user for a
        // teacher viewing their own post; otherwise it's resolved against
        // availableUsers (populated from the `directory` collection),
        // falling back to the raw id if the directory entry is missing.
        const items = snapshots.flatMap((snapshot) => snapshot.docs.map((item) => {
          const data = item.data();
          const sentAt = data.createdAt ? new Date(data.createdAt).toLocaleString(locale) : '';
          const text = activeSection === 'calendar'
            ? `${data.title || 'Calendar event'} · ${data.startDate || data.date || ''}`
            : activeSection === 'messages'
              ? `${data.senderName || data.senderId || 'Message'} · ${data.text || data.body || ''}${sentAt ? ` · ${sentLabel} ${sentAt}` : ''}`
              : activeSection === 'assignments'
                ? (() => {
                    const groupName = availableGroups.find((group) => group.id === data.groupId)?.name || data.groupId || translations[locale].group;
                    const teacherName = data.teacherId === user.uid
                      ? (profileName || user.email || data.teacherId)
                      : (availableUsers.find((candidate) => candidate.id === data.teacherId)?.name || data.teacherId || translations[locale].teacher);
                    return `${data.title || 'Assignment'} · ${teacherName} · ${groupName} · ${data.description || ''} · Due ${data.dueDate || 'date not set'}${sentAt ? ` · ${sentLabel} ${sentAt}` : ''}`;
                  })()
                : `${data.date || 'Attendance'} · ${data.status || data.attendanceStatus || 'recorded'}`;
          return { id: item.id, text };
        }));
        setLiveItems((current) => ({ ...current, [activeSection]: items }));
      } catch {
        if (!cancelled) setLiveItems((current) => ({ ...current, [activeSection]: [] }));
      } finally {
        if (!cancelled) setIsLoadingData(false);
      }
    };

    void loadSection();
    return () => { cancelled = true; };
  }, [activeSection, assignedGroupIds, availableGroups, availableUsers, linkedChildIds, locale, profileName, profileStatus, role, user]);

  const loadGroupsList = useCallback(async () => {
    const [groupSnapshot, studentSnapshot] = await Promise.all([
      getDocs(collection(db, 'groups')),
      getDocs(collection(db, 'students'))
    ]);
    const studentNameById = new Map(studentSnapshot.docs.map((item) => [item.id, item.data().name || item.id]));
    setAvailableStudents(studentSnapshot.docs.map((studentDoc) => ({ id: studentDoc.id, name: studentDoc.data().name || studentDoc.id })));
    setManageableGroups(groupSnapshot.docs.map((item) => {
      const data = item.data();
      const studentIds: string[] = data.studentIds || [];
      return {
        id: item.id,
        subject: data.subject || '',
        level: data.level || '',
        teacherId: data.teacherId || '',
        teacherName: availableTeachers.find((teacher) => teacher.id === data.teacherId)?.name || data.teacherId || '',
        studentIds,
        studentNames: studentIds.map((studentId) => studentNameById.get(studentId) || studentId),
        schedule: data.weeklySchedule || ''
      };
    }));
  }, [availableTeachers]);

  useEffect(() => {
    if (!user || role !== 'admin' || profileStatus !== 'active' || activeSection !== 'groups') return;
    void loadGroupsList().catch(() => setGroupMessage('Students could not be loaded. Check that Firestore rules are deployed.'));
  }, [activeSection, loadGroupsList, profileStatus, role, user]);

  useEffect(() => {
    if (!user || profileStatus !== 'active' || activeSection !== 'attendance') return;
    let cancelled = false;
    if (role === 'teacher' && attendanceGroupId) {
      setAttendanceStudents([]);
      setAttendanceGroupStudentCount(0);
      setAttendedStudentIds([]);
      setLateStudentIds([]);
      void getDoc(doc(db, 'groups', attendanceGroupId)).then(async (groupSnapshot) => {
        const studentIds = groupSnapshot.data()?.studentIds || [];
        if (cancelled) return;
        setAttendanceGroupStudentCount(studentIds.length);
        const studentDocs = await getExistingDocs('students', studentIds);
        if (cancelled) return;
        setAttendanceStudents(studentDocs.map((snapshot) => ({
          id: snapshot.id,
          name: snapshot.data()?.name || snapshot.id
        })));
      }).catch(() => { if (!cancelled) setAttendanceStudents([]); });
    }

    if (role === 'admin') {
      void Promise.all([
        getDocs(collection(db, 'groups')),
        getDocs(collection(db, 'students')),
        getDocs(collection(db, 'attendance'))
      ]).then(([groupSnapshot, studentSnapshot, attendanceSnapshot]) => {
        if (cancelled) return;
        const studentNameById = new Map(studentSnapshot.docs.map((snapshot) => [snapshot.id, snapshot.data().name || snapshot.id]));
        const groups = groupSnapshot.docs.map((item) => ({ id: item.id, name: `${item.data().subject || 'Group'} · ${item.data().level || ''}` }));
        const records = attendanceSnapshot.docs.map((snapshot) => snapshot.data());
        setGroupAttendance(buildGroupAttendance(groups, records, studentNameById));
      }).catch(() => { if (!cancelled) setGroupAttendance([]); });
    }

    if (role === 'teacher') {
      // Built self-contained from assignedGroupIds (like the parent branch below),
      // rather than depending on the separately-timed availableGroups state, which
      // can still be empty the first time this effect runs and would silently
      // drop all fetched attendance records.
      void Promise.all(assignedGroupIds.map((groupId) => getDoc(doc(db, 'groups', groupId))))
        .then(async (groupDocs) => {
          if (cancelled) return;
          const groups = groupDocs.filter((snapshot) => snapshot.exists()).map((snapshot) => ({
            id: snapshot.id,
            name: `${snapshot.data()?.subject || 'Group'} · ${snapshot.data()?.level || ''}`
          }));
          const attendanceSnapshots = await Promise.all(
            assignedGroupIds.map((groupId) => getDocs(query(collection(db, 'attendance'), where('groupId', '==', groupId))))
          );
          if (cancelled) return;
          const studentNameById = new Map(availableStudents.map((student) => [student.id, student.name]));
          const records = attendanceSnapshots.flatMap((snapshot) => snapshot.docs.map((item) => item.data()));
          setGroupAttendance(buildGroupAttendance(groups, records, studentNameById));
        }).catch(() => { if (!cancelled) setGroupAttendance([]); });
    }

    if (role === 'parent') {
      void Promise.all(linkedChildIds.map((studentId) => getDocs(query(collection(db, 'attendance'), where('studentId', '==', studentId)))))
        .then((snapshots) => {
          if (cancelled) return;
          const studentNameById = new Map(availableStudents.map((student) => [student.id, student.name]));
          setParentAttendance(linkedChildIds.map((studentId, index) => ({
            studentId,
            studentName: studentNameById.get(studentId) || studentId,
            days: snapshots[index].docs
              .map((item) => item.data())
              .map((record) => ({ date: record.date || '', status: record.status || 'absent' }))
              .sort((a, b) => b.date.localeCompare(a.date))
          })));
        }).catch(() => { if (!cancelled) setParentAttendance([]); });
    }
    return () => { cancelled = true; };
  }, [activeSection, assignedGroupIds, attendanceGroupId, availableStudents, linkedChildIds, profileStatus, role, user]);

  useEffect(() => {
    if (activeSection !== 'attendance') {
      setAttendanceViewGroupId(null);
      setAttendanceViewDate(null);
    }
  }, [activeSection]);

  const approveParent = async (parentId: string, accountRole: Role, childId: string) => {
    try {
      if (accountRole === 'parent' && childId.trim()) {
        await updateDoc(doc(db, 'students', childId.trim()), { parentIds: arrayUnion(parentId) });
      }
      await updateDoc(doc(db, 'users', parentId), {
        status: 'active',
        ...(accountRole === 'parent' ? { linkedChildIds: childId.trim() ? [childId.trim()] : [] } : {})
      });
      // Mirror the minimal, non-sensitive fields into the public `directory`
      // collection so this account shows up in every other role's message
      // recipient dropdown (see firestore.rules: users/{uid} stays
      // owner/admin-only, directory/{uid} is readable by any signed-in user).
      const approvedParent = pendingParents.find((parent) => parent.id === parentId);
      const approvedAccount = pendingParents.find((parent) => parent.id === parentId);
      await setDoc(doc(db, 'directory', parentId), {
        name: approvedParent?.name || approvedParent?.email || parentId,
        role: accountRole
      });

      if (approvedAccount?.email) {
        try {
          await queueEmailNotification({
            type: accountRole === 'teacher' ? 'teacher-approved' : 'parent-approved',
            user,
            db,
            targetUserId: parentId,
            actorRole: accountRole
          });
        } catch {
          // Approval remains successful if notification queueing is temporarily unavailable.
        }
      }

      setPendingParents((parents) => parents.filter((parent) => parent.id !== parentId));
      setApprovalMessage(emailWarning ? `${t.approved} ${t.approvalEmailFailed}` : t.approved);
    } catch {
      setApprovalMessage(t.approvalError);
    }
  };

  const createStudentFromRequest = async (parent: { id: string; name: string; requestedChildName: string }) => {
    const studentName = parent.requestedChildName.trim();
    if (!user || role !== 'admin' || !studentName) return;
    try {
      const studentReference = await addDoc(collection(db, 'students'), {
        name: studentName,
        parentIds: [parent.id],
        groupMemberships: [],
        groupIds: [],
        createdAt: new Date().toISOString()
      });
      setAvailableStudents((students) => [...students, { id: studentReference.id, name: studentName }]);
      setPendingParents((parents) => parents.map((item) => item.id === parent.id ? { ...item, childId: studentReference.id } : item));
      setApprovalMessage(t.studentCreated);
    } catch {
      setApprovalMessage(t.approvalError);
    }
  };

  const createStudent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || role !== 'admin' || !newStudentName.trim()) return;
    try {
      const normalizedName = newStudentName.trim().toLowerCase();
      const matchingParents = pendingParents.filter((parent) => parent.role === 'parent' && parent.requestedChildName.trim().toLowerCase() === normalizedName);
      const studentReference = await addDoc(collection(db, 'students'), {
        name: newStudentName.trim(),
        parentIds: matchingParents.map((parent) => parent.id),
        groupMemberships: [],
        groupIds: [],
        createdAt: new Date().toISOString()
      });
      setAvailableStudents((students) => [...students, { id: studentReference.id, name: newStudentName.trim() }]);
      if (matchingParents.length > 0) {
        setPendingParents((parents) => parents.map((parent) => matchingParents.some((match) => match.id === parent.id) ? { ...parent, childId: studentReference.id } : parent));
      }
      setNewStudentName('');
      setGroupMessage(t.studentCreated);
    } catch {
      setGroupMessage(t.approvalError);
    }
  };

  const createCalendarEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || role !== 'admin' || !eventTitle.trim() || !eventDate) return;
    try {
      await addDoc(collection(db, 'calendarEvents'), {
        title: eventTitle.trim(),
        date: eventDate,
        audience: 'all',
        createdBy: user.uid,
        createdAt: new Date().toISOString()
      });
      const createdEvent = await addDoc(collection(db, 'calendarEvents'), {
        title: eventTitle.trim(),
        date: eventDate,
        audience: 'all',
        createdBy: user.uid,
        createdAt: new Date().toISOString()
      });
      await queueEmailNotification({ type: 'calendar-announcement', user, db, eventId: createdEvent.id });
      setEventTitle('');
      setEventDate('');
      setEventMessage(t.eventCreated);
      setLiveItems((current) => ({ ...current, calendar: undefined }));
      setActiveSection('dashboard');
      setTimeout(() => setActiveSection('calendar'), 0);
    } catch {
      setEventMessage(t.approvalError);
    }
  };

  const createAssignment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || role !== 'teacher' || !assignmentGroupId || !assignmentTitle.trim()) return;
    try {
      const createdAssignment = await addDoc(collection(db, 'assignments'), {
        groupId: assignmentGroupId,
        teacherId: user.uid,
        title: assignmentTitle.trim(),
        description: assignmentDescription.trim(),
        dueDate: assignmentDueDate,
        unread: true,
        createdAt: new Date().toISOString()
      });
      const assignmentGroup = availableGroups.find((group) => group.id === assignmentGroupId);
      for (const student of availableStudents.filter((item) => assignmentGroup?.studentIds.includes(item.id))) {
        for (const parentId of student.parentIds || []) {
          await queueEmailNotification({
            type: 'assignment-parent',
            user,
            db,
            targetUserId: parentId,
            assignmentId: createdAssignment.id,
            studentId: student.id,
            groupId: assignmentGroupId
          });
        }
      }
      setAssignmentTitle('');
      setAssignmentDescription('');
      setAssignmentDueDate('');
      setTeacherMessage(t.assignmentCreated);
      setLiveItems((current) => ({ ...current, assignments: undefined }));
      setActiveSection('dashboard');
      setTimeout(() => setActiveSection('assignments'), 0);
    } catch {
      setTeacherMessage(t.approvalError);
    }
  };

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || profileStatus !== 'active' || !messageText.trim()) return;
    try {
      let recipientIds: string[] = [];
      if (recipientType === 'everyone') recipientIds = availableUsers.map((item) => item.id);
      if (recipientType === 'teacher' || recipientType === 'parent' || recipientType === 'individual' || recipientType === 'admin') recipientIds = recipientUid ? [recipientUid] : [];
      if (recipientType === 'group' && recipientGroupId) {
        const group = availableGroups.find((item) => item.id === recipientGroupId);
        const parentIds = availableStudents.filter((student) => group?.studentIds.includes(student.id)).flatMap((student) => student.parentIds || []);
        recipientIds = role === 'admin' ? [...new Set([...parentIds, ...availableUsers.filter((item) => item.role === 'teacher').map((item) => item.id)])] : parentIds;
      }
      if (recipientIds.length === 0) return;
      for (const recipientId of [...new Set(recipientIds)]) {
        const messageSnapshot = await addDoc(collection(db, 'messages'), {
          participants: [user.uid, recipientId],
          senderId: user.uid,
          senderName: profileName || user.email || 'User',
          text: messageText.trim(),
          unread: true,
          unreadFor: [recipientId],
          createdAt: new Date().toISOString()
        });
        await queueEmailNotification({ type: 'message', user, db, targetUserId: recipientId, messageId: messageSnapshot.id });
      }

      setMessageText('');
      setMessageStatus(t.messageSent);
      setLiveItems((current) => ({ ...current, messages: undefined }));
    } catch {
      setMessageStatus(t.approvalError);
    }
  };

  const saveAttendance = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || role !== 'teacher' || !attendanceGroupId || !attendanceDate || attendanceStudents.length === 0) return;
    if (new Date(`${attendanceDate}T12:00:00`).getDay() !== 6) {
      setTeacherMessage(t.saturdayOnly);
      return;
    }
    try {
      await Promise.all(attendanceStudents.map((student) => addDoc(collection(db, 'attendance'), {
        groupId: attendanceGroupId,
        studentId: student.id,
        date: attendanceDate,
        status: lateStudentIds.includes(student.id) ? 'late' : attendedStudentIds.includes(student.id) ? 'present' : 'absent',
        teacherId: user.uid,
        createdAt: new Date().toISOString()
      })));
      setTeacherMessage(t.attendanceSaved);
      setAttendedStudentIds([]);
      setLateStudentIds([]);
      setLiveItems((current) => ({ ...current, attendance: undefined }));
      setActiveSection('dashboard');
      setTimeout(() => setActiveSection('attendance'), 0);
    } catch {
      setTeacherMessage(t.approvalError);
    }
  };

  const resetGroupForm = () => {
    setEditingGroupId(null);
    setGroupId('');
    setGroupSubject('Quran');
    setGroupLevel('Preparatory');
    setGroupTeacherUid('');
    setGroupStudentIds([]);
    setGroupSchedule('');
  };

  const startEditGroup = (group: { id: string; subject: string; level: string; teacherId: string; studentIds: string[]; schedule: string }) => {
    setEditingGroupId(group.id);
    setGroupId(group.id);
    setGroupSubject(group.subject || 'Quran');
    setGroupLevel(group.level || 'Preparatory');
    setGroupTeacherUid(group.teacherId);
    setGroupStudentIds(group.studentIds);
    setGroupSchedule(group.schedule);
    setGroupMessage('');
  };

  // Rewrites each affected student's groupMemberships from scratch so add/remove/relabel
  // stay consistent without relying on exact-match arrayUnion/arrayRemove semantics.
  const syncStudentGroupMemberships = async (targetGroupId: string, nextStudentIds: string[], previousStudentIds: string[] = []) => {
    const affectedIds = [...new Set([...previousStudentIds, ...nextStudentIds])];
    await Promise.all(affectedIds.map(async (studentId) => {
      const studentSnapshot = await getDoc(doc(db, 'students', studentId));
      const memberships = (studentSnapshot.data()?.groupMemberships || []).filter((gm: { groupId: string }) => gm.groupId !== targetGroupId);
      if (nextStudentIds.includes(studentId)) memberships.push({ groupId: targetGroupId, subject: groupSubject, level: groupLevel });
      await updateDoc(doc(db, 'students', studentId), { groupMemberships: memberships, groupIds: memberships.map((gm: { groupId: string }) => gm.groupId) });
    }));
  };

  const saveGroup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || role !== 'admin' || !groupId.trim() || !groupTeacherUid.trim()) return;
    const targetGroupId = groupId.trim();
    try {
      if (editingGroupId) {
        const existing = manageableGroups.find((group) => group.id === editingGroupId);
        await updateDoc(doc(db, 'groups', targetGroupId), {
          subject: groupSubject,
          level: groupLevel,
          teacherId: groupTeacherUid.trim(),
          studentIds: groupStudentIds,
          weeklySchedule: groupSchedule.trim()
        });
        if (existing && existing.teacherId !== groupTeacherUid.trim()) {
          await updateDoc(doc(db, 'users', existing.teacherId), { assignedGroupIds: arrayRemove(targetGroupId) });
          await updateDoc(doc(db, 'users', groupTeacherUid.trim()), { assignedGroupIds: arrayUnion(targetGroupId) });
        }
        await syncStudentGroupMemberships(targetGroupId, groupStudentIds, existing?.studentIds || []);
        const previousStudentIds = existing?.studentIds || [];
        const addedStudentIds = groupStudentIds.filter((studentId) => !previousStudentIds.includes(studentId));
        const levelChanged = Boolean(existing && (existing.subject !== groupSubject || existing.level !== groupLevel));
        const levelNotificationStudentIds = levelChanged ? groupStudentIds : addedStudentIds;
        for (const studentId of levelNotificationStudentIds) {
          const student = availableStudents.find((item) => item.id === studentId);
          for (const parentId of student?.parentIds || []) {
            await queueEmailNotification({
              type: 'student-level-assigned',
              user,
              db,
              targetUserId: parentId,
              studentId,
              subject: groupSubject,
              level: groupLevel,
              groupId: targetGroupId
            });
          }
        }
        for (const studentId of addedStudentIds) {
          const student = availableStudents.find((item) => item.id === studentId);
          for (const parentId of student?.parentIds || []) {
            await queueEmailNotification({
              type: 'student-group-assigned',
              user,
              db,
              targetUserId: parentId,
              studentId,
              groupId: targetGroupId
            });
          }
        }
        if (existing && existing.teacherId !== groupTeacherUid.trim()) {
          await queueEmailNotification({ type: 'teacher-group-removed', user, db, targetUserId: existing.teacherId, groupId: targetGroupId });
          await queueEmailNotification({ type: 'teacher-group-assigned', user, db, targetUserId: groupTeacherUid.trim(), groupId: targetGroupId });
        } else if (!existing) {
          await queueEmailNotification({ type: 'teacher-group-assigned', user, db, targetUserId: groupTeacherUid.trim(), groupId: targetGroupId });
        }

        setGroupMessage(t.groupUpdated);
      } else {
        await setDoc(doc(db, 'groups', targetGroupId), {
          subject: groupSubject,
          level: groupLevel,
          teacherId: groupTeacherUid.trim(),
          studentIds: groupStudentIds,
          weeklySchedule: groupSchedule.trim()
        });
        await updateDoc(doc(db, 'users', groupTeacherUid.trim()), { assignedGroupIds: arrayUnion(targetGroupId) });
        await syncStudentGroupMemberships(targetGroupId, groupStudentIds, []);
        for (const studentId of groupStudentIds) {
          const student = availableStudents.find((item) => item.id === studentId);
          for (const parentId of student?.parentIds || []) {
            await queueEmailNotification({ type: 'student-level-assigned', user, db, targetUserId: parentId, studentId, subject: groupSubject, level: groupLevel, groupId: targetGroupId });
            await queueEmailNotification({ type: 'student-group-assigned', user, db, targetUserId: parentId, studentId, groupId: targetGroupId });
          }
        }
        await queueEmailNotification({ type: 'teacher-group-assigned', user, db, targetUserId: groupTeacherUid.trim(), groupId: targetGroupId });

        setAssignedGroupIds((current) => current.includes(targetGroupId) ? current : [...current, targetGroupId]);
        setGroupMessage(t.groupCreated);
      }
      resetGroupForm();
      await loadGroupsList();
    } catch {
      setGroupMessage(t.approvalError);
    }
  };

  const deleteGroup = async (group: { id: string; teacherId: string; studentIds: string[] }) => {
    if (!user || role !== 'admin' || !window.confirm(t.confirmDeleteGroup)) return;
    try {
      await deleteDoc(doc(db, 'groups', group.id));
      if (group.teacherId) await updateDoc(doc(db, 'users', group.teacherId), { assignedGroupIds: arrayRemove(group.id) });
      if (group.teacherId) await queueEmailNotification({ type: 'teacher-group-removed', user, db, targetUserId: group.teacherId, groupId: group.id });

      await syncStudentGroupMemberships(group.id, [], group.studentIds);
      if (editingGroupId === group.id) resetGroupForm();
      setGroupMessage(t.groupDeleted);
      await loadGroupsList();
    } catch {
      setGroupMessage(t.approvalError);
    }
  };

  const t = useMemo(() => translations[locale], [locale]);
  const sectionItems = liveItems[activeSection];
  const dashboardItems = [
    `${dashboardCounts.unreadMessages} ${t.unreadMessages}`,
    `${dashboardCounts.unreadAssignments} ${t.unreadAssignments}`
  ];
  const detailItems = activeSection === 'dashboard'
    ? dashboardItems
    : sectionItems && sectionItems.length > 0
    ? sectionItems.map((item) => item.text)
    : [];

  return (
    <div className="app-shell" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <header className="topbar">
        <div>
          <h1>{t.appTitle}</h1>
          <p>{t.welcome}</p>
        </div>

        <div className="toolbar">
          <label>
            {t.language}
            <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
              <option value="en">English</option>
              <option value="de">Deutsch</option>
              <option value="ar">العربية</option>
            </select>
          </label>

          {user && <button type="button" onClick={signOut}>{t.logout}</button>}
        </div>
      </header>

      {user ? <main className="content">
        <aside className="sidebar">
          {profileStatus === 'pending' && (
            <div className="status-box">
              <span className="dot" />
              {t.pendingNote}
            </div>
          )}

          <nav className="nav">
            {(['dashboard', 'calendar', 'messages', 'attendance', 'assignments', ...(role === 'admin' ? ['approvals', 'groups'] : []), 'privacy'] as Section[]).map((section) => (
              <button className={activeSection === section ? 'active' : ''} key={section} type="button" onClick={() => setActiveSection(section)}>
                {t[section]}
              </button>
            ))}
          </nav>
        </aside>

        <section className="panel">
          {user && profileStatus === 'pending' ? (
            <article className="pending-card">
              <span className="eyebrow">{t.pending}</span>
              <h2>{t.pendingNote}</h2>
              <p>An administrator must approve your account and link your child before school records are available.</p>
            </article>
          ) : (
            <>
          <div className="hero-card">
            <div>
              <span className="badge">{t[role]}</span>
              <h2>{profileName || user.email}</h2>
              <p>{user.email}</p>
            </div>
            {role !== 'parent' && (
              <div className="metrics">
                {role === 'admin' && <div><strong>{dashboardCounts.teachers}</strong><span>{t.teachers}</span></div>}
                <div><strong>{dashboardCounts.students}</strong><span>{t.students}</span></div>
                <div><strong>{dashboardCounts.groups}</strong><span>{t.groups}</span></div>
              </div>
            )}
          </div>

          <div className="section-heading">
            <div>
              <span className="eyebrow">{t.selected}</span>
              <h2>{t[activeSection]}</h2>
            </div>
          </div>

          {['dashboard', 'calendar', 'assignments'].includes(activeSection) && (
            <article className="detail-card">
              <div className="detail-card-heading">
                <div>
                  <span className="eyebrow">{t[activeSection]}</span>
                  <h3>{t[activeSection]}{isLoadingData ? ' · Loading' : ''}</h3>
                </div>
                <span className="count-badge">{detailItems.length}</span>
              </div>
              <ul className="activity-list">
                {detailItems.length === 0 ? <li><span className="muted">{t.noRecords}</span></li> : detailItems.map((item) => (
                  <li key={item}>
                    <span className="activity-dot" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          )}

          {activeSection === 'calendar' && role === 'admin' && (
            <article className="detail-card event-form-card">
              <span className="eyebrow">{t.admin}</span>
              <h3>{t.createEvent}</h3>
              <form className="event-form" onSubmit={createCalendarEvent}>
                <label>{t.eventTitle}<input value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} required /></label>
                <label>{t.eventDate}<input type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} required /></label>
                <label>{t.eventAudience}<select defaultValue="all"><option value="all">{t.allSchool}</option></select></label>
                <button className="primary-action" type="submit">{t.createEvent}</button>
              </form>
              {eventMessage && <p className="approval-message">{eventMessage}</p>}
            </article>
          )}

          {activeSection === 'assignments' && role === 'teacher' && (
            <article className="detail-card event-form-card">
              <span className="eyebrow">{t.teacher}</span>
              <h3>{t.createAssignment}</h3>
              <form className="event-form teacher-form" onSubmit={createAssignment}>
                <label>{t.group}<select value={assignmentGroupId} onChange={(event) => setAssignmentGroupId(event.target.value)} required><option value="">{t.group}</option>{assignedGroupIds.map((groupId) => <option key={groupId} value={groupId}>{groupId}</option>)}</select></label>
                <label>{t.assignmentTitle}<input value={assignmentTitle} onChange={(event) => setAssignmentTitle(event.target.value)} required /></label>
                <label>{t.dueDate}<input type="date" value={assignmentDueDate} onChange={(event) => setAssignmentDueDate(event.target.value)} /></label>
                <label>{t.description}<input value={assignmentDescription} onChange={(event) => setAssignmentDescription(event.target.value)} /></label>
                <button className="primary-action" type="submit">{t.createAssignment}</button>
              </form>
              {teacherMessage && <p className="approval-message">{teacherMessage}</p>}
            </article>
          )}

          {activeSection === 'messages' && user && profileStatus === 'active' && (() => {
            const inboxMessages = messageRecords.filter((message) => message.senderId !== user.uid);
            const sentMessages = messageRecords.filter((message) => message.senderId === user.uid);
            return (
              <>
                <article className="detail-card">
                  <div className="detail-card-heading">
                    <div><span className="eyebrow">{t.messages}</span><h3>{t.inbox}</h3></div>
                    <span className="count-badge">{inboxMessages.length}</span>
                  </div>
                  <ul className="activity-list">
                    {inboxMessages.length === 0 ? <li><span className="muted">{t.noRecords}</span></li> : inboxMessages.map((message) => (
                      <li key={message.id}><span className="activity-dot" /><span>{message.senderName} · {message.text}{message.sentAt ? ` · ${t.sentOn} ${message.sentAt}` : ''}</span></li>
                    ))}
                  </ul>
                </article>
                <article className="detail-card">
                  <div className="detail-card-heading">
                    <div><span className="eyebrow">{t.messages}</span><h3>{t.sent}</h3></div>
                    <span className="count-badge">{sentMessages.length}</span>
                  </div>
                  <ul className="activity-list">
                    {sentMessages.length === 0 ? <li><span className="muted">{t.noRecords}</span></li> : sentMessages.map((message) => (
                      <li key={message.id}><span className="activity-dot" /><span>{message.text}{message.sentAt ? ` · ${t.sentOn} ${message.sentAt}` : ''}</span></li>
                    ))}
                  </ul>
                </article>
              </>
            );
          })()}

          {activeSection === 'messages' && user && profileStatus === 'active' && (
            <article className="detail-card event-form-card">
              <span className="eyebrow">{t[role]}</span>
              <h3>{t.sendMessage}</h3>
              <form className="message-form" onSubmit={sendMessage}>
                <label>{t.recipientType}<select value={recipientType} onChange={(event) => { setRecipientType(event.target.value as typeof recipientType); setRecipientUid(''); setRecipientGroupId(''); }}>
                  {role === 'admin' && <><option value="everyone">{t.everyone}</option><option value="group">{t.groupRecipient}</option><option value="teacher">{t.teacherRecipient}</option><option value="parent">{t.parentRecipient}</option></>}
                  {role === 'teacher' && <><option value="group">{t.groupRecipient}</option><option value="individual">{t.individualRecipient}</option></>}
                  {role === 'parent' && <><option value="teacher">{t.teacherRecipient}</option><option value="admin">{t.admin}</option></>}
                </select></label>
                {recipientType === 'group' ? <label>{t.recipient}<select value={recipientGroupId} onChange={(event) => setRecipientGroupId(event.target.value)} required><option value="">{t.selectRecipient}</option>{availableGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label> : recipientType !== 'everyone' && <label>{t.recipient}<select value={recipientUid} onChange={(event) => setRecipientUid(event.target.value)} required><option value="">{t.selectRecipient}</option>{recipientType === 'individual' ? availableStudents.flatMap((student) => (student.parentIds || []).map((parentId) => { const parent = availableUsers.find((item) => item.id === parentId); return parent ? <option key={`${student.id}-${parentId}`} value={parentId}>{student.name} · {parent.name}</option> : null; })) : availableUsers.filter((item) => recipientType === 'teacher' ? item.role === 'teacher' : recipientType === 'admin' ? item.role === 'admin' : item.role === 'parent').map((recipient) => <option key={recipient.id} value={recipient.id}>{recipient.name}</option>)}</select></label>}
                <label>{t.messageText}<textarea value={messageText} onChange={(event) => setMessageText(event.target.value)} rows={4} required /></label>
                <button className="primary-action" type="submit">{t.sendMessage}</button>
              </form>
              {messageStatus && <p className="approval-message">{messageStatus}</p>}
            </article>
          )}

          {activeSection === 'attendance' && role === 'teacher' && (
            <article className="detail-card event-form-card">
              <span className="eyebrow">{t.teacher}</span>
              <h3>{t.markAttendance}</h3>
              <form className="event-form teacher-form" onSubmit={saveAttendance}>
                <label>{t.group}<select value={attendanceGroupId} onChange={(event) => setAttendanceGroupId(event.target.value)} required><option value="">{t.group}</option>{assignedGroupIds.map((groupId) => <option key={groupId} value={groupId}>{groupId}</option>)}</select></label>
                <label>{t.attendanceDate}<input type="date" value={attendanceDate} onChange={(event) => setAttendanceDate(event.target.value)} required /></label>
                <button className="primary-action" type="submit">{t.saveAttendance}</button>
              </form>
              <div className="attendance-checklist">
                {attendanceStudents.length === 0 ? <p className="muted">{!attendanceGroupId ? 'Select a group first.' : attendanceGroupStudentCount === 0 ? 'No students assigned to this group.' : 'Students are assigned but could not be loaded. Ask an admin to open Groups → Edit this group → Update group to repair access.'}</p> : attendanceStudents.map((student) => (
                  <div className="attendance-student" key={student.id}>
                    <input type="checkbox" checked={attendedStudentIds.includes(student.id)} onChange={(event) => setAttendedStudentIds((current) => event.target.checked ? [...current, student.id] : current.filter((id) => id !== student.id))} />
                    <span>{student.name}</span>
                    <small>{t.attended}</small>
                    <label className="late-toggle"><input type="checkbox" checked={lateStudentIds.includes(student.id)} onChange={(event) => setLateStudentIds((current) => event.target.checked ? [...current, student.id] : current.filter((id) => id !== student.id))} /> {t.late}</label>
                  </div>
                ))}
              </div>
              {teacherMessage && <p className="approval-message">{teacherMessage}</p>}
            </article>
          )}

          {activeSection === 'attendance' && (role === 'teacher' || role === 'admin') && (
            <article className="detail-card attendance-summary-card">
              <span className="eyebrow">{role === 'admin' ? t.admin : t.teacher}</span>
              <h3>{t.attendanceSummary}</h3>
              {groupAttendance.length === 0 ? <p className="muted">{t.noAttendanceData}</p> : !attendanceViewGroupId ? (
                <ul className="approval-list">
                  {groupAttendance.map((group) => {
                    const totalPresent = group.days.reduce((sum, day) => sum + day.present, 0);
                    const totalPossible = group.days.reduce((sum, day) => sum + day.total, 0);
                    const percentage = totalPossible ? Math.round((totalPresent / totalPossible) * 100) : 0;
                    return (
                      <li key={group.groupId}>
                        <span><strong>{group.groupName}</strong><small>{group.days.length} {t.calendar} · {percentage}%</small></span>
                        <button className="secondary-action small-action" type="button" onClick={() => setAttendanceViewGroupId(group.groupId)}>{t.open}</button>
                      </li>
                    );
                  })}
                </ul>
              ) : !attendanceViewDate ? (
                <>
                  <button className="text-action" type="button" onClick={() => setAttendanceViewGroupId(null)}>{t.back}</button>
                  <ul className="approval-list">
                    {groupAttendance.find((group) => group.groupId === attendanceViewGroupId)?.days.map((day) => (
                      <li key={day.date}>
                        <span><strong>{day.date}</strong><small>{day.present}/{day.total} {t.present}</small></span>
                        <button className="secondary-action small-action" type="button" onClick={() => setAttendanceViewDate(day.date)}>{t.open}</button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  <button className="text-action" type="button" onClick={() => setAttendanceViewDate(null)}>{t.back}</button>
                  <div className="attendance-history">
                    {groupAttendance.find((group) => group.groupId === attendanceViewGroupId)?.days.find((day) => day.date === attendanceViewDate)?.records.map((record) => (
                      <div className="student-history" key={record.studentId}><strong>{record.studentName}</strong><span>{t[record.status as 'present' | 'absent' | 'late'] || record.status}</span></div>
                    ))}
                  </div>
                </>
              )}
            </article>
          )}

          {activeSection === 'attendance' && role === 'parent' && (
            <article className="detail-card attendance-summary-card">
              <span className="eyebrow">{t.parent}</span>
              <h3>{t.attendanceSummary}</h3>
              {parentAttendance.length === 0 ? <p className="muted">{t.noAttendanceData}</p> : parentAttendance.map((child) => (
                <div className="attendance-group" key={child.studentId}>
                  <div className="detail-card-heading"><strong>{child.studentName}</strong></div>
                  <div className="attendance-history">
                    {child.days.length === 0 ? <span className="muted">{t.noAttendanceData}</span> : child.days.map((day) => (
                      <div className="student-history" key={day.date}><strong>{day.date}</strong><span>{t[day.status as 'present' | 'absent' | 'late'] || day.status}</span></div>
                    ))}
                  </div>
                </div>
              ))}
            </article>
          )}

          {activeSection === 'groups' && role === 'admin' && (
            <article className="detail-card event-form-card">
              <span className="eyebrow">{t.admin}</span>
              <form className="quick-student-form" onSubmit={createStudent}>
                <label>{t.studentName}<input value={newStudentName} onChange={(event) => setNewStudentName(event.target.value)} placeholder="Amina Hassan" required /></label>
                <button className="secondary-action small-action" type="submit">{t.createStudent}</button>
              </form>
              {groupMessage && <p className="approval-message">{groupMessage}</p>}

              <h3>{t.existingGroups}</h3>
              {manageableGroups.length === 0 ? <p className="muted">{t.noGroups}</p> : (
                <ul className="approval-list">
                  {manageableGroups.map((group) => (
                    <li key={group.id}>
                      <span><strong>{group.id} · {group.subject} {group.level}</strong><small>{group.teacherName} · {group.schedule}</small><small>{group.studentNames.join(', ') || '—'}</small></span>
                      <span className="approval-controls">
                        <button className="secondary-action small-action" type="button" onClick={() => startEditGroup(group)}>{t.edit}</button>
                        <button className="primary-action small-action" type="button" onClick={() => deleteGroup(group)}>{t.deleteAction}</button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <h3>{editingGroupId ? t.updateGroup : t.createGroup}</h3>
              <form className="event-form group-form" onSubmit={saveGroup}>
                <label>{t.groupId}<input value={groupId} onChange={(event) => setGroupId(event.target.value)} placeholder="quran-1" required disabled={Boolean(editingGroupId)} /></label>
                <label>{t.subject}<select value={groupSubject} onChange={(event) => setGroupSubject(event.target.value)}><option>Quran</option><option>Arabic</option><option>Religion</option></select></label>
                <label>{t.level}<select value={groupLevel} onChange={(event) => setGroupLevel(event.target.value)}><option>Preparatory</option><option>1</option><option>2</option><option>3</option></select></label>
                <label>{t.teacherUid}<select value={groupTeacherUid} onChange={(event) => setGroupTeacherUid(event.target.value)} required><option value="">{t.teacherUid}</option>{availableTeachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name} · {teacher.email}</option>)}</select></label>
                <fieldset className="student-picker"><legend>{t.studentIds}</legend>{availableStudents.length === 0 ? <span className="muted">No students available.</span> : availableStudents.map((student) => <label className="student-option" key={student.id}><input type="checkbox" checked={groupStudentIds.includes(student.id)} onChange={(event) => setGroupStudentIds((current) => event.target.checked ? [...current, student.id] : current.filter((id) => id !== student.id))} /><span>{student.name}</span><small>{student.id}</small></label>)}</fieldset>
                <label>{t.schedule}<input value={groupSchedule} onChange={(event) => setGroupSchedule(event.target.value)} placeholder="Tue/Thu 17:30" /></label>
                <button className="primary-action" type="submit">{editingGroupId ? t.updateGroup : t.createGroup}</button>
                {editingGroupId && <button className="secondary-action" type="button" onClick={resetGroupForm}>{t.cancelEdit}</button>}
              </form>
            </article>
          )}

          {activeSection === 'approvals' && role === 'admin' && (
            <article className="detail-card approval-card">
              <div className="detail-card-heading">
                <div>
                  <span className="eyebrow">{t.admin}</span>
                  <h3>{t.pendingParents}</h3>
                </div>
                <span className="count-badge">{pendingParents.length}</span>
              </div>
              {approvalMessage && <p className="approval-message">{approvalMessage}</p>}
              {pendingParents.length === 0 ? <p className="muted">No pending accounts.</p> : (
                <ul className="approval-list">
                  {pendingParents.map((parent) => (
                    <li key={parent.id}>
                      <span><strong>{parent.name} · {t[parent.role]}</strong><small>{parent.email}</small>{parent.requestedChildName && <small>{t.requestedChild}: {parent.requestedChildName}</small>}</span>
                      <span className="approval-controls">
                        {parent.role === 'parent' && <><select aria-label={t.studentName} value={parent.childId} onChange={(event) => setPendingParents((parents) => parents.map((item) => item.id === parent.id ? { ...item, childId: event.target.value } : item))} required><option value="">{t.studentName}</option>{availableStudents.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select>{parent.requestedChildName && !availableStudents.some((student) => student.name.toLowerCase() === parent.requestedChildName.toLowerCase()) && <button className="secondary-action small-action" type="button" onClick={() => createStudentFromRequest(parent)}>{t.createStudent}</button>}</>}
                        <button className="primary-action small-action" type="button" onClick={() => approveParent(parent.id, parent.role, parent.childId)}>{t.approve}</button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          )}

          {activeSection === 'privacy' && (
            <article className="detail-card privacy-card">
              <span className="eyebrow">{t[role]}</span>
              <h2 className="privacy-title">{t.privacyTitle}</h2>
              <p className="privacy-updated">{t.privacyLastUpdated}</p>

              <section className="privacy-section">
                <h3>{t.privacyController}</h3>
                <p>{t.privacyControllerText}</p>
              </section>

              <section className="privacy-section">
                <h3>{t.privacyDataCollected}</h3>
                <p>{t.privacyDataText}</p>
              </section>

              <section className="privacy-section">
                <h3>{t.privacyLegalBasis}</h3>
                <p>{t.privacyLegalText}</p>
              </section>

              <section className="privacy-section">
                <h3>{t.privacyStorage}</h3>
                <p>{t.privacyStorageText}</p>
              </section>

              <section className="privacy-section">
                <h3>{t.privacyRetention}</h3>
                <p>{t.privacyRetentionText}</p>
              </section>

              <section className="privacy-section">
                <h3>{t.privacyRights}</h3>
                <p>{t.privacyRightsText}</p>
              </section>

              <section className="privacy-section">
                <h3>{t.privacyThirdParty}</h3>
                <p>{t.privacyThirdPartyText}</p>
              </section>

              <section className="privacy-section privacy-section--complaint">
                <h3>{t.privacyComplaint}</h3>
                <p>{t.privacyComplaintText}</p>
              </section>
            </article>
          )}

            </>
          )}
        </section>
      </main> : <main className="welcome-screen">
        <div className="welcome-copy">
          <span className="eyebrow">Badr Mosque School</span>
          <h2>{t.welcomeTitle}</h2>
          <p>{t.welcomeText}</p>
          <div className="welcome-actions">
            <button className="primary-action" type="button" onClick={() => { setAuthMode('login'); setIsLoginOpen(true); }}>{t.loginButton}</button>
            <button className="secondary-action" type="button" onClick={() => { setAuthMode('signup'); setIsLoginOpen(true); }}>{t.signupButton}</button>
          </div>
        </div>
      </main>}

      {isLoginOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setIsLoginOpen(false)}>
          <div className="login-modal" role="dialog" aria-modal="true" aria-labelledby="login-title" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" aria-label={t.close} onClick={() => setIsLoginOpen(false)}>×</button>
            <span className="eyebrow">{authMode === 'login' ? t.loginButton : t.signupButton}</span>
            <h2 id="login-title">{t.appTitle}</h2>
            <>
                <p>{authMode === 'login' ? t.loginHint : t.signupNote}</p>
                <form className="auth-form" onSubmit={handleAuthentication}>
                  {authMode === 'signup' && (
                    <>
                      <label>{t.accountType}<select value={signupRole} onChange={(event) => setSignupRole(event.target.value as Role)}><option value="parent">{t.parent}</option><option value="teacher">{t.teacher}</option></select></label>
                      <label>{t.name}<input value={signupName} onChange={(event) => setSignupName(event.target.value)} required /></label>
                      {signupRole === 'parent' && <label>{t.studentName}<input value={signupStudentName} onChange={(event) => setSignupStudentName(event.target.value)} required /></label>}

                      <fieldset className="consent-fieldset">
                        <legend className="consent-legend">⚖️ {t.privacyTitle}</legend>
                        <label className="consent-item">
                          <input type="checkbox" checked={consentGuardian} onChange={(e) => setConsentGuardian(e.target.checked)} required />
                          <span>{signupRole === 'teacher' ? t.consentTeacherRole : t.consentGuardian}</span>
                        </label>
                        <label className="consent-item">
                          <input type="checkbox" checked={consentData} onChange={(e) => setConsentData(e.target.checked)} required />
                          <span>{signupRole === 'teacher' ? t.consentTeacherData : t.consentData}</span>
                        </label>
                        <label className="consent-item">
                          <input type="checkbox" checked={consentPolicy} onChange={(e) => setConsentPolicy(e.target.checked)} required />
                          <span>{t.consentPolicy}</span>
                        </label>
                      </fieldset>
                    </>
                  )}
                  <label>{t.email}<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></label>
                  <label>{t.password}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} /></label>
                  {authMode === 'login' && <button className="text-action" type="button" onClick={async () => {
                    setPasswordResetMessage('');
                    if (!email.trim()) {
                      setAuthError(t.email);
                      return;
                    }
                    try {
                      auth.languageCode = locale;
                      await sendPasswordResetEmail(auth, email.trim());
                      setPasswordResetMessage(t.passwordResetSent);
                    } catch {
                      setAuthError(t.authError);
                    }
                  }}>{t.forgotPassword}</button>}
                  {passwordResetMessage && <p className="approval-message">{passwordResetMessage}</p>}

                  {authError && <p className="auth-error" role="alert">{authError}</p>}
                  <button className="primary-action" type="submit" disabled={isAuthenticating}>{isAuthenticating ? '...' : authMode === 'login' ? t.signIn : t.createAccount}</button>
                </form>
                <button className="text-action" type="button" onClick={() => setIsLoginOpen(false)}>{t.close}</button>
              </>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
