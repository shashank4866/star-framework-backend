const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, role_name } = req.body;
    
    // Hash password
    const password_hash = await bcrypt.hash(password, 10);
    
    // Find Role
    const roleRes = await db.query('SELECT id FROM roles WHERE name = $1', [role_name || 'System Designer']);
    if (roleRes.rows.length === 0) return res.status(400).json({ error: 'Role not found' });
    const role_id = roleRes.rows[0].id;

    // Find Level 1 (Trainee)
    const levelRes = await db.query("SELECT id FROM levels WHERE name = 'Trainee'");
    if (levelRes.rows.length === 0) return res.status(500).json({ error: 'Initial level not configured in DB' });
    const level_id = levelRes.rows[0].id;

    const result = await db.query(
      `INSERT INTO users (name, email, password_hash, role_id, level_id) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email`,
      [name, email, password_hash, role_id, level_id]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    const { rows } = await db.query(`
      SELECT u.*, r.name as role_name, l.name as level_name 
      FROM users u
      JOIN roles r ON u.role_id = r.id
      JOIN levels l ON u.level_id = l.id
      WHERE u.email = $1
    `, [email]);

    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = rows[0];

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const payload = {
      id: user.id,
      name: user.name,
      roleName: user.role_name,
      levelName: user.level_name
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET || 'supersecret_jwt_key_for_lms', { expiresIn: '1d' });

    res.cookie('token', token, {
      httpOnly: true,
      secure: false, // Set true in prod
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 
    });

    res.json({ message: 'Login successful', user: payload });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out' });
});

router.get('/me', authMiddleware, (req, res) => {
  res.json(req.user);
});

module.exports = router;
