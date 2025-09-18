# Layout Algorithm Implementation Guide

## Overview
`generateNodesAndEdges()` still reflects the deprecated "push every S2 to the right" approach. That logic is the root cause of the drift in the latest screenshots (MDS3-01R hovering higher than its peers and S2 trunks tearing away from the center). This guide replaces that logic with a subtree-width, baseline-driven layout that keeps equipment aligned and symmetric.

## Files to Touch
- `app/lib/tree-algorithms.ts`
- `app/lib/types.ts`
- (Optional) layout helpers if they exist in `app/lib/layout/`

## Phase 1 – Constants & Types

### Update Constants (`tree-algorithms.ts` top of file)
```typescript
const nodeWidth = 180;
const nodeHeight = 70;
const minimumNodeSpacing = 160;      // horizontal buffer between siblings
const levelSpacing = 280;            // vertical distance between logical levels
const localBranchOffset = 80;        // small bias when both S1 & S2 exist
const lateralUpsOffset = nodeWidth * 1.8 + minimumNodeSpacing;
const collisionPadding = 12;         // buffer when nudging nodes apart
```

### Extend Types (`app/lib/types.ts`)
```typescript
export interface EquipmentLayoutInfo {
  equipment: ProcessedEquipment;
  branch: 'S1' | 'S2';
  typeCategory: 'UTILITY' | 'GENERATOR' | 'TRANSFORMER' | 'DISTRIBUTION' | 'END_EQUIPMENT';
  level: number;
  isLateral: boolean;
  parentId?: string;
}

export interface Position {
  x: number;
  y: number;
}

export interface SubtreeDimensions {
  width: number;
  leftBias: number;
  rightBias: number;
}

export interface PlacementTree {
  rootId: string;
  nodes: Map<string, PlacementNode>;
}

export interface PlacementNode {
  id: string;
  parentId?: string;
  children: PlacementChildGroups;
  info: EquipmentLayoutInfo;
}

export interface PlacementChildGroups {
  s1: string[];
  s2: string[];
  laterals: string[]; // UPS loops from this node
}

export interface LayoutValidationResult {
  isValid: boolean;
  issues: string[];
  totalNodes: number;
  validationTimestamp: string;
}
```

## Phase 2 – Classification & Placement Tree

### Classification Helpers
Add or refine the following helpers in `tree-algorithms.ts`:
```typescript
function categorizeByType(type: string): EquipmentLayoutInfo['typeCategory'] { /* existing logic */ }

function determineBranch(equipment: ProcessedEquipment): 'S1' | 'S2' { /* use sources + defaults */ }

function isLateralConnection(
  equipment: ProcessedEquipment,
  connectionMap: ConnectionMap
): boolean {
  if (!equipment.parentId) return false;
  const upstream = connectionMap.get(equipment.id);
  if (!upstream) return false;
  return equipment.type.toUpperCase().includes('UPS') &&
    upstream.downstream.some(child => child.id === equipment.parentId) &&
    upstream.upstream.some(parent => parent.id === equipment.parentId);
}
```

### Build Placement Tree
Before building the placement tree, hydrate any upstream nodes that were dropped during preprocessing so redundant (S2) feeders stay visible:
```typescript
const completeUpstream = ensureCompleteUpstreamCoverage(
  selectedEquipment,
  processedUpstream,
  connectionMap
);
```
Replace the current level-based loop with a dedicated builder:
```typescript
function buildPlacementTree(
  selected: ProcessedEquipment,
  layoutInfo: Map<string, EquipmentLayoutInfo>,
  connectionMap: ConnectionMap
): PlacementTree {
  const nodes = new Map<string, PlacementNode>();
  const queue = [selected.id];

  while (queue.length) {
    const id = queue.shift()!;
    const info = layoutInfo.get(id);
    if (!info) continue;

    const s1: string[] = [];
    const s2: string[] = [];
    const laterals: string[] = [];

    const connections = connectionMap.get(id);
    if (connections) {
      connections.upstream.forEach(parent => {
        const childInfo = layoutInfo.get(parent.id);
        if (!childInfo) return;
        if (childInfo.isLateral) {
          laterals.push(parent.id);
          queue.push(parent.id); // keep traversing lateral branches
        } else if (childInfo.branch === 'S2') {
          s2.push(parent.id);
          queue.push(parent.id);
        } else {
          s1.push(parent.id);
          queue.push(parent.id);
        }
      });
    }

    nodes.set(id, {
      id,
      parentId: info.parentId,
      info,
      children: { s1, s2, laterals },
    });
  }

  return { rootId: selected.id, nodes };
}
```
*Why queue?* Upstream equipment is finite and we only need to traverse once. The tree is stored bottom-up (selected at root, upstream nodes as children) so later phases can recursively reserve width.

## Phase 3 – Baseline Map & Span Calculation

### Level Baselines
Create a helper that records the canonical Y coordinate per level:
```typescript
function createLevelBaselines(
  layoutInfo: Iterable<EquipmentLayoutInfo>,
  selectedLevel: number,
  centerY: number
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
```

