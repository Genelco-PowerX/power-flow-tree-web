'use client';

import { useState } from 'react';
import { Settings, Eye, EyeOff, Printer, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

interface TreeControlsProps {
  showS1Upstream: boolean;
  setShowS1Upstream: (show: boolean) => void;
  showS2Upstream: boolean;
  setShowS2Upstream: (show: boolean) => void;
  showDownstream: boolean;
  setShowDownstream: (show: boolean) => void;
  treeData?: {
    upstream: any[];
    downstream: any[];
  };
  onPrint?: () => void;
  onExport?: () => void;
}

export default function TreeControls({
  showS1Upstream,
  setShowS1Upstream,
  showS2Upstream,
  setShowS2Upstream,
  showDownstream,
  setShowDownstream,
  treeData,
  onPrint,
  onExport
}: TreeControlsProps) {
  // Collapsible state
  const [isExpanded, setIsExpanded] = useState(false);
  const [showLegend, setShowLegend] = useState(false);

  // Count equipment by source type
  const s1Count = treeData?.upstream.filter(eq => (eq as any).branch === 'S1').length || 0;
  const s2Count = treeData?.upstream.filter(eq => (eq as any).branch === 'S2').length || 0;

  const downstreamCount = treeData?.downstream.length || 0;

  const renderControlsContent = () => (
    <>
      {/* Visibility Controls */}
      <div className="space-y-3">
        {/* S1 Upstream */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-[#1259ad]"></div>
            <div className="flex flex-col">
              <Label htmlFor="s1-toggle" className="text-sm font-medium cursor-pointer">
                S1 Upstream
              </Label>
              <div className="hidden md:block text-xs text-muted-foreground">
                Primary power source
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {s1Count}
            </Badge>
            <Switch
              id="s1-toggle"
              checked={showS1Upstream}
              onCheckedChange={setShowS1Upstream}
            />
          </div>
        </div>

        {/* S2 Upstream */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-[#2b81e5]"></div>
            <div className="flex flex-col">
              <Label htmlFor="s2-toggle" className="text-sm font-medium cursor-pointer">
                S2 Upstream
              </Label>
              <div className="hidden md:block text-xs text-muted-foreground">
                Secondary/backup power
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {s2Count}
            </Badge>
            <Switch
              id="s2-toggle"
              checked={showS2Upstream}
              onCheckedChange={setShowS2Upstream}
            />
          </div>
        </div>

        {/* Downstream */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-[#e77b16]"></div>
            <div className="flex flex-col">
              <Label htmlFor="downstream-toggle" className="text-sm font-medium cursor-pointer">
                Downstream
              </Label>
              <div className="hidden md:block text-xs text-muted-foreground">
                Fed equipment
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {downstreamCount}
            </Badge>
            <Switch
              id="downstream-toggle"
              checked={showDownstream}
              onCheckedChange={setShowDownstream}
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Action Controls */}
      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">
          ACTIONS
        </Label>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onPrint}
            className="flex-1 text-xs"
          >
            <Printer className="h-3 w-3 mr-1" />
            Print
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onExport}
            className="flex-1 text-xs"
          >
            <Download className="h-3 w-3 mr-1" />
            Export
          </Button>
        </div>
      </div>

      <Separator />

      {/* Legend */}
      <div className="space-y-2">
        <button
          onClick={() => setShowLegend(!showLegend)}
          className="flex items-center justify-between w-full text-left"
        >
          <Label className="text-xs font-medium text-muted-foreground cursor-pointer">
            LEGEND
          </Label>
          <div>
            {showLegend ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </div>
        </button>

        <div className={`space-y-2 text-xs ${showLegend ? 'block' : 'hidden'}`}>
          <div className="flex items-center gap-2">
            <div className="w-3 h-2 rounded-sm bg-[#b8ff2b] border"></div>
            <span>Selected Equipment</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-2 rounded-sm bg-[#1259ad]"></div>
            <span>S1 Source Tree</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-2 rounded-sm bg-[#2b81e5]"></div>
            <span>S2 Source Tree</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-2 rounded-sm bg-[#e77b16]"></div>
            <span>Downstream Equipment</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-2 rounded-sm bg-[#2b81e5] border-dashed border-2 border-[#ff6b6b]"></div>
            <span>Ring Bus / Loop Group</span>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile/Tablet - Gear Button */}
      <div className="lg:hidden">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="h-10 w-10 flex items-center justify-center rounded-md border bg-background hover:bg-accent transition-colors"
        >
          <Settings className="h-4 w-4" />
        </button>

        {/* Mobile/Tablet Top Drawer */}
        {isExpanded && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/50 z-40"
              onClick={() => setIsExpanded(false)}
            />

            {/* Drawer */}
            <div className="fixed top-0 left-0 right-0 z-50 bg-background border-b shadow-lg">
              <div className="p-4">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">Controls</h2>
                  <button
                    onClick={() => setIsExpanded(false)}
                    className="h-8 w-8 flex items-center justify-center rounded-md border hover:bg-accent transition-colors"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                </div>

                {/* Content */}
                <div className="space-y-4 max-h-[70vh] overflow-y-auto">
                  {renderControlsContent()}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Desktop Layout */}
      <Card className="hidden lg:block">
        <div className="p-6 pb-2">
          <div className="flex items-center gap-2 text-base font-medium">
            <Settings className="h-4 w-4" />
            <span>Tree Controls</span>
          </div>
        </div>
        <CardContent className="space-y-6 pt-0">
          {/* Desktop Content */}
          {renderControlsContent()}
        </CardContent>
      </Card>
    </>
  );
}
