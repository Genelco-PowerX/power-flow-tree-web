import { NextResponse } from 'next/server';
import { getEquipmentConnections } from '@/lib/airtable';
import { getCached, setCached } from '@/lib/cache';

export async function GET() {
  try {
    // Check cache first
    const cacheKey = 'equipment-connections';
    const cached = getCached<any[]>(cacheKey);

    if (cached) {
      console.log('Returning cached equipment connections');
      return NextResponse.json({
        data: cached,
        cached: true,
        timestamp: new Date().toISOString()
      });
    }

    // Fetch from Airtable
    console.log('Fetching equipment connections from Airtable...');
    const connections = await getEquipmentConnections();

    // Cache the results
    setCached(cacheKey, connections);

    return NextResponse.json({
      data: connections,
      cached: false,
      timestamp: new Date().toISOString(),
      count: connections.length
    });

  } catch (error) {
    console.error('Error in equipment-connections API:', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch equipment connections',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

// Optional: Add POST endpoint to clear cache
export async function POST() {
  try {
    const cacheKey = 'equipment-connections';
    setCached(cacheKey, null, 0); // Clear cache

    return NextResponse.json({
      message: 'Cache cleared successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error clearing cache:', error);
    return NextResponse.json(
      { error: 'Failed to clear cache' },
      { status: 500 }
    );
  }
}