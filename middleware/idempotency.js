const Redis = require('ioredis');

const redisUrl = process.env.REDIS_URL;
let redis = null;
let redisErrorLogged = false;

if (process.env.NODE_ENV !== 'test' && redisUrl) {
  try {
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => {
        if (times > 3) {
          // Stop retrying after 3 attempts, fall back to memory
          if (!redisErrorLogged) {
            console.warn('[Idempotency] Redis unavailable after 3 attempts, using memory cache');
            redisErrorLogged = true;
          }
          redis = null;
          return null; // Stop retrying
        }
        return Math.min(times * 100, 1000);
      },
      enableOfflineQueue: false,
    });
    
    redis.on('error', (err) => {
      if (!redisErrorLogged) {
        console.warn('[Idempotency] Redis error:', err.message, '- falling back to memory cache');
        redisErrorLogged = true;
      }
      redis = null; // Fall back to memory cache
    });
    
    redis.on('connect', () => {
      console.log('[Idempotency] Redis connected successfully');
      redisErrorLogged = false;
    });
  } catch (error) {
    console.warn('[Idempotency] Redis init failed, falling back to memory:', error.message);
    redis = null;
  }
} else {
  console.log('[Idempotency] Redis not configured, using memory cache');
}

const memoryCache = new Map();

const idempotencyMiddleware = async (req, res, next) => {
  const idempotencyKey = req.headers['idempotency-key'];
  if (!idempotencyKey) return next();

  const userId = req.user?.id || 'anonymous';
  const cacheKey = `idempotency:${userId}:${idempotencyKey}`;

  try {
    let cached = null;
    if (redis) {
      cached = await redis.get(cacheKey);
    } else {
      cached = memoryCache.get(cacheKey);
    }

    if (cached) {
      console.log(`[Idempotency] returning cached response for ${cacheKey}`);
      return res.json(JSON.parse(cached));
    }

    const originalJson = res.json.bind(res);
    res.json = async (data) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const serialized = JSON.stringify(data);
        if (redis) {
          await redis.setex(cacheKey, 3600, serialized);
        } else {
          memoryCache.set(cacheKey, serialized);
          setTimeout(() => memoryCache.delete(cacheKey), 3600000);
        }
      }
      return originalJson(data);
    };

    return next();
  } catch (error) {
    console.error('[Idempotency] error:', error.message);
    return next();
  }
};

module.exports = { idempotencyMiddleware };
