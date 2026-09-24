import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInAnonymously,
  onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  collection, query, where, orderBy, onSnapshot, getDocs,
  serverTimestamp, writeBatch, increment
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app-check.js';
import { firebaseConfig, recaptchaEnterpriseKey } from './firebase-config.js';

if (!firebaseConfig.projectId || firebaseConfig.projectId === 'REPLACE_ME') {
  console.warn('Firebase is not configured yet. See README.md.');
}

export const app = initializeApp(firebaseConfig);

export let appCheck = null;
try {
  appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(recaptchaEnterpriseKey),
    isTokenAutoRefreshEnabled: true
  });
} catch (e) {
  console.warn('Firebase App Check could not initialise.', e);
}

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export {
  signInWithPopup, signInAnonymously, onAuthStateChanged, signOut,
  doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, collection, query,
  where, orderBy, onSnapshot, getDocs, serverTimestamp, writeBatch, increment
};

export async function getFreshAppCheckToken() {
  if (!appCheck) throw new Error('App Check is not initialised.');
  const result = await getToken(appCheck, true);
  if (!result?.token) throw new Error('App Check returned no token.');
  return result.token;
}
