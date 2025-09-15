import type { Metadata } from 'next'
import './globals.css'
import SiteHeader from '@/components/SiteHeader'

export const metadata: Metadata = {
  title: 'Power Flow Tree Analysis',
  description: 'Interactive power flow tree visualization showing electrical distribution hierarchy',
  keywords: 'power flow, electrical distribution, tree visualization, equipment analysis',
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased flex flex-col">
        <SiteHeader />
        <main className="flex-1">
          {children}
        </main>
      </body>
    </html>
  )
}
