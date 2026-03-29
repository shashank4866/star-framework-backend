const express = require('express');
const db = require('../config/db');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();
router.use(authMiddleware);

// Fetch Powers configured for user's current level
router.get('/powers', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT p.*, (up.completed_at IS NOT NULL) as is_completed
      FROM powers p
      JOIN users u ON u.id = $1
      LEFT JOIN user_powers up ON up.power_id = p.id AND up.user_id = u.id
      WHERE p.level_id = u.level_id
      ORDER BY p.name
    `, [req.user.id]);
    res.json(rows);
  } catch (err) { next(err); }
});

// Fetch Capabilities per power
router.get('/powers/:power_id/capabilities', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM capabilities WHERE power_id = $1 ORDER BY name', [req.params.power_id]);
    res.json(rows);
  } catch (err) { next(err); }
});

// Fetch Tasks per capability
router.get('/capabilities/:cap_id/tasks', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM tasks WHERE capability_id = $1 ORDER BY name', [req.params.cap_id]);
    res.json(rows);
  } catch (err) { next(err); }
});

// Fetch Subtasks per task (include completion status and assessment link)
router.get('/tasks/:task_id/subtasks', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT s.*, 
        (us.completed_at IS NOT NULL) as is_completed,
        a.id as assessment_id,
        (SELECT status FROM assessment_attempts aa WHERE aa.user_id = $1 AND aa.assessment_id = a.id ORDER BY start_time DESC LIMIT 1) as latest_attempt_status,
        (SELECT total_score FROM assessment_attempts aa WHERE aa.user_id = $1 AND aa.assessment_id = a.id ORDER BY start_time DESC LIMIT 1) as latest_attempt_score,
        (SELECT id FROM assessment_attempts aa WHERE aa.user_id = $1 AND aa.assessment_id = a.id ORDER BY start_time DESC LIMIT 1) as latest_attempt_id
      FROM subtasks s
      LEFT JOIN user_subtasks us ON us.subtask_id = s.id AND us.user_id = $1
      LEFT JOIN assessments a ON a.subtask_id = s.id
      WHERE s.task_id = $2
      ORDER BY s.name
    `, [req.user.id, req.params.task_id]);
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
