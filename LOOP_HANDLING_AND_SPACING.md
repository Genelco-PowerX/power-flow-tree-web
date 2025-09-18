# Loop Handling and Spacing System Documentation

## Overview

This document provides a comprehensive reference for understanding how loop groups (ring bus configurations) are handled in the power flow tree layout system, along with the spacing optimization mechanisms. This is critical knowledge for any future AI or developer working on this codebase.

### 🚫 Non-Negotiable Layout Rules (Read First)

1. **Branches stay centered**: S1 equipment must remain to the left of its parent and S2 equipment must remain to the right. Never shove the entire S2 tree to the far-right edge or collapse S1/S2 into the same column. Any collision handling must preserve this balance.
2. **UPS → MDS pairing**: Every UPS node belongs on the **left** side of its paired MDS with a 100 px edge gap (≈280 px center-to-center). Lines must not wrap around the MDS. Violations are regressions.
3. **Type-level alignment**: Equipment that shares the same type family (UTILITY, TX, GEN, MDS, UPS, CDS, ATS, loop reps) must sit on identical Y baselines, even when loop groups or alternate feeds are involved. Use programmatic clamps—do not rely on eyeballing.
4. **Single-child verticality**: When a parent has only one child in a branch, the connection must remain a straight vertical line. We adjust spacing above/below that chain rather than introducing harsh diagonals.
5. **UPS lateral enforcement**: If a UPS feeds an MDS, treat it as a lateral partner (same Y as the MDS) even when no explicit loop is detected.
6. **Upstream branch widening**: Each upstream level must widen outward—left branches move progressively left, right branches right. Never let higher-level equipment stack directly above lower levels.
7. **Global width cap**: The widest row dictates the tree’s total width = `(maxNodes * nodeWidth) + ((maxNodes - 1) * 200px)`. No branch may extend beyond this envelope.
8. **Vertical tier mapping**: Use 150 px increments from the selected node (`centerY = 300`) and clamp categories as follows: UPS/MDS/SWGR at `-150`, CDS/Ring bus at `0`, Generators/Transformers at `-300`, Utilities at `-450`, upstream substations at `-450`, and so on. Utilities must never share the MDS/UPS baseline.
9. **Row centering**: Every non-lateral row (including virtual slots for UPS laterals) must be centered on the tree midpoint (`centerX`) with exact 200 px clear gaps (380 px center-to-center) between neighbours, preserving the S1 → S2 alternation.

