import {
  EquipmentConnection,
  Equipment,
  ProcessedEquipment,
  TreeNode,
  TreeEdge,
  TreeData,
  ConnectionMap,
  LoopGroup,
  EquipmentLayoutInfo,
  Position,
  CollisionInfo,
  SubtreeDimensions,
  PlacementTree,
  PlacementNode,
  LayoutValidationResult
} from './types';

// Constants for layout - UPDATED for natural branching and collision prevention
const nodeWidth = 180;
const nodeHeight = 70;
const minimumNodeSpacing = 200;        // Clear horizontal gap edge-to-edge between siblings
const nodeCenterSpacing = nodeWidth + minimumNodeSpacing; // Center-to-center spacing (380px)
const levelSpacing = 150;              // Vertical spacing between logical levels (across tree depth)
const localBranchOffset = 120;         // Base horizontal bias between branches
const branchSpreadIncrement = 60;      // Additional spread per upstream level
const centerX = 400;
const centerY = 300;
const lateralUpsOffset = nodeWidth / 2 + 100;  // Center-to-center offset for UPS/MDS pairing (100px edge gap)
const upsMdsPairOffset = nodeWidth / 2 + 100;
const collisionPadding = 12;           // Extra gap when nudging nodes apart

const categoryVerticalSpacing = 150;
const categoryVerticalOffsets: Record<string, number> = {
  SELECTED: 0,
  PDU: 0,
  ATS: -1,
  RING_BUS: -2,
  CDS: -2,
  UPS_WITH_MDS: -3,
  UPS: -3,
  MDS: -3,
  SWGR: -3,
  DISTRIBUTION: -3,
  GEN: -4,
  GENERATOR: -4,
  TX: -4,
  TRANSFORMER: -4,
  UTILITY: -5,
  SUBSTATION: -5,
  END_EQUIPMENT: 1
};

interface LayoutMetrics {
  maxRowWidthPx: number;
  maxRowCount: number;
  firstSplitLevel: number | null;
}

export async function generatePowerFlowTree(selectedEquipmentId: string): Promise<TreeData> {
  try {
    // Import Airtable functions directly to avoid internal API calls
    const { getEquipmentConnections } = await import('./airtable');
    const connections = await getEquipmentConnections();

    // Build connection map
    const connectionMap = buildConnectionMap(connections);

    // Find the selected equipment info
    const selectedEquipment = findEquipmentInfo(selectedEquipmentId, connections);
    if (!selectedEquipment) {
      throw new Error(`Equipment with ID ${selectedEquipmentId} not found`);
    }

    // Traverse upstream and downstream from the selected equipment
    const upstream = traverseUpstream(selectedEquipmentId, connectionMap);
    const downstream = traverseDownstream(selectedEquipmentId, connectionMap);

    // Filter out the selected equipment from results (safety check for circular dependencies)
    const filteredUpstream = upstream.filter(eq => eq.id !== selectedEquipmentId);
    const filteredDownstream = downstream.filter(eq => eq.id !== selectedEquipmentId);

    // Process equipment for visualization (loop detection, deduplication)
    const processedUpstream = ensureCompleteUpstreamCoverage(
      selectedEquipment,
      processEquipmentForVisualization(filteredUpstream, connectionMap),
      connectionMap
    );
    const processedDownstream = processEquipmentForVisualization(filteredDownstream, connectionMap);

    // Generate nodes and edges for ReactFlow
    const { nodes, edges } = generateNodesAndEdges(
      selectedEquipment,
      processedUpstream,
      processedDownstream,
      connectionMap
    );

    return {
      nodes,
      edges,
      upstream: processedUpstream,
      downstream: processedDownstream,
      selectedEquipment
    };

  } catch (error) {
    console.error('Error in generatePowerFlowTree:', error);
    throw error;
  }
}

// Helper function to classify connection types
function classifyConnectionType(connection: EquipmentConnection): 'normal' | 'bypass' | 'redundant' {
  // UPS bypass pattern: UPS equipment with S2 source typically indicates bypass
  if (connection.fromType.includes('UPS') && connection.sourceNumber === 'S2') {
    return 'bypass';
  }

  // CUPP (UPS critical panels) connections from UPS are often bypass paths
  if (connection.fromType.includes('UPS') && connection.toType.includes('CUPP')) {
    return 'bypass';
  }

  // S2 connections are typically redundant/backup
  if (connection.sourceNumber === 'S2') {
    return 'redundant';
  }

  // Default to normal
  return 'normal';
}

// Helper function to detect UPS equipment
function isUPSEquipment(type: string, name: string): boolean {
  return type.includes('UPS') || name.toLowerCase().includes('ups');
}

function buildConnectionMap(connections: EquipmentConnection[]): ConnectionMap {
  const connectionMap: ConnectionMap = new Map();

  // Initialize all equipment entries
  connections.forEach(connection => {
    [...connection.from, ...connection.to].forEach(equipmentId => {
      if (!connectionMap.has(equipmentId)) {
        connectionMap.set(equipmentId, {
          upstream: [],
          downstream: []
        });
      }
    });
  });

  // Build relationships with enhanced classification
  connections.forEach(connection => {
    const sourceNumber = connection.sourceNumber || 'S1';
    const connectionType = classifyConnectionType(connection);

    connection.from.forEach(fromId => {
      connection.to.forEach(toId => {
        // Add downstream relationship (from → to)
        const fromEntry = connectionMap.get(fromId);
        if (fromEntry) {
          fromEntry.downstream.push({
            id: toId,
            name: connection.toName,
            type: connection.toType,
            sourceNumber,
            connectionType
          });
        }

        // Add upstream relationship (to ← from)
        const toEntry = connectionMap.get(toId);
        if (toEntry) {
          toEntry.upstream.push({
            id: fromId,
            name: connection.fromName,
            type: connection.fromType,
            sourceNumber,
            connectionType
          });
        }
      });
    });
  });

  console.log(`Built enhanced connection map with ${connectionMap.size} equipment entries`);
  return connectionMap;
}

function findEquipmentInfo(equipmentId: string, connections: EquipmentConnection[]): ProcessedEquipment | null {
  // Find equipment in connections
  for (const connection of connections) {
    if (connection.from.includes(equipmentId)) {
      return {
        id: equipmentId,
        name: connection.fromName,
        type: connection.fromType,
        level: 0,
        sources: [],
        parentIds: []
      };
    }
    if (connection.to.includes(equipmentId)) {
      return {
        id: equipmentId,
        name: connection.toName,
        type: connection.toType,
        level: 0,
        sources: [],
        parentIds: []
      };
    }
  }
  return null;
}

function traverseUpstream(
  equipmentId: string,
  connectionMap: ConnectionMap,
  visited: Set<string> = new Set(),
  level: number = 1,
  path: string[] = [],
  branch?: 'S1' | 'S2'
): Equipment[] {
  if (level > 10) {
    return []; // Prevent excessive depth
  }

  // For bypass connections, allow revisiting equipment to show multiple paths
  const isBypassPath = path.length > 0 && connectionMap.get(equipmentId)?.upstream.some(u => u.connectionType === 'bypass');

  if (visited.has(equipmentId) && !isBypassPath) {
    return []; // Prevent cycles for normal paths only
  }

  const currentPath = [...path, equipmentId];
  const equipment: Equipment[] = [];

  const connections = connectionMap.get(equipmentId);
  if (!connections) return equipment;

  connections.upstream.forEach(upstream => {
    const currentBranch: 'S1' | 'S2' = (branch || (upstream.sourceNumber as 'S1' | 'S2') || 'S1');
    const connectionType = upstream.connectionType || 'normal';

    // Create a new visited set for each path to allow multiple routes to same equipment
    const newVisited = connectionType === 'bypass' ? new Set([...visited]) : new Set([...visited, equipmentId]);

    // Add this equipment
    equipment.push({
      id: upstream.id,
      name: upstream.name,
      type: upstream.type,
      level,
      parentId: equipmentId,
      sourceNumber: upstream.sourceNumber,
      sources: [upstream.sourceNumber],
      parentIds: [equipmentId],
      path: currentPath,
      branch: currentBranch,
      connectionType
    });

    // Recursively traverse
    const childEquipment = traverseUpstream(
      upstream.id,
      connectionMap,
      newVisited,
      level + 1,
      currentPath,
      currentBranch
    );
    equipment.push(...childEquipment);
  });

  return equipment;
}

function traverseDownstream(
  equipmentId: string,
  connectionMap: ConnectionMap,
  visited: Set<string> = new Set(),
  level: number = 1,
  path: string[] = []
): Equipment[] {
  if (level > 10) {
    return []; // Prevent excessive depth
  }

  // For bypass connections, allow revisiting equipment to show multiple paths
  const isBypassPath = path.length > 0 && connectionMap.get(equipmentId)?.downstream.some(d => d.connectionType === 'bypass');

  if (visited.has(equipmentId) && !isBypassPath) {
    return []; // Prevent cycles for normal paths only
  }

  const currentPath = [...path, equipmentId];
  const equipment: Equipment[] = [];

  const connections = connectionMap.get(equipmentId);
  if (!connections) return equipment;

  connections.downstream.forEach(downstream => {
    const connectionType = downstream.connectionType || 'normal';

    // Create a new visited set for each path to allow multiple routes to same equipment
    const newVisited = connectionType === 'bypass' ? new Set([...visited]) : new Set([...visited, equipmentId]);

    // Add this equipment
    equipment.push({
      id: downstream.id,
      name: downstream.name,
      type: downstream.type,
      level,
      parentId: equipmentId,
      sourceNumber: downstream.sourceNumber,
      sources: [downstream.sourceNumber],
      parentIds: [equipmentId],
      path: currentPath,
      connectionType
    });

    // Recursively traverse
    const childEquipment = traverseDownstream(
      downstream.id,
      connectionMap,
      newVisited,
      level + 1,
      currentPath
    );
    equipment.push(...childEquipment);
  });

  return equipment;
}

function resolveBranchFromPath(eq: Equipment, connectionMap: ConnectionMap): 'S1' | 'S2' | undefined {
  if (!eq.path || eq.path.length === 0) {
    return eq.branch as 'S1' | 'S2' | undefined || (eq.sourceNumber as 'S1' | 'S2' | undefined);
  }

  const downstreamId = eq.path[eq.path.length - 1];
  const downstreamEntry = connectionMap.get(downstreamId);
  const relation = downstreamEntry?.upstream.find(u => u.id === eq.id);

  if (relation?.sourceNumber === 'S2') return 'S2';
  if (relation?.sourceNumber === 'S1') return 'S1';

  return eq.branch as 'S1' | 'S2' | undefined || (eq.sourceNumber as 'S1' | 'S2' | undefined);
}

function processEquipmentForVisualization(equipment: Equipment[], connectionMap: ConnectionMap): ProcessedEquipment[] {
  // First, deduplicate equipment while preserving multiple sources and connection types
  const equipmentById = new Map<string, ProcessedEquipment>();

  equipment.forEach(eq => {
    const branchFromPath = resolveBranchFromPath(eq, connectionMap);
    const initialSources: string[] = [];
    if (eq.sourceNumber) {
      initialSources.push(eq.sourceNumber);
    }

    if (!equipmentById.has(eq.id)) {
      equipmentById.set(eq.id, {
        ...eq,
        sources: initialSources.length ? initialSources : ['S1'],
        parentIds: [eq.parentId].filter(Boolean) as string[],
        alternateParents: eq.connectionType && eq.connectionType !== 'normal' ? [{
          id: eq.parentId || '',
          sourceNumber: eq.sourceNumber || 'S1',
          connectionType: eq.connectionType
        }] : [],
        branch: branchFromPath || (eq.branch as 'S1' | 'S2' | undefined)
      });
      return;
    }

    const existing = equipmentById.get(eq.id)!;
    const branchCandidate = (branchFromPath || eq.branch || eq.sourceNumber) as 'S1' | 'S2' | undefined;

    // Merge multiple sources/paths
    if (eq.sourceNumber && !existing.sources.includes(eq.sourceNumber)) {
      existing.sources.push(eq.sourceNumber);
    }
    if (eq.parentId && !existing.parentIds.includes(eq.parentId)) {
      existing.parentIds.push(eq.parentId);
    }

    // Track alternate parents for bypass/redundant connections
    if (eq.connectionType && eq.connectionType !== 'normal' && eq.parentId) {
      if (!existing.alternateParents) {
        existing.alternateParents = [];
      }
      const alternateParent = {
        id: eq.parentId,
        sourceNumber: eq.sourceNumber || 'S1',
        connectionType: eq.connectionType
      };

      // Check if this alternate parent already exists
      const existsAlready = existing.alternateParents.some(alt =>
        alt.id === alternateParent.id && alt.connectionType === alternateParent.connectionType
      );

      if (!existsAlready) {
        existing.alternateParents.push(alternateParent);
      }
    }

    const isCloserPath = eq.level < existing.level;
    const branchConflict = branchCandidate && existing.branch && branchCandidate !== existing.branch;

    // For S1/S2 convergence at utilities: merge paths, prefer S1 as primary
    const isUtilityOrGenerator = eq.type.includes('UTILITY') || eq.type.includes('GEN') || eq.type.includes('MV-SWGR');
    if (isUtilityOrGenerator && existing.sources.includes('S1') && existing.sources.includes('S2')) {
      // Force S1 as primary branch for utilities
      existing.branch = 'S1';
      existing.sourceNumber = 'S1';
    } else if (isCloserPath || (branchConflict && branchCandidate === 'S2' && eq.level === existing.level)) {
      existing.level = eq.level;
      existing.parentId = eq.parentId;
      existing.path = eq.path;
      if (eq.sourceNumber) {
        existing.sourceNumber = eq.sourceNumber;
      }
      if (branchCandidate) {
        existing.branch = branchCandidate;
      }
      if (eq.connectionType) {
        existing.connectionType = eq.connectionType;
      }
    } else {
      if (!existing.branch && branchCandidate) {
        existing.branch = branchCandidate;
      } else if (branchCandidate === 'S1') {
        existing.branch = 'S1';
      }
    }
  });

  let processedEquipment = Array.from(equipmentById.values());

  // Detect and process loop groups (matching original extension logic)
  processedEquipment = processLoopGroups(processedEquipment, connectionMap);

  return processedEquipment;
}

