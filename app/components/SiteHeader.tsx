'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EquipmentSelector } from '@/components/EquipmentSelector';

export default function SiteHeader() {
  const [isEquipmentSelectorOpen, setIsEquipmentSelectorOpen] = useState(false);
  const router = useRouter();

  const handleEquipmentSelect = (equipmentId: string) => {
    setIsEquipmentSelectorOpen(false);
    router.push(`/equipment/${equipmentId}`);
  };

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 max-w-screen-2xl items-center px-4">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/images/genelco-g-logo-blue.svg"
              alt="Genelco Power Flow Tree Analysis"
              width={32}
              height={32}
              className="h-8 w-8"
            />
            <div className="hidden sm:flex flex-col">
              <span className="text-base font-bold leading-none tracking-tight">Power Flow Tree</span>
              <span className="text-xs text-muted-foreground mt-0.5">Interactive electrical power visualization</span>
            </div>
          </Link>

          <nav className="ml-auto flex items-center gap-2 relative">
            {/* Equipment Selector Button */}
            <Button
              variant="ghost"
              onClick={() => setIsEquipmentSelectorOpen(!isEquipmentSelectorOpen)}
              className="relative"
            >
              <Search className="h-4 w-4 mr-2" />
              Equipment
              <ChevronDown className="h-3 w-3 ml-1" />
            </Button>

            {/* Desktop Dropdown */}
            {isEquipmentSelectorOpen && (
              <div className="hidden lg:block absolute top-full right-0 mt-2 w-[800px] max-w-[95vw] bg-background border border-border rounded-md shadow-lg z-60">
                <div className="p-4">
                  <div className="flex justify-end mb-2">
                    <button
                      onClick={() => setIsEquipmentSelectorOpen(false)}
                      className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-accent transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <EquipmentSelector
                    selectedEquipmentId={null}
                    onEquipmentSelect={handleEquipmentSelect}
                  />
                </div>
              </div>
            )}
          </nav>
        </div>
      </header>

      {/* Mobile/Tablet Top Drawer */}
      {isEquipmentSelectorOpen && (
        <>
          {/* Backdrop */}
          <div
            className="lg:hidden fixed inset-0 bg-black/50 z-40"
            onClick={() => setIsEquipmentSelectorOpen(false)}
          />

          {/* Drawer */}
          <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-background border-b shadow-lg">
            <div className="p-4">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Select Equipment</h2>
                <button
                  onClick={() => setIsEquipmentSelectorOpen(false)}
                  className="h-8 w-8 flex items-center justify-center rounded-md border hover:bg-accent transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Content */}
              <div className="space-y-4 max-h-[80vh] overflow-y-auto">
                <EquipmentSelector
                  selectedEquipmentId={null}
                  onEquipmentSelect={handleEquipmentSelect}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

