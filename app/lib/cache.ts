import NodeCache from 'node-cache';

// Create cache instance with configurable TTL
const cache = new NodeCache({
  stdTTL: parseInt(process.env.CACHE_TTL_SECONDS || '300'), // Default 5 minutes
  checkperiod: 60, // Check for expired keys every 60 seconds
  useClones: false, // For better performance
});

export function getCached<T>(key: string): T | undefined {
  try {
    return cache.get<T>(key);
  } catch (error) {
    console.error('Cache get error:', error);
    return undefined;
  }
}

export function setCached<T>(key: string, value: T, ttl?: number): void {
  try {
    if (ttl !== undefined) {
      cache.set(key, value, ttl);
    } else {
      cache.set(key, value);
    }
  } catch (error) {
    console.error('Cache set error:', error);
  }
}

export function deleteCached(key: string): void {
  try {
    cache.del(key);
  } catch (error) {
    console.error('Cache delete error:', error);
  }
}

export function clearCache(): void {
  try {
    cache.flushAll();
  } catch (error) {
    console.error('Cache clear error:', error);
  }
}

export function getCacheStats() {
  return {
    keys: cache.keys().length,
    hits: cache.getStats().hits,
    misses: cache.getStats().misses,
    size: cache.getStats().ksize,
  };
}