const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
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
    console.log('Connected to lms3 DB for migrations.');

    const alterSql = fs.readFileSync(path.join(__dirname, 'src/schema/alter.sql'), 'utf-8');
    await client.query(alterSql);
    console.log('alter.sql executed successfully.');

  } catch (err) {
    console.error('Migration Error:', err);
  } finally {
    await client.end();
  }
}
run();
