const { Client } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

async function run() {
  const isRemote = !!process.env.DATABASE_URL;
  const config = isRemote ? {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  } : {
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'lms3',
    password: process.env.DB_PASSWORD || 'admin',
    port: process.env.DB_PORT || 5432,
  };

  const client = new Client(config);

  try {
    await client.connect();
    console.log('Connected to lms3 DB to inject mock data...');

    const pash = await bcrypt.hash('password123', 10);

    // Fetch Roles & Levels
    const { rows: roles } = await client.query('SELECT * FROM roles');
    const archRole = roles.find(r => r.name === 'Architect');
    const sysRole = roles.find(r => r.name === 'System Designer');

    const { rows: levels } = await client.query('SELECT * FROM levels ORDER BY rank_order');
    const traineeLvl = levels.find(l => l.name === 'Trainee');
    const archLvl = levels.find(l => l.name === 'Architect');

    // 1. Users
    const { rows: user1 } = await client.query(
      `INSERT INTO users (name, email, password_hash, role_id, level_id) 
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (email) DO NOTHING RETURNING id`,
      ['Alice Trainee', 'alice@test.com', pash, sysRole.id, traineeLvl.id]
    );
    const { rows: user2 } = await client.query(
      `INSERT INTO users (name, email, password_hash, role_id, level_id) 
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (email) DO NOTHING RETURNING id`,
      ['Bob Architect', 'bob@test.com', pash, archRole.id, archLvl.id]
    );

    // 2. Clear old hierarchy to prevent dupes if they re-run
    await client.query('TRUNCATE powers CASCADE');
    await client.query('TRUNCATE assessments CASCADE');

    // 3. Powers
    const { rows: pwr1 } = await client.query("INSERT INTO powers (name, level_id) VALUES ('Tech Mastery', $1) RETURNING id", [traineeLvl.id]);

    // 4. Capabilities
    const { rows: cap1 } = await client.query("INSERT INTO capabilities (power_id, name) VALUES ($1, 'Javascript Fundamentals') RETURNING id", [pwr1[0].id]);

    // 5. Tasks
    const { rows: tsk1 } = await client.query("INSERT INTO tasks (capability_id, name) VALUES ($1, 'ES6 Syntax') RETURNING id", [cap1[0].id]);

    // 6. Subtasks
    const { rows: sub1 } = await client.query("INSERT INTO subtasks (task_id, name) VALUES ($1, 'Complete JS Exam') RETURNING id", [tsk1[0].id]);

    // 7. Assessments
    const { rows: ast1 } = await client.query("INSERT INTO assessments (subtask_id, title, time_limit_minutes) VALUES ($1, 'Initial JS Exam', 15) RETURNING id", [sub1[0].id]);

    // 8. Questions & Options
    const { rows: q1 } = await client.query("INSERT INTO questions (assessment_id, type, marks, text) VALUES ($1, 'MCQ', 10, 'What keyword is used to declare a constant in JS?') RETURNING id", [ast1[0].id]);
    await client.query("INSERT INTO options (question_id, text, is_correct) VALUES ($1, 'const', true), ($1, 'var', false), ($1, 'let', false)", [q1[0].id]);

    const { rows: q2 } = await client.query("INSERT INTO questions (assessment_id, type, marks, text) VALUES ($1, 'MCQ', 20, 'Which array method removes the last element?') RETURNING id", [ast1[0].id]);
    await client.query("INSERT INTO options (question_id, text, is_correct) VALUES ($1, 'pop()', true), ($1, 'push()', false), ($1, 'shift()', false)", [q2[0].id]);

    const { rows: q3 } = await client.query("INSERT INTO questions (assessment_id, type, marks, text) VALUES ($1, 'LOG', 50, 'Explain Event Loops in NodeJS.') RETURNING id", [ast1[0].id]);
    
    console.log('Mock Hierarchy & Assessment explicitly seeded!');
    console.log('Login credentials:');
    console.log('Trainee -> alice@test.com / password123');
    console.log('Architect -> bob@test.com / password123');

  } catch (err) {
    console.error('Error during seeding:', err);
  } finally {
    await client.end();
  }
}
run();
