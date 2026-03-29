const db = require('./src/config/db');

(async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS notification_history (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Assembled explicit notification_history mapping successfully');
    process.exit(0);
  } catch (err) { 
    console.error(err); 
    process.exit(1); 
  }
})();
