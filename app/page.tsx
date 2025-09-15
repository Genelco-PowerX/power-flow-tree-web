'use client';

import Link from 'next/link';
import { Zap, ArrowRight, Eye, Printer, Search, Network } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Site header rendered globally in layout */}

      {/* Main Content */}
      <main className="flex-1">
        <div className="container space-y-8 py-6 px-4 md:py-12 lg:py-16">
          {/* Hero Section */}
          <div className="mx-auto flex max-w-[980px] flex-col items-center space-y-4 text-center">
            <Badge variant="secondary">
              Professional Power Distribution Analysis
            </Badge>
            <h1 className="text-3xl font-bold leading-tight tracking-tighter md:text-5xl lg:text-6xl lg:leading-[1.1]">
              Visualize Electrical Power Flow
            </h1>
            <p className="max-w-[750px] text-lg text-muted-foreground sm:text-xl">
              Comprehensive power flow analysis with S1/S2 classification, loop detection,
              and interactive tree visualization for electrical distribution systems.
            </p>
            <div className="flex flex-col gap-4 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/equipment">
                  <Search className="mr-2 h-4 w-4" />
                  Browse Equipment
                </Link>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link href="/equipment/recV1q5a8y5SMQ8DS">
                  <Eye className="mr-2 h-4 w-4" />
                  View Example
                </Link>
              </Button>
            </div>
          </div>

          {/* Features Grid */}
          <div className="mx-auto grid justify-center gap-4 sm:grid-cols-2 lg:grid-cols-3 md:max-w-[64rem]">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Network className="h-4 w-4 text-blue-600" />
                Interactive Visualization
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                ReactFlow-based tree visualization with zoom, pan, and drag functionality.
                Professional node layouts with collision detection.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm bg-[#1259ad]"></div>
                S1/S2 Classification
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Automatic classification of primary (S1) and secondary (S2) power sources
                with color-coded visualization and source tree analysis.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm bg-[#2b81e5] border-dashed border-2 border-[#ff6b6b]"></div>
                Loop Detection
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Advanced algorithm detects and groups ring bus configurations.
                Automatic loop merging with descriptive naming for complex topologies.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Search className="h-4 w-4 text-green-600" />
                Smart Equipment Search
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Powerful search and filtering capabilities with equipment type grouping
                and real-time results for thousands of components.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="h-4 w-4 text-purple-600" />
                Visibility Controls
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Toggle visibility of S1, S2, and downstream equipment independently.
                Focus on specific power paths for detailed analysis.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Printer className="h-4 w-4 text-orange-600" />
                Professional Output
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Print-optimized layouts and PNG export functionality.
                Professional documentation ready for technical reports.
              </p>
            </CardContent>
          </Card>
        </div>

          {/* Process Flow */}
          <div className="mx-auto max-w-[58rem]">
            <Card>
              <CardHeader className="text-center">
                <CardTitle>How It Works</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <div className="text-center">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <Search className="h-6 w-6 text-blue-600" />
                </div>
                <h3 className="font-medium mb-2">1. Select Equipment</h3>
                <p className="text-sm text-muted-foreground">
                  Choose from comprehensive equipment database with advanced filtering
                </p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <Network className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="font-medium mb-2">2. Generate Tree</h3>
                <p className="text-sm text-muted-foreground">
                  Automatic power flow analysis with upstream and downstream traversal
                </p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <Eye className="h-6 w-6 text-purple-600" />
                </div>
                <h3 className="font-medium mb-2">3. Analyze & Control</h3>
                <p className="text-sm text-muted-foreground">
                  Interactive controls for visibility, source classification, and navigation
                </p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <Printer className="h-6 w-6 text-orange-600" />
                </div>
                <h3 className="font-medium mb-2">4. Export Results</h3>
                <p className="text-sm text-muted-foreground">
                  Professional print layouts and PNG export for documentation
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
            </div>

          {/* Color Legend */}
          <div className="mx-auto max-w-[58rem]">
            <Card>
              <CardHeader className="text-center">
                <CardTitle>Color Legend & Classification</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 bg-[#b8ff2b] border rounded-sm"></div>
                <div>
                  <div className="font-medium">Selected Equipment</div>
                  <div className="text-xs text-muted-foreground">Currently viewing</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 bg-[#1259ad] rounded-sm"></div>
                <div>
                  <div className="font-medium">S1 Source Tree</div>
                  <div className="text-xs text-muted-foreground">Primary power</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 bg-[#2b81e5] rounded-sm"></div>
                <div>
                  <div className="font-medium">S2 Source Tree</div>
                  <div className="text-xs text-muted-foreground">Secondary/backup</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 bg-[#e77b16] rounded-sm"></div>
                <div>
                  <div className="font-medium">Downstream Equipment</div>
                  <div className="text-xs text-muted-foreground">Fed equipment</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 bg-[#2b81e5] border-dashed border-2 border-[#ff6b6b] rounded-sm"></div>
                <div>
                  <div className="font-medium">Ring Bus / Loop</div>
                  <div className="text-xs text-muted-foreground">Interconnected systems</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
