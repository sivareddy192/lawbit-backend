import express from 'express';

const router = express.Router();

const SYSTEM_VERSION_INFO = {
  version: '2.4.0',
  build: '2026.08.21-sec-v2',
  releaseDate: 'August 2026',
  releaseName: 'AK Foods Shield — Security & Performance Edition',
  isLatest: true,
  security: {
    status: 'OPTIMAL_SECURE',
    protocols: [
      'Strict Password Policy (8+ chars, upper/lower/numbers/symbols)',
      'Recursive NoSQL Injection & Prototype Pollution Sanitization',
      'XSS Prevention & Strict Content Security Headers',
      'Stolen JWT Invalidation on Password Change / Revocation',
      'Granular Role-Based Access Control & IDOR Protection',
      'Rate-Limiting & DDoS Attack Mitigation',
      'Encrypted HttpOnly SameSite Cookies',
      'Zero Secret Leakage Protection',
    ],
  },
  changelog: [
    {
      version: '2.4.0',
      date: '2026-08-21',
      title: 'Full Security Hardening & Version Management Suite',
      changes: [
        'Hardened password requirements with real-time UI strength meter',
        'Implemented NoSQL & XSS deep request sanitizers',
        'Added stolen JWT token revocation upon password modification',
        'Enforced IDOR authorization barriers across customer and order endpoints',
        'Added live System Version & Health inspection module',
      ],
    },
    {
      version: '2.3.0',
      date: '2026-08-15',
      title: 'Order Tracking & Address Picker Overhaul',
      changes: [
        'Interactive GPS & map address selector',
        'Modal background scroll locks',
        'One-click delivery destination selector',
      ],
    },
  ],
};

router.get('/', (req, res) => {
  res.json({
    success: true,
    ...SYSTEM_VERSION_INFO,
    serverTime: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

router.get('/check', (req, res) => {
  const clientVersion = req.query.v;
  const isUpToDate = clientVersion === SYSTEM_VERSION_INFO.version;

  res.json({
    success: true,
    clientVersion: clientVersion || 'unknown',
    currentVersion: SYSTEM_VERSION_INFO.version,
    isUpToDate,
    updateAvailable: !isUpToDate,
    message: isUpToDate
      ? 'Your AK Foods application is running the latest security release.'
      : `Update available: Version ${SYSTEM_VERSION_INFO.version} is now active.`,
  });
});

export default router;