function processLoopGroups(equipment: ProcessedEquipment[], connectionMap: ConnectionMap): ProcessedEquipment[] {
  const loopGroups: Map<string, LoopGroup> = new Map();

  // Detect loop patterns (ported from original extension)
  equipment.forEach(eq => {
    const name = eq.name.toLowerCase();
    let groupKey: string | null = null;

    // Pattern 1: CDS-01R series (ring bus)
    const cdsMatch = name.match(/cds[^a-z]*(\d+)[^a-z]*r/);
    if (cdsMatch) {
      groupKey = `CDS-${cdsMatch[1]}R-RING`;
    }

    // Pattern 2: ATS with multiple sources
    if (name.includes('ats') && eq.sources.length > 1) {
      groupKey = `${eq.name}-DUAL-SOURCE`;
    }

    if (groupKey) {
      if (!loopGroups.has(groupKey)) {
        loopGroups.set(groupKey, {
          equipment: [],
          groupKey,
          sources: []
        });
      }
      const group = loopGroups.get(groupKey)!;
      group.equipment.push(eq);
      eq.sources.forEach(source => {
        if (!group.sources.includes(source)) {
          group.sources.push(source);
        }
      });
    }
  });

  // Process detected loop groups
  const processedEquipment: ProcessedEquipment[] = [];
  const groupedEquipmentIds = new Set<string>();
  const replacementMap = new Map<string, string>(); // originalId -> loopRepId

  loopGroups.forEach((group, groupKey) => {
    if (group.equipment.length > 1) {
      // Find most common parent (vote counting)
      const parentVotes = new Map<string, number>();
      group.equipment.forEach(eq => {
        eq.parentIds.forEach(parentId => {
          parentVotes.set(parentId, (parentVotes.get(parentId) || 0) + 1);
        });
      });

      const mostCommonParent = Array.from(parentVotes.entries())
        .sort((a, b) => b[1] - a[1])[0]?.[0];

      // Find start and end equipment for descriptive naming
      const sortedEquipment = group.equipment.sort((a, b) => a.name.localeCompare(b.name));
      const startEquipment = sortedEquipment[0];
      const endEquipment = sortedEquipment[sortedEquipment.length - 1];

      // Determine the member closest to the selected equipment (smallest level).
      // When levels are equal, prefer S2 branches so loop reps stay on the S2 side.
      const closestToSelected = group.equipment.reduce((best, candidate) => {
        if (!best) return candidate;
        if (candidate.level < best.level) return candidate;
        if (candidate.level === best.level) {
          const candidateBranch = (candidate.branch as 'S1' | 'S2' | undefined)
            || (candidate.sourceNumber as 'S1' | 'S2' | undefined)
            || (candidate.sources || []).find(source => source === 'S1' || source === 'S2') as 'S1' | 'S2' | undefined;
          const bestBranch = (best.branch as 'S1' | 'S2' | undefined)
            || (best.sourceNumber as 'S1' | 'S2' | undefined)
            || (best.sources || []).find(source => source === 'S1' || source === 'S2') as 'S1' | 'S2' | undefined;
          if (candidateBranch === 'S2' && bestBranch !== 'S2') {
            return candidate;
          }
        }
        return best;
      }, group.equipment[0]);

      const prioritizedSource = (closestToSelected.sources || []).find(source => source === 'S1' || source === 'S2');
      const branchHint = (closestToSelected.branch as 'S1' | 'S2' | undefined)
        || (closestToSelected.sourceNumber as 'S1' | 'S2' | undefined)
        || (prioritizedSource as 'S1' | 'S2' | undefined);

      const loopParentId = closestToSelected.parentId
        || (closestToSelected.parentIds && closestToSelected.parentIds.length
          ? closestToSelected.parentIds[0]
          : undefined);

      let parentRelation: { sourceNumber: string } | undefined;
      if (loopParentId) {
        const parentEntry = connectionMap.get(loopParentId);
        parentRelation = parentEntry?.upstream.find(u =>
          group.equipment.some(member => member.id === u.id)
        );
      }

      let loopBranch = branchHint
        || (parentRelation?.sourceNumber as 'S1' | 'S2' | undefined)
        || (group.sources.includes('S2') && !group.sources.includes('S1') ? 'S2'
          : group.sources.includes('S1') ? 'S1'
          : undefined);

      // Create loop group representative
      const loopGroupRep: ProcessedEquipment = {
        id: `loop-${groupKey}`,
        name: `${startEquipment.name} ↔ ${endEquipment.name}`,
        type: 'RING BUS',
        level: closestToSelected.level,
        // Parent should be the downstream child directly connected to the loop
        parentId: loopParentId,
        sources: group.sources,
        parentIds: loopParentId ? [loopParentId] : [],
        isLoopGroup: true,
        branch: loopBranch,
        loopGroupData: {
          equipment: group.equipment,
          startEquipment,
          endEquipment,
          groupKey
        }
      };

      processedEquipment.push(loopGroupRep);

      // Track replacements: any member id -> rep id
      group.equipment.forEach(member => {
        replacementMap.set(member.id, loopGroupRep.id);
      });

      // Mark equipment as grouped
      group.equipment.forEach(eq => groupedEquipmentIds.add(eq.id));
    }
  });

  // Add non-grouped equipment
  equipment.forEach(eq => {
    if (!groupedEquipmentIds.has(eq.id)) {
      processedEquipment.push(eq);
    }
  });

  // Rewire parent references to point to loop representatives
  processedEquipment.forEach(eq => {
    if (eq.parentId && replacementMap.has(eq.parentId)) {
      eq.parentId = replacementMap.get(eq.parentId)!;
    }
    if (eq.parentIds && eq.parentIds.length) {
      eq.parentIds = eq.parentIds.map(pid => replacementMap.get(pid) || pid);
    }
  });

  // CRITICAL FIX: Fix levels after parent rewiring to use loop group levels
  console.log(`🔄 LEVEL FIX: Fixing levels after parent rewiring for ${processedEquipment.length} equipment`);

  const equipmentMap = new Map<string, ProcessedEquipment>();
  processedEquipment.forEach(eq => equipmentMap.set(eq.id, eq));

  // Simple fix: For each equipment, if parent exists, set level = parent.level + 1
  processedEquipment.forEach(eq => {
    if (eq.parentId) {
      const parent = equipmentMap.get(eq.parentId);
      if (parent) {
        const oldLevel = eq.level;
        const newLevel = parent.level + 1;
        if (oldLevel !== newLevel) {
          eq.level = newLevel;
          console.log(`🔄 LEVEL FIX: ${eq.name} → level ${oldLevel} → ${newLevel} (parent: ${parent.name} at level ${parent.level})`);
        }
      }
    }
  });

  console.log(`🔄 LEVEL FIX: After level fix, equipment levels:`, processedEquipment.map(eq => `${eq.name}:${eq.level}`))

  console.log(`Processed ${processedEquipment.length} equipment items (${loopGroups.size} loop groups created). Rewired ${replacementMap.size} member references to loop reps.`);
  return processedEquipment;
}

function ensureCompleteUpstreamCoverage(
  selectedEquipment: ProcessedEquipment,
  upstream: ProcessedEquipment[],
  connectionMap: ConnectionMap
): ProcessedEquipment[] {
  const equipmentMap = new Map<string, ProcessedEquipment>();
  upstream.forEach(eq => equipmentMap.set(eq.id, eq));

  const queue: Array<{ id: string; level: number }> = [{
    id: selectedEquipment.id,
    level: selectedEquipment.level ?? 0
  }];
  const visited = new Set<string>();

  while (queue.length) {
    const { id, level } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const connections = connectionMap.get(id);
    if (!connections) continue;

    connections.upstream.forEach(parent => {
      const parentLevel = level + 1;
      const existing = equipmentMap.get(parent.id);

      if (!existing) {
        const parentName = parent.name || 'Unknown Equipment';
        const parentType = parent.type || 'UNKNOWN';
        const inferred: ProcessedEquipment = {
          id: parent.id,
          name: parentName,
          type: parentType,
          level: parentLevel,
          parentId: id,
          sourceNumber: parent.sourceNumber,
          sources: parent.sourceNumber ? [parent.sourceNumber] : ['S1'],
          parentIds: [id],
          branch: (parent.sourceNumber as 'S1' | 'S2' | undefined) || 'S1',
          connectionType: parent.connectionType || 'normal',
          path: [id]
        };

        upstream.push(inferred);
        equipmentMap.set(inferred.id, inferred);
        queue.push({ id: inferred.id, level: parentLevel });
        return;
      }

      if (!existing.parentIds) {
        existing.parentIds = [];
      }
      if (!existing.parentIds.includes(id)) {
        existing.parentIds.push(id);
      }
      if (!existing.sources) {
        existing.sources = [];
      }
      if (parent.sourceNumber && !existing.sources.includes(parent.sourceNumber)) {
        existing.sources.push(parent.sourceNumber);
      }
      if (!existing.parentId) {
        existing.parentId = id;
      }
      if (!existing.branch && parent.sourceNumber) {
        existing.branch = parent.sourceNumber as 'S1' | 'S2';
      }
      queue.push({ id: parent.id, level: parentLevel });
    });
  }

  return upstream;
}

// Equipment classification functions for enhanced layout
function categorizeByType(type: string): 'UTILITY' | 'GENERATOR' | 'TRANSFORMER' | 'DISTRIBUTION' | 'END_EQUIPMENT' {
  const typeUpper = type.toUpperCase();

  if (typeUpper.includes('UTILITY') || typeUpper.includes('PADMOUNT') || typeUpper.includes('PAD MOUNT')) {
    return 'UTILITY';
  }
  if (typeUpper.includes('MDS') || typeUpper.includes('SWGR') || typeUpper.includes('SWITCHGEAR')) {
    return 'DISTRIBUTION';
  }
  if (typeUpper.includes('UPS')) {
    return 'DISTRIBUTION';
  }
  if (typeUpper.includes('TX') || typeUpper.includes('TRANSFORMER') || typeUpper.includes('XFMR')) {
    return 'TRANSFORMER';
  }
  if (typeUpper.includes('GEN') || typeUpper.includes('GENERATOR')) {
    return 'GENERATOR';
  }
  return 'END_EQUIPMENT';
}

function determineBranch(equipment: ProcessedEquipment): 'S1' | 'S2' {
  // Priority order for branch determination
  if (equipment.branch === 'S1' || equipment.branch === 'S2') {
    return equipment.branch;
  }
  if (equipment.sourceNumber === 'S1' || equipment.sourceNumber === 'S2') {
    return equipment.sourceNumber as 'S1' | 'S2';
  }
  if (equipment.sources.includes('S2')) {
    return 'S2';
  }
  return 'S1'; // Default to S1
}

function isLateralConnection(equipment: ProcessedEquipment, connectionMap: ConnectionMap): boolean {
  // UPS equipment that forms a bidirectional loop with its parent should sit laterally
  const isUps = equipment.type.toUpperCase().includes('UPS');
  const parentId = equipment.parentId;
  if (!isUps || !parentId) {
    return false;
  }

  const connections = connectionMap.get(equipment.id);
  if (!connections) return false;

  const returnsToParent = connections.downstream.some(child => child.id === parentId);
  const receivesFromParent = connections.upstream.some(parent => parent.id === parentId);

  return returnsToParent && receivesFromParent;
}

