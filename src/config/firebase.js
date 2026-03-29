const admin = require('firebase-admin');

const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// module.exports = admin;

const sendNotification = async (userId, title, body) => {
  const db = require('./db');
  try {
    await db.query('INSERT INTO notification_history (user_id, title, body) VALUES ($1, $2, $3)', [userId, title, body]);

    const { rows } = await db.query('SELECT fcm_token FROM users WHERE id = $1', [userId]);
    if (rows.length > 0 && rows[0].fcm_token) {
      await admin.messaging().send({
        token: rows[0].fcm_token,
        notification: { title, body }
      });
      console.log(`[FCM] Push dispatched sequentially securely to user ${userId}`);
    }
  } catch (err) {
    console.error('[FCM] Send Exception (Token absent/invalid) but History logged:', err.message);
  }
};

module.exports = { admin, sendNotification };
