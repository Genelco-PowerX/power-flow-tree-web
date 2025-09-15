// Type definitions for Power Flow Tree application
import type { ReactNode } from 'react';

export interface EquipmentConnection {
  id: string;
  from: string[];
  to: string[];
  sourceNumber: string;
  fromName: string;
  fromType: string;
  toName: string;
  toType: string;
}

export interface Equipment {
  id: string;
  name: string;
  type: string;
  level: number;
  parentId?: string;
  sourceNumber?: string;
  sources: string[];
  parentIds: string[];
  path?: string[];
  branch?: 'S1' | 'S2';
}

export interface ProcessedEquipment extends Equipment {
  // Additional properties added during processing
  isLoopGroup?: boolean;
  loopGroupData?: {
    equipment: Equipment[];
    startEquipment?: Equipment;
    endEquipment?: Equipment;
    groupKey: string;
  };
}

export interface TreeNode {
  id: string;
  data: {
    label: string | ReactNode;
    equipment?: ProcessedEquipment;
  };
  position: {
    x: number;
    y: number;
  };
  style: Record<string, any>;
  type?: string;
}

export interface TreeEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  sourceHandle?: string;
  targetHandle?: string;
  // React Flow label support
  label?: string;
  labelStyle?: Record<string, any>;
  labelShowBg?: boolean;
  labelBgStyle?: Record<string, any>;
  labelBgPadding?: [number, number];
  labelBgBorderRadius?: number;
  style: Record<string, any>;
  data?: {
    sourceNumber?: string;
    isLoop?: boolean;
  };
}

export interface TreeData {
  nodes: TreeNode[];
  edges: TreeEdge[];
  upstream: ProcessedEquipment[];
  downstream: ProcessedEquipment[];
  selectedEquipment: ProcessedEquipment;
}

export interface ConnectionMapEntry {
  upstream: Array<{
    id: string;
    name: string;
    type: string;
    sourceNumber: string;
  }>;
  downstream: Array<{
    id: string;
    name: string;
    type: string;
    sourceNumber: string;
  }>;
}

export type ConnectionMap = Map<string, ConnectionMapEntry>;

export interface LoopGroup {
  equipment: Equipment[];
  groupKey: string;
  mostCommonParent?: string;
  sources: string[];
  startEquipment?: Equipment;
  endEquipment?: Equipment;
}