function classifyEquipmentForLayout(
  equipment: ProcessedEquipment[],
  connectionMap: ConnectionMap
): EquipmentLayoutInfo[] {
  return equipment.map(eq => {
    const isUps = eq.type.toUpperCase().includes('UPS');
    const parentRelation = eq.parentId
      ? connectionMap.get(eq.id)?.upstream.find(parent => parent.id === eq.parentId)
      : undefined;
    const parentIsMds = parentRelation?.type?.toUpperCase().includes('MDS') ?? false;

    let isLateral = isLateralConnection(eq, connectionMap);
    if (!isLateral && isUps && parentIsMds) {
      isLateral = true;
    }

    let lateralInfo: EquipmentLayoutInfo['lateralInfo'] = undefined;

    if (isLateral && eq.parentId) {
      const branch = determineBranch(eq);
      // UPS equipment should always be positioned on the left side of MDS for tight coupling
      lateralInfo = {
        parentId: eq.parentId,
        direction: isUps ? 'left' : (branch === 'S2' ? 'right' : 'left'),
        offset: lateralUpsOffset
      };
    }

    return {
      equipment: eq,
      branch: determineBranch(eq),
      typeCategory: categorizeByType(eq.type),
      level: eq.level,
      isLateral,
      parentId: eq.parentId,
      lateralInfo
    };
  });
}

// CORRECTED: Natural parent-child branching (NOT global segregation)
function positionEquipmentByParent(
  _equipment: EquipmentLayoutInfo[],
  _level: number,
  _positions: Map<string, Position>
): void {
  // Deprecated: retained for backward compatibility with older planning notes.
  // Span-based layout now handles positioning.
}

// CORRECTED: Natural parent-child grouping with minimal spacing - children stay close to parent
function positionChildrenFromParent(
  _children: EquipmentLayoutInfo[],
  _parentPos: Position,
  _y: number,
  _positions: Map<string, Position>
): void {
  // Deprecated: span-based layout handles placement directly.
}

function buildPlacementTree(
  selected: ProcessedEquipment,
  layoutInfoMap: Map<string, EquipmentLayoutInfo>,
  connectionMap: ConnectionMap
): PlacementTree {
  const nodes = new Map<string, PlacementNode>();

  console.log(`🌳 PLACEMENT TREE: Building placement tree from ${layoutInfoMap.size} equipment`);

  layoutInfoMap.forEach(info => {
    nodes.set(info.equipment.id, {
      id: info.equipment.id,
      parentId: info.parentId,
      info,
      children: {
        s1: [],
        s2: [],
        laterals: []
      }
    });
  });

  const queue: string[] = [selected.id];
  const visited = new Set<string>();

  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const node = nodes.get(id);
    if (!node) continue;

    const connections = connectionMap.get(id);
    if (!connections) continue;

    connections.upstream.forEach(parent => {
      const parentInfo = layoutInfoMap.get(parent.id);
      if (!parentInfo) return;

      const parentNode = nodes.get(parent.id);
      if (!parentNode) return;

      parentNode.parentId = id;

      if (parentInfo.isLateral) {
        node.children.laterals.push(parent.id);
        if (!visited.has(parent.id)) {
          queue.push(parent.id);
        }
        return;
      }

      if (parentInfo.branch === 'S2') {
        node.children.s2.push(parent.id);
      } else {
        node.children.s1.push(parent.id);
      }

      if (!visited.has(parent.id)) {
        queue.push(parent.id);
      }
    });
  }

  return { root: selected.id, rootId: selected.id, nodes };
}

function computeRowWidthPx(nodeCount: number): number {
  if (nodeCount <= 1) return nodeWidth;
  return nodeCenterSpacing * (nodeCount - 1);
}

function computeLayoutMetrics(tree: PlacementTree): LayoutMetrics {
  let maxRowCount = 0;
  let firstSplitLevel: number | null = null;
  const levelCounts = new Map<number, number>();

  tree.nodes.forEach(node => {
    const { info, children } = node;
    if (!info.isLateral) {
      const count = (levelCounts.get(info.level) ?? 0) + 1;
      levelCounts.set(info.level, count);
      if (count > maxRowCount) {
        maxRowCount = count;
      }
    }

    if (firstSplitLevel === null && children.s1.length > 0 && children.s2.length > 0) {
      firstSplitLevel = info.level;
    }
  });

  if (maxRowCount < 1) {
    maxRowCount = 1;
  }

  return {
    maxRowWidthPx: computeRowWidthPx(maxRowCount),
    maxRowCount,
    firstSplitLevel
  };
}

function createLevelBaselines(
  layoutInfo: Iterable<EquipmentLayoutInfo>,
  selectedLevel: number
): Map<number, number> {
  const baselines = new Map<number, number>();
  baselines.set(selectedLevel, centerY);

  for (const info of layoutInfo) {
    if (!baselines.has(info.level)) {
      baselines.set(info.level, centerY - (info.level - selectedLevel) * levelSpacing);
    }
  }

  return baselines;
}

function computeSubtreeSpan(
  nodeId: string,
  tree: PlacementTree,
  spanMap: Map<string, SubtreeDimensions>,
  visited: Set<string> = new Set(),
  loopGroupMemberIds: Set<string> = new Set()
): SubtreeDimensions {
  if (spanMap.has(nodeId)) {
    return spanMap.get(nodeId)!;
  }

  // Cycle detection to prevent infinite recursion
  if (visited.has(nodeId)) {
    const fallback: SubtreeDimensions = {
      width: nodeWidth,
      leftBias: nodeWidth / 2,
      rightBias: nodeWidth / 2
    };
    spanMap.set(nodeId, fallback);
    return fallback;
  }

  const node = tree.nodes.get(nodeId);
  if (!node) {
    const fallback: SubtreeDimensions = {
      width: nodeWidth,
      leftBias: nodeWidth / 2,
      rightBias: nodeWidth / 2
    };
    spanMap.set(nodeId, fallback);
    return fallback;
  }

  // If this node is an individual loop group member, return minimal width
  if (loopGroupMemberIds.has(nodeId)) {
    const minimalSpan: SubtreeDimensions = {
      width: 0, // Don't contribute to spacing
      leftBias: 0,
      rightBias: 0
    };
    spanMap.set(nodeId, minimalSpan);
    return minimalSpan;
  }

  // If this node is a loop group, constrain its width
  if (node.info.equipment.isLoopGroup) {
    visited.add(nodeId);

    const s1Spans = node.children.s1.map(childId => computeSubtreeSpan(childId, tree, spanMap, visited, loopGroupMemberIds));
    const s2Spans = node.children.s2.map(childId => computeSubtreeSpan(childId, tree, spanMap, visited, loopGroupMemberIds));

    const s1Width = sumGroupWidth(s1Spans);
    const s2Width = sumGroupWidth(s2Spans);

    // For loop groups, use constrained width instead of full child span
    const constrainedWidth = Math.max(nodeWidth, Math.min(nodeWidth * 3, Math.max(s1Width, s2Width)));
    const leftBias = constrainedWidth / 2;
    const rightBias = constrainedWidth / 2;

    const span: SubtreeDimensions = {
      width: constrainedWidth,
      leftBias,
      rightBias
    };

    spanMap.set(nodeId, span);
    visited.delete(nodeId);
    return span;
  }

  // Add current node to visited set
  visited.add(nodeId);

  // Check for excessive recursion depth
  if (visited.size > 50) {
    const fallback: SubtreeDimensions = {
      width: nodeWidth,
      leftBias: nodeWidth / 2,
      rightBias: nodeWidth / 2
    };
    spanMap.set(nodeId, fallback);
    visited.delete(nodeId);
    return fallback;
  }

  const s1Spans = node.children.s1.map(childId => computeSubtreeSpan(childId, tree, spanMap, visited, loopGroupMemberIds));
  const s2Spans = node.children.s2.map(childId => computeSubtreeSpan(childId, tree, spanMap, visited, loopGroupMemberIds));

  const s1Width = sumGroupWidth(s1Spans);
  const s2Width = sumGroupWidth(s2Spans);

  const leftBias = Math.max(nodeWidth / 2, s1Width);
  const rightBias = Math.max(nodeWidth / 2, s2Width);

  const span: SubtreeDimensions = {
    width: leftBias + rightBias,
    leftBias,
    rightBias
  };

  spanMap.set(nodeId, span);

  // Remove from visited set when done (backtrack)
  visited.delete(nodeId);

  return span;
}

function sumGroupWidth(spans: SubtreeDimensions[]): number {
  if (spans.length === 0) return 0;
  const total = spans.reduce((acc, span) => acc + span.width, 0);
  const spacing = (spans.length - 1) * nodeCenterSpacing;
  return total + spacing;
}

function computeBranchOffset(
  nodeInfo: EquipmentLayoutInfo,
  childLevels: number[],
  metrics: LayoutMetrics
): number {
  if (childLevels.length === 0) return localBranchOffset;
  const maxChildLevel = Math.max(...childLevels);
  const depthSteps = Math.max(1, maxChildLevel - nodeInfo.level);
  let offset = localBranchOffset + depthSteps * branchSpreadIncrement;

  if (metrics.firstSplitLevel !== null) {
    const relativeLevel = nodeInfo.level - metrics.firstSplitLevel;
    if (relativeLevel >= 0) {
      const baseHalfWidth = metrics.maxRowWidthPx * 0.4;
      const widened = baseHalfWidth + relativeLevel * branchSpreadIncrement;
      offset = Math.max(offset, widened);
    }
  }

  return offset;
}

function computeGroupSlots(
  parentCenterX: number,
  childIds: string[],
  spans: SubtreeDimensions[],
  direction: -1 | 1,
  hasOppositeBranch: boolean,
  branchOffset: number
): number[] {
  if (childIds.length === 0) return [];

  if (childIds.length === 1) {
    if (!hasOppositeBranch) {
      return [parentCenterX]; // Center single child when no opposite branch
    }
    const span = spans[0] || {
      width: nodeWidth,
      leftBias: nodeWidth / 2,
      rightBias: nodeWidth / 2
    };
    const effectiveWidth = Math.min(span.width, nodeWidth + minimumNodeSpacing);
    const branchCenter = parentCenterX + direction * (branchOffset + effectiveWidth / 2);
    return [branchCenter];
  }

  const groupWidth = sumGroupWidth(spans);

  let start: number;
  if (!hasOppositeBranch) {
    start = parentCenterX - groupWidth / 2;
  } else {
    if (direction === -1) {
      start = parentCenterX - branchOffset - groupWidth;
    } else {
      start = parentCenterX + branchOffset;
    }
  }

  const slots: number[] = [];
  let cursor = start;

  childIds.forEach((childId, index) => {
    const span = spans[index];
    slots.push(cursor + span.leftBias);
    cursor += span.width;
    if (index < childIds.length - 1) {
      cursor += minimumNodeSpacing;
    }
  });

  return slots;
}

function assignPositionsRecursive(
  nodeId: string,
  centerXPos: number,
  tree: PlacementTree,
  spanMap: Map<string, SubtreeDimensions>,
  positions: Map<string, Position>,
  baselines: Map<number, number>,
  visited: Set<string>,
  metrics: LayoutMetrics
): void {
  if (visited.has(nodeId)) return;
  visited.add(nodeId);

  const node = tree.nodes.get(nodeId);
  if (!node) return;

  const baselineY = baselines.get(node.info.level) ?? (centerY - node.info.level * levelSpacing);
  positions.set(nodeId, { x: centerXPos, y: baselineY });

  const hasS1 = node.children.s1.length > 0;
  const hasS2 = node.children.s2.length > 0;

  const s1Spans = node.children.s1.map(childId => spanMap.get(childId) || {
    width: nodeWidth,
    leftBias: nodeWidth / 2,
    rightBias: nodeWidth / 2
  });
  const s2Spans = node.children.s2.map(childId => spanMap.get(childId) || {
    width: nodeWidth,
    leftBias: nodeWidth / 2,
    rightBias: nodeWidth / 2
  });

  const s1Levels = node.children.s1.map(childId => tree.nodes.get(childId)?.info.level ?? node.info.level + 1);
  const s2Levels = node.children.s2.map(childId => tree.nodes.get(childId)?.info.level ?? node.info.level + 1);

  const s1BranchOffset = computeBranchOffset(node.info, s1Levels, metrics);
  const s2BranchOffset = computeBranchOffset(node.info, s2Levels, metrics);

  const s1Slots = computeGroupSlots(centerXPos, node.children.s1, s1Spans, -1, hasS2, s1BranchOffset);
  const s2Slots = computeGroupSlots(centerXPos, node.children.s2, s2Spans, 1, hasS1, s2BranchOffset);

  node.children.s1.forEach((childId, index) => {
    assignPositionsRecursive(childId, s1Slots[index], tree, spanMap, positions, baselines, visited, metrics);
  });

  node.children.s2.forEach((childId, index) => {
    assignPositionsRecursive(childId, s2Slots[index], tree, spanMap, positions, baselines, visited, metrics);
  });
}


