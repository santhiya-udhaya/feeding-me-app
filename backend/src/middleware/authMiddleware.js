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

// Attach a valid user when a bearer token is provided, without making a public
// route unavailable to anonymous visitors or users with expired tokens.
export function optionalAuth(secret) {
  return async (req, _res, next) => {
    try {
      const header = req.headers.authorization || '';
      const token = header.replace(/^Bearer\s+/i, '');
      if (token) {
        const claims = jwt.verify(token, secret);
        const user = await User.findById(claims.userId || claims.id);
        if (user?.isActive) req.user = user;
      }
    } catch {
      // Public listings remain available when an optional token is invalid.
    }
    next();
  };
}

export function requireRole(...roles) {
  return (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ success: false, message: 'You do not have permission for this action.' });
};
