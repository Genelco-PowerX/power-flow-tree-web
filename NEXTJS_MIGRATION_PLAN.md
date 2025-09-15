# NextJS Power Flow Tree Migration Plan

## Overview
Migrate the Airtable Power Flow Tree Extension to a standalone NextJS web application that maintains all current functionality while being publicly accessible. The app will use server-side Airtable API access to keep credentials secure.

## Project Structure Decision
Create the NextJS project as a **separate sibling directory** to preserve the existing Airtable extension:

```
/Users/jgaynor/Documents/Airtable/
├── power_tree/                    # Existing Airtable extension (preserved)
│   ├── frontend/index.js
│   ├── package.json
│   └── POWER_FLOW_TREE_IMPLEMENTATION.md
└── power-flow-tree-web/           # New NextJS project
    ├── app/
    ├── package.json
    └── README.md
```

### Benefits of Separate Directory
- ✅ **Zero risk** to existing Airtable extension
- ✅ **Independent development** and testing
- ✅ **Easy code reference** from existing implementation
- ✅ **Parallel deployment** options
- ✅ **Clean separation** of dependencies and configurations

## Questions to Address Before Starting

### 1. **Airtable Configuration & Access**
- Do you have the Airtable Base ID and Table ID for the "Equipment Connections" table?
- Do you have a Personal Access Token (PAT) with read access to this base?
- Should the NextJS app have access to ALL equipment or should we implement any filtering/permissions?

### 2. **Data Structure & Fields**
The current extension uses these key fields from the "Equipment Connections" table:
- `From` (Linked Record)
- `To` (Linked Record)
- `Source Number` (S1/S2)
- `From Equipment Name`, `From Equipment Type` (lookup fields)
- `To Equipment Name`, `To Equipment Type` (lookup fields)

Are all these fields available and named consistently in your Airtable setup?

### 3. **Deployment & Hosting**
- Where do you want to deploy this NextJS app? (Vercel, Netlify, custom server)
- Do you need a custom domain or is a subdomain acceptable?
- Any specific environment requirements?

### 4. **User Experience & Features**
- Should the public version have ALL the same features as the Airtable extension?
- Do you want user authentication or should it be completely public?
- Should equipment selection be via URL parameters (e.g., `/equipment/MDS-01R`) for direct linking?

### 5. **Performance & Caching**
- How frequently does the equipment connection data change? (determines cache strategy)
- Are you okay with 60-300 second cache delays for data updates?
- Do you need real-time updates or is periodic refresh acceptable?

## Current Extension Analysis

### **Core Features to Replicate:**
1. **Interactive ReactFlow-based tree visualization** with zoom, pan, drag
2. **Complex power flow analysis** with upstream/downstream traversal
3. **S1/S2 source tree classification** with proper coloring
4. **Loop group detection** for ring bus configurations
5. **Equipment selection interface** with type filtering and search
6. **Visibility toggles** for S1, S2, and downstream equipment
7. **Print functionality** for professional documentation
8. **Node collision prevention** and dynamic layout
9. **Advanced edge routing** with proper connection anchoring

### **Data Processing Pipeline:**
1. **Connection mapping** from Airtable records
2. **Recursive tree traversal** (10 levels deep max)
3. **Loop group detection** and merging
4. **Source tree classification** with force override logic
5. **Visual layout calculation** with collision detection
6. **ReactFlow node/edge generation**

## Phase 1: Project Setup & Infrastructure (Day 1)

### 1.1 NextJS Project Initialization (Separate Directory)

```bash
# Navigate to parent directory (from current power_tree directory)
cd /Users/jgaynor/Documents/Airtable/

# Create new NextJS project (separate from existing extension)
npx create-next-app@latest power-flow-tree-web --typescript --tailwind --eslint --app

# Navigate to new project
cd power-flow-tree-web

# Install core dependencies
npm install reactflow@11.11.4 html2canvas

# Install additional dependencies for Airtable
npm install airtable node-cache

# Install development dependencies
npm install -D @types/node-cache
```

### 1.2 Project Structure Setup

The new NextJS project will be located at:
```
/Users/jgaynor/Documents/Airtable/power-flow-tree-web/
```

With the following structure:
```
power-flow-tree-web/
├── app/
│   ├── api/
│   │   ├── equipment-connections/
│   │   │   └── route.ts
│   │   ├── equipment-tree/
│   │   │   └── [equipmentId]/
│   │   │       └── route.ts
│   │   └── equipment-list/
│   │       └── route.ts
│   ├── equipment/
│   │   └── [id]/
│   │       └── page.tsx
│   ├── components/
│   │   ├── EquipmentSelector.tsx
│   │   ├── PowerFlowTree.tsx
│   │   ├── TreeControls.tsx
│   │   └── ui/
│   ├── lib/
│   │   ├── airtable.ts
│   │   ├── tree-algorithms.ts
│   │   ├── cache.ts
│   │   └── types.ts
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── public/
├── .env.local
├── .env.example
├── next.config.js
└── package.json
```

