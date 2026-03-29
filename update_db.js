const db = require('./src/config/db');

(async () => {
  try {
    await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS fcm_token VARCHAR(255)');
    console.log('Added fcm_token mapping to user schema');
    
    await db.query(`
      CREATE TABLE IF NOT EXISTS assigned_badges (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        architect_id UUID REFERENCES users(id) ON DELETE RESTRICT,
        badge_name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Assembled explicit assigned_badges distribution schema mapping');
    process.exit(0);
  } catch (err) { 
    console.error(err); 
    process.exit(1); 
  }
})();
