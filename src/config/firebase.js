const admin = require('firebase-admin');

const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
};

if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_PRIVATE_KEY) {
  console.error('[Firebase] CRITICAL: Missing Firebase environment variables in Render!');
}

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log('[Firebase] Admin SDK initialized successfully.');
} catch (initErr) {
  console.error('[Firebase] Initialization Failed:', initErr.message);
}

// module.exports = admin;

const sendNotification = async (userId, title, body) => {
  const db = require('./db');
  try {
    console.log(`[FCM] Attempting to log notification for user ${userId}...`);
    await db.query('INSERT INTO notification_history (user_id, title, body) VALUES ($1, $2, $3)', [userId, title, body]);

    const { rows } = await db.query('SELECT fcm_token FROM users WHERE id = $1', [userId]);
    if (rows.length > 0 && rows[0].fcm_token) {
      console.log(`[FCM] Sending push to token: ${rows[0].fcm_token.substring(0, 10)}...`);
      await admin.messaging().send({
        token: rows[0].fcm_token,
        notification: { title, body }
      });
      console.log(`[FCM] Success: Push dispatched securely to user ${userId}`);
    } else {
      console.warn(`[FCM] Skip: No FCM token found for user ${userId}`);
    }
  } catch (err) {
    console.error(`[FCM] Error for user ${userId}:`, err.message);
    if (err.code === 'messaging/invalid-registration-token' || err.code === 'messaging/registration-token-not-registered') {
       console.warn(`[FCM] Cleaning up invalid token for user ${userId}`);
       await db.query('UPDATE users SET fcm_token = NULL WHERE id = $1', [userId]);
    }
    throw err; // Re-throw to let the controller handle it if needed
  }
};

module.exports = { admin, sendNotification };
