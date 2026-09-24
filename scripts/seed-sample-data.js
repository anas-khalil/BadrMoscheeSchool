const admin = require('firebase-admin');

const serviceAccount = require('./firebase-service-account.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function seed() {
  const users = [
    { uid: 'admin-1', email: 'admin@badrschool.de', role: 'admin', name: 'Admin User', status: 'active', language: 'de' },
    { uid: 'teacher-1', email: 'teacher1@badrschool.de', role: 'teacher', name: 'Teacher Ali', status: 'active', language: 'en', assignedGroupIds: ['quran-1'] },
    { uid: 'parent-1', email: 'parent1@example.com', role: 'parent', name: 'Parent One', status: 'active', language: 'en', linkedChildIds: ['student-1'] },
    { uid: 'parent-2', email: 'parent2@example.com', role: 'parent', name: 'Parent Two', status: 'pending', language: 'de', linkedChildIds: ['student-2'] }
  ];

  for (const user of users) {
    await db.collection('users').doc(user.uid).set(user);
  }

  const students = [
    { id: 'student-1', name: 'Amina Hassan', dob: '2014-03-06', parentIds: ['parent-1'], groupMemberships: [{ groupId: 'quran-1', subject: 'Quran', level: 'Preparatory' }] },
    { id: 'student-2', name: 'Yusuf Rahman', dob: '2013-11-12', parentIds: ['parent-2'], groupMemberships: [{ groupId: 'arabic-1', subject: 'Arabic', level: '1' }] }
  ];

  for (const student of students) {
    await db.collection('students').doc(student.id).set(student);
  }

  const groups = [
    { id: 'quran-1', subject: 'Quran', level: 'Preparatory', teacherId: 'teacher-1', studentIds: ['student-1'], weeklySchedule: 'Tue/Thu 17:30' },
    { id: 'arabic-1', subject: 'Arabic', level: '1', teacherId: 'teacher-1', studentIds: ['student-2'], weeklySchedule: 'Mon/Wed 18:00' }
  ];

  for (const group of groups) {
    await db.collection('groups').doc(group.id).set(group);
  }

  await db.collection('attendance').doc('attendance-2026-09-23').set({
    groupId: 'quran-1',
    studentId: 'student-1',
    date: '2026-09-23',
    status: 'present'
  });

  await db.collection('assignments').doc('assignment-1').set({
    groupId: 'quran-1',
    studentId: 'student-1',
    teacherId: 'teacher-1',
    title: 'Surah Al-Fatiha revision',
    description: 'Revise first surah and memorize the final ayah.',
    dueDate: '2026-09-30',
    createdAt: new Date().toISOString()
  });

  console.log('Sample data inserted successfully');
  process.exit(0);
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
