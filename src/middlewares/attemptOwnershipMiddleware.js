const db = require('../config/db');

module.exports = async (req, res, next) => {
  const attemptId = req.params.attempt_id || req.body.attempt_id;
  if (!attemptId) return res.status(400).json({ error: 'Attempt ID required' });

  try {
    const { rows } = await db.query('SELECT user_id FROM assessment_attempts WHERE id = $1', [attemptId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Attempt not found' });

    const ownerId = rows[0].user_id;
    if (req.user.id !== ownerId && req.user.roleName !== 'Architect') {
      return res.status(403).json({ error: 'Forbidden: You do not own this attempt and are not an Architect' });
    }
    
    // Pass the fetched attempt details to the request object if helpful later
    req.attemptOwnerId = ownerId;
    next();
  } catch (err) {
    next(err);
  }
};
