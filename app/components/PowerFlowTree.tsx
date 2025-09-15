'use client';

import { useCallback, useMemo, useRef } from 'react';
import ReactFlow, {
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  Controls,
  MiniMap,
  Background,
  ConnectionMode,
  BackgroundVariant,
  type ReactFlowInstance,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { TreeData } from '@/lib/types';
import PowerNode from '@/components/nodes/PowerNode';

interface PowerFlowTreeProps {
  treeData: TreeData;
  showS1Upstream: boolean;
  showS2Upstream: boolean;
  showDownstream: boolean;
}

export default function PowerFlowTree({
  treeData,
  showS1Upstream,
  showS2Upstream,
  showDownstream
}: PowerFlowTreeProps) {

  // Filter nodes and edges based on visibility settings
  const { visibleNodes, visibleEdges } = useMemo(() => {
    const visibleNodeIds = new Set<string>();

    // Always show selected equipment
    visibleNodeIds.add(treeData.selectedEquipment.id);

    // Filter upstream equipment by branch (bifurcation from the first hop)
    treeData.upstream.forEach(eq => {
      const branch = (eq as any).branch || 'S1';
      if (
        (branch === 'S1' && showS1Upstream) ||
        (branch === 'S2' && showS2Upstream)
      ) {
        visibleNodeIds.add(eq.id);
      }
    });

    // Filter downstream equipment
    if (showDownstream) {
      treeData.downstream.forEach(eq => {
        visibleNodeIds.add(eq.id);
      });
    }

    // Filter nodes
    const filteredNodes = treeData.nodes.filter(node =>
      visibleNodeIds.has(node.id)
    );

    // Filter edges (only show edges between visible nodes)
    const filteredEdges = treeData.edges.filter(edge =>
      visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
    );

    return {
      visibleNodes: filteredNodes,
      visibleEdges: filteredEdges
    };
  }, [treeData, showS1Upstream, showS2Upstream, showDownstream]);

  const [nodes, setNodes, onNodesChange] = useNodesState(visibleNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(visibleEdges);

  const nodeTypes = useMemo(() => ({ powerNode: PowerNode }), []);

  const rfInstance = useRef<ReactFlowInstance | null>(null);
  const didInitialFit = useRef(false);

  // Update nodes and edges when visibility changes
  useMemo(() => {
    setNodes(visibleNodes);
    setEdges(visibleEdges);
  }, [visibleNodes, visibleEdges, setNodes, setEdges]);

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    console.log('Node clicked:', node);
    // Future: Could implement node selection/highlighting
  }, []);

  const onDoubleClick = useCallback(() => {
    // Fit view on double click
    const reactFlowInstance = document.querySelector('.react-flow');
    if (reactFlowInstance) {
      // Trigger fit view - this is a basic implementation
      // In a real implementation, you'd use the ReactFlow instance methods
      console.log('Double click - fit view');
    }
  }, []);

  return (
    <div className="w-full h-full" onDoubleClick={onDoubleClick}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.12, maxZoom: 1.2 }}
        minZoom={0.05}
        maxZoom={3}
        attributionPosition="bottom-left"
        onInit={(instance) => {
          rfInstance.current = instance;
          if (!didInitialFit.current) {
            requestAnimationFrame(() => {
              instance.fitView({ padding: 0.12, maxZoom: 1.2, duration: 300 });
              didInitialFit.current = true;
            });
          }
        }}
        nodeTypes={nodeTypes}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#e5e7eb"
        />

        <Controls
          showZoom={true}
          showFitView={true}
          showInteractive={true}
          position="bottom-left"
        />

        <MiniMap
          nodeColor={(node) => {
            // Color nodes in minimap based on their type
            if (node.id === treeData.selectedEquipment.id) return '#b8ff2b';

            // Check if it's upstream or downstream
            const isUpstream = treeData.upstream.some(eq => eq.id === node.id);
            if (isUpstream) {
              const equipment = treeData.upstream.find(eq => eq.id === node.id);
              const branch = (equipment as any)?.branch || 'S1';
              return branch === 'S2' ? '#2b81e5' : '#1259ad';
            }

            return '#e77b16'; // downstream
          }}
          nodeStrokeWidth={2}
          position="bottom-right"
          pannable={true}
          zoomable={true}
          style={{
            backgroundColor: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: '8px'
          }}
        />
      </ReactFlow>

      {/* Node Count Info */}
      <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm rounded-lg shadow-sm border px-3 py-2 text-sm text-gray-600">
        <div>Showing {visibleNodes.length} of {treeData.nodes.length} nodes</div>
      </div>

      {/* Loading Overlay (if needed) */}
      {visibleNodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50/80">
          <div className="text-center">
            <div className="text-gray-500 text-lg mb-2">No equipment visible</div>
            <p className="text-gray-400 text-sm">
              Try enabling visibility toggles in the sidebar
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