function normalizeLevelWidths(
  positions: Map<string, Position>,
  layoutInfoMap: Map<string, EquipmentLayoutInfo>,
  metrics: LayoutMetrics,
  tree: PlacementTree
): void {
  console.log('🔧 NORMALIZE: Implementing proper S1/S2 branch ordering...');

  // Group equipment by level (excluding laterals)
  const levels = new Map<number, string[]>();

  layoutInfoMap.forEach(info => {
    if (info.isLateral) {
      console.log(`    🔗 LATERAL SKIPPED: ${info.equipment.name} (${info.equipment.type})`);
      return; // Skip laterals
    }

    // Include loop groups in normalization to fix extreme positioning
    if (info.equipment.isLoopGroup) {
      console.log(`    🔄 LOOP GROUP INCLUDED: ${info.equipment.name} (will be normalized)`);
    }

    const pos = positions.get(info.equipment.id);
    if (!pos) return;
    if (!levels.has(info.level)) {
      levels.set(info.level, []);
    }
    levels.get(info.level)!.push(info.equipment.id);
    console.log(`    ⚙️ INCLUDED: ${info.equipment.name} (${info.equipment.type}) at level ${info.level}`);
  });

  levels.forEach((ids, level) => {
    if (ids.length === 0) return;

    console.log(`🔧 Level ${level}: Processing ${ids.length} nodes for proper ordering`);

    // Step 1: Group by parent branch (which MDS/parent they connect to)
    const branchGroups = new Map<string, { s1: string[], s2: string[] }>();

    ids.forEach(id => {
      const info = layoutInfoMap.get(id);
      if (!info) return;

      // Find the parent ID (which branch/MDS this equipment connects to)
      const parentId = info.parentId || 'unknown';
      const branch = info.branch || 'S1';
      const parentName = layoutInfoMap.get(parentId)?.equipment.name || parentId;

      console.log(`    📊 ${info.equipment.name}: parent=${parentName}, branch=${branch}`);

      if (!branchGroups.has(parentId)) {
        branchGroups.set(parentId, { s1: [], s2: [] });
      }

      if (branch === 'S1') {
        branchGroups.get(parentId)!.s1.push(id);
      } else {
        branchGroups.get(parentId)!.s2.push(id);
      }
    });

    // Step 2: Sort branch groups by GRANDPARENT branch hierarchy, NOT parent or alphabetical
    const sortedBranches = Array.from(branchGroups.entries()).sort(([parentA], [parentB]) => {
      const parentInfoA = layoutInfoMap.get(parentA);
      const parentInfoB = layoutInfoMap.get(parentB);
      const nameA = parentInfoA?.equipment.name || parentA;
      const nameB = parentInfoB?.equipment.name || parentB;

      // Helper function to get branch path by tracing up hierarchy to find loop group (up to 6 levels)
      const getBranchPath = (parentId: string): string => {
        let currentId = parentId;
        const tracePath: string[] = [];

        // Trace up to 6 levels to find a loop group
        for (let level = 0; level < 6; level++) {
          const currentInfo = layoutInfoMap.get(currentId);
          if (!currentInfo) break;

          tracePath.push(currentInfo.equipment.name);

          // If we found a loop group, use its branch designation
          if (currentInfo.equipment.isLoopGroup) {
            const loopBranch = currentInfo.branch || 'S1';
            console.log(`    🧬 TRACE (${level + 1} levels): ${parentId} → ${tracePath.join(' → ')} = ${loopBranch}`);
            return loopBranch;
          }

          // Move up to the next parent
          if (!currentInfo.parentId) break;
          currentId = currentInfo.parentId;
        }

        // If no loop group found, use the original parent's branch
        const parentInfo = layoutInfoMap.get(parentId);
        const fallbackBranch = parentInfo?.branch || 'S1';
        console.log(`    🧬 TRACE (fallback): ${parentId} → ${tracePath.join(' → ')} = ${fallbackBranch} (no loop group found)`);
        return fallbackBranch;
      };

      const branchPathA = getBranchPath(parentA);
      const branchPathB = getBranchPath(parentB);

      // Primary sort: Sort by grandparent loop group branch (S1 before S2)
      if (branchPathA !== branchPathB) {
        const result = branchPathA === 'S1' ? -1 : 1;
        console.log(`  🔍 Grandparent branch sorting: "${nameA}" (path=${branchPathA}) vs "${nameB}" (path=${branchPathB}) = ${result}`);
        return result;
      }

      // Secondary sort: within same grandparent branch, sort by direct parent branch
      const directBranchA = parentInfoA?.branch || 'S1';
      const directBranchB = parentInfoB?.branch || 'S1';
      if (directBranchA !== directBranchB) {
        const result = directBranchA === 'S1' ? -1 : 1;
        console.log(`  🔍 Direct parent branch sorting: "${nameA}" (${directBranchA}) vs "${nameB}" (${directBranchB}) = ${result}`);
        return result;
      }

      // Tertiary sort: if everything else is same, sort alphabetically
      const result = nameA.localeCompare(nameB);
      console.log(`  🔍 Name sorting: "${nameA}" vs "${nameB}" = ${result}`);
      return result;
    });

    // Step 3: Build the final ordered list following the pattern:
    // S1-branch-S1-nodes, S1-branch-S2-nodes, S2-branch-S1-nodes, S2-branch-S2-nodes
    const orderedIds: string[] = [];

    sortedBranches.forEach(([parentId, groups]) => {
      const parentName = layoutInfoMap.get(parentId)?.equipment.name || parentId;
      console.log(`  🌿 Branch ${parentName}: ${groups.s1.length} S1 nodes, ${groups.s2.length} S2 nodes`);

      // Sort within each group by equipment name for consistency
      const sortedS1 = groups.s1.sort((a, b) => {
        const nameA = layoutInfoMap.get(a)?.equipment.name ?? '';
        const nameB = layoutInfoMap.get(b)?.equipment.name ?? '';
        return nameA.localeCompare(nameB);
      });

      const sortedS2 = groups.s2.sort((a, b) => {
        const nameA = layoutInfoMap.get(a)?.equipment.name ?? '';
        const nameB = layoutInfoMap.get(b)?.equipment.name ?? '';
        return nameA.localeCompare(nameB);
      });

      // Add S1 nodes first, then S2 nodes for this branch
      orderedIds.push(...sortedS1);
      orderedIds.push(...sortedS2);
    });

    console.log(`  📐 Final ordering for level ${level}:`);
    orderedIds.forEach((id, idx) => {
      const info = layoutInfoMap.get(id);
      const name = info?.equipment.name || id;
      const branch = info?.branch || 'unknown';
      const parentName = info?.parentId ? (layoutInfoMap.get(info.parentId)?.equipment.name || info.parentId) : 'none';
      console.log(`    ${idx}: ${name} (${branch} from ${parentName})`);
    });

    // Step 4: Calculate positions with 200px gaps (380px center-to-center)
    const spacing = 380; // 200px gap + 180px node width = 380px center-to-center
    const totalWidth = (orderedIds.length - 1) * spacing;
    const startX = centerX - (totalWidth / 2);

    console.log(`  📏 Total width: ${totalWidth}px, Start X: ${startX}, Spacing: ${spacing}px`);

    // Step 5: Position all equipment
    orderedIds.forEach((id, idx) => {
      const current = positions.get(id);
      if (!current) return;

      const newX = startX + (idx * spacing);
      positions.set(id, { x: newX, y: current.y });

      const info = layoutInfoMap.get(id);
      const name = info?.equipment.name || id;
      console.log(`    ✅ ${name}: x=${newX}, y=${current.y} (index ${idx})`);
    });
  });
}

function positionLateralEquipment(
  tree: PlacementTree,
  positions: Map<string, Position>,
  baselines: Map<number, number>
): void {
  tree.nodes.forEach(node => {
    if (node.children.laterals.length === 0) return;
    const parentPos = positions.get(node.id);
    if (!parentPos) return;

    node.children.laterals.forEach(lateralId => {
      const lateralNode = tree.nodes.get(lateralId);
      if (!lateralNode) return;
      const info = lateralNode.info;

      // Enforce UPS-MDS pairing rule: 100px edge gap (≈280px center-to-center)
      const isUps = info.equipment.type.toUpperCase().includes('UPS');
      const y = parentPos.y; // Same Y as parent (MDS)

      if (isUps) {
        // Rule #2: UPS belongs on LEFT side of MDS with 100px edge gap
        // 100px edge gap = 100px + (nodeWidth/2) + (nodeWidth/2) = 100px + 180px = 280px center-to-center
        const upsX = parentPos.x - 280; // 100px edge gap from MDS
        positions.set(lateralId, { x: upsX, y });
      } else {
        // Non-UPS lateral equipment uses original logic
        const current = positions.get(lateralId);
        if (current) {
          positions.set(lateralId, { x: current.x, y });
          return;
        }
        const direction = info.branch === 'S2' ? 1 : -1;
        positions.set(lateralId, {
          x: parentPos.x + direction * lateralUpsOffset,
          y
        });
      }
    });
  });
}

