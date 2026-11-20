import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'asg_access_secret_fallback_key_do_not_use_in_prod';

export const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized — no access token provided. Please log in.',
    });
  }

  try {
    const decoded = jwt.verify(token, ACCESS_SECRET);
    if (!decoded?.userId) {
      return res.status(401).json({ success: false, message: 'Invalid token payload' });
    }

    const user = await User.findById(decoded.userId).select('-password -refreshToken');

    if (!user) {
      return res.status(401).json({ success: false, message: 'User no longer exists' });
    }

    if (user.isBlocked) {
      return res.status(403).json({
        success: false,
        isBlocked: true,
        code: 'ACCOUNT_BLOCKED',
        message: 'Your account has been blocked by Admin. Please contact the administrator.',
      });
    }

    if (typeof user.changedPasswordAfter === 'function' && user.changedPasswordAfter(decoded.iat)) {
      return res.status(401).json({
        success: false,
        code: 'TOKEN_INVALIDATED',
        message: 'Password was recently changed. Please log in again with your new credentials.',
      });
    }

    req.user = user;
    req.userId = user._id;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        code: 'TOKEN_EXPIRED',
        message: 'Access token expired — please refresh',
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Not authorized — invalid token',
    });
  }
};

export const admin = (req, res, next) => {
  const role = req.user?.role?.toUpperCase();
  if (req.user && role === 'ADMIN') {
    next();
  } else {
    return res.status(403).json({
      success: false,
      message: 'Access denied: Admin privileges required',
    });
  }
};

export const deliveryPartner = (req, res, next) => {
  const role = req.user?.role?.toUpperCase();
  if (req.user && (role === 'DELIVERY' || role === 'ADMIN' || role === 'DELIVERY_PARTNER')) {
    next();
  } else {
    return res.status(403).json({
      success: false,
      message: 'Access denied: Delivery Partner or Admin privileges required',
    });
  }
};

export const optionalAuth = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, ACCESS_SECRET);
      req.user = await User.findById(decoded.userId).select('-password -refreshToken');
      if (req.user) {
        req.userId = req.user._id;
      }
    } catch (_) {
    }
  }
  next();
};
