CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ROLES
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(50) UNIQUE NOT NULL
);

-- LEVELS
CREATE TABLE levels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(50) UNIQUE NOT NULL,
  rank_order INT UNIQUE NOT NULL
);

-- USERS
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role_id UUID REFERENCES roles(id) ON DELETE RESTRICT,
  level_id UUID REFERENCES levels(id) ON DELETE RESTRICT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- POWERS
CREATE TABLE powers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  level_id UUID REFERENCES levels(id) ON DELETE CASCADE,
  UNIQUE(name, level_id)
);

-- CAPABILITIES
CREATE TABLE capabilities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  power_id UUID REFERENCES powers(id) ON DELETE CASCADE,
  UNIQUE(name, power_id)
);

-- TASKS
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  capability_id UUID REFERENCES capabilities(id) ON DELETE CASCADE,
  UNIQUE(name, capability_id)
);

-- SUBTASKS
CREATE TABLE subtasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  UNIQUE(name, task_id)
);

-- ASSESSMENTS
CREATE TABLE assessments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subtask_id UUID UNIQUE REFERENCES subtasks(id) ON DELETE CASCADE,
  title VARCHAR(150),
  time_limit_minutes INT DEFAULT 30,
  passing_score INT DEFAULT 0
);

-- QUESTIONS
CREATE TABLE questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assessment_id UUID REFERENCES assessments(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  type VARCHAR(20) CHECK (type IN ('MCQ', 'LOG', 'F2F')) NOT NULL
);

-- OPTIONS
CREATE TABLE options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  is_correct BOOLEAN DEFAULT false
);

-- ASSESSMENT ATTEMPTS
CREATE TABLE assessment_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  assessment_id UUID REFERENCES assessments(id) ON DELETE CASCADE,
  start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  end_time TIMESTAMP,
  status VARCHAR(30) CHECK (status IN ('in_progress', 'submitted', 'pending_review', 'evaluated')) DEFAULT 'in_progress',
  attempt_number INT DEFAULT 1,
  UNIQUE(user_id, assessment_id, attempt_number)
);

-- ATTEMPT QUESTIONS SNAPSHOT
CREATE TABLE attempt_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  attempt_id UUID REFERENCES assessment_attempts(id) ON DELETE CASCADE,
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  order_index INT NOT NULL,
  UNIQUE(attempt_id, question_id),
  UNIQUE(attempt_id, order_index)
);

-- ATTEMPT OPTIONS SNAPSHOT
CREATE TABLE attempt_options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  attempt_id UUID REFERENCES assessment_attempts(id) ON DELETE CASCADE,
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  option_id UUID REFERENCES options(id) ON DELETE CASCADE,
  order_index INT NOT NULL,
  UNIQUE(attempt_id, question_id, option_id),
  UNIQUE(attempt_id, question_id, order_index)
);

-- USER ANSWERS
CREATE TABLE user_answers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  attempt_id UUID REFERENCES assessment_attempts(id) ON DELETE CASCADE,
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  selected_option_id UUID REFERENCES options(id) ON DELETE SET NULL, -- for MCQ
  answer_text TEXT, -- for LOG
  score INT, -- for LOG grading
  reviewer_feedback TEXT, -- for subjective LOG/F2F feedback per question
  UNIQUE(attempt_id, question_id)
);

-- ASSESSMENT REVIEWS
CREATE TABLE assessment_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  attempt_id UUID UNIQUE REFERENCES assessment_attempts(id) ON DELETE CASCADE,
  architect_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  overall_feedback TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- USER SUBTASKS PROGRESS
CREATE TABLE user_subtasks (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  subtask_id UUID REFERENCES subtasks(id) ON DELETE CASCADE,
  completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, subtask_id)
);

-- USER POWERS PROGRESS
CREATE TABLE user_powers (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  power_id UUID REFERENCES powers(id) ON DELETE CASCADE,
  completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, power_id)
);
