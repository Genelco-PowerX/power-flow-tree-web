import { NextResponse } from 'next/server';
import { getEquipmentList } from '@/lib/airtable';
import { getCached, setCachedEquipmentList } from '@/lib/cache';

export async function GET() {
  try {
    // Check cache first
    const cacheKey = 'equipment-list';
    const cached = getCached<any[]>(cacheKey);

    if (cached) {
      console.log('Returning cached equipment list');
      return NextResponse.json({
        data: cached,
        cached: true,
        timestamp: new Date().toISOString()
      }, {
        headers: {
          'Cache-Control': 'public, s-maxage=14400, stale-while-revalidate=3600', // 4hr cache, 1hr stale
        }
      });
    }

    // Generate from connections
    console.log('Generating equipment list from connections...');
    const equipmentList = await getEquipmentList();

    // Sort by name for better UX
    equipmentList.sort((a, b) => a.name.localeCompare(b.name));

    // Cache the results with appropriate TTL
    setCachedEquipmentList(cacheKey, equipmentList);

    return NextResponse.json({
      data: equipmentList,
      cached: false,
      timestamp: new Date().toISOString(),
      count: equipmentList.length
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=14400, stale-while-revalidate=3600', // 4hr cache, 1hr stale
      }
    });

  } catch (error) {
    console.error('Error in equipment-list API:', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch equipment list',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}