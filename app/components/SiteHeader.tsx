'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 max-w-screen-2xl items-center px-4">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/icon.svg"
            alt="Power Flow Tree Analysis"
            width={32}
            height={32}
            className="h-8 w-8"
          />
          <div className="hidden sm:flex flex-col">
            <span className="text-base font-bold leading-none tracking-tight">Power Flow Tree</span>
            <span className="text-xs text-muted-foreground mt-0.5">Interactive electrical power visualization</span>
          </div>
        </Link>

        <nav className="ml-auto flex items-center gap-2">
          <Button variant="ghost" asChild>
            <Link href="/equipment">
              <Search className="h-4 w-4 mr-2" />
              Equipment
            </Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}

