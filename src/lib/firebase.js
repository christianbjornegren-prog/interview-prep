import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getAuth, onAuthStateChanged as firebaseOnAuthStateChanged } from 'firebase/auth'
import { logger, CATEGORIES } from './logger'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const storage = getStorage(app)
export const auth = getAuth(app)

// Wrap onAuthStateChanged with logging
export function onAuthStateChanged(auth, callback) {
  return firebaseOnAuthStateChanged(auth, (user) => {
    if (user) {
      logger.info(CATEGORIES.AUTH, 'User state changed', {
        uid: user.uid,
        email: user.email,
      })
    } else {
      logger.info(CATEGORIES.AUTH, 'User signed out')
    }
    callback(user)
  })
}

// Wrap Firestore operations with logging
import {
  addDoc as firestoreAddDoc,
  setDoc as firestoreSetDoc,
  getDoc as firestoreGetDoc,
  getDocs as firestoreGetDocs,
  updateDoc as firestoreUpdateDoc,
  deleteDoc as firestoreDeleteDoc,
} from 'firebase/firestore'

export async function addDoc(collectionRef, data) {
  const path = collectionRef.path
  logger.debug(CATEGORIES.FIRESTORE, 'Adding document', { path })
  try {
    const result = await firestoreAddDoc(collectionRef, data)
    logger.info(CATEGORIES.FIRESTORE, 'Document added', { path, id: result.id })
    return result
  } catch (error) {
    logger.error(CATEGORIES.FIRESTORE, 'Add document failed', {
      path,
      code: error.code,
      message: error.message,
    })
    throw error
  }
}

export async function setDoc(docRef, data, options) {
  const path = docRef.path
  logger.debug(CATEGORIES.FIRESTORE, 'Setting document', { path })
  try {
    await firestoreSetDoc(docRef, data, options)
    logger.info(CATEGORIES.FIRESTORE, 'Document set', { path })
  } catch (error) {
    logger.error(CATEGORIES.FIRESTORE, 'Set document failed', {
      path,
      code: error.code,
      message: error.message,
    })
    throw error
  }
}

export async function getDoc(docRef) {
  const path = docRef.path
  logger.debug(CATEGORIES.FIRESTORE, 'Getting document', { path })
  try {
    const result = await firestoreGetDoc(docRef)
    logger.info(CATEGORIES.FIRESTORE, 'Document retrieved', {
      path,
      exists: result.exists(),
    })
    return result
  } catch (error) {
    logger.error(CATEGORIES.FIRESTORE, 'Get document failed', {
      path,
      code: error.code,
      message: error.message,
    })
    throw error
  }
}

export async function getDocs(query) {
  logger.debug(CATEGORIES.FIRESTORE, 'Getting documents')
  try {
    const result = await firestoreGetDocs(query)
    logger.info(CATEGORIES.FIRESTORE, 'Documents retrieved', {
      count: result.size,
    })
    return result
  } catch (error) {
    logger.error(CATEGORIES.FIRESTORE, 'Get documents failed', {
      code: error.code,
      message: error.message,
    })
    throw error
  }
}

export async function updateDoc(docRef, data) {
  const path = docRef.path
  logger.debug(CATEGORIES.FIRESTORE, 'Updating document', { path })
  try {
    await firestoreUpdateDoc(docRef, data)
    logger.info(CATEGORIES.FIRESTORE, 'Document updated', { path })
  } catch (error) {
    logger.error(CATEGORIES.FIRESTORE, 'Update document failed', {
      path,
      code: error.code,
      message: error.message,
    })
    throw error
  }
}

export async function deleteDoc(docRef) {
  const path = docRef.path
  logger.debug(CATEGORIES.FIRESTORE, 'Deleting document', { path })
  try {
    await firestoreDeleteDoc(docRef)
    logger.info(CATEGORIES.FIRESTORE, 'Document deleted', { path })
  } catch (error) {
    logger.error(CATEGORIES.FIRESTORE, 'Delete document failed', {
      path,
      code: error.code,
      message: error.message,
    })
    throw error
  }
}

// Re-export other Firestore functions that don't need wrapping
export {
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  arrayUnion,
} from 'firebase/firestore'
