const express = require('express');
const db = require('../config/db');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const { sendNotification } = require('../config/firebase');

const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware(['Architect', 'System Designer']));

router.get('/pending', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT aa.id as attempt_id, aa.total_score, aa.status, aa.start_time, aa.violations,
             u.name as user_name, u.email as user_email, l.name as level_name,
             a.title as assessment_title,
             a.id as assessment_id
      FROM assessment_attempts aa
      JOIN users u ON u.id = aa.user_id
      JOIN levels l ON u.level_id = l.id
      JOIN assessments a ON a.id = aa.assessment_id
      WHERE aa.status IN ('pending_review', 'evaluated')
      ORDER BY aa.start_time DESC
    `);
    res.json(rows);
  } catch (err) { 
    console.error('[Architect] Error fetching pending reviews:', err.message);
    next(err); 
  }
});

router.get('/users', async (req, res, next) => {
  try {
     const { rows } = await db.query(`
       SELECT u.id, u.name, u.email, l.name as level_name
       FROM users u
       JOIN levels l ON l.id = u.level_id
       JOIN roles r ON r.id = u.role_id
       WHERE r.name != 'Architect' AND r.name != 'System Designer'
       ORDER BY u.name
     `);
     res.json(rows);
  } catch(err) { 
    console.error('[Architect] Error fetching global user matrix:', err.message);
    next(err); 
  }
});

router.post('/assign-badge', async (req, res, next) => {
  try {
     const { user_id, badge_name } = req.body;
     await db.query(`
        INSERT INTO assigned_badges (user_id, architect_id, badge_name) 
        VALUES ($1, $2, $3)
     `, [user_id, req.user.id, badge_name]);

     // Trigger Push Notification instantly!
     console.log(`[Architect] Dispatching badge notification to user ${user_id}...`);
     await sendNotification(user_id, '🏅 New Badge Awarded!', `Architect granted you the ${badge_name} badge! Check your Dashboard!`);
     res.json({ message: 'Badge natively mapped successfully.' });
  } catch(err) { 
    console.error('[Architect] Badge assignment failed:', err.message);
    next(err); 
  }
});

router.get('/attempt/:attempt_id', async (req, res, next) => {
  try {
    const attempt_id = req.params.attempt_id;
    
    const attRes = await db.query('SELECT status, violations, total_score FROM assessment_attempts WHERE id = $1', [attempt_id]);
    if (attRes.rows.length === 0) return res.status(404).json({ error: 'Attempt not found' });

    const { rows: qs } = await db.query(`
      SELECT aq.question_id, q.text, q.type, q.marks, aq.order_index, ua.selected_option_id, ua.answer_text, ua.score as grade, ua.is_correct
      FROM attempt_questions aq
      JOIN questions q ON q.id = aq.question_id
      LEFT JOIN user_answers ua ON ua.attempt_id = aq.attempt_id AND ua.question_id = aq.question_id
      WHERE aq.attempt_id = $1
      ORDER BY aq.order_index ASC
    `, [attempt_id]);

    const { rows: os } = await db.query(`
      SELECT ao.question_id, ao.option_id, o.text, ao.order_index, o.is_correct
      FROM attempt_options ao
      JOIN options o ON o.id = ao.option_id
      WHERE ao.attempt_id = $1
      ORDER BY ao.order_index ASC
    `, [attempt_id]);

    const displayQuestions = qs.map(q => {
      const inlineOptions = os.filter(o => o.question_id === q.question_id);
      return { ...q, options: inlineOptions };
    });

    res.json({
        attempt: attRes.rows[0],
        questions: displayQuestions
    });
  } catch(err) { 
    console.error('[Architect] Error fetching attempt replay:', err.message);
    next(err); 
  }
});

router.post('/attempt/:attempt_id/evaluate', async (req, res, next) => {
  const client = await db.getClient();
  try {
    const attempt_id = req.params.attempt_id;
    const { evaluations, overall_feedback } = req.body;

    await client.query('BEGIN');

    const attRes = await client.query('SELECT status, total_score, user_id FROM assessment_attempts WHERE id = $1 FOR UPDATE', [attempt_id]);
    if (attRes.rows.length === 0) throw new Error('Attempt not found');
    if (!['pending_review', 'submitted', 'evaluated'].includes(attRes.rows[0].status)) {
       throw new Error('Attempt is not in a valid state for architectural review');
    }

    await client.query(`
      INSERT INTO assessment_reviews (attempt_id, architect_id, overall_feedback)
      VALUES ($1, $2, $3)
      ON CONFLICT (attempt_id)
      DO UPDATE SET architect_id = EXCLUDED.architect_id, overall_feedback = EXCLUDED.overall_feedback
    `, [attempt_id, req.user.id, overall_feedback]);

    for (const ev of evaluations) {
      const val = parseInt(ev.score) || 0;
      await client.query(`
        INSERT INTO user_answers (attempt_id, question_id, score, reviewer_feedback)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (attempt_id, question_id) 
        DO UPDATE SET score = EXCLUDED.score, reviewer_feedback = EXCLUDED.reviewer_feedback
      `, [attempt_id, ev.question_id, val, ev.reviewer_feedback]);
    }

    // Recalculate true total score securely
    await client.query(`
      UPDATE assessment_attempts 
      SET status = 'evaluated', 
          total_score = (SELECT COALESCE(SUM(score), 0) FROM user_answers WHERE attempt_id = $1) 
      WHERE id = $1
    `, [attempt_id]);

    await client.query('COMMIT');

    // Trigger FCM Evaluation Notification
    console.log(`[Architect] Dispatching evaluation notification to user ${attRes.rows[0].user_id}...`);
    try {
      await sendNotification(attRes.rows[0].user_id, '📝 Assessment Evaluated!', 'Your latest submission has been reviewed. View your Badge Progress!');
    } catch (fcmErr) {
      console.warn('[Architect] Notification dispatch failed but evaluation saved:', fcmErr.message);
    }
    
    res.json({ message: 'Review successfully submitted' });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    console.error('[Architect] Evaluation submission failed:', err.message);
    next(err);
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
