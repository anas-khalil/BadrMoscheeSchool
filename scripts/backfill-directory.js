const admin = require('firebase-admin');

const serviceAccount = require('./firebase-service-account.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function commitOperations(operations) {
  for (let index = 0; index < operations.length; index += 400) {
    const batch = db.batch();
    operations.slice(index, index + 400).forEach(({ ref, type, data }) => {
      if (type === 'delete') batch.delete(ref);
      else batch.set(ref, data, { merge: true });
    });
    await batch.commit();
  }
}

async function backfillDirectory() {
  const [usersSnapshot, directorySnapshot] = await Promise.all([
    db.collection('users').get(),
    db.collection('directory').get()
  ]);

  const activeUsers = usersSnapshot.docs.filter((snapshot) => snapshot.data().status === 'active');
  const activeIds = new Set(activeUsers.map((snapshot) => snapshot.id));
  const operations = [];

  activeUsers.forEach((snapshot) => {
    const data = snapshot.data();
    if (!['admin', 'teacher', 'parent'].includes(data.role)) return;

    operations.push({
      ref: db.collection('directory').doc(snapshot.id),
      type: 'set',
      data: {
        name: data.name || data.email || snapshot.id,
        role: data.role
      }
    });
  });

  directorySnapshot.docs.forEach((snapshot) => {
    if (!activeIds.has(snapshot.id)) {
      operations.push({ ref: snapshot.ref, type: 'delete' });
    }
  });

  await commitOperations(operations);

  console.log(`Messaging directory synchronized: ${activeUsers.length} active user(s), ${operations.length} write/delete operation(s).`);
}

backfillDirectory().catch((error) => {
  console.error('Could not synchronize the messaging directory:', error);
  process.exitCode = 1;
});
