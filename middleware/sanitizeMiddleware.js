export const escapeRegex = (string) => {
  if (typeof string !== 'string') return '';
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const isDangerousKey = (key) => {
  if (typeof key !== 'string') return false;
  return (
    key.startsWith('$') ||
    key.includes('.') ||
    key === '__proto__' ||
    key === 'constructor' ||
    key === 'prototype'
  );
};

const cleanNoSQL = (obj) => {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(cleanNoSQL);
  }

  const cleaned = {};
  for (const key of Object.keys(obj)) {
    if (isDangerousKey(key)) {
      continue;
    }
    cleaned[key] = cleanNoSQL(obj[key]);
  }
  return cleaned;
};

const cleanXSSString = (str) => {
  if (typeof str !== 'string') return str;
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/javascript:[^"']*/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/on\w+\s*=\s*[^>\s]+/gi, '');
};

const cleanXSS = (obj) => {
  if (typeof obj === 'string') {
    return cleanXSSString(obj);
  }
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(cleanXSS);
  }
  const cleaned = {};
  for (const key of Object.keys(obj)) {
    cleaned[key] = cleanXSS(obj[key]);
  }
  return cleaned;
};

export const sanitizeNoSQL = (req, res, next) => {
  if (req.body) {
    req.body = cleanNoSQL(req.body);
  }
  if (req.query) {
    req.query = cleanNoSQL(req.query);
  }
  if (req.params) {
    req.params = cleanNoSQL(req.params);
  }
  next();
};

export const sanitizeXSS = (req, res, next) => {
  if (req.body) {
    req.body = cleanXSS(req.body);
  }
  if (req.query) {
    req.query = cleanXSS(req.query);
  }
  if (req.params) {
    req.params = cleanXSS(req.params);
  }
  next();
};

export default {
  sanitizeNoSQL,
  sanitizeXSS,
  escapeRegex,
};
