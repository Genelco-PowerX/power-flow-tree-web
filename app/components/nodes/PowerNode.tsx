'use client';

import type { NodeProps } from 'reactflow';
import { Handle, Position } from 'reactflow';

export default function PowerNode({ data }: NodeProps) {
  return (
    <div className="w-full h-full relative">
      {/* Top handles: target and source for vertical routing */}
      <Handle type="target" position={Position.Top} id="t" />
      <Handle type="source" position={Position.Top} id="ts" />
      <div className="flex items-center justify-center w-full h-full px-3 text-center text-[11px] font-semibold whitespace-pre-line">
        {data?.label}
      </div>
      {/* Bottom handles: source and target for vertical routing */}
      <Handle type="source" position={Position.Bottom} id="b" />
      <Handle type="target" position={Position.Bottom} id="bt" />
    </div>
  );
}
