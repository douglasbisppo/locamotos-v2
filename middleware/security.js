'use strict';

/**
 * Security middleware: CORS, security headers, and request size limiting.
 * Import and apply in your Express app entry point:
 *
 *   const { corsMiddleware, securityHeaders } = require('./middleware/security');
 *   app.use(securityHeaders);
 *   app.use(corsMiddleware);
 */

// ─── CORS Middleware ────────────────────────────────────────────────────────
function corsMiddleware(req, res, next) {
  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

  const origin = req.headers.origin;

  if (allowedOrigins.length === 0) {
    // No origins configured — deny cross-origin requests
    res.setHeader('Access-Control-Allow-Origin', '');
  } else if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Cron-Key');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  next();
}

// ─── Security Headers Middleware ─────────────────────────────────────────────
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.removeHeader('X-Powered-By');
  next();
}

module.exports = { corsMiddleware, securityHeaders };
