const express = require('express');
const db = require('../config/db');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();
router.use(authMiddleware);

router.post('/register', async (req, res, next) => {
  try {
    const { token } = req.body;
    await db.query('UPDATE users SET fcm_token = $1 WHERE id = $2', [token, req.user.id]);
    res.json({ message: 'FCM Token securely mapped recursively.' });
  } catch (err) { next(err); }
});

router.get('/history', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT id, title, body, created_at FROM notification_history WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
