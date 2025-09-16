'use client';

import type { NodeProps } from 'reactflow';
import { Handle, Position } from 'reactflow';

export default function PowerNode({ data }: NodeProps) {
  return (
    <div className="w-full h-full relative">
      {/* Top handles: target and source for vertical routing */}
      <Handle type="target" position={Position.Top} id="t" />
      <Handle type="source" position={Position.Top} id="ts" />

      {/* Left handles: for bidirectional connections */}
      <Handle type="target" position={Position.Left} id="tl" />
      <Handle type="source" position={Position.Left} id="sl" />

      <div className="flex items-center justify-center w-full h-full px-3 text-center text-[11px] font-semibold whitespace-pre-line">
        {data?.label}
      </div>

      {/* Right handles: for bidirectional connections */}
      <Handle type="target" position={Position.Right} id="tr" />
      <Handle type="source" position={Position.Right} id="sr" />

      {/* Bottom handles: source and target for vertical routing */}
      <Handle type="source" position={Position.Bottom} id="b" />
      <Handle type="target" position={Position.Bottom} id="bt" />
      <Handle type="source" position={Position.Bottom} id="bl" />
      <Handle type="target" position={Position.Bottom} id="br" />
    </div>
  );
}
