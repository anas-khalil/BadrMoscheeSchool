import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, onAuthStateChanged, signInWithEmailAndPassword, type User } from 'firebase/auth';
import { addDoc, arrayUnion, collection, doc, getDoc, getDocs, getFirestore, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { registerSW } from 'virtual:pwa-register';

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

type Locale = 'en' | 'de' | 'ar';

type Role = 'admin' | 'teacher' | 'parent';
type Section = 'dashboard' | 'calendar' | 'messages' | 'attendance' | 'assignments' | 'privacy' | 'approvals' | 'groups';

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

type AttendanceSummary = {
  groupId: string;
  groupName: string;
  sessions: number;
  present: number;
  total: number;
  students: Array<AttendanceStudent & { date: string; history: Array<{ date: string; status: string }> }>;
};

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
    privacy: 'Privacy Notice',
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
    authError: 'Unable to complete authentication. Check your details and try again.',
    pendingNote: 'Your account is pending admin approval.'
    ,approvals: 'Approvals', groups: 'Groups', pendingParents: 'Pending parent accounts', approve: 'Approve', approved: 'Parent approved', approvalError: 'Could not update this account.', eventTitle: 'Event title', eventDate: 'Event date', eventAudience: 'Audience', allSchool: 'Everyone', createEvent: 'Create event', eventCreated: 'Event created.', group: 'Group', studentId: 'Student ID', studentName: 'Student name', assignmentTitle: 'Assignment title', description: 'Description', dueDate: 'Due date', createAssignment: 'Post assignment', assignmentCreated: 'Assignment posted', attendanceStatus: 'Status', present: 'Present', absent: 'Absent', late: 'Late', saveAttendance: 'Save attendance', attendanceSaved: 'Attendance saved', loginButton: 'Login', signupButton: 'Sign up', chooseAccountType: 'Choose account type', accountType: 'Account type', signupNote: 'All new accounts require admin approval.', accountCreated: 'Account created. Please wait for admin approval.', groupId: 'Group ID', subject: 'Subject', level: 'Level', teacherUid: 'Teacher UID', studentIds: 'Students', schedule: 'Weekly schedule', createGroup: 'Create group', groupCreated: 'Group created and assigned.', attended: 'Attended', markAttendance: 'Mark Saturday attendance', attendanceDate: 'Session date', attendanceSummary: 'Attendance summary', attendanceRate: 'Attendance rate', viewHistory: 'View student history', history: 'History', noAttendanceData: 'No attendance data yet.', saturdayOnly: 'Please choose a Saturday.', messageText: 'Message', sendMessage: 'Send message', noRecords: 'No records yet.'
    ,createStudent: 'Create student record', studentCreated: 'Student created', requestedChild: 'Requested child', name: 'Full name', students: 'Students', teachers: 'Teachers', unreadMessages: 'Unread messages', unreadAssignments: 'Unread assignments', recipientType: 'Send to', everyone: 'Everyone', groupRecipient: 'Group', teacherRecipient: 'Teacher', parentRecipient: 'Parent', individualRecipient: 'Individual parent', recipient: 'Recipient', selectRecipient: 'Select recipient', messageSent: 'Message sent.'
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
    privacy: 'Datenschutzhinweis',
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
    authError: 'Anmeldung nicht möglich. Bitte Daten prüfen und erneut versuchen.',
    pendingNote: 'Ihr Konto wartet auf die Genehmigung durch die Verwaltung.'
    ,approvals: 'Genehmigungen', groups: 'Gruppen', pendingParents: 'Ausstehende Elternkonten', approve: 'Genehmigen', approved: 'Elternkonto genehmigt', approvalError: 'Konto konnte nicht aktualisiert werden.', eventTitle: 'Veranstaltungstitel', eventDate: 'Veranstaltungsdatum', eventAudience: 'Zielgruppe', allSchool: 'Alle', createEvent: 'Veranstaltung erstellen', eventCreated: 'Veranstaltung erstellt.', group: 'Gruppe', studentId: 'Schüler-ID', studentName: 'Name des Schülers', assignmentTitle: 'Aufgabentitel', description: 'Beschreibung', dueDate: 'Fälligkeitsdatum', createAssignment: 'Aufgabe veröffentlichen', assignmentCreated: 'Aufgabe veröffentlicht', attendanceStatus: 'Status', present: 'Anwesend', absent: 'Abwesend', late: 'Verspätet', saveAttendance: 'Anwesenheit speichern', attendanceSaved: 'Anwesenheit gespeichert', loginButton: 'Anmelden', signupButton: 'Registrieren', chooseAccountType: 'Kontotyp auswählen', accountType: 'Kontotyp', signupNote: 'Alle neuen Konten benötigen eine Genehmigung.', accountCreated: 'Konto erstellt. Bitte warten Sie auf die Genehmigung.', groupId: 'Gruppen-ID', subject: 'Fach', level: 'Stufe', teacherUid: 'Lehrer-UID', studentIds: 'Schüler', schedule: 'Wochenplan', createGroup: 'Gruppe erstellen', groupCreated: 'Gruppe erstellt und zugewiesen.', attended: 'Anwesend', markAttendance: 'Samstagsanwesenheit erfassen', attendanceDate: 'Unterrichtsdatum', attendanceSummary: 'Anwesenheitsübersicht', attendanceRate: 'Anwesenheitsquote', viewHistory: 'Schülerverlauf anzeigen', history: 'Verlauf', noAttendanceData: 'Noch keine Anwesenheitsdaten.', saturdayOnly: 'Bitte wählen Sie einen Samstag.'
    ,createStudent: 'Schülerdatensatz erstellen', studentCreated: 'Schüler erstellt', requestedChild: 'Angefragtes Kind', name: 'Vollständiger Name', students: 'Schüler', teachers: 'Lehrer', unreadMessages: 'Ungelesene Nachrichten', unreadAssignments: 'Ungelesene Aufgaben', recipientType: 'Senden an', everyone: 'Alle', groupRecipient: 'Gruppe', teacherRecipient: 'Lehrer', parentRecipient: 'Elternteil', individualRecipient: 'Einzelnen Elternteil', recipient: 'Empfänger', selectRecipient: 'Empfänger auswählen', messageSent: 'Nachricht gesendet.', noRecords: 'Noch keine Einträge.'
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
    privacy: 'إشعار الخصوصية',
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
    authError: 'تعذر تسجيل الدخول. تحقق من البيانات وحاول مرة أخرى.',
    pendingNote: 'حسابك بانتظار موافقة الإدارة.'
    ,approvals: 'الموافقات', groups: 'المجموعات', pendingParents: 'حسابات أولياء الأمور المعلقة', approve: 'موافقة', approved: 'تمت الموافقة على الحساب', approvalError: 'تعذر تحديث الحساب.', eventTitle: 'عنوان الفعالية', eventDate: 'تاريخ الفعالية', eventAudience: 'الجمهور', allSchool: 'الجميع', createEvent: 'إنشاء فعالية', eventCreated: 'تم إنشاء الفعالية.', group: 'المجموعة', studentId: 'معرف الطالب', studentName: 'اسم الطالب', assignmentTitle: 'عنوان الواجب', description: 'الوصف', dueDate: 'تاريخ التسليم', createAssignment: 'نشر الواجب', assignmentCreated: 'تم نشر الواجب', attendanceStatus: 'الحالة', present: 'حاضر', absent: 'غائب', late: 'متأخر', saveAttendance: 'حفظ الحضور', attendanceSaved: 'تم حفظ الحضور', loginButton: 'تسجيل الدخول', signupButton: 'إنشاء حساب', chooseAccountType: 'اختر نوع الحساب', accountType: 'نوع الحساب', signupNote: 'تحتاج جميع الحسابات الجديدة إلى موافقة الإدارة.', accountCreated: 'تم إنشاء الحساب. يرجى انتظار موافقة الإدارة.', groupId: 'معرف المجموعة', subject: 'المادة', level: 'المستوى', teacherUid: 'معرف المعلم', studentIds: 'الطلاب', schedule: 'الجدول الأسبوعي', createGroup: 'إنشاء مجموعة', groupCreated: 'تم إنشاء المجموعة وتعيينها.', attended: 'حاضر', markAttendance: 'تسجيل حضور السبت', attendanceDate: 'تاريخ الحصة', attendanceSummary: 'ملخص الحضور', attendanceRate: 'نسبة الحضور', viewHistory: 'عرض سجل الطالب', history: 'السجل', noAttendanceData: 'لا توجد بيانات حضور بعد.', saturdayOnly: 'يرجى اختيار يوم السبت.'
    ,createStudent: 'إنشاء سجل طالب', studentCreated: 'تم إنشاء الطالب', requestedChild: 'الطفل المطلوب', name: 'الاسم الكامل', students: 'الطلاب', teachers: 'المعلمون', unreadMessages: 'الرسائل غير المقروءة', unreadAssignments: 'الواجبات غير المقروءة', recipientType: 'إرسال إلى', everyone: 'الجميع', groupRecipient: 'مجموعة', teacherRecipient: 'معلم', parentRecipient: 'ولي أمر', individualRecipient: 'ولي أمر محدد', recipient: 'المستلم', selectRecipient: 'اختر المستلم', messageSent: 'تم إرسال الرسالة.', noRecords: 'لا توجد سجلات بعد.'
  }
};