function calculateUpstreamPositions(
  selectedEquipment: ProcessedEquipment,
  layoutInfo: EquipmentLayoutInfo[],
  connectionMap: ConnectionMap
): {
  positions: Map<string, Position>;
  layoutInfoMap: Map<string, EquipmentLayoutInfo>;
  baselines: Map<number, number>;
  tree: PlacementTree;
} {
  console.log('🏗️ ===== LAYOUT PROCESS START =====');
  console.log(`📊 Total equipment to layout: ${layoutInfo.length}`);

  // Log equipment by level and type
  const equipmentByLevel = new Map<number, EquipmentLayoutInfo[]>();
  layoutInfo.forEach(info => {
    const level = info.level;
    if (!equipmentByLevel.has(level)) {
      equipmentByLevel.set(level, []);
    }
    equipmentByLevel.get(level)!.push(info);
  });

  console.log('📋 Equipment breakdown by level:');
  Array.from(equipmentByLevel.entries()).sort(([a], [b]) => a - b).forEach(([level, equipment]) => {
    const utilities = equipment.filter(e => e.typeCategory === 'UTILITY');
    const others = equipment.filter(e => e.typeCategory !== 'UTILITY');
    console.log(`  Level ${level}: ${equipment.length} total (${utilities.length} utilities, ${others.length} others)`);
    utilities.forEach(u => console.log(`    🔌 ${u.equipment.name} (${u.branch})`));
    others.forEach(o => {
      const parentInfo = o.parentId ? layoutInfo.find(p => p.equipment.id === o.parentId) : null;
      const parentName = parentInfo?.equipment.name || 'none';
      const parentLevel = parentInfo?.level ?? 'unknown';
      console.log(`    ⚙️ ${o.equipment.name} (${o.branch}) [${o.typeCategory}] parent: ${parentName} (level ${parentLevel}) → level ${o.level}`);
    });
  });

  const layoutInfoMap = new Map<string, EquipmentLayoutInfo>();
  layoutInfo.forEach(info => layoutInfoMap.set(info.equipment.id, info));

  if (!layoutInfoMap.has(selectedEquipment.id)) {
    layoutInfoMap.set(selectedEquipment.id, {
      equipment: selectedEquipment,
      branch: 'S1',
      typeCategory: categorizeByType(selectedEquipment.type || ''),
      level: selectedEquipment.level ?? 0,
      isLateral: false,
      parentId: undefined
    });
  }

  console.log('🌳 STEP 1: Building placement tree...');
  const placementTree = buildPlacementTree(selectedEquipment, layoutInfoMap, connectionMap);

  console.log('📏 STEP 2: Creating level baselines...');
  const baselines = createLevelBaselines(layoutInfoMap.values(), selectedEquipment.level ?? 0);
  Array.from(baselines.entries()).forEach(([level, y]) => {
    console.log(`  Level ${level}: y=${y}`);
  });

  // Create set of loop group member IDs for width calculation optimization
  const spanLoopGroupMemberIds = new Set<string>();
  layoutInfo.forEach(info => {
    if (info.equipment.isLoopGroup && info.equipment.loopGroupData?.equipment) {
      info.equipment.loopGroupData.equipment.forEach(member => {
        spanLoopGroupMemberIds.add(member.id);
      });
    }
  });

  console.log('📐 STEP 3: Computing subtree spans...');
  const spanMap = new Map<string, SubtreeDimensions>();
  const spanVisited = new Set<string>();
  computeSubtreeSpan(placementTree.rootId, placementTree, spanMap, spanVisited, spanLoopGroupMemberIds);

  console.log('🎯 STEP 4: Initial position assignment...');
  const positions = new Map<string, Position>();
  const visited = new Set<string>();
  const layoutMetrics = computeLayoutMetrics(placementTree);

  assignPositionsRecursive(
    placementTree.rootId,
    centerX,
    placementTree,
    spanMap,
    positions,
    baselines,
    visited,
    layoutMetrics
  );

  console.log('📍 After initial assignment, utility positions:');
  Array.from(positions.entries()).forEach(([id, pos]) => {
    const info = layoutInfoMap.get(id);
    if (info?.typeCategory === 'UTILITY') {
      console.log(`  ${info.equipment.name}: x=${Math.round(pos.x)}, y=${Math.round(pos.y)} (${info.branch})`);
    }
  });

  console.log('🔧 STEP 5: Normalizing level widths...');
  normalizeLevelWidths(positions, layoutInfoMap, layoutMetrics, placementTree);

  console.log('📍 After normalization, utility positions:');
  Array.from(positions.entries()).forEach(([id, pos]) => {
    const info = layoutInfoMap.get(id);
    if (info?.typeCategory === 'UTILITY') {
      console.log(`  ${info.equipment.name}: x=${Math.round(pos.x)}, y=${Math.round(pos.y)} (${info.branch})`);
    }
  });

  console.log('🔗 STEP 6: Positioning lateral equipment...');
  positionLateralEquipment(placementTree, positions, baselines);

  console.log('📍 After lateral positioning, utility positions:');
  Array.from(positions.entries()).forEach(([id, pos]) => {
    const info = layoutInfoMap.get(id);
    if (info?.typeCategory === 'UTILITY') {
      console.log(`  ${info.equipment.name}: x=${Math.round(pos.x)}, y=${Math.round(pos.y)} (${info.branch})`);
    }
  });

  console.log('⚡ STEP 7: First collision detection...');
  const anchorPositions = new Map(positions);
  const resolvedPositions = detectAndResolveCollisions(positions, layoutInfoMap, anchorPositions);

  console.log('📍 After first collision resolution, utility positions:');
  Array.from(resolvedPositions.entries()).forEach(([id, pos]) => {
    const info = layoutInfoMap.get(id);
    if (info?.typeCategory === 'UTILITY') {
      console.log(`  ${info.equipment.name}: x=${Math.round(pos.x)}, y=${Math.round(pos.y)} (${info.branch})`);
    }
  });

  console.log('🔌 STEP 8: UPS-MDS pair tightening...');
  applyUpsMdsPairTightening(resolvedPositions, layoutInfoMap, connectionMap, anchorPositions);

  console.log('📍 After UPS-MDS tightening, utility positions:');
  Array.from(resolvedPositions.entries()).forEach(([id, pos]) => {
    const info = layoutInfoMap.get(id);
    if (info?.typeCategory === 'UTILITY') {
      console.log(`  ${info.equipment.name}: x=${Math.round(pos.x)}, y=${Math.round(pos.y)} (${info.branch})`);
    }
  });

  console.log('⚡ STEP 9: Second collision detection...');
  const finalPositions = detectAndResolveCollisions(resolvedPositions, layoutInfoMap, anchorPositions);

  console.log('📍 After second collision resolution, utility positions:');
  Array.from(finalPositions.entries()).forEach(([id, pos]) => {
    const info = layoutInfoMap.get(id);
    if (info?.typeCategory === 'UTILITY') {
      console.log(`  ${info.equipment.name}: x=${Math.round(pos.x)}, y=${Math.round(pos.y)} (${info.branch})`);
    }
  });

  console.log('🔗 STEP 10: Final lateral positioning...');
  positionLateralEquipment(placementTree, finalPositions, baselines);

  console.log('📏 STEP 11: Enforcing category baselines...');
  // TEMPORARILY DISABLED: This is causing all utilities to collapse to same Y level
  // enforceCategoryBaselines(finalPositions, layoutInfoMap, baselines);

  console.log('📍 After baseline enforcement, utility positions:');
  Array.from(finalPositions.entries()).forEach(([id, pos]) => {
    const info = layoutInfoMap.get(id);
    if (info?.typeCategory === 'UTILITY') {
      console.log(`  ${info.equipment.name}: x=${Math.round(pos.x)}, y=${Math.round(pos.y)} (${info.branch})`);
    }
  });

  console.log('🛠️ STEP 12: Final overlap prevention...');
  ensureNoOverlaps(finalPositions);

  console.log('🏁 FINAL UTILITY POSITIONS:');
  Array.from(finalPositions.entries()).forEach(([id, pos]) => {
    const info = layoutInfoMap.get(id);
    if (info?.typeCategory === 'UTILITY') {
      console.log(`  ✅ ${info.equipment.name}: x=${Math.round(pos.x)}, y=${Math.round(pos.y)} (${info.branch})`);
    }
  });

  // Check for any remaining overlaps
  const positionGroups = new Map<string, string[]>();
  Array.from(finalPositions.entries()).forEach(([id, pos]) => {
    const coord = `${Math.round(pos.x)},${Math.round(pos.y)}`;
    if (!positionGroups.has(coord)) {
      positionGroups.set(coord, []);
    }
    positionGroups.get(coord)!.push(id);
  });

  Array.from(positionGroups.entries()).forEach(([coord, ids]) => {
    if (ids.length > 1) {
      const names = ids.map(id => layoutInfoMap.get(id)?.equipment.name || id);
      console.log(`❌ OVERLAP DETECTED at ${coord}: ${names.join(', ')}`);

      // Log details about the overlapping equipment
      ids.forEach(id => {
        const info = layoutInfoMap.get(id);
        const pos = finalPositions.get(id);
        if (info && pos) {
          console.log(`  📍 ${info.equipment.name}: Level ${info.level}, Branch ${info.branch}, Parent: ${info.parentId || 'none'}, Pos: (${pos.x}, ${pos.y})`);
        }
      });
    }
  });

  console.log('🔄 STEP 13: Applying MDS/UPS pair positioning constraints...');

  // Collect all MDS-UPS pairs at each level for proper spacing
  const mdsPairsByLevel = new Map<number, Array<{
    mdsId: string,
    mdsInfo: EquipmentLayoutInfo,
    mdsPos: Position,
    upsId?: string,
    upsInfo?: EquipmentLayoutInfo,
    upsPos?: Position
  }>>();

  finalPositions.forEach((pos, id) => {
    const info = layoutInfoMap.get(id);
    if (info?.equipment.type.includes('MDS')) {
      const level = info.level;
      if (!mdsPairsByLevel.has(level)) {
        mdsPairsByLevel.set(level, []);
      }

      // Find paired UPS
      let pairedUpsId: string | undefined;
      let pairedUpsInfo: EquipmentLayoutInfo | undefined;
      let pairedUpsPos: Position | undefined;

      layoutInfoMap.forEach((upsInfo, upsId) => {
        if (upsInfo.isLateral && upsInfo.equipment.type.includes('UPS') && upsInfo.parentId === id) {
          pairedUpsId = upsId;
          pairedUpsInfo = upsInfo;
          pairedUpsPos = finalPositions.get(upsId);
        }
      });

      mdsPairsByLevel.get(level)!.push({
        mdsId: id,
        mdsInfo: info,
        mdsPos: pos,
        upsId: pairedUpsId,
        upsInfo: pairedUpsInfo,
        upsPos: pairedUpsPos
      });
    }
  });

  // Reposition MDS-UPS pairs for better centering and no overlaps
  mdsPairsByLevel.forEach((mdsPairs, level) => {
    if (mdsPairs.length === 0) return;

    console.log(`    📍 Repositioning ${mdsPairs.length} MDS-UPS pairs at level ${level}`);

    // Sort pairs using the same hierarchical branch logic as normalizeLevelWidths
    // This ensures MDS ordering follows the complete branch hierarchy, not just names
    mdsPairs.sort((a, b) => {
      // Get branch path by tracing up hierarchy to find loop group (same logic as normalizeLevelWidths)
      const getBranchPath = (mdsInfo: EquipmentLayoutInfo): string => {
        const parentId = mdsInfo.parentId;
        if (!parentId) return mdsInfo.branch || 'S1';

        let currentId = parentId;
        const tracePath: string[] = [];

        // Trace up to 6 levels to find a loop group
        for (let level = 0; level < 6; level++) {
          const currentInfo = layoutInfoMap.get(currentId);
          if (!currentInfo) break;

          tracePath.push(currentInfo.equipment.name);

          // If we found a loop group, use its branch designation
          if (currentInfo.equipment.isLoopGroup) {
            const loopBranch = currentInfo.branch || 'S1';
            console.log(`    🧬 MDS TRACE (${level + 1} levels): ${mdsInfo.equipment.name} → ${tracePath.join(' → ')} = ${loopBranch}`);
            return loopBranch;
          }

          // Move up to the next parent
          if (!currentInfo.parentId) break;
          currentId = currentInfo.parentId;
        }

        // If no loop group found, use the MDS's own branch
        const fallbackBranch = mdsInfo.branch || 'S1';
        console.log(`    🧬 MDS TRACE (fallback): ${mdsInfo.equipment.name} → ${tracePath.join(' → ')} = ${fallbackBranch} (no loop group found)`);
        return fallbackBranch;
      };

      const branchA = getBranchPath(a.mdsInfo);
      const branchB = getBranchPath(b.mdsInfo);

      // Primary sort by branch hierarchy (S1 before S2)
      if (branchA !== branchB) {
        return branchA === 'S1' ? -1 : 1;
      }

      // Secondary sort by name within same branch
      return a.mdsInfo.equipment.name.localeCompare(b.mdsInfo.equipment.name);
    });

    // Calculate spacing that accounts for both UPS and MDS
    // Each pair needs: UPS width + 280px gap + MDS width
    // Plus spacing between pairs
    const centerX = 400;
    const pairSpacing = 500; // Increased spacing to account for UPS-MDS pairs
    const totalWidth = (mdsPairs.length - 1) * pairSpacing;
    const startX = centerX - totalWidth / 2;

    mdsPairs.forEach((pair, index) => {
      // Position MDS at the calculated position
      const mdsX = startX + index * pairSpacing;
      const oldMdsPos = finalPositions.get(pair.mdsId)!;

      console.log(`    🔄 MDS ${pair.mdsInfo.equipment.name}: x=${Math.round(oldMdsPos.x)} → ${Math.round(mdsX)} (pair ${index + 1})`);
      finalPositions.set(pair.mdsId, { x: mdsX, y: oldMdsPos.y });

      // Position UPS 280px to the left of MDS
      if (pair.upsId && pair.upsPos) {
        const upsX = mdsX - 280;
        console.log(`    🔄 UPS ${pair.upsInfo!.equipment.name}: x=${Math.round(pair.upsPos.x)} → ${Math.round(upsX)} (paired with MDS)`);
        finalPositions.set(pair.upsId, { x: upsX, y: pair.upsPos.y });
      }
    });
  });

  console.log('🏗️ ===== LAYOUT PROCESS END =====');

  return { positions: finalPositions, layoutInfoMap, baselines, tree: placementTree };
}

function ensureNoOverlaps(positions: Map<string, Position>): void {
  // Final brute-force fix: ensure no two equipment have identical positions
  const positionArray = Array.from(positions.entries());
  const usedCoordinates = new Set<string>();

  positionArray.forEach(([id, pos]) => {
    const coord = `${Math.round(pos.x)},${Math.round(pos.y)}`;

    if (usedCoordinates.has(coord)) {
      // Move this equipment slightly to avoid overlap
      let attempts = 0;
      let newX = pos.x;

      while (attempts < 10) {
        newX += 50;
        const newCoord = `${Math.round(newX)},${Math.round(pos.y)}`;
        if (!usedCoordinates.has(newCoord)) {
          positions.set(id, { x: newX, y: pos.y });
          usedCoordinates.add(newCoord);
          console.log(`OVERLAP FIX: Moved ${id} from ${pos.x} to ${newX}`);
          return;
        }
        attempts++;
      }
    } else {
      usedCoordinates.add(coord);
    }
  });
}


