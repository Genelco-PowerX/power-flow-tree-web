import NodeCache from 'node-cache';

// Cache TTL constants optimized for weekly data updates with 2min max delay requirement
export const CACHE_TTL = {
  AIRTABLE_RAW: 4 * 60 * 60,      // 4 hours - raw Airtable data
  EQUIPMENT_LIST: 2 * 60 * 60,    // 2 hours - processed equipment lists
  TREE_DATA: 1 * 60 * 60,         // 1 hour - computed trees (frequently browsed)
  STATIC_DATA: 12 * 60 * 60,      // 12 hours - rarely changing data
} as const;

// Create cache instance optimized for Vercel Hobby Plan (512MB memory limit)
const cache = new NodeCache({
  stdTTL: CACHE_TTL.AIRTABLE_RAW, // Default to longest TTL
  checkperiod: parseInt(process.env.CACHE_CHECK_PERIOD || '300'), // Check every 5 minutes
  useClones: false, // For better performance
  maxKeys: parseInt(process.env.CACHE_MAX_KEYS || '500'), // Conservative limit for hobby plan
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

// Enhanced cache functions with TTL type safety
export function setCachedRaw<T>(key: string, value: T): void {
  setCached(key, value, CACHE_TTL.AIRTABLE_RAW);
}

export function setCachedEquipmentList<T>(key: string, value: T): void {
  setCached(key, value, CACHE_TTL.EQUIPMENT_LIST);
}

export function setCachedTree<T>(key: string, value: T): void {
  setCached(key, value, CACHE_TTL.TREE_DATA);
}

export function setCachedStatic<T>(key: string, value: T): void {
  setCached(key, value, CACHE_TTL.STATIC_DATA);
}

// Bulk cache warming function
export async function warmCache<T>(
  keys: string[],
  dataFetcher: (key: string) => Promise<T>,
  cacheSetter: (key: string, value: T) => void
): Promise<void> {
  const promises = keys.map(async (key) => {
    const cached = getCached<T>(key);
    if (!cached) {
      try {
        const data = await dataFetcher(key);
        cacheSetter(key, data);
      } catch (error) {
        console.error(`Failed to warm cache for key ${key}:`, error);
      }
    }
  });

  await Promise.allSettled(promises);
}

export function getCacheStats() {
  const stats = cache.getStats();
  return {
    keys: cache.keys().length,
    hits: stats.hits,
    misses: stats.misses,
    hitRate: stats.hits / (stats.hits + stats.misses) || 0,
    size: stats.ksize,
    memoryUsage: process.memoryUsage(),
  };
}