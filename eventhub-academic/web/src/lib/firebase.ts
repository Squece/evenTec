import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { initializeFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// ignoreUndefinedProperties: os formulários mandam `undefined` pra campos
// numéricos opcionais (cargaHoraria, capacidade) em vez de omitir a chave —
// sem isso o Firestore SDK rejeita o write inteiro.
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true });

// Sem Firebase Storage: o projeto não está no plano Blaze (exigido até pro
// Storage, desde a mudança de política de outubro/2024). Certificados em
// PDF são gerados no navegador e guardados em base64 direto no Firestore
// (ver lib/certificado.ts).

if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099');
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
