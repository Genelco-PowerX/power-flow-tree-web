'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Zap } from 'lucide-react';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { EquipmentSelector } from '../components/EquipmentSelector';

export default function EquipmentPage() {
  const router = useRouter();
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(null);

  const handleEquipmentSelect = (equipmentId: string) => {
    router.push(`/equipment/${equipmentId}`);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Main Content - Properly Centered */}
      <main className="container mx-auto flex items-center justify-center py-4 px-4 sm:py-8">
        <div className="w-full max-w-lg">
          <EquipmentSelector
            selectedEquipmentId={selectedEquipmentId}
            onEquipmentSelect={handleEquipmentSelect}
          />
        </div>
      </main>
    </div>
  );
}
