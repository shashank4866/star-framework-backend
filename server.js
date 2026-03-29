const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:4200',
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', require('./src/controllers/authController'));
app.use('/api/hierarchy', require('./src/controllers/hierarchyController'));
app.use('/api/progress', require('./src/controllers/progressController'));
app.use('/api/assessments', require('./src/controllers/assessmentController'));
app.use('/api/architect', require('./src/controllers/architectController'));
app.use('/api/builder', require('./src/controllers/courseBuilderController'));
app.use('/api/fcm', require('./src/controllers/fcmController'));

app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({ error: 'Internal Server Error', detail: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  
  // Auto-run migration on startup (Workaround for Render Free Tier shell access)
  try {
    const { run: runMigration } = require('./apply_alter.js');
    await runMigration();
  } catch (migErr) {
    console.error('[Startup] Migration trigger failed:', migErr.message);
  }
});
