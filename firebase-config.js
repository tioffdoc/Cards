// firebase-config.js — fill this in with YOUR OWN Firebase project's
// config to turn on cloud sync (accounts + cross-device backup).
//
// Leave firebaseConfig as null to keep the app exactly as it was before —
// fully local-only, nothing breaks, the Account section just explains
// that cloud sync isn't set up yet.
//
// How to get real values: see the "Cloud sync setup" section in README.md.
// In short — create a free project at https://console.firebase.google.com,
// enable Email/Password sign-in and a Firestore database, then click the
// web "</>" icon on the project's Settings page to get this object.

export const firebaseConfig = null;

/* After setup, replace the line above with something like:

export const firebaseConfig = {
  apiKey: "AIzaSyD...",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef1234567890",
};

*/
