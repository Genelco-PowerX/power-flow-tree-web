# Equipment Spacing Optimization – Updated Summary

## Why the Plan Changed
The earlier summary still referenced global S1/S2 zones and a `branchSeparation` constant. Implementing that guidance produced the drift visible in the screenshots: S2 stacks sliding to the right and MDS3-01R drawn a level higher than MDS3-01C. The corrected approach treats each branching decision locally and anchors every level to a canonical baseline so peers stay aligned.

## Current Pain Points (from latest render)
- **MDS alignment**: MDS3-01C and MDS3-01R should be co-planar but render on different Y levels.
- **Branch creep**: S2 children migrate across unrelated branches, stretching the diagram horizontally.
- **Utility offsets**: Utility nodes at the same level are staggered vertically, confusing the storyline of the electrical path.
- **Loop clutter**: UPS loops pull parents off center and introduce diagonal edges.
- **Missing upstream paths**: Lateral branches (UPS) were removed from traversal, causing whole upstream paths to disappear when a UPS sat between the selected node and its sources.
- **Lateral misalignment**: UPS nodes drift vertically away from their parent MDS baselines, contradicting the plan.

## Refined Solution Architecture

### 1. Baseline-Driven Vertical Placement
- Build a `levelBaselines` map using `centerY - levelSpacing * (levelOffset)`.
- Enforce the baseline whenever writing node positions; type alignment is automatic because type+level pairs share the same baseline.

### 2. Subtree Width Reservation & Symmetric Branching
- Compute `SubtreeDimensions` for every node via post-order traversal.
- Use the span data to keep parents centered while distributing S1 nodes to the left and S2 nodes to the right within their reserved width.
- Single-child chains stay vertical, eliminating the “staircase” effect.

### 3. Lateral Loop Strategy
- Mark UPS↔MDS pairs as lateral.
- Place them after the main recursion at the same baseline as the parent, offset horizontally by `lateralUpsOffset`.
- Continue traversing lateral branches so their upstream ancestors are still rendered; lateral status affects positioning only, not filtering.

### 4. Collision Safety Net
- Run a shallow multi-pass collision check to nudge any residual overlaps horizontally while keeping the baseline intact.

## Implementation Roadmap (Revised)
1. **Foundations**
   - Update spacing constants (`minimumNodeSpacing = 160`, `levelSpacing = 280`).
   - Extend types with `SubtreeDimensions`, `PlacementTree`, and `PlacementNode`.
2. **Classification & Tree Assembly**
   - Flag lateral UPS equipment.
   - Build the upstream placement tree rooted at the selected equipment after calling `ensureCompleteUpstreamCoverage` so redundant feeders remain in the dataset.
3. **Span + Baseline Calculation**
   - Generate `levelBaselines` for all levels in the upstream set.
   - Compute subtree spans to understand horizontal requirements.
4. **Position Assignment**
   - Recursively place nodes using the span data to keep branches balanced.
   - Drop single-child branches straight above their parents.
5. **Lateral & Collision Handling**
   - Place UPS loops beside their parent after the main recursion, forcing their Y to the parent baseline.
   - Run collision detection/resolution as a guard.
6. **Validation & Visual QA**
   - Verify all equipment of the same level/type shares a baseline.
   - Confirm branches expand evenly in both directions around the selected equipment.
   - Capture screenshots for MDS3-01C / MDS3-01R selection to validate alignment.

## Success Metrics
- MDS, TX, GEN, and Utility peers land on exactly the same Y coordinate (tolerance < 1px).
- S2 branches stay within their parent’s reserved width; no branch leaps across the diagram.
- UPS loops sit laterally, producing clean parallel edges.
- Collision pass reports zero adjustments in typical datasets after the first iteration.

## Next Steps
1. Update `EQUIPMENT_SPACING_PLAN.md`, `LAYOUT_ALGORITHM_IMPLEMENTATION.md`, and this file (done in this pass).
2. Implement the span-based layout in `tree-algorithms.ts` following the implementation guide.
3. Re-render the problematic selections and verify alignment improvements before shipping.

This summary now reflects the corrected plan and should be treated as the authoritative reference while refactoring the layout logic.