### 1.2.1 Code Migration Strategy
- **Reference** existing `/Users/jgaynor/Documents/Airtable/power_tree/frontend/index.js` for algorithms
- **Copy and adapt** core logic to NextJS structure
- **Maintain** existing extension for production use during development
- **Test** both versions side-by-side

### 1.3 Environment Configuration

Create `.env.example`:
```env
# Airtable Configuration
AIRTABLE_API_KEY=pat_xxxxxxxxx
AIRTABLE_BASE_ID=app_xxxxxxxxx
AIRTABLE_TABLE_ID=tbl_xxxxxxxxx

# Cache Configuration
CACHE_TTL_SECONDS=300
```

Create `.env.local` with actual values.

### 1.4 NextJS Configuration

```javascript
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['airtable']
  },
  env: {
    CUSTOM_KEY: 'my-value',
  },
}

module.exports = nextConfig
```

## Phase 2: Core Data Layer (Days 2-3)

### 2.1 Airtable Client Setup

```typescript
// app/lib/airtable.ts
import Airtable from 'airtable';

const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY
}).base(process.env.AIRTABLE_BASE_ID!);

export const connectionsTable = base(process.env.AIRTABLE_TABLE_ID!);

export async function getEquipmentConnections() {
  const records = await connectionsTable.select({
    fields: [
      'From',
      'To',
      'Source Number',
      'From Equipment Name',
      'From Equipment Type',
      'To Equipment Name',
      'To Equipment Type'
    ]
  }).all();

  return records.map(record => ({
    id: record.id,
    from: record.get('From'),
    to: record.get('To'),
    sourceNumber: record.get('Source Number'),
    fromName: record.get('From Equipment Name'),
    fromType: record.get('From Equipment Type'),
    toName: record.get('To Equipment Name'),
    toType: record.get('To Equipment Type')
  }));
}
```

### 2.2 Type Definitions

```typescript
// app/lib/types.ts
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
}

export interface TreeNode {
  id: string;
  data: {
    label: React.ReactNode;
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
  style: Record<string, any>;
  data?: {
    sourceNumber?: string;
  };
}
```

### 2.3 Cache Implementation

```typescript
// app/lib/cache.ts
import NodeCache from 'node-cache';

const cache = new NodeCache({
  stdTTL: parseInt(process.env.CACHE_TTL_SECONDS || '300')
});

export function getCached<T>(key: string): T | undefined {
  return cache.get<T>(key);
}

export function setCached<T>(key: string, value: T, ttl?: number): void {
  cache.set(key, value, ttl);
}

export function deleteCached(key: string): void {
  cache.del(key);
}
```

### 2.4 Server-Side API Routes

```typescript
// app/api/equipment-connections/route.ts
import { NextResponse } from 'next/server';
import { getEquipmentConnections } from '@/app/lib/airtable';
import { getCached, setCached } from '@/app/lib/cache';

export async function GET() {
  try {
    const cached = getCached<any[]>('equipment-connections');
    if (cached) {
      return NextResponse.json(cached);
    }

    const connections = await getEquipmentConnections();
    setCached('equipment-connections', connections);

    return NextResponse.json(connections);
  } catch (error) {
    console.error('Error fetching equipment connections:', error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}
```

```typescript
// app/api/equipment-tree/[equipmentId]/route.ts
import { NextResponse } from 'next/server';
import { generatePowerFlowTree } from '@/app/lib/tree-algorithms';
import { getCached, setCached } from '@/app/lib/cache';

export async function GET(
  request: Request,
  { params }: { params: { equipmentId: string } }
) {
  try {
    const { equipmentId } = params;
    const cacheKey = `tree-${equipmentId}`;

    const cached = getCached(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const treeData = await generatePowerFlowTree(equipmentId);
    setCached(cacheKey, treeData);

    return NextResponse.json(treeData);
  } catch (error) {
    console.error('Error generating tree:', error);
    return NextResponse.json({ error: 'Failed to generate tree' }, { status: 500 });
  }
}
```

## Phase 3: Data Processing Engine (Day 3)

### 3.1 Tree Algorithms Port

