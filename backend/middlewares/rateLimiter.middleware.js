import redisClient from '../config/redis.js';

export const aiChatLimiter = async (req, res, next) => {
  try {
    const userId = req.user?._id?.toString() || req.ip;
    const key    = `ratelimit:ai:${userId}`;
    const MAX    = 15;
    const WINDOW = 60; // seconds

    // Count increment karo
    const current = await redisClient.incr(key);

    // Pehli baar — expiry set karo
    if (current === 1) {
      await redisClient.expire(key, WINDOW);
    }

    // Remaining time
    const ttl = await redisClient.ttl(key);

    // Response headers
    res.setHeader('X-RateLimit-Limit',     MAX);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, MAX - current));
    res.setHeader('X-RateLimit-Reset',     ttl);

    if (current > MAX) {
      return res.status(429).json({
        success:    false,
        message:    `Rate limit exceed. ${ttl} seconds mein reset hoga.`,
        retryAfter: ttl,
        limit:      MAX,
        used:       current,
      });
    }

    next();

  } catch (err) {
    // Redis down ho toh bhi request block mat karo
    console.error('Rate limiter error:', err.message);
    next();
  }
};

export const authLimiter = async (req, res, next) => {
  try {
    const ip     = req.ip;
    const key    = `ratelimit:auth:${ip}`;
    const MAX    = 7;
    const WINDOW = 10 * 60; // 10 minutes

    const current = await redisClient.incr(key);

    if (current === 1) {
      await redisClient.expire(key, WINDOW);
    }

    const ttl = await redisClient.ttl(key);

    if (current > MAX) {
      const minutes = Math.ceil(ttl / 60);
      return res.status(429).json({
        success:    false,
        message:    `Too many requests, ${minutes} minute baad try karo.`,
        retryAfter: ttl,
      });
    }

    next();

  } catch (err) {
    console.error('Auth rate limiter error:', err.message);
    next();
  }
};
