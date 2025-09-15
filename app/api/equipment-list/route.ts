import { NextResponse } from 'next/server';
import { getEquipmentList } from '@/lib/airtable';
import { getCached, setCached } from '@/lib/cache';

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
      });
    }

    // Generate from connections
    console.log('Generating equipment list from connections...');
    const equipmentList = await getEquipmentList();

    // Sort by name for better UX
    equipmentList.sort((a, b) => a.name.localeCompare(b.name));

    // Cache the results
    setCached(cacheKey, equipmentList);

    return NextResponse.json({
      data: equipmentList,
      cached: false,
      timestamp: new Date().toISOString(),
      count: equipmentList.length
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