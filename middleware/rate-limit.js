'use strict';

/**
 * In-memory rate limiter middleware (no external dependencies).
 * For production with multiple instances, replace with Redis-backed limiter.
 *
 * Usage:
 *   const { globalLimiter, authLimiter } = require('./middleware/rate-limit');
 *   router.use(globalLimiter);
 *   router.post('/login', authLimiter, handler);
 */

function createRateLimiter({ windowMs = 60000, max = 100, message = 'Muitas requisições. Tente novamente mais tarde.' } = {}) {
  const hits = new Map(); // IP -> { count, resetTime }

  // Cleanup expired entries every minute
  setInterval(() => {
    const now = Date.now();
    for (const [key, val] of hits) {
      if (now > val.resetTime) hits.delete(key);
    }
  }, 60 * 1000).unref();

  return function rateLimiter(req, res, next) {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    let entry = hits.get(ip);

    if (!entry || now > entry.resetTime) {
      entry = { count: 0, resetTime: now + windowMs };
      hits.set(ip, entry);
    }

    entry.count++;

    // Set standard rate limit headers
    const remaining = Math.max(0, max - entry.count);
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetTime / 1000));

    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.resetTime - now) / 1000));
      return res.status(429).json({ error: message });
    }

    next();
  };
}

// Global rate limiter: 100 requests per minute per IP
const globalLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  message: 'Muitas requisições. Tente novamente em 1 minuto.',
});

// Auth rate limiter: 10 requests per minute per IP (for login/OTP endpoints)
const authLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Muitas tentativas de autenticação. Tente novamente em 1 minuto.',
});

module.exports = { createRateLimiter, globalLimiter, authLimiter };