Keep these rules visible while editing this file. If a code change risks breaking one of them, stop and resolve the conflict before proceeding.

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Loop Group Concepts](#loop-group-concepts)
3. [Spacing Problem and Solution](#spacing-problem-and-solution)
4. [Code Architecture](#code-architecture)
5. [Key Functions](#key-functions)
6. [Critical Rules and Constraints](#critical-rules-and-constraints)
7. [Debugging and Troubleshooting](#debugging-and-troubleshooting)
8. [Testing Guidelines](#testing-guidelines)

## System Architecture

The power flow tree layout system processes electrical equipment in several phases:

```
Data Input → Loop Detection → Layout Calculation → Width Optimization → Positioning → Rendering
```

### Phase Breakdown

1. **Data Input**: Raw equipment connections from Airtable
2. **Loop Detection**: Identifies ring bus configurations and creates virtual loop group nodes
3. **Layout Calculation**: Builds tree structure and calculates optimal positions
4. **Width Optimization**: Prevents excessive spacing from filtered equipment
5. **Positioning**: Assigns final X,Y coordinates to all nodes
6. **Rendering**: Filters for display and applies visual styling

## Loop Group Concepts

### What is a Loop Group?

A **loop group** (ring bus) is a circular electrical configuration where multiple pieces of equipment are connected in a ring. For example:

```
CDS3-01R-1 ↔ CDS3-01R-2 ↔ CDS3-01R-3 ↔ CDS3-01R-1
```

### Visual Representation

- **Individual Equipment**: Standard rectangular nodes with solid borders
- **Loop Groups**: Combined nodes with dashed borders and "RING BUS" labeling
- **Loop Group Label**: Shows endpoints (e.g., "CDS3-01R-1 ↔ CDS3-01R-3")

### Loop Group Data Structure

```typescript
interface LoopGroupData {
  equipment: ProcessedEquipment[];      // All equipment in the loop
  startEquipment: ProcessedEquipment;   // First equipment in the loop
  endEquipment: ProcessedEquipment;     // Last equipment in the loop
  groupKey: string;                     // Unique identifier (e.g., "CDS-1R-RING")
}
```

## Spacing Problem and Solution

### The Problem

**Original Issue**: Individual loop group members were being included in layout width calculations but then filtered out during rendering, creating large horizontal gaps in the visualization.

**Symptom**: Equipment like `recCqyTgDUSyrtS8M` would have excessive spacing (2000+ pixels) between nodes, making the layout unusable.

### The Solution Architecture

The solution uses a **three-phase filtering approach**:

#### Phase 1: Layout Presence (Full Inclusion)
- All equipment (including individual loop members) participate in tree building
- Ensures proper parent-child relationships and positioning logic
- Maintains cycle detection and tree traversal integrity

#### Phase 2: Width Calculation (Selective Exclusion)
- Individual loop group members contribute **zero width** to spacing calculations
- Loop groups themselves contribute normal width
- Prevents excessive horizontal spacing

#### Phase 3: Rendering (Visual Filtering)
- Individual loop group members are filtered out from final node list
- Only loop group representatives are rendered
- Prevents visual duplication

### Key Insight

**Separation of Concerns**: Layout presence ≠ Width contribution ≠ Visual rendering

This allows us to maintain correct tree structure while optimizing spacing and visual clarity.

## Code Architecture

### Core Files

- **`app/lib/tree-algorithms.ts`**: Main layout algorithm and loop handling
- **`app/lib/types.ts`**: TypeScript interfaces for equipment and loop data
- **`tasks/todo.md`**: Implementation history and technical decisions

### Critical Code Sections

#### 1. Loop Group Detection
**Location**: `app/lib/tree-algorithms.ts` (equipment processing phase)

Creates virtual loop group nodes from ring bus configurations.

#### 2. Width Calculation Optimization
**Location**: `app/lib/tree-algorithms.ts:832` (`computeSubtreeSpan` function)

```typescript
function computeSubtreeSpan(
  nodeId: string,
  tree: PlacementTree,
  spanMap: Map<string, SubtreeDimensions>,
  visited: Set<string> = new Set(),
  loopGroupMemberIds: Set<string> = new Set()  // Critical parameter
): SubtreeDimensions {
  // Zero-width optimization for loop group members
  if (loopGroupMemberIds.has(nodeId)) {
    return {
      width: 0,     // KEY: No spacing contribution
      leftBias: 0,
      rightBias: 0
    };
  }
  // ... rest of calculation
}
```

#### 3. Cycle Detection
**Location**: `app/lib/tree-algorithms.ts:843-851`

```typescript
if (visited.has(nodeId)) {
  const fallback: SubtreeDimensions = {
    width: nodeWidth,
    leftBias: nodeWidth / 2,
    rightBias: nodeWidth / 2
  };
  spanMap.set(nodeId, fallback);
  return fallback;
}
```

#### 4. Rendering Filtering
**Location**: `app/lib/tree-algorithms.ts:1375-1377`

```typescript
// Skip individual equipment that are part of a loop group
if (!eq.isLoopGroup && loopGroupMemberIds.has(eq.id)) {
  return; // Filtered out of final rendering
}
```

#### 5. Fallback Positioning
**Location**: `app/lib/tree-algorithms.ts:1381-1387`

```typescript
// If loop group doesn't have a position, use first member's position
if (!pos && eq.isLoopGroup && eq.loopGroupData?.equipment) {
  const firstMember = eq.loopGroupData.equipment[0];
  if (firstMember) {
    pos = upstreamPositions.get(firstMember.id);
  }
}
```

## Key Functions

### 1. `computeSubtreeSpan()`
**Purpose**: Calculates width requirements for tree branches
**Critical Feature**: Zero-width contribution for loop group members
**Parameters**:
- `loopGroupMemberIds`: Set of equipment IDs to exclude from width calculations

### 2. `buildPlacementTree()`
**Purpose**: Creates tree structure for positioning
**Critical Feature**: Includes ALL equipment for proper tree structure

### 3. `calculateUpstreamPositions()`
**Purpose**: Main layout calculation function
**Critical Feature**: Creates loop group member sets for filtering

### 4. Rendering Loop (lines 1372-1420)
**Purpose**: Generates final ReactFlow nodes and edges
**Critical Feature**: Filters individual loop members while preserving loop groups

### 5. `normalizeLevelWidths()` with Hierarchical Branch Sorting
**Purpose**: Orders equipment within levels following complete branch hierarchy
**Critical Feature**: 6-level deep branch tracing to find root loop group branch designation
**Parameters**:
- `layoutInfoMap`: Equipment layout information for branch path traversal
- `getBranchPath()`: Helper function that traces up to 6 levels to find loop groups
**Key Behavior**:
- Primary sort by grandparent/great-grandparent loop group branch (S1 before S2)
- Secondary sort by direct parent branch within same grandparent branch
- Tertiary sort alphabetically for consistent ordering

## Critical Rules and Constraints

### ⚠️ NEVER Do These Things

1. **Never filter equipment from layout calculation phase**
   - Will cause equipment to disappear
   - Breaks tree structure and positioning logic

2. **Never remove cycle detection from `computeSubtreeSpan`**
   - Will cause infinite recursion and 500 API errors
   - Critical for handling ring bus configurations

3. **Never modify the three-phase filtering approach without understanding implications**
   - Layout presence, width calculation, and rendering serve different purposes

4. **Never assume loop group positions exist**
   - Always implement fallback positioning using first member equipment

### ✅ Safe Modifications

1. **Adjust spacing constants** (nodeWidth, levelSpacing)
2. **Modify visual styling** of loop groups
3. **Add additional loop group metadata**
4. **Enhance fallback positioning logic**

### ⚠️ Modification Rules

1. **If modifying `computeSubtreeSpan`**: Always preserve cycle detection and loop member filtering
2. **If adding new equipment types**: Ensure they work with existing loop detection AND type-based alignment
3. **If changing tree structure**: Test with equipment IDs that have loop groups
4. **If modifying positioning**: Ensure fallback positioning still works
5. **If modifying type-based alignment**: Always test with `recCqyTgDUSyrtS8M` to verify UPS, GEN, TX alignment
6. **If changing path detection logic**: Ensure both direct loop group IDs and loop member IDs are detected
7. **If modifying equipment type extraction**: Verify type prefix matching works for all equipment categories
8. **If modifying `normalizeLevelWidths`**: Always preserve 6-level hierarchical branch tracing
9. **If changing branch sorting logic**: Test with deep hierarchies (3+ levels) to ensure correct S1/S2 ordering
10. **If adjusting hierarchy tracing depth**: Consider that some power trees may have 6+ levels of nested equipment

## Debugging and Troubleshooting

### Common Issues and Solutions

#### Issue: "Equipment disappearing from visualization"
**Cause**: Filtering happening at layout calculation phase instead of rendering phase
**Solution**: Only filter during rendering, never during layout calculation

**Check**:
- Node count should be consistent (14+ nodes for `recCqyTgDUSyrtS8M`)
- Loop groups should be present in node list

#### Issue: "Infinite recursion / 500 API errors"
**Cause**: Cycle detection failure in `computeSubtreeSpan`
**Solution**: Verify visited set is properly managed with backtracking

**Check**:
```bash
# Look for "Maximum call stack size exceeded" in logs
curl -s "http://localhost:3000/api/equipment-tree/EQUIPMENT_ID"
```

#### Issue: "Excessive horizontal spacing"
**Cause**: Loop group members contributing to width calculations
**Solution**: Ensure `loopGroupMemberIds` is passed to `computeSubtreeSpan`

**Check**:
```bash
# X positions should be compact (< 1500 pixel span)
curl -s "http://localhost:3000/api/equipment-tree/recCqyTgDUSyrtS8M" | jq '.nodes[].position.x' | sort -n
```

#### Issue: "Loop groups not positioned correctly"
**Cause**: Missing fallback positioning logic
**Solution**: Verify fallback positioning uses first member equipment position

#### Issue: "Equipment types not aligning properly"
**Cause**: Type-based alignment not detecting loop group connections or wrong reference equipment
**Solution**: Verify path detection includes both direct loop group IDs and loop member IDs

**Check**:
```bash
# Look for type-based alignment debug logs
curl -s "http://localhost:3000/api/equipment-tree/recCqyTgDUSyrtS8M" 2>&1 | grep -i "Type-based alignment"

# Check if UPS, GEN, TX equipment are properly aligned
curl -s "http://localhost:3000/api/equipment-tree/recCqyTgDUSyrtS8M" | jq '.nodes[] | select(.data.name | test("UPS3-01[AR]|GEN3-01[AR]|TX3-01[AR]")) | {name: .data.name, y: .position.y}' | sort
```

#### Issue: "Reference equipment not found for alignment"
**Cause**: All equipment of same type are loop-connected, or type extraction failing
**Solution**: Verify equipment type prefix extraction and ensure at least one non-loop equipment of each type exists

**Check**:
```bash
# Check equipment type extraction
curl -s "http://localhost:3000/api/equipment-tree/recCqyTgDUSyrtS8M" | jq '.upstream[] | {name: .name, type: .type, hasLoop: (.path? // [] | any(. as $p | input.upstream[] | select(.isLoopGroup? // false) | .id == $p))}'
```

#### Issue: "Equipment ordering doesn't follow branch hierarchy"
**Cause**: Hierarchical branch tracing not reaching loop groups or incorrect branch path detection
**Solution**: Verify 6-level tracing is finding the correct loop group and branch designation

**Check**:
```bash
# Look for hierarchical branch tracing logs
curl -s "http://localhost:3000/api/equipment-tree/EQUIPMENT_ID" 2>&1 | grep "TRACE"

# Check if equipment order follows S1/S2 pattern within levels
curl -s "http://localhost:3000/api/equipment-tree/EQUIPMENT_ID" 2>&1 | grep "Final ordering for level"
```

#### Issue: "Branch tracing not finding loop groups"
**Cause**: Loop groups positioned beyond 6-level hierarchy depth or parent-child relationships broken
**Solution**: Increase tracing depth or verify loop group parent assignments

**Check**:
```bash
# Check hierarchy depth for specific equipment
curl -s "http://localhost:3000/api/equipment-tree/EQUIPMENT_ID" 2>&1 | grep "TRACE (fallback)"

# Verify loop group creation and parent assignments
curl -s "http://localhost:3000/api/equipment-tree/EQUIPMENT_ID" 2>&1 | grep "LEVEL FIX"
```

### Diagnostic Commands

```bash
# Check node count
curl -s "http://localhost:3000/api/equipment-tree/EQUIPMENT_ID" | jq '.nodes | length'

# Check for loop groups
curl -s "http://localhost:3000/api/equipment-tree/EQUIPMENT_ID" | jq '.nodes[] | select(.id | startswith("loop-")) | .id'

# Check horizontal spacing
curl -s "http://localhost:3000/api/equipment-tree/EQUIPMENT_ID" | jq '.nodes[].position.x' | sort -n

# Check for API errors
# Look at server logs for "Error in generatePowerFlowTree" or infinite recursion
```

## Testing Guidelines

### Test Equipment IDs

**Primary Test Cases**:
- `recCqyTgDUSyrtS8M` - Has loop group, known for spacing issues
- `rec9CwMw9geF7vgjX` - ATS with loop connections
- `recBIrd0i8fzS6EWB` - Reference case for layout validation

### Expected Results

#### For `recCqyTgDUSyrtS8M`:
- **Node Count**: ~14 nodes
- **Loop Group Present**: `loop-CDS-1R-RING`
- **Horizontal Span**: < 1500 pixels
- **Loop Group Position**: X coordinate < 1000
- **Type-Based Alignment**: UPS3-01A and UPS3-01R at same Y coordinate (-540)
- **Type-Based Alignment**: GEN3-01A and GEN3-01R at same Y coordinate (-820)
- **Type-Based Alignment**: TX3-01A and TX3-01R at same Y coordinate (-820)
- **Type-Based Alignment**: MDS3-01A and MDS3-01R at same Y coordinate (-540)

#### For `rec9CwMw9geF7vgjX`:
- **Node Count**: ~14-16 nodes
- **Loop Group Present**: `loop-CDS-1R-RING`
- **No API Errors**: Should return 200 status

### Validation Checklist

Before any changes:
- [ ] Test both equipment IDs successfully load
- [ ] Loop groups are visible in output
- [ ] Horizontal spacing is reasonable (< 2000 pixels)
- [ ] No infinite recursion errors
- [ ] Node count is consistent
- [ ] Type-based alignment working for UPS, GEN, TX equipment
- [ ] Equipment pairs have matching Y coordinates

After modifications:
- [ ] All above tests still pass
- [ ] No new TypeScript compilation errors
- [ ] No new ESLint warnings
- [ ] Layout algorithm performance is acceptable (< 5 seconds)
- [ ] Type-based alignment still functions correctly
- [ ] No regression in equipment positioning

## Implementation History

### September 18, 2025 - Hierarchical Branch Sorting Implementation

**Problem**: Equipment ordering within levels was using alphabetical names or direct parent branch information instead of following the complete branch hierarchy. TX/GEN and utility equipment were positioned incorrectly because sorting didn't trace up to the root loop group branch designation.

**Example Issue**:
- TX3-01R and GEN3-01R were being processed before TX3-02R and GEN3-02R
- Should follow branch path hierarchy: S1 S1 S1, S1 S1 S2, S2 S1 S1, S2 S1 S2
- Algorithm was only looking at immediate parent branch instead of tracing up to loop group

**Solution**: Implemented deep hierarchical branch tracing that follows the complete parent chain up to 6 levels to find the root loop group branch designation:

1. **Multi-Level Branch Tracing**: Enhanced `getBranchPath()` function to traverse up to 6 levels of parent hierarchy
2. **Loop Group Detection**: At each level, checks if equipment is a loop group and uses its branch designation
3. **Comprehensive Path Logging**: Tracks complete trace path for debugging
4. **Fallback Strategy**: Uses original parent branch if no loop group found within 6 levels

**Technical Implementation**:
```typescript
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
```

**Results**:
- ✅ TX/GEN equipment now correctly ordered by complete branch hierarchy
- ✅ Utility equipment follows proper S1 S1 S1, S1 S1 S2, S2 S1 S1, S2 S1 S2 pattern
- ✅ Works for deep hierarchies up to 6 levels (scalable for larger power trees)
- ✅ Maintains backward compatibility with existing 2-level systems

**Example Output**:
```
🧬 TRACE (3 levels): rec2sI2fdMHTaKEdY → TX3-02R → MDS3-02R → CDS3-02R-1 ↔ CDS3-02R-4 = S1
🧬 TRACE (3 levels): reczSkY6hWyIZ3km5 → TX3-01R → MDS3-01R → CDS3-01R-1 ↔ CDS3-01R-3 = S2

Final ordering for level 5:
  0: UTILITY3-03 (S1 from TX3-02R)  // S1 branch path
  1: UTILITY3-04 (S2 from TX3-02R)  // S1 branch path
  2: UTILITY3-01 (S1 from TX3-01R)  // S2 branch path
  3: UTILITY3-02 (S2 from TX3-01R)  // S2 branch path
```

**Code Changes**:
- Enhanced `normalizeLevelWidths()` function with 6-level hierarchy tracing (lines 1218-1247)
- Updated branch sorting logic to use grandparent/great-grandparent branch paths
- Added comprehensive trace logging for debugging branch path detection
- Supports equipment trees with complex nested loop group structures

**Key Insight**:
Equipment ordering must follow the complete branch hierarchy, not just immediate parent relationships. For deep power distribution trees, equipment can be 3-6 levels removed from the root loop group that determines their S1/S2 classification. The tracing algorithm ensures correct visual ordering regardless of hierarchy depth.

### September 17, 2025 - Loop Group Spacing Fix

**Problem**: Loop group members were causing excessive horizontal spacing while being filtered from rendering, creating gaps up to 3500+ pixels.

**Solution**: Implemented three-phase filtering approach:
1. **Layout Phase**: Include all equipment for proper tree structure
2. **Width Calculation**: Zero-width contribution for loop members
3. **Rendering Phase**: Filter individual members, keep loop groups

**Results**:
- Reduced horizontal span from 3500+ to ~1248 pixels
- Maintained all equipment visibility
- Preserved loop group functionality
- Fixed infinite recursion issues

**Code Changes**:
- Modified `computeSubtreeSpan()` to accept `loopGroupMemberIds` parameter
- Added zero-width optimization for loop group members
- Enhanced cycle detection with proper backtracking
- Implemented fallback positioning for loop groups

### September 18, 2025 - Type-Based Alignment System

**Problem**: Equipment connected through loop groups (UPS3-01R, GEN3-01R, TX3-01R) were positioned at incorrect Y coordinates, creating a "stair-stepping" effect instead of proper alignment with corresponding equipment types.

**Visual Issue**:
- UPS3-01R appeared 280px higher than UPS3-01A
- GEN3-01R and TX3-01R positioned incorrectly relative to their S1 counterparts
- Loop-connected equipment used tree level for positioning instead of type-based alignment

**Solution**: Implemented comprehensive type-based alignment system:
1. **Enhanced Path Detection**: Check both direct loop group IDs and loop group member IDs in equipment paths
2. **Reference Equipment Selection**: Find corresponding non-loop equipment of same type for alignment reference
3. **Y-Coordinate Inheritance**: Apply reference equipment Y position to loop-connected equipment

**Results**:
- ✅ Perfect alignment: UPS3-01A and UPS3-01R both at Y = -540
- ✅ Perfect alignment: GEN3-01A and GEN3-01R both at Y = -820
- ✅ Perfect alignment: TX3-01A and TX3-01R both at Y = -820
- ✅ Maintained MDS alignment: MDS3-01A and MDS3-01R both at Y = -540

**Code Changes**:
- Enhanced loop group path detection logic (lines 1426-1432)
- Implemented comprehensive reference equipment selection (lines 1444-1462)
- Added type-based Y-coordinate alignment (lines 1464-1470)
- Supports all equipment types: UPS, GEN, TX, MDS, CDS, ATS

**Technical Breakthrough**:
The key insight was that equipment paths contain individual equipment IDs rather than loop group IDs, requiring enhanced detection logic that checks `loopGroupMemberIds.has(pathId)` in addition to direct loop group ID matching.

### September 18, 2025 - UPS-MDS Tight Coupling Implementation

**Problem**: UPS equipment was positioned too far from their corresponding MDS units, creating wide gaps and appearing on the wrong side (right instead of left), causing connection lines to pass through nodes.

**Visual Issue**:
- UPS3-01A positioned with ~484px gap from MDS3-01A
- UPS3-01R positioned with ~880px gap from MDS3-01R
- UPS units sometimes appeared on the right side of MDS instead of left
- Connection lines passed through intermediate nodes

**Solution**: Implemented UPS-specific lateral positioning rules:
1. **Force Left-Side Positioning**: UPS equipment always positioned on left side of MDS regardless of S1/S2 branch classification
2. **Tight Spacing**: Reduced lateral offset from 484px to 200px for close coupling
3. **Consistent Direction Logic**: Enhanced both classification and positioning functions

**Results**:
- ✅ UPS/MDS pairs maintain a ~200px center-to-center gap defined by `upsMdsPairOffset`
- ✅ Every UPS is locked to the left side of its paired MDS, regardless of branch classification
- ✅ Connection lines no longer pass through intermediary nodes
- ✅ Maintained all layout rules (S1/S2 positioning, vertical alignment, type-based alignment)

- **Code Changes**:
- Modified `classifyEquipmentForLayout()` to force UPS direction to 'left' (lines 711-718)
- Updated lateral positioning logic to ensure UPS uses negative direction (lines 1020-1027)
- Added `upsMdsPairOffset` constant to drive centerline separation (line 28)
- Introduced `applyUpsMdsPairTightening()` to snap UPS nodes relative to their MDS parents after layout (lines 1130-1154)
- Trigger a second collision-resolution pass after UPS snapping so nearby equipment reflows safely (line 1093)
- Reduced `lateralUpsOffset` from `nodeWidth * 1.8 + minimumNodeSpacing` (484px) to `nodeWidth + 20` (200px)

**Technical Implementation**:
```typescript
// In classifyEquipmentForLayout()
const isUps = eq.type.toUpperCase().includes('UPS');
lateralInfo = {
  parentId: eq.parentId,
  direction: isUps ? 'left' : (branch === 'S2' ? 'right' : 'left'),
  offset: lateralUpsOffset
};

// In lateral positioning logic
const isUps = info.equipment.type.toUpperCase().includes('UPS');
const direction = isUps ? -1 : (info.branch === 'S2' ? 1 : -1);
```

**Key Insight**:
UPS equipment requires special handling because they form bidirectional connections with MDS units but should maintain consistent left-side positioning regardless of their electrical source classification (S1/S2). This creates tight coupling while preserving visual clarity.

### September 19, 2025 - Branch Collision Guardrails

**Problem**: Collision passes were still able to drift entire branches (S1/S2) away from their span targets and occasionally flip redundant edges downward, even though the initial slotting was symmetric.

**Solution**: Keep the span output as the single source of truth, clamp branch drift, and steer collisions with domain context:
1. **Anchor Preservation**: The first span positions are captured and reapplied after every collision pass. `enforceBranchAnchors()` limits S1 nodes to modest rightward drift, S2 nodes to modest leftward drift, and keeps lateral UPS nodes pinned to their parent’s left edge.
2. **Directional Collisions**: `resolveCollisions()` splits overlap between opposing branches (S1 left, S2 right) before falling back to single-node nudges, while `calculateSafePosition()` keeps branch-aware motion for all other cases.
3. **UPS Alignment**: `applyUpsMdsPairTightening()` re-snaps each UPS to 200px left of its MDS after collision resolution and updates the anchor map so later passes respect the pairing.
4. **Category Baselines**: `enforceCategoryBaselines()` clamps every type family (UTILITY, GEN, TX, MDS, UPS, CDS, ATS, loop reps) to a shared Y baseline so tiers stay perfectly horizontal regardless of upstream topology.
5. **UPS Lateral Enforcement**: `classifyEquipmentForLayout()` force-marks UPS equipment with MDS parents as lateral partners so they inherit the MDS baseline and stay left-aligned even if no loop is present.
6. **Branch Spread**: `computeBranchOffset()` increases branch offsets with upstream depth so higher levels fan outward instead of stacking.
7. **Row Normalisation**: `normalizeLevelWidths()` constrains every level to the global width envelope, interleaves S1/S2 slots (`S1←S1 → S2←S1 → S1←S2 → S2←S2`), and expands slots for lateral UPS nodes before recentering.
8. **Vertical Tier Mapping**: `determineBaselineTarget()` applies the 150 px tier map (`UPS/MDS` at -150, `GEN/TX` at -300, `UTILITY` at -450, etc.) so utilities never share the UPS/MDS baseline.
9. **Row Centering**: The same normalisation pass forces each level to sit on `centerX` with fixed node-width-plus-200 px gaps (380 px center-to-center).
10. **Redundant Edge Orientation**: Alternate S2 feeds reuse top/bottom handles (`ts` → `bt`) so redundant transformers/utility paths draw upward as expected.

**Results**:
- ✅ S1/S2 groups stay balanced around their parent instead of collapsing to one side
- ✅ Transformer and generator tiers maintain consistent spacing without manual tweaks
- ✅ UPS/MDS pairing remains locked on the left with the desired close gap even after collision passes

**Code Changes**:
- `detectAndResolveCollisions()` runs iterative resolution with anchor enforcement (lines 1098-1112)
- `resolveCollisions()` splits overlap between opposing branches before single-sided moves (lines 1219-1253)
- `applyUpsMdsPairTightening()` snaps UPS relative to MDS parents and updates anchors (lines 1130-1161)
- `enforceCategoryBaselines()` flattens type families onto shared Y baselines (lines 1156-1185)
- UPS/MDS lateral enforcement inside `classifyEquipmentForLayout()` keeps UPS nodes at the same baseline as their parent (lines 706-720)
- `computeBranchOffset()` widens branches proportionally to upstream depth (lines 907-1015)
- `normalizeLevelWidths()` enforces the global width cap and symmetrical spacing at each level (lines 1040-1144)
- Alternate-parent edge handles favor top-to-bottom routing for redundant S2 feeds (lines 1708-1724)

**Key Insight**:
The span solver already produces good targets; the collision system just needs branch-aware nudges plus anchor guardrails to keep everything visually aligned.

### Technical Decisions

1. **Why not filter at layout level?**
   - Breaks tree structure and causes equipment to disappear
   - Positioning logic depends on complete equipment set

2. **Why zero-width instead of minimal width?**
   - Completely eliminates spacing contribution
   - Prevents any residual gaps in layout

3. **Why preserve in tree structure?**
   - Maintains parent-child relationships
   - Ensures positioning algorithms work correctly
   - Allows proper cycle detection

## Type-Based Alignment System

### Overview

The type-based alignment system ensures that equipment connected through loop groups maintains proper visual alignment with corresponding equipment types on non-loop paths. This prevents the "stair-stepping" effect where loop-connected equipment would be positioned at incorrect Y coordinates based solely on their tree level.

### Problem Statement

**Original Issue**: Equipment connected through loop groups (e.g., UPS3-01R, GEN3-01R, TX3-01R) were being positioned based on their tree traversal level rather than aligning with their corresponding equipment types (UPS3-01A, GEN3-01A, TX3-01A).

**Visual Symptom**:
- UPS3-01R appeared higher than UPS3-01A
- GEN3-01R and TX3-01R appeared at incorrect vertical positions
- Created a "stair-stepping" layout instead of proper type-based alignment

### Solution Architecture

#### Detection Logic
The system detects equipment that need type-based alignment using enhanced path analysis:

```typescript
// Check if equipment has loop group in path (anywhere in parent chain)
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
```

#### Reference Equipment Selection
For equipment requiring alignment, the system finds corresponding equipment of the same type NOT connected through loop groups:

```typescript
const referenceEquipment = upstream.find(ref => {
  if (ref.isLoopGroup || ref.id === eq.id) return false;
  if (ref.type.split(':')[0].trim() !== equipmentTypePart) return false;

  // Check if reference equipment has loop group in path
  const refHasLoopGroupInPath = ref.path && ref.path.some(pathId => {
    const isDirectLoopGroup = upstream.some(parent => parent.id === pathId && parent.isLoopGroup);
    const isPartOfLoopGroup = loopGroupMemberIds.has(pathId);
    return isDirectLoopGroup || isPartOfLoopGroup;
  });

  // Only use as reference if it's NOT connected through loop groups
  return !refHasLoopGroupInPath && !refHasLoopGroupParent;
});
```

#### Alignment Application
When a valid reference is found, the equipment inherits the reference's Y coordinate:

```typescript
if (referenceEquipment) {
  const referencePos = upstreamPositions.get(referenceEquipment.id);
  if (referencePos) {
    y = referencePos.y; // Use same Y coordinate as reference equipment
    console.log(`Type-based alignment: ${eq.name} (${equipmentTypePart}) aligned to Y ${y} (reference: ${referenceEquipment.name})`);
  }
}
```

### Key Implementation Details

#### Equipment Type Extraction
Types are compared using the prefix before the colon:
- `"UPS: Uninterruptible Power Supply"` → `"UPS"`
- `"GEN: Generator"` → `"GEN"`
- `"MDS: Main Distribution Switchboard (LV SWGR)"` → `"MDS"`

#### Path Analysis Enhancement
The system now checks both:
1. **Direct Loop Group IDs**: Equipment paths containing `loop-CDS-1R-RING`
2. **Loop Group Member IDs**: Equipment paths containing individual equipment that are part of loop groups (e.g., `recV1q5a8y5SMQ8DS`)

This enhancement was critical because equipment paths typically contain individual equipment IDs rather than the generated loop group IDs.

### Code Location

**Primary Implementation**: `app/lib/tree-algorithms.ts:1424-1472`

**Critical Functions**:
- Loop group path detection (lines 1426-1432)
- Reference equipment selection (lines 1444-1462)
- Y-coordinate alignment (lines 1464-1470)

### Supported Equipment Types

The system works with all equipment types, including:
- **UPS**: Uninterruptible Power Supply
- **GEN**: Generator
- **TX/MV-TX**: Transformers
- **MDS**: Main Distribution Switchboard
- **CDS**: Critical Distribution Switchboard
- **ATS**: Automatic Transfer Switch

### Testing Results

#### Test Case: `recCqyTgDUSyrtS8M`

**Before Type-Based Alignment**:
- UPS3-01A: Y = -540, UPS3-01R: Y = -820 ❌ (280px misalignment)
- GEN3-01A: Y = -820, GEN3-01R: Y = -1100 ❌ (280px misalignment)
- TX3-01A: Y = -820, TX3-01R: Y = -1100 ❌ (280px misalignment)

**After Type-Based Alignment**:
- UPS3-01A: Y = -540, UPS3-01R: Y = -540 ✅ (Perfect alignment)
- GEN3-01A: Y = -820, GEN3-01R: Y = -820 ✅ (Perfect alignment)
- TX3-01A: Y = -820, TX3-01R: Y = -820 ✅ (Perfect alignment)

### Debugging and Troubleshooting

#### Common Issues

**Issue**: "Equipment not aligning despite being connected through loop groups"
**Cause**: Path detection logic not identifying loop group connection
**Solution**: Verify `loopGroupMemberIds` contains the relevant equipment IDs

**Check**:
```bash
# Look for type-based alignment logs
curl -s "http://localhost:3000/api/equipment-tree/EQUIPMENT_ID" 2>&1 | grep "Type-based alignment"
```

**Issue**: "Wrong reference equipment being selected"
**Cause**: Reference equipment also connected through loop groups
**Solution**: Verify reference equipment path analysis excludes loop connections

#### Validation Commands

```bash
# Check alignment for specific equipment types
curl -s "http://localhost:3000/api/equipment-tree/recCqyTgDUSyrtS8M" | jq '.nodes[] | select(.data.name | contains("UPS") or contains("GEN") or contains("TX")) | {name: .data.name, y: .position.y}'

# Verify equipment are at same Y coordinates
curl -s "http://localhost:3000/api/equipment-tree/recCqyTgDUSyrtS8M" | jq '.nodes[].position.y' | sort -n | uniq -c
```

### Integration with Existing Systems

#### Loop Group Compatibility
Type-based alignment works seamlessly with:
- Loop group detection and creation
- Zero-width span optimization
- Fallback positioning for loop groups
- Cycle detection in `computeSubtreeSpan`

#### Performance Impact
- Minimal computational overhead
- O(n²) complexity for reference equipment search (acceptable for typical tree sizes)
- No impact on caching or tree generation performance

### Critical Design Decisions

#### Why Type-Based Over Level-Based?
Level-based positioning causes misalignment because loop-connected equipment traverse longer paths, artificially inflating their tree level. Type-based alignment ensures visual consistency regardless of path complexity.

#### Why Enhanced Path Detection?
Original path detection only checked for direct loop group IDs, but equipment paths contain individual equipment IDs. Enhanced detection catches equipment whose paths contain loop group members.

#### Why Reference Equipment Exclusion?
Reference equipment must NOT be loop-connected to provide accurate "non-loop" positioning. This ensures alignment targets represent the intended visual baseline.

---

## Future Considerations

### Potential Enhancements

1. **Dynamic Spacing**: Adjust spacing based on equipment density
2. **Loop Group Styling**: Enhanced visual indicators for different loop types
3. **Compression Algorithms**: Further optimize spacing for very large trees
4. **Performance Optimization**: Cache loop group calculations

### Compatibility Notes

- This system is designed for ReactFlow-based visualizations
- Loop group detection depends on specific equipment naming patterns
- Airtable schema changes may require loop detection updates

---

## Emergency Recovery

If the loop system breaks completely:

1. **Revert to basic rendering**: Comment out loop group filtering
2. **Check cycle detection**: Ensure visited set management is correct
3. **Verify tree structure**: Use `buildPlacementTree` debugging
4. **Test with simple equipment**: Use equipment without loops first

**Critical Recovery Commands**:
```bash
# Check if basic tree generation works
curl -s "http://localhost:3000/api/equipment-tree/SIMPLE_EQUIPMENT_ID"

# Look for specific error patterns
grep -n "Maximum call stack" logs/
grep -n "Cycle detected" logs/
```

This system represents a complex balance between visual clarity, technical correctness, and performance optimization. Any modifications should be made with careful consideration of all three phases of the filtering system.
