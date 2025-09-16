import {
  EquipmentConnection,
  Equipment,
  ProcessedEquipment,
  TreeNode,
  TreeEdge,
  TreeData,
  ConnectionMap,
  LoopGroup
} from './types';

// Constants for layout (matching original extension)
const nodeWidth = 180;
const nodeHeight = 70;
const nodeSpacing = 120;
const levelSpacing = 300;
const centerX = 400;
const centerY = 300;
const minNodeDistance = 20;

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
    const processedUpstream = processEquipmentForVisualization(filteredUpstream, connectionMap);
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

  console.log(`Processed ${processedEquipment.length} equipment items (${loopGroups.size} loop groups created). Rewired ${replacementMap.size} member references to loop reps.`);
  return processedEquipment;
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

  // Group upstream equipment by level
  const upstreamByLevel = new Map<number, ProcessedEquipment[]>();
  upstream.forEach(eq => {
    if (!upstreamByLevel.has(eq.level)) {
      upstreamByLevel.set(eq.level, []);
    }
    upstreamByLevel.get(eq.level)!.push(eq);
  });

  // Position upstream equipment
  let s1ColumnAnchor: number | null = null;
  let s2ColumnAnchor: number | null = null;
  let s1RightBarrier: number | null = null;

  upstreamByLevel.forEach((levelEquipment, level) => {
    const y = centerY - (level * levelSpacing);
    const s1Group = levelEquipment
      .filter(eq => getEquipmentBranch(eq.id) === 'S1')
      .sort((a, b) => a.name.localeCompare(b.name));
    const s2Group = levelEquipment
      .filter(eq => getEquipmentBranch(eq.id) === 'S2')
      .sort((a, b) => a.name.localeCompare(b.name));
    const horizontalGap = nodeSpacing * 2;

    const s1Width = s1Group.length
      ? s1Group.length * nodeWidth + Math.max(0, s1Group.length - 1) * nodeSpacing
      : 0;
    const s2Width = s2Group.length
      ? s2Group.length * nodeWidth + Math.max(0, s2Group.length - 1) * nodeSpacing
      : 0;

    const renderEquipment = (eq: ProcessedEquipment, x: number) => {
      const branch = getEquipmentBranch(eq.id);
      const color = getNodeColor(branch);

      const labelText = eq.isLoopGroup
        ? `${eq.name}\n${eq.type}\nRING BUS`
        : `${eq.name}\n${eq.type}`;

      nodes.push({
        id: eq.id,
        data: {
          label: labelText,
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

      if (eq.parentId) {
        const connSource = getUpstreamEdgeSourceNumber(eq.parentId, eq.id);
        const isS2Connection = connSource === 'S2';
        const sourceHandle = isS2Connection ? 'br' : 'bl';
        const targetHandle = isS2Connection ? 'tr' : 'tl';
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

      if (eq.alternateParents && eq.alternateParents.length > 0) {
        eq.alternateParents.forEach((altParent, altIndex) => {
          const parentInTree = [...upstream, ...downstream].some(e => e.id === altParent.id) || altParent.id === selectedEquipment.id;

          if (parentInTree) {
            const isBypass = altParent.connectionType === 'bypass';
            const edgeId = `bypass-${altParent.id}-${eq.id}-${altParent.connectionType}-${altIndex}`;

            const existingEdge = edges.find(e =>
              (e.source === altParent.id && e.target === eq.id) ||
              (e.source === eq.id && e.target === altParent.id)
            );

            if (!existingEdge) {
              const isAltS2 = altParent.sourceNumber === 'S2';
              const sourceHandle = isAltS2 ? 'br' : 'bl';
              const targetHandle = isAltS2 ? 'tr' : 'tl';

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
    };

    const positionGroup = (group: ProcessedEquipment[], startX: number) => {
      group.forEach((eq, index) => {
        const x = startX + index * (nodeWidth + nodeSpacing);
        renderEquipment(eq, x);
      });
    };

    if (s1Group.length && s2Group.length) {
      const defaultLeft = centerX - horizontalGap / 2 - s1Width;
      const leftStartX = s1ColumnAnchor !== null ? s1ColumnAnchor : defaultLeft;

      const currentRightBarrier = leftStartX + s1Width;
      s1RightBarrier = Math.max(s1RightBarrier ?? currentRightBarrier, currentRightBarrier);

      const defaultRight = centerX + horizontalGap / 2;
      let rightStartX = s2ColumnAnchor !== null ? s2ColumnAnchor : defaultRight;
      const minimumRight = (s1RightBarrier ?? currentRightBarrier) + horizontalGap;
      if (rightStartX < minimumRight) {
        rightStartX = minimumRight;
      }

      positionGroup(s1Group, leftStartX);
      positionGroup(s2Group, rightStartX);

      s1ColumnAnchor = leftStartX;
      s2ColumnAnchor = rightStartX;
    } else if (s1Group.length) {
      const startX = s1ColumnAnchor !== null
        ? s1ColumnAnchor
        : centerX - s1Width / 2;

      positionGroup(s1Group, startX);
      s1ColumnAnchor = startX;
      const rightEdge = startX + s1Width;
      s1RightBarrier = Math.max(s1RightBarrier ?? rightEdge, rightEdge);
    } else if (s2Group.length) {
      let startX: number;
      if (s2ColumnAnchor !== null) {
        startX = s2ColumnAnchor;
      } else if (s1RightBarrier !== null) {
        startX = s1RightBarrier + horizontalGap;
      } else {
        startX = centerX - s2Width / 2;
      }

      positionGroup(s2Group, startX);
      s2ColumnAnchor = startX;
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
    const totalWidth = levelEquipment.length * nodeWidth + (levelEquipment.length - 1) * nodeSpacing;
    const startX = centerX - totalWidth / 2;

    levelEquipment.forEach((eq, index) => {
      const x = startX + index * (nodeWidth + nodeSpacing);
      const color = '#e77b16'; // downstream orange

      nodes.push({
        id: eq.id,
        data: {
          label: `${eq.name}\n${eq.type}`,
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
          const targetHandle = isS2 ? 'tr' : 'tl';
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
