import { NextResponse } from 'next/server';
import { generatePowerFlowTree } from '@/lib/tree-algorithms';
import { getCached, setCachedTree } from '@/lib/cache';

export async function GET(
  request: Request,
  context: { params: Promise<{ equipmentId: string }> }
) {
  let equipmentId: string | undefined;

  try {
    const params = await context.params;
    equipmentId = params.equipmentId;

    if (!equipmentId) {
      return NextResponse.json(
        { error: 'Equipment ID is required' },
        { status: 400 }
      );
    }

    // Check cache first
    const cacheKey = `tree-${equipmentId}`;
    const cached = getCached(cacheKey);

    if (cached) {
      console.log(`Returning cached tree for equipment: ${equipmentId}`);
      return NextResponse.json({
        ...cached,
        cached: true,
        timestamp: new Date().toISOString()
      }, {
        headers: {
          'Cache-Control': 'public, s-maxage=7200, stale-while-revalidate=1800', // 2hr cache, 30min stale
        }
      });
    }

    // Generate tree data
    console.log(`Generating power flow tree for equipment: ${equipmentId}`);
    const treeData = await generatePowerFlowTree(equipmentId);

    // Cache the results with appropriate TTL
    setCachedTree(cacheKey, treeData);

    return NextResponse.json({
      ...treeData,
      cached: false,
      timestamp: new Date().toISOString(),
      equipmentId
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=7200, stale-while-revalidate=1800', // 2hr cache, 30min stale
      }
    });

  } catch (error) {
    console.error('Error in equipment-tree API:', error);

    return NextResponse.json(
      {
        error: 'Failed to generate power flow tree',
        message: error instanceof Error ? error.message : 'Unknown error',
        equipmentId: equipmentId || 'unknown',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}