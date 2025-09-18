# Power Flow Tree Layout Plan

## Goal
Restore a natural, readable upstream layout that mirrors the "correct" reference screenshot:
- Each branching decision only affects its immediate children (S1 left, S2 right) without forcing later nodes into global columns.
- Maintain compact vertical spacing so levels stay consistent and avoid large gaps.
- Prevent edge overlap by computing local sub-layouts per parent, instead of pushing branches across the whole tree.

## Current Issues
1. Global anchoring logic is forcing every S2 node to the far right, causing crossovers and wasted space.
2. Y coordinates are inherited from parents instead of a shared baseline, so level-to-level spacing drifts (see MDS3-01R vs MDS3-01C).
3. Loop nodes and multi-parent nodes sometimes end up centered incorrectly after removing global anchors.

## Proposed Approach
1. **Local Layout Model**
   - For each parent, compute its immediate children’s X positions relative to the parent.
   - Keep the parent centered; distribute S1 children to the left and S2 to the right using reserved subtree spans computed ahead of placement.
   - A single-child branch (only S1 or only S2) should stay perfectly vertical above the parent.
   - Special-case UPS loops (MDS → UPS → same MDS) so the UPS sits laterally on the parent’s horizontal line with a double connection visual, while still traversing that UPS branch to render its upstream sources.
   - Hydrate missing upstream feeders from the connection map (via `ensureCompleteUpstreamCoverage`) so ATS S2 paths and other redundant sources remain visible.
   - Ensure each branch expansion stays within the width allocated to that parent rather than drifting toward the global edges.
2. **Recursive Width Calculation**
   - Before placing nodes, compute subtree width using a post-order traversal (`computeSubtreeSpan`) so each parent knows how much horizontal space it needs.
   - Use this width to center child groups under/over the parent while keeping left/right orientation.
   - Derive canonical level baselines once (`centerY - levelSpacing * offset`) so peers share Y coordinates.
3. **Baseline-Driven Vertical Spacing**
   - Set base spacing (`levelSpacing = 280`) and compute per-level baselines so every peer uses the same Y coordinate.
   - Optional follow-up: explore compression for extreme single-branch chains once baseline alignment is verified.
4. **Loop Handling** ✅ *COMPLETED*
   - **Loop Group Detection**: Automatically identifies ring bus configurations (e.g., CDS-1R-RING)
   - **Individual Member Filtering**: Filters out individual equipment that are part of loop groups to prevent visual duplication
   - **Fallback Positioning**: Loop groups inherit position from their first member equipment when layout calculation doesn't provide position
   - **Cycle Prevention**: Added robust cycle detection in `computeSubtreeSpan()` to prevent infinite recursion
   - **Visual Representation**: Loop groups render with dashed borders and "RING BUS" labeling
   - **Proper Labeling**: Descriptive names showing endpoints (e.g., "CDS3-01R-1 ↔ CDS3-01R-3")
5. **Implementation Plan**
   1. Build a tree representation (`TreeNodePlacement`) storing children, branch type, and tentative widths.
   2. Recursive function `calculateSubtreeWidth(nodeId)` returns the span needed, splitting S1/S2 children.
   3. Placement phase: assign X to each child using the parent’s center and the group’s width so S1/S2 fan out evenly; when a branch has only one child, keep it centered directly above.
   4. Detect UPS loops during layout, override their extents so they don’t force extra width, and reposition them beside the parent after placement.
   5. After placement, convert to ReactFlow nodes/edges, drawing both directions for the UPS loop, then run a light collision pass while keeping nodes on their assigned baselines.
6. **Testing Plan**
   - Verify against IDs: `recBIrd0i8fzS6EWB`, `rec0gLpMLc6wB16tX`, the new reference screenshot selections.
   - Compare node counts/levels to ensure no branch crosses others.
   - Confirm loops and ATS placements remain in place.

