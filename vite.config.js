import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Appversionen bakas in i bygget och följer med varje händelse i driftloggen
// (lib/diagnostics.js), så ett fel kan knytas till exakt den kod som kördes.
// GITHUB_SHA finns i GitHub Actions; lokalt blir det "lokal".
const APP_VERSION = `${new Date().toISOString().slice(0, 10)}-${(process.env.GITHUB_SHA ?? 'lokal').slice(0, 7)}`

export default defineConfig({
  plugins: [react()],
  base: '/interview-prep/',
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
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