function App() {
  const [locale, setLocale] = useState<Locale>('en');
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>('parent');
  const [isOfflineReady, setIsOfflineReady] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>('dashboard');
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signupStudentName, setSignupStudentName] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [profileStatus, setProfileStatus] = useState<'pending' | 'active' | null>(null);
  const [profileName, setProfileName] = useState('');
  const [pendingParents, setPendingParents] = useState<Array<{ id: string; email: string; name: string; role: Role; childId: string; requestedChildName: string }>>([]);
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
  const [attendedStudentIds, setAttendedStudentIds] = useState<string[]>([]);
  const [lateStudentIds, setLateStudentIds] = useState<string[]>([]);
  const [attendanceSummaries, setAttendanceSummaries] = useState<AttendanceSummary[]>([]);
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

  useEffect(() => {
    const savedLocale = (localStorage.getItem('badr-school-locale') as Locale) || 'en';
    setLocale(savedLocale in translations ? savedLocale : 'en');

    const updateSW = registerSW({
      onOfflineReady() {
        setIsOfflineReady(true);
      }
    });

    return () => updateSW && updateSW();
  }, []);

  useEffect(() => {
    if (!user || profileStatus !== 'active') return;
    let cancelled = false;

    const loadDashboardData = async () => {
      try {
        const [userSnapshot, groupSnapshot, studentSnapshot, messageSnapshot] = await Promise.all([
          getDocs(query(collection(db, 'users'), where('status', '==', 'active'))),
          role === 'admin' ? getDocs(collection(db, 'groups')) : Promise.all(assignedGroupIds.map((groupId) => getDoc(doc(db, 'groups', groupId)))),
          role === 'admin' || role === 'parent' ? Promise.all((role === 'admin' ? [] : linkedChildIds).map((id) => getDoc(doc(db, 'students', id)))) : Promise.resolve([]),
          getDocs(query(collection(db, 'messages'), where('participants', 'array-contains', user.uid))),
        ]);
        if (cancelled) return;

        const users = userSnapshot.docs.map((item) => ({
          id: item.id,
          name: item.data().name || item.data().email || item.id,
          email: item.data().email || '',
          role: item.data().role as Role
        }));
        const groupDocs = Array.isArray(groupSnapshot) ? groupSnapshot.filter((item) => item.exists()) : groupSnapshot.docs;
        const groups: DirectoryGroup[] = groupDocs.map((item) => ({
          id: item.id,
          name: `${item.data().subject || 'Group'} · ${item.data().level || ''}`,
          studentIds: item.data().studentIds || []
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
          studentDocs = (await Promise.all(studentIds.map((studentId) => getDoc(doc(db, 'students', studentId))))).filter((item) => item.exists());
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
    setIsAuthenticating(true);

    try {
      if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        // Self-signup only ever creates a pending PARENT account. Teacher and
        // admin accounts are created/promoted by an existing admin (the very
        // first admin is bootstrapped manually in Firebase, per the README).
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, 'users', credential.user.uid), {
          uid: credential.user.uid,
          email,
          name: signupName.trim(),
          role: 'parent',
          status: 'pending',
          language: locale,
          linkedChildIds: [],
          requestedChildName: signupStudentName.trim(),
          createdAt: new Date().toISOString()
        });
      }
      setEmail('');
      setPassword('');
      setSignupName('');
      setSignupStudentName('');
      setAuthMode('login');
      if (authMode === 'signup') setAuthError(t.accountCreated);
      setIsLoginOpen(false);
    } catch {
      setAuthError(t.authError);
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
            requestedChildName: pendingDoc.data().requestedChildName || ''
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
    if (!user || profileStatus !== 'active' || activeSection === 'dashboard' || activeSection === 'privacy' || activeSection === 'approvals') return;

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
            const childSnapshots = await Promise.all(linkedChildIds.map((studentId) => getDoc(doc(db, 'students', studentId))));
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
        const items = snapshots.flatMap((snapshot) => snapshot.docs.map((item) => {
          const data = item.data();
          const text = activeSection === 'calendar'
            ? `${data.title || 'Calendar event'} · ${data.startDate || data.date || ''}`
            : activeSection === 'messages'
              ? `${data.senderName || data.senderId || 'Message'} · ${data.text || data.body || ''}`
              : activeSection === 'assignments'
                ? `${data.title || 'Assignment'} · ${data.description || ''} · Due ${data.dueDate || 'date not set'}`
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
  }, [activeSection, assignedGroupIds, linkedChildIds, profileStatus, role, user]);

  useEffect(() => {
    if (!user || role !== 'admin' || profileStatus !== 'active' || activeSection !== 'groups') return;
    void getDocs(collection(db, 'students')).then((studentSnapshot) => {
      setAvailableStudents(studentSnapshot.docs.map((studentDoc) => ({
        id: studentDoc.id,
        name: studentDoc.data().name || studentDoc.id
      })));
    }).catch(() => setGroupMessage('Students could not be loaded. Check that Firestore rules are deployed.'));
  }, [activeSection, profileStatus, role, user]);

  useEffect(() => {
    if (!user || profileStatus !== 'active' || activeSection !== 'attendance') return;
    if (role === 'teacher' && attendanceGroupId) {
      setAttendanceStudents([]);
      setAttendedStudentIds([]);
      setLateStudentIds([]);
      void getDoc(doc(db, 'groups', attendanceGroupId)).then(async (groupSnapshot) => {
        const studentIds = groupSnapshot.data()?.studentIds || [];
        const studentSnapshots = await Promise.all(studentIds.map((studentId: string) => getDoc(doc(db, 'students', studentId))));
        setAttendanceStudents(studentSnapshots.filter((snapshot) => snapshot.exists()).map((snapshot) => ({
          id: snapshot.id,
          name: snapshot.data()?.name || snapshot.id
        })));
      }).catch(() => setAttendanceStudents([]));
    }

    if (role === 'admin') {
      void Promise.all([
        getDocs(collection(db, 'groups')),
        getDocs(collection(db, 'students')),
        getDocs(collection(db, 'attendance'))
      ]).then(([groupSnapshot, studentSnapshot, attendanceSnapshot]) => {
        const students = new Map(studentSnapshot.docs.map((snapshot) => [snapshot.id, snapshot.data().name || snapshot.id]));
        const records = attendanceSnapshot.docs.map((snapshot) => snapshot.data());
        const summaries = groupSnapshot.docs.map((groupSnapshotItem) => {
          const group = groupSnapshotItem.data();
          const groupRecords = records.filter((record) => record.groupId === groupSnapshotItem.id);
          const sessionDates = new Set(groupRecords.map((record) => record.date).filter(Boolean));
          const groupStudentIds = group.studentIds || [];
          const studentsInGroup = groupStudentIds.map((studentId: string) => {
            const history = groupRecords.filter((record) => record.studentId === studentId).map((record) => ({ date: record.date || '', status: record.status || 'absent' }));
            return { id: studentId, name: students.get(studentId) || studentId, date: history[0]?.date || '', history };
          });
          const present = groupRecords.filter((record) => record.status === 'present').length;
          return {
            groupId: groupSnapshotItem.id,
            groupName: `${group.subject || 'Group'} · ${group.level || ''}`,
            sessions: sessionDates.size,
            present,
            total: groupRecords.length,
            students: studentsInGroup
          };
        });
        setAttendanceSummaries(summaries);
      }).catch(() => setAttendanceSummaries([]));
    }
  }, [activeSection, attendanceGroupId, profileStatus, role, user]);

  const approveParent = async (parentId: string, accountRole: Role, childId: string) => {
    try {
      if (accountRole === 'parent' && childId.trim()) {
        await updateDoc(doc(db, 'students', childId.trim()), { parentIds: arrayUnion(parentId) });
      }
      await updateDoc(doc(db, 'users', parentId), {
        status: 'active',
        ...(accountRole === 'parent' ? { linkedChildIds: childId.trim() ? [childId.trim()] : [] } : {})
      });
      setPendingParents((parents) => parents.filter((parent) => parent.id !== parentId));
      setApprovalMessage(t.approved);
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
      await addDoc(collection(db, 'assignments'), {
        groupId: assignmentGroupId,
        teacherId: user.uid,
        title: assignmentTitle.trim(),
        description: assignmentDescription.trim(),
        dueDate: assignmentDueDate,
        unread: true,
        createdAt: new Date().toISOString()
      });
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
      await Promise.all([...new Set(recipientIds)].map((recipientId) => addDoc(collection(db, 'messages'), {
        participants: [user.uid, recipientId],
        senderId: user.uid,
        senderName: profileName || user.email || 'User',
        text: messageText.trim(),
        unread: true,
        unreadFor: [recipientId],
        createdAt: new Date().toISOString()
      })));
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

  const createGroup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || role !== 'admin' || !groupId.trim() || !groupTeacherUid.trim()) return;
    try {
      await setDoc(doc(db, 'groups', groupId.trim()), {
        subject: groupSubject,
        level: groupLevel,
        teacherId: groupTeacherUid.trim(),
        studentIds: groupStudentIds,
        weeklySchedule: groupSchedule.trim()
      });
      await updateDoc(doc(db, 'users', groupTeacherUid.trim()), { assignedGroupIds: arrayUnion(groupId.trim()) });
      await Promise.all(groupStudentIds.map((studentId) => updateDoc(doc(db, 'students', studentId), {
        groupMemberships: arrayUnion({ groupId: groupId.trim(), subject: groupSubject, level: groupLevel })
      })));
      setAssignedGroupIds((current) => current.includes(groupId.trim()) ? current : [...current, groupId.trim()]);
      setGroupId('');
      setGroupStudentIds([]);
      setGroupSchedule('');
      setGroupMessage(t.groupCreated);
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
          <div className="status-box">
            <span className="dot" />
            {user && profileStatus === 'pending' ? `${t.pendingNote}` : `${t.note}`}
          </div>

          <nav className="nav">
            {(['dashboard', 'calendar', 'messages', 'attendance', 'assignments', 'privacy', ...(role === 'admin' ? ['approvals', 'groups'] : [])] as Section[]).map((section) => (
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
              <p>{t.note}</p>
            </div>
            <div className="metrics">
              <div><strong>{dashboardCounts.teachers}</strong><span>{t.teachers}</span></div>
              <div><strong>{dashboardCounts.students}</strong><span>{t.students}</span></div>
              <div><strong>{dashboardCounts.groups}</strong><span>{t.groups}</span></div>
            </div>
          </div>

          <div className="section-heading">
            <div>
              <span className="eyebrow">{t.selected}</span>
              <h2>{t[activeSection]}</h2>
            </div>
            <span className="muted">{t.signedInAs}</span>
          </div>

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
                {recipientType === 'group' ? <label>{t.recipient}<select value={recipientGroupId} onChange={(event) => setRecipientGroupId(event.target.value)} required><option value="">{t.selectRecipient}</option>{availableGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label> : recipientType !== 'everyone' && <label>{t.recipient}<select value={recipientUid} onChange={(event) => setRecipientUid(event.target.value)} required><option value="">{t.selectRecipient}</option>{recipientType === 'individual' ? availableStudents.flatMap((student) => (student.parentIds || []).map((parentId) => { const parent = availableUsers.find((item) => item.id === parentId); return parent ? <option key={`${student.id}-${parentId}`} value={parentId}>{student.name} · {parent.name}</option> : null; })) : availableUsers.filter((item) => recipientType === 'teacher' ? item.role === 'teacher' : recipientType === 'admin' ? item.role === 'admin' : item.role === 'parent').map((recipient) => <option key={recipient.id} value={recipient.id}>{recipient.name} · {recipient.email}</option>)}</select></label>}
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
                {attendanceStudents.length === 0 ? <p className="muted">{attendanceGroupId ? 'No students assigned to this group.' : 'Select a group first.'}</p> : attendanceStudents.map((student) => (
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

          {activeSection === 'attendance' && role === 'admin' && (
            <article className="detail-card attendance-summary-card">
              <span className="eyebrow">{t.admin}</span>
              <h3>{t.attendanceSummary}</h3>
              {attendanceSummaries.length === 0 ? <p className="muted">{t.noAttendanceData}</p> : attendanceSummaries.map((summary) => {
                const denominator = summary.sessions * summary.students.length;
                const attendedCount = summary.students.reduce((count, student) => count + student.history.filter((record) => record.status === 'present' || record.status === 'late').length, 0);
                const percentage = denominator ? Math.round((attendedCount / denominator) * 100) : 0;
                return (
                  <details className="attendance-group" key={summary.groupId}>
                    <summary><strong>{summary.groupName}</strong><span>{percentage}% · {summary.sessions} {t.calendar}</span></summary>
                    <div className="attendance-history">
                      {summary.students.map((student) => <div className="student-history" key={student.id}><strong>{student.name}</strong><span>{student.history.length ? student.history.map((record) => `${record.date}: ${record.status}`).join(' · ') : t.noAttendanceData}</span></div>)}
                    </div>
                  </details>
                );
              })}
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
              <h3>{t.createGroup}</h3>
              <form className="event-form group-form" onSubmit={createGroup}>
                <label>{t.groupId}<input value={groupId} onChange={(event) => setGroupId(event.target.value)} placeholder="quran-1" required /></label>
                <label>{t.subject}<select value={groupSubject} onChange={(event) => setGroupSubject(event.target.value)}><option>Quran</option><option>Arabic</option><option>Religion</option></select></label>
                <label>{t.level}<select value={groupLevel} onChange={(event) => setGroupLevel(event.target.value)}><option>Preparatory</option><option>1</option><option>2</option><option>3</option></select></label>
                <label>{t.teacherUid}<select value={groupTeacherUid} onChange={(event) => setGroupTeacherUid(event.target.value)} required><option value="">{t.teacherUid}</option>{availableTeachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name} · {teacher.email}</option>)}</select></label>
                <fieldset className="student-picker"><legend>{t.studentIds}</legend>{availableStudents.length === 0 ? <span className="muted">No students available.</span> : availableStudents.map((student) => <label className="student-option" key={student.id}><input type="checkbox" checked={groupStudentIds.includes(student.id)} onChange={(event) => setGroupStudentIds((current) => event.target.checked ? [...current, student.id] : current.filter((id) => id !== student.id))} /><span>{student.name}</span><small>{student.id}</small></label>)}</fieldset>
                <label>{t.schedule}<input value={groupSchedule} onChange={(event) => setGroupSchedule(event.target.value)} placeholder="Tue/Thu 17:30" /></label>
                <button className="primary-action" type="submit">{t.createGroup}</button>
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

          <div className="grid">
            <article className="card">
              <h3>{t.messages}</h3>
              <button className="card-action" type="button" onClick={() => setActiveSection('messages')}>{t.open}</button>
              <ul>
                <li>{dashboardCounts.unreadMessages} {t.unreadMessages}</li>
                <li>{t.messageText}</li>
              </ul>
            </article>

            <article className="card">
              <h3>{t.attendance}</h3>
              <button className="card-action" type="button" onClick={() => setActiveSection('attendance')}>{t.open}</button>
              <ul>
                <li>Weekly attendance log</li>
                <li>Late/absent summaries</li>
                <li>Term export ready</li>
              </ul>
            </article>

            <article className="card">
              <h3>{t.assignments}</h3>
              <button className="card-action" type="button" onClick={() => setActiveSection('assignments')}>{t.open}</button>
              <ul>
                <li>{dashboardCounts.unreadAssignments} {t.unreadAssignments}</li>
                <li>{t.dueDate}</li>
                <li>{t.description}</li>
              </ul>
            </article>

            <article className="card">
              <h3>{t.offline}</h3>
              <ul>
                <li>{isOfflineReady ? 'Service worker registered' : 'Preparing offline cache'}</li>
                <li>Firestore-only backend</li>
                <li>GitHub Pages static deployment</li>
              </ul>
            </article>
          </div>
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
                      <label>{t.name}<input value={signupName} onChange={(event) => setSignupName(event.target.value)} required /></label>
                      <label>{t.studentName}<input value={signupStudentName} onChange={(event) => setSignupStudentName(event.target.value)} required /></label>
                    </>
                  )}
                  <label>{t.email}<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></label>
                  <label>{t.password}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} /></label>
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
