import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/interview-prep/',
  // Vitest-only config. These dummy Firebase values let modules that eagerly
  // initialize the SDK (e.g. lib/firebase.js via lib/systemEvents.js) load in
  // the test runner without a real .env — they are NEVER used by `vite build`.
  test: {
    env: {
      VITE_FIREBASE_API_KEY: 'test-api-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'demo-test.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'demo-test',
      VITE_FIREBASE_STORAGE_BUCKET: 'demo-test.appspot.com',
      VITE_FIREBASE_MESSAGING_SENDER_ID: '0',
      VITE_FIREBASE_APP_ID: 'test-app-id',
    },
  },
})
