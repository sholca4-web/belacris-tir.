
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore'

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCMSgtlwVR62KJTjGdzIxgChMnshq8qTTQ",
  authDomain: "jarvis-f8677.firebaseapp.com",
  projectId: "jarvis-f8677",
  storageBucket: "jarvis-f8677.firebasestorage.app",
  messagingSenderId: "139643240704",
  appId: "1:139643240704:web:a5caefd1220e3389f4b3e5",
  measurementId: "G-EJGTTE5TRG"
};

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
})
