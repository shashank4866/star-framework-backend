const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL environment variable is missing!');
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to Render database for migration.');

    const alterSqlPath = path.join(__dirname, 'src/schema/alter.sql');
    if (!fs.existsSync(alterSqlPath)) {
        throw new Error(`Migration file not found at ${alterSqlPath}`);
    }

    const alterSql = fs.readFileSync(alterSqlPath, 'utf-8');
    console.log('Applying migration script...');
    await client.query(alterSql);
    console.log('✅ Migration applied successfully!');

  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    if (err.detail) console.error('Detail:', err.detail);
  } finally {
    await client.end();
  }
}

run();
