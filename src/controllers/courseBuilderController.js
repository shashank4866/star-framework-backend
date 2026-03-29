const express = require('express');
const db = require('../config/db');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');

const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware(['Architect', 'System Designer']));

// Get all mapped global levels
router.get('/levels', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM levels ORDER BY rank_order');
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/powers', async (req, res, next) => {
  try {
    const { name, level_id } = req.body;
    const { rows } = await db.query('INSERT INTO powers (name, level_id) VALUES ($1, $2) RETURNING *', [name, level_id]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.post('/capabilities', async (req, res, next) => {
  try {
    const { name, power_id } = req.body;
    const { rows } = await db.query('INSERT INTO capabilities (name, power_id) VALUES ($1, $2) RETURNING *', [name, power_id]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.post('/tasks', async (req, res, next) => {
  try {
    const { name, capability_id } = req.body;
    const { rows } = await db.query('INSERT INTO tasks (name, capability_id) VALUES ($1, $2) RETURNING *', [name, capability_id]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.post('/subtasks', async (req, res, next) => {
  try {
    const { name, task_id } = req.body;
    const { rows } = await db.query('INSERT INTO subtasks (name, task_id) VALUES ($1, $2) RETURNING *', [name, task_id]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.post('/assessments', async (req, res, next) => {
  try {
    const { title, subtask_id, time_limit_minutes, passing_score } = req.body;
    const { rows } = await db.query('INSERT INTO assessments (title, subtask_id, time_limit_minutes, passing_score) VALUES ($1, $2, $3, $4) RETURNING *', [title, subtask_id, time_limit_minutes || 30, passing_score || 0]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.post('/questions', async (req, res, next) => {
  try {
    const { assessment_id, text, type, marks } = req.body;
    const { rows } = await db.query("INSERT INTO questions (assessment_id, text, type, marks) VALUES ($1, $2, $3, $4) RETURNING *", [assessment_id, text, type, marks || 10]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.post('/options', async (req, res, next) => {
  try {
    const { question_id, text, is_correct } = req.body;
    const { rows } = await db.query('INSERT INTO options (question_id, text, is_correct) VALUES ($1, $2, $3) RETURNING *', [question_id, text, is_correct || false]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.post('/bulk-csv', async (req, res, next) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const records = req.body.payload;

    for (const r of records) {
      if (!r.LevelName || !r.PowerName) continue;
      
      let lRes = await client.query('SELECT id FROM levels WHERE name = $1', [r.LevelName]);
      if (lRes.rows.length === 0) throw new Error(`Level '${r.LevelName}' not found in DB`);
      const level_id = lRes.rows[0].id;

      let power_id;
      if (r.PowerName) {
         let pRes = await client.query('INSERT INTO powers (name, level_id) VALUES ($1, $2) ON CONFLICT (name, level_id) DO UPDATE SET name=EXCLUDED.name RETURNING id', [r.PowerName, level_id]);
         power_id = pRes.rows[0].id;
      }
      
      let cap_id;
      if (r.CapabilityName && power_id) {
         let cRes = await client.query('INSERT INTO capabilities (name, power_id) VALUES ($1, $2) ON CONFLICT (name, power_id) DO UPDATE SET name=EXCLUDED.name RETURNING id', [r.CapabilityName, power_id]);
         cap_id = cRes.rows[0].id;
      }

      let task_id;
      if (r.TaskName && cap_id) {
         let tRes = await client.query('INSERT INTO tasks (name, capability_id) VALUES ($1, $2) ON CONFLICT (name, capability_id) DO UPDATE SET name=EXCLUDED.name RETURNING id', [r.TaskName, cap_id]);
         task_id = tRes.rows[0].id;
      }

      let subtask_id;
      if (r.SubtaskName && task_id) {
         let stRes = await client.query('INSERT INTO subtasks (name, task_id) VALUES ($1, $2) ON CONFLICT (name, task_id) DO UPDATE SET name=EXCLUDED.name RETURNING id', [r.SubtaskName, task_id]);
         subtask_id = stRes.rows[0].id;
      }

      let assess_id;
      if (r.AssessmentTitle && subtask_id) {
         let aRes = await client.query('INSERT INTO assessments (title, subtask_id, time_limit_minutes, passing_score) VALUES ($1, $2, $3, $4) ON CONFLICT (subtask_id) DO UPDATE SET title=EXCLUDED.title, time_limit_minutes=EXCLUDED.time_limit_minutes, passing_score=EXCLUDED.passing_score RETURNING id', [r.AssessmentTitle, subtask_id, parseInt(r.TimeLimitMins)||30, parseInt(r.PassingScore)||0]);
         assess_id = aRes.rows[0].id;
      }

      let question_id;
      if (r.QuestionText && r.QuestType && assess_id) {
         let qCheck = await client.query('SELECT id FROM questions WHERE assessment_id = $1 AND text = $2', [assess_id, r.QuestionText]);
         if (qCheck.rows.length > 0) {
            question_id = qCheck.rows[0].id;
         } else {
            let qRes = await client.query('INSERT INTO questions (assessment_id, text, type, marks) VALUES ($1, $2, $3, $4) RETURNING id', [assess_id, r.QuestionText, r.QuestType.toUpperCase().trim(), parseInt(r.QuestMarks)||10]);
            question_id = qRes.rows[0].id;
         }
      }

      if (r.OptionText && question_id) {
         let oCheck = await client.query('SELECT id FROM options WHERE question_id = $1 AND text = $2', [question_id, r.OptionText]);
         if (oCheck.rows.length === 0) {
            await client.query('INSERT INTO options (question_id, text, is_correct) VALUES ($1, $2, $3)', [question_id, r.OptionText, String(r.OptionIsCorrect).toLowerCase() === 'true']);
         }
      }
    }
    
    await client.query('COMMIT');
    res.json({ message: 'Mass Matrix Build Successful', records: records.length });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
