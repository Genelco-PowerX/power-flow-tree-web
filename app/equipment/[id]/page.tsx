'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Zap, RotateCcw, AlertCircle } from 'lucide-react';
import html2canvas from 'html2canvas';
import PowerFlowTree from '@/components/PowerFlowTree';
import TreeControls from '@/components/TreeControls';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TreeData } from '@/lib/types';

export default function EquipmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const equipmentId = params?.id as string;

  const [treeData, setTreeData] = useState<TreeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Visibility state
  const [showS1Upstream, setShowS1Upstream] = useState(true);
  const [showS2Upstream, setShowS2Upstream] = useState(true);
  const [showDownstream, setShowDownstream] = useState(true);

  // Fetch tree data
  useEffect(() => {
    if (!equipmentId) return;

    const fetchTreeData = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/equipment-tree/${equipmentId}`);
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Equipment not found');
          }
          throw new Error('Failed to load power flow tree');
        }

        const data = await response.json();
        setTreeData(data);

      } catch (err) {
        console.error('Error fetching tree data:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchTreeData();
  }, [equipmentId]);

  const handlePrint = () => {
    window.print();
  };

  const handleExport = async () => {
    const treeElement = document.getElementById('power-flow-tree');
    if (treeElement) {
      try {
        const canvas = await html2canvas(treeElement, {
          backgroundColor: '#ffffff',
          scale: 2,
          useCORS: true,
        });

        const link = document.createElement('a');
        link.download = `power-flow-tree-${treeData?.selectedEquipment?.name || 'export'}.png`;
        link.href = canvas.toDataURL();
        link.click();
      } catch (error) {
        console.error('Error exporting tree:', error);
      }
    }
  };

  if (!equipmentId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Invalid Equipment ID
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/equipment">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Equipment List
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading power flow tree...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Error Loading Power Flow Tree
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">{error}</p>
            <div className="flex gap-2">
              <Button onClick={() => window.location.reload()}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Retry
              </Button>
              <Button variant="outline" asChild>
                <Link href="/equipment">
                  Back to Equipment List
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!treeData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>No Tree Data Available</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/equipment">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Equipment List
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-background">
      <div className="flex flex-1 overflow-hidden flex-col lg:flex-row">
        {/* Sidebar Controls */}
        <aside className="w-full lg:w-80 border-b lg:border-b-0 lg:border-r bg-muted/30 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4">
            <TreeControls
              showS1Upstream={showS1Upstream}
              setShowS1Upstream={setShowS1Upstream}
              showS2Upstream={showS2Upstream}
              setShowS2Upstream={setShowS2Upstream}
              showDownstream={showDownstream}
              setShowDownstream={setShowDownstream}
              treeData={treeData}
              onPrint={handlePrint}
              onExport={handleExport}
            />
          </div>
        </aside>

        {/* Main Tree View */}
        <main className="flex-1 relative overflow-hidden min-h-[400px] lg:min-h-0" id="power-flow-tree">
          <div className="absolute inset-0">
            <PowerFlowTree
              treeData={treeData}
              showS1Upstream={showS1Upstream}
              showS2Upstream={showS2Upstream}
              showDownstream={showDownstream}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
