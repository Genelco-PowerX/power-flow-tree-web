import { NextResponse } from 'next/server';
import { getCacheStats } from '@/lib/cache';

export async function GET() {
  try {
    const cacheStats = getCacheStats();
    const systemStats = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cache: cacheStats,
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
      },
    };

    return NextResponse.json(systemStats, {
      headers: {
        'Cache-Control': 'no-cache', // Always get fresh performance data
      }
    });
  } catch (error) {
    console.error('Error getting performance stats:', error);
    return NextResponse.json(
      { error: 'Failed to get performance stats' },
      { status: 500 }
    );
  }
}