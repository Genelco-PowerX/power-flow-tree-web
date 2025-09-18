# Equipment Spacing & Layout Optimization Plan

## Overview
The power-flow tree must read like a clean one-line diagram: equipment of the same type stays on the same horizontal plane, each branching decision only affects its immediate children, and lateral loops never yank nodes off their natural level. This plan documents the corrected spacing model that resolves the misalignments seen in the latest screenshots (e.g. MDS3-01R floating above MDS3-01C and S2 branches pushed far to the right).

## Current Issues Observed
- **Cross-branch drift**: S2 nodes inherit a global "push right" rule, so later branches spill across unrelated trunks.
- **Level misalignment**: MDS3-01R, UTILITY3-02, and other peers render higher than their siblings because their Y coordinates are derived from their parent rather than a level baseline.
- **Loop confusion**: UPS↔MDS loops are treated like vertical children, forcing the UPS above the parent and creating kinked connectors.
- **Collision handling gaps**: Collision detection kicks in late, so some siblings overlap before the resolver nudges them unpredictably.

These problems stem from the previous documents mixing the corrected guidance with legacy "S1 left zone/S2 right zone" rules and from positioning logic that walks level by level instead of reserving horizontal space per subtree. The updated plan eliminates those contradictions.

## Core Layout Principles

### 1. Canonical Level Baselines
Every upstream level gets a single Y coordinate derived from the selected node:

```typescript
const levelSpacing = 280; // vertical spacing between logical levels
const levelBaselines = new Map<number, number>();

levelBaselines.set(selected.level, centerY);
levelBaselines.set(level, centerY - levelSpacing * (level - selected.level));
```

- **Type lock**: Nodes with the same equipment type *and* level must use the same baseline entry (no averaging).
- **Level-first**: Baselines are established before any positioning so parents and siblings always share Y coordinates.

### 2. Local Branching, Not Global Zones
- When a parent has both S1 and S2 upstream connections, give each branch a slight `localBranchOffset` away from the parent center (`±80px`), then spread siblings within that reserved span.
- If a branch contains only one upstream child, keep that child directly vertical so chains stay centered.
- S2 nodes remain inside the horizontal space owned by their parent branch; they do **not** jump into a global right gutter.

### 3. Subtree Width Reservation
To keep the tree balanced, compute how much horizontal space each node’s upstream subtree requires before placing anything.

```typescript
interface SubtreeDimensions {
  width: number;      // total width including padding
  leftBias: number;   // portion extending to the left of the parent center
  rightBias: number;  // portion extending to the right of the parent center
}
```

- Post-order traversal (`computeSubtreeSpan`) calculates the width for each node by summing the spans of its S1 and S2 groups and adding `minimumNodeSpacing` between siblings.
- Pre-order traversal (`assignPositionsRecursive`) uses those spans to place S1 clusters to the left and S2 clusters to the right while keeping the parent centered over the combined width.
- Horizontal spacing target: `nodeWidth + minimumNodeSpacing`, with `minimumNodeSpacing = 160` for a reliable 20px buffer beyond the previous value.

### 4. Lateral Equipment (UPS ↔ MDS Loops)
- UPS nodes that form a bidirectional loop with their parent stay on the parent’s baseline (exact same Y coordinate as the parent) and move laterally by `lateralUpsOffset = nodeWidth * 1.8 + minimumNodeSpacing`.
- Lateral nodes do **not** contribute to subtree width; they are positioned post-pass to avoid forcing extra horizontal span, but their upstream ancestors must still be traversed (no filtering of lateral branches).

### 5. Collision Guardrail
With subtree width balancing, collisions should be rare. Still, run a limited collision resolution pass (`detectAndResolveCollisions`) to catch edge cases. Movement priority: lower-level nodes stay put; higher-level or lateral nodes are nudged first. Horizontal nudges are preferred to preserve level baselines.

## Updated Layout Constants
```typescript
const nodeWidth = 180;
const nodeHeight = 70;
const minimumNodeSpacing = 160;
const levelSpacing = 280;
const localBranchOffset = 80;
const lateralUpsOffset = nodeWidth * 1.8 + minimumNodeSpacing;
```

## Algorithm Outline

### Phase 1: Classification & Tree Assembly
1. Extend `EquipmentLayoutInfo` with `branch`, `typeCategory`, `level`, and an `isLateral` flag.
2. Build an upstream placement tree rooted at the selected equipment. Lateral UPS nodes sit in a separate list for placement but **must** remain in the traversal queue so their upstream ancestors continue to render.
3. Before classification, hydrate any missing upstream equipment directly from the connection map so redundant (S2) branches that were dropped by deduplication become explicit layout nodes.
3. Capture parent-child links so each node knows its immediate S1/S2 children.

### Phase 2: Baseline and Span Calculation
1. Generate the `levelBaselines` map for all levels present.
2. Execute `computeSubtreeSpan(nodeId)`:
   - Gather S1 children spans and S2 children spans separately.
   - Sum each group’s widths adding `minimumNodeSpacing` between siblings.
   - The node’s final span is the max of the two groups plus the parent’s own width, recorded as `leftBias/rightBias` for pre-order placement.

### Phase 3: Position Assignment
1. Set the selected equipment at `(centerX, levelBaselines.get(selectedLevel))`.
2. Traverse recursively with `assignPositionsRecursive`:
   - Reserve horizontal slots for S1 siblings from left to right and for S2 siblings from right to left relative to the parent center.
   - Single-child groups stay centered under the parent (no artificial offset).
   - Write positions directly from the reserved slot centers and the pre-computed baseline for the child’s level.

### Phase 4: Lateral Placement & Collision Pass
1. Call `positionLateralEquipment` to sit UPS loops beside their parent using the parent’s baseline Y (not the UPS level value).
2. Run `detectAndResolveCollisions` to nudge any remaining overlaps, preferring horizontal adjustments.

### Phase 5: Validation
`validateLayout` now checks:
- Level baseline compliance (every node matches `levelBaselines[level]`).
- No collisions remain after the safety pass.
- Branch continuity (children stay within the horizontal span allocated to their parent).

## Implementation Steps
1. **Update constants and type definitions** to match the values above and add `SubtreeDimensions`.
2. **Refactor classification** to flag lateral UPS nodes and construct the placement tree data structure.
3. **Implement span calculation** (`computeSubtreeSpan`) and position assignment (`assignPositionsRecursive`).
4. **Replace average-based type alignment** with baseline enforcement by referencing `levelBaselines` whenever writing a Y coordinate.
5. **Add lateral placement helper** and update collision handling to defer to the new span-aware layout.
6. **Enhance validation** to assert baseline usage and branch containment, alongside existing spacing checks.

## Success Criteria
- MDS, TX, GEN, UTILITY nodes of the same level align perfectly horizontally.
- S1/S2 branches expand evenly from their parent without hopping across the diagram.
- Lateral loops sit beside their parent and never distort vertical spacing.
- Lateral branches retain their upstream ancestry; no equipment disappears because of loop handling.
- No overlapping nodes or edge crossings caused by horizontal drift.
- Layout changes are deterministic (no baseline drift between renders).

with this plan, the layout algorithm will produce the natural, balanced tree that matches the corrected design intent shown in the zoomed screenshots.