function detectAndResolveCollisions(
  positions: Map<string, Position>,
  layoutInfoMap: Map<string, EquipmentLayoutInfo>,
  anchorPositions?: Map<string, Position>
): Map<string, Position> {
  const resolved = new Map(positions);
  const maxIterations = 10;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const collisions = findAllCollisions(resolved);
    if (collisions.length === 0) {
      if (anchorPositions) {
        enforceBranchAnchors(resolved, layoutInfoMap, anchorPositions);
      }
      return resolved;
    }
    resolveCollisions(collisions, resolved, layoutInfoMap);
    if (anchorPositions) {
      enforceBranchAnchors(resolved, layoutInfoMap, anchorPositions);
    }
  }

  if (anchorPositions) {
    enforceBranchAnchors(resolved, layoutInfoMap, anchorPositions);
  }

  return resolved;
}

function applyUpsMdsPairTightening(
  positions: Map<string, Position>,
  layoutInfoMap: Map<string, EquipmentLayoutInfo>,
  connectionMap: ConnectionMap,
  anchorPositions?: Map<string, Position>
): void {
  layoutInfoMap.forEach(info => {
    const equipmentType = info.equipment.type?.toUpperCase() ?? '';
    if (!equipmentType.includes('UPS')) return;

    const upsId = info.equipment.id;
    const upsPosition = positions.get(upsId);
    if (!upsPosition) return;

    const relationEntry = connectionMap.get(upsId);
    if (!relationEntry) return;

    const mdsParent = relationEntry.upstream.find(parent =>
      (parent.type?.toUpperCase() ?? '').includes('MDS')
    );

    if (!mdsParent) return;

    const mdsPosition = positions.get(mdsParent.id);
    if (!mdsPosition) return;

    const desiredX = mdsPosition.x - upsMdsPairOffset;
    const desiredY = mdsPosition.y;
    const currentDistance = Math.abs(mdsPosition.x - upsPosition.x);
    const alreadyLeft = upsPosition.x < mdsPosition.x;
    const withinTolerance = Math.abs(currentDistance - upsMdsPairOffset) <= 6 || Math.abs(currentDistance - nodeCenterSpacing) <= 6;

    if (alreadyLeft && withinTolerance) {
      if (Math.abs(upsPosition.y - desiredY) > 1) {
        positions.set(upsId, { x: upsPosition.x, y: desiredY });
        if (anchorPositions) {
          anchorPositions.set(upsId, { x: upsPosition.x, y: desiredY });
        }
      }
      return;
    }

    const snappedX = Math.abs(upsPosition.x - mdsPosition.x) > nodeCenterSpacing
      ? mdsPosition.x - nodeCenterSpacing
      : desiredX;

    const snapped = { x: snappedX, y: desiredY };
    positions.set(upsId, snapped);
    if (anchorPositions) {
      anchorPositions.set(upsId, snapped);
    }
  });
}

function findAllCollisions(positions: Map<string, Position>): CollisionInfo[] {
  const collisions: CollisionInfo[] = [];
  const positionArray = Array.from(positions.entries());

  for (let i = 0; i < positionArray.length; i++) {
    for (let j = i + 1; j < positionArray.length; j++) {
      const [id1, pos1] = positionArray[i];
      const [id2, pos2] = positionArray[j];

      const collision = checkCollision(pos1, pos2);
      if (collision) {
        collisions.push({
          node1: id1,
          node2: id2,
          overlap: collision
        });
      }
    }
  }

  return collisions;
}

function checkCollision(pos1: Position, pos2: Position): { horizontal: number; vertical: number } | null {
  const horizontalDistance = Math.abs(pos1.x - pos2.x);
  const verticalDistance = Math.abs(pos1.y - pos2.y);

  const minHorizontalDistance = nodeWidth + minimumNodeSpacing;
  const minVerticalDistance = nodeHeight + 50;

  const horizontalOverlap = minHorizontalDistance - horizontalDistance;
  const verticalOverlap = minVerticalDistance - verticalDistance;

  // Only consider it a collision if horizontal overlap exists
  // Equipment on the same Y level (same tier) should be allowed
  if (horizontalOverlap > 0) {
    // For equipment at exactly the same Y coordinate, we only care about horizontal separation
    if (Math.abs(pos1.y - pos2.y) < 10) {
      return { horizontal: horizontalOverlap, vertical: 0 };
    }
    // For equipment at different Y levels, check both horizontal and vertical overlap
    if (verticalOverlap > 0) {
      return { horizontal: horizontalOverlap, vertical: verticalOverlap };
    }
  }

  return null;
}

function resolveCollisions(
  collisions: CollisionInfo[],
  positions: Map<string, Position>,
  layoutInfoMap: Map<string, EquipmentLayoutInfo>
): void {
  collisions.sort((a, b) =>
    (b.overlap.horizontal + b.overlap.vertical) - (a.overlap.horizontal + a.overlap.vertical)
  );


  collisions.forEach(collision => {
    const pos1 = positions.get(collision.node1);
    const pos2 = positions.get(collision.node2);
    if (!pos1 || !pos2) return;

    const info1 = layoutInfoMap.get(collision.node1);
    const info2 = layoutInfoMap.get(collision.node2);

    const canSplitResolution =
      info1 && info2 &&
      info1.level === info2.level &&
      info1.branch && info2.branch &&
      info1.branch !== info2.branch &&
      !info1.isLateral && !info2.isLateral;

    if (canSplitResolution) {
      const shift = (collision.overlap.horizontal + collisionPadding) / 2;
      const leftNode = info1.branch === 'S1' ? collision.node1 : collision.node2;
      const rightNode = leftNode === collision.node1 ? collision.node2 : collision.node1;

      const leftPos = leftNode === collision.node1 ? pos1 : pos2;
      const rightPos = rightNode === collision.node1 ? pos1 : pos2;

      positions.set(leftNode, { x: leftPos.x - shift, y: leftPos.y });
      positions.set(rightNode, { x: rightPos.x + shift, y: rightPos.y });
      return;
    }

    const moveFirst = decideMoveOrder(collision.node1, collision.node2, layoutInfoMap);
    const moverId = moveFirst ? collision.node1 : collision.node2;
    const moverPos = moveFirst ? pos1 : pos2;
    const otherPos = moveFirst ? pos2 : pos1;

    const updated = calculateSafePosition(
      moverId,
      moverPos,
      otherPos,
      collision.overlap,
      layoutInfoMap
    );

    positions.set(moverId, updated);
  });
}

function enforceBranchAnchors(
  positions: Map<string, Position>,
  layoutInfoMap: Map<string, EquipmentLayoutInfo>,
  anchorPositions: Map<string, Position>
): void {
  anchorPositions.forEach((anchorPos, id) => {
    const current = positions.get(id);
    if (!current) return;

    const info = layoutInfoMap.get(id);
    if (!info) return;

    const isUps = isUPSEquipment(info.equipment.type, info.equipment.name);
    const branch = info.branch;

    let leftSlack = minimumNodeSpacing / 2;
    let rightSlack = minimumNodeSpacing / 2;

    if (info.isLateral && isUps) {
      leftSlack = minimumNodeSpacing / 3;
      rightSlack = Math.min(12, minimumNodeSpacing / 10);
    } else if (branch === 'S1') {
      leftSlack = minimumNodeSpacing * 0.8;
      rightSlack = minimumNodeSpacing * 0.2;
    } else if (branch === 'S2') {
      leftSlack = minimumNodeSpacing * 0.2;
      rightSlack = minimumNodeSpacing * 0.8;
    }

    const minX = anchorPos.x - leftSlack;
    const maxX = anchorPos.x + rightSlack;
    const clampedX = Math.min(Math.max(current.x, minX), maxX);

    if (clampedX !== current.x) {
      positions.set(id, { x: clampedX, y: current.y });
    }
  });
}

function enforceCategoryBaselines(
  positions: Map<string, Position>,
  layoutInfoMap: Map<string, EquipmentLayoutInfo>,
  baselines: Map<number, number>
): void {
  const categoryBaselines = new Map<string, number>();

  layoutInfoMap.forEach(info => {
    const id = info.equipment.id;
    const pos = positions.get(id);
    if (!pos) return;

    const key = getTypeAlignmentKey(info, layoutInfoMap);

    if (!categoryBaselines.has(key)) {
      categoryBaselines.set(key, determineBaselineTarget(info, positions, baselines, layoutInfoMap));
    }

    const targetY = categoryBaselines.get(key)!;
    if (Math.abs(pos.y - targetY) > 0.5) {
      positions.set(id, { x: pos.x, y: targetY });
    }
  });
}

function extractTypePrefix(type: string | undefined): string {
  if (!type) return '';
  return type.split(':')[0].trim().toUpperCase();
}

function getTypeAlignmentKey(
  info: EquipmentLayoutInfo,
  layoutInfoMap: Map<string, EquipmentLayoutInfo>
): string {
  const equipment = info.equipment;
  if (equipment.isLoopGroup) {
    return 'RING_BUS';
  }

  const prefix = extractTypePrefix(equipment.type);

  const category = categorizeByType(equipment.type || '');
  if (category !== 'END_EQUIPMENT') {
    if (category === 'DISTRIBUTION') {
      if (prefix.includes('UPS') && info.parentId) {
        const parentInfo = layoutInfoMap.get(info.parentId);
        if (parentInfo) {
          const parentPrefix = extractTypePrefix(parentInfo.equipment.type);
          if (parentPrefix.includes('MDS') || parentPrefix.includes('SWGR') || parentPrefix.includes('SWITCHGEAR')) {
            return `UPS_WITH_${parentPrefix}`;
          }
        }
        return 'UPS';
      }
      if (prefix.includes('MDS')) {
        return 'MDS';
      }
      if (prefix.includes('SWGR')) {
        return 'SWGR';
      }
      return 'DISTRIBUTION';
    }
    if (category === 'GENERATOR') {
      return 'GEN';
    }
    if (category === 'TRANSFORMER') {
      return 'TX';
    }
    if (category === 'UTILITY') {
      return 'UTILITY';
    }
    return category;
  }

  if (prefix.includes('UPS') && info.parentId) {
    const parentInfo = layoutInfoMap.get(info.parentId);
    if (parentInfo) {
      const parentPrefix = extractTypePrefix(parentInfo.equipment.type);
      if (parentPrefix.includes('MDS') || parentPrefix.includes('SWGR') || parentPrefix.includes('SWITCHGEAR')) {
        return `UPS_WITH_${parentPrefix}`;
      }
    }
    return 'UPS';
  }

  if (prefix) {
    if (categoryVerticalOffsets[prefix] !== undefined) {
      return prefix;
    }
  }

  return category;
}

function determineBaselineTarget(
  info: EquipmentLayoutInfo,
  positions: Map<string, Position>,
  baselines: Map<number, number>,
  layoutInfoMap: Map<string, EquipmentLayoutInfo>
): number {
  const typePrefix = extractTypePrefix(info.equipment.type);

  const key = getTypeAlignmentKey(info, layoutInfoMap);
  if (categoryVerticalOffsets[key] !== undefined) {
    return centerY + categoryVerticalOffsets[key] * categoryVerticalSpacing;
  }

  if (typePrefix.includes('UPS') && info.parentId) {
    const parentPos = positions.get(info.parentId);
    if (parentPos) {
      return parentPos.y;
    }
    const parentInfo = layoutInfoMap.get(info.parentId);
    if (parentInfo) {
      const baseline = baselines.get(parentInfo.level);
      if (baseline !== undefined) {
        return baseline;
      }
    }
  }

  const baseline = baselines.get(info.level);
  if (baseline !== undefined) {
    return baseline;
  }

  const pos = positions.get(info.equipment.id);
  return pos ? pos.y : centerY;
}

function decideMoveOrder(
  id1: string,
  id2: string,
  layoutInfoMap: Map<string, EquipmentLayoutInfo>
): boolean {
  const info1 = layoutInfoMap.get(id1);
  const info2 = layoutInfoMap.get(id2);

  if (!info1 || !info2) return true;

  const node1IsUps = isUPSEquipment(info1.equipment.type, info1.equipment.name);
  const node2IsUps = isUPSEquipment(info2.equipment.type, info2.equipment.name);

  if (node1IsUps && !node2IsUps) {
    return false; // Keep UPS anchored; move the non-UPS node instead
  }
  if (!node1IsUps && node2IsUps) {
    return true;
  }

  const isRoot1 = info1.level === 0;
  const isRoot2 = info2.level === 0;
  if (isRoot1 && !isRoot2) return false;
  if (!isRoot1 && isRoot2) return true;

  if (info1.isLateral !== info2.isLateral) {
    return info1.isLateral;
  }

  if (info1.level !== info2.level) {
    return info1.level > info2.level;
  }

  if (info1.branch !== info2.branch) {
    return info1.branch === 'S2';
  }

  return id1.localeCompare(id2) > 0;
}

