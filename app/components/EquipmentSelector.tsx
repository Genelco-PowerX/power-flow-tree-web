'use client';

import { useState, useEffect, useMemo } from 'react';
import { Search, Zap, Filter, Loader2, AlertCircle } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

interface Equipment {
  id: string;
  name: string;
  type: string;
}

interface EquipmentSelectorProps {
  selectedEquipmentId: string | null;
  onEquipmentSelect: (equipmentId: string) => void;
}

export function EquipmentSelector({ selectedEquipmentId, onEquipmentSelect }: EquipmentSelectorProps) {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [filterType, setFilterType] = useState('All Types');

  // Fetch equipment list
  useEffect(() => {
    async function fetchEquipment() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch('/api/equipment-list');
        if (!response.ok) {
          throw new Error('Failed to fetch equipment');
        }
        const data = await response.json();
        setEquipment(data.data || []);
      } catch (error) {
        console.error('Error fetching equipment:', error);
        setError(error instanceof Error ? error.message : 'Failed to load equipment');
      } finally {
        setLoading(false);
      }
    }

    fetchEquipment();
  }, []);

  // Get unique equipment types for filtering
  const equipmentTypes = useMemo(() => {
    const types = [...new Set(equipment.map(eq => eq.type))].sort();
    return ['All Types', ...types];
  }, [equipment]);

  // Filter equipment based on search and type
  const filteredEquipment = useMemo(() => {
    return equipment.filter(eq => {
      const matchesSearch = searchText === '' ||
        eq.name.toLowerCase().includes(searchText.toLowerCase()) ||
        eq.type.toLowerCase().includes(searchText.toLowerCase());

      const matchesType = filterType === 'All Types' || eq.type === filterType;

      return matchesSearch && matchesType;
    });
  }, [equipment, searchText, filterType]);

  const selectedEquipment = equipment.find(eq => eq.id === selectedEquipmentId);

  const clearFilters = () => {
    setSearchText('');
    setFilterType('All Types');
  };

  if (loading) {
    return (
      <Card className="w-full">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            <Zap className="h-5 w-5" />
            Equipment Selection
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
          <p className="text-sm text-muted-foreground">Loading equipment database...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            Error Loading Equipment
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-8">
          <p className="text-sm text-muted-foreground mb-4 text-center">{error}</p>
          <Button onClick={() => window.location.reload()}>
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="text-center pb-4">
        <CardTitle className="flex items-center justify-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          Equipment Selection
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Search and select equipment to view its power flow tree
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Search and Filter Section */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="search" className="text-sm font-medium">
              Search Equipment
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="search"
                placeholder="Enter equipment name or type..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Filter by Type
            </Label>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger>
                <SelectValue>
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4" />
                    {filterType}
                  </div>
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-[200px] overflow-y-auto">
                {equipmentTypes.map(type => (
                  <SelectItem key={type} value={type}>
                    <div className="flex items-center justify-between w-full">
                      <span className="truncate">
                        {type === 'All Types' ? 'All Types' : type}
                      </span>
                      <Badge variant="secondary" className="ml-2 shrink-0">
                        {type === 'All Types'
                          ? equipment.length
                          : equipment.filter(eq => eq.type === type).length
                        }
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Clear Filters */}
          {(searchText || filterType !== 'All Types') && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearFilters}
              className="w-full"
            >
              Clear Filters
            </Button>
          )}
        </div>

        <Separator />

        {/* Equipment Selection */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">
            Select Equipment
            <Badge variant="outline" className="ml-2">
              {filteredEquipment.length} available
            </Badge>
          </Label>

          <Select
            value={selectedEquipmentId || ""}
            onValueChange={onEquipmentSelect}
          >
            <SelectTrigger className="h-auto min-h-[2.75rem] py-2">
              <SelectValue placeholder="Choose equipment to analyze...">
                {selectedEquipment && (
                  <div className="flex flex-col items-start gap-1 text-left">
                    <span className="font-medium">{selectedEquipment.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {selectedEquipment.type}
                    </span>
                  </div>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-[300px] overflow-y-auto">
              {filteredEquipment.length === 0 ? (
                <div className="px-2 py-8 text-center text-sm text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  No equipment found
                  <br />
                  <span className="text-xs">Try adjusting your search or filters</span>
                </div>
              ) : (
                filteredEquipment.slice(0, 500).map(eq => (
                  <SelectItem key={eq.id} value={eq.id} className="py-3">
                    <div className="flex flex-col items-start gap-1">
                      <span className="font-medium">{eq.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {eq.type}
                      </span>
                    </div>
                  </SelectItem>
                ))
              )}
              {filteredEquipment.length > 500 && (
                <div className="px-2 py-4 text-center text-xs text-muted-foreground border-t">
                  Showing first 500 results. Use filters to narrow down.
                </div>
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Selection Summary */}
        {selectedEquipment && (
          <>
            <Separator />
            <div className="rounded-lg bg-primary/5 p-4">
              <div className="text-sm font-medium text-primary mb-2">
                Ready to Analyze
              </div>
              <div className="text-sm font-medium">{selectedEquipment.name}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {selectedEquipment.type}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}