-- PERFORMANCE OPTIMIZATION (INDEXING)
CREATE INDEX IF NOT EXISTS idx_assessment_attempts_user_id ON assessment_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_assessment_attempts_assessment_id ON assessment_attempts(assessment_id);
CREATE INDEX IF NOT EXISTS idx_attempt_questions_attempt_id ON attempt_questions(attempt_id);
CREATE INDEX IF NOT EXISTS idx_attempt_options_attempt_id ON attempt_options(attempt_id);
CREATE INDEX IF NOT EXISTS idx_user_answers_attempt_id ON user_answers(attempt_id);

-- ASSESSMENT SCORING IMPROVEMENTS
ALTER TABLE assessment_attempts ADD COLUMN IF NOT EXISTS total_score INT;
ALTER TABLE user_answers ADD COLUMN IF NOT EXISTS is_correct BOOLEAN;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS marks INT DEFAULT 1;

-- ANTI-CHEAT TRACKING
ALTER TABLE assessment_attempts ADD COLUMN IF NOT EXISTS violations INT DEFAULT 0;

-- TIMESTAMP CONSISTENCY
ALTER TABLE user_answers ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE attempt_questions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE attempt_options ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- SOFT DELETE SUPPORT (OPTIONAL)
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