function calculateSafePosition(
  nodeId: string,
  nodePos: Position,
  collisionPos: Position,
  overlap: { horizontal: number; vertical: number },
  layoutInfoMap: Map<string, EquipmentLayoutInfo>
): Position {
  const info = layoutInfoMap.get(nodeId);
  if (info && info.level === 0) {
    return nodePos;
  }

  const deltaX = overlap.horizontal + collisionPadding;
  let moveRight: boolean;

  if (info?.isLateral && info.lateralInfo) {
    moveRight = info.lateralInfo.direction === 'right';
  } else if (info?.branch === 'S2') {
    moveRight = true;
  } else if (info?.branch === 'S1') {
    moveRight = false;
  } else {
    moveRight = nodePos.x > collisionPos.x;
  }

  return {
    x: nodePos.x + (moveRight ? deltaX : -deltaX),
    y: nodePos.y
  };
}

function validateUpstreamLayout(
  _tree: PlacementTree,
  positions: Map<string, Position>,
  baselines: Map<number, number>,
  layoutInfoMap: Map<string, EquipmentLayoutInfo>
): LayoutValidationResult {
  const issues: string[] = [];
  const baselineTolerance = 0.5;

  layoutInfoMap.forEach(info => {
    const pos = positions.get(info.equipment.id);
    const baseline = baselines.get(info.level);
    if (!pos || baseline === undefined) {
      return;
    }
    if (Math.abs(pos.y - baseline) > baselineTolerance) {
      issues.push(
        `Baseline drift detected for ${info.equipment.name} (${info.equipment.id}): expected ${baseline}, got ${pos.y}`
      );
    }
  });

  const collisions = findAllCollisions(positions);
  if (collisions.length > 0) {
    issues.push(`${collisions.length} collisions detected after resolution`);
  }

  return {
    isValid: issues.length === 0,
    issues,
    totalNodes: positions.size,
    validationTimestamp: new Date().toISOString()
  };
}

