// Firebase Configuration and Initialization
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
// Privacy-first: Google Analytics is intentionally NOT loaded — no page-view
// telemetry about this ERP's usage is ever sent to Google. (Previously
// getAnalytics(app) ran in production.) The CSP in firebase.json also drops
// the googletagmanager/google-analytics origins so it can't be re-added by
// accident. Re-enable only with an explicit privacy decision.

// Firebase configuration from environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  // measurementId intentionally omitted — Analytics is disabled (privacy-first).
};

// Validate configuration. Exported so data modules can skip doomed Firestore
// calls (which otherwise retry for ~30s) when credentials are absent.
export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

if (!isFirebaseConfigured) {
  console.warn(
    '⚠ Firebase configuration missing — running with local default data. Copy .env.example to .env to enable cloud sync.'
  );
}

// Initialize Firebase only when credentials are present.
// Without this guard, initializeApp() throws auth/invalid-api-key when env
// vars are missing (e.g. Vercel preview without secrets), crashing the entire
// module graph before any UI can render.
let app = null;
let auth = null;
let db = null;
let storage = null;
let functions = null;

// Cloud Functions region — must match the deploy region of the auth callables
// (loginWithUsername, …) in functions/. They deploy to the default us-central1.
const FUNCTIONS_REGION = import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1';

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  // Defaults to the standard "(default)" Firestore database (free Spark plan).
  // A database literally named "default" is a NAMED database and requires
  // Blaze/billing — override via VITE_FIREBASE_DB_ID only if you use one.
  db = getFirestore(app, import.meta.env.VITE_FIREBASE_DB_ID || '(default)');
  storage = getStorage(app);
  functions = getFunctions(app, FUNCTIONS_REGION);
}

// Connect to emulators in development (only when Firebase is configured)
if (isFirebaseConfigured && import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, 'localhost', 8080);
  connectStorageEmulator(storage, 'localhost', 9199);
  connectFunctionsEmulator(functions, 'localhost', 5001);
  // eslint-disable-next-line no-console
  console.log('🔧 Connected to Firebase Emulators');
}

export { app, auth, db, storage, functions };
