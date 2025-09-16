import { NextResponse } from 'next/server';
import { warmCache, setCachedRaw, setCachedEquipmentList } from '@/lib/cache';
import { getEquipmentConnections, getEquipmentList } from '@/lib/airtable';

export async function POST() {
  try {
    console.log('Starting cache warming...');

    // Warm base data caches
    await warmCache(
      ['equipment-connections'],
      async () => await getEquipmentConnections(),
      setCachedRaw
    );

    await warmCache(
      ['equipment-list'],
      async () => await getEquipmentList(),
      setCachedEquipmentList
    );

    console.log('Cache warming completed');

    return NextResponse.json({
      message: 'Cache warming completed successfully',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Error warming cache:', error);
    return NextResponse.json(
      {
        error: 'Cache warming failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}