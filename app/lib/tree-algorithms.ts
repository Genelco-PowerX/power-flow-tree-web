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
    // Fetch connections from our API
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/equipment-connections`);
    if (!response.ok) {
      throw new Error('Failed to fetch equipment connections');
    }

    const { data: connections } = await response.json();

    // Build connection map
    const connectionMap = buildConnectionMap(connections);

    // Find the selected equipment info
    const selectedEquipment = findEquipmentInfo(selectedEquipmentId, connections);
    if (!selectedEquipment) {
      throw new Error(`Equipment with ID ${selectedEquipmentId} not found`);
    }

    // Traverse upstream and downstream
    const upstream = traverseUpstream(selectedEquipmentId, connectionMap);
    const downstream = traverseDownstream(selectedEquipmentId, connectionMap);

    // Process equipment for visualization (loop detection, deduplication)
    const processedUpstream = processEquipmentForVisualization(upstream);
    const processedDownstream = processEquipmentForVisualization(downstream);

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

  // Build relationships
  connections.forEach(connection => {
    const sourceNumber = connection.sourceNumber || 'S1';

    connection.from.forEach(fromId => {
      connection.to.forEach(toId => {
        // Add downstream relationship (from → to)
        const fromEntry = connectionMap.get(fromId);
        if (fromEntry) {
          fromEntry.downstream.push({
            id: toId,
            name: connection.toName,
            type: connection.toType,
            sourceNumber
          });
        }

        // Add upstream relationship (to ← from)
        const toEntry = connectionMap.get(toId);
        if (toEntry) {
          toEntry.upstream.push({
            id: fromId,
            name: connection.fromName,
            type: connection.fromType,
            sourceNumber
          });
        }
      });
    });
  });

  console.log(`Built connection map with ${connectionMap.size} equipment entries`);
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
  if (visited.has(equipmentId) || level > 10) {
    return []; // Prevent cycles and excessive depth
  }

  visited.add(equipmentId);
  const currentPath = [...path, equipmentId];
  const equipment: Equipment[] = [];

  const connections = connectionMap.get(equipmentId);
  if (!connections) return equipment;

  connections.upstream.forEach(upstream => {
    const currentBranch: 'S1' | 'S2' = (branch || (upstream.sourceNumber as 'S1' | 'S2') || 'S1');
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
      branch: currentBranch
    });

    // Recursively traverse
    const childEquipment = traverseUpstream(
      upstream.id,
      connectionMap,
      new Set(visited),
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
  if (visited.has(equipmentId) || level > 10) {
    return []; // Prevent cycles and excessive depth
  }

  visited.add(equipmentId);
  const currentPath = [...path, equipmentId];
  const equipment: Equipment[] = [];

  const connections = connectionMap.get(equipmentId);
  if (!connections) return equipment;

  connections.downstream.forEach(downstream => {
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
      path: currentPath
    });

    // Recursively traverse
    const childEquipment = traverseDownstream(
      downstream.id,
      connectionMap,
      new Set(visited),
      level + 1,
      currentPath
    );
    equipment.push(...childEquipment);
  });

  return equipment;
}

function processEquipmentForVisualization(equipment: Equipment[]): ProcessedEquipment[] {
  // First, deduplicate equipment while preserving multiple sources
  const equipmentById = new Map<string, ProcessedEquipment>();

  equipment.forEach(eq => {
    if (!equipmentById.has(eq.id)) {
      equipmentById.set(eq.id, {
        ...eq,
        sources: [eq.sourceNumber || 'S1'],
        parentIds: [eq.parentId].filter(Boolean) as string[]
      });
    } else {
      // Merge multiple sources/paths
      const existing = equipmentById.get(eq.id)!;
      if (eq.sourceNumber && !existing.sources.includes(eq.sourceNumber)) {
        existing.sources.push(eq.sourceNumber);
      }
      if (eq.parentId && !existing.parentIds.includes(eq.parentId)) {
        existing.parentIds.push(eq.parentId);
      }
      // Prefer S1 branch when conflicting
      if (!existing.branch) {
        existing.branch = eq.branch;
      } else if (eq.branch === 'S1') {
        existing.branch = 'S1';
      }
      // Use shortest path (lowest level)
      if (eq.level < existing.level) {
        existing.level = eq.level;
        existing.parentId = eq.parentId;
        existing.path = eq.path;
      }
    }
  });

  let processedEquipment = Array.from(equipmentById.values());

  // Detect and process loop groups (matching original extension logic)
  processedEquipment = processLoopGroups(processedEquipment);

  return processedEquipment;
}

function processLoopGroups(equipment: ProcessedEquipment[]): ProcessedEquipment[] {
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

      // Determine the member closest to the selected equipment (smallest level)
      const closestToSelected = group.equipment.reduce((min, e) =>
        e.level < min.level ? e : min,
        group.equipment[0]
      );

      // Create loop group representative
      const loopGroupRep: ProcessedEquipment = {
        id: `loop-${groupKey}`,
        name: `${startEquipment.name} ↔ ${endEquipment.name}`,
        type: 'RING BUS',
        level: closestToSelected.level,
        // Parent should be the downstream child directly connected to the loop
        parentId: closestToSelected.parentId,
        sources: group.sources,
        parentIds: closestToSelected.parentId ? [closestToSelected.parentId] : [],
        isLoopGroup: true,
        branch: group.equipment.some(e => e.branch === 'S1') ? 'S1' : (group.equipment.some(e => e.branch === 'S2') ? 'S2' : undefined),
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
  upstreamByLevel.forEach((levelEquipment, level) => {
    // Ensure S1 are on the left, S2 on the right
    levelEquipment.sort((a, b) => {
      const av = a.branch === 'S2' ? 1 : 0;
      const bv = b.branch === 'S2' ? 1 : 0;
      return av - bv; // S1(0) before S2(1)
    });
    const y = centerY - (level * levelSpacing);
    const totalWidth = levelEquipment.length * nodeWidth + (levelEquipment.length - 1) * nodeSpacing;
    const startX = centerX - totalWidth / 2;

    levelEquipment.forEach((eq, index) => {
      const x = startX + index * (nodeWidth + nodeSpacing);
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

      // Add edge to parent
      if (eq.parentId) {
        const connSource = getUpstreamEdgeSourceNumber(eq.parentId, eq.id);
        edges.push({
          id: `${eq.parentId}-${eq.id}`,
          source: eq.parentId,
          target: eq.id,
          type: 'smoothstep',
          sourceHandle: 'ts',
          targetHandle: 'bt',
          label: connSource === 'S2' || connSource === 'S1' ? connSource : undefined,
          labelShowBg: true,
          labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9, stroke: '#e5e7eb' },
          labelBgPadding: [4, 2],
          labelBgBorderRadius: 6,
          labelStyle: { fill: '#0f172a', fontWeight: 600, fontSize: 11 },
          style: {
            // Edge color reflects the specific connection's source number
            stroke: connSource === 'S2' ? '#2b81e5' : '#1259ad',
            strokeWidth: 2,
            // Edge style reflects the specific connection's source number
            strokeDasharray: connSource === 'S2' ? '6 4' : undefined
          },
          data: {
            sourceNumber: connSource,
            isLoop: eq.isLoopGroup
          }
        });
      }
    });
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

  console.log(`Generated ${nodes.length} nodes and ${edges.length} edges`);
  return { nodes, edges };
}
