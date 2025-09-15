# Power Flow Tree Web Application

A public web version of the Power Flow Tree visualization, migrated from the Airtable extension. This application provides interactive electrical power distribution tree visualization accessible via web browser.

## Features

- **Interactive Tree Visualization**: ReactFlow-based power flow trees with zoom, pan, and drag functionality
- **S1/S2 Source Classification**: Automatic classification and color-coding of primary and secondary power sources
- **Loop Group Detection**: Automatic detection and grouping of ring bus configurations
- **Equipment Selection**: Searchable equipment selector with type filtering
- **Visibility Controls**: Toggle visibility of S1, S2, and downstream equipment
- **Professional Print**: Print-optimized layouts for documentation
- **Real-time Data**: Server-side Airtable integration with caching
- **Responsive Design**: Works on desktop and mobile devices

## Architecture

### Frontend
- **Next.js 14** with App Router
- **TypeScript** for type safety
- **ReactFlow 11** for tree visualization
- **Tailwind CSS** for styling

### Backend
- **Next.js API Routes** for server-side Airtable access
- **Airtable REST API** with Personal Access Token authentication
- **Node-cache** for request caching (5-minute TTL)
- **Server-side only** credential handling

### Data Flow
```
Airtable → NextJS API Routes → Cache → Frontend Components → ReactFlow
```

## Setup

### 1. Environment Configuration

Copy `.env.example` to `.env.local` and fill in your Airtable credentials:

```env
AIRTABLE_API_KEY=pat_xxxxxxxxx
AIRTABLE_BASE_ID=app_xxxxxxxxx
AIRTABLE_TABLE_ID=tbl_xxxxxxxxx
CACHE_TTL_SECONDS=300
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Build for Production

```bash
npm run build
npm start
```

## API Endpoints

- **GET /api/equipment-connections**: Fetch all equipment connections from Airtable
- **GET /api/equipment-list**: Get list of all available equipment
- **GET /api/equipment-tree/[id]**: Generate power flow tree for specific equipment

All endpoints include caching and error handling.

## Airtable Requirements

### Required Table: Equipment Connections

The application expects an "Equipment Connections" table with these fields:

- `From` (Linked Record): Equipment providing power
- `To` (Linked Record): Equipment receiving power
- `Source Number` (Text): S1 (primary) or S2 (secondary/backup)

### Lookup Fields (from linked Equipment records):
- `From Equipment Name`: Name of source equipment
- `From Equipment Type`: Type of source equipment
- `To Equipment Name`: Name of destination equipment
- `To Equipment Type`: Type of destination equipment

### Field Name Flexibility

The system handles multiple field name variations:
- **Names**: `From Equipment Name`, `From Name`, `Source Equipment Name`
- **Types**: `From Equipment Type`, `From Type`, `Source Equipment Type`

## Color Scheme

- **S1 Source Trees**: Blue (#1259ad)
- **S2 Source Trees**: Bright Blue (#2b81e5)
- **Downstream Equipment**: Orange (#e77b16)
- **Selected Equipment**: Bright Green (#b8ff2b)

## Deployment

### Vercel (Recommended)

1. Push code to GitHub repository
2. Connect repository to Vercel
3. Set environment variables in Vercel dashboard
4. Deploy automatically

### Manual Deployment

1. Build the application: `npm run build`
2. Deploy the `.next` folder and dependencies
3. Set environment variables on your hosting platform
4. Start with: `npm start`

## Security

- **Server-side only** Airtable API access
- **Personal Access Token** authentication
- **No credentials** exposed to browser
- **Input validation** on all API routes
- **Rate limiting** protection

## Development

### Project Structure

```
app/
├── api/                    # Server-side API routes
│   ├── equipment-connections/
│   ├── equipment-list/
│   └── equipment-tree/[id]/
├── components/             # React components
│   ├── PowerFlowTree.tsx
│   └── TreeControls.tsx
├── equipment/              # Equipment pages
│   ├── page.tsx           # Equipment selector
│   └── [id]/page.tsx      # Individual equipment tree
├── lib/                   # Utilities and algorithms
│   ├── airtable.ts        # Airtable client
│   ├── tree-algorithms.ts # Core tree logic
│   ├── cache.ts           # Caching utilities
│   └── types.ts           # TypeScript definitions
├── globals.css            # Global styles
├── layout.tsx             # Root layout
└── page.tsx               # Home page
```

### Key Files

- **`tree-algorithms.ts`**: Core power flow analysis logic ported from Airtable extension
- **`airtable.ts`**: Secure server-side Airtable integration
- **`PowerFlowTree.tsx`**: Main ReactFlow visualization component
- **`TreeControls.tsx`**: Visibility toggles and navigation controls

## Troubleshooting

### Common Issues

1. **"Missing Airtable credentials"**: Check `.env.local` file has correct values
2. **"Equipment not found"**: Verify equipment ID exists in Airtable connections
3. **"Failed to fetch connections"**: Check Airtable API key permissions and table access
4. **Empty tree**: Ensure equipment has connections in the Airtable table

### Debug Features

- Console logging for data processing
- API response caching indicators
- Node/edge count displays
- Error boundaries with detailed messages

## Migration from Airtable Extension

This web application maintains full feature parity with the original Airtable extension:

- ✅ All power flow analysis algorithms
- ✅ S1/S2 classification logic
- ✅ Loop group detection
- ✅ Visual layout and positioning
- ✅ Interactive controls and navigation
- ✅ Professional styling and colors

## License

Private project - All rights reserved.