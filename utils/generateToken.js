import jwt from 'jsonwebtoken';

const ACCESS_SECRET  = process.env.JWT_ACCESS_SECRET  || 'asg_access_secret_fallback_key_do_not_use_in_prod';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'asg_refresh_secret_fallback_key_do_not_use_in_prod';
const ACCESS_EXPIRE  = process.env.JWT_ACCESS_EXPIRE  || '15m';
const REFRESH_EXPIRE = process.env.JWT_REFRESH_EXPIRE || '7d';

export const generateAccessToken = (userId) => {
  return jwt.sign({ userId }, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRE });
};

export const generateRefreshToken = (userId) => {
  return jwt.sign({ userId }, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRE });
};

export const verifyAccessToken = (token) => {
  return jwt.verify(token, ACCESS_SECRET);
};

export const verifyRefreshToken = (token) => {
  return jwt.verify(token, REFRESH_SECRET);
};

export const getRefreshTokenCookieOptions = (req) => {
  const isHttps = Boolean(
    req?.secure ||
    req?.headers?.['x-forwarded-proto'] === 'https' ||
    req?.headers?.origin?.startsWith('https') ||
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL
  );

  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  };
};

export const generateToken = generateAccessToken;
export default generateAccessToken;
