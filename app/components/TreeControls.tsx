'use client';

import { Settings, Eye, EyeOff, Printer, Download } from 'lucide-react';
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
  // Count equipment by source type
  const s1Count = treeData?.upstream.filter(eq => (eq as any).branch === 'S1').length || 0;
  const s2Count = treeData?.upstream.filter(eq => (eq as any).branch === 'S2').length || 0;

  const downstreamCount = treeData?.downstream.length || 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Settings className="h-4 w-4" />
          Tree Controls
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Visibility Controls */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium text-muted-foreground">
              VISIBILITY CONTROLS
            </Label>
          </div>

          {/* S1 Upstream */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-sm bg-[#1259ad]"></div>
              <div className="flex flex-col">
                <Label htmlFor="s1-toggle" className="text-sm font-medium cursor-pointer">
                  S1 Upstream
                </Label>
                <div className="text-xs text-muted-foreground">
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
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-sm bg-[#2b81e5]"></div>
              <div className="flex flex-col">
                <Label htmlFor="s2-toggle" className="text-sm font-medium cursor-pointer">
                  S2 Upstream
                </Label>
                <div className="text-xs text-muted-foreground">
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
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-sm bg-[#e77b16]"></div>
              <div className="flex flex-col">
                <Label htmlFor="downstream-toggle" className="text-sm font-medium cursor-pointer">
                  Downstream
                </Label>
                <div className="text-xs text-muted-foreground">
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
        <div className="space-y-3">
          <Label className="text-xs font-medium text-muted-foreground">
            ACTIONS
          </Label>

          <div className="grid grid-cols-1 lg:grid-cols-1 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onPrint}
              className="justify-start"
            >
              <Printer className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Print Tree</span>
              <span className="sm:hidden">Print</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={onExport}
              className="justify-start"
            >
              <Download className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Export PNG</span>
              <span className="sm:hidden">Export</span>
            </Button>
          </div>
        </div>

        {/* Legend */}
        <Separator />

        <div className="space-y-3">
          <Label className="text-xs font-medium text-muted-foreground">
            LEGEND
          </Label>

          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-4 h-3 rounded-sm bg-[#b8ff2b] border"></div>
              <span>Selected Equipment</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-3 rounded-sm bg-[#1259ad]"></div>
              <span>S1 Source Tree</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-3 rounded-sm bg-[#2b81e5]"></div>
              <span>S2 Source Tree</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-3 rounded-sm bg-[#e77b16]"></div>
              <span>Downstream Equipment</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-3 rounded-sm bg-[#2b81e5] border-dashed border-2 border-[#ff6b6b]"></div>
              <span>Ring Bus / Loop Group</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
