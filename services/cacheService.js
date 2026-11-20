import Redis from 'ioredis';

class InMemoryCache {
  constructor(maxItems = 1000) {
    this.cache = new Map();
    this.maxItems = maxItems;
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    if (item.expiry && item.expiry < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return item.value;
  }

  set(key, value, ttlSeconds = 300) {
    if (this.cache.size >= this.maxItems) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    const expiry = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    this.cache.set(key, { value, expiry });
  }

  del(key) {
    this.cache.delete(key);
  }

  delPattern(pattern) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  flush() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }
}

class CacheService {
  constructor() {
    this.redis = null;
    this.inMemory = new InMemoryCache(1500);
    this.isRedisConnected = false;
    this.init();
  }

  init() {
    const redisUri = process.env.REDIS_URL || process.env.REDIS_URI;
    if (redisUri) {
      try {
        this.redis = new Redis(redisUri, {
          maxRetriesPerRequest: 2,
          enableReadyCheck: true,
          connectTimeout: 5000,
          retryStrategy(times) {
            if (times > 3) return null;
            return Math.min(times * 1000, 3000);
          },
        });

        this.redis.on('connect', () => {
          this.isRedisConnected = true;
          console.log('Redis Cache Connected Successfully');
        });

        this.redis.on('error', (err) => {
          this.isRedisConnected = false;
          if (process.env.NODE_ENV !== 'production') {
            console.warn('Redis Cache Connection Warning (Using In-Memory Fallback):', err.message);
          }
        });
      } catch (err) {
        this.isRedisConnected = false;
        console.warn('Redis Initialization Error:', err.message);
      }
    }
  }

  async get(key) {
    try {
      if (this.isRedisConnected && this.redis) {
        const data = await this.redis.get(key);
        if (data) {
          return JSON.parse(data);
        }
      }
    } catch (_) {}
    return this.inMemory.get(key);
  }

  async set(key, value, ttlSeconds = 300) {
    try {
      if (this.isRedisConnected && this.redis) {
        await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
      }
    } catch (_) {}
    this.inMemory.set(key, value, ttlSeconds);
  }

  async del(key) {
    try {
      if (this.isRedisConnected && this.redis) {
        await this.redis.del(key);
      }
    } catch (_) {}
    this.inMemory.del(key);
  }

  async delPattern(pattern) {
    try {
      if (this.isRedisConnected && this.redis) {
        const stream = this.redis.scanStream({ match: pattern, count: 100 });
        stream.on('data', async (keys) => {
          if (keys.length > 0) {
            const pipeline = this.redis.pipeline();
            keys.forEach((k) => pipeline.del(k));
            await pipeline.exec();
          }
        });
      }
    } catch (_) {}
    this.inMemory.delPattern(pattern);
  }

  async invalidateCatalogueCache() {
    await Promise.all([
      this.delPattern('asg:foods:*'),
      this.delPattern('asg:categories:*'),
      this.delPattern('asg:settings:*'),
      this.delPattern('asg:bestsellers:*'),
      this.delPattern('asg:featured:*'),
    ]);
  }

  getStatus() {
    return {
      type: this.isRedisConnected ? 'Redis + Memory' : 'In-Memory LRU',
      redisActive: this.isRedisConnected,
      inMemoryItemCount: this.inMemory.size(),
    };
  }

  middleware(ttlSeconds = 300, keyGenerator = null) {
    return async (req, res, next) => {
      if (req.method !== 'GET') {
        return next();
      }

      if (req.headers.authorization && !req.originalUrl.includes('/api/foods') && !req.originalUrl.includes('/api/categories')) {
        return next();
      }

      const cacheKey = keyGenerator
        ? keyGenerator(req)
        : `asg:route:${req.originalUrl || req.url}`;

      try {
        const cachedResponse = await this.get(cacheKey);
        if (cachedResponse) {
          res.setHeader('X-Cache-Status', 'HIT');
          res.setHeader('Cache-Control', `public, max-age=${ttlSeconds}`);
          return res.json(cachedResponse);
        }

        res.setHeader('X-Cache-Status', 'MISS');
        const originalJson = res.json.bind(res);
        res.json = (body) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            this.set(cacheKey, body, ttlSeconds).catch(() => {});
          }
          return originalJson(body);
        };
        next();
      } catch (err) {
        next();
      }
    };
  }
}

export const cache = new CacheService();
export default cache;
