import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export function requireAuth(secret) {
  return async (req, res, next) => {
    try {
      const header = req.headers.authorization || '';
      const token = header.replace(/^Bearer\s+/i, '');
      if (!token) return res.status(401).json({ success: false, message: 'Authentication required.' });
      const claims = jwt.verify(token, secret);
      const user = await User.findById(claims.userId || claims.id);
      if (!user || !user.isActive) return res.status(401).json({ success: false, message: 'Authentication required.' });
      req.user = user;
      next();
    } catch {
      res.status(401).json({ success: false, message: 'Authentication required.' });
    }
  };
}

export function requireRole(...roles) {
  return (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ success: false, message: 'You do not have permission for this action.' });
};