### Subtree Span
Post-order calculation returns the width needed to render a node and all upstream children.
```typescript
function computeSubtreeSpan(
  nodeId: string,
  tree: PlacementTree,
  spanMap: Map<string, SubtreeDimensions>
): SubtreeDimensions {
  const node = tree.nodes.get(nodeId)!;

  const s1Spans = node.children.s1.map(childId =>
    computeSubtreeSpan(childId, tree, spanMap)
  );
  const s2Spans = node.children.s2.map(childId =>
    computeSubtreeSpan(childId, tree, spanMap)
  );

  const s1Width = sumGroupWidth(s1Spans);
  const s2Width = sumGroupWidth(s2Spans);

  const width = Math.max(nodeWidth, s1Width + s2Width || nodeWidth);
  const leftBias = Math.max(nodeWidth / 2, s1Width);
  const rightBias = Math.max(nodeWidth / 2, s2Width);

  const result = { width, leftBias, rightBias } satisfies SubtreeDimensions;
  spanMap.set(nodeId, result);
  return result;
}

function sumGroupWidth(spans: SubtreeDimensions[]): number {
  if (spans.length === 0) return 0;
  return spans.reduce((acc, span) => acc + span.width, 0) +
    (spans.length - 1) * minimumNodeSpacing;
}
```

## Phase 4 – Position Assignment

### Recursive Placement
```typescript
function assignPositionsRecursive(
  nodeId: string,
  centerX: number,
  tree: PlacementTree,
  spanMap: Map<string, SubtreeDimensions>,
  positions: Map<string, Position>,
  baselines: Map<number, number>
): void {
  const node = tree.nodes.get(nodeId)!;
  const { s1, s2 } = node.children;
  const baselineY = baselines.get(node.info.level)!;
  positions.set(nodeId, { x: centerX, y: baselineY });

  const [s1Slots, nextToRight] = reserveSlots(centerX - localBranchOffset, s1, tree, spanMap, -1);
  const [s2Slots] = reserveSlots(centerX + localBranchOffset, s2, tree, spanMap, 1, nextToRight);

  s1.forEach((childId, index) => {
    assignPositionsRecursive(s1[ index ], s1Slots[index], tree, spanMap, positions, baselines);
  });
  s2.forEach((childId, index) => {
    assignPositionsRecursive(s2[ index ], s2Slots[index], tree, spanMap, positions, baselines);
  });
}
```

`reserveSlots` is a helper that returns the child centers for a branch group while keeping siblings evenly distributed inside their group span. For single-child groups, the slot equals the parent center so the branch remains vertical.

### Laterals
```typescript
function positionLateralEquipment(
  tree: PlacementTree,
  positions: Map<string, Position>,
  baselines: Map<number, number>
): void {
  tree.nodes.forEach(node => {
    if (node.children.laterals.length === 0) return;
    const parentPos = positions.get(node.id)!;
    node.children.laterals.forEach(lateralId => {
      const info = tree.nodes.get(lateralId)!.info;
      const y = parentPos.y; // lateral stays on the parent’s baseline
      const direction = info.branch === 'S2' ? 1 : -1;
      positions.set(lateralId, {
        x: parentPos.x + direction * lateralUpsOffset,
        y,
      });
    });
  });
}
```

## Phase 5 – Collision Guard
Leverage the existing detection but update signatures to use the new structures:
```typescript
function detectAndResolveCollisions(
  positions: Map<string, Position>,
  layoutInfo: Map<string, EquipmentLayoutInfo>
): Map<string, Position> {
  const resolved = new Map(positions);
  for (let pass = 0; pass < 4; pass++) {
    const collisions = findCollisions(resolved);
    if (!collisions.length) break;
    collisions.forEach(({ node1, node2, overlap }) => {
      resolveCollision(node1, node2, overlap, resolved, layoutInfo);
    });
  }
  return resolved;
}
```

`resolveCollision` should favor moving nodes with higher `layoutInfo.get(id).level` (further from the selected). Horizontal shifts of `overlap.horizontal / 2 + collisionPadding` keep nodes on the same baseline.

## Phase 6 – Integrate into `generateNodesAndEdges`

1. Gather `upstream` equipment and map into `EquipmentLayoutInfo` objects (set `isLateral` via `isLateralConnection`).
2. Build `layoutInfoMap = new Map(info.map(x => [x.equipment.id, x]))`.
3. Construct the placement tree and span map:
```typescript
const placementTree = buildPlacementTree(selectedEquipment, layoutInfoMap, connectionMap);
const spanMap = new Map<string, SubtreeDimensions>();
computeSubtreeSpan(placementTree.rootId, placementTree, spanMap);
```
4. Create baselines and assign positions:
```typescript
const baselines = createLevelBaselines(layoutInfoMap.values(), selectedEquipment.level, centerY);
assignPositionsRecursive(placementTree.rootId, centerX, placementTree, spanMap, positions, baselines);
positionLateralEquipment(placementTree, positions, baselines);
const resolvedPositions = detectAndResolveCollisions(positions, layoutInfoMap);
```
5. Feed `resolvedPositions` into the existing node/edge creation logic. Every time you write a Y coordinate, read from `baselines` rather than trusting the existing value.
6. Run `validateLayout(resolvedPositions, layoutInfoMap, baselines)` and `console.warn` the issues to help future debugging.

## Validation Checklist
- Level baseline: all nodes satisfy `Math.abs(pos.y - baselines.get(level)) < 0.5`.
- Collision free: zero pairs overlap after the guard pass.
- Branch containment: child X coordinates fall within their parent’s `centerX ± spanMap.get(parent).left/rightBias`.
- Lateral correctness: UPS nodes share the parent baseline and sit exactly `lateralUpsOffset` away, and their upstream sources still render.

## Testing Recommendations
1. Rebuild the two screenshots provided by the user and confirm MDS3-01R/MDS3-01C align.
2. Traverse other equipment IDs noted in `tasks/todo.md` to make sure long chains stay vertical.
3. Stress-test with artificially wide branches (10+ siblings) to confirm slots distribute evenly.
4. Capture before/after screenshots for regression history.

Following these steps will produce the naturally expanding, level-aligned tree described in the updated spacing plan.
