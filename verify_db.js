const db = require('./src/config/db');

async function testConnection() {
  try {
    const res = await db.query('SELECT NOW(), count(*) FROM users');
    console.log('Connection successful!');
    console.log('Current Time:', res.rows[0].now);
    console.log('User Count:', res.rows[0].count);
    process.exit(0);
  } catch (err) {
    console.error('Connection failed:', err);
    process.exit(1);
  }
}

testConnection();
