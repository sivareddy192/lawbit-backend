import rateLimit from 'express-rate-limit';

const isLocalOrTest = (req) =>
  process.env.NODE_ENV !== 'production' ||
  req.ip === '127.0.0.1' ||
  req.ip === '::1' ||
  req.ip === 'localhost';

export const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 3000 : 100000,
  skip: isLocalOrTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many browsing requests. Please slow down and try again shortly.',
  },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 30 : 2000,
  skip: isLocalOrTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again after 15 minutes.',
  },
});

export const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 60 : 5000,
  skip: isLocalOrTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Order creation rate limit exceeded. Please wait a moment before trying again.',
  },
});

export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 1000 : 50000,
  skip: isLocalOrTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Admin API request limit exceeded. Please wait a moment.',
  },
});

export const apiLimiter = publicLimiter;
export default {
  publicLimiter,
  authLimiter,
  orderLimiter,
  adminLimiter,
  apiLimiter,
};