## TODO Checklist
- [x] Implement subtree-width calculation for upstream equipment.
- [x] **Fix Loop Group Handling** - Resolved infinite recursion and visual representation issues
- [ ] Refine placement logic so each parent stays centered while left/right groups expand evenly, including single-child vertical alignment and lateral UPS handling.
- [ ] Adjust vertical spacing to compress long single-branch runs (optional if needed after layout refinement).
- [ ] Validate layout visually with the reference equipment IDs.
- [x] Update `tasks/todo.md` with review notes after implementation.

## ✅ COMPLETED: Loop Group Handling Implementation (Sep 17, 2025)

### **Problem Resolved**
Fixed critical issues with loop group detection and visualization that were causing:
1. **Infinite recursion** in `computeSubtreeSpan()` function leading to 500 API errors
2. **Visual duplication** where both loop groups AND individual equipment nodes were rendered
3. **Missing loop group nodes** due to positioning calculation issues

### **Technical Implementation**

#### 1. **Cycle Detection Fix**
**Location**: `app/lib/tree-algorithms.ts:832` (`computeSubtreeSpan` function)
```typescript
function computeSubtreeSpan(
  nodeId: string,
  tree: PlacementTree,
  spanMap: Map<string, SubtreeDimensions>,
  visited: Set<string> = new Set()  // Added cycle detection
): SubtreeDimensions {
  // Cycle detection to prevent infinite recursion
  if (visited.has(nodeId)) {
    const fallback: SubtreeDimensions = { /* fallback */ };
    spanMap.set(nodeId, fallback);
    return fallback;
  }

  visited.add(nodeId);
  // ... process children
  visited.delete(nodeId); // Backtrack
}
```

#### 2. **Loop Group Member Filtering**
**Location**: `app/lib/tree-algorithms.ts:1350-1365`
```typescript
// Create set of equipment IDs that are part of loop groups
const loopGroupMemberIds = new Set<string>();
upstream.forEach(eq => {
  if (eq.isLoopGroup && eq.loopGroupData?.equipment) {
    eq.loopGroupData.equipment.forEach(member => {
      loopGroupMemberIds.add(member.id);
    });
  }
});

// Filter out individual equipment during node rendering
upstream.forEach(eq => {
  if (!eq.isLoopGroup && loopGroupMemberIds.has(eq.id)) {
    return; // Skip individual members
  }
  // ... render node
});
```

#### 3. **Loop Group Position Fallback**
**Location**: `app/lib/tree-algorithms.ts:1367-1377`
```typescript
let pos = upstreamPositions.get(eq.id);

// If loop group doesn't have a position, use first member's position
if (!pos && eq.isLoopGroup && eq.loopGroupData?.equipment) {
  const firstMember = eq.loopGroupData.equipment[0];
  if (firstMember) {
    pos = upstreamPositions.get(firstMember.id);
  }
}
```

### **Results Achieved**
- ✅ **API Stability**: No more 500 errors from infinite recursion
- ✅ **Correct Node Count**: Reduced from 16 to 14 nodes (filtered out 3 individual CDS3-01R nodes, added 1 loop group)
- ✅ **Loop Group Visualization**: `loop-CDS-1R-RING` now renders as single combined node
- ✅ **Proper Labeling**: "CDS3-01R-1 ↔ CDS3-01R-3\nRING BUS" with distinctive dashed border
- ✅ **Individual Node Filtering**: CDS3-01R-1, CDS3-01R-2, CDS3-01R-3 no longer appear as duplicates

### **Equipment ID Tested**
- Primary test case: `rec9CwMw9geF7vgjX` (ATS3-01A-1)
- Loop group created: `loop-CDS-1R-RING` representing ring bus configuration
- Members filtered: `recV1q5a8y5SMQ8DS`, `reclbUOIjvpBK2IY4`, `recCVCkg7T7qKshxk`

### **Code Quality**
- ✅ No ESLint warnings or errors
- ✅ No TypeScript compilation issues
- ✅ Proper error handling with fallback positioning
- ✅ Maintains existing cycle detection for tree algorithms
