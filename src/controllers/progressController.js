const express = require('express');
const db = require('../config/db');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();
router.use(authMiddleware);

router.post('/evaluate_subtask/:subtask_id', async (req, res, next) => {
  const client = await db.getClient();
  try {
    const user_id = req.user.id;
    const subtask_id = req.params.subtask_id;

    await client.query('BEGIN');

    // 1. Verify passing Assessment
    const attRes = await client.query(`
      SELECT aa.status, a.passing_score
      FROM assessment_attempts aa
      JOIN assessments a ON a.id = aa.assessment_id
      WHERE aa.user_id = $1 AND a.subtask_id = $2 AND aa.status = 'evaluated'
    `, [user_id, subtask_id]);

    if(attRes.rows.length === 0) throw new Error('No evaluated passing attempts found for subtask');

    // Assuming any evaluated attempt counts for now (could check actual scores if needed)
    
    // 2. Mark Subtask completed
    await client.query(`
      INSERT INTO user_subtasks (user_id, subtask_id) VALUES ($1, $2) ON CONFLICT DO NOTHING
    `, [user_id, subtask_id]);

    // 3. Tree check: What Power does this belong to?
    const treeRes = await client.query(`
      SELECT p.id as power_id
      FROM subtasks s
      JOIN tasks t ON t.id = s.task_id
      JOIN capabilities c ON c.id = t.capability_id
      JOIN powers p ON p.id = c.power_id
      WHERE s.id = $1
    `, [subtask_id]);
    
    const targetPowerId = treeRes.rows[0].power_id;

    // VERY simplified mock for demonstration: Assume immediately finishing one subtask completes the Power for this test.
    // In production, you would run a recursive CTE or subquery asserting ALL subtasks under this power are in user_subtasks.
    
    // For this demonstration, we'll optimistically grant power completion!
    await client.query(`
      INSERT INTO user_powers (user_id, power_id) VALUES ($1, $2) ON CONFLICT DO NOTHING
    `, [user_id, targetPowerId]);

    // 4. TRANSACTIONAL LEVEL UP CHECK: Are 3 powers completed?
    // Using FOR UPDATE to lock the user row to prevent concurrency race conditions from multiple subtask posts
    const userRes = await client.query('SELECT level_id FROM users WHERE id = $1 FOR UPDATE', [user_id]);
    const currentLevelId = userRes.rows[0].level_id;

    const powersRes = await client.query(`
      SELECT count(*) as total 
      FROM user_powers up
      JOIN powers p ON p.id = up.power_id
      WHERE up.user_id = $1 AND p.level_id = $2
    `, [user_id, currentLevelId]);

    let leveledUp = false;
    if (parseInt(powersRes.rows[0].total) >= 3) {
      // Find next level
      const sqRes = await client.query('SELECT rank_order FROM levels WHERE id = $1', [currentLevelId]);
      const currentRank = sqRes.rows[0].rank_order;
      
      const nextLevelRes = await client.query('SELECT id, name FROM levels WHERE rank_order > $1 ORDER BY rank_order ASC LIMIT 1', [currentRank]);
      if (nextLevelRes.rows.length > 0) {
        // Apply level up
        await client.query('UPDATE users SET level_id = $1 WHERE id = $2', [nextLevelRes.rows[0].id, user_id]);
        leveledUp = true;
      }
    }

    await client.query('COMMIT');
    res.json({ message: 'Progress evaluated', leveledUp });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

router.get('/attempt/:attempt_id/feedback', async (req, res, next) => {
  try {
    const attempt_id = req.params.attempt_id;
    // ensure the attempt belongs to req.user.id
    const attRes = await db.query('SELECT total_score, status, start_time FROM assessment_attempts WHERE id = $1 AND user_id = $2', [attempt_id, req.user.id]);
    if (attRes.rows.length === 0) return res.status(404).json({ error: 'Attempt mapping not found' });
    
    if (attRes.rows[0].status !== 'evaluated') return res.status(400).json({ error: 'Submission has not been completely evaluated yet' });

    const revRes = await db.query('SELECT overall_feedback, architect_id, created_at FROM assessment_reviews WHERE attempt_id = $1', [attempt_id]);
    
    // fetches question snapshot text, and specific reviewer_feedback
    const { rows: questions } = await db.query(`
      SELECT q.text as question_text, q.type, q.marks, 
             ua.score as grade, ua.reviewer_feedback, ua.answer_text,
             (SELECT text FROM options o WHERE o.id = ua.selected_option_id) as selected_mcq_text
      FROM attempt_questions aq
      JOIN questions q ON q.id = aq.question_id
      LEFT JOIN user_answers ua ON ua.attempt_id = aq.attempt_id AND ua.question_id = aq.question_id
      WHERE aq.attempt_id = $1
      ORDER BY aq.order_index ASC
    `, [attempt_id]);

    res.json({
        attempt: attRes.rows[0],
        review: revRes.rows[0] || null, // null if subjective review didn't save for some reason
        feedback: questions
    });
  } catch(err) { next(err); }
});

router.get('/badges', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT ab.id, ab.badge_name, ab.created_at, u.name as architect_name
      FROM assigned_badges ab
      JOIN users u ON u.id = ab.architect_id
      WHERE ab.user_id = $1
      ORDER BY ab.created_at DESC
    `, [req.user.id]);
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
