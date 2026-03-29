const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function run() {
  const isRemote = !!process.env.DATABASE_URL;

  if (!isRemote) {
    // First, connect to default postgres DB to potentially create the target DB
    const clientMaster = new Client({
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      database: 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      port: process.env.DB_PORT || 5432,
    });

    try {
      await clientMaster.connect();
      console.log('Connected to master postgres DB.');
      const dbName = process.env.DB_NAME || 'lms3';
      
      const res = await clientMaster.query(`SELECT datname FROM pg_database WHERE datname = '${dbName}';`);
      if (res.rowCount === 0) {
        console.log(`Database ${dbName} does not exist. Creating...`);
        await clientMaster.query(`CREATE DATABASE ${dbName};`);
        console.log(`Database ${dbName} created.`);
      } else {
        console.log(`Database ${dbName} already exists.`);
      }
    } catch (err) {
      console.error('Master Client Error:', err);
    } finally {
      await clientMaster.end();
    }
  } else {
    console.log('Remote DATABASE_URL detected. Skipping local DB creation.');
  }

  // Connect to target database
  const targetConfig = isRemote ? {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  } : {
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'lms3',
    password: process.env.DB_PASSWORD || 'postgres',
    port: process.env.DB_PORT || 5432,
  };

  const clientTarget = new Client(targetConfig);

  try {
    await clientTarget.connect();
    console.log('Connected to target DB.');

    const initSql = fs.readFileSync(path.join(__dirname, 'src/schema/init.sql'), 'utf-8');
    await clientTarget.query(initSql);
    console.log('init.sql executed successfully.');

    // Write some basic seed data
    const seedSql = `
      INSERT INTO roles (name) VALUES ('System Designer'), ('System Engineer'), ('Architect') ON CONFLICT (name) DO NOTHING;
      INSERT INTO levels (name, rank_order) VALUES 
        ('Trainee', 1), ('Associate', 2), ('Lead', 3), ('Expert', 4), ('Architect', 5), ('Principal', 6) 
      ON CONFLICT (rank_order) DO NOTHING;
    `;
    await clientTarget.query(seedSql);
    console.log('Basic roles and levels seeded.');

  } catch (err) {
    console.error('Target Client Error:', err);
  } finally {
    await clientTarget.end();
  }
}

run();
