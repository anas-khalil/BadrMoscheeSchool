import { getApps, initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { doc, getFirestore, getDoc, setDoc } from 'firebase/firestore';

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

export function startDirectorySync() {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) return;

    try {
      const userSnapshot = await getDoc(doc(db, 'users', user.uid));
      if (!userSnapshot.exists()) return;

      const data = userSnapshot.data();
      if (data.status !== 'active' || !['admin', 'teacher', 'parent'].includes(data.role)) return;

      await setDoc(doc(db, 'directory', user.uid), {
        name: data.name || user.email || user.uid,
        role: data.role
      });
    } catch {
      // Messaging remains usable if the directory sync is temporarily unavailable.
    }
  });
}
