const express = require('express');
const db = require('../config/db');
const authMiddleware = require('../middlewares/authMiddleware');
const attemptOwnershipMiddleware = require('../middlewares/attemptOwnershipMiddleware');
const { sendNotification } = require('../config/firebase');

const router = express.Router();
router.use(authMiddleware);

// helper function to shuffle array
function shuffle(array) {
  let currentIndex = array.length, randomIndex;
  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
  return array;
}

// Start Assessment -> Snapshot
router.post('/start/:assessment_id', async (req, res, next) => {
  const client = await db.getClient();
  try {
    const { assessment_id } = req.params;
    const user_id = req.user.id;

    await client.query('BEGIN');

    // 1. Fetch assessment
    const { rows: assessmentRows } = await client.query('SELECT time_limit_minutes FROM assessments WHERE id = $1', [assessment_id]);
    if (assessmentRows.length === 0) throw new Error('Assessment not found');
    const { time_limit_minutes } = assessmentRows[0];
    
    // 2. Determine Attempt Number
    const { rows: attemptsRows } = await client.query('SELECT MAX(attempt_number) as max_num FROM assessment_attempts WHERE user_id = $1 AND assessment_id = $2', [user_id, assessment_id]);
    const attempt_number = (attemptsRows[0].max_num || 0) + 1;

    // 3. Create Attempt
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + time_limit_minutes * 60000);

    const { rows: newAttempt } = await client.query(
      `INSERT INTO assessment_attempts (user_id, assessment_id, status, attempt_number, start_time, end_time, violations, total_score)
       VALUES ($1, $2, 'in_progress', $3, $4, $5, 0, 0) RETURNING id`,
      [user_id, assessment_id, attempt_number, startTime, endTime]
    );
    const attempt_id = newAttempt[0].id;

    // 4. Fetch Questions
    const { rows: questions } = await client.query('SELECT id, type, marks FROM questions WHERE assessment_id = $1 ORDER BY RANDOM()', [assessment_id]);
    
    // 5. Insert Snapshot mapping
    for (let qIndex = 0; qIndex < questions.length; qIndex++) {
      const q = questions[qIndex];
      await client.query('INSERT INTO attempt_questions (attempt_id, question_id, order_index) VALUES ($1, $2, $3)', [attempt_id, q.id, qIndex]);
      
      if (q.type === 'MCQ') {
        const { rows: options } = await client.query('SELECT id FROM options WHERE question_id = $1', [q.id]);
        shuffle(options);
        for (let oIndex = 0; oIndex < options.length; oIndex++) {
          await client.query('INSERT INTO attempt_options (attempt_id, question_id, option_id, order_index) VALUES ($1, $2, $3, $4)', [attempt_id, q.id, options[oIndex].id, oIndex]);
        }
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ attempt_id, start_time: startTime, end_time: endTime });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// Fetch Snapshot
router.get('/attempt/:attempt_id', attemptOwnershipMiddleware, async (req, res, next) => {
  try {
    const attempt_id = req.params.attempt_id;
    const attRes = await db.query('SELECT status, end_time FROM assessment_attempts WHERE id = $1', [attempt_id]);
    if (attRes.rows[0].status !== 'in_progress') return res.status(403).json({ error: 'Attempt closed' });

    const clientNow = new Date();
    const endTime = new Date(attRes.rows[0].end_time);
    if (clientNow > endTime && clientNow.getTime() - endTime.getTime() > 1000 * 60) {
       return res.status(403).json({ error: 'Timer securely expired' });
    }

    const { rows: qs } = await db.query(`
      SELECT aq.question_id, q.text, q.type, q.marks, aq.order_index
      FROM attempt_questions aq
      JOIN questions q ON q.id = aq.question_id
      WHERE aq.attempt_id = $1
      ORDER BY aq.order_index ASC
    `, [attempt_id]);

    const { rows: os } = await db.query(`
      SELECT ao.question_id, ao.option_id, o.text, ao.order_index
      FROM attempt_options ao
      JOIN options o ON o.id = ao.option_id
      WHERE ao.attempt_id = $1
      ORDER BY ao.order_index ASC
    `, [attempt_id]);

    const displayQuestions = qs.map(q => {
      const inlineOptions = os.filter(o => o.question_id === q.question_id);
      return { ...q, options: inlineOptions };
    });

    res.json(displayQuestions);
  } catch (err) { next(err); }
});

// Submit user answers
router.post('/attempt/:attempt_id/submit', attemptOwnershipMiddleware, async (req, res, next) => {
  const client = await db.getClient();
  try {
    const attempt_id = req.params.attempt_id;
    const { answers, violations } = req.body; 

    await client.query('BEGIN');

    const attRes = await client.query('SELECT status, end_time, total_score FROM assessment_attempts WHERE id = $1', [attempt_id]);
    const attempt = attRes.rows[0];
    if (attempt.status !== 'in_progress') throw new Error('Attempt not in progress');

    if (new Date() > new Date(attempt.end_time.getTime() + 60000)) {
        throw new Error('Timer expired. Submission rejected.');
    }

    let hasSubjective = false;
    let autoScoreSum = attempt.total_score || 0;

    for (const ans of answers) {
       // Identify question details
       const qRes = await client.query('SELECT type, marks FROM questions WHERE id = $1', [ans.question_id]);
       if (qRes.rows.length === 0) continue; // Skip orphaned answers

       const qType = qRes.rows[0].type;
       const qMarks = qRes.rows[0].marks || 1;
       
       let finalScore = 0;
       let isCorrect = null;

       if (qType === 'LOG' || qType === 'F2F') {
          hasSubjective = true;
       }
       
       if (qType === 'MCQ') {
          const optionRes = await client.query('SELECT is_correct FROM options WHERE id = $1', [ans.selected_option_id]);
          isCorrect = (optionRes.rows.length > 0 && optionRes.rows[0].is_correct);
          finalScore = isCorrect ? qMarks : 0;
          autoScoreSum += finalScore;
       }

       await client.query(`
         INSERT INTO user_answers (attempt_id, question_id, selected_option_id, answer_text, score, is_correct)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (attempt_id, question_id) 
         DO UPDATE SET selected_option_id = EXCLUDED.selected_option_id, answer_text = EXCLUDED.answer_text, score = EXCLUDED.score, is_correct = EXCLUDED.is_correct
       `, [attempt_id, ans.question_id, ans.selected_option_id, ans.answer_text, finalScore, isCorrect]);
    }

    const nextStatus = hasSubjective ? 'pending_review' : 'evaluated';
    
    // Update attempts with tab violations and summed score
    await client.query('UPDATE assessment_attempts SET status = $1, violations = $2, total_score = $3 WHERE id = $4', 
        [nextStatus, violations || 0, autoScoreSum, attempt_id]);

    await client.query('COMMIT');

    // Notify Architects silently in the background
    process.nextTick(async () => {
         try {
            // Fetch user data explicitly for organic payload string
            const { rows: uRows } = await db.query('SELECT name FROM users WHERE id = $1', [req.user.id]);
            const traineeName = uRows[0]?.name || 'A Trainee';
            
            const actionText = nextStatus === 'pending_review' ? 'requiring your subjective review!' : 'which has been auto-evaluated.';
            
            const { rows: archs } = await db.query("SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'Architect'");
            archs.forEach(arch => {
               sendNotification(arch.id, '⏳ Assessment Completed!', `${traineeName} has securely submitted an assessment ${actionText}`)
                 .catch(err => console.error('Background Architecture push failed:', err));
            });
         } catch(err) { console.error('Silent Notification Error', err); }
    });

    res.json({ message: 'Answers submitted', status: nextStatus, total_score: autoScoreSum });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
