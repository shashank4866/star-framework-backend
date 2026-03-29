const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized: No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecret_jwt_key_for_lms');
    req.user = decoded; 
    // decoded expects { id, roleName, levelName }
    next();
  } catch (err) {
    res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};