```typescript
// app/lib/tree-algorithms.ts
import { EquipmentConnection, Equipment, TreeNode, TreeEdge } from './types';

export async function generatePowerFlowTree(selectedEquipmentId: string) {
  // Fetch connections from API
  const response = await fetch('/api/equipment-connections');
  const connections: EquipmentConnection[] = await response.json();

  // Build connection map
  const connectionMap = buildConnectionMap(connections);

  // Traverse upstream and downstream
  const upstream = traverseUpstream(selectedEquipmentId, connectionMap);
  const downstream = traverseDownstream(selectedEquipmentId, connectionMap);

  // Process equipment and detect loops
  const processedUpstream = processEquipmentForVisualization(upstream);
  const processedDownstream = processEquipmentForVisualization(downstream);

  // Generate nodes and edges for ReactFlow
  const { nodes, edges } = generateNodesAndEdges(
    selectedEquipmentId,
    processedUpstream,
    processedDownstream,
    connectionMap
  );

  return {
    nodes,
    edges,
    upstream: processedUpstream,
    downstream: processedDownstream
  };
}

function buildConnectionMap(connections: EquipmentConnection[]) {
  const connectionMap = new Map();

  connections.forEach(connection => {
    // Port the existing connection mapping logic
    // Handle both upstream and downstream relationships
  });

  return connectionMap;
}

function traverseUpstream(equipmentId: string, connectionMap: Map<string, any>, visited = new Set(), level = 1, path = []) {
  // Port the recursive upstream traversal logic
  // Include cycle detection and depth limiting
}

function traverseDownstream(equipmentId: string, connectionMap: Map<string, any>, visited = new Set(), level = 1, path = []) {
  // Port the recursive downstream traversal logic
}

function processEquipmentForVisualization(equipment: Equipment[]) {
  // Port loop group detection
  // Port equipment deduplication
  // Port multi-source handling
}

function generateNodesAndEdges(selectedId: string, upstream: Equipment[], downstream: Equipment[], connectionMap: Map<string, any>) {
  // Port the node positioning logic
  // Port the edge creation logic
  // Port the collision detection
  // Port the source tree classification
}
```

## Phase 4: Core UI Components (Days 4-6)

### 4.1 Equipment Selection Interface

```typescript
// app/components/EquipmentSelector.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Equipment } from '@/app/lib/types';

interface EquipmentSelectorProps {
  selectedEquipmentId: string | null;
  onEquipmentSelect: (equipmentId: string) => void;
}

export function EquipmentSelector({ selectedEquipmentId, onEquipmentSelect }: EquipmentSelectorProps) {
  const [filterType, setFilterType] = useState('');
  const [searchText, setSearchText] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [equipment, setEquipment] = useState<Equipment[]>([]);

  // Port the equipment selection logic
  // Port the filtering and search functionality
  // Port the dropdown behavior

  return (
    <div className="equipment-selector">
      {/* Port the UI from the Airtable extension */}
    </div>
  );
}
```

### 4.2 ReactFlow Tree Component

```typescript
// app/components/PowerFlowTree.tsx
'use client';

import { useCallback, useMemo } from 'react';
import ReactFlow, {
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  Controls,
  MiniMap,
  Background,
  ConnectionMode,
} from 'reactflow';
import 'reactflow/dist/style.css';

interface PowerFlowTreeProps {
  selectedEquipmentId: string;
  treeData: {
    nodes: Node[];
    edges: Edge[];
    upstream: any[];
    downstream: any[];
  };
}

export function PowerFlowTree({ selectedEquipmentId, treeData }: PowerFlowTreeProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(treeData.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(treeData.edges);

  // Port all the ReactFlow configuration
  // Port custom node components
  // Port custom edge components
  // Port interaction handlers

  return (
    <div className="w-full h-screen">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        connectionMode={ConnectionMode.Loose}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}
```

### 4.3 Main Page Component

```typescript
// app/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { EquipmentSelector } from './components/EquipmentSelector';
import { PowerFlowTree } from './components/PowerFlowTree';
import { TreeControls } from './components/TreeControls';

export default function Home() {
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(null);
  const [treeData, setTreeData] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleEquipmentSelect = async (equipmentId: string) => {
    setLoading(true);
    setSelectedEquipmentId(equipmentId);

    try {
      const response = await fetch(`/api/equipment-tree/${equipmentId}`);
      const data = await response.json();
      setTreeData(data);
    } catch (error) {
      console.error('Error loading tree data:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900">
            Power Flow Tree Analysis
          </h1>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row h-[calc(100vh-80px)]">
        <div className="lg:w-80 bg-white border-r">
          <EquipmentSelector
            selectedEquipmentId={selectedEquipmentId}
            onEquipmentSelect={handleEquipmentSelect}
          />
          <TreeControls />
        </div>

        <div className="flex-1">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <div className="text-lg">Loading tree...</div>
            </div>
          )}

          {treeData && !loading && (
            <PowerFlowTree
              selectedEquipmentId={selectedEquipmentId!}
              treeData={treeData}
            />
          )}

          {!selectedEquipmentId && !loading && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">
                  Select Equipment to View Power Flow
                </h2>
                <p className="text-gray-600">
                  Choose equipment from the sidebar to see its power distribution tree
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

## Phase 5: Advanced Features (Days 7-9)

### 5.1 S1/S2 Classification System
- Port the complete source tree logic
- Implement force override for loop groups
- Add tree-based filtering algorithms
- Create visibility toggle controls
- Port color consistency system

### 5.2 Loop Group Management
- Port loop detection patterns (CDS-01R, ATS)
- Implement loop group merging logic
- Add descriptive naming system
- Create parent connection logic
- Port visual loop indicators

### 5.3 Advanced UI Features
- Port collapsible interface sections
- Implement Shadcn-style design system
- Add print functionality with custom layouts
- Create professional export features
- Port navigation and interaction controls

## Phase 6: URL-Based Navigation (Day 8)

### 6.1 Dynamic Routes

```typescript
// app/equipment/[id]/page.tsx
import { PowerFlowTreePage } from '@/app/components/PowerFlowTreePage';

