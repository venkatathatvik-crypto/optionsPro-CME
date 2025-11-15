import admin from 'firebase-admin';
import path from 'path';

let app;

export function initFirebaseAdmin() {
  if (app) return app;
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const inlineJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

  let creds = null;
  if (credPath) {
    const resolved = path.resolve(process.cwd(), credPath);
    creds = require(resolved);
  } else if (inlineJson) {
    try {
      creds = JSON.parse(inlineJson);
    } catch (e) {
      throw new Error('Invalid GOOGLE_APPLICATION_CREDENTIALS_JSON (not valid JSON)');
    }
  } else {
    throw new Error('Neither GOOGLE_APPLICATION_CREDENTIALS nor GOOGLE_APPLICATION_CREDENTIALS_JSON provided');
  }

  app = admin.initializeApp({
    credential: admin.credential.cert(creds),
  });
  return app;
}

export async function verifyIdToken(idToken) {
  initFirebaseAdmin();
  const decoded = await admin.auth().verifyIdToken(idToken);
  return decoded;
}
