import { deleteCached, clearCache } from './cache';

// Cache dependency graph - when one item changes, what else should be invalidated
const CACHE_DEPENDENCIES = {
  'equipment-connections': ['equipment-list'], // When connections change, equipment list needs refresh
  'equipment-list': [], // Equipment list changes don't cascade
} as const;

// Smart cache invalidation based on dependencies
export function invalidateCacheKey(key: string): void {
  console.log(`Invalidating cache key: ${key}`);
  deleteCached(key);

  // Invalidate dependent caches
  const dependencies = CACHE_DEPENDENCIES[key as keyof typeof CACHE_DEPENDENCIES];
  if (dependencies) {
    dependencies.forEach(dependentKey => {
      console.log(`Invalidating dependent cache key: ${dependentKey}`);
      deleteCached(dependentKey);
    });
  }

  // Invalidate all tree caches if base data changes
  if (key === 'equipment-connections' || key === 'equipment-list') {
    console.log('Invalidating all tree caches due to base data change');
    invalidateTreeCaches();
  }
}

// Invalidate all tree-specific caches (when equipment data changes)
export function invalidateTreeCaches(): void {
  // We can't easily enumerate all tree cache keys, so we use a pattern-based approach
  // This could be enhanced with a cache key registry if needed
  console.log('Tree cache invalidation requested - consider implementing cache key registry');
}

// Complete cache reset (use sparingly)
export function invalidateAllCaches(): void {
  console.log('Clearing all caches');
  clearCache();
}

// Scheduled cache refresh (for proactive updates)
export async function scheduleDataRefresh(): Promise<void> {
  try {
    // Invalidate base data caches to force fresh fetch
    invalidateCacheKey('equipment-connections');

    // Optionally trigger a cache warm-up
    const response = await fetch('/api/cache/warm', { method: 'POST' });
    if (!response.ok) {
      console.error('Failed to warm cache after invalidation');
    }
  } catch (error) {
    console.error('Error during scheduled data refresh:', error);
  }
}