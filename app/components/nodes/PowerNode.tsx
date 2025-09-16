'use client';

import type { NodeProps } from 'reactflow';
import { Handle, Position } from 'reactflow';

export default function PowerNode({ data }: NodeProps) {
  const handleStyle = {
    opacity: 0,
    pointerEvents: 'none' as const,
    width: 1,
    height: 1
  };

  return (
    <div className="w-full h-full relative">
      {/* Top handles: target and source for vertical routing */}
      <Handle type="target" position={Position.Top} id="t" style={handleStyle} />
      <Handle type="source" position={Position.Top} id="ts" style={handleStyle} />

      {/* Left handles: for bidirectional connections */}
      <Handle type="target" position={Position.Left} id="tl" style={{ ...handleStyle, top: '25%' }} />
      <Handle type="source" position={Position.Left} id="sl" style={{ ...handleStyle, top: '75%' }} />

      <div className="flex items-center justify-center w-full h-full px-3 text-center text-[11px] font-semibold whitespace-pre-line">
        {data?.label}
      </div>

      {/* Right handles: for bidirectional connections */}
      <Handle type="target" position={Position.Right} id="tr" style={handleStyle} />
      <Handle type="source" position={Position.Right} id="sr" style={handleStyle} />

      {/* Bottom handles: source and target for vertical routing */}
      <Handle type="source" position={Position.Bottom} id="b" style={{ ...handleStyle, left: '50%' }} />
      <Handle type="target" position={Position.Bottom} id="bt" style={{ ...handleStyle, left: '50%' }} />
      <Handle type="source" position={Position.Bottom} id="bl" style={{ ...handleStyle, left: '25%' }} />
      <Handle type="target" position={Position.Bottom} id="br" style={{ ...handleStyle, left: '75%' }} />
    </div>
  );
}