interface Props {
  params: { id: string };
}

export default function EquipmentPage({ params }: Props) {
  return <PowerFlowTreePage selectedEquipmentId={params.id} />;
}

export async function generateStaticParams() {
  // Optionally pre-generate paths for common equipment
  return [];
}
```

### 6.2 SEO and Metadata

```typescript
// app/equipment/[id]/page.tsx
import { Metadata } from 'next';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  // Fetch equipment name for title
  return {
    title: `Power Flow Tree - ${params.id}`,
    description: 'Interactive power flow tree visualization showing electrical distribution hierarchy',
  };
}
```

## Phase 7: Performance & Polish (Days 10-11)

### 7.1 Performance Optimization
- Implement lazy loading for large datasets
- Add virtualization for massive trees
- Optimize ReactFlow rendering
- Add loading states and skeleton UI
- Implement error boundaries

### 7.2 Professional Features
- Enhanced print layouts with branding
- Export to PNG/SVG functionality
- Professional documentation generation
- Advanced filtering and search
- Equipment detail overlays

## Phase 8: Testing & Deployment (Day 12)

### 8.1 Testing Strategy
```bash
# Install testing dependencies
npm install -D jest @testing-library/react @testing-library/jest-dom

# Create test files
mkdir __tests__
touch __tests__/tree-algorithms.test.ts
touch __tests__/components.test.tsx
```

### 8.2 Deployment to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard
vercel env add AIRTABLE_API_KEY
vercel env add AIRTABLE_BASE_ID
vercel env add AIRTABLE_TABLE_ID
```

## Technical Architecture

### Frontend Stack
- **NextJS 14** with App Router
- **TypeScript** for type safety
- **ReactFlow 11** for tree visualization
- **Tailwind CSS** for styling
- **Shadcn/ui** components for modern UI

### Backend/API
- **NextJS API Routes** for Airtable integration
- **Airtable REST API** with PAT authentication
- **Server-side caching** (node-cache)
- **Rate limiting** and error handling

### Data Flow
```
Airtable → NextJS API Routes → Data Processing → Cache → Frontend
```

### Security
- PAT stored server-side only
- API routes with input validation
- Rate limiting and abuse prevention
- No sensitive data in browser

## Success Criteria
- ✅ All current Airtable extension features replicated
- ✅ Public accessibility without Airtable login
- ✅ Secure API integration with no exposed credentials
- ✅ Professional UI/UX matching current quality
- ✅ Performance suitable for production use
- ✅ Mobile-responsive design
- ✅ URL-based equipment sharing
- ✅ Professional print/export capabilities

## Estimated Timeline
- **Total**: 12 days
- **Setup & Infrastructure**: 1 day
- **Data Layer**: 2 days
- **Core UI**: 3 days
- **Advanced Features**: 3 days
- **Polish & Performance**: 2 days
- **Testing & Deployment**: 1 day

## Next Steps
1. Confirm Airtable credentials and access
2. Navigate to `/Users/jgaynor/Documents/Airtable/` directory
3. Create separate NextJS project: `npx create-next-app@latest power-flow-tree-web --typescript --tailwind --eslint --app`
4. Install dependencies and set up environment
5. Test Airtable API connectivity
6. Begin porting algorithms from existing `/power_tree/frontend/index.js`

## File Path References for Development

### Source Code (Existing Extension)
- **Main Logic**: `/Users/jgaynor/Documents/Airtable/power_tree/frontend/index.js`
- **Documentation**: `/Users/jgaynor/Documents/Airtable/power_tree/POWER_FLOW_TREE_IMPLEMENTATION.md`
- **Package Info**: `/Users/jgaynor/Documents/Airtable/power_tree/package.json`

### Target Code (New NextJS Project)
- **Project Root**: `/Users/jgaynor/Documents/Airtable/power-flow-tree-web/`
- **All new development** happens in this separate directory
- **Zero impact** on existing Airtable extension