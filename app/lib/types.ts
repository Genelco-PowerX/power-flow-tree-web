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
  connectionType?: 'normal' | 'bypass' | 'redundant';
  alternateParents?: Array<{
    id: string;
    sourceNumber: string;
    connectionType: 'normal' | 'bypass' | 'redundant';
  }>;
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
    name?: string;
    type?: string;
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
    connectionType?: 'normal' | 'bypass' | 'redundant';
    isAlternate?: boolean;
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
    connectionType?: 'normal' | 'bypass' | 'redundant';
  }>;
  downstream: Array<{
    id: string;
    name: string;
    type: string;
    sourceNumber: string;
    connectionType?: 'normal' | 'bypass' | 'redundant';
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

export interface EquipmentLayoutInfo {
  equipment: ProcessedEquipment;
  branch: 'S1' | 'S2';
  typeCategory: string;
  level: number;
  isLateral: boolean;
  parentId?: string;
  lateralInfo?: {
    parentId: string;
    direction: 'left' | 'right';
    offset: number;
  };
}

export interface Position {
  x: number;
  y: number;
}

export interface CollisionInfo {
  node1: string;
  node2: string;
  overlap: { horizontal: number; vertical: number };
}

export interface SubtreeDimensions {
  width: number;
  leftBias: number;
  rightBias: number;
}

export interface PlacementNode {
  id: string;
  parentId?: string;
  info: EquipmentLayoutInfo;
  children: {
    s1: string[];
    s2: string[];
    laterals: string[];
  };
}

export interface PlacementTree {
  nodes: Map<string, PlacementNode>;
  root: string;
  rootId: string;
}

export interface LayoutValidationResult {
  isValid: boolean;
  issues: string[];
  totalNodes: number;
  validationTimestamp: string;
}
