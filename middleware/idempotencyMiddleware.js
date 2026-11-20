import cache from '../services/cacheService.js';

export const checkIdempotency = (scope = 'order') => {
  return async (req, res, next) => {
    const idempotencyKey =
      req.headers['idempotency-key'] ||
      req.headers['x-idempotency-key'] ||
      req.body?.idempotencyKey;

    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      return next();
    }

    const cacheKey = `asg:idempotency:${scope}:${idempotencyKey.trim()}`;

    try {
      const existing = await cache.get(cacheKey);

      if (existing) {
        if (existing.status === 'PROCESSING') {
          return res.status(409).json({
            success: false,
            message: 'A request with this idempotency key is currently being processed. Please wait.',
            inFlight: true,
          });
        }

        if (existing.status === 'COMPLETED' && existing.response) {
          res.setHeader('X-Idempotent-Replay', 'true');
          return res.status(existing.statusCode || 200).json(existing.response);
        }
      }

      await cache.set(cacheKey, { status: 'PROCESSING', startedAt: Date.now() }, 30);

      const originalJson = res.json.bind(res);
      res.json = (body) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          cache.set(
            cacheKey,
            {
              status: 'COMPLETED',
              statusCode: res.statusCode,
              response: body,
              completedAt: Date.now(),
            },
            86400
          ).catch(() => {});
        } else {
          cache.del(cacheKey).catch(() => {});
        }
        return originalJson(body);
      };

      next();
    } catch (err) {
      next();
    }
  };
};

export default checkIdempotency;