function generateNodesAndEdges(
  selectedEquipment: ProcessedEquipment,
  upstream: ProcessedEquipment[],
  downstream: ProcessedEquipment[],
  connectionMap: ConnectionMap
): { nodes: TreeNode[], edges: TreeEdge[] } {
  const nodes: TreeNode[] = [];
  const edges: TreeEdge[] = [];

  // Index loop groups by representative id for edge source lookup
  const loopGroupIndex = new Map<string, { equipment: Equipment[]; sources: string[] }>();
  upstream.forEach(eq => {
    if ((eq as ProcessedEquipment).isLoopGroup && (eq as ProcessedEquipment).loopGroupData) {
      loopGroupIndex.set(eq.id, {
        equipment: (eq as ProcessedEquipment).loopGroupData!.equipment,
        sources: (eq as ProcessedEquipment).sources || []
      });
    }
  });

  // Helper: get branch classification for upstream nodes
  const getEquipmentBranch = (equipmentId: string): 'S1' | 'S2' => {
    const equipment = [...upstream, ...downstream].find(eq => eq.id === equipmentId);
    if (!equipment) return 'S1';
    return (equipment.branch as 'S1' | 'S2') || 'S1';
  };

  // Helper function to get node color
  const getNodeColor = (sourceTree: string, isSelected: boolean = false): string => {
    if (isSelected) return '#b8ff2b'; // selected color
    switch (sourceTree) {
      case 'S2': return '#2b81e5'; // S2 bright blue
      case 'S1':
      default: return '#1259ad'; // S1 blue
    }
  };

  // Helper: lookup specific upstream edge's source number (parent -> child)
  const getUpstreamEdgeSourceNumber = (downstreamId: string, upstreamId: string): string | undefined => {
    // If downstream is a loop rep, resolve against its members
    if (loopGroupIndex.has(downstreamId)) {
      const group = loopGroupIndex.get(downstreamId)!;
      // Find the member that connects to the upstreamId
      for (const member of group.equipment) {
        const entry = connectionMap.get(member.id);
        const rel = entry?.upstream.find(u => u.id === upstreamId);
        if (rel?.sourceNumber) return rel.sourceNumber;
      }
      return group.sources?.[0];
    }

    // If upstream is a loop rep (edge: child -> loopRep), inspect child's upstream relations
    if (loopGroupIndex.has(upstreamId)) {
      const group = loopGroupIndex.get(upstreamId)!;
      const entry = connectionMap.get(downstreamId);
      const rel = entry?.upstream.find(u => group.equipment.some(m => m.id === u.id));
      return rel?.sourceNumber || group.sources?.[0];
    }
    // Normal case: read from the downstream node's upstream array
    const entry = connectionMap.get(downstreamId);
    const rel = entry?.upstream.find(u => u.id === upstreamId);
    return rel?.sourceNumber;
  };

  // Add selected equipment node (center)
  nodes.push({
    id: selectedEquipment.id,
    data: {
      label: `${selectedEquipment.name}\n${selectedEquipment.type}`,
      name: selectedEquipment.name,
      type: selectedEquipment.type,
      equipment: selectedEquipment
    },
    type: 'powerNode',
    position: { x: centerX, y: centerY },
    style: {
      background: '#b8ff2b',
      border: 'none',
      borderRadius: '8px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      width: nodeWidth,
      height: nodeHeight,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#00172d',
      fontSize: '11px',
      fontWeight: 600,
      textAlign: 'center',
      whiteSpace: 'pre-line'
    }
  });

  // NEW: Natural branching tree layout using enhanced algorithm
  console.log('Using span-based upstream layout algorithm');

  // Classify upstream equipment for enhanced layout
  const upstreamLayoutInfo = classifyEquipmentForLayout(upstream, connectionMap);

  // Calculate optimal positions using span-based natural branching
  const {
    positions: upstreamPositions,
    layoutInfoMap: upstreamLayoutInfoMap,
    baselines: upstreamBaselines,
    tree: upstreamPlacementTree
  } = calculateUpstreamPositions(selectedEquipment, upstreamLayoutInfo, connectionMap);

  const validationResult = validateUpstreamLayout(
    upstreamPlacementTree,
    upstreamPositions,
    upstreamBaselines,
    upstreamLayoutInfoMap
  );

  if (!validationResult.isValid) {
    console.warn('Upstream layout validation issues:', validationResult.issues);
  }

  // Create lateral UPS map for edge generation compatibility
  const lateralUpsMap = new Map<string, { parentId: string; direction: 'left' | 'right'; offset: number }>();
  upstreamLayoutInfo.forEach(info => {
    if (info.isLateral && info.lateralInfo) {
      lateralUpsMap.set(info.equipment.id, info.lateralInfo);
    }
  });

  // Create set of loop group member IDs for rendering filtering
  const loopGroupMemberIds = new Set<string>();
  upstream.forEach(eq => {
    if (eq.isLoopGroup && eq.loopGroupData?.equipment) {
      eq.loopGroupData.equipment.forEach(member => {
        loopGroupMemberIds.add(member.id);
      });
    }
  });

  // Add upstream nodes and edges based on computed positions
  upstream.forEach(eq => {
    // Skip individual equipment that are part of a loop group (they'll be represented by the loop group node)
    if (!eq.isLoopGroup && loopGroupMemberIds.has(eq.id)) {
      return;
    }

    let pos = upstreamPositions.get(eq.id);

    // If loop group doesn't have a position, calculate proper baseline position
    if (!pos && eq.isLoopGroup && eq.loopGroupData?.equipment) {
      const members = eq.loopGroupData.equipment;
      const memberPositions = members
        .map(member => upstreamPositions.get(member.id))
        .filter(pos => pos !== undefined) as Position[];

      if (memberPositions.length > 0) {
        // Position loop groups using standard S1/S2 spacing pattern
        const centerX = 400; // Default center
        const spacing = 380; // Standard equipment spacing

        // Determine positioning based on branch
        let targetX: number;
        if (eq.branch === 'S1') {
          targetX = centerX - spacing / 2; // S1 to the left
        } else if (eq.branch === 'S2') {
          targetX = centerX + spacing / 2; // S2 to the right
        } else {
          // Fallback: position based on loop group order if no branch specified
          const isFirstLoopGroup = eq.id.includes('1R') || eq.name.includes('01R');
          targetX = isFirstLoopGroup ? centerX - spacing / 2 : centerX + spacing / 2;
        }

        // Calculate proper baseline Y based on loop group's level
        const baselineY = upstreamBaselines.get(eq.level) ?? (300 - eq.level * 280); // 300 = centerY, 280 = levelSpacing
        pos = {
          x: targetX,
          y: baselineY
        };
        console.log(`Loop group ${eq.id} positioned with standard spacing: branch=${eq.branch}, x=${Math.round(targetX)}, y=${baselineY} (level ${eq.level})`);
      }
    }

    if (!pos) return;

    // Apply type-based alignment for equipment connected through loop groups
    let { x, y } = pos;

    // Check if this equipment has a loop group in its path (anywhere in parent chain)
    // Check both direct loop group IDs and if any path equipment is part of a loop group
    const hasLoopGroupInPath = eq.path && eq.path.some(pathId => {
      // Check if pathId is directly a loop group
      const isDirectLoopGroup = upstream.some(parent => parent.id === pathId && parent.isLoopGroup);
      // Check if pathId is an equipment that's part of a loop group
      const isPartOfLoopGroup = loopGroupMemberIds.has(pathId);
      return isDirectLoopGroup || isPartOfLoopGroup;
    });

    const hasLoopGroupParent = eq.parentId && (
      upstream.some(parent => parent.id === eq.parentId && parent.isLoopGroup) ||
      loopGroupMemberIds.has(eq.parentId)
    );

    if (hasLoopGroupInPath || hasLoopGroupParent) {
      // This equipment is connected through a loop group, align by type instead of level
      const equipmentTypePart = eq.type.split(':')[0].trim(); // Extract type prefix (e.g., "MDS" from "MDS: Main Distribution...")

      // Find corresponding equipment of same type NOT connected through loop groups for reference alignment
      const referenceEquipment = upstream.find(ref => {
        if (ref.isLoopGroup || ref.id === eq.id) return false;
        if (ref.type.split(':')[0].trim() !== equipmentTypePart) return false;

        // Check if reference equipment has loop group in path
        const refHasLoopGroupInPath = ref.path && ref.path.some(pathId => {
          const isDirectLoopGroup = upstream.some(parent => parent.id === pathId && parent.isLoopGroup);
          const isPartOfLoopGroup = loopGroupMemberIds.has(pathId);
          return isDirectLoopGroup || isPartOfLoopGroup;
        });

        const refHasLoopGroupParent = ref.parentId && (
          upstream.some(parent => parent.id === ref.parentId && parent.isLoopGroup) ||
          loopGroupMemberIds.has(ref.parentId)
        );

        // Only use as reference if it's NOT connected through loop groups
        return !refHasLoopGroupInPath && !refHasLoopGroupParent;
      });

      if (referenceEquipment) {
        const referencePos = upstreamPositions.get(referenceEquipment.id);
        if (referencePos) {
          y = referencePos.y; // Use same Y coordinate as reference equipment
          console.log(`Type-based alignment: ${eq.name} (${equipmentTypePart}) aligned to Y ${y} (reference: ${referenceEquipment.name})`);
        }
      } else {
        console.log(`No reference equipment found for type-based alignment of ${eq.name} (${equipmentTypePart})`);
      }
    }

    const branch = getEquipmentBranch(eq.id);
    const color = getNodeColor(branch);

    const labelText = eq.isLoopGroup
      ? `${eq.name}\n${eq.type}`
      : `${eq.name}\n${eq.type}`;

    nodes.push({
      id: eq.id,
      data: {
        label: labelText,
        name: eq.name,
        type: eq.type,
        equipment: eq
      },
      type: 'powerNode',
      position: { x, y },
      style: {
        background: color,
        border: eq.isLoopGroup ? '3px dashed #cbd5e1' : 'none',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        width: eq.isLoopGroup ? nodeWidth + 20 : nodeWidth,
        height: nodeHeight,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontSize: '11px',
        fontWeight: 600,
        textAlign: 'center',
        whiteSpace: 'pre-line'
      }
    });

    const lateralInfo = lateralUpsMap.get(eq.id);

    if (eq.parentId) {
      const connSource = getUpstreamEdgeSourceNumber(eq.parentId, eq.id);
      const sourceHandle = lateralInfo
        ? (lateralInfo.direction === 'right' ? 'sr' : 'sl')
        : 'ts';
      const targetHandle = lateralInfo
        ? (lateralInfo.direction === 'right' ? 'sl' : 'sr')
        : 'bt';
      edges.push({
        id: `${eq.parentId}-${eq.id}`,
        source: eq.parentId,
        target: eq.id,
        type: 'smoothstep',
        sourceHandle,
        targetHandle,
        label: connSource === 'S2' || connSource === 'S1' ? connSource : undefined,
        labelShowBg: true,
        labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9, stroke: '#e5e7eb' },
        labelBgPadding: [4, 2],
        labelBgBorderRadius: 6,
        labelStyle: { fill: '#0f172a', fontWeight: 600, fontSize: 11 },
        style: {
          stroke: connSource === 'S2' ? '#2b81e5' : '#1259ad',
          strokeWidth: 2,
          strokeDasharray: connSource === 'S2' ? '6 4' : undefined
        },
        data: {
          sourceNumber: connSource,
          isLoop: eq.isLoopGroup
        }
      });
    }

    if (lateralInfo) {
      const parentId = lateralInfo.parentId;
      const returnEdgeId = `lateral-return-${eq.id}-${parentId}`;
      const exists = edges.some(e => e.id === returnEdgeId);
      if (!exists) {
        edges.push({
          id: returnEdgeId,
          source: eq.id,
          target: parentId,
          type: 'smoothstep',
          sourceHandle: 'ts',
          targetHandle: lateralInfo.direction === 'right' ? 'sr' : 'sl',
          style: {
            stroke: '#1259ad',
            strokeWidth: 2
          },
          data: {
            sourceNumber: 'loop',
            isLoop: true
          }
        });
      }
    }

    if (eq.alternateParents && eq.alternateParents.length > 0) {
      eq.alternateParents.forEach((altParent, altIndex) => {
        const parentInTree = upstream.some(e => e.id === altParent.id) || altParent.id === selectedEquipment.id;

        if (parentInTree) {
          const isBypass = altParent.connectionType === 'bypass';
          const edgeId = `bypass-${altParent.id}-${eq.id}-${altParent.connectionType}-${altIndex}`;

          const existingEdge = edges.find(e =>
            (e.source === altParent.id && e.target === eq.id) ||
            (e.source === eq.id && e.target === altParent.id)
          );

          if (!existingEdge) {
            const isRedundant = !isBypass && (altParent.sourceNumber === 'S2' || altParent.sourceNumber === 'S1');
            const sourceHandle = isBypass ? 'b' : (isRedundant ? 'ts' : 'b');
            const targetHandle = isBypass ? 't' : (isRedundant ? 'bt' : 't');
            edges.push({
              id: edgeId,
              source: altParent.id,
              target: eq.id,
              type: 'smoothstep',
              sourceHandle,
              targetHandle,
              label: isBypass ? 'BYPASS' : altParent.sourceNumber,
              labelShowBg: true,
              labelBgStyle: {
                fill: isBypass ? '#fef3c7' : '#ffffff',
                fillOpacity: 0.9,
                stroke: isBypass ? '#f59e0b' : '#e5e7eb'
              },
              labelBgPadding: [4, 2],
              labelBgBorderRadius: 6,
              labelStyle: { fill: isBypass ? '#92400e' : '#0f172a', fontWeight: 600, fontSize: 10 },
              style: {
                stroke: isBypass ? '#f59e0b' : (altParent.sourceNumber === 'S2' ? '#2b81e5' : '#1259ad'),
                strokeWidth: isBypass ? 3 : 2,
                strokeDasharray: isBypass ? '8 4' : (altParent.sourceNumber === 'S2' ? '6 4' : undefined),
                opacity: isBypass ? 0.8 : 0.6
              },
              data: {
                sourceNumber: altParent.sourceNumber,
                connectionType: altParent.connectionType,
                isAlternate: true
              }
            });
          }
        }
      });
    }
  });

  // Group downstream equipment by level
  const downstreamByLevel = new Map<number, ProcessedEquipment[]>();
  downstream.forEach(eq => {
    if (!downstreamByLevel.has(eq.level)) {
      downstreamByLevel.set(eq.level, []);
    }
    downstreamByLevel.get(eq.level)!.push(eq);
  });

  // Position downstream equipment
  downstreamByLevel.forEach((levelEquipment, level) => {
    const y = centerY + (level * levelSpacing);
    const totalWidth = levelEquipment.length * nodeWidth + (levelEquipment.length - 1) * minimumNodeSpacing;
    const startX = centerX - totalWidth / 2;

    levelEquipment.forEach((eq, index) => {
      const x = startX + index * (nodeWidth + minimumNodeSpacing);
      const color = '#e77b16'; // downstream orange

      nodes.push({
        id: eq.id,
        data: {
          label: `${eq.name}\n${eq.type}`,
          name: eq.name,
          type: eq.type,
          equipment: eq
        },
        type: 'powerNode',
        position: { x, y },
        style: {
          background: color,
          border: 'none',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          width: nodeWidth,
          height: nodeHeight,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: '11px',
          fontWeight: 600,
          textAlign: 'center',
          whiteSpace: 'pre-line'
        }
      });

      // Add edge to parent
      if (eq.parentId) {
        edges.push({
          id: `${eq.parentId}-${eq.id}`,
          source: eq.parentId,
          target: eq.id,
          type: 'smoothstep',
          sourceHandle: 'b',
          targetHandle: 't',
          style: {
            stroke: color,
            strokeWidth: 2
          },
          data: {
            sourceNumber: 'downstream'
          }
        });
      }
    });
  });

  // Add edges for the selected equipment to its direct connections (only for bidirectional cases)
  const selectedConnections = connectionMap.get(selectedEquipment.id);
  if (selectedConnections) {
    // Check if this equipment has bidirectional connections (appears in both upstream and downstream of the same equipment)
    const hasBidirectional = selectedConnections.upstream.some(up =>
      selectedConnections.downstream.some(down => up.id === down.id)
    );

    if (hasBidirectional) {
      // Add edges to upstream equipment (selected equipment receives from these)
      selectedConnections.upstream.forEach(upstream => {
        // Only add if the upstream equipment is in our node list and not already connected
        const upstreamNode = nodes.find(n => n.id === upstream.id);
        const existingEdge = edges.find(e =>
          e.source === upstream.id && e.target === selectedEquipment.id
        );
        if (upstreamNode && !existingEdge) {
          const isS2 = upstream.sourceNumber === 'S2';
          const sourceHandle = isS2 ? 'br' : 'bl';
          const targetHandle = isS2 ? 'tl' : 'tl';
          edges.push({
            id: `${upstream.id}-${selectedEquipment.id}`,
            source: upstream.id,
            target: selectedEquipment.id,
            type: 'smoothstep',
            sourceHandle,
            targetHandle,
            label: upstream.sourceNumber,
            labelShowBg: true,
            labelBgStyle: {
              fill: '#ffffff',
              fillOpacity: 0.9,
              stroke: '#e5e7eb'
            },
            labelBgPadding: [4, 2],
            labelBgBorderRadius: 6,
            labelStyle: {
              fill: '#0f172a',
              fontWeight: 600,
              fontSize: 11
            },
            style: {
              stroke: upstream.sourceNumber === 'S1' ? '#1259ad' : '#3b82f6',
              strokeWidth: 2,
              strokeDasharray: '4 2' // Add dashed pattern to distinguish from outgoing edge
            },
            data: {
              sourceNumber: upstream.sourceNumber,
              connectionType: upstream.connectionType,
              isAlternate: upstream.connectionType === 'bypass' || upstream.connectionType === 'redundant'
            }
          });
        }
      });

      // Add edges to downstream equipment (selected equipment feeds these)
      selectedConnections.downstream.forEach(downstream => {
        // Only add if the downstream equipment is in our node list and not already connected
        const downstreamNode = nodes.find(n => n.id === downstream.id);
        const existingEdge = edges.find(e =>
          e.source === selectedEquipment.id && e.target === downstream.id
        );
        if (downstreamNode && !existingEdge) {
          edges.push({
          id: `${selectedEquipment.id}-${downstream.id}`,
          source: selectedEquipment.id,
          target: downstream.id,
          type: 'smoothstep',
          sourceHandle: 'br',
          targetHandle: 'tr',
          label: downstream.sourceNumber,
          labelShowBg: true,
          labelBgStyle: {
            fill: '#ffffff',
            fillOpacity: 0.9,
            stroke: '#e5e7eb'
          },
          labelBgPadding: [4, 2],
          labelBgBorderRadius: 6,
          labelStyle: {
            fill: '#0f172a',
            fontWeight: 600,
            fontSize: 11
          },
          style: {
            stroke: downstream.sourceNumber === 'S1' ? '#1259ad' : '#3b82f6',
            strokeWidth: 2
          },
          data: {
            sourceNumber: downstream.sourceNumber,
            connectionType: downstream.connectionType,
            isAlternate: downstream.connectionType === 'bypass' || downstream.connectionType === 'redundant'
          }
          });
        }
      });
    }
  }

  // Generate bypass connections for UPS ending in "-2" to corresponding transformers
  console.log('🔗 Generating bypass connections for UPS ending in "-2"...');

  // Find all UPS equipment ending in "-2" from both upstream and selected equipment
  let bypassUpsEquipment = upstream.filter(eq =>
    eq.type.includes('UPS') &&
    eq.name.endsWith('-2') &&
    eq.name.includes('UPS') && // Double-check it's actually a UPS in the name
    eq.name.length > 3 // Ensure it's not just "-2"
  );

  // Also check if the selected equipment itself is a UPS ending in "-2"
  if (selectedEquipment.type.includes('UPS') &&
      selectedEquipment.name.endsWith('-2') &&
      selectedEquipment.name.includes('UPS') &&
      selectedEquipment.name.length > 3) {
    console.log(`🔍 Selected equipment is bypass UPS: ${selectedEquipment.name}`);
    // Add selected equipment to the list if it's not already there
    const isAlreadyIncluded = bypassUpsEquipment.some(eq => eq.id === selectedEquipment.id);
    if (!isAlreadyIncluded) {
      bypassUpsEquipment.push(selectedEquipment);
    }
  }

  bypassUpsEquipment.forEach(upsEq => {
    console.log(`🔍 Checking bypass UPS: ${upsEq.name}`);

    // Find transformers that have this UPS in their parentIds (indicating bypass relationship)
    // Look in both upstream and downstream equipment
    const allEquipment = [...upstream, ...downstream];
    const connectedTransformers = allEquipment.filter(txEq =>
      txEq.type.includes('TX') &&
      txEq.parentIds &&
      txEq.parentIds.includes(upsEq.id)
    );

    connectedTransformers.forEach(txEq => {
      // Verify both equipment have nodes in the final node list
      const upsNode = nodes.find(node => node.id === upsEq.id);
      const txNode = nodes.find(node => node.id === txEq.id);

      if (upsNode && txNode) {
        const bypassEdgeId = `bypass-${upsEq.id}-${txEq.id}`;

        console.log(`✅ Creating bypass connection: ${upsEq.name} → ${txEq.name}`);

        edges.push({
          id: bypassEdgeId,
          source: upsEq.id,
          target: txEq.id,
          type: 'smoothstep',
          sourceHandle: 'sl', // Left side of UPS
          targetHandle: 'sr', // Right side of transformer
          style: {
            stroke: '#1259ad', // Normal connection color (same as S1)
            strokeWidth: 2
          },
          data: {
            sourceNumber: 'BYPASS',
            connectionType: 'bypass',
            isAlternate: false, // Not alternate since it should look normal
            isBypassConnection: true
          }
        });
      } else {
        console.log(`⚠️ Nodes not found for bypass connection: UPS ${upsEq.name} → TX ${txEq.name}`);
      }
    });
  });

  // Deduplicate edges to prevent React key conflicts
  const uniqueEdges: TreeEdge[] = [];
  const edgeMap = new Map<string, TreeEdge>();

  edges.forEach(edge => {
    // Create a canonical key based on source and target (regardless of ID)
    const canonicalKey = `${edge.source}-${edge.target}`;

    if (!edgeMap.has(canonicalKey)) {
      edgeMap.set(canonicalKey, edge);
      uniqueEdges.push(edge);
    } else {
      // If we have a duplicate, prefer bypass/alternate edges over normal ones
      const existingEdge = edgeMap.get(canonicalKey)!;
      const isCurrentBypass = edge.data?.connectionType === 'bypass';
      const isExistingBypass = existingEdge.data?.connectionType === 'bypass';

      if (isCurrentBypass && !isExistingBypass) {
        // Replace normal edge with bypass edge
        const index = uniqueEdges.findIndex(e => e.id === existingEdge.id);
        if (index !== -1) {
          uniqueEdges[index] = edge;
          edgeMap.set(canonicalKey, edge);
        }
      }
    }
  });

  console.log(`Generated ${nodes.length} nodes and ${uniqueEdges.length} edges (${edges.length - uniqueEdges.length} duplicates removed)`);
  return { nodes, edges: uniqueEdges };
}
