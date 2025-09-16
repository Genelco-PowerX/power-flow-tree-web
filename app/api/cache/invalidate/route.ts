import { NextResponse } from 'next/server';
import { invalidateCacheKey, invalidateAllCaches } from '@/lib/cache-invalidation';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { key, all } = body;

    if (all === true) {
      invalidateAllCaches();
      return NextResponse.json({
        message: 'All caches invalidated successfully',
        timestamp: new Date().toISOString(),
      });
    }

    if (key && typeof key === 'string') {
      invalidateCacheKey(key);
      return NextResponse.json({
        message: `Cache key '${key}' invalidated successfully`,
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json(
      { error: 'Invalid request. Specify "key" or "all": true' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Error invalidating cache:', error);
    return NextResponse.json(
      {
        error: 'Cache invalidation failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}